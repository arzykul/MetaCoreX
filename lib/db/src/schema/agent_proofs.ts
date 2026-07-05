import { pgTable, text, varchar, numeric, integer, timestamp, serial, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Persisted history of every on-chain `ProofAccepted` event emitted by the
// ARZY-G contract. This is the single source of truth for PoU (Proof of
// Usefulness) analytics — trends, leaderboards, streaks, achievements — since
// `submitProof` can be called directly by any registered agent, independent
// of the `agent_tasks` marketplace (see agent_tasks.ts). Populated by the
// background proof indexer (see artifacts/api-server/src/services/proofIndexer.ts),
// never written to directly by request handlers.
export const agentProofsTable = pgTable(
  "agent_proofs",
  {
    id: serial("id").primaryKey(),
    agentAddress: varchar("agent_address", { length: 42 }).notNull(),
    proof: text("proof").notNull(),
    // uint256 wei values as strings — a JS number cannot hold full uint256 range.
    amountWei: numeric("amount_wei", { precision: 78, scale: 0, mode: "string" }).notNull(),
    rewardWei: numeric("reward_wei", { precision: 78, scale: 0, mode: "string" }).notNull(),
    score: integer("score").notNull(), // 0-10, as emitted on-chain
    txHash: varchar("tx_hash", { length: 66 }).notNull(),
    logIndex: integer("log_index").notNull(),
    blockNumber: integer("block_number").notNull(),
    blockTimestamp: timestamp("block_timestamp", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // A given event log (txHash + logIndex) is indexed at most once — makes
    // backfill/poll re-scans and any future live-listener writes idempotent.
    uniqueIndex("agent_proofs_tx_log_idx").on(table.txHash, table.logIndex),
  ]
);

// Singleton-per-row cursor bookkeeping for chain indexers (currently just the
// ProofAccepted indexer; id is a stable key so future indexers can add rows).
export const indexerStateTable = pgTable("indexer_state", {
  id: varchar("id", { length: 64 }).primaryKey(),
  lastScannedBlock: integer("last_scanned_block").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertAgentProofSchema = createInsertSchema(agentProofsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAgentProof = z.infer<typeof insertAgentProofSchema>;
export type AgentProof = typeof agentProofsTable.$inferSelect;
export type IndexerState = typeof indexerStateTable.$inferSelect;
