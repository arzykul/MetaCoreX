import { useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import { Navbar } from "@/components/layout/navbar";
import {
  useAccount,
  useDisconnect,
  useBalance,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSignMessage,
} from "wagmi";
import { useAgents, useContractInfo, useSubmitPou } from "@/hooks/use-api";
import { queryKeys } from "@/hooks/use-api";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, BarChart3, Database, Key, Wallet } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatEther, type Address } from "viem";
import { ARZYG_AGENT_ABI } from "@/lib/contract-abi";
import { ConnectWalletPrompt, ConnectWalletButtons } from "@/components/wallet/connect-wallet-prompt";

const DASHBOARD_TABS = ["agents", "register", "proof", "analytics"] as const;
type DashboardTab = (typeof DASHBOARD_TABS)[number];

function tabFromSearch(search: string): DashboardTab {
  const tab = new URLSearchParams(search).get("tab");
  return (DASHBOARD_TABS as readonly string[]).includes(tab ?? "") ? (tab as DashboardTab) : "agents";
}

export default function Dashboard() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({ address });
  const queryClient = useQueryClient();

  const search = useSearch();
  const [activeTab, setActiveTab] = useState<DashboardTab>(() => tabFromSearch(search));

  useEffect(() => {
    setActiveTab(tabFromSearch(search));
  }, [search]);

  const { data: agents = [], isLoading: isLoadingAgents } = useAgents();
  const { data: contractInfo } = useContractInfo();
  const contractAddress = contractInfo?.address as Address | undefined;

  const [regForm, setRegForm] = useState({ name: "", description: "" });
  const [proofText, setProofText] = useState("");
  const [pouResult, setPouResult] = useState<{ score: number; reasoning: string; reward: string | null; txHash: string | null } | null>(null);
  const { signMessageAsync, isPending: isSigningProof } = useSignMessage();
  const submitPou = useSubmitPou();

  const {
    writeContract: writeRegister,
    data: registerHash,
    error: registerError,
    isPending: isRegisterSigning,
    reset: resetRegister,
  } = useWriteContract();
  const { isLoading: isRegisterConfirming, isSuccess: isRegisterConfirmed } =
    useWaitForTransactionReceipt({ hash: registerHash });

  useEffect(() => {
    if (isRegisterConfirmed) {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents });
      setRegForm({ name: "", description: "" });
    }
  }, [isRegisterConfirmed, queryClient]);

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractAddress) return;
    resetRegister();
    writeRegister({
      address: contractAddress,
      abi: ARZYG_AGENT_ABI,
      functionName: "registerAgent",
      args: [regForm.name, regForm.description],
    });
  };

  /**
   * SECURITY: no on-chain call happens here. The wallet only signs a plain
   * message (EIP-191 personal_sign) over the proof text to prove the
   * submission comes from `address` — the server's AI validator scores the
   * text and, only if it passes, mints via its own validator wallet. There
   * is no client-supplied score or amount anywhere in this flow.
   */
  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address || !proofText.trim()) return;
    setPouResult(null);
    try {
      const signature = await signMessageAsync({ message: proofText.trim() });
      const res = await submitPou.mutateAsync({ agentAddress: address, proof: proofText.trim(), signature });
      setPouResult(res);
      if (res.reward) {
        setProofText("");
        queryClient.invalidateQueries({ queryKey: queryKeys.agents });
      }
    } catch {
      // signMessageAsync rejection or submitPou.isError is surfaced below
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 pt-24 pb-12 container mx-auto px-4 max-w-7xl">
        <div className="flex flex-col md:flex-row items-start justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold font-display tracking-tight text-foreground mb-2">Operator Console</h1>
            <p className="text-muted-foreground">Manage your on-chain autonomous agents and submit proof-of-work.</p>
          </div>

          <div className="flex items-center gap-3">
            {isConnected ? (
              <div className="flex items-center gap-3 bg-card px-4 py-2 rounded-lg shadow-soft">
                <div className="flex flex-col items-end">
                  <span className="text-xs text-muted-foreground" data-testid="text-wallet-address">
                    {address?.slice(0, 6)}...{address?.slice(-4)}
                  </span>
                  <span className="text-xs font-bold text-primary" data-testid="text-wallet-balance">
                    {balance ? parseFloat(formatEther(balance.value)).toFixed(4) : "0.0"} {balance?.symbol}
                  </span>
                </div>
                <Button variant="outline" size="sm" onClick={() => disconnect()} data-testid="btn-disconnect">
                  Disconnect
                </Button>
              </div>
            ) : (
              <ConnectWalletButtons />
            )}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DashboardTab)} className="w-full space-y-6">
          <TabsList className="bg-card w-full justify-start h-auto p-1 overflow-x-auto flex-nowrap shrink-0">
            <TabsTrigger value="agents" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary font-medium" data-testid="tab-agents">
              <Database className="w-4 h-4 mr-2" /> Registered Agents
            </TabsTrigger>
            <TabsTrigger value="register" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary font-medium" data-testid="tab-register">
              <Key className="w-4 h-4 mr-2" /> Register Agent
            </TabsTrigger>
            <TabsTrigger value="proof" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary font-medium" data-testid="tab-proof">
              <Activity className="w-4 h-4 mr-2" /> Submit Proof
            </TabsTrigger>
            <TabsTrigger value="analytics" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary font-medium" data-testid="tab-analytics">
              <BarChart3 className="w-4 h-4 mr-2" /> Earnings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="agents" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Active Agents ({agents.length})</CardTitle>
                <CardDescription>Live index of all agents registered in the ARZY-G economy.</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingAgents ? (
                  <div className="space-y-2">
                    <div className="h-12 bg-muted animate-pulse rounded" />
                    <div className="h-12 bg-muted animate-pulse rounded" />
                    <div className="h-12 bg-muted animate-pulse rounded" />
                  </div>
                ) : agents.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-border rounded-lg bg-background">
                    <Database className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                    <h3 className="text-lg font-semibold text-foreground mb-1">No agents found</h3>
                    <p className="text-sm text-muted-foreground mb-4">There are currently no agents registered on the network.</p>
                    <Button variant="outline" onClick={() => setActiveTab("register")} data-testid="btn-empty-register">
                      Register the first agent
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-md overflow-hidden">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-muted-foreground uppercase bg-transparent border-b border-border">
                        <tr>
                          <th className="px-4 py-3 font-mono">Address</th>
                          <th className="px-4 py-3">Name</th>
                          <th className="px-4 py-3 text-right">Tasks</th>
                          <th className="px-4 py-3 text-right font-mono text-primary">Earned</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {agents.map((agent, i) => (
                          <tr key={agent.address} className="hover:bg-muted/60 transition-colors" data-testid={`agent-row-${i}`}>
                            <td className="px-4 py-3 font-mono text-xs truncate max-w-[150px]">{agent.address}</td>
                            <td className="px-4 py-3 font-medium">{agent.name}</td>
                            <td className="px-4 py-3 text-right text-muted-foreground">{agent.tasksCompleted}</td>
                            <td className="px-4 py-3 text-right font-mono text-primary">{parseFloat(agent.totalEarned).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="register">
            <Card className="max-w-2xl mx-auto">
              <CardHeader>
                <CardTitle>Register Autonomous Agent</CardTitle>
                <CardDescription>Deploy a new agent identity to the Sepolia testnet using your connected wallet.</CardDescription>
              </CardHeader>
              <CardContent>
                {!isConnected ? (
                  <ConnectWalletPrompt label="Connect a wallet to register an agent — the transaction is signed locally in your wallet, we never see your private key." />
                ) : (
                  <>
                    <Alert className="mb-6 border-primary/30 bg-primary/5">
                      <Wallet className="h-4 w-4" />
                      <AlertTitle>Signed by your wallet</AlertTitle>
                      <AlertDescription className="text-xs">
                        This registers <span className="font-mono">{address?.slice(0, 6)}...{address?.slice(-4)}</span> as the agent identity. Your wallet will prompt you to approve the transaction — no private key ever leaves your device.
                      </AlertDescription>
                    </Alert>

                    <form onSubmit={handleRegister} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="reg-name">Agent Name</Label>
                        <Input
                          id="reg-name"
                          placeholder="e.g. OracleBot-9000"
                          value={regForm.name}
                          onChange={e => setRegForm({...regForm, name: e.target.value})}
                          required
                          data-testid="input-reg-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reg-desc">Description</Label>
                        <Input
                          id="reg-desc"
                          placeholder="Purpose of this agent"
                          value={regForm.description}
                          onChange={e => setRegForm({...regForm, description: e.target.value})}
                          required
                          data-testid="input-reg-desc"
                        />
                      </div>

                      {registerError && (
                        <div className="text-sm text-red-500 bg-red-500/10 p-3 rounded" data-testid="alert-reg-error">
                          Error: {registerError.message}
                        </div>
                      )}

                      {isRegisterConfirmed && (
                        <div className="text-sm text-primary bg-primary/10 p-3 rounded break-all" data-testid="alert-reg-success">
                          Success! TxHash: {registerHash}
                        </div>
                      )}

                      <Button
                        type="submit"
                        className="w-full"
                        disabled={isRegisterSigning || isRegisterConfirming || !contractAddress}
                        data-testid="btn-submit-register"
                      >
                        {isRegisterSigning ? "Confirm in wallet..." : isRegisterConfirming ? "Registering..." : "Register Agent"}
                      </Button>
                    </form>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="proof">
            <Card className="max-w-2xl mx-auto">
              <CardHeader>
                <CardTitle>Submit Proof of Use</CardTitle>
                <CardDescription>Log completed work to claim ARZY-G rewards.</CardDescription>
              </CardHeader>
              <CardContent>
                {!isConnected ? (
                  <ConnectWalletPrompt label="Connect the wallet holding your registered agent identity to submit proof." />
                ) : (
                  <>
                    <Alert className="mb-6 border-primary/30 bg-primary/5">
                      <Wallet className="h-4 w-4" />
                      <AlertTitle>Scored by our AI validator</AlertTitle>
                      <AlertDescription className="text-xs">
                        Your wallet only signs a message to prove this report comes from <span className="font-mono">{address?.slice(0, 6)}...{address?.slice(-4)}</span> — no transaction, no gas. Our server scores the report with AI and mints the reward itself only if it passes; there's no way to set your own score or amount.
                      </AlertDescription>
                    </Alert>

                    <form onSubmit={handleSubmitProof} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="proof-data">Describe the work you did</Label>
                        <Textarea
                          id="proof-data"
                          placeholder="What did you build, ship, or verify? Include links or evidence where possible."
                          rows={4}
                          value={proofText}
                          onChange={e => setProofText(e.target.value)}
                          required
                          minLength={20}
                          data-testid="input-proof-data"
                        />
                      </div>

                      {submitPou.isError && (
                        <div className="text-sm text-red-500 bg-red-500/10 p-3 rounded" data-testid="alert-proof-error">
                          {submitPou.error instanceof Error ? submitPou.error.message : "Failed to submit proof"}
                        </div>
                      )}

                      {pouResult && (
                        <div
                          className={`text-sm p-3 rounded break-all ${pouResult.reward ? "text-primary bg-primary/10" : "text-red-500 bg-red-500/10"}`}
                          data-testid="alert-proof-success"
                        >
                          Score: {pouResult.score}/10 <br />
                          {pouResult.reward ? (
                            <>Accepted — Reward: {pouResult.reward} ARZY-G {pouResult.txHash && <>(tx: {pouResult.txHash})</>}</>
                          ) : (
                            <>Rejected: {pouResult.reasoning}</>
                          )}
                        </div>
                      )}

                      <Button
                        type="submit"
                        className="w-full"
                        disabled={isSigningProof || submitPou.isPending}
                        data-testid="btn-submit-proof"
                      >
                        {isSigningProof ? "Confirm signature in wallet..." : submitPou.isPending ? "Scoring with AI validator..." : "Submit Proof"}
                      </Button>
                    </form>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics">
            <Card>
              <CardHeader>
                <CardTitle>Network Earnings Distribution</CardTitle>
                <CardDescription>Total ARZY-G earned by top active agents.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                {agents.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Not enough data to display charts.</div>
                ) : (
                  <div className="h-[400px] w-full" data-testid="chart-earnings">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsBarChart data={agents.map(a => ({ name: a.name, earned: parseFloat(a.totalEarned) }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                        <XAxis dataKey="name" stroke="#6B7280" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#6B7280" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => val.toLocaleString()} />
                        <Tooltip
                          cursor={{fill: 'rgba(0,85,255,0.05)'}}
                          contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}
                          itemStyle={{ color: '#0055FF' }}
                          labelStyle={{ color: '#1A1A1A' }}
                        />
                        <Bar dataKey="earned" fill="#0055FF" radius={[4, 4, 0, 0]} />
                      </RechartsBarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>
      </main>
    </div>
  );
}
