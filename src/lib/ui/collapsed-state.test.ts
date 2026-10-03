import { describe, expect, it } from "vitest";

import {
  collapsedStorageKey,
  parseCollapsedIds,
  serializeCollapsedIds,
  toggleCollapsedId,
} from "@/lib/ui/collapsed-state";

describe("collapsed state", () => {
  it("builds a namespaced storage key", () => {
    expect(collapsedStorageKey("open-tasks")).toBe("mailpilot.collapsed.v2.open-tasks");
  });

  it("parses a JSON string list and ignores junk", () => {
    expect(parseCollapsedIds('["security","payments"]')).toEqual(["security", "payments"]);
    expect(parseCollapsedIds("not-json")).toEqual([]);
    expect(parseCollapsedIds('{"security":true}')).toEqual([]);
  });

  it("toggles ids without duplicates", () => {
    expect(toggleCollapsedId(["security"], "payments", true)).toEqual(["security", "payments"]);
    expect(toggleCollapsedId(["security", "payments"], "security", false)).toEqual(["payments"]);
    expect(serializeCollapsedIds(["security", "security"])).toBe('["security"]');
  });
});
