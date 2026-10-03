import { after } from "next/server";
import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/supabase/auth";
import {
  beginManualInitialScan,
  getScanProgressForUser,
  manualScanRequestSchema,
  ScanRequestError,
} from "@/lib/scans/manual";
import { sentryScanType } from "@/lib/observability/sentry-privacy";
import { runScanInBackground } from "@/lib/scans/runtime";

export const maxDuration = 300;

/** Progress-only snapshot. History stays on the settings page, not this poll. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }
  const scan = await getScanProgressForUser(user.id);
  return NextResponse.json({ scan }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  let json: unknown = {};
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    json = await request.json().catch(() => ({}));
  }

  const parsed = manualScanRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_lookback" }, { status: 400 });
  }

  try {
    const job = await beginManualInitialScan(user.id, parsed.data.lookbackDays);
    const running = runScanInBackground(job.scanId, job.execute, {
      scanType: sentryScanType(job.triggerType),
    });
    after(async () => {
      await running;
    });
    return NextResponse.json({ scanId: job.scanId, status: "RUNNING" }, { status: 202 });
  } catch (error) {
    if (error instanceof ScanRequestError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.status },
      );
    }
    const message = error instanceof Error ? error.message : "Scan failed.";
    return NextResponse.json({ error: "scan_failed", message }, { status: 500 });
  }
}
