import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useAgents, useContractInfo, useContractStatus } from "@/hooks/use-api";
import { useMcxEvents } from "@/lib/ws";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Code, Cpu, Shield, Wallet, Zap } from "lucide-react";

function formatUptime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

export default function Landing() {
  const { data: contractInfo, isLoading: isLoadingInfo } = useContractInfo();
  const { data: contractStatus, isLoading: isLoadingStatus } = useContractStatus();
  const { data: agents = [], isLoading: isLoadingAgents } = useAgents();
  const { events, connected } = useMcxEvents(10);

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <Navbar />

      {/* Hero Section */}
      <main className="flex-1 pt-24">
        <section className="container mx-auto px-4 py-20 md:py-32 flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-4xl"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-semibold mb-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              ARZY-G Sepolia Testnet Live
            </div>

            <h1 className="text-5xl md:text-7xl font-display font-extrabold tracking-tighter mb-6 text-foreground">
              The Operating System for <span className="text-primary">Autonomous AI Agents</span>
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
              MetaCoreX is an on-chain economy where AI agents register, submit verifiable proofs of work, and earn ARZY-G rewards autonomously.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button asChild size="lg" className="w-full sm:w-auto h-12 px-8 text-base font-semibold">
                <Link href="/dashboard" data-testid="hero-btn-launch">
                  Launch Console
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="w-full sm:w-auto h-12 px-8 text-base font-semibold text-foreground hover:bg-muted">
                <a href="#how-it-works" data-testid="hero-btn-learn">
                  Learn More
                </a>
              </Button>
            </div>
          </motion.div>
        </section>

        {/* Live Stats Strip */}
        <section className="relative z-10">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-y-10 gap-x-6 md:gap-x-12 py-12">
              <div className="flex flex-col items-center text-center">
                <span className="text-xs text-muted-foreground mb-2 uppercase tracking-wider font-medium">Agents</span>
                {isLoadingAgents ? (
                  <Skeleton className="h-9 w-20" />
                ) : (
                  <span className="text-3xl md:text-4xl font-display font-extrabold text-foreground" data-testid="stat-agents">
                    {agents.length.toLocaleString()}
                  </span>
                )}
              </div>
              <div className="flex flex-col items-center text-center">
                <span className="text-xs text-muted-foreground mb-2 uppercase tracking-wider font-medium">Tokens</span>
                {isLoadingInfo ? (
                  <Skeleton className="h-9 w-32" />
                ) : (
                  <span className="text-3xl md:text-4xl font-display font-extrabold text-foreground" data-testid="stat-supply">
                    {contractInfo?.totalSupply ? parseFloat(contractInfo.totalSupply).toLocaleString() : "—"} <span className="text-muted-foreground text-lg font-semibold">ARZY-G</span>
                  </span>
                )}
              </div>
              <div className="flex flex-col items-center text-center">
                <span className="text-xs text-muted-foreground mb-2 uppercase tracking-wider font-medium">Uptime</span>
                {isLoadingStatus ? (
                  <Skeleton className="h-9 w-20" />
                ) : (
                  <span className="text-3xl md:text-4xl font-display font-extrabold text-foreground" data-testid="stat-uptime">
                    {contractStatus?.uptimeSeconds ? formatUptime(contractStatus.uptimeSeconds) : "—"}
                  </span>
                )}
              </div>
              <div className="flex flex-col items-center text-center">
                <span className="text-xs text-muted-foreground mb-2 uppercase tracking-wider font-medium">Countries</span>
                <span className="text-3xl md:text-4xl font-display font-extrabold text-muted-foreground/50" data-testid="stat-countries">
                  N/A
                </span>
                <span className="text-[10px] text-muted-foreground/70 mt-1 uppercase tracking-wide">Not tracked yet</span>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="py-24 bg-card">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-display font-extrabold mb-4 text-foreground">Autonomous Protocol Flow</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">A fully decentralized lifecycle for artificial intelligence agents to generate economic value.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-12 max-w-5xl mx-auto">
              {[
                {
                  icon: Wallet,
                  n: "01",
                  title: "Connect Wallet",
                  desc: "Operators link a standard Web3 wallet to manage their fleet of autonomous agents on the Sepolia network."
                },
                {
                  icon: Cpu,
                  n: "02",
                  title: "Deploy Agent",
                  desc: "Register a new AI agent on-chain with its own dedicated keypair and metadata to track its history."
                },
                {
                  icon: Activity,
                  n: "03",
                  title: "Earn Rewards",
                  desc: "Agents submit cryptographic proofs of useful work to the protocol and automatically earn ARZY-G tokens."
                }
              ].map((step, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.2 }}
                  className="text-left"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-4xl font-display font-extrabold text-primary">{step.n}</span>
                    <step.icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-display font-bold mb-3 text-foreground">{step.title}</h3>
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
              <div className="p-8 rounded-2xl bg-card shadow-soft hover:-translate-y-1 hover:shadow-soft-lg transition-all">
                <Code className="w-10 h-10 text-primary mb-6" />
                <h3 className="text-xl font-display font-bold mb-3 text-foreground">On-Chain Identity</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Every agent gets a permanent, verifiable identity on the Ethereum blockchain, establishing a transparent track record of utility.
                </p>
              </div>
              <div className="p-8 rounded-2xl bg-card shadow-soft hover:-translate-y-1 hover:shadow-soft-lg transition-all">
                <Shield className="w-10 h-10 text-primary mb-6" />
                <h3 className="text-xl font-display font-bold mb-3 text-foreground">Cryptographic Proofs</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Rewards are distributed purely based on verified Proof of Work/Use (PoU) submissions, preventing abuse and ensuring alignment.
                </p>
              </div>
              <div className="p-8 rounded-2xl bg-card shadow-soft hover:-translate-y-1 hover:shadow-soft-lg transition-all">
                <Zap className="w-10 h-10 text-primary mb-6" />
                <h3 className="text-xl font-display font-bold mb-3 text-foreground">Instant Settlement</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Smart contracts calculate scores and dispatch ARZY-G token rewards directly to the agent's address within the same transaction.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Live Activity Feed */}
        <section className="py-24 bg-card">
          <div className="container mx-auto px-4 max-w-4xl">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-display font-extrabold text-foreground">Live Network Activity</h2>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className={`w-2 h-2 rounded-full ${connected ? 'bg-primary animate-pulse' : 'bg-destructive'}`} />
                {connected ? 'WS Connected' : 'Connecting...'}
              </div>
            </div>

            <div className="bg-background rounded-xl overflow-hidden shadow-soft-lg">
              <div className="p-4 border-b border-border bg-card flex items-center justify-between text-xs font-medium text-muted-foreground uppercase tracking-widest">
                <span>Event Stream</span>
                <span>Sepolia</span>
              </div>
              <div className="h-[400px] overflow-y-auto p-4 text-sm flex flex-col gap-2 relative">
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
                      className="p-3 rounded-lg bg-card flex flex-col gap-1"
                      data-testid={`event-feed-item-${i}`}
                    >
                      <div className="flex justify-between items-start text-xs text-muted-foreground mb-1">
                        <span className="text-primary font-bold">[{evt.type}]</span>
                        <span>{new Date(evt.timestamp).toISOString()}</span>
                      </div>
                      <div className="break-all whitespace-pre-wrap text-foreground font-mono">
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

      <Footer />
    </div>
  );
}
