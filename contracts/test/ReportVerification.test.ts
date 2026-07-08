import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { ARZYG_ERC20_AI, MockFunctionsRouter, ReportVerification } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const INITIAL_SUPPLY = ethers.parseEther("1000000");
const DON_ID = ethers.zeroPadBytes(ethers.toUtf8Bytes("fun-test-1"), 32) as `0x${string}`;
const SUBSCRIPTION_ID = 1n;

const STANDARD_FEE = ethers.parseEther("3");
const PREMIUM_FEE = ethers.parseEther("5");
const Tier = { Standard: 0, Premium: 1 } as const;
const Status = { None: 0, Requested: 1, Posted: 2, Disputed: 3, Finalized: 4 } as const;

describe("ReportVerification", () => {
  let token: ARZYG_ERC20_AI;
  let router: MockFunctionsRouter;
  let verification: ReportVerification;

  let deployer: HardhatEthersSigner;
  let reserve: HardhatEthersSigner;
  let admin: HardhatEthersSigner;
  let treasury: HardhatEthersSigner;
  let oracle: HardhatEthersSigner;
  let arbiter: HardhatEthersSigner;
  let agent: HardhatEthersSigner;
  let referrer: HardhatEthersSigner;
  let stranger: HardhatEthersSigner;

  const reportHash = (text: string) => ethers.keccak256(ethers.toUtf8Bytes(text));

  beforeEach(async () => {
    [deployer, reserve, admin, treasury, oracle, arbiter, agent, referrer, stranger] =
      await ethers.getSigners();

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

    const VerificationFactory = await ethers.getContractFactory("ReportVerification");
    verification = (await VerificationFactory.deploy(
      await token.getAddress(),
      treasury.address,
      admin.address
    )) as ReportVerification;

    await verification.connect(admin).grantRole(await verification.ORACLE_ROLE(), oracle.address);
    await verification.connect(admin).grantRole(await verification.ARBITER_ROLE(), arbiter.address);

    // Fund the agent with enough ARZY-G to pay fees, and approve the contract.
    await token.connect(reserve).transfer(agent.address, ethers.parseEther("1000"));
    await token
      .connect(agent)
      .approve(await verification.getAddress(), ethers.parseEther("1000"));

    // Fund a disputer (stranger) too.
    await token.connect(reserve).transfer(stranger.address, ethers.parseEther("1000"));
    await token
      .connect(stranger)
      .approve(await verification.getAddress(), ethers.parseEther("1000"));
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Deployment
  // ──────────────────────────────────────────────────────────────────────────

  describe("Deployment", () => {
    it("stores the token, treasury, and admin correctly", async () => {
      expect(await verification.token()).to.equal(await token.getAddress());
      expect(await verification.treasury()).to.equal(treasury.address);
      expect(await verification.hasRole(await verification.DEFAULT_ADMIN_ROLE(), admin.address)).to
        .be.true;
    });

    it("has correct fee constants", async () => {
      expect(await verification.STANDARD_FEE()).to.equal(STANDARD_FEE);
      expect(await verification.PREMIUM_FEE()).to.equal(PREMIUM_FEE);
      expect(await verification.CASHBACK_BPS()).to.equal(1_000n);
    });

    it("defaults to a 24h challenge window and premium disabled", async () => {
      expect(await verification.challengeWindow()).to.equal(24n * 3600n);
      expect(await verification.premiumEnabled()).to.be.false;
    });

    it("never touches the live ARZY-G token's roles", async () => {
      // Sanity check that deploying ReportVerification granted it nothing on
      // the token contract, and vice versa — fully independent contracts.
      const DEFAULT_ADMIN_ROLE = await token.DEFAULT_ADMIN_ROLE();
      expect(await token.hasRole(DEFAULT_ADMIN_ROLE, await verification.getAddress())).to.be
        .false;
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // requestVerification
  // ──────────────────────────────────────────────────────────────────────────

  describe("requestVerification", () => {
    it("escrows the standard fee and stores the request", async () => {
      const hash = reportHash("report A");
      const contractBefore = await token.balanceOf(await verification.getAddress());
      const agentBefore = await token.balanceOf(agent.address);

      const tx = await verification
        .connect(agent)
        .requestVerification(hash, Tier.Standard, referrer.address);

      await expect(tx)
        .to.emit(verification, "VerificationRequested")
        .withArgs(1n, agent.address, hash, Tier.Standard, referrer.address, STANDARD_FEE);

      expect(await token.balanceOf(await verification.getAddress())).to.equal(
        contractBefore + STANDARD_FEE
      );
      expect(await token.balanceOf(agent.address)).to.equal(agentBefore - STANDARD_FEE);

      const cert = await verification.getCertificate(1n);
      expect(cert.agent).to.equal(agent.address);
      expect(cert.tier).to.equal(Tier.Standard);
      expect(cert.fee).to.equal(STANDARD_FEE);
      expect(cert.status).to.equal(Status.Requested);
    });

    it("increments requestId across multiple requests", async () => {
      await verification
        .connect(agent)
        .requestVerification(reportHash("report A"), Tier.Standard, ethers.ZeroAddress);
      await verification
        .connect(agent)
        .requestVerification(reportHash("report B"), Tier.Standard, ethers.ZeroAddress);

      expect((await verification.getCertificate(1n)).reportHash).to.equal(reportHash("report A"));
      expect((await verification.getCertificate(2n)).reportHash).to.equal(reportHash("report B"));
    });

    it("reverts if the same agent resubmits the same report hash", async () => {
      const hash = reportHash("dup report");
      await verification.connect(agent).requestVerification(hash, Tier.Standard, ethers.ZeroAddress);

      await expect(
        verification.connect(agent).requestVerification(hash, Tier.Standard, ethers.ZeroAddress)
      ).to.be.revertedWith("Report already submitted by this agent");
    });

    it("allows two different agents to submit the same report hash", async () => {
      const hash = reportHash("shared report");
      await verification.connect(agent).requestVerification(hash, Tier.Standard, ethers.ZeroAddress);
      await expect(
        verification.connect(stranger).requestVerification(hash, Tier.Standard, ethers.ZeroAddress)
      ).to.not.be.reverted;
    });

    it("reverts requesting the premium tier while disabled", async () => {
      await expect(
        verification
          .connect(agent)
          .requestVerification(reportHash("premium report"), Tier.Premium, ethers.ZeroAddress)
      ).to.be.revertedWith("Premium tier not yet active");
    });

    it("reverts without sufficient allowance", async () => {
      await token.connect(agent).approve(await verification.getAddress(), 0n);
      await expect(
        verification
          .connect(agent)
          .requestVerification(reportHash("no allowance"), Tier.Standard, ethers.ZeroAddress)
      ).to.be.reverted;
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // recordVerification (oracle)
  // ──────────────────────────────────────────────────────────────────────────

  describe("recordVerification", () => {
    let requestId: bigint;

    beforeEach(async () => {
      await verification
        .connect(agent)
        .requestVerification(reportHash("scored report"), Tier.Standard, ethers.ZeroAddress);
      requestId = 1n;
    });

    it("allows ORACLE_ROLE to post a score and moves status to Posted", async () => {
      const tx = await verification.connect(oracle).recordVerification(requestId, 8);
      await expect(tx).to.emit(verification, "VerificationPosted").withArgs(requestId, 8);

      const cert = await verification.getCertificate(requestId);
      expect(cert.status).to.equal(Status.Posted);
      expect(cert.score).to.equal(8);
      expect(cert.postedAt).to.be.gt(0n);
    });

    it("reverts when called by a non-oracle account", async () => {
      await expect(
        verification.connect(stranger).recordVerification(requestId, 8)
      ).to.be.revertedWithCustomError(verification, "AccessControlUnauthorizedAccount");
    });

    it("reverts a score greater than 10", async () => {
      await expect(
        verification.connect(oracle).recordVerification(requestId, 11)
      ).to.be.revertedWith("Score out of range");
    });

    it("reverts posting a score twice for the same request", async () => {
      await verification.connect(oracle).recordVerification(requestId, 8);
      await expect(
        verification.connect(oracle).recordVerification(requestId, 9)
      ).to.be.revertedWith("Not awaiting a score");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // finalize
  // ──────────────────────────────────────────────────────────────────────────

  describe("finalize", () => {
    let requestId: bigint;

    beforeEach(async () => {
      await verification
        .connect(agent)
        .requestVerification(reportHash("finalize report"), Tier.Standard, referrer.address);
      requestId = 1n;
      await verification.connect(oracle).recordVerification(requestId, 7);
    });

    it("reverts before the challenge window elapses", async () => {
      await expect(verification.finalize(requestId)).to.be.revertedWith(
        "Challenge window still open"
      );
    });

    it("reverts finalizing a request that was never posted", async () => {
      await verification
        .connect(agent)
        .requestVerification(reportHash("never posted"), Tier.Standard, ethers.ZeroAddress);
      await expect(verification.finalize(2n)).to.be.revertedWith("Not finalizable");
    });

    it("splits the fee 10% cashback / 90% treasury when a referrer was set", async () => {
      await time.increase(24 * 3600 + 1);

      const treasuryBefore = await token.balanceOf(treasury.address);
      const expectedCashback = (STANDARD_FEE * 1_000n) / 10_000n;
      const expectedTreasury = STANDARD_FEE - expectedCashback;

      await expect(verification.finalize(requestId))
        .to.emit(verification, "VerificationFinalized")
        .withArgs(requestId, expectedCashback, expectedTreasury);

      expect(await verification.claimableCashback(referrer.address)).to.equal(expectedCashback);
      expect(await token.balanceOf(treasury.address)).to.equal(treasuryBefore + expectedTreasury);

      const cert = await verification.getCertificate(requestId);
      expect(cert.status).to.equal(Status.Finalized);
    });

    it("sends the entire fee to treasury when no referrer was set", async () => {
      await verification
        .connect(agent)
        .requestVerification(reportHash("no referrer"), Tier.Standard, ethers.ZeroAddress);
      const id2 = 2n;
      await verification.connect(oracle).recordVerification(id2, 6);
      await time.increase(24 * 3600 + 1);

      const treasuryBefore = await token.balanceOf(treasury.address);
      await expect(verification.finalize(id2))
        .to.emit(verification, "VerificationFinalized")
        .withArgs(id2, 0n, STANDARD_FEE);

      expect(await token.balanceOf(treasury.address)).to.equal(treasuryBefore + STANDARD_FEE);
    });

    it("is callable by anyone (permissionless keeper-style finalize)", async () => {
      await time.increase(24 * 3600 + 1);
      await expect(verification.connect(stranger).finalize(requestId)).to.not.be.reverted;
    });

    it("reverts finalizing an already-finalized request", async () => {
      await time.increase(24 * 3600 + 1);
      await verification.finalize(requestId);
      await expect(verification.finalize(requestId)).to.be.revertedWith("Not finalizable");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // dispute + resolveDispute
  // ──────────────────────────────────────────────────────────────────────────

  describe("dispute", () => {
    let requestId: bigint;

    beforeEach(async () => {
      await verification
        .connect(agent)
        .requestVerification(reportHash("disputable report"), Tier.Standard, referrer.address);
      requestId = 1n;
      await verification.connect(oracle).recordVerification(requestId, 4);
    });

    it("pulls a 2x-fee bond and moves status to Disputed", async () => {
      const bond = STANDARD_FEE * 2n;
      const strangerBefore = await token.balanceOf(stranger.address);

      await expect(verification.connect(stranger).dispute(requestId))
        .to.emit(verification, "VerificationDisputed")
        .withArgs(requestId, stranger.address, bond);

      expect(await token.balanceOf(stranger.address)).to.equal(strangerBefore - bond);

      const cert = await verification.getCertificate(requestId);
      expect(cert.status).to.equal(Status.Disputed);
    });

    it("reverts disputing after the challenge window closes", async () => {
      await time.increase(24 * 3600 + 1);
      await expect(verification.connect(stranger).dispute(requestId)).to.be.revertedWith(
        "Challenge window closed"
      );
    });

    it("reverts disputing a request twice", async () => {
      await verification.connect(stranger).dispute(requestId);
      await token.connect(reserve).transfer(referrer.address, ethers.parseEther("100"));
      await token
        .connect(referrer)
        .approve(await verification.getAddress(), ethers.parseEther("100"));
      await expect(verification.connect(referrer).dispute(requestId)).to.be.revertedWith(
        "Not disputable"
      );
    });

    it("reverts disputing a request that was never posted", async () => {
      await verification
        .connect(agent)
        .requestVerification(reportHash("still pending"), Tier.Standard, ethers.ZeroAddress);
      await expect(verification.connect(stranger).dispute(2n)).to.be.revertedWith(
        "Not disputable"
      );
    });
  });

  describe("resolveDispute", () => {
    let requestId: bigint;
    const bond = STANDARD_FEE * 2n;

    beforeEach(async () => {
      await verification
        .connect(agent)
        .requestVerification(reportHash("dispute resolution"), Tier.Standard, referrer.address);
      requestId = 1n;
      await verification.connect(oracle).recordVerification(requestId, 3);
      await verification.connect(stranger).dispute(requestId);
    });

    it("reverts when called by a non-arbiter", async () => {
      await expect(
        verification.connect(stranger).resolveDispute(requestId, true, 9)
      ).to.be.revertedWithCustomError(verification, "AccessControlUnauthorizedAccount");
    });

    it("upheld: refunds the bond, corrects the score, and finalizes with the fee split", async () => {
      const strangerBefore = await token.balanceOf(stranger.address);
      const treasuryBefore = await token.balanceOf(treasury.address);
      const expectedCashback = (STANDARD_FEE * 1_000n) / 10_000n;
      const expectedTreasury = STANDARD_FEE - expectedCashback;

      const tx = await verification.connect(arbiter).resolveDispute(requestId, true, 9);
      await expect(tx).to.emit(verification, "VerificationResolved").withArgs(requestId, true, 9);
      await expect(tx)
        .to.emit(verification, "VerificationFinalized")
        .withArgs(requestId, expectedCashback, expectedTreasury);

      expect(await token.balanceOf(stranger.address)).to.equal(strangerBefore + bond);
      expect(await token.balanceOf(treasury.address)).to.equal(treasuryBefore + expectedTreasury);
      expect(await verification.claimableCashback(referrer.address)).to.equal(expectedCashback);

      const cert = await verification.getCertificate(requestId);
      expect(cert.score).to.equal(9);
      expect(cert.status).to.equal(Status.Finalized);
    });

    it("rejected: forfeits the bond to treasury and keeps the original score", async () => {
      const treasuryBefore = await token.balanceOf(treasury.address);
      const expectedCashback = (STANDARD_FEE * 1_000n) / 10_000n;
      const expectedTreasury = STANDARD_FEE - expectedCashback;

      await expect(verification.connect(arbiter).resolveDispute(requestId, false, 0))
        .to.emit(verification, "VerificationResolved")
        .withArgs(requestId, false, 0);

      // Treasury gets the forfeited bond PLUS its share of the finalized fee.
      expect(await token.balanceOf(treasury.address)).to.equal(
        treasuryBefore + bond + expectedTreasury
      );

      const cert = await verification.getCertificate(requestId);
      expect(cert.score).to.equal(3); // unchanged from the original oracle score
      expect(cert.status).to.equal(Status.Finalized);
    });

    it("reverts resolving a request that isn't disputed", async () => {
      await verification
        .connect(agent)
        .requestVerification(reportHash("not disputed"), Tier.Standard, ethers.ZeroAddress);
      await verification.connect(oracle).recordVerification(2n, 5);
      await expect(
        verification.connect(arbiter).resolveDispute(2n, true, 5)
      ).to.be.revertedWith("Not disputed");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // claimRewards
  // ──────────────────────────────────────────────────────────────────────────

  describe("claimRewards", () => {
    it("transfers the claimable cashback and zeroes the balance", async () => {
      await verification
        .connect(agent)
        .requestVerification(reportHash("cashback report"), Tier.Standard, referrer.address);
      await verification.connect(oracle).recordVerification(1n, 8);
      await time.increase(24 * 3600 + 1);
      await verification.finalize(1n);

      const expectedCashback = (STANDARD_FEE * 1_000n) / 10_000n;
      expect(await verification.claimableCashback(referrer.address)).to.equal(expectedCashback);

      const before = await token.balanceOf(referrer.address);
      await expect(verification.connect(referrer).claimRewards())
        .to.emit(verification, "CashbackClaimed")
        .withArgs(referrer.address, expectedCashback);

      expect(await token.balanceOf(referrer.address)).to.equal(before + expectedCashback);
      expect(await verification.claimableCashback(referrer.address)).to.equal(0n);
    });

    it("reverts when there is nothing to claim", async () => {
      await expect(verification.connect(stranger).claimRewards()).to.be.revertedWith(
        "Nothing to claim"
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Premium tier (Chainlink Functions scaffold — admin-gated off by default)
  // ──────────────────────────────────────────────────────────────────────────

  describe("Premium tier", () => {
    beforeEach(async () => {
      await verification
        .connect(admin)
        .setFunctionsConfig(await router.getAddress(), DON_ID, SUBSCRIPTION_ID);
    });

    it("stays disabled by default even after Functions config is set", async () => {
      await expect(
        verification
          .connect(agent)
          .requestVerification(reportHash("premium1"), Tier.Premium, ethers.ZeroAddress)
      ).to.be.revertedWith("Premium tier not yet active");
    });

    it("allows the premium flow end-to-end once admin-enabled", async () => {
      await verification.connect(admin).setPremiumEnabled(true);

      await token.connect(reserve).transfer(agent.address, PREMIUM_FEE);
      await token.connect(agent).approve(await verification.getAddress(), PREMIUM_FEE);

      await verification
        .connect(agent)
        .requestVerification(reportHash("premium2"), Tier.Premium, ethers.ZeroAddress);
      const requestId = 1n;

      const tx = await verification
        .connect(oracle)
        .triggerPremiumOracle(requestId, "return Functions.encodeUint256(8);");
      await expect(tx).to.emit(verification, "PremiumOracleRequested");

      const chainlinkRequestId = await router.lastRequestId();
      await router.fulfillSuccess(await verification.getAddress(), chainlinkRequestId, 8n);

      const cert = await verification.getCertificate(requestId);
      expect(cert.status).to.equal(Status.Posted);
      expect(cert.score).to.equal(8);
    });

    it("reverts triggerPremiumOracle when called by a non-oracle", async () => {
      await verification.connect(admin).setPremiumEnabled(true);
      await token.connect(reserve).transfer(agent.address, PREMIUM_FEE);
      await token.connect(agent).approve(await verification.getAddress(), PREMIUM_FEE);
      await verification
        .connect(agent)
        .requestVerification(reportHash("premium3"), Tier.Premium, ethers.ZeroAddress);

      await expect(
        verification.connect(stranger).triggerPremiumOracle(1n, "src")
      ).to.be.revertedWithCustomError(verification, "AccessControlUnauthorizedAccount");
    });

    it("leaves the request untouched on an oracle error response", async () => {
      await verification.connect(admin).setPremiumEnabled(true);
      await token.connect(reserve).transfer(agent.address, PREMIUM_FEE);
      await token.connect(agent).approve(await verification.getAddress(), PREMIUM_FEE);
      await verification
        .connect(agent)
        .requestVerification(reportHash("premium4"), Tier.Premium, ethers.ZeroAddress);

      await verification.connect(oracle).triggerPremiumOracle(1n, "src");
      const chainlinkRequestId = await router.lastRequestId();
      await router.fulfillError(await verification.getAddress(), chainlinkRequestId, "timeout");

      const cert = await verification.getCertificate(1n);
      expect(cert.status).to.equal(Status.Requested);
    });

    it("reverts the fulfillment callback when called by a non-router address", async () => {
      await expect(
        verification
          .connect(stranger)
          .handleOracleFulfillment(ethers.id("fake"), ethers.toUtf8Bytes(""), ethers.toUtf8Bytes(""))
      ).to.be.revertedWith("Only router can fulfill");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Admin setters
  // ──────────────────────────────────────────────────────────────────────────

  describe("Admin setters", () => {
    it("setTreasury updates treasury and emits an event", async () => {
      await expect(verification.connect(admin).setTreasury(stranger.address))
        .to.emit(verification, "TreasuryChanged")
        .withArgs(treasury.address, stranger.address);
      expect(await verification.treasury()).to.equal(stranger.address);
    });

    it("setChallengeWindow updates the window and emits an event", async () => {
      await expect(verification.connect(admin).setChallengeWindow(3600))
        .to.emit(verification, "ChallengeWindowChanged")
        .withArgs(24n * 3600n, 3600n);
      expect(await verification.challengeWindow()).to.equal(3600n);
    });

    it("setPremiumEnabled toggles the flag and emits an event", async () => {
      await expect(verification.connect(admin).setPremiumEnabled(true))
        .to.emit(verification, "PremiumEnabledChanged")
        .withArgs(true);
      expect(await verification.premiumEnabled()).to.be.true;
    });

    it("reverts admin setters when called by a non-admin", async () => {
      await expect(
        verification.connect(stranger).setTreasury(stranger.address)
      ).to.be.revertedWithCustomError(verification, "AccessControlUnauthorizedAccount");
      await expect(
        verification.connect(stranger).setChallengeWindow(1)
      ).to.be.revertedWithCustomError(verification, "AccessControlUnauthorizedAccount");
      await expect(
        verification.connect(stranger).setPremiumEnabled(true)
      ).to.be.revertedWithCustomError(verification, "AccessControlUnauthorizedAccount");
      await expect(
        verification
          .connect(stranger)
          .setFunctionsConfig(await router.getAddress(), DON_ID, SUBSCRIPTION_ID)
      ).to.be.revertedWithCustomError(verification, "AccessControlUnauthorizedAccount");
    });
  });
});
