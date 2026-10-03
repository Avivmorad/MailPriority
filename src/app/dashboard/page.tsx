import Link from "next/link";
import { redirect } from "next/navigation";

import { ActionItemCard } from "@/components/actions/action-item-card";
import { InboxOverviewHeader } from "@/components/dashboard/inbox-overview-header";
import { InboxStatCard } from "@/components/dashboard/inbox-stat-card";
import { DigestReportCard } from "@/components/digest/digest-report-card";
import { GmailConnectionCard } from "@/components/gmail/gmail-connection-card";
import { AppChrome } from "@/components/layout/app-chrome";
import { CollapsibleBlock } from "@/components/layout/collapsible-block";
import { EmptyState } from "@/components/layout/empty-state";
import { buttonVariants } from "@/components/ui/button";
import {
  countActionsForUser,
  listActionsForUser,
  type ActionListItem,
} from "@/lib/actions/queries";
import { getDashboardChangesForUser } from "@/lib/dashboard/queries";
import { getLatestDigestForUser } from "@/lib/digest/queries";
import { getGmailStatusForUser } from "@/lib/gmail/connections";
import { shouldShowGmailRecoveryCard } from "@/lib/gmail/recovery";
import { getMailFigures, type MailFigures } from "@/lib/mail/figures";
import { getLatestScanRunForUser } from "@/lib/scans/manual";
import { formatDateTime } from "@/lib/ui/format";
import { labelForScanStatus } from "@/lib/ui/labels";
import { getSessionUser } from "@/lib/supabase/auth";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ATTENTION_PREVIEW = 3;

function dashboardDescription({
  connected,
  scanDone,
  latestStatus,
}: {
  connected: boolean;
  scanDone: boolean;
  latestStatus: string | null;
}): string {
  if (!connected) {
    return "Connect Gmail to start triaging your inbox.";
  }
  if (scanDone) {
    return "Scan finished. New and overdue work is first — For You and Pending stay in Mail.";
  }
  if (latestStatus === "PARTIAL") {
    return "Last scan finished with some threads still pending. New and overdue work is listed first.";
  }
  if (latestStatus === "RUNNING") {
    return "A scan is running. You can keep working while it classifies mail.";
  }
  return "Actions, Pending, and For You.";
}

function nextStep({
  connected,
  openCount,
  processed,
  scanRunning,
}: {
  connected: boolean;
  openCount: number;
  processed: number;
  scanRunning: boolean;
}): { title: string; body: string; href: string; label: string } | null {
  if (!connected || scanRunning) {
    return null;
  }
  if (processed === 0) {
    return {
      title: "Run your first scan",
      body: "Choose a lookback window and classify recent mail. Actions will land here.",
      href: "/scan",
      label: "Scan now",
    };
  }
  if (openCount > 0) {
    return {
      title: `${openCount} action${openCount === 1 ? "" : "s"}`,
      body: "Work through Actions, or open the full list in Mail.",
      href: "/mail?tab=open",
      label: "Work through them",
    };
  }
  return {
    title: "Inbox is clear",
    body: "No actions. Check For You for useful updates, or Pending if you already acted.",
    href: "/mail?tab=summary",
    label: "View For You",
  };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ gmail?: string; reason?: string; scan?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const [params, gmailStatus] = await Promise.all([searchParams, getGmailStatusForUser(user.id)]);
  const connected = gmailStatus.connection?.status === "CONNECTED";
  const showGmailCard = Boolean(params.gmail) || shouldShowGmailRecoveryCard(gmailStatus);
  const emptyFigures: MailFigures = {
    processed: 0,
    actions: 0,
    pending: 0,
    forYou: 0,
    ignored: 0,
    important: 0,
    closed: 0,
    snoozed: 0,
  };
  let actionsLoadError = false;
  let countsLoadError = false;

  const [figures, openActions, openActionCount, latestScan] = connected
    ? await Promise.all([
        getMailFigures(user.id).catch(() => {
          countsLoadError = true;
          return emptyFigures;
        }),
        listActionsForUser(user.id, "OPEN", ATTENTION_PREVIEW).catch(() => {
          actionsLoadError = true;
          return [] as ActionListItem[];
        }),
        countActionsForUser(user.id, "OPEN").catch(() => null),
        getLatestScanRunForUser(user.id),
      ])
    : [emptyFigures, [] as ActionListItem[], 0, null];
  const latestScanStatus = latestScan ? String(latestScan.status) : "";
  const latestStartedAt = typeof latestScan?.started_at === "string" ? latestScan.started_at : null;
  const since =
    (latestScanStatus === "SUCCESS" || latestScanStatus === "PARTIAL") && latestStartedAt
      ? latestStartedAt
      : (gmailStatus.connection?.lastSuccessfulScanAt ?? null);

  const [latestDigest, dashboardChanges] = connected
    ? await Promise.all([
        getLatestDigestForUser(user.id).catch(() => null),
        getDashboardChangesForUser(user.id, since).catch(() => ({
          summary: {
            since: null,
            newOpen: 0,
            completed: 0,
            reopened: 0,
            staleWaiting: 0,
            overdueOpen: 0,
          },
          line: null,
        })),
      ])
    : [
        null,
        {
          summary: {
            since: null,
            newOpen: 0,
            completed: 0,
            reopened: 0,
            staleWaiting: 0,
            overdueOpen: 0,
          },
          line: null,
        },
      ];
  const latestStatus = latestScan ? String(latestScan.status) : null;
  const openCount = openActionCount ?? figures.actions;
  const attentionItems = openActions;
  const changeLine = dashboardChanges.line;
  const overdueOpen = dashboardChanges.summary.overdueOpen;

  const step = countsLoadError
    ? null
    : nextStep({
        connected,
        openCount,
        processed: figures.processed,
        scanRunning: latestStatus === "RUNNING",
      });
  const showCount = connected && !countsLoadError;
  const countText = (value: number) => (showCount ? String(value) : "—");
  const inboxStats: Array<{ label: string; value: string; href?: string }> = [
    { label: "Actions", value: countText(figures.actions), href: "/mail?tab=open" },
    { label: "Pending", value: countText(figures.pending), href: "/mail?tab=waiting" },
    { label: "For You", value: countText(figures.forYou), href: "/mail?tab=summary" },
    { label: "Ignored", value: countText(figures.ignored), href: "/mail?tab=ignored" },
    { label: "Closed", value: countText(figures.closed), href: "/mail?tab=completed" },
    { label: "Snoozed", value: countText(figures.snoozed), href: "/mail?tab=snoozed" },
    { label: "Important", value: countText(figures.important) },
  ];
  const scanRunning = latestStatus === "RUNNING";
  const lastScanFinishedAt =
    latestScan && !scanRunning
      ? ((latestScan.finished_at as string | null | undefined) ?? null)
      : null;

  return (
    <AppChrome user={user} current="dashboard">
      <InboxOverviewHeader
        description={dashboardDescription({
          connected,
          scanDone: params.scan === "done",
          latestStatus,
        })}
      />

      {showGmailCard ? (
        <GmailConnectionCard
          status={gmailStatus}
          gmailFlash={params.gmail}
          reason={params.reason}
          returnTo="/dashboard"
        />
      ) : null}

      <div className="bg-card ring-foreground/10 flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-4 shadow-xs ring-1">
        <div className="min-w-0">
          <p className="font-medium tracking-tight">
            {scanRunning ? "Live progress" : "Last scan"}
          </p>
          {scanRunning ? (
            <p className="text-muted-foreground mt-0.5 text-sm break-words">
              A scan is running. Progress lives on the Scan tab.
            </p>
          ) : latestScan ? (
            <p className="text-muted-foreground mt-0.5 text-sm break-normal">
              {labelForScanStatus(latestStatus)}
              {lastScanFinishedAt ? ` · ${formatDateTime(lastScanFinishedAt)}` : ""}
              {` · ${Number(latestScan.messages_processed ?? 0)} emails`}
            </p>
          ) : (
            <p className="text-muted-foreground mt-0.5 text-sm">
              No scan yet. Progress and lookback controls live on the Scan tab.
            </p>
          )}
          {changeLine ? (
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed break-words">
              {changeLine}
            </p>
          ) : null}
        </div>
        <Link href="/scan" className={cn(buttonVariants(), "min-h-10 shrink-0 px-4")}>
          {scanRunning || latestScan ? "Open scan" : "Scan now"}
        </Link>
      </div>

      {step ? (
        <div className="bg-card ring-foreground/10 flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3.5 shadow-xs ring-1">
          <div className="min-w-0">
            <p className="font-medium tracking-tight break-words">{step.title}</p>
            <p className="text-muted-foreground mt-0.5 text-sm leading-relaxed break-words">
              {step.body}
            </p>
            {changeLine ? (
              <p className="text-muted-foreground mt-1 text-sm leading-relaxed break-words">
                {changeLine}
              </p>
            ) : null}
          </div>
          <Link href={step.href} className={cn(buttonVariants(), "min-h-10 shrink-0 px-4")}>
            {step.label}
          </Link>
        </div>
      ) : null}

      <section className="min-w-0 space-y-3">
        <h2 className="text-foreground text-lg font-semibold tracking-tight">Inbox now</h2>
        <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          {inboxStats.map((stat) => (
            <InboxStatCard
              key={stat.label}
              label={stat.label}
              value={stat.value}
              href={stat.href}
            />
          ))}
        </div>
      </section>

      <CollapsibleBlock
        storageKey="dashboard-actions"
        title="Actions"
        description={
          overdueOpen > 0
            ? "Overdue and urgent first. Full list lives in Mail."
            : "Top actions. Full list lives in Mail."
        }
        action={
          openCount > 0 ? (
            <Link
              href="/mail?tab=open"
              className="text-primary text-sm font-medium hover:underline"
            >
              View all in Mail
            </Link>
          ) : undefined
        }
      >
        {actionsLoadError ? (
          <EmptyState
            variant="error"
            title="Could not load actions"
            description="We had trouble reaching the database. Reload to try again. Your mailbox data is safe."
            action={
              <Link
                href="/dashboard"
                className={buttonVariants({ size: "sm", variant: "outline" })}
              >
                Reload
              </Link>
            }
          />
        ) : attentionItems.length > 0 ? (
          <div className="space-y-3">
            {attentionItems.map((item) => (
              <ActionItemCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No actions right now."
            description={
              connected
                ? "When a thread still needs a next step, it will show up here."
                : "Connect Gmail to start organizing your inbox."
            }
            action={
              connected ? (
                <Link href="/scan" className={buttonVariants({ size: "sm" })}>
                  Scan now
                </Link>
              ) : (
                <a
                  href="/api/gmail/connect?returnTo=/dashboard"
                  className={buttonVariants({ size: "sm" })}
                >
                  Connect Gmail
                </a>
              )
            }
          />
        )}
      </CollapsibleBlock>

      <DigestReportCard digest={latestDigest} variant="compact" />

      {connected && gmailStatus.connection?.gmailEmail ? (
        <p className="text-muted-foreground text-sm">
          Gmail connected as{" "}
          <span className="text-foreground font-medium">{gmailStatus.connection.gmailEmail}</span>
          {" · "}
          <Link href="/settings" className="text-primary font-medium hover:underline">
            Manage in Settings
          </Link>
        </p>
      ) : null}
    </AppChrome>
  );
}
