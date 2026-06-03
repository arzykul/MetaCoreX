import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying ARZYG_ERC20_AI with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  const ARZYG = await ethers.getContractFactory("ARZYG_ERC20_AI");
  const token = await ARZYG.deploy(deployer.address);

  await token.waitForDeployment();

  const address = await token.getAddress();
  console.log("ARZY-G token deployed to:", address);
  console.log("Token name:              ", await token.name());
  console.log("Token symbol:            ", await token.symbol());
  console.log("Decimals:                ", await token.decimals());
  console.log(
    "Initial supply:          ",
    (await token.totalSupply()).toString(),
    "wei"
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
