import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  ensureManagedLabels,
  exchangeAuthorizationCode,
  fetchGmailIdentity,
  encryptSecret,
  emitProductEvent,
  getScanPreferences,
  nextDailyScanAt,
  upsertSelectSingle,
  updateEq,
  fromMock,
} = vi.hoisted(() => {
  const ensureManagedLabels = vi.fn(async () => undefined);
  const exchangeAuthorizationCode = vi.fn();
  const fetchGmailIdentity = vi.fn();
  const encryptSecret = vi.fn(() => "v1:iv:tag:ciphertext");
  const emitProductEvent = vi.fn();
  const getScanPreferences = vi.fn(async () => ({
    dailyScanTime: "09:00",
    timezone: "Asia/Jerusalem",
  }));
  const nextDailyScanAt = vi.fn(() => new Date("2026-09-11T06:00:00.000Z"));
  const upsertSelectSingle = vi.fn();
  const updateEq = vi.fn(async () => ({ error: null }));
  const fromMock = vi.fn((table: string) => {
    if (table === "profiles") {
      return {
        upsert: vi.fn(async () => ({ error: null })),
      };
    }
    if (table === "gmail_connections") {
      return {
        select: vi.fn(() => ({
          neq: vi.fn(() => ({
            ilike: vi.fn(async () => ({ data: [], error: null })),
            eq: vi.fn(async () => ({ data: [], error: null })),
          })),
        })),
        upsert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: upsertSelectSingle,
          })),
        })),
        update: vi.fn(() => ({
          eq: updateEq,
        })),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
  return {
    ensureManagedLabels,
    exchangeAuthorizationCode,
    fetchGmailIdentity,
    encryptSecret,
    emitProductEvent,
    getScanPreferences,
    nextDailyScanAt,
    upsertSelectSingle,
    updateEq,
    fromMock,
  };
});

vi.mock("@/lib/config/env", () => ({
  getGmailEnv: () => ({
    TOKEN_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  }),
  isGmailConfigured: () => true,
}));

vi.mock("@/lib/gmail/labels", () => ({
  ensureManagedLabels,
}));

vi.mock("@/lib/gmail/oauth", () => ({
  exchangeAuthorizationCode,
  fetchGmailIdentity,
  GmailConnectError: class GmailConnectError extends Error {
    constructor(
      readonly reason: string,
      message: string,
    ) {
      super(message);
      this.name = "GmailConnectError";
    }
  },
  revokeRefreshToken: vi.fn(),
}));

vi.mock("@/lib/security/encryption", () => ({
  encryptSecret,
  unwrapSecretWithRotation: vi.fn(),
}));

vi.mock("@/lib/scans/jobs", () => ({
  cancelActiveJobsForConnection: vi.fn(),
}));

vi.mock("@/lib/scans/schedule", () => ({
  nextDailyScanAt,
}));

vi.mock("@/lib/settings/preferences", () => ({
  getScanPreferences,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: fromMock }),
}));

vi.mock("@/lib/observability/events", () => ({
  emitProductEvent,
}));

import { completeGmailOAuth } from "@/lib/gmail/connections";
import { GMAIL_CONNECT_RETRY_DELAYS_MS } from "@/lib/gmail/retry";

describe("completeGmailOAuth", () => {
  beforeEach(() => {
    ensureManagedLabels.mockReset();
    ensureManagedLabels.mockResolvedValue(undefined);
    exchangeAuthorizationCode.mockReset();
    fetchGmailIdentity.mockReset();
    encryptSecret.mockClear();
    emitProductEvent.mockClear();
    fromMock.mockClear();
    upsertSelectSingle.mockReset();
    updateEq.mockReset();
    updateEq.mockResolvedValue({ error: null });
    getScanPreferences.mockClear();
    nextDailyScanAt.mockClear();

    exchangeAuthorizationCode.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiryDate: null,
    });
    fetchGmailIdentity.mockResolvedValue({
      email: "user@example.com",
      googleAccountId: null,
    });
    upsertSelectSingle.mockResolvedValue({
      data: {
        id: "conn-1",
        user_id: "user-1",
        gmail_email: "user@example.com",
        google_account_id: null,
        status: "CONNECTED",
        last_successful_scan_at: null,
        next_scan_at: null,
      },
      error: null,
    });
  });

  it("returns as soon as the connection is saved and defers labels to runPostConnectSetup", async () => {
    const result = await completeGmailOAuth("user-1", "auth-code");

    expect(result.connection).toMatchObject({
      id: "conn-1",
      gmailEmail: "user@example.com",
      status: "CONNECTED",
    });
    expect(fetchGmailIdentity).toHaveBeenCalledWith("access-token", "refresh-token", {
      delaysMs: GMAIL_CONNECT_RETRY_DELAYS_MS,
    });
    expect(ensureManagedLabels).not.toHaveBeenCalled();

    await result.runPostConnectSetup();

    expect(ensureManagedLabels).toHaveBeenCalledWith("conn-1", "access-token", "refresh-token", {
      delaysMs: GMAIL_CONNECT_RETRY_DELAYS_MS,
    });
    expect(getScanPreferences).toHaveBeenCalledWith("user-1");
    expect(updateEq).toHaveBeenCalledWith("id", "conn-1");
  });

  it("still completes connect when deferred label creation fails", async () => {
    ensureManagedLabels.mockRejectedValue(new Error("quota"));
    const result = await completeGmailOAuth("user-1", "auth-code");
    expect(result.connection.id).toBe("conn-1");
    await expect(result.runPostConnectSetup()).resolves.toBeUndefined();
    expect(ensureManagedLabels).toHaveBeenCalledTimes(1);
  });
});
