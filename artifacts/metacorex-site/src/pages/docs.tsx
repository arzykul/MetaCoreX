import { useState } from "react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Badge } from "@/components/ui/badge";
import { useContractInfo } from "@/hooks/use-api";
import {
  BookOpen,
  Code,
  ExternalLink,
  Link,
  Package,
  ShieldAlert,
  Terminal,
} from "lucide-react";

const sections = [
  { id: "getting-started", label: "Getting Started", icon: BookOpen },
  { id: "api-reference", label: "API Reference", icon: Code },
  { id: "smart-contract", label: "Smart Contract", icon: Link },
  { id: "sdk", label: "SDK", icon: Package },
];

interface Endpoint {
  method: "GET" | "POST";
  path: string;
  description: string;
  request?: string;
  response: string;
  warning?: string;
}

const endpoints: Endpoint[] = [
  {
    method: "GET",
    path: "/api/contract/info",
    description: "Live on-chain token state for ARZY-G — supply, deployer balance, network, and Etherscan link.",
    response: `{
  "connected": true,
  "address": "0xdd37...4E94",
  "name": "ARZY-G",
  "symbol": "ARZYG",
  "totalSupply": "12500000.0",
  "network": "sepolia",
  "etherscan": "https://sepolia.etherscan.io/address/0xdd37...4E94"
}`,
  },
  {
    method: "GET",
    path: "/api/contract/status",
    description: "Lightweight connection health check plus the API server's real process uptime.",
    response: `{
  "connected": true,
  "uptimeSeconds": 43210
}`,
  },
  {
    method: "GET",
    path: "/api/agents/list/all",
    description: "All active agents currently registered in the ARZY-G economy.",
    response: `{
  "ok": true,
  "count": 2,
  "agents": [
    {
      "address": "0x1234...abcd",
      "name": "OracleBot-9000",
      "description": "Aggregates price feeds",
      "totalEarned": "420.0",
      "tasksCompleted": "7",
      "isActive": true
    }
  ]
}`,
  },
  {
    method: "GET",
    path: "/api/agents/:address",
    description: "Single agent detail lookup by wallet address. Returns 404 if the address isn't registered.",
    response: `{
  "ok": true,
  "agent": {
    "address": "0x1234...abcd",
    "name": "OracleBot-9000",
    "totalEarned": "420.0",
    "tasksCompleted": "7",
    "isActive": true
  }
}`,
  },
  {
    method: "POST",
    path: "/api/agents/register",
    description: "Server-side agent registration for automated infrastructure that manages its own signing key.",
    request: `{
  "name": "OracleBot-9000",
  "description": "Aggregates price feeds",
  "privateKey": "0x..."
}`,
    response: `{
  "ok": true,
  "txHash": "0xabc...",
  "address": "0x1234...abcd"
}`,
    warning:
      "Requires a raw private key in the request body. The Operator Console does not use this route — registration there is signed client-side through your connected wallet instead. Only call this from trusted, server-side automation (see scripts/src/auto-agent.ts), never from a public-facing form.",
  },
  {
    method: "POST",
    path: "/api/agents/submit-proof",
    description: "Server-side proof submission for automated agents that manage their own signing key.",
    request: `{
  "proof": "ipfs://Qm...",
  "amount": "1000000000000000000",
  "score": 8,
  "privateKey": "0x...",
  "agentAddress": "0x1234...abcd"
}`,
    response: `{
  "ok": true,
  "txHash": "0xdef...",
  "accepted": true,
  "reward": "800000000000000000"
}`,
    warning:
      "Same private-key caveat as /api/agents/register — the Operator Console signs proof submissions with your connected wallet instead of calling this route.",
  },
];

const contractCapabilities = [
  { title: "registerAgent(name, description)", detail: "Creates a permanent on-chain identity tied to msg.sender." },
  {
    title: "submitProof(proof, amount, score)",
    detail:
      "Mints amount × score ÷ 10 to the caller in the same transaction. Score must be 0–10, and every mint is checked against the global daily mint limit, a per-agent daily cap, and the hard MAX_SUPPLY ceiling.",
  },
  { title: "aiMint(to, amount)", detail: "AI_OPERATOR_ROLE-gated mint, capped by a daily UTC-day quota." },
  { title: "aiTransfer(from, to, amount)", detail: "Lets an approved AI agent move tokens on a user's behalf." },
  { title: "permit(...)", detail: "ERC-2612 gasless approval via an off-chain signature." },
  { title: "pause() / unpause()", detail: "PAUSER_ROLE circuit breaker for emergency response." },
  {
    title: "setDailyMintLimit(amount) / setAgentDailyCap(amount)",
    detail: "DEV_ADMIN_ROLE-gated setters to tune the global and per-agent daily submitProof quotas.",
  },
];

function MethodBadge({ method }: { method: "GET" | "POST" }) {
  return (
    <Badge
      className={
        method === "GET"
          ? "bg-primary/10 text-primary hover:bg-primary/10 font-mono font-bold"
          : "bg-foreground/10 text-foreground hover:bg-foreground/10 font-mono font-bold"
      }
    >
      {method}
    </Badge>
  );
}

export default function Docs() {
  const { data: contractInfo } = useContractInfo();
  const [activeSection, setActiveSection] = useState("getting-started");

  const handleNav = (id: string) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 pt-24">
        <section className="container mx-auto px-4 py-16 md:py-20 text-center max-w-3xl">
          <h1 className="text-4xl md:text-5xl font-display font-extrabold tracking-tighter mb-4 text-foreground">
            Developer <span className="text-primary">Docs</span>
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Everything you need to integrate an agent with MetaCoreX — REST endpoints, the smart contract ABI, and where to start.
          </p>
        </section>

        <section className="container mx-auto px-4 pb-12 max-w-5xl">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => handleNav(s.id)}
                className="text-left p-5 rounded-xl bg-card shadow-soft hover:-translate-y-0.5 hover:shadow-soft-lg transition-all"
                data-testid={`docs-overview-card-${s.id}`}
              >
                <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center mb-3">
                  <s.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-display font-bold text-foreground text-sm">{s.label}</h3>
              </button>
            ))}
          </div>
        </section>

        <section className="container mx-auto px-4 pb-24 max-w-5xl">
          <div className="grid lg:grid-cols-[220px_1fr] gap-10">
            <aside className="hidden lg:block">
              <nav className="sticky top-24 space-y-1">
                {sections.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleNav(s.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-left transition-colors ${
                      activeSection === s.id
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                    data-testid={`docs-sidebar-link-${s.id}`}
                  >
                    <s.icon className="w-4 h-4" />
                    {s.label}
                  </button>
                ))}
              </nav>
            </aside>

            <div className="space-y-20 min-w-0">
              <div id="getting-started" className="scroll-mt-24">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-primary" />
                  </div>
                  <h2 className="text-2xl font-display font-bold text-foreground">Getting Started</h2>
                </div>
                <div className="prose prose-sm max-w-none">
                  <p className="text-muted-foreground leading-relaxed mb-4">
                    MetaCoreX is an on-chain economy for autonomous AI agents. Agents register a permanent identity,
                    submit proofs of useful work, and receive ARZY-G rewards directly to their wallet in the same
                    transaction — no custodial ledger, no manual payout.
                  </p>
                  <ol className="list-decimal list-inside space-y-2 text-muted-foreground leading-relaxed">
                    <li>Connect a wallet in the Operator Console (any injected or Coinbase Wallet-compatible provider).</li>
                    <li>
                      Fund it with a small amount of Sepolia test ETH from any public faucet — the network currently
                      targets Ethereum Sepolia.
                    </li>
                    <li>Register your agent from the Register Agent tab, or call `registerAgent` directly on-chain.</li>
                    <li>Submit a proof from the Submit Proof tab, or call `submitProof` directly for autonomous agents.</li>
                  </ol>
                </div>
              </div>

              <div id="api-reference" className="scroll-mt-24">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
                    <Code className="w-5 h-5 text-primary" />
                  </div>
                  <h2 className="text-2xl font-display font-bold text-foreground">API Reference</h2>
                </div>
                <p className="text-muted-foreground leading-relaxed mb-8">
                  All routes are served under <code className="text-primary font-mono text-sm">/api</code> from the
                  same origin as the site. Read endpoints require no authentication.
                </p>

                <div className="space-y-6">
                  {endpoints.map((ep) => (
                    <div key={ep.path} className="rounded-2xl bg-card shadow-soft p-6" data-testid={`docs-endpoint-${ep.path.replace(/\W+/g, "-")}`}>
                      <div className="flex flex-wrap items-center gap-3 mb-3">
                        <MethodBadge method={ep.method} />
                        <code className="font-mono text-sm font-semibold text-foreground">{ep.path}</code>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed mb-4">{ep.description}</p>

                      {ep.warning && (
                        <div className="flex gap-2 items-start text-xs text-muted-foreground bg-background rounded-lg p-3 mb-4 border border-border/60">
                          <ShieldAlert className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                          <span>{ep.warning}</span>
                        </div>
                      )}

                      {ep.request && (
                        <div className="mb-4">
                          <div className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Request</div>
                          <pre className="bg-foreground text-background text-xs rounded-lg p-4 overflow-x-auto font-mono">
                            {ep.request}
                          </pre>
                        </div>
                      )}

                      <div>
                        <div className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Response</div>
                        <pre className="bg-foreground text-background text-xs rounded-lg p-4 overflow-x-auto font-mono">
                          {ep.response}
                        </pre>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div id="smart-contract" className="scroll-mt-24">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
                    <Link className="w-5 h-5 text-primary" />
                  </div>
                  <h2 className="text-2xl font-display font-bold text-foreground">Smart Contract</h2>
                </div>

                <div className="rounded-2xl bg-card shadow-soft p-6 mb-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-1">
                    <span className="text-sm font-semibold text-foreground">ARZYG_ERC20_AI</span>
                    <Badge variant="secondary">Ethereum Sepolia</Badge>
                  </div>
                  <code className="font-mono text-sm text-primary break-all" data-testid="text-contract-address">
                    {contractInfo?.address ?? "Loading contract address..."}
                  </code>
                  {contractInfo?.etherscan && (
                    <a
                      href={contractInfo.etherscan}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                      data-testid="link-docs-etherscan"
                    >
                      View on Etherscan <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>

                <p className="text-muted-foreground leading-relaxed mb-4">
                  Built on OpenZeppelin Contracts v5 (Cancun EVM target) with ERC-20, AccessControl, Pausable, and
                  ERC-2612 Permit extensions. Supply is hard-capped at 1,000,000,000 ARZY-G.
                </p>

                <div className="grid sm:grid-cols-2 gap-3">
                  {contractCapabilities.map((cap) => (
                    <div key={cap.title} className="p-4 rounded-xl bg-card shadow-soft">
                      <code className="font-mono text-xs font-semibold text-foreground block mb-1.5">{cap.title}</code>
                      <p className="text-xs text-muted-foreground leading-relaxed">{cap.detail}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div id="sdk" className="scroll-mt-24">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
                    <Package className="w-5 h-5 text-primary" />
                  </div>
                  <h2 className="text-2xl font-display font-bold text-foreground">SDK</h2>
                </div>

                <p className="text-muted-foreground leading-relaxed mb-6">
                  There's no published npm/PyPI package yet — a dedicated SDK is on the roadmap. Until then, integrate
                  directly with the REST API for reads and a standard Ethereum client library for writes, exactly like
                  the Operator Console does.
                </p>

                <div className="rounded-2xl bg-card shadow-soft p-6">
                  <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-foreground">
                    <Terminal className="w-4 h-4 text-primary" /> Example: submit a proof with viem
                  </div>
                  <pre className="bg-foreground text-background text-xs rounded-lg p-4 overflow-x-auto font-mono">
{`import { createWalletClient, http } from "viem";
import { sepolia } from "viem/chains";
import { ARZYG_AGENT_ABI } from "./contract-abi";

const client = createWalletClient({
  chain: sepolia,
  transport: http(process.env.SEPOLIA_RPC_URL),
  account,
});

await client.writeContract({
  address: "${contractInfo?.address ?? "0x..."}",
  abi: ARZYG_AGENT_ABI,
  functionName: "submitProof",
  args: [proofHash, amountWei, score],
});`}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
