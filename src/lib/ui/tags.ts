import { CATEGORY_LABELS, normalizeCategory } from "@/lib/ai/categories";
import { humanizeToken, urgencyLevel } from "@/lib/ui/labels";

export const TAG_KINDS = ["category", "status", "importance", "urgency", "action"] as const;
export type TagKind = (typeof TAG_KINDS)[number];

const TAG_CLASS: Record<string, string> = {
  "urgency:high":
    "border-transparent bg-red-500/20 text-red-800 dark:bg-red-400/15 dark:text-red-100",
  "urgency:medium":
    "border-transparent bg-orange-500/15 text-orange-800 dark:bg-orange-400/20 dark:text-orange-100",
  "urgency:low":
    "border-transparent bg-green-500/20 text-green-800 dark:bg-green-400/15 dark:text-green-100",
  "urgency:none":
    "border-transparent bg-gray-500/15 text-gray-800 dark:bg-gray-400/20 dark:text-gray-100",
  "urgency:unknown":
    "border-transparent bg-blue-500/15 text-blue-800 dark:bg-blue-400/20 dark:text-blue-100",
  "status:action_required":
    "border-transparent bg-red-500/15 text-red-800 dark:bg-red-400/20 dark:text-red-100",
  "status:waiting":
    "border-transparent bg-amber-500/20 text-amber-950 dark:bg-amber-400/20 dark:text-amber-100",
  "status:informational":
    "border-transparent bg-sky-500/15 text-sky-900 dark:bg-sky-400/20 dark:text-sky-100",
  "status:resolved":
    "border-transparent bg-green-500/15 text-green-900 dark:bg-green-400/20 dark:text-green-100",
  "status:ignore":
    "border-transparent bg-zinc-500/15 text-zinc-700 dark:bg-zinc-400/20 dark:text-zinc-200",

  "importance:high":
    "border-transparent bg-violet-500/15 text-violet-900 dark:bg-violet-400/20 dark:text-violet-100",
  "importance:medium":
    "border-transparent bg-orange-500/20 text-orange-950 dark:bg-orange-400/20 dark:text-orange-100",
  "importance:low":
    "border-transparent bg-stone-500/15 text-stone-700 dark:bg-stone-400/20 dark:text-stone-200",

  "urgency:urgent":
    "border-transparent bg-rose-500/15 text-rose-800 dark:bg-rose-400/20 dark:text-rose-100",
  "urgency:expired":
    "border-transparent bg-red-800/15 text-red-950 dark:bg-red-500/25 dark:text-red-100",
  "urgency:soon":
    "border-transparent bg-yellow-400/25 text-yellow-950 dark:bg-yellow-300/20 dark:text-yellow-100",
  "urgency:later":
    "border-transparent bg-lime-500/20 text-lime-950 dark:bg-lime-400/20 dark:text-lime-100",
  "urgency:normal":
    "border-transparent bg-indigo-500/15 text-indigo-900 dark:bg-indigo-400/20 dark:text-indigo-100",

  "action:reply":
    "border-transparent bg-teal-500/15 text-teal-900 dark:bg-teal-400/20 dark:text-teal-100",
  "action:review":
    "border-transparent bg-blue-500/15 text-blue-900 dark:bg-blue-400/20 dark:text-blue-100",
  "action:approve":
    "border-transparent bg-lime-600/15 text-lime-950 dark:bg-lime-500/20 dark:text-lime-100",
  "action:schedule":
    "border-transparent bg-fuchsia-500/15 text-fuchsia-900 dark:bg-fuchsia-400/20 dark:text-fuchsia-100",
  "action:submit":
    "border-transparent bg-blue-800/15 text-blue-950 dark:bg-blue-500/25 dark:text-blue-100",
  "action:pay":
    "border-transparent bg-emerald-700/15 text-emerald-950 dark:bg-emerald-400/20 dark:text-emerald-100",
  "action:sign":
    "border-transparent bg-amber-800/15 text-amber-950 dark:bg-amber-500/20 dark:text-amber-100",
  "action:download":
    "border-transparent bg-cyan-700/15 text-cyan-950 dark:bg-cyan-400/20 dark:text-cyan-100",
  "action:follow_up":
    "border-transparent bg-pink-500/15 text-pink-900 dark:bg-pink-400/20 dark:text-pink-100",
  "action:other":
    "border-transparent bg-slate-500/15 text-slate-800 dark:bg-slate-400/20 dark:text-slate-100",

  "category:finance":
    "border-transparent bg-emerald-500/15 text-emerald-900 dark:bg-emerald-400/20 dark:text-emerald-100",
  "category:security":
    "border-transparent bg-red-600/15 text-red-950 dark:bg-red-500/25 dark:text-red-100",
  "category:career":
    "border-transparent bg-indigo-600/15 text-indigo-950 dark:bg-indigo-400/25 dark:text-indigo-100",
  "category:education":
    "border-transparent bg-sky-600/15 text-sky-950 dark:bg-sky-400/25 dark:text-sky-100",
  "category:projects_development":
    "border-transparent bg-violet-600/15 text-violet-950 dark:bg-violet-400/25 dark:text-violet-100",
  "category:travel_transport":
    "border-transparent bg-cyan-500/15 text-cyan-900 dark:bg-cyan-400/20 dark:text-cyan-100",
  "category:shopping_orders":
    "border-transparent bg-orange-600/15 text-orange-950 dark:bg-orange-400/25 dark:text-orange-100",
  "category:official_legal":
    "border-transparent bg-slate-600/15 text-slate-900 dark:bg-slate-400/25 dark:text-slate-100",
  "category:accounts_subscriptions":
    "border-transparent bg-teal-700/15 text-teal-950 dark:bg-teal-400/25 dark:text-teal-100",
  "category:personal_health":
    "border-transparent bg-rose-600/15 text-rose-950 dark:bg-rose-400/25 dark:text-rose-100",
  "category:social_feeds":
    "border-transparent bg-blue-600/15 text-blue-950 dark:bg-blue-400/25 dark:text-blue-100",
  "category:gaming_entertainment":
    "border-transparent bg-purple-500/15 text-purple-900 dark:bg-purple-400/20 dark:text-purple-100",
  "category:newsletters_promotions":
    "border-transparent bg-yellow-500/20 text-yellow-950 dark:bg-yellow-300/20 dark:text-yellow-100",
  "category:other":
    "border-transparent bg-neutral-500/15 text-neutral-800 dark:bg-neutral-400/20 dark:text-neutral-200",
};

const FALLBACK_CLASS = "border-transparent bg-muted text-muted-foreground";

export function tagColorClasses(): string[] {
  return Object.values(TAG_CLASS);
}

const TAG_HINT: Record<string, string> = {
  "urgency:high": "Urgency: high — urgent or overdue; handle this first.",
  "urgency:medium": "Urgency: medium — due soon.",
  "urgency:low": "Urgency: low — normal timing or a later deadline.",
  "urgency:none": "Urgency: none — no time-sensitive action identified.",
  "urgency:unknown": "Urgency: unknown — no valid urgency analysis is available.",
  "status:action_required": "Status: this thread still needs a next step from you.",
  "status:waiting": "Status: you already acted. The next step is on someone else.",
  "status:informational": "Status: useful to know, but nothing for you to do.",
  "status:resolved": "Status: this matter is finished.",
  "status:ignore": "Status: noise or mail that is not a task.",

  "importance:high": "Importance: high. Treat this as a priority.",
  "importance:medium": "Importance: medium. Worth noticing, not necessarily first.",
  "importance:low": "Importance: low. Background or routine mail.",

  "urgency:urgent": "Timing: due now or overdue — handle this first.",
  "urgency:expired": "Timing: the deadline has already passed.",
  "urgency:soon": "Timing: due soon.",
  "urgency:later": "Timing: there is a deadline, but not immediately.",
  "urgency:normal": "Timing: normal — not time-critical.",

  "action:reply": "Next step: reply to this thread.",
  "action:review": "Next step: review the mail or the details in it.",
  "action:approve": "Next step: approve a request.",
  "action:schedule": "Next step: pick, confirm, or decline a time.",
  "action:submit": "Next step: submit documents or information.",
  "action:pay": "Next step: a payment is still owed.",
  "action:sign": "Next step: a signature is requested.",
  "action:download": "Next step: download a file.",
  "action:follow_up": "Next step: follow up on this thread.",
  "action:other": "Next step: a concrete action that does not match the other types.",
};

export function normalizeTagValue(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, "_");
}

export function tagKey(kind: TagKind, value: string): string {
  const normalized = kind === "urgency" ? urgencyLevel(value) : normalizeTagValue(value);
  if (kind === "category") {
    return `${kind}:${normalizeCategory(normalized)}`;
  }
  return `${kind}:${normalized}`;
}

export function tagLabel(kind: TagKind, value: string): string {
  if (kind === "category") {
    return CATEGORY_LABELS[normalizeCategory(value)];
  }
  return kind === "urgency"
    ? `Urgency: ${humanizeToken(urgencyLevel(value))}`
    : humanizeToken(value);
}

export function tagClassName(kind: TagKind, value: string): string {
  return TAG_CLASS[tagKey(kind, value)] ?? FALLBACK_CLASS;
}

/** Category tags are self-explanatory; other kinds get a hover explanation. */
export function tagHint(kind: TagKind, value: string): string | null {
  if (kind === "category") {
    return null;
  }
  return TAG_HINT[tagKey(kind, value)] ?? `${humanizeToken(kind)}: ${humanizeToken(value)}.`;
}

export function isVisibleTag(kind: TagKind, value: string | null | undefined): value is string {
  if (!value || !value.trim()) {
    return false;
  }
  const normalized = normalizeTagValue(value);
  if (kind === "action") {
    return normalized !== "none";
  }
  return true;
}
