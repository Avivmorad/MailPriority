/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TriageListField } from "@/components/settings/triage-list-field";

afterEach(() => {
  cleanup();
});

describe("TriageListField", () => {
  it("keeps a long sender address readable instead of clipping it", () => {
    const address = "hotel.reservations@verylongdomainname.example.com";
    render(
      <TriageListField
        label="VIP senders"
        values={[address]}
        onChange={() => undefined}
        parseValue={() => ({ ok: false })}
        invalidMessage="Enter a valid email address."
      />,
    );

    const value = screen.getByText(address);
    expect(value.className).toContain("[overflow-wrap:anywhere]");
    expect(value.className).not.toContain("truncate");
  });
});
