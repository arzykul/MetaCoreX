# MetaCoreX API Server — production image for Fly.io (or any Docker host).
#
# This builds ONLY @workspace/api-server (the Express JSON API under /api).
# The frontend (marketing site + dashboard) is a separate artifact
# (@workspace/metacorex-site) deployed independently — see render.yaml and
# docs/deploy-render.md. The other artifacts in this monorepo (diabeto,
# personal-agent, mockup-sandbox) are Replit-only previews and are not part
# of this image either.
#
# The final runtime stage deliberately mirrors this repo's own directory
# depth (artifacts/api-server/dist two levels under the image root, with
# contracts/ as a sibling of "artifacts/") because
# artifacts/api-server/src/services/contractService.ts and
# src/routes/agent.ts both resolve paths as
# `resolve(process.cwd(), "..", "..")` to find the workspace root at
# runtime. Keep that layout in sync with this Dockerfile if those
# resolution paths ever change.

# ---- deps + build -----------------------------------------------------
FROM node:24-slim AS builder

RUN corepack enable

WORKDIR /repo

# Copy the whole workspace (pnpm needs every member's package.json present
# to validate the lockfile) — .dockerignore strips node_modules, build
# output, and files unrelated to the build.
COPY . .

RUN pnpm install --frozen-lockfile

# contracts/artifacts is gitignored (compiled output), so a fresh clone of
# this repo (e.g. Render/GitHub Actions pulling from GitHub) never has it on
# disk. Compile it here from the committed Solidity source so the runtime
# COPY below has something real to copy — don't rely on it already existing
# in the build context (it only "works" locally because Replit's disk still
# has a locally-compiled copy lying around despite being gitignored).
RUN pnpm --filter @workspace/contracts run compile

RUN pnpm --filter @workspace/api-server run build

# ---- runtime ------------------------------------------------------------
# The esbuild bundle (see artifacts/api-server/build.mjs) inlines all
# runtime dependencies except a fixed list of native/optional modules, so
# the runtime image needs no node_modules at all — just Node itself.
FROM node:24-slim AS runtime

ENV NODE_ENV=production

WORKDIR /app

# Mirror the monorepo's own nesting: contracts/ sits two levels above
# artifacts/api-server, matching the `resolve(cwd, "..", "..")` calls in
# the server source.
COPY --from=builder /repo/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=builder /repo/contracts/deployed.json ./contracts/deployed.json
COPY --from=builder /repo/contracts/artifacts ./contracts/artifacts

WORKDIR /app/artifacts/api-server

# Fly.io sets $PORT to 8080 by default for Docker deploys unless overridden
# in fly.toml; index.ts requires PORT to be set explicitly (no default).
ENV PORT=8080
EXPOSE 8080

CMD ["node", "--enable-source-maps", "dist/index.mjs"]
