import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { InboxStatCard } from "@/components/dashboard/inbox-stat-card";

describe("InboxStatCard", () => {
  it("renders a navigational tile with hover affordance classes when href is set", () => {
    render(<InboxStatCard label="Actions" value="3" href="/mail?tab=open" />);
    const link = screen.getByRole("link", { name: /Actions/i });
    expect(link).toHaveAttribute("href", "/mail?tab=open");
    expect(link.className).toContain("cursor-pointer");
    expect(link.className).toContain("ui-interactive");
    expect(link.className).toContain("focus-visible:ring-3");
  });

  it("renders a static tile without a link when href is omitted", () => {
    const { container } = render(<InboxStatCard label="Important" value="1" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(container.querySelector(".ui-interactive")).toBeNull();
    expect(screen.getByText("Important")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });
});
