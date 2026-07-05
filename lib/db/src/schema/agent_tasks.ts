import { pgTable, text, varchar, numeric, integer, timestamp, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { randomUUID } from "node:crypto";

// Agent task marketplace (on-chain bounty tasks tied to ARZY-G rewards).
// Named `agent_tasks` (not `tasks`) to avoid colliding with the unrelated
// personal-agent to-do table `tasks` (see ./tasks.ts) which already exists
// in this shared database.
export const agentTasksTable = pgTable("agent_tasks", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
  title: text("title").notNull(),
  description: text("description"),
  reward: numeric("reward", { precision: 20, scale: 2, mode: "number" }).notNull(),
  status: text("status").notNull().default("pending"), // pending | assigned | completed | verified | cancelled
  agentAddress: varchar("agent_address", { length: 42 }),
  createdBy: varchar("created_by", { length: 42 }).notNull(),
  proof: text("proof"),
  // Gemini PoU score (0-10) awarded to `proof` by the server-side AI
  // validator, and its short reasoning — set only by the /agent-tasks/complete
  // route via pouMintService, never accepted directly from a client.
  score: integer("score"),
  validatorReasoning: text("validator_reasoning"),
  // txHash = the validator wallet's own on-chain submitProof mint tx.
  // transferTxHash = the follow-up ERC20 transfer that forwards the reward
  // from the validator wallet to the completing agent's address.
  txHash: varchar("tx_hash", { length: 66 }),
  transferTxHash: varchar("transfer_tx_hash", { length: 66 }),
  assignedAt: timestamp("assigned_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agentTaskHistoryTable = pgTable("agent_task_history", {
  id: serial("id").primaryKey(),
  taskId: varchar("task_id", { length: 36 })
    .notNull()
    .references(() => agentTasksTable.id, { onDelete: "cascade" }),
  action: varchar("action", { length: 20 }).notNull(), // created | assigned | completed | verified | cancelled
  actor: varchar("actor", { length: 42 }),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAgentTaskSchema = createInsertSchema(agentTasksTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAgentTask = z.infer<typeof insertAgentTaskSchema>;
export type AgentTask = typeof agentTasksTable.$inferSelect;
export type AgentTaskHistory = typeof agentTaskHistoryTable.$inferSelect;
