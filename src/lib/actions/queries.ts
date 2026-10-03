import { cache } from "react";

import type { ActionListItem } from "@/lib/actions/action-list-item";
import { isNonTaskNotice } from "@/lib/ai/notices";
import { compareOpenActions } from "@/lib/actions/sort";
import type { ActionStatus } from "@/lib/actions/reconcile-action";
import { gmailThreadUrl } from "@/lib/gmail/deep-link";
import { createAdminClient } from "@/lib/supabase/admin";
import { displayActionTitle, usableDisplayText } from "@/lib/ui/display-text";

export type { ActionListItem } from "@/lib/actions/action-list-item";

interface ThreadJoin {
  id: string;
  summary: string | null;
  importance: string | null;
  latest_message_at: string | null;
  gmail_thread_id: string;
  participants: unknown;
  category: string | null;
  short_display_title: string | null;
  action_summary: string | null;
  action_reason: string | null;
  importance_reason: string | null;
  confidence: number | null;
}

function senderFromParticipants(participants: unknown): string | null {
  if (!Array.isArray(participants) || participants.length === 0) {
    return null;
  }
  const first = participants[0] as { email?: string; name?: string | null };
  return first.name || first.email || null;
}

export function mapActionListItem(
  row: Record<string, unknown>,
  gmailEmail: string,
): ActionListItem {
  const thread = row.email_threads as ThreadJoin | ThreadJoin[] | null;
  const joined = Array.isArray(thread) ? thread[0] : thread;
  const gmailThreadId = joined?.gmail_thread_id ?? "";
  const description = usableDisplayText(row.description as string | null);
  const actionSummary = usableDisplayText(joined?.action_summary) ?? description;
  const shortTitle = usableDisplayText(joined?.short_display_title);
  return {
    id: String(row.id),
    threadId: String(row.thread_id),
    status: row.status as ActionStatus,
    title: displayActionTitle(shortTitle, row.title as string | null, actionSummary, description),
    description,
    actionSummary,
    actionReason: usableDisplayText(joined?.action_reason),
    importanceReason: usableDisplayText(joined?.importance_reason),
    waitingFor: (row.waiting_for as string | null) ?? null,
    snoozedUntil: typeof row.snoozed_until === "string" ? row.snoozed_until : null,
    deadline: (row.deadline as string | null) ?? null,
    urgency: (row.urgency as string | null) ?? null,
    latestMessageAt: joined?.latest_message_at ?? null,
    importance: joined?.importance ?? null,
    summary: usableDisplayText(joined?.summary),
    sender: senderFromParticipants(joined?.participants),
    gmailUrl: gmailThreadUrl(gmailEmail, gmailThreadId),
    category: joined?.category ?? null,
    actionType: (row.action_type as string | null) ?? null,
    confidence: joined?.confidence == null ? null : Number(joined.confidence),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

const gmailEmailForUser = cache(async (userId: string): Promise<string> => {
  const db = createAdminClient();
  const { data } = await db
    .from("gmail_connections")
    .select("gmail_email")
    .eq("user_id", userId)
    .eq("status", "CONNECTED")
    .limit(1)
    .maybeSingle();
  return typeof data?.gmail_email === "string" ? data.gmail_email : "";
});

export class ActionQueryError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ActionQueryError";
  }
}

export async function listActionsForUser(
  userId: string,
  status: ActionStatus,
  limit = 50,
): Promise<ActionListItem[]> {
  const db = createAdminClient();
  const gmailEmail = await gmailEmailForUser(userId);
  const { data, error } = await db
    .from("action_items")
    .select(
      "id, thread_id, status, title, description, waiting_for, deadline, urgency, snoozed_until, action_type, updated_at, email_threads ( id, summary, importance, latest_message_at, gmail_thread_id, participants, category, short_display_title, action_summary, action_reason, importance_reason, confidence )",
    )
    .eq("user_id", userId)
    .eq("status", status)
    .limit(limit);
  if (error) {
    throw new ActionQueryError(500, "load_failed", "Failed to load actions from the database.");
  }
  const rows = data ?? [];
  const mapped = rows.map((row) => mapActionListItem(row as Record<string, unknown>, gmailEmail));
  const visible =
    status === "OPEN"
      ? mapped.filter((item) => !isNonTaskNotice([item.title, item.description, item.summary]))
      : mapped;
  if (status === "OPEN") {
    visible.sort(compareOpenActions);
  } else {
    visible.sort((a, b) => {
      const aTime = a.latestMessageAt ?? "";
      const bTime = b.latestMessageAt ?? "";
      return aTime > bTime ? -1 : aTime < bTime ? 1 : 0;
    });
  }
  return visible.slice(0, limit);
}

export async function countActionsForUser(userId: string, status: ActionStatus): Promise<number> {
  const db = createAdminClient();
  const { count, error } = await db
    .from("action_items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", status);
  if (error) {
    throw new ActionQueryError(500, "load_failed", "Failed to count actions.");
  }
  return count ?? 0;
}

/** Stored action rows by status. Does not apply the open-list notice filter. */
export async function countActionRowsByStatus(
  userId: string,
  statuses: readonly ActionStatus[],
): Promise<Record<ActionStatus, number>> {
  const db = createAdminClient();
  const entries = await Promise.all(
    statuses.map(async (status) => {
      const { count, error } = await db
        .from("action_items")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", status);
      if (error) {
        throw new ActionQueryError(500, "load_failed", "Failed to count actions.");
      }
      return [status, count ?? 0] as const;
    }),
  );
  const counts: Record<ActionStatus, number> = {
    OPEN: 0,
    WAITING: 0,
    COMPLETED: 0,
    SNOOZED: 0,
  };
  for (const [status, count] of entries) {
    counts[status] = count;
  }
  return counts;
}
