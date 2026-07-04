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
