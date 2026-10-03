import { randomBytes } from "node:crypto";

import { google } from "googleapis";

import { getGmailEnv } from "@/lib/config/env";
import { GMAIL_MODIFY_SCOPE } from "@/lib/gmail/constants";
import { emitProductEvent } from "@/lib/observability/events";
import { GMAIL_UNITS } from "@/lib/gmail/quota";
import { GMAIL_CONNECT_RETRY_DELAYS_MS, withGmailRetry } from "@/lib/gmail/retry";
import {
  GMAIL_REQUEST_TIMEOUT_MS,
  withGmailRequest,
  type GmailRequestBudget,
} from "@/lib/gmail/request-budget";
import { timingSafeStringEqual } from "@/lib/security/encryption";

export class GmailConnectError extends Error {
  constructor(
    readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = "GmailConnectError";
  }
}

export function createOAuth2Client() {
  const env = getGmailEnv();
  const client = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI,
  );
  client.transporter.defaults.timeout = GMAIL_REQUEST_TIMEOUT_MS;
  return client;
}

/** Token requests do not accept per-call options; bound their transporter too. */
export async function withGmailOAuthRequest<T>(
  client: ReturnType<typeof createOAuth2Client>,
  operation: () => Promise<T>,
  budget: GmailRequestBudget = {},
): Promise<T> {
  const previousSignal = client.transporter.defaults.signal;
  const previousTimeout = client.transporter.defaults.timeout;
  try {
    return await withGmailRequest((options) => {
      client.transporter.defaults.signal = options.signal;
      client.transporter.defaults.timeout = options.timeout;
      return operation();
    }, budget);
  } finally {
    client.transporter.defaults.signal = previousSignal;
    client.transporter.defaults.timeout = previousTimeout;
  }
}

export function createOAuthState(): string {
  return randomBytes(32).toString("hex");
}

export function buildConsentUrl(state: string): string {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: [GMAIL_MODIFY_SCOPE],
    state,
  });
}

export function isValidOAuthState(
  expected: string | undefined,
  received: string | undefined,
): boolean {
  if (!expected || !received) {
    return false;
  }
  return timingSafeStringEqual(expected, received);
}

export interface GoogleTokenSet {
  accessToken: string;
  refreshToken: string;
  expiryDate: number | null;
}

export async function exchangeAuthorizationCode(code: string): Promise<GoogleTokenSet> {
  const client = createOAuth2Client();
  try {
    const { tokens } = await withGmailOAuthRequest(client, () => client.getToken(code));
    if (!tokens.access_token) {
      throw new GmailConnectError(
        "token_exchange",
        "Google token exchange returned no access token",
      );
    }
    if (!tokens.refresh_token) {
      throw new GmailConnectError("no_refresh_token", "NO_REFRESH_TOKEN");
    }
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiryDate: tokens.expiry_date ?? null,
    };
  } catch (err) {
    if (err instanceof GmailConnectError) {
      throw err;
    }
    throw new GmailConnectError("token_exchange", "Google token exchange failed");
  }
}

/**
 * Identity comes from the Gmail API (covered by gmail.modify).
 * We do not call oauth2.userinfo — that requires extra scopes the spec forbids.
 */
export async function fetchGmailIdentity(
  accessToken: string,
  refreshToken: string,
  options: { delaysMs?: number[] } = {},
): Promise<{ email: string; googleAccountId: string | null }> {
  const client = createOAuth2Client();
  client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });

  const gmail = google.gmail({ version: "v1", auth: client });
  try {
    const profile = await withGmailRetry(
      (retryOptions) => gmail.users.getProfile({ userId: "me" }, retryOptions),
      {
        units: GMAIL_UNITS.getProfile,
        delaysMs: options.delaysMs ?? GMAIL_CONNECT_RETRY_DELAYS_MS,
      },
    );
    const email = profile.data.emailAddress;
    if (!email) {
      throw new GmailConnectError(
        "gmail_profile",
        "Gmail profile did not include an email address",
      );
    }
    return { email, googleAccountId: null };
  } catch (err) {
    if (err instanceof GmailConnectError) {
      throw err;
    }
    const status = googleErrorStatus(err);
    emitProductEvent({
      type: "gmail.connect_failed",
      step: "profile",
      errorCode: status ? String(status) : "gmail_api",
    });
    throw new GmailConnectError(
      "gmail_api",
      "Gmail API profile lookup failed. Enable the Gmail API in Google Cloud.",
    );
  }
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const client = createOAuth2Client();
  await withGmailOAuthRequest(client, () => client.revokeToken(refreshToken));
}

function googleErrorStatus(err: unknown): number | null {
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status?: unknown }).status;
    return typeof status === "number" ? status : null;
  }
  return null;
}
