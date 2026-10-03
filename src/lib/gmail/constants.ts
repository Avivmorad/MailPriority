export const GMAIL_MODIFY_SCOPE = "https://www.googleapis.com/auth/gmail.modify";

export const GMAIL_OAUTH_STATE_COOKIE = "gmail_oauth_state";
export const GMAIL_OAUTH_RETURN_COOKIE = "gmail_oauth_return";

export const GMAIL_CONNECTION_STATUSES = [
  "CONNECTED",
  "REAUTH_REQUIRED",
  "DISCONNECTED",
  "ERROR",
] as const;

export type GmailConnectionStatus = (typeof GMAIL_CONNECTION_STATUSES)[number];

/**
 * Gmail prefix for managed labels (docs/PRODUCT.md). The repository name stays
 * MailPilot; only these Gmail label names use MailPriority/.
 */
export const GMAIL_MANAGED_LABEL_PREFIX = "MailPriority/" as const;

/** Previous managed prefix. Renamed in place so existing threads keep the label id. */
export const LEGACY_GMAIL_MANAGED_LABEL_PREFIX = "MailPilot/" as const;

/**
 * Product-facing managed labels (docs/PRODUCT.md).
 * Ensured after Connect Gmail (async post-redirect) and on scan if missing
 * or still stored under the legacy prefix. Mapping stored in gmail_labels.
 * The export name matches the repository, not the Gmail prefix.
 */
export const MAILPILOT_LABELS = [
  { logicalName: "important", gmailLabelName: `${GMAIL_MANAGED_LABEL_PREFIX}Important` },
  {
    logicalName: "action_required",
    gmailLabelName: `${GMAIL_MANAGED_LABEL_PREFIX}Action Required`,
  },
  { logicalName: "low_priority", gmailLabelName: `${GMAIL_MANAGED_LABEL_PREFIX}Low Priority` },
  { logicalName: "processed", gmailLabelName: `${GMAIL_MANAGED_LABEL_PREFIX}Processed` },
] as const;

export function legacyGmailLabelName(currentName: string): string | null {
  if (!currentName.startsWith(GMAIL_MANAGED_LABEL_PREFIX)) {
    return null;
  }
  return `${LEGACY_GMAIL_MANAGED_LABEL_PREFIX}${currentName.slice(GMAIL_MANAGED_LABEL_PREFIX.length)}`;
}

/** True when a stored row already uses the current MailPriority/ name for that logical label. */
export function isStoredManagedLabelCurrent(logicalName: string, gmailLabelName: string): boolean {
  return MAILPILOT_LABELS.some(
    (spec) => spec.logicalName === logicalName && spec.gmailLabelName === gmailLabelName,
  );
}

export type MailPilotLogicalLabel = (typeof MAILPILOT_LABELS)[number]["logicalName"];

export interface GmailConnectionPublic {
  id: string;
  gmailEmail: string;
  status: GmailConnectionStatus;
  lastSuccessfulScanAt: string | null;
  nextScanAt: string | null;
}

export interface GmailStatusPayload {
  configured: boolean;
  connection: GmailConnectionPublic | null;
  /** User-safe explanation when status could not be loaded. Never includes secrets. */
  loadError: string | null;
}
