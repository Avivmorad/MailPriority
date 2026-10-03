import { describe, expect, it } from "vitest";

import { isInboxSummaryStatus, mapRecentThreadRow, ThreadQueryError } from "@/lib/threads/queries";

describe("isInboxSummaryStatus", () => {
  it("keeps quick updates and excludes ignore and tasks", () => {
    expect(isInboxSummaryStatus("informational")).toBe(true);
    expect(isInboxSummaryStatus("resolved")).toBe(true);
    expect(isInboxSummaryStatus("ignore")).toBe(false);
    expect(isInboxSummaryStatus("action_required")).toBe(false);
    expect(isInboxSummaryStatus("waiting")).toBe(false);
  });
});

describe("mapRecentThreadRow", () => {
  it("maps list columns onto RecentThreadRow", () => {
    expect(
      mapRecentThreadRow({
        id: "thread-1",
        subject: "Your receipt",
        short_display_title: "Bank receipt",
        summary: "Payment posted.",
        status: "ignore",
        importance: "low",
        importance_reason: "Paid receipt.",
        urgency: "none",
        deadline: null,
        category: "finance",
        participants: [{ name: "Bank", email: "receipts@bank.example" }],
        latest_message_at: "2026-09-10T10:00:00.000Z",
      }),
    ).toEqual({
      id: "thread-1",
      subject: "Your receipt",
      shortDisplayTitle: "Bank receipt",
      summary: "Payment posted.",
      status: "ignore",
      importance: "low",
      importanceReason: "Paid receipt.",
      category: "finance",
      urgency: "none",
      deadline: null,
      sender: "Bank",
      latestMessageAt: "2026-09-10T10:00:00.000Z",
      gmailUrl: null,
    });
  });
});

describe("ThreadQueryError", () => {
  it("carries status, code, and message", () => {
    const error = new ThreadQueryError(500, "load_failed", "Failed to load thread.");
    expect(error.status).toBe(500);
    expect(error.code).toBe("load_failed");
    expect(error.message).toBe("Failed to load thread.");
    expect(error.name).toBe("ThreadQueryError");
  });
});
