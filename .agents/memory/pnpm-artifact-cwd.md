---
name: pnpm artifact process.cwd()
description: When api-server (or any artifact) resolves file paths at runtime, process.cwd() is the artifact dir, not workspace root.
---

## Rule

`process.cwd()` inside an artifact server process = the artifact's own directory (e.g. `artifacts/api-server/`), NOT the workspace root.

## Why

pnpm changes the working directory to the package root before running each package's scripts. So `node dist/index.mjs` runs with cwd = `artifacts/api-server/`.

## How to apply

To reach the workspace root from an artifact server:
```typescript
import { resolve } from "node:path";
// artifacts/api-server → artifacts → workspace root
const workspaceRoot = resolve(process.cwd(), "..", "..");
```

Do NOT use `import.meta.url` for this — esbuild may not resolve it to the bundle file location as expected.
