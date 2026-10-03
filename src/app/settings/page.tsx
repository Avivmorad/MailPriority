import { redirect } from "next/navigation";

import { GmailConnectionCard } from "@/components/gmail/gmail-connection-card";
import { AppChrome } from "@/components/layout/app-chrome";
import { PageHeader } from "@/components/layout/page-header";
import { ScanHistoryList } from "@/components/scans/scan-history-list";
import { PrivacyControls } from "@/components/settings/privacy-controls";
import { ScanPreferencesForm } from "@/components/settings/scan-preferences-form";
import { TriagePreferencesForm } from "@/components/settings/triage-preferences-form";
import { getGmailStatusForUser } from "@/lib/gmail/connections";
import { getScanRunsForUser } from "@/lib/scans/manual";
import { getScanPreferences } from "@/lib/settings/preferences";
import { SETTINGS_PAGE_DESCRIPTION } from "@/lib/settings/schedule-copy";
import { getSessionUser } from "@/lib/supabase/auth";
import { requireOnboardingComplete } from "@/lib/onboarding/guard";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ gmail?: string; reason?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  await requireOnboardingComplete(user.id);

  const params = await searchParams;
  const [gmailStatus, preferences, scans] = await Promise.all([
    getGmailStatusForUser(user.id),
    getScanPreferences(user.id),
    getScanRunsForUser(user.id, 10),
  ]);

  return (
    <AppChrome user={user} current="settings" width="narrow">
      <PageHeader title="Settings" description={SETTINGS_PAGE_DESCRIPTION} />
      <GmailConnectionCard
        status={gmailStatus}
        gmailFlash={params.gmail}
        reason={params.reason}
        withSettingInfo
      />
      <ScanPreferencesForm
        dailyScanTime={preferences.dailyScanTime}
        timezone={preferences.timezone}
      />
      <TriagePreferencesForm
        vipSenders={preferences.vipSenders}
        ignoredSenders={preferences.ignoredSenders}
        ignoredDomains={preferences.ignoredDomains}
        customAiInstructions={preferences.customAiInstructions}
        digestEnabled={preferences.digestEnabled}
      />
      <PrivacyControls />
      <ScanHistoryList
        scans={scans.map((scan) => ({
          id: String(scan.id),
          status: String(scan.status),
          trigger_type: String(scan.trigger_type),
          started_at: (scan.started_at as string | null) ?? null,
          finished_at: (scan.finished_at as string | null) ?? null,
          messages_processed: Number(scan.messages_processed ?? 0),
          threads_analyzed: Number(scan.threads_analyzed ?? 0),
        }))}
      />
    </AppChrome>
  );
}
