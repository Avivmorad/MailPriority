import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  interactiveCardClass,
  interactiveCardLinkClass,
  interactiveChipClass,
  interactiveControlClass,
  interactiveNavClass,
} from "@/lib/ui/interactive";

describe("interactive affordance classes", () => {
  it("keeps cursor and focus-ring cues alongside hover motion for a11y", () => {
    expect(interactiveControlClass).toContain("cursor-pointer");
    expect(interactiveControlClass).toContain("focus-visible:ring-3");
    expect(interactiveControlClass).toContain("ui-interactive");
  });

  it("puts hover motion on the card link control, not only the inner surface", () => {
    expect(interactiveCardLinkClass).toContain("ui-interactive");
    expect(interactiveCardLinkClass).toContain("cursor-pointer");
    expect(interactiveCardLinkClass).toContain("focus-visible:ring-3");
    expect(interactiveCardClass).toContain("cursor-pointer");
    expect(interactiveCardClass).not.toContain("ui-interactive");
  });

  it("exports chip and nav surfaces that share the hover utility", () => {
    for (const value of [interactiveChipClass, interactiveNavClass]) {
      expect(value).toContain("ui-interactive");
      expect(value).toContain("cursor-pointer");
      expect(value).not.toContain("box-shadow");
    }
  });

  it("does not reference glow shadow tokens", () => {
    for (const value of [
      interactiveControlClass,
      interactiveCardLinkClass,
      interactiveCardClass,
      interactiveChipClass,
      interactiveNavClass,
    ]) {
      expect(value).not.toMatch(/glow|shadow-\[/);
    }
  });

  it("rests every ui-interactive control on one quiet shared shadow", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const rests = [...css.matchAll(/--ui-click-shadow:\s*([^;]+);/g)].map((match) => match[1]);
    const hovers = [...css.matchAll(/--ui-click-shadow-hover:\s*([^;]+);/g)].map(
      (match) => match[1],
    );

    expect(rests).toHaveLength(2);
    expect(hovers).toHaveLength(2);
    expect(css).toMatch(/\.ui-interactive\s*\{[^}]*box-shadow:\s*var\(--ui-click-shadow\)/);
    expect(css).toMatch(
      /\.ui-interactive:hover[^{]*\{[^}]*box-shadow:\s*var\(--ui-click-shadow-hover\)/,
    );

    for (const value of [...rests, ...hovers]) {
      expect(value).not.toMatch(/glow|var\(--primary|var\(--ring|blur\(/i);
      const lengths = [...value.matchAll(/(\d+(?:\.\d+)?)px/g)].map((match) => Number(match[1]));
      expect(lengths.length).toBeGreaterThan(0);
      expect(lengths.every((px) => px <= 4)).toBe(true);
    }
  });
});
