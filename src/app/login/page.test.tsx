/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let searchParams = new URLSearchParams();

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
  useSearchParams: () => searchParams,
}));

type GoogleOAuthCall = {
  provider: string;
  options: Record<string, unknown>;
};
const oauthSuccess = {
  error: null as Error | null,
  data: { provider: "google" as const, url: null },
};
const resetPasswordForEmail = vi.fn(async () => ({ error: null }));
const signInWithOAuth = vi.fn<(args: GoogleOAuthCall) => Promise<typeof oauthSuccess>>(
  async () => oauthSuccess,
);
type PasswordSignInResult = { error: Error | null };
const signInWithPassword = vi.fn<
  (args: { email: string; password: string }) => Promise<PasswordSignInResult>
>(async () => ({ error: null }));
const signUp = vi.fn(async () => ({ error: null }));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signInWithPassword,
      signUp,
      resetPasswordForEmail,
      signInWithOAuth,
    },
  }),
}));

import LoginPage from "@/app/login/page";

afterEach(() => {
  cleanup();
  searchParams = new URLSearchParams();
  resetPasswordForEmail.mockClear();
  signInWithOAuth.mockClear();
  signInWithPassword.mockClear();
  signUp.mockClear();
  navigation.push.mockClear();
  navigation.refresh.mockClear();
  signInWithOAuth.mockResolvedValue(oauthSuccess);
  signInWithPassword.mockResolvedValue({ error: null });
});

describe("LoginPage", () => {
  beforeEach(() => {
    searchParams = new URLSearchParams();
  });

  it("frames a deep-link handoff when redirectedFrom is set", () => {
    searchParams = new URLSearchParams("redirectedFrom=/mail");
    render(<LoginPage />);
    expect(screen.getByText("Sign in to open your inbox triage.")).toBeInTheDocument();
  });

  it("toggles password visibility and opens forgot-password", async () => {
    render(<LoginPage />);

    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");

    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(screen.getByRole("heading", { level: 1, name: "Reset password" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to sign in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign up" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(resetPasswordForEmail).toHaveBeenCalledWith(
        "ada@example.com",
        expect.objectContaining({
          redirectTo: expect.stringContaining("/auth/confirm"),
        }),
      );
    });
    expect(screen.getByRole("status")).toHaveTextContent(/reset link/i);
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeEnabled();
  });

  it("shows a field error for an empty email", () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email address.");
  });

  it("shows Continue with Google on sign-in and signup, not password reset", () => {
    render(<LoginPage />);

    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    expect(
      screen.getByRole("heading", { level: 1, name: "Create your account" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(screen.queryByRole("button", { name: "Continue with Google" })).not.toBeInTheDocument();
  });

  it("starts Google OAuth with the confirm redirect and no extra scopes", async () => {
    render(<LoginPage />);

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() => {
      expect(signInWithOAuth).toHaveBeenCalledTimes(1);
    });
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/confirm`,
      },
    });
    const oauthCall = signInWithOAuth.mock.calls[0][0];
    expect(oauthCall).not.toHaveProperty("scopes");
    expect(oauthCall.options).not.toHaveProperty("scopes");
    expect(oauthCall.options).not.toHaveProperty("queryParams");
  });

  it("prevents duplicate Google OAuth requests while loading", async () => {
    let finishOAuth: (() => void) | undefined;
    signInWithOAuth.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishOAuth = () => resolve(oauthSuccess);
        }),
    );

    render(<LoginPage />);
    const googleButton = screen.getByRole("button", { name: "Continue with Google" });
    fireEvent.click(googleButton);
    fireEvent.click(googleButton);

    await waitFor(() => {
      expect(googleButton).toBeDisabled();
    });
    expect(signInWithOAuth).toHaveBeenCalledTimes(1);

    finishOAuth?.();
    await waitFor(() => {
      expect(signInWithOAuth).toHaveBeenCalledTimes(1);
    });
  });

  it("shows a safe message when Google OAuth fails", async () => {
    signInWithOAuth.mockResolvedValueOnce({
      error: new Error("access_denied provider_token=ya29.secret"),
      data: { provider: "google", url: null },
    });

    render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Google sign-in was cancelled or could not be completed. Try again.",
      );
    });
    expect(screen.getByRole("alert").textContent).not.toMatch(/ya29|provider_token/i);
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Signing in…" })).not.toBeInTheDocument();
  });

  it("keeps Signing in… after a successful submit until navigation", async () => {
    let finishSignIn: ((result: { error: Error | null }) => void) | undefined;
    signInWithPassword.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishSignIn = resolve;
        }),
    );

    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct-horse" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    const pending = await screen.findByRole("button", { name: "Signing in…" });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute("aria-busy", "true");

    finishSignIn?.({ error: null });

    await waitFor(() => {
      expect(navigation.push).toHaveBeenCalledWith("/onboarding");
    });
    expect(navigation.refresh).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Sign in" })).not.toBeInTheDocument();
  });

  it("restores Sign in when password sign-in fails", async () => {
    signInWithPassword.mockResolvedValueOnce({
      error: new Error("Invalid login credentials"),
    });

    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Email or password is incorrect.");
    });
    const signIn = screen.getByRole("button", { name: "Sign in" });
    expect(signIn).toBeEnabled();
    expect(signIn).toHaveAttribute("aria-busy", "false");
    expect(screen.queryByRole("button", { name: "Signing in…" })).not.toBeInTheDocument();
  });

  it("restores Sign in when the sign-in request throws", async () => {
    signInWithPassword.mockRejectedValueOnce(new Error("Failed to fetch"));

    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct-horse" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Something went wrong. Try again in a moment.",
      );
    });
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Signing in…" })).not.toBeInTheDocument();
  });

  it("keeps Continue with Google pending after OAuth starts", async () => {
    let finishOAuth: (() => void) | undefined;
    signInWithOAuth.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishOAuth = () => resolve(oauthSuccess);
        }),
    );

    render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    const pending = await screen.findByRole("button", { name: "Signing in…" });
    expect(pending).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();

    finishOAuth?.();
    await waitFor(() => {
      expect(signInWithOAuth).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Continue with Google" })).not.toBeInTheDocument();
  });
});
