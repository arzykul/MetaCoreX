import { Router, type IRouter } from "express";
import { ethers } from "ethers";
import { eq, desc, asc, sql, and } from "drizzle-orm";
import { db, agentTasksTable, agentTaskHistoryTable } from "@workspace/db";
import { contractService } from "../services/contractService.js";
import { mcxEventBus } from "../ws/eventBus.js";

// Agent task marketplace routes. Mounted at /api/agent-tasks/* (NOT /api/tasks,
// which is the unrelated personal-agent to-do feature — see routes/tasks.ts).
//
// Reward-moving actions never accept a raw private key. Completing a task is
// signed client-side by the agent's connected wallet (wagmi `writeContract`
// against submitProof, same pattern as the dashboard's "Submit Proof" tab).
// This route only verifies the resulting on-chain transaction and persists
// the outcome — consistent with the rest of this site's wallet-signing model.

const router: IRouter = Router();

const TASK_STATUSES = ["pending", "assigned", "completed", "verified", "cancelled"] as const;
type TaskStatus = (typeof TASK_STATUSES)[number];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && (TASK_STATUSES as readonly string[]).includes(value);
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function recordHistory(
  taskId: string,
  action: string,
  actor: string | null
): Promise<void> {
  await db.insert(agentTaskHistoryTable).values({ taskId, action, actor });
}

/**
 * GET /api/agent-tasks/stats
 * Registered above /agent-tasks/:id so "stats" isn't swallowed as an id param.
 */
router.get("/agent-tasks/stats", async (_req, res): Promise<void> => {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      pending: sql<number>`count(*) filter (where ${agentTasksTable.status} = 'pending')::int`,
      assigned: sql<number>`count(*) filter (where ${agentTasksTable.status} = 'assigned')::int`,
      completed: sql<number>`count(*) filter (where ${agentTasksTable.status} in ('completed', 'verified'))::int`,
      totalReward: sql<number>`coalesce(sum(${agentTasksTable.reward}) filter (where ${agentTasksTable.status} in ('completed', 'verified')), 0)::float8`,
    })
    .from(agentTasksTable);

  res.json({
    ok: true,
    total: row?.total ?? 0,
    pending: row?.pending ?? 0,
    assigned: row?.assigned ?? 0,
    completed: row?.completed ?? 0,
    totalReward: row?.totalReward ?? 0,
  });
});

/**
 * GET /api/agent-tasks/my/:agentAddress
 * Tasks currently assigned to a given agent address.
 * Registered above /agent-tasks/:id for the same reason as /stats.
 */
router.get("/agent-tasks/my/:agentAddress", async (req, res): Promise<void> => {
  const raw = firstParam(req.params.agentAddress);
  if (!raw || !ethers.isAddress(raw)) {
    res.status(400).json({ ok: false, error: "agentAddress must be a valid Ethereum address" });
    return;
  }

  const tasks = await db
    .select()
    .from(agentTasksTable)
    .where(eq(agentTasksTable.agentAddress, raw))
    .orderBy(desc(agentTasksTable.createdAt));

  res.json({ ok: true, tasks });
});

/**
 * GET /api/agent-tasks/list
 * Query: status?, limit? (default 10), offset? (default 0),
 *        sortBy? ("reward" | "date", default "reward"), order? ("asc" | "desc", default "desc")
 */
router.get("/agent-tasks/list", async (req, res): Promise<void> => {
  const { status, limit: limitRaw, offset: offsetRaw, sortBy: sortByRaw, order: orderRaw } = req.query as {
    status?: string;
    limit?: string;
    offset?: string;
    sortBy?: string;
    order?: string;
  };

  // status may be a single value or a comma-separated list (e.g. "completed,verified")
  const statusList = status ? status.split(",").map((s) => s.trim()) : [];
  if (statusList.some((s) => !isValidStatus(s))) {
    res.status(400).json({ ok: false, error: `status must be one of: ${TASK_STATUSES.join(", ")}` });
    return;
  }

  const limit = Math.min(Math.max(parseInt(limitRaw ?? "10", 10) || 10, 1), 100);
  const offset = Math.max(parseInt(offsetRaw ?? "0", 10) || 0, 0);
  const sortBy = sortByRaw === "date" ? "date" : "reward";
  const order = orderRaw === "asc" ? "asc" : "desc";

  const sortColumn = sortBy === "date" ? agentTasksTable.createdAt : agentTasksTable.reward;
  const orderFn = order === "asc" ? asc : desc;
  const whereClause =
    statusList.length === 1
      ? eq(agentTasksTable.status, statusList[0] as TaskStatus)
      : statusList.length > 1
        ? sql`${agentTasksTable.status} in (${sql.join(statusList, sql`, `)})`
        : undefined;

  const [tasks, [countRow]] = await Promise.all([
    db
      .select()
      .from(agentTasksTable)
      .where(whereClause)
      .orderBy(orderFn(sortColumn))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(agentTasksTable)
      .where(whereClause),
  ]);

  res.json({ ok: true, tasks, total: countRow?.count ?? 0, limit, offset });
});

/**
 * POST /api/agent-tasks/create
 * Body: { title, description?, reward, createdBy }
 * createdBy is the connected wallet address — no private key is ever collected.
 */
router.post("/agent-tasks/create", async (req, res): Promise<void> => {
  const { title, description, reward, createdBy } = req.body as {
    title?: string;
    description?: string;
    reward?: number | string;
    createdBy?: string;
  };

  if (!isNonEmptyString(title)) {
    res.status(400).json({ ok: false, error: "title is required and must be a non-empty string" });
    return;
  }
  if (!isNonEmptyString(createdBy) || !ethers.isAddress(createdBy)) {
    res.status(400).json({ ok: false, error: "createdBy must be a valid Ethereum address" });
    return;
  }
  const rewardNum = typeof reward === "string" ? Number(reward) : reward;
  if (typeof rewardNum !== "number" || !Number.isFinite(rewardNum) || rewardNum <= 0) {
    res.status(400).json({ ok: false, error: "reward must be a positive number" });
    return;
  }

  const [task] = await db
    .insert(agentTasksTable)
    .values({
      title: title.trim(),
      description: description == null ? null : String(description),
      reward: rewardNum,
      createdBy,
    })
    .returning();

  if (!task) {
    res.status(500).json({ ok: false, error: "Failed to create task" });
    return;
  }

  await recordHistory(task.id, "created", createdBy);
  mcxEventBus.publish("TaskCreated", { taskId: task.id, title: task.title, reward: task.reward, createdBy });

  res.status(201).json({ ok: true, task });
});

/**
 * GET /api/agent-tasks/:id
 */
router.get("/agent-tasks/:id", async (req, res): Promise<void> => {
  const id = firstParam(req.params.id);
  if (!id) {
    res.status(400).json({ ok: false, error: "id is required" });
    return;
  }

  const [task] = await db.select().from(agentTasksTable).where(eq(agentTasksTable.id, id));
  if (!task) {
    res.status(404).json({ ok: false, error: "Task not found" });
    return;
  }

  res.json({ ok: true, task });
});

/**
 * POST /api/agent-tasks/assign/:id
 * Body: { agentAddress }
 * Requires the task to be pending and the agent to already be registered on-chain.
 */
router.post("/agent-tasks/assign/:id", async (req, res): Promise<void> => {
  const id = firstParam(req.params.id);
  const { agentAddress } = req.body as { agentAddress?: string };

  if (!id) {
    res.status(400).json({ ok: false, error: "id is required" });
    return;
  }
  if (!isNonEmptyString(agentAddress) || !ethers.isAddress(agentAddress)) {
    res.status(400).json({ ok: false, error: "agentAddress must be a valid Ethereum address" });
    return;
  }

  const [task] = await db.select().from(agentTasksTable).where(eq(agentTasksTable.id, id));
  if (!task) {
    res.status(404).json({ ok: false, error: "Task not found" });
    return;
  }
  if (task.status !== "pending") {
    res.status(400).json({ ok: false, error: "Task is not available for assignment" });
    return;
  }

  if (contractService.connected) {
    const info = await contractService.getAgentInfo(agentAddress);
    if (!info || !info.isActive) {
      res.status(400).json({ ok: false, error: "No agents registered. Register your first agent." });
      return;
    }
  }

  const [updated] = await db
    .update(agentTasksTable)
    .set({ status: "assigned", agentAddress, assignedAt: new Date() })
    .where(eq(agentTasksTable.id, id))
    .returning();

  await recordHistory(id, "assigned", agentAddress);
  mcxEventBus.publish("TaskAssigned", { taskId: id, agentAddress });

  res.json({ ok: true, task: updated });
});

/**
 * POST /api/agent-tasks/complete/:id
 * Body: { agentAddress, proof, txHash }
 * The reward-minting `submitProof` transaction is signed client-side by the
 * agent's wallet before this call. This endpoint verifies that transaction
 * on-chain (via the receipt) rather than trusting a client-supplied reward.
 */
router.post("/agent-tasks/complete/:id", async (req, res): Promise<void> => {
  const id = firstParam(req.params.id);
  const { agentAddress, proof, txHash } = req.body as {
    agentAddress?: string;
    proof?: string;
    txHash?: string;
  };

  if (!id) {
    res.status(400).json({ ok: false, error: "id is required" });
    return;
  }
  if (!isNonEmptyString(agentAddress) || !ethers.isAddress(agentAddress)) {
    res.status(400).json({ ok: false, error: "agentAddress must be a valid Ethereum address" });
    return;
  }
  if (!isNonEmptyString(proof)) {
    res.status(400).json({ ok: false, error: "proof is required and must be a non-empty string" });
    return;
  }
  if (!isNonEmptyString(txHash) || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    res.status(400).json({ ok: false, error: "txHash must be a valid transaction hash" });
    return;
  }

  const [task] = await db.select().from(agentTasksTable).where(eq(agentTasksTable.id, id));
  if (!task) {
    res.status(404).json({ ok: false, error: "Task not found" });
    return;
  }
  if (task.status !== "assigned") {
    res.status(400).json({ ok: false, error: "Task must be assigned before it can be completed" });
    return;
  }
  if (task.agentAddress?.toLowerCase() !== agentAddress.toLowerCase()) {
    res.status(400).json({ ok: false, error: "Only the assigned agent can complete this task" });
    return;
  }

  if (!contractService.connected) {
    res.status(503).json({ ok: false, error: "Blockchain not connected" });
    return;
  }

  let rewardWei: string | undefined;
  try {
    const verification = await contractService.verifyProofTx(txHash, agentAddress);
    if (!verification || !verification.accepted) {
      res.status(400).json({
        ok: false,
        error: verification?.reason ?? "Proof transaction was not accepted on-chain",
      });
      return;
    }
    rewardWei = verification.reward;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    req.log.warn({ err: message }, "agent-tasks/complete: proof verification failed");
    res.status(400).json({ ok: false, error: `Failed to verify transaction: ${message}` });
    return;
  }

  const [updated] = await db
    .update(agentTasksTable)
    .set({ status: "completed", proof, txHash, completedAt: new Date() })
    .where(eq(agentTasksTable.id, id))
    .returning();

  await recordHistory(id, "completed", agentAddress);

  const rewardArzyg = rewardWei ? ethers.formatEther(rewardWei) : null;
  const newBalance = await contractService.getBalance(agentAddress);

  mcxEventBus.publish("TaskCompleted", { taskId: id, agentAddress, reward: rewardArzyg, txHash });

  res.json({ ok: true, task: updated, reward: rewardArzyg, newBalance });
});

/**
 * POST /api/agent-tasks/verify/:id
 * Body: { verified: boolean, verifiedBy? }
 * Admin/review action — no on-chain call, just finalizes the DB status.
 */
router.post("/agent-tasks/verify/:id", async (req, res): Promise<void> => {
  const id = firstParam(req.params.id);
  const { verified, verifiedBy } = req.body as { verified?: boolean; verifiedBy?: string };

  if (!id) {
    res.status(400).json({ ok: false, error: "id is required" });
    return;
  }
  if (typeof verified !== "boolean") {
    res.status(400).json({ ok: false, error: "verified must be a boolean" });
    return;
  }

  const [task] = await db.select().from(agentTasksTable).where(eq(agentTasksTable.id, id));
  if (!task) {
    res.status(404).json({ ok: false, error: "Task not found" });
    return;
  }
  if (task.status !== "completed") {
    res.status(400).json({ ok: false, error: "Task must be completed before it can be verified" });
    return;
  }

  const nextStatus: TaskStatus = verified ? "verified" : "cancelled";
  const [updated] = await db
    .update(agentTasksTable)
    .set({ status: nextStatus, verifiedAt: new Date() })
    .where(eq(agentTasksTable.id, id))
    .returning();

  await recordHistory(id, nextStatus, isNonEmptyString(verifiedBy) ? verifiedBy : null);
  mcxEventBus.publish("TaskVerified", { taskId: id, verified });

  res.json({ ok: true, task: updated });
});

export default router;
