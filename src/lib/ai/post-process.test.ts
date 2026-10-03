import { describe, expect, it } from "vitest";

import {
  assertThreadAnalysisInvariants,
  confidenceBand,
  postProcessThreadAnalysis,
} from "@/lib/ai/post-process";
import type { ThreadAnalysis } from "@/lib/ai/schemas";

function analysis(overrides: Partial<ThreadAnalysis> = {}): ThreadAnalysis {
  return {
    summary: "סיכום",
    importance: "medium",
    importance_reason: "reason",
    status: "informational",
    requires_action: false,
    requires_reply: false,
    action_type: "none",
    action_summary: null,
    action_reason: null,
    waiting_for: null,
    waiting_since: null,
    urgency: "normal",
    deadline: null,
    deadline_text: null,
    category: "other",
    sender_name: null,
    organization: null,
    confidence: 0.9,
    short_display_title: "כותרת",
    ...overrides,
  };
}

describe("postProcessThreadAnalysis", () => {
  it("enforces Rule A for action_required", () => {
    const processed = postProcessThreadAnalysis(
      analysis({
        status: "action_required",
        requires_action: false,
        action_type: "review",
        action_summary: null,
      }),
    );

    expect(processed.requires_action).toBe(true);
    expect(processed.action_summary).toBe("Review this email");
    expect(() => assertThreadAnalysisInvariants(processed)).not.toThrow();
  });

  it("stores English Do and Why copy when the model wrote them in Hebrew", () => {
    const processed = postProcessThreadAnalysis(
      analysis({
        status: "action_required",
        requires_action: true,
        action_type: "pay",
        category: "finance",
        action_summary: "שלם את החשבונית",
        action_reason: "נותר תשלום",
        importance_reason: "חשבונית פתוחה",
        summary: "סיכום",
        short_display_title: "חשבונית",
      }),
    );

    expect(processed.status).toBe("action_required");
    expect(processed.action_type).toBe("pay");
    expect(processed.requires_action).toBe(true);
    expect(processed.action_summary).toBe("Pay the charge");
    expect(processed.action_reason).toBeNull();
    expect(processed.importance_reason).toBe("Needs a quick look");
    expect(processed.summary).toBe("סיכום");
    expect(processed.short_display_title).toBe("חשבונית");
  });

  it("replaces literal nullish user-facing strings with usable fallbacks", () => {
    const processed = postProcessThreadAnalysis(
      analysis({
        summary: "null",
        short_display_title: "undefined",
        importance_reason: "null",
        action_summary: "null",
        status: "informational",
      }),
      { latestSubject: "Quarterly invoice" },
    );

    expect(processed.summary).toBe("Quarterly invoice");
    expect(processed.short_display_title).toBe("Quarterly invoice");
    expect(processed.importance_reason).toBe("Needs a quick look");
    expect(processed.action_summary).toBeNull();
  });

  it("enforces Rule B for waiting", () => {
    const processed = postProcessThreadAnalysis(
      analysis({
        status: "waiting",
        requires_action: true,
        action_type: "reply",
        waiting_for: null,
      }),
    );

    expect(processed.requires_action).toBe(false);
    expect(processed.action_type).toBe("none");
    expect(processed.waiting_for).toBe("the other party");
  });

  it("enforces Rule C for requires_reply", () => {
    const processed = postProcessThreadAnalysis(
      analysis({
        requires_reply: true,
        requires_action: false,
        action_type: "review",
        status: "action_required",
        action_summary: "השב",
      }),
    );

    expect(processed.requires_action).toBe(true);
    expect(processed.action_type).toBe("reply");
  });

  it("drops invented or invalid deadlines (Rule D)", () => {
    const processed = postProcessThreadAnalysis(analysis({ deadline: "tomorrow" }));
    expect(processed.deadline).toBeNull();
    expect(postProcessThreadAnalysis(analysis({ deadline: "2026-02-30" })).deadline).toBeNull();
    expect(postProcessThreadAnalysis(analysis({ deadline: "2026-09-18" })).deadline).toBe(
      "2026-09-18",
    );
  });

  it("drops a well-formed deadline that is not grounded in the thread text", () => {
    const processed = postProcessThreadAnalysis(analysis({ deadline: "1999-01-01" }), {
      threadText: "Please reply with the Q3 numbers today.",
    });
    expect(processed.deadline).toBeNull();
  });

  it("clamps confidence (Rule E)", () => {
    expect(postProcessThreadAnalysis(analysis({ confidence: 1.4 })).confidence).toBe(1);
    expect(postProcessThreadAnalysis(analysis({ confidence: -0.2 })).confidence).toBe(0);
  });

  it("applies VIP and ignore sender overrides", () => {
    const ignored = postProcessThreadAnalysis(
      analysis({
        importance: "medium",
        category: "other",
        requires_reply: true,
        requires_action: true,
        action_type: "reply",
        status: "action_required",
      }),
      {
        latestFrom: "Ada <noise@example.com>",
        preferences: { ignoreSenders: ["noise@example.com"] },
      },
    );
    expect(ignored.status).toBe("ignore");
    expect(ignored.importance).toBe("low");
    expect(ignored.requires_reply).toBe(false);
    expect(ignored.requires_action).toBe(false);

    const vip = postProcessThreadAnalysis(analysis({ importance: "low" }), {
      latestFrom: "vip@example.com",
      preferences: { vipSenders: ["vip@example.com"] },
    });
    expect(vip.importance).toBe("medium");

    const vipHigh = postProcessThreadAnalysis(analysis({ importance: "low" }), {
      latestFrom: "vip@example.com",
      preferences: { vipSenders: ["vip@example.com"], vipAlwaysHigh: true },
    });
    expect(vipHigh.importance).toBe("high");
  });

  it("ignores matching sender domains unless the mail is a security action", () => {
    const ignored = postProcessThreadAnalysis(
      analysis({ importance: "medium", category: "other" }),
      {
        latestFrom: "promo@news.example.com",
        preferences: { ignoreDomains: ["example.com"] },
      },
    );
    expect(ignored.status).toBe("ignore");

    const security = postProcessThreadAnalysis(
      analysis({
        category: "security",
        importance: "high",
        status: "action_required",
        requires_action: true,
        action_type: "review",
        action_summary: "Review the new device login",
      }),
      {
        latestFrom: "alerts@example.com",
        latestSubject: "Google security alert: new device login",
        preferences: { ignoreDomains: ["example.com"] },
      },
    );
    expect(security.status).toBe("action_required");
  });

  it("does not ignore a critical account message", () => {
    const processed = postProcessThreadAnalysis(
      analysis({
        category: "security",
        importance: "high",
        status: "action_required",
        requires_action: true,
        action_type: "review",
        action_summary: "אבטח את החשבון",
      }),
      {
        latestFrom: "alerts@example.com",
        preferences: { ignoreSenders: ["alerts@example.com"] },
      },
    );
    expect(processed.status).toBe("action_required");
    expect(processed.importance).toBe("high");
  });

  it("ignores Link verification codes", () => {
    const processed = postProcessThreadAnalysis(
      analysis({
        status: "action_required",
        requires_action: true,
        action_summary: "Enter the code",
        summary: "Your Link verification code: 866 465",
      }),
      { latestSubject: "Your Link verification code: 866 465" },
    );
    expect(processed.status).toBe("ignore");
    expect(processed.requires_action).toBe(false);
  });

  it("downgrades OTP mail so it is never an open task", () => {
    const processed = postProcessThreadAnalysis(
      analysis({
        status: "action_required",
        requires_action: true,
        action_type: "other",
        action_summary: "הזן את הקוד",
        short_display_title: "קוד אימות",
        summary: "הזן את קוד האימות 5827 באתר ג'ובנט",
      }),
      { latestSubject: "קוד אימות" },
    );
    expect(processed.status).toBe("ignore");
    expect(processed.requires_action).toBe(false);
  });

  it("keeps login and Google security alerts as Open", () => {
    const processed = postProcessThreadAnalysis(
      analysis({
        status: "informational",
        requires_action: false,
        importance: "medium",
        category: "accounts_subscriptions",
        summary: "Google security alert: new device login",
      }),
    );
    expect(processed.status).toBe("action_required");
    expect(processed.category).toBe("security");
    expect(processed.requires_action).toBe(true);
  });

  it("opens expired API keys and tokens", () => {
    const groq = postProcessThreadAnalysis(
      analysis({
        status: "informational",
        requires_action: false,
        summary: "Your Groq API key has expired",
      }),
    );
    expect(groq.status).toBe("action_required");
    expect(groq.requires_action).toBe(true);

    const github = postProcessThreadAnalysis(
      analysis({
        status: "informational",
        requires_action: false,
        summary: "Your GitHub personal access token expired",
      }),
    );
    expect(github.status).toBe("action_required");
  });

  it("opens a deadline that still needs a next step", () => {
    const processed = postProcessThreadAnalysis(
      analysis({
        status: "informational",
        requires_action: false,
        summary: "Migrate off the old AI tooling before Friday",
        deadline: "2026-09-18",
      }),
    );
    expect(processed.status).toBe("action_required");
    expect(processed.requires_action).toBe(true);
  });

  it("ignores marketing and paid receipts", () => {
    const promo = postProcessThreadAnalysis(
      analysis({
        status: "informational",
        summary: "20% off this weekend. Unsubscribe below.",
      }),
    );
    expect(promo.status).toBe("ignore");
    expect(promo.requires_action).toBe(false);

    const receipt = postProcessThreadAnalysis(
      analysis({
        status: "informational",
        summary: "Your payment was successful. Receipt attached.",
      }),
    );
    expect(receipt.status).toBe("ignore");
  });

  it("keeps passive GitHub comments informational when the model invents an action", () => {
    const processed = postProcessThreadAnalysis(
      analysis({
        status: "action_required",
        requires_action: true,
        requires_reply: true,
        action_type: "reply",
        action_summary: "Reply to this thread",
        summary: "someone commented on issue #12. View it on GitHub.",
      }),
      {
        latestSubject: "[mailpilot] New issue comment",
        threadText: "someone commented on issue #12. View it on GitHub.",
      },
    );
    expect(processed.status).toBe("informational");
    expect(processed.requires_action).toBe(false);
  });

  it("keeps new-sign-in mail as an open task", () => {
    const processed = postProcessThreadAnalysis(
      analysis({
        status: "informational",
        requires_action: false,
        importance: "high",
        category: "security",
        summary: "כניסה חדשה ב-Windows. אם הכניסה בוצעה על ידך, אין צורך לעשות דבר.",
      }),
    );
    expect(processed.status).toBe("action_required");
    expect(processed.requires_action).toBe(true);
  });

  it("keeps a provider-blocked login as Open", () => {
    const processed = postProcessThreadAnalysis(
      analysis({
        status: "informational",
        requires_action: false,
        importance: "high",
        category: "security",
        summary: "התראת אבטחה קריטית: חסמנו ניסיון כניסה לחשבון שלך.",
      }),
    );
    expect(processed.status).toBe("action_required");
    expect(processed.requires_action).toBe(true);
  });

  it("keeps secure-now mail as an open task when there is no dismiss-if-you path", () => {
    const processed = postProcessThreadAnalysis(
      analysis({
        status: "action_required",
        requires_action: true,
        importance: "high",
        category: "security",
        action_type: "review",
        action_summary: "אבטח את החשבון",
        summary: "Unusual sign-in detected. Secure your account now.",
      }),
    );
    expect(processed.status).toBe("action_required");
    expect(processed.requires_action).toBe(true);
  });

  it("downgrades a document-share notice from waiting to informational", () => {
    const processed = postProcessThreadAnalysis(
      analysis({
        status: "waiting",
        waiting_for: "Ada",
        requires_action: false,
        action_type: "none",
        summary: "Ada shared a document with you",
        short_display_title: "Document shared",
      }),
      { latestSubject: "Ada shared a document" },
    );
    expect(processed.status).toBe("informational");
    expect(processed.waiting_for).toBeNull();
    expect(processed.requires_action).toBe(false);
  });

  it("keeps application follow-up and automated signature requests as open tasks", () => {
    const interview = postProcessThreadAnalysis(
      analysis({
        status: "ignore",
        summary: "Please send interview availability for Monday",
        short_display_title: "Interview",
      }),
    );
    expect(interview.status).toBe("action_required");
    expect(interview.requires_action).toBe(true);

    const signature = postProcessThreadAnalysis(
      analysis({
        status: "ignore",
        summary: "DocuSign: signature requested on the NDA",
        short_display_title: "Sign NDA",
      }),
    );
    expect(signature.status).toBe("action_required");
    expect(signature.action_type).toBe("sign");
  });

  it("ignores receipt-only application acks and summarizes routine tracking", () => {
    const ack = postProcessThreadAnalysis(
      analysis({
        status: "action_required",
        requires_action: true,
        action_type: "review",
        action_summary: "Review the application",
        summary: "Thank you for your application. We received it.",
      }),
    );
    expect(ack.status).toBe("ignore");
    expect(ack.requires_action).toBe(false);

    const tracking = postProcessThreadAnalysis(
      analysis({
        status: "action_required",
        requires_action: true,
        action_type: "review",
        action_summary: "Track the package",
        summary: "Your package is out for delivery. Tracking update.",
      }),
    );
    expect(tracking.status).toBe("informational");
    expect(tracking.requires_action).toBe(false);
  });

  it("opens delivery and meeting-time asks; summarizes confirmed cancellations", () => {
    const customs = postProcessThreadAnalysis(
      analysis({
        status: "informational",
        summary: "Provide customs information for this shipment",
      }),
    );
    expect(customs.status).toBe("action_required");

    const pickTime = postProcessThreadAnalysis(
      analysis({
        status: "informational",
        summary: "The 2pm slot fell through. Please pick a new time.",
      }),
    );
    expect(pickTime.status).toBe("action_required");

    const cancelled = postProcessThreadAnalysis(
      analysis({
        status: "action_required",
        requires_action: true,
        action_type: "schedule",
        action_summary: "Handle the cancellation",
        summary: "This event has been cancelled",
      }),
    );
    expect(cancelled.status).toBe("informational");
  });

  it("preserves waiting on out-of-office and ticket acknowledgments", () => {
    const ooo = postProcessThreadAnalysis(
      analysis({
        status: "resolved",
        summary: "Automatic reply: I am out of the office until Monday",
      }),
    );
    expect(ooo.status).toBe("waiting");
    expect(ooo.waiting_for).toBe("the other party");

    const ticket = postProcessThreadAnalysis(
      analysis({
        status: "informational",
        summary: "Ticket 1842 has been created. We received your request.",
      }),
    );
    expect(ticket.status).toBe("waiting");
  });

  it("opens an unpaid invoice that a low-confidence model called informational", () => {
    const processed = postProcessThreadAnalysis(
      analysis({
        status: "informational",
        requires_action: false,
        importance: "low",
        summary: "Invoice",
      }),
      {
        latestSubject: "Invoice #4821 — payment due Sep 15",
        threadText: "Please find invoice #4821 for 1,250 attached. Payment is due by September 15.",
      },
    );
    expect(processed.status).toBe("action_required");
    expect(processed.requires_action).toBe(true);
    expect(processed.action_type).toBe("pay");
  });

  it("keeps a locked account actionable when the footer says unsubscribe", () => {
    const processed = postProcessThreadAnalysis(
      analysis({
        status: "informational",
        requires_action: false,
        summary: "Account notice",
      }),
      {
        latestSubject: "Your account is locked",
        threadText:
          "The account is locked until you reset your password. Unsubscribe from security tips.",
      },
    );
    expect(processed.status).toBe("action_required");
    expect(processed.category).toBe("security");
  });

  it("keeps an out-of-office reply waiting even if an earlier message asked for a review", () => {
    const processed = postProcessThreadAnalysis(
      analysis({
        status: "informational",
        requires_action: false,
        summary: "Automatic reply",
      }),
      {
        latestSubject: "Automatic reply: Can we review the launch checklist?",
        threadText: [
          "[MESSAGE 1]",
          "Could you review the launch checklist when you are back?",
          "",
          "[MESSAGE 2]",
          "Subject: Automatic reply: Can we review the launch checklist?",
          "I am currently out of the office until Monday with limited access to email.",
        ].join("\n"),
      },
    );
    expect(processed.status).toBe("waiting");
    expect(processed.requires_action).toBe(false);
  });

  it("ignores a payment confirmation that says the payment was received", () => {
    const processed = postProcessThreadAnalysis(
      analysis({
        status: "informational",
        requires_action: false,
        summary: "Payment",
      }),
      {
        latestSubject: "Your payment was received",
        threadText:
          "Thank you. We have received your payment of 1,250. No further action is required.",
      },
    );
    expect(processed.status).toBe("ignore");
    expect(processed.requires_action).toBe(false);
  });

  it("does not create a task when work is assigned only to someone else", () => {
    const processed = postProcessThreadAnalysis(
      analysis({
        status: "action_required",
        requires_action: true,
        action_type: "review",
        action_summary: "Review the checklist",
        summary: "Assigned to Jordan to complete the checklist",
      }),
    );
    expect(processed.status).toBe("informational");
    expect(processed.requires_action).toBe(false);
  });
});

describe("confidenceBand", () => {
  it("maps spec thresholds", () => {
    expect(confidenceBand(0.81)).toBe("normal");
    expect(confidenceBand(0.7)).toBe("low");
    expect(confidenceBand(0.4)).toBe("needs_review");
  });
});
