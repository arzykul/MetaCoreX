import { useEffect, useRef, useState } from "react";

// Matches artifacts/api-server/src/ws/eventBus.ts McxEventType — keep in
// sync manually since this app cannot import from another artifact.
export type McxEventType =
  | "MintRequested"
  | "TokenBirthed"
  | "OracleProofRejected"
  | "AgentStatusChanged"
  | "SystemMessage"
  | "AgentRegistered"
  | "ProofAccepted"
  | "ProofRejected"
  | "TaskCreated"
  | "TaskAssigned"
  | "TaskCompleted"
  | "TaskVerified";

export interface McxEvent {
  type: McxEventType;
  data: Record<string, unknown>;
  timestamp: number;
}

// Same-origin by default (matches Replit's shared proxy — see
// artifact.toml). For a split deployment (Render Static Site + a separate
// Render Web Service for the API), set VITE_API_BASE_URL to the API
// server's full origin (e.g. "https://metacorex-api.onrender.com") at build
// time and the WebSocket connects there instead. Browsers don't enforce
// same-origin/CORS restrictions on WebSocket connections.
function wsUrl(): string {
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, "");

  if (apiBase) {
    const wsBase = apiBase.replace(/^http/, "ws");
    return `${wsBase}/api/ws`;
  }

  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/ws`;
}

/**
 * Subscribes to the MetaCoreX live EventBus (/api/ws) — real on-chain and
 * system events (agent registrations, proof submissions, mint activity,
 * system messages). Auto-reconnects on disconnect.
 */
export function useMcxEvents(maxEvents = 50): { events: McxEvent[]; connected: boolean } {
  const [events, setEvents] = useState<McxEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    function connect(): void {
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        if (!cancelled) setConnected(true);
      };

      ws.onclose = () => {
        if (!cancelled) {
          setConnected(false);
          reconnectTimer = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onmessage = (event: MessageEvent<string>) => {
        try {
          const parsed = JSON.parse(event.data) as McxEvent;
          if (!cancelled) {
            setEvents((prev) => [parsed, ...prev].slice(0, maxEvents));
          }
        } catch {
          // ignore malformed frames
        }
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { events, connected };
}
