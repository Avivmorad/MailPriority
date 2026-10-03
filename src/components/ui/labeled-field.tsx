import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function LabeledField({
  label,
  children,
  dir,
  className,
  valueClassName,
}: {
  label: string;
  children: ReactNode;
  dir?: "auto";
  className?: string;
  valueClassName?: string;
}) {
  return (
    <p
      className={cn(
        "min-w-0 text-sm leading-relaxed [overflow-wrap:anywhere] break-words",
        className,
      )}
    >
      <span className="text-muted-foreground">{label}: </span>
      <span className={cn("text-foreground", valueClassName)} dir={dir}>
        {children}
      </span>
    </p>
  );
}
