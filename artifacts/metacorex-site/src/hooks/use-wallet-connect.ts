import { useEffect, useRef } from "react";
import { useConnect, type Connector } from "wagmi";
import { useToast } from "@/hooks/use-toast";

function isConnector(value: unknown): value is Connector {
  return !!value && typeof value === "object" && "uid" in value;
}

function friendlyConnectError(message: string, connectorName: string): string {
  if (message.includes("Connector not found") || message.includes("Provider not found")) {
    return `${connectorName} extension not detected. Please install it and refresh the page.`;
  }
  if (message.toLowerCase().includes("user rejected")) {
    return "Connection request was rejected.";
  }
  return message;
}

/**
 * Wraps wagmi's useConnect with visible user feedback: a toast on failure
 * (e.g. no wallet extension installed, or the user rejected the request)
 * and the id of the connector currently being connected, so buttons can
 * show a pending/disabled state instead of silently doing nothing.
 */
export function useWalletConnect() {
  const { connectors, connect, error, isPending, variables, reset } = useConnect();
  const { toast } = useToast();
  const lastReportedError = useRef<Error | null>(null);

  useEffect(() => {
    if (error && error !== lastReportedError.current) {
      lastReportedError.current = error;
      const connectorName = isConnector(variables?.connector) ? variables.connector.name : "Wallet";
      toast({
        variant: "destructive",
        title: "Couldn't connect wallet",
        description: friendlyConnectError(error.message, connectorName),
      });
      reset();
    }
  }, [error, variables, toast, reset]);

  const pendingConnectorUid = isPending && isConnector(variables?.connector) ? variables.connector.uid : undefined;

  return { connectors, connect, pendingConnectorUid };
}
