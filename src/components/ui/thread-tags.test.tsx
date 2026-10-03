/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ThreadTags } from "@/components/ui/thread-tags";
afterEach(cleanup);
describe("ThreadTags urgency", () => {
  it.each([
    ["urgent", "High"],
    ["soon", "Medium"],
    ["normal", "Low"],
    ["none", "None"],
    [null, "Unknown"],
  ])("always shows %s as %s", (urgency, label) => {
    render(<ThreadTags urgency={urgency} />);
    expect(screen.getByText(`Urgency: ${label}`)).toBeInTheDocument();
  });
});
