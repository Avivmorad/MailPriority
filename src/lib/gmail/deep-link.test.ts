import { describe, expect, it } from "vitest";

import { gmailSearchFallbackUrl, gmailThreadUrl, mailGmailHref } from "@/lib/gmail/deep-link";

describe("mailGmailHref", () => {
  it("keeps a stored thread URL", () => {
    expect(mailGmailHref(" https://mail.google.com/mail/u/0/#inbox/abc ")).toBe(
      "https://mail.google.com/mail/u/0/#inbox/abc",
    );
  });

  it("falls back to Gmail home when the stored URL is blank", () => {
    expect(mailGmailHref(null)).toBe("https://mail.google.com/mail/");
    expect(mailGmailHref(undefined)).toBe("https://mail.google.com/mail/");
    expect(mailGmailHref("")).toBe("https://mail.google.com/mail/");
    expect(mailGmailHref("   ")).toBe("https://mail.google.com/mail/");
  });
});

describe("gmailThreadUrl", () => {
  it("builds an authuser all-mail thread link", () => {
    expect(gmailThreadUrl("user@example.com", "thread-abc")).toBe(
      "https://mail.google.com/mail/?authuser=user%40example.com#all/thread-abc",
    );
  });

  it("falls back to Gmail home when identifiers are missing", () => {
    expect(gmailThreadUrl("", "")).toBe("https://mail.google.com/mail/");
  });
});

describe("gmailSearchFallbackUrl", () => {
  it("builds a subject search link", () => {
    expect(gmailSearchFallbackUrl("user@example.com", "Invoice")).toContain(
      "authuser=user%40example.com",
    );
    expect(gmailSearchFallbackUrl("user@example.com", "Invoice")).toContain("q=subject%3AInvoice");
  });
});
