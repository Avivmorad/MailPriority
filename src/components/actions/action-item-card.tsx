import { MailListCard } from "@/components/mail/mail-list-card";
import type { ActionListItem } from "@/lib/actions/action-list-item";
import { mailBucketForThread } from "@/lib/mail/buckets";
import { isUncertainClassification } from "@/lib/mail/filters";
import { displayDoLine, threadPlacementReason } from "@/lib/mail/placement";

export function ActionItemCard({
  item,
  categoryHref,
}: {
  item: ActionListItem;
  categoryHref?: string;
}) {
  const tab = mailBucketForThread({
    status: item.status === "WAITING" ? "waiting" : "action_required",
    actionStatus: item.status,
  });
  const doText = displayDoLine({
    tab,
    actionSummary: item.actionSummary,
    title: item.title,
    category: item.category,
    actionType: item.actionType,
    deadline: item.deadline,
    sender: item.sender,
    waitingFor: item.waitingFor,
    snoozedUntil: item.snoozedUntil,
  });
  const whyText =
    item.actionReason &&
    ((doText && item.actionReason.trim() === doText.trim()) ||
      item.actionReason.trim() === item.title.trim())
      ? null
      : item.actionReason;
  const placement = threadPlacementReason({
    tab,
    evidence: whyText,
    importanceReason: item.importanceReason,
    summary: item.summary,
    title: item.title,
    category: item.category,
    actionType: item.actionType,
    deadline: item.deadline,
    sender: item.sender,
    waitingFor: item.waitingFor,
    snoozedUntil: item.snoozedUntil,
  });

  return (
    <MailListCard
      threadId={item.threadId}
      title={item.title}
      sender={item.sender}
      latestMessageAt={item.latestMessageAt}
      gmailUrl={item.gmailUrl}
      category={item.category}
      importance={item.importance}
      urgency={item.urgency}
      deadline={item.deadline}
      actionType={item.actionType}
      categoryHref={categoryHref}
      doText={doText}
      whyText={placement}
      uncertain={isUncertainClassification(item.confidence)}
      actionId={item.id}
      actionStatus={item.status}
      waitingFor={item.waitingFor}
      snoozedUntil={item.snoozedUntil}
    />
  );
}
