import { ArrowRight, Clock3, Inbox, ListChecks, ShieldCheck, Sparkles, Tag } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { SkipToContent } from "@/components/layout/skip-to-content";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const questions = [
  {
    icon: ListChecks,
    title: "Actions",
    body: "Needs a next step from you — reply, review, pay — ranked by urgency and deadline.",
  },
  {
    icon: Clock3,
    title: "Pending",
    body: "You already acted. The next move is on someone else.",
  },
  {
    icon: Inbox,
    title: "For You",
    body: "Useful updates, not receipts, OTPs, or marketing.",
  },
];

const features = [
  {
    icon: Sparkles,
    title: "Thread-aware AI triage",
    body: "Classifies the current state of a whole thread — importance, action, reply, pending, urgency — not just the latest message.",
  },
  {
    icon: ListChecks,
    title: "One action per thread",
    body: "Six emails about one task become a single action item that moves Actions → Pending → Closed as the conversation evolves.",
  },
  {
    icon: Tag,
    title: "Gmail labels, in sync",
    body: "Applies managed Gmail labels under the MailPriority/ prefix so your triage is visible everywhere — without touching your own labels.",
  },
  {
    icon: Clock3,
    title: "Scheduled & incremental scans",
    body: "An initial lookback scan, then incremental syncs via the Gmail History API so only changed threads are reanalyzed.",
  },
  {
    icon: ShieldCheck,
    title: "Privacy-first by default",
    body: "Raw email bodies aren't persisted, refresh tokens are encrypted at rest, and bodies and tokens never hit the logs.",
  },
  {
    icon: Inbox,
    title: "Idempotent by design",
    body: "Re-scanning the same mail never creates duplicate messages, actions, History entries, or labels.",
  },
];

const heroPreview = [
  {
    tab: "Actions",
    accent: "border-l-urgency-medium",
    title: "University registration",
    meta: "Registrar · Due 12 Sep",
    body: "Do: Choose courses and submit registration before the deadline.",
  },
  {
    tab: "Pending",
    accent: "border-l-urgency-unknown",
    title: "Question sent to the hotel",
    meta: "Booking.com · Pending on the hotel",
    body: "They confirmed your smart-TV question was forwarded. Nothing for you until they reply.",
  },
  {
    tab: "For You",
    accent: "border-l-urgency-none",
    title: "Weekly product changelog",
    meta: "Linear · For You",
    body: "Shipped: placement reasons, undo, and a change-focused dashboard.",
  },
] as const;

const walkthroughSteps = [
  {
    step: "1",
    tab: "Actions",
    accent: "border-l-urgency-medium",
    title: "It starts as an Action",
    body: "University registration lands in Actions with a deadline and a clear next step.",
  },
  {
    step: "2",
    tab: "Pending",
    accent: "border-l-urgency-unknown",
    title: "After you act, it moves",
    body: "Once you submit or reply, the same thread shifts to Pending — waiting on someone else.",
  },
  {
    step: "3",
    tab: "For You",
    accent: "border-l-urgency-none",
    title: "Useful mail stays separate",
    body: "Changelogs and FYIs land in For You. They never compete with work that still needs you.",
  },
] as const;

export default function Home() {
  return (
    <div className="flex min-h-full flex-col overflow-x-hidden">
      <SkipToContent />
      <header className="border-border/60 bg-background/90 sticky top-0 z-40 border-b backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <Link
            href="/"
            aria-label="MailPriority home"
            className="focus-visible:ring-ring min-w-0 shrink rounded-lg focus-visible:ring-3 focus-visible:outline-none"
          >
            <Logo />
          </Link>
          <nav aria-label="Landing" className="flex shrink-0 items-center gap-1 sm:gap-2">
            <a
              href="#preview"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "hidden sm:inline-flex",
              )}
            >
              Example
            </a>
            <a
              href="#features"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "hidden sm:inline-flex",
              )}
            >
              Features
            </a>
            <ThemeToggle className="size-10 sm:size-8" />
            <a
              href="/login"
              className={cn(buttonVariants({ size: "sm" }), "min-h-10 px-3 sm:min-h-8")}
            >
              Sign in
            </a>
          </nav>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="flex-1 overflow-x-hidden">
        <section className="border-border/60 relative overflow-hidden border-b bg-[radial-gradient(circle_at_80%_15%,var(--accent),transparent_42%)]">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[.9fr_1.1fr] lg:gap-12 lg:py-24">
            <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-500">
              <Badge variant="secondary" className="mb-5 sm:mb-6">
                A clearer way to handle Gmail
              </Badge>
              <h1 className="text-foreground max-w-xl text-4xl leading-[1.08] font-semibold tracking-[-.04em] text-balance sm:text-5xl sm:tracking-[-.05em] lg:text-6xl">
                Your inbox, <span className="text-primary">under control.</span>
              </h1>
              <p className="text-muted-foreground mt-5 max-w-lg text-base leading-relaxed text-pretty sm:mt-6 sm:text-lg">
                MailPriority turns busy email threads into a short list of Actions, Pending, and For
                You.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:flex-wrap">
                <a href="/login" className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}>
                  Get started with Gmail <ArrowRight className="size-4" />
                </a>
                <a
                  href="#preview"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    "w-full sm:w-auto",
                  )}
                >
                  See an example
                </a>
              </div>
              <p className="text-muted-foreground mt-5 text-xs">
                No automatic sending or deleting emails.
              </p>
            </div>
            <div className="border-border bg-card motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 overflow-hidden rounded-2xl border shadow-sm motion-safe:duration-700">
              <div className="border-border flex items-center justify-between border-b px-5 py-4">
                <span className="text-sm font-semibold">Your daily overview</span>
                <span className="text-muted-foreground text-xs">Example inbox</span>
              </div>
              <div className="border-border bg-muted/40 grid grid-cols-3 border-b">
                {[
                  ["02", "Actions"],
                  ["01", "Pending"],
                  ["01", "For You"],
                ].map(([count, label]) => (
                  <div key={label} className="border-border border-r px-4 py-4 last:border-0">
                    <p className="text-2xl font-semibold tabular-nums">{count}</p>
                    <p className="text-muted-foreground text-xs">{label}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-3 p-4" aria-hidden="true">
                {heroPreview.map((item) => (
                  <div
                    key={item.tab}
                    className={`border-border rounded-xl border border-l-4 ${item.accent} bg-background p-4`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-muted-foreground text-xs">{item.tab}</span>
                      <span className="text-muted-foreground shrink-0 text-xs">{item.meta}</span>
                    </div>
                    <p className="mt-2 text-center text-sm font-semibold" dir="auto">
                      {item.title}
                    </p>
                    <p className="text-muted-foreground mt-2 text-start text-sm">{item.body}</p>
                    <span
                      className={cn(
                        buttonVariants({ size: "sm" }),
                        "mt-3 min-h-10 w-full px-4 sm:w-auto",
                      )}
                    >
                      Open
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="preview" className="border-border/60 bg-muted/30 border-y">
          <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
            <div className="mb-8 max-w-2xl">
              <h2 className="text-foreground text-2xl font-bold tracking-tight">
                One thread, from Action to Pending
              </h2>
              <p className="text-muted-foreground mt-2 text-pretty">
                After a scan, MailPriority does not dump dozens of emails into one list. A task
                moves as the conversation does.
              </p>
            </div>
            <ol className="grid gap-4 lg:grid-cols-3">
              {walkthroughSteps.map((step) => (
                <li
                  key={step.step}
                  className={`border-border bg-card rounded-xl border border-l-4 ${step.accent} p-5 shadow-xs`}
                >
                  <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    Step {step.step} · {step.tab}
                  </p>
                  <p className="text-foreground mt-2 text-base font-semibold tracking-tight">
                    {step.title}
                  </p>
                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {questions.map(({ icon: Icon, title, body }) => (
              <Card key={title}>
                <CardHeader>
                  <div className="bg-accent text-primary mb-2 flex size-10 items-center justify-center rounded-lg">
                    <Icon className="size-5" aria-hidden />
                  </div>
                  <CardTitle>{title}</CardTitle>
                  <CardDescription>{body}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <section id="features" className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
          <div className="mb-8 text-center">
            <h2 className="text-foreground text-2xl font-bold tracking-tight">What it does</h2>
            <p className="text-muted-foreground mt-2">
              How MailPriority turns Gmail into a short daily list.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, body }) => (
              <Card key={title}>
                <CardHeader>
                  <div className="bg-accent text-primary mb-2 flex size-10 items-center justify-center rounded-lg">
                    <Icon className="size-5" aria-hidden />
                  </div>
                  <CardTitle className="text-base">{title}</CardTitle>
                  <CardDescription>{body}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-border/60 border-t">
        <div className="text-muted-foreground mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-6 py-6 text-sm sm:flex-row">
          <Logo showWordmark={false} />
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link
              href="/privacy"
              className="hover:text-foreground underline-offset-4 hover:underline"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="hover:text-foreground underline-offset-4 hover:underline"
            >
              Terms
            </Link>
            <span>MailPriority. Not affiliated with Google.</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
