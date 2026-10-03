import { describe, expect, it } from "vitest";

import { correctionFromFeedback } from "@/lib/threads/apply-feedback";

const base = {
  status: "informational" as const,
  requiresAction: false,
  importance: "medium" as const,
  actionStatus: null,
};

describe("correctionFromFeedback", () => {
  it("moves a thread to Open, Waiting, or Summary", () => {
    expect(correctionFromFeedback("action", base)).toEqual({
      applied: true,
      thread: { status: "action_required", requiresAction: true },
      actionStatus: "OPEN",
    });
    expect(correctionFromFeedback("waiting", base)).toEqual({
      applied: true,
      thread: { status: "waiting", requiresAction: true },
      actionStatus: "WAITING",
    });
    expect(correctionFromFeedback("no_action", { ...base, actionStatus: "OPEN" })).toEqual({
      applied: true,
      thread: { status: "informational", requiresAction: false },
      actionStatus: "COMPLETED",
    });
  });

  it("clears Waiting back to Open and leaves vague wrong-only feedback unapplied", () => {
    expect(
      correctionFromFeedback("not_waiting", {
        status: "waiting",
        requiresAction: true,
        importance: "high",
        actionStatus: "WAITING",
      }),
    ).toEqual({
      applied: true,
      thread: { status: "action_required", requiresAction: true },
      actionStatus: "OPEN",
      clearWaitingFor: true,
    });
    expect(correctionFromFeedback("wrong", base).applied).toBe(false);
    expect(correctionFromFeedback("not_waiting", base).applied).toBe(false);
  });

  it("moves a thread to Ignored and drops the workflow row", () => {
    expect(correctionFromFeedback("ignore", { ...base, actionStatus: "OPEN" })).toEqual({
      applied: true,
      thread: { status: "ignore", requiresAction: false },
      actionStatus: null,
      removeAction: true,
    });
  });
});
