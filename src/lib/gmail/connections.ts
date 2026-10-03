import { cache } from "react";

import { getGmailEnv, isGmailConfigured } from "@/lib/config/env";
import {
  type GmailConnectionPublic,
  type GmailConnectionStatus,
  type GmailStatusPayload,
} from "@/lib/gmail/constants";
import {
  exchangeAuthorizationCode,
  fetchGmailIdentity,
  GmailConnectError,
  revokeRefreshToken,
} from "@/lib/gmail/oauth";
import { runGmailPostConnectSetup } from "@/lib/gmail/post-connect";
import { GMAIL_CONNECT_RETRY_DELAYS_MS } from "@/lib/gmail/retry";
import { unwrapSecretWithRotation, encryptSecret } from "@/lib/security/encryption";
import { cancelActiveJobsForConnection } from "@/lib/scans/jobs";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitProductEvent } from "@/lib/observability/events";

interface ConnectionRow {
  id: string;
  user_id: string;
  gmail_email: string;
  google_account_id: string | null;
  encrypted_refresh_token?: string | null;
  status: GmailConnectionStatus;
  last_successful_scan_at: string | null;
  next_scan_at: string | null;
}

export interface GmailMailboxClaim {
  user_id: string;
  gmail_email: string;
  google_account_id: string | null;
  status: string;
}

export const GMAIL_MAILBOX_IN_USE_MESSAGE =
  "This Gmail inbox is already connected to another MailPriority account. Disconnect it there first, then try again.";

/**
 * True when another MailPriority user already has this inbox (or Google account) connected.
 * DISCONNECTED rows do not count; the original owner can reconnect until someone else claims it.
 */
export function isGmailMailboxClaimedByAnotherUser(
  currentUserId: string,
  identity: { email: string; googleAccountId: string | null },
  rows: GmailMailboxClaim[],
): boolean {
  const email = identity.email.trim().toLowerCase();
  const googleAccountId = identity.googleAccountId;
  return rows.some((row) => {
    if (row.user_id === currentUserId) {
      return false;
    }
    if (row.status === "DISCONNECTED") {
      return false;
    }
    if (row.gmail_email.trim().toLowerCase() === email) {
      return true;
    }
    return Boolean(googleAccountId && row.google_account_id === googleAccountId);
  });
}

export function isGmailMailboxUniqueViolation(error: {
  code?: string | null;
  message?: string | null;
}): boolean {
  const message = error.message ?? "";
  const namedIndex =
    /gmail_connections_one_active_mailbox_email|gmail_connections_one_active_google_account/i.test(
      message,
    );
  if (namedIndex) {
    return true;
  }
  return error.code === "23505" && /gmail_connections/i.test(message);
}

export function toPublicConnection(row: ConnectionRow): GmailConnectionPublic {
  return {
    id: row.id,
    gmailEmail: row.gmail_email,
    status: row.status,
    lastSuccessfulScanAt: row.last_successful_scan_at,
    nextScanAt: row.next_scan_at,
  };
}

/**
 * Map a PostgREST/Postgres error to copy that is safe to show in the UI.
 * Does not include tokens, email bodies, or raw connection strings.
 */
export function gmailStatusErrorMessage(error: {
  code?: string | null;
  message?: string | null;
}): string {
  const code = error.code ?? "";
  const message = error.message ?? "";
  if (
    code === "PGRST205" ||
    code === "42P01" ||
    (/gmail_connections/i.test(message) &&
      /does not exist|schema cache|could not find/i.test(message))
  ) {
    return "The gmail_connections table is missing. Apply supabase/migrations/0002_gmail_connections.sql in the Supabase SQL Editor, then reload.";
  }
  if (code === "42501" || /permission denied/i.test(message)) {
    return "Database permission denied for Gmail connections. Re-run 0002_gmail_connections.sql in the SQL Editor.";
  }
  if (code === "PGRST301" || /jwt|invalid api key|invalid authentication/i.test(message)) {
    return "Supabase rejected the server key. Check SUPABASE_SERVICE_ROLE_KEY in .env.local and restart the dev server.";
  }
  return "Could not load Gmail connection status from the database.";
}

export const getGmailStatusForUser = cache(async (userId: string): Promise<GmailStatusPayload> => {
  const configured = isGmailConfigured();
  if (!configured) {
    return { configured: false, connection: null, loadError: null };
  }

  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("gmail_connections")
      .select(
        "id, user_id, gmail_email, google_account_id, status, last_successful_scan_at, next_scan_at",
      )
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      emitProductEvent({
        type: "gmail.connect_failed",
        step: "status",
        errorCode: error.code ?? "status",
      });
      return {
        configured: true,
        connection: null,
        loadError: gmailStatusErrorMessage(error),
      };
    }

    return {
      configured: true,
      connection: data ? toPublicConnection(data as ConnectionRow) : null,
      loadError: null,
    };
  } catch {
    emitProductEvent({ type: "gmail.connect_failed", step: "status", errorCode: "status" });
    return {
      configured: true,
      connection: null,
      loadError: "Could not load Gmail connection status from the database.",
    };
  }
});

export interface CompleteGmailOAuthResult {
  connection: GmailConnectionPublic;
  /**
   * Label ensure + initial next_scan_at. Run after the OAuth redirect so the
   * browser is not blocked on Gmail label RPCs. Idempotent; scans also reconcile.
   */
  runPostConnectSetup: () => Promise<void>;
}

export async function completeGmailOAuth(
  userId: string,
  code: string,
): Promise<CompleteGmailOAuthResult> {
  const env = getGmailEnv();
  const db = createAdminClient();

  // Token exchange is required before redirect; profile upsert is independent.
  const [tokens, profileResult] = await Promise.all([
    exchangeAuthorizationCode(code),
    db.from("profiles").upsert({ id: userId }, { onConflict: "id" }),
  ]);
  if (profileResult.error) {
    emitProductEvent({
      type: "gmail.connect_failed",
      step: "profile",
      errorCode: profileResult.error.code ?? "persist",
    });
    throw new GmailConnectError("persist", "Failed to persist profile for Gmail connection");
  }

  // Interactive connect uses empty retry delays so a Gmail 429 fails fast.
  const identity = await fetchGmailIdentity(tokens.accessToken, tokens.refreshToken, {
    delaysMs: GMAIL_CONNECT_RETRY_DELAYS_MS,
  });

  let encryptedRefreshToken: string;
  try {
    encryptedRefreshToken = encryptSecret(tokens.refreshToken, env.TOKEN_ENCRYPTION_KEY);
  } catch {
    throw new GmailConnectError(
      "encryption_key",
      "TOKEN_ENCRYPTION_KEY must be a 32-byte key (openssl rand -hex 32)",
    );
  }

  const emailClaimQuery = db
    .from("gmail_connections")
    .select("user_id, gmail_email, google_account_id, status")
    .neq("status", "DISCONNECTED")
    .ilike("gmail_email", identity.email);

  const googleAccountQuery =
    identity.googleAccountId == null || identity.googleAccountId === ""
      ? Promise.resolve({ data: [] as GmailMailboxClaim[] | null, error: null })
      : db
          .from("gmail_connections")
          .select("user_id, gmail_email, google_account_id, status")
          .neq("status", "DISCONNECTED")
          .eq("google_account_id", identity.googleAccountId);

  const [emailClaimResult, googleClaimResult] = await Promise.all([
    emailClaimQuery,
    googleAccountQuery,
  ]);
  const { data: emailClaims, error: emailClaimError } = emailClaimResult;
  const { data: googleClaims, error: googleClaimError } = googleClaimResult;

  if (emailClaimError || googleClaimError) {
    emitProductEvent({
      type: "gmail.connect_failed",
      step: "connection",
      errorCode: emailClaimError?.code ?? googleClaimError?.code ?? "persist",
    });
    throw new GmailConnectError("persist", "Failed to persist Gmail connection");
  }

  const claims = [
    ...((emailClaims ?? []) as GmailMailboxClaim[]),
    ...((googleClaims ?? []) as GmailMailboxClaim[]),
  ];
  if (isGmailMailboxClaimedByAnotherUser(userId, identity, claims)) {
    try {
      await revokeRefreshToken(tokens.refreshToken);
    } catch {
      // Do not store the grant even if Google revoke fails.
    }
    emitProductEvent({
      type: "gmail.connect_failed",
      step: "connection",
      errorCode: "mailbox_in_use",
    });
    throw new GmailConnectError("mailbox_in_use", GMAIL_MAILBOX_IN_USE_MESSAGE);
  }

  const { data, error } = await db
    .from("gmail_connections")
    .upsert(
      {
        user_id: userId,
        gmail_email: identity.email,
        google_account_id: identity.googleAccountId,
        encrypted_refresh_token: encryptedRefreshToken,
        status: "CONNECTED",
      },
      { onConflict: "user_id,gmail_email" },
    )
    .select(
      "id, user_id, gmail_email, google_account_id, status, last_successful_scan_at, next_scan_at",
    )
    .single();

  if (error || !data) {
    if (error && isGmailMailboxUniqueViolation(error)) {
      emitProductEvent({
        type: "gmail.connect_failed",
        step: "connection",
        errorCode: "mailbox_in_use",
      });
      throw new GmailConnectError("mailbox_in_use", GMAIL_MAILBOX_IN_USE_MESSAGE);
    }
    emitProductEvent({
      type: "gmail.connect_failed",
      step: "connection",
      errorCode: error?.code ?? "persist",
    });
    throw new GmailConnectError("persist", "Failed to persist Gmail connection");
  }

  const row = data as ConnectionRow;

  emitProductEvent({ type: "gmail.connected", connectionId: row.id });
  return {
    connection: toPublicConnection(row),
    runPostConnectSetup: () =>
      runGmailPostConnectSetup({
        userId,
        connectionId: row.id,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        nextScanAt: row.next_scan_at,
      }),
  };
}

/** Disconnect, then delete stored threads, actions, History, and scan rows. */
export async function disconnectGmailAndClearAnalysis(
  userId: string,
  deps: {
    disconnect: (userId: string) => Promise<void>;
    purge: (userId: string) => Promise<void>;
  },
): Promise<void> {
  await deps.disconnect(userId);
  await deps.purge(userId);
}

export async function disconnectGmailForUser(userId: string): Promise<void> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("gmail_connections")
    .select("id, encrypted_refresh_token")
    .eq("user_id", userId)
    .neq("status", "DISCONNECTED")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error("Failed to load Gmail connection for disconnect");
  }

  const rows = (data ?? []) as Array<{ id: string; encrypted_refresh_token: string | null }>;
  if (rows.length === 0) {
    return;
  }

  let currentKey: string | null = null;
  let previousKey: string | undefined;
  try {
    const env = getGmailEnv();
    currentKey = env.TOKEN_ENCRYPTION_KEY;
    previousKey = env.TOKEN_ENCRYPTION_PREVIOUS_KEY;
  } catch {
    currentKey = null;
  }

  for (const row of rows) {
    if (row.encrypted_refresh_token && currentKey) {
      try {
        const refreshToken = unwrapSecretWithRotation(
          row.encrypted_refresh_token,
          currentKey,
          previousKey,
        ).plaintext;
        await revokeRefreshToken(refreshToken);
      } catch {
        // Still mark disconnected locally if Google revoke fails.
      }
    }

    const { error: updateError } = await db
      .from("gmail_connections")
      .update({
        status: "DISCONNECTED",
        encrypted_refresh_token: null,
        next_scan_at: null,
        locked_at: null,
        locked_by: null,
        lease_expires_at: null,
      })
      .eq("id", row.id);

    if (updateError) {
      throw new Error("Failed to disconnect Gmail");
    }

    await cancelActiveJobsForConnection(row.id, "gmail_disconnected");
  }
  emitProductEvent({ type: "gmail.disconnected" });
}

export function gmailCallbackErrorRedirect(
  origin: string,
  reason: string,
  returnTo = "/onboarding",
): URL {
  const url = new URL(returnTo, origin);
  url.searchParams.set("gmail", "error");
  url.searchParams.set("reason", reason);
  return url;
}
