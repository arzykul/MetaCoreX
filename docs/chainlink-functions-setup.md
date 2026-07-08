# Enabling the Premium (Chainlink Functions) Verification Tier

`ReportVerification.sol` already contains a fully working premium tier — it just needs a real, funded Chainlink Functions subscription wired up. This guide walks through creating that subscription and flipping the tier on. Nothing here touches the ARZY-G token contract.

Today the live contract has `premiumEnabled = false` and `subscriptionId: "0"` (see `contracts/deployed.json`) — that's why `/for-agents` shows the premium tier as "Coming Soon".

## 1. Create a Chainlink Functions subscription (Sepolia)

1. Go to https://functions.chain.link/sepolia and connect a wallet (MetaMask or similar) on the Sepolia network. This can be any wallet you control — it does not need to be MetaCoreX's admin wallet, since anyone can fund a subscription and add a consumer to it.
2. Click **Create Subscription**, confirm the transaction, and note the numeric **Subscription ID** it gives you.

## 2. Fund the subscription with testnet LINK

1. Get free Sepolia LINK from https://faucets.chain.link/sepolia (paste the wallet address you used above).
2. On the subscription page, click **Add Funds** and deposit LINK into the subscription. A few LINK is plenty for testing — each request only consumes a small amount.

## 3. Add ReportVerification as an approved consumer

Chainlink Functions only allows requests from contracts explicitly approved on the subscription.

1. On the subscription page, click **Add Consumer**.
2. Paste the live `ReportVerification` contract address from `contracts/deployed.json` (`contracts.ReportVerification.address`) — currently `0xA25D6ed371de357A4d4C0111AAaC1e199B575975`.
3. Confirm the transaction.

## 4. Set the subscription ID as a secret

Add the subscription ID from step 1 as the `CHAINLINK_SUBSCRIPTION_ID` Replit secret (ask the agent to set it, or add it yourself via the Secrets pane). This is only needed for the one-time activation script below — the deployed contract itself stores its own copy of the subscription ID once set.

## 5. Run the activation script

This calls the two admin-only setters already implemented in the contract (`setFunctionsConfig`, then `setPremiumEnabled(true)`) using the same `AGENT_PRIVATE_KEY` wallet that deployed `ReportVerification` and already holds `DEFAULT_ADMIN_ROLE` on it. It never redeploys or modifies the token contract.

```bash
pnpm --filter @workspace/contracts run enable-premium:sepolia
```

The script will:
- Refuse to run if `CHAINLINK_SUBSCRIPTION_ID` is missing/zero, or if the signer isn't the contract's admin
- Send `setFunctionsConfig(router, donId, subscriptionId)` then `setPremiumEnabled(true)`
- Re-read `premiumEnabled`/`subscriptionId` on-chain afterward to confirm the transactions actually took effect
- Update `contracts/deployed.json`'s `ReportVerification` entry with the new config

## 6. Update the frontend and docs

Once the script confirms premium is live on-chain, ask the agent to:
- Change the "Coming Soon" badge on the premium tier card in `artifacts/metacorex-site/src/pages/for-agents.tsx` to reflect availability
- Update the premium row's status in `docs/economics.md` from "Shipped but admin-disabled" to "Live"

Do this only after the on-chain activation is confirmed — the site should never claim premium is available before it actually is.

## Notes

- The premium tier fee (5 ARZY-G) and dispute/cashback mechanics are unchanged — only the oracle path changes from the Gemini-scored standard tier to a real Chainlink Functions callback.
- If the subscription ever runs out of LINK, `triggerPremiumOracle` calls will start failing on-chain (the router rejects requests from underfunded subscriptions). Keep it topped up, or call `setPremiumEnabled(false)` to gracefully disable the tier again until it's refunded.
- Testnet LINK has no real value, but treat the subscription's owner wallet like any other credential — whoever controls it can add/remove consumers and withdraw unused funds.
