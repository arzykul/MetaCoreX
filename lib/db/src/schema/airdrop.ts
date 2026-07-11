import { pgTable, varchar, integer, timestamp, serial, uniqueIndex } from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Persisted history of every on-chain `AgentRegistered` event emitted by the
// ARZY-G contract. Mirrors agent_proofs.ts: registration is fully
// permissionless (any wallet calls `registerAgent` directly, no API route
// involved), so this table — populated by the background registration
// indexer (see artifacts/api-server/src/services/registrationIndexer.ts) —
// is the only source of truth for "did this wallet register an agent".
// Never written to directly by request handlers.
export const agentRegistrationsTable = pgTable(
  "agent_registrations",
  {
    id: serial("id").primaryKey(),
    agentAddress: varchar("agent_address", { length: 42 }).notNull(),
    name: varchar("name", { length: 256 }).notNull(),
    txHash: varchar("tx_hash", { length: 66 }).notNull(),
    logIndex: integer("log_index").notNull(),
    blockNumber: integer("block_number").notNull(),
    blockTimestamp: timestamp("block_timestamp", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // A given event log (txHash + logIndex) is indexed at most once — makes
    // backfill/poll re-scans idempotent, same convention as agent_proofs.
    uniqueIndex("agent_registrations_tx_log_idx").on(table.txHash, table.logIndex),
  ]
);

// Airdrop points are intentionally NOT stored as mutable counters anywhere —
// they're derived at query time from agent_registrations + agent_proofs (see
// airdropPointsService.ts), which eliminates double-counting/backfill races.
// This table stores only the one thing that can't be derived from on-chain
// data: referral attribution (who referred whom, and each wallet's own
// shareable code).
export const airdropReferralsTable = pgTable("airdrop_referrals", {
  walletAddress: varchar("wallet_address", { length: 42 }).primaryKey(),
  referralCode: varchar("referral_code", { length: 20 }).notNull().unique(),
  // Write-once: set only the first time a wallet links a referral code, and
  // never overwritten afterwards (see airdrop.ts route guards). Self-referencing
  // FK to this table's own PK — nullable since most wallets have no referrer.
  referredBy: varchar("referred_by", { length: 42 }).references(
    (): AnyPgColumn => airdropReferralsTable.walletAddress
  ),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAgentRegistrationSchema = createInsertSchema(agentRegistrationsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAgentRegistration = z.infer<typeof insertAgentRegistrationSchema>;
export type AgentRegistration = typeof agentRegistrationsTable.$inferSelect;

export const insertAirdropReferralSchema = createInsertSchema(airdropReferralsTable).omit({
  createdAt: true,
});
export type InsertAirdropReferral = z.infer<typeof insertAirdropReferralSchema>;
export type AirdropReferral = typeof airdropReferralsTable.$inferSelect;
