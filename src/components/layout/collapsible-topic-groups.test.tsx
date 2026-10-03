/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CollapsibleTopicGroups } from "@/components/layout/collapsible-topic-groups";
import { collapsedStorageKey } from "@/lib/ui/collapsed-state";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("CollapsibleTopicGroups", () => {
  it("wraps a long topic name instead of truncating it", () => {
    render(
      <CollapsibleTopicGroups
        storageKey="topic-wrap"
        groups={[{ topic: "official_legal", count: 2, body: <p>Details</p> }]}
      />,
    );

    const heading = screen.getByRole("button", { name: /Official, Legal & Insurance/ });
    const title = heading.querySelector("span[dir='auto']");
    expect(title?.textContent).toBe("Official, Legal & Insurance");
    expect(title?.className).toContain("break-words");
    expect(title?.className).not.toContain("truncate");
  });

  it("starts each category minimized and remembers an expand", () => {
    const storageKey = "mail-open";
    const { unmount } = render(
      <CollapsibleTopicGroups
        storageKey={storageKey}
        groups={[
          { topic: "finance", count: 1, body: <p>Pay the invoice</p> },
          { topic: "security", count: 1, body: <p>Review the login</p> },
        ]}
      />,
    );

    const finance = screen.getByRole("button", { name: /Finance/ });
    const security = screen.getByRole("button", { name: /Security/ });
    expect(finance).toHaveAttribute("aria-expanded", "false");
    expect(security).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Pay the invoice")).not.toBeInTheDocument();
    expect(screen.queryByText("Review the login")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand all" })).toBeInTheDocument();

    fireEvent.click(finance);
    expect(finance).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Pay the invoice")).toBeInTheDocument();
    unmount();

    render(
      <CollapsibleTopicGroups
        storageKey={storageKey}
        groups={[
          { topic: "finance", count: 1, body: <p>Pay the invoice</p> },
          { topic: "security", count: 1, body: <p>Review the login</p> },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: /Finance/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("button", { name: /Security/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(window.localStorage.getItem(collapsedStorageKey(storageKey))).toBe('["security"]');
  });
});
