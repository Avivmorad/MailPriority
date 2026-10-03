export const TERMS_SECTIONS = [
  {
    id: "the-service",
    title: "The service",
    body: "MailPriority is an inbox triage product. After you create an account and connect Gmail, MailPriority can scan a window of mail you choose, classify threads, apply Gmail labels under the MailPriority/ prefix, and show actions, pending items, and the History screen. MailPriority does not send, delete, or archive mail for you.",
  },
  {
    id: "your-account",
    title: "Your account",
    body: "You must only connect a Gmail account you are allowed to access. You are responsible for keeping your MailPriority login safe and for how you use the summaries and labels MailPriority creates. You can disconnect Gmail (which removes stored analysis from MailPriority), delete stored analysis data while staying connected, or delete your MailPriority account in Settings. MailPriority does not publish a support email address.",
  },
  {
    id: "limitations",
    title: "Limitations",
    body: "Classifications and action cards are machine-generated and can be wrong. MailPriority is provided as the current product works; scheduled scans and AI calls can fail, be delayed, or be incomplete. Daily scans are best-effort once a day. The current host schedule attempts that run at 06:00 UTC. A time saved in Settings is not a promise that MailPriority will run at that local time. Scan now still runs when you start it. Do not rely on MailPriority as the only record of important mail.",
  },
  {
    id: "processors",
    title: "Classification processors",
    body: "Thread text sent for classification goes to NVIDIA Build when an NVIDIA API key is configured, and otherwise to Google Gemini. Both NVIDIA Build and Google Gemini are part of the product. A deployment calls only the provider that key selects.",
  },
  {
    id: "google",
    title: "Google",
    body: "MailPriority is not affiliated with Google. Connecting Gmail is also subject to Google’s terms and privacy policy. MailPriority requests only the gmail.modify scope so it can read threads and apply labels.",
  },
] as const;
