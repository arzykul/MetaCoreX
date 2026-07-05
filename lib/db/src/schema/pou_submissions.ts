import { pgTable, text, varchar, integer, numeric, timestamp, serial, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Audit log for the Dashboard "Submit Proof of Use" flow (POST /api/pou/submit).
// Unlike agent_tasks (which is anchored to a specific marketplace task row),
// this flow has no other DB anchor, so every attempt — accepted or rejected —
// is recorded here. Used to enforce per-address dedupe and a daily submission
// cap, and to audit what the AI validator scored and why.
export const pouSubmissionsTable = pgTable(
  "pou_submissions",
  {
    id: serial("id").primaryKey(),
    agentAddress: varchar("agent_address", { length: 42 }).notNull(),
    proof: text("proof").notNull(),
    // EIP-191 personal_sign signature over `proof`, proving this submission
    // was authorized by the private key controlling agentAddress — without
    // ever collecting that private key itself.
    signature: varchar("signature", { length: 132 }).notNull(),
    status: text("status").notNull(), // accepted | rejected
    score: integer("score"),
    reasoning: text("reasoning"),
    rejectReason: text("reject_reason"),
    // uint256 wei values as strings — a JS number cannot hold full uint256 range.
    amountWei: numeric("amount_wei", { precision: 78, scale: 0, mode: "string" }).notNull(),
    rewardWei: numeric("reward_wei", { precision: 78, scale: 0, mode: "string" }),
    mintTxHash: varchar("mint_tx_hash", { length: 66 }),
    transferTxHash: varchar("transfer_tx_hash", { length: 66 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("pou_submissions_agent_idx").on(table.agentAddress, table.createdAt)]
);

export const insertPouSubmissionSchema = createInsertSchema(pouSubmissionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertPouSubmission = z.infer<typeof insertPouSubmissionSchema>;
export type PouSubmission = typeof pouSubmissionsTable.$inferSelect;
