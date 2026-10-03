/**
 * Deterministic timing model for large mail scans.
 *
 * A ~700-thread first lookback is dominated by sequential (fetch → AI → persist)
 * work inside each worker, overlapped up to `AI_MAX_CONCURRENCY`, then one
 * parallel label phase and a checkpoint. With more than one worker, the next
 * wave's Gmail fetch starts during AI. The eval clock still advances the
 * lockstep estimate below so a faster overlap does not change the assertion.
 * Stored-thread reuse checks are one `getThreadsByGmailIds` read per wave.
 * Per-thread `getScanStatus` was not removed from the post-persist guard; the
 * admission check is once per wave. Further coalescing of those reads is a
 * follow-up that must keep the completed-batch checkpoint.
 *
 * Critical path (same per-thread stage costs, concurrency C):
 *   ceil(threadCount / C) * (fetch + ai + persist + label + checkpoint)
 */

export interface ScanStageCostsMs {
  fetchMs: number;
  aiMs: number;
  persistMs: number;
  labelMs: number;
  checkpointMs: number;
}

export interface ScanTimingEstimate {
  threadCount: number;
  concurrency: number;
  waveCount: number;
  perThreadCriticalPathMs: number;
  expectedCriticalPathMs: number;
  sequentialAiOnlyMs: number;
}

export const DEFAULT_TIMING_STAGE_COSTS: ScanStageCostsMs = {
  fetchMs: 10,
  aiMs: 100,
  persistMs: 5,
  labelMs: 5,
  checkpointMs: 0,
};

export function waveCountForThreads(threadCount: number, concurrency: number): number {
  const c = Math.max(1, concurrency);
  const n = Math.max(0, threadCount);
  return n === 0 ? 0 : Math.ceil(n / c);
}

export function perThreadCriticalPathMs(costs: ScanStageCostsMs): number {
  return costs.fetchMs + costs.aiMs + costs.persistMs + costs.labelMs;
}

/** Expected wall time when workers overlap up to concurrency and waves wait on checkpoint. */
export function expectedCriticalPathMs(
  threadCount: number,
  concurrency: number,
  costs: ScanStageCostsMs,
): number {
  const waves = waveCountForThreads(threadCount, concurrency);
  return waves * (perThreadCriticalPathMs(costs) + costs.checkpointMs);
}

export function estimateScanTiming(
  threadCount: number,
  concurrency: number,
  costs: ScanStageCostsMs = DEFAULT_TIMING_STAGE_COSTS,
): ScanTimingEstimate {
  const waveCount = waveCountForThreads(threadCount, concurrency);
  const perThread = perThreadCriticalPathMs(costs);
  return {
    threadCount,
    concurrency: Math.max(1, concurrency),
    waveCount,
    perThreadCriticalPathMs: perThread,
    expectedCriticalPathMs: expectedCriticalPathMs(threadCount, concurrency, costs),
    sequentialAiOnlyMs: threadCount * costs.aiMs,
  };
}

export function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export interface StageTimingAccumulator {
  fetchMs: number;
  aiMs: number;
  persistMs: number;
  labelMs: number;
  checkpointMs: number;
  fetchCalls: number;
  aiCalls: number;
  persistCalls: number;
  labelCalls: number;
  checkpointCalls: number;
}

export function emptyStageTimings(): StageTimingAccumulator {
  return {
    fetchMs: 0,
    aiMs: 0,
    persistMs: 0,
    labelMs: 0,
    checkpointMs: 0,
    fetchCalls: 0,
    aiCalls: 0,
    persistCalls: 0,
    labelCalls: 0,
    checkpointCalls: 0,
  };
}
