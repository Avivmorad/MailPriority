"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { FEEDBACK_KINDS } from "@/lib/threads/feedback";

const LABELS: Record<(typeof FEEDBACK_KINDS)[number], string> = {
  wrong: "This classification is wrong",
  important: "Important",
  not_important: "Not important",
  action: "Actions",
  no_action: "No action — For You",
  waiting: "Pending",
  not_waiting: "Not pending",
  ignore: "Ignored",
};

export function ThreadFeedback({ threadId }: { threadId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<(typeof FEEDBACK_KINDS)[number] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  async function send(kind: (typeof FEEDBACK_KINDS)[number]) {
    setBusy(kind);
    setMessage(null);
    setError(false);
    try {
      const response = await fetch(`/api/threads/${threadId}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const payload = (await response.json().catch(() => ({}))) as { applied?: boolean };
      if (!response.ok) {
        setError(true);
        setMessage("Could not save feedback.");
        return;
      }
      setMessage(
        payload.applied
          ? "Updated. This thread now follows your correction."
          : "Saved for evaluation. Choose Actions, Pending, or No action to move the thread.",
      );
      if (payload.applied) {
        router.refresh();
      }
    } catch {
      setError(true);
      setMessage("Could not save feedback.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="bg-card ring-foreground/10 space-y-3 rounded-xl p-4 ring-1 sm:p-5">
      <div>
        <p className="text-foreground font-semibold tracking-tight">
          Was this classification right?
        </p>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Corrections move the thread now. They are also kept for later evaluation.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {FEEDBACK_KINDS.map((kind) => (
          <Button
            key={kind}
            type="button"
            size="sm"
            variant="outline"
            disabled={busy !== null}
            aria-busy={busy === kind}
            onClick={() => void send(kind)}
          >
            {LABELS[kind]}
          </Button>
        ))}
      </div>
      {message ? (
        <p
          className={error ? "text-destructive text-xs" : "text-muted-foreground text-xs"}
          role={error ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
