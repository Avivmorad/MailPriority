import Link from "next/link";
import { redirect } from "next/navigation";

import { DigestReportCard } from "@/components/digest/digest-report-card";
import { EmptyState } from "@/components/layout/empty-state";
import { AppChrome } from "@/components/layout/app-chrome";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { ensureDigestForLatestScan } from "@/lib/digest/build-digest";
import { listDigestsForUser } from "@/lib/digest/queries";
import { getGmailStatusForUser } from "@/lib/gmail/connections";
import { gmailRecoveryActionLabel, shouldShowGmailRecoveryCard } from "@/lib/gmail/recovery";
import { getLatestScanRunForUser } from "@/lib/scans/manual";
import { getSessionUser } from "@/lib/supabase/auth";
import { requireOnboardingComplete } from "@/lib/onboarding/guard";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  await requireOnboardingComplete(user.id);

  const [latestScan, gmailStatus] = await Promise.all([
    getLatestScanRunForUser(user.id),
    getGmailStatusForUser(user.id),
  ]);
  await ensureDigestForLatestScan(
    user.id,
    latestScan ? String(latestScan.id) : null,
    latestScan ? String(latestScan.status) : null,
  ).catch(() => null);

  let digests: Awaited<ReturnType<typeof listDigestsForUser>> = [];
  let loadFailed = false;
  try {
    digests = await listDigestsForUser(user.id, 20);
  } catch {
    loadFailed = true;
  }
  const needsGmailRecovery = shouldShowGmailRecoveryCard(gmailStatus);

  return (
    <AppChrome user={user} current="history" width="narrow">
      <PageHeader
        title="History"
        description="In-app history of period counts and top actions after each successful scan. Email delivery is not in the MVP."
      />
      {loadFailed ? (
        <EmptyState
          variant="error"
          title="Could not load History"
          description="A temporary database error prevented loading History."
          action={
            <Link href="/history" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Reload History
            </Link>
          }
        />
      ) : digests.length === 0 && needsGmailRecovery ? (
        <EmptyState
          title="Connect Gmail to see History"
          description="History appears after a successful or partial scan. Connect or reconnect Gmail first — existing summaries stay until you delete them."
          action={
            <a
              href="/api/gmail/connect?returnTo=/history"
              className={buttonVariants({ size: "sm" })}
            >
              {gmailRecoveryActionLabel(gmailStatus)}
            </a>
          }
        />
      ) : digests.length === 0 ? (
        <DigestReportCard digest={null} title="History" />
      ) : (
        <div className="space-y-6">
          {digests.map((digest, index) => (
            <DigestReportCard
              key={digest.id}
              digest={digest}
              title={index === 0 ? "Latest summary" : "Earlier summary"}
            />
          ))}
        </div>
      )}
      <p className="text-muted-foreground text-sm">
        Actions live under{" "}
        <Link href="/mail?tab=open" className="text-primary font-medium hover:underline">
          Mail
        </Link>
        . Scan again from{" "}
        <Link href="/scan" className="text-primary font-medium hover:underline">
          Scan
        </Link>{" "}
        to refresh these numbers.
      </p>
    </AppChrome>
  );
}
