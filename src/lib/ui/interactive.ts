/**
 * Shared clickable affordance classes for the authenticated app shell.
 * Hover motion and the resting drop shadow live in globals.css `.ui-interactive`.
 * Prefer these helpers over one-off hover stacks so buttons, nav, and
 * dashboard card-links stay one design language.
 */

/** Cursor + focus ring + shared click depth (see `.ui-interactive`). */
export const interactiveControlClass =
  "ui-interactive cursor-pointer focus-visible:ring-ring focus-visible:ring-3 focus-visible:outline-none";

/**
 * Wrapping Link for dense Inbox now tiles — hover lift + focus live on the control.
 */
export const interactiveCardLinkClass =
  "ui-interactive block min-w-0 cursor-pointer rounded-xl focus-visible:ring-ring focus-visible:ring-3 focus-visible:outline-none";

/** Inner Card surface for navigational tiles (background hover only). */
export const interactiveCardClass =
  "hover:bg-muted/40 h-full min-w-0 cursor-pointer transition-[background-color] duration-150";

/** Mail view / label filter chips that act as segmented controls. */
export const interactiveChipClass =
  "ui-interactive focus-visible:ring-ring cursor-pointer focus-visible:ring-3 focus-visible:outline-none";

/** Unselected filter: neutral fill, shared border, slightly stronger hover. */
export const filterChipIdleClass =
  "border-border bg-muted text-foreground hover:bg-[color-mix(in_srgb,var(--muted),var(--foreground)_8%)] aria-disabled:opacity-50";

/** Selected filter: the same blue highlight on every screen. */
export const filterChipActiveClass = "border-ring bg-accent text-accent-foreground";

/** Sidebar / primary nav link chrome (hover lift on top of active styles). */
export const interactiveNavClass =
  "ui-interactive focus-visible:ring-ring cursor-pointer focus-visible:ring-3 focus-visible:outline-none active:translate-y-px";
