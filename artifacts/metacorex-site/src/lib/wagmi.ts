import { http, createConfig } from "wagmi";
import { sepolia } from "wagmi/chains";
import { coinbaseWallet, injected } from "wagmi/connectors";

// ARZY-G is deployed live on Ethereum Sepolia (see contracts/deployed.json).
export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [
    injected(),
    coinbaseWallet({ appName: "MetaCoreX" }),
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
