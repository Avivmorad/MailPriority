/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { InboxOverviewHeader } from "@/components/dashboard/inbox-overview-header";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  push.mockReset();
});

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("InboxOverviewHeader", () => {
  it("renders Scan Now beside the Inbox overview title", () => {
    render(<InboxOverviewHeader description="Actions, Pending, and For You." />);

    const heading = screen.getByRole("heading", { level: 1, name: "Inbox overview" });
    expect(heading.className).toContain("whitespace-nowrap");
    expect(heading.parentElement?.className).toContain("flex-col");
    expect(heading.parentElement?.className).toContain("sm:flex-row");

    const button = screen.getByRole("button", { name: "Scan Now" });
    expect(button).toBeEnabled();
    expect(button.className).toContain("ui-interactive");
    expect(button.className).toContain("h-14");
    expect(button.className).not.toContain("h-11");
    expect(button.className).toContain("text-lg");
    expect(button.className).not.toContain("text-sm");
    expect(button.className).toContain("shadow-none");
    expect(button.className).toContain("bg-primary");
    expect(button.className).not.toMatch(/shadow-(xs|sm|md|lg|xl|2xl)/);
    expect(button.className).not.toMatch(/drop-shadow/);
  });

  it("starts the default lookback scan and opens the Scan tab", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ scanId: "scan-1", status: "RUNNING" }, 202));
    vi.stubGlobal("fetch", fetchMock);

    render(<InboxOverviewHeader description="Actions, Pending, and For You." />);
    fireEvent.click(screen.getByRole("button", { name: "Scan Now" }));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/scan");
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/scans",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ lookbackDays: 7 }),
      }),
    );
    expect(screen.getByRole("button", { name: "Scan Now" })).toBeInTheDocument();
  });

  it("opens the Scan tab when a scan is already running", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: "scan_in_progress",
            message: "A scan is already running for this Gmail account.",
          },
          409,
        ),
      ),
    );

    render(<InboxOverviewHeader description="A scan is running." />);
    fireEvent.click(screen.getByRole("button", { name: "Scan Now" }));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/scan");
    });
  });

  it("asks the user to sign in again when the scan request is unauthorized", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "not_signed_in" }, 401)),
    );

    render(<InboxOverviewHeader description="Actions, Pending, and For You." />);
    fireEvent.click(screen.getByRole("button", { name: "Scan Now" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Sign in again to scan.");
    expect(screen.getByRole("button", { name: "Scan Now" })).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
  });

  it("keeps the Scan Now label and shows an error when the scan does not start", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "rate_limited" }, 429)));

    render(<InboxOverviewHeader description="Actions, Pending, and For You." />);
    fireEvent.click(screen.getByRole("button", { name: "Scan Now" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/wait two minutes/i);
    expect(screen.getByRole("button", { name: "Scan Now" })).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
  });
});
