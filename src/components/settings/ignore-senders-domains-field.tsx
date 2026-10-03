"use client";

import { useId, useState, type KeyboardEvent } from "react";

import { SettingLabel } from "@/components/settings/setting-info";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TRIAGE_LIST_MAX } from "@/lib/settings/limits";
import { IGNORE_SENDERS_DOMAINS_LABEL } from "@/lib/settings/setting-info-copy";
import { parseIgnoreEntry } from "@/lib/settings/triage-lists";
import { cn } from "@/lib/utils";

const INVALID_MESSAGE = "Enter an email address or a domain (for example newsletters.example.com).";

type ChipKind = "email" | "domain";

function kindLabel(kind: ChipKind): string {
  return kind === "email" ? "Email" : "Domain";
}

export function IgnoreSendersDomainsField({
  senders,
  domains,
  onChange,
  info,
  disabled = false,
}: {
  senders: string[];
  domains: string[];
  onChange: (next: { senders: string[]; domains: string[] }) => void;
  info: string;
  disabled?: boolean;
}) {
  const inputId = useId();
  const errorId = useId();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const bothFull = senders.length >= TRIAGE_LIST_MAX && domains.length >= TRIAGE_LIST_MAX;
  const chips: { kind: ChipKind; value: string }[] = [
    ...senders.map((value) => ({ kind: "email" as const, value })),
    ...domains.map((value) => ({ kind: "domain" as const, value })),
  ];

  function addDraft() {
    const parsed = parseIgnoreEntry(draft);
    if (!parsed.ok) {
      setError(INVALID_MESSAGE);
      return;
    }
    if (parsed.kind === "sender") {
      if (senders.includes(parsed.value)) {
        setDraft("");
        setError(null);
        return;
      }
      if (senders.length >= TRIAGE_LIST_MAX) {
        setError(`You can add up to ${TRIAGE_LIST_MAX} email addresses.`);
        return;
      }
      onChange({ senders: [...senders, parsed.value], domains });
    } else {
      if (domains.includes(parsed.value)) {
        setDraft("");
        setError(null);
        return;
      }
      if (domains.length >= TRIAGE_LIST_MAX) {
        setError(`You can add up to ${TRIAGE_LIST_MAX} domains.`);
        return;
      }
      onChange({ senders, domains: [...domains, parsed.value] });
    }
    setDraft("");
    setError(null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      addDraft();
    }
  }

  function removeChip(kind: ChipKind, value: string) {
    if (kind === "email") {
      onChange({ senders: senders.filter((entry) => entry !== value), domains });
    } else {
      onChange({ senders, domains: domains.filter((entry) => entry !== value) });
    }
    setError(null);
  }

  return (
    <div className="block text-sm">
      <SettingLabel label={IGNORE_SENDERS_DOMAINS_LABEL} htmlFor={inputId} description={info} />
      <div className="flex gap-2">
        <input
          id={inputId}
          type="text"
          autoComplete="off"
          spellCheck={false}
          className="border-input bg-background h-9 min-w-0 flex-1 rounded-lg border px-3 text-sm"
          value={draft}
          placeholder="name@example.com or example.com"
          disabled={disabled || bothFull}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            setDraft(event.target.value);
            if (error) {
              setError(null);
            }
          }}
          onKeyDown={onKeyDown}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={disabled || bothFull || draft.trim().length === 0}
          onClick={addDraft}
        >
          Add
        </Button>
      </div>
      {chips.length > 0 ? (
        <ul
          className="mt-2 flex flex-wrap gap-1.5"
          aria-label={`${IGNORE_SENDERS_DOMAINS_LABEL} entries`}
        >
          {chips.map((chip) => (
            <li key={`${chip.kind}:${chip.value}`} className="max-w-full">
              <Badge
                variant={chip.kind === "domain" ? "outline" : "secondary"}
                className={cn(
                  "border-border/70 h-auto max-w-full gap-1 rounded-lg border px-2 py-1 font-normal whitespace-normal",
                )}
              >
                <span className="text-muted-foreground shrink-0 text-[10px] font-medium tracking-wide uppercase">
                  {kindLabel(chip.kind)}
                </span>
                <span className="min-w-0 text-start [overflow-wrap:anywhere] break-words">
                  {chip.value}
                </span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground -mr-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-md transition-colors"
                  aria-label={`Remove ${kindLabel(chip.kind).toLowerCase()} ${chip.value}`}
                  disabled={disabled}
                  onClick={() => removeChip(chip.kind, chip.value)}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p id={errorId} className="text-destructive mt-1.5 text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
