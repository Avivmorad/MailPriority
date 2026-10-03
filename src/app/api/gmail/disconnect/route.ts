import { NextResponse } from "next/server";

import { safeAppReturnPath } from "@/lib/auth/redirects";
import { disconnectGmailAndClearAnalysis, disconnectGmailForUser } from "@/lib/gmail/connections";
import { createSupabaseDeletionPort, deleteAnalysisDataForUser } from "@/lib/privacy/deletion";
import { getSessionUser } from "@/lib/supabase/auth";

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", origin), { status: 303 });
  }

  let returnTo = "/settings";
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData().catch(() => null);
    returnTo = safeAppReturnPath(
      typeof form?.get("returnTo") === "string" ? String(form.get("returnTo")) : null,
      "/settings",
    );
  } else {
    const url = new URL(request.url);
    returnTo = safeAppReturnPath(url.searchParams.get("returnTo"), "/settings");
  }

  try {
    await disconnectGmailAndClearAnalysis(user.id, {
      disconnect: disconnectGmailForUser,
      purge: async (userId) => {
        await deleteAnalysisDataForUser(userId, createSupabaseDeletionPort());
      },
    });
  } catch {
    const url = new URL(returnTo, origin);
    url.searchParams.set("gmail", "error");
    url.searchParams.set("reason", "disconnect_failed");
    return NextResponse.redirect(url, { status: 303 });
  }

  const url = new URL(returnTo, origin);
  url.searchParams.set("gmail", "disconnected");
  return NextResponse.redirect(url, { status: 303 });
}
