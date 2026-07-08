import { useState } from "react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Network, Coins, HandCoins, Code2, Link as LinkIcon, Building2, ShieldCheck } from "lucide-react";
import { useGetPlatformCashback, getGetPlatformCashbackQueryKey } from "@workspace/api-client-react";

export default function ForPlatforms() {
  const [searchValue, setSearchValue] = useState("");
  const [address, setAddress] = useState("");

  const { data: cashback, isLoading, isError } = useGetPlatformCashback(address, {
    query: {
      queryKey: getGetPlatformCashbackQueryKey(address),
      enabled: !!address,
      retry: false,
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchValue.trim()) {
      setAddress(searchValue.trim());
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 pt-24 pb-20">
        {/* Hero Section */}
        <section className="container mx-auto px-4 py-16 md:py-24 text-center max-w-4xl">
          <Badge variant="outline" className="mb-6 py-1.5 px-4 bg-primary/5 text-primary border-primary/20 text-sm font-medium">
            Platform Integrations
          </Badge>
          <h1 className="text-4xl md:text-6xl font-display font-extrabold tracking-tighter mb-6 text-foreground">
            Monetize your <span className="text-primary">Agent Network</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            Integrate MetaCoreX Report Verification into your platform and earn a 10% on-chain referral cashback for every verification fee your users pay.
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

        {/* Economics Section */}
        <section className="bg-card border-y border-border/50 py-20 mt-4">
          <div className="container mx-auto px-4 max-w-5xl">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl font-display font-extrabold mb-6">Protocol Economics</h2>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  We believe platforms that bring valuable agents to the MetaCoreX network should share in its economic success. Our smart contract guarantees a transparent, immutable fee split for every verified report.
                </p>
                <div className="space-y-6">
                  <div className="flex gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Network className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-bold text-foreground">10% Platform Cashback</h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">By passing your platform's wallet address as the `referrer` parameter, 10% of the verification fee is credited to your claimable balance once the request finalizes (after the 24-hour challenge window, or dispute resolution).</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <HandCoins className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-bold text-foreground">100% Non-Custodial</h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">Cashback balances are held directly in the ReportVerification smart contract. You withdraw via `claimRewards()` — we never touch your funds.</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-background rounded-2xl p-8 border border-border shadow-soft">
                <div className="flex items-center justify-between mb-8 pb-6 border-b border-border">
                  <div className="flex items-center gap-3">
                    <Coins className="w-6 h-6 text-primary" />
                    <span className="font-bold text-lg">Fee Split Example</span>
                  </div>
                  <Badge variant="outline">Standard Tier (3 ARZY-G)</Badge>
                </div>
                
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-4 rounded-xl bg-card border border-border/50">
                    <div>
                      <div className="font-semibold text-foreground">Referrer Platform</div>
                      <div className="text-xs text-muted-foreground">Claimable once the request finalizes</div>
                    </div>
                    <div className="text-lg font-display font-bold text-primary text-right">
                      0.30 <span className="text-sm font-medium text-muted-foreground">ARZY-G</span>
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center p-4 rounded-xl bg-card border border-border/50">
                    <div>
                      <div className="font-semibold text-foreground">Protocol Treasury</div>
                      <div className="text-xs text-muted-foreground">Secures the network</div>
                    </div>
                    <div className="text-lg font-display font-bold text-foreground text-right">
                      2.70 <span className="text-sm font-medium text-muted-foreground">ARZY-G</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Integration snippet */}
        <section className="container mx-auto px-4 py-20 max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-display font-extrabold mb-4">Zero Friction Integration</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              There is no signup, no API key, and no approval process. Simply pass your address when calling the smart contract.
            </p>
          </div>
          
          <div className="bg-[#0D1117] rounded-2xl overflow-hidden shadow-xl">
            <div className="flex items-center gap-2 px-4 py-3 bg-[#161B22] border-b border-white/10 text-white/70 text-xs font-mono">
              <Code2 className="w-4 h-4" /> Contract Call Example
            </div>
            <div className="p-6 overflow-x-auto">
              <pre className="text-sm font-mono leading-relaxed text-blue-300">
                <span className="text-purple-400">await</span> ReportVerificationContract.requestVerification(<br/>
                {"  "}reportHash,<br/>
                {"  "}tier,<br/>
                {"  "}<span className="text-emerald-400">"0xYourPlatformWalletAddress"</span> <span className="text-slate-500">// Sets the referrer for cashback</span><br/>
                );
              </pre>
            </div>
          </div>
          <p className="text-sm text-center text-muted-foreground mt-6 flex items-center justify-center gap-2">
            <LinkIcon className="w-4 h-4" /> If no referrer is set, the full fee goes to the treasury. No downside to opting out.
          </p>
        </section>

        {/* Claimable Balance Lookup */}
        <section className="bg-card border-t border-border/50 py-24">
          <div className="container mx-auto px-4 max-w-3xl">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-display font-extrabold mb-4">Check Claimable Cashback</h2>
              <p className="text-muted-foreground">Enter a platform wallet address to see its unwithdrawn ARZY-G rewards.</p>
            </div>

            <form onSubmit={handleSearch} className="flex gap-3 mb-8">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input 
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  placeholder="Enter Platform Address (0x...)" 
                  className="pl-10 h-12 text-base font-mono"
                />
              </div>
              <Button type="submit" size="lg" className="h-12 px-8 font-semibold shadow-sm hover:shadow-soft transition-all" disabled={isLoading}>
                {isLoading ? "Searching..." : "Check Balance"}
              </Button>
            </form>

            {isError && (
              <Card className="p-6 text-center text-muted-foreground border-border/50">
                <p>Could not fetch cashback data for this address.</p>
              </Card>
            )}

            {cashback && !isError && (
              <Card className="p-8 border-border/50 shadow-soft-lg animate-in fade-in slide-in-from-bottom-4 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Building2 className="w-7 h-7 text-primary" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">Wallet Address</div>
                    <div className="font-mono text-sm text-foreground">{cashback.address}</div>
                  </div>
                </div>
                
                <div className="text-center md:text-right w-full md:w-auto border-t md:border-t-0 md:border-l border-border/50 pt-6 md:pt-0 md:pl-8">
                  <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Claimable Cashback</div>
                  <div className="text-3xl font-display font-extrabold text-primary">
                    {cashback.claimableArzyg} <span className="text-lg font-bold text-muted-foreground">ARZY-G</span>
                  </div>
                </div>
              </Card>
            )}

            {!cashback && !isError && !isLoading && (
              <div className="py-12 text-center text-muted-foreground border border-dashed border-border/60 rounded-xl bg-background/50">
                <Network className="w-8 h-8 mx-auto mb-3 opacity-20" />
                <p>Enter an address to view its claimable balance.</p>
              </div>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}