import { describe, expect, it } from "vitest";

import {
  actionStatusForMailTab,
  isMailTab,
  mailTabEmptyCopy,
  mailTabFromLegacyActionTab,
  mailViewPath,
  parseMailTab,
} from "@/lib/mail/tabs";

describe("mail tabs", () => {
  it("parses known tabs and defaults unknown values to summary", () => {
    expect(parseMailTab("open")).toBe("open");
    expect(parseMailTab("ignored")).toBe("ignored");
    expect(parseMailTab("OPEN")).toBe("summary");
    expect(parseMailTab(undefined)).toBe("summary");
    expect(isMailTab("waiting")).toBe(true);
    expect(isMailTab("nope")).toBe(false);
  });

  it("maps action tabs and leaves digest/ignore as non-actions", () => {
    expect(actionStatusForMailTab("open")).toBe("OPEN");
    expect(actionStatusForMailTab("completed")).toBe("COMPLETED");
    expect(actionStatusForMailTab("summary")).toBeNull();
    expect(actionStatusForMailTab("ignored")).toBeNull();
  });

  it("maps legacy Action Center query params", () => {
    expect(mailTabFromLegacyActionTab("OPEN")).toBe("open");
    expect(mailTabFromLegacyActionTab("SNOOZED")).toBe("snoozed");
    expect(mailTabFromLegacyActionTab("summary")).toBe("summary");
  });

  it("keeps the tab when a label filter is added", () => {
    expect(mailViewPath({ tab: "waiting", category: "finance" })).toBe(
      "/mail?tab=waiting&category=finance",
    );
    expect(mailViewPath({ tab: "open", uncertain: true })).toBe("/mail?tab=open&uncertain=1");
    expect(mailViewPath({ tab: "summary" })).toBe("/mail?tab=summary");
    expect(
      mailViewPath({
        tab: "open",
        category: "finance",
        priority: "medium",
        signal: "high",
      }),
    ).toBe("/mail?tab=open&category=finance&priority=medium&signal=high");
  });

  it("uses empty-state copy for Actions and Pending", () => {
    expect(mailTabEmptyCopy("open").title).toBe("No actions right now.");
    expect(mailTabEmptyCopy("waiting").title).toBe("Nothing is pending a reply.");
  });
});
