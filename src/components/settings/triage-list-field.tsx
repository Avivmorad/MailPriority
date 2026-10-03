"use client";

import { useId, useState, type KeyboardEvent } from "react";

import { SettingLabel } from "@/components/settings/setting-info";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TRIAGE_LIST_MAX } from "@/lib/settings/limits";
import { cn } from "@/lib/utils";

export function TriageListField({
  label,
  info,
  values,
  onChange,
  parseValue,
  placeholder,
  invalidMessage,
  disabled = false,
  inputMode,
}: {
  label: string;
  info?: string;
  values: string[];
  onChange: (next: string[]) => void;
  parseValue: (raw: string) => { ok: true; value: string } | { ok: false };
  placeholder?: string;
  invalidMessage: string;
  disabled?: boolean;
  inputMode?: "email" | "text";
}) {
  const inputId = useId();
  const errorId = useId();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const atLimit = values.length >= TRIAGE_LIST_MAX;

  function addDraft() {
    const parsed = parseValue(draft);
    if (!parsed.ok) {
      setError(invalidMessage);
      return;
    }
    if (values.includes(parsed.value)) {
      setDraft("");
      setError(null);
      return;
    }
    if (values.length >= TRIAGE_LIST_MAX) {
      setError(`You can add up to ${TRIAGE_LIST_MAX} entries.`);
      return;
    }
    onChange([...values, parsed.value]);
    setDraft("");
    setError(null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      addDraft();
    }
  }

  function removeValue(value: string) {
    onChange(values.filter((entry) => entry !== value));
    setError(null);
  }

  return (
    <div className="block text-sm">
      {info ? (
        <SettingLabel label={label} htmlFor={inputId} description={info} />
      ) : (
        <label htmlFor={inputId} className="text-muted-foreground mb-1.5 block">
          {label}
        </label>
      )}
      <div className="flex gap-2">
        <input
          id={inputId}
          type="text"
          inputMode={inputMode}
          autoComplete="off"
          spellCheck={false}
          className="border-input bg-background h-9 min-w-0 flex-1 rounded-lg border px-3 text-sm"
          value={draft}
          placeholder={placeholder}
          disabled={disabled || atLimit}
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
          disabled={disabled || atLimit || draft.trim().length === 0}
          onClick={addDraft}
        >
          Add
        </Button>
      </div>
      {values.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`${label} entries`}>
          {values.map((value) => (
            <li key={value} className="max-w-full">
              <Badge
                variant="secondary"
                className={cn(
                  "border-border/70 h-auto max-w-full gap-1 rounded-lg border px-2 py-1 font-normal whitespace-normal",
                )}
              >
                <span className="min-w-0 text-start [overflow-wrap:anywhere] break-words">
                  {value}
                </span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground -mr-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-md transition-colors"
                  aria-label={`Remove ${value}`}
                  disabled={disabled}
                  onClick={() => removeValue(value)}
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
