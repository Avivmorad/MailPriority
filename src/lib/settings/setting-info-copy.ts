/**
 * Short explanations for Settings controls. Wording follows docs/PRODUCT.md
 * and the privacy page: what each control does, without new behavior.
 */

export const VIP_SENDERS_LABEL = "VIP senders";
export const IGNORE_SENDERS_DOMAINS_LABEL = "Ignore senders & domains";
export const CUSTOM_TRIAGE_INSTRUCTIONS_LABEL = "Custom triage instructions";
export const HISTORY_AFTER_SCAN_LABEL =
  "Add an entry to History after each successful or partial scan";
export const SAVE_TRIAGE_LABEL = "Save triage settings";
export const UPDATE_NOW_LABEL = "Update Now";
export const SCAN_TIME_LABEL = "Time";
export const SCAN_TIMEZONE_LABEL = "Timezone";
export const SAVE_SCHEDULE_LABEL = "Save schedule";
export const DELETE_ANALYSIS_LABEL = "Delete analysis data";
export const DELETE_ACCOUNT_LABEL = "Delete MailPriority account";
export const CONNECT_GMAIL_LABEL = "Connect Gmail";
export const RECONNECT_GMAIL_LABEL = "Reconnect Gmail";
export const RECONNECT_LABEL = "Reconnect";
export const DISCONNECT_GMAIL_LABEL = "Disconnect Gmail";
export const SCAN_HISTORY_LABEL = "Scan history";

export const VIP_SENDERS_INFO =
  "These addresses are treated as VIP when mail is classified. Save, then use Update Now or wait for the next scan to apply.";

export const IGNORE_SENDERS_DOMAINS_INFO =
  "Matching sender addresses and matching domains are ignored on the next apply, except security or account-access mail. Save, then use Update Now or wait for the next scan.";

export const CUSTOM_TRIAGE_INSTRUCTIONS_INFO =
  "These instructions are your triage settings (up to 4000 characters), not text taken from email. They apply on the next scan, or when you use Update Now.";

export const HISTORY_AFTER_SCAN_INFO =
  "Writes a History entry in the app after a scan finishes as success or partial. MailPriority does not email a digest.";

export const SAVE_TRIAGE_INFO =
  "Saves VIP, ignore, instruction, and History choices without starting a scan.";

export const UPDATE_NOW_INFO =
  "Saves these settings, then scans the last 7 days and reclassifies threads whose triage rules changed. It does not scan your whole mailbox or send, delete, or archive mail.";

export const SCAN_TIME_INFO =
  "Saved with your settings. Daily scans are best-effort and are attempted at 06:00 UTC, not at this local time.";

export const SCAN_TIMEZONE_INFO =
  "Saved with your settings. It does not set when the daily scan runs.";

export const SAVE_SCHEDULE_INFO =
  "Stores this time and timezone. It does not start a scan or change when the daily scan runs.";

export const DELETE_ANALYSIS_INFO =
  "Removes stored messages, threads, actions, History, scan history, and classification usage, and stops a running scan. Gmail stays connected, and messages in Gmail are not deleted.";

export const DELETE_ACCOUNT_INFO =
  "Removes stored analysis data, disconnects Gmail when Google accepts the revoke, then removes your MailPriority login.";

export const CONNECT_GMAIL_INFO =
  "Connects this inbox so MailPriority can scan a window you choose and apply MailPriority/ labels. MailPriority never sends, deletes, or archives mail for you.";

export const RECONNECT_GMAIL_INFO =
  "Repairs Gmail access so scanning can continue. Existing summaries are not deleted.";

export const DISCONNECT_GMAIL_INFO =
  "Stops scanning and removes stored mail from MailPriority. Messages in Gmail stay.";

export const SCAN_HISTORY_INFO =
  "Recent manual and scheduled scan runs for this mailbox. This list is separate from History entries.";

/** Accessible name for the info icon next to a settings label. */
export function settingInfoButtonName(label: string): string {
  return `About ${label}`;
}
