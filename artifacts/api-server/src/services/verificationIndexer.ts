import { db, verificationRequestsTable, indexerStateTable, REPORT_VERIFICATION_INDEXER_ID } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { contractService } from "./contractService.js";
import { logger } from "../lib/logger.js";

// Persists every ReportVerification lifecycle event into Postgres and
// reconciles them with whichever half of a request arrived first — see the
// long comment atop lib/db/src/schema/verification_requests.ts for the full
// two-sided correlation model (API-first vs chain-first row creation).
//
// Mirrors proofIndexer.ts's single-cursor poll strategy, but must consume
// ALL FIVE event types (Requested/Posted/Disputed/Resolved/Finalized) since
// dispute/resolve/finalize can happen entirely on-chain with no API call —
// missing any one of them would let a request's DB status go stale forever.

const INDEXER_ID = REPORT_VERIFICATION_INDEXER_ID;
const POLL_INTERVAL_MS = 20_000;
const CONNECT_WAIT_MS = 3_000;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

type ScanResult = Awaited<ReturnType<typeof contractService.scanVerificationEvents>>;

class VerificationIndexer {
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private syncing = false;

  async start(): Promise<void> {
    await this._waitForChainConnection();

    // Start at the current block — no archive scan required.
    // Historical verification events are not backfilled; data accumulates
    // going forward. Use FORCE_RESYNC=true for a full historical rescan
    // (requires an archive-capable RPC).
    const currentBlock = await contractService.getCurrentBlockNumber();
    if (currentBlock == null) {
      logger.warn("verificationIndexer: could not read current block — skipping start");
      return;
    }

    await this._ensureCursor(currentBlock);

    if (process.env.FORCE_RESYNC === "true") {
      const anchor = contractService.reportVerificationDeploymentBlock;
      const resetTo = anchor != null ? anchor - 1 : currentBlock - 1;
      logger.info({ resetTo }, "verificationIndexer: FORCE_RESYNC — resetting cursor");
      await db
        .insert(indexerStateTable)
        .values({ id: INDEXER_ID, lastScannedBlock: resetTo })
        .onConflictDoUpdate({
          target: indexerStateTable.id,
          set: { lastScannedBlock: resetTo },
        });
    }

    await this._sync();

    this.pollTimer = setInterval(() => {
      this._sync().catch((err) => logger.warn({ err }, "verificationIndexer: periodic sync failed"));
    }, POLL_INTERVAL_MS);

    logger.info("verificationIndexer: started (new events only, polling every 20s)");
  }

  private async _waitForChainConnection(): Promise<void> {
    while (!contractService.reportVerificationConnected) {
      await new Promise((r) => setTimeout(r, CONNECT_WAIT_MS));
    }
  }

  private async _ensureCursor(anchorBlock: number): Promise<void> {
    const [existing] = await db
      .select()
      .from(indexerStateTable)
      .where(eq(indexerStateTable.id, INDEXER_ID));

    if (!existing) {
      await db
        .insert(indexerStateTable)
        .values({ id: INDEXER_ID, lastScannedBlock: anchorBlock - 1 })
        .onConflictDoNothing({ target: indexerStateTable.id });
    }
  }

  private async _sync(): Promise<{ scanned: number } | null> {
    if (this.syncing) return null; // coalesce overlapping calls (backfill + poll tick racing)
    this.syncing = true;

    try {
      const [state] = await db
        .select()
        .from(indexerStateTable)
        .where(eq(indexerStateTable.id, INDEXER_ID));
      if (!state) return null;

      const latest = await contractService.getCurrentBlockNumber();
      if (latest == null) return null;

      const fromBlock = state.lastScannedBlock + 1;
      if (fromBlock > latest) return { scanned: 0 };

      let events: ScanResult;
      try {
        events = await contractService.scanVerificationEvents(fromBlock, latest);
      } catch (err) {
        // Do NOT advance the cursor — the range will be retried on the next tick.
        logger.warn({ err, fromBlock, toBlock: latest }, "verificationIndexer: scan failed, will retry");
        return null;
      }

      // Fixed processing order matters: a request's on-chain lifecycle is
      // strictly Requested -> Posted -> (Disputed -> Resolved) -> Finalized,
      // so applying categories in this order is always causally correct
      // regardless of how events happen to be batched within one poll tick.
      await this._applyRequested(events.requested);
      await this._applyPosted(events.posted);
      await this._applyDisputed(events.disputed);
      await this._applyResolved(events.resolved);
      await this._applyFinalized(events.finalized);

      await db
        .update(indexerStateTable)
        .set({ lastScannedBlock: latest })
        .where(eq(indexerStateTable.id, INDEXER_ID));

      const scanned =
        events.requested.length +
        events.posted.length +
        events.disputed.length +
        events.resolved.length +
        events.finalized.length;

      if (scanned > 0) {
        logger.info(
          {
            fromBlock,
            toBlock: latest,
            requested: events.requested.length,
            posted: events.posted.length,
            disputed: events.disputed.length,
            resolved: events.resolved.length,
            finalized: events.finalized.length,
          },
          "verificationIndexer: sync complete"
        );
      }

      return { scanned };
    } finally {
      this.syncing = false;
    }
  }

  /**
   * Upserts on (agentAddress, reportHash) — the same join key POST
   * /verify/submit uses. If a row already exists (API-first: report text
   * arrived before the on-chain request), merge in the on-chain fields and
   * flip straight to ready_to_score. Otherwise this is a brand-new
   * chain-first row awaiting the report text via the API.
   */
  private async _applyRequested(events: ScanResult["requested"]): Promise<void> {
    for (const e of events) {
      const tier = e.tier === 0 ? "standard" : "premium";
      const referrer = e.referrer === ZERO_ADDRESS ? null : e.referrer;

      await db
        .insert(verificationRequestsTable)
        .values({
          onchainRequestId: e.requestId,
          txHash: e.txHash,
          logIndex: e.logIndex,
          blockNumber: e.blockNumber,
          blockTimestamp: e.blockTimestamp,
          agentAddress: e.agentAddress,
          reportHash: e.reportHash,
          tier,
          referrer,
          feeWei: e.feeWei,
          status: "awaiting_text",
        })
        .onConflictDoUpdate({
          target: [verificationRequestsTable.agentAddress, verificationRequestsTable.reportHash],
          set: {
            onchainRequestId: e.requestId,
            txHash: e.txHash,
            logIndex: e.logIndex,
            blockNumber: e.blockNumber,
            blockTimestamp: e.blockTimestamp,
            tier,
            referrer,
            feeWei: e.feeWei,
            // Unqualified column refs in an ON CONFLICT DO UPDATE SET clause
            // read the row's pre-update (existing) value — this is checking
            // whether reportText already arrived via the API, not the
            // (nonexistent) incoming value.
            status: sql`CASE WHEN ${verificationRequestsTable.reportText} IS NOT NULL THEN 'ready_to_score' ELSE 'awaiting_text' END`,
          },
        });
    }
  }

  private async _applyPosted(events: ScanResult["posted"]): Promise<void> {
    for (const e of events) {
      await db
        .update(verificationRequestsTable)
        .set({ status: "posted", score: e.score, recordTxHash: e.txHash })
        .where(eq(verificationRequestsTable.onchainRequestId, e.requestId));
    }
  }

  private async _applyDisputed(events: ScanResult["disputed"]): Promise<void> {
    for (const e of events) {
      await db
        .update(verificationRequestsTable)
        .set({ status: "disputed" })
        .where(eq(verificationRequestsTable.onchainRequestId, e.requestId));
    }
  }

  private async _applyResolved(events: ScanResult["resolved"]): Promise<void> {
    for (const e of events) {
      // Rejected disputes leave the original score/status alone here — the
      // paired VerificationFinalized event (same tx) moves status forward.
      if (!e.upheld) continue;
      await db
        .update(verificationRequestsTable)
        .set({ score: e.newScore })
        .where(eq(verificationRequestsTable.onchainRequestId, e.requestId));
    }
  }

  private async _applyFinalized(events: ScanResult["finalized"]): Promise<void> {
    for (const e of events) {
      await db
        .update(verificationRequestsTable)
        .set({ status: "finalized" })
        .where(eq(verificationRequestsTable.onchainRequestId, e.requestId));
    }
  }
}

export const verificationIndexer = new VerificationIndexer();
