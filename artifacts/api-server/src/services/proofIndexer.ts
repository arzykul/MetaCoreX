import { db, agentProofsTable, indexerStateTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { contractService } from "./contractService.js";
import { logger } from "../lib/logger.js";

// Persists on-chain `ProofAccepted` events into Postgres for PoU analytics
// (trends, leaderboards, streaks, achievements). Chain log scans alone can't
// power this — free-tier RPC plans rate-limit/cap block ranges (see
// contractService's adaptive scanner), and trend/heatmap queries need SQL
// aggregation over history, not a fresh chain scan on every request.
//
// Strategy: one indexer, one code path (poll), used for both the initial
// backfill and ongoing sync. A single cursor (indexer_state) tracks the last
// fully-scanned block; inserts are idempotent via the (txHash, logIndex)
// unique index, so re-running the same range is always safe.

const INDEXER_ID = "arzyg_proof_accepted";
const POLL_INTERVAL_MS = 20_000;
const CONNECT_WAIT_MS = 3_000;

class ProofIndexer {
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private syncing = false;

  async start(): Promise<void> {
    await this._waitForChainConnection();

    const anchor = contractService.deploymentBlock;
    if (anchor == null) {
      logger.warn("proofIndexer: no deploymentBlock known — cannot anchor backfill, skipping start");
      return;
    }

    await this._ensureCursor(anchor);

    // FORCE_RESYNC=true resets the cursor to the deployment block so the next
    // sync re-scans all on-chain events from scratch and re-populates the DB.
    if (process.env.FORCE_RESYNC === "true") {
      logger.info({ anchorBlock: anchor }, "proofIndexer: FORCE_RESYNC — resetting cursor to deployment block");
      await db
        .insert(indexerStateTable)
        .values({ id: INDEXER_ID, lastScannedBlock: anchor - 1 })
        .onConflictDoUpdate({
          target: indexerStateTable.id,
          set: { lastScannedBlock: anchor - 1 },
        });
    }

    await this._sync();

    this.pollTimer = setInterval(() => {
      this._sync().catch((err) => logger.warn({ err }, "proofIndexer: periodic sync failed"));
    }, POLL_INTERVAL_MS);

    logger.info("proofIndexer: started (backfill complete, polling every 20s)");
  }

  private async _waitForChainConnection(): Promise<void> {
    while (!contractService.connected) {
      await new Promise((r) => setTimeout(r, CONNECT_WAIT_MS));
    }
  }

  private async _ensureCursor(anchorBlock: number): Promise<void> {
    const [existing] = await db
      .select()
      .from(indexerStateTable)
      .where(eq(indexerStateTable.id, INDEXER_ID));

    if (!existing) {
      // Start one block before the anchor so the anchor block itself is included
      // in the first [cursor+1, latest] scan.
      await db
        .insert(indexerStateTable)
        .values({ id: INDEXER_ID, lastScannedBlock: anchorBlock - 1 })
        .onConflictDoNothing({ target: indexerStateTable.id });
    }
  }

  /** Scans from the persisted cursor to the current chain tip and persists any new proofs. */
  private async _sync(): Promise<{ scanned: number; inserted: number } | null> {
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
      if (fromBlock > latest) return { scanned: 0, inserted: 0 };

      let records: Awaited<ReturnType<typeof contractService.scanProofAcceptedLogs>>;
      try {
        records = await contractService.scanProofAcceptedLogs(fromBlock, latest);
      } catch (err) {
        // Do NOT advance the cursor — the range will be retried on the next tick.
        logger.warn({ err, fromBlock, toBlock: latest }, "proofIndexer: scan failed, will retry");
        return null;
      }

      let inserted = 0;
      if (records.length > 0) {
        const result = await db
          .insert(agentProofsTable)
          .values(records)
          .onConflictDoNothing({ target: [agentProofsTable.txHash, agentProofsTable.logIndex] })
          .returning({ id: agentProofsTable.id });
        inserted = result.length;
      }

      await db
        .update(indexerStateTable)
        .set({ lastScannedBlock: latest })
        .where(eq(indexerStateTable.id, INDEXER_ID));

      if (records.length > 0) {
        logger.info(
          { fromBlock, toBlock: latest, found: records.length, inserted },
          "proofIndexer: sync complete"
        );
      }

      return { scanned: records.length, inserted };
    } finally {
      this.syncing = false;
    }
  }
}

export const proofIndexer = new ProofIndexer();
