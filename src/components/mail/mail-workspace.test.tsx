/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import { MailWorkspace, type MailWorkspaceData } from "@/components/mail/mail-workspace";
import type { ActionListItem } from "@/lib/actions/action-list-item";
import type { RecentThreadRow } from "@/lib/threads/recent-thread";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/mail");
});

function action(
  partial: Pick<ActionListItem, "id" | "title" | "importance" | "category"> &
    Partial<ActionListItem>,
): ActionListItem {
  return {
    threadId: partial.id,
    status: "OPEN",
    description: null,
    actionSummary: null,
    actionReason: null,
    waitingFor: null,
    snoozedUntil: null,
    deadline: null,
    urgency: null,
    latestMessageAt: "2026-09-10T10:00:00.000Z",
    summary: null,
    sender: null,
    gmailUrl: "https://mail.google.com",
    actionType: null,
    confidence: 0.95,
    updatedAt: "2026-09-10T10:00:00.000Z",
    ...partial,
    importanceReason: partial.importanceReason ?? null,
  };
}

function thread(
  partial: Pick<RecentThreadRow, "id" | "shortDisplayTitle" | "category"> &
    Partial<RecentThreadRow>,
): RecentThreadRow {
  return {
    subject: partial.shortDisplayTitle,
    summary: "A useful update.",
    status: "informational",
    importance: "low",
    latestMessageAt: "2026-09-10T10:00:00.000Z",
    ...partial,
    importanceReason: partial.importanceReason ?? null,
    sender: partial.sender ?? null,
  };
}

function workspaceData(): MailWorkspaceData {
  return {
    open: [
      action({
        id: "invoice",
        title: "Pay the studio invoice",
        importance: "medium",
        category: "finance",
        actionType: "pay",
        urgency: "soon",
      }),
      action({
        id: "hotel",
        title: "Reply about the hotel",
        importance: "high",
        category: "travel_transport",
        actionType: "reply",
      }),
      action({
        id: "job",
        title: "Review the application",
        importance: "low",
        category: "career",
        actionType: "review",
      }),
    ],
    waiting: [],
    completed: [],
    snoozed: [],
    summary: [
      thread({
        id: "course",
        shortDisplayTitle: "Course notes arrived",
        category: "education",
        importance: "medium",
      }),
    ],
    ignored: [],
    failed: {},
    figures: {
      processed: 4,
      actions: 3,
      pending: 0,
      forYou: 1,
      ignored: 0,
      important: 2,
      closed: 0,
      snoozed: 0,
    },
    needsGmailRecovery: false,
    recoveryLabel: "Reconnect Gmail",
  };
}

function renderMail() {
  return render(
    <MailWorkspace
      data={workspaceData()}
      initialTab="open"
      initialCategory={null}
      initialPriority={null}
      initialSignal={null}
      initialUncertain={false}
    />,
  );
}

function expand(name: RegExp) {
  fireEvent.click(screen.getByRole("button", { name }));
}

describe("MailWorkspace filters", () => {
  it("colors the main filter cards and keeps category as one menu", () => {
    renderMail();

    expect(screen.getByRole("link", { name: /Actions/ }).className).toContain("bg-accent");
    for (const name of [/For You/, /Pending/, /Closed/, /Snoozed/, /Ignored/]) {
      const className = screen.getByRole("link", { name }).className;
      expect(className).toContain("bg-muted");
      expect(className).not.toMatch(/bg-(sky|red|amber|green|indigo|zinc)-/);
    }

    const cards = screen
      .getAllByRole("link")
      .filter((link) => link.className.includes("w-[7.25rem]"));
    expect(cards).toHaveLength(6);
    expect(cards.some((card) => card.textContent?.includes("Finance"))).toBe(false);

    const category = screen.getByRole("combobox", { name: "Category" });
    expect([...category.querySelectorAll("option")].map((option) => option.textContent)).toEqual([
      "All categories",
      "Finance",
      "Career",
      "Travel & Transport",
    ]);
    expect(screen.getByRole("group", { name: "Priority" })).toBeInTheDocument();
  });

  it("shows only medium-priority mail when Medium is selected, then restores the list", () => {
    renderMail();

    fireEvent.click(screen.getByRole("link", { name: "Medium priority" }));
    expand(/Finance/);
    expect(screen.getByText("Pay the studio invoice")).toBeInTheDocument();
    expect(screen.queryByText("Reply about the hotel")).not.toBeInTheDocument();
    expect(screen.queryByText("Review the application")).not.toBeInTheDocument();
    expect(screen.getByText(/Showing Medium priority/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Clear filters" }));
    expand(/Finance/);
    expand(/Travel & Transport/);
    expand(/Career/);
    expect(screen.getByText("Pay the studio invoice")).toBeInTheDocument();
    expect(screen.getByText("Reply about the hotel")).toBeInTheDocument();
    expect(screen.getByText("Review the application")).toBeInTheDocument();
  });

  it("still narrows the list when a main filter is chosen", () => {
    renderMail();

    expect(screen.getByRole("link", { name: /Actions/ })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("link", { name: /For You/ }));
    expect(screen.getByRole("link", { name: /For You/ })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByText("Pay the studio invoice")).not.toBeInTheDocument();
    expand(/Education/);
    expect(screen.getByText("Course notes arrived")).toBeInTheDocument();
  });
});
