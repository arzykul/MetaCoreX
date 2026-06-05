import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const agentMemories = pgTable("agent_memories", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AgentMemory = typeof agentMemories.$inferSelect;
