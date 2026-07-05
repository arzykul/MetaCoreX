# Deploying MetaCoreX

The API server (which also serves the Visual Core dashboard as static files) ships as a self-contained Docker image and deploys cleanly to [Fly.io](https://fly.io). This doc covers Fly.io, plus the required secrets and how to verify the deploy.

## What gets deployed

Only `@workspace/api-server` runs in production — it's an Express 5 app that serves `public/` (the dashboard) at `/` and the JSON API at `/api/*`. The Hardhat local node, contract compilation, and other workspace packages are dev-time only and are not part of the runtime image.

## 1. Build the image locally (optional sanity check)

```bash
docker build -t metacorex-api .
docker run --rm -p 8080:8080 \
  -e DATABASE_URL="postgres://user:pass@host:5432/db" \
  -e SEPOLIA_RPC_URL="https://..." \
  metacorex-api
curl http://localhost:8080/api/healthz
```

The image is a multi-stage build: a `builder` stage installs the full pnpm workspace and runs `pnpm --filter @workspace/api-server run build` (esbuild bundle), then a slim runtime stage copies out only `dist/`, `public/`, and the `contracts/deployed.json` + `contracts/artifacts` the server reads for contract addresses/ABIs. No `node_modules` are needed at runtime — esbuild bundles all pure-JS dependencies into `dist/index.mjs`.

## 2. Install the Fly.io CLI and log in

```bash
curl -L https://fly.io/install.sh | sh
fly auth login
```

## 3. Launch (first time only)

`fly.toml` is already committed with the app configuration (internal port `8080`, health check on `/api/healthz`). From the repo root:

```bash
fly launch --no-deploy
```

Choose "yes" when it asks to use the existing `fly.toml`, and choose a Postgres option if you want Fly to provision one for you (or skip it and point `DATABASE_URL` at any external Postgres — Neon, Supabase, Fly Postgres, etc.).

## 4. Set secrets

The server needs a database, and needs at least one RPC endpoint if you want live on-chain data (it will boot and serve the dashboard without one, retrying the connection in the background, but on-chain reads/writes will be unavailable):

```bash
fly secrets set DATABASE_URL="postgres://..."
fly secrets set SEPOLIA_RPC_URL="https://eth-sepolia.g.alchemy.com/v2/..."
fly secrets set DEPLOYER_PRIVATE_KEY="0x..."   # only needed for admin-signed txs (mint-demo, role management)
```

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | **Yes** | Postgres connection string. The server imports `@workspace/db` at startup, which throws immediately if this is unset — the process will not boot without it. |
| `SEPOLIA_RPC_URL` (or `ETH_RPC_URL`) | Recommended | Overrides the RPC URL baked into `contracts/deployed.json` at runtime. Without it, on-chain reads use whatever is committed there. |
| `DEPLOYER_PRIVATE_KEY` | Optional | Needed only for routes that sign transactions server-side (e.g. `/api/contract/mint-demo`, admin role changes). Third-party agents never need this — see [agent.md](./agent.md). |
| `PORT` | No | Set to `8080` in the Dockerfile/`fly.toml` already; don't override unless you also update `fly.toml`'s `internal_port`. |
| `NODE_ENV` | Recommended | Set to `production` on Fly — this disables the dev-only demo event routes (`/api/events/emit`, `/api/events/demo`). |

Never put `scripts/.agent-internal-token`'s value in a Fly secret or anywhere else reachable from a fork of this repo — it's meant to stay a local, gitignored file. See [agent.md](./agent.md) for why.

## 5. Deploy

```bash
fly deploy
```

Fly builds the image from the committed `Dockerfile` (no local Docker daemon required — it can build remotely) and rolls it out with the health check defined in `fly.toml` gating traffic cutover.

## 6. Verify

```bash
curl https://<your-app>.fly.dev/api/healthz
curl https://<your-app>.fly.dev/api/contract/info
```

Open `https://<your-app>.fly.dev/` to see the Visual Core dashboard live.

## Database schema

If this is a fresh database, push the Drizzle schema before (or right after) first deploy:

```bash
DATABASE_URL="postgres://..." pnpm --filter @workspace/db run push
```

Run this from your local machine (or CI) with the same `DATABASE_URL` you set as a Fly secret — it does not run automatically as part of `fly deploy`.

## Redeploying after a contract redeploy

If you redeploy `ARZYG_ERC20_AI.sol` to a new address, update `contracts/deployed.json` (committed to the repo) and either redeploy the API image or just restart it — no code changes are needed downstream. Registered third-party agents (via the GitHub Actions template in [agent.md](./agent.md)) automatically pick up the new address on their next scheduled run since they always re-fetch `GET /api/contract/info` first.

## Alternative: Replit deployments

This project also runs directly on Replit — see the workflows in the Replit UI (`API Server`, `Hardhat Local Node`, etc.) for local development, and Replit's own Deployments feature if you'd rather publish from inside the Replit workspace instead of Fly.io. The Docker/Fly.io path above is for hosting this outside of Replit.
