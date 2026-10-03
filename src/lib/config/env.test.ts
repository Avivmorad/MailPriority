import { describe, expect, it } from "vitest";

import {
  getContextLimits,
  isCronConfigured,
  isGmailConfigured,
  isGeminiConfigured,
  isNvidiaConfigured,
  isTriageConfigured,
  getTriageModelName,
  parseClientEnv,
  parseGeminiEnv,
  parseGmailEnv,
  parseServerEnv,
} from "@/lib/config/env";

describe("parseGmailEnv", () => {
  it("succeeds without Gemini or cron secrets", () => {
    const env = parseGmailEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      GOOGLE_CLIENT_ID: "client-id",
      GOOGLE_CLIENT_SECRET: "client-secret",
      GOOGLE_REDIRECT_URI: "http://localhost:3000/api/gmail/callback",
      TOKEN_ENCRYPTION_KEY: "0".repeat(64),
    });

    expect(env.GOOGLE_CLIENT_ID).toBe("client-id");
    expect(env.TOKEN_ENCRYPTION_PREVIOUS_KEY).toBeUndefined();
  });

  it("accepts an optional previous encryption key for rotation", () => {
    const env = parseGmailEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      GOOGLE_CLIENT_ID: "client-id",
      GOOGLE_CLIENT_SECRET: "client-secret",
      GOOGLE_REDIRECT_URI: "http://localhost:3000/api/gmail/callback",
      TOKEN_ENCRYPTION_KEY: "0".repeat(64),
      TOKEN_ENCRYPTION_PREVIOUS_KEY: "1".repeat(64),
    });

    expect(env.TOKEN_ENCRYPTION_PREVIOUS_KEY).toBe("1".repeat(64));
  });

  it("throws when Google secrets are missing", () => {
    expect(() =>
      parseGmailEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      }),
    ).toThrowError(/Gmail OAuth/);
  });
});

describe("isGmailConfigured", () => {
  it("is false when Google keys are empty", () => {
    expect(isGmailConfigured({})).toBe(false);
  });
});

describe("parseGeminiEnv", () => {
  it("reads GEMINI_API_KEY and GEMINI_MODEL", () => {
    const env = parseGeminiEnv({
      GEMINI_API_KEY: "gemini-test-key",
      GEMINI_MODEL: "gemini-3.1-flash-lite",
    });
    expect(env.GEMINI_MODEL).toBe("gemini-3.1-flash-lite");
  });

  it("throws when Gemini secrets are missing", () => {
    expect(() => parseGeminiEnv({})).toThrowError(/Gemini/);
  });
});

describe("isCronConfigured", () => {
  it("is false when CRON_SECRET is missing", () => {
    expect(isCronConfigured({})).toBe(false);
  });

  it("is true when CRON_SECRET is set", () => {
    expect(isCronConfigured({ CRON_SECRET: "cron-secret" })).toBe(true);
  });
});

describe("isGeminiConfigured", () => {
  it("is false when Gemini keys are empty", () => {
    expect(isGeminiConfigured({})).toBe(false);
  });
});

describe("NVIDIA triage selection", () => {
  it("prefers the NVIDIA model when the API key is set", () => {
    const source = {
      NVIDIA_API_KEY: "nvapi-test",
      GEMINI_API_KEY: "gemini-test-key",
      GEMINI_MODEL: "gemini-3.1-flash-lite",
    };
    expect(isNvidiaConfigured(source)).toBe(true);
    expect(isTriageConfigured(source)).toBe(true);
    expect(getTriageModelName(source)).toBe("openai/gpt-oss-20b");
    expect(getTriageModelName({ ...source, NVIDIA_MODEL: "nvidia/custom" })).toBe("nvidia/custom");
  });

  it("falls back to Gemini when NVIDIA is unset", () => {
    expect(isNvidiaConfigured({})).toBe(false);
    expect(isTriageConfigured({ GEMINI_API_KEY: "k", GEMINI_MODEL: "gemini-test" })).toBe(true);
    expect(getTriageModelName({ GEMINI_API_KEY: "k", GEMINI_MODEL: "gemini-test" })).toBe(
      "gemini-test",
    );
  });
});

const validServerEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  GOOGLE_REDIRECT_URI: "https://app.example.com/api/gmail/callback",
  TOKEN_ENCRYPTION_KEY: "0".repeat(64),
  GEMINI_API_KEY: "gemini-test-key",
  GEMINI_MODEL: "gemini-3.1-flash-lite",
  CRON_SECRET: "cron-secret",
};

describe("parseServerEnv", () => {
  it("applies numeric defaults and coerces provided numbers", () => {
    const env = parseServerEnv(validServerEnv);

    expect(env.MAX_THREAD_MESSAGES).toBe(6);
    expect(env.MAX_MESSAGE_CHARS).toBe(12000);
    expect(env.MAX_THREAD_CHARS).toBe(35000);
    expect(env.AI_MAX_CONCURRENCY).toBe(8);
  });

  it("coerces string numbers from the environment", () => {
    const env = parseServerEnv({ ...validServerEnv, AI_MAX_CONCURRENCY: "12" });

    expect(env.AI_MAX_CONCURRENCY).toBe(12);
  });

  it("throws a descriptive error when required secrets are missing", () => {
    expect(() => parseServerEnv({})).toThrowError(/environment variables/i);
  });

  it("rejects non-positive numeric config", () => {
    expect(() => parseServerEnv({ ...validServerEnv, AI_MAX_CONCURRENCY: "0" })).toThrowError();
  });

  it("accepts NVIDIA triage without Gemini keys", () => {
    const env = parseServerEnv({
      ...validServerEnv,
      GEMINI_API_KEY: undefined,
      GEMINI_MODEL: undefined,
      NVIDIA_API_KEY: "nvapi-test",
    });
    expect(env.NVIDIA_API_KEY).toBe("nvapi-test");
    expect(env.GEMINI_API_KEY).toBeUndefined();
  });

  it("rejects a server env with neither triage provider", () => {
    expect(() =>
      parseServerEnv({
        ...validServerEnv,
        GEMINI_API_KEY: undefined,
        GEMINI_MODEL: undefined,
      }),
    ).toThrowError(/NVIDIA_API_KEY|GEMINI_API_KEY/);
  });
});

describe("parseClientEnv", () => {
  it("accepts valid public variables", () => {
    const env = parseClientEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    });

    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://example.supabase.co");
    expect(env.NEXT_PUBLIC_SENTRY_DSN).toBeUndefined();
  });

  it("accepts an optional Sentry DSN without requiring it", () => {
    const env = parseClientEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      NEXT_PUBLIC_SENTRY_DSN: "https://public@o0.ingest.sentry.io/1",
    });
    expect(env.NEXT_PUBLIC_SENTRY_DSN).toBe("https://public@o0.ingest.sentry.io/1");
  });

  it("throws when a public variable is missing", () => {
    expect(() =>
      parseClientEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co" }),
    ).toThrowError();
  });
});

describe("getContextLimits", () => {
  it("uses spec defaults when unset", () => {
    const limits = getContextLimits({});
    expect(limits.MAX_THREAD_MESSAGES).toBe(6);
    expect(limits.MAX_MESSAGE_CHARS).toBe(12000);
    expect(limits.MAX_THREAD_CHARS).toBe(35000);
    expect(limits.GMAIL_QUOTA_UNITS_PER_MINUTE).toBe(12000);
  });
});
