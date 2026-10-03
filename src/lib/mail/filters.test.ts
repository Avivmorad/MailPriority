import { describe, expect, it } from "vitest";

import {
  applyMailRefinements,
  categoryFilterCounts,
  filterByCategory,
  filterByPriority,
  filterBySignal,
  isStaleWaiting,
  isUncertainClassification,
  mailRefinementPhrase,
  parseCategoryFilter,
  parsePriorityFilter,
  parseSignalFilter,
  parseUncertainFilter,
  signalsPresent,
} from "@/lib/mail/filters";

describe("mail filters", () => {
  it("treats confidence below 0.8 as uncertain", () => {
    expect(isUncertainClassification(0.9)).toBe(false);
    expect(isUncertainClassification(0.7)).toBe(true);
    expect(isUncertainClassification(0.4)).toBe(true);
    expect(isUncertainClassification(null)).toBe(false);
  });

  it("parses the uncertain query flag", () => {
    expect(parseUncertainFilter("1")).toBe(true);
    expect(parseUncertainFilter("true")).toBe(true);
    expect(parseUncertainFilter("0")).toBe(false);
    expect(parseUncertainFilter(undefined)).toBe(false);
  });

  it("parses a category label and ignores unknown values", () => {
    expect(parseCategoryFilter("finance")).toBe("finance");
    expect(parseCategoryFilter(" Finance ")).toBe("finance");
    expect(parseCategoryFilter("account")).toBeNull();
    expect(parseCategoryFilter(["security"])).toBe("security");
    expect(parseCategoryFilter(undefined)).toBeNull();
  });

  it("filters a mail tab by the same topic label used for grouping", () => {
    const items = [
      { id: "invoice", category: "finance" },
      { id: "login", category: "other", summary: "בדוק את פעילות החשבון שלך ב-Linear" },
      { id: "job", category: "career" },
    ];
    expect(filterByCategory(items, "finance").map((item) => item.id)).toEqual(["invoice"]);
    expect(filterByCategory(items, null)).toHaveLength(3);
    expect(categoryFilterCounts(items, "education")).toEqual([
      { category: "finance", count: 1 },
      { category: "security", count: 1 },
      { category: "career", count: 1 },
      { category: "education", count: 0 },
    ]);
  });

  it("keeps only medium-priority mail for the medium filter", () => {
    const items = [
      { id: "invoice", importance: "medium", category: "finance", actionType: "pay" },
      { id: "hotel", importance: "high", category: "travel_transport", actionType: "reply" },
      { id: "course", importance: "Medium", category: "education" },
      { id: "note", importance: "low", category: "finance" },
    ];
    expect(parsePriorityFilter(" medium ")).toBe("medium");
    expect(parsePriorityFilter("med")).toBeNull();
    expect(filterByPriority(items, "medium").map((item) => item.id)).toEqual(["invoice", "course"]);
    expect(filterByPriority(items, null)).toHaveLength(4);
    expect(
      applyMailRefinements(items, {
        priority: "medium",
        category: "finance",
        signal: null,
      }).map((item) => item.id),
    ).toEqual(["invoice"]);
    expect(mailRefinementPhrase({ priority: "medium", category: null, signal: null })).toBe(
      "Medium priority",
    );
  });

  it("filters closed-set signals and ignores words that are not a signal", () => {
    const items = [
      {
        id: "invoice",
        importance: "medium",
        actionType: "pay",
        urgency: "soon",
        title: "Invoice",
      },
      {
        id: "hotel",
        importance: "high",
        actionType: "reply",
        urgency: "normal",
        title: "Please pay attention",
      },
      {
        id: "old",
        importance: "high",
        actionType: "review",
        urgency: "soon",
        deadline: "2020-01-01",
      },
      { id: "noise", importance: "low", status: "ignore", category: "other" },
    ];
    expect(parseSignalFilter("high")).toBe("high");
    expect(parseSignalFilter("soon")).toBeNull();
    expect(parseSignalFilter("follow-up")).toBe("follow_up");
    expect(parseSignalFilter("finance")).toBeNull();
    expect(filterBySignal(items, "pay").map((item) => item.id)).toEqual(["invoice"]);
    expect(filterBySignal(items, "medium").map((item) => item.id)).toEqual(["invoice"]);
    expect(filterBySignal(items, "low").map((item) => item.id)).toEqual(["hotel"]);
    expect(filterBySignal(items, "high").map((item) => item.id)).toEqual(["old"]);
    expect(filterBySignal(items, "ignore").map((item) => item.id)).toEqual(["noise"]);
    expect(signalsPresent(items)).toEqual(
      expect.arrayContaining(["high", "medium", "low", "reply", "pay", "review", "ignore"]),
    );
    expect(signalsPresent(items)).not.toContain("soon");
    expect(signalsPresent(items)).not.toContain("expired");
    expect(signalsPresent(items)).not.toContain("finance");
  });

  it("folds stored urgency and deadline proximity into the five displayed levels", () => {
    const items = [
      { id: "overdue", urgency: "soon", deadline: "2020-01-01" },
      { id: "now", urgency: "urgent" },
      { id: "week", urgency: "normal", deadline: "2099-01-01" },
      { id: "quiet", urgency: "none" },
      { id: "missing", urgency: null },
    ];
    expect(filterBySignal(items, "high").map((item) => item.id)).toEqual(["overdue", "now"]);
    expect(filterBySignal(items, "low").map((item) => item.id)).toEqual(["week"]);
    expect(filterBySignal(items, "none").map((item) => item.id)).toEqual(["quiet"]);
    expect(filterBySignal(items, "unknown").map((item) => item.id)).toEqual(["missing"]);
    expect(signalsPresent(items)).toEqual(["high", "low", "none", "unknown"]);
    expect(mailRefinementPhrase({ priority: null, category: null, signal: "high" })).toBe(
      "Urgency: High",
    );
  });

  it("flags waiting items that have not moved in a week", () => {
    const now = new Date("2026-09-12T12:00:00.000Z");
    expect(isStaleWaiting("2026-09-01T00:00:00.000Z", now)).toBe(true);
    expect(isStaleWaiting("2026-09-11T00:00:00.000Z", now)).toBe(false);
  });
});
