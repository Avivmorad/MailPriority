import { MailCardTitle } from "@/components/mail/mail-card-chrome";
import { MailMoveMenu } from "@/components/mail/mail-move-menu";
import { LabeledField } from "@/components/ui/labeled-field";
import { ThreadTags } from "@/components/ui/thread-tags";
import { mailGmailHref } from "@/lib/gmail/deep-link";
import { displayUrgencyForDeadline, formatRelativeTime } from "@/lib/ui/format";
import { accentForUrgency } from "@/lib/ui/labels";
import { cn } from "@/lib/utils";

export function MailListCard({
  threadId,
  title,
  sender,
  latestMessageAt,
  gmailUrl,
  category,
  importance,
  urgency,
  deadline,
  actionType,
  categoryHref,
  doText,
  whyText,
  uncertain = false,
  actionId,
  actionStatus,
  waitingFor,
  snoozedUntil,
}: {
  threadId: string;
  title: string;
  sender: string | null;
  latestMessageAt: string | null;
  gmailUrl?: string | null;
  category?: string | null;
  importance?: string | null;
  urgency?: string | null;
  deadline?: string | null;
  actionType?: string | null;
  categoryHref?: string;
  doText?: string | null;
  whyText: string;
  uncertain?: boolean;
  actionId?: string | null;
  actionStatus?: string | null;
  waitingFor?: string | null;
  snoozedUntil?: string | null;
}) {
  const urgencyLabel = displayUrgencyForDeadline(deadline, urgency);
  const when = latestMessageAt ? formatRelativeTime(latestMessageAt) : null;
  const showHeader = Boolean(sender) || Boolean(when && when !== "—");

  return (
    <article
      className={cn(
        "bg-card ring-foreground/10 min-w-0 overflow-hidden rounded-xl border-l-4 p-4 shadow-xs ring-1 sm:p-5",
        accentForUrgency(urgencyLabel ?? urgency),
      )}
    >
      {showHeader ? (
        <div className="flex min-w-0 items-baseline justify-between gap-3">
          {sender ? (
            <strong
              className="text-foreground min-w-0 font-bold [overflow-wrap:anywhere] break-words"
              dir="auto"
            >
              {sender}
            </strong>
          ) : (
            <span />
          )}
          {when && when !== "—" ? (
            <span className="text-muted-foreground shrink-0 text-sm tabular-nums">{when}</span>
          ) : null}
        </div>
      ) : null}
      <MailCardTitle title={title} className={showHeader ? "mt-1.5" : undefined} />
      <div className="mt-2">
        <ThreadTags
          category={category}
          importance={importance}
          urgency={urgency}
          deadline={deadline}
          actionType={actionType}
          showStatus={false}
          categoryHref={categoryHref}
        />
        {uncertain ? (
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">Uncertain</p>
        ) : null}
      </div>
      <div className="mt-3 min-w-0 space-y-1 overflow-hidden">
        {doText ? (
          <LabeledField label="Do" dir="auto">
            {doText}
          </LabeledField>
        ) : null}
        <LabeledField label="Why this tab" dir="auto">
          {whyText}
        </LabeledField>
      </div>
      <MailMoveMenu
        openHref={`/thread/${threadId}`}
        gmailHref={mailGmailHref(gmailUrl)}
        threadId={threadId}
        actionId={actionId}
        actionStatus={actionStatus}
        waitingFor={waitingFor}
        snoozedUntil={snoozedUntil}
      />
    </article>
  );
}
