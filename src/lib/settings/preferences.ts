import { z } from "zod";

import { nextDailyScanAt } from "@/lib/scans/schedule";
import { CUSTOM_AI_INSTRUCTIONS_MAX } from "@/lib/settings/limits";
import { triageDomainListSchema, triageSenderListSchema } from "@/lib/settings/triage-lists";
import { createAdminClient } from "@/lib/supabase/admin";

export { CUSTOM_AI_INSTRUCTIONS_MAX, TRIAGE_LIST_MAX } from "@/lib/settings/limits";
export const DEFAULT_SCAN_TIMEZONE = "Asia/Jerusalem";
export const DEFAULT_DAILY_SCAN_TIME = "08:00";

const timeHmSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export const patchScanPreferencesSchema = z
  .object({
    dailyScanTime: timeHmSchema.optional(),
    timezone: z
      .string()
      .min(1)
      .max(64)
      .refine(isValidTimeZone, { message: "invalid_timezone" })
      .optional(),
    vipSenders: triageSenderListSchema.optional(),
    ignoredSenders: triageSenderListSchema.optional(),
    ignoredDomains: triageDomainListSchema.optional(),
    customAiInstructions: z.string().max(CUSTOM_AI_INSTRUCTIONS_MAX).optional(),
    digestEnabled: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.dailyScanTime !== undefined ||
      value.timezone !== undefined ||
      value.vipSenders !== undefined ||
      value.ignoredSenders !== undefined ||
      value.ignoredDomains !== undefined ||
      value.customAiInstructions !== undefined ||
      value.digestEnabled !== undefined,
    { message: "empty" },
  );

export interface ScanPreferences {
  dailyScanTime: string;
  timezone: string;
  vipSenders: string[];
  ignoredSenders: string[];
  ignoredDomains: string[];
  customAiInstructions: string;
  digestEnabled: boolean;
}

function normalizeTime(value: string | null): string {
  if (!value) {
    return DEFAULT_DAILY_SCAN_TIME;
  }
  return value.slice(0, 5);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function rowToPreferences(data: Record<string, unknown>): ScanPreferences {
  return {
    dailyScanTime: normalizeTime((data.daily_scan_time as string | null) ?? null),
    timezone: (data.timezone as string | null) || DEFAULT_SCAN_TIMEZONE,
    vipSenders: asStringArray(data.vip_senders),
    ignoredSenders: asStringArray(data.ignored_senders),
    ignoredDomains: asStringArray(data.ignored_domains),
    customAiInstructions:
      typeof data.custom_ai_instructions === "string" ? data.custom_ai_instructions : "",
    digestEnabled: data.digest_enabled !== false,
  };
}

const SETTINGS_SELECT =
  "daily_scan_time, timezone, vip_senders, ignored_senders, ignored_domains, custom_ai_instructions, digest_enabled";

export async function getScanPreferences(userId: string): Promise<ScanPreferences> {
  const db = createAdminClient();
  const existing = await db
    .from("user_triage_settings")
    .select(SETTINGS_SELECT)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing.error) {
    throw new Error("Failed to load scan preferences");
  }
  if (existing.data) {
    return rowToPreferences(existing.data as Record<string, unknown>);
  }

  const inserted = await db
    .from("user_triage_settings")
    .insert({
      user_id: userId,
      initial_lookback_days: 7,
      daily_scan_time: DEFAULT_DAILY_SCAN_TIME,
      timezone: DEFAULT_SCAN_TIMEZONE,
      scan_interval_minutes: null,
    })
    .select(SETTINGS_SELECT)
    .single();
  if (!inserted.error && inserted.data) {
    return rowToPreferences(inserted.data as Record<string, unknown>);
  }

  const retry = await db
    .from("user_triage_settings")
    .select(SETTINGS_SELECT)
    .eq("user_id", userId)
    .single();
  if (retry.error || !retry.data) {
    throw new Error("Failed to load scan preferences");
  }
  return rowToPreferences(retry.data as Record<string, unknown>);
}

export async function updateScanPreferences(
  userId: string,
  patch: z.infer<typeof patchScanPreferencesSchema>,
): Promise<ScanPreferences> {
  const current = await getScanPreferences(userId);
  const next: ScanPreferences = {
    dailyScanTime: patch.dailyScanTime ?? current.dailyScanTime,
    timezone: patch.timezone ?? current.timezone,
    vipSenders: patch.vipSenders ?? current.vipSenders,
    ignoredSenders: patch.ignoredSenders ?? current.ignoredSenders,
    ignoredDomains: patch.ignoredDomains ?? current.ignoredDomains,
    customAiInstructions: patch.customAiInstructions ?? current.customAiInstructions,
    digestEnabled: patch.digestEnabled ?? current.digestEnabled,
  };

  const db = createAdminClient();
  const { error } = await db
    .from("user_triage_settings")
    .update({
      daily_scan_time: next.dailyScanTime,
      timezone: next.timezone,
      scan_interval_minutes: null,
      vip_senders: next.vipSenders,
      ignored_senders: next.ignoredSenders,
      ignored_domains: next.ignoredDomains,
      custom_ai_instructions: next.customAiInstructions,
      digest_enabled: next.digestEnabled,
    })
    .eq("user_id", userId);
  if (error) {
    throw new Error("Failed to update scan preferences");
  }

  if (patch.dailyScanTime !== undefined || patch.timezone !== undefined) {
    const nextScanAt = nextDailyScanAt(new Date(), next.dailyScanTime, next.timezone).toISOString();
    const { error: connectionError } = await db
      .from("gmail_connections")
      .update({ next_scan_at: nextScanAt })
      .eq("user_id", userId)
      .eq("status", "CONNECTED");
    if (connectionError) {
      throw new Error("Failed to reschedule Gmail scans");
    }
  }

  return next;
}
