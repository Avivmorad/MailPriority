import type { ReactNode } from "react";

import { DisconnectGmailButton } from "@/components/gmail/disconnect-gmail-button";
import { SettingInfo } from "@/components/settings/setting-info";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { GmailStatusPayload } from "@/lib/gmail/constants";
import {
  CONNECT_GMAIL_INFO,
  CONNECT_GMAIL_LABEL,
  DISCONNECT_GMAIL_INFO,
  DISCONNECT_GMAIL_LABEL,
  RECONNECT_GMAIL_INFO,
  RECONNECT_GMAIL_LABEL,
  RECONNECT_LABEL,
} from "@/lib/settings/setting-info-copy";

function ControlWithInfo({
  showInfo,
  label,
  description,
  children,
}: {
  showInfo: boolean;
  label: string;
  description: string;
  children: ReactNode;
}) {
  if (!showInfo) {
    return children;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      {children}
      <SettingInfo label={label} description={description} />
    </span>
  );
}

function flashMessage(
  gmail: string | undefined,
  reason: string | undefined,
): {
  kind: "ok" | "error";
  text: string;
} | null {
  if (gmail === "connected") {
    return { kind: "ok", text: "Gmail connected. MailPriority labels are ready in your mailbox." };
  }
  if (gmail === "disconnected") {
    return { kind: "ok", text: "Gmail disconnected. Stored mail was removed from MailPriority." };
  }
  if (gmail !== "error") {
    return null;
  }

  const messages: Record<string, string> = {
    not_configured:
      "Gmail OAuth is not configured. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, and TOKEN_ENCRYPTION_KEY to .env.local.",
    denied: "Gmail access was not granted. You can try connecting again.",
    invalid_state: "The Gmail connection request expired. Please try again.",
    not_signed_in: "Sign in to MailPriority, then connect Gmail.",
    missing_code: "Google did not return an authorization code. Please try again.",
    no_refresh_token:
      "Google did not return a refresh token. Remove MailPriority from your Google account permissions and connect again.",
    gmail_api:
      "Gmail API is not enabled (or profile lookup failed). In Google Cloud enable Gmail API, wait a minute, then try Connect Gmail again.",
    gmail_profile: "Google did not return a Gmail address for this account.",
    persist:
      "Could not save the Gmail connection. Apply supabase/migrations/0002_gmail_connections.sql in the SQL Editor, then try again.",
    mailbox_in_use:
      "This Gmail inbox is already connected to another MailPriority account. Disconnect it there first, then try again.",
    encryption_key:
      "TOKEN_ENCRYPTION_KEY is invalid. It must be 64 hex characters from `openssl rand -hex 32`. Update .env.local and restart.",
    token_exchange: "Google token exchange failed. Try Connect Gmail again.",
    connect_failed: "Gmail could not be connected. Please try again.",
    disconnect_failed: "Gmail could not be disconnected. Please try again.",
    invalid_request: "The Gmail callback was invalid. Please try again.",
  };

  return {
    kind: "error",
    text: messages[reason ?? ""] ?? "Gmail connection needs attention. Please try again.",
  };
}

function statusCopy(status: GmailStatusPayload): { title: string; body: string } {
  if (status.loadError) {
    return {
      title: "Could not load Gmail status",
      body: status.loadError,
    };
  }

  if (!status.configured) {
    return {
      title: "Gmail is not configured yet",
      body: "Add the Google OAuth values to .env.local, then restart the dev server.",
    };
  }

  const connection = status.connection;
  if (!connection || connection.status === "DISCONNECTED") {
    return {
      title: "Connect Gmail",
      body: "Connect Gmail to scan up to the last month. You choose the window. MailPriority never sends mail for you.",
    };
  }

  if (connection.status === "REAUTH_REQUIRED") {
    return {
      title: "Gmail connection expired",
      body: "Reconnect Gmail to continue scanning. Your existing summaries were not deleted.",
    };
  }

  if (connection.status === "ERROR") {
    return {
      title: "Gmail connection error",
      body: `Connected account: ${connection.gmailEmail}. Reconnect to repair the connection.`,
    };
  }

  return {
    title: "Gmail connected",
    body: `Connected as ${connection.gmailEmail}. MailPriority labels are managed automatically.`,
  };
}

export function GmailConnectionCard({
  status,
  gmailFlash,
  reason,
  returnTo = "/settings",
  withSettingInfo = false,
}: {
  status: GmailStatusPayload;
  gmailFlash?: string;
  reason?: string;
  returnTo?: string;
  /** Settings-only info icons. Other pages keep the actions unlabeled. */
  withSettingInfo?: boolean;
}) {
  const connectHref = `/api/gmail/connect?returnTo=${encodeURIComponent(returnTo)}`;
  const copy = statusCopy(status);
  const flash = flashMessage(gmailFlash, reason);
  const connection = status.connection;
  const isActive = connection?.status === "CONNECTED";
  const needsReconnect = connection?.status === "REAUTH_REQUIRED" || connection?.status === "ERROR";
  const canDisconnect = Boolean(connection) && connection?.status !== "DISCONNECTED";
  const canConnect = status.configured && !status.loadError;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
        <CardDescription>{copy.body}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {flash ? (
          <p
            className={flash.kind === "error" ? "text-destructive text-sm" : "text-sm"}
            role={flash.kind === "error" ? "alert" : "status"}
          >
            {flash.text}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {canConnect && !isActive ? (
            <ControlWithInfo
              showInfo={withSettingInfo}
              label={needsReconnect ? RECONNECT_GMAIL_LABEL : CONNECT_GMAIL_LABEL}
              description={needsReconnect ? RECONNECT_GMAIL_INFO : CONNECT_GMAIL_INFO}
            >
              <a href={connectHref} className={buttonVariants()}>
                {needsReconnect ? RECONNECT_GMAIL_LABEL : CONNECT_GMAIL_LABEL}
              </a>
            </ControlWithInfo>
          ) : null}

          {canConnect && isActive ? (
            <ControlWithInfo
              showInfo={withSettingInfo}
              label={RECONNECT_LABEL}
              description={RECONNECT_GMAIL_INFO}
            >
              <a href={connectHref} className={buttonVariants({ variant: "outline" })}>
                {RECONNECT_LABEL}
              </a>
            </ControlWithInfo>
          ) : null}

          {canConnect && canDisconnect ? (
            <ControlWithInfo
              showInfo={withSettingInfo}
              label={DISCONNECT_GMAIL_LABEL}
              description={DISCONNECT_GMAIL_INFO}
            >
              <DisconnectGmailButton returnTo={returnTo} />
            </ControlWithInfo>
          ) : null}

          {!canConnect ? (
            <ControlWithInfo
              showInfo={withSettingInfo}
              label={CONNECT_GMAIL_LABEL}
              description={CONNECT_GMAIL_INFO}
            >
              <Button type="button" disabled>
                {CONNECT_GMAIL_LABEL}
              </Button>
            </ControlWithInfo>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
