import { useState } from "react";
import { Link, useParams } from "wouter";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/pou/stat-card";
import { LiveIndicator } from "@/components/pou/live-indicator";
import { usePouAgentProfile, usePouAgentProofs, usePouLiveInvalidation } from "@/hooks/use-api";
import { formatAddress } from "@/lib/format";
import { CHART_AXIS_PROPS, CHART_COLORS, CHART_TOOLTIP_STYLE } from "@/lib/chart-theme";
import {
  Bar,
  BarChart,
  CartesianGrid,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format } from "date-fns";
import {
  ArrowLeft,
  Award,
  ChevronLeft,
  ChevronRight,
  Coins,
  Copy,
  Crown,
  Flame,
  Gauge,
  Trophy,
  Zap,
} from "lucide-react";
import NotFound from "@/pages/not-found";

const RADAR_DIMENSIONS: { key: "speed" | "quality" | "consistency" | "complexity" | "impact"; label: string }[] = [
  { key: "speed", label: "Speed" },
  { key: "quality", label: "Quality" },
  { key: "consistency", label: "Consistency" },
  { key: "complexity", label: "Complexity" },
  { key: "impact", label: "Impact" },
];

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function isValidAddress(value: string | undefined): value is string {
  return !!value && ADDRESS_RE.test(value);
}

function CopyAddressButton({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(address);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
      data-testid="btn-copy-address"
    >
      <Copy className="w-3 h-3" />
      {copied ? "Copied!" : "Copy address"}
    </button>
  );
}

function AchievementBadges({ achievements }: { achievements: { id: string; label: string }[] }) {
  if (achievements.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="text-achievements-empty">
        No achievements unlocked yet.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-2" data-testid="list-achievements">
      {achievements.map((a) => (
        <Badge
          key={a.id}
          variant="secondary"
          className="inline-flex items-center gap-1.5 py-1.5 px-3"
          data-testid={`badge-achievement-${a.id}`}
        >
          <Award className="w-3.5 h-3.5 text-primary" />
          {a.label}
        </Badge>
      ))}
    </div>
  );
}

function ProofHistory({ address }: { address: string }) {
  const [offset, setOffset] = useState(0);
  const limit = 10;
  const { data, isLoading, isError } = usePouAgentProofs(address, limit, offset);
  const proofs = data?.proofs ?? [];
  const total = data?.total ?? 0;
  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <Card data-testid="card-proof-history">
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <CardDescription>Full accepted-proof history for this agent.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="py-8 text-center text-sm text-muted-foreground" data-testid="text-proofs-error">
            Couldn't load proof history right now. Please try again in a moment.
          </div>
        ) : proofs.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground" data-testid="text-proofs-empty">
            No proofs submitted yet.
          </div>
        ) : (
          <>
            <ul className="divide-y divide-border/60">
              {proofs.map((p) => (
                <li
                  key={p.id}
                  className="py-3 flex items-center justify-between gap-3"
                  data-testid={`row-proof-${p.id}`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{p.proof}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {format(new Date(p.blockTimestamp), "MMM d, yyyy HH:mm")} UTC
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <Badge variant="outline" className="text-xs">
                      Score {p.score}
                    </Badge>
                    <div className="text-xs text-muted-foreground mt-1">+{p.rewardArzyg} ARZY-G</div>
                  </div>
                </li>
              ))}
            </ul>
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 mt-2 border-t border-border/60">
                <span className="text-xs text-muted-foreground">
                  Page {page} of {totalPages} · {total} proofs
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOffset((o) => Math.max(0, o - limit))}
                    disabled={offset <= 0}
                    data-testid="btn-proofs-prev"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOffset((o) => (o + limit < total ? o + limit : o))}
                    disabled={offset + limit >= total}
                    data-testid="btn-proofs-next"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function AgentProfile() {
  const params = useParams<{ address: string }>();
  const valid = isValidAddress(params.address);
  const address = valid ? params.address : undefined;

  const { data: profile, isLoading, isError } = usePouAgentProfile(address);
  const { connected } = usePouLiveInvalidation(address);

  if (!valid || !address) {
    return <NotFound />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 pt-24 pb-16 container mx-auto px-4 max-w-6xl">
        <Link
          href="/leaderboard"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary transition-colors mb-6"
          data-testid="link-back-to-leaderboard"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Leaderboard
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3">
              <h1
                className="text-2xl md:text-3xl font-display font-extrabold text-foreground"
                data-testid="text-agent-address"
              >
                {formatAddress(address)}
              </h1>
              {!isLoading && profile?.rank != null && (
                <Badge
                  variant="secondary"
                  className="inline-flex items-center gap-1 text-sm"
                  data-testid="badge-agent-rank"
                >
                  <Crown className="w-3.5 h-3.5 text-primary" /> Rank #{profile.rank}
                </Badge>
              )}
            </div>
            <div className="mt-1">
              <CopyAddressButton address={address} />
            </div>
          </div>
          <LiveIndicator connected={connected} />
        </div>

        {isError ? (
          <Card>
            <CardContent className="py-12 text-center" data-testid="text-profile-error">
              <Gauge className="w-10 h-10 text-destructive/50 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Couldn't load this agent's profile right now. Please try again in a moment.
              </p>
            </CardContent>
          </Card>
        ) : !isLoading && profile && profile.totalProofs === 0 ? (
          <Card>
            <CardContent className="py-12 text-center" data-testid="text-profile-empty">
              <Gauge className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                This agent hasn't had any proofs accepted on-chain yet.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <StatCard
                icon={Gauge}
                label="Avg PoU Score"
                value={isLoading ? "–" : (profile?.avgScore ?? 0).toFixed(2)}
                sub={<span className="text-muted-foreground">Lifetime average</span>}
                testId="stat-avg-score"
              />
              <StatCard
                icon={Zap}
                label="Total Proofs"
                value={isLoading ? "–" : (profile?.totalProofs ?? 0).toLocaleString()}
                sub={<span className="text-muted-foreground">Accepted on-chain</span>}
                testId="stat-total-proofs"
              />
              <StatCard
                icon={Coins}
                label="Total Earned"
                value={
                  isLoading
                    ? "–"
                    : `${Number(profile?.totalEarnedArzyg ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                }
                sub={<span className="text-muted-foreground">ARZY-G lifetime</span>}
                testId="stat-total-earned"
              />
              <StatCard
                icon={Flame}
                label="Current Streak"
                value={isLoading ? "–" : `${profile?.currentStreakDays ?? 0}d`}
                sub={<span className="text-muted-foreground">Consecutive active days</span>}
                testId="stat-streak"
              />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
              <Card className="xl:col-span-1" data-testid="card-radar">
                <CardHeader>
                  <CardTitle>Performance Radar</CardTitle>
                  <CardDescription>Five derived performance dimensions, 0–10 scale.</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-[260px] w-full" />
                  ) : !profile?.radar ? (
                    <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
                      Not enough data yet.
                    </div>
                  ) : (
                    <div className="h-[260px] w-full" data-testid="chart-radar">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart
                          data={RADAR_DIMENSIONS.map((d) => ({
                            dimension: d.label,
                            value: profile.radar![d.key],
                          }))}
                        >
                          <PolarGrid stroke={CHART_COLORS.grid} />
                          <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 12, fill: CHART_COLORS.axis }} />
                          <Radar
                            dataKey="value"
                            stroke={CHART_COLORS.primary}
                            fill={CHART_COLORS.primary}
                            fillOpacity={0.3}
                          />
                          <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(value: number) => [value.toFixed(2), "Score"]} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="xl:col-span-1" data-testid="card-task-distribution">
                <CardHeader>
                  <CardTitle>Task Distribution</CardTitle>
                  <CardDescription>Accepted proofs by task category.</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-[260px] w-full" />
                  ) : (profile?.taskDistribution.length ?? 0) === 0 ? (
                    <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
                      No categorized proofs yet.
                    </div>
                  ) : (
                    <div className="h-[260px] w-full" data-testid="chart-task-distribution">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={profile?.taskDistribution} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} horizontal={false} />
                          <XAxis type="number" {...CHART_AXIS_PROPS} allowDecimals={false} />
                          <YAxis type="category" dataKey="category" {...CHART_AXIS_PROPS} width={90} />
                          <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(value: number) => [value, "Proofs"]} />
                          <Bar dataKey="count" fill={CHART_COLORS.primary} radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="xl:col-span-1" data-testid="card-achievements">
                <CardHeader>
                  <CardTitle>Achievements</CardTitle>
                  <CardDescription>Milestones derived live from this agent's history.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isLoading ? (
                    <Skeleton className="h-24 w-full" />
                  ) : (
                    <AchievementBadges achievements={profile?.achievements ?? []} />
                  )}
                  {!isLoading && profile?.bestPerformance && (
                    <div className="pt-3 border-t border-border/60" data-testid="card-best-performance">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                        <Trophy className="w-3.5 h-3.5 text-primary" /> Best performance
                      </div>
                      <div className="text-sm text-foreground truncate">{profile.bestPerformance.proof}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Score {profile.bestPerformance.score} ·{" "}
                        {format(new Date(profile.bestPerformance.blockTimestamp), "MMM d, yyyy")}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <ProofHistory address={address} />
          </>
        )}

        <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
          <Coins className="w-3.5 h-3.5" />
          Data indexed live from on-chain ProofAccepted events on Sepolia.
        </div>
      </main>

      <Footer />
    </div>
  );
}
