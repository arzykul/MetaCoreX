import { expect } from "chai";
import { ethers } from "hardhat";
import { ARZYG_ERC20_AI, MockFunctionsRouter } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const INITIAL_SUPPLY = ethers.parseEther("1000000"); // 1 million tokens to reserve
const DON_ID = ethers.zeroPadBytes(ethers.toUtf8Bytes("fun-test-1"), 32) as `0x${string}`;
const SUBSCRIPTION_ID = 1n;
const MINT_AMOUNT = ethers.parseEther("1000"); // 1 000 ARZYG requested per proof

describe("ARZYG_ERC20_AI — v2.1", () => {
  let token: ARZYG_ERC20_AI;
  let router: MockFunctionsRouter;
  let deployer: HardhatEthersSigner;
  let reserve: HardhatEthersSigner;
  let agent: HardhatEthersSigner;
  let stranger: HardhatEthersSigner;

  beforeEach(async () => {
    [deployer, reserve, agent, stranger] = await ethers.getSigners();

    const RouterFactory = await ethers.getContractFactory("MockFunctionsRouter");
    router = (await RouterFactory.deploy()) as MockFunctionsRouter;

    const TokenFactory = await ethers.getContractFactory("ARZYG_ERC20_AI");
    token = (await TokenFactory.deploy(
      INITIAL_SUPPLY,
      reserve.address,
      await router.getAddress(),
      DON_ID,
      SUBSCRIPTION_ID
    )) as ARZYG_ERC20_AI;
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Deployment
  // ────────────────────────────────────────────────────────────────────────────

  describe("Deployment", () => {
    it("has correct name and symbol", async () => {
      expect(await token.name()).to.equal("ARZY-G");
      expect(await token.symbol()).to.equal("ARZYG");
    });

    it("mints initial supply to reserve address", async () => {
      const balance = await token.balanceOf(reserve.address);
      expect(balance).to.equal(INITIAL_SUPPLY);
    });

    it("grants DEFAULT_ADMIN_ROLE and DEV_ADMIN_ROLE to deployer", async () => {
      const ADMIN = await token.DEFAULT_ADMIN_ROLE();
      const DEV = await token.DEV_ADMIN_ROLE();
      expect(await token.hasRole(ADMIN, deployer.address)).to.be.true;
      expect(await token.hasRole(DEV, deployer.address)).to.be.true;
    });

    it("grants RESERVE_ROLE to reserve address", async () => {
      const RESERVE = await token.RESERVE_ROLE();
      expect(await token.hasRole(RESERVE, reserve.address)).to.be.true;
    });

    it("stores correct functionsRouter address", async () => {
      expect(await token.functionsRouter()).to.equal(await router.getAddress());
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // requestUsefulness
  // ────────────────────────────────────────────────────────────────────────────

  describe("requestUsefulness", () => {
    it("emits MintRequested and stores pending request", async () => {
      const tx = await token
        .connect(deployer)
        .requestUsefulness(agent.address, "Write a poem", MINT_AMOUNT);

      const receipt = await tx.wait();
      const requestId = await router.lastRequestId();

      await expect(tx)
        .to.emit(token, "MintRequested")
        .withArgs(requestId, agent.address, MINT_AMOUNT, "Write a poem");

      const pending = await token.pendingRequests(requestId);
      expect(pending.to).to.equal(agent.address);
      expect(pending.amount).to.equal(MINT_AMOUNT);
      expect(pending.proof).to.equal("Write a poem");
    });

    it("reverts when called by a non-DEV_ADMIN account", async () => {
      await expect(
        token.connect(stranger).requestUsefulness(agent.address, "hack", MINT_AMOUNT)
      ).to.be.revertedWith("Not owner");
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // handleOracleFulfillment → birthToken (score >= 1)
  // ────────────────────────────────────────────────────────────────────────────

  describe("handleOracleFulfillment — success path (score >= 1)", () => {
    let requestId: string;

    beforeEach(async () => {
      await token
        .connect(deployer)
        .requestUsefulness(agent.address, "Summarise docs", MINT_AMOUNT);
      requestId = await router.lastRequestId();
    });

    it("mints agentReward to agent and fee to owner", async () => {
      const feePercent = await token.protocolFeePercent();
      const feeAmount = (MINT_AMOUNT * feePercent) / 100n;
      const agentReward = MINT_AMOUNT - feeAmount;

      const agentBefore = await token.balanceOf(agent.address);
      const ownerBefore = await token.balanceOf(deployer.address);

      await router.fulfillSuccess(await token.getAddress(), requestId, 5n);

      expect(await token.balanceOf(agent.address)).to.equal(agentBefore + agentReward);
      expect(await token.balanceOf(deployer.address)).to.equal(ownerBefore + feeAmount);
    });

    it("emits TokenBirthed event with correct split", async () => {
      const feePercent = await token.protocolFeePercent();
      const feeAmount = (MINT_AMOUNT * feePercent) / 100n;
      const agentReward = MINT_AMOUNT - feeAmount;

      await expect(router.fulfillSuccess(await token.getAddress(), requestId, 5n))
        .to.emit(token, "TokenBirthed")
        .withArgs(agent.address, MINT_AMOUNT, agentReward, feeAmount);
    });

    it("emits AIMinted event", async () => {
      const feePercent = await token.protocolFeePercent();
      const feeAmount = (MINT_AMOUNT * feePercent) / 100n;
      const agentReward = MINT_AMOUNT - feeAmount;

      await expect(router.fulfillSuccess(await token.getAddress(), requestId, 1n))
        .to.emit(token, "AIMinted")
        .withArgs(agent.address, agentReward, "Summarise docs");
    });

    it("clears the pending request after fulfillment", async () => {
      await router.fulfillSuccess(await token.getAddress(), requestId, 3n);
      const pending = await token.pendingRequests(requestId);
      expect(pending.to).to.equal(ethers.ZeroAddress);
      expect(pending.amount).to.equal(0n);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // handleOracleFulfillment — score = 0 (rejection)
  // ────────────────────────────────────────────────────────────────────────────

  describe("handleOracleFulfillment — low score path (score = 0)", () => {
    let requestId: string;

    beforeEach(async () => {
      await token
        .connect(deployer)
        .requestUsefulness(agent.address, "low quality prompt", MINT_AMOUNT);
      requestId = await router.lastRequestId();
    });

    it("emits ProofRejected and mints nothing", async () => {
      const supplyBefore = await token.totalSupply();

      await expect(router.fulfillSuccess(await token.getAddress(), requestId, 0n))
        .to.emit(token, "ProofRejected")
        .withArgs(requestId, "Rejected by AI: Score too low");

      expect(await token.totalSupply()).to.equal(supplyBefore);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // handleOracleFulfillment — oracle error path
  // ────────────────────────────────────────────────────────────────────────────

  describe("handleOracleFulfillment — oracle error path", () => {
    let requestId: string;

    beforeEach(async () => {
      await token
        .connect(deployer)
        .requestUsefulness(agent.address, "some task", MINT_AMOUNT);
      requestId = await router.lastRequestId();
    });

    it("emits ProofRejected with oracle error message", async () => {
      await expect(
        router.fulfillError(await token.getAddress(), requestId, "API timeout")
      )
        .to.emit(token, "ProofRejected")
        .withArgs(requestId, "API timeout");
    });

    it("mints nothing on oracle error", async () => {
      const supplyBefore = await token.totalSupply();
      await router.fulfillError(await token.getAddress(), requestId, "Network error");
      expect(await token.totalSupply()).to.equal(supplyBefore);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Access control — handleOracleFulfillment must be router-only
  // ────────────────────────────────────────────────────────────────────────────

  describe("handleOracleFulfillment — access control", () => {
    it("reverts when called by a non-router address", async () => {
      const fakeId = ethers.id("fake-request");
      await expect(
        token
          .connect(stranger)
          .handleOracleFulfillment(fakeId, ethers.toUtf8Bytes(""), ethers.toUtf8Bytes(""))
      ).to.be.revertedWith("Only router can fulfill");
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // changeReserve
  // ────────────────────────────────────────────────────────────────────────────

  describe("changeReserve", () => {
    it("updates reserve address and re-assigns RESERVE_ROLE", async () => {
      const RESERVE = await token.RESERVE_ROLE();

      await expect(token.connect(deployer).changeReserve(stranger.address))
        .to.emit(token, "ReserveChanged")
        .withArgs(reserve.address, stranger.address);

      expect(await token.hasRole(RESERVE, stranger.address)).to.be.true;
      expect(await token.hasRole(RESERVE, reserve.address)).to.be.false;
      expect(await token.reserve()).to.equal(stranger.address);
    });

    it("reverts when called by non-admin", async () => {
      await expect(
        token.connect(stranger).changeReserve(stranger.address)
      ).to.be.reverted;
    });
  });
});
