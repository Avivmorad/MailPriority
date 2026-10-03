export const SIDEBAR_STORAGE_KEY = "mailpilot.sidebar-collapsed";

/** Resized expanded width in CSS pixels. Independent of the collapsed flag. */
export const SIDEBAR_WIDTH_STORAGE_KEY = "mailpilot.sidebar-width";

/**
 * One hit target for collapse and expand. Size lives in `.sidebar-toggle`
 * (globals.css) so the two states cannot drift.
 */
export const SIDEBAR_TOGGLE_CLASS = "sidebar-toggle";

/** Icon box inside the shared toggle. Direction is a transform, not a second size. */
export const SIDEBAR_TOGGLE_ICON_CLASS = "size-4";

/** Expanded rail may grow to half the viewport, never past it. */
export const SIDEBAR_MAX_WIDTH_RATIO = 0.5;

/**
 * Horizontal chrome around a nav label, excluding the label text.
 * Matches AppHeader: icon `size-4` (1rem) + `gap-2.5` (0.625rem) + link `px-3`
 * (1.5rem) + nav `lg:px-3` (1.5rem). The 1px border is added in pixels.
 */
export const SIDEBAR_NAV_CHROME_REM = 4.625;
export const SIDEBAR_NAV_BORDER_PX = 1;

/**
 * Used when label text cannot be measured (SSR or a 0-width probe).
 * Wide enough that "Dashboard" stays on one line at text-sm.
 */
export const SIDEBAR_LABEL_FALLBACK_PX = 120;

/**
 * Desktop sidebar widths as rem-based CSS variables (see globals.css).
 * Prefer these over hard-coded Tailwind width utilities so the rail and the
 * main content offset stay in sync at every browser zoom level.
 */
export const SIDEBAR_WIDTH_EXPANDED = "15rem";
export const SIDEBAR_WIDTH_COLLAPSED = "4.75rem";

/** Desktop sidebar rail width when minimized. */
export const SIDEBAR_COLLAPSED_WIDTH_CLASS = "lg:w-[var(--app-sidebar-width-collapsed)]";

/** Desktop sidebar width when expanded. */
export const SIDEBAR_EXPANDED_WIDTH_CLASS = "lg:w-[var(--app-sidebar-width-expanded)]";

/** Main content offset matching collapsed rail. */
export const SIDEBAR_COLLAPSED_PAD_CLASS = "lg:pl-[var(--app-sidebar-width-collapsed)]";

/** Main content offset matching expanded rail. */
export const SIDEBAR_EXPANDED_PAD_CLASS = "lg:pl-[var(--app-sidebar-width-expanded)]";

export function parseSidebarCollapsed(raw: string | null | undefined): boolean {
  return raw === "1" || raw === "true" || raw === "collapsed";
}

export function serializeSidebarCollapsed(collapsed: boolean): string {
  return collapsed ? "1" : "0";
}

export function parseSidebarWidth(raw: string | null | undefined): number | null {
  if (raw == null || raw.trim() === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

export function serializeSidebarWidth(widthPx: number): string {
  return String(Math.round(widthPx));
}

/** Default expanded width (`15rem`) in CSS pixels at the current root font size. */
export function sidebarDefaultWidthPx(rootFontPx: number): number {
  const font = rootFontPx > 0 ? rootFontPx : 16;
  return Number.parseFloat(SIDEBAR_WIDTH_EXPANDED) * font;
}

/**
 * Smallest expanded width that keeps `widestLabelPx` on one line.
 * Falls back to {@link SIDEBAR_LABEL_FALLBACK_PX} when the probe measures 0.
 */
export function sidebarMinWidthPx(widestLabelPx: number, rootFontPx: number): number {
  const font = Number.isFinite(rootFontPx) && rootFontPx > 0 ? rootFontPx : 16;
  const label =
    Number.isFinite(widestLabelPx) && widestLabelPx > 0 ? widestLabelPx : SIDEBAR_LABEL_FALLBACK_PX;
  return Math.ceil(label + SIDEBAR_NAV_CHROME_REM * font + SIDEBAR_NAV_BORDER_PX);
}

/**
 * Clamp a drag width to [label minimum, 50vw].
 * Never returns the collapsed rail width — minimize stays on the chevron.
 * When half the viewport is narrower than the label minimum, the label minimum wins.
 */
export function clampSidebarWidth(
  widthPx: number,
  bounds: { minPx: number; viewportPx: number },
): number {
  const lower = Math.ceil(Math.max(0, bounds.minPx));
  const maxPx = bounds.viewportPx * SIDEBAR_MAX_WIDTH_RATIO;
  const upper = Number.isFinite(maxPx) ? Math.floor(maxPx) : lower;
  if (upper < lower) return lower;
  if (!Number.isFinite(widthPx)) return lower;
  return Math.min(upper, Math.max(lower, Math.round(widthPx)));
}

export function readRootFontPx(): number {
  if (typeof document === "undefined") return 16;
  const parsed = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 16;
}

/** Widest nav label in CSS pixels. Returns 0 when the probe cannot be measured. */
export function measureWidestSidebarLabelPx(labels: readonly string[]): number {
  if (typeof document === "undefined" || labels.length === 0) return 0;
  const probe = document.createElement("span");
  probe.dataset.sidebarLabelProbe = "true";
  probe.style.cssText = [
    "position:absolute",
    "left:-9999px",
    "top:0",
    "visibility:hidden",
    "white-space:nowrap",
    "font-size:0.875rem",
    "font-weight:500",
    "letter-spacing:normal",
  ].join(";");
  document.body.appendChild(probe);
  let widest = 0;
  try {
    for (const label of labels) {
      probe.textContent = label;
      widest = Math.max(widest, probe.getBoundingClientRect().width);
    }
  } finally {
    probe.remove();
  }
  return widest;
}
