"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import { ScanProgressBar } from "@/components/scans/scan-progress-bar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DEFAULT_LOOKBACK_DAYS,
  INITIAL_LOOKBACK_DAYS,
  LOOKBACK_OPTION_LABELS,
  type InitialLookbackDays,
} from "@/lib/scans/lookback";
import {
  latestScanResponseSchema,
  snapshotProgress,
  startScanResponseSchema,
  type ScanRunSnapshot,
} from "@/lib/scans/progress";
import { DISPATCH_LEASE_SECONDS } from "@/lib/scans/dispatch-budget";
import { scanUserMessage } from "@/lib/scans/errors";
import { BEST_EFFORT_DAILY_NOTE } from "@/lib/settings/schedule-copy";
import { formatDateTime, formatScanWindow } from "@/lib/ui/format";
import { labelForScanStatus } from "@/lib/ui/labels";

function formatCount(value: number | null): string {
  return value === null ? "—" : String(value);
}

const POLL_MISS_LIMIT = 3;
/** Wait this long after a poll settles before the next one. One request at a time. */
const POLL_INTERVAL_MS = 800;
/** Stop observing a hung request. The background scan itself is left running. */
const POLL_DEADLINE_MS = 10_000;
/** Resume a stalled RUNNING scan after the serverless lease window plus a buffer. */
const STALE_RESUME_MS = (DISPATCH_LEASE_SECONDS + 60) * 1000;

const scanFailureSchema = z.object({
  error: z.string().optional(),
  message: z.string().optional(),
});

type LatestScanResult =
  | { kind: "scan"; scan: ScanRunSnapshot }
  | { kind: "missing" }
  | { kind: "http"; status: number }
  | { kind: "network" };

type DeadlineHandle = {
  signal: AbortSignal;
  dispose: () => void;
};

function readFailure(payload: unknown): { error?: string; message?: string } {
  const parsed = scanFailureSchema.safeParse(payload);
  return parsed.success ? parsed.data : {};
}

async function fetchLatestScan(signal: AbortSignal): Promise<LatestScanResult> {
  try {
    const response = await fetch("/api/scans?progress=1", { cache: "no-store", signal });
    if (!response.ok) {
      return { kind: "http", status: response.status };
    }
    const payload: unknown = await response.json();
    const parsed = latestScanResponseSchema.safeParse(payload);
    // A 200 with a null scan or a payload that fails the schema is not progress.
    if (!parsed.success || parsed.data.scan === null) {
      return { kind: "missing" };
    }
    return { kind: "scan", scan: parsed.data.scan };
  } catch {
    return { kind: "network" };
  }
}

/**
 * Abort after `ms`, or when `parent` aborts. Call `dispose` in `finally` so
 * timers and parent listeners are cleared even when the request succeeds.
 */
function deadlineSignal(parent: AbortSignal, ms: number): DeadlineHandle {
  const controller = new AbortController();
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onParentAbort: (() => void) | undefined;

  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (onParentAbort) {
      parent.removeEventListener("abort", onParentAbort);
      onParentAbort = undefined;
    }
  };

  const abortChild = () => {
    dispose();
    if (!controller.signal.aborted) {
      controller.abort();
    }
  };

  // Already-aborted parent: abort immediately and install nothing to clean up.
  if (parent.aborted) {
    controller.abort();
    return { signal: controller.signal, dispose: () => undefined };
  }

  timer = setTimeout(abortChild, ms);
  onParentAbort = () => {
    abortChild();
  };
  parent.addEventListener("abort", onParentAbort, { once: true });

  return { signal: controller.signal, dispose };
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function isStaleRunning(scan: ScanRunSnapshot, nowMs: number): boolean {
  if (scan.status !== "RUNNING") {
    return false;
  }
  const stamp = scan.updated_at ?? null;
  if (!stamp) {
    return false;
  }
  const parsed = Date.parse(stamp);
  if (!Number.isFinite(parsed)) {
    return false;
  }
  return nowMs - parsed >= STALE_RESUME_MS;
}

export function InitialScanCard({
  connected,
  incremental,
  latestScan,
  lastRunAt,
  nextScanAt,
  lastRunStatus,
  messagesProcessed,
  completeHref = "/dashboard?scan=done",
  breakdown = null,
  returnTo = "/dashboard",
}: {
  connected: boolean;
  incremental: boolean;
  latestScan?: ScanRunSnapshot | null;
  lastRunAt?: string | null;
  nextScanAt?: string | null;
  lastRunStatus?: string | null;
  messagesProcessed?: number | null;
  completeHref?: string;
  breakdown?: {
    actions: number | null;
    pending: number | null;
    forYou: number | null;
    ignored: number | null;
    important: number | null;
  } | null;
  returnTo?: string;
}) {
  const router = useRouter();
  const resumeId = latestScan?.status === "RUNNING" ? latestScan.id : null;
  const [lookbackDays, setLookbackDays] = useState<InitialLookbackDays>(DEFAULT_LOOKBACK_DAYS);
  const [watchId, setWatchId] = useState<string | null>(resumeId);
  const [busy, setBusy] = useState(Boolean(resumeId));
  const [progress, setProgress] = useState<ScanRunSnapshot | null>(
    resumeId && latestScan ? latestScan : null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const progressRef = useRef(progress);
  const watchIdRef = useRef(watchId);
  const lookbackRef = useRef(lookbackDays);
  const routerRef = useRef(router);
  const generationRef = useRef(0);
  /** Controllers for start/cancel while polling may not be mounted yet. */
  const actionControllersRef = useRef(new Set<AbortController>());
  /** One cancel at a time so a late failure cannot overwrite a confirmed cancel. */
  const cancelInFlightRef = useRef(false);
  /** One automatic resume per scan id. A failed resume must not start another by itself. */
  const resumedScanIds = useRef(new Set<string>());
  /** A confirmed cancel must not be revived by a stale RUNNING prop in this session. */
  const suppressedScanIds = useRef(new Set<string>());

  function adoptRunningScan(scan: ScanRunSnapshot) {
    if (scan.status !== "RUNNING" || suppressedScanIds.current.has(scan.id)) {
      return;
    }
    const watching = watchIdRef.current;
    if (watching && watching !== "pending" && watching !== scan.id) {
      return;
    }
    if (progressRef.current?.id === "pending") {
      return;
    }
    if (watching !== scan.id) {
      setMessage(null);
      setError(false);
      setErrorCode(null);
    }
    setWatchId(scan.id);
    setBusy(true);
    setProgress((current) => {
      if (current?.id === "pending") {
        return current;
      }
      if (
        current?.id === scan.id &&
        current.status === scan.status &&
        (current.threads_checked ?? 0) === (scan.threads_checked ?? 0) &&
        (current.threads_discovered ?? 0) === (scan.threads_discovered ?? 0)
      ) {
        return current;
      }
      // A live poll can be ahead of the server snapshot this page mounted with.
      if (current?.id === scan.id && (current.threads_checked ?? 0) > (scan.threads_checked ?? 0)) {
        return current;
      }
      return scan;
    });
  }

  const adoptRunningScanRef = useRef(adoptRunningScan);

  useEffect(() => {
    watchIdRef.current = watchId;
    adoptRunningScanRef.current = adoptRunningScan;
  });

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    lookbackRef.current = lookbackDays;
  }, [lookbackDays]);

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  // A scan started on Settings can be missing from this page's first payload.
  // Read the shared progress endpoint once so the tab joins that run.
  useEffect(() => {
    const generation = generationRef.current;
    if (watchIdRef.current) {
      return;
    }
    const stop = new AbortController();
    let active = true;
    void (async () => {
      const result = await fetchLatestScan(stop.signal);
      if (!active || generation !== generationRef.current || watchIdRef.current) {
        return;
      }
      if (result.kind === "scan") {
        adoptRunningScanRef.current(result.scan);
      }
    })();
    return () => {
      active = false;
      stop.abort();
    };
  }, []);

  // Server props can arrive after mount (client cache, then a fresh payload)
  // without resetting useState. Follow that same RUNNING scan.
  useEffect(() => {
    if (latestScan) {
      adoptRunningScanRef.current(latestScan);
    }
  }, [latestScan]);

  // Abort start/cancel requests on unmount even when watchId is still null.
  useEffect(() => {
    const controllers = actionControllersRef.current;
    return () => {
      generationRef.current += 1;
      for (const controller of controllers) {
        controller.abort();
      }
      controllers.clear();
    };
  }, []);

  useEffect(() => {
    if (!busy || !watchId) {
      return;
    }
    const generation = ++generationRef.current;
    const stop = new AbortController();
    let active = true;
    let misses = 0;
    let resumeInFlight = false;

    function stillCurrent(): boolean {
      return active && generation === generationRef.current;
    }

    function stopWatching(nextMessage: string, code: string, isError: boolean) {
      if (!stillCurrent()) {
        return;
      }
      active = false;
      stop.abort();
      setError(isError);
      setErrorCode(code);
      setMessage(nextMessage);
      setBusy(false);
      setProgress(null);
      setWatchId(null);
    }

    async function resumeStalled(scanId: string) {
      if (resumeInFlight || resumedScanIds.current.has(scanId)) {
        return;
      }
      resumeInFlight = true;
      resumedScanIds.current.add(scanId);
      setMessage("No recent progress; trying to resume this scan…");
      setError(false);
      setErrorCode(null);
      const deadline = deadlineSignal(stop.signal, POLL_DEADLINE_MS);
      try {
        const response = await fetch("/api/scans", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lookbackDays: lookbackRef.current }),
          signal: deadline.signal,
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!stillCurrent()) {
          return;
        }
        if (response.status === 401) {
          stopWatching("Sign in again to follow scan progress.", "not_signed_in", true);
          return;
        }
        if (!response.ok) {
          const failed = readFailure(payload);
          if (failed.error === "scan_in_progress") {
            setMessage("Scan is still running. Waiting for the next progress update…");
            return;
          }
          stopWatching(
            scanUserMessage(failed.error, failed.message),
            failed.error ?? "scan_failed",
            true,
          );
          return;
        }
        const started = startScanResponseSchema.safeParse(payload);
        if (!started.success) {
          stopWatching("Could not load scan progress. Please try again.", "scan_failed", true);
          return;
        }
        const prev = progressRef.current;
        misses = 0;
        setWatchId(started.data.scanId);
        setProgress({
          id: started.data.scanId,
          status: "RUNNING",
          threads_discovered: prev?.threads_discovered ?? 0,
          threads_checked: prev?.threads_checked ?? 0,
          updated_at: new Date().toISOString(),
        });
      } catch {
        if (!stillCurrent()) {
          return;
        }
        // Timeout or network: we could not observe the resume. The scan is not cancelled.
        stopWatching("Could not load scan progress. Please try again.", "scan_failed", true);
      } finally {
        deadline.dispose();
        resumeInFlight = false;
      }
    }

    function noteMiss() {
      misses += 1;
      if (misses >= POLL_MISS_LIMIT) {
        stopWatching("Could not load scan progress. Please try again.", "scan_failed", true);
      }
    }

    function apply(result: LatestScanResult) {
      if (!stillCurrent()) {
        return;
      }
      if (result.kind === "http" && result.status === 401) {
        stopWatching("Sign in again to follow scan progress.", "not_signed_in", true);
        return;
      }
      if (result.kind !== "scan") {
        noteMiss();
        return;
      }
      const scan = result.scan;
      const watched = scan.id === watchId || watchId === "pending";
      if (!watched) {
        // An older scan must not clear the miss count or finish the scan we started.
        return;
      }
      misses = 0;
      if (scan.status === "RUNNING") {
        setWatchId(scan.id);
        setProgress((current) => {
          if (
            current?.id === scan.id &&
            (current.threads_checked ?? 0) > (scan.threads_checked ?? 0)
          ) {
            return current;
          }
          return scan;
        });
        if (isStaleRunning(scan, Date.now())) {
          void resumeStalled(scan.id);
        }
        return;
      }
      active = false;
      stop.abort();
      setBusy(false);
      setProgress(null);
      setWatchId(null);
      if (scan.status === "FAILED") {
        const cancelledScan = scan.error_code === "cancelled";
        setError(!cancelledScan);
        setErrorCode(scan.error_code ?? "scan_failed");
        setMessage(scanUserMessage(scan.error_code, scan.error_message));
        return;
      }
      routerRef.current.push(completeHref);
      routerRef.current.refresh();
    }

    async function loop() {
      while (stillCurrent()) {
        const deadline = deadlineSignal(stop.signal, POLL_DEADLINE_MS);
        let result: LatestScanResult;
        try {
          result = await fetchLatestScan(deadline.signal);
        } finally {
          deadline.dispose();
        }
        if (!stillCurrent()) {
          return;
        }
        apply(result);
        if (!stillCurrent()) {
          return;
        }
        await wait(POLL_INTERVAL_MS, stop.signal);
      }
    }

    void loop();
    return () => {
      active = false;
      generationRef.current += 1;
      stop.abort();
    };
  }, [busy, watchId, completeHref]);

  async function requestJson(
    url: string,
    init: RequestInit,
    generation: number,
  ): Promise<
    | { ok: true; payload: unknown }
    | { ok: false; stale: true }
    | { ok: false; stale: false; status: number; failure: { error?: string; message?: string } }
  > {
    const stop = new AbortController();
    actionControllersRef.current.add(stop);
    const deadline = deadlineSignal(stop.signal, POLL_DEADLINE_MS);
    try {
      const response = await fetch(url, { ...init, signal: deadline.signal });
      const payload: unknown = await response.json().catch(() => null);
      if (generation !== generationRef.current) {
        return { ok: false, stale: true };
      }
      if (!response.ok) {
        return { ok: false, stale: false, status: response.status, failure: readFailure(payload) };
      }
      return { ok: true, payload };
    } catch {
      if (generation !== generationRef.current) {
        return { ok: false, stale: true };
      }
      return { ok: false, stale: false, status: 0, failure: {} };
    } finally {
      deadline.dispose();
      stop.abort();
      actionControllersRef.current.delete(stop);
    }
  }

  async function cancelScan() {
    if (!watchId || watchId === "pending" || cancelInFlightRef.current) {
      return;
    }
    const target = watchId;
    cancelInFlightRef.current = true;
    // Drop in-flight poll results so a late snapshot cannot finish this scan after cancel.
    const generation = ++generationRef.current;
    try {
      const result = await requestJson(
        `/api/scans/${target}/cancel`,
        { method: "POST" },
        generation,
      );
      if (!result.ok) {
        if (result.stale) {
          return;
        }
        // Cancellation unconfirmed: leave a retryable idle state (not stuck busy with no polling).
        setBusy(false);
        setProgress(null);
        setWatchId(null);
        setError(true);
        if (result.status === 0) {
          setErrorCode("scan_failed");
          setMessage("Could not cancel the scan. Please try again.");
          return;
        }
        setErrorCode(result.failure.error ?? "scan_failed");
        setMessage(scanUserMessage(result.failure.error, result.failure.message));
        return;
      }
      suppressedScanIds.current.add(target);
      setBusy(false);
      setProgress(null);
      setWatchId(null);
      setError(false);
      setErrorCode("cancelled");
      setMessage(scanUserMessage("cancelled"));
    } finally {
      cancelInFlightRef.current = false;
    }
  }

  async function runScan() {
    const generation = ++generationRef.current;
    setBusy(true);
    setMessage(null);
    setError(false);
    setErrorCode(null);
    setProgress({
      id: "pending",
      status: "RUNNING",
      threads_discovered: 0,
      threads_checked: 0,
      updated_at: new Date().toISOString(),
    });
    // watchId stays null until start succeeds so polling does not begin on "pending".
    const result = await requestJson(
      "/api/scans",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lookbackDays }),
      },
      generation,
    );
    if (!result.ok) {
      if (result.stale) {
        return;
      }
      setError(true);
      setErrorCode(result.failure.error ?? "scan_failed");
      setMessage(
        result.status === 0 && !result.failure.error
          ? "Scan failed. Please try again."
          : scanUserMessage(result.failure.error, result.failure.message),
      );
      setBusy(false);
      setProgress(null);
      return;
    }
    const started = startScanResponseSchema.safeParse(result.payload);
    if (!started.success) {
      setError(true);
      setErrorCode("scan_failed");
      setMessage("Scan failed.");
      setBusy(false);
      setProgress(null);
      return;
    }
    setWatchId(started.data.scanId);
    setProgress({
      id: started.data.scanId,
      status: "RUNNING",
      threads_discovered: 0,
      threads_checked: 0,
      updated_at: new Date().toISOString(),
    });
  }

  const bar = progress
    ? snapshotProgress(progress)
    : {
        threadsDiscovered: latestScan?.threads_discovered ?? 0,
        threadsChecked: latestScan?.threads_checked ?? 0,
        status: lastRunStatus ?? latestScan?.status ?? null,
        errorCode: latestScan?.error_code ?? null,
      };
  const statusLabel = lastRunStatus ? labelForScanStatus(lastRunStatus) : null;
  const updatedAt = progress?.updated_at ?? lastRunAt ?? null;
  const factItems = [
    { label: "Scanning", value: formatScanWindow(lookbackDays) },
    {
      label: "Conversations",
      value: `${bar.threadsChecked} of ${bar.threadsDiscovered}`,
    },
    {
      label: "Emails scanned",
      value: typeof messagesProcessed === "number" ? String(messagesProcessed) : "—",
    },
    { label: "Actions", value: breakdown ? formatCount(breakdown.actions) : null },
    { label: "Pending", value: breakdown ? formatCount(breakdown.pending) : null },
    { label: "For You", value: breakdown ? formatCount(breakdown.forYou) : null },
    { label: "Ignored", value: breakdown ? formatCount(breakdown.ignored) : null },
    { label: "Important", value: breakdown ? formatCount(breakdown.important) : null },
    { label: "Updated", value: formatDateTime(updatedAt) },
  ].filter((item): item is { label: string; value: string } => item.value !== null);

  return (
    <Card id="scan">
      <CardHeader>
        <CardTitle>{incremental ? "Scan inbox" : "Initial scan"}</CardTitle>
        <CardDescription>
          {busy
            ? "Checking conversations in the background. You can keep using MailPriority."
            : "Choose how far back to read. Unchanged threads are skipped."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex min-w-0 flex-col gap-6">
          <ScanProgressBar
            threadsChecked={bar.threadsChecked}
            threadsDiscovered={bar.threadsDiscovered}
            status={bar.status}
            errorCode={bar.errorCode}
          />
          <dl
            data-testid="scan-progress-stats"
            className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-x-5 gap-y-3"
          >
            {factItems.map((item) => (
              <div key={item.label} className="min-w-0">
                <dt className="text-muted-foreground text-xs leading-snug whitespace-nowrap">
                  {item.label}
                </dt>
                <dd className="mt-0.5 text-sm font-medium break-normal tabular-nums">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-40 flex-1 text-sm">
            <span className="text-muted-foreground mb-1.5 block" id="scan-lookback-label">
              Lookback window
            </span>
            <select
              className="border-input bg-background h-9 w-full max-w-xs rounded-lg border px-3 text-sm"
              aria-labelledby="scan-lookback-label"
              value={lookbackDays}
              disabled={!connected || busy}
              onChange={(event) =>
                setLookbackDays(Number(event.target.value) as InitialLookbackDays)
              }
            >
              {INITIAL_LOOKBACK_DAYS.map((value) => (
                <option key={value} value={value}>
                  {LOOKBACK_OPTION_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            size="lg"
            className="h-11 px-5"
            disabled={!connected || busy}
            aria-busy={busy}
            onClick={() => void runScan()}
          >
            {busy ? "Scanning…" : incremental ? "Scan new mail" : "Scan now"}
          </Button>
          {busy ? (
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={!watchId || watchId === "pending"}
              onClick={() => void cancelScan()}
            >
              Cancel scan
            </Button>
          ) : null}
        </div>
        {message ? (
          <p
            className={error ? "text-destructive text-sm" : "text-sm"}
            role={error ? "alert" : "status"}
          >
            {message}
            {error && errorCode === "reauth_required" ? (
              <>
                {" "}
                <a className="underline" href={`/api/gmail/connect?returnTo=${returnTo}`}>
                  Reconnect Gmail
                </a>
              </>
            ) : null}
          </p>
        ) : null}
        {!connected ? (
          <p className="text-muted-foreground text-sm">Connect Gmail before running a scan.</p>
        ) : null}
      </CardContent>
      {lastRunAt || nextScanAt || busy ? (
        <CardFooter className="text-muted-foreground flex-wrap gap-x-4 gap-y-1 text-sm">
          {lastRunAt ? (
            <span>
              Last run {formatDateTime(lastRunAt)}
              {statusLabel ? ` · ${statusLabel}` : ""}
              {typeof messagesProcessed === "number" ? ` · ${messagesProcessed} emails` : ""}
              {lastRunStatus === "PARTIAL" ? " · Some conversations need another scan" : ""}
            </span>
          ) : busy ? (
            <span>In progress</span>
          ) : (
            <span>No scan yet</span>
          )}
          {nextScanAt ? <span>{BEST_EFFORT_DAILY_NOTE}</span> : null}
        </CardFooter>
      ) : null}
    </Card>
  );
}
