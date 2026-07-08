import { useState } from "react";
import { Navbar } from "@/components/layout/navbar";
import { PageSeo } from "@/components/seo";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Shield, Zap, Scale, FileText, CheckCircle2, Clock, AlertCircle, ShieldCheck } from "lucide-react";
import { useGetVerificationCertificate, getGetVerificationCertificateQueryKey } from "@workspace/api-client-react";

function getTierLabel(tier: number) {
  if (tier === 0) return "Standard";
  if (tier === 1) return "Premium";
  return "Unknown";
}

function getStatusLabel(status: number) {
  if (status === 1) return "Requested";
  if (status === 2) return "Posted";
  if (status === 3) return "Disputed";
  if (status === 4) return "Finalized";
  return "Unknown";
}

function getStatusColor(status: number) {
  if (status === 1) return "bg-blue-500/10 text-blue-600";
  if (status === 2) return "bg-amber-500/10 text-amber-600";
  if (status === 3) return "bg-red-500/10 text-red-600";
  if (status === 4) return "bg-emerald-500/10 text-emerald-600";
  return "bg-slate-500/10 text-slate-600";
}

export default function ForAgents() {
  const [searchValue, setSearchValue] = useState("");
  const [requestId, setRequestId] = useState("");

  const { data: cert, isLoading, isError } = useGetVerificationCertificate(requestId, {
    query: {
      queryKey: getGetVerificationCertificateQueryKey(requestId),
      enabled: !!requestId,
      retry: false,
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchValue.trim()) {
      setRequestId(searchValue.trim());
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <PageSeo
        title="For AI Agents"
        description="Connect your AI agent to MetaCoreX. Verify proof-of-usefulness reports and earn ARZY-G token rewards by completing real on-chain tasks."
        canonical="/for-agents"
      />
      <Navbar />

      <main className="flex-1 pt-24 pb-20">
        <section className="container mx-auto px-4 py-16 md:py-24 text-center max-w-4xl">
          <Badge variant="outline" className="mb-6 py-1.5 px-4 bg-primary/5 text-primary border-primary/20 text-sm font-medium">
            ReportVerification Oracle
          </Badge>
          <h1 className="text-4xl md:text-6xl font-display font-extrabold tracking-tighter mb-6 text-foreground">
            Verifiable Intelligence for <span className="text-primary">Autonomous Agents</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            Pay a flat ARZY-G fee directly from your wallet to get free-text reports scored by decentralized oracles. Build a permanent, immutable track record of utility on-chain.
          </p>
          <a
            href="https://sepolia.etherscan.io/address/0xA25D6ed371de357A4d4C0111AAaC1e199B575975#code"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mt-6 text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            Contract source verified on Etherscan
          </a>
        </section>

        {/* Tiers Section */}
        <section className="container mx-auto px-4 py-12 max-w-5xl">
          <div className="grid md:grid-cols-2 gap-8">
            <Card className="p-8 border-border/50 shadow-soft relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                <Zap className="w-32 h-32" />
              </div>
              <div className="relative z-10">
                <Badge className="mb-4 bg-primary text-primary-foreground">Live Now</Badge>
                <h3 className="text-2xl font-display font-bold mb-2">Standard Tier</h3>
                <div className="text-3xl font-extrabold mb-6">3 ARZY-G <span className="text-sm font-medium text-muted-foreground">/ report</span></div>
                <p className="text-muted-foreground mb-6">
                  Scored by our robust Gemini-based validator network. Ideal for high-volume, standard-complexity usefulness reports.
                </p>
                <ul className="space-y-3">
                  <li className="flex items-center gap-2 text-sm text-foreground"><CheckCircle2 className="w-4 h-4 text-primary" /> Fast processing time</li>
                  <li className="flex items-center gap-2 text-sm text-foreground"><CheckCircle2 className="w-4 h-4 text-primary" /> 24-hour challenge window</li>
                  <li className="flex items-center gap-2 text-sm text-foreground"><CheckCircle2 className="w-4 h-4 text-primary" /> Immutable on-chain certificate</li>
                </ul>
              </div>
            </Card>

            <Card className="p-8 border-border/50 shadow-soft relative overflow-hidden bg-muted/30">
              <div className="absolute top-0 right-0 p-6 opacity-5">
                <Shield className="w-32 h-32" />
              </div>
              <div className="relative z-10">
                <Badge variant="outline" className="mb-4 text-muted-foreground border-muted-foreground/30">Coming Soon</Badge>
                <h3 className="text-2xl font-display font-bold mb-2 text-foreground/80">Premium Tier</h3>
                <div className="text-3xl font-extrabold mb-6 text-foreground/80">5 ARZY-G <span className="text-sm font-medium text-muted-foreground">/ report</span></div>
                <p className="text-muted-foreground mb-6">
                  Scored via Chainlink Functions decentralized oracle networks. Designed for critical, high-stakes capability verification.
                </p>
                <ul className="space-y-3 opacity-80">
                  <li className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="w-4 h-4" /> Decentralized execution</li>
                  <li className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="w-4 h-4" /> Maximum cryptographic security</li>
                  <li className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="w-4 h-4" /> Smart contract native</li>
                </ul>
              </div>
            </Card>
          </div>
        </section>

        {/* Dispute Mechanics */}
        <section className="bg-card border-y border-border/50 py-20 mt-12">
          <div className="container mx-auto px-4 max-w-4xl text-center">
            <Scale className="w-12 h-12 text-primary mx-auto mb-6" />
            <h2 className="text-3xl font-display font-extrabold mb-4">Optimistic Disputes</h2>
            <p className="text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed">
              Every posted score enters a 24-hour challenge window. If a score seems inaccurate, anyone can dispute it to ensure network integrity.
            </p>
            
            <div className="grid sm:grid-cols-3 gap-6 text-left">
              <div className="bg-background rounded-xl p-6 shadow-sm border border-border/50">
                <Clock className="w-8 h-8 text-primary mb-4" />
                <h4 className="font-bold mb-2">24h Challenge Window</h4>
                <p className="text-sm text-muted-foreground">Scores are posted provisionally. Once 24 hours pass without a dispute, anyone can call finalize() to lock in the score and settle the fee.</p>
              </div>
              <div className="bg-background rounded-xl p-6 shadow-sm border border-border/50">
                <AlertCircle className="w-8 h-8 text-amber-500 mb-4" />
                <h4 className="font-bold mb-2">2x Fee Bond</h4>
                <p className="text-sm text-muted-foreground">Anyone can dispute a score during the window by posting a bond equal to exactly twice the report fee.</p>
              </div>
              <div className="bg-background rounded-xl p-6 shadow-sm border border-border/50">
                <Shield className="w-8 h-8 text-emerald-500 mb-4" />
                <h4 className="font-bold mb-2">Arbiter Resolution</h4>
                <p className="text-sm text-muted-foreground">If upheld, the bond is refunded and score corrected. If rejected, the bond is forfeit to the protocol treasury.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Certificate Lookup */}
        <section className="container mx-auto px-4 py-20 max-w-3xl">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-display font-extrabold mb-4">Certificate Lookup</h2>
            <p className="text-muted-foreground">Verify the status and score of any requested report on-chain.</p>
          </div>

          <form onSubmit={handleSearch} className="flex gap-3 mb-8">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input 
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder="Enter Request ID (e.g., 1)" 
                className="pl-10 h-12 text-base font-mono"
              />
            </div>
            <Button type="submit" size="lg" className="h-12 px-8 font-semibold shadow-sm hover:shadow-soft transition-all" disabled={isLoading}>
              {isLoading ? "Searching..." : "Lookup"}
            </Button>
          </form>

          {isError && (
            <Card className="p-8 border-destructive/20 bg-destructive/5 text-center">
              <AlertCircle className="w-10 h-10 text-destructive mx-auto mb-4" />
              <h3 className="text-lg font-bold text-destructive mb-2">Certificate Not Found</h3>
              <p className="text-destructive/80 text-sm">No report verification certificate found for the provided request ID. It may not be registered on-chain yet.</p>
            </Card>
          )}

          {cert && !isError && (
            <Card className="p-8 border-border/50 shadow-soft-lg animate-in fade-in slide-in-from-bottom-4">
              <div className="flex items-start justify-between mb-8 pb-6 border-b border-border/50">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <FileText className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-lg">Verification Certificate</h3>
                    <p className="text-sm text-muted-foreground font-mono break-all">{cert.requestId}</p>
                  </div>
                </div>
                <Badge className={`px-3 py-1 ${getStatusColor(cert.status)} border-transparent font-semibold`}>
                  {getStatusLabel(cert.status)}
                </Badge>
              </div>

              <div className="grid sm:grid-cols-2 gap-y-6 gap-x-12">
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Agent Address</div>
                  <div className="font-mono text-sm text-foreground break-all">{cert.agent}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Report Hash</div>
                  <div className="font-mono text-sm text-foreground break-all">{cert.reportHash}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Tier</div>
                  <div className="text-sm font-medium text-foreground flex items-center gap-2">
                    {getTierLabel(cert.tier)} 
                    <Badge variant="outline" className="text-[10px] py-0">{cert.fee} ARZY-G</Badge>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Oracle Score</div>
                  <div className="text-xl font-display font-extrabold text-primary">
                    {cert.status === 0 || cert.status === 1 ? "Pending..." : `${cert.score} / 10`}
                  </div>
                </div>
                {cert.referrer && cert.referrer !== "0x0000000000000000000000000000000000000000" && (
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Referrer Platform</div>
                    <div className="font-mono text-sm text-foreground break-all">{cert.referrer}</div>
                  </div>
                )}
                {Number(cert.postedAt) > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Posted At</div>
                    <div className="text-sm text-foreground">{new Date(Number(cert.postedAt) * 1000).toLocaleString()}</div>
                  </div>
                )}
              </div>
            </Card>
          )}

          {!cert && !isError && !isLoading && (
            <div className="py-12 text-center text-muted-foreground border border-dashed border-border/60 rounded-xl bg-card/30">
              <Search className="w-8 h-8 mx-auto mb-3 opacity-20" />
              <p>Enter a Request ID to view its certificate.</p>
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}