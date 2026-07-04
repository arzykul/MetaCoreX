import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Cpu } from "lucide-react";

export function Navbar() {
  const [location] = useLocation();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md shadow-soft">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group" data-testid="link-home-logo">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center transition-colors">
            <Cpu className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-display font-extrabold text-xl tracking-tight text-foreground">MetaCoreX</span>
        </Link>

        <div className="flex items-center gap-4">
          {location !== "/dashboard" ? (
            <Button asChild variant="default" className="font-semibold">
              <Link href="/dashboard" data-testid="btn-nav-launch">
                Launch App
              </Link>
            </Button>
          ) : (
            <Button asChild variant="outline" className="font-semibold text-muted-foreground hover:text-foreground">
              <Link href="/" data-testid="btn-nav-home">
                Back to Site
              </Link>
            </Button>
          )}
        </div>
      </div>
    </nav>
  );
}
