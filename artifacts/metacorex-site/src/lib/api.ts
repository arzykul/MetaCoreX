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

export interface RegisterAgentInput {
  name: string;
  description: string;
  privateKey: string;
}

export interface RegisterAgentResult {
  ok: boolean;
  txHash: string;
  agentAddress: string;
  name: string;
  description: string;
}

export interface SubmitProofInput {
  proof: string;
  amount: string;
  score: number | string;
  privateKey: string;
  agentAddress?: string;
}

export interface SubmitProofResult {
  ok: boolean;
  txHash: string;
  accepted: boolean;
  reward?: string;
  reason?: string;
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

/** POST /api/agents/register — self-register a new AI agent on-chain. */
export function registerAgent(input: RegisterAgentInput): Promise<RegisterAgentResult> {
  return apiFetch<RegisterAgentResult>("/api/agents/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * POST /api/agents/submit-proof — submit a proof-of-work for a registered
 * agent. reward = amount * score / 10, enforced on-chain.
 */
export function submitProof(input: SubmitProofInput): Promise<SubmitProofResult> {
  return apiFetch<SubmitProofResult>("/api/agents/submit-proof", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
