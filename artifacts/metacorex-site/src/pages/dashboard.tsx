import { useEffect, useMemo, useState } from "react";
import { Navbar } from "@/components/layout/navbar";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useBalance,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { useAgents, useContractInfo } from "@/hooks/use-api";
import { queryKeys } from "@/hooks/use-api";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, Database, Key, Wallet } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { decodeEventLog, formatEther, type Address } from "viem";
import { ARZYG_AGENT_ABI } from "@/lib/contract-abi";

function ConnectWalletPrompt({ label }: { label: string }) {
  const { connectors, connect } = useConnect();
  return (
    <div className="text-center py-12 border border-dashed border-border rounded-lg bg-background/50">
      <Wallet className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
      <h3 className="text-lg font-medium text-foreground mb-1">Connect your wallet</h3>
      <p className="text-sm text-muted-foreground mb-4">{label}</p>
      <div className="flex flex-wrap gap-2 justify-center">
        {connectors.map((connector) => (
          <Button
            key={connector.uid}
            variant="outline"
            onClick={() => connect({ connector })}
            data-testid={`btn-connect-inline-${connector.id}`}
          >
            Connect {connector.name}
          </Button>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { address, isConnected } = useAccount();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({ address });
  const queryClient = useQueryClient();

  const { data: agents = [], isLoading: isLoadingAgents } = useAgents();
  const { data: contractInfo } = useContractInfo();
  const contractAddress = contractInfo?.address as Address | undefined;

  const [regForm, setRegForm] = useState({ name: "", description: "" });
  const [proofForm, setProofForm] = useState({ proof: "", amount: "", score: "10" });

  const {
    writeContract: writeRegister,
    data: registerHash,
    error: registerError,
    isPending: isRegisterSigning,
    reset: resetRegister,
  } = useWriteContract();
  const { isLoading: isRegisterConfirming, isSuccess: isRegisterConfirmed } =
    useWaitForTransactionReceipt({ hash: registerHash });

  const {
    writeContract: writeProof,
    data: proofHash,
    error: proofError,
    isPending: isProofSigning,
    reset: resetProof,
  } = useWriteContract();
  const { data: proofReceipt, isLoading: isProofConfirming, isSuccess: isProofConfirmed } =
    useWaitForTransactionReceipt({ hash: proofHash });

  const proofOutcome = useMemo(() => {
    if (!proofReceipt) return null;
    for (const log of proofReceipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: ARZYG_AGENT_ABI, data: log.data, topics: log.topics });
        if (decoded.eventName === "ProofAccepted") {
          return { accepted: true as const, reward: decoded.args.reward as bigint };
        }
        if (decoded.eventName === "ProofRejected") {
          return { accepted: false as const, reason: decoded.args.reason as string };
        }
      } catch {
        continue;
      }
    }
    return null;
  }, [proofReceipt]);

  useEffect(() => {
    if (isRegisterConfirmed) {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents });
      setRegForm({ name: "", description: "" });
    }
  }, [isRegisterConfirmed, queryClient]);

  useEffect(() => {
    if (isProofConfirmed) {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents });
    }
  }, [isProofConfirmed, queryClient]);

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

  const handleSubmitProof = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractAddress) return;
    let amountBig: bigint;
    let scoreBig: bigint;
    try {
      amountBig = BigInt(proofForm.amount);
      scoreBig = BigInt(proofForm.score);
    } catch {
      return;
    }
    resetProof();
    writeProof({
      address: contractAddress,
      abi: ARZYG_AGENT_ABI,
      functionName: "submitProof",
      args: [proofForm.proof, amountBig, scoreBig],
    });
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
              <div className="flex items-center gap-3 bg-card border border-border px-4 py-2 rounded-lg">
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
              <div className="flex gap-2">
                {connectors.map((connector) => (
                  <Button
                    key={connector.uid}
                    onClick={() => connect({ connector })}
                    data-testid={`btn-connect-${connector.id}`}
                  >
                    Connect {connector.name}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>

        <Tabs defaultValue="agents" className="w-full space-y-6">
          <TabsList className="bg-card border border-border w-full justify-start h-auto p-1 overflow-x-auto flex-nowrap shrink-0">
            <TabsTrigger value="agents" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary" data-testid="tab-agents">
              <Database className="w-4 h-4 mr-2" /> Registered Agents
            </TabsTrigger>
            <TabsTrigger value="register" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary" data-testid="tab-register">
              <Key className="w-4 h-4 mr-2" /> Register Agent
            </TabsTrigger>
            <TabsTrigger value="proof" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary" data-testid="tab-proof">
              <Activity className="w-4 h-4 mr-2" /> Submit Proof
            </TabsTrigger>
            <TabsTrigger value="analytics" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary" data-testid="tab-analytics">
              <BarChart className="w-4 h-4 mr-2" /> PoU Analytics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="agents" className="space-y-4">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle>Active Agents ({agents.length})</CardTitle>
                <CardDescription>Live index of all agents registered in the ARZY-G economy.</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingAgents ? (
                  <div className="space-y-2">
                    <div className="h-12 bg-muted/20 animate-pulse rounded" />
                    <div className="h-12 bg-muted/20 animate-pulse rounded" />
                    <div className="h-12 bg-muted/20 animate-pulse rounded" />
                  </div>
                ) : agents.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-border rounded-lg bg-background/50">
                    <Database className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                    <h3 className="text-lg font-medium text-foreground mb-1">No agents found</h3>
                    <p className="text-sm text-muted-foreground mb-4">There are currently no agents registered on the network.</p>
                    <Button variant="outline" onClick={() => document.querySelector<HTMLButtonElement>('[data-testid="tab-register"]')?.click()} data-testid="btn-empty-register">
                      Register the first agent
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-md border border-border overflow-hidden">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-muted-foreground uppercase bg-muted/30 border-b border-border">
                        <tr>
                          <th className="px-4 py-3 font-mono">Address</th>
                          <th className="px-4 py-3">Name</th>
                          <th className="px-4 py-3 text-right">Tasks</th>
                          <th className="px-4 py-3 text-right font-mono text-primary">Earned</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {agents.map((agent, i) => (
                          <tr key={agent.address} className="bg-card hover:bg-muted/10 transition-colors" data-testid={`agent-row-${i}`}>
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
            <Card className="border-border bg-card max-w-2xl mx-auto">
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
            <Card className="border-border bg-card max-w-2xl mx-auto">
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
                      <AlertTitle>Signed by your wallet</AlertTitle>
                      <AlertDescription className="text-xs">
                        Proofs are always credited to the connected address (<span className="font-mono">{address?.slice(0, 6)}...{address?.slice(-4)}</span>), which must already be a registered agent. Your wallet will prompt you to approve the transaction.
                      </AlertDescription>
                    </Alert>

                    <form onSubmit={handleSubmitProof} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="proof-data">Cryptographic Proof / Payload</Label>
                        <Input
                          id="proof-data"
                          placeholder="IPFS hash, job ID, or raw payload"
                          value={proofForm.proof}
                          onChange={e => setProofForm({...proofForm, proof: e.target.value})}
                          required
                          data-testid="input-proof-data"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="proof-amount">Base Amount (Wei)</Label>
                          <Input
                            id="proof-amount"
                            placeholder="1000000000000000000"
                            value={proofForm.amount}
                            onChange={e => setProofForm({...proofForm, amount: e.target.value})}
                            required
                            data-testid="input-proof-amount"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="proof-score">Quality Score (1-10)</Label>
                          <Input
                            id="proof-score"
                            type="number"
                            min="1"
                            max="10"
                            value={proofForm.score}
                            onChange={e => setProofForm({...proofForm, score: e.target.value})}
                            required
                            data-testid="input-proof-score"
                          />
                        </div>
                      </div>

                      {proofError && (
                        <div className="text-sm text-red-500 bg-red-500/10 p-3 rounded" data-testid="alert-proof-error">
                          Error: {proofError.message}
                        </div>
                      )}

                      {isProofConfirmed && (
                        <div className="text-sm text-primary bg-primary/10 p-3 rounded break-all" data-testid="alert-proof-success">
                          Success! TxHash: {proofHash} <br/>
                          {proofOutcome ? (
                            proofOutcome.accepted ? (
                              <>Accepted: Yes <br/> Reward: {proofOutcome.reward.toString()} Wei</>
                            ) : (
                              <>Accepted: No <br/> Reason: {proofOutcome.reason}</>
                            )
                          ) : (
                            "Transaction confirmed."
                          )}
                        </div>
                      )}

                      <Button
                        type="submit"
                        className="w-full"
                        disabled={isProofSigning || isProofConfirming || !contractAddress}
                        data-testid="btn-submit-proof"
                      >
                        {isProofSigning ? "Confirm in wallet..." : isProofConfirming ? "Submitting..." : "Submit Proof"}
                      </Button>
                    </form>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics">
            <Card className="border-border bg-card">
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
                      <BarChart data={agents.map(a => ({ name: a.name, earned: parseFloat(a.totalEarned) }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                        <XAxis dataKey="name" stroke="#888" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => val.toLocaleString()} />
                        <Tooltip
                          cursor={{fill: 'rgba(255,255,255,0.05)'}}
                          contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px' }}
                          itemStyle={{ color: '#00FF88' }}
                        />
                        <Bar dataKey="earned" fill="#00FF88" radius={[4, 4, 0, 0]} />
                      </BarChart>
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
