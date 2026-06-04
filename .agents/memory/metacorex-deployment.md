---
name: MetaCoreX Deployment State
description: Live deployment addresses, secrets, and project status for MetaCoreX / ARZY-G
---

## Sepolia Deployment (LIVE)

- **ARZYG_ERC20_AI**: `0x15D72D1656cA5A63207AcD278fC2501d8cc64f56`
- **Deployer/Owner**: `0x8b7C9bB9794e849a64242CEd0B7fe4604cB4A0D6`
- **Network**: Ethereum Sepolia (chainId: 11155111)
- **Tx Hash**: `0xe582e86ef179e9fadd0aa5df9ed00bbbb4c54759c7743fe5cd291c14b524c227`
- **Etherscan**: https://sepolia.etherscan.io/address/0x15D72D1656cA5A63207AcD278fC2501d8cc64f56
- **Initial Supply**: 1,000,000 ARZYG
- **Chainlink Router (Sepolia)**: `0xb83E47C2bC239B3bf370bc41e1459A34b41238D0`
- **Chainlink DON**: `fun-ethereum-sepolia-1`

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
