import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { oauthErrorQuery, parseAuthOtpType, safeAuthNext } from "@/lib/auth/redirects";
import { getOnboardingStepForUser } from "@/lib/onboarding/load";
import { createClient } from "@/lib/supabase/server";

const confirmQuerySchema = z.object({
  token_hash: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  next: z.string().min(1).optional(),
});

export async function GET(request: NextRequest) {
  const parsed = confirmQuerySchema.safeParse({
    token_hash: request.nextUrl.searchParams.get("token_hash") ?? undefined,
    type: request.nextUrl.searchParams.get("type") ?? undefined,
    code: request.nextUrl.searchParams.get("code") ?? undefined,
    next: request.nextUrl.searchParams.get("next") ?? undefined,
  });

  const destination = request.nextUrl.clone();
  destination.hash = "";
  destination.search = "";

  if (!parsed.success) {
    destination.pathname = "/login";
    destination.searchParams.set("error", "auth_link");
    return NextResponse.redirect(destination);
  }

  const otpType = parseAuthOtpType(parsed.data.type ?? null);
  const isOAuthCode = Boolean(parsed.data.code);
  destination.pathname = safeAuthNext(parsed.data.next, otpType, isOAuthCode);

  if (!parsed.data.token_hash && !parsed.data.code) {
    destination.pathname = "/login";
    destination.searchParams.set(
      "error",
      oauthErrorQuery(request.nextUrl.searchParams.get("error")),
    );
    return NextResponse.redirect(destination);
  }

  let exchangedUserId: string | null = null;

  try {
    const supabase = await createClient();
    if (parsed.data.token_hash && otpType) {
      const { error } = await supabase.auth.verifyOtp({
        type: otpType,
        token_hash: parsed.data.token_hash,
      });
      if (error) {
        throw error;
      }
    } else if (parsed.data.code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(parsed.data.code);
      if (error) {
        throw error;
      }
      exchangedUserId = data.user?.id ?? data.session?.user?.id ?? null;
    }
  } catch {
    destination.pathname = "/login";
    destination.searchParams.set("error", "auth_link");
    return NextResponse.redirect(destination);
  }

  if (destination.pathname === "/onboarding" && exchangedUserId) {
    try {
      const step = await getOnboardingStepForUser(exchangedUserId);
      if (step === "complete") {
        destination.pathname = "/dashboard";
      }
    } catch {
      // Keep /onboarding if step resolution fails.
    }
  }

  if (destination.pathname === "/login") {
    destination.searchParams.set("notice", otpType === "recovery" ? "reset_ready" : "confirmed");
  }

  return NextResponse.redirect(destination);
}
