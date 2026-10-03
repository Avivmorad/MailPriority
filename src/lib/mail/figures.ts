import { countActionRowsByStatus } from "@/lib/actions/queries";
import type { MailFigures } from "@/lib/mail/mail-figures";
import { getInboxCountsForUser } from "@/lib/scans/manual";

export type { MailFigures } from "@/lib/mail/mail-figures";

export async function getMailFigures(userId: string): Promise<MailFigures> {
  const [counts, workflow] = await Promise.all([
    getInboxCountsForUser(userId),
    countActionRowsByStatus(userId, ["COMPLETED", "SNOOZED"]),
  ]);
  return {
    processed: counts.processed,
    actions: counts.needAction,
    pending: counts.waiting,
    forYou: counts.fyi,
    ignored: counts.ignored,
    important: counts.important,
    closed: workflow.COMPLETED,
    snoozed: workflow.SNOOZED,
  };
}
