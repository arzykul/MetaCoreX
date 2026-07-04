import { ethers } from "hardhat";
import { writeFileSync } from "fs";

// Chainlink Functions — Sepolia mainnet addresses
// https://docs.chain.link/chainlink-functions/supported-networks
const CHAINLINK_ROUTER_SEPOLIA = "0xb83E47C2bC239B3bf370bc41e1459A34b41238D0";
const CHAINLINK_DON_ID_SEPOLIA  = "fun-ethereum-sepolia-1";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("=".repeat(60));
  console.log("MetaCoreX — ARZY-G v2.1 Deployment → SEPOLIA TESTNET");
  console.log("=".repeat(60));
  console.log("Network:        ", network.name, `(chainId: ${network.chainId})`);
  console.log("Deployer:       ", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:        ", ethers.formatEther(balance), "ETH");

  if (balance < ethers.parseEther("0.01")) {
    throw new Error(
      "Insufficient ETH balance. Need at least 0.01 ETH for gas.\n" +
      "Get free Sepolia ETH at: https://sepoliafaucet.com"
    );
  }

  // Encode DON ID as bytes32
  const donID = ethers.zeroPadBytes(
    ethers.toUtf8Bytes(CHAINLINK_DON_ID_SEPOLIA),
    32
  );

  // Chainlink Functions subscription ID
  // Create one at: https://functions.chain.link/sepolia
  const subscriptionId = BigInt(process.env.CHAINLINK_SUBSCRIPTION_ID ?? "0");
  if (subscriptionId === 0n) {
    console.warn(
      "\n⚠️  CHAINLINK_SUBSCRIPTION_ID not set.\n" +
      "   Create a subscription at https://functions.chain.link/sepolia\n" +
      "   and add CHAINLINK_SUBSCRIPTION_ID to Replit Secrets.\n" +
      "   Deploying with subscriptionId=0 (oracle calls will fail until updated).\n"
    );
  }

  // Deploy ARZYG_ERC20_AI (no Mock router on testnet — use real Chainlink)
  console.log("\n[1/1] Deploying ARZYG_ERC20_AI to Sepolia…");
  console.log("       Router:  ", CHAINLINK_ROUTER_SEPOLIA);
  console.log("       DON ID:  ", CHAINLINK_DON_ID_SEPOLIA);
  console.log("       Sub ID:  ", subscriptionId.toString());

  const initialSupply = ethers.parseEther("1000000"); // 1M ARZY-G
  const reserve       = deployer.address;             // reserve = deployer

  const TokenFactory = await ethers.getContractFactory("ARZYG_ERC20_AI");
  const token = await TokenFactory.deploy(
    initialSupply,
    reserve,
    CHAINLINK_ROUTER_SEPOLIA,
    donID,
    subscriptionId
  );

  console.log("\n⏳ Waiting for deployment transaction…");
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();

  console.log("\n✅ ARZY-G deployed!");
  console.log("   Address:  ", tokenAddress);
  console.log("   Name:     ", await token.name());
  console.log("   Symbol:   ", await token.symbol());
  console.log(
    "   Supply:   ",
    ethers.formatEther(await token.totalSupply()),
    "ARZYG"
  );

  const deployTx = token.deploymentTransaction();
  console.log("   Tx Hash:  ", deployTx?.hash);
  console.log(
    "\n🔍 Etherscan: https://sepolia.etherscan.io/address/" + tokenAddress
  );

  // Wait for a few confirmations before verification
  if (deployTx) {
    console.log("\n⏳ Waiting for 5 block confirmations…");
    await deployTx.wait(5);
    console.log("✅ Confirmed.");
  }

  // Persist deployment info
  const deploymentReceipt = deployTx ? await deployTx.wait() : null;
  const deployedInfo = {
    network:   "sepolia",
    chainId:   Number(network.chainId),
    timestamp: new Date().toISOString(),
    rpcUrl:    process.env.SEPOLIA_RPC_URL ?? "https://rpc.sepolia.org",
    contracts: {
      ARZYG_ERC20_AI: {
        address:        tokenAddress,
        deployer:       deployer.address,
        reserve:        reserve,
        chainlinkRouter: CHAINLINK_ROUTER_SEPOLIA,
        donId:          CHAINLINK_DON_ID_SEPOLIA,
        subscriptionId: subscriptionId.toString(),
        txHash:         deployTx?.hash ?? "",
        deploymentBlock: deploymentReceipt?.blockNumber ?? null,
        etherscan:      `https://sepolia.etherscan.io/address/${tokenAddress}`,
        abiPath: "contracts/artifacts/contracts/ARZYG_ERC20_AI.sol/ARZYG_ERC20_AI.json",
      },
    },
  };

  writeFileSync("deployed.json", JSON.stringify(deployedInfo, null, 2));
  console.log("\n✅ Saved: contracts/deployed.json");

  // Verify on Etherscan (requires ETHERSCAN_API_KEY)
  if (process.env.ETHERSCAN_API_KEY) {
    console.log("\n🔍 Verifying contract on Etherscan…");
    console.log(
      "Run: pnpm --filter @workspace/contracts run verify:sepolia " +
      tokenAddress + " " +
      initialSupply.toString() + " " +
      reserve + " " +
      CHAINLINK_ROUTER_SEPOLIA + " " +
      donID + " " +
      subscriptionId.toString()
    );
  } else {
    console.log(
      "\n💡 To verify on Etherscan, add ETHERSCAN_API_KEY to Replit Secrets."
    );
  }

  console.log("\n" + "=".repeat(60));
  console.log("🚀 ARZY-G is live on Sepolia Testnet!");
  console.log("=".repeat(60));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
