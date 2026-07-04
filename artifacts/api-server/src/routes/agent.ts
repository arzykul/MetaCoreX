import { Router, type IRouter } from "express";
import { ethers } from "ethers";
import { contractService } from "../services/contractService.js";

const router: IRouter = Router();

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

/**
 * POST /api/agents/register
 * Registers a new AI agent on-chain.
 * Body: { name: string, description: string, privateKey: string }
 */
router.post("/agents/register", async (req, res): Promise<void> => {
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
 * Body: { agentAddress: string, proof: string, amount: string (wei), score: number|string, privateKey: string }
 * reward = amount * score / 10 (enforced on-chain)
 */
router.post("/agents/submit-proof", async (req, res): Promise<void> => {
  if (!contractService.connected) {
    res.status(503).json({ ok: false, error: "Blockchain not connected" });
    return;
  }

  const { agentAddress, proof, amount, score, privateKey } = req.body as {
    agentAddress?: string;
    proof?: string;
    amount?: string | number;
    score?: string | number;
    privateKey?: string;
  };

  if (!isNonEmptyString(agentAddress) || !ethers.isAddress(agentAddress)) {
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
