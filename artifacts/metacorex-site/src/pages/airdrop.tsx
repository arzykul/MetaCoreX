import { useEffect, useRef, useState } from "react";
import { useSearch } from "wouter";
import { useAccount } from "wagmi";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { PageSeo } from "@/components/seo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConnectWalletPrompt } from "@/components/wallet/connect-wallet-prompt";
import { useToast } from "@/hooks/use-toast";
import {
  useAirdropPoints,
  useAirdropLeaderboard,
  useAirdropReferral,
  useAirdropClaim,
} from "@/hooks/use-api";
import { formatAddress } from "@/lib/format";
import { Bot, Check, Copy, FileCheck, Gift, Sparkles, Trophy, Users } from "lucide-react";

function TierProgress({
  totalPoints,
  tiers,
  currentTierIndex,
  nextTier,
  pointsToNextTier,
}: {
  totalPoints: number;
  tiers: number[];
  currentTierIndex: number;
  nextTier: number | null;
  pointsToNextTier: number | null;
}) {
  const prevTier = currentTierIndex > 0 ? tiers[currentTierIndex - 1] : 0;
  const target = nextTier ?? tiers[tiers.length - 1];
  const span = Math.max(1, target - prevTier);
  const progressPct = nextTier ? Math.min(100, ((totalPoints - prevTier) / span) * 100) : 100;

  return (
    <div data-testid="section-tier-progress">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm font-medium text-foreground">
          Tier {Math.min(currentTierIndex + 1, tiers.length)} of {tiers.length}
        </span>
        {nextTier ? (
          <span className="text-xs text-muted-foreground" data-testid="text-points-to-next-tier">
            {pointsToNextTier} pts to {nextTier}
          </span>
        ) : (
          <span className="text-xs font-medium text-primary">Max tier reached</span>
        )}
      </div>
      <Progress value={progressPct} data-testid="progress-tier" />
      <div className="flex justify-between mt-2">
        {tiers.map((tier, i) => (
          <span
            key={tier}
            className={`text-xs ${i <= currentTierIndex ? "text-primary font-semibold" : "text-muted-foreground"}`}
            data-testid={`text-tier-${tier}`}
          >
            {tier}
          </span>
        ))}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Bot;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card data-testid={`card-stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="py-5 flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold text-foreground leading-tight">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xs text-primary mt-0.5">{hint}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ReferralCard({ address }: { address: string }) {
  const search = useSearch();
  const { toast } = useToast();
  const referral = useAirdropReferral();
  const attempted = useRef(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    const refCode = new URLSearchParams(search).get("ref") ?? undefined;
    referral.mutate({ walletAddress: address, refCode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const referralLink = referral.data
    ? `${window.location.origin}${referral.data.referralLink}`
    : null;

  function handleCopy() {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink).then(() => {
      setCopied(true);
      toast({ title: "Referral link copied" });
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Card data-testid="card-referral">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Gift className="w-4 h-4 text-primary" />
          Your Referral Link
        </CardTitle>
        <CardDescription>
          Share your link — when someone you referred registers as an agent on-chain, you earn +200 points.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {referral.isPending || !referral.data ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <div className="flex gap-2">
            <Input value={referralLink ?? ""} readOnly data-testid="input-referral-link" className="font-mono text-sm" />
            <Button onClick={handleCopy} variant="outline" size="icon" data-testid="btn-copy-referral">
              {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        )}
        {referral.data?.referredBy && (
          <p className="text-xs text-muted-foreground mt-2" data-testid="text-referred-by">
            You were referred by {formatAddress(referral.data.referredBy)}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ClaimSection({ address }: { address: string }) {
  const claim = useAirdropClaim();

  return (
    <Card data-testid="card-claim">
      <CardContent className="py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">Token distribution</p>
          <p className="text-xs text-muted-foreground">
            {claim.data?.message ??
              "Points are saved on Sepolia testnet activity. Real ARZY-G distribution begins after mainnet launch."}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => claim.mutate(address)}
          disabled={claim.isPending}
          data-testid="btn-claim"
        >
          {claim.isPending ? "Checking…" : "Check Claim Status"}
        </Button>
      </CardContent>
    </Card>
  );
}

function LeaderboardSection({ address }: { address?: string }) {
  const { data: entries = [], isLoading } = useAirdropLeaderboard();

  return (
    <Card data-testid="card-airdrop-leaderboard">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Trophy className="w-4 h-4 text-primary" />
          Points Leaderboard
        </CardTitle>
        <CardDescription>Top 10 wallets by total testnet airdrop points.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="py-10 text-center" data-testid="text-airdrop-leaderboard-empty">
            <Users className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No points earned yet — be the first.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {entries.map((entry) => {
              const isYou = address && entry.address.toLowerCase() === address.toLowerCase();
              return (
                <li
                  key={entry.address}
                  className={`flex items-center gap-4 py-3 px-1 ${isYou ? "bg-primary/5 -mx-1 rounded-md" : ""}`}
                  data-testid={`row-airdrop-leaderboard-${entry.rank}`}
                >
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium text-muted-foreground shrink-0">
                    {entry.rank}
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-medium text-foreground truncate">
                    {formatAddress(entry.address)}
                    {isYou && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        You
                      </Badge>
                    )}
                  </span>
                  {entry.agentRegistered && (
                    <Bot className="w-3.5 h-3.5 text-primary shrink-0 hidden sm:block" />
                  )}
                  <span className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground w-16 justify-end">
                    <FileCheck className="w-3.5 h-3.5" />
                    {entry.proofsCount}
                  </span>
                  <span className="flex items-center gap-1.5 text-sm font-bold text-primary w-20 justify-end shrink-0">
                    {entry.totalPoints}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function Airdrop() {
  const { address, isConnected } = useAccount();
  const { data: points, isLoading } = useAirdropPoints(isConnected ? address : undefined);

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <PageSeo
        title="Sepolia Airdrop & Points"
        description="Earn testnet points on MetaCoreX by registering an agent, submitting proofs of work, and referring others — ahead of the ARZY-G mainnet launch."
        canonical="/airdrop"
      />
      <Navbar />

      <main className="flex-1 pt-24 pb-16 container mx-auto px-4 max-w-4xl">
        <div className="mb-8">
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full mb-3">
            <Sparkles className="w-3 h-3" />
            Sepolia Testnet Program
          </div>
          <h1 className="text-2xl md:text-3xl font-display font-extrabold text-foreground" data-testid="text-page-title">
            Airdrop Points
          </h1>
          <p className="text-muted-foreground mt-1">
            Register an agent (+100), submit proofs (+50 each), and refer others (+200 per referred registrant) to
            climb the tiers ahead of mainnet.
          </p>
        </div>

        {!isConnected ? (
          <ConnectWalletPrompt label="Connect your wallet to see your points, referral link, and tier progress." />
        ) : isLoading || !points ? (
          <div className="space-y-4">
            <Skeleton className="h-40 w-full" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <Card data-testid="card-total-points">
              <CardContent className="py-6">
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-4xl font-bold text-foreground" data-testid="text-total-points">
                    {points.totalPoints}
                  </span>
                  <span className="text-muted-foreground text-sm">points</span>
                </div>
                <TierProgress
                  totalPoints={points.totalPoints}
                  tiers={points.tiers}
                  currentTierIndex={points.currentTierIndex}
                  nextTier={points.nextTier}
                  pointsToNextTier={points.pointsToNextTier}
                />
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard
                icon={Bot}
                label="Agent Registered"
                value={points.agentRegistered ? "Yes" : "No"}
                hint={points.agentRegistered ? "+100 pts" : "Register to earn +100"}
              />
              <StatCard
                icon={FileCheck}
                label="Accepted Proofs"
                value={String(points.proofsCount)}
                hint={`+50 pts each · ${points.proofsCount * 50} pts`}
              />
              <StatCard
                icon={Users}
                label="Referrals"
                value={String(points.referralCount)}
                hint={`+200 pts each · ${points.referralCount * 200} pts`}
              />
            </div>

            {address && <ReferralCard address={address} />}
            {address && <ClaimSection address={address} />}
          </div>
        )}

        <div className="mt-6">
          <LeaderboardSection address={isConnected ? address : undefined} />
        </div>
      </main>

      <Footer />
    </div>
  );
}
