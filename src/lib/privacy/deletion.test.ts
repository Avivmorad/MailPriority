import { describe, expect, it } from "vitest";

import { disconnectGmailAndClearAnalysis } from "@/lib/gmail/connections";
import {
  deleteAccountForUser,
  deleteAnalysisDataForUser,
  deleteAccountRequestSchema,
  deleteAnalysisRequestSchema,
  type AccountDeletionPort,
} from "@/lib/privacy/deletion";

function createMemoryPort(ownerId: string): AccountDeletionPort & {
  rows: Record<string, Array<{ userId: string; connectionId?: string }>>;
  historyResetFor: string[];
  disconnected: string[];
  deletedUsers: string[];
  abortedScansFor: Array<{ userId: string; connectionIds: string[] }>;
} {
  const rows: Record<string, Array<{ userId: string; connectionId?: string }>> = {
    triage_usage: [{ userId: ownerId }, { userId: "other-user" }],
    digest_reports: [{ userId: ownerId }, { userId: "other-user" }],
    scan_runs: [{ userId: ownerId }, { userId: "other-user" }],
    classification_feedback: [{ userId: ownerId }],
    action_items: [{ userId: ownerId }, { userId: "other-user" }],
    email_messages: [{ userId: ownerId }],
    email_threads: [{ userId: ownerId }, { userId: "other-user" }],
    scan_jobs: [
      { userId: ownerId, connectionId: "conn-owner" },
      { userId: "other-user", connectionId: "conn-other" },
    ],
  };
  const historyResetFor: string[] = [];
  const disconnected: string[] = [];
  const deletedUsers: string[] = [];
  const abortedScansFor: Array<{ userId: string; connectionIds: string[] }> = [];

  return {
    rows,
    historyResetFor,
    disconnected,
    deletedUsers,
    abortedScansFor,
    async connectionIdsForUser(userId) {
      return userId === ownerId ? ["conn-owner"] : ["conn-other"];
    },
    async abortActiveScansForUser(userId, connectionIds) {
      abortedScansFor.push({ userId, connectionIds });
    },
    async deleteWhereUser(table, userId) {
      const before = rows[table] ?? [];
      const kept = before.filter((row) => row.userId !== userId);
      rows[table] = kept;
      return before.length - kept.length;
    },
    async deleteScanJobsForConnections(connectionIds) {
      const jobs = rows.scan_jobs ?? [];
      const kept = jobs.filter((row) => !connectionIds.includes(row.connectionId ?? ""));
      rows.scan_jobs = kept;
      return jobs.length - kept.length;
    },
    async resetConnectionScanState(userId) {
      historyResetFor.push(userId);
    },
    async disconnectGmail(userId) {
      disconnected.push(userId);
    },
    async deleteAuthUser(userId) {
      deletedUsers.push(userId);
    },
  };
}

describe("privacy deletion confirmation", () => {
  it("requires the exact confirmation phrases", () => {
    expect(deleteAnalysisRequestSchema.safeParse({ confirmation: "DELETE ANALYSIS" }).success).toBe(
      true,
    );
    expect(deleteAnalysisRequestSchema.safeParse({ confirmation: "delete analysis" }).success).toBe(
      false,
    );
    expect(deleteAccountRequestSchema.safeParse({ confirmation: "DELETE ACCOUNT" }).success).toBe(
      true,
    );
    expect(deleteAccountRequestSchema.safeParse({ confirmation: "yes" }).success).toBe(false);
  });
});

describe("deleteAnalysisDataForUser", () => {
  it("stops active scans before deleting analysis rows", async () => {
    const port = createMemoryPort("user-1");
    const callOrder: string[] = [];
    port.abortActiveScansForUser = async (userId, connectionIds) => {
      callOrder.push("abort");
      port.abortedScansFor.push({ userId, connectionIds });
    };
    port.deleteWhereUser = async (table, userId) => {
      callOrder.push(`delete:${table}`);
      return (port.rows[table] ?? []).filter((row) => row.userId === userId).length;
    };

    await deleteAnalysisDataForUser("user-1", port);

    expect(callOrder[0]).toBe("abort");
    expect(callOrder.some((step) => step.startsWith("delete:"))).toBe(true);
    expect(callOrder.indexOf("abort")).toBeLessThan(
      callOrder.findIndex((step) => step.startsWith("delete:")),
    );
    expect(callOrder.indexOf("delete:triage_usage")).toBeLessThan(
      callOrder.indexOf("delete:scan_runs"),
    );
  });

  it("removes only the authenticated user's analysis rows and keeps the other user", async () => {
    const port = createMemoryPort("user-1");
    const deleted = await deleteAnalysisDataForUser("user-1", port);

    expect(deleted.email_threads).toBe(1);
    expect(deleted.triage_usage).toBe(1);
    expect(deleted.digest_reports).toBe(1);
    expect(deleted.scan_jobs).toBe(1);
    expect(port.rows.email_threads).toEqual([{ userId: "other-user" }]);
    expect(port.rows.triage_usage).toEqual([{ userId: "other-user" }]);
    expect(port.rows.digest_reports).toEqual([{ userId: "other-user" }]);
    expect(port.rows.scan_jobs).toEqual([{ userId: "other-user", connectionId: "conn-other" }]);
    expect(port.historyResetFor).toEqual(["user-1"]);
    expect(port.abortedScansFor).toEqual([{ userId: "user-1", connectionIds: ["conn-owner"] }]);
    expect(port.disconnected).toEqual([]);
    expect(port.deletedUsers).toEqual([]);
  });
});

describe("deleteAccountForUser", () => {
  it("purges analysis, disconnects Gmail, then deletes the auth user", async () => {
    const port = createMemoryPort("user-1");
    await deleteAccountForUser("user-1", port);
    expect(port.rows.email_threads.some((row) => row.userId === "user-1")).toBe(false);
    expect(port.disconnected).toEqual(["user-1"]);
    expect(port.deletedUsers).toEqual(["user-1"]);
  });

  it("clears the same analysis rows when Gmail is disconnected", async () => {
    const port = createMemoryPort("user-1");
    await disconnectGmailAndClearAnalysis("user-1", {
      disconnect: (userId) => port.disconnectGmail(userId),
      purge: (userId) => deleteAnalysisDataForUser(userId, port).then(() => undefined),
    });
    expect(port.disconnected).toEqual(["user-1"]);
    expect(port.rows.email_threads.some((row) => row.userId === "user-1")).toBe(false);
    expect(port.deletedUsers).toEqual([]);
  });
});
