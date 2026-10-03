import Link from "next/link";
import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { interactiveCardClass, interactiveCardLinkClass } from "@/lib/ui/interactive";
import { cn } from "@/lib/utils";

/**
 * Dense Inbox now tile: number + label with minimal padding.
 * When `href` is set the whole tile is a navigational control with hover lift.
 */
export function InboxStatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: ReactNode;
  href?: string;
}) {
  const card = (
    <Card
      size="sm"
      className={cn(
        "h-full min-w-0 justify-center gap-0 rounded-lg py-2",
        href ? interactiveCardClass : "shadow-xs",
      )}
    >
      <CardContent className="flex min-w-0 items-baseline gap-2 px-2.5 sm:px-3">
        <div className="text-lg leading-none font-semibold tracking-tight tabular-nums sm:text-xl">
          {value}
        </div>
        <div className="text-muted-foreground min-w-0 text-xs leading-snug break-words sm:text-sm">
          {label}
        </div>
      </CardContent>
    </Card>
  );

  if (!href) {
    return card;
  }

  return (
    <Link href={href} className={interactiveCardLinkClass}>
      {card}
    </Link>
  );
}
