import { ethers } from "hardhat";
import { readFileSync, writeFileSync, existsSync } from "fs";

// Deploys ONLY ReportVerification to Sepolia. Never touches, redeploys, or
// modifies the existing live ARZYG_ERC20_AI deployment — it is read from
// deployed.json purely as a constructor argument (the ERC-20 address it will
// talk to via the standard IERC20 interface).

const DEPLOYED_JSON = "deployed.json";

interface DeployedInfoOnDisk {
  network: string;
  chainId: number;
  timestamp: string;
  rpcUrl: string;
  contracts: {
    ARZYG_ERC20_AI: { address: string; [key: string]: unknown };
    MockFunctionsRouter?: { address: string; [key: string]: unknown };
    ReportVerification?: { address: string; [key: string]: unknown };
  };
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("=".repeat(60));
  console.log("MetaCoreX — ReportVerification Deployment → SEPOLIA TESTNET");
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

  if (!existsSync(DEPLOYED_JSON)) {
    throw new Error(
      "deployed.json not found — deploy ARZYG_ERC20_AI first (this script never deploys the token itself)."
    );
  }
  const deployed: DeployedInfoOnDisk = JSON.parse(readFileSync(DEPLOYED_JSON, "utf-8"));
  const tokenAddress = deployed.contracts.ARZYG_ERC20_AI?.address;
  if (!tokenAddress) {
    throw new Error("deployed.json has no ARZYG_ERC20_AI entry — cannot wire ReportVerification to a token address.");
  }
  if (deployed.network !== "sepolia") {
    throw new Error(`deployed.json is for network "${deployed.network}", expected "sepolia" — refusing to proceed.`);
  }
  console.log("Existing ARZY-G token (untouched): ", tokenAddress);

  // Treasury — defaults to deployer; override via TREASURY_ADDRESS if the
  // protocol treasury should be a separate multisig/address.
  const treasury = process.env.TREASURY_ADDRESS ?? deployer.address;
  console.log("Treasury:       ", treasury, process.env.TREASURY_ADDRESS ? "" : "(defaulted to deployer)");

  console.log("\n[1/1] Deploying ReportVerification…");
  const RVFactory = await ethers.getContractFactory("ReportVerification");
  const reportVerification = await RVFactory.deploy(tokenAddress, treasury, deployer.address);

  console.log("\n⏳ Waiting for deployment transaction…");
  await reportVerification.waitForDeployment();
  const rvAddress = await reportVerification.getAddress();

  console.log("\n✅ ReportVerification deployed!");
  console.log("   Address:  ", rvAddress);

  const deployTx = reportVerification.deploymentTransaction();
  console.log("   Tx Hash:  ", deployTx?.hash);
  console.log("\n🔍 Etherscan: https://sepolia.etherscan.io/address/" + rvAddress);

  if (deployTx) {
    console.log("\n⏳ Waiting for 5 block confirmations…");
    await deployTx.wait(5);
    console.log("✅ Confirmed.");
  }
  const deploymentReceipt = deployTx ? await deployTx.wait() : null;

  // Grant ORACLE_ROLE to the server validator wallet (same AGENT_PRIVATE_KEY
  // wallet used for PoU minting) so the API's scoring worker can post scores.
  // Grant ARBITER_ROLE to an explicit arbiter if provided, else the deployer.
  const ORACLE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ORACLE_ROLE"));
  const ARBITER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ARBITER_ROLE"));

  if (!process.env.AGENT_PRIVATE_KEY) {
    throw new Error(
      "AGENT_PRIVATE_KEY not set — required to grant ORACLE_ROLE to the API server's validator wallet."
    );
  }
  const oracleAddress = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY).address;
  const arbiterAddress = process.env.ARBITER_ADDRESS ?? deployer.address;

  console.log("\n[Roles] Granting ORACLE_ROLE  → ", oracleAddress);
  await (await reportVerification.grantRole(ORACLE_ROLE, oracleAddress)).wait();
  console.log("[Roles] Granting ARBITER_ROLE → ", arbiterAddress, process.env.ARBITER_ADDRESS ? "" : "(defaulted to deployer)");
  await (await reportVerification.grantRole(ARBITER_ROLE, arbiterAddress)).wait();

  // Merge into deployed.json WITHOUT touching the existing ARZYG_ERC20_AI (or
  // MockFunctionsRouter) entries.
  deployed.contracts.ReportVerification = {
    address: rvAddress,
    deployer: deployer.address,
    treasury,
    oracleAddress,
    arbiterAddress,
    txHash: deployTx?.hash ?? "",
    deploymentBlock: deploymentReceipt?.blockNumber ?? null,
    etherscan: `https://sepolia.etherscan.io/address/${rvAddress}`,
    abiPath: "contracts/artifacts/contracts/ReportVerification.sol/ReportVerification.json",
  };
  writeFileSync(DEPLOYED_JSON, JSON.stringify(deployed, null, 2));
  console.log("\n✅ Saved: contracts/deployed.json (ARZYG_ERC20_AI entry left untouched)");

  if (process.env.ETHERSCAN_API_KEY) {
    console.log("\n🔍 Verifying contract on Etherscan…");
    console.log(
      "Run: pnpm --filter @workspace/contracts run verify:sepolia " +
      rvAddress + " " +
      tokenAddress + " " +
      treasury + " " +
      deployer.address
    );
  } else {
    console.log("\n💡 To verify on Etherscan, add ETHERSCAN_API_KEY to Replit Secrets.");
  }

  console.log("\n" + "=".repeat(60));
  console.log("🚀 ReportVerification is live on Sepolia Testnet!");
  console.log("   (ARZY-G token deployment was not touched.)");
  console.log("=".repeat(60));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
