import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMcxEvents, type McxEvent } from "@/lib/ws";
import {
  getContractInfo,
  getContractStatus,
  listAgents,
  getAgent,
  listTasks,
  getTaskStats,
  getMyTasks,
  createTask,
  assignTask,
  completeTask,
  verifyTask,
  getPouOverview,
  getPouTrend,
  getPouDistribution,
  getPouHeatmap,
  getPouFeed,
  getPouLeaderboard,
  getPouRank,
  getPouAgentProfile,
  getPouAgentProofs,
  type ListTasksParams,
  type PouRange,
  type PouBucket,
  type PouLeaderboardTab,
} from "@/lib/api";

export const queryKeys = {
  contractInfo: ["contractInfo"] as const,
  contractStatus: ["contractStatus"] as const,
  agents: ["agents"] as const,
  agent: (address: string) => ["agent", address] as const,
  tasks: (params: ListTasksParams) => ["tasks", params] as const,
  taskStats: ["taskStats"] as const,
  myTasks: (address: string) => ["myTasks", address] as const,
  pouOverview: (range: PouRange) => ["pouOverview", range] as const,
  pouTrend: (range: PouRange, interval: PouBucket) => ["pouTrend", range, interval] as const,
  pouDistribution: ["pouDistribution"] as const,
  pouHeatmap: ["pouHeatmap"] as const,
  pouFeed: (limit: number) => ["pouFeed", limit] as const,
  pouLeaderboard: (tab: PouLeaderboardTab, page: number) => ["pouLeaderboard", tab, page] as const,
  pouRank: (address: string) => ["pouRank", address] as const,
  pouAgentProfile: (address: string) => ["pouAgentProfile", address] as const,
  pouAgentProofs: (address: string, limit: number, offset: number) =>
    ["pouAgentProofs", address, limit, offset] as const,
};

export function useContractInfo() {
  return useQuery({
    queryKey: queryKeys.contractInfo,
    queryFn: getContractInfo,
    refetchInterval: 15000,
  });
}

export function useContractStatus() {
  return useQuery({
    queryKey: queryKeys.contractStatus,
    queryFn: getContractStatus,
    refetchInterval: 15000,
  });
}

export function useAgents() {
  return useQuery({
    queryKey: queryKeys.agents,
    queryFn: listAgents,
    refetchInterval: 10000,
  });
}

export function useAgent(address: string) {
  return useQuery({
    queryKey: queryKeys.agent(address),
    queryFn: () => getAgent(address),
    enabled: !!address,
  });
}

export function useTasks(params: ListTasksParams) {
  return useQuery({
    queryKey: queryKeys.tasks(params),
    queryFn: () => listTasks(params),
    refetchInterval: 10000,
  });
}

export function useTaskStats() {
  return useQuery({
    queryKey: queryKeys.taskStats,
    queryFn: getTaskStats,
    refetchInterval: 10000,
  });
}

export function useMyTasks(address: string) {
  return useQuery({
    queryKey: queryKeys.myTasks(address),
    queryFn: () => getMyTasks(address),
    enabled: !!address,
    refetchInterval: 10000,
  });
}

function useInvalidateTaskQueries() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: queryKeys.taskStats });
    queryClient.invalidateQueries({ queryKey: ["myTasks"] });
  };
}

export function useCreateTask() {
  const invalidate = useInvalidateTaskQueries();
  return useMutation({
    mutationFn: createTask,
    onSuccess: invalidate,
  });
}

export function useAssignTask() {
  const invalidate = useInvalidateTaskQueries();
  return useMutation({
    mutationFn: ({ id, agentAddress }: { id: string; agentAddress: string }) =>
      assignTask(id, agentAddress),
    onSuccess: invalidate,
  });
}

export function useCompleteTask() {
  const invalidate = useInvalidateTaskQueries();
  return useMutation({
    mutationFn: ({
      id,
      agentAddress,
      proof,
      txHash,
    }: {
      id: string;
      agentAddress: string;
      proof: string;
      txHash: string;
    }) => completeTask(id, { agentAddress, proof, txHash }),
    onSuccess: invalidate,
  });
}

export function useVerifyTask() {
  const invalidate = useInvalidateTaskQueries();
  return useMutation({
    mutationFn: ({ id, verified }: { id: string; verified: boolean }) => verifyTask(id, verified),
    onSuccess: invalidate,
  });
}

// ─── PoU Analytics ──────────────────────────────────────────────────────────

export function usePouOverview(range: PouRange) {
  return useQuery({
    queryKey: queryKeys.pouOverview(range),
    queryFn: () => getPouOverview(range),
    refetchInterval: 15000,
  });
}

export function usePouTrend(range: PouRange, interval: PouBucket) {
  return useQuery({
    queryKey: queryKeys.pouTrend(range, interval),
    queryFn: () => getPouTrend(range, interval),
    refetchInterval: 30000,
  });
}

export function usePouDistribution() {
  return useQuery({
    queryKey: queryKeys.pouDistribution,
    queryFn: getPouDistribution,
    refetchInterval: 60000,
  });
}

export function usePouHeatmap() {
  return useQuery({
    queryKey: queryKeys.pouHeatmap,
    queryFn: getPouHeatmap,
    refetchInterval: 60000,
  });
}

export function usePouFeed(limit = 50) {
  return useQuery({
    queryKey: queryKeys.pouFeed(limit),
    queryFn: () => getPouFeed(limit),
    refetchInterval: 15000,
  });
}

export function usePouLeaderboard(tab: PouLeaderboardTab, page = 1) {
  return useQuery({
    queryKey: queryKeys.pouLeaderboard(tab, page),
    queryFn: () => getPouLeaderboard(tab, page),
    refetchInterval: 20000,
  });
}

export function usePouRank(address: string | undefined) {
  return useQuery({
    queryKey: queryKeys.pouRank(address ?? ""),
    queryFn: () => getPouRank(address!),
    enabled: !!address,
    refetchInterval: 30000,
  });
}

export function usePouAgentProfile(address: string | undefined) {
  return useQuery({
    queryKey: queryKeys.pouAgentProfile(address ?? ""),
    queryFn: () => getPouAgentProfile(address!),
    enabled: !!address,
    refetchInterval: 20000,
  });
}

export function usePouAgentProofs(address: string | undefined, limit = 20, offset = 0) {
  return useQuery({
    queryKey: queryKeys.pouAgentProofs(address ?? "", limit, offset),
    queryFn: () => getPouAgentProofs(address!, limit, offset),
    enabled: !!address,
    refetchInterval: 20000,
  });
}

/**
 * Subscribes to the live WebSocket EventBus and invalidates PoU query caches
 * the instant a `ProofAccepted` event arrives, so dashboards/leaderboards/
 * profiles update in real time instead of waiting for their poll interval.
 * Pass `agentAddress` on the agent profile page to also refresh that
 * agent's own profile/proof-history queries when they submit a new proof.
 */
export function usePouLiveInvalidation(agentAddress?: string): { connected: boolean; latestEvent: McxEvent | null } {
  const queryClient = useQueryClient();
  const { events, connected } = useMcxEvents(20);
  const latest = events[0] ?? null;

  useEffect(() => {
    if (!latest || latest.type !== "ProofAccepted") return;

    queryClient.invalidateQueries({ queryKey: ["pouOverview"] });
    queryClient.invalidateQueries({ queryKey: ["pouTrend"] });
    queryClient.invalidateQueries({ queryKey: ["pouDistribution"] });
    queryClient.invalidateQueries({ queryKey: ["pouHeatmap"] });
    queryClient.invalidateQueries({ queryKey: ["pouFeed"] });
    queryClient.invalidateQueries({ queryKey: ["pouLeaderboard"] });
    queryClient.invalidateQueries({ queryKey: ["pouRank"] });

    const eventAgent = typeof latest.data.agent === "string" ? latest.data.agent.toLowerCase() : undefined;
    if (agentAddress && eventAgent && eventAgent === agentAddress.toLowerCase()) {
      queryClient.invalidateQueries({ queryKey: queryKeys.pouAgentProfile(agentAddress) });
      queryClient.invalidateQueries({ queryKey: ["pouAgentProofs", agentAddress] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest]);

  return { connected, latestEvent: latest };
}
