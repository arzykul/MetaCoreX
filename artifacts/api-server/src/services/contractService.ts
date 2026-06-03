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
    };
    MockFunctionsRouter?: {
      address: string;
      abiPath: string;
    };
  };
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

    token.on("ProofRejected", (requestId: string, reason: string) => {
      mcxEventBus.publish("ProofRejected", { requestId, reason, source: "blockchain" });
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
  }

  private _scheduleRetry(): void {
    this._retryTimer = setTimeout(() => this._tryConnect(), RETRY_MS);
  }
}

export const contractService = new ContractService();
