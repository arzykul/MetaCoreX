import { db, agentRegistrationsTable, indexerStateTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { contractService } from "./contractService.js";
import { logger } from "../lib/logger.js";

// Persists on-chain `AgentRegistered` events into Postgres. `registerAgent`
// is fully permissionless — any wallet calls it directly, no API route
// involved — so this indexer is the only durable record of "who registered
// an agent". It's the backbone of the airdrop points system (see
// airdropPointsService.ts): points are derived at query time from this
// table + agent_proofs, never stored as mutable counters.
//
// Same strategy as proofIndexer.ts: one cursor (indexer_state), one code
// path (poll) for both the initial historical backfill and ongoing sync.
// Idempotent via the (txHash, logIndex) unique index.

const INDEXER_ID = "arzyg_agent_registered";
const POLL_INTERVAL_MS = 20_000;
const CONNECT_WAIT_MS = 3_000;

class RegistrationIndexer {
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private syncing = false;

  async start(): Promise<void> {
    await this._waitForChainConnection();

    const currentBlock = await contractService.getCurrentBlockNumber();
    if (currentBlock == null) {
      logger.warn("registrationIndexer: could not read current block — skipping start");
      return;
    }

    // Anchor the cursor at the contract's deployment block so all historical
    // AgentRegistered events are backfilled on the very first run (when no
    // cursor row exists yet). On subsequent restarts the cursor already
    // exists and this has no effect.
    const anchorBlock = contractService.deploymentBlock ?? currentBlock;
    await this._ensureCursor(anchorBlock);

    await this._sync();

    this.pollTimer = setInterval(() => {
      this._sync().catch((err) => logger.warn({ err }, "registrationIndexer: periodic sync failed"));
    }, POLL_INTERVAL_MS);

    logger.info({ anchorBlock }, "registrationIndexer: started — scanning from deployment block, polling every 20s");
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
      // Start one block before the anchor so the anchor block itself is
      // included in the first [cursor+1, latest] scan.
      await db
        .insert(indexerStateTable)
        .values({ id: INDEXER_ID, lastScannedBlock: anchorBlock - 1 })
        .onConflictDoNothing({ target: indexerStateTable.id });
    }
  }

  /** Scans from the persisted cursor to the current chain tip and persists any new registrations. */
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

      let records: Awaited<ReturnType<typeof contractService.scanAgentRegisteredLogs>>;
      try {
        records = await contractService.scanAgentRegisteredLogs(fromBlock, latest);
      } catch (err) {
        // Do NOT advance the cursor — the range will be retried on the next tick.
        logger.warn({ err, fromBlock, toBlock: latest }, "registrationIndexer: scan failed, will retry");
        return null;
      }

      let inserted = 0;
      if (records.length > 0) {
        const result = await db
          .insert(agentRegistrationsTable)
          .values(records)
          .onConflictDoNothing({ target: [agentRegistrationsTable.txHash, agentRegistrationsTable.logIndex] })
          .returning({ id: agentRegistrationsTable.id });
        inserted = result.length;
      }

      await db
        .update(indexerStateTable)
        .set({ lastScannedBlock: latest })
        .where(eq(indexerStateTable.id, INDEXER_ID));

      if (records.length > 0) {
        logger.info(
          { fromBlock, toBlock: latest, found: records.length, inserted },
          "registrationIndexer: sync complete"
        );
      }

      return { scanned: records.length, inserted };
    } finally {
      this.syncing = false;
    }
  }
}

export const registrationIndexer = new RegistrationIndexer();
