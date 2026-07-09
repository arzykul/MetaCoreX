import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

// Airdrop points are intentionally DERIVED at query time, never stored as a
// mutable counter. The only durable state is on-chain-indexed history
// (agent_registrations, agent_proofs — both populated by background
// indexers, immune to double-counting via unique tx/log indexes) plus
// referral attribution (airdrop_referrals). This means there's no
// "updatePoints" call anywhere and no backfill script needed — a wallet's
// score is always consistent with its full on-chain history.
//
// Scoring (Sepolia testnet only, cosmetic — no real token distribution yet):
//   +100  agent registered (on-chain AgentRegistered event exists)
//   +50   per submitted proof (on-chain ProofAccepted event, from agent_proofs)
//   +200  per referred wallet that has itself registered an agent

export const AIRDROP_TIERS = [500, 1000, 5000] as const;

export interface AddressPoints {
  address: string;
  agentRegistered: boolean;
  proofsCount: number;
  referralCount: number;
  totalPoints: number;
}

export interface TierInfo {
  tiers: readonly number[];
  currentTierIndex: number;
  nextTier: number | null;
  pointsToNextTier: number;
}

export function tierInfo(totalPoints: number): TierInfo {
  const nextTier = AIRDROP_TIERS.find((t) => totalPoints < t) ?? null;
  const currentTierIndex = AIRDROP_TIERS.filter((t) => totalPoints >= t).length;
  return {
    tiers: AIRDROP_TIERS,
    currentTierIndex,
    nextTier,
    pointsToNextTier: nextTier != null ? nextTier - totalPoints : 0,
  };
}

// A single CTE pipeline shared by both queries below. `all_wallets` is the
// union of every wallet with ANY qualifying activity, so wallets that only
// earned a referral bonus (no registration/proof of their own) still appear.
const SCORED_CTE = sql`
  WITH registrations AS (
    SELECT DISTINCT agent_address AS wallet FROM agent_registrations
  ),
  proof_counts AS (
    SELECT agent_address AS wallet, COUNT(*)::int AS proofs_count
    FROM agent_proofs
    GROUP BY agent_address
  ),
  referral_credit AS (
    SELECT ar.referred_by AS wallet, COUNT(DISTINCT ar.wallet_address)::int AS referred_registered_count
    FROM airdrop_referrals ar
    JOIN registrations reg ON reg.wallet = ar.wallet_address
    WHERE ar.referred_by IS NOT NULL
    GROUP BY ar.referred_by
  ),
  all_wallets AS (
    SELECT wallet FROM registrations
    UNION SELECT wallet FROM proof_counts
    UNION SELECT wallet FROM referral_credit
  ),
  scored AS (
    SELECT
      w.wallet AS wallet,
      (reg.wallet IS NOT NULL) AS agent_registered,
      COALESCE(pc.proofs_count, 0) AS proofs_count,
      COALESCE(rc.referred_registered_count, 0) AS referral_count,
      (
        (CASE WHEN reg.wallet IS NOT NULL THEN 100 ELSE 0 END)
        + COALESCE(pc.proofs_count, 0) * 50
        + COALESCE(rc.referred_registered_count, 0) * 200
      )::int AS total_points
    FROM all_wallets w
    LEFT JOIN registrations reg ON reg.wallet = w.wallet
    LEFT JOIN proof_counts pc ON pc.wallet = w.wallet
    LEFT JOIN referral_credit rc ON rc.wallet = w.wallet
  )
`;

interface ScoredRow extends Record<string, unknown> {
  wallet: string;
  agent_registered: boolean;
  proofs_count: number;
  referral_count: number;
  total_points: number;
}

function toAddressPoints(row: ScoredRow): AddressPoints {
  return {
    address: row.wallet,
    agentRegistered: row.agent_registered,
    proofsCount: row.proofs_count,
    referralCount: row.referral_count,
    totalPoints: row.total_points,
  };
}

export async function getPointsForAddress(address: string): Promise<AddressPoints> {
  const lower = address.toLowerCase();
  const result = await db.execute<ScoredRow>(sql`${SCORED_CTE} SELECT * FROM scored WHERE wallet = ${lower}`);
  const row = result.rows[0];
  if (!row) {
    return { address: lower, agentRegistered: false, proofsCount: 0, referralCount: 0, totalPoints: 0 };
  }
  return toAddressPoints(row);
}

export async function getLeaderboard(limit = 10): Promise<AddressPoints[]> {
  const result = await db.execute<ScoredRow>(
    sql`${SCORED_CTE} SELECT * FROM scored ORDER BY total_points DESC, wallet ASC LIMIT ${limit}`
  );
  return result.rows.map(toAddressPoints);
}
