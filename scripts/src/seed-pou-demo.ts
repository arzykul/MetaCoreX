import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

/**
 * Seeds the PoU (Proof of Usefulness) analytics system with 5 demo agents and
 * 25 proofs (5 each) on Sepolia, via the API server's /api/agents endpoints.
 *
 * Reuses the same "local identity file" pattern as auto-agent.ts: each
 * agent's wallet is generated once and persisted so re-running the script is
 * idempotent (already-registered agents / already-generated wallets are
 * reused, not recreated).
 *
 * Run: pnpm --filter @workspace/scripts run seed:pou
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IDENTITY_PATH = path.join(__dirname, "..", ".pou-seed-identities.json");

const API_BASE_URL = (process.env.API_BASE_URL ?? "http://localhost:80").replace(/\/$/, "");

// Sepolia gas is cheap (~1-2 gwei) but the deployer wallet here has a small
// balance, so we top up agent wallets just-in-time (before each tx) instead
// of pre-funding a large buffer per agent.
const MIN_TX_BUFFER_ETH = "0.0004";
const TOPUP_ETH = "0.0007";
const DEPLOYER_RESERVE_ETH = "0.0002";

interface ProofSpec {
  proof: string;
  amount: number;
  score: number;
}

interface AgentSpec {
  key: string;
  name: string;
  description: string;
  proofs: ProofSpec[];
}

const AGENTS: AgentSpec[] = [
  {
    key: "AlphaBot",
    name: "AlphaBot",
    description: "High-performance data analysis agent",
    proofs: [
      { proof: "Analyzed ETH/USD price trends over 24h", amount: 100, score: 8 },
      { proof: "Generated market volatility report", amount: 80, score: 9 },
      { proof: "Identified 3 trading opportunities", amount: 120, score: 7 },
      { proof: "Analyzed BTC/ETH correlation", amount: 90, score: 8 },
      { proof: "Predicted short-term price movement", amount: 110, score: 9 },
    ],
  },
  {
    key: "BetaTrader",
    name: "BetaTrader",
    description: "Crypto market monitoring and analysis",
    proofs: [
      { proof: "Monitored 10 major crypto pairs", amount: 80, score: 7 },
      { proof: "Detected unusual trading volume", amount: 100, score: 8 },
      { proof: "Tracked whale transactions", amount: 90, score: 6 },
      { proof: "Analyzed market sentiment", amount: 110, score: 9 },
      { proof: "Generated trading signals", amount: 120, score: 8 },
    ],
  },
  {
    key: "GammaAuditor",
    name: "GammaAuditor",
    description: "Smart contract security auditor",
    proofs: [
      { proof: "Audited ERC-20 token contract", amount: 150, score: 9 },
      { proof: "Found 2 critical vulnerabilities", amount: 200, score: 8 },
      { proof: "Reviewed upgradeable contract", amount: 180, score: 7 },
      { proof: "Verified access control", amount: 130, score: 9 },
      { proof: "Audited proxy pattern", amount: 160, score: 8 },
    ],
  },
  {
    key: "DeltaMonitor",
    name: "DeltaMonitor",
    description: "Network activity and gas tracking",
    proofs: [
      { proof: "Tracked gas prices for 24h", amount: 60, score: 7 },
      { proof: "Monitored network congestion", amount: 70, score: 8 },
      { proof: "Analyzed block propagation", amount: 80, score: 6 },
      { proof: "Tracked mempool activity", amount: 90, score: 8 },
      { proof: "Reported network health", amount: 100, score: 9 },
    ],
  },
  {
    key: "EpsilonReporter",
    name: "EpsilonReporter",
    description: "Automated report generation",
    proofs: [
      { proof: "Generated daily activity summary", amount: 50, score: 8 },
      { proof: "Created weekly performance report", amount: 70, score: 9 },
      { proof: "Compiled agent statistics", amount: 60, score: 7 },
      { proof: "Produced network dashboard", amount: 80, score: 8 },
      { proof: "Summarized PoU metrics", amount: 90, score: 9 },
    ],
  },
];

interface Identity {
  address: string;
  privateKey: string;
  submittedProofs?: string[];
}

type IdentityMap = Record<string, Identity>;

function loadIdentities(): IdentityMap {
  if (existsSync(IDENTITY_PATH)) {
    return JSON.parse(readFileSync(IDENTITY_PATH, "utf-8")) as IdentityMap;
  }
  return {};
}

function saveIdentities(map: IdentityMap): void {
  writeFileSync(IDENTITY_PATH, JSON.stringify(map, null, 2), { mode: 0o600 });
}

function getOrCreateIdentity(map: IdentityMap, key: string): Identity {
  const existing = map[key];
  if (existing) {
    existing.submittedProofs ??= [];
    return existing;
  }
  const wallet = ethers.Wallet.createRandom();
  const identity: Identity = { address: wallet.address, privateKey: wallet.privateKey, submittedProofs: [] };
  map[key] = identity;
  saveIdentities(map);
  return identity;
}

async function ensureFunded(
  provider: ethers.JsonRpcProvider,
  deployer: ethers.Wallet,
  address: string,
): Promise<void> {
  const balance = await provider.getBalance(address);
  const min = ethers.parseEther(MIN_TX_BUFFER_ETH);
  if (balance >= min) return;

  const topup = ethers.parseEther(TOPUP_ETH);
  const reserve = ethers.parseEther(DEPLOYER_RESERVE_ETH);
  const deployerBalance = await provider.getBalance(deployer.address);

  if (deployerBalance < topup + reserve) {
    throw new Error(
      `Deployer wallet ${deployer.address} is too low on Sepolia ETH ` +
        `(${ethers.formatEther(deployerBalance)} ETH) to fund agent ${address}. ` +
        `Top up the deployer wallet with more Sepolia testnet ETH and re-run this script — ` +
        `already-registered agents and already-submitted proofs will be skipped/retried safely.`,
    );
  }

  console.log(`[seed] Topping up ${address} with ${TOPUP_ETH} ETH...`);
  const tx = await deployer.sendTransaction({ to: address, value: topup });
  await tx.wait();
  console.log(`[seed] Funded. tx: ${tx.hash}`);
}

interface ApiEnvelope {
  ok?: boolean;
  error?: string;
}

async function apiPost<T extends ApiEnvelope>(urlPath: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${urlPath}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as T;
  if (!res.ok || json.ok === false) {
    throw new Error(json.error ?? `Request to ${urlPath} failed with status ${res.status}`);
  }
  return json;
}

async function apiGet<T extends ApiEnvelope>(
  urlPath: string,
): Promise<{ status: number; json: T }> {
  const res = await fetch(`${API_BASE_URL}${urlPath}`);
  const json = (await res.json()) as T;
  return { status: res.status, json };
}

async function ensureRegistered(
  identity: Identity,
  name: string,
  description: string,
): Promise<void> {
  const { status, json } = await apiGet<{ agent?: { isActive?: boolean } } & ApiEnvelope>(
    `/api/agents/${identity.address}`,
  );

  if (status === 200 && json.agent?.isActive) {
    console.log(`[seed] ${name} (${identity.address}) already registered — skipping.`);
    return;
  }

  console.log(`[seed] Registering ${name} (${identity.address})...`);
  const result = await apiPost<{ txHash: string } & ApiEnvelope>("/api/agents/register", {
    name,
    description,
    privateKey: identity.privateKey,
  });
  console.log(`[seed] Registered ${name}. tx: ${result.txHash}`);
}

interface SubmitOutcome {
  txHash: string;
  reward: number;
}

async function submitProof(identity: Identity, spec: ProofSpec): Promise<SubmitOutcome> {
  const amountWei = ethers.parseUnits(spec.amount.toString(), 18).toString();
  const result = await apiPost<
    { txHash: string; reward?: string; accepted?: boolean } & ApiEnvelope
  >("/api/agents/submit-proof", {
    proof: spec.proof,
    amount: amountWei,
    score: spec.score,
    privateKey: identity.privateKey,
  });
  const reward = result.reward ? Number(ethers.formatUnits(result.reward, 18)) : 0;
  return { txHash: result.txHash, reward };
}

interface AgentSummary {
  name: string;
  address: string;
  proofsSubmitted: number;
  proofsFailed: number;
  totalReward: number;
}

async function main(): Promise<void> {
  const rpcUrl = process.env.SEPOLIA_RPC_URL ?? process.env.ETH_RPC_URL;
  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!rpcUrl || !deployerKey) {
    throw new Error("SEPOLIA_RPC_URL and DEPLOYER_PRIVATE_KEY must both be set to seed PoU data.");
  }

  console.log("[seed] MetaCoreX PoU demo-data seeding starting...");
  console.log(`[seed] API base URL: ${API_BASE_URL}`);

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const deployer = new ethers.Wallet(deployerKey, provider);
  const deployerBalance = await provider.getBalance(deployer.address);
  console.log(
    `[seed] Deployer ${deployer.address} balance: ${ethers.formatEther(deployerBalance)} ETH`,
  );

  const identities = loadIdentities();
  const summary: AgentSummary[] = [];

  for (const agent of AGENTS) {
    const identity = getOrCreateIdentity(identities, agent.key);
    console.log(`\n=== ${agent.name} (${identity.address}) ===`);

    await ensureFunded(provider, deployer, identity.address);
    await ensureRegistered(identity, agent.name, agent.description);

    let proofsSubmitted = 0;
    let proofsFailed = 0;
    let totalReward = 0;

    for (const proofSpec of agent.proofs) {
      if (identity.submittedProofs?.includes(proofSpec.proof)) {
        console.log(`[seed]   Already submitted — skipping: "${proofSpec.proof}"`);
        proofsSubmitted += 1;
        continue;
      }

      try {
        await ensureFunded(provider, deployer, identity.address);
        console.log(
          `[seed]   Submitting: "${proofSpec.proof}" amount=${proofSpec.amount} score=${proofSpec.score}...`,
        );
        const { txHash, reward } = await submitProof(identity, proofSpec);
        totalReward += reward;
        proofsSubmitted += 1;
        identity.submittedProofs = [...(identity.submittedProofs ?? []), proofSpec.proof];
        saveIdentities(identities);
        console.log(`[seed]   OK — reward=${reward} ARZYG tx=${txHash}`);
      } catch (err) {
        proofsFailed += 1;
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[seed]   FAILED — ${message}`);
      }
    }

    summary.push({
      name: agent.name,
      address: identity.address,
      proofsSubmitted,
      proofsFailed,
      totalReward,
    });
  }

  console.log("\n=== Seeding Summary ===");
  for (const s of summary) {
    console.log(
      `${s.name.padEnd(16)} ${s.address}  proofs=${s.proofsSubmitted}/5` +
        (s.proofsFailed > 0 ? ` (${s.proofsFailed} failed)` : "") +
        `  totalReward=${s.totalReward.toFixed(2)} ARZYG`,
    );
  }

  const totalProofs = summary.reduce((acc, s) => acc + s.proofsSubmitted, 0);
  const totalFailed = summary.reduce((acc, s) => acc + s.proofsFailed, 0);
  console.log(`\n[seed] Done — ${totalProofs} proofs submitted, ${totalFailed} failed.`);
}

main().catch((err) => {
  console.error("[seed] Fatal error:", err);
  process.exit(1);
});
