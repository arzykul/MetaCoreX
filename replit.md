# MetaCoreX

Web3/Web4 infrastructure for the MetaCoreX ecosystem — including the ARZY-G ERC-20 AI token and supporting smart contract infrastructure.

## Run & Operate

- `pnpm --filter @workspace/contracts run compile` — compile Solidity contracts (Hardhat)
- `pnpm --filter @workspace/contracts run test` — run contract tests
- `pnpm --filter @workspace/contracts run node` — start a local Hardhat EVM node
- `pnpm --filter @workspace/contracts run deploy:local` — deploy to local Hardhat node
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
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

## Architecture decisions

- OZ v5 requires `evmVersion: "cancun"` — the `mcopy` opcode used in `Bytes.sol` is Cancun-only; using `paris` causes compile errors.
- ARZY-G uses individual Hardhat plugins (not `hardhat-toolbox`) to avoid the Ignition peer-dep chain.
- Role-based access with `AccessControl` — MINTER_ROLE, AI_OPERATOR_ROLE, and PAUSER_ROLE are all granted to the admin at deploy time and can be delegated later.
- AI daily mint quota is enforced on-chain using a UTC day epoch (`block.timestamp / 1 days`).
- ERC-2612 Permit is included so AI agents can execute gasless approvals via off-chain signatures.

## Product

MetaCoreX ARZY-G is an ERC-20 token with an AI integration layer:
- Standard token operations (transfer, approve, burn)
- Gasless approvals via EIP-2612 Permit — ideal for AI agent pipelines
- `aiMint`: AI operators can mint within a configurable daily cap
- `aiTransfer`: AI agents can execute transfers on behalf of users (with approval)
- Emergency pause/unpause for circuit-breaker safety
- Hard 1 billion token supply ceiling enforced on-chain

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- OpenZeppelin v5 requires `evmVersion: "cancun"` — do not downgrade to `paris`.
- `pnpm approve-builds` is interactive; keccak and secp256k1 are listed in `onlyBuiltDependencies` in `pnpm-workspace.yaml` so they build automatically on `pnpm install`.
- `autoInstallPeers: false` in workspace — all peer deps must be listed explicitly in `package.json`.
- Hardhat telemetry prompt blocks non-interactive terminals; prefix commands with `HARDHAT_DISABLE_TELEMETRY_PROMPT=true`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
