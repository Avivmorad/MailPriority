/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { DigestReportCard } from "@/components/digest/digest-report-card";
import type { DigestReport } from "@/lib/digest/types";

afterEach(() => {
  cleanup();
});

const digest: DigestReport = {
  id: "digest-1",
  userId: "user-1",
  connectionId: "connection-1",
  periodStart: "2026-09-10T00:00:00.000Z",
  periodEnd: "2026-09-10T12:00:00.000Z",
  totalMessages: 4,
  importantCount: 1,
  actionCount: 1,
  replyCount: 0,
  waitingCount: 0,
  informationalCount: 1,
  ignoredCount: 2,
  summaryText: "One payment still needs you.",
  topActions: [
    {
      threadId: "thread-pay",
      title: "אשר את החשבונית",
      urgency: null,
      deadline: null,
      category: "finance",
    },
  ],
  createdAt: "2026-09-10T12:00:00.000Z",
};

function expectReadableOpen(href: string) {
  const open = screen.getByRole("link", { name: "Open" });
  expect(open).toHaveAttribute("href", href);
  const title = screen.getByRole("heading", { name: "אשר את החשבונית" });
  const container = title.closest("[data-slot='mail-card-title']");
  expect(container).not.toBeNull();
  expect(container).toHaveClass("text-start");
  expect(container).not.toHaveClass("text-center");
  expect(container).toHaveClass("w-full");
  expect(title).toHaveAttribute("dir", "auto");
  expect(screen.getByRole("link", { name: "Open in Gmail" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Move to" })).toBeInTheDocument();
}

describe("DigestReportCard", () => {
  it("left-aligns the title and renders Open on the dashboard preview", () => {
    render(<DigestReportCard digest={digest} variant="compact" />);
    expectReadableOpen("/thread/thread-pay");
  });

  it("left-aligns the title and renders Open on each history thread row", () => {
    render(<DigestReportCard digest={digest} />);
    expectReadableOpen("/thread/thread-pay");
  });
});
