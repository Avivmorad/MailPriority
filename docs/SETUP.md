# Setup

Local development, environment variables, OAuth, migrations, cron, and checks.
Product behavior: [`PRODUCT.md`](PRODUCT.md). Architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in real values; never commit .env.local
npm run dev                  # http://localhost:3000
```

**Prerequisites:** Node.js 22+ (see `.nvmrc`), a [Supabase](https://supabase.com)
project, a Google Cloud project with the **Gmail API** enabled and OAuth **Web
application** credentials, and either an NVIDIA Build key (`NVIDIA_API_KEY`) or
a Gemini API key (`GEMINI_API_KEY` / `GEMINI_MODEL`). NVIDIA is used when its
key is set.

The landing, privacy, and terms pages run without secrets. Auth middleware is a
no-op until `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are
set. Features that need configuration fail fast with a clear message.

## Google Cloud: two different OAuth uses

Use the **same** OAuth 2.0 Web application client for both. They are not
interchangeable callbacks.

### 1. Continue with Google (MailPriority account)

Supabase Auth, **no** Gmail scopes.

1. Keep the existing Gmail redirect URI on the Web client (do not remove it).
2. Add authorized redirect URI
   `https://<your-project-ref>.supabase.co/auth/v1/callback`.
3. In Supabase (Authentication → Providers → Google) enable Google and enter the
   Web client ID and secret. Never commit the secret.
4. Authentication → URL Configuration: Site URL =
   `https://mail-priority.vercel.app`. Redirect URLs must include
   `http://localhost:3000/auth/confirm`, `http://localhost:3000/**`, and
   `https://mail-priority.vercel.app/auth/confirm`. Without the localhost entries,
   Continue with Google from local falls back to the production Site URL.
   The launch host is `https://mail-priority.vercel.app`. Production
   `GOOGLE_REDIRECT_URI` is `https://mail-priority.vercel.app/api/gmail/callback`.
   `gmailpilot.vercel.app` is detached and returns 404. Do not submit that
   host as the Google consent-screen homepage.
5. Sign-in returns to `/auth/confirm` (PKCE), then `/onboarding`. Gmail stays
   disconnected until Connect Gmail.

### 2. Connect Gmail (mailbox access)

Server OAuth with `gmail.modify`.

1. Enable the Gmail API and configure the OAuth consent screen (External +
   Testing is fine). Add your Gmail as a test user.
2. Authorized redirect URI must be exactly
   `http://localhost:3000/api/gmail/callback` (and the production URL in Vercel).
3. Put `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and
   `TOKEN_ENCRYPTION_KEY` (`openssl rand -hex 32`) in `.env.local`. These env
   vars are **Gmail Connect only**; they are not used for Continue with Google.
4. Restart the app, sign in, and click **Connect Gmail** on `/dashboard` or
   `/onboarding`.

Scope: `https://www.googleapis.com/auth/gmail.modify` (read mail and apply
labels). `MailPriority/*` labels are ensured after Connect Gmail (off the OAuth
redirect critical path) and reconciled again on the next scan if missing.
Existing `MailPilot/*` managed labels are renamed to `MailPriority/*` there.

## Environment variables

Copy from [`.env.example`](../.env.example). Validated in
`src/lib/config/env.ts`. Server secrets must never use a `NEXT_PUBLIC_` prefix.

| Variable                                                                                | Purpose                                                     |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`                                                                   | Public base URL for links and OAuth redirects               |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`                            | Supabase public client                                      |
| `SUPABASE_SERVICE_ROLE_KEY`                                                             | Server-only privileged key                                  |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI`                     | Gmail OAuth                                                 |
| `TOKEN_ENCRYPTION_KEY`                                                                  | 32-byte key for AES-256-GCM refresh-token encryption        |
| `TOKEN_ENCRYPTION_PREVIOUS_KEY`                                                         | Optional previous key during rotation                       |
| `GEMINI_API_KEY` / `GEMINI_MODEL`                                                       | Gemini; used when `NVIDIA_API_KEY` is unset                 |
| `NVIDIA_API_KEY` / `NVIDIA_MODEL`                                                       | NVIDIA Build; primary triage provider when set              |
| `CRON_SECRET`                                                                           | Protects `/api/cron/scan-dispatcher`                        |
| `MAX_THREAD_MESSAGES` / `MAX_MESSAGE_CHARS` / `MAX_THREAD_CHARS` / `AI_MAX_CONCURRENCY` | Context and cost controls (default concurrency **8**)       |
| `GMAIL_QUOTA_UNITS_PER_MINUTE`                                                          | Optional local Gmail quota budget (default 12000)           |
| `NEXT_PUBLIC_SENTRY_DSN`                                                                | Optional Sentry DSN (public). App runs without it           |
| `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN`                                   | Optional build-only source-map upload. Never `NEXT_PUBLIC_` |

Illustrative names from older guides map as:

| Guide name                             | Actual variable                   |
| -------------------------------------- | --------------------------------- |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `NEXT_PUBLIC_SUPABASE_ANON_KEY`   |
| `SUPABASE_SECRET_KEY`                  | `SUPABASE_SERVICE_ROLE_KEY`       |
| `OPENAI_API_KEY` / `OPENAI_MODEL`      | `GEMINI_API_KEY` / `GEMINI_MODEL` |

Do not hard-code model IDs in source. Full server env accepts NVIDIA alone,
Gemini alone, or both.

## Migrations

Apply SQL in the Supabase SQL Editor, in this order:

1. `supabase/migrations/0001_profiles.sql`
2. `supabase/migrations/0002_gmail_connections.sql`
3. `supabase/migrations/0003_initial_scan.sql`
4. `supabase/migrations/0004_classification_feedback.sql`
5. `supabase/migrations/0005_scan_progress.sql`
6. `supabase/migrations/0006_digest_reports.sql`
7. `supabase/migrations/0007_scan_scheduling.sql`
8. `supabase/migrations/0008_scan_admission.sql` — one RUNNING scan per connection
9. `supabase/migrations/0009_function_hardening.sql` — signup trigger not Data-API callable
10. `supabase/migrations/0010_gmail_mailbox_uniqueness.sql` — one inbox per MailPriority user
11. `supabase/migrations/0011_check_constraints.sql` — status, confidence, counter checks
12. `supabase/migrations/0012_scan_chunk_resume.sql` — resume large scans across Hobby slices
13. `supabase/migrations/20260929174644_analysis_scan_attribution.sql` — attribute each saved analysis to the scan that wrote it. Applied on `mailpilot-dev`. Existing analysis from before that migration stays unattributed. Apply this file on any new project before deploying the matching app code.

RLS is required on user-accessible tables (`user_id = auth.uid()`). See
[`supabase/README.md`](../supabase/README.md).

## Scripts

```bash
npm run dev              # development server
npm run build            # production build
npm run start            # run the production build
npm run lint             # ESLint
npm run typecheck        # tsc --noEmit
npm test                 # Vitest (Windows uses scripts/run-vitest.mjs)
npm run test:watch       # Vitest watch
npm run test:integration # mocked scan + RLS isolation + deletion
npm run eval:scorecard   # triage eval thresholds
npm run format           # Prettier write
npm run format:check     # Prettier check (CI)
```

### Checks before finishing

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run eval:scorecard
npm run build
```

These checks do not call Gmail, NVIDIA, Gemini, or a live database. CI
(`.github/workflows/ci.yml`) runs the same sequence.

## Cron and Vercel

`GET`/`POST` `/api/cron/scan-dispatcher` claims due Gmail connections
(`next_scan_at`), holds a job lease (~270s), and runs incremental scans. Protect
it with `CRON_SECRET` (`Authorization: Bearer …` or `x-cron-secret`).

Each user has a daily wall-clock time (default 08:00) in their timezone (default
Asia/Jerusalem). That becomes `next_scan_at` in UTC. Settings may still store
that local time, and the UI does not promise a run at that minute. Vercel Hobby
allows one built-in cron per day; this repo keeps a single cron at `0 6 * * *`
UTC. The cron tick starts a best-effort daily cycle: each invocation claims one
connection already due, then chains `POST /api/cron/scan-dispatcher` for
connections still waiting. The chain retries a few times if the next slice does
not acknowledge. If the queue still remains after the slice cap, the cycle logs
`scan.dispatch_backlog` and reports Sentry `error_category=backlog` on
`/api/cron/scan-dispatcher`. Do not add a second Hobby cron. Manual Scan now
and scan-continue slices do not wait for cron.

Hobby caps function duration at 300 seconds. On Vercel, set the same environment
variables, and make `GOOGLE_REDIRECT_URI` and `NEXT_PUBLIC_APP_URL` match the
deployed domain.

Owner console steps that cannot be done in git: [`OWNER_TASKS.md`](OWNER_TASKS.md).
