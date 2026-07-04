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
