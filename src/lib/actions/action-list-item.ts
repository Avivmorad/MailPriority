import type { ActionStatus } from "@/lib/actions/reconcile-action";

/** Client-safe row shape. Keep this module free of server clients. */
export interface ActionListItem {
  id: string;
  threadId: string;
  status: ActionStatus;
  title: string;
  description: string | null;
  actionSummary: string | null;
  actionReason: string | null;
  importanceReason: string | null;
  waitingFor: string | null;
  snoozedUntil: string | null;
  deadline: string | null;
  urgency: string | null;
  latestMessageAt: string | null;
  importance: string | null;
  summary: string | null;
  sender: string | null;
  gmailUrl: string;
  category: string | null;
  actionType: string | null;
  confidence: number | null;
  updatedAt: string | null;
}
