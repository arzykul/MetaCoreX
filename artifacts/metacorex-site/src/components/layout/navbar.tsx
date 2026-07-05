import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import {
  BarChart3,
  BookOpen,
  Cpu,
  FileCheck,
  HelpCircle,
  Home,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Newspaper,
  Users,
} from "lucide-react";

const navLinks = [
  { label: "Home", href: "/", icon: Home },
  { label: "Agents", href: "/dashboard?tab=agents", icon: Users },
  { label: "Submit Proof", href: "/dashboard?tab=proof", icon: FileCheck },
  { label: "Analytics", href: "/dashboard?tab=analytics", icon: BarChart3 },
  { label: "FAQ", href: "/faq", icon: HelpCircle },
  { label: "Blog", href: "/blog", icon: Newspaper },
  { label: "Docs", href: "/docs", icon: BookOpen },
  { label: "Contact", href: "/contact", icon: MessageSquare },
];

function pathOf(href: string) {
  return href.split("?")[0];
}

export function Navbar() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md shadow-soft">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 shrink-0" data-testid="link-home-logo">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
            <Cpu className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-display font-extrabold text-xl tracking-tight text-foreground">MetaCoreX</span>
        </Link>

        <div className="hidden lg:flex items-center gap-1 flex-1 justify-center">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                pathOf(link.href) === location
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              data-testid={`link-nav-${link.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <link.icon className="w-[18px] h-[18px]" />
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden lg:flex items-center gap-4 shrink-0">
          {location !== "/dashboard" ? (
            <Button asChild variant="default" className="font-semibold">
              <Link href="/dashboard" data-testid="btn-nav-launch">
                <LayoutDashboard className="w-4 h-4 mr-2" />
                Launch App
              </Link>
            </Button>
          ) : (
            <Button asChild variant="outline" className="font-semibold text-muted-foreground hover:text-foreground">
              <Link href="/" data-testid="btn-nav-home">
                <Home className="w-4 h-4 mr-2" />
                Back to Site
              </Link>
            </Button>
          )}
        </div>

        <div className="flex lg:hidden items-center gap-2">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" data-testid="btn-mobile-menu">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[280px] flex flex-col">
              <SheetTitle className="font-display font-extrabold text-lg text-left">Menu</SheetTitle>
              <div className="flex flex-col gap-1 mt-6">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                      pathOf(link.href) === location
                        ? "text-primary bg-primary/10"
                        : "text-foreground hover:bg-muted"
                    }`}
                    data-testid={`link-mobile-nav-${link.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <link.icon className="w-[18px] h-[18px]" />
                    {link.label}
                  </Link>
                ))}
              </div>
              <div className="mt-auto pt-6 border-t border-border">
                {location !== "/dashboard" ? (
                  <Button asChild className="w-full font-semibold" onClick={() => setOpen(false)}>
                    <Link href="/dashboard">
                      <LayoutDashboard className="w-4 h-4 mr-2" />
                      Launch App
                    </Link>
                  </Button>
                ) : (
                  <Button asChild variant="outline" className="w-full font-semibold" onClick={() => setOpen(false)}>
                    <Link href="/">
                      <Home className="w-4 h-4 mr-2" />
                      Back to Site
                    </Link>
                  </Button>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}
