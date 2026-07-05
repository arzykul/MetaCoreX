---
name: MetaCoreX Deployment State
description: Live deployment addresses, secrets, and project status for MetaCoreX / ARZY-G
---

## Sepolia Deployment (LIVE)

- **ARZYG_ERC20_AI**: `0xC3f4231F619F8D22666d70aeaA5D43EA56498770` (v2.2, redeployed 2026-07-05 — supersedes the old `0xdd378e...` address, which has no supply caps and should be treated as retired/unsafe)
- **Deployer/Owner**: `0x8b7C9bB9794e849a64242CEd0B7fe4604cB4A0D6`
- **Network**: Ethereum Sepolia (chainId: 11155111)
- **Deployment Block**: `11209059` (anchor for agent-registry log scans — see `rpc-log-scan-limits.md`)
- **Etherscan**: https://sepolia.etherscan.io/address/0xC3f4231F619F8D22666d70aeaA5D43EA56498770
- **Chainlink Router (Sepolia)**: `0xb83E47C2bC239B3bf370bc41e1459A34b41238D0`
- **Chainlink DON**: `fun-ethereum-sepolia-1`

## Contract has no upgrade proxy

ARZYG_ERC20_AI is deployed as a plain (non-upgradeable) contract. Any change to `.sol` requires a full redeploy at a **new address** — update `contracts/deployed.json`, this memory file, and restart the API server so `contractService` reconnects to the new address/ABI.

## Agent proof-of-work trust gap (mitigated 2026-07-05, not fully closed)

`submitProof` still mints `amount * score / 10` directly to the caller based on a **self-reported** amount/score — there's no oracle/authorization check on whether the claimed work actually happened. As of 2026-07-05 this is bounded (not unlimited) by `MAX_SUPPLY`, a global `dailyMintLimit`, a per-agent `agentDailyCap`, and a `score <= 10` sanity check (see `submitProof supply caps` below), but a malicious agent can still mint up to its daily cap for fabricated work. Full fix needs an authorization/oracle check before mainnet.

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

## Server-side privateKey API routes are gated (internal-only, file-based token — NOT an env var)

`/api/agents/register` and `/api/agents/submit-proof` still accept a raw `privateKey` in the request body (needed for `scripts/src/auto-agent.ts`'s server-side automation), gated behind an `x-agent-token` header compared (timing-safe) against a token read from a **gitignored local file**, `scripts/.agent-internal-token` — deliberately NOT a Replit env var/secret.

**Why:** This repo's whole point is to be forked publicly (see the "bring your own agent" pattern below). An env var stored via `setEnvVars` lands in the git-tracked `.replit` file's `[userenv.shared]` block — anyone forking the repo would inherit our real internal token verbatim and the gate would be void. A gitignored file avoids that entirely. This mistake was made once and caught by architect review before publishing; don't repeat it for any "internal-only, app-generated, not a user secret" value in a repo meant to be forked/public.

**How to apply:** Never point third-party/external agents at these two routes — they should sign on-chain directly instead (see below). For any future internal-only credential in a publicly-forkable repo, default to a gitignored local file, not `setEnvVars`.

## Third-party "bring your own agent" pattern (GitHub Actions)

External agents connect without ever sharing a private key with us: `scripts/src/github-agent.ts` + `.github/workflows/agent.yml` sign `registerAgent`/`submitProof` directly on-chain with the operator's own wallet (their own `AGENT_PRIVATE_KEY` GitHub secret, in their own fork), using a minimal inline ABI and the contract address fetched at runtime from public `GET /api/contract/info`. The only API calls made are public/keyless: contract info + the `/api/agent-tasks/*` task marketplace (list/assign/complete-by-txHash).

**Why:** `registerAgent(name, description)` and `submitProof(proof, amount, score)` on `ARZYG_ERC20_AI.sol` are fully permissionless `external` functions (no `onlyRole`/access control) — any wallet can call them directly, so there's no need to route third parties through our server or have them trust us with their key at all.

**How to apply:** Point third-party developers at forking the *whole* repo (the workflow needs the full pnpm workspace to run `scripts/src/github-agent.ts` — copying just 2 files into a foreign repo doesn't work standalone) and setting `AGENT_PRIVATE_KEY`/`SEPOLIA_RPC_URL`/`API_BASE_URL` as their own repo secrets/variables. `API_BASE_URL` must be the real published production URL — verify with `getDeploymentInfo()` once deployed rather than guessing a domain.

### Third-party agents self-heal registration after a contract redeploy

Because `github-agent.ts`'s `ensureRegistered()` fetches the current contract address from `GET /api/contract/info` at runtime (never hardcoded) and calls `registerAgent` again if `isActive` is false, any contract redeploy (new address = fresh registry) requires **no outreach to third-party operators** — their next scheduled GitHub Actions run just re-registers automatically. Our own `scripts/src/auto-agent.ts` has the same self-healing `ensureRegistered()` pattern and was re-run manually once after the 2026-07-05 redeploy to restore its on-chain registration immediately (rather than waiting for its own schedule).

## verifyProofTx must scope logs to the token contract address

`contractService.verifyProofTx` (used by the `/api/agent-tasks/complete/:id` flow to trust a client-signed on-chain tx) parses every log in the receipt with the token's ABI but must also check `log.address` equals the deployed token contract address before trusting a parsed `ProofAccepted`/`ProofRejected` event.

**Why:** `ethers.Interface.parseLog` will happily "parse" a log emitted by *any* contract as long as the topic0 signature matches — a malicious multi-call tx that also calls an attacker-deployed contract emitting a fake `ProofAccepted(agent, reward)` event would otherwise be accepted as valid proof of a real mint. Found via architect review before this flow was exposed to third-party callers.

**How to apply:** Any code that parses `receipt.logs` for a specific known contract's events must filter by `log.address` first, not just by successfully parsing the ABI. Also enforce txHash uniqueness at the call-site (e.g. one task-completion per txHash) since the contract has no concept of "tasks" and the same accepted proof tx could otherwise be replayed against multiple DB rows.

## submitProof supply caps (fixed 2026-07-05)

Previously `submitProof(proof, amount, score)` had **no per-call cap, no daily quota, and no total-supply ceiling** anywhere in the contract — any registered wallet could mint unbounded ARZY-G. Fixed by redeploying with: a hard `MAX_SUPPLY` (1,000,000,000 ARZY-G) enforced in the `_update` override (covers every mint path, not just `submitProof`), an admin-configurable global `dailyMintLimit` (default 10,000/day) and per-agent `agentDailyCap` (default 1,000/day) both enforced via a shared `_enforceDailyQuota` helper called from `submitProof` and `birthToken`, and a `require(score <= 10)` sanity check. Admin (`DEV_ADMIN_ROLE`) can retune the two caps via `setDailyMintLimit`/`setAgentDailyCap`.

**Why:** Publishing the API + advertising a public "bring your own agent" GitHub Actions template turned this from a theoretical flaw into a documented, one-click way for anyone to mint unlimited ARZY-G. Flagged by architect review; user approved the fix + redeploy.

**How to apply:** This required a full redeploy (contract has no upgrade proxy — see above) to a new address; existing agent registrations do **not** carry over (see "Third-party agents self-heal" below). This mitigates but doesn't fully close the trust gap — see "Agent proof-of-work trust gap" above.

## Seed data lives in both code and the already-migrated DB

`seedAgentTasksIfEmpty()` (and similar seed functions) only insert rows once, when the target table is empty. Once seeded, editing the seed array in code has zero effect on existing rows — any later content change (e.g. re-translating task titles) requires a direct DB update/insert against the live rows, not just a source-file edit.

**Why:** Had to re-translate already-seeded `agent_tasks` rows from Russian back to English; changing `SEED_TASKS` in `seedAgentTasks.ts` alone did nothing since the table already had 5+ rows.

**How to apply:** When "fixing" or "translating" seed content post-launch, always check whether the table is already populated (`SELECT count(*) FROM <table>`) and update live rows via `psql "$DATABASE_URL"` (or a drizzle script) in addition to updating the seed source for future fresh installs. Note `agent_tasks.id` has no DB-level default (Drizzle generates it via `randomUUID()` app-side), so manual INSERTs need an explicit id.

## API server needs top-level unhandledRejection/uncaughtException handlers

`contractService`'s background ethers.js event polling/RPC calls can reject when the free-tier Sepolia RPC (Alchemy) rate-limits (429) or times out. Without a top-level `process.on("unhandledRejection"/"uncaughtException")` handler, this crashes the whole Node process, taking down every route (not just chain-related ones) until the platform respawns it — surfaces as transient 502s across the app.

**Why:** Discovered via flaky e2e test failures on an unrelated feature (Tasks page) that were actually caused by the API server randomly restarting mid-session; `artifacts/api-server/src/index.ts` had no global error handlers.

**How to apply:** Keep the `index.ts` top-level handlers (log via `logger`, don't exit) in place; if the server ever needs to hard-exit on a truly fatal error, do it explicitly rather than relying on an unhandled rejection to crash it.

## Pending Work

1. **Chainlink Subscription** — user has LINK + ETH on deployer wallet; needs to create subscription at functions.chain.link/sepolia, fund it, add the contract as consumer, then add `CHAINLINK_SUBSCRIPTION_ID` to Replit Secrets. Programmatic creation is blocked by Chainlink ToS (must use web UI first). Note: this must be redone against the new (2026-07-05) contract address — a subscription tied to the old address won't authorize the new one as a consumer.
2. **Etherscan verification** — needs `ETHERSCAN_API_KEY` secret, then run `pnpm --filter @workspace/contracts run verify:sepolia` (against the current live address).
3. **Contract upgrades** — Staking, Governance, and PoU score tiers discussed as future versions.

## Local Hardhat

- MockFunctionsRouter: `0x5FbDB2315678afecb367f032d93F642f64180aa3`
- Local ARZYG: `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`
- Full on-chain cycle works locally (MINT ON-CHAIN button)

**Why:** Critical deployment info not derivable from code alone — live addresses, secret status, and pending tasks.
