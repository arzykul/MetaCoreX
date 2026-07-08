import { ethers } from "hardhat";
import { writeFileSync } from "fs";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("=".repeat(60));
  console.log("MetaCoreX — ARZY-G v2.1 Deployment");
  console.log("=".repeat(60));
  console.log("Deployer:       ", deployer.address);
  console.log(
    "Balance:        ",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "ETH"
  );

  // 1. Deploy MockFunctionsRouter (Chainlink Functions simulator)
  console.log("\n[1/2] Deploying MockFunctionsRouter…");
  const RouterFactory = await ethers.getContractFactory("MockFunctionsRouter");
  const mockRouter = await RouterFactory.deploy();
  await mockRouter.waitForDeployment();
  const routerAddress = await mockRouter.getAddress();
  console.log("MockFunctionsRouter → ", routerAddress);

  // 2. Deploy ARZYG_ERC20_AI
  console.log("\n[2/2] Deploying ARZYG_ERC20_AI…");
  const initialSupply  = ethers.parseEther("1000000"); // 1M ARZY-G
  const reserve        = deployer.address;             // reserve = deployer on local net
  const donID          = ethers.zeroPadBytes(ethers.toUtf8Bytes("fun-test-1"), 32);
  const subscriptionId = 1n; // uint64

  const TokenFactory = await ethers.getContractFactory("ARZYG_ERC20_AI");
  const token = await TokenFactory.deploy(
    initialSupply,
    reserve,
    routerAddress,
    donID,
    subscriptionId
  );
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();

  console.log("ARZY-G token    → ", tokenAddress);
  console.log("Token name:        ", await token.name());
  console.log("Token symbol:      ", await token.symbol());
  console.log(
    "Initial supply:    ",
    ethers.formatEther(await token.totalSupply()),
    "ARZYG"
  );

  // 3. Deploy ReportVerification — fully standalone oracle contract. Talks to
  // the token above only through the plain IERC20 interface; never granted
  // any role on it, and never shares deployment state with it beyond the
  // address. Safe to redeploy alongside the token on local net since both
  // are ephemeral here (see deploy-report-verification-sepolia.ts for the
  // live-network path, which deploys this WITHOUT touching the live token).
  console.log("\n[3/3] Deploying ReportVerification…");
  const treasury = deployer.address; // treasury = deployer on local net
  const RVFactory = await ethers.getContractFactory("ReportVerification");
  const reportVerification = await RVFactory.deploy(tokenAddress, treasury, deployer.address);
  await reportVerification.waitForDeployment();
  const rvAddress = await reportVerification.getAddress();
  console.log("ReportVerification → ", rvAddress);

  // Grant ORACLE_ROLE to the server validator wallet (AGENT_PRIVATE_KEY) so
  // the API's scoring worker can post scores, mirroring the PoU mint trust
  // model. Grant ARBITER_ROLE to the deployer for local dispute testing.
  const ORACLE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ORACLE_ROLE"));
  const ARBITER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ARBITER_ROLE"));
  let oracleAddress = deployer.address;
  if (process.env.AGENT_PRIVATE_KEY) {
    oracleAddress = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY).address;
  } else {
    console.warn("⚠️  AGENT_PRIVATE_KEY not set — granting ORACLE_ROLE to deployer instead (local-only fallback).");
  }
  await (await reportVerification.grantRole(ORACLE_ROLE, oracleAddress)).wait();
  await (await reportVerification.grantRole(ARBITER_ROLE, deployer.address)).wait();
  console.log("ORACLE_ROLE  → ", oracleAddress);
  console.log("ARBITER_ROLE → ", deployer.address);

  // 4. Persist deployment info (Hardhat runs from contracts/ dir, so path is correct)
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const deployTx = token.deploymentTransaction();
  const deploymentReceipt = deployTx ? await deployTx.wait() : null;
  const rvDeployTx = reportVerification.deploymentTransaction();
  const rvDeploymentReceipt = rvDeployTx ? await rvDeployTx.wait() : null;
  const deployedInfo = {
    network:   "localhost",
    chainId:   Number(chainId),
    timestamp: new Date().toISOString(),
    rpcUrl:    "http://127.0.0.1:8545",
    contracts: {
      ARZYG_ERC20_AI: {
        address:  tokenAddress,
        deployer: deployer.address,
        reserve:  reserve,
        deploymentBlock: deploymentReceipt?.blockNumber ?? null,
        // Path relative to workspace root (for API server)
        abiPath:  "contracts/artifacts/contracts/ARZYG_ERC20_AI.sol/ARZYG_ERC20_AI.json",
      },
      MockFunctionsRouter: {
        address: routerAddress,
        abiPath: "contracts/artifacts/contracts/mocks/MockFunctionsRouter.sol/MockFunctionsRouter.json",
      },
      ReportVerification: {
        address:  rvAddress,
        deployer: deployer.address,
        treasury: treasury,
        oracleAddress,
        arbiterAddress: deployer.address,
        deploymentBlock: rvDeploymentReceipt?.blockNumber ?? null,
        abiPath: "contracts/artifacts/contracts/ReportVerification.sol/ReportVerification.json",
      },
    },
  };

  // Write to contracts/deployed.json (cwd = contracts/ when hardhat runs)
  writeFileSync("deployed.json", JSON.stringify(deployedInfo, null, 2));
  console.log("\n✅ Saved: contracts/deployed.json");
  console.log("=".repeat(60));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
