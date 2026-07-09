import { Router, type IRouter } from "express";
import { ethers } from "ethers";
import { eq } from "drizzle-orm";
import { db, airdropReferralsTable } from "@workspace/db";
import { getPointsForAddress, getLeaderboard, tierInfo } from "../services/airdropPointsService.js";

// Sepolia-testnet points/airdrop routes. Mounted at /api/airdrop/*.
//
// Points are never stored — see airdropPointsService.ts for the derivation.
// The only write path here is referral linkage (airdrop_referrals), which is
// deliberately minimal: create-or-fetch a wallet's own shareable code, and
// write-once attribution of who referred it. No route can inflate points
// directly; the +200 referral bonus only materializes once the referred
// wallet's own AgentRegistered event is indexed on-chain.

const router: IRouter = Router();

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function generateReferralCode(): string {
  // 8 uppercase hex chars — short enough to share in a URL, collisions are
  // handled by retrying against the unique constraint below.
  return ethers.hexlify(ethers.randomBytes(4)).slice(2).toUpperCase();
}

/**
 * Ensures a wallet has an airdrop_referrals row (creating one with a fresh
 * referral code if this is its first touch), then returns the current row.
 */
async function ensureReferralRow(lowerAddress: string): Promise<typeof airdropReferralsTable.$inferSelect> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const [existing] = await db
      .select()
      .from(airdropReferralsTable)
      .where(eq(airdropReferralsTable.walletAddress, lowerAddress));
    if (existing) return existing;

    try {
      const [created] = await db
        .insert(airdropReferralsTable)
        .values({ walletAddress: lowerAddress, referralCode: generateReferralCode() })
        .onConflictDoNothing({ target: airdropReferralsTable.walletAddress })
        .returning();
      if (created) return created;
      // Someone else inserted the wallet row concurrently — loop and re-select.
    } catch (err) {
      // Referral code collision (rare, 8 hex chars) — retry with a new code.
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("airdrop_referrals_referral_code")) throw err;
    }
  }
  throw new Error(`Failed to create referral row for ${lowerAddress} after 5 attempts`);
}

/**
 * GET /api/airdrop/points/:address
 * Derived points snapshot for a single wallet, plus tier progress.
 */
router.get("/airdrop/points/:address", async (req, res): Promise<void> => {
  const { address } = req.params;
  if (!address || !ethers.isAddress(address)) {
    res.status(400).json({ ok: false, error: "address must be a valid Ethereum address" });
    return;
  }

  const points = await getPointsForAddress(address);
  res.json({ ok: true, ...points, ...tierInfo(points.totalPoints) });
});

/**
 * GET /api/airdrop/leaderboard
 * Top 10 wallets by derived total points.
 */
router.get("/airdrop/leaderboard", async (_req, res): Promise<void> => {
  const entries = await getLeaderboard(10);
  res.json({
    ok: true,
    entries: entries.map((e, i) => ({ rank: i + 1, ...e })),
  });
});

/**
 * POST /api/airdrop/referral
 * Body: { walletAddress, refCode? }
 *
 * Idempotently ensures `walletAddress` has its own shareable referral code,
 * and — if `refCode` is provided and this wallet hasn't already been
 * attributed to a referrer — links it. Guards: valid code, no self-referral,
 * write-once (never overwrites an existing referredBy).
 */
router.post("/airdrop/referral", async (req, res): Promise<void> => {
  const { walletAddress, refCode } = req.body as { walletAddress?: string; refCode?: string };

  if (!isNonEmptyString(walletAddress) || !ethers.isAddress(walletAddress)) {
    res.status(400).json({ ok: false, error: "walletAddress must be a valid Ethereum address" });
    return;
  }
  const lower = walletAddress.toLowerCase();

  let row = await ensureReferralRow(lower);

  if (isNonEmptyString(refCode) && row.referredBy == null) {
    const code = refCode.trim().toUpperCase();
    const [referrer] = await db
      .select()
      .from(airdropReferralsTable)
      .where(eq(airdropReferralsTable.referralCode, code));

    if (!referrer) {
      res.status(400).json({ ok: false, error: "Invalid referral code" });
      return;
    }
    if (referrer.walletAddress === lower) {
      res.status(400).json({ ok: false, error: "Cannot refer yourself" });
      return;
    }

    // Write-once: only takes effect if referredBy is still NULL — a second
    // concurrent request (or replay) can't overwrite an established referral.
    const updated = await db
      .update(airdropReferralsTable)
      .set({ referredBy: referrer.walletAddress })
      .where(eq(airdropReferralsTable.walletAddress, lower))
      .returning();
    row = updated[0] ?? row;
  }

  res.json({
    ok: true,
    walletAddress: row.walletAddress,
    referralCode: row.referralCode,
    referredBy: row.referredBy,
    referralLink: `/airdrop?ref=${row.referralCode}`,
  });
});

/**
 * POST /api/airdrop/claim
 * Body: { walletAddress }
 *
 * Stub — the airdrop is Sepolia-testnet points only. Real ARZY-G
 * distribution happens after mainnet launch; this never mints or transfers
 * anything today.
 */
router.post("/airdrop/claim", async (req, res): Promise<void> => {
  const { walletAddress } = req.body as { walletAddress?: string };
  if (!isNonEmptyString(walletAddress) || !ethers.isAddress(walletAddress)) {
    res.status(400).json({ ok: false, error: "walletAddress must be a valid Ethereum address" });
    return;
  }

  res.json({
    ok: true,
    claimed: false,
    message: "Token distribution begins after ARZY-G mainnet launch — your points are saved, check back then.",
  });
});

export default router;
