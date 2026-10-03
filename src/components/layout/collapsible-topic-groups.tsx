"use client";

import { ChevronDown } from "lucide-react";
import { useMemo, type ReactNode } from "react";

import { ACTION_TOPIC_LABELS, type ActionTopic } from "@/lib/actions/topics";
import { toggleCollapsedId } from "@/lib/ui/collapsed-state";
import { useCollapsedIds } from "@/lib/ui/use-collapsed-ids";
import { cn } from "@/lib/utils";

export interface CollapsibleTopicGroup {
  topic: ActionTopic;
  count: number;
  body: ReactNode;
}

export function CollapsibleTopicGroups({
  storageKey,
  groups,
  variant = "plain",
}: {
  storageKey: string;
  groups: CollapsibleTopicGroup[];
  variant?: "plain" | "panel";
}) {
  const topicIds = useMemo(() => groups.map((group) => group.topic), [groups]);
  const [collapsed, setCollapsed] = useCollapsedIds(storageKey, { defaultIds: topicIds });

  const allCollapsed = topicIds.length > 0 && topicIds.every((id) => collapsed.includes(id));

  function setAll(nextCollapsed: boolean) {
    setCollapsed(nextCollapsed ? topicIds : []);
  }

  return (
    <div className="space-y-3">
      {groups.length > 1 ? (
        <div className="flex justify-end">
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-sm text-sm font-medium hover:underline focus-visible:ring-3 focus-visible:outline-none"
            onClick={() => setAll(!allCollapsed)}
          >
            {allCollapsed ? "Expand all" : "Collapse all"}
          </button>
        </div>
      ) : null}
      <div className="space-y-4">
        {groups.map((group) => {
          const open = !collapsed.includes(group.topic);
          const panelId = `${storageKey.replace(/[^a-zA-Z0-9_-]/g, "-")}-${group.topic}-panel`;
          return (
            <section
              key={group.topic}
              className={cn(
                variant === "panel" &&
                  "bg-card ring-foreground/10 overflow-hidden rounded-xl ring-1",
              )}
            >
              <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                className={cn(
                  "text-foreground hover:bg-muted/60 focus-visible:ring-ring flex w-full items-center gap-2 px-1 py-2 text-start text-sm font-semibold tracking-tight transition-colors focus-visible:ring-3 focus-visible:outline-none",
                  variant === "panel" && "px-4 py-2.5",
                  variant === "panel" && open && "border-b",
                )}
                onClick={() => setCollapsed(toggleCollapsedId(collapsed, group.topic, open))}
              >
                <ChevronDown
                  className={cn(
                    "text-muted-foreground size-4 shrink-0 transition-transform duration-200",
                    open ? "rotate-0" : "-rotate-90",
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 font-bold break-words" dir="auto">
                  {ACTION_TOPIC_LABELS[group.topic]}
                </span>
                <span className="text-muted-foreground tabular-nums">{group.count}</span>
                <span className="text-muted-foreground ms-auto text-xs font-normal">
                  {open ? "Hide" : "Show"}
                </span>
              </button>
              {open ? (
                <div id={panelId} className={cn(variant === "panel" ? "" : "space-y-3 pt-1")}>
                  {group.body}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
