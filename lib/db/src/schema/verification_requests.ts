import { pgTable, text, varchar, integer, numeric, timestamp, serial, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Correlates the ReportVerification.sol oracle flow across both halves of the
// system: on-chain `VerificationRequested`/`VerificationPosted`/
// `VerificationDisputed`/`VerificationResolved`/`VerificationFinalized`
// events (indexed by verificationIndexer.ts) and the off-chain report text +
// EIP-191 signature submitted via POST /api/verify/submit. Neither half is
// sufficient alone: the contract only ever sees a reportHash, never the
// underlying text, and the API alone can't know a request's final on-chain
// outcome (dispute/resolve/finalize can all happen without ever touching the
// API again). This table is the single place both are reconciled.
//
// A request can be created from either direction:
//   - API-first: POST /verify/submit inserts a row in `awaiting_chain` with
//     reportText+signature but no on-chain correlation yet.
//   - Chain-first: the indexer sees VerificationRequested before the agent
//     ever calls the API, and inserts a stub row in `awaiting_text`.
// Matching between the two is done on (agentAddress, reportHash) — matching
// on reportHash alone would let a different wallet "claim" a hash it didn't
// actually submit on-chain.
export const verificationRequestsTable = pgTable(
  "verification_requests",
  {
    id: serial("id").primaryKey(),

    // On-chain correlation — null until the indexer observes
    // VerificationRequested for this (agent, reportHash) pair.
    onchainRequestId: numeric("onchain_request_id", { precision: 78, scale: 0, mode: "string" }),
    txHash: varchar("tx_hash", { length: 66 }),
    logIndex: integer("log_index"),
    blockNumber: integer("block_number"),
    blockTimestamp: timestamp("block_timestamp", { withTimezone: true }),

    // Core identity — always present from whichever side creates the row.
    agentAddress: varchar("agent_address", { length: 42 }).notNull(),
    reportHash: varchar("report_hash", { length: 66 }).notNull(),
    tier: text("tier").notNull(), // standard | premium
    referrer: varchar("referrer", { length: 42 }),
    feeWei: numeric("fee_wei", { precision: 78, scale: 0, mode: "string" }).notNull(),

    // Off-chain payload — null until POST /verify/submit is called (or,
    // rarely, backfilled by the "awaiting_text" recovery job — see below).
    reportText: text("report_text"),
    signature: varchar("signature", { length: 132 }),

    // Scoring lifecycle:
    //   awaiting_chain  -> API row created, on-chain request not observed yet
    //   awaiting_text   -> on-chain request observed, report text never arrived
    //   ready_to_score  -> both halves present, standard tier, not yet claimed
    //   scoring         -> claimed by a worker, in-flight Gemini call
    //   posted          -> recordVerification succeeded on-chain
    //   disputed        -> a dispute() was observed after posting
    //   finalized        -> finalize()/resolveDispute() paid out
    //   failed          -> scoring exhausted retries (see scoringAttempts)
    status: text("status").notNull().default("awaiting_chain"),

    score: integer("score"),
    reasoning: text("reasoning"),
    lastError: text("last_error"),
    scoringAttempts: integer("scoring_attempts").notNull().default(0),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    recordTxHash: varchar("record_tx_hash", { length: 66 }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Mirrors the contract's own per-agent dedupe on reportHash — also the
    // join key used to reconcile API-first and chain-first row creation.
    uniqueIndex("verification_requests_agent_hash_idx").on(table.agentAddress, table.reportHash),
    // A given on-chain event log is indexed at most once (idempotent backfill/poll).
    uniqueIndex("verification_requests_tx_log_idx").on(table.txHash, table.logIndex),
  ]
);

// Singleton-per-row cursor bookkeeping, reusing the same table the
// ProofAccepted indexer uses (see agent_proofs.ts) — one row per indexer,
// keyed by a stable id.
export const REPORT_VERIFICATION_INDEXER_ID = "report_verification_events";

export const insertVerificationRequestSchema = createInsertSchema(verificationRequestsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertVerificationRequest = z.infer<typeof insertVerificationRequestSchema>;
export type VerificationRequest = typeof verificationRequestsTable.$inferSelect;
