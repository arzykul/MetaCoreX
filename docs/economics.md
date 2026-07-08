# ReportVerification: Fees, Cashback & Disputes

`ReportVerification.sol` is a standalone Proof-of-Usefulness verification oracle for MetaCoreX. It is a **separate contract** from the ARZY-G token — it only ever calls the token through the standard `IERC20` interface (`transferFrom`/`transfer`), holds no role on it, and its deployment never touches or redeploys `ARZYG_ERC20_AI.sol`.

Any agent can pay a flat ARZY-G fee to have a free-text report scored by an oracle and get a permanent on-chain certificate of the result.

## Tiers & fees

| Tier | Fee | Scoring | Status |
|---|---|---|---|
| Standard | 3 ARZY-G | Gemini-based AI validator (`lib/pou-validator`), posted automatically by a background worker | Live |
| Premium | 5 ARZY-G | Real Chainlink Functions consumer, wired up in the contract | Shipped but **admin-disabled** (`premiumEnabled = false`) — the live token's Chainlink Functions subscription (`subscriptionId: "0"` in `deployed.json`) has never been funded, so there's no real subscription to route it through yet. An admin can flip it on later via `setPremiumEnabled(true)` + `setFunctionsConfig(...)` once one exists. |

Fees are paid directly by the agent's own wallet — the agent `approve()`s the contract for the fee, then calls `requestVerification(reportHash, tier, referrer)` themselves. The server never holds or signs a fee-paying transaction on an agent's behalf.

`reportHash` is `keccak256` of the off-chain report text (`ethers.id(reportText)` client-side, `keccak256(bytes(reportText))` in Solidity) — the report text itself never goes on-chain. The text + an EIP-191 signature proving authorship are submitted separately via `POST /api/verify/submit` (see [api.md](./api.md)), and a background indexer/scorer correlates the two halves.

## Fee split

Once a request is finalized, its fee is split:

- **10%** (`CASHBACK_BPS = 1_000` / 10,000) — claimable cashback for the `referrer` address supplied at request time (an optional platform/integrator that sent the agent to MetaCoreX). If no referrer was supplied, this share simply stays with the protocol treasury instead — it does **not** go unclaimed or get burned.
- **90%** — protocol treasury, always.

There is no buyback/reserve cut — it was explicitly removed from the design; the split is only ever cashback-vs-treasury.

Cashback is pull-based: a referrer calls `claimRewards()` themselves to withdraw their accumulated `claimableCashback` balance. The server never relays or signs a withdrawal on anyone's behalf — `GET /api/platforms/:address/cashback` is a read-only convenience for platforms to check their balance before claiming.

## Lifecycle & optimistic disputes

```
requestVerification() ──▶ Requested ──▶ recordVerification() ──▶ Posted ──┬─▶ finalize() ──▶ Finalized
     (agent pays fee)      (oracle posts score)                            │   (after 24h, no dispute)
                                                                            │
                                                                            └─▶ dispute() ──▶ Disputed ──▶ resolveDispute() ──▶ Finalized
                                                                                (anyone posts             (arbiter decides)
                                                                                 2x-fee bond)
```

1. **Requested** — agent pays the tier's flat fee, escrowed in the contract.
2. **Posted** — the oracle (standard: the server's existing Gemini-backed validator wallet, granted `ORACLE_ROLE`; premium: the Chainlink Functions callback) posts a `score` (0-10). A 24-hour challenge window (`challengeWindow`, admin-adjustable) starts.
3. During the challenge window, **anyone** can call `dispute(requestId)`, posting a bond equal to `BOND_MULTIPLIER` (2x) the request's fee.
   - No dispute within the window → anyone can call `finalize(requestId)`, which distributes the fee per the split above and marks the request `Finalized`.
   - Disputed → an address holding `ARBITER_ROLE` calls `resolveDispute(requestId, upheld, newScore)`:
     - **Upheld**: the disputer's bond is refunded in full and the score is corrected to `newScore`.
     - **Rejected**: the bond is forfeited to the protocol treasury and the original score stands.
     - Either way, the request is finalized (fee distributed) in the same transaction.

Only one dispute is allowed per request — there is no appeal beyond the arbiter's decision.

## Roles

| Role | Grantee | Powers |
|---|---|---|
| `DEFAULT_ADMIN_ROLE` | deployer admin | `setTreasury`, `setChallengeWindow`, `setPremiumEnabled`, `setFunctionsConfig` |
| `ORACLE_ROLE` | the server's existing validator wallet (same key used for PoU minting) | `recordVerification` (standard tier), `triggerPremiumOracle` (premium tier) |
| `ARBITER_ROLE` | admin-designated arbiter address | `resolveDispute` |

No public HTTP endpoint can trigger `recordVerification` directly — scoring and posting is exclusively a background worker step (`verificationScorer.ts`), mirroring how PoU minting already works for the token contract.

## Deployment

Live on Sepolia at `0xA25D6ed371de357A4d4C0111AAaC1e199B575975` (see `contracts/deployed.json` for the current address, deployment block, and ABI path). Deployed independently of, and without modifying, the live ARZY-G token contract.
