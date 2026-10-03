import { SettingInfo } from "@/components/settings/setting-info";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SCAN_HISTORY_INFO, SCAN_HISTORY_LABEL } from "@/lib/settings/setting-info-copy";
import { formatDateTime } from "@/lib/ui/format";
import { humanizeToken, labelForScanStatus } from "@/lib/ui/labels";

export interface ScanHistoryRow {
  id: string;
  status: string;
  trigger_type: string;
  started_at: string | null;
  finished_at: string | null;
  messages_processed: number;
  threads_analyzed: number;
}

export function ScanHistoryList({ scans }: { scans: ScanHistoryRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          {SCAN_HISTORY_LABEL}
          <SettingInfo label={SCAN_HISTORY_LABEL} description={SCAN_HISTORY_INFO} />
        </CardTitle>
        <CardDescription>Recent manual and scheduled runs for this mailbox.</CardDescription>
      </CardHeader>
      <CardContent>
        {scans.length === 0 ? (
          <p className="text-muted-foreground text-sm">No scans yet.</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {scans.map((scan) => (
              <li key={scan.id} className="border-border/60 border-b pb-3 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{labelForScanStatus(scan.status)}</span>
                  <span className="text-muted-foreground">
                    {formatDateTime(scan.finished_at ?? scan.started_at)}
                  </span>
                </div>
                <p className="text-muted-foreground mt-1">
                  {humanizeToken(scan.trigger_type)} · {scan.messages_processed} emails ·{" "}
                  {scan.threads_analyzed} threads
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
