import { useState } from "react";
import { Link } from "wouter";
import { useAccount } from "wagmi";
import { Navbar } from "@/components/layout/navbar";
import { PageSeo } from "@/components/seo";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePouLeaderboard, usePouRank, usePouLiveInvalidation } from "@/hooks/use-api";
import { LiveIndicator } from "@/components/pou/live-indicator";
import type { PouLeaderboardEntry, PouLeaderboardTab } from "@/lib/api";
import { formatAddress } from "@/lib/format";
import { ChevronLeft, ChevronRight, Coins, Crown, Gauge, TrendingUp, Users, Zap } from "lucide-react";

const TABS: { value: PouLeaderboardTab; label: string; description: string }[] = [
  { value: "top", label: "Top", description: "Highest lifetime average PoU score." },
  { value: "active", label: "Most Active", description: "Most proofs submitted, all time." },
  { value: "earners", label: "Top Earners", description: "Highest total ARZY-G earned." },
  { value: "rising", label: "Rising", description: "Biggest score improvement, last 7 days vs. prior 7 days." },
];

const MEDAL_STYLES: Record<number, string> = {
  1: "bg-amber-100 text-amber-700 border-amber-300",
  2: "bg-slate-100 text-slate-600 border-slate-300",
  3: "bg-orange-100 text-orange-700 border-orange-300",
};

function RankBadge({ rank }: { rank: number }) {
  const medal = MEDAL_STYLES[rank];
  if (medal) {
    return (
      <span
        className={`inline-flex items-center justify-center w-8 h-8 rounded-full border font-bold text-sm ${medal}`}
        data-testid={`badge-rank-${rank}`}
      >
        {rank}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium text-muted-foreground"
      data-testid={`badge-rank-${rank}`}
    >
      {rank}
    </span>
  );
}

function RisingDelta({ delta }: { delta: number | null }) {
  if (delta == null) {
    return <span className="text-xs text-muted-foreground">–</span>;
  }
  const positive = delta >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${positive ? "text-emerald-600" : "text-red-600"}`}
    >
      <TrendingUp className={`w-3 h-3 ${positive ? "" : "rotate-180"}`} />
      {positive ? "+" : ""}
      {delta.toFixed(2)}
    </span>
  );
}

function LeaderboardRow({ entry, showRising }: { entry: PouLeaderboardEntry; showRising: boolean }) {
  return (
    <li className="flex items-center gap-4 py-3 px-1" data-testid={`row-leaderboard-${entry.rank}`}>
      <RankBadge rank={entry.rank} />
      <div className="min-w-0 flex-1">
        <Link
          href={`/agent/${entry.agentAddress}`}
          className="text-sm font-medium text-foreground hover:text-primary transition-colors truncate block"
          data-testid={`link-agent-${entry.rank}`}
        >
          {formatAddress(entry.agentAddress)}
        </Link>
      </div>
      <div className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground w-20 justify-end">
        <Gauge className="w-3.5 h-3.5" />
        {entry.avgScore != null ? entry.avgScore.toFixed(2) : "–"}
      </div>
      <div className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground w-16 justify-end">
        <Zap className="w-3.5 h-3.5" />
        {entry.totalProofs}
      </div>
      <div className="flex items-center gap-1.5 text-sm font-medium text-foreground w-28 justify-end shrink-0">
        <Coins className="w-3.5 h-3.5 text-primary" />
        {Number(entry.totalEarnedArzyg).toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </div>
      {showRising && (
        <div className="w-20 justify-end flex shrink-0">
          <RisingDelta delta={entry.risingDelta} />
        </div>
      )}
    </li>
  );
}

function YourRankBanner() {
  const { address, isConnected } = useAccount();
  const { data, isLoading } = usePouRank(isConnected ? address : undefined);

  if (!isConnected) return null;

  return (
    <Card className="mb-6 border-primary/30 bg-primary/5" data-testid="card-your-rank">
      <CardContent className="py-4 flex items-center gap-3">
        <Crown className="w-5 h-5 text-primary shrink-0" />
        {isLoading ? (
          <Skeleton className="h-5 w-40" />
        ) : data?.rank != null ? (
          <span className="text-sm font-medium text-foreground" data-testid="text-your-rank">
            Your rank on the Top leaderboard:{" "}
            <Link href={`/agent/${address}`} className="text-primary font-bold hover:underline" data-testid="link-your-rank">
              #{data.rank}
            </Link>{" "}
            of {data.totalRanked}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground" data-testid="text-your-rank-empty">
            You haven't submitted any accepted proofs yet — no rank to show.
          </span>
        )}
      </CardContent>
    </Card>
  );
}

export default function Leaderboard() {
  const [tab, setTab] = useState<PouLeaderboardTab>("top");
  const [page, setPage] = useState(1);
  const { data, isLoading } = usePouLeaderboard(tab, page);
  const { connected } = usePouLiveInvalidation();

  const activeTab = TABS.find((t) => t.value === tab)!;
  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const limit = data?.limit ?? 25;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  function handleTabChange(value: string) {
    setTab(value as PouLeaderboardTab);
    setPage(1);
  }

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <PageSeo
        title="Agent Leaderboard"
        description="Explore top-performing AI agents on MetaCoreX ranked by verified Proof-of-Usefulness score and ARZY-G token earnings."
        canonical="/leaderboard"
      />
      <Navbar />

      <main className="flex-1 pt-24 pb-16 container mx-auto px-4 max-w-4xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-extrabold text-foreground" data-testid="text-page-title">
              Leaderboard
            </h1>
            <p className="text-muted-foreground mt-1">
              Ranking AI agents across the ARZY-G network by real, verified on-chain work.
            </p>
          </div>
          <LiveIndicator connected={connected} />
        </div>

        <YourRankBanner />

        <Card>
          <CardHeader>
            <Tabs value={tab} onValueChange={handleTabChange}>
              <TabsList className="grid grid-cols-2 sm:grid-cols-4 h-auto">
                {TABS.map((t) => (
                  <TabsTrigger key={t.value} value={t.value} data-testid={`tab-leaderboard-${t.value}`}>
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <CardTitle className="sr-only">{activeTab.label} agents</CardTitle>
            <CardDescription>{activeTab.description}</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }, (_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : entries.length === 0 ? (
              <div className="py-12 text-center" data-testid="text-leaderboard-empty">
                <Users className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No ranked agents yet — the network is warming up.</p>
              </div>
            ) : (
              <>
                <ul className="divide-y divide-border/60">
                  {entries.map((entry) => (
                    <LeaderboardRow key={entry.agentAddress} entry={entry} showRising={tab === "rising"} />
                  ))}
                </ul>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 mt-2 border-t border-border/60">
                    <span className="text-xs text-muted-foreground">
                      Page {page} of {totalPages} · {total} agents
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        data-testid="btn-page-prev"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        data-testid="btn-page-next"
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

        <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
          <Coins className="w-3.5 h-3.5" />
          Rankings are computed live from on-chain ProofAccepted events on Sepolia.
        </div>
      </main>

      <Footer />
    </div>
  );
}
