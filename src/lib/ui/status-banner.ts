export type AppBannerKind = "info" | "warning" | "error";

export interface AppBanner {
  kind: AppBannerKind;
  title: string;
  body: string;
  href?: string;
  actionLabel?: string;
}

function connectHref(returnTo: string): string {
  return `/api/gmail/connect?returnTo=${encodeURIComponent(returnTo)}`;
}

export function appStatusBanner(input: {
  connectionStatus: string | null;
  scanStatus: string | null;
  errorCode?: string | null;
  suppressRunning?: boolean;
  returnTo?: string;
}): AppBanner | null {
  const reconnect = connectHref(input.returnTo ?? "/dashboard");
  if (input.connectionStatus === "REAUTH_REQUIRED") {
    return {
      kind: "warning",
      title: "Your Gmail connection needs to be refreshed.",
      body: "Reconnect Gmail to continue scanning. Your existing summaries were kept.",
      href: reconnect,
      actionLabel: "Reconnect Gmail",
    };
  }
  if (input.connectionStatus === "ERROR") {
    return {
      kind: "error",
      title: "Gmail connection error",
      body: "Reconnect to repair the connection. Your existing summaries were not deleted.",
      href: reconnect,
      actionLabel: "Reconnect Gmail",
    };
  }
  if (input.scanStatus === "FAILED") {
    if (input.errorCode === "reauth_required") {
      return {
        kind: "warning",
        title: "Your Gmail connection needs to be refreshed.",
        body: "Reconnect Gmail to continue scanning. Your existing summaries were kept.",
        href: reconnect,
        actionLabel: "Reconnect Gmail",
      };
    }
    if (input.errorCode === "gmail_quota") {
      return {
        kind: "error",
        title: "Gmail quota paused this scan.",
        body: "Wait a minute and try a shorter lookback. Your existing summaries were kept.",
        href: "/scan",
        actionLabel: "Try a shorter lookback",
      };
    }
    if (input.errorCode === "ai_unavailable") {
      return {
        kind: "error",
        title: "Email analysis is temporarily unavailable.",
        body: "Try again in a few minutes. Your existing summaries were kept.",
        href: "/scan",
        actionLabel: "Try again",
      };
    }
    if (input.errorCode === "cancelled") {
      return {
        kind: "info",
        title: "Scan stopped.",
        body: "Already-checked conversations were kept. You can start a new scan when you want.",
        href: "/scan",
        actionLabel: "Scan again",
      };
    }
    return {
      kind: "error",
      title: "The last scan failed.",
      body: "Try Scan now on the Scan tab. Your existing summaries were kept.",
      href: "/scan",
      actionLabel: "Scan again",
    };
  }
  if (input.scanStatus === "PARTIAL") {
    return {
      kind: "warning",
      title: "Most emails were processed, but a few could not be analyzed.",
      body: "The system will retry them.",
      href: "/mail",
      actionLabel: "View mail",
    };
  }
  if (input.scanStatus === "RUNNING" && !input.suppressRunning) {
    return {
      kind: "info",
      title: "A scan is running.",
      body: "You can keep using MailPriority while it works.",
      href: "/scan",
      actionLabel: "Open scan",
    };
  }
  return null;
}
