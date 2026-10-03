"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { IgnoreSendersDomainsField } from "@/components/settings/ignore-senders-domains-field";
import { SettingInfo, SettingLabel } from "@/components/settings/setting-info";
import { TriageListField } from "@/components/settings/triage-list-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DEFAULT_LOOKBACK_DAYS } from "@/lib/scans/lookback";
import { CUSTOM_AI_INSTRUCTIONS_MAX } from "@/lib/settings/limits";
import {
  TRIAGE_CARD_DESCRIPTION,
  TRIAGE_SETTINGS_SAVED_MESSAGE,
  TRIAGE_UPDATE_STARTED_MESSAGE,
} from "@/lib/settings/schedule-copy";
import {
  CUSTOM_TRIAGE_INSTRUCTIONS_INFO,
  CUSTOM_TRIAGE_INSTRUCTIONS_LABEL,
  HISTORY_AFTER_SCAN_INFO,
  HISTORY_AFTER_SCAN_LABEL,
  IGNORE_SENDERS_DOMAINS_INFO,
  SAVE_TRIAGE_INFO,
  SAVE_TRIAGE_LABEL,
  UPDATE_NOW_INFO,
  UPDATE_NOW_LABEL,
  VIP_SENDERS_INFO,
  VIP_SENDERS_LABEL,
} from "@/lib/settings/setting-info-copy";
import { parseTriageSender } from "@/lib/settings/triage-lists";

export function TriagePreferencesForm({
  vipSenders,
  ignoredSenders,
  ignoredDomains,
  customAiInstructions,
  digestEnabled,
}: {
  vipSenders: string[];
  ignoredSenders: string[];
  ignoredDomains: string[];
  customAiInstructions: string;
  digestEnabled: boolean;
}) {
  const router = useRouter();
  const instructionsId = useId();
  const [vip, setVip] = useState(vipSenders);
  const [ignored, setIgnored] = useState(ignoredSenders);
  const [domains, setDomains] = useState(ignoredDomains);
  const [instructions, setInstructions] = useState(customAiInstructions);
  const [digest, setDigest] = useState(digestEnabled);
  const [busy, setBusy] = useState<"save" | "update" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  function payload() {
    return {
      vipSenders: vip,
      ignoredSenders: ignored,
      ignoredDomains: domains,
      customAiInstructions: instructions,
      digestEnabled: digest,
    };
  }

  async function saveSettings(): Promise<boolean> {
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload()),
    });
    if (!response.ok) {
      setError(true);
      setMessage(
        response.status === 401
          ? "Sign in to save triage settings."
          : "Could not save triage settings. Check emails, domains, and instruction length.",
      );
      return false;
    }
    return true;
  }

  async function save() {
    setBusy("save");
    setMessage(null);
    setError(false);
    try {
      const ok = await saveSettings();
      if (!ok) {
        return;
      }
      setMessage(TRIAGE_SETTINGS_SAVED_MESSAGE);
      router.refresh();
    } catch {
      setError(true);
      setMessage("Could not save triage settings.");
    } finally {
      setBusy(null);
    }
  }

  async function updateNow() {
    setBusy("update");
    setMessage(null);
    setError(false);
    try {
      const saved = await saveSettings();
      if (!saved) {
        return;
      }
      const response = await fetch("/api/scans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lookbackDays: DEFAULT_LOOKBACK_DAYS }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
          error?: string;
        } | null;
        setError(true);
        setMessage(
          body?.message ??
            "Settings were saved, but Update Now could not start. Try Scan now on the Scan tab.",
        );
        router.refresh();
        return;
      }
      setMessage(TRIAGE_UPDATE_STARTED_MESSAGE);
      router.refresh();
    } catch {
      setError(true);
      setMessage("Settings may not have been applied. Try again, or use Scan now on the Scan tab.");
    } finally {
      setBusy(null);
    }
  }

  const disabled = busy !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Triage</CardTitle>
        <CardDescription>{TRIAGE_CARD_DESCRIPTION}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          data-testid="triage-sender-editors"
          className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] items-start gap-4"
        >
          <TriageListField
            label={VIP_SENDERS_LABEL}
            info={VIP_SENDERS_INFO}
            values={vip}
            onChange={setVip}
            parseValue={parseTriageSender}
            placeholder="vip@example.com"
            invalidMessage="Enter a valid email address."
            disabled={disabled}
            inputMode="email"
          />
          <IgnoreSendersDomainsField
            senders={ignored}
            domains={domains}
            info={IGNORE_SENDERS_DOMAINS_INFO}
            disabled={disabled}
            onChange={({ senders, domains: nextDomains }) => {
              setIgnored(senders);
              setDomains(nextDomains);
            }}
          />
        </div>
        <div className="block text-sm">
          <SettingLabel
            label={CUSTOM_TRIAGE_INSTRUCTIONS_LABEL}
            htmlFor={instructionsId}
            description={CUSTOM_TRIAGE_INSTRUCTIONS_INFO}
          >
            {`Custom triage instructions (${instructions.length}/${CUSTOM_AI_INSTRUCTIONS_MAX})`}
          </SettingLabel>
          <textarea
            id={instructionsId}
            className="border-input bg-background min-h-28 w-full rounded-lg border px-3 py-2 text-sm"
            value={instructions}
            maxLength={CUSTOM_AI_INSTRUCTIONS_MAX}
            onChange={(event) => setInstructions(event.target.value)}
            disabled={disabled}
          />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={digest}
              onChange={(event) => setDigest(event.target.checked)}
              disabled={disabled}
            />
            {HISTORY_AFTER_SCAN_LABEL}
          </label>
          <SettingInfo label={HISTORY_AFTER_SCAN_LABEL} description={HISTORY_AFTER_SCAN_INFO} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" disabled={disabled} onClick={() => void save()}>
            {busy === "save" ? "Saving…" : SAVE_TRIAGE_LABEL}
          </Button>
          <SettingInfo label={SAVE_TRIAGE_LABEL} description={SAVE_TRIAGE_INFO} />
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => void updateNow()}
          >
            {busy === "update" ? "Updating…" : UPDATE_NOW_LABEL}
          </Button>
          <SettingInfo label={UPDATE_NOW_LABEL} description={UPDATE_NOW_INFO} />
        </div>
        {message ? (
          <p
            className={error ? "text-destructive text-sm" : "text-sm"}
            role={error ? "alert" : "status"}
          >
            {message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
