# MetaCoreX

Web3/Web4 infrastructure for the MetaCoreX ecosystem — including the ARZY-G ERC-20 AI token and supporting smart contract infrastructure.

## Run & Operate

- `pnpm --filter @workspace/contracts run compile` — compile Solidity contracts (Hardhat)
- `pnpm --filter @workspace/contracts run test` — run contract tests
- `pnpm --filter @workspace/contracts run node` — start a local Hardhat EVM node
- `pnpm --filter @workspace/contracts run deploy:local` — deploy to local Hardhat node
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/scripts run agent:validator` — score a test executor report with Gemini and mint ARZY-G on-chain if PoU Score ≥ 7 (`scripts/src/validator-agent.ts`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- Required env: `DATABASE_URL` — Postgres connection string (for API server)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Solidity 0.8.28, Hardhat 2.x, OpenZeppelin Contracts 5.x
- EVM target: Cancun (required for OZ v5 `mcopy` opcode)
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `contracts/contracts/ARZYG_ERC20_AI.sol` — ARZY-G ERC-20 AI token (main contract)
- `contracts/hardhat.config.ts` — Hardhat configuration
- `contracts/scripts/deploy.ts` — deployment script
- `contracts/artifacts/` — compiled contract ABIs and bytecode (gitignored)
- `contracts/typechain-types/` — generated TypeScript bindings (gitignored)
- `artifacts/api-server/src/` — Express API server source
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contracts)
- `Dockerfile`, `fly.toml` — Fly.io deployment (multi-stage build, only `@workspace/api-server` runs in prod)
- `docs/api.md`, `docs/agent.md`, `docs/deploy.md` — API reference, third-party agent connection guide, deployment guide
- `examples/agent-example.js`, `examples/agent_example.py` — standalone (non-workspace) example agents

## Architecture decisions

- OZ v5 requires `evmVersion: "cancun"` — the `mcopy` opcode used in `Bytes.sol` is Cancun-only; using `paris` causes compile errors.
- ARZY-G uses individual Hardhat plugins (not `hardhat-toolbox`) to avoid the Ignition peer-dep chain.
- Role-based access with `AccessControl` — only `DEFAULT_ADMIN_ROLE`, `DEV_ADMIN_ROLE`, and `RESERVE_ROLE` exist; `registerAgent`/`submitProof` are deliberately permissionless (no role) so third-party agents never need to be granted anything.
- AI daily mint quota is enforced on-chain using a UTC day epoch (`block.timestamp / 1 days`), shared globally (`dailyMintLimit`) and per-agent (`agentDailyCap`) across both mint paths (`submitProof` and `birthToken`).
- No ERC-2612 Permit and no `Pausable` — the contract is intentionally minimal (`ERC20` + `AccessControl` only); don't assume these exist when writing docs or examples.

## Product

MetaCoreX ARZY-G (`ERC20` + `AccessControl`, no Permit/Pausable) is an ERC-20 token with an AI integration layer:
- Standard token operations (transfer, approve) — no on-chain `burn`, `mint`, `aiMint`, `aiTransfer`, or pause/unpause; those don't exist in the deployed contract despite older docs implying otherwise
- Roles: `DEFAULT_ADMIN_ROLE` (governance, reassigns `RESERVE_ROLE`), `DEV_ADMIN_ROLE` (triggers `requestUsefulness`, sets daily quotas), `RESERVE_ROLE` (fee reserve address) — there is no `MINTER_ROLE`, `AI_OPERATOR_ROLE`, or `PAUSER_ROLE`
- `registerAgent` / `submitProof`: fully permissionless proof-of-work mint (`reward = amount * score / 10`, self-reported by the caller), bounded by a hard `MAX_SUPPLY` (1,000,000,000 ARZY-G, enforced in `_update`), an admin-configurable global `dailyMintLimit` (default 10,000/day), an admin-configurable per-agent `agentDailyCap` (default 1,000/day), and a `score <= 10` sanity check
- `requestUsefulness` → `handleOracleFulfillment` → `birthToken`: oracle-verified path (`DEV_ADMIN_ROLE` triggers the request; only the Chainlink Functions router can fulfill it) that mints the full pre-agreed amount split 99% agent / 1% reserve when score ≥ 1, sharing the same daily-quota enforcement as `submitProof`

## Connecting your own agent via GitHub

External developers can connect their own AI agent to MetaCoreX without ever sharing a private key with us:

1. Fork this repo. (The GitHub Actions workflow runs `scripts/src/github-agent.ts` inside the full pnpm workspace — copying just those two files into an unrelated repo will not work standalone.)
2. Add two GitHub Actions secrets in your fork: `AGENT_PRIVATE_KEY` (your agent wallet) and `SEPOLIA_RPC_URL` (any Sepolia RPC endpoint), plus an `API_BASE_URL` repo variable pointing at the published MetaCoreX API.
3. Fund that wallet with a little Sepolia ETH for gas from a public faucet.
4. Enable Actions — the scheduled workflow registers your agent and submits proof-of-work directly on-chain with your own key.

The script only ever calls the public parts of the MetaCoreX API (contract info, task marketplace). `registerAgent`/`submitProof` are called directly on-chain by the agent's own wallet — never sent to our server. The two routes that do accept a raw private key (`/api/agents/register`, `/api/agents/submit-proof`) are internal-only, gated by a token in the gitignored `scripts/.agent-internal-token` file (never an env var, since forks of this repo must never inherit it), and reserved for our own `scripts/src/auto-agent.ts` automation; third-party agents should not use them.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- OpenZeppelin v5 requires `evmVersion: "cancun"` — do not downgrade to `paris`.
- `pnpm approve-builds` is interactive; keccak and secp256k1 are listed in `onlyBuiltDependencies` in `pnpm-workspace.yaml` so they build automatically on `pnpm install`.
- `autoInstallPeers: false` in workspace — all peer deps must be listed explicitly in `package.json`.
- Hardhat telemetry prompt blocks non-interactive terminals; prefix commands with `HARDHAT_DISABLE_TELEMETRY_PROMPT=true`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
