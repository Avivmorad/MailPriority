import { z } from "zod";

export const FEEDBACK_KINDS = [
  "wrong",
  "important",
  "not_important",
  "action",
  "no_action",
  "waiting",
  "not_waiting",
  "ignore",
] as const;

export const threadFeedbackSchema = z.object({
  kind: z.enum(FEEDBACK_KINDS),
});
