---
name: MetaCoreX verification API field types
description: VerificationCertificate/PlatformCashback generated types use raw on-chain numerics, not human strings — easy to misassume from field names alone.
---

`VerificationCertificate` (from the ReportVerification indexer/API) is a thin, unstyled mirror of on-chain state, not a friendly DTO:

- `tier` is a raw `number` (0 = standard, 1 = premium), not `"standard" | "premium"`.
- `status` is a raw `number` (0=None, 1=Requested, 2=Posted, 3=Disputed, 4=Finalized), not a string enum.
- `requestedAt` / `postedAt` are unix-seconds **as strings** (e.g. `"0"` when unset), not ISO date strings. `new Date(rawString)` silently produces "Invalid Date" or a bogus year-2000 date for `"0"` — always gate on `Number(x) > 0` and multiply by 1000 before constructing a `Date`.
- `PlatformCashback`'s balance field is `claimableArzyg`, not `claimable`.

**Why:** a design subagent (and the main agent's own first-draft brief to it) assumed friendlier string enums/ISO timestamps by analogy with typical REST APIs, which produced both a wrong brief and a real UI rendering bug (postedAt showing "Invalid Date"). The actual shape only exists in `lib/api-client-react/src/generated/api.schemas.ts` — grep it, don't infer from field names.

**How to apply:** before writing or briefing any UI code against `useGetVerificationCertificate` / `useGetPlatformCashback` (or any other ReportVerification-derived endpoint), read the real interface in `api.schemas.ts` first and map numeric tier/status to labels and unix-seconds strings to `Date` explicitly in the component.
