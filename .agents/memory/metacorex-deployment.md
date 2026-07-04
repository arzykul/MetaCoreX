---
name: MetaCoreX Deployment State
description: Live deployment addresses, secrets, and project status for MetaCoreX / ARZY-G
---

## Sepolia Deployment (LIVE)

- **ARZYG_ERC20_AI**: `0xdd378e369640Be59E7DE4D1BAeF6Ec7F0bC14E94`
- **Deployer/Owner**: `0x8b7C9bB9794e849a64242CEd0B7fe4604cB4A0D6`
- **Network**: Ethereum Sepolia (chainId: 11155111)
- **Deployment Block**: `11202366` (anchor for agent-registry log scans — see `rpc-log-scan-limits.md`)
- **Etherscan**: https://sepolia.etherscan.io/address/0xdd378e369640Be59E7DE4D1BAeF6Ec7F0bC14E94
- **Chainlink Router (Sepolia)**: `0xb83E47C2bC239B3bf370bc41e1459A34b41238D0`
- **Chainlink DON**: `fun-ethereum-sepolia-1`

## Contract has no upgrade proxy

ARZYG_ERC20_AI is deployed as a plain (non-upgradeable) contract. Any change to `.sol` requires a full redeploy at a **new address** — update `contracts/deployed.json`, this memory file, and restart the API server so `contractService` reconnects to the new address/ABI.

## Agent proof-of-work trust gap

`submitProof` mints `amount * score / 10` directly to the caller with **no verification of amount/score** — any registered agent can mint arbitrary amounts by self-reporting a high score. Implemented exactly as requested by the user but flagged as a known trust/security gap; needs an authorization/oracle check before mainnet.

## Secrets in Replit

- `DEPLOYER_PRIVATE_KEY` ✅ — controls deployer wallet
- `SEPOLIA_RPC_URL` ✅ — Alchemy Sepolia endpoint
- `GITHUB_TOKEN` ✅ — for GitHub pushes
- `CHAINLINK_SUBSCRIPTION_ID` ❌ — NOT YET SET (pending)
- `ETHERSCAN_API_KEY` ❌ — NOT YET SET (optional)

## GitHub

- Repo: https://github.com/arzykul/MetaCoreX

## Automatic agent script identity pattern (`scripts/src/auto-agent.ts`)

Generates its own wallet on first run and persists it to a gitignored local JSON file instead of requesting a secret from the user; auto-funds itself with Sepolia ETH from `DEPLOYER_PRIVATE_KEY` on first run only.

**Why:** Avoids friction of asking the user to paste an agent private key into Replit Secrets for something the agent itself generates; keeps the identity stable across restarts without touching the secrets system, which only accepts user-supplied values.

**How to apply:** Reuse this local-identity-file pattern for any future autonomous script that needs a persistent on-chain identity but doesn't warrant a user-managed secret.

## Server-side privateKey API routes are a known risk

`/api/agents/register` and `/api/agents/submit-proof` on the api-server still accept a raw `privateKey` in the request body, unauthenticated. Kept intentionally because `scripts/src/auto-agent.ts` depends on them for server-side automation — the corporate website (`artifacts/metacorex-site`) does NOT use these routes (it signs client-side via the user's connected wallet instead).

**Why:** Removing them would break the automation script; the website was rebuilt to avoid needing them at all after a security review flagged private-key collection in the UI.

**How to apply:** Before any production deployment, auth-gate or localhost-restrict these routes rather than exposing raw-private-key endpoints publicly.

## Pending Work

1. **Chainlink Subscription** — user has LINK + ETH on deployer wallet; needs to create subscription at functions.chain.link/sepolia, fund it, add the contract as consumer, then add `CHAINLINK_SUBSCRIPTION_ID` to Replit Secrets. Programmatic creation is blocked by Chainlink ToS (must use web UI first).
2. **Etherscan verification** — needs `ETHERSCAN_API_KEY` secret, then run `pnpm --filter @workspace/contracts run verify:sepolia`.
3. **Contract upgrades** — Staking, Governance, and PoU score tiers discussed as future versions.

## Local Hardhat

- MockFunctionsRouter: `0x5FbDB2315678afecb367f032d93F642f64180aa3`
- Local ARZYG: `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`
- Full on-chain cycle works locally (MINT ON-CHAIN button)

**Why:** Critical deployment info not derivable from code alone — live addresses, secret status, and pending tasks.
