import { ethers } from "ethers";
import { GoogleGenAI } from "@google/genai";

/**
 * MetaCoreX PoU validator agent.
 *
 * Takes an executor's report (a plain-text payload describing completed
 * work), asks Gemini to score it 1-10 on the "PoU Score" quality metric,
 * and — if the score is high enough — mints ARZY-G on-chain via the
 * Validator wallet's own proof-of-work submission.
 *
 * IMPORTANT — there is no `mint(address to, uint256 amount)` function on
 * ARZYG_ERC20_AI. The contract intentionally has no generic "mint to any
 * address" call. The only permissionless mint path is
 * `submitProof(proof, amount, score)`, which always mints to msg.sender
 * (the calling wallet) — see contracts/contracts/ARZYG_ERC20_AI.sol.
 * Minting directly to an arbitrary third-party address requires the
 * oracle-gated `requestUsefulness` -> Chainlink Functions -> `birthToken`
 * path, which isn't callable directly by a script (see replit.md).
 * So here: the Validator wallet itself must be a registered agent, and
 * the reward always lands in the Validator's own address. TEST_EXECUTOR_ADDRESS
 * is kept as a reference/label (embedded in the on-chain proof string) so the
 * mint is still traceable to the executor whose report was scored.
 *
 * Required env:
 *   GEMINI_API_KEY      - Gemini API key (Secrets)
 *   AGENT_PRIVATE_KEY   - Validator wallet private key (Secrets)
 *   RPC_URL             - Ethereum RPC endpoint (falls back to SEPOLIA_RPC_URL)
 *
 * Run: pnpm --filter @workspace/scripts run agent:validator
 */

const MODEL = "gemini-2.5-flash";
const MIN_SCORE_TO_MINT = 7;
const CONTRACT_ADDRESS = "0xC3f4231F619F8D22666d70aeaA5D43EA56498770";
const BASE_MINT_AMOUNT = "100"; // ARZY-G; actual reward = amount * score / 10

// Test placeholder for the executor whose work is being validated. The
// contract has no way to mint directly to this address (see note above) —
// it's recorded in the on-chain proof string for traceability only.
const TEST_EXECUTOR_ADDRESS = "0x000000000000000000000000000000000000dEaD";

// Minimal ABI — only what this script calls directly on-chain.
const AGENT_ABI = [
  "function registerAgent(string name, string description) external",
  "function submitProof(string proof, uint256 amount, uint256 score) external",
  "function agents(address) view returns (string name, string description, uint256 registeredAt, uint256 totalEarned, uint256 tasksCompleted, bool isActive)",
];

const TEST_PAYLOAD = `Executor report:
Task: "ETH Market Analysis"
Summary: Pulled the last 24h of ETH/USD price and volume data, computed
short-term volatility, and flagged a possible breakout above $3,800 with
supporting on-chain volume evidence. Delivered as a 1-page markdown report
with a chart reference and three actionable recommendations.`;

interface PouScoreResult {
  score: number;
  reasoning: string;
}

function buildPrompt(payload: string): string {
  return `You are a strict PoU (Proof-of-Usefulness) quality evaluator for the MetaCoreX network.
Score the following executor report on a "PoU Score" from 1 (useless/low-effort) to 10 (exceptional, high-impact work).

Executor report:
"""
${payload}
"""

Respond with ONLY a compact JSON object, no markdown fences, in this exact shape:
{"score": <integer 1-10>, "reasoning": "<one short sentence explaining the score>"}`;
}

async function scorePayload(ai: GoogleGenAI, payload: string): Promise<PouScoreResult> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: buildPrompt(payload),
  });

  const text = (response.text ?? "").trim();
  const jsonText = text.replace(/^```json\s*/i, "").replace(/```$/, "").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`Could not parse model response as JSON: ${text}`);
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as PouScoreResult).score !== "number" ||
    typeof (parsed as PouScoreResult).reasoning !== "string"
  ) {
    throw new Error(`Unexpected response shape: ${text}`);
  }

  return parsed as PouScoreResult;
}

async function ensureValidatorRegistered(
  contract: ethers.Contract,
  validatorAddress: string,
): Promise<void> {
  const agent = await contract.agents(validatorAddress);
  if (agent.isActive) {
    return;
  }
  console.log(`[validator-agent] Validator ${validatorAddress} not registered yet — registering...`);
  const tx = await contract.registerAgent("PoU Validator", "MetaCoreX Gemini-based PoU quality validator");
  await tx.wait();
  console.log(`[validator-agent] Registered. tx: ${tx.hash}`);
}

async function mintForScore(score: number): Promise<void> {
  const rpcUrl = process.env.RPC_URL ?? process.env.SEPOLIA_RPC_URL;
  const privateKey = process.env.AGENT_PRIVATE_KEY;

  if (!rpcUrl) {
    throw new Error("Missing RPC_URL (or SEPOLIA_RPC_URL) env var.");
  }
  if (!privateKey) {
    throw new Error("Missing AGENT_PRIVATE_KEY env var.");
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, AGENT_ABI, wallet);

  await ensureValidatorRegistered(contract, wallet.address);

  const proof = `PoU validation for executor ${TEST_EXECUTOR_ADDRESS} — score ${score}/10`;
  const amountWei = ethers.parseUnits(BASE_MINT_AMOUNT, 18);

  const tx = await contract.submitProof(proof, amountWei, score);
  const receipt = await tx.wait();

  console.log(`Tokens minted! Tx: ${receipt.hash}`);
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Missing GEMINI_API_KEY. Set it in Secrets before running this script.");
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });

  console.log(`Scoring payload with ${MODEL}...\n`);
  console.log(TEST_PAYLOAD);
  console.log("");

  const result = await scorePayload(ai, TEST_PAYLOAD);

  console.log("PoU Score result:");
  console.log(`  Score: ${result.score}/10`);
  console.log(`  Reasoning: ${result.reasoning}`);
  console.log("");

  if (result.score >= MIN_SCORE_TO_MINT) {
    await mintForScore(result.score);
  } else {
    console.log("Mint rejected due to low PoU Score");
  }

  process.exit(0);
}

main().catch((error) => {
  console.error("Validator agent failed:", error);
  process.exit(1);
});
