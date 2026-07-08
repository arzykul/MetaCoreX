---
name: ethers v6 contract.on() kills free-tier RPC
description: contract.on() in ethers v6 uses eth_newFilter + eth_getFilterChanges under the hood, which rapidly exhausts Alchemy free-tier compute units.
---

## Rule
Never use `contract.on("EventName", ...)` in server code connected to a free-tier RPC (Alchemy, Infura, etc.). Replace with a polling loop that uses `contract.queryFilter()` (eth_getLogs) on a fixed interval.

**Why:** ethers v6 maps `contract.on()` to `eth_newFilter` (creates a server-side filter object) + repeated `eth_getFilterChanges` calls on every polling tick. With 8+ active filters, this saturates Alchemy's free-tier CU/s budget within minutes, producing a wall of 429 errors that also takes down the indexers' separate eth_getLogs calls via backpressure.

**How to apply:** In `contractService.ts`, the `_startEventPoller()` / `_pollEvents()` methods replace the old `_subscribeEvents()`. Poll every 30s with `Promise.allSettled` across all event types — use the same `_queryFilterAdaptive` helper (already has rate-limit backoff + bisect). Pass the correct contract instance to `_queryFilterAdaptive` (the 4th param) when scanning events from a contract other than `this.token`.

Also fix: `_queryFilterAdaptive` must accept an optional `contract` param — previously it hardcoded `this.token.queryFilter()` even when called with ReportVerification filters, silently returning empty results for all RV events.
