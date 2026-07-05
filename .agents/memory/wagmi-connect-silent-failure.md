---
name: wagmi useConnect silent failures
description: wagmi's connect() mutation fails silently in the UI unless the error state is explicitly wired up; this is a common root cause behind "Connect Wallet button doesn't work" reports.
---

`useConnect()`'s `connect({ connector })` call doesn't throw into the click handler and isn't awaited by default — if a component doesn't read the hook's `error`/`isPending` state, a failed connection (no wallet extension, user rejection, etc.) produces zero visible feedback: no toast, no spinner, no error. To the user this looks exactly like "the button doesn't work."

**Why:** wagmi models `connect` as a TanStack Query mutation. Mutations swallow rejections internally (the promise still resolves for React Query's bookkeeping) unless the caller consumes `error`/`isError` from the hook or uses `connectAsync` with try/catch.

**How to apply:** Whenever building/debugging a wallet-connect button, check whether the component destructures and surfaces `error` (and ideally `isPending`, disabling per-connector while pending) from `useConnect()`. If not, that's very likely the actual bug — not missing config, not wrong connector setup. Common error messages to map to friendly text: `"Connector not found."` and `"Provider not found."` (no extension installed) — wagmi's wording differs by connector type, so match both.
