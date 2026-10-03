import { describe, expect, it } from "vitest";

import { GMAIL_MODIFY_SCOPE, PRIVACY_POLICY_SECTIONS } from "@/lib/privacy/public-policy";

describe("public privacy policy", () => {
  it("states the Gmail scope, no long-term bodies, and no sending mail", () => {
    const text = PRIVACY_POLICY_SECTIONS.map((section) => `${section.title} ${section.body}`).join(
      " ",
    );
    expect(text).toContain(GMAIL_MODIFY_SCOPE);
    expect(text).toMatch(/token counts and a priced estimate/i);
    expect(text).toMatch(/does not persist full email bodies/i);
    expect(text).toMatch(/does not send, delete, or archive mail/i);
    expect(text).toMatch(/encrypted at rest/i);
    expect(text).toMatch(/Limited Use of Gmail data/i);
    expect(text).toMatch(/does not sell Gmail data/i);
    expect(text).toMatch(/NVIDIA Build when an NVIDIA API key is configured/);
    expect(text).toMatch(/otherwise to Google Gemini/);
    expect(text).toMatch(/Both NVIDIA Build and Google Gemini are part of the product/);
    expect(text).toMatch(/does not publish a support email address/);
    expect(text).toMatch(/Delete analysis data removes that analysis data/);
    expect(text).toMatch(/Gmail stays connected, and the MailPriority login stays/);
    expect(text).toMatch(/revokes access when Google accepts the revoke/);
    expect(text).toMatch(/Gmail labels under the MailPriority\/ prefix/);
    expect(text).toMatch(/renames those managed labels to MailPriority\//);
    expect(text).toMatch(/does not delete the messages in Gmail/);
    expect(text).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    expect(PRIVACY_POLICY_SECTIONS.map((section) => section.id)).toEqual([
      "what-mailpilot-is",
      "gmail-access",
      "what-we-store",
      "retention",
      "your-controls",
      "support",
      "limited-use",
      "google",
    ]);
  });
});
