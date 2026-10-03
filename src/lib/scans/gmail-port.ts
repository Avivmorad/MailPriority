import type { gmail_v1 } from "googleapis";

import { listSendAsEmails } from "@/lib/gmail/aliases";
import {
  ensureManagedLabelsWithClient,
  loadLabelIdMap,
  modifyThreadLabels,
} from "@/lib/gmail/labels";
import { listHistoryChanges } from "@/lib/gmail/history-list";
import {
  fetchAndParseThread,
  fetchProfileHistoryId,
  fetchThreadMetadata,
  listMessageRefs,
} from "@/lib/gmail/messages";
import type { ScanGmailPort } from "@/lib/scans/types";
import { SCAN_WORK_BUDGET_MS } from "@/lib/scans/dispatch-budget";
import type { GmailRequestBudget } from "@/lib/gmail/request-budget";

export function createGmailScanPort(
  gmail: gmail_v1.Gmail,
  connectionId: string,
  requestBudget: GmailRequestBudget = { deadlineAt: Date.now() + SCAN_WORK_BUDGET_MS },
): ScanGmailPort {
  return {
    requestBudget,
    listMessageRefs: (query) => listMessageRefs(gmail, query, requestBudget),
    listHistoryChanges: (startHistoryId) =>
      listHistoryChanges(gmail, startHistoryId, requestBudget),
    fetchThread: (threadId) => fetchAndParseThread(gmail, threadId, requestBudget),
    fetchThreadMetadata: (threadId) => fetchThreadMetadata(gmail, threadId, requestBudget),
    getProfileHistoryId: () => fetchProfileHistoryId(gmail, requestBudget),
    loadLabelMap: () => loadLabelIdMap(connectionId),
    // Create missing labels if post-connect after() setup did not finish.
    ensureManagedLabels: () => ensureManagedLabelsWithClient(gmail, connectionId, requestBudget),
    modifyThreadLabels: (threadId, addLabelIds, removeLabelIds) =>
      modifyThreadLabels(gmail, threadId, addLabelIds, removeLabelIds, requestBudget),
    listSendAsEmails: () => listSendAsEmails(gmail, requestBudget),
  };
}
