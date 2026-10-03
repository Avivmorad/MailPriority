import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/login/:path*",
    "/dashboard/:path*",
    "/scan",
    "/scan/:path*",
    "/actions/:path*",
    "/mail/:path*",
    "/history",
    "/history/:path*",
    "/digests",
    "/digests/:path*",
    "/settings/:path*",
    "/usage",
    "/usage/:path*",
    "/onboarding",
    "/onboarding/:path*",
    "/thread/:path*",
  ],
};
