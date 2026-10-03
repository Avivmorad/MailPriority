import { describe, expect, it } from "vitest";

import {
  disconnectGmailAndClearAnalysis,
  gmailCallbackErrorRedirect,
  gmailStatusErrorMessage,
  isGmailMailboxClaimedByAnotherUser,
  isGmailMailboxUniqueViolation,
  toPublicConnection,
} from "@/lib/gmail/connections";

describe("toPublicConnection", () => {
  it("never includes the refresh token field", () => {
    const publicConnection = toPublicConnection({
      id: "conn-1",
      user_id: "user-1",
      gmail_email: "user@example.com",
      google_account_id: "123",
      encrypted_refresh_token: "v1:iv:tag:ciphertext",
      status: "CONNECTED",
      last_successful_scan_at: null,
      next_scan_at: null,
    });

    expect(publicConnection).toEqual({
      id: "conn-1",
      gmailEmail: "user@example.com",
      status: "CONNECTED",
      lastSuccessfulScanAt: null,
      nextScanAt: null,
    });
    expect(JSON.stringify(publicConnection)).not.toMatch(/token|v1:/i);
  });
});

describe("gmailStatusErrorMessage", () => {
  it("explains a missing table", () => {
    expect(
      gmailStatusErrorMessage({
        code: "PGRST205",
        message: "Could not find the table 'public.gmail_connections' in the schema cache",
      }),
    ).toMatch(/0002_gmail_connections/);
  });

  it("does not echo raw unknown database errors", () => {
    expect(gmailStatusErrorMessage({ code: "XX000", message: "internal boom" })).toBe(
      "Could not load Gmail connection status from the database.",
    );
  });
});

describe("isGmailMailboxClaimedByAnotherUser", () => {
  const other: {
    user_id: string;
    gmail_email: string;
    google_account_id: string | null;
    status: string;
  } = {
    user_id: "user-a",
    gmail_email: "shared@example.com",
    google_account_id: "gid-1",
    status: "CONNECTED",
  };

  it("rejects a second MailPilot user connecting the same inbox", () => {
    expect(
      isGmailMailboxClaimedByAnotherUser(
        "user-b",
        { email: "Shared@example.com", googleAccountId: null },
        [other],
      ),
    ).toBe(true);
  });

  it("allows the same user to reconnect", () => {
    expect(
      isGmailMailboxClaimedByAnotherUser(
        "user-a",
        { email: "shared@example.com", googleAccountId: "gid-1" },
        [other],
      ),
    ).toBe(false);
  });

  it("allows a new user after the previous connection is disconnected", () => {
    expect(
      isGmailMailboxClaimedByAnotherUser(
        "user-b",
        { email: "shared@example.com", googleAccountId: "gid-1" },
        [{ ...other, status: "DISCONNECTED" }],
      ),
    ).toBe(false);
  });

  it("rejects the same Google account id on another user", () => {
    expect(
      isGmailMailboxClaimedByAnotherUser(
        "user-b",
        { email: "other@example.com", googleAccountId: "gid-1" },
        [other],
      ),
    ).toBe(true);
  });
});

describe("isGmailMailboxUniqueViolation", () => {
  it("detects the active-mailbox unique indexes", () => {
    expect(
      isGmailMailboxUniqueViolation({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "gmail_connections_one_active_mailbox_email"',
      }),
    ).toBe(true);
    expect(isGmailMailboxUniqueViolation({ code: "23505", message: "users_email_key" })).toBe(
      false,
    );
  });
});

describe("disconnectGmailAndClearAnalysis", () => {
  it("clears stored analysis after the connection is disconnected", async () => {
    const order: string[] = [];
    await disconnectGmailAndClearAnalysis("user-1", {
      disconnect: async (userId) => {
        order.push(`disconnect:${userId}`);
      },
      purge: async (userId) => {
        order.push(`purge:${userId}`);
      },
    });
    expect(order).toEqual(["disconnect:user-1", "purge:user-1"]);
  });

  it("does not purge when disconnect fails", async () => {
    const purged: string[] = [];
    await expect(
      disconnectGmailAndClearAnalysis("user-1", {
        disconnect: async () => {
          throw new Error("revoke failed");
        },
        purge: async (userId) => {
          purged.push(userId);
        },
      }),
    ).rejects.toThrow("revoke failed");
    expect(purged).toEqual([]);
  });
});

describe("gmailCallbackErrorRedirect", () => {
  it("returns the user to the requested page without leaking tokens", () => {
    const url = gmailCallbackErrorRedirect("https://mailpilot.example", "denied", "/settings");
    expect(url.pathname).toBe("/settings");
    expect(url.searchParams.get("gmail")).toBe("error");
    expect(url.searchParams.get("reason")).toBe("denied");
    expect(url.toString()).not.toMatch(/token|code=/i);
  });
});
