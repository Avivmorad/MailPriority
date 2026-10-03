# MailPriority

Gmail inbox triage that answers three questions: **what happened, what do I need
to do, and what’s pending?**

The GitHub repository stays **MailPilot**. Gmail managed labels use
**`MailPriority/`**. Existing `MailPilot/` managed labels are renamed in place.
The public app is [mail-priority.vercel.app](https://mail-priority.vercel.app).
`gmailpilot.vercel.app` is detached and returns 404.

## Live demo

**App:** [mail-priority.vercel.app](https://mail-priority.vercel.app)

The landing page is public. Inbox features need a MailPriority account and a
separate Gmail connection. Google OAuth may be limited to configured test users
while the integration is in Testing.

## Project status

| Area                    | Status                                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Implemented on `main`   | Auth, Connect Gmail, scanning, structured classification (NVIDIA or Gemini), Mail tabs, labels, History API sync, resumable jobs, scheduled dispatch, the History screen, privacy/deletion |
| Automatically tested    | CI: format, lint, typecheck, unit, mocked integration, eval-scorecard, production build (no live Gmail/AI/DB)                                                                              |
| Deployed                | Vercel serves landing, privacy, and terms from `main`                                                                                                                                      |
| Live owner verification | Sign-in, Connect Gmail, reconnect, disconnect, and one last-week Scan now ran on production. Remaining checks: [`docs/OWNER_TASKS.md`](docs/OWNER_TASKS.md)                                |
| License                 | No code license selected. **Owner decision required.**                                                                                                                                     |

## What it does

Connects one Gmail inbox, scans a chosen lookback, classifies threads with
validated structured JSON, applies `MailPriority/*` labels, and shows For You,
Actions, Pending, and the History screen. It never auto-sends, deletes, or
archives mail. OTP / login-FYI notices are not open tasks.

Defaults: daily scan 08:00 Asia/Jerusalem; lookback 1–4 days, 1–3 weeks, or 1
month (default 7 days); English summaries; NVIDIA when `NVIDIA_API_KEY` is set,
otherwise Gemini.

## Documentation

| Doc                                            | Use                                                  |
| ---------------------------------------------- | ---------------------------------------------------- |
| [`docs/PRODUCT.md`](docs/PRODUCT.md)           | Product behavior, Mail tabs, labels, placement rules |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Pipeline, AI contract, data model, security, API map |
| [`docs/SETUP.md`](docs/SETUP.md)               | Local setup, OAuth, env, migrations, cron, checks    |
| [`AGENTS.md`](AGENTS.md)                       | Repository rules for agents and developers           |
| [`docs/OWNER_TASKS.md`](docs/OWNER_TASKS.md)   | Owner console / live verification checklist          |

Historical full specification (not source of truth):
[`docs/archive/PROJECT_SPEC.md`](docs/archive/PROJECT_SPEC.md).

## Architecture (summary)

```text
Browser (Next.js App Router)
  ├─ Supabase Auth          MailPriority account (no Gmail scopes)
  └─ App UI                 dashboard, Mail tabs, History, settings, onboarding

Server (Vercel)
  ├─ Connect Gmail          OAuth gmail.modify → encrypted refresh token
  ├─ Scan pipeline          fetch → parse → triage JSON → Zod → DB → labels
  ├─ Incremental sync       Gmail History API
  └─ Cron dispatcher        due connections, job lease, chunk resume

Supabase Postgres + RLS     threads, actions, scans, History entries
NVIDIA Build or Gemini      ThreadAnalysis JSON only
```

Details and engineering map: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Tech stack

| Layer       | Choice                                                           |
| ----------- | ---------------------------------------------------------------- |
| App         | Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui |
| Data / auth | Supabase Postgres + RLS; Supabase Auth                           |
| Gmail       | Separate OAuth (`gmail.modify`); encrypted refresh tokens        |
| AI          | NVIDIA Build when configured; otherwise Gemini                   |
| Hosting     | Vercel (Hobby-safe dispatcher, `maxDuration` 300s)               |
| CI          | GitHub Actions                                                   |

## Getting started

```bash
npm install
cp .env.example .env.local
npm run dev
```

Full OAuth, env, migrations, cron, and verification commands:
[`docs/SETUP.md`](docs/SETUP.md).
