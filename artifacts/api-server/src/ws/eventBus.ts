import { EventEmitter } from "node:events";

export type McxEventType =
  | "MintRequested"
  | "TokenBirthed"
  | "OracleProofRejected"
  | "AgentStatusChanged"
  | "SystemMessage"
  | "AgentRegistered"
  | "ProofAccepted"
  | "ProofRejected";

export interface McxEvent {
  type: McxEventType;
  data: Record<string, unknown>;
  timestamp: number;
}

class McxEventBus extends EventEmitter {
  private static instance: McxEventBus;

  private constructor() {
    super();
    this.setMaxListeners(50);
  }

  static getInstance(): McxEventBus {
    if (!McxEventBus.instance) {
      McxEventBus.instance = new McxEventBus();
    }
    return McxEventBus.instance;
  }

  publish(type: McxEventType, data: Record<string, unknown>): void {
    const event: McxEvent = { type, data, timestamp: Date.now() };
    this.emit("event", event);
  }
}

export const mcxEventBus = McxEventBus.getInstance();
