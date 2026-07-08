import { ethers } from "ethers";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { mcxEventBus } from "../ws/eventBus.js";
import { logger } from "../lib/logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeployedInfo {
  network: string;
  chainId: number;
  timestamp: string;
  rpcUrl: string;
  contracts: {
    ARZYG_ERC20_AI: {
      address: string;
      deployer: string;
      reserve: string;
      abiPath: string;
      etherscan?: string;
      deploymentBlock?: number | null;
    };
    MockFunctionsRouter?: {
      address: string;
      abiPath: string;
    };
    // ReportVerification is a fully independent contract (its own deploy,
    // own roles) — added alongside ARZYG_ERC20_AI, never replacing it.
    ReportVerification?: {
      address: string;
      deployer: string;
      treasury: string;
      oracleAddress: string;
      arbiterAddress: string;
      abiPath: string;
      etherscan?: string;
      deploymentBlock?: number | null;
    };
  };
}

export interface VerificationCertificate {
  requestId: string;
  agent: string;
  reportHash: string;
  tier: number;
  referrer: string;
  fee: string;
  score: number;
  status: number;
  requestedAt: string;
  postedAt: string;
}

export interface AgentInfo {
  address: string;
  name: string;
  description: string;
  registeredAt: string;
  totalEarned: string;
  totalEarnedWei: string;
  tasksCompleted: string;
  isActive: boolean;
}

export interface SubmitProofResult {
  txHash: string;
  accepted: boolean;
  reward?: string;
  reason?: string;
}

export interface TokenInfo {
  connected: boolean;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  totalSupplyWei: string;
  deployerBalance: string;
  deployerAddress: string;
  chainId: number;
  blockNumber: number;
  rpcUrl: string;
  network: string;
  etherscan?: string;
}

const RETRY_MS = 10_000;

// process.cwd() when the server runs = artifacts/api-server/
// workspace root = two levels up
const _workspaceRoot = resolve(process.cwd(), "..", "..");
const DEPLOY_JSON = resolve(_workspaceRoot, "contracts", "deployed.json");

// ─── Service ──────────────────────────────────────────────────────────────────

class ContractService {
  private provider:    ethers.JsonRpcProvider | null = null;
  private signer:      ethers.Wallet | ethers.JsonRpcSigner | null = null;
  private token:       ethers.Contract | null = null;
  private mockRouter:  ethers.Contract | null = null;
  // ReportVerification — independent contract, own connection state. Kept
  // separate from `token`/`mockRouter` above; never shares an ABI or address
  // with the ARZY-G token.
  private reportVerification: ethers.Contract | null = null;
  private deployed:    DeployedInfo    | null = null;
  private _connected = false;
  private _retryTimer: ReturnType<typeof setTimeout> | null = null;

  // Agent registry cache — avoids re-scanning from block 0 on every
  // listAgents() call, which blows past free-tier eth_getLogs block-range
  // limits (e.g. Alchemy free tier caps ranges at ~10 blocks). We anchor the
  // first scan at the contract's deployment block, then only scan forward
  // incrementally from the last-scanned block on subsequent calls. The live
  // "AgentRegistered" listener also feeds this cache directly.
  private agentAddressCache = new Set<string>();
  private agentScanBlock = 0;
  private agentScanInFlight: Promise<void> | null = null;

  // Server-controlled validator wallet — the ONLY signer allowed to mint via
  // the AI-scored PoU paths (task marketplace completion + dashboard "Submit
  // Proof of Use"). Its key never reaches the frontend; it lives only in the
  // AGENT_PRIVATE_KEY secret. Lazily constructed on first use (after
  // this.provider exists), not at connect time.
  private validatorWallet: ethers.Wallet | null = null;

  // ── Public API ─────────────────────────────────────────────────────────────

  get connected(): boolean { return this._connected; }

  async init(): Promise<void> {
    await this._tryConnect();
  }

  async getTokenInfo(): Promise<TokenInfo | null> {
    if (!this._connected || !this.token || !this.provider || !this.deployed) {
      return null;
    }
    try {
      const deployerAddr = this.deployed.contracts.ARZYG_ERC20_AI.deployer;
      const [name, symbol, decimals, totalSupply, deployerBalance, blockNumber, network] =
        await Promise.all([
          this.token.name(),
          this.token.symbol(),
          this.token.decimals(),
          this.token.totalSupply(),
          this.token.balanceOf(deployerAddr),
          this.provider.getBlockNumber(),
          this.provider.getNetwork(),
        ]);

      return {
        connected:       true,
        address:         this.deployed.contracts.ARZYG_ERC20_AI.address,
        name,
        symbol,
        decimals:        Number(decimals),
        totalSupply:     ethers.formatEther(totalSupply),
        totalSupplyWei:  totalSupply.toString(),
        deployerBalance: ethers.formatEther(deployerBalance),
        deployerAddress: deployerAddr,
        chainId:         Number(network.chainId),
        blockNumber,
        rpcUrl:          this.deployed.rpcUrl,
        network:         this.deployed.network,
        etherscan:       this.deployed.contracts.ARZYG_ERC20_AI.etherscan,
      };
    } catch (err) {
      logger.warn({ err }, "contractService.getTokenInfo failed");
      this._handleDisconnect();
      return null;
    }
  }

  /**
   * Trigger on-chain mint cycle.
   * On local Hardhat: full cycle via MockFunctionsRouter.
   * On Sepolia/mainnet: only requestUsefulness (oracle fulfillment is async).
   */
  async triggerMintDemo(
    agentAddress: string,
    proof: string,
    amount: bigint
  ): Promise<{ requestTxHash: string; fulfillTxHash: string }> {
    if (!this._connected || !this.token || !this.signer) {
      throw new Error("Contract not connected");
    }

    const isLocal = this.deployed?.chainId === 31337;

    // Step 1: requestUsefulness
    const reqTx = await (this.token.connect(this.signer) as ethers.Contract).requestUsefulness(
      agentAddress,
      proof,
      amount
    );
    const reqReceipt = await reqTx.wait();

    mcxEventBus.publish("SystemMessage", {
      message: isLocal
        ? "requestUsefulness sent — triggering mock oracle…"
        : `requestUsefulness sent on Sepolia — tx: ${reqTx.hash.slice(0, 12)}… (oracle async)`,
    });

    let fulfillTxHash = "";

    // Step 2: mock oracle only on local Hardhat
    if (isLocal && this.mockRouter) {
      const tokenAddr  = await this.token.getAddress();
      const requestId  = await this.mockRouter.lastRequestId();
      const fulfillTx  = await (this.mockRouter.connect(this.signer) as ethers.Contract).fulfillSuccess(
        tokenAddr,
        requestId,
        5n
      );
      await fulfillTx.wait();
      fulfillTxHash = fulfillTx.hash;
    }

    const info = await this.getTokenInfo();
    if (info) {
      mcxEventBus.publish("SystemMessage", {
        message: `Chain sync: ${info.totalSupply} ARZYG total supply · block #${info.blockNumber}`,
      });
    }

    return {
      requestTxHash: reqReceipt?.hash ?? reqTx.hash,
      fulfillTxHash,
    };
  }

  // ── Agent registry ──────────────────────────────────────────────────────────

  async registerAgent(
    privateKey: string,
    name: string,
    description: string
  ): Promise<{ txHash: string; agentAddress: string }> {
    if (!this._connected || !this.token || !this.provider) {
      throw new Error("Contract not connected");
    }

    let wallet: ethers.Wallet;
    try {
      wallet = new ethers.Wallet(privateKey, this.provider);
    } catch {
      throw new Error("Invalid private key");
    }

    const tokenWithSigner = this.token.connect(wallet) as ethers.Contract;
    const tx = await tokenWithSigner.registerAgent(name, description);
    const receipt = await tx.wait();

    return { txHash: receipt?.hash ?? tx.hash, agentAddress: wallet.address };
  }

  async submitProof(
    privateKey: string,
    agentAddress: string,
    proof: string,
    amount: bigint,
    score: bigint
  ): Promise<SubmitProofResult> {
    if (!this._connected || !this.token || !this.provider) {
      throw new Error("Contract not connected");
    }

    let wallet: ethers.Wallet;
    try {
      wallet = new ethers.Wallet(privateKey, this.provider);
    } catch {
      throw new Error("Invalid private key");
    }

    if (wallet.address.toLowerCase() !== agentAddress.toLowerCase()) {
      throw new Error(
        "agentAddress does not match the address derived from privateKey — submitProof always credits the caller (msg.sender)"
      );
    }

    const tokenWithSigner = this.token.connect(wallet) as ethers.Contract;
    const tx = await tokenWithSigner.submitProof(proof, amount, score);
    const receipt = await tx.wait();

    let accepted = false;
    let reward: string | undefined;
    let reason: string | undefined;

    if (receipt) {
      for (const log of receipt.logs) {
        let parsed: ethers.LogDescription | null = null;
        try {
          parsed = this.token.interface.parseLog(log);
        } catch {
          continue;
        }
        if (!parsed) continue;

        if (parsed.name === "ProofAccepted") {
          accepted = true;
          reward = (parsed.args.reward as bigint).toString();
        } else if (parsed.name === "ProofRejected") {
          accepted = false;
          reason = parsed.args.reason as string;
        }
      }
    }

    return { txHash: receipt?.hash ?? tx.hash, accepted, reward, reason };
  }

  /** Reads a live ARZY-G token balance for an address. */
  async getBalance(address: string): Promise<string | null> {
    if (!this._connected || !this.token) return null;
    const bal = await this.token.balanceOf(address);
    return ethers.formatEther(bal);
  }

  // ── Validator wallet (server-signed AI-scored mint paths) ──────────────────

  private _getValidatorWallet(): ethers.Wallet {
    if (!this.provider) {
      throw new Error("Contract not connected");
    }
    if (!this.validatorWallet) {
      const privateKey = process.env.AGENT_PRIVATE_KEY;
      if (!privateKey) {
        throw new Error("AGENT_PRIVATE_KEY secret not set — cannot run the server-side PoU validator");
      }
      this.validatorWallet = new ethers.Wallet(privateKey, this.provider);
    }
    return this.validatorWallet;
  }

  /** The server validator's own on-chain address (for logging/diagnostics). */
  get validatorAddress(): string | null {
    try {
      return this._getValidatorWallet().address;
    } catch {
      return null;
    }
  }

  /**
   * Registers the validator wallet as an on-chain agent if it isn't already
   * active. Required once before it can call submitProof.
   */
  async ensureValidatorRegistered(): Promise<void> {
    if (!this._connected || !this.token) {
      throw new Error("Contract not connected");
    }
    const wallet = this._getValidatorWallet();
    const info = await this.getAgentInfo(wallet.address);
    if (info?.isActive) return;

    logger.info({ validator: wallet.address }, "contractService: registering PoU validator wallet on-chain");
    const tokenWithSigner = this.token.connect(wallet) as ethers.Contract;
    const tx = await tokenWithSigner.registerAgent(
      "MetaCoreX PoU Validator",
      "Server-side AI validator — mints on behalf of AI-scored proof submissions"
    );
    await tx.wait();
  }

  /**
   * Submits a proof-of-work as the server's OWN validator wallet (never a
   * user-supplied address or key). This is the only mint path reachable from
   * the website — see pouMintService.ts, which calls this only after a real
   * Gemini score has been computed server-side. The reward always lands on
   * the validator wallet itself; callers are expected to follow up with
   * transferFromValidator() to forward it to the actual recipient.
   */
  async submitProofAsValidator(proof: string, amount: bigint, score: number): Promise<SubmitProofResult> {
    if (!this._connected || !this.token) {
      throw new Error("Contract not connected");
    }
    const wallet = this._getValidatorWallet();
    const tokenWithSigner = this.token.connect(wallet) as ethers.Contract;
    const tx = await tokenWithSigner.submitProof(proof, amount, BigInt(score));
    const receipt = await tx.wait();

    let accepted = false;
    let reward: string | undefined;
    let reason: string | undefined;

    if (receipt) {
      for (const log of receipt.logs) {
        let parsed: ethers.LogDescription | null = null;
        try {
          parsed = this.token.interface.parseLog(log);
        } catch {
          continue;
        }
        if (!parsed) continue;

        if (parsed.name === "ProofAccepted") {
          accepted = true;
          reward = (parsed.args.reward as bigint).toString();
        } else if (parsed.name === "ProofRejected") {
          accepted = false;
          reason = parsed.args.reason as string;
        }
      }
    }

    return { txHash: receipt?.hash ?? tx.hash, accepted, reward, reason };
  }

  /**
   * Forwards ARZY-G from the validator wallet to `to` via a plain ERC20
   * transfer. Used right after submitProofAsValidator() to route the freshly
   * minted reward to the actual agent/recipient address.
   */
  async transferFromValidator(to: string, amountWei: bigint): Promise<string> {
    if (!this._connected || !this.token) {
      throw new Error("Contract not connected");
    }
    const wallet = this._getValidatorWallet();
    const tokenWithSigner = this.token.connect(wallet) as ethers.Contract;
    const tx = await tokenWithSigner.transfer(to, amountWei);
    const receipt = await tx.wait();
    return receipt?.hash ?? tx.hash;
  }

  async getAgentInfo(address: string): Promise<AgentInfo | null> {
    if (!this._connected || !this.token) {
      return null;
    }

    const result = await this.token.getAgentInfo(address);

    return {
      address,
      name: result.name as string,
      description: result.description as string,
      registeredAt: (result.registeredAt as bigint).toString(),
      totalEarned: ethers.formatEther(result.totalEarned as bigint),
      totalEarnedWei: (result.totalEarned as bigint).toString(),
      tasksCompleted: (result.tasksCompleted as bigint).toString(),
      isActive: result.isActive as boolean,
    };
  }

  async listAgents(): Promise<AgentInfo[]> {
    if (!this._connected || !this.token) {
      return [];
    }

    try {
      await this._scanAgentRegistrations();

      const infos = await Promise.all(
        [...this.agentAddressCache].map((addr) => this.getAgentInfo(addr))
      );

      return infos.filter((info): info is AgentInfo => info !== null && info.isActive);
    } catch (err) {
      logger.warn({ err }, "contractService.listAgents failed");
      return [];
    }
  }

  /**
   * Incrementally scans for AgentRegistered logs since the last scanned
   * block and merges any new addresses into agentAddressCache. Coalesces
   * concurrent callers into a single in-flight scan.
   */
  private async _scanAgentRegistrations(): Promise<void> {
    if (!this.token || !this.provider) return;

    if (this.agentScanInFlight) {
      await this.agentScanInFlight;
      return;
    }

    const run = async (): Promise<void> => {
      if (!this.token || !this.provider) return;
      const latest = await this.provider.getBlockNumber();
      if (this.agentScanBlock > latest) return;

      const filter = this.token.filters.AgentRegistered();
      // Only advance the checkpoint if the ENTIRE range is confirmed scanned.
      // If any sub-range ultimately fails (e.g. persistent RPC error), the
      // checkpoint must NOT move past it — otherwise those blocks are never
      // retried and any registrations in them are silently lost forever.
      let events: ethers.EventLog[];
      try {
        events = await this._queryFilterAdaptive(filter, this.agentScanBlock, latest);
      } catch (err) {
        logger.warn(
          { err, fromBlock: this.agentScanBlock, toBlock: latest },
          "contractService: agent registration scan failed, will retry on next call"
        );
        return;
      }

      for (const e of events) {
        this.agentAddressCache.add((e.args.agent as string).toLowerCase());
      }

      this.agentScanBlock = latest + 1;
    };

    this.agentScanInFlight = run().finally(() => {
      this.agentScanInFlight = null;
    });

    await this.agentScanInFlight;
  }

  /**
   * Queries a log filter over [fromBlock, toBlock], recursively halving the
   * range on provider errors (e.g. "block range too large" from free-tier
   * RPC plans) until each sub-range succeeds or hits a minimal 1-block
   * window. This avoids hard-coding any particular provider's limit.
   */
  private static readonly RATE_LIMIT_MAX_RETRIES = 4;

  private static isRateLimitError(err: unknown): boolean {
    const message = err instanceof Error ? err.message : String(err);
    return message.includes("429") || /compute units/i.test(message);
  }

  private async _queryFilterAdaptive(
    filter: ethers.DeferredTopicFilter,
    fromBlock: number,
    toBlock: number
  ): Promise<ethers.EventLog[]> {
    if (!this.token || fromBlock > toBlock) return [];

    for (let attempt = 0; attempt <= ContractService.RATE_LIMIT_MAX_RETRIES; attempt++) {
      try {
        const logs = await this.token.queryFilter(filter, fromBlock, toBlock);
        return logs.filter((l): l is ethers.EventLog => "args" in l);
      } catch (err) {
        // Free-tier RPC plans (e.g. Alchemy) rate-limit compute units/sec —
        // this fires even on small/single-block ranges under bursty load, so
        // back off and retry in place before ever giving up on this range.
        if (ContractService.isRateLimitError(err) && attempt < ContractService.RATE_LIMIT_MAX_RETRIES) {
          const backoffMs = 400 * 2 ** attempt;
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }

        const range = toBlock - fromBlock;
        if (range <= 0) {
          // Minimal 1-block window still fails after retries — propagate so the
          // caller does NOT advance its scan checkpoint past this block (see
          // _scanAgentRegistrations). Silently returning [] here would
          // permanently lose any registration in this block.
          throw err;
        }
        // Bisect sequentially (not in parallel) — firing concurrent sub-queries
        // is what triggers the compute-units-per-second rate limit in the
        // first place, so parallel recursion here would make it worse.
        const mid = fromBlock + Math.floor(range / 2);
        const left = await this._queryFilterAdaptive(filter, fromBlock, mid);
        const right = await this._queryFilterAdaptive(filter, mid + 1, toBlock);
        return [...left, ...right];
      }
    }

    return [];
  }

  // ── Proof indexing (PoU analytics) ──────────────────────────────────────────

  /** Block the ARZY-G contract was deployed at, if known — used to anchor a full backfill. */
  get deploymentBlock(): number | null {
    return this.deployed?.contracts.ARZYG_ERC20_AI.deploymentBlock ?? null;
  }

  /** Block ReportVerification was deployed at — anchors its own, separate indexer. */
  get reportVerificationDeploymentBlock(): number | null {
    return this.deployed?.contracts.ReportVerification?.deploymentBlock ?? null;
  }

  get reportVerificationAddress(): string | null {
    return this.deployed?.contracts.ReportVerification?.address ?? null;
  }

  get reportVerificationConnected(): boolean {
    return this.reportVerification !== null;
  }

  async getCurrentBlockNumber(): Promise<number | null> {
    if (!this.provider) return null;
    return this.provider.getBlockNumber();
  }

  /**
   * Scans [fromBlock, toBlock] for `ProofAccepted` logs and returns them in a
   * DB-ready shape, including the block timestamp (fetched per unique block).
   * Uses the same adaptive/rate-limit-safe scanner as the agent registry scan.
   */
  async scanProofAcceptedLogs(
    fromBlock: number,
    toBlock: number
  ): Promise<
    Array<{
      agentAddress: string;
      proof: string;
      amountWei: string;
      rewardWei: string;
      score: number;
      txHash: string;
      logIndex: number;
      blockNumber: number;
      blockTimestamp: Date;
    }>
  > {
    if (!this.token || !this.provider || fromBlock > toBlock) return [];

    const filter = this.token.filters.ProofAccepted();
    const events = await this._queryFilterAdaptive(filter, fromBlock, toBlock);
    if (events.length === 0) return [];

    // Fetch each distinct block's timestamp once, not once per event.
    const blockNumbers = [...new Set(events.map((e) => e.blockNumber))];
    const blockTimestamps = new Map<number, Date>();
    for (const bn of blockNumbers) {
      const block = await this.provider.getBlock(bn);
      blockTimestamps.set(bn, block ? new Date(block.timestamp * 1000) : new Date());
    }

    return events.map((e) => ({
      agentAddress: (e.args.agent as string).toLowerCase(),
      proof: e.args.proof as string,
      amountWei: (e.args.amount as bigint).toString(),
      rewardWei: (e.args.reward as bigint).toString(),
      score: Number(e.args.score as bigint),
      txHash: e.transactionHash,
      logIndex: e.index,
      blockNumber: e.blockNumber,
      blockTimestamp: blockTimestamps.get(e.blockNumber) ?? new Date(),
    }));
  }

  // ── ReportVerification: event scanning (feeds verificationIndexer.ts) ──────

  /**
   * Scans [fromBlock, toBlock] for every ReportVerification lifecycle event.
   * Must return ALL of Requested/Posted/Disputed/Resolved/Finalized — dispute
   * and arbiter resolution happen entirely on-chain (no API route involved),
   * so the indexer is the only place the DB can learn about them. Missing
   * any one of these means a request's DB status can silently go stale
   * forever (see verification_requests schema note).
   */
  async scanVerificationEvents(
    fromBlock: number,
    toBlock: number
  ): Promise<{
    requested: Array<{
      requestId: string;
      agentAddress: string;
      reportHash: string;
      tier: number;
      referrer: string;
      feeWei: string;
      txHash: string;
      logIndex: number;
      blockNumber: number;
      blockTimestamp: Date;
    }>;
    posted: Array<{ requestId: string; score: number; txHash: string; logIndex: number; blockNumber: number }>;
    disputed: Array<{
      requestId: string;
      disputerAddress: string;
      bondWei: string;
      txHash: string;
      logIndex: number;
      blockNumber: number;
    }>;
    resolved: Array<{
      requestId: string;
      upheld: boolean;
      newScore: number;
      txHash: string;
      logIndex: number;
      blockNumber: number;
    }>;
    finalized: Array<{
      requestId: string;
      cashbackWei: string;
      treasuryAmountWei: string;
      txHash: string;
      logIndex: number;
      blockNumber: number;
    }>;
  }> {
    const empty = { requested: [], posted: [], disputed: [], resolved: [], finalized: [] };
    if (!this.reportVerification || fromBlock > toBlock) return empty;

    const rv = this.reportVerification;
    const [requestedLogs, postedLogs, disputedLogs, resolvedLogs, finalizedLogs] = await Promise.all([
      this._queryFilterAdaptive(rv.filters.VerificationRequested(), fromBlock, toBlock),
      this._queryFilterAdaptive(rv.filters.VerificationPosted(), fromBlock, toBlock),
      this._queryFilterAdaptive(rv.filters.VerificationDisputed(), fromBlock, toBlock),
      this._queryFilterAdaptive(rv.filters.VerificationResolved(), fromBlock, toBlock),
      this._queryFilterAdaptive(rv.filters.VerificationFinalized(), fromBlock, toBlock),
    ]);

    // Only the "requested" row persists a blockTimestamp column, so only
    // fetch block times for that subset (one lookup per distinct block).
    const requestedBlockNumbers = [...new Set(requestedLogs.map((e) => e.blockNumber))];
    const requestedBlockTimestamps = new Map<number, Date>();
    for (const bn of requestedBlockNumbers) {
      const block = await this.provider?.getBlock(bn);
      requestedBlockTimestamps.set(bn, block ? new Date(block.timestamp * 1000) : new Date());
    }

    return {
      requested: requestedLogs.map((e) => ({
        requestId: (e.args.requestId as bigint).toString(),
        agentAddress: (e.args.agent as string).toLowerCase(),
        reportHash: e.args.reportHash as string,
        tier: Number(e.args.tier as bigint),
        referrer: (e.args.referrer as string).toLowerCase(),
        feeWei: (e.args.fee as bigint).toString(),
        txHash: e.transactionHash,
        logIndex: e.index,
        blockNumber: e.blockNumber,
        blockTimestamp: requestedBlockTimestamps.get(e.blockNumber) ?? new Date(),
      })),
      posted: postedLogs.map((e) => ({
        requestId: (e.args.requestId as bigint).toString(),
        score: Number(e.args.score as bigint),
        txHash: e.transactionHash,
        logIndex: e.index,
        blockNumber: e.blockNumber,
      })),
      disputed: disputedLogs.map((e) => ({
        requestId: (e.args.requestId as bigint).toString(),
        disputerAddress: (e.args.disputer as string).toLowerCase(),
        bondWei: (e.args.bond as bigint).toString(),
        txHash: e.transactionHash,
        logIndex: e.index,
        blockNumber: e.blockNumber,
      })),
      resolved: resolvedLogs.map((e) => ({
        requestId: (e.args.requestId as bigint).toString(),
        upheld: e.args.upheld as boolean,
        newScore: Number(e.args.newScore as bigint),
        txHash: e.transactionHash,
        logIndex: e.index,
        blockNumber: e.blockNumber,
      })),
      finalized: finalizedLogs.map((e) => ({
        requestId: (e.args.requestId as bigint).toString(),
        cashbackWei: (e.args.cashback as bigint).toString(),
        treasuryAmountWei: (e.args.treasuryAmount as bigint).toString(),
        txHash: e.transactionHash,
        logIndex: e.index,
        blockNumber: e.blockNumber,
      })),
    };
  }

  // ── ReportVerification: oracle-signed writes (worker-only, never a route) ──

  /**
   * Posts a score for a pending verification request as the server's own
   * validator wallet (ORACLE_ROLE on ReportVerification — granted at deploy
   * time to the same AGENT_PRIVATE_KEY wallet used for PoU minting). Mirrors
   * submitProofAsValidator()'s trust model: no route may call this directly,
   * only the scoring worker after it has computed a real Gemini score.
   */
  async recordVerificationAsOracle(requestId: bigint, score: number): Promise<{ txHash: string }> {
    if (!this.reportVerification) {
      throw new Error("ReportVerification not connected");
    }
    const wallet = this._getValidatorWallet();
    const rvWithSigner = this.reportVerification.connect(wallet) as ethers.Contract;
    const tx = await rvWithSigner.recordVerification(requestId, score);
    const receipt = await tx.wait();
    return { txHash: receipt?.hash ?? tx.hash };
  }

  /** Read-only certificate lookup — used by GET /verify/:requestId. */
  async getVerificationCertificate(requestId: bigint): Promise<VerificationCertificate | null> {
    if (!this.reportVerification) return null;
    const result = await this.reportVerification.getCertificate(requestId);
    return {
      requestId: requestId.toString(),
      agent: (result.agent as string).toLowerCase(),
      reportHash: result.reportHash as string,
      tier: Number(result.tier as bigint),
      referrer: (result.referrer as string).toLowerCase(),
      fee: ethers.formatEther(result.fee as bigint),
      score: Number(result.score as bigint),
      status: Number(result.status as bigint),
      requestedAt: "0", // not exposed by getCertificate; requested time comes from the DB row
      postedAt: (result.postedAt as bigint).toString(),
    };
  }

  /** Read-only claimable cashback balance for a referrer/platform address. */
  async getClaimableCashback(address: string): Promise<string | null> {
    if (!this.reportVerification) return null;
    const amount = await this.reportVerification.claimableCashback(address);
    return ethers.formatEther(amount as bigint);
  }

  // ── Connection lifecycle ────────────────────────────────────────────────────

  private async _tryConnect(): Promise<void> {
    if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }

    try {
      if (!existsSync(DEPLOY_JSON)) {
        logger.info("contractService: deployed.json not found — waiting");
        this._scheduleRetry();
        return;
      }

      const raw = readFileSync(DEPLOY_JSON, "utf-8");
      const deployed: DeployedInfo = JSON.parse(raw);
      this.deployed = deployed;

      // ABI path
      const tokenAbiPath = resolve(_workspaceRoot, deployed.contracts.ARZYG_ERC20_AI.abiPath);
      if (!existsSync(tokenAbiPath)) {
        logger.info({ tokenAbiPath }, "contractService: ABI not found — waiting for compile");
        this._scheduleRetry();
        return;
      }
      const tokenAbi = JSON.parse(readFileSync(tokenAbiPath, "utf-8")).abi;

      // RPC URL — prefer env var, fallback to deployed.json
      const rpcUrl =
        process.env.SEPOLIA_RPC_URL ??
        process.env.ETH_RPC_URL ??
        deployed.rpcUrl;

      const provider = new ethers.JsonRpcProvider(rpcUrl);
      await provider.getBlockNumber();

      this.provider = provider;

      // Signer — use private key on live networks, getSigner(0) on local Hardhat
      if (deployed.chainId === 31337) {
        this.signer = await provider.getSigner(0);
      } else {
        const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
        if (!privateKey) {
          throw new Error("DEPLOYER_PRIVATE_KEY secret not set — cannot sign transactions on live network");
        }
        this.signer = new ethers.Wallet(privateKey, provider);
      }

      this.token = new ethers.Contract(
        deployed.contracts.ARZYG_ERC20_AI.address,
        tokenAbi,
        provider
      );

      // MockFunctionsRouter — local only
      if (deployed.contracts.MockFunctionsRouter) {
        const routerAbiPath = resolve(
          _workspaceRoot,
          deployed.contracts.MockFunctionsRouter.abiPath
        );
        if (existsSync(routerAbiPath)) {
          const routerAbi = JSON.parse(readFileSync(routerAbiPath, "utf-8")).abi;
          this.mockRouter = new ethers.Contract(
            deployed.contracts.MockFunctionsRouter.address,
            routerAbi,
            provider
          );
        }
      }

      // ReportVerification — independent contract, optional in deployed.json
      // until its own deploy has run. Never blocks ARZY-G connection if
      // absent or not-yet-compiled; it simply stays disconnected until then.
      if (deployed.contracts.ReportVerification) {
        const rvAbiPath = resolve(_workspaceRoot, deployed.contracts.ReportVerification.abiPath);
        if (existsSync(rvAbiPath)) {
          const rvAbi = JSON.parse(readFileSync(rvAbiPath, "utf-8")).abi;
          this.reportVerification = new ethers.Contract(
            deployed.contracts.ReportVerification.address,
            rvAbi,
            provider
          );
          logger.info(
            { address: deployed.contracts.ReportVerification.address },
            "contractService: connected to ReportVerification"
          );
        } else {
          logger.info({ rvAbiPath }, "contractService: ReportVerification ABI not found — waiting for compile");
        }
      }

      this._connected = true;

      // Anchor the agent-registry scan at the contract's deployment block
      // (if known) so listAgents() never has to scan from block 0. Falls
      // back to the current block, meaning pre-existing agents registered
      // before this server session won't be found until re-registered or
      // deploymentBlock is backfilled.
      const anchorBlock = deployed.contracts.ARZYG_ERC20_AI.deploymentBlock;
      this.agentAddressCache = new Set();
      this.agentScanBlock = typeof anchorBlock === "number" ? anchorBlock : await provider.getBlockNumber();

      const networkLabel = deployed.network === "sepolia"
        ? `Sepolia Testnet (chainId: ${deployed.chainId})`
        : `${deployed.network} (chainId: ${deployed.chainId})`;

      logger.info(
        { address: deployed.contracts.ARZYG_ERC20_AI.address, network: deployed.network },
        `contractService: connected to ARZY-G on ${networkLabel}`
      );

      mcxEventBus.publish("SystemMessage", {
        message: `Blockchain bridge online — ARZY-G @ ${deployed.contracts.ARZYG_ERC20_AI.address} [${deployed.network.toUpperCase()}]`,
        chainId: deployed.chainId,
        network: deployed.network,
      });

      this._subscribeEvents();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.info({ msg }, "contractService: node not ready — retrying");
      this._handleDisconnect();
      this._scheduleRetry();
    }
  }

  private _subscribeEvents(): void {
    if (!this.token) return;

    const token = this.token;

    token.on("MintRequested", (requestId: string, to: string, amount: bigint, proof: string) => {
      mcxEventBus.publish("MintRequested", { requestId, to, amount: amount.toString(), proof, source: "blockchain" });
    });

    token.on("TokenBirthed", (agent: string, totalAmount: bigint, rewardAmount: bigint, feeAmount: bigint) => {
      mcxEventBus.publish("TokenBirthed", {
        agent,
        totalAmount:  totalAmount.toString(),
        rewardAmount: rewardAmount.toString(),
        feeAmount:    feeAmount.toString(),
        source: "blockchain",
      });
    });

    token.on("AIMinted", (to: string, amount: bigint, proof: string) => {
      mcxEventBus.publish("AgentStatusChanged", { status: "active" });
      logger.info({ to, amount: ethers.formatEther(amount), proof }, "AIMinted on-chain");
    });

    token.on("OracleProofRejected", (requestId: string, reason: string) => {
      mcxEventBus.publish("OracleProofRejected", { requestId, reason, source: "blockchain" });
    });

    token.on("AgentRegistered", (agent: string, name: string, description: string, registeredAt: bigint) => {
      this.agentAddressCache.add(agent.toLowerCase());
      mcxEventBus.publish("AgentRegistered", {
        agent,
        name,
        description,
        registeredAt: registeredAt.toString(),
        source: "blockchain",
      });
    });

    token.on("ProofAccepted", (agent: string, proof: string, amount: bigint, score: bigint, reward: bigint) => {
      mcxEventBus.publish("ProofAccepted", {
        agent,
        proof,
        amount: amount.toString(),
        score: score.toString(),
        reward: reward.toString(),
        source: "blockchain",
      });
    });

    token.on("ProofRejected", (agent: string, proof: string, reason: string) => {
      mcxEventBus.publish("ProofRejected", { agent, proof, reason, source: "blockchain" });
    });

    token.on("Transfer", (from: string, to: string, value: bigint) => {
      logger.info({ from, to, value: ethers.formatEther(value) }, "ERC20 Transfer on-chain");
    });

    logger.info("contractService: event listeners active");
  }

  private _handleDisconnect(): void {
    if (this.token) this.token.removeAllListeners().catch(() => {});
    if (this.reportVerification) this.reportVerification.removeAllListeners().catch(() => {});
    this.provider   = null;
    this.signer     = null;
    this.token      = null;
    this.mockRouter = null;
    this.reportVerification = null;
    this._connected = false;
    this.agentAddressCache = new Set();
    this.agentScanBlock = 0;
    this.agentScanInFlight = null;
  }

  private _scheduleRetry(): void {
    this._retryTimer = setTimeout(() => this._tryConnect(), RETRY_MS);
  }
}

export const contractService = new ContractService();
