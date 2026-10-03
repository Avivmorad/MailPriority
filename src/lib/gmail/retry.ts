import { getContextLimits } from "@/lib/config/env";
import { getSharedGmailQuota } from "@/lib/gmail/quota";
import {
  assertGmailBudget,
  waitForGmailBudget,
  withGmailRequest,
  type GmailRequestBudget,
} from "@/lib/gmail/request-budget";

export const GMAIL_QUOTA_USER_MESSAGE =
  "Gmail still blocked the scan after waiting for the per-minute quota. Wait a minute and try a shorter lookback.";

const DEFAULT_DELAYS_MS = [60_000, 60_000, 60_000];

/**
 * Interactive Connect Gmail must not wait out scan-style 60s quota backoff.
 * Empty means a single attempt (no sleep) so a 429 fails fast in the browser.
 */
export const GMAIL_CONNECT_RETRY_DELAYS_MS: number[] = [];

export function isGmailAuthError(error: unknown): boolean {
  const status = httpStatus(error);
  if (status === 401) {
    return true;
  }
  const message = errorMessage(error);
  return /invalid_grant|invalid credentials|token (has been )?revoked|unauthorized/i.test(message);
}

export function isGmailQuotaError(error: unknown): boolean {
  const status = httpStatus(error);
  if (status === 429) {
    return true;
  }
  const message = errorMessage(error);
  return /quota exceeded|userratelimitexceeded|ratelimitexceeded|units per minute|too many requests/i.test(
    message,
  );
}

function httpStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const record = error as { status?: unknown; code?: unknown; response?: { status?: unknown } };
  if (typeof record.response?.status === "number") {
    return record.response.status;
  }
  if (typeof record.status === "number") {
    return record.status;
  }
  if (typeof record.code === "number") {
    return record.code;
  }
  return null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (
    typeof error === "object" &&
    error &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return String(error);
}

export async function withGmailRetry<T>(
  operation: Parameters<typeof withGmailRequest<T>>[0],
  options: GmailRequestBudget & {
    units?: number;
    delaysMs?: number[];
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<T> {
  const delays = options.delaysMs ?? DEFAULT_DELAYS_MS;
  const units = options.units ?? 5;
  const quota = getSharedGmailQuota(getContextLimits().GMAIL_QUOTA_UNITS_PER_MINUTE);
  let lastError: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    assertGmailBudget(options);
    try {
      await quota.acquire(units, options);
      return await withGmailRequest(operation, options);
    } catch (error) {
      lastError = error;
      const retryable =
        isGmailQuotaError(error) || [502, 503, 504].includes(httpStatus(error) ?? 0);
      if (isGmailAuthError(error) || !retryable || attempt >= delays.length) {
        throw error;
      }
      if (isGmailQuotaError(error)) quota.reset();
      const wait = delays[attempt] ?? 60_000;
      await waitForGmailBudget(wait, options, options.sleep);
    }
  }
  throw lastError;
}
