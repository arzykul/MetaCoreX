---
name: Resumable on-chain seeding scripts in this sandbox
description: Background processes (nohup/disown) do not survive across tool calls here; long multi-tx scripts must be idempotent and resumed via repeated bounded-timeout synchronous runs.
---

## Background processes die silently

`nohup ... & disown` (or any detached background process) does not survive across separate bash tool calls in this sandbox — the process is gone (not in `ps aux`) with no error output on the next call. Do not rely on backgrounding + polling for long-running foreground work like multi-transaction on-chain scripts.

**Why:** Confirmed empirically while running a 30-transaction Sepolia seeding script — a backgrounded resume attempt vanished within ~60s with zero output, while `timeout 110 <cmd>` runs in the same turn worked reliably.

**How to apply:** For any script that may run longer than one tool call's timeout, run it synchronously with `timeout <N>` (N safely under the tool's max) and make the script itself resumable:
- Persist progress incrementally (after each successful unit of work, not just at the end) to a local state file.
- On each invocation, reload state and skip already-completed units (idempotency check) before doing any new work.
- If a run gets killed mid-unit (e.g. a tx was broadcast but the state file wasn't updated before timeout), verify the true state by querying the source of truth (on-chain balance / API read) rather than assuming success or failure — then reconcile the local state file to match before resuming.
- Re-invoke the same bounded command repeatedly until the script reports full completion.
