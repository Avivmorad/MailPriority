"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { toggleCollapsedId } from "@/lib/ui/collapsed-state";
import { useCollapsedIds } from "@/lib/ui/use-collapsed-ids";
import { cn } from "@/lib/utils";

const SECTION_ID = "self";

export function CollapsibleBlock({
  storageKey,
  title,
  description,
  action,
  children,
}: {
  storageKey: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useCollapsedIds(storageKey, { defaultIds: [SECTION_ID] });
  const open = !collapsed.includes(SECTION_ID);
  const panelId = `${storageKey.replace(/[^a-zA-Z0-9_-]/g, "-")}-panel`;

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          className="hover:bg-muted/50 focus-visible:ring-ring -ms-2 min-w-0 flex-1 rounded-lg px-2 py-1 text-start transition-colors focus-visible:ring-3 focus-visible:outline-none"
          onClick={() => setCollapsed(toggleCollapsedId(collapsed, SECTION_ID, open))}
        >
          <span className="flex items-center gap-2">
            <ChevronDown
              className={cn(
                "text-muted-foreground size-4 shrink-0 transition-transform duration-200",
                open ? "rotate-0" : "-rotate-90",
              )}
              aria-hidden
            />
            <span className="text-foreground text-lg font-bold tracking-tight">{title}</span>
            <span className="text-muted-foreground text-xs font-normal">
              {open ? "Hide" : "Show"}
            </span>
          </span>
          {description ? (
            <p className="text-muted-foreground mt-0.5 ps-6 text-sm">{description}</p>
          ) : null}
        </button>
        {action}
      </div>
      {open ? <div id={panelId}>{children}</div> : <div id={panelId} hidden />}
    </section>
  );
}
