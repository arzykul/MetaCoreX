---
name: RPC eth_getLogs block-range limits
description: Free-tier RPC providers (e.g. Alchemy) reject queryFilter/eth_getLogs calls spanning too many blocks — scanning from block 0 breaks in production.
---

## The problem

Calling `contract.queryFilter(filter, 0, "latest")` to reconstruct historical event state (e.g. "list all registered agents") works fine on a fresh local Hardhat node but fails on live networks through free-tier RPC providers. Alchemy's free tier can reject `eth_getLogs` with a block range error (seen limit: as low as ~10 blocks) — the exact cap is provider/plan-dependent and not worth hard-coding.

**Why:** Naively scanning from block 0 (or any distant historical block) either gets rejected outright or would require an infeasible number of chunked requests once the chain has advanced far past the contract's deployment block.

## How to apply

- Anchor historical log scans at the contract's **deployment block** (persist it in deploy scripts / deployment metadata), never at block 0.
- Query adaptively: try the full needed range, and on a provider error recursively halve the range until each half succeeds — this self-tunes to whatever limit the current provider/plan enforces, instead of hard-coding a number that may change.
- Cache results and only re-scan incrementally (from last-scanned-block+1 to latest) on subsequent calls; don't repeat the full historical scan every time the endpoint is hit.
- Feed the same cache from any live event listener already subscribed on the contract, so new events don't require a rescan at all.

## Rate limiting is a separate failure mode from range-too-large

Free-tier providers also rate-limit **compute units/sec** (HTTP 429), independent of block-range width — this can fire even on a single-block query if requests burst too fast (e.g. a bisecting scanner firing sub-queries via `Promise.all`).

**Why:** A checkpoint/cursor-based scanner (e.g. "scan since last-seen block, then advance checkpoint to latest") that silently swallows a give-up leaf as `return []` while still advancing the checkpoint **permanently loses** any events in that failed sub-range — they can never be rescanned since the cursor already passed them. This caused a live agent registry to drop to 0 agents after a server restart triggered a large catch-up scan that got 429'd.

**How to apply:**
- Detect rate-limit errors (HTTP 429 / "compute units" in the message) and retry in place with exponential backoff *before* bisecting or giving up.
- Bisect sequentially, not in parallel — concurrent sub-queries are what trigger the burst rate limit in the first place.
- Never advance the checkpoint unless the **entire** range was confirmed scanned: propagate (throw) on unrecoverable failure instead of returning an empty result, so the next call retries the same range rather than silently losing it.
