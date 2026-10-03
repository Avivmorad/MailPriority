import { redirect } from "next/navigation";

import { GmailConnectionCard } from "@/components/gmail/gmail-connection-card";
import { AppChrome } from "@/components/layout/app-chrome";
import { PageHeader } from "@/components/layout/page-header";
import { InitialScanCard } from "@/components/scans/initial-scan-card";
import { ScanPreferencesForm } from "@/components/settings/scan-preferences-form";
import { TriagePreferencesForm } from "@/components/settings/triage-preferences-form";
import { getGmailStatusForUser } from "@/lib/gmail/connections";
import { getOnboardingStepForUser } from "@/lib/onboarding/load";
import { getLatestScanRunForUser } from "@/lib/scans/manual";
import { getScanPreferences } from "@/lib/settings/preferences";
import { ONBOARDING_CONFIGURE_DESCRIPTION } from "@/lib/settings/schedule-copy";
import { getSessionUser } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

function dashboardWithFlash(gmail?: string, reason?: string): string {
  const params = new URLSearchParams();
  if (gmail) {
    params.set("gmail", gmail);
  }
  if (reason) {
    params.set("reason", reason);
  }
  const query = params.toString();
  return query ? `/dashboard?${query}` : "/dashboard";
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ gmail?: string; reason?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login?redirectedFrom=/onboarding");
  }

  const params = await searchParams;
  const step = await getOnboardingStepForUser(user.id);
  if (step === "complete") {
    redirect(dashboardWithFlash(params.gmail, params.reason));
  }

  const [gmailStatus, preferences, latestScan] = await Promise.all([
    getGmailStatusForUser(user.id),
    getScanPreferences(user.id),
    getLatestScanRunForUser(user.id),
  ]);

  const connected = gmailStatus.connection?.status === "CONNECTED";
  const latestStatus = latestScan ? String(latestScan.status) : null;

  return (
    <AppChrome user={user} current="onboarding" width="narrow">
      <PageHeader
        title="Set up MailPriority"
        description={
          step === "connect_gmail"
            ? "Connect Gmail first. MailPriority never sends, deletes, or archives mail for you."
            : ONBOARDING_CONFIGURE_DESCRIPTION
        }
      />
      <ol className="text-muted-foreground flex flex-wrap gap-3 text-sm">
        <li
          aria-current={step === "connect_gmail" ? "step" : undefined}
          className={step === "connect_gmail" ? "text-foreground font-medium" : undefined}
        >
          1. Connect Gmail
        </li>
        <li
          aria-current={step === "configure_and_scan" ? "step" : undefined}
          className={step === "configure_and_scan" ? "text-foreground font-medium" : undefined}
        >
          2. Schedule and first scan
        </li>
      </ol>
      <GmailConnectionCard
        status={gmailStatus}
        gmailFlash={params.gmail}
        reason={params.reason}
        returnTo="/onboarding"
      />
      {step === "configure_and_scan" ? (
        <>
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
          <InitialScanCard
            connected={connected}
            incremental={false}
            completeHref="/dashboard?scan=done"
            latestScan={
              latestScan
                ? {
                    id: String(latestScan.id),
                    status: String(latestScan.status),
                    threads_discovered: Number(latestScan.threads_discovered ?? 0),
                    threads_checked: Number(latestScan.threads_checked ?? 0),
                    error_code: (latestScan.error_code as string | null | undefined) ?? null,
                    error_message: (latestScan.error_message as string | null | undefined) ?? null,
                  }
                : null
            }
            lastRunAt={
              latestStatus === "RUNNING"
                ? null
                : ((latestScan?.finished_at as string | null | undefined) ?? null)
            }
            lastRunStatus={latestStatus === "RUNNING" ? null : latestStatus}
            messagesProcessed={
              latestScan && latestStatus !== "RUNNING"
                ? Number(latestScan.messages_processed ?? 0)
                : null
            }
            nextScanAt={gmailStatus.connection?.nextScanAt}
          />
        </>
      ) : null}
    </AppChrome>
  );
}
