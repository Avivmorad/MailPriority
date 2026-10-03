"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { scanUserMessage } from "@/lib/scans/errors";
import { DEFAULT_LOOKBACK_DAYS } from "@/lib/scans/lookback";

function readScanFailure(payload: unknown): { error?: string; message?: string } {
  if (!payload || typeof payload !== "object") {
    return {};
  }
  const record = payload as { error?: unknown; message?: unknown };
  return {
    error: typeof record.error === "string" ? record.error : undefined,
    message: typeof record.message === "string" ? record.message : undefined,
  };
}

export function InboxScanNowButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startScan() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/scans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lookbackDays: DEFAULT_LOOKBACK_DAYS }),
      });
      const payload: unknown = await response.json().catch(() => null);
      const failure = readScanFailure(payload);
      if (response.ok || failure.error === "scan_in_progress") {
        router.push("/scan");
        return;
      }
      if (response.status === 401 || failure.error === "not_signed_in") {
        setError("Sign in again to scan.");
        setPending(false);
        return;
      }
      setError(
        failure.error || failure.message
          ? scanUserMessage(failure.error, failure.message)
          : "Scan failed. Please try again.",
      );
      setPending(false);
    } catch {
      setError("Scan failed. Please try again.");
      setPending(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto">
      <Button
        type="button"
        variant="navy"
        size="lg"
        className="h-14 w-full px-8 text-lg font-semibold sm:w-auto sm:min-w-48"
        aria-busy={pending}
        disabled={pending}
        onClick={() => void startScan()}
      >
        Scan Now
      </Button>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
