import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  type ListTasksParams,
} from "@/lib/api";

export const queryKeys = {
  contractInfo: ["contractInfo"] as const,
  contractStatus: ["contractStatus"] as const,
  agents: ["agents"] as const,
  agent: (address: string) => ["agent", address] as const,
  tasks: (params: ListTasksParams) => ["tasks", params] as const,
  taskStats: ["taskStats"] as const,
  myTasks: (address: string) => ["myTasks", address] as const,
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
