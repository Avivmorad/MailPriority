"use client";

import Link from "next/link";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";

import { GroupedActionList } from "@/components/actions/grouped-action-list";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { MailRefineFilters } from "@/components/mail/refine-filters";
import { InboxSummary } from "@/components/threads/inbox-summary";
import { buttonVariants } from "@/components/ui/button";
import type { ActionListItem } from "@/lib/actions/action-list-item";
import { normalizeCategory } from "@/lib/ai/categories";
import type { Importance } from "@/lib/ai/schemas";
import {
  applyMailRefinements,
  categoryFilterCounts,
  filterByPriority,
  filterBySignal,
  isStaleWaiting,
  isUncertainClassification,
  mailRefinementPhrase,
  parseCategoryFilter,
  parsePriorityFilter,
  parseSignalFilter,
  parseUncertainFilter,
  signalsPresent,
  type MailSignal,
} from "@/lib/mail/filters";
import type { MailFigures } from "@/lib/mail/mail-figures";
import { mailTabCardClass } from "@/lib/mail/tab-tones";
import {
  actionStatusForMailTab,
  MAIL_TABS,
  mailTabEmptyCopy,
  mailViewPath,
  parseMailTab,
  type MailTab,
} from "@/lib/mail/tabs";
import type { RecentThreadRow } from "@/lib/threads/recent-thread";
import { interactiveChipClass } from "@/lib/ui/interactive";
import { cn } from "@/lib/utils";

const MAIL_SECTION_GROUPS = [
  {
    label: "Work",
    items: [
      { id: "summary", hint: "Useful updates" },
      { id: "open", hint: "Needs a next step" },
      { id: "waiting", hint: "Waiting on someone else" },
    ],
  },
  {
    label: "Record",
    items: [
      { id: "completed", hint: "Tasks you finished" },
      { id: "snoozed", hint: "Postponed" },
      { id: "ignored", hint: "Noise and OTPs" },
    ],
  },
] as const;

export interface MailWorkspaceData {
  open: ActionListItem[];
  waiting: ActionListItem[];
  completed: ActionListItem[];
  snoozed: ActionListItem[];
  summary: RecentThreadRow[];
  ignored: RecentThreadRow[];
  failed: Partial<Record<MailTab, boolean>>;
  figures: MailFigures | null;
  needsGmailRecovery: boolean;
  recoveryLabel: string;
}

function sectionCount(tab: MailTab, figures: MailFigures | null): string {
  if (!figures) {
    return "—";
  }
  switch (tab) {
    case "summary":
      return String(figures.forYou);
    case "open":
      return String(figures.actions);
    case "waiting":
      return String(figures.pending);
    case "completed":
      return String(figures.closed);
    case "snoozed":
      return String(figures.snoozed);
    case "ignored":
      return String(figures.ignored);
  }
}

function tabDescription(tab: MailTab): string {
  switch (tab) {
    case "summary":
      return "Useful updates only. Receipts, OTPs, and marketing live in Ignored. Security events live in Actions.";
    case "open":
      return "Mail that still needs a next step, grouped by category.";
    case "waiting":
      return "You already acted. The ball is in someone else's court.";
    case "completed":
      return "Tasks you marked closed.";
    case "snoozed":
      return "Tasks you postponed. They return to Actions when the snooze ends.";
    case "ignored":
      return "Threads classified as ignore — noise, OTPs, and mail that is not a task.";
  }
}

function actionsForTab(tab: MailTab, data: MailWorkspaceData): ActionListItem[] {
  switch (tab) {
    case "open":
      return data.open;
    case "waiting":
      return data.waiting;
    case "completed":
      return data.completed;
    case "snoozed":
      return data.snoozed;
    default:
      return [];
  }
}

function readView(search: string): {
  tab: MailTab;
  category: ReturnType<typeof parseCategoryFilter>;
  priority: Importance | null;
  signal: MailSignal | null;
  uncertain: boolean;
} {
  const params = new URLSearchParams(search);
  return {
    tab: parseMailTab(params.get("tab")),
    category: parseCategoryFilter(params.get("category") ?? undefined),
    priority: parsePriorityFilter(params.get("priority") ?? undefined),
    signal: parseSignalFilter(params.get("signal") ?? undefined),
    uncertain: parseUncertainFilter(params.get("uncertain") ?? undefined),
  };
}

export function MailWorkspace({
  data,
  initialTab,
  initialCategory,
  initialPriority,
  initialSignal,
  initialUncertain,
}: {
  data: MailWorkspaceData;
  initialTab: MailTab;
  initialCategory: ReturnType<typeof parseCategoryFilter>;
  initialPriority: Importance | null;
  initialSignal: MailSignal | null;
  initialUncertain: boolean;
}) {
  const [view, setView] = useState({
    tab: initialTab,
    category: initialCategory,
    priority: initialPriority,
    signal: initialSignal,
    uncertain: initialUncertain,
  });

  useEffect(() => {
    function onPopState() {
      setView(readView(window.location.search));
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function showHref(href: string, history: "push" | "replace" = "push") {
    const next = readView(href.includes("?") ? href.slice(href.indexOf("?")) : "");
    setView(next);
    const url = href.startsWith("/mail") ? href : `/mail${href}`;
    if (history === "replace") {
      window.history.replaceState(null, "", url);
    } else {
      window.history.pushState(null, "", url);
    }
  }

  function onViewClick(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    showHref(href);
  }

  const { tab, category, priority, signal, uncertain: uncertainOnly } = view;
  const actionStatus = actionStatusForMailTab(tab);
  const empty = mailTabEmptyCopy(tab);
  const queryError = Boolean(data.failed[tab]);
  const actionItems = actionsForTab(tab, data);
  const summaryThreads = tab === "summary" ? data.summary : [];
  const ignoredThreads = tab === "ignored" ? data.ignored : [];
  const tabActions =
    uncertainOnly && actionStatus
      ? actionItems.filter((item) => isUncertainClassification(item.confidence))
      : actionItems;
  const refinements = { category, priority, signal };
  const refinementPhrase = mailRefinementPhrase(refinements);
  const visibleItems = applyMailRefinements(tabActions, refinements);
  const visibleSummary = applyMailRefinements(data.summary, refinements);
  const visibleIgnored = applyMailRefinements(data.ignored, refinements);
  const labelSource: Array<ActionListItem | RecentThreadRow> = actionStatus
    ? tabActions
    : tab === "summary"
      ? summaryThreads
      : ignoredThreads;
  const scopedSource = filterByPriority(filterBySignal(labelSource, signal), priority);
  const labelOptions = categoryFilterCounts(scopedSource, category);
  const signalOptions = signalsPresent(labelSource);
  const refinedActions = applyMailRefinements(actionItems, refinements);
  const uncertainCount = refinedActions.filter((item) =>
    isUncertainClassification(item.confidence),
  ).length;
  const viewPath = (
    patch: {
      tab?: MailTab;
      category?: ReturnType<typeof parseCategoryFilter>;
      priority?: Importance | null;
      signal?: MailSignal | null;
      uncertain?: boolean;
    } = {},
  ) =>
    mailViewPath({
      tab: patch.tab ?? tab,
      category: patch.category === undefined ? category : patch.category,
      priority: patch.priority === undefined ? priority : patch.priority,
      signal: patch.signal === undefined ? signal : patch.signal,
      uncertain: patch.uncertain ?? uncertainOnly,
    });
  const clearRefinementsPath = viewPath({ category: null, priority: null, signal: null });
  const categoryHrefFor = (item: ActionListItem | RecentThreadRow) =>
    viewPath({
      category: normalizeCategory(item.category),
    });
  const staleWaitingCount =
    tab === "waiting" ? visibleItems.filter((item) => isStaleWaiting(item.updatedAt)).length : 0;
  const tabLabel = MAIL_TABS.find((entry) => entry.id === tab)?.label ?? "this tab";
  const filteredEmpty = refinementPhrase
    ? {
        title: "No matching mail in this view.",
        description: `Nothing in ${tabLabel} matches ${refinementPhrase}.`,
      }
    : null;
  const emptyAction: ReactNode = data.needsGmailRecovery ? (
    <a href="/api/gmail/connect?returnTo=/mail" className={buttonVariants({ size: "sm" })}>
      {data.recoveryLabel}
    </a>
  ) : (
    <Link href="/scan" className={buttonVariants({ size: "sm" })}>
      Scan now
    </Link>
  );
  const listEmptyAction: ReactNode = refinementPhrase ? (
    <a
      href={clearRefinementsPath}
      onClick={(event) => onViewClick(event, clearRefinementsPath)}
      className={buttonVariants({ size: "sm", variant: "outline" })}
    >
      Clear filters
    </a>
  ) : (
    emptyAction
  );
  const listKey = `${category ? `-${category}` : ""}${priority ? `-p-${priority}` : ""}${signal ? `-s-${signal}` : ""}`;

  return (
    <>
      <PageHeader title="Mail" description={tabDescription(tab)} />
      <nav
        aria-label="Mail views"
        className="flex min-w-0 items-stretch gap-2 overflow-x-auto pb-1 sm:gap-3"
      >
        {MAIL_SECTION_GROUPS.map((group, index) => (
          <div key={group.label} className="flex shrink-0 items-stretch gap-2 sm:gap-3">
            {index > 0 ? <div className="bg-border w-px shrink-0" aria-hidden /> : null}
            <div className="flex gap-2">
              {group.items.map((item) => {
                const meta = MAIL_TABS.find((entry) => entry.id === item.id);
                const active = tab === item.id;
                const href = viewPath({ tab: item.id });
                return (
                  <a
                    key={item.id}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    onClick={(event) => onViewClick(event, href)}
                    className={cn(
                      interactiveChipClass,
                      "flex w-[7.25rem] shrink-0 flex-col rounded-xl px-3 py-2.5 sm:w-36",
                      mailTabCardClass(item.id, active),
                    )}
                  >
                    <span className="flex min-w-0 items-center justify-between gap-2 sm:gap-3">
                      <span className={cn("min-w-0 truncate text-sm", active && "font-semibold")}>
                        {meta?.label}
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">
                        {sectionCount(item.id, data.figures)}
                      </span>
                    </span>
                    <span className="mt-1 line-clamp-2 text-xs leading-snug break-words text-current/80">
                      {item.hint}
                    </span>
                  </a>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      {queryError ? (
        <EmptyState
          variant="error"
          title={`Could not load ${tab === "open" ? "actions" : tab === "waiting" ? "pending tasks" : tab === "summary" ? "summary threads" : tab === "ignored" ? "ignored mail" : "tasks"}`}
          description="We had trouble reaching the database. Reload to try again. Your mailbox data is safe."
          action={
            <Link href={viewPath()} className={buttonVariants({ size: "sm", variant: "outline" })}>
              Reload view
            </Link>
          }
        />
      ) : (
        <>
          <MailRefineFilters
            tab={tab}
            categoryOptions={labelOptions}
            category={category}
            priority={priority}
            signal={signal}
            signals={signalOptions}
            uncertain={uncertainOnly}
            onSelect={(href) => showHref(href)}
          />
          {refinementPhrase ? (
            <p className="text-muted-foreground text-sm">
              Showing {refinementPhrase} in this tab.{" "}
              <a
                href={clearRefinementsPath}
                onClick={(event) => onViewClick(event, clearRefinementsPath)}
                className="text-primary font-medium hover:underline"
              >
                Clear filters
              </a>
            </p>
          ) : null}
          {actionStatus && (uncertainCount > 0 || uncertainOnly) ? (
            <p className="text-muted-foreground text-sm">
              {uncertainOnly ? (
                <>
                  Showing {visibleItems.length} uncertain{" "}
                  {visibleItems.length === 1 ? "classification" : "classifications"}.{" "}
                  <a
                    href={viewPath({ uncertain: false })}
                    onClick={(event) => onViewClick(event, viewPath({ uncertain: false }))}
                    className="text-primary font-medium hover:underline"
                  >
                    Show all
                  </a>
                </>
              ) : (
                <>
                  {uncertainCount} classification{uncertainCount === 1 ? " is" : "s are"} uncertain.{" "}
                  <a
                    href={viewPath({ uncertain: true })}
                    onClick={(event) => onViewClick(event, viewPath({ uncertain: true }))}
                    className="text-primary font-medium hover:underline"
                  >
                    Show uncertain only
                  </a>
                </>
              )}
            </p>
          ) : null}
          {staleWaitingCount > 0 ? (
            <p className="text-muted-foreground text-sm">
              {staleWaitingCount} pending item{staleWaitingCount === 1 ? " has" : "s have"} been
              quiet for a week or more.
            </p>
          ) : null}
          {tab === "summary" ? (
            <InboxSummary
              threads={visibleSummary}
              storageKey={`mail-summary${listKey}`}
              emptyTitle={filteredEmpty?.title ?? empty.title}
              emptyDescription={filteredEmpty?.description ?? empty.description}
              emptyAction={listEmptyAction}
              categoryHrefFor={(thread) => categoryHrefFor(thread)}
            />
          ) : null}
          {tab === "ignored" ? (
            <InboxSummary
              threads={visibleIgnored}
              storageKey={`mail-ignored${listKey}`}
              emptyTitle={filteredEmpty?.title ?? empty.title}
              emptyDescription={filteredEmpty?.description ?? empty.description}
              emptyAction={listEmptyAction}
              categoryHrefFor={(thread) => categoryHrefFor(thread)}
            />
          ) : null}
          {actionStatus ? (
            <GroupedActionList
              items={visibleItems}
              storageKey={`mail-${tab}${listKey}${uncertainOnly ? "-uncertain" : ""}`}
              emptyTitle={
                filteredEmpty
                  ? filteredEmpty.title
                  : uncertainOnly
                    ? "No uncertain classifications in this view."
                    : empty.title
              }
              emptyDescription={
                filteredEmpty
                  ? filteredEmpty.description
                  : uncertainOnly
                    ? "Threads the classifier is unsure about would appear here so you can double-check them."
                    : empty.description
              }
              emptyAction={listEmptyAction}
              categoryHrefFor={(item) => categoryHrefFor(item)}
            />
          ) : null}
        </>
      )}
    </>
  );
}
