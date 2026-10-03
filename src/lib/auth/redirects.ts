import { z } from "zod";

export const AUTH_OTP_TYPES = [
  "email",
  "signup",
  "recovery",
  "invite",
  "magiclink",
  "email_change",
] as const;

export type AuthOtpType = (typeof AUTH_OTP_TYPES)[number];

export const SAFE_AUTH_NEXT_PATHS = [
  "/login",
  "/login/update-password",
  "/onboarding",
  "/dashboard",
  "/scan",
  "/mail",
  "/history",
  "/digests",
  "/settings",
  "/usage",
  "/actions",
] as const;

export type SafeAuthNextPath = (typeof SAFE_AUTH_NEXT_PATHS)[number];

const authOtpTypeSchema = z.enum(AUTH_OTP_TYPES);
const THREAD_PATH = /^\/thread\/[A-Za-z0-9_-]+$/;

export function parseAuthOtpType(value: string | null): AuthOtpType | null {
  const parsed = authOtpTypeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function defaultAuthNext(type: AuthOtpType | null, oauthCode = false): SafeAuthNextPath {
  if (type === "recovery") {
    return "/login/update-password";
  }
  if (oauthCode) {
    return "/onboarding";
  }
  return "/login";
}

function isSafeRelativeAppPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return false;
  }
  if ((SAFE_AUTH_NEXT_PATHS as readonly string[]).includes(path)) {
    return true;
  }
  return THREAD_PATH.test(path);
}

/**
 * Same-origin app path for post-login / Gmail OAuth return. Rejects open redirects.
 */
export function safeAppReturnPath(
  raw: string | null | undefined,
  fallback: string = "/dashboard",
): string {
  if (!raw) {
    return fallback;
  }
  const path = raw.split("?")[0] ?? raw;
  return isSafeRelativeAppPath(path) ? path : fallback;
}

/** Only allow same-origin relative app paths. Reject protocol-relative and unknown routes. */
export function safeAuthNext(
  raw: string | null | undefined,
  type: AuthOtpType | null,
  oauthCode = false,
): string {
  if (!raw) {
    return defaultAuthNext(type, oauthCode);
  }
  const path = raw.split("?")[0] ?? raw;
  if (!isSafeRelativeAppPath(path)) {
    return defaultAuthNext(type, oauthCode);
  }
  return path;
}

export function passwordResetRedirectTo(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/auth/confirm`;
}

/**
 * PKCE return path for Supabase Auth Google sign-in (no Gmail scopes).
 * No `?next=` query: Site URL fallback (production) is used when redirectTo is
 * not an exact allow-list match.
 */
export function googleSignInRedirectTo(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/auth/confirm`;
}

/**
 * Supabase falls back to Site URL (`/?code=` or `/login?code=`) when `redirectTo`
 * is missing from the allow list. Forward that PKCE code to the confirm route.
 * Never intercept `/api/*` (Gmail OAuth uses a different `code` on `/api/gmail/callback`).
 */
export function oauthCodeConfirmUrl(url: URL): URL | null {
  if (url.pathname === "/auth/confirm" || url.pathname.startsWith("/api/")) {
    return null;
  }
  const code = url.searchParams.get("code");
  if (code) {
    const next = new URL(url.href);
    next.pathname = "/auth/confirm";
    if (!next.searchParams.get("next")) {
      next.searchParams.set("next", "/onboarding");
    }
    return next;
  }
  const error = url.searchParams.get("error");
  if (error && (url.pathname === "/" || url.pathname === "/login")) {
    const login = new URL("/login", url.origin);
    login.searchParams.set("error", oauthErrorQuery(error));
    return login;
  }
  return null;
}

export function oauthErrorQuery(error: string | null | undefined): "google_oauth" | "auth_link" {
  if (error && /access_denied|oauth|provider|cancelled/i.test(error)) {
    return "google_oauth";
  }
  return "auth_link";
}
