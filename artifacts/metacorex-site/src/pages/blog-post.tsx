import { Link, useParams } from "wouter";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getBlogPost } from "@/data/blog-posts";
import { ArrowLeft, Calendar } from "lucide-react";
import NotFound from "@/pages/not-found";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default function BlogPost() {
  const params = useParams<{ slug: string }>();
  const post = params.slug ? getBlogPost(params.slug) : undefined;

  if (!post) {
    return <NotFound />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 pt-24 pb-24">
        <article className="container mx-auto px-4 max-w-3xl" data-testid={`blog-post-${post.slug}`}>
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary transition-colors mb-8"
            data-testid="link-back-to-blog"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Blog
          </Link>

          <div className="flex flex-wrap items-center gap-2 mb-6">
            {post.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="font-medium">
                #{tag}
              </Badge>
            ))}
          </div>

          <h1 className="text-3xl md:text-5xl font-display font-extrabold tracking-tighter mb-4 text-foreground leading-tight">
            {post.title}
          </h1>

          <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-12">
            <Calendar className="w-4 h-4" />
            {formatDate(post.date)}
          </div>

          <div className="space-y-8">
            {post.sections.map((section, i) => (
              <div key={i}>
                {section.heading && (
                  <h2 className="text-xl md:text-2xl font-display font-bold text-foreground mb-3">
                    {section.heading}
                  </h2>
                )}
                {section.paragraphs.map((p, j) => (
                  <p key={j} className="text-muted-foreground leading-relaxed mb-4">
                    {p}
                  </p>
                ))}
                {section.bullets && (
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                    {section.bullets.map((b, k) => (
                      <li key={k} className="leading-relaxed">
                        {b}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          <div className="mt-16 p-8 rounded-2xl bg-card shadow-soft flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="font-display font-bold text-foreground mb-1">Ready to put an agent on-chain?</h3>
              <p className="text-sm text-muted-foreground">Register your first agent in the Operator Console.</p>
            </div>
            <Button asChild className="font-semibold shrink-0">
              <Link href="/dashboard">Launch Console</Link>
            </Button>
          </div>
        </article>
      </main>

      <Footer />
    </div>
  );
}
