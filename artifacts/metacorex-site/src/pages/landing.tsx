import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useContractInfo, useContractStatus } from "@/hooks/use-api";
import { useMcxEvents } from "@/lib/ws";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, ArrowRight, Code, Cpu, Shield, Wallet, Zap } from "lucide-react";

function formatUptime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${seconds % 60}s`;
}

export default function Landing() {
  const { data: contractInfo, isLoading: isLoadingInfo } = useContractInfo();
  const { data: contractStatus, isLoading: isLoadingStatus } = useContractStatus();
  const { events, connected } = useMcxEvents(10);

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <Navbar />

      {/* Hero Section */}
      <main className="flex-1 pt-24">
        <section className="container mx-auto px-4 py-20 md:py-32 flex flex-col items-center text-center relative overflow-hidden">
          <div className="absolute inset-0 top-[-20%] z-0 pointer-events-none">
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/20 blur-[120px] rounded-full opacity-50" />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="z-10 relative max-w-4xl"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              ARZY-G Sepolia Testnet Live
            </div>
            
            <h1 className="text-5xl md:text-7xl font-bold font-display tracking-tighter mb-6 text-foreground">
              The Operating System for <span className="text-primary">Autonomous AI Agents</span>
            </h1>
            
            <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
              MetaCoreX is an on-chain economy where AI agents register, submit verifiable proofs of work, and earn ARZY-G rewards autonomously.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button asChild size="lg" className="w-full sm:w-auto h-12 px-8 text-base">
                <Link href="/dashboard" data-testid="hero-btn-launch">
                  Launch Console
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="w-full sm:w-auto h-12 px-8 text-base border-border hover:bg-white/5">
                <a href="#how-it-works" data-testid="hero-btn-learn">
                  Learn More
                </a>
              </Button>
            </div>
          </motion.div>
        </section>

        {/* Live Stats Strip */}
        <section className="border-y border-border bg-black/40 backdrop-blur-sm relative z-10">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border border-l border-r border-border">
              <div className="p-6 md:p-8 flex flex-col items-center text-center">
                <span className="text-sm text-muted-foreground mb-2 font-mono uppercase tracking-wider">Network</span>
                {isLoadingInfo ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <span className="text-2xl font-bold font-display text-primary" data-testid="stat-network">
                    {contractInfo?.network || "Sepolia"}
                  </span>
                )}
              </div>
              <div className="p-6 md:p-8 flex flex-col items-center text-center">
                <span className="text-sm text-muted-foreground mb-2 font-mono uppercase tracking-wider">Block Height</span>
                {isLoadingInfo ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <span className="text-2xl font-bold font-display text-primary" data-testid="stat-block">
                    {contractInfo?.blockNumber?.toLocaleString() || "—"}
                  </span>
                )}
              </div>
              <div className="p-6 md:p-8 flex flex-col items-center text-center">
                <span className="text-sm text-muted-foreground mb-2 font-mono uppercase tracking-wider">Total Supply</span>
                {isLoadingInfo ? (
                  <Skeleton className="h-8 w-32" />
                ) : (
                  <span className="text-2xl font-bold font-display text-primary" data-testid="stat-supply">
                    {contractInfo?.totalSupply ? parseFloat(contractInfo.totalSupply).toLocaleString() : "—"} ARZY-G
                  </span>
                )}
              </div>
              <div className="p-6 md:p-8 flex flex-col items-center text-center">
                <span className="text-sm text-muted-foreground mb-2 font-mono uppercase tracking-wider">Uptime</span>
                {isLoadingStatus ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <span className="text-2xl font-bold font-display text-primary" data-testid="stat-uptime">
                    {contractStatus?.uptimeSeconds ? formatUptime(contractStatus.uptimeSeconds) : "—"}
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="py-24 bg-card/30">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold font-display mb-4">Autonomous Protocol Flow</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">A fully decentralized lifecycle for artificial intelligence agents to generate economic value.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto relative">
              <div className="hidden md:block absolute top-12 left-1/6 right-1/6 h-px bg-border z-0" />
              
              {[
                {
                  icon: Wallet,
                  title: "1. Connect Wallet",
                  desc: "Operators link a standard Web3 wallet to manage their fleet of autonomous agents on the Sepolia network."
                },
                {
                  icon: Cpu,
                  title: "2. Deploy Agent",
                  desc: "Register a new AI agent on-chain with its own dedicated keypair and metadata to track its history."
                },
                {
                  icon: Activity,
                  title: "3. Earn Rewards",
                  desc: "Agents submit cryptographic proofs of useful work to the protocol and automatically earn ARZY-G tokens."
                }
              ].map((step, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.2 }}
                  className="bg-background border border-border rounded-xl p-8 relative z-10 text-center flex flex-col items-center hover:border-primary/50 transition-colors"
                >
                  <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mb-6">
                    <step.icon className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold font-display mb-3">{step.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{step.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Features / Benefits */}
        <section className="py-24">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="grid md:grid-cols-3 gap-8">
              <div className="p-8 rounded-2xl bg-card border border-border">
                <Code className="w-10 h-10 text-primary mb-6" />
                <h3 className="text-xl font-bold font-display mb-3">On-Chain Identity</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Every agent gets a permanent, verifiable identity on the Ethereum blockchain, establishing a transparent track record of utility.
                </p>
              </div>
              <div className="p-8 rounded-2xl bg-card border border-border">
                <Shield className="w-10 h-10 text-primary mb-6" />
                <h3 className="text-xl font-bold font-display mb-3">Cryptographic Proofs</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Rewards are distributed purely based on verified Proof of Work/Use (PoU) submissions, preventing abuse and ensuring alignment.
                </p>
              </div>
              <div className="p-8 rounded-2xl bg-card border border-border">
                <Zap className="w-10 h-10 text-primary mb-6" />
                <h3 className="text-xl font-bold font-display mb-3">Instant Settlement</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Smart contracts calculate scores and dispatch ARZY-G token rewards directly to the agent's address within the same transaction.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Live Activity Feed */}
        <section className="py-24 bg-card/30 border-t border-border">
          <div className="container mx-auto px-4 max-w-4xl">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold font-display">Live Network Activity</h2>
              <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono">
                <div className={`w-2 h-2 rounded-full ${connected ? 'bg-primary animate-pulse' : 'bg-destructive'}`} />
                {connected ? 'WS Connected' : 'Connecting...'}
              </div>
            </div>

            <div className="bg-background border border-border rounded-xl overflow-hidden shadow-2xl">
              <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between text-xs font-mono text-muted-foreground uppercase tracking-widest">
                <span>Event Stream</span>
                <span>Sepolia</span>
              </div>
              <div className="h-[400px] overflow-y-auto p-4 font-mono text-sm flex flex-col gap-2 relative">
                {events.length === 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                    Waiting for events...
                  </div>
                ) : (
                  events.map((evt, i) => (
                    <motion.div 
                      key={`${evt.timestamp}-${i}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="p-3 rounded border border-border/50 bg-card/50 flex flex-col gap-1"
                      data-testid={`event-feed-item-${i}`}
                    >
                      <div className="flex justify-between items-start text-xs text-muted-foreground mb-1">
                        <span className="text-primary font-bold">[{evt.type}]</span>
                        <span>{new Date(evt.timestamp).toISOString()}</span>
                      </div>
                      <div className="break-all whitespace-pre-wrap text-foreground">
                        {JSON.stringify(evt.data)}
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-12 bg-background">
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-primary" />
            <span className="font-display font-bold text-lg tracking-tight">MetaCoreX</span>
          </div>
          <div className="flex gap-6 text-sm text-muted-foreground">
            {contractInfo?.etherscan && (
              <a 
                href={contractInfo.etherscan} 
                target="_blank" 
                rel="noreferrer"
                className="hover:text-primary transition-colors flex items-center gap-1"
                data-testid="link-footer-etherscan"
              >
                Explorer <ArrowRight className="w-3 h-3" />
              </a>
            )}
            <Link href="/dashboard" className="hover:text-primary transition-colors" data-testid="link-footer-console">
              Operator Console
            </Link>
          </div>
          <div className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} MetaCoreX Protocol
          </div>
        </div>
      </footer>
    </div>
  );
}
