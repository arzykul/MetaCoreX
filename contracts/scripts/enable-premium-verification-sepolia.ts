import { ethers } from "hardhat";
import { readFileSync, writeFileSync, existsSync } from "fs";

// Flips on the premium (Chainlink Functions) verification tier on the
// already-deployed ReportVerification contract. Never redeploys anything —
// it only calls the two admin setters (`setFunctionsConfig`, then
// `setPremiumEnabled(true)`) once a real, funded Chainlink Functions
// subscription exists.
//
// Prerequisites (see docs/chainlink-functions-setup.md):
//   1. A Chainlink Functions subscription created at
//      https://functions.chain.link/sepolia
//   2. The subscription funded with testnet LINK
//   3. The live ReportVerification address (see deployed.json) added as an
//      approved consumer on that subscription
//   4. CHAINLINK_SUBSCRIPTION_ID set to that subscription's numeric ID
//
// Usage:
//   CHAINLINK_SUBSCRIPTION_ID=123 pnpm --filter @workspace/contracts run enable-premium:sepolia

const DEPLOYED_JSON = "deployed.json";

// Chainlink Functions — Sepolia mainnet addresses (same as deploy-sepolia.ts)
const CHAINLINK_ROUTER_SEPOLIA = "0xb83E47C2bC239B3bf370bc41e1459A34b41238D0";
const CHAINLINK_DON_ID_SEPOLIA = "fun-ethereum-sepolia-1";

interface DeployedInfoOnDisk {
  network: string;
  chainId: number;
  contracts: {
    ReportVerification?: {
      address: string;
      premiumEnabled?: boolean;
      subscriptionId?: string;
      functionsRouter?: string;
      donId?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
}

async function main() {
  console.log("=".repeat(60));
  console.log("MetaCoreX — Enable Premium (Chainlink Functions) Tier → SEPOLIA");
  console.log("=".repeat(60));

  const network = await ethers.provider.getNetwork();
  if (network.chainId !== 11155111n) {
    throw new Error(`Wrong network (chainId ${network.chainId}) — run with --network sepolia.`);
  }

  const subscriptionIdRaw = process.env.CHAINLINK_SUBSCRIPTION_ID;
  if (!subscriptionIdRaw || BigInt(subscriptionIdRaw) === 0n) {
    throw new Error(
      "CHAINLINK_SUBSCRIPTION_ID is not set (or is 0).\n" +
        "Create + fund a subscription first — see docs/chainlink-functions-setup.md — " +
        "then add it as a Replit secret before running this script."
    );
  }
  const subscriptionId = BigInt(subscriptionIdRaw);

  if (!existsSync(DEPLOYED_JSON)) {
    throw new Error("deployed.json not found — deploy ReportVerification first.");
  }
  const deployed: DeployedInfoOnDisk = JSON.parse(readFileSync(DEPLOYED_JSON, "utf-8"));
  const rvAddress = deployed.contracts.ReportVerification?.address;
  if (!rvAddress) {
    throw new Error("deployed.json has no ReportVerification entry — deploy it first.");
  }
  if (deployed.network !== "sepolia") {
    throw new Error(`deployed.json is for network "${deployed.network}", expected "sepolia" — refusing to proceed.`);
  }

  if (!process.env.AGENT_PRIVATE_KEY) {
    throw new Error(
      "AGENT_PRIVATE_KEY not set — this is the same wallet that deployed ReportVerification " +
        "and holds DEFAULT_ADMIN_ROLE on it."
    );
  }
  const signer = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY, ethers.provider);
  console.log("Admin wallet:   ", signer.address);
  console.log("ReportVerification: ", rvAddress);
  console.log("Subscription ID: ", subscriptionId.toString());

  const reportVerification = await ethers.getContractAt("ReportVerification", rvAddress, signer);

  const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
  const hasAdmin = await reportVerification.hasRole(DEFAULT_ADMIN_ROLE, signer.address);
  if (!hasAdmin) {
    throw new Error(
      `${signer.address} does not hold DEFAULT_ADMIN_ROLE on ReportVerification — cannot enable premium tier.`
    );
  }

  const donId = ethers.zeroPadBytes(ethers.toUtf8Bytes(CHAINLINK_DON_ID_SEPOLIA), 32);

  console.log("\n[1/2] setFunctionsConfig(router, donId, subscriptionId)…");
  console.log("       Router:  ", CHAINLINK_ROUTER_SEPOLIA);
  console.log("       DON ID:  ", CHAINLINK_DON_ID_SEPOLIA);
  const configTx = await reportVerification.setFunctionsConfig(
    CHAINLINK_ROUTER_SEPOLIA,
    donId,
    subscriptionId
  );
  await configTx.wait();
  console.log("       Tx Hash: ", configTx.hash);

  console.log("\n[2/2] setPremiumEnabled(true)…");
  const enableTx = await reportVerification.setPremiumEnabled(true);
  await enableTx.wait();
  console.log("       Tx Hash: ", enableTx.hash);

  const premiumEnabled: boolean = await reportVerification.premiumEnabled();
  const onchainSubId: bigint = await reportVerification.subscriptionId();
  console.log("\n✅ Verified on-chain: premiumEnabled =", premiumEnabled, "| subscriptionId =", onchainSubId.toString());
  if (!premiumEnabled || onchainSubId !== subscriptionId) {
    throw new Error("Post-transaction on-chain state does not match expected values — investigate before announcing premium is live.");
  }

  deployed.contracts.ReportVerification = {
    ...deployed.contracts.ReportVerification,
    address: rvAddress,
    premiumEnabled: true,
    subscriptionId: subscriptionId.toString(),
    functionsRouter: CHAINLINK_ROUTER_SEPOLIA,
    donId: CHAINLINK_DON_ID_SEPOLIA,
  };
  writeFileSync(DEPLOYED_JSON, JSON.stringify(deployed, null, 2));
  console.log("\n✅ Saved: contracts/deployed.json");

  console.log("\n🎉 Premium (Chainlink Functions) verification tier is now LIVE.");
  console.log("   Next: update the 'Coming Soon' badge in artifacts/metacorex-site/src/pages/for-agents.tsx");
  console.log("   and the status row in docs/economics.md to reflect availability.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
