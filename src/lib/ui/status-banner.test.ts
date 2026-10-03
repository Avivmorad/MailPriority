import { describe, expect, it } from "vitest";

import { appStatusBanner } from "@/lib/ui/status-banner";

describe("appStatusBanner", () => {
  it("prioritizes Gmail reauth over scan status", () => {
    const banner = appStatusBanner({
      connectionStatus: "REAUTH_REQUIRED",
      scanStatus: "FAILED",
    });
    expect(banner?.actionLabel).toBe("Reconnect Gmail");
    expect(banner?.title).toContain("refreshed");
  });

  it("treats a reauth scan failure like an expired connection", () => {
    const banner = appStatusBanner({
      connectionStatus: "CONNECTED",
      scanStatus: "FAILED",
      errorCode: "reauth_required",
    });
    expect(banner?.actionLabel).toBe("Reconnect Gmail");
    expect(banner?.title).toContain("refreshed");
  });

  it("uses quota and AI-unavailable copy and scan-anchor CTAs for failed scans", () => {
    const quotaBanner = appStatusBanner({
      connectionStatus: "CONNECTED",
      scanStatus: "FAILED",
      errorCode: "gmail_quota",
    });
    expect(quotaBanner?.title).toContain("quota");
    expect(quotaBanner?.href).toBe("/scan");
    expect(quotaBanner?.actionLabel).toBe("Try a shorter lookback");

    const aiBanner = appStatusBanner({
      connectionStatus: "CONNECTED",
      scanStatus: "FAILED",
      errorCode: "ai_unavailable",
    });
    expect(aiBanner?.title).toContain("temporarily unavailable");
    expect(aiBanner?.href).toBe("/scan");
    expect(aiBanner?.actionLabel).toBe("Try again");

    const cancelledBanner = appStatusBanner({
      connectionStatus: "CONNECTED",
      scanStatus: "FAILED",
      errorCode: "cancelled",
    });
    expect(cancelledBanner?.kind).toBe("info");
    expect(cancelledBanner?.title).toBe("Scan stopped.");
    expect(cancelledBanner?.href).toBe("/scan");
    expect(cancelledBanner?.actionLabel).toBe("Scan again");

    const genericBanner = appStatusBanner({
      connectionStatus: "CONNECTED",
      scanStatus: "FAILED",
    });
    expect(genericBanner?.href).toBe("/scan");
    expect(genericBanner?.actionLabel).toBe("Scan again");
  });

  it("uses spec copy and mail view CTA for a partial scan", () => {
    const banner = appStatusBanner({
      connectionStatus: "CONNECTED",
      scanStatus: "PARTIAL",
    });
    expect(banner?.kind).toBe("warning");
    expect(banner?.body).toBe("The system will retry them.");
    expect(banner?.href).toBe("/mail");
    expect(banner?.actionLabel).toBe("View mail");
  });

  it("hides a running-scan banner on the dashboard", () => {
    expect(
      appStatusBanner({
        connectionStatus: "CONNECTED",
        scanStatus: "RUNNING",
        suppressRunning: true,
      }),
    ).toBeNull();
    expect(
      appStatusBanner({
        connectionStatus: "CONNECTED",
        scanStatus: "RUNNING",
      })?.title,
    ).toBe("A scan is running.");
  });

  it("returns null when nothing needs attention", () => {
    expect(
      appStatusBanner({
        connectionStatus: "CONNECTED",
        scanStatus: "SUCCESS",
      }),
    ).toBeNull();
  });
});
