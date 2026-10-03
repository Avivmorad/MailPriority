import { z } from "zod";

/**
 * Environment validation is split by phase so the app can run without every
 * later-phase secret. Public pages only need {@link getClientEnv}. Gmail OAuth
 * (Phase 2) uses {@link getGmailEnv}. Full {@link getServerEnv} is for later
 * phases that actually call the triage provider / cron.
 *
 * Secrets must never be imported into client components.
 */

const supabasePublicSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().min(1).optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SENTRY_DSN: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().url().optional(),
  ),
});

const supabaseAdminSchema = supabasePublicSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

const optionalSecret = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional(),
);

const gmailEnvSchema = supabaseAdminSchema.extend({
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().min(1),
  TOKEN_ENCRYPTION_KEY: z.string().min(1),
  TOKEN_ENCRYPTION_PREVIOUS_KEY: optionalSecret,
});

const contextLimitsSchema = z.object({
  MAX_THREAD_MESSAGES: z.coerce.number().int().positive().default(6),
  MAX_MESSAGE_CHARS: z.coerce.number().int().positive().default(12000),
  MAX_THREAD_CHARS: z.coerce.number().int().positive().default(35000),
  AI_MAX_CONCURRENCY: z.coerce.number().int().positive().default(8),
  /** Local budget under Google's typical 15,000 units/user/minute. */
  GMAIL_QUOTA_UNITS_PER_MINUTE: z.coerce.number().int().positive().default(12_000),
});

export type ContextLimits = z.infer<typeof contextLimitsSchema>;

const geminiEnvSchema = z.object({
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().min(1),
});

/** `meta/llama-3.3-70b-instruct` reached end of life on 2026-08-26 (HTTP 410). */
export const DEFAULT_NVIDIA_MODEL = "openai/gpt-oss-20b";
export const DEFAULT_NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

const nvidiaEnvSchema = z.object({
  NVIDIA_API_KEY: z.string().min(1),
  NVIDIA_MODEL: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().min(1).default(DEFAULT_NVIDIA_MODEL),
  ),
  NVIDIA_BASE_URL: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().url().default(DEFAULT_NVIDIA_BASE_URL),
  ),
});

const serverEnvSchema = gmailEnvSchema
  .extend({
    CRON_SECRET: z.string().min(1),
  })
  .merge(contextLimitsSchema)
  .extend({
    GEMINI_API_KEY: optionalSecret,
    GEMINI_MODEL: optionalSecret,
    NVIDIA_API_KEY: optionalSecret,
    NVIDIA_MODEL: optionalSecret,
    NVIDIA_BASE_URL: optionalSecret,
  })
  .superRefine((value, ctx) => {
    const nvidia = Boolean(value.NVIDIA_API_KEY);
    const geminiKey = Boolean(value.GEMINI_API_KEY);
    const geminiModel = Boolean(value.GEMINI_MODEL);
    if (geminiKey !== geminiModel) {
      ctx.addIssue({
        code: "custom",
        message: "GEMINI_API_KEY and GEMINI_MODEL must be set together",
        path: [geminiKey ? "GEMINI_MODEL" : "GEMINI_API_KEY"],
      });
    }
    if (!nvidia && !(geminiKey && geminiModel)) {
      ctx.addIssue({
        code: "custom",
        message: "Set NVIDIA_API_KEY, or both GEMINI_API_KEY and GEMINI_MODEL",
        path: ["NVIDIA_API_KEY"],
      });
    }
  });

export type ClientEnv = z.infer<typeof supabasePublicSchema>;
export type SupabaseAdminEnv = z.infer<typeof supabaseAdminSchema>;
export type GmailEnv = z.infer<typeof gmailEnvSchema>;
export type GeminiEnv = z.infer<typeof geminiEnvSchema>;
export type NvidiaEnv = z.infer<typeof nvidiaEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
}

function throwInvalid(kind: string, error: z.ZodError): never {
  throw new Error(`Invalid or missing ${kind} environment variables:\n${formatIssues(error)}`);
}

export function parseClientEnv(source: Record<string, unknown>): ClientEnv {
  const parsed = supabasePublicSchema.safeParse(source);
  if (!parsed.success) throwInvalid("public", parsed.error);
  return parsed.data;
}

export function parseSupabaseAdminEnv(
  source: Record<string, unknown> = process.env,
): SupabaseAdminEnv {
  const parsed = supabaseAdminSchema.safeParse(source);
  if (!parsed.success) throwInvalid("Supabase admin", parsed.error);
  return parsed.data;
}

export function parseGmailEnv(source: Record<string, unknown> = process.env): GmailEnv {
  const parsed = gmailEnvSchema.safeParse(source);
  if (!parsed.success) throwInvalid("Gmail OAuth", parsed.error);
  return parsed.data;
}

export function parseGeminiEnv(source: Record<string, unknown> = process.env): GeminiEnv {
  const parsed = geminiEnvSchema.safeParse(source);
  if (!parsed.success) throwInvalid("Gemini", parsed.error);
  return parsed.data;
}

export function parseServerEnv(source: Record<string, unknown> = process.env): ServerEnv {
  const parsed = serverEnvSchema.safeParse(source);
  if (!parsed.success) throwInvalid("server", parsed.error);
  return parsed.data;
}

export function isGmailConfigured(source: Record<string, unknown> = process.env): boolean {
  return gmailEnvSchema.safeParse(source).success;
}

export function parseNvidiaEnv(source: Record<string, unknown> = process.env): NvidiaEnv {
  const parsed = nvidiaEnvSchema.safeParse(source);
  if (!parsed.success) throwInvalid("NVIDIA", parsed.error);
  return parsed.data;
}

export function isGeminiConfigured(source: Record<string, unknown> = process.env): boolean {
  return geminiEnvSchema.safeParse(source).success;
}

export function isNvidiaConfigured(source: Record<string, unknown> = process.env): boolean {
  return typeof source.NVIDIA_API_KEY === "string" && source.NVIDIA_API_KEY.trim().length > 0;
}

/** NVIDIA Build is the primary triage provider when its API key is set. */
export function isTriageConfigured(source: Record<string, unknown> = process.env): boolean {
  return isNvidiaConfigured(source) || isGeminiConfigured(source);
}

export function getTriageModelName(source: Record<string, unknown> = process.env): string {
  if (isNvidiaConfigured(source)) {
    return parseNvidiaEnv(source).NVIDIA_MODEL;
  }
  return parseGeminiEnv(source).GEMINI_MODEL;
}

export function isCronConfigured(source: Record<string, unknown> = process.env): boolean {
  return z.string().min(1).safeParse(source.CRON_SECRET).success;
}

export function getClientEnv(): ClientEnv {
  return parseClientEnv({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  });
}

let cachedAdminEnv: SupabaseAdminEnv | null = null;
let cachedGmailEnv: GmailEnv | null = null;
let cachedGeminiEnv: GeminiEnv | null = null;
let cachedNvidiaEnv: NvidiaEnv | null = null;
let cachedServerEnv: ServerEnv | null = null;

export function getSupabaseAdminEnv(): SupabaseAdminEnv {
  if (cachedAdminEnv === null) {
    cachedAdminEnv = parseSupabaseAdminEnv();
  }
  return cachedAdminEnv;
}

export function getGmailEnv(): GmailEnv {
  if (cachedGmailEnv === null) {
    cachedGmailEnv = parseGmailEnv();
  }
  return cachedGmailEnv;
}

export function getGeminiEnv(): GeminiEnv {
  if (cachedGeminiEnv === null) {
    cachedGeminiEnv = parseGeminiEnv();
  }
  return cachedGeminiEnv;
}

export function getNvidiaEnv(): NvidiaEnv {
  if (cachedNvidiaEnv === null) {
    cachedNvidiaEnv = parseNvidiaEnv();
  }
  return cachedNvidiaEnv;
}

export function getContextLimits(source: Record<string, unknown> = process.env): ContextLimits {
  return contextLimitsSchema.parse(source);
}

export function getServerEnv(): ServerEnv {
  if (cachedServerEnv === null) {
    cachedServerEnv = parseServerEnv();
  }
  return cachedServerEnv;
}
