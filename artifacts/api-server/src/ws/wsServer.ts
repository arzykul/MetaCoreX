import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { mcxEventBus, type McxEvent } from "./eventBus.js";
import { logger } from "../lib/logger.js";

const WS_PATH = "/api/ws";

export function createWsServer(): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (socket: WebSocket, req: IncomingMessage) => {
    const clientIp = req.socket.remoteAddress ?? "unknown";
    logger.info({ clientIp }, "WebSocket client connected");

    const welcome: McxEvent = {
      type: "SystemMessage",
      data: { message: "Connected to MetaCoreX EventBus", version: "2.1" },
      timestamp: Date.now(),
    };
    socket.send(JSON.stringify(welcome));

    socket.on("close", () => {
      logger.info({ clientIp }, "WebSocket client disconnected");
    });

    socket.on("error", (err) => {
      logger.warn({ err, clientIp }, "WebSocket client error");
    });
  });

  const broadcast = (event: McxEvent): void => {
    const payload = JSON.stringify(event);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  };

  mcxEventBus.on("event", broadcast);

  wss.on("close", () => {
    mcxEventBus.off("event", broadcast);
    logger.info("WebSocket server closed");
  });

  return wss;
}

export function handleUpgrade(
  wss: WebSocketServer,
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer
): void {
  if (req.url !== WS_PATH) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
}
