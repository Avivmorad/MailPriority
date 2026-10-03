/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CollapsibleBlock } from "@/components/layout/collapsible-block";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("CollapsibleBlock", () => {
  it("starts minimized and expands on click", () => {
    render(
      <CollapsibleBlock storageKey="dashboard-actions" title="Actions" description="Top actions.">
        <p>Pay the invoice</p>
      </CollapsibleBlock>,
    );

    const header = screen.getByRole("button", { name: /Actions/ });
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Pay the invoice")).not.toBeInTheDocument();

    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Pay the invoice")).toBeVisible();
  });
});
