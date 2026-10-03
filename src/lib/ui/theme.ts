export const THEME_STORAGE_KEY = "mailpilot.theme";

export type ThemePreference = "light" | "dark" | "system";

export function parseStoredTheme(raw: string | null | undefined): ThemePreference {
  if (raw === "light" || raw === "dark" || raw === "system") {
    return raw;
  }
  return "system";
}

export function themeIsDark(preference: ThemePreference, systemDark: boolean): boolean {
  if (preference === "dark") {
    return true;
  }
  if (preference === "light") {
    return false;
  }
  return systemDark;
}

/**
 * Blocking bootstrap for `<head>`. Must run before hydration: React owns any
 * `className` prop on `<html>` and will replace the attribute wholesale, which
 * wipes a `dark` class the script added onto the same node.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var t=localStorage.getItem(k);var dark=t==="dark"||((t==="system"||!t)&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",dark);document.documentElement.style.colorScheme=dark?"dark":"light";}catch(e){}})();`;

export function syncDocumentTheme(preference: ThemePreference, systemDark?: boolean): boolean {
  const dark = themeIsDark(
    preference,
    systemDark ?? window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  return dark;
}

export function applyTheme(preference: ThemePreference): boolean {
  window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  return syncDocumentTheme(preference);
}

export function readStoredTheme(): ThemePreference {
  return parseStoredTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
}
