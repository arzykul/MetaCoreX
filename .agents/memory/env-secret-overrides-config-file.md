---
name: Env var secrets silently override config-file fallbacks
description: A secret like SEPOLIA_RPC_URL takes precedence over a deployed.json/config-file value in code — fixing the file alone doesn't fix production if the secret is also broken.
---

## The problem

`contractService.ts` resolves its RPC URL as `process.env.SEPOLIA_RPC_URL ?? process.env.ETH_RPC_URL ?? deployed.rpcUrl`. A broken/exposed Alchemy key was fixed in `contracts/deployed.json`, but the exact same broken key was *also* set as the `SEPOLIA_RPC_URL` secret — which wins the `??` chain every time. The code fix had zero effect until the secret itself was corrected.

**Why:** Whenever a fix touches a value that's also configurable via an env var/secret with higher precedence in code, check the secret's existence (`viewEnvVars`) before declaring the fix complete — a correct file/default is silently shadowed by a stale secret.

**How to apply:** After patching a config file value referenced by `?? process.env.X ?? file.value` precedence chains, grep for that env var name and confirm it isn't set to the same broken value.

## Defense in depth: rotate RPC candidates on ANY repeated connect failure, not just 429/403

The RPC failover logic only rotated to the next fallback URL when `isRateLimitError()` matched (429/403/rate-limit wording). A malformed URL or dead host fails with a generic "failed to detect network" error that doesn't match, so the service retried the exact same broken URL forever and never reached the working fallbacks in the list.

**Why:** A misconfigured or garbage secret value is a realistic failure mode (e.g. a user pasting an API key fragment instead of a full URL) and is just as fatal as rate-limiting — the failover safety net must cover it too.

**How to apply:** When building an RPC/provider failover mechanism, rotate after N consecutive failures of *any* kind on the same candidate (not only recognized rate-limit signals), so a persistently broken primary can never permanently block a service that has working fallbacks configured.

## Never log a full RPC/API URL

Providers like Alchemy/Infura embed the API key directly in the URL path. Logging the raw URL on every connection attempt (including retries) leaks the key into log aggregators repeatedly. Redact to `protocol//host` only before logging.

## ethers v6 JsonRpcProvider never rejects on failed initial network detection

When the RPC URL is malformed or the host is dead, `JsonRpcProvider` doesn't throw — it logs `"failed to detect network... retry in 1s"` and loops internally forever. Any `await provider.getBlockNumber()` (or similar) called right after construction hangs indefinitely instead of rejecting, which silently defeats rotation/retry logic built around try/catch.

**Why:** Rotation logic that assumes "a bad URL throws quickly" never fires if the provider just hangs — the process looks alive (no error) but never makes progress.

**How to apply:** Wrap the first post-construction call in `Promise.race([call, timeoutPromise])`, `destroy()` the provider if the timeout wins, and throw so the failure counts toward your rotation/backoff logic. Don't trust ethers v6 to fail fast on a bad endpoint.

## Reconnect logic triggered from multiple call sites can stack duplicate retry timers

If several independent consumers (e.g. multiple background pollers) each call the same `_handleDisconnect()` → `_scheduleRetry()` path on failure, and `_scheduleRetry()` doesn't clear a pre-existing timer before setting a new one, near-simultaneous failures stack multiple timers that all fire around the same time — producing duplicate concurrent reconnect attempts (visible as repeated "connected to X" log lines) and amplifying load on an already-struggling RPC.

**Why:** A single shared reconnect scheduler must be idempotent under concurrent callers, or transient failures compound instead of settling.

**How to apply:** Always `clearTimeout`/null-out the existing timer handle at the top of a retry-scheduling function before creating a new one, and add a boolean reentrancy guard around the actual connect attempt itself as defense in depth.
