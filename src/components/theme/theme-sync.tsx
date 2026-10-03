"use client";

import { useLayoutEffect } from "react";

import { applyTheme, readStoredTheme, THEME_STORAGE_KEY } from "@/lib/ui/theme";

/**
 * Keeps the document theme aligned with storage + system preference.
 *
 * On mount we re-apply from localStorage so a hydration pass that rewrote
 * `<html className>` cannot leave the UI stuck on the wrong scheme.
 */
export function ThemeSync() {
  useLayoutEffect(() => {
    applyTheme(readStoredTheme());

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onMediaChange = () => {
      if (readStoredTheme() === "system") {
        applyTheme("system");
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) {
        applyTheme(readStoredTheme());
      }
    };

    media.addEventListener("change", onMediaChange);
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", onMediaChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return null;
}
