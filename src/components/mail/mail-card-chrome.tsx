import type { ReactNode } from "react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Full-width title. `text-start` keeps the line on the leading edge.
 * `dir="auto"` on the heading keeps Hebrew reading order.
 */
export function MailCardTitle({
  title,
  children,
  className,
}: {
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("w-full min-w-0 text-start", className)} data-slot="mail-card-title">
      <h3
        className="text-foreground text-start text-base leading-snug font-semibold tracking-tight [overflow-wrap:anywhere] break-words"
        dir="auto"
        title={title}
      >
        {children ?? title}
      </h3>
    </div>
  );
}

export function MailOpenLink({ href }: { href: string }) {
  return (
    <Link href={href} className={buttonVariants()}>
      Open
    </Link>
  );
}

export function MailGmailLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={buttonVariants({ variant: "outline" })}
    >
      Open in Gmail
    </a>
  );
}
