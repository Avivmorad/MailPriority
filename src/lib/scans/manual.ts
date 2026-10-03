import { cache } from "react";
import { z } from "zod";

import { createEmailTriageProvider } from "@/lib/ai/client";
import { getTriageModelName, isGmailConfigured, isTriageConfigured } from "@/lib/config/env";
import { createGmailApiForUser } from "@/lib/gmail/client";
import { GmailConnectError } from "@/lib/gmail/oauth";
import { isGmailQuotaError } from "@/lib/gmail/retry";
import { createGmailScanPort } from "@/lib/scans/gmail-port";
import {
  DEFAULT_LOOKBACK_DAYS,
  INITIAL_LOOKBACK_DAYS,
  type InitialLookbackDays,
} from "@/lib/scans/lookback";
import {
  isMissingScanSchemaError,
  SCAN_IN_PROGRESS,
  SCAN_SCHEMA_MISSING_MESSAGE,
  scanUserMessage,
} from "@/lib/scans/errors";
import { scanHasRemainingWork } from "@/lib/scans/checkpoint";
import { DISPATCH_LEASE_SECONDS, SCAN_WORK_BUDGET_MS } from "@/lib/scans/dispatch-budget";
import {
  acquireScanJob,
  admitScanSlice,
  finishScanJob,
  markScanJobRunning,
  resolveScanSliceJob,
  SCAN_SLICE_IN_PROGRESS,
} from "@/lib/scans/jobs";
import { openGmailScan, executeGmailScan, resumeGmailScan } from "@/lib/scans/process-scan";
import { createSupabaseScanStore } from "@/lib/scans/store";
import { persistDigestAfterScan } from "@/lib/digest/build-digest";
import { emitProductEvent } from "@/lib/observability/events";
import { captureSafeException } from "@/lib/observability/sentry-report";
import { scanProgressPercent } from "@/lib/scans/progress";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ScanRunResult } from "@/lib/scans/types";

export const manualScanRequestSchema = z.object({
  lookbackDays: z
    .number()
    .int()
    .refine((value): value is InitialLookbackDays =>
      (INITIAL_LOOKBACK_DAYS as readonly number[]).includes(value),
    )
    .default(DEFAULT_LOOKBACK_DAYS),
});

const SCAN_RUN_SELECT =
  "id, status, trigger_type, window_start, window_end, started_at, finished_at, updated_at, messages_discovered, messages_processed, threads_analyzed, threads_discovered, threads_checked, important_count, action_count, reply_count, waiting_count, informational_count, ignored_count, error_code, error_message";

export const MANUAL_SCAN_RATE_LIMIT_MS = 2 * 60_000;

export function isManualScanRateLimited(
  lastAttemptedScanAt: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  const lastAttempt = lastAttemptedScanAt ? Date.parse(lastAttemptedScanAt) : NaN;
  return Number.isFinite(lastAttempt) && nowMs - lastAttempt < MANUAL_SCAN_RATE_LIMIT_MS;
}

export function skipsManualScanRateLimit(errorCode: string | null | undefined): boolean {
  return errorCode === "cancelled";
}

export class ScanRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ScanRequestError";
  }
}

export async function beginManualInitialScan(
  userId: string,
  lookbackDays: InitialLookbackDays = DEFAULT_LOOKBACK_DAYS,
): Promise<{
  scanId: string;
  triggerType: "INITIAL" | "MANUAL";
  execute: () => Promise<ScanRunResult>;
}> {
  const requestBudget = { deadlineAt: Date.now() + SCAN_WORK_BUDGET_MS };
  if (!isGmailConfigured()) {
    throw new ScanRequestError(503, "gmail_not_configured", "Gmail OAuth is not configured.");
  }
  if (!isTriageConfigured()) {
    throw new ScanRequestError(503, "gemini_not_configured", "Email analysis is not configured.");
  }

  const store = createSupabaseScanStore();
  let connection: {
    gmail: Awaited<ReturnType<typeof createGmailApiForUser>>["gmail"];
    connectionId: string;
    gmailEmail: string;
  };
  try {
    connection = await createGmailApiForUser(userId, requestBudget);
  } catch (error) {
    if (error instanceof GmailConnectError) {
      throw new ScanRequestError(409, error.reason, scanUserMessage(error.reason, error.message));
    }
    throw error;
  }

  const db = createAdminClient();
  const { data: existing } = await db
    .from("gmail_connections")
    .select("last_attempted_scan_at, last_successful_scan_at")
    .eq("id", connection.connectionId)
    .maybeSingle();

  const running = await store.findRunningScan(connection.connectionId);
  const checkpoint = running ? await store.getScanCheckpoint(running.id) : null;
  if (checkpoint && scanHasRemainingWork(checkpoint)) {
    const workerId = `manual:${checkpoint.scanId}:${crypto.randomUUID()}`;
    const leaseExpiresAt = new Date(Date.now() + DISPATCH_LEASE_SECONDS * 1000).toISOString();
    const jobId = await admitScanSlice({
      connectionId: connection.connectionId,
      scanId: checkpoint.scanId,
      workerId,
      leaseExpiresAt,
    }).catch(remapJobAdmissionError);
    let prepared: Awaited<ReturnType<typeof resumeGmailScan>>;
    try {
      prepared = await resumeGmailScan({
        scanId: checkpoint.scanId,
        gmailEmail: connection.gmailEmail,
        gmail: createGmailScanPort(connection.gmail, connection.connectionId, requestBudget),
        store,
        provider: createEmailTriageProvider(),
        modelName: getTriageModelName(),
      });
    } catch (error) {
      return failManualScanPreparation(jobId, workerId, error);
    }
    return {
      scanId: prepared.scanId,
      triggerType: checkpoint.triggerType === "INITIAL" ? "INITIAL" : "MANUAL",
      execute: async () =>
        runAdmittedScanSlice({
          jobId,
          workerId,
          leaseExpiresAt,
          userId,
          prepared,
        }),
    };
  }

  const latest = await getLatestScanRunForUser(userId);
  const skipRateLimit = skipsManualScanRateLimit(
    typeof latest?.error_code === "string" ? latest.error_code : null,
  );
  if (
    !skipRateLimit &&
    isManualScanRateLimited(
      typeof existing?.last_attempted_scan_at === "string" ? existing.last_attempted_scan_at : null,
    )
  ) {
    throw new ScanRequestError(429, "rate_limited", scanUserMessage("rate_limited"));
  }

  const triggerType = existing?.last_successful_scan_at ? "MANUAL" : "INITIAL";
  const workerId = `manual:${crypto.randomUUID()}`;
  const leaseExpiresAt = new Date(Date.now() + DISPATCH_LEASE_SECONDS * 1000).toISOString();
  const jobId = await acquireScanJob({
    connectionId: connection.connectionId,
    workerId,
    leaseExpiresAt,
  }).catch(remapJobAdmissionError);

  let prepared: Awaited<ReturnType<typeof openGmailScan>>;
  try {
    prepared = await openGmailScan({
      userId,
      connectionId: connection.connectionId,
      gmailEmail: connection.gmailEmail,
      lookbackDays,
      triggerType,
      // Manual Scan now always honors the chosen lookback window (content-hash
      // still skips unchanged threads). Scheduled scans stay incremental.
      forceLookback: true,
      gmail: createGmailScanPort(connection.gmail, connection.connectionId, requestBudget),
      store,
      provider: createEmailTriageProvider(),
      modelName: getTriageModelName(),
    });
    const marked = await markScanJobRunning(jobId, prepared.scanId, workerId);
    if (!marked) {
      throw new ScanRequestError(409, "scan_in_progress", scanUserMessage("scan_in_progress"));
    }
  } catch (error) {
    return failManualScanPreparation(jobId, workerId, error);
  }

  return {
    scanId: prepared.scanId,
    triggerType,
    execute: async () =>
      runAdmittedScanSlice({
        jobId,
        workerId,
        leaseExpiresAt,
        userId,
        prepared,
      }),
  };
}

async function failManualScanPreparation(
  jobId: string,
  workerId: string,
  error: unknown,
): Promise<never> {
  try {
    // The worker predicate prevents cleanup from releasing a successor's lease.
    // Keep an existing checkpoint RUNNING so a later slice can resume it.
    await finishScanJob(jobId, "FAILED", "scan_preparation_failed", workerId);
  } catch (cleanupError) {
    throw new AggregateError([error, cleanupError], "Scan preparation and lease cleanup failed");
  }
  return remapScanStartError(error);
}

async function runAdmittedScanSlice(input: {
  jobId: string;
  workerId: string;
  leaseExpiresAt: string;
  userId: string;
  prepared: Awaited<ReturnType<typeof openGmailScan>>;
}): Promise<ScanRunResult> {
  try {
    const result = await executeGmailScan({
      ...input.prepared,
      jobLease: { jobId: input.jobId, workerId: input.workerId },
    });
    const handoffLease = new Date(Date.now() + DISPATCH_LEASE_SECONDS * 1000).toISOString();
    await resolveScanSliceJob(input.jobId, result, input.workerId, handoffLease);
    if (result.status === "SUCCESS" || result.status === "PARTIAL") {
      try {
        await persistDigestAfterScan({ userId: input.userId, scanId: input.prepared.scanId });
      } catch (error) {
        emitProductEvent({ type: "digest.created", scanId: input.prepared.scanId, persisted: 0 });
        captureSafeException(error, {
          route: "/api/scans",
          scan_type: "manual",
        });
      }
    }
    return result;
  } catch (error) {
    await finishScanJob(
      input.jobId,
      "FAILED",
      error instanceof Error ? error.message : "scan_failed",
      input.workerId,
    ).catch(() => undefined);
    throw error;
  }
}

export async function startManualInitialScan(
  userId: string,
  lookbackDays: InitialLookbackDays = DEFAULT_LOOKBACK_DAYS,
): Promise<ScanRunResult> {
  const job = await beginManualInitialScan(userId, lookbackDays);
  return job.execute();
}

function remapScanStartError(error: unknown): never {
  if (error instanceof Error && error.message === SCAN_IN_PROGRESS) {
    throw new ScanRequestError(409, "scan_in_progress", scanUserMessage("scan_in_progress"));
  }
  if (isGmailQuotaError(error)) {
    throw new ScanRequestError(429, "gmail_quota", scanUserMessage("gmail_quota"));
  }
  if (isMissingScanSchemaError(error)) {
    throw new ScanRequestError(503, "scan_schema_missing", SCAN_SCHEMA_MISSING_MESSAGE);
  }
  throw error;
}

function remapJobAdmissionError(error: unknown): never {
  if (error instanceof Error && error.message === SCAN_SLICE_IN_PROGRESS) {
    throw new ScanRequestError(409, "scan_in_progress", scanUserMessage("scan_in_progress"));
  }
  throw error;
}

export async function getScanRunForUser(userId: string, scanId: string) {
  const db = createAdminClient();
  const { data, error } = await db
    .from("scan_runs")
    .select(SCAN_RUN_SELECT)
    .eq("id", scanId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new Error("Failed to load scan run");
  }
  return data;
}

export async function getScanRunsForUser(userId: string, limit = 10) {
  const db = createAdminClient();
  const { data, error } = await db
    .from("scan_runs")
    .select(SCAN_RUN_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    return [];
  }
  return data ?? [];
}

export const getLatestScanRunForUser = cache(async (userId: string) => {
  const db = createAdminClient();
  const { data, error } = await db
    .from("scan_runs")
    .select(SCAN_RUN_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    return null;
  }
  return data;
});

/** Progress poll payload: status, percent, and counts. No history rows. */
export async function getScanProgressForUser(userId: string) {
  const db = createAdminClient();
  const { data, error } = await db
    .from("scan_runs")
    .select(
      "id, status, threads_discovered, threads_checked, error_code, error_message, updated_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  const threadsDiscovered = Number(data.threads_discovered ?? 0);
  const threadsChecked = Number(data.threads_checked ?? 0);
  return {
    id: String(data.id),
    status: String(data.status),
    threads_discovered: threadsDiscovered,
    threads_checked: threadsChecked,
    percent: scanProgressPercent(threadsChecked, threadsDiscovered),
    error_code: (data.error_code as string | null) ?? null,
    error_message: (data.error_message as string | null) ?? null,
    updated_at: (data.updated_at as string | null) ?? null,
  };
}

async function exactThreadCount(
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
): Promise<number> {
  const { count, error } = await query;
  if (error) {
    throw new Error("Failed to load inbox counts");
  }
  return count ?? 0;
}

export async function getInboxCountsForUser(userId: string) {
  const db = createAdminClient();
  const threads = () =>
    db.from("email_threads").select("id", { count: "exact", head: true }).eq("user_id", userId);
  const [processed, important, needAction, waiting, ignored, fyi] = await Promise.all([
    exactThreadCount(threads()),
    exactThreadCount(threads().eq("importance", "high")),
    exactThreadCount(threads().eq("requires_action", true)),
    exactThreadCount(threads().eq("status", "waiting")),
    exactThreadCount(threads().eq("status", "ignore")),
    exactThreadCount(
      threads()
        .in("status", ["informational", "resolved"])
        .not("summary", "is", null)
        .not("summary", "match", "^\\s*$"),
    ),
  ]);
  return { processed, important, needAction, waiting, ignored, fyi };
}
