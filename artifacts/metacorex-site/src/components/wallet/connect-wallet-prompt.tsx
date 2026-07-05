import { Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWalletConnect } from "@/hooks/use-wallet-connect";

export function ConnectWalletPrompt({ title = "Connect Wallet", label }: { title?: string; label: string }) {
  const { connectors, connect, pendingConnectorUid } = useWalletConnect();
  return (
    <div className="text-center py-12 border border-dashed border-border rounded-lg bg-background">
      <Wallet className="w-12 h-12 text-primary mx-auto mb-4 opacity-70" />
      <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground mb-4">{label}</p>
      <div className="flex flex-wrap gap-2 justify-center">
        {connectors.map((connector) => {
          const isPending = pendingConnectorUid === connector.uid;
          return (
            <Button
              key={connector.uid}
              variant="outline"
              onClick={() => connect({ connector })}
              disabled={pendingConnectorUid !== undefined}
              data-testid={`btn-connect-inline-${connector.id}`}
            >
              {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Connect {connector.name}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export function ConnectWalletButtons() {
  const { connectors, connect, pendingConnectorUid } = useWalletConnect();
  return (
    <div className="flex gap-2">
      {connectors.map((connector) => {
        const isPending = pendingConnectorUid === connector.uid;
        return (
          <Button
            key={connector.uid}
            onClick={() => connect({ connector })}
            disabled={pendingConnectorUid !== undefined}
            data-testid={`btn-connect-${connector.id}`}
          >
            {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Connect {connector.name}
          </Button>
        );
      })}
    </div>
  );
}
