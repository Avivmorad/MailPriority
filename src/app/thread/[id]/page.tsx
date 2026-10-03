import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ActionControls } from "@/components/actions/action-controls";
import { AppChrome } from "@/components/layout/app-chrome";
import { ThreadFeedback } from "@/components/threads/thread-feedback";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LabeledField } from "@/components/ui/labeled-field";
import { ThreadTags } from "@/components/ui/thread-tags";
import { normalizeCategory } from "@/lib/ai/categories";
import { mailBucketForThread } from "@/lib/mail/buckets";
import { isUncertainClassification } from "@/lib/mail/filters";
import { mailViewPath } from "@/lib/mail/tabs";
import { displayDoLine, threadPlacementReason } from "@/lib/mail/placement";
import { requireOnboardingComplete } from "@/lib/onboarding/guard";
import { getSessionUser } from "@/lib/supabase/auth";
import { getThreadDetailForUser } from "@/lib/threads/queries";
import { displayThreadTitle, usableDisplayText } from "@/lib/ui/display-text";
import { classForDeadline, formatDate, formatDateTime } from "@/lib/ui/format";
import { labelForDirection } from "@/lib/ui/labels";

export const dynamic = "force-dynamic";

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  await requireOnboardingComplete(user.id);
  const { id } = await params;
  const thread = await getThreadDetailForUser(user.id, id);
  if (!thread) {
    notFound();
  }

  const lowConfidence = isUncertainClassification(thread.confidence);
  const inbound = [...thread.messages]
    .reverse()
    .find((message) => message.direction.toLowerCase() === "inbound");
  const senderMessage = inbound ?? thread.messages[thread.messages.length - 1];
  const sender = senderMessage?.senderName ?? senderMessage?.senderEmail ?? null;
  const backTab = mailBucketForThread({ status: thread.status, actionStatus: thread.actionStatus });
  const heading = displayThreadTitle(thread.shortDisplayTitle, thread.summary, thread.subject);
  const doText = displayDoLine({
    tab: backTab,
    actionSummary: thread.actionSummary,
    title: heading,
    category: thread.category,
    actionType: thread.actionType,
    requiresReply: thread.requiresReply,
    deadline: thread.deadline,
    deadlineText: thread.deadlineText,
    sender,
    waitingFor: thread.waitingFor,
    snoozedUntil: thread.snoozedUntil,
  });
  const whyText =
    usableDisplayText(thread.actionReason) &&
    doText &&
    thread.actionReason?.trim() === doText.trim()
      ? null
      : usableDisplayText(thread.actionReason);

  return (
    <AppChrome user={user} current="thread" width="narrow">
      <div>
        <Link
          href={`/mail?tab=${backTab}`}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex rounded-sm text-sm hover:underline focus-visible:ring-3 focus-visible:outline-none"
        >
          ← Back to Mail
        </Link>
        <h1
          className="text-foreground mt-3 text-2xl font-bold tracking-tight text-balance break-words sm:text-3xl"
          dir="auto"
        >
          {heading}
        </h1>
        {usableDisplayText(thread.subject) && usableDisplayText(thread.subject) !== heading ? (
          <p className="text-muted-foreground mt-1 text-sm break-words" dir="auto">
            {usableDisplayText(thread.subject)}
          </p>
        ) : null}
      </div>

      <ThreadTags
        category={thread.category}
        status={thread.status}
        importance={thread.importance}
        urgency={thread.urgency}
        deadline={thread.deadline}
        actionType={thread.actionType}
        includeLowImportance
        categoryHref={
          thread.category
            ? mailViewPath({
                tab: backTab,
                category: normalizeCategory(thread.category),
              })
            : undefined
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed">
          {usableDisplayText(thread.summary) ? (
            <p dir="auto">{usableDisplayText(thread.summary)}</p>
          ) : (
            <p className="text-muted-foreground">No analysis yet.</p>
          )}
          <div className="space-y-1">
            {sender ? <LabeledField label="Sender">{sender}</LabeledField> : null}
            {thread.latestMessageAt ? (
              <LabeledField label="Date">{formatDateTime(thread.latestMessageAt)}</LabeledField>
            ) : null}
            {doText ? (
              <LabeledField label="Do" dir="auto">
                {doText}
              </LabeledField>
            ) : null}
            {thread.deadline ? (
              <LabeledField label="Due" valueClassName={classForDeadline(thread.deadline)}>
                {formatDate(thread.deadline)}
                {thread.deadlineText ? ` (${thread.deadlineText})` : ""}
              </LabeledField>
            ) : null}
            <LabeledField label="Why this tab" dir="auto">
              {threadPlacementReason({
                tab: backTab,
                evidence: whyText,
                importanceReason: thread.importanceReason,
                summary: thread.summary,
                title: heading,
                category: thread.category,
                actionType: thread.actionType,
                requiresReply: thread.requiresReply,
                deadline: thread.deadline,
                deadlineText: thread.deadlineText,
                sender,
                waitingFor: thread.waitingFor,
                snoozedUntil: thread.snoozedUntil,
              })}
            </LabeledField>
            {thread.waitingFor ? (
              <LabeledField label="Pending on">{thread.waitingFor}</LabeledField>
            ) : null}
          </div>
          {lowConfidence ? (
            <p className="text-urgency-medium text-sm">
              Low classification confidence ({thread.confidence?.toFixed(2)}). Double-check before
              acting.
            </p>
          ) : null}
          <div className="space-y-3 border-t pt-3">
            <a
              href={thread.gmailUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium underline-offset-4 hover:underline"
            >
              Open in Gmail
            </a>
            {thread.actionId ? (
              <ActionControls
                key={`${thread.actionId}:${thread.actionStatus ?? ""}:${thread.waitingFor ?? ""}`}
                actionId={thread.actionId}
                status={thread.actionStatus ?? "OPEN"}
                waitingFor={thread.waitingFor}
                snoozedUntil={thread.snoozedUntil}
              />
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent messages</CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          {thread.messages.length === 0 ? (
            <p className="text-muted-foreground text-sm">No stored message metadata.</p>
          ) : (
            thread.messages.map((message) => (
              <div
                key={message.id}
                className="border-border/70 min-w-0 overflow-hidden border-b py-3 first:pt-0 last:border-0 last:pb-0"
              >
                <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
                  <p className="text-foreground min-w-0 text-sm font-semibold [overflow-wrap:anywhere] break-words">
                    {message.senderName ?? message.senderEmail ?? "Unknown"}
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      · {labelForDirection(message.direction)}
                    </span>
                  </p>
                  <p className="text-muted-foreground shrink-0 text-xs">
                    {formatDateTime(message.receivedAt)}
                  </p>
                </div>
                {message.snippet ? (
                  <p
                    className="text-muted-foreground mt-1 text-sm leading-relaxed [overflow-wrap:anywhere] break-words"
                    dir="auto"
                  >
                    {message.snippet}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <ThreadFeedback threadId={thread.id} />
    </AppChrome>
  );
}
