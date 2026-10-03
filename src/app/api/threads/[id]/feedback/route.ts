import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/supabase/auth";
import { threadFeedbackSchema } from "@/lib/threads/feedback";
import { saveThreadFeedback, ThreadQueryError } from "@/lib/threads/queries";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }
  const { id } = await params;
  const json = await request.json().catch(() => null);
  const parsed = threadFeedbackSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_feedback" }, { status: 400 });
  }
  try {
    const result = await saveThreadFeedback(user.id, id, parsed.data.kind);
    return NextResponse.json({
      ok: true,
      applied: result.applied,
      actionId: result.actionId,
    });
  } catch (error) {
    if (error instanceof ThreadQueryError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
}
