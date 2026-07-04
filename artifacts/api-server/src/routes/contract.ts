import { Router } from "express";
import { ethers } from "ethers";
import { contractService } from "../services/contractService.js";

const router = Router();

/**
 * GET /api/contract/info
 * Returns live on-chain token state from the deployed Hardhat node.
 */
router.get("/contract/info", async (_req, res) => {
  const info = await contractService.getTokenInfo();
  if (!info) {
    res.json({ connected: false });
    return;
  }
  res.json(info);
});

/**
 * GET /api/contract/status
 * Lightweight connection check + real API server process uptime (seconds).
 * uptimeSeconds is genuine process.uptime() — not a fabricated SLA number.
 */
router.get("/contract/status", (_req, res) => {
  res.json({ connected: contractService.connected, uptimeSeconds: process.uptime() });
});

/**
 * POST /api/contract/mint-demo
 * Triggers the full on-chain mint cycle:
 *   token.requestUsefulness → MockRouter → handleOracleFulfillment → birthToken
 * Body: { agentAddress?: string, proof?: string, amount?: string (wei) }
 */
router.post("/contract/mint-demo", async (req, res) => {
  if (!contractService.connected) {
    res.status(503).json({
      ok: false,
      error: "Blockchain not connected. Deploy the contract first.",
    });
    return;
  }

  const {
    agentAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", // hardhat[1]
    proof        = "Summarize the Ethereum whitepaper",
    amount       = ethers.parseEther("1000").toString(),
  } = req.body as { agentAddress?: string; proof?: string; amount?: string };

  try {
    const { requestTxHash, fulfillTxHash } = await contractService.triggerMintDemo(
      agentAddress,
      proof,
      BigInt(amount)
    );

    res.json({
      ok: true,
      requestTxHash,
      fulfillTxHash,
      agentAddress,
      proof,
      amount,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: message });
  }
});

export default router;
