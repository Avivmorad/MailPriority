import { describe, expect, it } from "vitest";

import {
  humanizeToken,
  urgencyLevel,
  accentForUrgency,
  labelForDirection,
  labelForScanStatus,
  labelForThreadStatus,
} from "@/lib/ui/labels";

describe("humanizeToken", () => {
  it("maps known product tokens to readable copy", () => {
    expect(labelForThreadStatus("action_required")).toBe("Actions");
    expect(labelForThreadStatus("waiting")).toBe("Pending");
    expect(labelForThreadStatus("WAITING")).toBe("Pending");
    expect(labelForScanStatus("RUNNING")).toBe("In progress");
    expect(labelForDirection("INBOUND")).toBe("Received");
    expect(labelForDirection("OUTBOUND")).toBe("Sent by you");
  });

  it("title-cases unknown snake_case values", () => {
    expect(humanizeToken("needs_review")).toBe("Needs review");
    expect(humanizeToken("expired")).toBe("Expired");
    expect(humanizeToken("later")).toBe("Later");
    expect(humanizeToken("projects_development")).toBe("Projects & Development");
  });

  it("returns empty string for missing values", () => {
    expect(humanizeToken(null)).toBe("");
  });
});

describe("urgency levels", () => {
  it.each([
    ["urgent", "high", "urgency-high"],
    ["expired", "high", "urgency-high"],
    ["soon", "medium", "urgency-medium"],
    ["normal", "low", "urgency-low"],
    ["later", "low", "urgency-low"],
    ["none", "none", "urgency-none"],
    [null, "unknown", "urgency-unknown"],
    ["invalid", "unknown", "urgency-unknown"],
  ])("maps %s to %s with a %s side marker", (stored, level, color) => {
    expect(urgencyLevel(stored)).toBe(level);
    expect(accentForUrgency(stored)).toContain(`border-l-${color}`);
  });
});
