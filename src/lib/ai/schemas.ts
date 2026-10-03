import { z } from "zod";

import { CATEGORY_VALUES } from "@/lib/ai/categories";

export { CATEGORY_VALUES, type Category } from "@/lib/ai/categories";

export const IMPORTANCE_VALUES = ["high", "medium", "low"] as const;
export const THREAD_STATUS_VALUES = [
  "action_required",
  "waiting",
  "informational",
  "resolved",
  "ignore",
] as const;
export const URGENCY_VALUES = ["urgent", "soon", "normal", "none"] as const;
export const ACTION_TYPE_VALUES = [
  "reply",
  "review",
  "approve",
  "schedule",
  "submit",
  "pay",
  "sign",
  "download",
  "follow_up",
  "other",
  "none",
] as const;
export const importanceSchema = z.enum(IMPORTANCE_VALUES);
export const threadStatusSchema = z.enum(THREAD_STATUS_VALUES);
export const urgencySchema = z.enum(URGENCY_VALUES);
export const actionTypeSchema = z.enum(ACTION_TYPE_VALUES);
export const categorySchema = z.enum(CATEGORY_VALUES);

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "deadline must be YYYY-MM-DD or null")
  .nullable();

export const threadAnalysisSchema = z
  .object({
    summary: z.string().min(1),
    importance: importanceSchema,
    importance_reason: z.string().min(1),
    status: threadStatusSchema,
    requires_action: z.boolean(),
    requires_reply: z.boolean(),
    action_type: actionTypeSchema,
    action_summary: z.string().min(1).nullable(),
    action_reason: z.string().min(1).nullable(),
    waiting_for: z.string().min(1).nullable(),
    waiting_since: z.string().min(1).nullable(),
    urgency: urgencySchema,
    deadline: isoDateSchema,
    deadline_text: z.string().min(1).nullable(),
    category: categorySchema,
    sender_name: z.string().min(1).nullable(),
    organization: z.string().min(1).nullable(),
    confidence: z.number().min(0).max(1),
    short_display_title: z.string().min(1),
  })
  .strict();

export type Importance = z.infer<typeof importanceSchema>;
export type ThreadStatus = z.infer<typeof threadStatusSchema>;
export type Urgency = z.infer<typeof urgencySchema>;
export type ActionType = z.infer<typeof actionTypeSchema>;
export type ThreadAnalysis = z.infer<typeof threadAnalysisSchema>;

const THREAD_ANALYSIS_PROPERTY_ORDER = [
  "summary",
  "importance",
  "importance_reason",
  "status",
  "requires_action",
  "requires_reply",
  "action_type",
  "action_summary",
  "action_reason",
  "waiting_for",
  "waiting_since",
  "urgency",
  "deadline",
  "deadline_text",
  "category",
  "sender_name",
  "organization",
  "confidence",
  "short_display_title",
] as const;

/**
 * Gemini `responseJsonSchema` (JSON Schema). Nullable fields use
 * `type: ["string", "null"]` (not Zod `.optional()` / `.nullish()`).
 */
export const threadAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  propertyOrdering: [...THREAD_ANALYSIS_PROPERTY_ORDER],
  required: [
    "summary",
    "importance",
    "importance_reason",
    "status",
    "requires_action",
    "requires_reply",
    "action_type",
    "action_summary",
    "action_reason",
    "waiting_for",
    "waiting_since",
    "urgency",
    "deadline",
    "deadline_text",
    "category",
    "sender_name",
    "organization",
    "confidence",
    "short_display_title",
  ],
  properties: {
    summary: { type: "string" },
    importance: { type: "string", enum: [...IMPORTANCE_VALUES] },
    importance_reason: {
      type: "string",
      description: "English reason for importance and tab placement. Never the email's language.",
    },
    status: { type: "string", enum: [...THREAD_STATUS_VALUES] },
    requires_action: { type: "boolean" },
    requires_reply: { type: "boolean" },
    action_type: { type: "string", enum: [...ACTION_TYPE_VALUES] },
    action_summary: {
      type: ["string", "null"],
      description:
        "English Do line: the next step, or null. English even when the email is in another language.",
    },
    action_reason: {
      type: ["string", "null"],
      description:
        "English Why this tab line, or null. English even when the email is in another language.",
    },
    waiting_for: { type: ["string", "null"] },
    waiting_since: { type: ["string", "null"] },
    urgency: { type: "string", enum: [...URGENCY_VALUES] },
    deadline: { type: ["string", "null"] },
    deadline_text: { type: ["string", "null"] },
    category: { type: "string", enum: [...CATEGORY_VALUES] },
    sender_name: { type: ["string", "null"] },
    organization: { type: ["string", "null"] },
    confidence: { type: "number" },
    short_display_title: { type: "string" },
  },
} as const;
