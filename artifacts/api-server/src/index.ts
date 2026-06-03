import http from "node:http";
import app from "./app.js";
import { createWsServer, handleUpgrade } from "./ws/wsServer.js";
import { logger } from "./lib/logger.js";
import { mcxEventBus } from "./ws/eventBus.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

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
});

server.on("error", (err) => {
  logger.error({ err }, "Server error");
  process.exit(1);
});
