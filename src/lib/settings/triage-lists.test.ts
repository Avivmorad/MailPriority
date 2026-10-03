import { describe, expect, it } from "vitest";

import {
  parseIgnoreEntry,
  parseTriageDomain,
  parseTriageSender,
} from "@/lib/settings/triage-lists";

describe("parseTriageSender", () => {
  it("normalizes valid emails and rejects invalid ones", () => {
    expect(parseTriageSender("  Ada@Example.com ")).toEqual({
      ok: true,
      value: "ada@example.com",
    });
    expect(parseTriageSender("not-an-email").ok).toBe(false);
    expect(parseTriageSender("").ok).toBe(false);
  });
});

describe("parseIgnoreEntry", () => {
  it("stores emails and domains in separate kinds and rejects neither", () => {
    expect(parseIgnoreEntry("  Noise@Example.com ")).toEqual({
      ok: true,
      kind: "sender",
      value: "noise@example.com",
    });
    expect(parseIgnoreEntry("Newsletters.Example.com")).toEqual({
      ok: true,
      kind: "domain",
      value: "newsletters.example.com",
    });
    expect(parseIgnoreEntry("@news.example.com").ok).toBe(false);
    expect(parseIgnoreEntry("not a domain").ok).toBe(false);
    expect(parseIgnoreEntry("").ok).toBe(false);
  });
});

describe("parseTriageDomain", () => {
  it("normalizes domains and rejects host fragments", () => {
    expect(parseTriageDomain("@News.Example.com")).toEqual({
      ok: true,
      value: "news.example.com",
    });
    expect(parseTriageDomain("not a domain").ok).toBe(false);
    expect(parseTriageDomain("localhost").ok).toBe(false);
  });
});
