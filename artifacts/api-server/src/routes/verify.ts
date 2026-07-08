import { Router, type IRouter } from "express";
import { ethers } from "ethers";
import { eq, and } from "drizzle-orm";
import { db, verificationRequestsTable } from "@workspace/db";
import { validateProofText } from "@workspace/pou-validator";
import {
  SubmitVerificationReportBody,
  SubmitVerificationReportResponse,
  GetVerificationCertificateParams,
  GetVerificationCertificateResponse,
} from "@workspace/api-zod";
import { contractService } from "../services/contractService.js";

// ReportVerification oracle routes. Mounted at /api/verify/*.
//
// POST /verify/submit is API-first (or chain-first-merging) write path for
// the off-chain half of a verification request — see the long comment atop
// lib/db/src/schema/verification_requests.ts for the full two-sided
// correlation model. It never triggers scoring itself; verificationScorer.ts
// picks up ready_to_score rows on its own poll loop.
//
// GET /verify/:requestId reads the on-chain certificate directly from the
// contract (source of truth for anything already posted/finalized).

const router: IRouter = Router();

const TERMINAL_STATUSES = new Set(["posted", "disputed", "finalized", "failed"]);

router.post("/verify/submit", async (req, res): Promise<void> => {
  const parsed = SubmitVerificationReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { agentAddress, reportText, signature, tier } = parsed.data;

  if (!ethers.isAddress(agentAddress)) {
    res.status(400).json({ error: "agentAddress must be a valid Ethereum address" });
    return;
  }

  const preCheck = validateProofText(reportText);
  if (!preCheck.valid) {
    res.status(400).json({ error: preCheck.reason });
    return;
  }

  let recovered: string;
  try {
    recovered = ethers.verifyMessage(reportText, signature);
  } catch {
    res.status(400).json({ error: "Invalid signature" });
    return;
  }
  if (recovered.toLowerCase() !== agentAddress.toLowerCase()) {
    res.status(401).json({
      error: "Signature does not match agentAddress — sign the exact reportText with the connected wallet",
    });
    return;
  }

  const lower = agentAddress.toLowerCase();
  // Must match the on-chain convention: reportHash is keccak256 of the raw
  // off-chain report text (ethers.id === keccak256(toUtf8Bytes(text)) ===
  // Solidity's keccak256(bytes(text))). See ReportVerification.sol.
  const reportHash = ethers.id(reportText);

  const [existing] = await db
    .select()
    .from(verificationRequestsTable)
    .where(
      and(eq(verificationRequestsTable.agentAddress, lower), eq(verificationRequestsTable.reportHash, reportHash))
    );

  if (existing) {
    if (TERMINAL_STATUSES.has(existing.status)) {
      // Idempotent: resubmitting text for an already-decided request is a
      // no-op, not an error — just report where things landed.
      res.json(
        SubmitVerificationReportResponse.parse({
          ok: true,
          reportHash,
          status: existing.status,
          onchainRequestId: existing.onchainRequestId,
          alreadyProcessed: true,
        })
      );
      return;
    }
    if (existing.status === "scoring") {
      res.status(409).json({ error: "This request is currently being scored" });
      return;
    }

    const newStatus = existing.onchainRequestId != null ? "ready_to_score" : "awaiting_chain";
    const [updated] = await db
      .update(verificationRequestsTable)
      .set({ reportText, signature, status: newStatus })
      .where(eq(verificationRequestsTable.id, existing.id))
      .returning();

    res.json(
      SubmitVerificationReportResponse.parse({
        ok: true,
        reportHash,
        status: updated!.status,
        onchainRequestId: updated!.onchainRequestId,
        alreadyProcessed: false,
      })
    );
    return;
  }

  // Brand-new API-first row. feeWei is a NOT NULL placeholder here — the
  // indexer overwrites it with the real on-chain fee once VerificationRequested
  // is observed for this (agentAddress, reportHash) pair.
  const [created] = await db
    .insert(verificationRequestsTable)
    .values({
      agentAddress: lower,
      reportHash,
      tier,
      feeWei: "0",
      reportText,
      signature,
      status: "awaiting_chain",
    })
    .returning();

  res.json(
    SubmitVerificationReportResponse.parse({
      ok: true,
      reportHash,
      status: created!.status,
      onchainRequestId: created!.onchainRequestId,
      alreadyProcessed: false,
    })
  );
});

router.get("/verify/:requestId", async (req, res): Promise<void> => {
  const params = GetVerificationCertificateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (!contractService.reportVerificationConnected) {
    res.status(503).json({ error: "ReportVerification contract not connected" });
    return;
  }

  let requestId: bigint;
  try {
    requestId = BigInt(params.data.requestId);
  } catch {
    res.status(400).json({ error: "requestId must be an integer string" });
    return;
  }

  const cert = await contractService.getVerificationCertificate(requestId);
  if (!cert || cert.status === 0) {
    res.status(404).json({ error: "Verification request not found" });
    return;
  }

  // getCertificate() doesn't expose requestedAt — backfill it from our own
  // indexed row (chain-first or API-first, whichever created it) when present.
  const [row] = await db
    .select({ blockTimestamp: verificationRequestsTable.blockTimestamp })
    .from(verificationRequestsTable)
    .where(eq(verificationRequestsTable.onchainRequestId, requestId.toString()));

  res.json(
    GetVerificationCertificateResponse.parse({
      ...cert,
      requestedAt: row?.blockTimestamp ? row.blockTimestamp.toISOString() : cert.requestedAt,
    })
  );
});

export default router;
