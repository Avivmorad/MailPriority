import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { oauthCodeConfirmUrl } from "@/lib/auth/redirects";
import { getClientEnv } from "@/lib/config/env";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/scan",
  "/actions",
  "/mail",
  "/history",
  "/digests",
  "/settings",
  "/usage",
  "/thread",
  "/onboarding",
];

/**
 * Refresh the Supabase auth session on each request and guard protected routes.
 *
 * If Supabase is not configured yet, this is a no-op so public pages keep
 * working. Protected pages additionally re-check auth on the server.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const oauthHandoff = oauthCodeConfirmUrl(request.nextUrl);
  if (oauthHandoff) {
    return NextResponse.redirect(oauthHandoff);
  }

  let supabaseResponse = NextResponse.next({ request });

  let env: ReturnType<typeof getClientEnv>;
  try {
    env = getClientEnv();
  } catch {
    // Supabase not configured — let the request through untouched.
    return supabaseResponse;
  }

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectedFrom", pathname);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
