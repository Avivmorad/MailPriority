import { cookies } from "next/headers";
import { after, NextResponse } from "next/server";
import { z } from "zod";

import { safeAppReturnPath } from "@/lib/auth/redirects";
import { completeGmailOAuth, gmailCallbackErrorRedirect } from "@/lib/gmail/connections";
import { GMAIL_OAUTH_RETURN_COOKIE, GMAIL_OAUTH_STATE_COOKIE } from "@/lib/gmail/constants";
import { GmailConnectError, isValidOAuthState } from "@/lib/gmail/oauth";
import { getSessionUser } from "@/lib/supabase/auth";

const callbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().optional(),
});

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const parsed = callbackQuerySchema.safeParse({
    code: requestUrl.searchParams.get("code") ?? undefined,
    state: requestUrl.searchParams.get("state") ?? undefined,
    error: requestUrl.searchParams.get("error") ?? undefined,
  });

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(GMAIL_OAUTH_STATE_COOKIE)?.value;
  const returnTo = safeAppReturnPath(
    cookieStore.get(GMAIL_OAUTH_RETURN_COOKIE)?.value,
    "/onboarding",
  );
  cookieStore.delete(GMAIL_OAUTH_STATE_COOKIE);
  cookieStore.delete(GMAIL_OAUTH_RETURN_COOKIE);

  if (!parsed.success) {
    return NextResponse.redirect(gmailCallbackErrorRedirect(origin, "invalid_request", returnTo));
  }

  const { code, state, error } = parsed.data;
  if (error) {
    return NextResponse.redirect(gmailCallbackErrorRedirect(origin, "denied", returnTo));
  }

  if (!isValidOAuthState(expectedState, state)) {
    return NextResponse.redirect(gmailCallbackErrorRedirect(origin, "invalid_state", returnTo));
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.redirect(gmailCallbackErrorRedirect(origin, "not_signed_in", returnTo));
  }

  if (!code) {
    return NextResponse.redirect(gmailCallbackErrorRedirect(origin, "missing_code", returnTo));
  }

  let runPostConnectSetup: (() => Promise<void>) | null = null;
  try {
    const result = await completeGmailOAuth(user.id, code);
    runPostConnectSetup = result.runPostConnectSetup;
  } catch (err) {
    if (err instanceof GmailConnectError) {
      return NextResponse.redirect(gmailCallbackErrorRedirect(origin, err.reason, returnTo));
    }
    const message = err instanceof Error ? err.message : "";
    if (message === "NO_REFRESH_TOKEN") {
      return NextResponse.redirect(
        gmailCallbackErrorRedirect(origin, "no_refresh_token", returnTo),
      );
    }
    return NextResponse.redirect(gmailCallbackErrorRedirect(origin, "connect_failed", returnTo));
  }

  // Labels + initial next_scan_at are not required to land in the app.
  // Run them after the redirect so Google → /api/gmail/callback feels fast.
  if (runPostConnectSetup) {
    after(async () => {
      await runPostConnectSetup();
    });
  }

  const success = new URL(returnTo, origin);
  success.searchParams.set("gmail", "connected");
  return NextResponse.redirect(success);
}
