# MetaCoreX

> **Web3 / Web4 Infrastructure for the ARZY-G AI Token Ecosystem**

[![Solidity](https://img.shields.io/badge/Solidity-0.8.28-363636?logo=solidity)](https://soliditylang.org)
[![OpenZeppelin](https://img.shields.io/badge/OpenZeppelin-v5-4E5EE4?logo=openzeppelin)](https://openzeppelin.com/contracts)
[![Hardhat](https://img.shields.io/badge/Hardhat-2.x-yellow?logo=ethereum)](https://hardhat.org)
[![Node.js](https://img.shields.io/badge/Node.js-24-339933?logo=node.js)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

MetaCoreX is a full-stack Web3/Web4 infrastructure project built around the **ARZY-G ERC-20 AI token** — an on-chain token with an embedded AI integration layer, Chainlink Functions oracle support, and a real-time cyberpunk **Visual Core** operating dashboard.

---

## Table of Contents

- [Overview](#overview)
- [Proof of Usefulness (PoU) Protocol](#proof-of-usefulness-pou-protocol)
- [Architecture](#architecture)
- [System Metrics](#system-metrics)
- [Repository Topology](#repository-topology)
- [Smart Contract](#smart-contract)
- [API Reference](#api-reference)
- [Quick Start](#quick-start)
- [Visual Core Dashboard](#visual-core-dashboard)
- [Tech Stack](#tech-stack)

---

## Overview

ARZY-G is an ERC-20 AI token with an on-chain intelligence layer. Unlike standard ERC-20 tokens, ARZY-G enforces that new tokens are minted only after an AI agent submits a verifiable proof of useful computation — evaluated and settled on-chain via Chainlink Functions.

**Core capabilities:**

| Feature | Description |
|---|---|
| `aiMint` | AI operators mint tokens after a Chainlink oracle verifies a Proof of Usefulness score |
| `birthToken` | Splits the minted reward into agent share (99%) and protocol reserve fee (1%) |
| `aiTransfer` | AI agents execute ERC-20 transfers on behalf of users with pre-approval |
| `Permit (EIP-2612)` | Gasless off-chain approvals via signed permit messages — ideal for AI pipelines |
| `Emergency Pause` | Circuit-breaker `pause/unpause` controlled by `PAUSER_ROLE` |
| `Daily Quota` | On-chain UTC day epoch limits for `AI_OPERATOR_ROLE` minting |
| `Supply Cap` | Hard 1 billion token ceiling enforced in Solidity |

---

## Proof of Usefulness (PoU) Protocol

The **Proof of Usefulness** protocol is MetaCoreX's core economic and consensus mechanism. It replaces arbitrary inflationary minting with a verifiable, AI-evaluated work gate.

### How it works

```
AI Agent                  ARZY-G Contract           Chainlink Functions
   │                            │                          │
   │── requestUsefulness() ────▶│                          │
   │   (agentAddr, prompt,      │──── sendRequest() ──────▶│
   │    amount)                 │     (DON ID, sub ID)     │
   │                            │                          │
   │                            │◀─── fulfillRequest() ───│
   │                            │     (score: uint256)     │
   │                            │                          │
   │                            │  if score ≥ 1:           │
   │                            │    birthToken()          │
   │                            │    ├─ mint 99% → agent   │
   │                            │    └─ mint  1% → reserve │
   │                            │  else:                   │
   │◀── ProofRejected event ────│    emit ProofRejected()  │
```

### PoU Score

The oracle evaluates the AI agent's submitted proof (a natural-language task description) and returns a **PoU Score** — an integer from `0` to `10`:

| Score | Meaning | Result |
|---|---|---|
| `0` | No useful work detected | `ProofRejected` — no mint |
| `1–4` | Partial usefulness | `TokenBirthed` — reduced cap |
| `5–7` | Solid contribution | `TokenBirthed` — standard mint |
| `8–10` | Exceptional output | `TokenBirthed` — full cap |

The PoU Score is displayed in real time on the Visual Core Dashboard as a progress bar.

### Roles

| Role | Capability |
|---|---|
| `DEFAULT_ADMIN_ROLE` | Full contract governance |
| `MINTER_ROLE` | Direct privileged minting (admin only) |
| `AI_OPERATOR_ROLE` | Submit `requestUsefulness`, subject to daily quota |
| `PAUSER_ROLE` | Emergency pause / unpause |
| `RESERVE_ROLE` | Manage the protocol fee reserve address |
| `DEV_ADMIN_ROLE` | Developer override for testing and migration |

### Daily Quota

Each address holding `AI_OPERATOR_ROLE` is limited to a configurable daily mint cap, enforced on-chain using the UTC day epoch:

```solidity
uint256 epoch = block.timestamp / 1 days;
require(dailyMinted[operator][epoch] + amount <= aiDailyCap, "Quota exceeded");
```

This prevents runaway minting while still allowing high-throughput AI pipelines across multiple operators.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        MetaCoreX OS                             │
│                                                                 │
│  ┌──────────────────┐    WebSocket     ┌─────────────────────┐  │
│  │  Visual Core     │◄────────────────▶│   API Server        │  │
│  │  Dashboard       │   /api/ws        │   (Express 5)       │  │
│  │  (public/)       │                  │   port 8080         │  │
│  └──────────────────┘                  └────────┬────────────┘  │
│                                                 │               │
│                                        ┌────────▼────────────┐  │
│                                        │  ContractService    │  │
│                                        │  (ethers.js v6)     │  │
│                                        └────────┬────────────┘  │
│                                                 │ JSON-RPC      │
│                                        ┌────────▼────────────┐  │
│                                        │  Hardhat Local Node │  │
│                                        │  127.0.0.1:8545     │  │
│                                        └────────┬────────────┘  │
│                                                 │               │
│                              ┌──────────────────┴────────────┐  │
│                              │                               │  │
│                    ┌─────────▼──────────┐    ┌──────────────▼┐  │
│                    │  ARZYG_ERC20_AI    │    │  MockFunctions│  │
│                    │  (ERC-20 + PoU)    │    │  Router       │  │
│                    │  chain ID: 31337   │    │  (Chainlink   │  │
│                    └────────────────────┘    │   simulator)  │  │
│                                              └───────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Event Flow

The MetaCoreX **EventBus** (`src/ws/eventBus.ts`) is the central nervous system of the OS. All on-chain events are captured by `ContractService` via ethers.js listeners and republished to all connected dashboard clients over WebSocket in real time.

```
Blockchain Event  ──▶  ContractService  ──▶  McxEventBus  ──▶  WebSocket  ──▶  Dashboard
(MintRequested)         (ethers.js)          (EventEmitter)      (/api/ws)      (Terminal)
```

---

## System Metrics

These are the live on-chain system metrics exposed by the dashboard and API:

| Metric | Source | Update Frequency |
|---|---|---|
| **Token Balance** | `ARZYG.balanceOf(deployer)` | Every 5 seconds |
| **Total Supply** | `ARZYG.totalSupply()` | Every 5 seconds |
| **Block Number** | `provider.getBlockNumber()` | Every 5 seconds |
| **Chain ID** | `provider.getNetwork()` | On connect |
| **PoU Score** | WebSocket event stream | Real-time |
| **Pending Requests** | `MintRequested` event counter | Real-time |
| **Minted / Birthed / Rejected** | On-chain event counters | Real-time |

### Contract Deployment (Local Hardhat)

| Parameter | Value |
|---|---|
| Network | Hardhat Local (`chainId: 31337`) |
| RPC URL | `http://127.0.0.1:8545` |
| Initial Supply | 1,000,000 ARZY-G |
| Protocol Fee | 1% (to reserve on every `birthToken`) |
| Supply Cap | 1,000,000,000 ARZY-G (hard ceiling) |
| EVM Target | Cancun (required for OpenZeppelin v5) |
| Chainlink DON | `fun-test-1` (simulated via MockFunctionsRouter) |

---

## Repository Topology

```
MetaCoreX/
│
├── contracts/                          # Solidity smart contracts (Hardhat)
│   ├── contracts/
│   │   ├── ARZYG_ERC20_AI.sol          # Main ERC-20 AI token (v2.1)
│   │   └── mocks/
│   │       └── MockFunctionsRouter.sol # Chainlink Functions simulator for local testing
│   ├── scripts/
│   │   └── deploy.ts                   # Deployment script → writes contracts/deployed.json
│   ├── test/
│   │   └── ARZYG_ERC20_AI.test.ts      # 17-test Hardhat/Chai test suite
│   ├── hardhat.config.ts               # Hardhat configuration (Cancun EVM, TypeChain)
│   ├── deployed.json                   # Live deployment addresses (generated at deploy time)
│   └── package.json                    # @workspace/contracts
│
├── artifacts/
│   └── api-server/                     # Express 5 API + WebSocket server
│       ├── src/
│       │   ├── index.ts                # HTTP server entry point, ContractService init
│       │   ├── app.ts                  # Express app, static file serving, routes
│       │   ├── lib/
│       │   │   └── logger.ts           # Pino structured logger singleton
│       │   ├── routes/
│       │   │   ├── index.ts            # Route aggregator
│       │   │   ├── health.ts           # GET /api/healthz
│       │   │   ├── events.ts           # POST /api/events/emit, GET /api/events/demo
│       │   │   └── contract.ts         # GET /api/contract/info, POST /api/contract/mint-demo
│       │   ├── services/
│       │   │   └── contractService.ts  # ethers.js blockchain bridge + event listeners
│       │   └── ws/
│       │       ├── eventBus.ts         # McxEventBus singleton (Node EventEmitter)
│       │       └── wsServer.ts         # WebSocket server, fan-out to all clients
│       ├── build.mjs                   # esbuild bundle script
│       ├── .replit-artifact/
│       │   └── artifact.toml           # Service routing config (paths: ["/", "/api"])
│       └── package.json                # @workspace/api-server
│
├── lib/                                # Shared workspace libraries
│   ├── api-spec/
│   │   └── openapi.yaml                # OpenAPI spec (contract-first API definition)
│   ├── api-zod/                        # Generated Zod schemas from OpenAPI spec
│   ├── api-client-react/               # Generated React Query hooks from OpenAPI spec
│   └── db/                             # Drizzle ORM schema + PostgreSQL client
│
├── public/
│   └── index.html                      # Visual Core cyberpunk dashboard (vanilla JS + WS)
│
├── os/
│   └── EventBus.js                     # OS-level EventBus prototype
│
├── scripts/                            # Workspace utility scripts (@workspace/scripts)
│   └── post-merge.sh                   # Post-merge setup hook
│
├── pnpm-workspace.yaml                 # pnpm workspace config, catalog pins, overrides
├── tsconfig.base.json                  # Shared strict TypeScript base config
├── tsconfig.json                       # Root TypeScript solution file (libs only)
├── package.json                        # Root task orchestration
└── replit.md                           # Project overview and preferences
```

---

## Smart Contract

### `ARZYG_ERC20_AI.sol` (v2.1)

**Inherits:** `ERC20`, `ERC20Permit`, `AccessControl`, `Pausable`

**Constructor:**

```solidity
constructor(
    uint256 initialSupply,    // Minted to reserve at deploy
    address _reserve,         // Protocol fee recipient
    address _router,          // Chainlink Functions router
    bytes32 _donID,           // Chainlink DON identifier
    uint64  _subscriptionId   // Chainlink subscription ID
)
```

**Key Functions:**

| Function | Role Required | Description |
|---|---|---|
| `requestUsefulness(agent, proof, amount)` | `AI_OPERATOR_ROLE` | Submit PoU request to Chainlink |
| `handleOracleFulfillment(requestId, response, err)` | Internal (router callback) | Process oracle result, call `birthToken` |
| `birthToken(agent, amount)` | Internal | Split mint: 99% → agent, 1% → reserve |
| `aiTransfer(from, to, amount)` | `AI_OPERATOR_ROLE` | Execute transfer on behalf of user |
| `mint(to, amount)` | `MINTER_ROLE` | Direct privileged mint |
| `burn(amount)` | Token holder | Burn own tokens |
| `setAiDailyCap(cap)` | `DEFAULT_ADMIN_ROLE` | Update daily mint quota |
| `setReserve(newReserve)` | `RESERVE_ROLE` | Update fee reserve address |
| `pause() / unpause()` | `PAUSER_ROLE` | Emergency circuit breaker |

**Events:**

| Event | Emitted When |
|---|---|
| `MintRequested(requestId, to, amount, proof)` | Chainlink request submitted |
| `TokenBirthed(agent, totalAmount, rewardAmount, feeAmount)` | Oracle approved, tokens minted |
| `AIMinted(to, amount, proof)` | Agent share successfully minted |
| `ProofRejected(requestId, reason)` | Oracle returned score < 1 |
| `ReserveChanged(oldReserve, newReserve)` | Reserve address updated |

---

## API Reference

Base URL: `/api`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/healthz` | Server health check |
| `GET` | `/api/contract/info` | Live on-chain token info (supply, balance, block) |
| `GET` | `/api/contract/status` | Blockchain connection status |
| `POST` | `/api/contract/mint-demo` | Trigger full on-chain mint cycle (request → fulfill) |
| `POST` | `/api/events/emit` | Manually emit an event to the EventBus |
| `GET` | `/api/events/demo` | Fire a 3-event demo sequence |
| `WS` | `/api/ws` | Real-time WebSocket event stream |

### WebSocket Event Types

```json
{ "type": "MintRequested",     "data": { "requestId": "0x...", "to": "0x...", "amount": "...", "proof": "..." } }
{ "type": "TokenBirthed",      "data": { "agent": "0x...", "totalAmount": "...", "rewardAmount": "...", "feeAmount": "..." } }
{ "type": "ProofRejected",     "data": { "requestId": "0x...", "reason": "..." } }
{ "type": "AgentStatusChanged","data": { "status": "active | idle | offline" } }
{ "type": "SystemMessage",     "data": { "message": "..." } }
```

---

## Quick Start

### Prerequisites

- Node.js 24+
- pnpm 10+

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start the Hardhat local node

```bash
HARDHAT_DISABLE_TELEMETRY_PROMPT=true pnpm --filter @workspace/contracts run node
```

### 3. Compile and deploy contracts

```bash
# Compile
pnpm --filter @workspace/contracts run compile

# Deploy to local node (writes contracts/deployed.json)
pnpm --filter @workspace/contracts run deploy:local
```

### 4. Run the API server

```bash
pnpm --filter @workspace/api-server run dev
```

The Visual Core dashboard is now live at **http://localhost:8080**.

### 5. Run contract tests

```bash
pnpm --filter @workspace/contracts run test
```

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | Yes | API server port (default: 8080 via workflow) |
| `DATABASE_URL` | Optional | PostgreSQL connection string (for DB features) |
| `GITHUB_TOKEN` | Deploy only | GitHub PAT for pushing to the repository |

---

## Visual Core Dashboard

The **Visual Core** is a real-time cyberpunk OS interface that bridges the blockchain and the operator:

```
┌─ ARZY-G TOKEN CORE ───────┐  ┌─ AI AGENT CORE ──────────┐  ┌─ SYSTEM ACTIONS ────────┐
│                            │  │                           │  │                         │
│  1,000,000.00  ARZYG       │  │ STATUS      ● ACTIVE      │  │  ⛓ MINT ON-CHAIN        │
│                            │  │ PoU SCORE   ████░░ 60%    │  │  ▶ RUN DEMO SEQUENCE    │
│  CORE ADDR  0xe7f1…0512    │  │ PENDING     3              │  │  ⬡ EMIT MINT_REQUESTED  │
│  TOTAL MINTED  1,001,000   │  │ ORACLE    api.arzy.ai     │  │  ✦ EMIT TOKEN_BIRTHED   │
│  PROTOCOL FEE  1%          │  │ DON       fun-test-1      │  │  ✕ EMIT PROOF_REJECTED  │
│  NETWORK  HARDHAT:31337    │  │                           │  │                         │
│  BLOCK    #4               │  │ PoU ████████░░░░░░  60%   │  └─────────────────────────┘
└────────────────────────────┘  └───────────────────────────┘
┌─ SYSTEM EVENT LOG — METACOREX EVENTBUS ─────────────────────────────────── AUTO-SCROLL: ON ┐
│ 13:19:39  MintRequested   requestId:0x82b2… · to:0x7099… · amount:1000000000…             │
│ 13:19:39  TokenBirthed    agent:0x7099… · rewardAmount:990000… · feeAmount:10000…          │
│ 13:19:39  AgentStatusChanged  status:active                                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

**MINT ON-CHAIN** triggers the full on-chain PoU cycle:
1. `requestUsefulness` transaction → Hardhat block mined
2. `MockFunctionsRouter.fulfillSuccess` → oracle callback
3. `birthToken` splits reward: 99% to agent, 1% to reserve
4. Dashboard updates balance and total supply in real time

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Solidity 0.8.28, OpenZeppelin v5, Hardhat 2.x |
| Oracle | Chainlink Functions (IFunctionsClient, IFunctionsRouter) |
| EVM Target | Cancun (required for OZ v5 `mcopy` opcode) |
| TypeChain | `@typechain/ethers-v6` — generated TypeScript bindings |
| API Server | Express 5, Node.js 24, TypeScript 5.9 |
| Blockchain Client | ethers.js v6 (JsonRpcProvider, Contract, event listeners) |
| WebSocket | `ws` library + Node.js EventEmitter (McxEventBus) |
| Build | esbuild (CJS→ESM bundle with source maps) |
| Logger | Pino (structured JSON logging) |
| Database | PostgreSQL + Drizzle ORM (schema-first) |
| Validation | Zod v4 + drizzle-zod |
| API Codegen | Orval (OpenAPI → Zod schemas + React Query hooks) |
| Package Manager | pnpm 10 workspaces |
| Dashboard | Vanilla JS + IBM Plex Mono + Orbitron (cyberpunk UI) |

---

## License

MIT © 2026 MetaCoreX / arzykul
