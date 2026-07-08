---
name: Full-teardown disconnect handlers must always reschedule reconnect
description: A shared "disconnect" method for an external connection (RPC provider, socket, etc.) must itself own retry scheduling, not rely on every caller to remember to schedule one.
---

## The lesson

When a service has one method that tears down a live connection (clears
handles, flips a `connected` flag) and is called from multiple error paths,
only ONE of those call sites scheduling the reconnect timer is a latent bug:
any other call site that also tears the connection down but forgets to
schedule a retry leaves the service permanently disconnected until the
process restarts — even though the underlying failure (e.g. a transient
RPC 429) was completely transient.

**Why:** Found in `artifacts/api-server/src/services/contractService.ts` —
the connection bootstrap path (`_tryConnect`'s catch) scheduled a retry
after tearing down, but a separate read method's catch block called the
same teardown helper directly without scheduling one. A single rate-limited
RPC call there silently killed the connection for good.

**How to apply:** Put `scheduleRetry()` (or equivalent) *inside* the shared
teardown/disconnect method itself, so every caller gets automatic recovery
for free — don't rely on each call site to remember. For read-heavy
external calls prone to transient failures (RPC rate limits, flaky
sockets), also add a retry-with-backoff wrapper around the individual call
so a single blip doesn't need a full reconnect at all.
