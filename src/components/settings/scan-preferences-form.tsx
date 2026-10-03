"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { SettingInfo, SettingLabel } from "@/components/settings/setting-info";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DAILY_SCAN_CARD_DESCRIPTION,
  DAILY_SCAN_SAVED_MESSAGE,
} from "@/lib/settings/schedule-copy";
import {
  SAVE_SCHEDULE_INFO,
  SAVE_SCHEDULE_LABEL,
  SCAN_TIME_INFO,
  SCAN_TIME_LABEL,
  SCAN_TIMEZONE_INFO,
  SCAN_TIMEZONE_LABEL,
} from "@/lib/settings/setting-info-copy";

export function ScanPreferencesForm({
  dailyScanTime,
  timezone,
}: {
  dailyScanTime: string;
  timezone: string;
}) {
  const router = useRouter();
  const timeId = useId();
  const zoneId = useId();
  const [time, setTime] = useState(dailyScanTime);
  const [zone, setZone] = useState(timezone);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  async function save() {
    setBusy(true);
    setMessage(null);
    setError(false);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dailyScanTime: time, timezone: zone }),
      });
      if (!response.ok) {
        setError(true);
        setMessage("Could not save scan schedule.");
        return;
      }
      setMessage(DAILY_SCAN_SAVED_MESSAGE);
      router.refresh();
    } catch {
      setError(true);
      setMessage("Could not save scan schedule.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily scan</CardTitle>
        <CardDescription>{DAILY_SCAN_CARD_DESCRIPTION}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="block text-sm">
          <SettingLabel label={SCAN_TIME_LABEL} htmlFor={timeId} description={SCAN_TIME_INFO} />
          <input
            id={timeId}
            type="time"
            className="border-input bg-background h-9 w-full max-w-xs rounded-lg border px-3 text-sm"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            disabled={busy}
          />
        </div>
        <div className="block text-sm">
          <SettingLabel
            label={SCAN_TIMEZONE_LABEL}
            htmlFor={zoneId}
            description={SCAN_TIMEZONE_INFO}
          />
          <input
            id={zoneId}
            type="text"
            className="border-input bg-background h-9 w-full max-w-xs rounded-lg border px-3 text-sm"
            value={zone}
            onChange={(event) => setZone(event.target.value)}
            disabled={busy}
            autoComplete="off"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : SAVE_SCHEDULE_LABEL}
          </Button>
          <SettingInfo label={SAVE_SCHEDULE_LABEL} description={SAVE_SCHEDULE_INFO} />
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
