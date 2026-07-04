import { http, createConfig } from "wagmi";
import { sepolia } from "wagmi/chains";
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";

// ARZY-G is deployed live on Ethereum Sepolia (see contracts/deployed.json).
//
// WalletConnect requires a Project ID from https://cloud.walletconnect.com
// (external, user-provisioned — cannot be auto-created). Set
// VITE_WALLETCONNECT_PROJECT_ID to enable it; the connector is simply
// omitted (MetaMask/Coinbase still work) when it's not configured.
const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as
  | string
  | undefined;

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [
    injected(),
    coinbaseWallet({ appName: "MetaCoreX" }),
    ...(walletConnectProjectId
      ? [walletConnect({ projectId: walletConnectProjectId, showQrModal: true })]
      : []),
  ],
  transports: {
    [sepolia.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
