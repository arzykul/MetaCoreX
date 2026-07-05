import { Router, type IRouter } from "express";
import { ethers } from "ethers";
import { sql, desc, asc, gte, and, eq } from "drizzle-orm";
import { db, agentProofsTable, agentTasksTable } from "@workspace/db";

// PoU (Proof of Usefulness) analytics routes. Mounted at /api/pou/*.
// All reads are backed by `agent_proofs`, which the background proofIndexer
// (see services/proofIndexer.ts) keeps in sync with on-chain `ProofAccepted`
// events — this is the full network history, not just marketplace tasks.

const router: IRouter = Router();

const RANGE_TO_INTERVAL: Record<string, string> = {
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  all: "100 years",
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function rangeSql(range: string): string {
  return RANGE_TO_INTERVAL[range] ?? RANGE_TO_INTERVAL["7d"]!;
}

/**
 * GET /api/pou/overview?range=24h|7d|30d|90d|all
 * Hero metrics: network PoU score, total useful work, active agents, velocity.
 */
router.get("/pou/overview", async (req, res): Promise<void> => {
  const range = firstParam(req.query.range as string | string[] | undefined) ?? "7d";
  const interval = rangeSql(range);

  const [current] = await db
    .select({
      avgScore: sql<number | null>`avg(${agentProofsTable.score})::float8`,
      totalProofs: sql<number>`count(*)::int`,
      activeAgents24h: sql<number>`count(distinct ${agentProofsTable.agentAddress}) filter (where ${agentProofsTable.blockTimestamp} >= now() - interval '24 hours')::int`,
    })
    .from(agentProofsTable)
    .where(sql`${agentProofsTable.blockTimestamp} >= now() - interval '${sql.raw(interval)}'`);

  const [allTime] = await db
    .select({ totalProofs: sql<number>`count(*)::int` })
    .from(agentProofsTable);

  // Velocity: avg score in the last 24h vs. the 24h window before that.
  const [velocityRow] = await db
    .select({
      last24h: sql<number | null>`avg(${agentProofsTable.score}) filter (where ${agentProofsTable.blockTimestamp} >= now() - interval '24 hours')::float8`,
      prior24h: sql<number | null>`avg(${agentProofsTable.score}) filter (where ${agentProofsTable.blockTimestamp} >= now() - interval '48 hours' and ${agentProofsTable.blockTimestamp} < now() - interval '24 hours')::float8`,
    })
    .from(agentProofsTable);

  const last24h = velocityRow?.last24h ?? null;
  const prior24h = velocityRow?.prior24h ?? null;
  const velocityPct =
    last24h != null && prior24h != null && prior24h !== 0
      ? ((last24h - prior24h) / prior24h) * 100
      : null;

  res.json({
    ok: true,
    range,
    networkPoU: current?.avgScore ?? 0,
    totalUsefulWork: allTime?.totalProofs ?? 0,
    activeAgents24h: current?.activeAgents24h ?? 0,
    pouVelocityPct: velocityPct,
  });
});

/**
 * GET /api/pou/trend?range=7d|30d|90d&interval=hour|day
 * Time-bucketed average PoU score plus a trailing moving average.
 */
router.get("/pou/trend", async (req, res): Promise<void> => {
  const range = firstParam(req.query.range as string | string[] | undefined) ?? "7d";
  const bucketParam = firstParam(req.query.interval as string | string[] | undefined);
  const bucket = bucketParam === "hour" ? "hour" : "day";
  const interval = rangeSql(range);

  // `bucket` is inlined via sql.raw rather than bound as a parameter: Postgres
  // treats each `$n` placeholder as a syntactically distinct expression, so a
  // parameterized date_trunc(...) in SELECT won't be recognized as matching
  // the same expression in GROUP BY even when the bound value is identical —
  // it's safe here since `bucket` is restricted to the literal "day"/"hour".
  const dateTruncExpr = sql.raw(`date_trunc('${bucket}', "agent_proofs"."block_timestamp")`);

  const rows = await db
    .select({
      bucket: sql<string>`${dateTruncExpr}`,
      avgScore: sql<number>`avg(${agentProofsTable.score})::float8`,
      proofCount: sql<number>`count(*)::int`,
    })
    .from(agentProofsTable)
    .where(sql`${agentProofsTable.blockTimestamp} >= now() - interval '${sql.raw(interval)}'`)
    .groupBy(dateTruncExpr)
    .orderBy(sql`${dateTruncExpr} asc`);

  const points = rows.map((r) => ({ t: r.bucket, avgScore: r.avgScore, proofCount: r.proofCount }));

  // 3-point trailing moving average over the bucketed series (smooths noise on sparse data).
  const windowSize = 3;
  const withMovingAvg = points.map((p, i) => {
    const start = Math.max(0, i - windowSize + 1);
    const slice = points.slice(start, i + 1);
    const movingAvg = slice.reduce((sum, s) => sum + s.avgScore, 0) / slice.length;
    return { ...p, movingAvg };
  });

  res.json({ ok: true, range, bucket, points: withMovingAvg });
});

/**
 * GET /api/pou/distribution
 * Histogram of agents by lifetime average PoU score, bucketed 0-2/2-4/4-6/6-8/8-10.
 */
router.get("/pou/distribution", async (_req, res): Promise<void> => {
  const perAgent = db.$with("per_agent").as(
    db
      .select({
        agentAddress: agentProofsTable.agentAddress,
        avgScore: sql<number>`avg(${agentProofsTable.score})::float8`.as("avg_score"),
      })
      .from(agentProofsTable)
      .groupBy(agentProofsTable.agentAddress)
  );

  const rows = await db
    .with(perAgent)
    .select({
      bucket: sql<string>`case
        when avg_score < 2 then '0-2'
        when avg_score < 4 then '2-4'
        when avg_score < 6 then '4-6'
        when avg_score < 8 then '6-8'
        else '8-10'
      end`,
      count: sql<number>`count(*)::int`,
    })
    .from(perAgent)
    .groupBy(sql`1`);

  const order = ["0-2", "2-4", "4-6", "6-8", "8-10"];
  const buckets = order.map((label) => ({
    range: label,
    agentCount: rows.find((r) => r.bucket === label)?.count ?? 0,
  }));

  res.json({ ok: true, buckets });
});

/**
 * GET /api/pou/heatmap
 * Hour-of-day x day-of-week grid of proof activity (UTC).
 */
router.get("/pou/heatmap", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      dow: sql<number>`extract(dow from ${agentProofsTable.blockTimestamp})::int`,
      hour: sql<number>`extract(hour from ${agentProofsTable.blockTimestamp})::int`,
      proofCount: sql<number>`count(*)::int`,
      avgScore: sql<number>`avg(${agentProofsTable.score})::float8`,
    })
    .from(agentProofsTable)
    .groupBy(
      sql`extract(dow from ${agentProofsTable.blockTimestamp})`,
      sql`extract(hour from ${agentProofsTable.blockTimestamp})`
    );

  res.json({ ok: true, cells: rows });
});

/**
 * GET /api/pou/feed?limit=50
 * Most recent proofs network-wide, for activity-feed backfill on page load
 * (live updates arrive over the existing WebSocket ProofAccepted event).
 */
router.get("/pou/feed", async (req, res): Promise<void> => {
  const limit = Math.min(Math.max(parseInt(firstParam(req.query.limit as string | string[] | undefined) ?? "50", 10) || 50, 1), 200);

  const rows = await db
    .select()
    .from(agentProofsTable)
    .orderBy(desc(agentProofsTable.blockTimestamp))
    .limit(limit);

  res.json({
    ok: true,
    events: rows.map((r) => ({
      id: r.id,
      agentAddress: r.agentAddress,
      proof: r.proof,
      score: r.score,
      rewardArzyg: ethers.formatEther(r.rewardWei),
      txHash: r.txHash,
      blockTimestamp: r.blockTimestamp,
    })),
  });
});

const LEADERBOARD_TABS = ["top", "active", "earners", "rising"] as const;
type LeaderboardTab = (typeof LEADERBOARD_TABS)[number];

function isValidTab(value: unknown): value is LeaderboardTab {
  return typeof value === "string" && (LEADERBOARD_TABS as readonly string[]).includes(value);
}

/**
 * GET /api/pou/leaderboard?tab=top|active|earners|rising&page=1&limit=25
 */
router.get("/pou/leaderboard", async (req, res): Promise<void> => {
  const tabRaw = firstParam(req.query.tab as string | string[] | undefined) ?? "top";
  if (!isValidTab(tabRaw)) {
    res.status(400).json({ ok: false, error: `tab must be one of: ${LEADERBOARD_TABS.join(", ")}` });
    return;
  }
  const page = Math.max(parseInt(firstParam(req.query.page as string | string[] | undefined) ?? "1", 10) || 1, 1);
  const limit = 25;
  const offset = (page - 1) * limit;

  const perAgent = db.$with("per_agent").as(
    db
      .select({
        agentAddress: agentProofsTable.agentAddress,
        avgScore: sql<number>`avg(${agentProofsTable.score})::float8`.as("avg_score"),
        totalProofs: sql<number>`count(*)::int`.as("total_proofs"),
        totalEarnedWei: sql<string>`sum(${agentProofsTable.rewardWei})::text`.as("total_earned_wei"),
        recentAvg: sql<number>`avg(${agentProofsTable.score}) filter (where ${agentProofsTable.blockTimestamp} >= now() - interval '7 days')::float8`.as(
          "recent_avg"
        ),
        priorAvg: sql<number>`avg(${agentProofsTable.score}) filter (where ${agentProofsTable.blockTimestamp} >= now() - interval '14 days' and ${agentProofsTable.blockTimestamp} < now() - interval '7 days')::float8`.as(
          "prior_avg"
        ),
      })
      .from(agentProofsTable)
      .groupBy(agentProofsTable.agentAddress)
  );

  const orderColumn =
    tabRaw === "top"
      ? sql`avg_score desc nulls last`
      : tabRaw === "active"
        ? sql`total_proofs desc`
        : tabRaw === "earners"
          ? sql`total_earned_wei::numeric desc`
          : sql`coalesce(recent_avg, 0) - coalesce(prior_avg, 0) desc nulls last`;

  const [rows, [countRow]] = await Promise.all([
    db
      .with(perAgent)
      .select()
      .from(perAgent)
      .orderBy(orderColumn)
      .limit(limit)
      .offset(offset),
    db.with(perAgent).select({ count: sql<number>`count(*)::int` }).from(perAgent),
  ]);

  const entries = rows.map((r, i) => ({
    rank: offset + i + 1,
    agentAddress: r.agentAddress,
    avgScore: r.avgScore,
    totalProofs: r.totalProofs,
    totalEarnedArzyg: ethers.formatEther(r.totalEarnedWei ?? "0"),
    risingDelta:
      r.recentAvg != null && r.priorAvg != null ? r.recentAvg - r.priorAvg : null,
  }));

  res.json({ ok: true, tab: tabRaw, page, limit, total: countRow?.count ?? 0, entries });
});

/**
 * GET /api/pou/rank/:address
 * A single agent's rank on the "top" (avg PoU) leaderboard, for the
 * "Your rank: #N" banner.
 */
router.get("/pou/rank/:address", async (req, res): Promise<void> => {
  const address = firstParam(req.params.address);
  if (!address || !ethers.isAddress(address)) {
    res.status(400).json({ ok: false, error: "address must be a valid Ethereum address" });
    return;
  }

  const perAgent = db.$with("per_agent").as(
    db
      .select({
        agentAddress: agentProofsTable.agentAddress,
        avgScore: sql<number>`avg(${agentProofsTable.score})::float8`.as("avg_score"),
      })
      .from(agentProofsTable)
      .groupBy(agentProofsTable.agentAddress)
  );

  const ranked = await db
    .with(perAgent)
    .select({
      agentAddress: perAgent.agentAddress,
      rank: sql<number>`row_number() over (order by avg_score desc nulls last)::int`,
    })
    .from(perAgent);

  const entry = ranked.find((r) => r.agentAddress.toLowerCase() === address.toLowerCase());

  res.json({
    ok: true,
    address,
    rank: entry?.rank ?? null,
    totalRanked: ranked.length,
  });
});

/**
 * GET /api/pou/agents/:address
 * Full PoU profile: performance stats, streak, radar dimensions, task
 * category distribution, and derived achievements.
 */
router.get("/pou/agents/:address", async (req, res): Promise<void> => {
  const address = firstParam(req.params.address);
  if (!address || !ethers.isAddress(address)) {
    res.status(400).json({ ok: false, error: "address must be a valid Ethereum address" });
    return;
  }
  const lower = address.toLowerCase();

  const proofs = await db
    .select()
    .from(agentProofsTable)
    .where(eq(agentProofsTable.agentAddress, lower))
    .orderBy(asc(agentProofsTable.blockTimestamp));

  if (proofs.length === 0) {
    res.json({
      ok: true,
      address,
      avgScore: null,
      totalProofs: 0,
      totalEarnedArzyg: "0",
      currentStreakDays: 0,
      bestPerformance: null,
      radar: null,
      taskDistribution: [],
      achievements: [],
    });
    return;
  }

  const totalProofs = proofs.length;
  const avgScore = proofs.reduce((sum, p) => sum + p.score, 0) / totalProofs;
  const totalEarnedWei = proofs.reduce((sum, p) => sum + BigInt(p.rewardWei), 0n);
  const best = proofs.reduce((max, p) => (p.score > max.score ? p : max), proofs[0]!);

  // Streak: consecutive UTC calendar days (walking back from today) with >=1 proof.
  const activeDays = new Set(proofs.map((p) => p.blockTimestamp.toISOString().slice(0, 10)));
  let currentStreakDays = 0;
  const cursor = new Date();
  for (;;) {
    const key = cursor.toISOString().slice(0, 10);
    if (!activeDays.has(key)) break;
    currentStreakDays += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  // Category = matching agent_tasks title by txHash, else "General".
  const txHashes = proofs.map((p) => p.txHash);
  const matchingTasks =
    txHashes.length > 0
      ? await db
          .select({ txHash: agentTasksTable.txHash, title: agentTasksTable.title })
          .from(agentTasksTable)
          .where(sql`${agentTasksTable.txHash} in (${sql.join(txHashes, sql`, `)})`)
      : [];
  const taskTitleByTx = new Map(matchingTasks.filter((t) => t.txHash).map((t) => [t.txHash as string, t.title]));
  const categoryCounts = new Map<string, number>();
  for (const p of proofs) {
    const category = taskTitleByTx.get(p.txHash) ?? "General";
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
  }
  const taskDistribution = [...categoryCounts.entries()].map(([category, count]) => ({ category, count }));

  // Radar dimensions (0-10 scale, simple explicit proxies — documented in replit.md):
  const daysSinceFirst = Math.max(
    1,
    (Date.now() - proofs[0]!.blockTimestamp.getTime()) / (1000 * 60 * 60 * 24)
  );
  const speed = Math.min(10, (totalProofs / daysSinceFirst) * 10);
  const quality = avgScore;
  const mean = avgScore;
  const variance = proofs.reduce((sum, p) => sum + (p.score - mean) ** 2, 0) / totalProofs;
  const stddev = Math.sqrt(variance);
  const consistency = Math.max(0, 10 - stddev * 2);
  const avgAmount = proofs.reduce((sum, p) => sum + Number(ethers.formatEther(p.amountWei)), 0) / totalProofs;
  const complexity = Math.min(10, Math.log10(avgAmount + 1) * 3);
  const totalEarnedArzyg = Number(ethers.formatEther(totalEarnedWei));
  const impact = Math.min(10, Math.log10(totalEarnedArzyg + 1) * 2.5);

  const radar = {
    speed: Number(speed.toFixed(2)),
    quality: Number(quality.toFixed(2)),
    consistency: Number(consistency.toFixed(2)),
    complexity: Number(complexity.toFixed(2)),
    impact: Number(impact.toFixed(2)),
  };

  // Achievements — derived live from history, never stored.
  const achievements: Array<{ id: string; label: string }> = [];
  if (totalProofs >= 1) achievements.push({ id: "first_proof", label: "First Proof" });
  if (totalProofs >= 10) achievements.push({ id: "ten_proofs_club", label: "10 Proofs Club" });
  if (currentStreakDays >= 7) achievements.push({ id: "seven_day_streak", label: "7-Day Streak" });
  if (avgScore > 9.0) achievements.push({ id: "diamond_agent", label: "Diamond Agent" });
  if (categoryCounts.size > 0 && [...categoryCounts.values()].some((c) => c >= 10)) {
    achievements.push({ id: "specialist", label: "Specialist" });
  }

  const perAgentTop10 = db.$with("per_agent").as(
    db
      .select({
        agentAddress: agentProofsTable.agentAddress,
        avgScore: sql<number>`avg(${agentProofsTable.score})::float8`.as("avg_score"),
      })
      .from(agentProofsTable)
      .groupBy(agentProofsTable.agentAddress)
  );
  const ranked = await db
    .with(perAgentTop10)
    .select({
      agentAddress: perAgentTop10.agentAddress,
      rank: sql<number>`row_number() over (order by avg_score desc nulls last)::int`,
    })
    .from(perAgentTop10);
  const myRank = ranked.find((r) => r.agentAddress.toLowerCase() === lower)?.rank ?? null;
  if (myRank != null && myRank <= 10) achievements.push({ id: "top_10", label: "Top 10" });

  res.json({
    ok: true,
    address,
    avgScore: Number(avgScore.toFixed(3)),
    totalProofs,
    totalEarnedArzyg: totalEarnedArzyg.toString(),
    currentStreakDays,
    bestPerformance: { score: best.score, blockTimestamp: best.blockTimestamp, proof: best.proof },
    radar,
    taskDistribution,
    achievements,
    rank: myRank,
  });
});

/**
 * GET /api/pou/agents/:address/proofs?limit=&offset=
 * Paginated raw proof history for the agent's "Recent Activity" table.
 */
router.get("/pou/agents/:address/proofs", async (req, res): Promise<void> => {
  const address = firstParam(req.params.address);
  if (!address || !ethers.isAddress(address)) {
    res.status(400).json({ ok: false, error: "address must be a valid Ethereum address" });
    return;
  }
  const limit = Math.min(Math.max(parseInt(firstParam(req.query.limit as string | string[] | undefined) ?? "20", 10) || 20, 1), 100);
  const offset = Math.max(parseInt(firstParam(req.query.offset as string | string[] | undefined) ?? "0", 10) || 0, 0);

  const [rows, [countRow]] = await Promise.all([
    db
      .select()
      .from(agentProofsTable)
      .where(eq(agentProofsTable.agentAddress, address.toLowerCase()))
      .orderBy(desc(agentProofsTable.blockTimestamp))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(agentProofsTable)
      .where(eq(agentProofsTable.agentAddress, address.toLowerCase())),
  ]);

  res.json({
    ok: true,
    total: countRow?.count ?? 0,
    limit,
    offset,
    proofs: rows.map((r) => ({
      id: r.id,
      proof: r.proof,
      score: r.score,
      rewardArzyg: ethers.formatEther(r.rewardWei),
      txHash: r.txHash,
      blockTimestamp: r.blockTimestamp,
    })),
  });
});

export default router;
