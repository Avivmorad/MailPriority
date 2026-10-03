import { describe, expect, it } from "vitest";

import type { MailPilotLogicalLabel } from "@/lib/gmail/constants";
import { isLabelMapComplete } from "@/lib/gmail/labels";

describe("isLabelMapComplete", () => {
  it("requires every managed logical label", () => {
    expect(isLabelMapComplete(new Map())).toBe(false);
    expect(isLabelMapComplete(new Map<MailPilotLogicalLabel, string>([["important", "L1"]]))).toBe(
      false,
    );
    expect(
      isLabelMapComplete(
        new Map<MailPilotLogicalLabel, string>([
          ["important", "L1"],
          ["action_required", "L2"],
          ["low_priority", "L3"],
          ["processed", "L4"],
        ]),
      ),
    ).toBe(true);
  });
});
