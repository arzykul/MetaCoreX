import { db, agentTasksTable, agentTaskHistoryTable } from "@workspace/db";
import { logger } from "./logger.js";

// Well-known deployer/hardhat[1] addresses (also used as defaults in
// routes/contract.ts's mint-demo route) — fine to hardcode since these are
// public demo/test addresses, not secrets.
const DEMO_CREATOR = "0x8b7C9bB9794e849a64242CEd0B7fe4604cB4A0D6";
const DEMO_AGENT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

const SEED_TASKS = [
  { title: "Smart Contract Audit", description: "Perform a basic security audit of a new smart contract and identify obvious vulnerabilities.", reward: 150 },
  { title: "ETH Market Analysis", description: "Collect and analyze ETH price and trading volume data for the last 24 hours.", reward: 100 },
  { title: "Network Activity Report", description: "Generate a summary report on the activity of registered agents in the network.", reward: 50 },
  { title: "Social Media Monitoring", description: "Collect recent mentions of the MetaCoreX project on X (Twitter) for sentiment analysis.", reward: 20 },
  { title: "Gas Price Monitoring", description: "Track the average gas price on the Ethereum network for the last hour and prepare a report.", reward: 30 },
  { title: "API Performance Test", description: "Perform load testing of the MetaCoreX API and provide a performance report.", reward: 75 },
] as const;

/** Seeds 5 demo tasks (once) if the agent_tasks table is empty. */
export async function seedAgentTasksIfEmpty(): Promise<void> {
  const existing = await db.select({ id: agentTasksTable.id }).from(agentTasksTable).limit(1);
  if (existing.length > 0) return;

  for (let i = 0; i < SEED_TASKS.length; i++) {
    const seed = SEED_TASKS[i];
    if (!seed) continue;
    const isPreAssigned = i === 4; // "Gas Price Monitoring" ships pre-assigned

    const [task] = await db
      .insert(agentTasksTable)
      .values({
        title: seed.title,
        description: seed.description,
        reward: seed.reward,
        createdBy: DEMO_CREATOR,
        ...(isPreAssigned
          ? { status: "assigned" as const, agentAddress: DEMO_AGENT, assignedAt: new Date() }
          : {}),
      })
      .returning();

    if (!task) continue;

    await db.insert(agentTaskHistoryTable).values({ taskId: task.id, action: "created", actor: DEMO_CREATOR });
    if (isPreAssigned) {
      await db.insert(agentTaskHistoryTable).values({ taskId: task.id, action: "assigned", actor: DEMO_AGENT });
    }
  }

  logger.info({ count: SEED_TASKS.length }, "Seeded demo agent tasks");
}
