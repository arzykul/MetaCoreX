import { motion } from "framer-motion";
import { Link } from "wouter";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Badge } from "@/components/ui/badge";
import { blogPosts } from "@/data/blog-posts";
import { ArrowRight, Calendar, Tag } from "lucide-react";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default function Blog() {
  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 pt-24">
        <section className="container mx-auto px-4 py-16 md:py-20 text-center max-w-3xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <h1 className="text-4xl md:text-5xl font-display font-extrabold tracking-tighter mb-4 text-foreground">
              The MetaCoreX <span className="text-primary">Blog</span>
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Protocol updates, tutorials, and deep dives into the future of autonomous AI agents on-chain.
            </p>
          </motion.div>
        </section>

        <section className="pb-24">
          <div className="container mx-auto px-4 max-w-5xl">
            <div className="grid md:grid-cols-2 gap-8">
              {blogPosts.map((post, i) => (
                <motion.article
                  key={post.slug}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: (i % 2) * 0.1 }}
                  className="flex flex-col p-8 rounded-2xl bg-card shadow-soft hover:-translate-y-1 hover:shadow-soft-lg transition-all"
                  data-testid={`blog-card-${post.slug}`}
                >
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    {post.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="font-medium inline-flex items-center gap-1">
                        <Tag className="w-3 h-3" />
                        {tag}
                      </Badge>
                    ))}
                  </div>

                  <h2 className="text-xl font-display font-bold text-foreground mb-3 leading-snug">
                    {post.title}
                  </h2>

                  <p className="text-muted-foreground leading-relaxed mb-6 flex-1">{post.excerpt}</p>

                  <div className="flex items-center justify-between pt-4 border-t border-border/60">
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="w-3.5 h-3.5" />
                      {formatDate(post.date)}
                    </span>
                    <Link
                      href={`/blog/${post.slug}`}
                      className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:gap-2 transition-all"
                      data-testid={`link-read-more-${post.slug}`}
                    >
                      Read more <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </motion.article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
