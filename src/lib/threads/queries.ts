import { z } from "zod";

import type { ActionStatus } from "@/lib/actions/reconcile-action";
import { gmailThreadUrl } from "@/lib/gmail/deep-link";
import {
  isClassifiedSummaryThread,
  mailBucketForThread,
  normalizeThreadStatus,
} from "@/lib/mail/buckets";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RecentThreadRow } from "@/lib/threads/recent-thread";
import { correctionFromFeedback } from "@/lib/threads/apply-feedback";
import { threadFeedbackSchema } from "@/lib/threads/feedback";
import { usableDisplayText } from "@/lib/ui/display-text";

export class ThreadQueryError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ThreadQueryError";
  }
}

export interface ThreadMessageMeta {
  id: string;
  direction: string;
  senderEmail: string | null;
  senderName: string | null;
  subject: string | null;
  snippet: string | null;
  receivedAt: string;
}

export interface ThreadDetail {
  id: string;
  gmailThreadId: string;
  gmailUrl: string;
  subject: string | null;
  summary: string | null;
  shortDisplayTitle: string | null;
  importance: string | null;
  importanceReason: string | null;
  status: string | null;
  requiresAction: boolean;
  requiresReply: boolean;
  actionSummary: string | null;
  actionReason: string | null;
  waitingFor: string | null;
  urgency: string | null;
  deadline: string | null;
  deadlineText: string | null;
  category: string | null;
  actionType: string | null;
  confidence: number | null;
  latestMessageAt: string | null;
  actionId: string | null;
  actionStatus: string | null;
  snoozedUntil: string | null;
  messages: ThreadMessageMeta[];
}

export type { RecentThreadRow } from "@/lib/threads/recent-thread";

type ThreadListDbRow = {
  id: unknown;
  subject: unknown;
  short_display_title: unknown;
  summary: unknown;
  status: unknown;
  importance: unknown;
  importance_reason: unknown;
  category: unknown;
  urgency?: unknown;
  deadline?: unknown;
  participants: unknown;
  latest_message_at: unknown;
  gmail_thread_id?: unknown;
};

function senderFromParticipants(participants: unknown): string | null {
  if (!Array.isArray(participants) || participants.length === 0) {
    return null;
  }
  const first = participants[0] as { email?: unknown; name?: unknown };
  const name = typeof first.name === "string" ? first.name.trim() : "";
  if (name) {
    return name;
  }
  return typeof first.email === "string" && first.email.trim() ? first.email.trim() : null;
}

/** FYI / quick updates only — never ignore, open tasks, or waiting. */
export const INBOX_SUMMARY_STATUSES = ["informational", "resolved"] as const;

export function isInboxSummaryStatus(status: string | null | undefined): boolean {
  return mailBucketForThread({ status }) === "summary";
}

export function mapRecentThreadRow(row: ThreadListDbRow, gmailEmail = ""): RecentThreadRow {
  const gmailThreadId = typeof row.gmail_thread_id === "string" ? row.gmail_thread_id.trim() : "";
  return {
    id: String(row.id),
    subject: (row.subject as string | null) ?? null,
    shortDisplayTitle: (row.short_display_title as string | null) ?? null,
    summary: (row.summary as string | null) ?? null,
    status: (row.status as string | null) ?? null,
    importance: (row.importance as string | null) ?? null,
    importanceReason: usableDisplayText(
      typeof row.importance_reason === "string" ? row.importance_reason : null,
    ),
    category: (row.category as string | null) ?? null,
    urgency: (row.urgency as string | null) ?? null,
    deadline: (row.deadline as string | null) ?? null,
    sender: senderFromParticipants(row.participants),
    latestMessageAt: (row.latest_message_at as string | null) ?? null,
    gmailUrl: gmailThreadId ? gmailThreadUrl(gmailEmail, gmailThreadId) : null,
  };
}

const THREAD_LIST_SELECT =
  "id, subject, short_display_title, summary, status, importance, importance_reason, category, urgency, deadline, participants, gmail_thread_id, latest_message_at";

async function connectedGmailEmail(userId: string): Promise<string> {
  const db = createAdminClient();
  const { data } = await db
    .from("gmail_connections")
    .select("gmail_email")
    .eq("user_id", userId)
    .eq("status", "CONNECTED")
    .limit(1)
    .maybeSingle();
  return typeof data?.gmail_email === "string" ? data.gmail_email : "";
}

export async function listRecentThreadsForUser(
  userId: string,
  limit = 24,
): Promise<RecentThreadRow[]> {
  const db = createAdminClient();
  const gmailEmail = await connectedGmailEmail(userId);
  const { data, error } = await db
    .from("email_threads")
    .select(THREAD_LIST_SELECT)
    .eq("user_id", userId)
    .in("status", [...INBOX_SUMMARY_STATUSES])
    .not("summary", "is", null)
    .order("latest_message_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new ThreadQueryError(500, "load_failed", "Failed to load recent threads.");
  }
  const rows = data ?? [];
  return rows
    .map((row) => mapRecentThreadRow(row, gmailEmail))
    .filter((row) => isClassifiedSummaryThread({ status: row.status, summary: row.summary }));
}

export async function listIgnoredThreadsForUser(
  userId: string,
  limit = 50,
): Promise<RecentThreadRow[]> {
  const db = createAdminClient();
  const gmailEmail = await connectedGmailEmail(userId);
  const { data, error } = await db
    .from("email_threads")
    .select(THREAD_LIST_SELECT)
    .eq("user_id", userId)
    .eq("status", "ignore")
    .order("latest_message_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new ThreadQueryError(500, "load_failed", "Failed to load ignored threads.");
  }
  const rows = data ?? [];
  return rows
    .map((row) => mapRecentThreadRow(row, gmailEmail))
    .filter((row) => mailBucketForThread({ status: row.status }) === "ignored");
}

const THREAD_DETAIL_SELECT =
  "id, user_id, gmail_connection_id, gmail_thread_id, subject, summary, short_display_title, importance, importance_reason, status, requires_action, requires_reply, action_summary, action_reason, waiting_for, urgency, deadline, deadline_text, category, action_type, confidence, latest_message_at";

export async function getThreadDetailForUser(
  userId: string,
  threadId: string,
): Promise<ThreadDetail | null> {
  const db = createAdminClient();
  const { data: thread, error } = await db
    .from("email_threads")
    .select(THREAD_DETAIL_SELECT)
    .eq("id", threadId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new ThreadQueryError(500, "load_failed", "Failed to load thread.");
  }
  if (!thread) {
    return null;
  }

  const [{ data: messages }, { data: action }, { data: connection }] = await Promise.all([
    db
      .from("email_messages")
      .select("id, direction, sender_email, sender_name, subject, snippet, received_at")
      .eq("thread_id", threadId)
      .eq("user_id", userId)
      .order("received_at", { ascending: true }),
    db
      .from("action_items")
      .select("id, status, waiting_for, snoozed_until")
      .eq("thread_id", threadId)
      .eq("user_id", userId)
      .maybeSingle(),
    db
      .from("gmail_connections")
      .select("gmail_email")
      .eq("id", thread.gmail_connection_id as string)
      .maybeSingle(),
  ]);

  const gmailEmail = typeof connection?.gmail_email === "string" ? connection.gmail_email : "";
  const gmailThreadId = String(thread.gmail_thread_id);

  return {
    id: String(thread.id),
    gmailThreadId,
    gmailUrl: gmailThreadUrl(gmailEmail, gmailThreadId),
    subject: (thread.subject as string | null) ?? null,
    summary: (thread.summary as string | null) ?? null,
    shortDisplayTitle: (thread.short_display_title as string | null) ?? null,
    importance: (thread.importance as string | null) ?? null,
    importanceReason: (thread.importance_reason as string | null) ?? null,
    status: (thread.status as string | null) ?? null,
    requiresAction: Boolean(thread.requires_action),
    requiresReply: Boolean(thread.requires_reply),
    actionSummary: (thread.action_summary as string | null) ?? null,
    actionReason: (thread.action_reason as string | null) ?? null,
    waitingFor:
      (typeof action?.waiting_for === "string" ? action.waiting_for : null) ??
      (thread.waiting_for as string | null) ??
      null,
    urgency: (thread.urgency as string | null) ?? null,
    deadline: (thread.deadline as string | null) ?? null,
    deadlineText: (thread.deadline_text as string | null) ?? null,
    category: (thread.category as string | null) ?? null,
    actionType: (thread.action_type as string | null) ?? null,
    confidence: thread.confidence == null ? null : Number(thread.confidence),
    latestMessageAt: (thread.latest_message_at as string | null) ?? null,
    actionId: action ? String(action.id) : null,
    actionStatus: action ? String(action.status) : null,
    snoozedUntil: typeof action?.snoozed_until === "string" ? action.snoozed_until : null,
    messages: (messages ?? []).map((message) => ({
      id: String(message.id),
      direction: String(message.direction),
      senderEmail: (message.sender_email as string | null) ?? null,
      senderName: (message.sender_name as string | null) ?? null,
      subject: (message.subject as string | null) ?? null,
      snippet: (message.snippet as string | null) ?? null,
      receivedAt: String(message.received_at),
    })),
  };
}

export async function saveThreadFeedback(
  userId: string,
  threadId: string,
  kind: z.infer<typeof threadFeedbackSchema>["kind"],
): Promise<{ applied: boolean; actionId: string | null }> {
  const db = createAdminClient();
  const { data: thread } = await db
    .from("email_threads")
    .select("id, status, requires_action, importance, short_display_title, summary")
    .eq("id", threadId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!thread) {
    throw new ThreadQueryError(404, "not_found", "Thread not found.");
  }
  const { data: action } = await db
    .from("action_items")
    .select("id, status")
    .eq("thread_id", threadId)
    .eq("user_id", userId)
    .maybeSingle();
  const importance =
    thread.importance === "high" || thread.importance === "medium" || thread.importance === "low"
      ? thread.importance
      : null;
  const correction = correctionFromFeedback(kind, {
    status: normalizeThreadStatus(typeof thread.status === "string" ? thread.status : null),
    requiresAction: Boolean(thread.requires_action),
    importance,
    actionStatus: action ? (action.status as ActionStatus) : null,
  });
  const { error } = await db.from("classification_feedback").insert({
    user_id: userId,
    thread_id: threadId,
    kind,
  });
  if (error) {
    throw new ThreadQueryError(500, "save_failed", "Failed to save feedback.");
  }
  const existingActionId = action ? String(action.id) : null;
  if (!correction.applied) {
    return { applied: false, actionId: existingActionId };
  }
  if (Object.keys(correction.thread).length > 0) {
    const threadPatch: Record<string, unknown> = {};
    if (correction.thread.status) {
      threadPatch.status = correction.thread.status;
    }
    if (correction.thread.requiresAction !== undefined) {
      threadPatch.requires_action = correction.thread.requiresAction;
    }
    if (correction.thread.importance) {
      threadPatch.importance = correction.thread.importance;
    }
    const { error: threadError } = await db
      .from("email_threads")
      .update(threadPatch)
      .eq("id", threadId)
      .eq("user_id", userId);
    if (threadError) {
      throw new ThreadQueryError(500, "save_failed", "Failed to apply the correction.");
    }
  }
  if (correction.removeAction && action) {
    const { error: deleteError } = await db
      .from("action_items")
      .delete()
      .eq("id", action.id)
      .eq("user_id", userId);
    if (deleteError) {
      throw new ThreadQueryError(500, "save_failed", "Failed to apply the correction.");
    }
    return { applied: true, actionId: null };
  }
  if (correction.actionStatus) {
    const now = new Date().toISOString();
    const title =
      (typeof thread.short_display_title === "string" && thread.short_display_title.trim()) ||
      (typeof thread.summary === "string" && thread.summary.trim()) ||
      "Action";
    if (action) {
      const { error: actionError } = await db
        .from("action_items")
        .update({
          status: correction.actionStatus,
          manual_override: true,
          source: "USER",
          completed_at: correction.actionStatus === "COMPLETED" ? now : null,
          snoozed_until: null,
          ...(correction.clearWaitingFor ? { waiting_for: null } : {}),
        })
        .eq("id", action.id)
        .eq("user_id", userId);
      if (actionError) {
        throw new ThreadQueryError(500, "save_failed", "Failed to apply the correction.");
      }
      return { applied: true, actionId: existingActionId };
    }
    if (correction.actionStatus !== "COMPLETED") {
      const { data: inserted, error: insertError } = await db
        .from("action_items")
        .insert({
          user_id: userId,
          thread_id: threadId,
          status: correction.actionStatus,
          title,
          source: "USER",
          manual_override: true,
        })
        .select("id")
        .single();
      if (insertError) {
        throw new ThreadQueryError(500, "save_failed", "Failed to apply the correction.");
      }
      const insertedId =
        inserted && typeof inserted.id === "string"
          ? inserted.id
          : inserted
            ? String(inserted.id)
            : null;
      return { applied: true, actionId: insertedId };
    }
  }
  return { applied: true, actionId: existingActionId };
}
