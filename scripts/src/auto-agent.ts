import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

/**
 * MetaCoreX automatic agent.
 *
 * On first run it generates its own wallet identity (persisted locally so it
 * keeps the same on-chain address across restarts), funds it with a little
 * Sepolia ETH for gas (from DEPLOYER_PRIVATE_KEY, if available), and
 * registers itself on-chain. It then submits a proof-of-work every 10
 * minutes via the API server's /api/agents endpoints.
 *
 * Run: pnpm --filter @workspace/scripts run agent:auto
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IDENTITY_PATH = path.join(__dirname, "..", ".auto-agent-identity.json");

const API_BASE_URL = (process.env.API_BASE_URL ?? "http://localhost:80").replace(/\/$/, "");
const INTERVAL_MS = 10 * 60 * 1000;
const AGENT_NAME = process.env.AUTO_AGENT_NAME ?? "AutoAgent";
const AGENT_DESCRIPTION =
  process.env.AUTO_AGENT_DESCRIPTION ??
  "Автономный агент MetaCoreX — отправляет proof-of-work каждые 10 минут";
const FUNDING_ETH = process.env.AUTO_AGENT_FUNDING_ETH ?? "0.02";
const MIN_BALANCE_ETH = "0.005";

interface Identity {
  address: string;
  privateKey: string;
}

function loadOrCreateIdentity(): { identity: Identity; isNew: boolean } {
  if (existsSync(IDENTITY_PATH)) {
    const raw = JSON.parse(readFileSync(IDENTITY_PATH, "utf-8")) as Identity;
    return { identity: raw, isNew: false };
  }

  const wallet = ethers.Wallet.createRandom();
  const identity: Identity = { address: wallet.address, privateKey: wallet.privateKey };
  mkdirSync(path.dirname(IDENTITY_PATH), { recursive: true });
  writeFileSync(IDENTITY_PATH, JSON.stringify(identity, null, 2), { mode: 0o600 });
  return { identity, isNew: true };
}

async function fundIdentityIfNeeded(identity: Identity): Promise<void> {
  const rpcUrl = process.env.SEPOLIA_RPC_URL ?? process.env.ETH_RPC_URL;
  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;

  if (!rpcUrl || !deployerKey) {
    console.warn(
      `[auto-agent] SEPOLIA_RPC_URL / DEPLOYER_PRIVATE_KEY not set — skipping auto-funding. ` +
        `Make sure ${identity.address} holds Sepolia ETH for gas before proofs can be submitted.`,
    );
    return;
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const balance = await provider.getBalance(identity.address);
  const minBalance = ethers.parseEther(MIN_BALANCE_ETH);

  if (balance >= minBalance) {
    return;
  }

  console.log(`[auto-agent] Funding ${identity.address} with ${FUNDING_ETH} Sepolia ETH for gas...`);
  const deployer = new ethers.Wallet(deployerKey, provider);
  const tx = await deployer.sendTransaction({
    to: identity.address,
    value: ethers.parseEther(FUNDING_ETH),
  });
  await tx.wait();
  console.log(`[auto-agent] Funding tx confirmed: ${tx.hash}`);
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

async function ensureRegistered(identity: Identity): Promise<void> {
  const { status, json } = await apiGet<{ agent?: { isActive?: boolean } } & ApiEnvelope>(
    `/api/agents/${identity.address}`,
  );

  if (status === 200 && json.agent?.isActive) {
    console.log(`[auto-agent] Agent ${identity.address} is already registered on-chain.`);
    return;
  }

  console.log(`[auto-agent] Registering agent ${identity.address} on-chain...`);
  const result = await apiPost<{ txHash: string } & ApiEnvelope>("/api/agents/register", {
    name: AGENT_NAME,
    description: AGENT_DESCRIPTION,
    privateKey: identity.privateKey,
  });
  console.log(`[auto-agent] Registered! tx: ${result.txHash}`);
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomAmount(): number {
  // Random amount between 50 and 150 ARZY-G, rounded to 2 decimal places.
  return Math.round((50 + Math.random() * 100) * 100) / 100;
}

function formatTimestamp(): string {
  return new Date().toLocaleString("ru-RU", {
    timeZone: "UTC",
    dateStyle: "short",
    timeStyle: "medium",
  });
}

async function submitAutomaticProof(identity: Identity): Promise<void> {
  const proof = `Автоматическая работа ${formatTimestamp()} UTC`;
  const amount = randomAmount();
  const score = randomInt(5, 9);
  const amountWei = ethers.parseUnits(amount.toString(), 18).toString();

  console.log(
    `[auto-agent] Submitting proof: "${proof}" | amount=${amount} ARZY-G | score=${score}`,
  );

  try {
    const result = await apiPost<{ txHash: string; reward?: string } & ApiEnvelope>(
      "/api/agents/submit-proof",
      {
        proof,
        amount: amountWei,
        score,
        privateKey: identity.privateKey,
      },
    );
    const rewardArzyg = result.reward ? ethers.formatUnits(result.reward, 18) : "?";
    console.log(`[auto-agent] Proof accepted. tx=${result.txHash} reward=${rewardArzyg} ARZYG`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[auto-agent] Proof submission failed: ${message}`);
  }
}

async function main(): Promise<void> {
  console.log("[auto-agent] MetaCoreX automatic agent starting...");
  console.log(`[auto-agent] API base URL: ${API_BASE_URL}`);

  const { identity, isNew } = loadOrCreateIdentity();
  console.log(`[auto-agent] Identity: ${identity.address}${isNew ? " (new)" : ""}`);

  if (isNew) {
    await fundIdentityIfNeeded(identity);
  }

  await ensureRegistered(identity);

  const runLoop = async (): Promise<void> => {
    await submitAutomaticProof(identity);
    setTimeout(() => {
      runLoop().catch((err) => console.error("[auto-agent] Unexpected loop error:", err));
    }, INTERVAL_MS);
  };

  console.log(`[auto-agent] Entering loop — submitting a proof every ${INTERVAL_MS / 60000} minutes.`);
  await runLoop();
}

main().catch((err) => {
  console.error("[auto-agent] Fatal error:", err);
  process.exit(1);
});
