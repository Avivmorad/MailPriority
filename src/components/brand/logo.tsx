import { cn } from "@/lib/utils";

export interface LogoProps {
  className?: string;
  showWordmark?: boolean;
  /** Ellipsize the wordmark when the parent row is narrower than the label. */
  truncateWordmark?: boolean;
}

/**
 * Product logo: an inbox mark with a triage checkmark, plus the wordmark.
 */
export function Logo({ className, showWordmark = true, truncateWordmark = false }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg
        viewBox="0 0 24 24"
        role="img"
        aria-label="MailPriority logo"
        className="text-primary size-6 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 13h4l2 3h4l2-3h4" />
        <path d="M5 13 7 5h10l2 8" />
        <path d="m9.5 8.5 1.5 1.5 3-3" />
      </svg>
      {showWordmark ? (
        <span
          className={cn(
            "text-base font-bold tracking-tight text-inherit",
            truncateWordmark && "min-w-0 truncate",
          )}
        >
          MailPriority
        </span>
      ) : null}
    </span>
  );
}
