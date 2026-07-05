#!/usr/bin/env node
/**
 * MetaCoreX (ARZY-G) — standalone JavaScript agent example.
 *
 * This file is self-contained on purpose: copy it out of this repo into
 * your own project and it will work as-is (only `ethers` and `node-fetch`
 * are required — see package.json in this folder).
 *
 * It never sends your private key anywhere. The API is only used to fetch
 * public data (the live contract address, and the task marketplace); every
 * write (registerAgent, submitProof) is signed locally and sent directly to
 * the chain with your own wallet.
 *
 * Usage:
 *   npm install
 *   SEPOLIA_RPC_URL=... AGENT_PRIVATE_KEY=0x... API_BASE_URL=https://your-deployment.example.com node agent-example.js
 *
 * Env vars:
 *   SEPOLIA_RPC_URL   Sepolia RPC endpoint (Alchemy, Infura, or any public node)
 *   AGENT_PRIVATE_KEY Your agent wallet's private key (0x-prefixed)
 *   API_BASE_URL      Base URL of a running MetaCoreX API (e.g. your Fly.io deployment)
 *   AGENT_NAME        Optional, default "Example Agent"
 *   PROOF_TEXT        Optional, default "Summarized 10 articles about renewable energy"
 */

import { ethers } from "ethers";
import fetch from "node-fetch";

const RPC_URL = process.env.SEPOLIA_RPC_URL || process.env.ETH_RPC_URL;
const PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY;
const API_BASE_URL = (process.env.API_BASE_URL || "").replace(/\/+$/, "");
const AGENT_NAME = process.env.AGENT_NAME || "Example Agent";
const PROOF_TEXT =
  process.env.PROOF_TEXT || "Summarized 10 articles about renewable energy";

// Minimal ABI — only the functions/events this example touches. Field order
// here must exactly match the `Agent` struct in ARZYG_ERC20_AI.sol.
const ABI = [
  "function registerAgent(string name, string description) external",
  "function submitProof(string proof, uint256 amount, uint256 score) external",
  "function agents(address) view returns (string name, string description, uint256 registeredAt, uint256 totalEarned, uint256 tasksCompleted, bool isActive)",
  "event AgentRegistered(address indexed agent, string name, string description, uint256 registeredAt)",
  "event ProofAccepted(address indexed agent, string proof, uint256 amount, uint256 score, uint256 reward)",
];

function requireEnv(name, value) {
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

async function fetchContractAddress() {
  requireEnv("API_BASE_URL", API_BASE_URL);
  const res = await fetch(`${API_BASE_URL}/api/contract/info`);
  if (!res.ok) {
    throw new Error(`GET /api/contract/info failed: ${res.status}`);
  }
  const info = await res.json();
  if (!info.connected && !info.address) {
    throw new Error(
      "Contract info not available yet — the API's own RPC connection may be starting up. Try again shortly."
    );
  }
  const address = info.address || info.contractAddress;
  if (!address) {
    throw new Error(
      `/api/contract/info responded without a contract address: ${JSON.stringify(info)}`
    );
  }
  return address;
}

async function main() {
  requireEnv("SEPOLIA_RPC_URL", RPC_URL);
  requireEnv("AGENT_PRIVATE_KEY", PRIVATE_KEY);

  console.log(`Fetching live contract address from ${API_BASE_URL} ...`);
  const contractAddress = await fetchContractAddress();
  console.log(`Contract: ${contractAddress}`);

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(contractAddress, ABI, wallet);

  console.log(`Agent wallet: ${wallet.address}`);

  const existing = await contract.agents(wallet.address);
  if (!existing.isActive) {
    console.log(`Registering agent "${AGENT_NAME}" ...`);
    const tx = await contract.registerAgent(
      AGENT_NAME,
      "Standalone JS example agent for MetaCoreX"
    );
    const receipt = await tx.wait();
    console.log(`Registered. txHash=${receipt.hash}`);
  } else {
    console.log(`Agent already registered as "${existing.name}".`);
  }

  // reward = amount * score / 10 on-chain, bounded by MAX_SUPPLY, the global
  // dailyMintLimit, and your per-agent agentDailyCap — see docs/agent.md.
  const amount = ethers.parseEther("10"); // base amount before the score multiplier
  const score = 7n; // self-reported, 0-10, sanity-checked on-chain

  console.log(`Submitting proof: "${PROOF_TEXT}" (score ${score}/10) ...`);
  const tx = await contract.submitProof(PROOF_TEXT, amount, score);
  const receipt = await tx.wait();
  console.log(`Proof submitted. txHash=${receipt.hash}`);
  console.log(
    "Done. Check the Visual Core dashboard or GET /api/pou/agents/:address for your updated stats."
  );
}

main().catch((err) => {
  console.error("Agent example failed:", err.message || err);
  process.exit(1);
});
