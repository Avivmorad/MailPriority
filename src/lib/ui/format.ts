const DISPLAY_TZ = "Asia/Jerusalem";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((item) => item.type === type)?.value ?? "";
}

function calendarDateInTimeZone(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Add whole calendar days in the display timezone (not 24h UTC slices). */
export function addCalendarDaysIso(
  days: number,
  now: Date = new Date(),
  timeZone: string = DISPLAY_TZ,
): string {
  const today = calendarDateInTimeZone(now, timeZone);
  const start = Date.parse(`${today}T12:00:00.000Z`);
  return new Date(start + days * 86_400_000).toISOString().slice(0, 10);
}

function parseInstant(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date : null;
}

/** ICU en-GB can emit "Sept"; keep a stable 3-letter month for UI and tests. */
function normalizeShortMonth(formatted: string): string {
  return formatted.replace(/\bSept\b/g, "Sep");
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) {
    return "—";
  }
  const date = parseInstant(iso);
  if (!date) {
    return "—";
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TZ,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const day = part(parts, "day");
  const month = normalizeShortMonth(part(parts, "month"));
  const hour = part(parts, "hour");
  const minute = part(parts, "minute");
  return `${day} ${month}, ${hour}:${minute}`;
}

export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) {
    return "—";
  }
  const dateOnly = ISO_DATE.test(isoDate);
  const date = dateOnly ? new Date(`${isoDate}T12:00:00.000Z`) : parseInstant(isoDate);
  if (!date) {
    return "—";
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: dateOnly ? "UTC" : DISPLAY_TZ,
    day: "numeric",
    month: "short",
  }).formatToParts(date);
  return `${part(parts, "day")} ${normalizeShortMonth(part(parts, "month"))}`;
}

export function formatRelativeTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) {
    return "—";
  }
  const date = parseInstant(iso);
  if (!date) {
    return "—";
  }
  const diffMs = now.getTime() - date.getTime();
  const minutes = Math.round(Math.abs(diffMs) / 60_000);
  if (minutes < 1) {
    return "Just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  if (days < 7) {
    return `${days}d ago`;
  }
  return formatDateTime(iso);
}

export type DeadlineProximity = "expired" | "soon" | "later";

export function daysUntilCalendarDate(
  isoDate: string,
  now: Date,
  timeZone: string = DISPLAY_TZ,
): number | null {
  if (!ISO_DATE.test(isoDate)) {
    return null;
  }
  const today = calendarDateInTimeZone(now, timeZone);
  const start = Date.parse(`${today}T12:00:00.000Z`);
  const end = Date.parse(`${isoDate}T12:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }
  return Math.round((end - start) / 86_400_000);
}

/** True when a YYYY-MM-DD deadline is before today in Asia/Jerusalem (date-only). */
export function isDeadlineOverdue(
  isoDate: string | null | undefined,
  now: Date = new Date(),
  timeZone: string = DISPLAY_TZ,
): boolean {
  return deadlineProximity(isoDate, now, timeZone) === "expired";
}

/**
 * Calendar proximity for a date-only deadline.
 * Today through 7 days = soon; after that = later; before today = expired.
 */
export function deadlineProximity(
  isoDate: string | null | undefined,
  now: Date = new Date(),
  timeZone: string = DISPLAY_TZ,
): DeadlineProximity | null {
  if (!isoDate) {
    return null;
  }
  const days = daysUntilCalendarDate(isoDate, now, timeZone);
  if (days == null) {
    return null;
  }
  if (days < 0) {
    return "expired";
  }
  if (days <= 7) {
    return "soon";
  }
  return "later";
}

export function classForDeadline(
  isoDate: string | null | undefined,
  now: Date = new Date(),
): string {
  switch (deadlineProximity(isoDate, now)) {
    case "expired":
      return "font-semibold text-urgency-high";
    case "soon":
      return "font-semibold text-urgency-medium";
    case "later":
      return "font-semibold text-urgency-low";
    default:
      return "";
  }
}

/** Prefer deadline proximity over stored AI urgency when a date exists. */
export function displayUrgencyForDeadline(
  deadline: string | null | undefined,
  storedUrgency: string | null | undefined,
  now: Date = new Date(),
): string | null {
  const proximity = deadlineProximity(deadline, now);
  if (proximity) {
    return proximity;
  }
  return storedUrgency?.trim().toLowerCase() || "unknown";
}
