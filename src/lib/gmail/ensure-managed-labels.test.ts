import { beforeEach, describe, expect, it, vi } from "vitest";

import type { gmail_v1 } from "googleapis";

import { isLabelMapComplete, loadLabelIdMap } from "@/lib/gmail/labels";
import { resetSharedGmailQuotaForTests } from "@/lib/gmail/quota";

const CURRENT_NAMES = [
  "MailPriority/Important",
  "MailPriority/Action Required",
  "MailPriority/Low Priority",
  "MailPriority/Processed",
] as const;

const LEGACY_NAMES = [
  "MailPilot/Important",
  "MailPilot/Action Required",
  "MailPilot/Low Priority",
  "MailPilot/Processed",
] as const;

interface StoredLabelRow {
  logical_name: string;
  gmail_label_id: string;
  gmail_label_name: string;
}

const dbState = vi.hoisted(() => ({
  rows: [] as StoredLabelRow[],
  upserts: [] as StoredLabelRow[],
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      upsert: async (row: StoredLabelRow) => {
        dbState.upserts.push(row);
        const index = dbState.rows.findIndex(
          (existing) => existing.logical_name === row.logical_name,
        );
        if (index >= 0) {
          dbState.rows[index] = row;
        } else {
          dbState.rows.push(row);
        }
        return { error: null };
      },
      select: () => ({
        eq: async () => ({ data: dbState.rows, error: null }),
      }),
    }),
  }),
}));

interface ListedLabel {
  id: string;
  name: string;
}

function createFakeGmail(initial: ListedLabel[]) {
  const labels = initial.map((label) => ({ ...label }));
  const patch = vi.fn(async (params: { id: string; requestBody?: { name?: string | null } }) => {
    const label = labels.find((item) => item.id === params.id);
    const name = params.requestBody?.name;
    if (!label || typeof name !== "string") {
      throw new Error("labels.patch failed");
    }
    if (labels.some((item) => item.name === name && item.id !== label.id)) {
      throw new Error(`duplicate label name ${name}`);
    }
    label.name = name;
    return { data: { id: label.id, name: label.name } };
  });
  const create = vi.fn(async (params: { requestBody?: { name?: string | null } }) => {
    const name = params.requestBody?.name;
    if (typeof name !== "string" || labels.some((item) => item.name === name)) {
      throw new Error("labels.create failed");
    }
    const created = { id: `created-${labels.length + 1}`, name };
    labels.push(created);
    return { data: created };
  });
  const list = vi.fn(async () => ({
    data: { labels: labels.map((label) => ({ ...label })) },
  }));
  const remove = vi.fn(async () => {
    throw new Error("labels.delete must not run");
  });
  const gmail = {
    users: {
      labels: { list, create, patch, delete: remove },
      threads: {
        modify: vi.fn(async () => {
          throw new Error("threads.modify must not run during label ensure");
        }),
        trash: vi.fn(async () => {
          throw new Error("threads.trash must not run");
        }),
      },
      messages: {
        trash: vi.fn(async () => {
          throw new Error("messages.trash must not run");
        }),
        send: vi.fn(async () => {
          throw new Error("messages.send must not run");
        }),
      },
    },
  } as unknown as gmail_v1.Gmail;

  return { gmail, labels, patch, create, list, remove };
}

function legacyMailbox(): ListedLabel[] {
  return [
    { id: "parent", name: "MailPilot" },
    { id: "imp", name: "MailPilot/Important" },
    { id: "act", name: "MailPilot/Action Required" },
    { id: "low", name: "MailPilot/Low Priority" },
    { id: "pro", name: "MailPilot/Processed" },
    { id: "inbox", name: "INBOX" },
    { id: "family", name: "Family" },
  ];
}

describe("ensureManagedLabelsWithClient", () => {
  beforeEach(() => {
    dbState.rows = [];
    dbState.upserts = [];
    resetSharedGmailQuotaForTests();
  });

  it("creates only MailPriority/ labels on a new mailbox", async () => {
    const { ensureManagedLabelsWithClient } = await import("@/lib/gmail/labels");
    const mailbox = createFakeGmail([
      { id: "inbox", name: "INBOX" },
      { id: "family", name: "Family" },
    ]);
    const threadLabelIds = ["inbox", "family"];

    await ensureManagedLabelsWithClient(mailbox.gmail, "conn-1", { delaysMs: [] });

    expect(mailbox.patch).not.toHaveBeenCalled();
    expect(mailbox.remove).not.toHaveBeenCalled();
    expect(mailbox.create.mock.calls.map((call) => call[0].requestBody?.name)).toEqual([
      ...CURRENT_NAMES,
    ]);
    expect(mailbox.labels.map((label) => label.name)).not.toContain("MailPilot");
    expect(mailbox.labels.some((label) => label.name.startsWith("MailPilot/"))).toBe(false);
    expect(threadLabelIds).toEqual(["inbox", "family"]);
    expect(dbState.upserts.map((row) => row.gmail_label_name)).toEqual([...CURRENT_NAMES]);
  });

  it("renames MailPilot/ labels in place and leaves threads on the same ids", async () => {
    const { ensureManagedLabelsWithClient } = await import("@/lib/gmail/labels");
    const mailbox = createFakeGmail(legacyMailbox());
    const threadLabelIds = ["imp", "act", "pro", "inbox"];

    await ensureManagedLabelsWithClient(mailbox.gmail, "conn-1", { delaysMs: [] });

    expect(mailbox.create).not.toHaveBeenCalled();
    expect(mailbox.remove).not.toHaveBeenCalled();
    expect(mailbox.labels.find((label) => label.id === "parent")?.name).toBe("MailPilot");
    expect(mailbox.patch.mock.calls.map((call) => call[0].id)).toEqual([
      "imp",
      "act",
      "low",
      "pro",
    ]);
    expect(mailbox.labels.find((label) => label.id === "imp")?.name).toBe("MailPriority/Important");
    expect(mailbox.labels.find((label) => label.id === "act")?.name).toBe(
      "MailPriority/Action Required",
    );
    expect(mailbox.labels.find((label) => label.id === "low")?.name).toBe(
      "MailPriority/Low Priority",
    );
    expect(mailbox.labels.find((label) => label.id === "pro")?.name).toBe("MailPriority/Processed");
    expect(mailbox.labels.find((label) => label.id === "inbox")?.name).toBe("INBOX");
    expect(mailbox.labels.find((label) => label.id === "family")?.name).toBe("Family");
    expect(threadLabelIds).toEqual(["imp", "act", "pro", "inbox"]);
    expect(dbState.upserts.map((row) => row.gmail_label_id)).toEqual(["imp", "act", "low", "pro"]);
    expect(dbState.upserts.map((row) => row.gmail_label_name)).toEqual([...CURRENT_NAMES]);

    mailbox.patch.mockClear();
    mailbox.create.mockClear();
    await ensureManagedLabelsWithClient(mailbox.gmail, "conn-1", { delaysMs: [] });
    expect(mailbox.patch).not.toHaveBeenCalled();
    expect(mailbox.create).not.toHaveBeenCalled();
    expect(threadLabelIds).toEqual(["imp", "act", "pro", "inbox"]);
  });

  it("does not create a duplicate when MailPriority/ already exists beside MailPilot/", async () => {
    const { ensureManagedLabelsWithClient } = await import("@/lib/gmail/labels");
    const mailbox = createFakeGmail([
      { id: "old-parent", name: "MailPilot" },
      { id: "new-parent", name: "MailPriority" },
      { id: "old-imp", name: "MailPilot/Important" },
      { id: "new-imp", name: "MailPriority/Important" },
      { id: "old-act", name: "MailPilot/Action Required" },
      { id: "new-act", name: "MailPriority/Action Required" },
      { id: "old-low", name: "MailPilot/Low Priority" },
      { id: "new-low", name: "MailPriority/Low Priority" },
      { id: "old-pro", name: "MailPilot/Processed" },
      { id: "new-pro", name: "MailPriority/Processed" },
    ]);

    await ensureManagedLabelsWithClient(mailbox.gmail, "conn-1", { delaysMs: [] });

    expect(mailbox.patch).not.toHaveBeenCalled();
    expect(mailbox.create).not.toHaveBeenCalled();
    expect(mailbox.remove).not.toHaveBeenCalled();
    expect(mailbox.labels.find((label) => label.id === "old-imp")?.name).toBe(
      "MailPilot/Important",
    );
    expect(dbState.upserts.map((row) => row.gmail_label_id)).toEqual([
      "new-imp",
      "new-act",
      "new-low",
      "new-pro",
    ]);
  });

  it("renames managed children and leaves an unmanaged MailPilot/ label alone", async () => {
    const { ensureManagedLabelsWithClient } = await import("@/lib/gmail/labels");
    const mailbox = createFakeGmail([
      ...legacyMailbox(),
      { id: "custom", name: "MailPilot/Custom" },
    ]);

    await ensureManagedLabelsWithClient(mailbox.gmail, "conn-1", { delaysMs: [] });

    expect(mailbox.create).not.toHaveBeenCalled();
    expect(mailbox.remove).not.toHaveBeenCalled();
    expect(mailbox.labels.find((label) => label.id === "parent")?.name).toBe("MailPilot");
    expect(mailbox.labels.find((label) => label.id === "custom")?.name).toBe("MailPilot/Custom");
    expect(mailbox.labels.find((label) => label.id === "imp")?.name).toBe("MailPriority/Important");
    expect(mailbox.patch.mock.calls.map((call) => call[0].id)).toEqual([
      "imp",
      "act",
      "low",
      "pro",
    ]);
  });

  it("does not create a replacement label when rename fails", async () => {
    const { ensureManagedLabelsWithClient } = await import("@/lib/gmail/labels");
    const mailbox = createFakeGmail(legacyMailbox());
    mailbox.patch.mockRejectedValue(new Error("patch rejected"));

    await expect(
      ensureManagedLabelsWithClient(mailbox.gmail, "conn-1", { delaysMs: [] }),
    ).rejects.toThrow(/patch rejected/);
    expect(mailbox.create).not.toHaveBeenCalled();
    expect(mailbox.labels.find((label) => label.id === "imp")?.name).toBe("MailPilot/Important");
  });
});

describe("loadLabelIdMap legacy prefix", () => {
  beforeEach(() => {
    dbState.rows = [];
    dbState.upserts = [];
  });

  it("omits stored MailPilot/ names so scan start reconciles them", async () => {
    dbState.rows = [
      {
        logical_name: "important",
        gmail_label_id: "imp",
        gmail_label_name: "MailPilot/Important",
      },
      {
        logical_name: "action_required",
        gmail_label_id: "act",
        gmail_label_name: "MailPriority/Action Required",
      },
      {
        logical_name: "low_priority",
        gmail_label_id: "low",
        gmail_label_name: "MailPriority/Low Priority",
      },
      {
        logical_name: "processed",
        gmail_label_id: "pro",
        gmail_label_name: "MailPriority/Processed",
      },
    ];

    const map = await loadLabelIdMap("conn-1");
    expect(map.has("important")).toBe(false);
    expect(map.get("action_required")).toBe("act");
    expect(isLabelMapComplete(map)).toBe(false);
    expect(LEGACY_NAMES[0]).toBe("MailPilot/Important");
  });

  it("keeps a complete map when every stored name is MailPriority/", async () => {
    dbState.rows = [
      { logical_name: "important", gmail_label_id: "imp", gmail_label_name: CURRENT_NAMES[0] },
      {
        logical_name: "action_required",
        gmail_label_id: "act",
        gmail_label_name: CURRENT_NAMES[1],
      },
      { logical_name: "low_priority", gmail_label_id: "low", gmail_label_name: CURRENT_NAMES[2] },
      { logical_name: "processed", gmail_label_id: "pro", gmail_label_name: CURRENT_NAMES[3] },
    ];

    const map = await loadLabelIdMap("conn-1");
    expect(isLabelMapComplete(map)).toBe(true);
    expect(map.get("important")).toBe("imp");
  });
});
