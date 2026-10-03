import { z } from "zod";

import { CATEGORY_LABELS, CATEGORY_VALUES, isCategory, type Category } from "@/lib/ai/categories";
import { confidenceBand } from "@/lib/ai/post-process";
import { IMPORTANCE_VALUES, type Importance } from "@/lib/ai/schemas";
import { groupByTopic, topicForItem, type TopicableItem } from "@/lib/actions/topics";
import { STALE_WAITING_MS } from "@/lib/dashboard/changes";
import { displayUrgencyForDeadline } from "@/lib/ui/format";
import { labelForImportance, urgencyLevel } from "@/lib/ui/labels";
import { normalizeTagValue, tagLabel } from "@/lib/ui/tags";

export function isUncertainClassification(confidence: number | null | undefined): boolean {
  if (confidence == null || !Number.isFinite(confidence)) {
    return false;
  }
  return confidenceBand(confidence) !== "normal";
}

export function parseUncertainFilter(value: string | string[] | undefined): boolean {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "1" || raw === "true";
}

/** Category label from `?category=`, matching the Mail topic groups. */
export function parseCategoryFilter(value: string | string[] | undefined): Category | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) {
    return null;
  }
  const key = raw.trim().toLowerCase();
  return isCategory(key) ? key : null;
}

export function filterByCategory<T extends TopicableItem>(
  items: T[],
  category: Category | null,
): T[] {
  if (!category) {
    return items;
  }
  return items.filter((item) => topicForItem(item) === category);
}

export function categoryFilterCounts(
  items: TopicableItem[],
  active: Category | null,
): Array<{ category: Category; count: number }> {
  const counts = new Map(groupByTopic(items).map((group) => [group.topic, group.items.length]));
  if (active && !counts.has(active)) {
    counts.set(active, 0);
  }
  return CATEGORY_VALUES.filter((category) => counts.has(category)).map((category) => ({
    category,
    count: counts.get(category) ?? 0,
  }));
}

const priorityFilterSchema = z.enum(IMPORTANCE_VALUES);

/**
 * Closed-set chips that are not the six mail tabs and not priority.
 * Urgency is the five displayed levels (stored values and deadline proximity
 * fold into High, Medium, Low, None, or Unknown). Action type comes from the
 * classifier enum. `ignore` and `resolved` are status chips whose labels are
 * not the tab names.
 */
export const MAIL_SIGNAL_VALUES = [
  "high",
  "medium",
  "low",
  "none",
  "unknown",
  "reply",
  "pay",
  "review",
  "approve",
  "schedule",
  "submit",
  "sign",
  "download",
  "follow_up",
  "other",
  "ignore",
  "resolved",
] as const;

const mailSignalSchema = z.enum(MAIL_SIGNAL_VALUES);

export type MailSignal = z.infer<typeof mailSignalSchema>;

const URGENCY_SIGNALS = new Set<MailSignal>(["high", "medium", "low", "none", "unknown"]);
const STATUS_SIGNALS = new Set<MailSignal>(["ignore", "resolved"]);

export type MailRefinable = TopicableItem & {
  importance?: string | null;
  urgency?: string | null;
  deadline?: string | null;
  status?: string | null;
};

export type MailRefinements = {
  category: Category | null;
  priority: Importance | null;
  signal: MailSignal | null;
};

function firstQueryValue(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) {
    return null;
  }
  return raw
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");
}

/** Importance from `?priority=`. Medium means medium priority. */
export function parsePriorityFilter(value: string | string[] | undefined): Importance | null {
  const key = firstQueryValue(value);
  if (!key) {
    return null;
  }
  const parsed = priorityFilterSchema.safeParse(key);
  return parsed.success ? parsed.data : null;
}

/** Closed-set chip from `?signal=`. Unknown words are ignored. */
export function parseSignalFilter(value: string | string[] | undefined): MailSignal | null {
  const key = firstQueryValue(value);
  if (!key) {
    return null;
  }
  const parsed = mailSignalSchema.safeParse(key);
  return parsed.success ? parsed.data : null;
}

export function signalKind(signal: MailSignal): "urgency" | "action" | "status" {
  if (URGENCY_SIGNALS.has(signal)) {
    return "urgency";
  }
  if (STATUS_SIGNALS.has(signal)) {
    return "status";
  }
  return "action";
}

export function itemMatchesPriority(item: MailRefinable, priority: Importance): boolean {
  return normalizeTagValue(item.importance ?? "") === priority;
}

export function itemMatchesSignal(item: MailRefinable, signal: MailSignal): boolean {
  const kind = signalKind(signal);
  if (kind === "urgency") {
    return urgencyLevel(displayUrgencyForDeadline(item.deadline, item.urgency)) === signal;
  }
  if (kind === "status") {
    return normalizeTagValue(item.status ?? "") === signal;
  }
  return normalizeTagValue(item.actionType ?? "") === signal;
}

export function filterByPriority<T extends MailRefinable>(
  items: T[],
  priority: Importance | null,
): T[] {
  if (!priority) {
    return items;
  }
  return items.filter((item) => itemMatchesPriority(item, priority));
}

export function filterBySignal<T extends MailRefinable>(
  items: T[],
  signal: MailSignal | null,
): T[] {
  if (!signal) {
    return items;
  }
  return items.filter((item) => itemMatchesSignal(item, signal));
}

/** Signals that at least one row in this tab actually carries. */
export function signalsPresent(items: readonly MailRefinable[]): MailSignal[] {
  return MAIL_SIGNAL_VALUES.filter((signal) =>
    items.some((item) => itemMatchesSignal(item, signal)),
  );
}

/** Tab items narrowed by priority, signal, and category. Each filter is an AND. */
export function applyMailRefinements<T extends MailRefinable>(
  items: T[],
  filters: MailRefinements,
): T[] {
  return filterByCategory(
    filterByPriority(filterBySignal(items, filters.signal), filters.priority),
    filters.category,
  );
}

/** English list of the active refinements, such as "Medium priority and Finance". */
export function mailRefinementPhrase(filters: MailRefinements): string | null {
  const parts: string[] = [];
  if (filters.priority) {
    parts.push(`${labelForImportance(filters.priority)} priority`);
  }
  if (filters.signal) {
    parts.push(tagLabel(signalKind(filters.signal), filters.signal));
  }
  if (filters.category) {
    parts.push(CATEGORY_LABELS[filters.category]);
  }
  if (parts.length === 0) {
    return null;
  }
  if (parts.length === 1) {
    return parts[0] ?? null;
  }
  if (parts.length === 2) {
    return `${parts[0]} and ${parts[1]}`;
  }
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

export function isStaleWaiting(
  updatedAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!updatedAt) {
    return false;
  }
  const updated = Date.parse(updatedAt);
  return Number.isFinite(updated) && updated < now.getTime() - STALE_WAITING_MS;
}
