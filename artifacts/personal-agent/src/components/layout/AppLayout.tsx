import { Link, useLocation } from "wouter";
import { LayoutDashboard, MessageSquare, CheckSquare, StickyNote, Bell, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Assistant", icon: MessageSquare },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/notes", label: "Notes", icon: StickyNote },
  { href: "/reminders", label: "Reminders", icon: Bell },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const NavLinks = () => (
    <div className="flex flex-col gap-2">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = location === item.href || location.startsWith(item.href + "/");
        
        return (
          <Link key={item.href} href={item.href}>
            <div
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors ${
                isActive 
                  ? "bg-primary text-primary-foreground font-medium" 
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
              onClick={() => setMobileMenuOpen(false)}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );

  return (
    <div className="flex min-h-[100dvh] bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r bg-sidebar p-4 shrink-0">
        <div className="mb-8 px-3">
          <h1 className="text-2xl font-serif font-bold text-foreground">PersonalAI</h1>
          <p className="text-xs text-muted-foreground mt-1 font-sans">Your quiet space</p>
        </div>
        <nav className="flex-1">
          <NavLinks />
        </nav>
      </aside>

      {/* Mobile Header & Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b bg-background sticky top-0 z-10">
          <h1 className="text-xl font-serif font-bold text-foreground">PersonalAI</h1>
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-4 pt-12 bg-sidebar border-r-0">
              <NavLinks />
            </SheetContent>
          </Sheet>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
        
        {/* Mobile Bottom Nav (Optional, replacing header nav) */}
        <div className="md:hidden border-t bg-background p-2 flex items-center justify-around pb-safe">
            {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.href || location.startsWith(item.href + "/");
                return (
                    <Link key={item.href} href={item.href}>
                        <div className={`flex flex-col items-center justify-center p-2 rounded-lg ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                            <Icon className="w-5 h-5 mb-1" />
                            <span className="text-[10px] font-medium">{item.label}</span>
                        </div>
                    </Link>
                )
            })}
        </div>
      </div>
    </div>
  );
}
