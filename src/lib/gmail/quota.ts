import {
  assertGmailBudget,
  waitForGmailBudget,
  type GmailRequestBudget,
} from "@/lib/gmail/request-budget";

const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 12_000;

/** Official Gmail method costs: https://developers.google.com/gmail/api/reference/quota */
export const GMAIL_UNITS = {
  messagesList: 5,
  messagesGet: 5,
  threadsGet: 10,
  threadsModify: 5,
  getProfile: 1,
  historyList: 2,
  labelsList: 1,
  labelsCreate: 5,
  /**
   * labels.patch is the partial form of labels.update. The quota table lists
   * labels.update at 5 and does not list patch separately.
   */
  labelsPatch: 5,
  sendAsList: 1,
} as const;

export class GmailMinuteQuota {
  private events: Array<{ at: number; units: number }> = [];

  constructor(
    private readonly limit: number,
    private readonly windowMs: number = WINDOW_MS,
  ) {}

  used(now: number): number {
    this.prune(now);
    return this.events.reduce((sum, event) => sum + event.units, 0);
  }

  reset(): void {
    this.events = [];
  }

  /**
   * Block until `units` fit in the rolling one-minute budget, then record them.
   */
  async acquire(
    units: number,
    options: GmailRequestBudget & {
      now?: () => number;
      sleep?: (ms: number) => Promise<void>;
    } = {},
  ): Promise<void> {
    if (units <= 0) {
      return;
    }
    const nowFn = options.now ?? Date.now;
    const cap = Math.max(units, this.limit);

    for (;;) {
      assertGmailBudget(options);
      const now = nowFn();
      this.prune(now);
      const used = this.events.reduce((sum, event) => sum + event.units, 0);
      if (used + units <= cap) {
        this.events.push({ at: now, units });
        return;
      }
      const oldest = this.events[0];
      const waitMs = oldest ? Math.max(50, oldest.at + this.windowMs - now + 25) : this.windowMs;
      await waitForGmailBudget(waitMs, options, options.sleep);
    }
  }

  private prune(now: number): void {
    this.events = this.events.filter((event) => now - event.at < this.windowMs);
  }
}

let shared: GmailMinuteQuota | null = null;
let sharedLimit = DEFAULT_LIMIT;

export function getSharedGmailQuota(limit = DEFAULT_LIMIT): GmailMinuteQuota {
  if (!shared || sharedLimit !== limit) {
    shared = new GmailMinuteQuota(limit);
    sharedLimit = limit;
  }
  return shared;
}

export function resetSharedGmailQuotaForTests(): void {
  shared = null;
  sharedLimit = DEFAULT_LIMIT;
}
