import { normalizeCategory, type Category } from "@/lib/ai/categories";
import type { MailTab } from "@/lib/mail/tabs";
import type { FeedbackKind } from "@/lib/threads/apply-feedback";
import { englishDisplayText, isEnglishDisplayText } from "@/lib/ui/display-text";
import { formatDate } from "@/lib/ui/format";

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

/** About one line in the mail list. */
const MAX_PLACEMENT_CHARS = 110;

const WEAK_REASONS = new Set([
  "needs a quick look",
  "classified during a prior scan",
  "email update",
  "the other party",
]);

const CATEGORY_NOUN: Record<Exclude<Category, "other">, string> = {
  finance: "Finance",
  security: "Security",
  career: "Career",
  education: "School",
  projects_development: "Project",
  travel_transport: "Travel",
  shopping_orders: "Order",
  official_legal: "Official",
  accounts_subscriptions: "Subscription",
  personal_health: "Health",
  social_feeds: "Social",
  gaming_entertainment: "Entertainment",
  newsletters_promotions: "Newsletter",
};

const ACTION_PHRASE: Record<string, string> = {
  reply: "Reply needed",
  review: "Needs a review",
  approve: "Approval needed",
  schedule: "A time to confirm",
  submit: "Something to submit",
  pay: "Payment needed",
  sign: "Signature needed",
  download: "A file to download",
  follow_up: "Follow-up needed",
};

export const PLACEMENT_CORRECTIONS: Record<MailTab, FeedbackKind[]> = {
  open: ["no_action", "waiting"],
  waiting: ["action", "not_waiting"],
  completed: ["action"],
  snoozed: ["action"],
  summary: ["action"],
  ignored: ["action"],
};

export const PLACEMENT_CORRECTION_LABELS: Record<FeedbackKind, string> = {
  wrong: "Wrong",
  important: "Important",
  not_important: "Not important",
  action: "Actions",
  no_action: "No action",
  waiting: "Pending",
  not_waiting: "Not pending",
  ignore: "Ignored",
};

export interface PlacementReasonInput {
  tab: MailTab;
  /** Model `action_reason`, when the card has one. */
  evidence?: string | null;
  /** Model `importance_reason`. */
  importanceReason?: string | null;
  summary?: string | null;
  /** Title already shown on the row, so the reason should not repeat it. */
  title?: string | null;
  category?: string | null;
  actionType?: string | null;
  requiresReply?: boolean | null;
  deadline?: string | null;
  deadlineText?: string | null;
  sender?: string | null;
  waitingFor?: string | null;
  snoozedUntil?: string | null;
}

export function sanitizePlacementEvidence(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const cleaned = value.replace(EMAIL_RE, "[email]").replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.toLowerCase() === "null" || cleaned.toLowerCase() === "undefined") {
    return null;
  }
  return capPlacementLine(cleaned);
}

/**
 * One short line for why this mail is in its tab.
 * Prefers a trimmed model reason. Otherwise uses category, action, deadline, and sender.
 */
export function threadPlacementReason(input: PlacementReasonInput): string {
  const model = modelPlacementReason(input);
  if (model) {
    return model;
  }
  return derivedPlacementReason(input);
}

/**
 * Do line. An English action summary is shown as stored. A non-English stored
 * summary is not shown; the card uses the English line derived from action,
 * category, deadline, and sender.
 */
export function displayDoLine(
  input: PlacementReasonInput & { actionSummary?: string | null },
): string | null {
  const stored = englishDisplayText(input.actionSummary);
  const title = input.title?.trim() ?? "";
  if (stored && stored !== title) {
    return stored;
  }
  const raw = input.actionSummary?.trim() ?? "";
  if (!raw || isEnglishDisplayText(raw)) {
    return null;
  }
  const fallback = threadPlacementReason({
    tab: input.tab,
    category: input.category,
    actionType: input.actionType,
    requiresReply: input.requiresReply,
    deadline: input.deadline,
    deadlineText: englishDisplayText(input.deadlineText),
    sender: englishDisplayText(input.sender),
    waitingFor: englishDisplayText(input.waitingFor),
    snoozedUntil: input.snoozedUntil,
  });
  if (!fallback || fallback.trim() === title) {
    return null;
  }
  return fallback;
}

function modelPlacementReason(input: PlacementReasonInput): string | null {
  const candidates =
    input.tab === "summary" || input.tab === "ignored"
      ? [input.importanceReason, input.evidence]
      : [input.evidence, input.importanceReason];
  const title = normalizeKey(input.title);
  const summary = normalizeKey(input.summary);
  for (const candidate of candidates) {
    if (!isEnglishDisplayText(candidate)) {
      continue;
    }
    const cleaned = sanitizePlacementEvidence(candidate);
    if (!cleaned || isWeakReason(cleaned)) {
      continue;
    }
    const key = normalizeKey(cleaned);
    if (!key || key === title || key === summary) {
      continue;
    }
    return cleaned;
  }
  return null;
}

function derivedPlacementReason(input: PlacementReasonInput): string {
  const category = specificCategory(input.category);
  const sender = senderLabel(input.sender);
  switch (input.tab) {
    case "open":
      return openReason(input, category, sender);
    case "waiting":
      return waitingReason(input);
    case "completed":
      return "Marked closed.";
    case "snoozed":
      return snoozedReason(input.snoozedUntil);
    case "summary":
      return fyiReason(input, category, sender);
    case "ignored":
      return ignoredReason(input, category, sender);
    default: {
      const _exhaustive: never = input.tab;
      return _exhaustive;
    }
  }
}

function openReason(
  input: PlacementReasonInput,
  category: Exclude<Category, "other"> | null,
  sender: string | null,
): string {
  const phrase = actionPhrase(input.actionType, input.requiresReply);
  const due = dueClause(input);
  if (phrase && due) {
    return finish(`${phrase}, due ${stripLeadingDue(due)}`);
  }
  if (phrase) {
    return finish(phrase);
  }
  if (due) {
    return finish(`Due ${stripLeadingDue(due)}`);
  }
  if (category) {
    return finish(`${CATEGORY_NOUN[category]} needs a step`);
  }
  if (sender) {
    return finish(`A step from ${sender} is still open`);
  }
  return summaryFallback(input) ?? "A step is still open.";
}

function waitingReason(input: PlacementReasonInput): string {
  const waiting = englishDisplayText(input.waitingFor);
  const cleaned = waiting ? sanitizePlacementEvidence(waiting) : null;
  if (cleaned && !isWeakReason(cleaned)) {
    return finish(`Waiting on ${cleaned.replace(/[.!?]+$/g, "")}`);
  }
  return "You already did your part.";
}

function snoozedReason(snoozedUntil: string | null | undefined): string {
  if (snoozedUntil) {
    const formatted = formatDate(snoozedUntil);
    if (formatted !== "—") {
      return `Snoozed until ${formatted}.`;
    }
  }
  return "Snoozed until the reminder.";
}

function fyiReason(
  input: PlacementReasonInput,
  category: Exclude<Category, "other"> | null,
  sender: string | null,
): string {
  if (category) {
    const noun = CATEGORY_NOUN[category];
    return sender
      ? finish(`${noun} update from ${sender}, nothing to do`)
      : finish(`${noun} update, nothing to do`);
  }
  if (sender) {
    return finish(`FYI from ${sender}`);
  }
  return summaryFallback(input) ?? "FYI, nothing to do.";
}

function ignoredReason(
  input: PlacementReasonInput,
  category: Exclude<Category, "other"> | null,
  sender: string | null,
): string {
  if (category) {
    const noun = CATEGORY_NOUN[category];
    return sender ? finish(`${noun} notice from ${sender}`) : finish(`${noun} notice`);
  }
  if (sender) {
    return finish(`Notice from ${sender}`);
  }
  return summaryFallback(input) ?? "No task in this mail.";
}

function actionPhrase(
  actionType: string | null | undefined,
  requiresReply: boolean | null | undefined,
): string | null {
  if (requiresReply) {
    return ACTION_PHRASE.reply ?? null;
  }
  if (!actionType) {
    return null;
  }
  return ACTION_PHRASE[actionType] ?? null;
}

function dueClause(input: PlacementReasonInput): string | null {
  const text = englishDisplayText(input.deadlineText);
  const cleaned = text ? sanitizePlacementEvidence(text) : null;
  if (cleaned && !isWeakReason(cleaned)) {
    return cleaned.replace(/[.!?]+$/g, "");
  }
  if (input.deadline && /^\d{4}-\d{2}-\d{2}$/.test(input.deadline)) {
    const formatted = formatDate(input.deadline);
    return formatted === "—" ? null : formatted;
  }
  return null;
}

function summaryFallback(input: PlacementReasonInput): string | null {
  const summary = englishDisplayText(input.summary);
  const cleaned = summary ? sanitizePlacementEvidence(summary) : null;
  if (!cleaned || isWeakReason(cleaned)) {
    return null;
  }
  const key = normalizeKey(cleaned);
  if (!key || key === normalizeKey(input.title)) {
    return null;
  }
  return cleaned;
}

function specificCategory(category: string | null | undefined): Exclude<Category, "other"> | null {
  if (!category?.trim()) {
    return null;
  }
  const normalized = normalizeCategory(category);
  if (normalized === "other") {
    return null;
  }
  return normalized;
}

function senderLabel(sender: string | null | undefined): string | null {
  if (!isEnglishDisplayText(sender)) {
    return null;
  }
  const cleaned = sanitizePlacementEvidence(sender);
  if (!cleaned || cleaned.includes("@") || cleaned.includes("[email]")) {
    return null;
  }
  return cleaned.length > 48 ? `${cleaned.slice(0, 45).trimEnd()}…` : cleaned;
}

function stripLeadingDue(value: string): string {
  return value.replace(/^due\s+/i, "");
}

function finish(text: string): string {
  const stripped = text.replace(/[.!?]+$/g, "").trim();
  const capped = capPlacementLine(stripped);
  if (!capped) {
    return "";
  }
  if (capped.endsWith("…")) {
    return capped;
  }
  return `${capped}.`;
}

function capPlacementLine(value: string): string {
  if (value.length <= MAX_PLACEMENT_CHARS) {
    return value;
  }
  const slice = value.slice(0, MAX_PLACEMENT_CHARS - 1);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > 40 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}

function normalizeKey(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const cleaned = value.replace(EMAIL_RE, "[email]").replace(/\s+/g, " ").trim().toLowerCase();
  return cleaned || null;
}

function isWeakReason(value: string): boolean {
  const lower = value
    .toLowerCase()
    .replace(/[.!?]+$/g, "")
    .trim();
  if (WEAK_REASONS.has(lower)) {
    return true;
  }
  return (
    lower.includes("useful update, not an action") ||
    lower.includes("still needs a next step from you") ||
    lower.includes("noise or a notice, not a task") ||
    lower.startsWith("this is in actions because") ||
    lower.startsWith("this is in for you because") ||
    lower.startsWith("this is in ignored because") ||
    lower.startsWith("this is in pending because") ||
    lower.startsWith("this is in closed because") ||
    lower.startsWith("this is in snoozed")
  );
}
