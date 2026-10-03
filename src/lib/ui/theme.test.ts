import { afterEach, describe, expect, it } from "vitest";

import {
  applyTheme,
  parseStoredTheme,
  syncDocumentTheme,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  themeIsDark,
} from "@/lib/ui/theme";
import { mockMatchMedia } from "@/test/match-media";

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.className = "";
  document.documentElement.style.colorScheme = "";
});

describe("theme", () => {
  it("parses stored preferences and defaults to system", () => {
    expect(parseStoredTheme("dark")).toBe("dark");
    expect(parseStoredTheme("light")).toBe("light");
    expect(parseStoredTheme("system")).toBe("system");
    expect(parseStoredTheme("nope")).toBe("system");
    expect(parseStoredTheme(null)).toBe("system");
    expect(THEME_STORAGE_KEY).toBe("mailpilot.theme");
  });

  it("resolves system preference to dark or light", () => {
    expect(themeIsDark("dark", false)).toBe(true);
    expect(themeIsDark("light", true)).toBe(false);
    expect(themeIsDark("system", true)).toBe(true);
    expect(themeIsDark("system", false)).toBe(false);
  });

  it("derives the inline theme bootstrap storage key from the shared constant", () => {
    expect(THEME_INIT_SCRIPT).toContain(`var k=${JSON.stringify(THEME_STORAGE_KEY)}`);
    expect(THEME_INIT_SCRIPT).not.toContain("${");
  });

  it("documents that assigning html className wipes a sibling dark class", () => {
    document.documentElement.classList.add("h-full", "antialiased", "dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    // Mirrors React hydration writing the server `className` string onto <html>.
    document.documentElement.setAttribute("class", "h-full antialiased");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("syncDocumentTheme restores dark without depending on React className", () => {
    document.documentElement.setAttribute("class", "h-full antialiased");
    const dark = syncDocumentTheme("dark", false);
    expect(dark).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("h-full")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("applyTheme persists preference and updates the document", () => {
    mockMatchMedia(true);

    expect(applyTheme("light")).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    expect(applyTheme("dark")).toBe(true);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
