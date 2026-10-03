import { createAdminClient } from "@/lib/supabase/admin";
import {
  digestTopActionSchema,
  type DigestMessageActivity,
  type DigestPeriodCounts,
  type DigestReport,
  type DigestThreadActivity,
  type DigestTopAction,
} from "@/lib/digest/types";

export type { DigestReport } from "@/lib/digest/types";

export class DigestQueryError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DigestQueryError";
  }
}

type DigestDbRow = {
  id: unknown;
  user_id: unknown;
  gmail_connection_id: unknown;
  period_start: unknown;
  period_end: unknown;
  total_messages: unknown;
  important_count: unknown;
  action_count: unknown;
  reply_count: unknown;
  waiting_count: unknown;
  informational_count: unknown;
  ignored_count: unknown;
  summary_text: unknown;
  top_actions: unknown;
  created_at: unknown;
};

const DIGEST_SELECT =
  "id, user_id, gmail_connection_id, period_start, period_end, total_messages, important_count, action_count, reply_count, waiting_count, informational_count, ignored_count, summary_text, top_actions, created_at";

/** PostgREST `.in()` filters blow the URL if hundreds of UUIDs are inlined. */
export const DIGEST_THREAD_ID_CHUNK = 100;

export function chunkIds<T>(items: T[], size: number): T[][] {
  if (items.length === 0) {
    return [];
  }
  const chunkSize = Math.max(1, size);
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function asInt(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseTopActions(value: unknown): DigestTopAction[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const parsed: DigestTopAction[] = [];
  for (const item of value) {
    const result = digestTopActionSchema.safeParse(item);
    if (result.success) {
      parsed.push(result.data);
    }
  }
  return parsed;
}

export function mapDigestReportRow(row: DigestDbRow): DigestReport {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    connectionId: String(row.gmail_connection_id),
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    totalMessages: asInt(row.total_messages),
    importantCount: asInt(row.important_count),
    actionCount: asInt(row.action_count),
    replyCount: asInt(row.reply_count),
    waitingCount: asInt(row.waiting_count),
    informationalCount: asInt(row.informational_count),
    ignoredCount: asInt(row.ignored_count),
    summaryText: (row.summary_text as string | null) ?? null,
    topActions: parseTopActions(row.top_actions),
    createdAt: String(row.created_at),
  };
}

export async function getDigestSettingsForUser(
  userId: string,
): Promise<{ digestEnabled: boolean }> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("user_triage_settings")
    .select("digest_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new DigestQueryError(500, "settings_failed", "Failed to load History settings.");
  }
  return { digestEnabled: data?.digest_enabled !== false };
}

export async function loadScanRunPeriod(
  userId: string,
  scanId: string,
): Promise<{ connectionId: string; periodStart: string; periodEnd: string } | null> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("scan_runs")
    .select("gmail_connection_id, window_start, window_end")
    .eq("id", scanId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new DigestQueryError(500, "scan_load_failed", "Failed to load scan period.");
  }
  if (!data?.gmail_connection_id || !data.window_start || !data.window_end) {
    return null;
  }
  return {
    connectionId: String(data.gmail_connection_id),
    periodStart: String(data.window_start),
    periodEnd: String(data.window_end),
  };
}

export async function loadDigestPeriodActivity(input: {
  userId: string;
  connectionId: string;
  periodStart: string;
  periodEnd: string;
}): Promise<{ messages: DigestMessageActivity[]; threads: DigestThreadActivity[] }> {
  const db = createAdminClient();
  const { data: messages, error: messageError } = await db
    .from("email_messages")
    .select("id, thread_id")
    .eq("user_id", input.userId)
    .eq("gmail_connection_id", input.connectionId)
    .gte("received_at", input.periodStart)
    .lte("received_at", input.periodEnd);
  if (messageError) {
    throw new DigestQueryError(500, "activity_failed", "Failed to load messages for this period.");
  }

  const mappedMessages = (messages ?? []).map((row) => ({
    id: String(row.id),
    threadId: String(row.thread_id),
  }));
  const threadIds = [...new Set(mappedMessages.map((row) => row.threadId))];
  if (threadIds.length === 0) {
    return { messages: mappedMessages, threads: [] };
  }

  const threads: DigestThreadActivity[] = [];
  for (const slice of chunkIds(threadIds, DIGEST_THREAD_ID_CHUNK)) {
    const { data: threadRows, error: threadError } = await db
      .from("email_threads")
      .select("id, status, importance, requires_action, requires_reply")
      .eq("user_id", input.userId)
      .in("id", slice);
    if (threadError) {
      throw new DigestQueryError(500, "activity_failed", "Failed to load threads for this period.");
    }
    for (const row of threadRows ?? []) {
      threads.push({
        id: String(row.id),
        status: (row.status as string | null) ?? null,
        importance: (row.importance as string | null) ?? null,
        requiresAction: Boolean(row.requires_action),
        requiresReply: Boolean(row.requires_reply),
      });
    }
  }

  return {
    messages: mappedMessages,
    threads,
  };
}

export async function upsertDigestReport(input: {
  userId: string;
  connectionId: string;
  periodStart: string;
  periodEnd: string;
  counts: DigestPeriodCounts;
  summaryText: string;
  topActions: DigestTopAction[];
}): Promise<DigestReport> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("digest_reports")
    .upsert(
      {
        user_id: input.userId,
        gmail_connection_id: input.connectionId,
        period_start: input.periodStart,
        period_end: input.periodEnd,
        total_messages: input.counts.totalMessages,
        important_count: input.counts.importantCount,
        action_count: input.counts.actionCount,
        reply_count: input.counts.replyCount,
        waiting_count: input.counts.waitingCount,
        informational_count: input.counts.informationalCount,
        ignored_count: input.counts.ignoredCount,
        summary_text: input.summaryText,
        top_actions: input.topActions,
      },
      { onConflict: "gmail_connection_id,period_start,period_end" },
    )
    .select(DIGEST_SELECT)
    .single();
  if (error || !data) {
    throw new DigestQueryError(500, "upsert_failed", "Failed to save this History entry.");
  }
  return mapDigestReportRow(data);
}

export async function getLatestDigestForUser(userId: string): Promise<DigestReport | null> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("digest_reports")
    .select(DIGEST_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new DigestQueryError(500, "load_failed", "Failed to load the latest History entry.");
  }
  return data ? mapDigestReportRow(data) : null;
}

export async function listDigestsForUser(userId: string, limit = 20): Promise<DigestReport[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("digest_reports")
    .select(DIGEST_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new DigestQueryError(500, "load_failed", "Failed to load History.");
  }
  return (data ?? []).map((row) => mapDigestReportRow(row));
}
