export const GMAIL_MODIFY_SCOPE = "https://www.googleapis.com/auth/gmail.modify";

export const PRIVACY_POLICY_SECTIONS = [
  {
    id: "what-mailpilot-is",
    title: "What MailPriority is",
    body: "MailPriority is an inbox triage product. You create a MailPriority login, connect your own Gmail account, and MailPriority scans a window of mail you choose. It classifies threads, applies Gmail labels under the MailPriority/ prefix, and shows actions, pending items, and the History screen. MailPriority does not send, delete, or archive mail for you.",
  },
  {
    id: "gmail-access",
    title: "How MailPriority uses Gmail",
    body: `MailPriority requests the Gmail scope ${GMAIL_MODIFY_SCOPE}. That is the minimum scope that can both read threads and apply labels. MailPriority creates labels in the MailPriority/ namespace if they are missing. When older MailPilot/ labels from MailPriority are still in Gmail, it renames those managed labels to MailPriority/ so the same threads stay labeled. It does not rename or delete your other labels. Refresh tokens are encrypted at rest and are never sent to the browser.`,
  },
  {
    id: "what-we-store",
    title: "What MailPriority stores",
    body: "MailPriority stores thread and message metadata (ids, headers, timestamps, direction), attachment filenames and types without the file bytes, AI summaries and action cards, scan history, History entries, and your triage settings. Classification calls also store token counts and a priced estimate per call, with no message content. It does not persist full email bodies long-term. History stays in the app; MailPriority does not email you a summary.",
  },
  {
    id: "retention",
    title: "How long MailPriority keeps data",
    body: "MailPriority keeps your account, triage settings, and analysis data until you disconnect Gmail or delete them. Analysis data means stored threads, message metadata (subjects, snippets, headers, and timestamps), attachment filenames and types without the file bytes, action cards, classification feedback, History entries, scan history, and classification token counts. Full email bodies are not stored, and MailPriority does not delete the messages in Gmail. Disconnecting Gmail revokes access when Google accepts the revoke and removes that analysis data. MailPriority/ labels already applied in Gmail stay there. Delete analysis data removes that analysis data, stops a scan that is still running, and clears the Gmail history checkpoint and last successful scan time. Gmail stays connected, and the MailPriority login stays. Delete account does that same analysis deletion, disconnects Gmail and revokes access when Google accepts the revoke, then removes the MailPriority login and the data tied to it.",
  },
  {
    id: "your-controls",
    title: "Your controls",
    body: "In Settings you can disconnect Gmail (stops scanning and removes stored threads, messages, actions, History entries, scans, and classification usage; messages in Gmail stay), delete analysis data (the same stored mail, while Gmail stays connected), or delete your MailPriority account (revokes Gmail when possible and removes the login). You can also disconnect MailPriority from your Google account permissions.",
  },
  {
    id: "support",
    title: "Support",
    body: "MailPriority does not publish a support email address. While you are signed in, Settings is where you disconnect Gmail, delete analysis data, or delete your account.",
  },
  {
    id: "limited-use",
    title: "Limited Use of Gmail data",
    body: "MailPriority uses Gmail data only to provide or improve the user-facing features in the product: classification, MailPriority/ labels, actions, pending items, and the History screen. It does not sell Gmail data, use it for advertising, or transfer it to other parties except processors needed to run the product: Vercel for hosting, Supabase for the account and database, and one classification provider. Classification sends thread text to NVIDIA Build when an NVIDIA API key is configured, and otherwise to Google Gemini. Both NVIDIA Build and Google Gemini are part of the product; a deployment calls only the provider that key selects. Humans do not read your mail as a product feature. A public launch still requires Google OAuth verification for gmail.modify and, because MailPriority stores and transmits Gmail data on servers, Google’s restricted-scope security assessment (CASA) when Google requires it.",
  },
  {
    id: "google",
    title: "Google",
    body: "MailPriority is not affiliated with Google. Use of Gmail is subject to Google’s terms and privacy policy. Limited test users can connect Gmail before Google OAuth verification. This privacy page and the terms page are the URLs to put on the Google Cloud OAuth consent screen.",
  },
] as const;
