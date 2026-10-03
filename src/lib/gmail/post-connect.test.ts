import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureManagedLabels = vi.hoisted(() => vi.fn(async () => undefined));
const getScanPreferences = vi.hoisted(() =>
  vi.fn(async () => ({
    dailyScanTime: "08:00",
    timezone: "UTC",
  })),
);
const nextDailyScanAt = vi.hoisted(() => vi.fn(() => new Date("2026-10-03T08:00:00.000Z")));
const updateEq = vi.hoisted(() => vi.fn(async () => ({ error: null })));
const update = vi.hoisted(() => vi.fn(() => ({ eq: updateEq })));
const from = vi.hoisted(() => vi.fn(() => ({ update })));

vi.mock("@/lib/gmail/labels", () => ({
  ensureManagedLabels,
}));

vi.mock("@/lib/settings/preferences", () => ({
  getScanPreferences,
}));

vi.mock("@/lib/scans/schedule", () => ({
  nextDailyScanAt,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from }),
}));

describe("runGmailPostConnectSetup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("schedules next_scan_at and ensures MailPilot labels", async () => {
    const { runGmailPostConnectSetup } = await import("@/lib/gmail/post-connect");
    await runGmailPostConnectSetup({
      userId: "user-1",
      connectionId: "conn-1",
      accessToken: "access",
      refreshToken: "refresh",
      nextScanAt: null,
    });

    expect(getScanPreferences).toHaveBeenCalledWith("user-1");
    expect(from).toHaveBeenCalledWith("gmail_connections");
    expect(update).toHaveBeenCalledWith({ next_scan_at: "2026-10-03T08:00:00.000Z" });
    expect(updateEq).toHaveBeenCalledWith("id", "conn-1");
    expect(ensureManagedLabels).toHaveBeenCalledWith("conn-1", "access", "refresh", {
      delaysMs: [],
    });
  });

  it("skips scheduling when next_scan_at is already set", async () => {
    const { runGmailPostConnectSetup } = await import("@/lib/gmail/post-connect");
    await runGmailPostConnectSetup({
      userId: "user-1",
      connectionId: "conn-1",
      accessToken: "access",
      refreshToken: "refresh",
      nextScanAt: "2026-10-04T08:00:00.000Z",
    });

    expect(getScanPreferences).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    expect(ensureManagedLabels).toHaveBeenCalledWith("conn-1", "access", "refresh", {
      delaysMs: [],
    });
  });

  it("still ensures labels if schedule setup fails", async () => {
    getScanPreferences.mockRejectedValueOnce(new Error("prefs down"));
    const { runGmailPostConnectSetup } = await import("@/lib/gmail/post-connect");
    await expect(
      runGmailPostConnectSetup({
        userId: "user-1",
        connectionId: "conn-1",
        accessToken: "access",
        refreshToken: "refresh",
        nextScanAt: null,
      }),
    ).resolves.toBeUndefined();
    expect(ensureManagedLabels).toHaveBeenCalledWith("conn-1", "access", "refresh", {
      delaysMs: [],
    });
  });
});
