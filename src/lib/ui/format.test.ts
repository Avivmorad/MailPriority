import { describe, expect, it } from "vitest";

import {
  addCalendarDaysIso,
  classForDeadline,
  deadlineProximity,
  displayUrgencyForDeadline,
  formatDate,
  formatDateTime,
  formatScanWindow,
  formatRelativeTime,
  isDeadlineOverdue,
} from "@/lib/ui/format";

describe("formatDateTime", () => {
  it("formats UTC timestamps in Asia/Jerusalem", () => {
    expect(formatDateTime("2026-09-10T11:10:00.000Z")).toContain("14:10");
    expect(formatDateTime("2026-09-10T11:10:00.000Z")).toContain("Sep");
    expect(formatDateTime("2026-09-10T11:10:00.000Z")).not.toContain("Sept");
  });
});

describe("formatDate", () => {
  it("formats ISO calendar dates without the raw year-month-day string", () => {
    expect(formatDate("2026-09-12")).toBe("12 Sep");
    expect(formatDate("2026-09-12")).not.toContain("Sept");
  });

  it("returns an em dash when missing", () => {
    expect(formatDate(null)).toBe("—");
  });
});

describe("formatScanWindow", () => {
  it("writes the lookback as uppercase day and month", () => {
    const now = new Date("2026-11-03T12:00:00.000Z");
    expect(formatScanWindow(30, now)).toBe("4 OCT - 3 NOV");
    expect(formatScanWindow(7, now)).toBe("27 OCT - 3 NOV");
  });
});

describe("isDeadlineOverdue", () => {
  const jerusalemAfternoon = new Date("2026-09-10T12:00:00.000Z");

  it("does not treat today's deadline as overdue", () => {
    expect(isDeadlineOverdue("2026-09-10", jerusalemAfternoon)).toBe(false);
  });

  it("treats yesterday's deadline as overdue", () => {
    expect(isDeadlineOverdue("2026-09-09", jerusalemAfternoon)).toBe(true);
  });

  it("does not treat a missing deadline as overdue", () => {
    expect(isDeadlineOverdue(null, jerusalemAfternoon)).toBe(false);
  });

  it("uses Asia/Jerusalem calendar date, not UTC", () => {
    // 21:30 UTC on 10 Sep is already 00:30 on 11 Sep in Asia/Jerusalem (UTC+3).
    const lateUtc = new Date("2026-09-10T21:30:00.000Z");
    expect(isDeadlineOverdue("2026-09-10", lateUtc)).toBe(true);
    expect(isDeadlineOverdue("2026-09-11", lateUtc)).toBe(false);
    expect(addCalendarDaysIso(1, lateUtc)).toBe("2026-09-12");
  });
});

describe("deadlineProximity", () => {
  const jerusalemAfternoon = new Date("2026-09-10T12:00:00.000Z");

  it("marks a past date expired, this week soon, and after a week later", () => {
    expect(deadlineProximity("2026-09-09", jerusalemAfternoon)).toBe("expired");
    expect(deadlineProximity("2026-09-10", jerusalemAfternoon)).toBe("soon");
    expect(deadlineProximity("2026-09-17", jerusalemAfternoon)).toBe("soon");
    expect(deadlineProximity("2026-09-18", jerusalemAfternoon)).toBe("later");
  });

  it("overrides a stored soon tag when the deadline has already passed", () => {
    expect(displayUrgencyForDeadline("2026-09-09", "soon", jerusalemAfternoon)).toBe("expired");
    expect(displayUrgencyForDeadline("2026-09-20", "soon", jerusalemAfternoon)).toBe("later");
    expect(displayUrgencyForDeadline(null, "urgent", jerusalemAfternoon)).toBe("urgent");
  });

  it("colors expired high, soon medium, and later low", () => {
    expect(classForDeadline("2026-09-09", jerusalemAfternoon)).toContain("text-urgency-high");
    expect(classForDeadline("2026-09-12", jerusalemAfternoon)).toContain("text-urgency-medium");
    expect(classForDeadline("2026-09-20", jerusalemAfternoon)).toContain("text-urgency-low");
  });
});

describe("formatRelativeTime", () => {
  it("uses short relative copy for recent activity", () => {
    const now = new Date("2026-09-10T14:00:00.000Z");
    expect(formatRelativeTime("2026-09-10T13:10:00.000Z", now)).toBe("50m ago");
  });
});
