import { CATEGORY_LABELS, normalizeCategory } from "@/lib/ai/categories";
import { humanizeToken, urgencyLevel } from "@/lib/ui/labels";

export const TAG_KINDS = ["category", "status", "importance", "urgency", "action"] as const;
export type TagKind = (typeof TAG_KINDS)[number];

const NEUTRAL_CHIP = "border-transparent bg-muted text-foreground";

const STATUS_WASH: Record<string, string> = {
  action_required: "border-transparent bg-state-actions text-foreground",
  waiting: "border-transparent bg-state-pending text-foreground",
  informational: "border-transparent bg-state-fyi text-foreground",
};

const STATUS_MARKER: Record<string, string> = {
  action_required: "bg-urgency-medium",
  waiting: "bg-urgency-unknown",
  informational: "bg-urgency-none",
};

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
  if (kind === "status") {
    return STATUS_WASH[normalizeTagValue(value)] ?? NEUTRAL_CHIP;
  }
  return NEUTRAL_CHIP;
}

/** Small dot beside the label. Category, importance, and urgency never fill the chip. */
export function tagMarkerClass(kind: TagKind, value: string): string | null {
  if (kind === "category") {
    return "bg-urgency-unknown";
  }
  if (kind === "importance" || kind === "urgency") {
    return `bg-urgency-${urgencyLevel(value)}`;
  }
  if (kind === "status") {
    return STATUS_MARKER[normalizeTagValue(value)] ?? null;
  }
  return null;
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
