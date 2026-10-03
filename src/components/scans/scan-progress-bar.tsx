"use client";

import { scanProgressView } from "@/lib/scans/progress";

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ScanProgressBar({
  threadsChecked,
  threadsDiscovered,
  status,
  errorCode,
}: {
  threadsChecked: number;
  threadsDiscovered: number;
  status?: string | null;
  errorCode?: string | null;
}) {
  const view = scanProgressView({ threadsChecked, threadsDiscovered, status, errorCode });
  const shownPercent = view.indeterminate ? 0 : view.percent;
  const offset = CIRCUMFERENCE * (1 - shownPercent / 100);

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div
        className="relative size-40 shrink-0"
        role="progressbar"
        aria-label="Scan progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={view.indeterminate ? undefined : view.percent}
        aria-valuetext={view.label}
      >
        <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
          <circle cx="60" cy="60" r={RADIUS} className="stroke-muted" strokeWidth="8" fill="none" />
          <circle
            cx="60"
            cy="60"
            r={RADIUS}
            className="stroke-primary transition-[stroke-dashoffset] duration-300 motion-reduce:transition-none"
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
          />
        </svg>
        {view.indeterminate ? (
          <span className="bg-primary/15 absolute inset-3 animate-pulse rounded-full motion-reduce:animate-none" />
        ) : null}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-3xl font-semibold tracking-tight tabular-nums">
            {shownPercent}%
          </span>
        </div>
      </div>
      <p aria-live="polite" aria-atomic="true" className="max-w-sm text-sm leading-relaxed">
        {view.label}
      </p>
    </div>
  );
}
