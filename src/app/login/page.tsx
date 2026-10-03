"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState, type FormEvent, type ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { SkipToContent } from "@/components/layout/skip-to-content";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authUserMessage } from "@/lib/auth/messages";
import {
  googleSignInRedirectTo,
  passwordResetRedirectTo,
  safeAppReturnPath,
} from "@/lib/auth/redirects";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup" | "forgot";

const inputClassName =
  "w-full min-h-11 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition-[border-color,box-shadow] duration-150 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const QUERY_NOTICES: Record<string, string> = {
  confirmed: "Email confirmed. You can sign in now.",
  password_updated: "Password updated. Sign in with your new password.",
  reset_ready: "Choose a new password to finish resetting your account.",
};

const QUERY_ERRORS: Record<string, string> = {
  auth_link: "This confirmation or reset link is invalid or has expired. Request a new one.",
  google_oauth: "Google sign-in was cancelled or could not be completed. Try again.",
};

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginShell />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginShell({ children }: { children?: ReactNode }) {
  return (
    <div className="bg-muted/30 relative flex min-h-full flex-1 flex-col items-center justify-center px-6 py-16">
      <SkipToContent />
      <ThemeToggle className="absolute top-4 right-4" />
      <div className="mb-8">
        <Link
          href="/"
          aria-label="Back to home"
          className="focus-visible:ring-ring rounded-lg focus-visible:ring-3 focus-visible:outline-none"
        >
          <Logo />
        </Link>
      </div>
      <main id="main-content" tabIndex={-1} className="w-full max-w-sm">
        {children ?? (
          <Card className="w-full shadow-sm">
            <CardHeader>
              <CardTitle>Sign in</CardTitle>
              <CardDescription>Loading…</CardDescription>
            </CardHeader>
          </Card>
        )}
      </main>
      <p className="text-muted-foreground mt-6 text-center text-sm">
        <Link href="/privacy" className="hover:text-foreground underline-offset-4 hover:underline">
          Privacy
        </Link>
        <span aria-hidden="true"> · </span>
        <Link href="/terms" className="hover:text-foreground underline-offset-4 hover:underline">
          Terms
        </Link>
      </p>
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectedFrom = searchParams.get("redirectedFrom");
  const hasAppReturn = Boolean(redirectedFrom && redirectedFrom.startsWith("/"));
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<"form" | "google" | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    QUERY_ERRORS[searchParams.get("error") ?? ""] ?? null,
  );
  const [notice, setNotice] = useState<string | null>(
    QUERY_NOTICES[searchParams.get("notice") ?? ""] ?? null,
  );
  const googleSignInStarted = useRef(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setFieldError(null);

    if (loading || googleSignInStarted.current) {
      return;
    }

    if (!email.includes("@") || email.trim().length < 3) {
      setFieldError("Enter a valid email address.");
      return;
    }

    setPendingAction("form");
    setLoading(true);
    let leavePending = false;

    try {
      const supabase = createClient();

      if (mode === "forgot") {
        const origin = window.location.origin;
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: passwordResetRedirectTo(origin),
        });
        if (resetError) throw resetError;
        setNotice("If an account exists for that email, we sent a reset link. Check your inbox.");
        return;
      }

      if (mode === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
        const next = safeAppReturnPath(searchParams.get("redirectedFrom"), "/onboarding");
        router.push(next);
        router.refresh();
        leavePending = true;
        return;
      }

      const { error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (signUpError) throw signUpError;
      setNotice("Account created. Check your email to confirm, then sign in.");
      setMode("signin");
    } catch (err) {
      setError(authUserMessage(err));
    } finally {
      if (!leavePending) {
        setPendingAction(null);
        setLoading(false);
      }
    }
  }

  async function onGoogleSignIn() {
    if (loading || googleSignInStarted.current) {
      return;
    }

    googleSignInStarted.current = true;
    setError(null);
    setNotice(null);
    setFieldError(null);
    setPendingAction("google");
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: googleSignInRedirectTo(window.location.origin),
        },
      });
      if (oauthError) {
        throw oauthError;
      }
    } catch (err) {
      googleSignInStarted.current = false;
      setPendingAction(null);
      setError(authUserMessage(err));
      setLoading(false);
    }
  }

  return (
    <LoginShell>
      <Card className="w-full shadow-sm">
        <CardHeader>
          <CardTitle>
            <h1 className="text-base font-semibold">
              {mode === "signin"
                ? "Sign in"
                : mode === "signup"
                  ? "Create your account"
                  : "Reset password"}
            </h1>
          </CardTitle>
          <CardDescription>
            {mode === "signin"
              ? hasAppReturn
                ? "Sign in to open your inbox triage."
                : "Welcome back. Sign in to your MailPriority account."
              : mode === "signup"
                ? "Sign up to start triaging your inbox."
                : "We will email a reset link if that address has an account."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mode !== "forgot" ? (
            <div className="mb-4 space-y-4">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full"
                disabled={loading}
                aria-busy={loading}
                onClick={() => {
                  void onGoogleSignIn();
                }}
              >
                <GoogleMark />
                {loading && pendingAction === "google" ? "Signing in…" : "Continue with Google"}
              </Button>
              <p className="text-muted-foreground flex items-center gap-3 text-xs">
                <span className="bg-border h-px flex-1" aria-hidden="true" />
                or
                <span className="bg-border h-px flex-1" aria-hidden="true" />
              </p>
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={inputClassName}
                placeholder="you@example.com"
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? "email-error" : undefined}
              />
              {fieldError ? (
                <p id="email-error" className="text-destructive text-sm" role="alert">
                  {fieldError}
                </p>
              ) : null}
            </div>

            {mode !== "forgot" ? (
              <div className="space-y-1.5">
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  required
                  minLength={6}
                  maxLength={72}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={inputClassName}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  className="text-foreground inline-flex min-h-10 items-center text-sm font-medium underline underline-offset-4"
                  aria-pressed={showPassword}
                  aria-controls="password"
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? "Hide password" : "Show password"}
                </button>
              </div>
            ) : null}

            {error ? (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            ) : null}
            {notice ? (
              <p className="text-urgency-low text-sm" role="status">
                {notice}
              </p>
            ) : null}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={loading}
              aria-busy={loading}
            >
              {loading && pendingAction === "form"
                ? mode === "signin"
                  ? "Signing in…"
                  : "Please wait…"
                : mode === "signin"
                  ? "Sign in"
                  : mode === "signup"
                    ? "Sign up"
                    : "Send reset link"}
            </Button>
          </form>

          {mode === "signin" ? (
            <p className="mt-3 text-center text-sm">
              <button
                type="button"
                className="text-foreground font-medium underline underline-offset-4"
                onClick={() => {
                  setMode("forgot");
                  setError(null);
                  setNotice(null);
                  setFieldError(null);
                }}
              >
                Forgot password?
              </button>
            </p>
          ) : null}

          {mode === "forgot" ? (
            <div className="mt-4 space-y-2 text-center text-sm">
              <p>
                <button
                  type="button"
                  className="text-foreground font-medium underline underline-offset-4"
                  onClick={() => {
                    setMode("signin");
                    setError(null);
                    setNotice(null);
                  }}
                >
                  Back to sign in
                </button>
              </p>
              <p className="text-muted-foreground">
                {"Don't have an account? "}
                <button
                  type="button"
                  className="text-foreground font-medium underline underline-offset-4"
                  onClick={() => {
                    setMode("signup");
                    setError(null);
                    setNotice(null);
                    setFieldError(null);
                  }}
                >
                  Sign up
                </button>
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground mt-4 text-center text-sm">
              {mode === "signup" ? "Already have an account? " : "Don't have an account? "}
              <button
                type="button"
                className="text-foreground font-medium underline underline-offset-4"
                onClick={() => {
                  setMode(mode === "signup" ? "signin" : "signup");
                  setError(null);
                  setNotice(null);
                  setFieldError(null);
                }}
              >
                {mode === "signup" ? "Sign in" : "Sign up"}
              </button>
            </p>
          )}
        </CardContent>
      </Card>
    </LoginShell>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.86-.08-1.69-.23-2.49H12v4.72h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.85"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.88l-3.88-3c-1.08.72-2.46 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.26v3.09A12 12 0 0 0 12 24"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.31A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.58.38-2.31V6.6H1.26A12 12 0 0 0 0 12c0 1.94.46 3.77 1.26 5.4z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.26 6.6l4.01 3.09C6.22 6.86 8.87 4.75 12 4.75"
      />
    </svg>
  );
}
