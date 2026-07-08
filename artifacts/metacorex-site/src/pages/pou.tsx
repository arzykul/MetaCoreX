import { useMemo, useState } from "react";
import { formatEther } from "viem";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatCard } from "@/components/pou/stat-card";
import { LiveIndicator } from "@/components/pou/live-indicator";
import {
  usePouOverview,
  usePouTrend,
  usePouDistribution,
  usePouHeatmap,
  usePouFeed,
  usePouLiveInvalidation,
} from "@/hooks/use-api";
import { useMcxEvents } from "@/lib/ws";
import type { PouBucket, PouHeatmapCell, PouRange } from "@/lib/api";
import { formatAddress } from "@/lib/format";
import { CHART_AXIS_PROPS, CHART_COLORS, CHART_TOOLTIP_STYLE } from "@/lib/chart-theme";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format } from "date-fns";
import { Activity, Coins, Gauge, Radio, TrendingDown, TrendingUp, Users, Zap } from "lucide-react";

const RANGE_OPTIONS: { value: PouRange; label: string }[] = [
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "all", label: "All time" },
];

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function VelocityBadge({ pct }: { pct: number | null }) {
  if (pct == null) {
    return (
      <span className="text-muted-foreground" data-testid="text-velocity">
        Not enough data yet
      </span>
    );
  }
  const positive = pct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 font-medium ${positive ? "text-emerald-600" : "text-red-600"}`}
      data-testid="text-velocity"
    >
      {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {Math.abs(pct).toFixed(1)}% vs. prior 24h
    </span>
  );
}

function TrendChart({ range, bucket, onBucketChange }: { range: PouRange; bucket: PouBucket; onBucketChange: (b: PouBucket) => void }) {
  const { data, isLoading } = usePouTrend(range, bucket);

  const points = useMemo(
    () =>
      (data?.points ?? []).map((p) => ({
        ...p,
        label:
          bucket === "hour" ? format(new Date(p.t), "MMM d, HH:mm") : format(new Date(p.t), "MMM d"),
      })),
    [data, bucket],
  );

  return (
    <Card data-testid="card-trend">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Network PoU Trend</CardTitle>
          <CardDescription>Average proof score over time, with a 3-point moving average.</CardDescription>
        </div>
        <Tabs value={bucket} onValueChange={(v) => onBucketChange(v as PouBucket)}>
          <TabsList className="h-8">
            <TabsTrigger value="hour" className="text-xs px-2.5 py-1" data-testid="tab-bucket-hour">
              Hourly
            </TabsTrigger>
            <TabsTrigger value="day" className="text-xs px-2.5 py-1" data-testid="tab-bucket-day">
              Daily
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="pt-2">
        {isLoading ? (
          <Skeleton className="h-[320px] w-full" />
        ) : points.length === 0 ? (
          <div className="h-[320px] flex items-center justify-center text-sm text-muted-foreground" data-testid="text-trend-empty">
            No proofs recorded in this range yet.
          </div>
        ) : (
          <div className="h-[320px] w-full" data-testid="chart-trend">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={points}>
                <defs>
                  <linearGradient id="pouScoreGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                <XAxis dataKey="label" {...CHART_AXIS_PROPS} minTickGap={24} />
                <YAxis {...CHART_AXIS_PROPS} domain={[0, 10]} />
                <Tooltip
                  {...CHART_TOOLTIP_STYLE}
                  formatter={(value: number, name: string) => [
                    value.toFixed(2),
                    name === "avgScore" ? "Avg score" : "Moving avg",
                  ]}
                />
                <Area type="monotone" dataKey="avgScore" stroke={CHART_COLORS.primary} strokeWidth={2} fill="url(#pouScoreGradient)" />
                <Line type="monotone" dataKey="movingAvg" stroke={CHART_COLORS.axis} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DistributionChart() {
  const { data, isLoading } = usePouDistribution();
  const buckets = data?.buckets ?? [];
  const hasData = buckets.some((b) => b.agentCount > 0);

  return (
    <Card data-testid="card-distribution">
      <CardHeader>
        <CardTitle>Score Distribution</CardTitle>
        <CardDescription>Agents grouped by lifetime average PoU score.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[260px] w-full" />
        ) : !hasData ? (
          <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground" data-testid="text-distribution-empty">
            No scored agents yet.
          </div>
        ) : (
          <div className="h-[260px] w-full" data-testid="chart-distribution">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={buckets}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                <XAxis dataKey="range" {...CHART_AXIS_PROPS} />
                <YAxis {...CHART_AXIS_PROPS} allowDecimals={false} />
                <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(value: number) => [value, "Agents"]} />
                <Bar dataKey="agentCount" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityHeatmap() {
  const { data, isLoading } = usePouHeatmap();

  const grid = useMemo(() => {
    const byKey = new Map<string, PouHeatmapCell>();
    for (const cell of data?.cells ?? []) byKey.set(`${cell.dow}-${cell.hour}`, cell);
    const maxCount = Math.max(1, ...(data?.cells ?? []).map((c) => c.proofCount));
    return { byKey, maxCount };
  }, [data]);

  const hasData = (data?.cells ?? []).length > 0;

  return (
    <Card data-testid="card-heatmap">
      <CardHeader>
        <CardTitle>Activity Heatmap</CardTitle>
        <CardDescription>Proof volume by hour of day and day of week (UTC).</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[220px] w-full" />
        ) : !hasData ? (
          <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground" data-testid="text-heatmap-empty">
            No activity recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto" data-testid="grid-heatmap">
            <div className="min-w-[640px]">
              <div className="grid gap-1" style={{ gridTemplateColumns: "40px repeat(24, 1fr)" }}>
                <div />
                {Array.from({ length: 24 }, (_, hour) => (
                  <div key={hour} className="text-[10px] text-muted-foreground text-center">
                    {hour % 3 === 0 ? hour : ""}
                  </div>
                ))}
                {DOW_LABELS.map((label, dow) => (
                  <div key={dow} className="contents">
                    <div className="text-xs text-muted-foreground flex items-center">{label}</div>
                    {Array.from({ length: 24 }, (_, hour) => {
                      const cell = grid.byKey.get(`${dow}-${hour}`);
                      const intensity = cell ? Math.min(1, 0.12 + (cell.proofCount / grid.maxCount) * 0.88) : 0.06;
                      return (
                        <div
                          key={hour}
                          className="aspect-square rounded-sm"
                          style={{ backgroundColor: `rgba(${CHART_COLORS.primaryRgb}, ${intensity})` }}
                          title={
                            cell
                              ? `${label} ${hour}:00 UTC — ${cell.proofCount} proofs, avg score ${cell.avgScore.toFixed(1)}`
                              : `${label} ${hour}:00 UTC — no activity`
                          }
                          data-testid={`cell-heatmap-${dow}-${hour}`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface FeedRow {
  key: string;
  agentAddress: string;
  proof: string;
  score: number;
  rewardArzyg: string;
  isLive: boolean;
}

function safeFormatEther(raw: unknown): string {
  try {
    return formatEther(BigInt(String(raw ?? "0")));
  } catch {
    return "0";
  }
}

function ActivityFeed() {
  const { data, isLoading } = usePouFeed(20);
  const { events: liveEvents, connected } = useMcxEvents(20);

  const rows = useMemo<FeedRow[]>(() => {
    const liveRows: FeedRow[] = liveEvents
      .filter((e) => e.type === "ProofAccepted")
      .map((e) => ({
        key: `live-${e.timestamp}-${String(e.data.agent)}-${String(e.data.proof)}`,
        agentAddress: String(e.data.agent ?? ""),
        proof: String(e.data.proof ?? ""),
        score: Number(e.data.score ?? 0),
        rewardArzyg: safeFormatEther(e.data.reward),
        isLive: true,
      }));

    const seen = new Set(liveRows.map((r) => `${r.agentAddress.toLowerCase()}:${r.proof}`));
    const restRows: FeedRow[] = (data?.events ?? [])
      .filter((e) => !seen.has(`${e.agentAddress.toLowerCase()}:${e.proof}`))
      .map((e) => ({
        key: `rest-${e.id}`,
        agentAddress: e.agentAddress,
        proof: e.proof,
        score: e.score,
        rewardArzyg: e.rewardArzyg,
        isLive: false,
      }));

    return [...liveRows, ...restRows].slice(0, 20);
  }, [liveEvents, data]);

  return (
    <Card data-testid="card-feed">
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest accepted proofs across the network.</CardDescription>
        </div>
        <LiveIndicator connected={connected} />
      </CardHeader>
      <CardContent className="space-y-1">
        {isLoading && rows.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground" data-testid="text-feed-empty">
            No proofs yet — the network is warming up.
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {rows.map((row) => (
              <li
                key={row.key}
                className="py-3 flex items-center justify-between gap-3"
                data-testid={`row-feed-${row.key}`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
                    {formatAddress(row.agentAddress)}
                    {row.isLive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" data-testid="dot-live-row" />
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{row.proof}</div>
                </div>
                <div className="text-right shrink-0">
                  <Badge variant="outline" className="text-xs">
                    Score {row.score}
                  </Badge>
                  <div className="text-xs text-muted-foreground mt-1">+{row.rewardArzyg} ARZY-G</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function Pou() {
  const [range, setRange] = useState<PouRange>("7d");
  const [bucket, setBucket] = useState<PouBucket>("day");
  const { data: overview, isLoading: overviewLoading } = usePouOverview(range);
  usePouLiveInvalidation();

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 pt-24 pb-16 container mx-auto px-4 max-w-7xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-extrabold text-foreground" data-testid="text-page-title">
              PoU Analytics
            </h1>
            <p className="text-muted-foreground mt-1">
              Real-time proof-of-usefulness activity across the ARZY-G agent network.
            </p>
          </div>
          <Select value={range} onValueChange={(v) => setRange(v as PouRange)}>
            <SelectTrigger className="w-[160px]" data-testid="select-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} data-testid={`option-range-${opt.value}`}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            icon={Gauge}
            label="Network PoU Score"
            value={overviewLoading ? "–" : (overview?.networkPoU ?? 0).toFixed(2)}
            sub={<span className="text-muted-foreground">Avg. score, selected range</span>}
            testId="stat-network-pou"
          />
          <StatCard
            icon={Activity}
            label="Total Useful Work"
            value={overviewLoading ? "–" : (overview?.totalUsefulWork ?? 0).toLocaleString()}
            sub={<span className="text-muted-foreground">Proofs accepted, all time</span>}
            testId="stat-total-work"
          />
          <StatCard
            icon={Users}
            label="Active Agents (24h)"
            value={overviewLoading ? "–" : (overview?.activeAgents24h ?? 0).toLocaleString()}
            sub={<span className="text-muted-foreground">Distinct agents submitting</span>}
            testId="stat-active-agents"
          />
          <StatCard
            icon={Zap}
            label="PoU Velocity"
            value={overviewLoading ? "–" : <VelocityBadge pct={overview?.pouVelocityPct ?? null} />}
            testId="stat-velocity"
          />
        </div>

        {!overviewLoading && (overview?.totalUsefulWork ?? 0) === 0 && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-dashed border-amber-400/40 bg-amber-400/5 px-4 py-3 text-sm text-muted-foreground">
            <Radio className="w-4 h-4 shrink-0 text-amber-400 animate-pulse" />
            No data yet — network is warming up. Stats will appear as agents submit proofs on-chain.
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
          <div className="xl:col-span-2">
            <TrendChart range={range} bucket={bucket} onBucketChange={setBucket} />
          </div>
          <ActivityFeed />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DistributionChart />
          <ActivityHeatmap />
        </div>

        <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
          <Coins className="w-3.5 h-3.5" />
          Data indexed live from on-chain ProofAccepted events on Sepolia.
        </div>
      </main>

      <Footer />
    </div>
  );
}
