import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { ARZYG_ERC20_AI, MockFunctionsRouter } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const INITIAL_SUPPLY = ethers.parseEther("1000000"); // 1 million tokens to reserve
const DON_ID = ethers.zeroPadBytes(ethers.toUtf8Bytes("fun-test-1"), 32) as `0x${string}`;
const SUBSCRIPTION_ID = 1n;
const MINT_AMOUNT = ethers.parseEther("1000"); // 1 000 ARZYG requested per proof

describe("ARZYG_ERC20_AI — v2.2", () => {
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
        .to.emit(token, "OracleProofRejected")
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
        .to.emit(token, "OracleProofRejected")
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

  // ────────────────────────────────────────────────────────────────────────────
  // Supply cap, daily mint limit, per-agent daily cap
  // ────────────────────────────────────────────────────────────────────────────

  describe("submitProof — score validation", () => {
    beforeEach(async () => {
      await token.connect(agent).registerAgent("Agent A", "desc");
    });

    it("reverts when score > 10", async () => {
      await expect(
        token.connect(agent).submitProof("proof", ethers.parseEther("10"), 11n)
      ).to.be.revertedWith("Score out of range");
    });

    it("allows score == 10", async () => {
      await expect(
        token.connect(agent).submitProof("proof", ethers.parseEther("10"), 10n)
      ).to.emit(token, "ProofAccepted");
    });
  });

  describe("MAX_SUPPLY enforcement", () => {
    it("reverts a submitProof mint that would push totalSupply past MAX_SUPPLY", async () => {
      await token.connect(agent).registerAgent("Agent A", "desc");

      // Raise the daily caps out of the way so the MAX_SUPPLY check is what
      // actually reverts (isolates the specific guard under test).
      await token.connect(deployer).setDailyMintLimit(ethers.MaxUint256 / 2n);
      await token.connect(deployer).setAgentDailyCap(ethers.MaxUint256 / 2n);

      const maxSupply = await token.MAX_SUPPLY();
      const totalSupply = await token.totalSupply();
      const remaining = maxSupply - totalSupply;

      // reward = (amount * score) / 10; with score=10, reward == amount, so
      // pushing `amount` 1 token past `remaining` is enough to exceed MAX_SUPPLY.
      const amount = remaining + ethers.parseEther("1");
      await expect(
        token.connect(agent).submitProof("proof", amount, 10n)
      ).to.be.revertedWith("MAX_SUPPLY exceeded");
    });
  });

  describe("Daily mint limit (global)", () => {
    beforeEach(async () => {
      await token.connect(agent).registerAgent("Agent A", "desc");
      await token.connect(stranger).registerAgent("Agent B", "desc");
      // Widen the per-agent cap so only the global daily limit is exercised.
      await token.connect(deployer).setAgentDailyCap(ethers.parseEther("100000"));
    });

    it("reverts once the combined daily mint limit is exhausted", async () => {
      const dailyLimit = await token.dailyMintLimit();

      // First proof consumes most of the daily limit (reward = amount, score=10).
      const firstAmount = dailyLimit - ethers.parseEther("1");
      await token.connect(agent).submitProof("proof-1", firstAmount, 10n);

      // A second proof from a different agent that would push the day's total
      // mint volume past dailyMintLimit must revert.
      await expect(
        token.connect(stranger).submitProof("proof-2", ethers.parseEther("100"), 10n)
      ).to.be.revertedWith("Daily mint limit exceeded");
    });

    it("resets the global counter after a UTC day passes", async () => {
      const dailyLimit = await token.dailyMintLimit();
      await token.connect(agent).submitProof("proof-1", dailyLimit - ethers.parseEther("1"), 10n);

      await time.increase(86400);

      await expect(
        token.connect(stranger).submitProof("proof-2", ethers.parseEther("100"), 10n)
      ).to.emit(token, "ProofAccepted");
    });
  });

  describe("Per-agent daily cap", () => {
    beforeEach(async () => {
      await token.connect(agent).registerAgent("Agent A", "desc");
      // Widen the global limit so only the per-agent cap is exercised.
      await token.connect(deployer).setDailyMintLimit(ethers.parseEther("100000"));
    });

    it("reverts once a single agent exceeds its own daily cap, even under the global limit", async () => {
      const agentCap = await token.agentDailyCap();

      await token.connect(agent).submitProof("proof-1", agentCap - ethers.parseEther("1"), 10n);

      await expect(
        token.connect(agent).submitProof("proof-2", ethers.parseEther("100"), 10n)
      ).to.be.revertedWith("Agent daily cap exceeded");
    });

    it("does not block a different agent from minting up to their own cap", async () => {
      const agentCap = await token.agentDailyCap();
      await token.connect(agent).submitProof("proof-1", agentCap - ethers.parseEther("1"), 10n);

      await token.connect(stranger).registerAgent("Agent B", "desc");
      await expect(
        token.connect(stranger).submitProof("proof-2", ethers.parseEther("100"), 10n)
      ).to.emit(token, "ProofAccepted");
    });
  });

  describe("setDailyMintLimit / setAgentDailyCap", () => {
    it("allows DEV_ADMIN_ROLE to update dailyMintLimit and emits an event", async () => {
      const newLimit = ethers.parseEther("50000");
      await expect(token.connect(deployer).setDailyMintLimit(newLimit))
        .to.emit(token, "DailyMintLimitChanged");
      expect(await token.dailyMintLimit()).to.equal(newLimit);
    });

    it("allows DEV_ADMIN_ROLE to update agentDailyCap and emits an event", async () => {
      const newCap = ethers.parseEther("5000");
      await expect(token.connect(deployer).setAgentDailyCap(newCap))
        .to.emit(token, "AgentDailyCapChanged");
      expect(await token.agentDailyCap()).to.equal(newCap);
    });

    it("reverts setDailyMintLimit when called by a non-admin", async () => {
      await expect(
        token.connect(stranger).setDailyMintLimit(ethers.parseEther("1"))
      ).to.be.revertedWith("Not owner");
    });

    it("reverts setAgentDailyCap when called by a non-admin", async () => {
      await expect(
        token.connect(stranger).setAgentDailyCap(ethers.parseEther("1"))
      ).to.be.revertedWith("Not owner");
    });
  });

  describe("birthToken (oracle path) respects daily caps", () => {
    it("reverts handleOracleFulfillment when the oracle mint would exceed the daily limit", async () => {
      await token.connect(deployer).setDailyMintLimit(ethers.parseEther("500"));

      await token
        .connect(deployer)
        .requestUsefulness(agent.address, "big task", ethers.parseEther("1000"));
      const requestId = await router.lastRequestId();

      await expect(
        router.fulfillSuccess(await token.getAddress(), requestId, 5n)
      ).to.be.revertedWith("Daily mint limit exceeded");
    });
  });
});
