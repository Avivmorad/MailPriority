import { redirect } from "next/navigation";

import { AppChrome } from "@/components/layout/app-chrome";
import { MailWorkspace, type MailWorkspaceData } from "@/components/mail/mail-workspace";
import { listActionsForUser } from "@/lib/actions/queries";
import { getGmailStatusForUser } from "@/lib/gmail/connections";
import { gmailRecoveryActionLabel, shouldShowGmailRecoveryCard } from "@/lib/gmail/recovery";
import {
  parseCategoryFilter,
  parsePriorityFilter,
  parseSignalFilter,
  parseUncertainFilter,
} from "@/lib/mail/filters";
import { getMailFigures } from "@/lib/mail/figures";
import { parseMailTab } from "@/lib/mail/tabs";
import { requireOnboardingComplete } from "@/lib/onboarding/guard";
import { getSessionUser } from "@/lib/supabase/auth";
import { listIgnoredThreadsForUser, listRecentThreadsForUser } from "@/lib/threads/queries";

export const dynamic = "force-dynamic";

const LIST_LIMIT = 50;

export default async function MailPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    uncertain?: string;
    category?: string;
    priority?: string;
    signal?: string;
  }>;
}) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  await requireOnboardingComplete(user.id);
  const params = await searchParams;
  const tab = parseMailTab(params.tab);
  const uncertainOnly = parseUncertainFilter(params.uncertain);
  const category = parseCategoryFilter(params.category);
  const priority = parsePriorityFilter(params.priority);
  const signal = parseSignalFilter(params.signal);
  const failed: MailWorkspaceData["failed"] = {};

  const [open, waiting, completed, snoozed, summary, ignored, gmailStatus, figures] =
    await Promise.all([
      listActionsForUser(user.id, "OPEN", LIST_LIMIT).catch(() => {
        failed.open = true;
        return [];
      }),
      listActionsForUser(user.id, "WAITING", LIST_LIMIT).catch(() => {
        failed.waiting = true;
        return [];
      }),
      listActionsForUser(user.id, "COMPLETED", LIST_LIMIT).catch(() => {
        failed.completed = true;
        return [];
      }),
      listActionsForUser(user.id, "SNOOZED", LIST_LIMIT).catch(() => {
        failed.snoozed = true;
        return [];
      }),
      listRecentThreadsForUser(user.id, LIST_LIMIT).catch(() => {
        failed.summary = true;
        return [];
      }),
      listIgnoredThreadsForUser(user.id, LIST_LIMIT).catch(() => {
        failed.ignored = true;
        return [];
      }),
      getGmailStatusForUser(user.id),
      getMailFigures(user.id).catch(() => null),
    ]);

  const data: MailWorkspaceData = {
    open,
    waiting,
    completed,
    snoozed,
    summary,
    ignored,
    failed,
    figures,
    needsGmailRecovery: shouldShowGmailRecoveryCard(gmailStatus),
    recoveryLabel: gmailRecoveryActionLabel(gmailStatus),
  };

  return (
    <AppChrome user={user} current="mail">
      <MailWorkspace
        data={data}
        initialTab={tab}
        initialCategory={category}
        initialPriority={priority}
        initialSignal={signal}
        initialUncertain={uncertainOnly}
      />
    </AppChrome>
  );
}
