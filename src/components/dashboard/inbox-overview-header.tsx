import { InboxScanNowButton } from "@/components/dashboard/inbox-scan-now-button";
import { PageHeader } from "@/components/layout/page-header";

export function InboxOverviewHeader({ description }: { description: string }) {
  return (
    <PageHeader title="Inbox overview" description={description} action={<InboxScanNowButton />} />
  );
}
