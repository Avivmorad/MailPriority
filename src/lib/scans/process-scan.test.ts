import { describe, expect, it, vi } from "vitest";

const leaseCheckState = vi.hoisted(() => ({ holds: true }));

vi.mock("@/lib/scans/jobs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/scans/jobs")>();
  return {
    ...actual,
    refreshScanJobLease: vi.fn(async () => leaseCheckState.holds),
    stillHoldsScanJob: vi.fn(async () => leaseCheckState.holds),
  };
});

import type { ActionRecord } from "@/lib/actions/reconcile-action";
import { tryAnalyzeThread, type EmailTriageProvider } from "@/lib/ai/analyze-thread";
import { NVIDIA_REQUEST_TIMEOUT_MS, NvidiaEmailTriageProvider } from "@/lib/ai/nvidia";
import { TRIAGE_PROMPT_VERSION } from "@/lib/ai/prompts";
import { threadAnalysisSchema, type ThreadAnalysis } from "@/lib/ai/schemas";
import { ABSENT_USAGE } from "@/lib/ai/usage";
import type { MailPilotLogicalLabel } from "@/lib/gmail/constants";
import { listMessageRefs as listGmailMessageRefs } from "@/lib/gmail/messages";
import type { ParsedGmailMessage } from "@/lib/gmail/parser";
import { GmailRequestTimeoutError, withGmailRequest } from "@/lib/gmail/request-budget";
import { asLookbackDays } from "@/lib/scans/checkpoint";
import type { InitialLookbackDays } from "@/lib/scans/lookback";
import { DISPATCH_LEASE_SECONDS } from "@/lib/scans/dispatch-budget";
import * as scanJobs from "@/lib/scans/jobs";
import {
  analysisPromptKey,
  executeGmailScan,
  isRecoverableAnalysisTimeout,
  SCAN_WORK_BUDGET_MS,
  openGmailScan,
  processInitialScan,
  resumeGmailScan,
  shouldReuseStoredAnalysis,
  triageFailureCode,
} from "@/lib/scans/process-scan";
import { mergePendingFailedThreadIds } from "@/lib/scans/thread-failures";
import type {
  ScanGmailPort,
  ScanSettings,
  ScanStorePort,
  StoredThreadRow,
} from "@/lib/scans/types";

function validAnalysis(overrides: Partial<ThreadAnalysis> = {}): ThreadAnalysis {
  return threadAnalysisSchema.parse({
    summary: "בקשה לאשר תקציב",
    importance: "high",
    importance_reason: "budget approval",
    status: "action_required",
    requires_action: true,
    requires_reply: false,
    action_type: "approve",
    action_summary: "אשר את התקציב",
    action_reason: "vendor contracts",
    waiting_for: null,
    waiting_since: null,
    urgency: "soon",
    deadline: null,
    deadline_text: null,
    category: "other",
    sender_name: "Ada",
    organization: null,
    confidence: 0.88,
    short_display_title: "אישור תקציב",
    ...overrides,
  });
}

function parsedMessage(overrides: Partial<ParsedGmailMessage> = {}): ParsedGmailMessage {
  return {
    gmailMessageId: "m1",
    gmailThreadId: "t1",
    historyId: "100",
    internalDate: String(Date.parse("2026-09-10T10:00:00.000Z")),
    from: "Ada <ada@example.com>",
    to: "me@example.com",
    cc: null,
    bcc: null,
    subject: "Budget",
    messageIdHeader: "<m1@example.com>",
    inReplyTo: null,
    references: null,
    labelIds: ["INBOX"],
    snippet: "Please approve",
    plainText: "Please approve the budget.",
    hasAttachments: false,
    attachments: [],
    ...overrides,
  };
}

const LABEL_MAP = new Map<MailPilotLogicalLabel, string>([
  ["important", "L_IMP"],
  ["action_required", "L_ACT"],
  ["low_priority", "L_LOW"],
  ["processed", "L_PROC"],
]);

function createMemoryStore(): ScanStorePort & {
  threads: Map<string, StoredThreadRow & { gmailThreadId: string; subject: string | null }>;
  messages: Map<string, string>;
  actions: Map<string, ActionRecord>;
  connection: {
    lastSuccessfulScanAt: string | null;
    lastAttemptedScanAt: string | null;
    historyId: string | null;
    nextScanAt: string | null;
    status: string;
  };
  scanRuns: Array<{
    id: string;
    status: string;
    startedAt: string;
    updatedAt?: string;
    connectionId?: string;
    errorCode?: string | null;
    errorMessage?: string | null;
    lookbackDays?: number;
    discoveryComplete?: boolean;
    discoveredThreadIds?: string[];
    threadCursor?: number;
    historyBoundary?: string | null;
    failedThreadIds?: string[];
    messagesDiscovered?: number;
    messagesProcessed?: number;
    threadsAnalyzed?: number;
    importantCount?: number;
    actionCount?: number;
    replyCount?: number;
    waitingCount?: number;
    informationalCount?: number;
    ignoredCount?: number;
    discoveryMode?: string;
    userId?: string;
  }>;
  progressChecks: number[];
  liveCursorAdvances: number;
} {
  const threads = new Map<
    string,
    StoredThreadRow & { gmailThreadId: string; subject: string | null }
  >();
  const messages = new Map<string, string>();
  const actions = new Map<string, ActionRecord>();
  const scanRuns: Array<{
    id: string;
    status: string;
    startedAt: string;
    updatedAt?: string;
    threadsDiscovered?: number;
    threadsChecked?: number;
    connectionId?: string;
    errorCode?: string | null;
    errorMessage?: string | null;
    lookbackDays?: number;
    discoveryComplete?: boolean;
    discoveredThreadIds?: string[];
    threadCursor?: number;
    historyBoundary?: string | null;
    failedThreadIds?: string[];
    messagesDiscovered?: number;
    messagesProcessed?: number;
    threadsAnalyzed?: number;
    importantCount?: number;
    actionCount?: number;
    replyCount?: number;
    waitingCount?: number;
    informationalCount?: number;
    ignoredCount?: number;
    discoveryMode?: string;
    userId?: string;
  }> = [];
  const progressChecks: number[] = [];
  let liveCursorAdvances = 0;
  const connection = {
    lastSuccessfulScanAt: null as string | null,
    lastAttemptedScanAt: null as string | null,
    historyId: null as string | null,
    nextScanAt: null as string | null,
    status: "CONNECTED",
  };
  const settings: ScanSettings = {
    vipSenders: [],
    ignoredSenders: [],
    ignoredDomains: [],
    customAiInstructions: "",
    timezone: "Asia/Jerusalem",
    dailyScanTime: "08:00",
  };

  const store: ScanStorePort & {
    threads: typeof threads;
    messages: typeof messages;
    actions: typeof actions;
    connection: typeof connection;
    scanRuns: typeof scanRuns;
    progressChecks: number[];
    liveCursorAdvances: number;
  } = {
    threads,
    messages,
    actions,
    connection,
    scanRuns,
    progressChecks,
    get liveCursorAdvances() {
      return liveCursorAdvances;
    },
    async findRunningScan(connectionId) {
      const running = scanRuns.find(
        (run) => run.status === "RUNNING" && (run.connectionId ?? "conn-1") === connectionId,
      );
      return running
        ? {
            id: running.id,
            startedAt: running.startedAt,
            updatedAt: running.updatedAt ?? running.startedAt,
          }
        : null;
    },
    async getScanCheckpoint(scanId) {
      const run = scanRuns.find((item) => item.id === scanId);
      if (!run) {
        return null;
      }
      return {
        scanId: run.id,
        userId: run.userId ?? "user-1",
        connectionId: run.connectionId ?? "conn-1",
        lookbackDays: asLookbackDays(run.lookbackDays),
        triggerType: "MANUAL" as const,
        discoveryMode:
          run.discoveryMode === "INITIAL" ||
          run.discoveryMode === "INCREMENTAL" ||
          run.discoveryMode === "RECOVERY"
            ? run.discoveryMode
            : null,
        discoveryComplete: Boolean(run.discoveryComplete),
        discoveredThreadIds: run.discoveredThreadIds ?? [],
        threadCursor: run.threadCursor ?? 0,
        historyBoundary: run.historyBoundary ?? null,
        failedThreadIds: run.failedThreadIds ?? [],
        messagesDiscovered: run.messagesDiscovered ?? 0,
        messagesProcessed: run.messagesProcessed ?? 0,
        threadsAnalyzed: run.threadsAnalyzed ?? 0,
        importantCount: run.importantCount ?? 0,
        actionCount: run.actionCount ?? 0,
        replyCount: run.replyCount ?? 0,
        waitingCount: run.waitingCount ?? 0,
        informationalCount: run.informationalCount ?? 0,
        ignoredCount: run.ignoredCount ?? 0,
        startedAt: run.startedAt,
        updatedAt: run.updatedAt ?? run.startedAt,
      };
    },
    async getScanStatus(scanId) {
      const run = scanRuns.find((item) => item.id === scanId);
      if (
        run?.status === "RUNNING" ||
        run?.status === "SUCCESS" ||
        run?.status === "PARTIAL" ||
        run?.status === "FAILED"
      ) {
        return run.status;
      }
      return null;
    },
    async failScan(scanId, errorCode, errorMessage) {
      const run = scanRuns.find((item) => item.id === scanId);
      if (run && run.status === "RUNNING") {
        run.status = "FAILED";
        run.errorCode = errorCode;
        run.errorMessage = errorMessage;
      }
    },
    async insertScanRun(input) {
      if (
        scanRuns.some((run) => run.status === "RUNNING" && run.connectionId === input.connectionId)
      ) {
        throw new Error("SCAN_IN_PROGRESS");
      }
      const id = crypto.randomUUID();
      const startedAt = new Date().toISOString();
      scanRuns.push({
        id,
        status: "RUNNING",
        startedAt,
        updatedAt: startedAt,
        connectionId: input.connectionId,
        userId: input.userId,
        lookbackDays: input.lookbackDays,
      });
      return id;
    },
    async updateScanRun(scanId, patch) {
      const run = scanRuns.find((item) => item.id === scanId);
      if (!run || run.status !== "RUNNING") {
        return false;
      }
      run.status = patch.status;
      run.updatedAt = new Date().toISOString();
      if (patch.threadsDiscovered !== undefined) {
        run.threadsDiscovered = patch.threadsDiscovered;
      }
      if (patch.threadsChecked !== undefined) {
        run.threadsChecked = patch.threadsChecked;
        progressChecks.push(patch.threadsChecked);
      }
      if (patch.errorCode !== undefined) {
        run.errorCode = patch.errorCode;
      }
      if (patch.errorMessage !== undefined) {
        run.errorMessage = patch.errorMessage;
      }
      if (patch.lookbackDays !== undefined) {
        run.lookbackDays = patch.lookbackDays;
      }
      if (patch.discoveryComplete !== undefined) {
        run.discoveryComplete = patch.discoveryComplete;
      }
      if (patch.discoveredThreadIds !== undefined) {
        run.discoveredThreadIds = patch.discoveredThreadIds;
      }
      if (patch.threadCursor !== undefined) {
        run.threadCursor = patch.threadCursor;
        if (patch.failedThreadIds === undefined && patch.discoveryComplete === undefined) {
          liveCursorAdvances += 1;
        }
      }
      if (patch.historyBoundary !== undefined) {
        run.historyBoundary = patch.historyBoundary;
      }
      if (patch.failedThreadIds !== undefined) {
        run.failedThreadIds = patch.failedThreadIds;
      }
      if (patch.messagesDiscovered !== undefined) {
        run.messagesDiscovered = patch.messagesDiscovered;
      }
      if (patch.messagesProcessed !== undefined) {
        run.messagesProcessed = patch.messagesProcessed;
      }
      if (patch.threadsAnalyzed !== undefined) {
        run.threadsAnalyzed = patch.threadsAnalyzed;
      }
      if (patch.importantCount !== undefined) {
        run.importantCount = patch.importantCount;
      }
      if (patch.actionCount !== undefined) {
        run.actionCount = patch.actionCount;
      }
      if (patch.replyCount !== undefined) {
        run.replyCount = patch.replyCount;
      }
      if (patch.waitingCount !== undefined) {
        run.waitingCount = patch.waitingCount;
      }
      if (patch.informationalCount !== undefined) {
        run.informationalCount = patch.informationalCount;
      }
      if (patch.ignoredCount !== undefined) {
        run.ignoredCount = patch.ignoredCount;
      }
      if (patch.discoveryMode !== undefined) {
        run.discoveryMode = patch.discoveryMode;
      }
      return true;
    },
    async getSettings() {
      return settings;
    },
    async getConnectionScanState() {
      return {
        historyId: connection.historyId,
        lastSuccessfulScanAt: connection.lastSuccessfulScanAt,
      };
    },
    async upsertThread(input) {
      const key = `${input.connectionId}:${input.gmailThreadId}`;
      const existing = threads.get(key);
      const id = existing?.id ?? crypto.randomUUID();
      threads.set(key, {
        id,
        gmailThreadId: input.gmailThreadId,
        subject: input.subject,
        lastAnalyzedMessageId: input.lastAnalyzedMessageId,
        analysisScanId: input.analysisScanId ?? null,
        promptVersion: input.promptVersion,
        analysis: input.analysis,
      });
      return id;
    },
    async getThread(connectionId, gmailThreadId) {
      return threads.get(`${connectionId}:${gmailThreadId}`) ?? null;
    },
    async getThreadsByGmailIds(connectionId, gmailThreadIds) {
      const result = new Map<string, StoredThreadRow>();
      for (const gmailThreadId of gmailThreadIds) {
        const row = threads.get(`${connectionId}:${gmailThreadId}`);
        if (row) {
          result.set(gmailThreadId, row);
        }
      }
      return result;
    },
    async upsertMessage(input) {
      messages.set(`${input.connectionId}:${input.message.gmailMessageId}`, input.threadId);
    },
    async getAction(threadId) {
      return actions.get(threadId) ?? null;
    },
    async upsertAction(_userId, threadId, action) {
      actions.set(threadId, action);
    },
    async updateConnectionScan(input) {
      if (input.historyId !== undefined) {
        connection.historyId = input.historyId;
      }
      connection.lastAttemptedScanAt = input.lastAttemptedScanAt;
      if (input.lastSuccessfulScanAt !== undefined) {
        connection.lastSuccessfulScanAt = input.lastSuccessfulScanAt;
      }
      if (input.nextScanAt !== undefined) {
        connection.nextScanAt = input.nextScanAt;
      }
    },
    async listPendingFailedThreadIds(connectionId, excludeScanId) {
      const partials = scanRuns.filter(
        (run) =>
          run.id !== excludeScanId &&
          run.status === "PARTIAL" &&
          (run.connectionId ?? "conn-1") === connectionId,
      );
      return mergePendingFailedThreadIds(
        partials.map((run) => ({
          failedThreadIds: run.failedThreadIds ?? [],
          errorMessage: run.errorMessage,
        })),
      );
    },
    async markConnectionReauthRequired() {
      connection.status = "REAUTH_REQUIRED";
    },
  };

  return store;
}

function unusedProvider(): EmailTriageProvider {
  return {
    analyzeThread: async () => {
      throw new Error("provider should not be used when analyze is injected");
    },
  };
}

async function runScan(options: {
  store: ReturnType<typeof createMemoryStore>;
  gmail: ScanGmailPort;
  analyze?: Parameters<typeof processInitialScan>[0]["analyze"];
  provider?: EmailTriageProvider;
  lookbackDays?: InitialLookbackDays;
  now?: Date;
}) {
  return processInitialScan({
    userId: "user-1",
    connectionId: "conn-1",
    gmailEmail: "me@example.com",
    lookbackDays: options.lookbackDays ?? 7,
    now: options.now ?? new Date("2026-09-10T12:00:00.000Z"),
    gmail: options.gmail,
    store: options.store,
    provider: options.provider ?? unusedProvider(),
    modelName: "gemini-test",
    analyze: options.analyze,
  });
}

describe("processInitialScan", () => {
  it("repairs missing managed labels before applying them", async () => {
    const store = createMemoryStore();
    const ensureManagedLabels = vi.fn(async () => undefined);
    let loads = 0;
    await runScan({
      store,
      gmail: {
        getProfileHistoryId: async () => "100",
        listMessageRefs: async () => [{ id: "m1", threadId: "t1" }],
        listHistoryChanges: async () => ({ ok: true, refs: [], latestHistoryId: "100" }),
        fetchThread: async () => [parsedMessage()],
        loadLabelMap: async () => {
          loads += 1;
          if (loads === 1) {
            return new Map<MailPilotLogicalLabel, string>([["important", "L_IMP"]]);
          }
          return LABEL_MAP;
        },
        ensureManagedLabels,
        modifyThreadLabels: async () => undefined,
      },
      analyze: async () => ({ ok: true, analysis: validAnalysis() }),
    });
    expect(ensureManagedLabels).toHaveBeenCalledTimes(1);
    expect(loads).toBe(2);
  });

  it("does not call ensureManagedLabels when the map is already complete", async () => {
    const ensureManagedLabels = vi.fn(async () => undefined);
    await runScan({
      store: createMemoryStore(),
      gmail: {
        getProfileHistoryId: async () => "100",
        listMessageRefs: async () => [{ id: "m1", threadId: "t1" }],
        listHistoryChanges: async () => ({ ok: true, refs: [], latestHistoryId: "100" }),
        fetchThread: async () => [parsedMessage()],
        loadLabelMap: async () => LABEL_MAP,
        ensureManagedLabels,
        modifyThreadLabels: async () => undefined,
      },
      analyze: async () => ({ ok: true, analysis: validAnalysis() }),
    });
    expect(ensureManagedLabels).not.toHaveBeenCalled();
  });

  it("keeps live message progress separate from the durable checkpoint counters", async () => {
    const store = createMemoryStore();
    const update = store.updateScanRun.bind(store);
    const liveWrites: Parameters<ScanStorePort["updateScanRun"]>[1][] = [];
    store.updateScanRun = async (id, patch) => {
      if (
        patch.threadsChecked !== undefined &&
        patch.threadCursor === undefined &&
        patch.status === "RUNNING"
      ) {
        liveWrites.push(patch);
      }
      return update(id, patch);
    };
    await runScan({
      store,
      gmail: {
        getProfileHistoryId: async () => "100",
        listMessageRefs: async () => [{ id: "m1", threadId: "t1" }],
        listHistoryChanges: async () => ({ ok: true, refs: [], latestHistoryId: "100" }),
        fetchThread: async () => [parsedMessage()],
        loadLabelMap: async () => LABEL_MAP,
        modifyThreadLabels: async () => undefined,
      },
      analyze: async () => ({ ok: true, analysis: validAnalysis() }),
    });
    expect(liveWrites.length).toBeGreaterThan(0);
    for (const patch of liveWrites) {
      expect(patch.messagesProcessed).toBeUndefined();
      expect(patch.threadsAnalyzed).toBeUndefined();
      expect(patch.actionCount).toBeUndefined();
    }
    expect(store.scanRuns[0]).toMatchObject({
      threadCursor: 1,
      messagesProcessed: 1,
      threadsAnalyzed: 1,
    });
  });

  it("does not admit another batch after its checkpoint update was rejected", async () => {
    vi.stubEnv("AI_MAX_CONCURRENCY", "1");
    const store = createMemoryStore();
    const update = store.updateScanRun.bind(store);
    store.updateScanRun = async (id, patch) => {
      if (patch.status === "RUNNING" && patch.threadCursor === 1) return false;
      return update(id, patch);
    };
    const fetchThread = vi.fn(async (id: string) => [
      parsedMessage({ gmailThreadId: id, gmailMessageId: `m-${id}` }),
    ]);
    try {
      const result = await runScan({
        store,
        gmail: {
          getProfileHistoryId: async () => "100",
          listMessageRefs: async () => [
            { id: "m-t1", threadId: "t1" },
            { id: "m-t2", threadId: "t2" },
          ],
          listHistoryChanges: async () => ({ ok: true, refs: [], latestHistoryId: "100" }),
          fetchThread,
          loadLabelMap: async () => LABEL_MAP,
          modifyThreadLabels: async () => undefined,
        },
        analyze: async () => ({ ok: true, analysis: validAnalysis() }),
      });
      expect(result.status).toBe("FAILED");
      expect(fetchThread.mock.calls.map(([id]) => id)).toEqual(["t1"]);
      expect(store.scanRuns[0].threadCursor).toBe(0);
      expect(store.connection.historyId).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("does not skip a hung earlier thread when a later worker finished before the deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.stubEnv("AI_MAX_CONCURRENCY", "2");
    const store = createMemoryStore();
    const budget = { deadlineAt: 100 };
    const applied = new Map<string, string[]>();
    const modifyThreadLabels = vi.fn(async (id: string, add: string[], remove: string[]) => {
      applied.set(id, [
        ...new Set([...(applied.get(id) ?? []).filter((label) => !remove.includes(label)), ...add]),
      ]);
    });
    const analyze = vi.fn(async () => ({ ok: true as const, analysis: validAnalysis() }));
    const gmail: ScanGmailPort = {
      requestBudget: budget,
      getProfileHistoryId: async () => "hist-new",
      listMessageRefs: async () => [
        { id: "m-t1", threadId: "t1" },
        { id: "m-t2", threadId: "t2" },
      ],
      listHistoryChanges: async () => ({ ok: true, refs: [], latestHistoryId: "hist-new" }),
      loadLabelMap: async () => LABEL_MAP,
      fetchThread: (id) =>
        id === "t1"
          ? withGmailRequest(() => new Promise<never>(() => undefined), budget)
          : Promise.resolve([parsedMessage({ gmailThreadId: id, gmailMessageId: `m-${id}` })]),
      modifyThreadLabels,
    };
    try {
      const result = runScan({ store, gmail, analyze });
      await vi.advanceTimersByTimeAsync(100);
      await expect(result).resolves.toMatchObject({ status: "CONTINUED" });
      expect(store.scanRuns[0]).toMatchObject({
        status: "RUNNING",
        threadCursor: 0,
        threadsChecked: 0,
        failedThreadIds: [],
      });
      expect(store.connection.historyId).toBeNull();
      expect(modifyThreadLabels.mock.calls.map(([id]) => id)).toEqual(["t2"]);
      const resumed = await resumeGmailScan({
        scanId: store.scanRuns[0].id,
        gmailEmail: "me@example.com",
        store,
        gmail: {
          ...gmail,
          requestBudget: { deadlineAt: 200 },
          fetchThread: async (id) => [
            parsedMessage({
              gmailThreadId: id,
              gmailMessageId: `m-${id}`,
              labelIds: applied.get(id) ?? [],
            }),
          ],
        },
        provider: unusedProvider(),
        modelName: "synthetic-model",
        analyze,
      });
      await expect(executeGmailScan(resumed)).resolves.toMatchObject({ status: "SUCCESS" });
      expect(store.scanRuns[0]).toMatchObject({
        threadCursor: 2,
        threadsChecked: 2,
        threadsAnalyzed: 2,
        messagesProcessed: 2,
        actionCount: 2,
      });
      expect(modifyThreadLabels.mock.calls.map(([id]) => id)).toEqual(["t2", "t1"]);
      expect(analyze).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
      vi.unstubAllEnvs();
    }
  });

  it("aborts a hung provider at the shared deadline and leaves the thread resumable", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const store = createMemoryStore();
    let providerSignal: AbortSignal | undefined;
    const modifyThreadLabels = vi.fn(async () => undefined);
    const analyze: NonNullable<Parameters<typeof processInitialScan>[0]["analyze"]> = (
      input,
      provider,
      options,
    ) => {
      void input;
      void provider;
      providerSignal = options?.signal;
      return new Promise(() => undefined);
    };
    try {
      const result = runScan({
        store,
        analyze,
        gmail: {
          requestBudget: { deadlineAt: 100 },
          getProfileHistoryId: async () => "hist-new",
          listMessageRefs: async () => [{ id: "m1", threadId: "t1" }],
          listHistoryChanges: async () => ({ ok: true, refs: [], latestHistoryId: "hist-new" }),
          fetchThread: async () => [parsedMessage()],
          loadLabelMap: async () => LABEL_MAP,
          modifyThreadLabels,
        },
      });
      await vi.advanceTimersByTimeAsync(100);
      await expect(result).resolves.toMatchObject({ status: "CONTINUED" });
      expect(providerSignal?.aborted).toBe(true);
      expect(store.scanRuns[0]).toMatchObject({
        status: "RUNNING",
        threadCursor: 0,
        threadsAnalyzed: 0,
        failedThreadIds: [],
      });
      expect(store.connection.historyId).toBeNull();
      expect(modifyThreadLabels).not.toHaveBeenCalled();
      expect(store.actions.size).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps incomplete discovery resumable after a hung page reaches its deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const store = createMemoryStore();
    const budget = { deadlineAt: 100 };
    const pageList = vi.fn((request: { pageToken?: string }) =>
      request.pageToken
        ? new Promise<never>(() => undefined)
        : Promise.resolve({
            data: {
              messages: [{ id: "m1", threadId: "t1" }],
              nextPageToken: "p2",
            },
          }),
    );
    const pagedGmail = {
      users: { messages: { list: pageList } },
    } as unknown as Parameters<typeof listGmailMessageRefs>[0];
    const gmail: ScanGmailPort = {
      requestBudget: budget,
      getProfileHistoryId: async () => "hist-new",
      listMessageRefs: (query) => listGmailMessageRefs(pagedGmail, query, budget),
      listHistoryChanges: async () => ({ ok: true, refs: [], latestHistoryId: "hist-new" }),
      fetchThread: async (threadId) => [
        parsedMessage({ gmailThreadId: threadId, gmailMessageId: `m-${threadId}` }),
      ],
      loadLabelMap: async () => LABEL_MAP,
      modifyThreadLabels: vi.fn(async () => undefined),
    };
    try {
      const result = runScan({
        store,
        gmail,
        analyze: async () => ({ ok: true, analysis: validAnalysis() }),
      });
      await vi.advanceTimersByTimeAsync(100);
      await expect(result).resolves.toMatchObject({ status: "CONTINUED" });
      expect(store.scanRuns[0]).toMatchObject({ status: "RUNNING", threadCursor: 0 });
      expect(store.scanRuns[0].discoveryComplete).not.toBe(true);
      expect(store.scanRuns[0].discoveredThreadIds).toBeUndefined();
      expect(pageList.mock.calls.map(([request]) => request.pageToken)).toEqual([undefined, "p2"]);
      expect(store.connection.historyId).toBeNull();
      expect(gmail.modifyThreadLabels).not.toHaveBeenCalled();
      const resumed = await resumeGmailScan({
        scanId: store.scanRuns[0].id,
        gmailEmail: "me@example.com",
        store,
        gmail: {
          ...gmail,
          requestBudget: { deadlineAt: 200 },
          listMessageRefs: async () => [
            { id: "m1", threadId: "t1" },
            { id: "m2", threadId: "t2" },
            { id: "m2", threadId: "t2" },
          ],
        },
        provider: unusedProvider(),
        modelName: "synthetic-model",
        analyze: async () => ({ ok: true, analysis: validAnalysis() }),
      });
      await expect(executeGmailScan(resumed)).resolves.toMatchObject({ status: "SUCCESS" });
      expect(store.scanRuns[0]).toMatchObject({
        status: "SUCCESS",
        threadCursor: 2,
        discoveredThreadIds: ["t1", "t2"],
      });
      expect(store.threads.size).toBe(2);
      expect(store.connection.historyId).toBe("hist-new");
    } finally {
      vi.useRealTimers();
    }
  });

  it("preserves the committed prefix on fetch timeout and resumes without duplicate labels", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.stubEnv("AI_MAX_CONCURRENCY", "1");
    const store = createMemoryStore();
    const budget = { deadlineAt: 100 };
    const modifyThreadLabels = vi.fn(async (id: string, add: string[], remove: string[]) => {
      void id;
      void add;
      void remove;
    });
    const gmail: ScanGmailPort = {
      requestBudget: budget,
      listMessageRefs: async () => [
        { id: "m-t1", threadId: "t1" },
        { id: "m-t2", threadId: "t2" },
      ],
      listHistoryChanges: async () => ({ ok: true, refs: [], latestHistoryId: "hist-new" }),
      getProfileHistoryId: async () => "hist-new",
      loadLabelMap: async () => LABEL_MAP,
      fetchThread: (id) =>
        id === "t2"
          ? withGmailRequest(() => new Promise<never>(() => undefined), budget)
          : Promise.resolve([parsedMessage({ gmailThreadId: id, gmailMessageId: `m-${id}` })]),
      modifyThreadLabels,
    };
    try {
      const result = runScan({
        store,
        gmail,
        analyze: async () => ({ ok: true, analysis: validAnalysis() }),
      });
      await vi.advanceTimersByTimeAsync(100);
      await expect(result).resolves.toMatchObject({ status: "CONTINUED" });
      expect(store.scanRuns[0]).toMatchObject({
        status: "RUNNING",
        threadCursor: 1,
        messagesProcessed: 1,
        threadsAnalyzed: 1,
        actionCount: 1,
        failedThreadIds: [],
      });
      expect(store.connection.historyId).toBeNull();
      const fetchThread = vi.fn(async (id: string) => [
        parsedMessage({ gmailThreadId: id, gmailMessageId: `m-${id}` }),
      ]);
      const resumed = await resumeGmailScan({
        scanId: store.scanRuns[0].id,
        gmailEmail: "me@example.com",
        store,
        gmail: { ...gmail, requestBudget: { deadlineAt: 200 }, fetchThread },
        provider: unusedProvider(),
        modelName: "synthetic-model",
        analyze: async () => ({ ok: true, analysis: validAnalysis() }),
      });
      await expect(executeGmailScan(resumed)).resolves.toMatchObject({ status: "SUCCESS" });
      expect(fetchThread).toHaveBeenCalledTimes(1);
      expect(fetchThread).toHaveBeenCalledWith("t2");
      expect(modifyThreadLabels.mock.calls.map(([id]) => id)).toEqual(["t1", "t2"]);
      expect(store.scanRuns[0]).toMatchObject({
        threadCursor: 2,
        actionCount: 2,
        messagesProcessed: 2,
      });
    } finally {
      vi.useRealTimers();
      vi.unstubAllEnvs();
    }
  });
  it.each([true, false])(
    "saves a consistent completed batch before fetching the next thread (AI succeeds: %s)",
    async (aiSucceeds) => {
      vi.stubEnv("AI_MAX_CONCURRENCY", "1");
      const store = createMemoryStore();
      let checkpointBeforeSecondThread: (typeof store.scanRuns)[number] | undefined;
      try {
        const result = await runScan({
          store,
          gmail: {
            listMessageRefs: async () => [
              { id: "m-t1", threadId: "t1" },
              { id: "m-t2", threadId: "t2" },
            ],
            listHistoryChanges: async () => ({ ok: true, refs: [], latestHistoryId: "hist-new" }),
            fetchThread: async (threadId) => {
              if (threadId === "t2") {
                checkpointBeforeSecondThread = {
                  ...store.scanRuns[0],
                  failedThreadIds: [...(store.scanRuns[0].failedThreadIds ?? [])],
                };
              }
              return [parsedMessage({ gmailThreadId: threadId, gmailMessageId: `m-${threadId}` })];
            },
            getProfileHistoryId: async () => "hist-new",
            loadLabelMap: async () => LABEL_MAP,
            modifyThreadLabels: async () => undefined,
          },
          analyze: async () =>
            aiSucceeds
              ? { ok: true as const, analysis: validAnalysis() }
              : { ok: false as const, error: new Error("AI unavailable") },
        });
        expect(checkpointBeforeSecondThread).toMatchObject({
          threadCursor: 1,
          messagesProcessed: 1,
          threadsAnalyzed: aiSucceeds ? 1 : 0,
          actionCount: aiSucceeds ? 1 : 0,
          failedThreadIds: aiSucceeds ? [] : ["t1"],
        });
        expect(result.status).toBe(aiSucceeds ? "SUCCESS" : "PARTIAL");
        expect(result.counters.messagesProcessed).toBe(2);
        expect(result.counters.actionCount).toBe(aiSucceeds ? 2 : 0);
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );

  it("skips actions and Gmail labels when cancelled during message persistence", async () => {
    const store = createMemoryStore();
    const originalWrite = store.upsertMessage.bind(store);
    store.upsertMessage = async (input) => {
      await originalWrite(input);
      await store.failScan(store.scanRuns[0].id, "cancelled", "Scan stopped");
    };
    const modifyThreadLabels = vi.fn(async () => undefined);
    const result = await runScan({
      store,
      gmail: {
        listMessageRefs: async () => [{ id: "m1", threadId: "t1" }],
        listHistoryChanges: async () => ({ ok: true, refs: [], latestHistoryId: "hist-new" }),
        fetchThread: async () => [parsedMessage()],
        getProfileHistoryId: async () => "hist-new",
        loadLabelMap: async () => LABEL_MAP,
        modifyThreadLabels,
      },
      analyze: async () => ({ ok: true as const, analysis: validAnalysis() }),
    });
    expect(result.status).toBe("FAILED");
    expect(store.actions.size).toBe(0);
    expect(modifyThreadLabels).not.toHaveBeenCalled();
    expect(store.connection.historyId).toBeNull();
  });

  it.each([true, false])(
    "settles concurrent message writes before marking partial (AI succeeds: %s)",
    async (aiSucceeds) => {
      const store = createMemoryStore();
      const originalWrite = store.upsertMessage.bind(store);
      let release!: () => void;
      const blocked = new Promise<void>((resolve) => {
        release = resolve;
      });
      let started!: () => void;
      const secondStarted = new Promise<void>((resolve) => {
        started = resolve;
      });
      store.upsertMessage = async (input) => {
        if (input.message.gmailMessageId === "m1") throw new Error("database unavailable");
        started();
        await blocked;
        await originalWrite(input);
      };
      const modifyThreadLabels = vi.fn(async () => undefined);
      const result = runScan({
        store,
        gmail: {
          listMessageRefs: async () => [{ id: "m2", threadId: "t1" }],
          listHistoryChanges: async () => ({ ok: true, refs: [], latestHistoryId: "hist-new" }),
          fetchThread: async () => [
            parsedMessage(),
            parsedMessage({
              gmailMessageId: "m2",
              internalDate: String(Date.parse("2026-09-10T11:00:00.000Z")),
            }),
          ],
          getProfileHistoryId: async () => "hist-new",
          loadLabelMap: async () => LABEL_MAP,
          modifyThreadLabels,
        },
        analyze: async () =>
          aiSucceeds
            ? { ok: true as const, analysis: validAnalysis() }
            : { ok: false as const, error: new Error("AI unavailable") },
      });
      await secondStarted;
      expect(store.scanRuns[0]?.status).toBe("RUNNING");
      expect(modifyThreadLabels).not.toHaveBeenCalled();
      release();
      const completed = await result;
      expect(completed.status).toBe("PARTIAL");
      expect(completed.counters.messagesProcessed).toBe(1);
      expect(store.messages.size).toBe(1);
      expect(store.scanRuns[0]?.failedThreadIds).toEqual(["t1"]);
      expect(store.connection.historyId).toBeNull();
      expect(modifyThreadLabels).not.toHaveBeenCalled();
    },
  );

  it("stops admitting work at the budget and preserves the cursor for retry", async () => {
    const store = createMemoryStore();
    store.connection.historyId = "old-history";
    store.connection.lastSuccessfulScanAt = "2026-09-09T12:00:00.000Z";
    const clock = vi.spyOn(Date, "now").mockReturnValue(0);
    const fetchThread = vi.fn(async () => [parsedMessage()]);
    try {
      const result = await runScan({
        store,
        gmail: {
          getProfileHistoryId: async () => "new-history",
          listHistoryChanges: async () => {
            clock.mockReturnValue(SCAN_WORK_BUDGET_MS);
            return {
              ok: true,
              refs: [{ id: "m1", threadId: "t1" }],
              latestHistoryId: "new-history",
            };
          },
          listMessageRefs: async () => [],
          fetchThread,
          loadLabelMap: async () => LABEL_MAP,
          modifyThreadLabels: async () => {},
        },
      });
      expect(result.status).toBe("CONTINUED");
      expect(fetchThread).not.toHaveBeenCalled();
      expect(store.connection.historyId).toBe("old-history");
      expect(store.scanRuns[0].status).toBe("RUNNING");
      expect(store.scanRuns[0].threadCursor).toBe(0);
      expect(store.scanRuns[0].discoveredThreadIds).toEqual(["t1"]);
    } finally {
      clock.mockRestore();
    }
  });

  it("resumes remaining threads on the next invocation without re-analyzing finished ones", async () => {
    vi.stubEnv("AI_MAX_CONCURRENCY", "1");
    const store = createMemoryStore();
    const clock = vi.spyOn(Date, "now").mockReturnValue(0);
    const analyze = vi.fn(async () => ({ ok: true as const, analysis: validAnalysis() }));
    const fetchThread = vi.fn(async (threadId: string) => [
      parsedMessage({ gmailThreadId: threadId, gmailMessageId: `m-${threadId}` }),
    ]);
    const gmail: ScanGmailPort = {
      getProfileHistoryId: async () => "hist-new",
      listHistoryChanges: async () => {
        throw new Error("history should not run on the initial scan");
      },
      listMessageRefs: async () => [
        { id: "m-t1", threadId: "t1" },
        { id: "m-t2", threadId: "t2" },
      ],
      fetchThread,
      loadLabelMap: async () => LABEL_MAP,
      modifyThreadLabels: async () => {
        clock.mockReturnValue(SCAN_WORK_BUDGET_MS);
      },
    };
    try {
      fetchThread.mockImplementation(async (threadId: string) => {
        return [parsedMessage({ gmailThreadId: threadId, gmailMessageId: `m-${threadId}` })];
      });
      const first = await runScan({ store, gmail, analyze });
      expect(first.status).toBe("CONTINUED");
      expect(analyze).toHaveBeenCalledTimes(1);
      expect(store.scanRuns[0]?.threadCursor).toBe(1);
      expect(store.connection.historyId).toBeNull();

      clock.mockReturnValue(0);
      const prepared = await resumeGmailScan({
        scanId: first.scanId,
        gmailEmail: "me@example.com",
        gmail,
        store,
        provider: unusedProvider(),
        modelName: "gemini-test",
        analyze,
      });
      fetchThread.mockImplementation(async (threadId: string) => [
        parsedMessage({ gmailThreadId: threadId, gmailMessageId: `m-${threadId}` }),
      ]);
      const second = await executeGmailScan(prepared);
      expect(second.status).toBe("SUCCESS");
      expect(analyze).toHaveBeenCalledTimes(2);
      expect(store.scanRuns[0]?.status).toBe("SUCCESS");
      expect(store.connection.historyId).toBe("hist-new");
    } finally {
      clock.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it("refreshes the job lease before thread processing starts", async () => {
    const refresh = vi.spyOn(scanJobs, "refreshScanJobLease").mockResolvedValue(true);
    const stillHolds = vi.spyOn(scanJobs, "stillHoldsScanJob").mockResolvedValue(true);
    const store = createMemoryStore();
    const gmail: ScanGmailPort = {
      getProfileHistoryId: async () => "hist-new",
      listHistoryChanges: async () => {
        throw new Error("history should not run on the initial scan");
      },
      listMessageRefs: async () => [],
      fetchThread: async () => [parsedMessage()],
      loadLabelMap: async () => LABEL_MAP,
      modifyThreadLabels: async () => {},
    };
    const prepared = await openGmailScan({
      userId: "user-1",
      connectionId: "conn-1",
      gmailEmail: "me@example.com",
      gmail,
      store,
      provider: unusedProvider(),
      modelName: "gemini-test",
    });
    await executeGmailScan({
      ...prepared,
      gmail,
      jobLease: { jobId: "job-1", workerId: "worker-1" },
    });
    expect(refresh).toHaveBeenCalledWith("job-1", "worker-1", DISPATCH_LEASE_SECONDS);
    refresh.mockRestore();
    stillHolds.mockRestore();
  });

  it("upserts a thread once, applies labels after analysis, and keeps counters consistent", async () => {
    const store = createMemoryStore();
    const modifyThreadLabels = vi.fn(async () => undefined);
    const message = parsedMessage();
    const analysis = validAnalysis();
    const analyze = vi.fn(async () => ({ ok: true as const, analysis }));

    const gmail: ScanGmailPort = {
      listMessageRefs: async (query) => {
        expect(query).toBe("-in:spam -in:trash newer_than:7d");
        return [{ id: message.gmailMessageId, threadId: message.gmailThreadId }];
      },
      listHistoryChanges: async () => {
        throw new Error("history should not run on the initial scan");
      },
      fetchThread: async () => [message],
      getProfileHistoryId: async () => "hist-1",
      loadLabelMap: async () => LABEL_MAP,
      modifyThreadLabels,
    };

    const first = await runScan({ store, gmail, analyze });
    expect(first.status).toBe("SUCCESS");
    expect(first.mode).toBe("INITIAL");
    expect(first.counters.threadsAnalyzed).toBe(1);
    expect(first.counters.messagesProcessed).toBe(1);
    expect(first.counters.importantCount).toBe(1);
    expect(first.counters.actionCount).toBe(1);
    expect(store.threads.size).toBe(1);
    expect(store.messages.size).toBe(1);
    expect(store.actions.size).toBe(1);
    expect(modifyThreadLabels).toHaveBeenCalledWith("t1", ["L_IMP", "L_ACT", "L_PROC"], []);

    const fetchThread = vi.fn(async () => [message]);
    const incrementalGmail: ScanGmailPort = {
      listMessageRefs: async () => {
        throw new Error("incremental scan must not list the lookback window");
      },
      listHistoryChanges: async (startHistoryId) => {
        expect(startHistoryId).toBe("hist-1");
        return { ok: true, refs: [], latestHistoryId: "hist-2" };
      },
      fetchThread,
      getProfileHistoryId: async () => "hist-2",
      loadLabelMap: async () => LABEL_MAP,
      modifyThreadLabels,
    };

    const second = await runScan({ store, gmail: incrementalGmail, analyze });
    expect(second.status).toBe("SUCCESS");
    expect(second.mode).toBe("INCREMENTAL");
    expect(second.counters.threadsAnalyzed).toBe(0);
    expect(second.counters.messagesDiscovered).toBe(0);
    expect(store.threads.size).toBe(1);
    expect(store.messages.size).toBe(1);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(fetchThread).not.toHaveBeenCalled();
    expect(modifyThreadLabels).toHaveBeenCalledTimes(1);
  });

  it("does not apply Gmail labels when AI analysis fails", async () => {
    const store = createMemoryStore();
    const modifyThreadLabels = vi.fn(async () => undefined);
    const message = parsedMessage();
    const gmail: ScanGmailPort = {
      listMessageRefs: async () => [
        { id: message.gmailMessageId, threadId: message.gmailThreadId },
      ],
      listHistoryChanges: async () => {
        throw new Error("history should not run on the initial scan");
      },
      fetchThread: async () => [message],
      getProfileHistoryId: async () => "hist-1",
      loadLabelMap: async () => LABEL_MAP,
      modifyThreadLabels,
    };

    const analyze = vi.fn(async () => ({ ok: false as const, error: new Error("gemini down") }));
    const result = await runScan({
      store,
      gmail,
      analyze,
    });

    expect(result.status).toBe("PARTIAL");
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(result.counters.threadsAnalyzed).toBe(0);
    expect(modifyThreadLabels).not.toHaveBeenCalled();
    expect(store.actions.size).toBe(0);
    expect([...store.threads.values()][0]?.analysis).toBeNull();
    expect(store.connection.historyId).toBeNull();
    expect(store.connection.lastSuccessfulScanAt).toBeNull();
    expect(store.scanRuns.at(-1)?.errorCode).toBe("partial_thread_failures");
    expect(store.scanRuns.at(-1)?.errorMessage).toBe("thread_failures:1:t1");
  });

  it("recovers when an AI request times out and the retry validates", async () => {
    const store = createMemoryStore();
    const modifyThreadLabels = vi.fn(async () => undefined);
    const message = parsedMessage();
    let calls = 0;
    const analyze = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        throw new GmailRequestTimeoutError();
      }
      return { ok: true as const, analysis: validAnalysis() };
    });
    const result = await runScan({
      store,
      gmail: {
        listMessageRefs: async () => [
          { id: message.gmailMessageId, threadId: message.gmailThreadId },
        ],
        listHistoryChanges: async () => {
          throw new Error("history should not run on the initial scan");
        },
        fetchThread: async () => [message],
        getProfileHistoryId: async () => "hist-new",
        loadLabelMap: async () => LABEL_MAP,
        modifyThreadLabels,
      },
      analyze,
    });

    expect(result.status).toBe("SUCCESS");
    expect(analyze).toHaveBeenCalledTimes(2);
    expect(modifyThreadLabels).toHaveBeenCalledTimes(1);
    expect(store.connection.historyId).toBe("hist-new");
    expect(store.scanRuns.at(-1)?.failedThreadIds ?? []).toEqual([]);
    expect(store.actions.size).toBe(1);
    expect([...store.threads.values()][0]?.analysis).toMatchObject({ status: "action_required" });
  });

  it("keeps a validated thread and records one retryable partial when a later AI timeout persists", async () => {
    vi.stubEnv("AI_MAX_CONCURRENCY", "1");
    const store = createMemoryStore();
    const modifyThreadLabels = vi.fn(async (id: string, add: string[], remove: string[]) => {
      void id;
      void add;
      void remove;
    });
    let calls = 0;
    const analyze = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return { ok: true as const, analysis: validAnalysis() };
      }
      throw new GmailRequestTimeoutError();
    });
    try {
      const result = await runScan({
        store,
        gmail: {
          listMessageRefs: async () => [
            { id: "m-t1", threadId: "t1" },
            { id: "m-t2", threadId: "t2" },
          ],
          listHistoryChanges: async () => {
            throw new Error("history should not run on the initial scan");
          },
          fetchThread: async (id: string) => [
            parsedMessage({ gmailThreadId: id, gmailMessageId: `m-${id}` }),
          ],
          getProfileHistoryId: async () => "hist-new",
          loadLabelMap: async () => LABEL_MAP,
          modifyThreadLabels,
        },
        analyze,
      });

      expect(result.status).toBe("PARTIAL");
      expect(analyze).toHaveBeenCalledTimes(3);
      expect(modifyThreadLabels).toHaveBeenCalledTimes(1);
      expect(modifyThreadLabels).toHaveBeenCalledWith("t1", expect.any(Array), expect.any(Array));
      expect(store.connection.historyId).toBeNull();
      expect(store.connection.lastSuccessfulScanAt).toBeNull();
      expect(store.scanRuns.at(-1)?.failedThreadIds).toEqual(["t2"]);
      expect(store.scanRuns.at(-1)?.errorCode).toBe("partial_thread_failures");
      expect(store.threads.get("conn-1:t1")?.analysis).toMatchObject({
        status: "action_required",
      });
      expect(store.threads.get("conn-1:t2")?.analysis).toBeNull();
      expect(store.threads.get("conn-1:t2")?.subject).toBeTruthy();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("reaches SUCCESS when a gateway timeout can be retried", async () => {
    const store = createMemoryStore();
    const modifyThreadLabels = vi.fn(async () => undefined);
    const message = parsedMessage();
    let calls = 0;
    const analyze = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: false as const,
          error: Object.assign(new Error("NVIDIA triage request failed"), { status: 504 }),
        };
      }
      return { ok: true as const, analysis: validAnalysis() };
    });
    const result = await runScan({
      store,
      gmail: {
        listMessageRefs: async () => [
          { id: message.gmailMessageId, threadId: message.gmailThreadId },
        ],
        listHistoryChanges: async () => {
          throw new Error("history should not run on the initial scan");
        },
        fetchThread: async () => [message],
        getProfileHistoryId: async () => "hist-new",
        loadLabelMap: async () => LABEL_MAP,
        modifyThreadLabels,
      },
      analyze,
    });

    expect(result.status).toBe("SUCCESS");
    expect(analyze).toHaveBeenCalledTimes(2);
    expect(modifyThreadLabels).toHaveBeenCalledTimes(1);
    expect(store.connection.historyId).toBe("hist-new");
    expect(store.scanRuns.at(-1)?.failedThreadIds ?? []).toEqual([]);
    expect(store.actions.size).toBe(1);
  });

  it("retries one schema rejection and still records a visible partial when it persists", async () => {
    const store = createMemoryStore();
    const modifyThreadLabels = vi.fn(async () => undefined);
    const message = parsedMessage();
    const analyze = vi.fn(async () => ({
      ok: false as const,
      error: Object.assign(new Error("NVIDIA JSON failed schema validation"), { code: "schema" }),
    }));
    const result = await runScan({
      store,
      gmail: {
        listMessageRefs: async () => [
          { id: message.gmailMessageId, threadId: message.gmailThreadId },
        ],
        listHistoryChanges: async () => {
          throw new Error("history should not run on the initial scan");
        },
        fetchThread: async () => [message],
        getProfileHistoryId: async () => "hist-new",
        loadLabelMap: async () => LABEL_MAP,
        modifyThreadLabels,
      },
      analyze,
    });

    expect(result.status).toBe("PARTIAL");
    expect(analyze).toHaveBeenCalledTimes(2);
    expect(modifyThreadLabels).not.toHaveBeenCalled();
    expect(store.connection.historyId).toBeNull();
    expect(store.scanRuns.at(-1)?.failedThreadIds).toEqual(["t1"]);
    expect(store.threads.get("conn-1:t1")?.analysis).toBeNull();
  });

  it("defers an AI request timeout that cannot finish inside the slice", async () => {
    const store = createMemoryStore();
    const modifyThreadLabels = vi.fn(async () => undefined);
    const analyze = vi.fn(async () => {
      throw new GmailRequestTimeoutError();
    });
    const result = await runScan({
      store,
      gmail: {
        requestBudget: { deadlineAt: Date.now() + 1_000 },
        listMessageRefs: async () => [{ id: "m1", threadId: "t1" }],
        listHistoryChanges: async () => ({ ok: true, refs: [], latestHistoryId: "hist-new" }),
        fetchThread: async () => [parsedMessage()],
        getProfileHistoryId: async () => "hist-new",
        loadLabelMap: async () => LABEL_MAP,
        modifyThreadLabels,
      },
      analyze,
    });

    expect(result.status).toBe("CONTINUED");
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(modifyThreadLabels).not.toHaveBeenCalled();
    expect(store.connection.historyId).toBeNull();
    expect(store.scanRuns[0]).toMatchObject({
      status: "RUNNING",
      threadCursor: 0,
      failedThreadIds: [],
    });
    expect(store.actions.size).toBe(0);
  });

  it("recovers a provider timeout through tryAnalyzeThread without calling the network", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const store = createMemoryStore();
    const modifyThreadLabels = vi.fn(async () => undefined);
    const fetchThread = vi.fn(async () => [parsedMessage()]);
    let calls = 0;
    const provider = new NvidiaEmailTriageProvider(
      {
        NVIDIA_API_KEY: "test-key",
        NVIDIA_MODEL: "openai/gpt-oss-20b",
        NVIDIA_BASE_URL: "https://example.invalid/v1",
      },
      () => {
        calls += 1;
        if (calls === 1) {
          return new Promise<{ text: string; usage: typeof ABSENT_USAGE }>(() => undefined);
        }
        return Promise.resolve({
          text: JSON.stringify(validAnalysis()),
          usage: ABSENT_USAGE,
        });
      },
    );
    try {
      const result = runScan({
        store,
        analyze: tryAnalyzeThread,
        provider,
        gmail: {
          requestBudget: { deadlineAt: SCAN_WORK_BUDGET_MS },
          listMessageRefs: async () => [{ id: "m1", threadId: "t1" }],
          listHistoryChanges: async () => ({ ok: true, refs: [], latestHistoryId: "hist-new" }),
          fetchThread,
          getProfileHistoryId: async () => "hist-new",
          loadLabelMap: async () => LABEL_MAP,
          modifyThreadLabels,
        },
      });
      await vi.advanceTimersByTimeAsync(NVIDIA_REQUEST_TIMEOUT_MS);
      await expect(result).resolves.toMatchObject({ status: "SUCCESS" });
      expect(calls).toBe(2);
      expect(fetchThread).toHaveBeenCalledTimes(2);
      expect(modifyThreadLabels).toHaveBeenCalledTimes(1);
      expect(store.connection.historyId).toBe("hist-new");
      expect(store.scanRuns.at(-1)?.failedThreadIds ?? []).toEqual([]);
      expect(store.actions.size).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves a thread resumable when the AI call hits the slice deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const store = createMemoryStore();
    const modifyThreadLabels = vi.fn(async () => undefined);
    const provider = new NvidiaEmailTriageProvider(
      {
        NVIDIA_API_KEY: "test-key",
        NVIDIA_MODEL: "openai/gpt-oss-20b",
        NVIDIA_BASE_URL: "https://example.invalid/v1",
      },
      () => new Promise<{ text: string; usage: typeof ABSENT_USAGE }>(() => undefined),
    );
    try {
      const result = runScan({
        store,
        analyze: tryAnalyzeThread,
        provider,
        gmail: {
          requestBudget: { deadlineAt: 100 },
          listMessageRefs: async () => [{ id: "m1", threadId: "t1" }],
          listHistoryChanges: async () => ({ ok: true, refs: [], latestHistoryId: "hist-new" }),
          fetchThread: async () => [parsedMessage()],
          getProfileHistoryId: async () => "hist-new",
          loadLabelMap: async () => LABEL_MAP,
          modifyThreadLabels,
        },
      });
      await vi.advanceTimersByTimeAsync(100);
      await expect(result).resolves.toMatchObject({ status: "CONTINUED" });
      expect(store.scanRuns[0]).toMatchObject({
        status: "RUNNING",
        threadCursor: 0,
        threadsAnalyzed: 0,
        failedThreadIds: [],
      });
      expect(store.connection.historyId).toBeNull();
      expect(modifyThreadLabels).not.toHaveBeenCalled();
      expect(store.actions.size).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retry a provider timeout unless refetch, analysis, and the label write fit", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const store = createMemoryStore();
    const modifyThreadLabels = vi.fn(async () => undefined);
    const fetchThread = vi.fn(async () => [parsedMessage()]);
    let calls = 0;
    const provider = new NvidiaEmailTriageProvider(
      {
        NVIDIA_API_KEY: "test-key",
        NVIDIA_MODEL: "openai/gpt-oss-20b",
        NVIDIA_BASE_URL: "https://example.invalid/v1",
      },
      () => {
        calls += 1;
        return new Promise<{ text: string; usage: typeof ABSENT_USAGE }>(() => undefined);
      },
    );
    // Enough for a second provider timeout, not for refetch + analysis + label write.
    const deadlineAt = NVIDIA_REQUEST_TIMEOUT_MS + NVIDIA_REQUEST_TIMEOUT_MS;
    try {
      const result = runScan({
        store,
        analyze: tryAnalyzeThread,
        provider,
        gmail: {
          requestBudget: { deadlineAt },
          listMessageRefs: async () => [{ id: "m1", threadId: "t1" }],
          listHistoryChanges: async () => ({ ok: true, refs: [], latestHistoryId: "hist-new" }),
          fetchThread,
          getProfileHistoryId: async () => "hist-new",
          loadLabelMap: async () => LABEL_MAP,
          modifyThreadLabels,
        },
      });
      await vi.advanceTimersByTimeAsync(deadlineAt);
      await expect(result).resolves.toMatchObject({ status: "CONTINUED" });
      expect(calls).toBe(1);
      expect(fetchThread).toHaveBeenCalledTimes(1);
      expect(store.scanRuns[0]).toMatchObject({
        status: "RUNNING",
        threadCursor: 0,
        failedThreadIds: [],
      });
      expect(modifyThreadLabels).not.toHaveBeenCalled();
      expect(store.connection.historyId).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("resumes a timed-out label write without analyzing or counting the thread twice", async () => {
    const store = createMemoryStore();
    const analyze = vi.fn(async () => ({ ok: true as const, analysis: validAnalysis() }));
    const fetchThread = vi.fn(async () => [parsedMessage()]);
    const modifyThreadLabels = vi
      .fn<ScanGmailPort["modifyThreadLabels"]>()
      .mockRejectedValueOnce(new GmailRequestTimeoutError())
      .mockResolvedValue(undefined);
    const gmail: ScanGmailPort = {
      requestBudget: { deadlineAt: Date.now() + SCAN_WORK_BUDGET_MS },
      listMessageRefs: async () => [{ id: "m1", threadId: "t1" }],
      listHistoryChanges: async () => {
        throw new Error("history should not run on the initial scan");
      },
      fetchThread,
      getProfileHistoryId: async () => "hist-new",
      loadLabelMap: async () => LABEL_MAP,
      modifyThreadLabels,
    };

    const first = await runScan({ store, gmail, analyze });
    expect(first.status).toBe("CONTINUED");
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(fetchThread).toHaveBeenCalledTimes(1);
    expect(modifyThreadLabels).toHaveBeenCalledTimes(1);
    expect(store.scanRuns[0]).toMatchObject({
      status: "RUNNING",
      threadCursor: 0,
      threadsAnalyzed: 0,
      failedThreadIds: [],
    });

    const prepared = await resumeGmailScan({
      scanId: first.scanId,
      gmailEmail: "me@example.com",
      gmail,
      store,
      provider: unusedProvider(),
      modelName: "gemini-test",
      analyze,
    });
    const second = await executeGmailScan(prepared);
    expect(second.status).toBe("SUCCESS");
    expect(second.counters.threadsAnalyzed).toBe(1);
    expect(second.counters.messagesProcessed).toBe(1);
    expect(second.counters.actionCount).toBe(1);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(fetchThread).toHaveBeenCalledTimes(2);
    expect(modifyThreadLabels).toHaveBeenCalledTimes(2);
    expect(store.actions.size).toBe(1);
    expect(store.scanRuns[0]?.failedThreadIds).toEqual([]);
    expect(store.connection.historyId).toBe("hist-new");
  });

  const storedPrompt = analysisPromptKey({
    vipSenders: [],
    ignoredSenders: [],
    ignoredDomains: [],
    customAiInstructions: "",
    timezone: "Asia/Jerusalem",
    dailyScanTime: "08:00",
  });

  it("skips the full Gmail fetch and AI when metadata matches the stored message id", async () => {
    const store = createMemoryStore();
    const message = parsedMessage();
    await store.upsertThread({
      userId: "user-1",
      connectionId: "conn-1",
      gmailThreadId: message.gmailThreadId,
      subject: message.subject,
      participants: [],
      latestMessageAt: "2026-09-10T10:00:00.000Z",
      latestMessageDirection: "INBOUND",
      analysis: validAnalysis(),
      lastAnalyzedMessageId: message.gmailMessageId,
      promptVersion: storedPrompt,
      modelName: "gemini-test",
      analysisScanId: "prior-scan",
    });
    const fetchThread = vi.fn(async () => [message]);
    const fetchThreadMetadata = vi.fn(async () => ({
      latestMessageId: message.gmailMessageId,
      labelIds: [] as string[],
    }));
    const analyze = vi.fn(async () => ({ ok: true as const, analysis: validAnalysis() }));
    const modifyThreadLabels = vi.fn(async () => undefined);
    const result = await runScan({
      store,
      analyze,
      gmail: {
        listMessageRefs: async () => [
          { id: message.gmailMessageId, threadId: message.gmailThreadId },
        ],
        listHistoryChanges: async () => {
          throw new Error("history should not run on the initial scan");
        },
        fetchThread,
        fetchThreadMetadata,
        getProfileHistoryId: async () => "hist-new",
        loadLabelMap: async () => LABEL_MAP,
        modifyThreadLabels,
      },
    });

    expect(result.status).toBe("SUCCESS");
    expect(fetchThreadMetadata).toHaveBeenCalledTimes(1);
    expect(fetchThread).not.toHaveBeenCalled();
    expect(analyze).not.toHaveBeenCalled();
    expect(modifyThreadLabels).toHaveBeenCalledWith(
      message.gmailThreadId,
      ["L_IMP", "L_ACT", "L_PROC"],
      [],
    );
    expect(store.scanRuns[0]).toMatchObject({
      threadCursor: 1,
      threadsChecked: 1,
      threadsAnalyzed: 0,
      failedThreadIds: [],
    });
    expect(store.messages.size).toBe(0);
  });

  it("returns an expired snooze to Actions without refetching an unchanged thread", async () => {
    const store = createMemoryStore();
    const message = parsedMessage();
    const scanNow = new Date("2026-09-10T12:00:00.000Z");
    const threadId = await store.upsertThread({
      userId: "user-1",
      connectionId: "conn-1",
      gmailThreadId: message.gmailThreadId,
      subject: message.subject,
      participants: [],
      latestMessageAt: "2026-09-10T10:00:00.000Z",
      latestMessageDirection: "INBOUND",
      analysis: validAnalysis(),
      lastAnalyzedMessageId: message.gmailMessageId,
      promptVersion: storedPrompt,
      modelName: "gemini-test",
      analysisScanId: "prior-scan",
    });
    await store.upsertAction("user-1", threadId, {
      status: "SNOOZED",
      title: "אשר את התקציב",
      description: "vendor contracts",
      actionType: "approve",
      waitingFor: null,
      deadline: null,
      urgency: "soon",
      source: "USER",
      manualOverride: true,
      completedAt: null,
      snoozedUntil: "2026-09-09T12:00:00.000Z",
    });
    const fetchThread = vi.fn(async () => [message]);
    const analyze = vi.fn(async () => ({ ok: true as const, analysis: validAnalysis() }));
    const result = await runScan({
      store,
      now: scanNow,
      analyze,
      gmail: {
        listMessageRefs: async () => [
          { id: message.gmailMessageId, threadId: message.gmailThreadId },
        ],
        listHistoryChanges: async () => {
          throw new Error("history should not run on the initial scan");
        },
        fetchThread,
        fetchThreadMetadata: async () => ({
          latestMessageId: message.gmailMessageId,
          labelIds: ["L_IMP", "L_ACT", "L_PROC"],
        }),
        getProfileHistoryId: async () => "hist-new",
        loadLabelMap: async () => LABEL_MAP,
        modifyThreadLabels: async () => undefined,
      },
    });

    expect(result.status).toBe("SUCCESS");
    expect(fetchThread).not.toHaveBeenCalled();
    expect(analyze).not.toHaveBeenCalled();
    expect(await store.getAction(threadId)).toMatchObject({
      status: "OPEN",
      snoozedUntil: null,
    });
  });

  it("keeps a future snooze and a manual completion when metadata matches", async () => {
    const store = createMemoryStore();
    const message = parsedMessage();
    const scanNow = new Date("2026-09-10T12:00:00.000Z");
    const snoozedThreadId = await store.upsertThread({
      userId: "user-1",
      connectionId: "conn-1",
      gmailThreadId: "t-snooze",
      subject: "Still snoozed",
      participants: [],
      latestMessageAt: "2026-09-10T10:00:00.000Z",
      latestMessageDirection: "INBOUND",
      analysis: validAnalysis(),
      lastAnalyzedMessageId: "m-snooze",
      promptVersion: storedPrompt,
      modelName: "gemini-test",
      analysisScanId: "prior-scan",
    });
    const completedThreadId = await store.upsertThread({
      userId: "user-1",
      connectionId: "conn-1",
      gmailThreadId: "t-done",
      subject: "Done",
      participants: [],
      latestMessageAt: "2026-09-10T10:00:00.000Z",
      latestMessageDirection: "INBOUND",
      analysis: validAnalysis(),
      lastAnalyzedMessageId: "m-done",
      promptVersion: storedPrompt,
      modelName: "gemini-test",
      analysisScanId: "prior-scan",
    });
    const snoozed: ActionRecord = {
      status: "SNOOZED",
      title: "אשר את התקציב",
      description: "vendor contracts",
      actionType: "approve",
      waitingFor: null,
      deadline: null,
      urgency: "soon",
      source: "USER",
      manualOverride: true,
      completedAt: null,
      snoozedUntil: "2026-09-12T12:00:00.000Z",
    };
    const completed: ActionRecord = {
      status: "COMPLETED",
      title: "אשר את התקציב",
      description: "vendor contracts",
      actionType: "approve",
      waitingFor: null,
      deadline: null,
      urgency: "soon",
      source: "USER",
      manualOverride: true,
      completedAt: "2026-09-10T11:00:00.000Z",
      snoozedUntil: null,
    };
    await store.upsertAction("user-1", snoozedThreadId, snoozed);
    await store.upsertAction("user-1", completedThreadId, completed);
    const fetchThread = vi.fn(async () => [message]);
    const result = await runScan({
      store,
      now: scanNow,
      gmail: {
        listMessageRefs: async () => [
          { id: "m-snooze", threadId: "t-snooze" },
          { id: "m-done", threadId: "t-done" },
        ],
        listHistoryChanges: async () => {
          throw new Error("history should not run on the initial scan");
        },
        fetchThread,
        fetchThreadMetadata: async (threadId: string) => ({
          latestMessageId: threadId === "t-snooze" ? "m-snooze" : "m-done",
          labelIds: ["L_IMP", "L_ACT", "L_PROC"],
        }),
        getProfileHistoryId: async () => "hist-new",
        loadLabelMap: async () => LABEL_MAP,
        modifyThreadLabels: async () => undefined,
      },
    });

    expect(result.status).toBe("SUCCESS");
    expect(fetchThread).not.toHaveBeenCalled();
    expect(await store.getAction(snoozedThreadId)).toEqual(snoozed);
    expect(await store.getAction(completedThreadId)).toEqual(completed);
  });

  it("full-fetches and classifies when the metadata message id does not match", async () => {
    const store = createMemoryStore();
    const message = parsedMessage();
    await store.upsertThread({
      userId: "user-1",
      connectionId: "conn-1",
      gmailThreadId: message.gmailThreadId,
      subject: message.subject,
      participants: [],
      latestMessageAt: "2026-09-10T10:00:00.000Z",
      latestMessageDirection: "INBOUND",
      analysis: validAnalysis(),
      lastAnalyzedMessageId: "previous-message",
      promptVersion: storedPrompt,
      modelName: "gemini-test",
      analysisScanId: "prior-scan",
    });
    const fetchThread = vi.fn(async () => [message]);
    const fetchThreadMetadata = vi.fn(async () => ({
      latestMessageId: message.gmailMessageId,
      labelIds: [] as string[],
    }));
    const analyze = vi.fn(async () => ({ ok: true as const, analysis: validAnalysis() }));
    const result = await runScan({
      store,
      analyze,
      gmail: {
        listMessageRefs: async () => [
          { id: message.gmailMessageId, threadId: message.gmailThreadId },
        ],
        listHistoryChanges: async () => {
          throw new Error("history should not run on the initial scan");
        },
        fetchThread,
        fetchThreadMetadata,
        getProfileHistoryId: async () => "hist-new",
        loadLabelMap: async () => LABEL_MAP,
        modifyThreadLabels: async () => undefined,
      },
    });

    expect(result.status).toBe("SUCCESS");
    expect(fetchThreadMetadata).toHaveBeenCalledTimes(1);
    expect(fetchThread).toHaveBeenCalledTimes(1);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(result.counters.threadsAnalyzed).toBe(1);
  });

  it("applies a wave's Gmail labels before the wave checkpoint", async () => {
    const store = createMemoryStore();
    const order: string[] = [];
    const originalUpdate = store.updateScanRun.bind(store);
    store.updateScanRun = async (scanId, patch) => {
      const waveCheckpoint =
        patch.status === "RUNNING" &&
        patch.threadCursor !== undefined &&
        patch.threadCursor >= 1 &&
        patch.failedThreadIds !== undefined &&
        patch.discoveryComplete === true &&
        patch.messagesProcessed !== undefined;
      if (waveCheckpoint) {
        order.push("checkpoint");
      }
      return originalUpdate(scanId, patch);
    };
    const message = parsedMessage();
    const result = await runScan({
      store,
      gmail: {
        listMessageRefs: async () => [
          { id: message.gmailMessageId, threadId: message.gmailThreadId },
        ],
        listHistoryChanges: async () => {
          throw new Error("history should not run on the initial scan");
        },
        fetchThread: async () => [message],
        getProfileHistoryId: async () => "hist-new",
        loadLabelMap: async () => LABEL_MAP,
        modifyThreadLabels: async () => {
          order.push("labels");
        },
      },
      analyze: async () => ({ ok: true as const, analysis: validAnalysis() }),
    });

    expect(result.status).toBe("SUCCESS");
    expect(order.indexOf("labels")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("checkpoint")).toBeGreaterThan(order.indexOf("labels"));
  });

  it("does not bump prompt_version when reanalysis fails", async () => {
    const store = createMemoryStore();
    const message = parsedMessage();
    await store.upsertThread({
      userId: "user-1",
      connectionId: "conn-1",
      gmailThreadId: message.gmailThreadId,
      subject: message.subject,
      participants: [],
      latestMessageAt: "2026-09-10T10:00:00.000Z",
      latestMessageDirection: "INBOUND",
      analysis: validAnalysis(),
      lastAnalyzedMessageId: "old-message",
      promptVersion: "mailpilot-triage-v8",
      modelName: "gemini-test",
    });
    const gmail: ScanGmailPort = {
      listMessageRefs: async () => [
        { id: message.gmailMessageId, threadId: message.gmailThreadId },
      ],
      listHistoryChanges: async () => {
        throw new Error("history should not run on the initial scan");
      },
      fetchThread: async () => [message],
      getProfileHistoryId: async () => "hist-1",
      loadLabelMap: async () => LABEL_MAP,
      modifyThreadLabels: async () => undefined,
    };

    await runScan({
      store,
      gmail,
      analyze: async () => ({ ok: false, error: new Error("gemini down") }),
    });

    expect([...store.threads.values()][0]?.promptVersion).toBe("mailpilot-triage-v8");
  });

  it("does not advance the Gmail history checkpoint after a partial incremental scan", async () => {
    const store = createMemoryStore();
    store.connection.historyId = "hist-1";
    store.connection.lastSuccessfulScanAt = "2026-09-10T08:00:00.000Z";
    const failed = parsedMessage({ gmailMessageId: "m-fail", gmailThreadId: "t-fail" });
    let profileReads = 0;
    const gmail: ScanGmailPort = {
      listMessageRefs: async () => {
        throw new Error("incremental scan must not list the lookback window");
      },
      listHistoryChanges: async (startHistoryId) => {
        expect(startHistoryId).toBe("hist-1");
        return {
          ok: true,
          refs: [{ id: failed.gmailMessageId, threadId: failed.gmailThreadId }],
          latestHistoryId: "hist-9",
        };
      },
      fetchThread: async () => [failed],
      getProfileHistoryId: async () => {
        profileReads += 1;
        return profileReads === 1 ? "hist-boundary" : "hist-should-not-persist";
      },
      loadLabelMap: async () => LABEL_MAP,
      modifyThreadLabels: async () => undefined,
    };

    const result = await runScan({
      store,
      gmail,
      analyze: async () => ({ ok: false, error: new Error("gemini down") }),
    });

    expect(result.status).toBe("PARTIAL");
    expect(result.mode).toBe("INCREMENTAL");
    expect(store.connection.historyId).toBe("hist-1");
    expect(store.connection.lastSuccessfulScanAt).toBe("2026-09-10T08:00:00.000Z");
    expect(store.connection.lastAttemptedScanAt).toBeTruthy();
  });

  it("retries thread ids recorded on the previous partial scan even when history is empty", async () => {
    const store = createMemoryStore();
    store.connection.historyId = "hist-1";
    store.connection.lastSuccessfulScanAt = "2026-09-10T08:00:00.000Z";
    store.scanRuns.push({
      id: "prev-partial",
      status: "PARTIAL",
      startedAt: "2026-09-11T08:00:00.000Z",
      connectionId: "conn-1",
      errorCode: "partial_thread_failures",
      errorMessage: "thread_failures:1:t-fail",
    });
    const failed = parsedMessage({ gmailMessageId: "m-fail", gmailThreadId: "t-fail" });
    const fetchThread = vi.fn(async () => [failed]);
    const gmail: ScanGmailPort = {
      listMessageRefs: async () => {
        throw new Error("incremental scan must not list the lookback window");
      },
      listHistoryChanges: async () => ({ ok: true, refs: [], latestHistoryId: "hist-2" }),
      fetchThread,
      getProfileHistoryId: async () => "hist-2",
      loadLabelMap: async () => LABEL_MAP,
      modifyThreadLabels: async () => undefined,
    };

    const result = await runScan({
      store,
      gmail,
      analyze: async () => ({ ok: true as const, analysis: validAnalysis() }),
    });

    expect(result.status).toBe("SUCCESS");
    expect(fetchThread).toHaveBeenCalledWith("t-fail");
    expect(result.counters.threadsAnalyzed).toBe(1);
    expect(store.connection.historyId).toBe("hist-2");
  });

  it("persists the history boundary captured before processing, not a later profile id", async () => {
    const store = createMemoryStore();
    const message = parsedMessage();
    let profileReads = 0;
    const gmail: ScanGmailPort = {
      listMessageRefs: async () => [
        { id: message.gmailMessageId, threadId: message.gmailThreadId },
      ],
      listHistoryChanges: async () => {
        throw new Error("history should not run on the initial scan");
      },
      fetchThread: async () => [message],
      getProfileHistoryId: async () => {
        profileReads += 1;
        return profileReads === 1 ? "hist-before" : "hist-after";
      },
      loadLabelMap: async () => LABEL_MAP,
      modifyThreadLabels: async () => undefined,
    };

    const result = await runScan({
      store,
      gmail,
      analyze: async () => ({ ok: true as const, analysis: validAnalysis() }),
    });

    expect(result.status).toBe("SUCCESS");
    expect(store.connection.historyId).toBe("hist-before");
    expect(profileReads).toBe(1);
  });

  it("keeps the daily scan schedule when a manual scan fails", async () => {
    const store = createMemoryStore();
    store.connection.nextScanAt = "2026-09-19T05:00:00.000Z";
    const message = parsedMessage();
    const gmail: ScanGmailPort = {
      listMessageRefs: async () => [
        { id: message.gmailMessageId, threadId: message.gmailThreadId },
      ],
      listHistoryChanges: async () => {
        throw new Error("history should not run on the initial scan");
      },
      fetchThread: async () => {
        throw { response: { status: 401 }, message: "invalid_grant" };
      },
      getProfileHistoryId: async () => "hist-1",
      loadLabelMap: async () => LABEL_MAP,
      modifyThreadLabels: async () => undefined,
    };

    await expect(
      runScan({
        store,
        gmail,
        analyze: async () => ({ ok: true as const, analysis: validAnalysis() }),
      }),
    ).rejects.toMatchObject({ response: { status: 401 } });

    expect(store.connection.nextScanAt).toBe("2026-09-19T05:00:00.000Z");
  });

  it("marks REAUTH_REQUIRED when Gmail returns 401 mid-scan", async () => {
    const store = createMemoryStore();
    const message = parsedMessage();
    const modifyThreadLabels = vi.fn(async () => undefined);
    const gmail: ScanGmailPort = {
      listMessageRefs: async () => [
        { id: message.gmailMessageId, threadId: message.gmailThreadId },
      ],
      listHistoryChanges: async () => {
        throw new Error("history should not run on the initial scan");
      },
      fetchThread: async () => {
        throw { response: { status: 401 }, message: "invalid_grant" };
      },
      getProfileHistoryId: async () => "hist-1",
      loadLabelMap: async () => LABEL_MAP,
      modifyThreadLabels,
    };

    await expect(
      runScan({
        store,
        gmail,
        analyze: async () => ({ ok: true as const, analysis: validAnalysis() }),
      }),
    ).rejects.toMatchObject({ response: { status: 401 } });

    expect(store.connection.status).toBe("REAUTH_REQUIRED");
    expect(store.scanRuns.at(-1)?.errorCode).toBe("reauth_required");
    expect(store.scanRuns.at(-1)?.errorMessage).not.toMatch(/invalid_grant/);
    expect(modifyThreadLabels).not.toHaveBeenCalled();
  });

  it("does not advance gmail historyId when a scan is only partial", async () => {
    const store = createMemoryStore();
    store.connection.historyId = "hist-prior";
    store.connection.lastSuccessfulScanAt = "2026-09-10T08:00:00.000Z";
    const message = parsedMessage();
    const getProfileHistoryId = vi.fn(async () => "hist-should-not-persist");

    const result = await runScan({
      store,
      gmail: {
        listMessageRefs: async () => {
          throw new Error("window listing should not run in incremental mode");
        },
        listHistoryChanges: async () => ({
          ok: true,
          refs: [{ id: message.gmailMessageId, threadId: message.gmailThreadId }],
          latestHistoryId: "hist-should-not-persist",
        }),
        fetchThread: async () => [message],
        getProfileHistoryId,
        loadLabelMap: async () => LABEL_MAP,
        modifyThreadLabels: async () => undefined,
      },
      analyze: async () => ({ ok: false, error: new Error("gemini down") }),
    });

    expect(result.status).toBe("PARTIAL");
    expect(getProfileHistoryId).toHaveBeenCalled();
    expect(store.connection.historyId).toBe("hist-prior");
    expect(store.connection.lastSuccessfulScanAt).toBe("2026-09-10T08:00:00.000Z");
  });

  it("does not overwrite last_successful_scan_at when a new scan fails outright", async () => {
    const store = createMemoryStore();
    const message = parsedMessage();
    const okGmail: ScanGmailPort = {
      listMessageRefs: async () => [
        { id: message.gmailMessageId, threadId: message.gmailThreadId },
      ],
      listHistoryChanges: async () => {
        throw new Error("history should not run on the initial scan");
      },
      fetchThread: async () => [message],
      getProfileHistoryId: async () => "hist-1",
      loadLabelMap: async () => LABEL_MAP,
      modifyThreadLabels: async () => undefined,
    };

    await runScan({
      store,
      gmail: okGmail,
      analyze: async () => ({ ok: true, analysis: validAnalysis() }),
    });
    const successfulAt = store.connection.lastSuccessfulScanAt;
    expect(successfulAt).toBeTruthy();

    const failingGmail: ScanGmailPort = {
      ...okGmail,
      listHistoryChanges: async () => {
        throw new Error("gmail history failed");
      },
    };

    await expect(
      runScan({
        store,
        gmail: failingGmail,
        analyze: async () => ({ ok: true, analysis: validAnalysis() }),
      }),
    ).rejects.toThrow("gmail history failed");

    expect(store.connection.lastSuccessfulScanAt).toBe(successfulAt);
    expect(store.connection.lastAttemptedScanAt).toBeTruthy();
  });

  it("reanalyzes only the thread returned by history", async () => {
    const store = createMemoryStore();
    store.connection.historyId = "hist-1";
    store.connection.lastSuccessfulScanAt = "2026-09-10T08:00:00.000Z";
    await store.upsertThread({
      userId: "user-1",
      connectionId: "conn-1",
      gmailThreadId: "t-old",
      subject: "Old",
      participants: [],
      latestMessageAt: "2026-09-09T10:00:00.000Z",
      latestMessageDirection: "INBOUND",
      analysis: validAnalysis(),
      lastAnalyzedMessageId: "m-old",
      promptVersion: "v",
      modelName: "gemini-test",
    });

    const newMessage = parsedMessage({ gmailMessageId: "m-new", gmailThreadId: "t-new" });
    const analyze = vi.fn(async () => ({ ok: true as const, analysis: validAnalysis() }));
    const fetchThread = vi.fn(async (threadId: string) => {
      expect(threadId).toBe("t-new");
      return [newMessage];
    });

    const result = await runScan({
      store,
      gmail: {
        listMessageRefs: async () => {
          throw new Error("should not list the window");
        },
        listHistoryChanges: async () => ({
          ok: true,
          refs: [{ id: "m-new", threadId: "t-new" }],
          latestHistoryId: "hist-2",
        }),
        fetchThread,
        getProfileHistoryId: async () => "hist-2",
        loadLabelMap: async () => LABEL_MAP,
        modifyThreadLabels: async () => undefined,
      },
      analyze,
    });

    expect(result.mode).toBe("INCREMENTAL");
    expect(result.counters.threadsAnalyzed).toBe(1);
    expect(fetchThread).toHaveBeenCalledTimes(1);
    expect(analyze).toHaveBeenCalledTimes(1);
  });

  it("falls back to an overlap query when historyId is stale", async () => {
    const store = createMemoryStore();
    store.connection.historyId = "stale";
    store.connection.lastSuccessfulScanAt = "2026-09-10T12:00:00.000Z";
    const message = parsedMessage({ gmailMessageId: "m-overlap" });
    const now = new Date("2026-09-10T14:00:00.000Z");
    const epoch = Math.floor(Date.parse("2026-09-10T11:00:00.000Z") / 1000);
    const listMessageRefs = vi.fn(async (query: string) => {
      expect(query).toBe(`-in:spam -in:trash after:${epoch}`);
      return [{ id: message.gmailMessageId, threadId: message.gmailThreadId }];
    });

    const result = await runScan({
      store,
      gmail: {
        listMessageRefs,
        listHistoryChanges: async () => ({ ok: false, stale: true }),
        fetchThread: async () => [message],
        getProfileHistoryId: async () => "hist-fresh",
        loadLabelMap: async () => LABEL_MAP,
        modifyThreadLabels: async () => undefined,
      },
      analyze: async () => ({ ok: true, analysis: validAnalysis() }),
      now,
    });

    expect(result.mode).toBe("RECOVERY");
    expect(listMessageRefs).toHaveBeenCalledTimes(1);
    expect(store.threads.size).toBe(1);
    expect(store.connection.historyId).toBe("hist-fresh");
  });

  it("records thread progress as conversations are checked", async () => {
    const store = createMemoryStore();
    const first = parsedMessage({ gmailMessageId: "m1", gmailThreadId: "t1" });
    const second = parsedMessage({ gmailMessageId: "m2", gmailThreadId: "t2" });
    const result = await runScan({
      store,
      gmail: {
        listMessageRefs: async () => [
          { id: first.gmailMessageId, threadId: first.gmailThreadId },
          { id: second.gmailMessageId, threadId: second.gmailThreadId },
        ],
        listHistoryChanges: async () => {
          throw new Error("history should not run on the initial scan");
        },
        fetchThread: async (threadId) => [threadId === "t2" ? second : first],
        getProfileHistoryId: async () => "hist-1",
        loadLabelMap: async () => LABEL_MAP,
        modifyThreadLabels: async () => undefined,
      },
      analyze: async () => ({ ok: true, analysis: validAnalysis() }),
    });

    expect(result.status).toBe("SUCCESS");
    expect(store.progressChecks[0]).toBe(0);
    expect(store.progressChecks).toContain(1);
    expect(store.progressChecks.at(-1)).toBe(2);
    expect(store.liveCursorAdvances).toBe(0);
  });

  it("stops a cancelled scan without finishing remaining threads or advancing history", async () => {
    vi.stubEnv("AI_MAX_CONCURRENCY", "1");
    const store = createMemoryStore();
    const analyze = vi.fn(async () => ({ ok: true as const, analysis: validAnalysis() }));
    try {
      const result = await runScan({
        store,
        gmail: {
          listMessageRefs: async () => [
            { id: "m1", threadId: "t1" },
            { id: "m2", threadId: "t2" },
          ],
          listHistoryChanges: async () => {
            throw new Error("history should not run on the initial scan");
          },
          fetchThread: async (threadId) => {
            const running = store.scanRuns.find((run) => run.status === "RUNNING");
            if (running) {
              await store.failScan(running.id, "cancelled", "stopped");
            }
            return [parsedMessage({ gmailThreadId: threadId, gmailMessageId: `m-${threadId}` })];
          },
          getProfileHistoryId: async () => "hist-new",
          loadLabelMap: async () => LABEL_MAP,
          modifyThreadLabels: async () => undefined,
        },
        analyze,
      });
      expect(result.status).toBe("FAILED");
      expect(store.scanRuns[0]?.status).toBe("FAILED");
      expect(store.connection.historyId).toBeNull();
      expect(analyze.mock.calls.length).toBeLessThan(2);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("does not finalize a scan that was cancelled after all threads were processed", async () => {
    vi.stubEnv("AI_MAX_CONCURRENCY", "1");
    const store = createMemoryStore();
    const originalUpdate = store.updateScanRun.bind(store);
    store.updateScanRun = async (scanId, patch) => {
      if (patch.status === "SUCCESS" || patch.status === "PARTIAL") {
        await store.failScan(scanId, "cancelled", "stopped");
        return false;
      }
      return originalUpdate(scanId, patch);
    };
    try {
      const result = await runScan({
        store,
        gmail: {
          listMessageRefs: async () => [{ id: "m1", threadId: "t1" }],
          listHistoryChanges: async () => {
            throw new Error("history should not run on the initial scan");
          },
          fetchThread: async (threadId) => [
            parsedMessage({ gmailThreadId: threadId, gmailMessageId: `m-${threadId}` }),
          ],
          getProfileHistoryId: async () => "hist-new",
          loadLabelMap: async () => LABEL_MAP,
          modifyThreadLabels: async () => undefined,
        },
        analyze: async () => ({ ok: true as const, analysis: validAnalysis() }),
      });
      expect(result.status).toBe("FAILED");
      expect(store.scanRuns[0]?.status).toBe("FAILED");
      expect(store.scanRuns[0]?.errorCode).toBe("cancelled");
      expect(store.connection.historyId).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("openGmailScan user emails", () => {
  it("merges Gmail sendAs aliases into the authenticated address list", async () => {
    const store = createMemoryStore();
    const prepared = await openGmailScan({
      userId: "user-1",
      connectionId: "conn-1",
      gmailEmail: "me@example.com",
      lookbackDays: 7,
      now: new Date("2026-09-10T12:00:00.000Z"),
      gmail: {
        listMessageRefs: async () => [],
        listHistoryChanges: async () => ({ ok: true, refs: [], latestHistoryId: "1" }),
        fetchThread: async () => [],
        getProfileHistoryId: async () => "hist-1",
        loadLabelMap: async () => LABEL_MAP,
        modifyThreadLabels: async () => undefined,
        listSendAsEmails: async () => ["me@example.com", "alias@example.com"],
      },
      store,
      provider: unusedProvider(),
      modelName: "gemini-test",
    });
    expect(prepared.userEmails).toEqual(["me@example.com", "alias@example.com"]);
  });

  it("keeps the primary address when sendAs listing fails", async () => {
    const store = createMemoryStore();
    const prepared = await openGmailScan({
      userId: "user-1",
      connectionId: "conn-1",
      gmailEmail: "me@example.com",
      lookbackDays: 7,
      now: new Date("2026-09-10T12:00:00.000Z"),
      gmail: {
        listMessageRefs: async () => [],
        listHistoryChanges: async () => ({ ok: true, refs: [], latestHistoryId: "1" }),
        fetchThread: async () => [],
        getProfileHistoryId: async () => "hist-1",
        loadLabelMap: async () => LABEL_MAP,
        modifyThreadLabels: async () => undefined,
        listSendAsEmails: async () => {
          throw new Error("sendAs unavailable");
        },
      },
      store,
      provider: unusedProvider(),
      modelName: "gemini-test",
    });
    expect(prepared.userEmails).toEqual(["me@example.com"]);
  });
});

describe("openGmailScan admission", () => {
  const dummyGmail: ScanGmailPort = {
    listMessageRefs: async () => [],
    listHistoryChanges: async () => ({ ok: true, refs: [], latestHistoryId: "1" }),
    fetchThread: async () => [],
    getProfileHistoryId: async () => "hist-1",
    loadLabelMap: async () => LABEL_MAP,
    modifyThreadLabels: async () => undefined,
  };

  async function admit(
    store: ReturnType<typeof createMemoryStore>,
    now = new Date("2026-09-10T12:00:00.000Z"),
  ) {
    return openGmailScan({
      userId: "user-1",
      connectionId: "conn-1",
      gmailEmail: "me@example.com",
      lookbackDays: 7,
      now,
      gmail: dummyGmail,
      store,
      provider: unusedProvider(),
      modelName: "gemini-test",
    });
  }

  it("rejects a second scan while one is already running", async () => {
    const store = createMemoryStore();
    await admit(store);
    expect(store.connection.lastAttemptedScanAt).toBeTruthy();
    await expect(admit(store)).rejects.toThrow("SCAN_IN_PROGRESS");
    expect(store.scanRuns.filter((run) => run.status === "RUNNING")).toHaveLength(1);
  });

  it("fails only the new scan if updating its connection fails after insert", async () => {
    const store = createMemoryStore();
    const error = new Error("synthetic connection update failure");
    store.updateConnectionScan = vi
      .fn(store.updateConnectionScan.bind(store))
      .mockRejectedValueOnce(error);
    await expect(admit(store)).rejects.toBe(error);
    expect(store.scanRuns).toHaveLength(1);
    expect(store.scanRuns[0]).toMatchObject({
      status: "FAILED",
      errorCode: "scan_preparation_failed",
    });
    await expect(admit(store)).resolves.toHaveProperty("scanId");
    expect(store.scanRuns.filter((run) => run.status === "RUNNING")).toHaveLength(1);
  });

  it("rejects concurrent inserts for the same connection", async () => {
    const store = createMemoryStore();
    const first = store.insertScanRun({
      userId: "user-1",
      connectionId: "conn-1",
      triggerType: "MANUAL",
      windowStart: "2026-09-10T00:00:00.000Z",
      windowEnd: "2026-09-10T12:00:00.000Z",
      lookbackDays: 7,
    });
    const second = store.insertScanRun({
      userId: "user-1",
      connectionId: "conn-1",
      triggerType: "SCHEDULED",
      windowStart: "2026-09-10T00:00:00.000Z",
      windowEnd: "2026-09-10T12:00:00.000Z",
      lookbackDays: 7,
    });
    const results = await Promise.allSettled([first, second]);
    const accepted = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({ message: "SCAN_IN_PROGRESS" }),
    });
  });

  it("fails a stale running scan and then admits a new one", async () => {
    const store = createMemoryStore();
    const now = new Date("2026-09-10T12:00:00.000Z");
    store.scanRuns.push({
      id: "stale",
      status: "RUNNING",
      startedAt: new Date(now.getTime() - 21 * 60_000).toISOString(),
      updatedAt: new Date(now.getTime() - 21 * 60_000).toISOString(),
      connectionId: "conn-1",
    });
    const prepared = await admit(store, now);
    expect(prepared.scanId).not.toBe("stale");
    expect(store.scanRuns.find((run) => run.id === "stale")?.status).toBe("FAILED");
    expect(store.scanRuns.filter((run) => run.status === "RUNNING")).toHaveLength(1);
  });

  it("clears gmail historyId when a running scan fails hard", async () => {
    const store = createMemoryStore();
    store.connection.historyId = "hist-prior";
    store.connection.lastSuccessfulScanAt = "2026-09-10T08:00:00.000Z";
    await expect(
      runScan({
        store,
        gmail: {
          getProfileHistoryId: async () => {
            throw new Error("gmail boom");
          },
          listHistoryChanges: async () => ({ ok: true as const, refs: [], latestHistoryId: "x" }),
          listMessageRefs: async () => [],
          fetchThread: async () => {
            throw new Error("unused");
          },
          loadLabelMap: async () => LABEL_MAP,
          modifyThreadLabels: async () => {},
        },
      }),
    ).rejects.toThrow(/gmail boom/);
    expect(store.connection.historyId).toBeNull();
  });

  it("does not leave a RUNNING scan if settings fail to load", async () => {
    const store = createMemoryStore();
    store.getSettings = async () => {
      throw new Error("settings unavailable");
    };
    await expect(admit(store)).rejects.toThrow("settings unavailable");
    expect(store.scanRuns).toHaveLength(0);
  });
});

describe("triageFailureCode", () => {
  it("records provider HTTP status and timeouts without the message text", () => {
    expect(
      triageFailureCode(Object.assign(new Error("NVIDIA triage request failed"), { status: 410 })),
    ).toBe("http_410");
    expect(
      triageFailureCode({
        code: "provider",
        message: "Email triage provider failed",
        cause: { code: "provider", message: "NVIDIA triage request timed out" },
      }),
    ).toBe("provider_timeout");
    expect(
      triageFailureCode({
        message: "fetch failed",
        cause: {
          name: "HeadersTimeoutError",
          code: "UND_ERR_HEADERS_TIMEOUT",
          message: "Headers Timeout Error",
        },
      }),
    ).toBe("provider_timeout");
    const gatewayTimeout = Object.assign(new Error("NVIDIA triage request failed"), {
      status: 504,
    });
    expect(triageFailureCode(gatewayTimeout)).toBe("http_504");
    expect(isRecoverableAnalysisTimeout(gatewayTimeout)).toBe(true);
    expect(isRecoverableAnalysisTimeout(new Error("gemini down"))).toBe(false);
    expect(triageFailureCode(new Error("Failed to upsert email thread: check constraint"))).toBe(
      "failed_to_upsert_email_thread",
    );
  });
});

describe("shouldReuseStoredAnalysis", () => {
  it("reuses analysis only when parseable analysis, message id, and prompt version match", () => {
    const analysis = validAnalysis();
    const row = {
      id: "thread-1",
      lastAnalyzedMessageId: "m1",
      promptVersion: TRIAGE_PROMPT_VERSION,
      analysis,
    };
    expect(shouldReuseStoredAnalysis(row, "m1", TRIAGE_PROMPT_VERSION)).toBe(true);
    expect(shouldReuseStoredAnalysis(row, "m1", "mailpilot-triage-v3")).toBe(false);
    expect(shouldReuseStoredAnalysis(row, "m2", TRIAGE_PROMPT_VERSION)).toBe(false);
    expect(shouldReuseStoredAnalysis(null, "m1", "mailpilot-triage-v4")).toBe(false);
    expect(shouldReuseStoredAnalysis({ ...row, analysis: null }, "m1", TRIAGE_PROMPT_VERSION)).toBe(
      false,
    );
  });

  it("changes the analysis key when ignore lists or custom instructions change", () => {
    const base: ScanSettings = {
      vipSenders: [],
      ignoredSenders: [],
      ignoredDomains: [],
      customAiInstructions: "",
      timezone: "Asia/Jerusalem",
      dailyScanTime: "08:00",
    };
    const withIgnore = { ...base, ignoredDomains: ["news.example.com"] };
    expect(analysisPromptKey(base)).not.toBe(analysisPromptKey(withIgnore));
    expect(
      shouldReuseStoredAnalysis(
        {
          id: "thread-1",
          lastAnalyzedMessageId: "m1",
          promptVersion: analysisPromptKey(base),
          analysis: validAnalysis(),
        },
        "m1",
        analysisPromptKey(withIgnore),
      ),
    ).toBe(false);
  });
});

describe("executeGmailScan lease safety", () => {
  it("skips thread writes when the slice lease expires during analyze", async () => {
    leaseCheckState.holds = true;
    const store = createMemoryStore();
    const modifyThreadLabels = vi.fn(async () => undefined);
    const prepared = await openGmailScan({
      userId: "user-1",
      connectionId: "conn-1",
      gmailEmail: "me@example.com",
      lookbackDays: 7,
      now: new Date("2026-09-10T12:00:00.000Z"),
      gmail: {
        listMessageRefs: async () => [{ id: "m1", threadId: "t1" }],
        listHistoryChanges: async () => {
          throw new Error("history should not run on the initial scan");
        },
        fetchThread: async (threadId) => [
          parsedMessage({ gmailThreadId: threadId, gmailMessageId: `m-${threadId}` }),
        ],
        getProfileHistoryId: async () => "hist-new",
        loadLabelMap: async () => LABEL_MAP,
        modifyThreadLabels,
      },
      store,
      provider: unusedProvider(),
      modelName: "gemini-test",
    });

    const result = await executeGmailScan({
      ...prepared,
      jobLease: { jobId: "job-1", workerId: "worker-1" },
      analyze: async () => {
        leaseCheckState.holds = false;
        return { ok: true as const, analysis: validAnalysis() };
      },
    });

    expect(store.threads.size).toBe(0);
    expect(modifyThreadLabels).not.toHaveBeenCalled();
    // Lease loss must leave the scan RUNNING and ask for another slice so the
    // UI is not stuck on a frozen progress bar with no recovery path.
    expect(result.status).toBe("CONTINUED");
    expect(store.scanRuns[0]?.status).toBe("RUNNING");
  });
});
