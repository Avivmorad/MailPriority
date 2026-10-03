import { redirect } from "next/navigation";

import { AppChrome } from "@/components/layout/app-chrome";
import { PageHeader } from "@/components/layout/page-header";
import { InitialScanCard } from "@/components/scans/initial-scan-card";
import { getGmailStatusForUser } from "@/lib/gmail/connections";
import { requireOnboardingComplete } from "@/lib/onboarding/guard";
import { getLatestScanRunForUser } from "@/lib/scans/manual";
import { getSessionUser } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

function scanCount(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default async function ScanPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login?redirectedFrom=/scan");
  }
  await requireOnboardingComplete(user.id);

  const gmailStatus = await getGmailStatusForUser(user.id);
  const connected = gmailStatus.connection?.status === "CONNECTED";
  const latestScan = connected ? await getLatestScanRunForUser(user.id) : null;
  const latestStatus = latestScan ? String(latestScan.status) : null;
  const running = latestStatus === "RUNNING";

  return (
    <AppChrome user={user} current="scan">
      <PageHeader
        title="Scan"
        description="Choose how far back to read. Unchanged threads are skipped."
      />
      <InitialScanCard
        connected={connected}
        incremental={Boolean(gmailStatus.connection?.lastSuccessfulScanAt)}
        returnTo="/scan"
        latestScan={
          latestScan
            ? {
                id: String(latestScan.id),
                status: String(latestScan.status),
                threads_discovered: Number(latestScan.threads_discovered ?? 0),
                threads_checked: Number(latestScan.threads_checked ?? 0),
                error_code: (latestScan.error_code as string | null | undefined) ?? null,
                error_message: (latestScan.error_message as string | null | undefined) ?? null,
                updated_at: (latestScan.updated_at as string | null | undefined) ?? null,
              }
            : null
        }
        lastRunAt={
          running ? null : ((latestScan?.finished_at as string | null | undefined) ?? null)
        }
        lastRunStatus={running ? null : latestStatus}
        messagesProcessed={latestScan ? Number(latestScan.messages_processed ?? 0) : null}
        nextScanAt={gmailStatus.connection?.nextScanAt}
        breakdown={
          latestScan
            ? {
                actions: scanCount(latestScan.action_count),
                pending: scanCount(latestScan.waiting_count),
                forYou: scanCount(latestScan.informational_count),
                ignored: scanCount(latestScan.ignored_count),
                important: scanCount(latestScan.important_count),
              }
            : null
        }
      />
    </AppChrome>
  );
}
