import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  const titleClass = "text-foreground text-2xl font-bold tracking-tight sm:text-3xl";
  const descriptionClass =
    "text-muted-foreground max-w-prose text-sm leading-relaxed text-pretty sm:text-base";

  if (!action) {
    return (
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl min-w-0">
          <h1 className={cn(titleClass, "text-balance")}>{title}</h1>
          {description ? <p className={cn(descriptionClass, "mt-2")}>{description}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className={cn(titleClass, "whitespace-nowrap")}>{title}</h1>
        <div className="w-full shrink-0 sm:w-auto">{action}</div>
      </div>
      {description ? <p className={descriptionClass}>{description}</p> : null}
    </div>
  );
}
