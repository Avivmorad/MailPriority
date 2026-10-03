/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PublicLegalShell } from "@/components/layout/public-legal-shell";

afterEach(() => {
  cleanup();
});

describe("PublicLegalShell", () => {
  it("wraps long unbroken text such as the Gmail scope URL", () => {
    render(
      <PublicLegalShell>
        <p>https://www.googleapis.com/auth/gmail.modify</p>
      </PublicLegalShell>,
    );

    expect(screen.getByRole("main").className).toContain("[overflow-wrap:anywhere]");
  });
});
