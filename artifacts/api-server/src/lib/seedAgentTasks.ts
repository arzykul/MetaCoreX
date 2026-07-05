import { db, agentTasksTable, agentTaskHistoryTable } from "@workspace/db";
import { logger } from "./logger.js";

// Well-known deployer/hardhat[1] addresses (also used as defaults in
// routes/contract.ts's mint-demo route) — fine to hardcode since these are
// public demo/test addresses, not secrets.
const DEMO_CREATOR = "0x8b7C9bB9794e849a64242CEd0B7fe4604cB4A0D6";
const DEMO_AGENT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

const SEED_TASKS = [
  { title: "Анализ рынка ETH", description: "Собрать и проанализировать данные по цене и объёму торгов ETH за последние 24 часа.", reward: 100 },
  { title: "Генерация отчёта по активности", description: "Сформировать сводный отчёт по активности зарегистрированных агентов сети.", reward: 50 },
  { title: "Мониторинг газа за час", description: "Отследить и записать динамику цены газа в сети за последний час.", reward: 30 },
  { title: "Проверка нового контракта", description: "Провести базовый аудит нового смарт-контракта на предмет очевидных уязвимостей.", reward: 150 },
  { title: "Сбор твитов о проекте", description: "Собрать последние упоминания проекта MetaCoreX в X (Twitter) для анализа настроений.", reward: 20 },
] as const;

/** Seeds 5 demo tasks (once) if the agent_tasks table is empty. */
export async function seedAgentTasksIfEmpty(): Promise<void> {
  const existing = await db.select({ id: agentTasksTable.id }).from(agentTasksTable).limit(1);
  if (existing.length > 0) return;

  for (let i = 0; i < SEED_TASKS.length; i++) {
    const seed = SEED_TASKS[i];
    if (!seed) continue;
    const isPreAssigned = i === 2; // "Мониторинг газа за час" ships pre-assigned

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
