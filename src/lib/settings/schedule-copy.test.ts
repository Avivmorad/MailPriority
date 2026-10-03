import { describe, expect, it } from "vitest";

import {
  BEST_EFFORT_DAILY_NOTE,
  DAILY_SCAN_CARD_DESCRIPTION,
  DAILY_SCAN_SAVED_MESSAGE,
  ONBOARDING_CONFIGURE_DESCRIPTION,
  SETTINGS_PAGE_DESCRIPTION,
  TRIAGE_CARD_DESCRIPTION,
  TRIAGE_SETTINGS_SAVED_MESSAGE,
  TRIAGE_UPDATE_STARTED_MESSAGE,
} from "@/lib/settings/schedule-copy";

const COPY = [
  DAILY_SCAN_CARD_DESCRIPTION,
  DAILY_SCAN_SAVED_MESSAGE,
  SETTINGS_PAGE_DESCRIPTION,
  ONBOARDING_CONFIGURE_DESCRIPTION,
  BEST_EFFORT_DAILY_NOTE,
  TRIAGE_CARD_DESCRIPTION,
  TRIAGE_SETTINGS_SAVED_MESSAGE,
  TRIAGE_UPDATE_STARTED_MESSAGE,
];

describe("daily scan schedule copy", () => {
  it("does not promise a run at the saved local time", () => {
    for (const text of COPY) {
      expect(text).not.toMatch(/once a day at this local time/i);
      expect(text).not.toMatch(/will run at (this|that) local time/i);
      expect(text).not.toMatch(/next scheduled run was updated/i);
      expect(text).not.toMatch(/^Next scan /);
    }
    expect(DAILY_SCAN_CARD_DESCRIPTION).toMatch(/does not run at that local time/);
    expect(DAILY_SCAN_CARD_DESCRIPTION).toMatch(/best-effort/);
    expect(DAILY_SCAN_CARD_DESCRIPTION).toMatch(/06:00 UTC/);
    expect(DAILY_SCAN_CARD_DESCRIPTION).toMatch(/Scan now still runs when you start it/);
    expect(DAILY_SCAN_SAVED_MESSAGE).toMatch(/are not run at this local time/);
    expect(ONBOARDING_CONFIGURE_DESCRIPTION).toMatch(/is not when MailPriority runs/);
    expect(BEST_EFFORT_DAILY_NOTE).toMatch(/are not run at a saved local time/);
    expect(SETTINGS_PAGE_DESCRIPTION).not.toMatch(/daily scan time/i);
  });
});
