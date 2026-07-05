---
name: esbuild external transitive deps must be declared where they're used
description: esbuild `external` patterns in an artifact's build.mjs externalize transitive deps from workspace libs, but Node can't resolve them unless the artifact's own package.json also declares them.
---

If an artifact's esbuild config externalizes a package pattern (e.g. `external: ["@google/*"]` in `build.mjs`), any package matching that pattern is left as a bare `import`/`require` in the bundled output rather than being inlined — including when it's only a *transitive* dependency pulled in through a workspace `lib/*` package, not something the artifact imports directly.

**Why:** pnpm's workspace linking means the transitive package is resolvable at typecheck/build time (it's in the lib's `package.json` and hoisted into the workspace node_modules), so `tsc` and esbuild's bundling both succeed silently. But at runtime, Node resolves the externalized `import` from the *artifact's own* `node_modules`/package boundary — if the artifact's `package.json` never declared that dependency itself, Node throws `ERR_MODULE_NOT_FOUND` even though the build succeeded and typecheck was clean.

**How to apply:** Whenever a workspace `lib/*` package gains a new runtime dependency that falls under an existing `external` pattern in a consuming artifact's build config, add that same dependency directly to the artifact's own `package.json` (matching the lib's version) — don't rely on it being hoisted. This class of bug only shows up when you actually *restart the built/started service*, not from `pnpm run typecheck` or `pnpm run build` alone, so always restart and check runtime logs after adding a dependency to a shared lib.
