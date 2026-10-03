import { google, type gmail_v1 } from "googleapis";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  MAILPILOT_LABELS,
  isStoredManagedLabelCurrent,
  legacyGmailLabelName,
  type MailPilotLogicalLabel,
} from "@/lib/gmail/constants";
import { createOAuth2Client } from "@/lib/gmail/oauth";
import { GMAIL_UNITS } from "@/lib/gmail/quota";
import { withGmailRetry } from "@/lib/gmail/retry";
import type { GmailRequestBudget } from "@/lib/gmail/request-budget";

export interface EnsureManagedLabelsOptions extends GmailRequestBudget {
  delaysMs?: number[];
}

export function isLabelMapComplete(labelMap: Map<MailPilotLogicalLabel, string>): boolean {
  return MAILPILOT_LABELS.every((spec) => labelMap.has(spec.logicalName));
}

/**
 * Ensure managed MailPriority/ labels exist in Gmail and persist the
 * logical_name -> gmail_label_id mapping. Renames a previous MailPilot/
 * label in place (same id) so threads keep it. Idempotent.
 */
export async function ensureManagedLabels(
  connectionId: string,
  accessToken: string,
  refreshToken: string,
  options: EnsureManagedLabelsOptions = {},
): Promise<void> {
  const client = createOAuth2Client();
  client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
  const gmail = google.gmail({ version: "v1", auth: client });
  await ensureManagedLabelsWithClient(gmail, connectionId, options);
}

/**
 * Same as {@link ensureManagedLabels} when a Gmail client is already available
 * (e.g. during a scan). Idempotent.
 */
export async function ensureManagedLabelsWithClient(
  gmail: gmail_v1.Gmail,
  connectionId: string,
  options: EnsureManagedLabelsOptions = {},
): Promise<void> {
  const existing = await listAllLabels(gmail, options);
  const byName = new Map(
    existing
      .filter((label) => typeof label.name === "string" && typeof label.id === "string")
      .map((label) => [label.name as string, label.id as string]),
  );

  const db = createAdminClient();

  for (const spec of MAILPILOT_LABELS) {
    let gmailLabelId = byName.get(spec.gmailLabelName);
    if (!gmailLabelId) {
      const legacyName = legacyGmailLabelName(spec.gmailLabelName);
      if (legacyName && byName.has(legacyName)) {
        gmailLabelId = await renameGmailLabel(
          gmail,
          byName,
          legacyName,
          spec.gmailLabelName,
          options,
        );
      } else {
        const created = await withGmailRetry(
          (retryOptions) =>
            gmail.users.labels.create(
              {
                userId: "me",
                requestBody: {
                  name: spec.gmailLabelName,
                  labelListVisibility: "labelShow",
                  messageListVisibility: "show",
                },
              },
              retryOptions,
            ),
          { ...options, units: GMAIL_UNITS.labelsCreate, delaysMs: options.delaysMs },
        );
        if (!created.data.id) {
          throw new Error(`Failed to create Gmail label ${spec.gmailLabelName}`);
        }
        gmailLabelId = created.data.id;
        byName.set(spec.gmailLabelName, gmailLabelId);
      }
    }

    const { error } = await db.from("gmail_labels").upsert(
      {
        gmail_connection_id: connectionId,
        logical_name: spec.logicalName,
        gmail_label_id: gmailLabelId,
        gmail_label_name: spec.gmailLabelName,
      },
      { onConflict: "gmail_connection_id,logical_name" },
    );
    if (error) {
      throw new Error(`Failed to store label mapping for ${spec.logicalName}`);
    }
  }
}

/**
 * Connection-first alias for {@link ensureManagedLabelsWithClient} (label reconcile).
 */
export async function ensureManagedLabelsWithGmail(
  connectionId: string,
  gmail: gmail_v1.Gmail,
  options: EnsureManagedLabelsOptions = {},
): Promise<void> {
  return ensureManagedLabelsWithClient(gmail, connectionId, options);
}

async function renameGmailLabel(
  gmail: gmail_v1.Gmail,
  byName: Map<string, string>,
  fromName: string,
  toName: string,
  options: EnsureManagedLabelsOptions,
): Promise<string> {
  const currentId = byName.get(toName);
  if (currentId) {
    return currentId;
  }
  const labelId = byName.get(fromName);
  if (!labelId) {
    throw new Error(`Missing Gmail label ${fromName}`);
  }
  const renamed = await withGmailRetry(
    (retryOptions) =>
      gmail.users.labels.patch(
        {
          userId: "me",
          id: labelId,
          requestBody: { name: toName },
        },
        retryOptions,
      ),
    { ...options, units: GMAIL_UNITS.labelsPatch, delaysMs: options.delaysMs },
  );
  const id = renamed.data.id ?? labelId;
  byName.delete(fromName);
  byName.set(toName, id);
  return id;
}

async function listAllLabels(
  gmail: gmail_v1.Gmail,
  options: EnsureManagedLabelsOptions = {},
): Promise<gmail_v1.Schema$Label[]> {
  const res = await withGmailRetry(
    (retryOptions) => gmail.users.labels.list({ userId: "me" }, retryOptions),
    {
      ...options,
      units: GMAIL_UNITS.labelsList,
      delaysMs: options.delaysMs,
    },
  );
  return res.data.labels ?? [];
}

export async function loadLabelIdMap(
  connectionId: string,
): Promise<Map<MailPilotLogicalLabel, string>> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("gmail_labels")
    .select("logical_name, gmail_label_id, gmail_label_name")
    .eq("gmail_connection_id", connectionId);
  if (error) {
    throw new Error("Failed to load managed Gmail label mappings");
  }
  const map = new Map<MailPilotLogicalLabel, string>();
  for (const row of data ?? []) {
    const logical = row.logical_name;
    if (
      typeof logical === "string" &&
      typeof row.gmail_label_id === "string" &&
      typeof row.gmail_label_name === "string" &&
      isStoredManagedLabelCurrent(logical, row.gmail_label_name)
    ) {
      map.set(logical as MailPilotLogicalLabel, row.gmail_label_id);
    }
  }
  return map;
}

export async function modifyThreadLabels(
  gmail: gmail_v1.Gmail,
  threadId: string,
  addLabelIds: string[],
  removeLabelIds: string[],
  budget: GmailRequestBudget = {},
): Promise<void> {
  if (addLabelIds.length === 0 && removeLabelIds.length === 0) {
    return;
  }
  await withGmailRetry(
    (options) =>
      gmail.users.threads.modify(
        {
          userId: "me",
          id: threadId,
          requestBody: {
            addLabelIds,
            removeLabelIds,
          },
        },
        options,
      ),
    { ...budget, units: GMAIL_UNITS.threadsModify },
  );
}
