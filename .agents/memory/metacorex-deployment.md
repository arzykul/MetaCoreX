---
name: MetaCoreX Deployment State
description: Live deployment addresses, secrets, and project status for MetaCoreX / ARZY-G
---

## Sepolia Deployment (LIVE)

- **ARZYG_ERC20_AI**: `0xdd378e369640Be59E7DE4D1BAeF6Ec7F0bC14E94` (v2.2 — added Agent registry/proof-of-work; redeployed 2026-07-04, replaces prior `0x15D72D16...` address)
- **Deployer/Owner**: `0x8b7C9bB9794e849a64242CEd0B7fe4604cB4A0D6`
- **Network**: Ethereum Sepolia (chainId: 11155111)
- **Tx Hash**: `0xd74ac6b83bca5593980dc0d1c6b6fdf9f9124734f5cb77e980e603c20444ec5e`
- **Deployment Block**: `11202366` (anchor for agent-registry log scans — see below)
- **Etherscan**: https://sepolia.etherscan.io/address/0xdd378e369640Be59E7DE4D1BAeF6Ec7F0bC14E94
- **Initial Supply**: 1,000,000 ARZYG
- **Chainlink Router (Sepolia)**: `0xb83E47C2bC239B3bf370bc41e1459A34b41238D0`
- **Chainlink DON**: `fun-ethereum-sepolia-1`

## Contract has no upgrade proxy

ARZYG_ERC20_AI is deployed as a plain (non-upgradeable) contract. Any change to `.sol` requires a full redeploy at a **new address** — update `contracts/deployed.json`, this memory file, and restart the API server so `contractService` reconnects to the new address/ABI.

## Agent registry / proof-of-work (v2.2, added 2026-07-04)

- `Agent` struct (name, description, registeredAt, totalEarned, tasksCompleted, isActive) + `agents` mapping + `agentCount`.
- `registerAgent(name, description)` — self-registration, one-time (reverts if already active).
- `submitProof(proof, amount, score)` — caller must be a registered active agent; reward = `amount * score / 10`, minted directly to `msg.sender`. **No verification of amount/score** — any registered agent can mint arbitrary amounts by self-reporting a high score. This was implemented exactly as requested but is a known trust/security gap flagged to the user; revisit with an authorization/oracle check before mainnet.
- `getAgentInfo(address)` — explicit read accessor (the public `agents` mapping already exposes an auto-getter with the same shape).
- Renamed the original oracle-rejection event from `ProofRejected(bytes32,string)` to `OracleProofRejected(bytes32,string)` to avoid an ambiguous-overload error in ethers (ethers v6 chai matchers can't disambiguate `.emit(token, "ProofRejected")` when two events share a name with different param types). The new agent-flow `ProofRejected(address,string,string)` keeps the name the user asked for.
- API server (`contractService.ts`, `eventBus.ts`, `routes/events.ts`) updated in lockstep: event union renamed `ProofRejected` → `OracleProofRejected`, added `AgentRegistered`/`ProofAccepted`/`ProofRejected` (agent variant) listeners.
- REST endpoints added at `/api/agents/register`, `/api/agents/submit-proof`, `/api/agents/:address`, `/api/agents/list/all` (list route registered before the `:address` route in Express 5 to avoid the param swallowing "list"). All 4 verified end-to-end against Sepolia.

## Secrets in Replit

- `DEPLOYER_PRIVATE_KEY` ✅ — controls deployer wallet
- `SEPOLIA_RPC_URL` ✅ — Alchemy Sepolia endpoint
- `GITHUB_TOKEN` ✅ — for GitHub pushes
- `CHAINLINK_SUBSCRIPTION_ID` ❌ — NOT YET SET (pending)
- `ETHERSCAN_API_KEY` ❌ — NOT YET SET (optional)

## GitHub

- Repo: https://github.com/arzykul/MetaCoreX
- Owner: Arzykul Muratov (ArzyNet Labs, Bishkek, Kyrgyzstan)

## Pending Work

1. **Chainlink Subscription** — user has 25 LINK + 0.04 ETH on deployer wallet. Needs to create subscription at functions.chain.link/sepolia, fund with 5 LINK, add consumer `0x15D72D1656...`, then add CHAINLINK_SUBSCRIPTION_ID to Replit Secrets. Programmatic creation blocked by Chainlink ToS requirement (must use web UI first).
2. **Etherscan verification** — needs ETHERSCAN_API_KEY secret, then run `pnpm --filter @workspace/contracts run verify:sepolia`
3. **Public landing page/website** — user requested this, not yet built
4. **Contract upgrades** — v2.2 Staking, v2.3 Governance, v2.4 PoU score tiers discussed

## Local Hardhat

- MockFunctionsRouter: `0x5FbDB2315678afecb367f032d93F642f64180aa3`
- Local ARZYG: `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`
- Full on-chain cycle works locally (MINT ON-CHAIN button)

**Why:** Critical deployment info not derivable from code alone — live addresses, secret status, and pending tasks.
