import { describe, expect, it } from "vitest";

import { MAILPILOT_LABELS } from "@/lib/gmail/constants";
import { isValidOAuthState } from "@/lib/gmail/oauth";

describe("MAILPILOT_LABELS", () => {
  it("uses the MailPriority/ Gmail namespace", () => {
    const names = MAILPILOT_LABELS.map((label) => label.gmailLabelName);
    expect(names).toEqual([
      "MailPriority/Important",
      "MailPriority/Action Required",
      "MailPriority/Low Priority",
      "MailPriority/Processed",
    ]);
    expect(names.some((name) => name.startsWith("MailPilot/"))).toBe(false);
  });

  it("has unique logical names", () => {
    const logical = MAILPILOT_LABELS.map((label) => label.logicalName);
    expect(new Set(logical).size).toBe(logical.length);
  });
});

describe("isValidOAuthState", () => {
  it("accepts matching state", () => {
    expect(isValidOAuthState("abc123def", "abc123def")).toBe(true);
  });

  it("rejects missing or mismatched state", () => {
    expect(isValidOAuthState(undefined, "abc")).toBe(false);
    expect(isValidOAuthState("abc", undefined)).toBe(false);
    expect(isValidOAuthState("abc", "abd")).toBe(false);
  });
});
