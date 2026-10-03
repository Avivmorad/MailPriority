/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { InboxSummary } from "@/components/threads/inbox-summary";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function expandCategory(name: RegExp) {
  const header = screen.getByRole("button", { name });
  fireEvent.click(header);
}

describe("InboxSummary", () => {
  it("explains why a summary thread is in that tab and offers a correction", () => {
    render(
      <InboxSummary
        threads={[
          {
            id: "thread-1",
            urgency: "none",
            subject: "Your flight changed",
            shortDisplayTitle: "Flight change",
            summary: "The 9am flight moved to 11am.",
            status: "informational",
            importance: "medium",
            importanceReason: "The airline moved the departure.",
            category: "travel_transport",
            sender: "El Al",
            latestMessageAt: "2026-09-10T10:00:00.000Z",
          },
        ]}
      />,
    );

    expandCategory(/Travel & Transport/);
    expect(screen.getByText("Urgency: None").closest("article")).toHaveClass("border-l-gray-400");
    expect(screen.getByText("The airline moved the departure.")).toBeInTheDocument();
    expect(screen.queryByText(/useful update, not an action/i)).not.toBeInTheDocument();
    const sender = screen.getByText("El Al");
    expect(sender.tagName).toBe("STRONG");
    fireEvent.click(screen.getByRole("button", { name: "Move to" }));
    expect(screen.getByRole("menuitem", { name: "Actions" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "No action" })).not.toBeInTheDocument();
  });

  it("shows different placement lines for different For You mail", () => {
    render(
      <InboxSummary
        threads={[
          {
            id: "news",
            subject: "Weekly digest",
            shortDisplayTitle: "Weekly digest",
            summary: "Three product updates.",
            status: "informational",
            importance: "low",
            importanceReason: null,
            category: "newsletters_promotions",
            sender: "Morning Brew",
            latestMessageAt: "2026-09-10T10:00:00.000Z",
          },
          {
            id: "flight",
            subject: "Boarding pass",
            shortDisplayTitle: "Boarding pass",
            summary: "Gate B12.",
            status: "informational",
            importance: "medium",
            importanceReason: null,
            category: "travel_transport",
            sender: null,
            latestMessageAt: "2026-09-11T10:00:00.000Z",
          },
        ]}
      />,
    );

    expandCategory(/Newsletters & Promotions/);
    expandCategory(/Travel & Transport/);
    const newsletter = screen.getByText("Newsletter update from Morning Brew, nothing to do.");
    const travel = screen.getByText("Travel update, nothing to do.");
    expect(newsletter).toBeInTheDocument();
    expect(travel).toBeInTheDocument();
    expect(newsletter.textContent).not.toBe(travel.textContent);
  });

  it("does not show a Hebrew stored reason on For You or Ignored", () => {
    render(
      <InboxSummary
        threads={[
          {
            id: "lab",
            subject: "תוצאות מעבדה",
            shortDisplayTitle: "תוצאות מעבדה",
            summary: "התוצאות מוכנות בפורטל",
            status: "informational",
            importance: "medium",
            importanceReason: "תוצאות המעבדה מוכנות",
            category: "personal_health",
            sender: "Clinic",
            latestMessageAt: "2026-09-10T10:00:00.000Z",
          },
          {
            id: "otp",
            subject: "קוד כניסה",
            shortDisplayTitle: "קוד כניסה",
            summary: "הודעת אבטחה",
            status: "ignore",
            importance: "low",
            importanceReason: "קוד חד פעמי",
            category: "security",
            sender: "Bank",
            latestMessageAt: "2026-09-11T10:00:00.000Z",
          },
        ]}
      />,
    );

    expandCategory(/Personal & Health/);
    expandCategory(/Security/);
    expect(screen.getByText("תוצאות מעבדה")).toBeInTheDocument();
    expect(screen.getByText("קוד כניסה")).toBeInTheDocument();
    expect(screen.queryByText("תוצאות המעבדה מוכנות")).not.toBeInTheDocument();
    expect(screen.queryByText("קוד חד פעמי")).not.toBeInTheDocument();
    expect(screen.getByText("Health update from Clinic, nothing to do.")).toBeInTheDocument();
    expect(screen.getByText("Security notice from Bank.")).toBeInTheDocument();
  });

  it("shows an English For You reason unchanged", () => {
    render(
      <InboxSummary
        threads={[
          {
            id: "lab-en",
            subject: "Lab results",
            shortDisplayTitle: "Lab results",
            summary: "Results are in the portal.",
            status: "informational",
            importance: "medium",
            importanceReason: "Lab results are ready in the portal.",
            category: "personal_health",
            sender: "Clinic",
            latestMessageAt: "2026-09-10T10:00:00.000Z",
          },
        ]}
      />,
    );

    expandCategory(/Personal & Health/);
    expect(screen.getByText("Lab results are ready in the portal.")).toBeInTheDocument();
    expect(screen.queryByText("Health update from Clinic, nothing to do.")).not.toBeInTheDocument();
  });

  it("uses the mailbox subject when the model did not return a title", () => {
    render(
      <InboxSummary
        threads={[
          {
            id: "thread-2",
            subject: "Invoice 1042",
            shortDisplayTitle: null,
            summary: null,
            status: "informational",
            importance: null,
            importanceReason: null,
            category: null,
            sender: null,
            latestMessageAt: "2026-09-10T10:00:00.000Z",
          },
        ]}
      />,
    );

    expandCategory(/Other/);
    expect(screen.getByText("Invoice 1042")).toBeInTheDocument();
    expect(screen.queryByText("Thread")).not.toBeInTheDocument();
  });

  it("does not render the literal string null as a primary title", () => {
    render(
      <InboxSummary
        threads={[
          {
            id: "thread-3",
            subject: "Board packet",
            shortDisplayTitle: "null",
            summary: "undefined",
            status: "informational",
            importance: "low",
            importanceReason: null,
            category: "other",
            sender: null,
            latestMessageAt: "2026-09-10T10:00:00.000Z",
          },
        ]}
      />,
    );

    expandCategory(/Other/);
    expect(screen.getByText("Board packet")).toBeInTheDocument();
    expect(screen.queryByText(/^null$/i)).not.toBeInTheDocument();
  });

  it("renders Open and centers the short display title", () => {
    render(
      <InboxSummary
        threads={[
          {
            id: "thread-he",
            subject: "Invoices",
            shortDisplayTitle: "החשבוניות העדכניות שלך",
            summary: "Your latest invoices are ready.",
            status: "informational",
            importance: "medium",
            importanceReason: null,
            category: "finance",
            sender: null,
            latestMessageAt: "2026-09-10T10:00:00.000Z",
          },
        ]}
      />,
    );

    expandCategory(/Finance/);
    const open = screen.getByRole("link", { name: "Open" });
    expect(open).toHaveAttribute("href", "/thread/thread-he");
    const title = screen.getByRole("heading", { name: "החשבוניות העדכניות שלך" });
    const container = title.closest("[data-slot='mail-card-title']");
    expect(container).not.toBeNull();
    expect(container).toHaveClass("text-start");
    expect(container).not.toHaveClass("text-center");
    expect(container).toHaveClass("w-full");
    expect(title).toHaveAttribute("dir", "auto");
    expect(container).not.toHaveTextContent("Your latest invoices are ready.");
  });

  it("renders Open and centers the title on an Ignored card", () => {
    render(
      <InboxSummary
        threads={[
          {
            id: "thread-ignored",
            subject: "Weekly deals",
            shortDisplayTitle: "הניוזלטר השבועי",
            summary: "This week's promotions and product news.",
            status: "ignore",
            importance: "low",
            importanceReason: null,
            category: "newsletters_promotions",
            sender: null,
            latestMessageAt: "2026-09-10T10:00:00.000Z",
          },
        ]}
      />,
    );

    expandCategory(/Newsletters & Promotions/);
    const open = screen.getByRole("link", { name: "Open" });
    expect(open).toHaveAttribute("href", "/thread/thread-ignored");
    const title = screen.getByRole("heading", { name: "הניוזלטר השבועי" });
    const container = title.closest("[data-slot='mail-card-title']");
    expect(container).not.toBeNull();
    expect(container).toHaveClass("text-start");
    expect(container).not.toHaveClass("text-center");
    expect(container).toHaveClass("w-full");
    expect(title).toHaveAttribute("dir", "auto");
    expect(container).not.toHaveTextContent("This week's promotions and product news.");
    expect(screen.getByRole("link", { name: "Open in Gmail" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move to" })).toBeInTheDocument();
  });
});
