import type { MailTab } from "@/lib/mail/tabs";

/**
 * Mail view chips keep their existing border weight. Unselected stays neutral;
 * selected uses the shared blue highlight. Status meaning stays in the label.
 */
const MAIL_TAB_IDLE =
  "border-2 border-border bg-muted text-foreground hover:bg-[color-mix(in_srgb,var(--muted),var(--foreground)_8%)] aria-disabled:opacity-50";
const MAIL_TAB_SELECTED = "border-2 border-ring bg-accent text-accent-foreground";

export function mailTabCardClass(_tab: MailTab, selected: boolean): string {
  return selected ? MAIL_TAB_SELECTED : MAIL_TAB_IDLE;
}
