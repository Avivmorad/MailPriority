import { beforeEach, describe, expect, it, vi } from "vitest";

import type { gmail_v1 } from "googleapis";

const loadLabelIdMap = vi.hoisted(() => vi.fn());
const ensureManagedLabelsWithGmail = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/lib/gmail/labels", () => ({
  loadLabelIdMap,
  ensureManagedLabelsWithGmail,
}));

describe("loadOrEnsureLabelIdMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns existing mappings without calling Gmail when complete", async () => {
    const complete = new Map([
      ["important", "L1"],
      ["action_required", "L2"],
      ["low_priority", "L3"],
      ["processed", "L4"],
    ]);
    loadLabelIdMap.mockResolvedValue(complete);

    const { loadOrEnsureLabelIdMap } = await import("@/lib/gmail/label-reconcile");
    const gmail = {} as gmail_v1.Gmail;
    const result = await loadOrEnsureLabelIdMap("conn-1", gmail);

    expect(result).toBe(complete);
    expect(ensureManagedLabelsWithGmail).not.toHaveBeenCalled();
    expect(loadLabelIdMap).toHaveBeenCalledTimes(1);
  });

  it("reconciles MailPilot labels when mappings are incomplete", async () => {
    const incomplete = new Map([["important", "L1"]]);
    const complete = new Map([
      ["important", "L1"],
      ["action_required", "L2"],
      ["low_priority", "L3"],
      ["processed", "L4"],
    ]);
    loadLabelIdMap.mockResolvedValueOnce(incomplete).mockResolvedValueOnce(complete);

    const { loadOrEnsureLabelIdMap } = await import("@/lib/gmail/label-reconcile");
    const gmail = { users: { labels: {} } } as unknown as gmail_v1.Gmail;
    const result = await loadOrEnsureLabelIdMap("conn-1", gmail);

    expect(ensureManagedLabelsWithGmail).toHaveBeenCalledWith("conn-1", gmail);
    expect(loadLabelIdMap).toHaveBeenCalledTimes(2);
    expect(result).toBe(complete);
  });
});
