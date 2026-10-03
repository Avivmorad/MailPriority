import type { ActionStatus } from "@/lib/actions/reconcile-action";
import type { ThreadStatus } from "@/lib/ai/schemas";
import { FEEDBACK_KINDS } from "@/lib/threads/feedback";

export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export interface FeedbackThreadState {
  status: ThreadStatus;
  requiresAction: boolean;
  importance: "high" | "medium" | "low" | null;
  actionStatus: ActionStatus | null;
}

export interface FeedbackCorrection {
  applied: boolean;
  thread: {
    status?: ThreadStatus;
    requiresAction?: boolean;
    importance?: "high" | "medium" | "low";
  };
  actionStatus: ActionStatus | null;
  clearWaitingFor?: boolean;
  /** Drop the workflow row so the thread is not also listed under Closed. */
  removeAction?: boolean;
}

export function correctionFromFeedback(
  kind: FeedbackKind,
  current: FeedbackThreadState,
): FeedbackCorrection {
  switch (kind) {
    case "important":
      return { applied: true, thread: { importance: "high" }, actionStatus: current.actionStatus };
    case "not_important":
      return { applied: true, thread: { importance: "low" }, actionStatus: current.actionStatus };
    case "action":
      return {
        applied: true,
        thread: { status: "action_required", requiresAction: true },
        actionStatus: "OPEN",
      };
    case "no_action":
      return {
        applied: true,
        thread: { status: "informational", requiresAction: false },
        actionStatus: current.actionStatus ? "COMPLETED" : null,
      };
    case "waiting":
      return {
        applied: true,
        thread: { status: "waiting", requiresAction: true },
        actionStatus: "WAITING",
      };
    case "not_waiting":
      if (current.status !== "waiting" && current.actionStatus !== "WAITING") {
        return { applied: false, thread: {}, actionStatus: current.actionStatus };
      }
      return {
        applied: true,
        thread: { status: "action_required", requiresAction: true },
        actionStatus: "OPEN",
        clearWaitingFor: true,
      };
    case "ignore":
      return {
        applied: true,
        thread: { status: "ignore", requiresAction: false },
        actionStatus: null,
        removeAction: true,
      };
    case "wrong":
      return { applied: false, thread: {}, actionStatus: current.actionStatus };
  }
}
