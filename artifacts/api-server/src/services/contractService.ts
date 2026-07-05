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
  };
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

  /**
   * Fetches a transaction receipt and parses it for ProofAccepted/ProofRejected
   * logs scoped to `expectedAgent`. Used to verify a client-signed submitProof
   * transaction (from the agent-tasks "complete" flow) actually happened
   * on-chain and paid the expected agent, instead of trusting a client-supplied
   * reward value.
   */
  async verifyProofTx(
    txHash: string,
    expectedAgent: string
  ): Promise<{ accepted: boolean; reward?: string; reason?: string } | null> {
    if (!this._connected || !this.token || !this.provider) {
      return null;
    }

    const receipt = await this.provider.getTransactionReceipt(txHash);
    if (!receipt) return null;

    let accepted = false;
    let reward: string | undefined;
    let reason: string | undefined;

    for (const log of receipt.logs) {
      let parsed: ethers.LogDescription | null = null;
      try {
        parsed = this.token.interface.parseLog(log);
      } catch {
        continue;
      }
      if (!parsed) continue;

      const agent = parsed.args.agent as string | undefined;
      if (!agent || agent.toLowerCase() !== expectedAgent.toLowerCase()) continue;

      if (parsed.name === "ProofAccepted") {
        accepted = true;
        reward = (parsed.args.reward as bigint).toString();
      } else if (parsed.name === "ProofRejected") {
        accepted = false;
        reason = parsed.args.reason as string;
      }
    }

    return { accepted, reward, reason };
  }

  /** Reads a live ARZY-G token balance for an address. */
  async getBalance(address: string): Promise<string | null> {
    if (!this._connected || !this.token) return null;
    const bal = await this.token.balanceOf(address);
    return ethers.formatEther(bal);
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
    this.provider   = null;
    this.signer     = null;
    this.token      = null;
    this.mockRouter = null;
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
