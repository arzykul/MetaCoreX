import { ethers } from "ethers";

/**
 * MetaCoreX public "bring your own agent" script.
 *
 * This is the reference implementation for THIRD-PARTY agents connecting to
 * MetaCoreX via their own GitHub Actions workflow (see .github/workflows/agent.yml).
 *
 * Design goal: your private key never leaves your own GitHub Actions runner.
 * This script signs `registerAgent` / `submitProof` directly on-chain with
 * your own wallet — it never sends your private key to the MetaCoreX API.
 * (The API's /api/agents/register and /api/agents/submit-proof routes are
 * internal-only for exactly this reason; see artifacts/api-server/src/routes/agent.ts.)
 *
 * The only calls this script makes to the MetaCoreX API are:
 *   - GET  /api/contract/info          (public — contract address/network)
 *   - GET  /api/agent-tasks/list       (public — the task marketplace)
 *   - POST /api/agent-tasks/assign/:id (agentAddress only, no key)
 *   - POST /api/agent-tasks/complete/:id (agentAddress + txHash, no key —
 *     the server verifies the transaction on-chain itself)
 *
 * Required env (set as GitHub Actions secrets in YOUR OWN repo):
 *   AGENT_PRIVATE_KEY  - your agent's wallet private key (never shared with us)
 *   SEPOLIA_RPC_URL    - an Ethereum Sepolia RPC endpoint (Alchemy/Infura/public)
 *   API_BASE_URL       - MetaCoreX API base URL (the published production URL,
 *                        e.g. https://your-metacorex-project.replit.app)
 * Optional env:
 *   AGENT_NAME         - display name used on first registration
 *   AGENT_DESCRIPTION  - description used on first registration
 *
 * Run: pnpm --filter @workspace/scripts run agent:github
 */

const API_BASE_URL = process.env.API_BASE_URL?.replace(/\/$/, "");
const RPC_URL = process.env.SEPOLIA_RPC_URL ?? process.env.ETH_RPC_URL;
const PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY;
const AGENT_NAME = process.env.AGENT_NAME ?? "External Agent";
const AGENT_DESCRIPTION = process.env.AGENT_DESCRIPTION ?? "Third-party agent connected via GitHub Actions";

// Minimal ABI — only what this script calls directly on-chain. Kept inline
// (rather than importing typechain-types) so this file can be copied into
// any repo without pulling in the rest of the MetaCoreX workspace.
const AGENT_ABI = [
  "function registerAgent(string name, string description) external",
  "function submitProof(string proof, uint256 amount, uint256 score) external",
  "function agents(address) view returns (string name, string description, uint256 registeredAt, uint256 totalEarned, uint256 tasksCompleted, bool isActive)",
  "function balanceOf(address) view returns (uint256)",
  "event AgentRegistered(address indexed agent, string name, string description, uint256 registeredAt)",
  "event ProofAccepted(address indexed agent, string proof, uint256 amount, uint256 score, uint256 reward)",
  "event ProofRejected(address indexed agent, string proof, string reason)",
];

interface ContractInfo {
  connected: boolean;
  address?: string;
  network?: string;
}

interface ApiEnvelope {
  ok?: boolean;
  error?: string;
}

interface AgentTask {
  id: string;
  title: string;
  description: string | null;
  reward: number;
  status: string;
}

function fail(message: string): never {
  console.error(`[github-agent] ERROR: ${message}`);
  process.exit(1);
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`);
  return (await res.json()) as T;
}

async function apiPost<T extends ApiEnvelope>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as T;
  if (!res.ok || json.ok === false) {
    throw new Error(json.error ?? `Request to ${path} failed with status ${res.status}`);
  }
  return json;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomAmount(): number {
  return Math.round((50 + Math.random() * 100) * 100) / 100;
}

async function main(): Promise<void> {
  if (!PRIVATE_KEY) fail("AGENT_PRIVATE_KEY is not set. Add it as a GitHub Actions secret in your own repo.");
  if (!RPC_URL) fail("SEPOLIA_RPC_URL is not set. Add it as a GitHub Actions secret in your own repo.");
  if (!API_BASE_URL) {
    fail(
      "API_BASE_URL is not set. Set it to the MetaCoreX production URL " +
        "(e.g. https://your-metacorex-project.replit.app) as a repo variable or secret.",
    );
  }

  console.log(`[github-agent] MetaCoreX API: ${API_BASE_URL}`);

  let info: ContractInfo;
  try {
    info = await apiGet<ContractInfo>("/api/contract/info");
  } catch (err) {
    fail(`Could not reach the MetaCoreX API at ${API_BASE_URL}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!info.connected || !info.address) {
    fail("MetaCoreX API reached, but it reports the blockchain is not connected. Try again later.");
  }
  console.log(`[github-agent] Contract: ${info.address} (${info.network})`);

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(info.address as string, AGENT_ABI, wallet);

  console.log(`[github-agent] Agent wallet: ${wallet.address}`);

  const balance = await provider.getBalance(wallet.address);
  if (balance === 0n) {
    fail(
      `${wallet.address} has 0 Sepolia ETH for gas. Fund it from a faucet before running this agent.`,
    );
  }

  // 1. Register on-chain if needed. registerAgent is fully permissionless —
  //    any wallet can call it directly, no permission from MetaCoreX required.
  const existing = await contract.agents(wallet.address);
  if (!existing.isActive) {
    console.log(`[github-agent] Registering ${wallet.address} on-chain...`);
    const tx = await contract.registerAgent(AGENT_NAME, AGENT_DESCRIPTION);
    const receipt = await tx.wait();
    console.log(`[github-agent] Registered. tx=${receipt?.hash ?? tx.hash}`);
  } else {
    console.log(`[github-agent] Already registered (tasksCompleted=${existing.tasksCompleted}).`);
  }

  // 2. Try to claim a task from the public marketplace (optional — falls
  //    back to ad hoc proof-of-work if none is available).
  let claimedTask: AgentTask | null = null;
  try {
    const list = await apiGet<{ ok: boolean; tasks: AgentTask[] }>(
      "/api/agent-tasks/list?status=pending&limit=1",
    );
    if (list.ok && list.tasks.length > 0) {
      const task = list.tasks[0]!;
      await apiPost(`/api/agent-tasks/assign/${task.id}`, { agentAddress: wallet.address });
      claimedTask = task;
      console.log(`[github-agent] Claimed task: "${task.title}" (reward ${task.reward} ARZY-G)`);
    } else {
      console.log("[github-agent] No pending tasks in the marketplace — submitting ad hoc proof instead.");
    }
  } catch (err) {
    console.warn(`[github-agent] Task marketplace unavailable, continuing without it: ${err}`);
  }

  // 3. Submit proof-of-work directly on-chain. submitProof is also fully
  //    permissionless for any registered agent — no API involvement required
  //    for the mint itself.
  const proof = claimedTask
    ? `Completed via GitHub Actions: ${claimedTask.title}`
    : `Ad hoc proof-of-work via GitHub Actions ${new Date().toISOString()}`;
  const amount = claimedTask ? claimedTask.reward : randomAmount();
  const score = randomInt(5, 9);
  const amountWei = ethers.parseUnits(amount.toString(), 18);

  console.log(`[github-agent] Submitting proof: "${proof}" | amount=${amount} | score=${score}`);
  const tx = await contract.submitProof(proof, amountWei, score);
  const receipt = await tx.wait();
  console.log(`[github-agent] Proof tx confirmed: ${receipt?.hash ?? tx.hash}`);

  // 4. If this proof was for a claimed task, tell the marketplace it's done
  //    so it shows up as completed. The server verifies the tx on-chain
  //    itself rather than trusting anything the client says.
  if (claimedTask) {
    try {
      await apiPost(`/api/agent-tasks/complete/${claimedTask.id}`, {
        agentAddress: wallet.address,
        proof,
        txHash: receipt?.hash ?? tx.hash,
      });
      console.log(`[github-agent] Marketplace task "${claimedTask.title}" marked complete.`);
    } catch (err) {
      console.warn(`[github-agent] Could not mark marketplace task complete: ${err}`);
    }
  }

  const newBalance = await contract.balanceOf(wallet.address);
  console.log(`[github-agent] New ARZY-G balance: ${ethers.formatEther(newBalance)}`);
}

main().catch((err) => {
  console.error(`[github-agent] Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
