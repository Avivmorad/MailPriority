import { describe, expect, it } from "vitest";

import { tagClassName, tagHint, tagLabel, tagMarkerClass, isVisibleTag } from "@/lib/ui/tags";

describe("tagLabel", () => {
  it("uses product copy for status and category", () => {
    expect(tagLabel("status", "action_required")).toBe("Actions");
    expect(tagLabel("category", "projects_development")).toBe("Projects & Development");
    expect(tagLabel("category", "account")).toBe("Security");
    expect(tagLabel("action", "follow_up")).toBe("Follow up");
  });
});

describe("tagHint", () => {
  it("explains status, importance, urgency, and action tags", () => {
    expect(tagHint("status", "action_required")).toMatch(/next step/i);
    expect(tagHint("importance", "high")).toMatch(/priority/i);
    expect(tagHint("urgency", "soon")).toMatch(/soon/i);
    expect(tagHint("action", "pay")).toMatch(/payment/i);
  });

  it("does not explain category tags", () => {
    expect(tagHint("category", "finance")).toBeNull();
    expect(tagHint("category", "security")).toBeNull();
  });
});

describe("tagClassName", () => {
  it("keeps category and action chips neutral", () => {
    expect(tagClassName("category", "finance")).toBe(tagClassName("action", "pay"));
    expect(tagClassName("category", "security")).toContain("bg-muted");
    expect(tagClassName("action", "schedule")).not.toMatch(/fuchsia|purple|red|orange/);
  });

  it("washes email states without a saturated fill", () => {
    expect(tagClassName("status", "action_required")).toContain("bg-state-actions");
    expect(tagClassName("status", "waiting")).toContain("bg-state-pending");
    expect(tagClassName("status", "informational")).toContain("bg-state-fyi");
    expect(tagClassName("status", "resolved")).toContain("bg-muted");
    expect(tagClassName("status", "ignore")).toContain("bg-muted");
  });

  it("maps urgency and importance onto the five shared marker tokens", () => {
    expect(tagMarkerClass("urgency", "urgent")).toBe("bg-urgency-high");
    expect(tagMarkerClass("urgency", "expired")).toBe("bg-urgency-high");
    expect(tagMarkerClass("urgency", "soon")).toBe("bg-urgency-medium");
    expect(tagMarkerClass("importance", "medium")).toBe("bg-urgency-medium");
    expect(tagMarkerClass("urgency", "normal")).toBe("bg-urgency-low");
    expect(tagMarkerClass("urgency", "later")).toBe("bg-urgency-low");
    expect(tagMarkerClass("urgency", "none")).toBe("bg-urgency-none");
    expect(tagMarkerClass("urgency", "not-a-level")).toBe("bg-urgency-unknown");
    expect(tagMarkerClass("category", "finance")).toBe("bg-urgency-unknown");
    expect(tagMarkerClass("action", "pay")).toBeNull();
    expect(tagClassName("urgency", "urgent")).toContain("bg-muted");
    expect(tagClassName("importance", "high")).toContain("bg-muted");
  });
});

describe("isVisibleTag", () => {
  it("hides empty and none action, but shows none urgency", () => {
    expect(isVisibleTag("action", "none")).toBe(false);
    expect(isVisibleTag("urgency", "none")).toBe(true);
    expect(isVisibleTag("category", "finance")).toBe(true);
    expect(isVisibleTag("status", null)).toBe(false);
  });
});
