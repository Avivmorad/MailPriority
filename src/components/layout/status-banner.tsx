import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import type { AppBanner } from "@/lib/ui/status-banner";
import { cn } from "@/lib/utils";

const KIND_CLASS: Record<AppBanner["kind"], string> = {
  info: "border-ring/40 bg-accent text-foreground",
  warning: "border-urgency-medium/40 bg-state-actions text-foreground",
  error: "border-destructive/30 bg-destructive/10 text-foreground",
};

export function StatusBanner({ kind, title, body, href, actionLabel }: AppBanner) {
  return (
    <div
      className={cn("border-b px-4 py-3.5 sm:px-6", KIND_CLASS[kind])}
      role={kind === "error" ? "alert" : "status"}
      aria-live={kind === "error" ? "assertive" : "polite"}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium tracking-tight">{title}</p>
          <p className="text-muted-foreground mt-0.5 text-sm leading-relaxed text-pretty">{body}</p>
        </div>
        {href && actionLabel ? (
          href.startsWith("/api/") ? (
            <a
              href={href}
              className={cn(buttonVariants({ size: "sm" }), "min-h-10 shrink-0 px-3 sm:min-h-8")}
            >
              {actionLabel}
            </a>
          ) : (
            <Link
              href={href}
              className={cn(buttonVariants({ size: "sm" }), "min-h-10 shrink-0 px-3 sm:min-h-8")}
            >
              {actionLabel}
            </Link>
          )
        ) : null}
      </div>
    </div>
  );
}
