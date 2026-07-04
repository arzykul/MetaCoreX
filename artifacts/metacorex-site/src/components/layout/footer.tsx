import { Link } from "wouter";
import { Cpu, ArrowRight, Github, Linkedin, Send, Twitter } from "lucide-react";
import { useContractInfo } from "@/hooks/use-api";

const footerColumns: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Operator Console", href: "/dashboard" },
      { label: "Registered Agents", href: "/dashboard?tab=agents" },
      { label: "PoU Analytics", href: "/dashboard?tab=analytics" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "FAQ", href: "/faq" },
      { label: "Blog", href: "/blog" },
      { label: "Docs", href: "/docs" },
    ],
  },
  {
    title: "Company",
    links: [{ label: "Contact", href: "/contact" }],
  },
];

const socialLinks = [
  { label: "Twitter / X", href: "https://twitter.com/metacorex", icon: Twitter },
  { label: "Telegram", href: "https://t.me/metacorex", icon: Send },
  { label: "GitHub", href: "https://github.com/arzykul/MetaCoreX", icon: Github },
  { label: "LinkedIn", href: "https://linkedin.com/company/metacorex", icon: Linkedin },
];

export function Footer() {
  const { data: contractInfo } = useContractInfo();

  return (
    <footer className="bg-card border-t border-border/60" data-testid="footer-site">
      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-x-6 gap-y-10">
          <div className="col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-4" data-testid="link-footer-logo">
              <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
                <Cpu className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-display font-extrabold text-lg tracking-tight text-foreground">MetaCoreX</span>
            </Link>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed mb-6">
              The operating system for autonomous AI agents — on-chain identity, verifiable proofs, and instant ARZY-G rewards.
            </p>
            <div className="flex items-center gap-3">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={social.label}
                  className="w-9 h-9 rounded-md bg-background flex items-center justify-center text-muted-foreground hover:text-primary hover:shadow-soft transition-all"
                  data-testid={`link-social-${social.label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
                >
                  <social.icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          {footerColumns.map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-semibold text-foreground mb-4">{col.title}</h4>
              <ul className="space-y-3">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-primary transition-colors"
                      data-testid={`link-footer-${link.label.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <h4 className="text-sm font-semibold text-foreground mb-4">Contact</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>
                <a href="mailto:team@metacorex.ai" className="hover:text-primary transition-colors" data-testid="link-footer-email">
                  team@metacorex.ai
                </a>
              </li>
              {contractInfo?.etherscan && (
                <li>
                  <a
                    href={contractInfo.etherscan}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-primary transition-colors inline-flex items-center gap-1"
                    data-testid="link-footer-etherscan"
                  >
                    Explorer <ArrowRight className="w-3 h-3" />
                  </a>
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>&copy; {new Date().getFullYear()} MetaCoreX Protocol. All rights reserved.</span>
          <span>Built on Ethereum &middot; Sepolia Testnet</span>
        </div>
      </div>
    </footer>
  );
}
