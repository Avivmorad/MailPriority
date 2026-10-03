import Link from "next/link";

import { EmptyState } from "@/components/layout/empty-state";
import { MailListCard } from "@/components/mail/mail-list-card";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DigestReport, DigestTopAction } from "@/lib/digest/types";
import { threadPlacementReason } from "@/lib/mail/placement";
import { formatDateTime } from "@/lib/ui/format";

function DigestActionRow({ action }: { action: DigestTopAction }) {
  return (
    <MailListCard
      threadId={action.threadId}
      title={action.title}
      sender={null}
      latestMessageAt={null}
      category={action.category}
      urgency={action.urgency}
      deadline={action.deadline}
      whyText={threadPlacementReason({
        tab: "open",
        title: action.title,
        category: action.category,
        deadline: action.deadline,
      })}
    />
  );
}

function DigestCounts({ digest }: { digest: DigestReport }) {
  const stats = [
    { label: "Processed", value: digest.totalMessages },
    { label: "Important", value: digest.importantCount },
    { label: "Actions", value: digest.actionCount },
    { label: "Pending", value: digest.waitingCount },
    { label: "For You", value: digest.informationalCount },
    { label: "Ignored", value: digest.ignoredCount },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {stats.map((stat) => (
        <div key={stat.label}>
          <dt className="text-muted-foreground text-xs">{stat.label}</dt>
          <dd className="text-foreground text-xl font-semibold tabular-nums">{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DigestReportCard({
  digest,
  title = "Latest summary",
  variant = "full",
}: {
  digest: DigestReport | null;
  title?: string;
  variant?: "full" | "compact";
}) {
  if (variant === "compact") {
    if (!digest) {
      return (
        <p className="text-muted-foreground text-sm">
          No history yet. After a scan, period counts and top actions will appear here.{" "}
          <Link href="/history" className="text-primary font-medium hover:underline">
            History
          </Link>
        </p>
      );
    }
    const preview = digest.topActions.slice(0, 3);
    return (
      <Card>
        <CardHeader>
          <CardTitle>Latest summary</CardTitle>
          <CardDescription>
            {formatDateTime(digest.periodStart)} – {formatDateTime(digest.periodEnd)}
            {digest.actionCount > 0
              ? ` · ${digest.actionCount} ${digest.actionCount === 1 ? "action" : "actions"}`
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {digest.summaryText ? (
            <p className="line-clamp-3 text-sm leading-relaxed text-pretty">{digest.summaryText}</p>
          ) : null}
          {preview.length > 0 ? (
            <div className="space-y-3">
              {preview.map((action) => (
                <DigestActionRow key={action.threadId} action={action} />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No actions in this summary.</p>
          )}
          <Link href="/history" className={buttonVariants({ variant: "outline", size: "sm" })}>
            View History
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (!digest) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>Period counts and top actions after a scan.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="No history yet"
            description="Run a scan to add an entry to History. Counts come from mail already stored in MailPriority."
            action={
              <Link href="/scan" className={buttonVariants({ size: "sm" })}>
                Scan now
              </Link>
            }
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {formatDateTime(digest.periodStart)} – {formatDateTime(digest.periodEnd)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {digest.summaryText ? (
          <p className="text-sm leading-relaxed">{digest.summaryText}</p>
        ) : null}
        <DigestCounts digest={digest} />
        {digest.topActions.length > 0 ? (
          <div>
            <h3 className="text-foreground mb-2 text-sm font-semibold">Top actions</h3>
            <div className="space-y-3">
              {digest.topActions.map((action) => (
                <DigestActionRow key={action.threadId} action={action} />
              ))}
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No actions in this summary.</p>
        )}
      </CardContent>
    </Card>
  );
}
