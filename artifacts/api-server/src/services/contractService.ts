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
const MAX_RETRY_MS = 60_000;

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
  // Tracks consecutive rate-limit failures so reconnect backs off instead of
  // hammering an already-throttled provider every RETRY_MS forever — reset
  // to 0 as soon as a connect attempt succeeds or fails for a non-rate-limit
  // reason.
  private _consecutiveRateLimitFailures = 0;

  // RPC failover — on persistent 429 / 403 errors we rotate through a list of
  // candidate URLs (primary env var first, then public fallbacks) so a single
  // saturated provider doesn't kill indexing. The list is built once after the
  // first successful read of deployed.json and persists across reconnects.
  private static readonly SEPOLIA_RPC_FALLBACKS: readonly string[] = [
    "https://ethereum-sepolia-rpc.publicnode.com",
    "https://rpc.sepolia.org",
    "https://sepolia.drpc.org",
    "https://rpc2.sepolia.org",
    "https://sepolia.gateway.tenderly.co",
  ];
  private _rpcCandidates: string[] = [];
  private _rpcIndex = 0;

  // Never log a full RPC URL — providers like Alchemy/Infura embed the API
  // key directly in the path/query, and this service logs on every connect
  // attempt (including retries), so an unredacted URL would leak the key
  // into log aggregators repeatedly.
  private static _redactRpcUrl(rpcUrl: string): string {
    try {
      const url = new URL(rpcUrl);
      return `${url.protocol}//${url.host}`;
    } catch {
      return "(invalid URL)";
    }
  }

  // Event poller — replaces ethers contract.on() subscriptions which create
  // eth_newFilter + poll via eth_getFilterChanges on every tick (very expensive
  // on Alchemy free tier). Instead, queries new blocks with eth_getLogs every
  // EVENT_POLL_INTERVAL_MS and fans results out to the WS event bus.
  private static readonly EVENT_POLL_INTERVAL_MS = 30_000;
  private _eventPollTimer: ReturnType<typeof setInterval> | null = null;
  private _eventPollBlock = 0;

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
    return (
      message.includes("429") ||
      message.includes("403") ||
      /compute units/i.test(message) ||
      /rate.?limit/i.test(message) ||
      /archive requests require/i.test(message) ||
      /exceeded.*capacity/i.test(message)
    );
  }

  private async _queryFilterAdaptive(
    filter: ethers.DeferredTopicFilter,
    fromBlock: number,
    toBlock: number,
    contract?: ethers.Contract
  ): Promise<ethers.EventLog[]> {
    // Use the explicitly supplied contract (e.g. reportVerification) or fall
    // back to the token — callers MUST pass the correct contract when scanning
    // events that belong to a contract other than the token.
    const c = contract ?? this.token;
    if (!c || fromBlock > toBlock) return [];

    for (let attempt = 0; attempt <= ContractService.RATE_LIMIT_MAX_RETRIES; attempt++) {
      try {
        const logs = await c.queryFilter(filter, fromBlock, toBlock);
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
          // Minimal 1-block window still fails after all retries. If the error
          // is a persistent 403/429 (rate-limit, archive restriction, expired
          // key), rotate to the next RPC candidate immediately instead of
          // hammering the same broken provider on every poll tick.
          if (ContractService.isRateLimitError(err)) {
            this._rpcIndex += 1;
            const next = this._rpcCandidates.length > 0
              ? ContractService._redactRpcUrl(this._rpcCandidates[this._rpcIndex % this._rpcCandidates.length])
              : "(unknown)";
            logger.warn(
              { err, block: fromBlock, nextRpc: next },
              "contractService: single-block scan failed with rate-limit/403 — rotating RPC provider"
            );
            this._handleDisconnect();
          }
          throw err;
        }
        // Bisect sequentially (not in parallel) — firing concurrent sub-queries
        // is what triggers the compute-units-per-second rate limit in the
        // first place, so parallel recursion here would make it worse.
        const mid = fromBlock + Math.floor(range / 2);
        const left = await this._queryFilterAdaptive(filter, fromBlock, mid, c);
        const right = await this._queryFilterAdaptive(filter, mid + 1, toBlock, c);
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
      this._queryFilterAdaptive(rv.filters.VerificationRequested(), fromBlock, toBlock, rv),
      this._queryFilterAdaptive(rv.filters.VerificationPosted(), fromBlock, toBlock, rv),
      this._queryFilterAdaptive(rv.filters.VerificationDisputed(), fromBlock, toBlock, rv),
      this._queryFilterAdaptive(rv.filters.VerificationResolved(), fromBlock, toBlock, rv),
      this._queryFilterAdaptive(rv.filters.VerificationFinalized(), fromBlock, toBlock, rv),
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
    const rv = this.reportVerification;
    const result = await this._callWithRetry(() => rv.getCertificate(requestId));
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
    const rv = this.reportVerification;
    const amount = await this._callWithRetry(() => rv.claimableCashback(address));
    return ethers.formatEther(amount as bigint);
  }

  /**
   * Retries a single read-only RPC call on transient rate-limit errors
   * (e.g. Alchemy free-tier "exceeded compute units per second" 429s), with
   * the same exponential backoff used by _queryFilterAdaptive. Unlike that
   * method, there's no block range to bisect here — a single call either
   * eventually succeeds or, after RATE_LIMIT_MAX_RETRIES, rejects normally
   * so the caller/route can surface a real error instead of hanging.
   */
  private async _callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt <= ContractService.RATE_LIMIT_MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if (ContractService.isRateLimitError(err) && attempt < ContractService.RATE_LIMIT_MAX_RETRIES) {
          const backoffMs = 400 * 2 ** attempt;
          logger.warn({ err, attempt, backoffMs }, "contractService: rate-limited RPC call, retrying");
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }
        throw err;
      }
    }
    // Unreachable — the loop above always either returns or throws.
    throw new Error("_callWithRetry: exhausted retries without resolving");
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

      // RPC URL — build candidate list once (primary env var + public fallbacks),
      // then pick the current rotation index so a saturated provider triggers
      // a switch to the next candidate on the following retry.
      if (this._rpcCandidates.length === 0) {
        const primary =
          process.env.SEPOLIA_RPC_URL ??
          process.env.ETH_RPC_URL ??
          deployed.rpcUrl;
        this._rpcCandidates = [
          primary,
          ...ContractService.SEPOLIA_RPC_FALLBACKS.filter((u) => u !== primary),
        ];
      }
      const rpcUrl = this._rpcCandidates[this._rpcIndex % this._rpcCandidates.length];

      logger.info(
        { rpcUrl: ContractService._redactRpcUrl(rpcUrl), rpcIndex: this._rpcIndex },
        "contractService: connecting to RPC",
      );
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

      this._startEventPoller();
      this._consecutiveRateLimitFailures = 0;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (ContractService.isRateLimitError(err)) {
        this._consecutiveRateLimitFailures += 1;
        // Rotate to the next RPC provider — the current one is saturated.
        this._rpcIndex += 1;
        const nextUrl = this._rpcCandidates.length > 0
          ? ContractService._redactRpcUrl(this._rpcCandidates[this._rpcIndex % this._rpcCandidates.length])
          : "(unknown)";
        logger.info(
          { msg, consecutiveFailures: this._consecutiveRateLimitFailures, nextRpc: nextUrl },
          "contractService: RPC rate-limited during connect — rotating provider and retrying"
        );
      } else {
        this._consecutiveRateLimitFailures = 0;
        logger.info({ msg }, "contractService: node not ready — retrying");
      }
      this._handleDisconnect();
    }
  }

  /**
   * Starts a polling loop that replaces the old contract.on() subscriptions.
   * ethers v6 contract.on() internally creates eth_newFilter objects and polls
   * them via eth_getFilterChanges on every tick — each active filter costs
   * Alchemy compute units, and 8+ simultaneous filters quickly exhaust the
   * free-tier CU/s budget, producing a wall of 429 errors.
   *
   * This poller uses the same eth_getLogs approach as the indexers: one
   * queryFilter call per event type every EVENT_POLL_INTERVAL_MS seconds,
   * much cheaper and fully compatible with free-tier RPC plans.
   */
  private _startEventPoller(): void {
    if (!this.token) return;

    this._eventPollBlock = 0; // reset — first tick will set the watermark
    this._eventPollTimer = setInterval(() => {
      this._pollEvents().catch((err) =>
        logger.warn({ err }, "contractService: event poll tick failed")
      );
    }, ContractService.EVENT_POLL_INTERVAL_MS);

    logger.info("contractService: event listeners active");
  }

  private _stopEventPoller(): void {
    if (this._eventPollTimer) {
      clearInterval(this._eventPollTimer);
      this._eventPollTimer = null;
    }
    this._eventPollBlock = 0;
  }

  /**
   * One polling tick: scan [_eventPollBlock, latest] for each relevant token
   * event and publish results to the WS event bus. On the very first call
   * (block === 0) we just set the watermark without scanning, so we don't push
   * stale historical events to newly connected WebSocket clients.
   */
  private async _pollEvents(): Promise<void> {
    if (!this.token || !this.provider) return;

    const latest = await this.provider.getBlockNumber();

    // First call after (re)connect — set watermark only, no scan.
    if (this._eventPollBlock === 0) {
      this._eventPollBlock = latest + 1;
      return;
    }

    const fromBlock = this._eventPollBlock;
    if (fromBlock > latest) return;

    const token = this.token;

    // Run sequentially to avoid bursting compute-unit usage; each call already
    // has exponential-backoff retry via _queryFilterAdaptive. We use
    // Promise.allSettled so a failure on one event type doesn't skip the rest.
    const [
      mintRequestedRes,
      tokenBirthedRes,
      aiMintedRes,
      oracleRejectedRes,
      agentRegisteredRes,
      proofAcceptedRes,
      proofRejectedRes,
      transferRes,
    ] = await Promise.allSettled([
      this._queryFilterAdaptive(token.filters.MintRequested(),      fromBlock, latest, token),
      this._queryFilterAdaptive(token.filters.TokenBirthed(),       fromBlock, latest, token),
      this._queryFilterAdaptive(token.filters.AIMinted(),           fromBlock, latest, token),
      this._queryFilterAdaptive(token.filters.OracleProofRejected(),fromBlock, latest, token),
      this._queryFilterAdaptive(token.filters.AgentRegistered(),    fromBlock, latest, token),
      this._queryFilterAdaptive(token.filters.ProofAccepted(),      fromBlock, latest, token),
      this._queryFilterAdaptive(token.filters.ProofRejected(),      fromBlock, latest, token),
      this._queryFilterAdaptive(token.filters.Transfer(),           fromBlock, latest, token),
    ]);

    // Always advance the watermark even if some event types failed — they'll
    // be picked up by the indexers' own block-scan cursors.
    this._eventPollBlock = latest + 1;

    if (agentRegisteredRes.status === "fulfilled") {
      for (const e of agentRegisteredRes.value) {
        this.agentAddressCache.add((e.args.agent as string).toLowerCase());
        mcxEventBus.publish("AgentRegistered", {
          agent:       e.args.agent as string,
          name:        e.args.name as string,
          description: e.args.description as string,
          registeredAt:(e.args.registeredAt as bigint).toString(),
          source: "blockchain",
        });
      }
    }

    if (mintRequestedRes.status === "fulfilled") {
      for (const e of mintRequestedRes.value) {
        mcxEventBus.publish("MintRequested", {
          requestId: e.args.requestId as string,
          to:        e.args.to as string,
          amount:    (e.args.amount as bigint).toString(),
          proof:     e.args.proof as string,
          source: "blockchain",
        });
      }
    }

    if (tokenBirthedRes.status === "fulfilled") {
      for (const e of tokenBirthedRes.value) {
        mcxEventBus.publish("TokenBirthed", {
          agent:        e.args.agent as string,
          totalAmount:  (e.args.totalAmount as bigint).toString(),
          rewardAmount: (e.args.rewardAmount as bigint).toString(),
          feeAmount:    (e.args.feeAmount as bigint).toString(),
          source: "blockchain",
        });
      }
    }

    if (aiMintedRes.status === "fulfilled") {
      for (const e of aiMintedRes.value) {
        mcxEventBus.publish("AgentStatusChanged", { status: "active" });
        logger.info(
          { to: e.args.to, amount: ethers.formatEther(e.args.amount as bigint), proof: e.args.proof },
          "AIMinted on-chain"
        );
      }
    }

    if (oracleRejectedRes.status === "fulfilled") {
      for (const e of oracleRejectedRes.value) {
        mcxEventBus.publish("OracleProofRejected", {
          requestId: e.args.requestId as string,
          reason:    e.args.reason as string,
          source: "blockchain",
        });
      }
    }

    if (proofAcceptedRes.status === "fulfilled") {
      for (const e of proofAcceptedRes.value) {
        mcxEventBus.publish("ProofAccepted", {
          agent:  e.args.agent as string,
          proof:  e.args.proof as string,
          amount: (e.args.amount as bigint).toString(),
          score:  (e.args.score as bigint).toString(),
          reward: (e.args.reward as bigint).toString(),
          source: "blockchain",
        });
      }
    }

    if (proofRejectedRes.status === "fulfilled") {
      for (const e of proofRejectedRes.value) {
        mcxEventBus.publish("ProofRejected", {
          agent:  e.args.agent as string,
          proof:  e.args.proof as string,
          reason: e.args.reason as string,
          source: "blockchain",
        });
      }
    }

    if (transferRes.status === "fulfilled") {
      for (const e of transferRes.value) {
        logger.info(
          { from: e.args.from, to: e.args.to, value: ethers.formatEther(e.args.value as bigint) },
          "ERC20 Transfer on-chain"
        );
      }
    }
  }

  /**
   * Tears down the connection and, critically, ALWAYS re-arms the reconnect
   * timer — this is the single place every disconnect path (initial connect
   * failure, or a transient RPC error surfaced mid-session e.g. by
   * getTokenInfo) funnels through. Previously only _tryConnect's own catch
   * scheduled a retry; getTokenInfo called this method directly without
   * scheduling one, so a single transient 429 there would tear down the
   * ReportVerification connection (and everything else) and leave it dead
   * until the process was restarted, since nothing else would ever call
   * _tryConnect again. Centralizing it here means every caller gets
   * automatic recovery for free.
   */
  private _handleDisconnect(): void {
    this._stopEventPoller();
    this.provider   = null;
    this.signer     = null;
    this.token      = null;
    this.mockRouter = null;
    this.reportVerification = null;
    this._connected = false;
    this.agentAddressCache = new Set();
    this.agentScanBlock = 0;
    this.agentScanInFlight = null;
    this._scheduleRetry();
  }

  private _scheduleRetry(): void {
    const delay =
      this._consecutiveRateLimitFailures > 0
        ? Math.min(RETRY_MS * 2 ** this._consecutiveRateLimitFailures, MAX_RETRY_MS)
        : RETRY_MS;
    this._retryTimer = setTimeout(() => this._tryConnect(), delay);
  }
}

export const contractService = new ContractService();
