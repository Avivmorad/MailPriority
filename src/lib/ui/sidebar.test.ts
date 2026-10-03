import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  clampSidebarWidth,
  parseSidebarCollapsed,
  parseSidebarWidth,
  serializeSidebarCollapsed,
  serializeSidebarWidth,
  SIDEBAR_COLLAPSED_PAD_CLASS,
  SIDEBAR_COLLAPSED_WIDTH_CLASS,
  SIDEBAR_EXPANDED_PAD_CLASS,
  SIDEBAR_EXPANDED_WIDTH_CLASS,
  SIDEBAR_LABEL_FALLBACK_PX,
  SIDEBAR_MAX_WIDTH_RATIO,
  SIDEBAR_STORAGE_KEY,
  SIDEBAR_TOGGLE_CLASS,
  SIDEBAR_TOGGLE_ICON_CLASS,
  SIDEBAR_WIDTH_COLLAPSED,
  SIDEBAR_WIDTH_EXPANDED,
  SIDEBAR_WIDTH_STORAGE_KEY,
  sidebarDefaultWidthPx,
  sidebarMinWidthPx,
} from "@/lib/ui/sidebar";

describe("sidebar collapsed preference", () => {
  it("uses a namespaced storage key", () => {
    expect(SIDEBAR_STORAGE_KEY).toBe("mailpilot.sidebar-collapsed");
  });

  it("exposes rem-based CSS variable width classes so pad and rail stay in sync", () => {
    expect(SIDEBAR_WIDTH_EXPANDED).toBe("15rem");
    expect(SIDEBAR_WIDTH_COLLAPSED).toBe("4.75rem");
    expect(SIDEBAR_COLLAPSED_WIDTH_CLASS).toContain("--app-sidebar-width-collapsed");
    expect(SIDEBAR_COLLAPSED_PAD_CLASS).toContain("--app-sidebar-width-collapsed");
    expect(SIDEBAR_EXPANDED_WIDTH_CLASS).toContain("--app-sidebar-width-expanded");
    expect(SIDEBAR_EXPANDED_PAD_CLASS).toContain("--app-sidebar-width-expanded");
    expect(SIDEBAR_COLLAPSED_WIDTH_CLASS.replace("lg:w-", "")).toBe(
      SIDEBAR_COLLAPSED_PAD_CLASS.replace("lg:pl-", ""),
    );
    expect(SIDEBAR_EXPANDED_WIDTH_CLASS.replace("lg:w-", "")).toBe(
      SIDEBAR_EXPANDED_PAD_CLASS.replace("lg:pl-", ""),
    );
  });

  it("parses known collapsed values and treats anything else as expanded", () => {
    expect(parseSidebarCollapsed("1")).toBe(true);
    expect(parseSidebarCollapsed("true")).toBe(true);
    expect(parseSidebarCollapsed("collapsed")).toBe(true);
    expect(parseSidebarCollapsed("0")).toBe(false);
    expect(parseSidebarCollapsed("false")).toBe(false);
    expect(parseSidebarCollapsed(null)).toBe(false);
    expect(parseSidebarCollapsed(undefined)).toBe(false);
    expect(parseSidebarCollapsed("")).toBe(false);
  });

  it("serializes a stable localStorage value", () => {
    expect(serializeSidebarCollapsed(true)).toBe("1");
    expect(serializeSidebarCollapsed(false)).toBe("0");
  });
});

describe("sidebar chevron control", () => {
  it("uses one shared size for collapse and expand", () => {
    expect(SIDEBAR_TOGGLE_CLASS).toBe("sidebar-toggle");
    expect(SIDEBAR_TOGGLE_ICON_CLASS).toBe("size-4");

    const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
    const toggleStart = css.indexOf(".sidebar-toggle {");
    const iconStart = css.indexOf(".sidebar-toggle svg");
    expect(toggleStart).toBeGreaterThan(-1);
    expect(iconStart).toBeGreaterThan(toggleStart);
    const toggleBlock = css.slice(toggleStart, iconStart);
    expect(toggleBlock).toContain("width: 2.25rem;");
    expect(toggleBlock).toContain("height: 2.25rem;");
    expect(toggleBlock).toContain("min-width: 2.25rem;");
    expect(toggleBlock).toContain("max-width: 2.25rem;");
    expect(toggleBlock).toContain("min-height: 2.25rem;");
    expect(toggleBlock).toContain("max-height: 2.25rem;");
    const iconBlock = css.slice(iconStart, css.indexOf(".sidebar-toggle:hover"));
    expect(iconBlock).toContain("width: 1rem;");
    expect(iconBlock).toContain("height: 1rem;");
    expect(toggleBlock).toContain("box-shadow: none");
  });
});

describe("sidebar resize width", () => {
  const dashboardLabelPx = 100;
  const rootFontPx = 16;
  const labelMin = sidebarMinWidthPx(dashboardLabelPx, rootFontPx);
  const viewportPx = 1000;

  it("stores width separately from the collapsed flag", () => {
    expect(SIDEBAR_WIDTH_STORAGE_KEY).toBe("mailpilot.sidebar-width");
    expect(SIDEBAR_WIDTH_STORAGE_KEY).not.toBe(SIDEBAR_STORAGE_KEY);
    expect(parseSidebarWidth("420")).toBe(420);
    expect(parseSidebarWidth("420.4")).toBe(420.4);
    expect(parseSidebarWidth("0")).toBeNull();
    expect(parseSidebarWidth("nope")).toBeNull();
    expect(parseSidebarWidth(null)).toBeNull();
    expect(serializeSidebarWidth(420.2)).toBe("420");
    expect(sidebarDefaultWidthPx(rootFontPx)).toBe(240);
    expect(SIDEBAR_MAX_WIDTH_RATIO).toBe(0.5);
  });

  it("sizes the minimum from the widest label so Dashboard stays on one line", () => {
    expect(labelMin).toBeGreaterThan(dashboardLabelPx);
    expect(labelMin).toBeGreaterThan(Number.parseFloat(SIDEBAR_WIDTH_COLLAPSED) * rootFontPx);
    expect(sidebarMinWidthPx(0, rootFontPx)).toBe(
      sidebarMinWidthPx(SIDEBAR_LABEL_FALLBACK_PX, rootFontPx),
    );
    expect(sidebarMinWidthPx(dashboardLabelPx, rootFontPx)).toBeLessThan(
      sidebarMinWidthPx(dashboardLabelPx + 40, rootFontPx),
    );
  });

  it("clamps resize to [label min, 50vw] and does not collapse", () => {
    const collapsedPx = Number.parseFloat(SIDEBAR_WIDTH_COLLAPSED) * rootFontPx;

    expect(clampSidebarWidth(0, { minPx: labelMin, viewportPx })).toBe(labelMin);
    expect(clampSidebarWidth(collapsedPx, { minPx: labelMin, viewportPx })).toBe(labelMin);
    expect(clampSidebarWidth(labelMin - 1, { minPx: labelMin, viewportPx })).toBe(labelMin);
    expect(clampSidebarWidth(10_000, { minPx: labelMin, viewportPx })).toBe(
      viewportPx * SIDEBAR_MAX_WIDTH_RATIO,
    );
    expect(clampSidebarWidth(320, { minPx: labelMin, viewportPx })).toBe(320);
    expect(clampSidebarWidth(Number.NaN, { minPx: labelMin, viewportPx })).toBe(labelMin);
    expect(clampSidebarWidth(10, { minPx: labelMin, viewportPx: labelMin })).toBe(labelMin);
  });
});
