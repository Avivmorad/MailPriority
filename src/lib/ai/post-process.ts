import { groundDeadline } from "@/lib/ai/deadlines";
import { englishDisplayText } from "@/lib/ui/display-text";
import {
  isEphemeralAuthNotice,
  isIgnoreFamilyNotice,
  isInformationalNotice,
  isSecurityEventNotice,
  isUserOwnedActionNotice,
  isWaitingAcknowledgmentNotice,
  ownedActionType,
} from "@/lib/ai/notices";
import {
  threadAnalysisSchema,
  type ActionType,
  type Importance,
  type ThreadAnalysis,
} from "@/lib/ai/schemas";
import { normalizeEmail, parseEmailAddress } from "@/lib/gmail/addresses";

export interface TriagePreferences {
  vipSenders: string[];
  vipAlwaysHigh: boolean;
  ignoreSenders: string[];
  ignoreDomains: string[];
  customInstructions: string;
}

const ACTION_SUMMARY_FALLBACK: Record<ActionType, string> = {
  reply: "Reply to this email",
  review: "Review this email",
  approve: "Approve the request",
  schedule: "Confirm a time",
  submit: "Submit what was requested",
  pay: "Pay the charge",
  sign: "Sign the document",
  download: "Download the file",
  follow_up: "Follow up",
  other: "Take the required step",
  none: "Take the required step",
};

const IMPORTANCE_RANK: Record<Importance, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  const lower = trimmed.toLowerCase();
  if (lower === "null" || lower === "undefined") {
    return null;
  }
  return trimmed;
}

function isCriticalAccountMessage(analysis: ThreadAnalysis): boolean {
  return analysis.category === "security" && analysis.importance === "high";
}

function domainMatches(list: string[] | undefined, from: string | null): boolean {
  if (!list || list.length === 0 || !from) {
    return false;
  }
  const parsed = parseEmailAddress(from);
  const host = parsed?.email.split("@")[1];
  if (!host) {
    return false;
  }
  return list.some((raw) => {
    const domain = raw.replace(/^@/, "").toLowerCase();
    return host === domain || host.endsWith(`.${domain}`);
  });
}

function senderMatches(list: string[] | undefined, from: string | null): boolean {
  if (!list || list.length === 0 || !from) {
    return false;
  }
  const parsed = parseEmailAddress(from);
  if (!parsed) {
    return false;
  }
  const haystack = new Set(list.map(normalizeEmail));
  return haystack.has(parsed.email);
}

function applyIgnoreNormalization(next: ThreadAnalysis, importance: Importance): void {
  next.status = "ignore";
  next.importance = importance;
  next.requires_action = false;
  next.requires_reply = false;
  next.action_type = "none";
  next.action_summary = null;
  next.action_reason = null;
  next.waiting_for = null;
  next.waiting_since = null;
  next.urgency = "none";
}

function applyWaiting(next: ThreadAnalysis): void {
  next.status = "waiting";
  next.requires_action = false;
  next.requires_reply = false;
  if (next.action_type === "reply") {
    next.action_type = "none";
  }
  next.action_summary = null;
  if (!next.waiting_for) {
    next.waiting_for = "the other party";
  }
}

/** Last `[MESSAGE n]` block. Earlier asks must not override an out-of-office reply. */
export function latestThreadMessageText(threadText: string | null | undefined): string | null {
  if (!threadText) {
    return null;
  }
  const matches = [...threadText.matchAll(/\[MESSAGE \d+\][\s\S]*?(?=\[MESSAGE \d+\]|$)/gi)];
  const last = matches.at(-1)?.[0]?.trim();
  return last ? last : null;
}

export function postProcessThreadAnalysis(
  analysis: ThreadAnalysis,
  options: {
    latestFrom?: string | null;
    latestSubject?: string | null;
    threadText?: string | null;
    preferences?: Partial<TriagePreferences>;
  } = {},
): ThreadAnalysis {
  const next: ThreadAnalysis = { ...analysis };

  next.deadline = groundDeadline(next.deadline, options.threadText, next.deadline_text);
  next.deadline_text = nonEmpty(next.deadline_text);
  next.action_summary = nonEmpty(next.action_summary);
  next.action_reason = nonEmpty(next.action_reason);
  next.waiting_for = nonEmpty(next.waiting_for);
  next.waiting_since = nonEmpty(next.waiting_since);
  next.sender_name = nonEmpty(next.sender_name);
  next.organization = nonEmpty(next.organization);
  next.importance_reason = nonEmpty(next.importance_reason) ?? "Needs a quick look";
  next.summary =
    nonEmpty(next.summary) ??
    nonEmpty(next.short_display_title) ??
    nonEmpty(options.latestSubject) ??
    "Email update";
  next.short_display_title =
    nonEmpty(next.short_display_title) ?? nonEmpty(options.latestSubject) ?? next.summary;

  if (!Number.isFinite(next.confidence)) {
    next.confidence = 0;
  } else {
    next.confidence = Math.min(1, Math.max(0, next.confidence));
  }

  if (next.requires_reply) {
    next.requires_action = true;
    next.action_type = "reply";
  }

  const noticeParts = [
    options.latestSubject,
    next.short_display_title,
    next.summary,
    next.action_summary,
    options.threadText,
  ];
  const latestMessage = latestThreadMessageText(options.threadText);
  const latestParts = [options.latestSubject, latestMessage];
  const latestIsWaitingAck =
    latestMessage !== null &&
    isWaitingAcknowledgmentNotice(latestParts) &&
    !isSecurityEventNotice(latestParts);

  if (isEphemeralAuthNotice(noticeParts) || isIgnoreFamilyNotice(noticeParts)) {
    applyIgnoreNormalization(next, next.importance === "high" ? "medium" : next.importance);
  } else if (latestIsWaitingAck) {
    applyWaiting(next);
  } else if (isUserOwnedActionNotice(noticeParts) || isSecurityEventNotice(noticeParts)) {
    next.status = "action_required";
    next.requires_action = true;
    if (isSecurityEventNotice(noticeParts)) {
      next.category = "security";
    }
    if (next.action_type === "none") {
      next.action_type = isUserOwnedActionNotice(noticeParts)
        ? ownedActionType(noticeParts)
        : "review";
    }
    if (!next.action_summary) {
      next.action_summary = next.action_reason ?? ACTION_SUMMARY_FALLBACK[next.action_type];
    }
  } else if (isWaitingAcknowledgmentNotice(noticeParts)) {
    applyWaiting(next);
  } else if (isInformationalNotice(noticeParts)) {
    next.status = "informational";
    next.requires_action = false;
    next.requires_reply = false;
    next.action_type = "none";
    next.action_summary = null;
    next.action_reason = null;
    next.waiting_for = null;
    next.waiting_since = null;
    next.urgency = next.urgency === "urgent" ? "normal" : next.urgency;
  } else if (next.deadline && next.status !== "waiting" && next.status !== "ignore") {
    next.status = "action_required";
    next.requires_action = true;
    if (next.action_type === "none") {
      next.action_type = "review";
    }
    if (!next.action_summary) {
      next.action_summary = next.action_reason ?? ACTION_SUMMARY_FALLBACK[next.action_type];
    }
  }

  if (next.status === "action_required") {
    next.requires_action = true;
    if (!next.action_summary) {
      next.action_summary = next.action_reason ?? ACTION_SUMMARY_FALLBACK[next.action_type];
    }
  } else if (
    next.status === "informational" ||
    next.status === "ignore" ||
    next.status === "resolved"
  ) {
    next.requires_action = false;
  }

  if (next.status === "waiting") {
    if (!next.requires_reply) {
      next.requires_action = false;
      if (next.action_type === "reply") {
        next.action_type = "none";
      }
    }
    if (!next.waiting_for) {
      next.waiting_for = "the other party";
    }
  }

  const preferences = options.preferences;
  const from = options.latestFrom ?? null;

  if (
    (senderMatches(preferences?.ignoreSenders, from) ||
      domainMatches(preferences?.ignoreDomains, from)) &&
    !isCriticalAccountMessage(next) &&
    !isSecurityEventNotice(noticeParts)
  ) {
    applyIgnoreNormalization(next, "low");
  }

  if (senderMatches(preferences?.vipSenders, from)) {
    if (preferences?.vipAlwaysHigh) {
      next.importance = "high";
    } else if (IMPORTANCE_RANK[next.importance] < IMPORTANCE_RANK.medium) {
      next.importance = "medium";
    }
  }

  if (next.status === "action_required") {
    next.requires_action = true;
  } else if (
    next.status === "informational" ||
    next.status === "ignore" ||
    next.status === "resolved"
  ) {
    next.requires_action = false;
  }

  applyEnglishActionCopy(next);

  return threadAnalysisSchema.parse(next);
}

/** Do and Why this tab are stored in English. Does not change status or action type. */
function applyEnglishActionCopy(next: ThreadAnalysis): void {
  const summary = englishDisplayText(next.action_summary);
  const reason = englishDisplayText(next.action_reason);
  next.action_reason = reason;
  if (next.status === "action_required") {
    next.action_summary = summary ?? reason ?? ACTION_SUMMARY_FALLBACK[next.action_type];
  } else {
    next.action_summary = summary;
  }
  if (!englishDisplayText(next.importance_reason)) {
    next.importance_reason = "Needs a quick look";
  }
}

export function assertThreadAnalysisInvariants(analysis: ThreadAnalysis): void {
  if (analysis.status === "action_required") {
    if (!analysis.requires_action) {
      throw new Error("Invariant A: action_required requires requires_action=true");
    }
    if (!analysis.action_summary) {
      throw new Error("Invariant A: action_required requires action_summary");
    }
  }
  if (analysis.status === "waiting" && !analysis.waiting_for) {
    throw new Error("Invariant B: waiting requires waiting_for");
  }
  if (analysis.requires_reply) {
    if (!analysis.requires_action) {
      throw new Error("Invariant C: requires_reply requires requires_action=true");
    }
    if (analysis.action_type !== "reply") {
      throw new Error("Invariant C: requires_reply requires action_type=reply");
    }
  }
  if (analysis.deadline !== null && groundDeadline(analysis.deadline, null) === null) {
    throw new Error("Invariant D: deadline must be YYYY-MM-DD or null");
  }
  if (analysis.confidence < 0 || analysis.confidence > 1) {
    throw new Error("Invariant E: confidence must be between 0 and 1");
  }
  if (
    (analysis.status === "informational" ||
      analysis.status === "ignore" ||
      analysis.status === "resolved") &&
    analysis.requires_action
  ) {
    throw new Error("Invariant A: For You/Ignored require requires_action=false");
  }
}

export type ConfidenceBand = "normal" | "low" | "needs_review";

export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 0.8) {
    return "normal";
  }
  if (confidence >= 0.6) {
    return "low";
  }
  return "needs_review";
}
