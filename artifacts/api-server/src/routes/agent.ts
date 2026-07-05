import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { ethers } from "ethers";
import { contractService } from "../services/contractService.js";

const router: IRouter = Router();

// process.cwd() when the server runs = artifacts/api-server/ (see contractService.ts).
const _workspaceRoot = resolve(process.cwd(), "..", "..");
const INTERNAL_TOKEN_PATH = resolve(_workspaceRoot, "scripts", ".agent-internal-token");

// Read fresh on every request (not cached at module load) so rotating the
// token file doesn't require a server restart. This file is generated
// locally and gitignored — NOT a env var/secret — because forks of this repo
// (the whole point of the third-party agent pattern) must never inherit our
// internal token via a committed value.
function readInternalToken(): string | null {
  try {
    const raw = readFileSync(INTERNAL_TOKEN_PATH, "utf-8").trim();
    return raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

function timingSafeTokenEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseBigIntField(value: unknown): bigint | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  try {
    const big = BigInt(value);
    return big;
  } catch {
    return null;
  }
}

// These two routes accept a raw private key in the request body so our own
// `scripts/src/auto-agent.ts` can sign server-side. That's an unacceptable
// custody model for the public internet — anyone could POST any key here
// once the API is publicly reachable. Third-party/external agents should
// NEVER use these routes; they sign registerAgent/submitProof directly
// on-chain with their own wallet instead (see scripts/src/github-agent.ts).
// This gate restricts these two routes to callers who know our internal
// shared token, so only our own automation can still use them.
function requireInternalAgentToken(req: Request, res: Response): boolean {
  const expected = readInternalToken();
  if (!expected) {
    res.status(503).json({ ok: false, error: "Internal agent routes are not configured" });
    return false;
  }
  const provided = req.headers["x-agent-token"];
  if (typeof provided !== "string" || !timingSafeTokenEqual(provided, expected)) {
    res.status(403).json({
      ok: false,
      error:
        "This route is restricted to internal automation. Third-party agents should register/submit proof directly on-chain instead of sending a private key to this API.",
    });
    return false;
  }
  return true;
}

/**
 * POST /api/agents/register
 * Registers a new AI agent on-chain.
 * Body: { name: string, description: string, privateKey: string }
 * INTERNAL ONLY — requires x-agent-token header. Third-party agents must call
 * registerAgent directly on-chain with their own wallet (see scripts/src/github-agent.ts).
 */
router.post("/agents/register", async (req, res): Promise<void> => {
  if (!requireInternalAgentToken(req, res)) return;
  if (!contractService.connected) {
    res.status(503).json({ ok: false, error: "Blockchain not connected" });
    return;
  }

  const { name, description, privateKey } = req.body as {
    name?: string;
    description?: string;
    privateKey?: string;
  };

  if (!isNonEmptyString(name)) {
    res.status(400).json({ ok: false, error: "name is required and must be a non-empty string" });
    return;
  }
  if (description == null || typeof description !== "string") {
    res.status(400).json({ ok: false, error: "description is required and must be a string" });
    return;
  }
  if (!isNonEmptyString(privateKey)) {
    res.status(400).json({ ok: false, error: "privateKey is required" });
    return;
  }

  try {
    const { txHash, agentAddress } = await contractService.registerAgent(privateKey, name, description);
    res.status(201).json({ ok: true, txHash, agentAddress, name, description });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    req.log.warn({ err: message }, "agents/register failed");
    res.status(400).json({ ok: false, error: message });
  }
});

/**
 * POST /api/agents/submit-proof
 * Submits a proof-of-work on behalf of a registered agent and mints the reward.
 * Body: { proof: string, amount: string (wei), score: number|string, privateKey: string, agentAddress?: string }
 * agentAddress is optional — if omitted, it is derived from privateKey (submitProof always
 * credits msg.sender on-chain, so the caller's address IS the agent address).
 * reward = amount * score / 10 (enforced on-chain)
 * INTERNAL ONLY — requires x-agent-token header. Third-party agents must call
 * submitProof directly on-chain with their own wallet (see scripts/src/github-agent.ts).
 */
router.post("/agents/submit-proof", async (req, res): Promise<void> => {
  if (!requireInternalAgentToken(req, res)) return;
  if (!contractService.connected) {
    res.status(503).json({ ok: false, error: "Blockchain not connected" });
    return;
  }

  const { agentAddress: agentAddressInput, proof, amount, score, privateKey } = req.body as {
    agentAddress?: string;
    proof?: string;
    amount?: string | number;
    score?: string | number;
    privateKey?: string;
  };

  if (agentAddressInput !== undefined && (typeof agentAddressInput !== "string" || !ethers.isAddress(agentAddressInput))) {
    res.status(400).json({ ok: false, error: "agentAddress must be a valid Ethereum address" });
    return;
  }
  if (!isNonEmptyString(proof)) {
    res.status(400).json({ ok: false, error: "proof is required and must be a non-empty string" });
    return;
  }
  if (!isNonEmptyString(privateKey)) {
    res.status(400).json({ ok: false, error: "privateKey is required" });
    return;
  }

  const amountBig = parseBigIntField(amount);
  if (amountBig === null || amountBig <= 0n) {
    res.status(400).json({ ok: false, error: "amount must be a positive integer string (wei)" });
    return;
  }

  const scoreBig = parseBigIntField(score);
  if (scoreBig === null || scoreBig < 0n) {
    res.status(400).json({ ok: false, error: "score must be a non-negative integer" });
    return;
  }

  let agentAddress: string;
  try {
    agentAddress = agentAddressInput ?? new ethers.Wallet(privateKey).address;
  } catch {
    res.status(400).json({ ok: false, error: "Invalid private key" });
    return;
  }

  try {
    const result = await contractService.submitProof(privateKey, agentAddress, proof, amountBig, scoreBig);
    res.json({ ok: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    req.log.warn({ err: message }, "agents/submit-proof failed");
    res.status(400).json({ ok: false, error: message });
  }
});

/**
 * GET /api/agents/list/all
 * Returns all registered (active) agents, reconstructed from AgentRegistered logs.
 * NOTE: registered above /agents/:address so "list" isn't swallowed as an address param.
 */
router.get("/agents/list/all", async (req, res): Promise<void> => {
  if (!contractService.connected) {
    res.status(503).json({ ok: false, error: "Blockchain not connected" });
    return;
  }

  try {
    const agents = await contractService.listAgents();
    res.json({ ok: true, count: agents.length, agents });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    req.log.error({ err: message }, "agents/list/all failed");
    res.status(500).json({ ok: false, error: message });
  }
});

/**
 * GET /api/agents/:address
 * Returns on-chain info for a single agent.
 */
router.get("/agents/:address", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.address) ? req.params.address[0] : req.params.address;

  if (!raw || !ethers.isAddress(raw)) {
    res.status(400).json({ ok: false, error: "address must be a valid Ethereum address" });
    return;
  }

  if (!contractService.connected) {
    res.status(503).json({ ok: false, error: "Blockchain not connected" });
    return;
  }

  try {
    const info = await contractService.getAgentInfo(raw);
    if (!info || !info.isActive) {
      res.status(404).json({ ok: false, error: "Agent not registered" });
      return;
    }
    res.json({ ok: true, agent: info });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    req.log.error({ err: message }, "agents/:address failed");
    res.status(500).json({ ok: false, error: message });
  }
});

export default router;
