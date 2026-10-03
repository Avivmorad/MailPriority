/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MailRefineFilters } from "@/components/mail/refine-filters";

afterEach(() => {
  cleanup();
});

describe("MailRefineFilters", () => {
  it("does not render one card per category", () => {
    render(
      <MailRefineFilters
        tab="open"
        category={null}
        priority={null}
        signal={null}
        signals={["medium", "pay", "reply"]}
        categoryOptions={[
          { category: "finance", count: 2 },
          { category: "travel_transport", count: 1 },
          { category: "official_legal", count: 1 },
        ]}
      />,
    );

    const category = screen.getByRole("combobox", { name: "Category" });
    expect(category.tagName).toBe("SELECT");
    expect([...category.querySelectorAll("option")].map((option) => option.textContent)).toEqual([
      "All categories",
      "Finance",
      "Travel & Transport",
      "Official, Legal & Insurance",
    ]);
    expect(screen.queryByRole("link", { name: "Finance" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Official, Legal & Insurance/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Priority" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Medium priority" })).toHaveTextContent("Medium");
    expect(screen.getByRole("group", { name: "Signal" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Urgency: Medium" }).className).not.toContain(
      "w-[7.25rem]",
    );
  });

  it("clears an active category from the menu and keeps the tab", () => {
    render(
      <MailRefineFilters
        tab="waiting"
        category="finance"
        priority="medium"
        signal={null}
        signals={[]}
        categoryOptions={[
          { category: "finance", count: 1 },
          { category: "career", count: 1 },
        ]}
      />,
    );

    const category = screen.getByRole("combobox", { name: "Category" });
    expect(category).toHaveValue("finance");
    const career = [...category.querySelectorAll("option")].find(
      (option) => option.textContent === "Career",
    );
    expect(career).toBeTruthy();
    expect(screen.getByRole("link", { name: "Medium priority" })).toHaveAttribute(
      "href",
      "/mail?tab=waiting&category=finance",
    );
  });
});
