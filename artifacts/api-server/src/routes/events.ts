import { Router, type Request, type Response, type NextFunction } from "express";
import { mcxEventBus, type McxEventType } from "../ws/eventBus.js";

const ALLOWED_TYPES: McxEventType[] = [
  "MintRequested",
  "TokenBirthed",
  "OracleProofRejected",
  "AgentStatusChanged",
  "SystemMessage",
  "AgentRegistered",
  "ProofAccepted",
  "ProofRejected",
];

const router = Router();

/**
 * Test/demo-only endpoints below simulate WebSocket events without a real
 * on-chain transaction. They must never be reachable in production, since
 * they let any caller broadcast fabricated ProofAccepted-style events to
 * every connected client.
 */
function blockInProduction(_req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV === "production") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  next();
}

/**
 * POST /api/events/emit
 * Emit a demo event to all WebSocket clients. Dev/test only.
 * Body: { type: McxEventType, data?: object }
 */
router.post("/events/emit", blockInProduction, (req, res) => {
  const { type, data = {} } = req.body as {
    type: McxEventType;
    data?: Record<string, unknown>;
  };

  if (!type || !ALLOWED_TYPES.includes(type)) {
    res.status(400).json({
      error: `Invalid event type. Allowed: ${ALLOWED_TYPES.join(", ")}`,
    });
    return;
  }

  mcxEventBus.publish(type, data);

  res.json({ ok: true, emitted: type, timestamp: Date.now() });
});

/**
 * GET /api/events/demo
 * Fire a pre-built sequence of demo events — useful for testing the UI. Dev/test only.
 */
router.get("/events/demo", blockInProduction, (_req, res) => {
  const agentAddr = "0xDeAdBeEf00000000000000000000000000000001";
  const requestId =
    "0x" + Math.random().toString(16).slice(2).padEnd(64, "0");

  setTimeout(() => {
    mcxEventBus.publish("MintRequested", {
      requestId,
      to: agentAddr,
      amount: "1000000000000000000000",
      proof: "Summarise Ethereum whitepaper",
    });
  }, 100);

  setTimeout(() => {
    mcxEventBus.publish("TokenBirthed", {
      agent: agentAddr,
      totalAmount: "1000000000000000000000",
      rewardAmount: "990000000000000000000",
      feeAmount: "10000000000000000000",
    });
  }, 800);

  setTimeout(() => {
    mcxEventBus.publish("ProofRejected", {
      requestId:
        "0x" + Math.random().toString(16).slice(2).padEnd(64, "0"),
      reason: "Rejected by AI: Score too low",
    });
  }, 1500);

  res.json({ ok: true, message: "Demo sequence started (3 events over 1.5s)" });
});

export default router;
