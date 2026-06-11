import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const agentTools = pgTable("agent_tools", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description").notNull(),
  parametersSchema: jsonb("parameters_schema").$type<Record<string, unknown>>().notNull().default({}),
  implementationPrompt: text("implementation_prompt").notNull(),
  usageCount: integer("usage_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AgentTool = typeof agentTools.$inferSelect;
