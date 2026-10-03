/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { ActionItemCard } from "@/components/actions/action-item-card";
import type { ActionListItem } from "@/lib/actions/action-list-item";

afterEach(() => {
  cleanup();
});

const item: ActionListItem = {
  id: "action-1",
  threadId: "thread-he",
  status: "OPEN",
  title: "החשבוניות העדכניות שלך",
  description: null,
  actionSummary: "Download the latest invoices.",
  actionReason: null,
  importanceReason: null,
  waitingFor: null,
  snoozedUntil: null,
  deadline: null,
  urgency: null,
  latestMessageAt: "2026-09-10T10:00:00.000Z",
  importance: "medium",
  summary: "Your latest invoices are ready.",
  sender: "Billing",
  gmailUrl: "https://mail.google.com/mail/u/0/#inbox/abc",
  category: "finance",
  actionType: null,
  confidence: 0.9,
  updatedAt: "2026-09-10T10:00:00.000Z",
};

describe("ActionItemCard", () => {
  it("renders Open and left-aligns the title on an Actions card", () => {
    render(<ActionItemCard item={item} />);

    const open = screen.getByRole("link", { name: "Open" });
    expect(open).toHaveAttribute("href", "/thread/thread-he");
    expect(open.className).toContain("ui-interactive");
    expect(open.className).not.toContain("shadow-none");
    const title = screen.getByRole("heading", { name: "החשבוניות העדכניות שלך" });
    const container = title.closest("[data-slot='mail-card-title']");
    expect(container).not.toBeNull();
    expect(container).toHaveClass("text-start");
    expect(container).not.toHaveClass("text-center");
    expect(container).toHaveClass("w-full");
    expect(title).toHaveAttribute("dir", "auto");
    const sender = screen.getByText("Billing");
    expect(sender.tagName).toBe("STRONG");
    expect(sender.className).toContain("font-bold");
  });

  it("shows Open, Open in Gmail, and Move to, and reveals pending-on from the menu", () => {
    render(
      <ActionItemCard
        item={{
          ...item,
          sender: "Vercel",
          title: "Review the production deployment",
          actionType: "reply",
        }}
      />,
    );

    const sender = screen.getByText("Vercel");
    expect(sender.tagName).toBe("STRONG");
    expect(sender.className).toContain("font-bold");
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute("href", "/thread/thread-he");
    expect(screen.getByRole("link", { name: "Open in Gmail" })).toHaveAttribute(
      "href",
      item.gmailUrl,
    );
    expect(screen.getByRole("button", { name: "Move to" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Closed" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pending" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "No action" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Pending on")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Move to" }));
    expect(screen.queryByRole("button", { name: "Closed" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pending" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Pending" }));
    expect(screen.getByLabelText("Pending on")).toBeInTheDocument();
    expect(screen.queryByLabelText("Snooze for")).not.toBeInTheDocument();
  });

  it("saves Move to Pending through the existing wait action", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/feedback")) {
        return new Response(JSON.stringify({ applied: true, actionId: "action-1" }), {
          status: 200,
        });
      }
      expect(url).toBe("/api/actions/action-1");
      expect(init?.method).toBe("PATCH");
      expect(JSON.parse(String(init?.body))).toEqual({ op: "wait", waitingFor: "Ada" });
      return new Response(JSON.stringify({ action: { id: "action-1" } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ActionItemCard item={{ ...item, sender: "Vercel" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Move to" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Pending" }));
    fireEvent.change(screen.getByLabelText("Pending on"), { target: { value: "Ada" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Pending on updated.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("does not show a Hebrew stored reason and uses the English fallback", () => {
    render(
      <ActionItemCard
        item={{
          ...item,
          title: "חשבונית פתוחה",
          actionSummary: "שלם את החשבונית",
          actionReason: "נותר תשלום",
          importanceReason: "חשבונית שלא שולמה",
          summary: "סיכום בעברית",
          deadline: "2026-10-03",
          urgency: "soon",
          actionType: "pay",
          category: "finance",
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "חשבונית פתוחה" })).toBeInTheDocument();
    expect(screen.queryByText("שלם את החשבונית")).not.toBeInTheDocument();
    expect(screen.queryByText("נותר תשלום")).not.toBeInTheDocument();
    expect(screen.queryByText("חשבונית שלא שולמה")).not.toBeInTheDocument();
    expect(screen.getAllByText("Payment needed, due 3 Oct.").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Do:")).toBeInTheDocument();
    expect(screen.getByText("Why this tab:")).toBeInTheDocument();
  });

  it("shows an English Do line and Why this tab reason unchanged", () => {
    render(
      <ActionItemCard
        item={{
          ...item,
          title: "Open invoice",
          actionSummary: "Pay the remaining balance.",
          actionReason: "Unpaid invoice is still open.",
          importanceReason: "A payment is due.",
          summary: "Invoice still open.",
          deadline: "2026-10-03",
          actionType: "pay",
        }}
      />,
    );

    expect(screen.getByText("Pay the remaining balance.")).toBeInTheDocument();
    expect(screen.getByText("Unpaid invoice is still open.")).toBeInTheDocument();
    expect(screen.queryByText("Payment needed, due 3 Oct.")).not.toBeInTheDocument();
  });
});
