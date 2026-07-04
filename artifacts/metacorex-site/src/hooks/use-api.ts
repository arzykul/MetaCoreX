import { useQuery } from "@tanstack/react-query";
import {
  getContractInfo,
  getContractStatus,
  listAgents,
  getAgent,
} from "@/lib/api";

export const queryKeys = {
  contractInfo: ["contractInfo"] as const,
  contractStatus: ["contractStatus"] as const,
  agents: ["agents"] as const,
  agent: (address: string) => ["agent", address] as const,
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
