# MetaCoreX API Server — production image for Fly.io (or any Docker host).
#
# This builds ONLY @workspace/api-server (the Express API + the static
# "Visual Core" dashboard it serves at "/"). The other artifacts in this
# monorepo (metacorex-site, diabeto, personal-agent, mockup-sandbox) are
# Replit-only previews and are not part of this image.
#
# The final runtime stage deliberately mirrors this repo's own directory
# depth (artifacts/api-server/dist two levels under the image root, with
# public/ and contracts/ as siblings of "artifacts/") because
# artifacts/api-server/src/app.ts and src/services/contractService.ts both
# resolve paths as `resolve(process.cwd(), "..", "..")` to find the
# workspace root at runtime. Keep that layout in sync with this Dockerfile
# if those resolution paths ever change.

# ---- deps + build -----------------------------------------------------
FROM node:24-slim AS builder

RUN corepack enable

WORKDIR /repo

# Copy the whole workspace (pnpm needs every member's package.json present
# to validate the lockfile) — .dockerignore strips node_modules, build
# output, and files unrelated to the build.
COPY . .

RUN pnpm install --frozen-lockfile

RUN pnpm --filter @workspace/api-server run build

# ---- runtime ------------------------------------------------------------
# The esbuild bundle (see artifacts/api-server/build.mjs) inlines all
# runtime dependencies except a fixed list of native/optional modules, so
# the runtime image needs no node_modules at all — just Node itself.
FROM node:24-slim AS runtime

ENV NODE_ENV=production

WORKDIR /app

# Mirror the monorepo's own nesting: contracts/ and public/ sit two levels
# above artifacts/api-server, matching the `resolve(cwd, "..", "..")` calls
# in the server source.
COPY --from=builder /repo/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=builder /repo/public ./public
COPY --from=builder /repo/contracts/deployed.json ./contracts/deployed.json
COPY --from=builder /repo/contracts/artifacts ./contracts/artifacts

WORKDIR /app/artifacts/api-server

# Fly.io sets $PORT to 8080 by default for Docker deploys unless overridden
# in fly.toml; index.ts requires PORT to be set explicitly (no default).
ENV PORT=8080
EXPOSE 8080

CMD ["node", "--enable-source-maps", "dist/index.mjs"]
