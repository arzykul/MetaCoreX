# Deploying MetaCoreX to Render

This is an alternative to [deploy.md](./deploy.md) (Fly.io) for hosting MetaCoreX entirely on [Render](https://render.com). It splits the app into two Render services:

- **`metacorex-backend`** — a Docker **Web Service** running `@workspace/api-server` (the Express API, WebSocket event bus, on-chain AI-agent validator/minting logic, and background PoU proof indexer). Pure JSON API only — no static files or SPA fallback are served from this service.
- **`metacorex-frontend`** — a **Static Site** running the built `@workspace/metacorex-site` frontend (marketing pages + dashboard).

A `render.yaml` [Blueprint](https://render.com/docs/blueprint-spec) is committed at the repo root to pre-fill both services — see "Option A" below. You can also create them by hand in the dashboard ("Option B").

## Why two services, not one

On Replit, the frontend and backend share one origin through the shared proxy (`/metacorex-site/*` → frontend, `/api/*` → backend), so the frontend can call `fetch("/api/...")` and open `wss://<same host>/api/ws` without knowing the backend's address. Render Static Sites and Web Services each get their **own** subdomain, so the frontend needs to be told the backend's URL at build time via `VITE_API_URL`. This required three small code changes (already made): `vite.config.ts` no longer requires `PORT` for a plain `vite build`, and `src/lib/api.ts` / `src/lib/ws.ts` prefix requests with `VITE_API_URL` when it's set (falling back to same-origin, relative requests when it isn't — so Replit is unaffected).

## Why both services build with pnpm, not npm

`@workspace/metacorex-site` and `@workspace/api-server` each depend on other workspace packages via the `workspace:*` protocol (e.g. `@workspace/api-client-react`, `@workspace/db`) — only pnpm resolves that protocol. A plain `npm install` run inside either artifact's own directory cannot see the rest of the workspace and will fail to resolve those dependencies, so both services' build commands run `pnpm install` from a full checkout of the repo (see the Blueprint below), not a `cd <artifact> && npm install`.

## Option A: Blueprint (`render.yaml`)

1. In the Render dashboard: **New → Blueprint**, point it at this repo.
2. Render reads `render.yaml` and proposes both services. Confirm.
3. Fill in the `sync: false` secrets Render prompts for (see "Required secrets" below) — Render never lets a Blueprint commit secret values into the YAML itself.
4. See "Deployment order" below before your first deploy — `VITE_API_URL` needs the API service's URL, which only exists after the API service's first deploy.

## Option B: Manual setup

### 1. `metacorex-backend` (Web Service, Docker)

- **New → Web Service** → connect this repo.
- Runtime: **Docker**. Dockerfile path: `./Dockerfile` (already committed — see [deploy.md](./deploy.md) for what it does; no changes needed for Render). Keep this a Docker service rather than switching to Render's native Node runtime: `contractService.ts` resolves the workspace root at runtime as `resolve(cwd, "..", "..")` to find `contracts/deployed.json` and `contracts/artifacts`, and the Dockerfile's runtime stage is built to mirror that exact directory depth.
- Health check path: `/api/healthz`.
- Set the env vars from "Required secrets" below, plus `NODE_ENV=production` and `PORT=8080` (must match the port the container listens on — the Dockerfile's `ENV PORT=8080` is only a default; Render's own `PORT` env var, once you set one, is what the container actually receives).

### 2. `metacorex-frontend` (Static Site)

- **New → Static Site** → connect this repo.
- Build command: `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @workspace/metacorex-site run build`
- Publish directory: `artifacts/metacorex-site/dist/public` (Vite's configured `build.outDir` — note it's nested one level under `dist/`, not `dist/` itself).
- Add a rewrite rule (Render dashboard → Redirects/Rewrites, or already in `render.yaml`): source `/*` → destination `/index.html`, so client-side routes (`/dashboard`, `/tasks`, `/agent/:address`, etc.) don't 404 on refresh.
- Env vars: `BASE_PATH=/` (the app is served at the site's root on Render, unlike Replit's `/metacorex-site/` prefix) and `VITE_API_URL` (see next section). A committed `artifacts/metacorex-site/.env.example` documents every client-side env var the app reads.

## Deployment order (avoid the chicken-and-egg)

`VITE_API_URL` is baked into the static bundle at **build time** (it's a `vite build`-time substitution, not something the browser can read at runtime). So:

1. Deploy `metacorex-backend` first. Note its Render URL (e.g. `https://metacorex-backend-xxxx.onrender.com`).
2. Set `VITE_API_URL=https://metacorex-backend-xxxx.onrender.com` on `metacorex-frontend`, then deploy/redeploy it.
3. Any time you change the API service's URL (renaming it, moving to a custom domain), update `VITE_API_URL` and redeploy the site — it won't pick up the new URL on its own.

## Required secrets

Same requirements as the Fly.io deploy — see the table in [deploy.md](./deploy.md#4-set-secrets) for details on each. Set these on the **`metacorex-backend`** service only (the static site never sees any of them):

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | **Yes** | Postgres connection string. |
| `SEPOLIA_RPC_URL` (or `ETH_RPC_URL`) | Recommended | On-chain reads/writes. |
| `AGENT_PRIVATE_KEY` | **Yes** | The server's own validator wallet — signs every PoU mint. Never put this in the frontend or in `render.yaml` directly; always a Render secret env var. |
| `GEMINI_API_KEY` | **Yes** | Used by `lib/pou-validator` to score every proof before minting. |
| `DEPLOYER_PRIVATE_KEY` | Optional | Only for admin-signed txs (`/api/contract/mint-demo`, role management). |

There is no `CONTRACT_ADDRESS` env var — the deployed contract's address comes from `contracts/deployed.json`, which is generated by the deploy scripts and baked into the Docker image at build time (see `Dockerfile`).

## CORS and WebSockets

`app.use(cors())` (no options) is already permissive to all origins, and the app has no cookies/session auth anywhere (all writes are either wallet-signature-verified or server-signed), so no CORS changes are needed for the cross-origin setup. Render Web Services support long-lived WebSocket connections natively — `wss://metacorex-backend-xxxx.onrender.com/api/ws` works the same way `wss://<fly-app>.fly.dev/api/ws` does.

## Known limitations

- **Free-tier spin-down**: Render's free Web Service plan spins the container down after inactivity. That kills the WebSocket event bus and pauses the background PoU proof indexer until the next request wakes it back up. `render.yaml` sets `plan: starter` on `metacorex-backend` for exactly this reason — use a paid instance type (`starter` or above) if you need the live event feed and indexer to run continuously.
- Everything else in [deploy.md](./deploy.md) — database schema push, redeploying after a contract address change, etc. — applies identically here; only the hosting target changes.
