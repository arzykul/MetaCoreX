// Thin fetch wrapper around the MetaCoreX API server's non-OpenAPI routes
// (/api/contract/*, /api/agents/*). These routes are not part of
// lib/api-spec/openapi.yaml, so there are no generated React Query hooks —
// call these functions directly with @tanstack/react-query's useQuery /
// useMutation in components.
//
// All paths are root-relative ("/api/...") because the API server owns the
// global "/api" prefix across the whole workspace (see artifact.toml), not
// this artifact's own base path.

export interface TokenInfo {
  connected: boolean;
  address?: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  totalSupply?: string;
  totalSupplyWei?: string;
  deployerBalance?: string;
  deployerAddress?: string;
  chainId?: number;
  blockNumber?: number;
  rpcUrl?: string;
  network?: string;
  etherscan?: string;
}

export interface AgentInfo {
  address: string;
  name: string;
  description: string;
  registeredAt: string;
  totalEarned: string;
  totalEarnedWei: string;
  tasksCompleted: string;
  isActive: boolean;
}

export interface ApiErrorBody {
  ok?: boolean;
  error: string;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as ApiErrorBody;
      if (body?.error) message = body.error;
    } catch {
      // ignore — fall back to statusText
    }
    throw new ApiError(res.status, message);
  }

  return res.json() as Promise<T>;
}

/** GET /api/contract/info — live on-chain token state (ARZY-G). */
export function getContractInfo(): Promise<TokenInfo> {
  return apiFetch<TokenInfo>("/api/contract/info");
}

/**
 * GET /api/contract/status — lightweight connection check plus the real API
 * server process uptime (uptimeSeconds), not a fabricated SLA number.
 */
export function getContractStatus(): Promise<{ connected: boolean; uptimeSeconds: number }> {
  return apiFetch<{ connected: boolean; uptimeSeconds: number }>("/api/contract/status");
}

/** GET /api/agents/list/all — all active registered agents. */
export async function listAgents(): Promise<AgentInfo[]> {
  const data = await apiFetch<{ ok: boolean; count: number; agents: AgentInfo[] }>(
    "/api/agents/list/all",
  );
  return data.agents;
}

/** GET /api/agents/:address — single agent detail. Throws ApiError(404) if not registered. */
export async function getAgent(address: string): Promise<AgentInfo> {
  const data = await apiFetch<{ ok: boolean; agent: AgentInfo }>(`/api/agents/${address}`);
  return data.agent;
}

// Note: registration and proof submission are done client-side via the
// connected wallet (wagmi `writeContract` against the ARZYG_AGENT_ABI in
// src/lib/contract-abi.ts — see dashboard.tsx), not through the API
// server's privateKey-based /api/agents/register and /api/agents/submit-proof
// routes. Those routes still exist for server-side automation (see
// scripts/src/auto-agent.ts) but are intentionally not called from this
// public-facing site, since collecting a raw private key in a web form is
// not an appropriate pattern for a public site.

// ─── Agent Tasks (on-chain bounty marketplace) ─────────────────────────────
// Mounted at /api/agent-tasks/* on the API server — distinct from /api/tasks,
// which is an unrelated personal-agent to-do feature. Completing a task
// mints a reward via submitProof, so — same rule as above — that transaction
// is always signed client-side by the agent's connected wallet; this API
// only verifies the resulting txHash and persists the outcome.

export type TaskStatus = "pending" | "assigned" | "completed" | "verified" | "cancelled";

export interface AgentTask {
  id: string;
  title: string;
  description: string | null;
  reward: number;
  status: TaskStatus;
  agentAddress: string | null;
  createdBy: string;
  proof: string | null;
  score: number | null;
  validatorReasoning: string | null;
  txHash: string | null;
  transferTxHash: string | null;
  assignedAt: string | null;
  completedAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
}

export interface TaskStats {
  total: number;
  pending: number;
  assigned: number;
  completed: number;
  totalReward: number;
}

export interface ListTasksParams {
  status?: TaskStatus | TaskStatus[];
  limit?: number;
  offset?: number;
  sortBy?: "reward" | "date";
  order?: "asc" | "desc";
}

/** GET /api/agent-tasks/list */
export async function listTasks(
  params: ListTasksParams = {},
): Promise<{ tasks: AgentTask[]; total: number }> {
  const search = new URLSearchParams();
  if (params.status) {
    search.set("status", Array.isArray(params.status) ? params.status.join(",") : params.status);
  }
  if (params.limit != null) search.set("limit", String(params.limit));
  if (params.offset != null) search.set("offset", String(params.offset));
  if (params.sortBy) search.set("sortBy", params.sortBy);
  if (params.order) search.set("order", params.order);
  const qs = search.toString();
  return apiFetch<{ ok: boolean; tasks: AgentTask[]; total: number }>(
    `/api/agent-tasks/list${qs ? `?${qs}` : ""}`,
  );
}

/** GET /api/agent-tasks/stats */
export function getTaskStats(): Promise<TaskStats> {
  return apiFetch<TaskStats>("/api/agent-tasks/stats");
}

/** GET /api/agent-tasks/my/:agentAddress */
export async function getMyTasks(agentAddress: string): Promise<AgentTask[]> {
  const data = await apiFetch<{ ok: boolean; tasks: AgentTask[] }>(
    `/api/agent-tasks/my/${agentAddress}`,
  );
  return data.tasks;
}

/** POST /api/agent-tasks/create */
export async function createTask(input: {
  title: string;
  description?: string;
  reward: number;
  createdBy: string;
}): Promise<AgentTask> {
  const data = await apiFetch<{ ok: boolean; task: AgentTask }>("/api/agent-tasks/create", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.task;
}

/** POST /api/agent-tasks/assign/:id */
export async function assignTask(id: string, agentAddress: string): Promise<AgentTask> {
  const data = await apiFetch<{ ok: boolean; task: AgentTask }>(`/api/agent-tasks/assign/${id}`, {
    method: "POST",
    body: JSON.stringify({ agentAddress }),
  });
  return data.task;
}

/**
 * POST /api/agent-tasks/complete/:id
 *
 * SECURITY: this only ever sends free-text `proofText` describing the work
 * done — never a score, amount, or tx hash. The server scores the report
 * with its own AI validator and, only if it passes, mints via its own
 * validator wallet. There is no client-side signing step for this anymore.
 */
export async function completeTask(
  id: string,
  input: { agentAddress: string; proofText: string },
): Promise<{ task: AgentTask; reward: string | null; score: number; reasoning: string; newBalance: string | null }> {
  return apiFetch<{
    ok: boolean;
    task: AgentTask;
    reward: string | null;
    score: number;
    reasoning: string;
    newBalance: string | null;
  }>(`/api/agent-tasks/complete/${id}`, { method: "POST", body: JSON.stringify(input) });
}

/** POST /api/agent-tasks/verify/:id */
export async function verifyTask(id: string, verified: boolean): Promise<AgentTask> {
  const data = await apiFetch<{ ok: boolean; task: AgentTask }>(`/api/agent-tasks/verify/${id}`, {
    method: "POST",
    body: JSON.stringify({ verified }),
  });
  return data.task;
}

// ─── PoU Analytics (Proof of Usefulness) ───────────────────────────────────
// Mounted at /api/pou/* — backed by the background proofIndexer, which
// mirrors on-chain ProofAccepted events into the agent_proofs table. This is
// the full network history of accepted proofs, not just marketplace tasks.

export type PouRange = "24h" | "7d" | "30d" | "90d" | "all";
export type PouBucket = "hour" | "day";

export interface PouOverview {
  range: PouRange;
  networkPoU: number;
  totalUsefulWork: number;
  activeAgents24h: number;
  pouVelocityPct: number | null;
}

export interface PouTrendPoint {
  t: string;
  avgScore: number;
  proofCount: number;
  movingAvg: number;
}

export interface PouTrend {
  range: PouRange;
  bucket: PouBucket;
  points: PouTrendPoint[];
}

export interface PouDistributionBucket {
  range: string;
  agentCount: number;
}

export interface PouHeatmapCell {
  dow: number;
  hour: number;
  proofCount: number;
  avgScore: number;
}

export interface PouFeedEvent {
  id: number;
  agentAddress: string;
  proof: string;
  score: number;
  rewardArzyg: string;
  txHash: string;
  blockTimestamp: string;
}

/** GET /api/pou/overview?range=... — hero metrics. */
export function getPouOverview(range: PouRange = "7d"): Promise<PouOverview> {
  return apiFetch<PouOverview>(`/api/pou/overview?range=${range}`);
}

/** GET /api/pou/trend?range=&interval= — bucketed avg PoU score over time. */
export function getPouTrend(range: PouRange = "7d", interval: PouBucket = "day"): Promise<PouTrend> {
  return apiFetch<PouTrend>(`/api/pou/trend?range=${range}&interval=${interval}`);
}

/** GET /api/pou/distribution — agents histogrammed by lifetime avg score. */
export function getPouDistribution(): Promise<{ buckets: PouDistributionBucket[] }> {
  return apiFetch<{ ok: boolean; buckets: PouDistributionBucket[] }>("/api/pou/distribution");
}

/** GET /api/pou/heatmap — day-of-week x hour-of-day activity grid (UTC). */
export function getPouHeatmap(): Promise<{ cells: PouHeatmapCell[] }> {
  return apiFetch<{ ok: boolean; cells: PouHeatmapCell[] }>("/api/pou/heatmap");
}

/** GET /api/pou/feed?limit= — most recent accepted proofs, network-wide. */
export function getPouFeed(limit = 50): Promise<{ events: PouFeedEvent[] }> {
  return apiFetch<{ ok: boolean; events: PouFeedEvent[] }>(`/api/pou/feed?limit=${limit}`);
}

export type PouLeaderboardTab = "top" | "active" | "earners" | "rising";

export interface PouLeaderboardEntry {
  rank: number;
  agentAddress: string;
  avgScore: number;
  totalProofs: number;
  totalEarnedArzyg: string;
  risingDelta: number | null;
}

export interface PouLeaderboard {
  tab: PouLeaderboardTab;
  page: number;
  limit: number;
  total: number;
  entries: PouLeaderboardEntry[];
}

export interface PouRank {
  address: string;
  rank: number | null;
  totalRanked: number;
}

/** GET /api/pou/leaderboard?tab=&page= — ranked agents by the selected metric. */
export function getPouLeaderboard(tab: PouLeaderboardTab = "top", page = 1): Promise<PouLeaderboard> {
  return apiFetch<PouLeaderboard>(`/api/pou/leaderboard?tab=${tab}&page=${page}`);
}

/** GET /api/pou/rank/:address — a single agent's rank on the "top" (avg PoU) leaderboard. */
export function getPouRank(address: string): Promise<PouRank> {
  return apiFetch<PouRank>(`/api/pou/rank/${address}`);
}

export interface PouRadar {
  speed: number;
  quality: number;
  consistency: number;
  complexity: number;
  impact: number;
}

export interface PouBestPerformance {
  score: number;
  blockTimestamp: string;
  proof: string;
}

export interface PouTaskDistributionEntry {
  category: string;
  count: number;
}

export interface PouAchievement {
  id: string;
  label: string;
}

export interface PouAgentProfile {
  address: string;
  avgScore: number | null;
  totalProofs: number;
  totalEarnedArzyg: string;
  currentStreakDays: number;
  bestPerformance: PouBestPerformance | null;
  radar: PouRadar | null;
  taskDistribution: PouTaskDistributionEntry[];
  achievements: PouAchievement[];
  rank: number | null;
}

export interface PouAgentProof {
  id: number;
  proof: string;
  score: number;
  rewardArzyg: string;
  txHash: string;
  blockTimestamp: string;
}

export interface PouAgentProofsPage {
  total: number;
  limit: number;
  offset: number;
  proofs: PouAgentProof[];
}

/** GET /api/pou/agents/:address — full PoU profile for the agent page. */
export function getPouAgentProfile(address: string): Promise<PouAgentProfile> {
  return apiFetch<PouAgentProfile>(`/api/pou/agents/${address}`);
}

/** GET /api/pou/agents/:address/proofs?limit=&offset= — paginated proof history. */
export function getPouAgentProofs(
  address: string,
  limit = 20,
  offset = 0,
): Promise<PouAgentProofsPage> {
  return apiFetch<PouAgentProofsPage>(
    `/api/pou/agents/${address}/proofs?limit=${limit}&offset=${offset}`,
  );
}

/**
 * POST /api/pou/submit — the Dashboard's "Submit Proof of Use" flow.
 *
 * SECURITY: `signature` is an EIP-191 personal_sign signature over `proof`
 * produced by the connected wallet (see dashboard.tsx) — it proves the
 * submission is authorized by `agentAddress` WITHOUT ever sending a private
 * key to the server. The server scores `proof` with its own AI validator and
 * mints (fixed base amount) only via its own validator wallet if it passes;
 * there is no client-supplied score or on-chain call in this flow anymore.
 */
export async function submitPou(input: {
  agentAddress: string;
  proof: string;
  signature: string;
}): Promise<{ score: number; reasoning: string; reward: string | null; txHash: string | null; newBalance: string | null }> {
  return apiFetch<{
    ok: boolean;
    score: number;
    reasoning: string;
    reward: string | null;
    txHash: string | null;
    newBalance: string | null;
  }>("/api/pou/submit", { method: "POST", body: JSON.stringify(input) });
}
