import http from "node:http";
import app from "./app.js";
import { createWsServer, handleUpgrade } from "./ws/wsServer.js";
import { logger } from "./lib/logger.js";
import { mcxEventBus } from "./ws/eventBus.js";
import { contractService } from "./services/contractService.js";
import { proofIndexer } from "./services/proofIndexer.js";
import { verificationIndexer } from "./services/verificationIndexer.js";
import { verificationScorer } from "./services/verificationScorer.js";
import { seedAgentTasksIfEmpty } from "./lib/seedAgentTasks.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Defensive top-level handlers: background chain work (ethers.js event
// polling, RPC calls) can reject after a free-tier RPC rate-limits (429) or
// times out. Without these, an unhandled rejection crashes the whole
// process — taking down every route (including /api/agent-tasks/*) until
// the platform respawns it, which surfaces as transient 502s. Log instead
// of crashing; these errors are already retried/backed-off where relevant.
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection — server continuing");
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception — server continuing");
});

const server = http.createServer(app);
const wss = createWsServer();

server.on("upgrade", (req, socket, head) => {
  handleUpgrade(wss, req, socket as import("node:stream").Duplex, head);
});

server.listen(port, () => {
  logger.info({ port }, "MetaCoreX API Server listening");
  logger.info({ path: "/api/ws" }, "WebSocket EventBus ready");

  // Emit startup event to any early subscribers
  setTimeout(() => {
    mcxEventBus.publish("SystemMessage", {
      message: "MetaCoreX OS booted successfully",
      version: "2.1",
    });
  }, 500);

  // Initialize blockchain bridge (non-blocking — retries automatically)
  contractService.init().catch((err) => {
    logger.warn({ err }, "contractService init error");
  });

  // Start PoU proof indexer (non-blocking — waits for chain connection, then backfills + polls)
  proofIndexer.start().catch((err) => {
    logger.warn({ err }, "proofIndexer start error");
  });

  // Start ReportVerification indexer + scoring worker (non-blocking — each
  // waits for chain connection independently, then backfills + polls)
  verificationIndexer.start().catch((err) => {
    logger.warn({ err }, "verificationIndexer start error");
  });

  verificationScorer.start().catch((err) => {
    logger.warn({ err }, "verificationScorer start error");
  });

  // Seed demo agent tasks once (non-blocking)
  seedAgentTasksIfEmpty().catch((err) => {
    logger.warn({ err }, "seedAgentTasksIfEmpty error");
  });
});

server.on("error", (err) => {
  logger.error({ err }, "Server error");
  process.exit(1);
});
