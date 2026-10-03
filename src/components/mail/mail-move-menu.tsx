"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { MailGmailLink, MailOpenLink } from "@/components/mail/mail-card-chrome";
import { Button } from "@/components/ui/button";
import { actionChangeAnnouncement } from "@/lib/actions/announcements";
import { MAX_SNOOZE_DAYS, SNOOZE_DAYS, type SnoozeDays } from "@/lib/actions/patch-schema";
import type { FeedbackKind } from "@/lib/threads/apply-feedback";
import { addCalendarDaysIso, formatDate } from "@/lib/ui/format";

const DESTINATIONS = [
  { id: "summary", label: "For You" },
  { id: "open", label: "Actions" },
  { id: "waiting", label: "Pending" },
  { id: "completed", label: "Closed" },
  { id: "snoozed", label: "Snoozed" },
  { id: "ignored", label: "Ignored" },
] as const;

type DestinationId = (typeof DESTINATIONS)[number]["id"];

export function MailMoveMenu({
  openHref,
  gmailHref,
  threadId,
  actionId,
  actionStatus,
  waitingFor,
  snoozedUntil,
}: {
  openHref: string;
  gmailHref: string;
  threadId: string;
  actionId?: string | null;
  actionStatus?: string | null;
  waitingFor?: string | null;
  snoozedUntil?: string | null;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<"waiting" | "snoozed" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [waitingDraft, setWaitingDraft] = useState(waitingFor ?? "");
  const [customOpen, setCustomOpen] = useState(false);
  const [customDate, setCustomDate] = useState("");
  const minDate = useMemo(() => addCalendarDaysIso(1), []);
  const maxDate = useMemo(() => addCalendarDaysIso(MAX_SNOOZE_DAYS), []);

  async function postFeedback(kind: FeedbackKind): Promise<string | null> {
    const response = await fetch(`/api/threads/${threadId}/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      applied?: boolean;
      actionId?: string | null;
      message?: string;
    };
    if (!response.ok || payload.applied === false) {
      throw new Error(payload.message ?? "Could not apply the correction.");
    }
    return typeof payload.actionId === "string" ? payload.actionId : null;
  }

  async function patchAction(id: string, body: Record<string, unknown>) {
    const response = await fetch(`/api/actions/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(payload.message ?? "Update failed.");
    }
    setNotice(actionChangeAnnouncement(typeof body.op === "string" ? body.op : undefined));
  }

  async function apply(
    destination: DestinationId,
    extra?: { waitingFor?: string; days?: SnoozeDays; until?: string },
  ) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (destination === "completed" || destination === "snoozed") {
        const id = actionId ?? (await postFeedback("action"));
        if (!id) {
          throw new Error("Could not apply the correction.");
        }
        if (destination === "completed") {
          await patchAction(id, { op: "complete" });
        } else if (extra?.until) {
          await patchAction(id, { op: "snooze", until: extra.until });
        } else if (extra?.days) {
          await patchAction(id, { op: "snooze", days: extra.days });
        }
      } else if (destination === "waiting") {
        const who = extra?.waitingFor?.trim();
        if (!who) {
          throw new Error("Say who or what this is pending on.");
        }
        const id = actionId ?? (await postFeedback("waiting"));
        if (!id) {
          throw new Error("Could not apply the correction.");
        }
        await patchAction(id, { op: "wait", waitingFor: who });
        if (actionId) {
          await postFeedback("waiting");
        }
      } else if (destination === "open") {
        if (actionId && actionStatus && actionStatus !== "OPEN") {
          await patchAction(actionId, { op: "reopen" });
        }
        await postFeedback("action");
        setNotice("Moved to Actions.");
      } else if (destination === "summary") {
        await postFeedback("no_action");
        setNotice("Moved to For You.");
      } else {
        await postFeedback("ignore");
        setNotice("Moved to Ignored.");
      }
      setPanel(null);
      setCustomOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not apply the correction.");
    } finally {
      setBusy(false);
    }
  }

  function choose(destination: DestinationId) {
    setMenuOpen(false);
    setError(null);
    if (destination === "waiting") {
      setPanel("waiting");
      setCustomOpen(false);
      return;
    }
    if (destination === "snoozed") {
      setPanel("snoozed");
      return;
    }
    setPanel(null);
    void apply(destination);
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center justify-start gap-2">
        <MailOpenLink href={openHref} />
        <MailGmailLink href={gmailHref} />
        <Button
          type="button"
          variant="outline"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          disabled={busy}
          aria-busy={busy}
          onClick={() => setMenuOpen((open) => !open)}
        >
          Move to
        </Button>
      </div>
      {menuOpen ? (
        <ul
          role="menu"
          aria-label="Move to"
          className="border-border bg-popover w-full max-w-xs rounded-lg border p-1 shadow-xs"
        >
          {DESTINATIONS.map((destination) => (
            <li key={destination.id} role="none">
              <button
                type="button"
                role="menuitem"
                className="hover:bg-muted focus-visible:ring-ring w-full rounded-md px-2.5 py-1.5 text-start text-sm focus-visible:ring-3 focus-visible:outline-none"
                disabled={busy}
                onClick={() => choose(destination.id)}
              >
                {destination.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {panel === "waiting" ? (
        <form
          className="flex w-full flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void apply("waiting", { waitingFor: waitingDraft });
          }}
        >
          <label className="text-muted-foreground flex min-w-0 flex-1 items-center gap-1.5 text-sm sm:max-w-xs">
            Pending on
            <input
              type="text"
              className="border-input bg-background h-9 min-w-0 flex-1 rounded-lg border px-2 text-sm"
              maxLength={200}
              value={waitingDraft}
              disabled={busy}
              placeholder="who or what"
              aria-label="Pending on"
              onChange={(event) => setWaitingDraft(event.target.value)}
            />
          </label>
          <Button type="submit" variant="outline" disabled={busy || !waitingDraft.trim()}>
            Save
          </Button>
        </form>
      ) : null}
      {panel === "snoozed" ? (
        <div className="flex w-full flex-col gap-2">
          <label className="text-muted-foreground flex items-center gap-1.5 text-sm">
            Snooze
            <select
              className="border-input bg-background h-9 rounded-lg border px-2 text-sm"
              disabled={busy}
              defaultValue=""
              aria-label="Snooze for"
              onChange={(event) => {
                const value = event.target.value;
                if (value === "custom") {
                  setCustomOpen(true);
                  event.currentTarget.value = "";
                  return;
                }
                const days = Number(value) as SnoozeDays;
                if ((SNOOZE_DAYS as readonly number[]).includes(days)) {
                  void apply("snoozed", { days });
                }
                event.currentTarget.value = "";
              }}
            >
              <option value="" disabled>
                Choose days
              </option>
              {SNOOZE_DAYS.map((days) => (
                <option key={days} value={days}>
                  {days} day{days === 1 ? "" : "s"}
                </option>
              ))}
              <option value="custom">Pick a date</option>
            </select>
          </label>
          {actionStatus === "SNOOZED" && snoozedUntil ? (
            <span className="text-muted-foreground text-xs">
              Until {formatDate(snoozedUntil.slice(0, 10))}
            </span>
          ) : null}
          {customOpen ? (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (customDate) {
                  void apply("snoozed", { until: customDate });
                }
              }}
            >
              <label className="text-muted-foreground flex items-center gap-1.5 text-sm">
                Until
                <input
                  type="date"
                  className="border-input bg-background h-9 rounded-lg border px-2 text-sm"
                  min={minDate}
                  max={maxDate}
                  value={customDate}
                  disabled={busy}
                  required
                  onChange={(event) => setCustomDate(event.target.value)}
                />
              </label>
              <Button type="submit" variant="outline" disabled={busy || !customDate}>
                Snooze
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
      {notice ? (
        <p className="text-muted-foreground w-full text-xs" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="text-destructive w-full text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
