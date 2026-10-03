import type { ReactNode } from "react";

import { EmptyState } from "@/components/layout/empty-state";
import { CollapsibleTopicGroups } from "@/components/layout/collapsible-topic-groups";
import { MailListCard } from "@/components/mail/mail-list-card";
import { groupByTopic } from "@/lib/actions/topics";
import { threadPlacementReason } from "@/lib/mail/placement";
import { mailBucketForThread } from "@/lib/mail/buckets";
import type { RecentThreadRow } from "@/lib/threads/recent-thread";
import { displayThreadTitle } from "@/lib/ui/display-text";

export function InboxSummary({
  threads,
  storageKey = "inbox-summary",
  emptyTitle = "No classified mail yet",
  emptyDescription = "Run a scan to see useful updates. Receipts, OTPs, and marketing are in Ignored.",
  emptyAction,
  categoryHrefFor,
}: {
  threads: RecentThreadRow[];
  storageKey?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  categoryHrefFor?: (thread: RecentThreadRow) => string;
}) {
  if (threads.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }
  const groups = groupByTopic(threads);
  return (
    <CollapsibleTopicGroups
      storageKey={storageKey}
      variant="panel"
      groups={groups.map((group) => ({
        topic: group.topic,
        count: group.items.length,
        body: (
          <div className="space-y-3 p-3">
            {group.items.map((thread) => {
              const tab = mailBucketForThread({ status: thread.status });
              const title = displayThreadTitle(
                thread.shortDisplayTitle,
                thread.summary,
                thread.subject,
              );
              return (
                <MailListCard
                  key={thread.id}
                  threadId={thread.id}
                  title={title}
                  sender={thread.sender}
                  latestMessageAt={thread.latestMessageAt}
                  gmailUrl={thread.gmailUrl}
                  category={thread.category}
                  importance={thread.importance}
                  urgency={thread.urgency}
                  deadline={thread.deadline}
                  categoryHref={categoryHrefFor?.(thread)}
                  whyText={threadPlacementReason({
                    tab,
                    importanceReason: thread.importanceReason,
                    summary: thread.summary,
                    title,
                    category: thread.category,
                    sender: thread.sender,
                  })}
                />
              );
            })}
          </div>
        ),
      }))}
    />
  );
}
