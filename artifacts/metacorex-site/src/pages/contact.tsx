import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Github, Linkedin, Mail, Send, Twitter, CheckCircle2 } from "lucide-react";

const contactFormSchema = z.object({
  name: z.string().min(2, "Please enter your name"),
  email: z.string().email("Please enter a valid email address"),
  message: z.string().min(10, "Message must be at least 10 characters"),
});

type ContactFormValues = z.infer<typeof contactFormSchema>;

const CONTACT_FORM_ENDPOINT = import.meta.env.VITE_CONTACT_FORM_ENDPOINT as string | undefined;

const socialLinks = [
  { label: "Twitter / X", href: "https://twitter.com/metacorex", icon: Twitter },
  { label: "Telegram", href: "https://t.me/metacorex", icon: Send },
  { label: "GitHub", href: "https://github.com/arzykul/MetaCoreX", icon: Github },
  { label: "LinkedIn", href: "https://linkedin.com/company/metacorex", icon: Linkedin },
];

export default function Contact() {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: { name: "", email: "", message: "" },
  });

  const onSubmit = async (values: ContactFormValues) => {
    if (!CONTACT_FORM_ENDPOINT) {
      toast({
        title: "Demo mode",
        description:
          "No email service is connected yet, so this message wasn't actually sent. Configure VITE_CONTACT_FORM_ENDPOINT with a Formspree or Web3Forms endpoint to go live.",
      });
      return;
    }

    try {
      const res = await fetch(CONTACT_FORM_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error("Request failed");
      setSubmitted(true);
      form.reset();
    } catch {
      toast({
        title: "Something went wrong",
        description: "Your message could not be sent. Please try again or email us directly.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 pt-24">
        <section className="container mx-auto px-4 py-16 md:py-20 text-center max-w-3xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <h1 className="text-4xl md:text-5xl font-display font-extrabold tracking-tighter mb-4 text-foreground">
              Get in <span className="text-primary">Touch</span>
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Questions about the protocol, partnership ideas, or just want to talk agents? We'd love to hear from you.
            </p>
          </motion.div>
        </section>

        <section className="pb-24">
          <div className="container mx-auto px-4 max-w-5xl grid md:grid-cols-[1fr_1.4fr] gap-8">
            <div className="p-8 rounded-2xl bg-card shadow-soft h-fit">
              <h2 className="text-lg font-display font-bold text-foreground mb-6">Contact information</h2>

              <a
                href="mailto:team@metacorex.ai"
                className="flex items-center gap-3 mb-8 group"
                data-testid="link-contact-email"
              >
                <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Email us</div>
                  <div className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                    team@metacorex.ai
                  </div>
                </div>
              </a>

              <h3 className="text-sm font-semibold text-foreground mb-4">Follow along</h3>
              <div className="flex items-center gap-3">
                {socialLinks.map((social) => (
                  <a
                    key={social.label}
                    href={social.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={social.label}
                    className="w-10 h-10 rounded-md bg-background flex items-center justify-center text-muted-foreground hover:text-primary hover:shadow-soft transition-all"
                    data-testid={`link-contact-social-${social.label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
                  >
                    <social.icon className="w-4 h-4" />
                  </a>
                ))}
              </div>
            </div>

            <div className="p-8 rounded-2xl bg-card shadow-soft">
              {submitted ? (
                <div className="flex flex-col items-center justify-center text-center py-12" data-testid="contact-success">
                  <CheckCircle2 className="w-12 h-12 text-primary mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-1">Message sent</h3>
                  <p className="text-sm text-muted-foreground mb-6">Thanks for reaching out — we'll get back to you soon.</p>
                  <Button variant="outline" onClick={() => setSubmitted(false)} data-testid="btn-contact-again">
                    Send another message
                  </Button>
                </div>
              ) : (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Your name" data-testid="input-contact-name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="you@example.com" data-testid="input-contact-email" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="message"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Message</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="How can we help?"
                              className="min-h-[140px] resize-none"
                              data-testid="input-contact-message"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {!CONTACT_FORM_ENDPOINT && (
                      <p className="text-xs text-muted-foreground">
                        This form is in demo mode — messages aren't sent yet. Connect a Formspree or Web3Forms endpoint to enable delivery.
                      </p>
                    )}

                    <Button
                      type="submit"
                      className="w-full font-semibold"
                      disabled={form.formState.isSubmitting}
                      data-testid="btn-contact-submit"
                    >
                      {form.formState.isSubmitting ? "Sending..." : "Send Message"}
                    </Button>
                  </form>
                </Form>
              )}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
