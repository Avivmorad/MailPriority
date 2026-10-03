import type { ThreadAnalysis } from "@/lib/ai/schemas";
import type { ActionRecord } from "@/lib/actions/reconcile-action";
import type { HistoryListResult } from "@/lib/gmail/history";
import type { MailPilotLogicalLabel } from "@/lib/gmail/constants";
import type { ParsedGmailMessage } from "@/lib/gmail/parser";
import type { InitialLookbackDays } from "@/lib/scans/lookback";
import type { GmailRequestBudget } from "@/lib/gmail/request-budget";

export interface ScanCounters {
  messagesDiscovered: number;
  messagesProcessed: number;
  threadsAnalyzed: number;
  importantCount: number;
  actionCount: number;
  replyCount: number;
  waitingCount: number;
  informationalCount: number;
  ignoredCount: number;
}

export const EMPTY_SCAN_COUNTERS: ScanCounters = {
  messagesDiscovered: 0,
  messagesProcessed: 0,
  threadsAnalyzed: 0,
  importantCount: 0,
  actionCount: 0,
  replyCount: 0,
  waitingCount: 0,
  informationalCount: 0,
  ignoredCount: 0,
};

export function countersFromAnalyses(
  analyses: ThreadAnalysis[],
): Omit<ScanCounters, "messagesDiscovered" | "messagesProcessed" | "threadsAnalyzed"> {
  return {
    importantCount: analyses.filter((item) => item.importance === "high").length,
    actionCount: analyses.filter((item) => item.requires_action).length,
    replyCount: analyses.filter((item) => item.requires_reply).length,
    waitingCount: analyses.filter((item) => item.status === "waiting").length,
    informationalCount: analyses.filter((item) => item.status === "informational").length,
    ignoredCount: analyses.filter((item) => item.status === "ignore").length,
  };
}

export interface StoredThreadRow {
  id: string;
  lastAnalyzedMessageId: string | null;
  /** Saved with analysis so checkpoint replay can recover its count. */
  analysisScanId?: string | null;
  promptVersion: string | null;
  analysis: ThreadAnalysis | null;
}

export interface ScanSettings {
  vipSenders: string[];
  ignoredSenders: string[];
  ignoredDomains: string[];
  customAiInstructions: string;
  timezone: string;
  dailyScanTime: string | null;
}

export type ScanTriggerType = "INITIAL" | "MANUAL" | "RECOVERY" | "SCHEDULED";
export type ScanDiscoveryMode = "INITIAL" | "INCREMENTAL" | "RECOVERY";

export interface ConnectionScanState {
  historyId: string | null;
  lastSuccessfulScanAt: string | null;
}

export interface ScanGmailPort {
  /** Shared by preparation and execution; never restart the invocation clock. */
  requestBudget?: GmailRequestBudget;
  listMessageRefs(query: string): Promise<Array<{ id: string; threadId: string }>>;
  listHistoryChanges(startHistoryId: string): Promise<HistoryListResult>;
  fetchThread(threadId: string): Promise<ParsedGmailMessage[]>;
  /**
   * Latest message id and labels without `format=full`.
   * Present on the live Gmail port. Tests may omit it and always full-fetch.
   */
  fetchThreadMetadata?(
    threadId: string,
  ): Promise<{ latestMessageId: string; labelIds: string[] } | null>;
  getProfileHistoryId(): Promise<string | null>;
  loadLabelMap(): Promise<Map<MailPilotLogicalLabel, string>>;
  /**
   * Create any missing MailPriority/* labels, rename legacy MailPilot/*
   * managed labels in place, and persist mappings.
   * Used when connect-time `after()` label setup did not finish.
   */
  ensureManagedLabels?(): Promise<void>;
  modifyThreadLabels(
    threadId: string,
    addLabelIds: string[],
    removeLabelIds: string[],
  ): Promise<void>;
  /** Optional: Gmail sendAs aliases. Missing or failing implementations keep the primary address only. */
  listSendAsEmails?(): Promise<string[]>;
}

export interface ScanCheckpoint {
  scanId: string;
  userId: string;
  connectionId: string;
  lookbackDays: InitialLookbackDays;
  triggerType: ScanTriggerType;
  discoveryMode: ScanDiscoveryMode | null;
  discoveryComplete: boolean;
  discoveredThreadIds: string[];
  threadCursor: number;
  historyBoundary: string | null;
  failedThreadIds: string[];
  messagesDiscovered: number;
  messagesProcessed: number;
  threadsAnalyzed: number;
  importantCount: number;
  actionCount: number;
  replyCount: number;
  waitingCount: number;
  informationalCount: number;
  ignoredCount: number;
  startedAt: string | null;
  updatedAt: string | null;
}

export interface RunningScanRef {
  id: string;
  startedAt: string | null;
  updatedAt: string | null;
}

export type ScanRunStatus = "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED";

export interface ScanStorePort {
  findRunningScan(connectionId: string): Promise<RunningScanRef | null>;
  getScanCheckpoint(scanId: string): Promise<ScanCheckpoint | null>;
  getScanStatus(scanId: string): Promise<ScanRunStatus | null>;
  failScan(scanId: string, errorCode: string, errorMessage: string): Promise<void>;
  insertScanRun(input: {
    userId: string;
    connectionId: string;
    triggerType: ScanTriggerType;
    windowStart: string;
    windowEnd: string;
    lookbackDays: InitialLookbackDays;
  }): Promise<string>;
  updateScanRun(
    scanId: string,
    patch: Partial<ScanCounters> & {
      status: "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED";
      threadsDiscovered?: number;
      threadsChecked?: number;
      finishedAt?: string;
      errorCode?: string | null;
      errorMessage?: string | null;
      lookbackDays?: InitialLookbackDays;
      discoveryMode?: ScanDiscoveryMode;
      discoveryComplete?: boolean;
      discoveredThreadIds?: string[];
      threadCursor?: number;
      historyBoundary?: string | null;
      failedThreadIds?: string[];
    },
  ): Promise<boolean>;
  getSettings(userId: string): Promise<ScanSettings>;
  getConnectionScanState(connectionId: string): Promise<ConnectionScanState>;
  upsertThread(input: {
    userId: string;
    connectionId: string;
    gmailThreadId: string;
    subject: string | null;
    participants: Array<{ email: string; name: string | null }>;
    latestMessageAt: string | null;
    latestMessageDirection: string | null;
    analysis: ThreadAnalysis | null;
    lastAnalyzedMessageId: string | null;
    promptVersion: string | null;
    modelName: string | null;
    analysisScanId?: string | null;
  }): Promise<string>;
  getThread(connectionId: string, gmailThreadId: string): Promise<StoredThreadRow | null>;
  /** Batch load for reuse checks within a durable wave (one round trip). */
  getThreadsByGmailIds(
    connectionId: string,
    gmailThreadIds: string[],
  ): Promise<Map<string, StoredThreadRow>>;
  upsertMessage(input: {
    userId: string;
    connectionId: string;
    threadId: string;
    message: ParsedGmailMessage;
    direction: string;
    receivedAt: string;
    contentHash: string;
  }): Promise<void>;
  getAction(threadId: string): Promise<ActionRecord | null>;
  upsertAction(userId: string, threadId: string, action: ActionRecord): Promise<void>;
  updateConnectionScan(input: {
    connectionId: string;
    historyId?: string | null;
    lastSuccessfulScanAt?: string | null;
    lastAttemptedScanAt: string;
    nextScanAt?: string | null;
  }): Promise<void>;
  markConnectionReauthRequired(connectionId: string): Promise<void>;
  listPendingFailedThreadIds(connectionId: string, excludeScanId: string): Promise<string[]>;
}

export interface ScanRunResult {
  scanId: string;
  status: "SUCCESS" | "PARTIAL" | "FAILED" | "CONTINUED";
  counters: ScanCounters;
  lookbackDays: InitialLookbackDays;
  mode: ScanDiscoveryMode;
}
