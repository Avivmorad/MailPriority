import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn();
const verifyOtp = vi.fn();
const getOnboardingStepForUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession,
      verifyOtp,
    },
  })),
}));

vi.mock("@/lib/onboarding/load", () => ({
  getOnboardingStepForUser: (...args: unknown[]) => getOnboardingStepForUser(...args),
}));

import { GET } from "@/app/auth/confirm/route";

describe("GET /auth/confirm", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
    verifyOtp.mockReset();
    getOnboardingStepForUser.mockReset();
    exchangeCodeForSession.mockResolvedValue({
      data: { user: { id: "user-1" }, session: { user: { id: "user-1" } } },
      error: null,
    });
    verifyOtp.mockResolvedValue({ error: null });
    getOnboardingStepForUser.mockResolvedValue("connect_gmail");
  });

  it("exchanges a PKCE code and redirects incomplete users to onboarding", async () => {
    getOnboardingStepForUser.mockResolvedValue("connect_gmail");
    const request = new NextRequest(
      "http://localhost:3000/auth/confirm?code=pkce-code&next=/onboarding",
    );

    const response = await GET(request);

    expect(exchangeCodeForSession).toHaveBeenCalledWith("pkce-code");
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(getOnboardingStepForUser).toHaveBeenCalledWith("user-1");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/onboarding");
  });

  it("exchanges a PKCE code without next and redirects incomplete users to onboarding", async () => {
    getOnboardingStepForUser.mockResolvedValue("configure_and_scan");
    const request = new NextRequest("http://localhost:3000/auth/confirm?code=pkce-code");

    const response = await GET(request);

    expect(exchangeCodeForSession).toHaveBeenCalledWith("pkce-code");
    expect(getOnboardingStepForUser).toHaveBeenCalledWith("user-1");
    expect(response.headers.get("location")).toBe("http://localhost:3000/onboarding");
  });

  it("sends completed users to the dashboard instead of onboarding", async () => {
    getOnboardingStepForUser.mockResolvedValue("complete");
    const request = new NextRequest(
      "http://localhost:3000/auth/confirm?code=pkce-code&next=/onboarding",
    );

    const response = await GET(request);

    expect(getOnboardingStepForUser).toHaveBeenCalledWith("user-1");
    expect(response.headers.get("location")).toBe("http://localhost:3000/dashboard");
  });

  it("maps cancelled Google OAuth to a Google error instead of an expired link", async () => {
    const request = new NextRequest(
      "http://localhost:3000/auth/confirm?error=access_denied&next=/onboarding",
    );

    const response = await GET(request);
    const location = new URL(response.headers.get("location") ?? "");

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(getOnboardingStepForUser).not.toHaveBeenCalled();
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("google_oauth");
  });

  it("sends failed OAuth exchanges to login without leaking provider errors", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { user: null, session: null },
      error: new Error("Unable to exchange code provider_token=secret"),
    });
    const request = new NextRequest(
      "http://localhost:3000/auth/confirm?code=bad-code&next=/onboarding",
    );

    const response = await GET(request);
    const location = new URL(response.headers.get("location") ?? "");

    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("auth_link");
    expect(location.search).not.toMatch(/secret|provider_token/i);
    expect(getOnboardingStepForUser).not.toHaveBeenCalled();
  });
});
