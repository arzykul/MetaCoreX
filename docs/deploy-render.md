# Deploying MetaCoreX to Render

This is an alternative to [deploy.md](./deploy.md) (Fly.io) for hosting MetaCoreX entirely on [Render](https://render.com). It splits the app into two Render services:

- **`metacorex-api`** — a Docker **Web Service** running `@workspace/api-server` (the Express API, WebSocket event bus, on-chain AI-agent validator/minting logic, and background PoU proof indexer).
- **`metacorex-site`** — a **Static Site** running the built `@workspace/metacorex-site` frontend (marketing pages + dashboard).

A `render.yaml` [Blueprint](https://render.com/docs/blueprint-spec) is committed at the repo root to pre-fill both services — see "Option A" below. You can also create them by hand in the dashboard ("Option B").

## Why two services, not one

On Replit, the frontend and backend share one origin through the shared proxy (`/metacorex-site/*` → frontend, `/api/*` → backend), so the frontend can call `fetch("/api/...")` and open `wss://<same host>/api/ws` without knowing the backend's address. Render Static Sites and Web Services each get their **own** subdomain, so the frontend needs to be told the backend's URL at build time via `VITE_API_BASE_URL`. This required three small code changes (already made): `vite.config.ts` no longer requires `PORT` for a plain `vite build`, and `src/lib/api.ts` / `src/lib/ws.ts` prefix requests with `VITE_API_BASE_URL` when it's set (falling back to same-origin, relative requests when it isn't — so Replit is unaffected).

## Option A: Blueprint (`render.yaml`)

1. In the Render dashboard: **New → Blueprint**, point it at this repo.
2. Render reads `render.yaml` and proposes both services. Confirm.
3. Fill in the `sync: false` secrets Render prompts for (see "Required secrets" below) — Render never lets a Blueprint commit secret values into the YAML itself.
4. See "Deployment order" below before your first deploy — `VITE_API_BASE_URL` needs the API service's URL, which only exists after the API service's first deploy.

## Option B: Manual setup

### 1. `metacorex-api` (Web Service, Docker)

- **New → Web Service** → connect this repo.
- Runtime: **Docker**. Dockerfile path: `./Dockerfile` (already committed — see [deploy.md](./deploy.md) for what it does; no changes needed for Render).
- Health check path: `/api/healthz`.
- Set the env vars from "Required secrets" below, plus `NODE_ENV=production` and `PORT=8080` (must match the port the container listens on — the Dockerfile's `ENV PORT=8080` is only a default; Render's own `PORT` env var, once you set one, is what the container actually receives).

### 2. `metacorex-site` (Static Site)

- **New → Static Site** → connect this repo.
- Build command: `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @workspace/metacorex-site run build`
- Publish directory: `artifacts/metacorex-site/dist/public`
- Add a rewrite rule (Render dashboard → Redirects/Rewrites, or already in `render.yaml`): source `/*` → destination `/index.html`, so client-side routes (`/dashboard`, `/tasks`, `/agent/:address`, etc.) don't 404 on refresh.
- Env vars: `BASE_PATH=/` (the app is served at the site's root on Render, unlike Replit's `/metacorex-site/` prefix) and `VITE_API_BASE_URL` (see next section).

## Deployment order (avoid the chicken-and-egg)

`VITE_API_BASE_URL` is baked into the static bundle at **build time** (it's a `vite build`-time substitution, not something the browser can read at runtime). So:

1. Deploy `metacorex-api` first. Note its Render URL (e.g. `https://metacorex-api-xxxx.onrender.com`).
2. Set `VITE_API_BASE_URL=https://metacorex-api-xxxx.onrender.com` on `metacorex-site`, then deploy/redeploy it.
3. Any time you change the API service's URL (renaming it, moving to a custom domain), update `VITE_API_BASE_URL` and redeploy the site — it won't pick up the new URL on its own.

## Required secrets

Same requirements as the Fly.io deploy — see the table in [deploy.md](./deploy.md#4-set-secrets) for details on each. Set these on the **`metacorex-api`** service only (the static site never sees any of them):

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | **Yes** | Postgres connection string. |
| `SEPOLIA_RPC_URL` (or `ETH_RPC_URL`) | Recommended | On-chain reads/writes. |
| `AGENT_PRIVATE_KEY` | **Yes** | The server's own validator wallet — signs every PoU mint. Never put this in the frontend or in `render.yaml` directly; always a Render secret env var. |
| `GEMINI_API_KEY` | **Yes** | Used by `lib/pou-validator` to score every proof before minting. |
| `DEPLOYER_PRIVATE_KEY` | Optional | Only for admin-signed txs (`/api/contract/mint-demo`, role management). |

## CORS and WebSockets

`app.use(cors())` (no options) is already permissive to all origins, and the app has no cookies/session auth anywhere (all writes are either wallet-signature-verified or server-signed), so no CORS changes are needed for the cross-origin setup. Render Web Services support long-lived WebSocket connections natively — `wss://metacorex-api-xxxx.onrender.com/api/ws` works the same way `wss://<fly-app>.fly.dev/api/ws` does.

## Known limitations

- **Free-tier spin-down**: Render's free Web Service plan spins the container down after inactivity. That kills the WebSocket event bus and pauses the background PoU proof indexer until the next request wakes it back up. Use a paid instance type (`starter` or above) if you need the live event feed and indexer to run continuously.
- Everything else in [deploy.md](./deploy.md) — database schema push, redeploying after a contract address change, etc. — applies identically here; only the hosting target changes.
