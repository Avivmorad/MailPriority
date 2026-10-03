# Architecture

How MailPriority is built. Product behavior lives in [`PRODUCT.md`](PRODUCT.md).
Setup and env live in [`SETUP.md`](SETUP.md).

## Stack

| Layer       | Choice                                                                                              |
| ----------- | --------------------------------------------------------------------------------------------------- |
| App         | Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui                                    |
| Data / auth | Supabase Postgres + RLS; Supabase Auth for the app account                                          |
| Gmail       | Separate Google OAuth (`gmail.modify`); refresh tokens AES-256-GCM                                  |
| AI          | NVIDIA Build when `NVIDIA_API_KEY` is set; otherwise Google Gemini                                  |
| Hosting     | Vercel (Hobby-safe: one connection per invocation, daily cycle chains the rest, `maxDuration` 300s) |
| CI          | GitHub Actions: format, lint, typecheck, unit, integration, eval, build                             |

## System overview

```text
Browser (Next.js App Router)
  ├─ Supabase Auth          MailPriority account (no Gmail scopes)
  └─ App UI                 dashboard, Mail tabs, History, settings, onboarding

Server (Vercel)
  ├─ Connect Gmail          OAuth gmail.modify → encrypted refresh token
  ├─ Scan pipeline          Gmail fetch → MIME/thread parse → triage JSON
  │                         → Zod + post-process → Postgres upserts → labels
  ├─ Incremental sync       Gmail History API (stale historyId recovery)
  └─ Cron dispatcher        one daily cron; each slice claims one due connection, then chains the rest

Supabase Postgres + RLS     profiles, connections, threads, actions, scans, History entries
NVIDIA Build or Gemini      structured ThreadAnalysis JSON only
```

Manual Scan now and scheduled scans share the same pipeline.

## Scan pipeline

1. Discover threads (lookback query or History API delta).
2. Fetch and parse MIME / thread context (`src/lib/gmail/`).
3. Call the triage provider for structured JSON (`src/lib/ai/`).
4. Validate with Zod + invariant post-processing.
5. Upsert threads, messages (metadata only — no long-term bodies), actions.
6. Apply `MailPriority/*` labels **only after** validated analysis. An existing
   `MailPilot/*` managed label is renamed in place first, so threads keep it.
7. On window finish `SUCCESS` or `PARTIAL`, write a History entry when enabled.
8. Advance Gmail `historyId` only on `SUCCESS`.

Provider HTTP attempts also append one `triage_usage` row (best-effort; must not
fail the scan or skip labels). See **Token / cost telemetry** below.

### Scan modes

| Mode               | Behavior                                                                   |
| ------------------ | -------------------------------------------------------------------------- |
| Initial / lookback | Gmail `newer_than` for 1–30 day windows (default 7)                        |
| Incremental        | Gmail History API since last successful `historyId`                        |
| Scheduled          | One daily cron; each slice claims one due connection, then chains the rest |
| Chunk resume       | `RUNNING` scan keeps a thread cursor across ~240s work slices              |

Constraints:

- At most one `RUNNING` scan per Gmail connection (`0008_scan_admission.sql`).
- Job lease ~270s; Hobby `maxDuration` 300s. One daily cron chains slices until the due queue drains or a backlog alert fires.
- Gmail unit budget: rolling one-minute window (default 12,000 units).
- Failed or invalid AI does **not** apply Gmail labels.

Key code: `src/lib/scans/process-scan.ts`, `src/lib/scans/dispatcher.ts`,
`src/lib/gmail/history.ts`, migration `0012_scan_chunk_resume.sql`.

## AI triage

When `NVIDIA_API_KEY` is set, scans use **NVIDIA Build**
(`https://integrate.api.nvidia.com/v1/chat/completions`, JSON object output).
Otherwise **Google Gemini** with JSON Schema structured output
(`responseMimeType: application/json` + `responseJsonSchema`). Both paths run
Zod + invariant post-processing.

- Providers: `NvidiaEmailTriageProvider` / `GeminiEmailTriageProvider` behind
  `EmailTriageProvider` (`createEmailTriageProvider` in `src/lib/ai/client.ts`).
- Domain code must not import `@google/genai` outside `src/lib/ai/client.ts`, or
  call the NVIDIA HTTP API outside `src/lib/ai/nvidia.ts`.
- Email text is untrusted prompt content (wrapped with begin/end markers).
- AI output is untrusted until schema + invariants pass.

### ThreadAnalysis contract

Canonical fields (see `src/lib/ai/schemas.ts`):

- `summary`, `short_display_title` (English)
- `importance` (`high` | `medium` | `low`) + `importance_reason` (English Why this tab line)
- `status` (`action_required` | `waiting` | `informational` | `resolved` | `ignore`)
- `requires_action`, `requires_reply`, `action_type`, `action_summary` (English Do line), `action_reason` (English Why this tab line)
- `waiting_for`, `waiting_since`
- `urgency`, `deadline` (`YYYY-MM-DD` or null), `deadline_text`
- `category` (14-topic taxonomy in [`PRODUCT.md`](PRODUCT.md))
- `sender_name`, `organization`, `confidence` (0–1)

Invariants (enforced in `src/lib/ai/post-process.ts`) keep status, action flags,
and action types consistent — e.g. `requires_action` only for Actions; OTP-style
mail stays Ignore.

### Eval gates

CI runs `npm run eval:scorecard` on curated fixtures (English, Hebrew, mixed).
These gate the **eval harness** (fixtures + schema + post-processing), not
live-inbox accuracy.

| Gate                   | Threshold |
| ---------------------- | --------- |
| Schema validity        | **100%**  |
| Action recall          | **≥ 90%** |
| Deadline hallucination | **0**     |
| Curated cases          | **≥ 50**  |

See [`tests/fixtures/README.md`](../tests/fixtures/README.md).

## Data model

Authoritative SQL is in [`supabase/migrations/`](../supabase/migrations/).
Summary of user-facing tables:

| Area      | Tables                                                      |
| --------- | ----------------------------------------------------------- |
| Account   | `profiles`                                                  |
| Gmail     | `gmail_connections`, `gmail_labels`                         |
| Settings  | `user_triage_settings`                                      |
| Mail      | `email_threads`, `email_messages` (no long-term bodies)     |
| Work      | `action_items`, classification feedback                     |
| Scans     | `scan_runs`, `scan_jobs` (+ chunk cursor, leases, progress) |
| History   | `digest_reports` (History snapshots)                        |
| Telemetry | `triage_usage` (append-only provider token counts)          |

RLS: `user_id = auth.uid()` on user-accessible tables. Scan writes use the
service role (`@/lib/supabase/admin`). One active Gmail mailbox cannot be
connected to two MailPriority users.

## Token / cost telemetry

- `generateWithNvidia` / `generateWithGemini` return `{ text, usage }` (Zod-parsed
  provider counts; never store prompts or response text).
- `processScan` passes `onProviderUsage` → best-effort insert into `triage_usage`.
- Pricing: `src/lib/ai/pricing.ts` (integer micro-USD; free-tier NVIDIA + Gemini
  rows are `$0` / `billable: false`).
- Optional UI: `NEXT_PUBLIC_USAGE_TELEMETRY_UI=1` → `/usage` + nav link
  (`src/app/usage/`, `src/components/usage/`, `src/lib/ai/usage-queries.ts`).
  Flag off: redirect to Mail. Table + write path stay.
- Delete analysis removes `triage_usage` with other analysis data.

## Security and privacy

- Refresh tokens encrypted AES-256-GCM (`src/lib/security/encryption.ts`); never
  returned to the browser.
- Never log email bodies, OAuth tokens, authorization codes, or API keys.
- Optional Sentry (`NEXT_PUBLIC_SENTRY_DSN`): allowed tags only —
  `environment`, `route`, `provider`, `scan_type`, `error_category`.
- Privacy routes: delete analysis data, disconnect Gmail, delete account
  (`/api/privacy/*`, Settings UI).
- `gmail.modify` is a restricted Google scope; a **public** launch still needs
  Google OAuth verification (and CASA when Google requires it).

## API routes (thin handlers)

Business logic stays in `src/lib/**`. Route map:

| Area     | Routes                                                                                                                                             |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gmail    | `/api/gmail/connect`, `callback` (persists connection then redirects; label ensure + initial `next_scan_at` via `after()`), `disconnect`, `status` |
| Scans    | `/api/scans`, `/api/scans/[id]`, `cancel`, `/api/scans/continue`                                                                                   |
| Cron     | `/api/cron/scan-dispatcher` (`CRON_SECRET`)                                                                                                        |
| Actions  | `/api/actions`, `/api/actions/[id]`                                                                                                                |
| Threads  | `/api/threads`, `/api/threads/[id]`, `feedback`                                                                                                    |
| Settings | `/api/settings` (PATCH triage lists / schedule); Update Now then POST `/api/scans` with default lookback                                           |
| History  | `/api/digests`, `/api/digests/latest`                                                                                                              |
| Privacy  | `/api/privacy/delete-analysis`, `delete-account`                                                                                                   |

## Key directories

| Path                     | Role                                                   |
| ------------------------ | ------------------------------------------------------ |
| `src/lib/ai/`            | Providers, schemas, prompts, post-process, eval, usage |
| `src/lib/gmail/`         | OAuth, fetch, parse, history, labels, quota            |
| `src/lib/scans/`         | Process, dispatch, continue, leases, progress          |
| `src/lib/mail/`          | Tabs, placement, buckets                               |
| `src/lib/actions/`       | Action workflow reconcile / mutations                  |
| `src/lib/digest/`        | History entries (UI route `/history`)                  |
| `src/lib/privacy/`       | Deletion, public policy                                |
| `src/lib/observability/` | Structured events, Sentry privacy                      |
| `src/app/usage/`         | Optional operator Usage screen (feature-flagged)       |
| `supabase/migrations/`   | Schema source of truth                                 |

## Conventions

- Env via `src/lib/config/env.ts` (`getServerEnv`, `getGmailEnv`, `getNvidiaEnv`,
  `getGeminiEnv`, `getClientEnv`). Secrets never reach the browser bundle.
- Supabase clients: `@/lib/supabase/server` (RLS), `client` (browser),
  `admin` (service role, trusted server only).
- Timestamps stored in UTC; convert to the user timezone at UI boundaries.
- All Gmail processing must be idempotent.
- Validate external input with Zod; prefer simple code over extra frameworks.
