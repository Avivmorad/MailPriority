/** Vercel Hobby serverless maxDuration is 1–300 seconds. */
export const DISPATCH_MAX_DURATION_SECONDS = 300;
/** Stop claiming work before the function is killed. */
export const DISPATCH_BUDGET_MS = 270_000;
export const DISPATCH_LEASE_SECONDS = Math.floor(DISPATCH_BUDGET_MS / 1000);
/** One connection per invocation so a scan can finish inside the Hobby cap. */
export const DISPATCH_DEFAULT_LIMIT = 1;
/**
 * Slices chained from the single daily Hobby cron. Each slice claims one
 * connection. Past this bound the cycle stops and raises a backlog alert.
 */
export const DISPATCH_CYCLE_MAX_SLICES = 100;
/** Tries to start the next slice before raising a backlog alert. */
export const DISPATCH_CHAIN_ATTEMPTS = 3;
/** Leave headroom inside maxDuration (300s) for persist + HTTP continue. */
export const SCAN_WORK_BUDGET_MS = 270_000;
/** No progress for this long → treat the RUNNING row as dead. */
export const SCAN_STALE_PROGRESS_MS = 20 * 60 * 1000;
/** Dispatcher must not resume a slice that is still working. */
export const SCAN_HEARTBEAT_BUSY_MS = SCAN_WORK_BUDGET_MS + 30_000;
/** Fallback continue if the self-fetch never starts the next slice. */
export const SCAN_CONTINUE_RETRY_MS = 5 * 60_000;

export function hasDispatchBudget(
  startedAtMs: number,
  nowMs = Date.now(),
  budgetMs = DISPATCH_BUDGET_MS,
): boolean {
  return nowMs - startedAtMs < budgetMs;
}
