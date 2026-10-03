"use client";

import { useId, type MouseEvent } from "react";

import { CATEGORY_LABELS, type Category } from "@/lib/ai/categories";
import { IMPORTANCE_VALUES, type Importance } from "@/lib/ai/schemas";
import {
  MAIL_SIGNAL_VALUES,
  parseCategoryFilter,
  signalKind,
  type MailSignal,
} from "@/lib/mail/filters";
import { mailViewPath, type MailTab } from "@/lib/mail/tabs";
import {
  filterChipActiveClass,
  filterChipIdleClass,
  interactiveChipClass,
} from "@/lib/ui/interactive";
import { labelForImportance } from "@/lib/ui/labels";
import { tagLabel, tagMarkerClass, type TagKind } from "@/lib/ui/tags";
import { cn } from "@/lib/utils";

export function MailRefineFilters({
  tab,
  categoryOptions,
  category,
  priority,
  signal,
  signals,
  uncertain = false,
  onSelect,
}: {
  tab: MailTab;
  categoryOptions: Array<{ category: Category; count: number }>;
  category: Category | null;
  priority: Importance | null;
  signal: MailSignal | null;
  signals: MailSignal[];
  uncertain?: boolean;
  onSelect?: (href: string) => void;
}) {
  const categoryLabelId = useId();
  const signalOptions = MAIL_SIGNAL_VALUES.filter(
    (value) => value === signal || signals.includes(value),
  );
  const showCategory = categoryOptions.length > 0 || category !== null;

  function hrefFor(next: {
    category?: Category | null;
    priority?: Importance | null;
    signal?: MailSignal | null;
  }) {
    return mailViewPath({
      tab,
      category: next.category === undefined ? category : next.category,
      priority: next.priority === undefined ? priority : next.priority,
      signal: next.signal === undefined ? signal : next.signal,
      uncertain,
    });
  }

  function follow(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (!onSelect || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    onSelect(href);
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground pe-0.5 text-xs font-medium">Priority</span>
        <div role="group" aria-label="Priority" className="flex flex-wrap gap-1">
          {IMPORTANCE_VALUES.map((value) => {
            const active = priority === value;
            const label = labelForImportance(value);
            return (
              <a
                key={value}
                href={hrefFor({ priority: active ? null : value })}
                aria-current={active ? "true" : undefined}
                aria-label={`${label} priority`}
                onClick={(event) => follow(event, hrefFor({ priority: active ? null : value }))}
                className={cn(
                  interactiveChipClass,
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                  active ? cn(filterChipActiveClass, "font-semibold") : filterChipIdleClass,
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    tagMarkerClass("importance", value),
                  )}
                />
                {label}
              </a>
            );
          })}
        </div>
      </div>

      {signalOptions.length > 0 ? (
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="text-muted-foreground pe-0.5 text-xs font-medium">Signal</span>
          <div role="group" aria-label="Signal" className="flex flex-wrap gap-1">
            {signalOptions.map((value) => {
              const active = signal === value;
              const kind = signalTagKind(value);
              const label = tagLabel(kind, value);
              const marker = tagMarkerClass(kind, value);
              return (
                <a
                  key={value}
                  href={hrefFor({ signal: active ? null : value })}
                  aria-current={active ? "true" : undefined}
                  aria-label={label}
                  onClick={(event) => follow(event, hrefFor({ signal: active ? null : value }))}
                  className={cn(
                    interactiveChipClass,
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                    active ? cn(filterChipActiveClass, "font-semibold") : filterChipIdleClass,
                  )}
                >
                  {marker ? (
                    <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", marker)} />
                  ) : null}
                  {label}
                </a>
              );
            })}
          </div>
        </div>
      ) : null}

      {showCategory ? (
        <label className="flex items-center gap-1.5">
          <span id={categoryLabelId} className="text-muted-foreground text-xs font-medium">
            Category
          </span>
          <select
            aria-labelledby={categoryLabelId}
            className="border-input bg-background text-foreground h-8 max-w-56 rounded-lg border px-2 text-xs"
            value={category ?? ""}
            onChange={(event) => {
              onSelect?.(hrefFor({ category: parseCategoryFilter(event.target.value) }));
            }}
          >
            <option value="">All categories</option>
            {categoryOptions.map((option) => (
              <option key={option.category} value={option.category}>
                {CATEGORY_LABELS[option.category]}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}

function signalTagKind(signal: MailSignal): TagKind {
  const kind = signalKind(signal);
  if (kind === "urgency") {
    return "urgency";
  }
  if (kind === "status") {
    return "status";
  }
  return "action";
}
