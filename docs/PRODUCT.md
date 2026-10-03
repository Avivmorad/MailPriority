# Product

What MailPriority does and how triage behaves. For how it is built, see
[`ARCHITECTURE.md`](ARCHITECTURE.md). For setup, see [`SETUP.md`](SETUP.md).

## Naming

| Surface                        | Name                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Product / UI / privacy / terms | **MailPriority**                                                                                                   |
| GitHub repo, npm package       | **MailPilot**                                                                                                      |
| Gmail label prefix             | **`MailPriority/`**. Existing `MailPilot/` managed labels are renamed in place.                                    |
| Public URL                     | [mail-priority.vercel.app](https://mail-priority.vercel.app). `gmailpilot.vercel.app` is detached and returns 404. |

Do not use the archived working name “Inbox Triage AI” in UI or new docs.

### Mail tab copy vs storage

| User-facing | Tab id / query                 | DB / analysis values                          |
| ----------- | ------------------------------ | --------------------------------------------- |
| **For You** | `summary` / `?tab=summary`     | `informational`, `resolved`                   |
| **Actions** | `open` / `?tab=open`           | analysis `action_required`; action row `OPEN` |
| **Pending** | `waiting` / `?tab=waiting`     | analysis `waiting`; action row `WAITING`      |
| **Closed**  | `completed` / `?tab=completed` | action row `COMPLETED`                        |
| **Snoozed** | `snoozed`                      | action row `SNOOZED`                          |
| **Ignored** | `ignored`                      | analysis `ignore`                             |

Status chips for ignored mail say **Ignore**. The tab and the History count say **Ignored**.

The six mail tabs stay the primary filter row. Each card uses the hue of that
tab’s tag: For You sky, Actions red, Pending amber, Closed green, Ignored zinc.
Snoozed has no status chip, so its card is indigo. The selected card uses a
deeper fill of the same hue.

A quieter row under the tabs can narrow the same list. Combining a tab with any
of these is an AND. **Clear filters** drops them and leaves the tab in place.

| Control      | What it filters                                                                                                              | Query              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| **Priority** | High, Medium, or Low. Medium means medium priority.                                                                          | `priority=medium`  |
| **Signal**   | Closed-set chips on the rows in this tab, other than the six tabs and priority. Examples: Urgency: High, Pay, Reply, Ignore. | `signal=high`      |
| **Category** | One menu of categories present in this tab. Not a card per category.                                                         | `category=finance` |

A category matches the topic group for that thread, including legacy categories
and security notices. Clicking a category badge sets the same category filter.

## MVP scope

**In scope**

- Connect one Gmail inbox (separate from app sign-in)
- Scan threads over a chosen lookback; classify with structured JSON
- Apply `MailPriority/*` Gmail labels after validated analysis only
- Dashboard overview + Mail tabs + History
- Incremental History API sync after the first successful scan
- Daily scheduled scan; resumable scans across Vercel Hobby time slices
- Privacy: no long-term full email body storage; delete analysis or account
- Observe-only AI usage telemetry (`triage_usage`); optional Usage screen

**Out of scope (MVP)**

- Auto-send, auto-delete, or auto-archive mail
- Email digest delivery (History stays in the app; emailing a digest is a later extension)
- Merging similar notices into a single Gmail thread
- Scan budget / cost caps (telemetry is observe-only)

## AI usage (operator)

Each classification HTTP call appends one `triage_usage` row (token counts, priced
micro-USD, outcome). No prompts or message content. Both free-tier price rows are
`$0` / `billable: false`.

The removable **Usage** screen lives under `src/app/usage/` (+ `src/components/usage/`).
Enable with `NEXT_PUBLIC_USAGE_TELEMETRY_UI=1` (`src/lib/config/features.ts`). When
off, `/usage` redirects to Mail and the nav link is hidden; recording continues.
SQL on the project remains the durable operator path. Delete analysis also removes
`triage_usage`.

## Operating defaults

| Decision             | Choice                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Users                | Multi-user architecture; test with a single user for now                                                                                |
| Automatic scan       | Best-effort once a day (Hobby cron `0 6 * * *` UTC). A stored local time is not when the scan runs. Manual Scan now is unchanged.       |
| Timezone             | **Asia/Jerusalem**                                                                                                                      |
| Initial scan window  | **1 / 2 / 3 / 4 days, 1 / 2 / 3 weeks, or 1 month** (default **7 days**)                                                                |
| Subsequent scans     | Changes since last successful scan (incremental)                                                                                        |
| Summary language     | **English** (`summary`, `short_display_title`, and the Do / Why this tab lines: `action_summary`, `action_reason`, `importance_reason`) |
| Presentation         | Dashboard **and** History                                                                                                               |
| Email body retention | Do **not** persist full email bodies long-term                                                                                          |
| Sending replies      | The system **never** sends replies on the user's behalf                                                                                 |

Stored as `user_triage_settings`: `daily_scan_time = '08:00'`,
`timezone = 'Asia/Jerusalem'`, `scan_interval_minutes = null`. That stored time
is not a promise that the daily scan runs then. Manual Scan now
lookback values: 1, 2, 3, 4, 7, 14, 21, or 30 days.

Manual Scan now shows live progress (conversations checked / total). A scan that
cannot finish inside one Hobby invocation (~240s of work, 300s `maxDuration`)
stays `RUNNING`, persists a thread cursor, and continues on the next slice. A
History entry is written when the window finishes with `SUCCESS` or `PARTIAL`.
The Gmail History API cursor advances only on `SUCCESS`, so a partial scan can
rediscover failed threads.

Gmail calls use a rolling one-minute unit budget (default 12,000). Scan now
returns immediately and keeps running in the background.

## Triage settings

Settings → Triage stores VIP senders, ignored senders, ignored domains, custom
AI instructions, and whether to write a History entry after a scan
(`user_triage_settings`). VIP senders are one chip editor. Ignored senders and
ignored domains share one chip editor titled Ignore senders & domains: an entry
with `@` is an email, and an entry without `@` is a domain. Those stay separate
arrays in the API. Custom instructions stay freeform text (max 4000 characters).

**Save triage settings** persists the form without starting a scan. **Update
Now** saves the current form, then starts the same lookback scan as default
Scan now (last week / `lookbackDays: 7`). Threads in that window are
reclassified when the triage fingerprint changes (VIP / ignore / custom
instructions). It does not re-triage the entire mailbox history, auto-send,
delete, or archive mail. Progress is on the Scan tab.

## Gmail labels

| Purpose         | Label                          |
| --------------- | ------------------------------ |
| Important       | `MailPriority/Important`       |
| Action required | `MailPriority/Action Required` |
| Low priority    | `MailPriority/Low Priority`    |
| Processed       | `MailPriority/Processed`       |

Rules:

- Every thread has **one canonical `status`** in the database
  (`action_required`, `waiting`, `informational`, `resolved`, or `ignore`).
  Mail tabs, action workflow, and History entries derive from this — a thread never has
  two competing statuses.
- Gmail **`MailPriority/*` labels are presentation only**. A thread may carry more
  than one at once (e.g. Important + Action Required + Processed).
- Labels are ensured after Connect Gmail (off the OAuth redirect wait) and
  reconciled on scan if missing or still named `MailPilot/`. Mapping is stored as
  `logical_name → gmail_label_id`. A previous managed `MailPilot/` label is
  renamed with Gmail `labels.patch` to the matching `MailPriority/` name, so the
  label id stays on the thread. New installs create `MailPriority/` only.
  Gmail may leave an empty `MailPilot` parent label behind; it is not deleted,
  because deleting a label removes it from threads. User labels outside the
  managed `MailPriority/` names and those previous `MailPilot/` names stay as they are.
- A Gmail inbox may be **actively connected to only one MailPriority user** at a
  time (`0010_gmail_mailbox_uniqueness.sql`).

Richer states (`waiting`, reply needed, etc.) stay in the database; the reduced
Gmail label set is a presentation choice.

## For You vs Actions

The dashboard is an overview (short scan status line and mailbox counts). Its
header includes **Scan Now**, which starts the same default last-week manual
scan as Scan now (`lookbackDays: 7`) and opens the Scan tab. The progress
circle, lookback control, and per-scan stats live only on the **Scan** tab
(`/scan`). Mail lists live on **Mail** tabs and stay separate products:

1. **For You** — useful FYI only (`informational` / `resolved`). Never `ignore`,
   never Actions or Pending tasks.
2. **Actions** — a real next step, including security events and expired credentials.
3. **Ignored** — OTP/verification, marketing, job alerts, receipts, routine automated notices.

Placement priority:

1. OTP, verification, marketing, job alert, receipt, routine confirmation, or automated FYI → `ignore`, unless the mail explicitly requires action.
2. Unrecognized/new-device login, security alert, expired API key/token, deadline, required payment, check-in, or explicit action → `action_required`.
3. Otherwise → `informational`.
4. Status is never empty. `requires_action` is true only for Actions.

A thread ID cannot appear in both For You and Ignored.

## Action topics

Within Actions (and in For You), group threads by the AI `category`. Use `other`
only when nothing else fits.

| Category                 | Label                       | Typical mail                                                                       |
| ------------------------ | --------------------------- | ---------------------------------------------------------------------------------- |
| `finance`                | Finance                     | Banking, charges, receipts, invoices, billed subscriptions, investments, tax       |
| `security`               | Security                    | Logins, authentication, passwords, OAuth, account access (not OTPs as Actions)     |
| `career`                 | Career                      | Jobs, recruiters, applications, interviews                                         |
| `education`              | Education                   | Courses, exams, school or university enrollment                                    |
| `projects_development`   | Projects & Development      | Code, deployments, developer tooling                                               |
| `travel_transport`       | Travel & Transport          | Flights, hotels, transport, travel insurance                                       |
| `shopping_orders`        | Shopping & Orders           | Orders, deliveries, returns of goods                                               |
| `official_legal`         | Official, Legal & Insurance | Government, contracts, insurance, pension                                          |
| `accounts_subscriptions` | Accounts & Subscriptions    | Service-account notices, plan changes, product updates, non-security subscriptions |
| `personal_health`        | Personal & Health           | Personal messages, appointments, medical, personal services                        |
| `social_feeds`           | Social & Feeds              | Social networks, groups, social notifications                                      |
| `gaming_entertainment`   | Gaming & Entertainment      | Games and entertainment content                                                    |
| `newsletters_promotions` | Newsletters & Promotions    | Promotions, ads, newsletters with no operational content                           |
| `other`                  | Other                       | Default only when none of the above fit                                            |

Legacy stored category values map onto this taxonomy at read/group time. Similar
notices sit under the same heading; they are not merged into one Gmail thread.

## Placement map

Decide **Actions** only when the user still has a durable next step; **Pending**
when they already did their step; **For You** when the mail is useful FYI;
**Ignore** for noise. Never persist full email bodies. `action_items` rows exist
only for Actions (`OPEN`) and Pending (`WAITING`).

**Precedence:** classify by the remaining action and who owns it. An automated
sender alone must not cause an actionable request to be ignored. OTP, magic
links, and “verify this email address” stay Ignore.

### Security

| Case                                                                        | Where   | `status` / action            |
| --------------------------------------------------------------------------- | ------- | ---------------------------- |
| OTP, magic link, confirm-email, “Link verification code”                    | Ignore  | `ignore`                     |
| New / unrecognized device login, Google security alert                      | Actions | `action_required` / `review` |
| Expired API key, personal access token, or similar credential               | Actions | `action_required` / `review` |
| Provider already blocked the login                                          | Actions | `action_required` / `review` |
| Security copy about a **different** account (this mailbox is only recovery) | Ignore  | `ignore`                     |
| Password reset, locked/compromised account, unauthorized charge             | Actions | `action_required` / `review` |

### Payments

| Case                                                          | Where                                   | `status` / action         |
| ------------------------------------------------------------- | --------------------------------------- | ------------------------- |
| Paid receipt, refund issued, tax/VAT PDF ready to download    | Ignore                                  | `ignore`                  |
| Bank/account update with no unpaid amount                     | Ignore                                  | `ignore`                  |
| Upcoming renewal or trial started, no charge due              | Ignore                                  | `ignore`                  |
| Unpaid invoice, failed charge, remaining balance, fine to pay | Actions until **that thread** says paid | `action_required` / `pay` |
| Card expired / update payment or service stops                | Actions                                 | `action_required` / `pay` |
| Marketing that looks like a credit alert                      | Ignore                                  | `ignore`                  |

### General

| Case                                                                                                | Where   | `status` / action            |
| --------------------------------------------------------------------------------------------------- | ------- | ---------------------------- |
| Person or automated mail asks the user to grant access, approve, sign, submit, or answer            | Actions | matching `action_type`       |
| Signature / approval / document comment that explicitly asks the user to act                        | Actions | `sign` / `approve` / `reply` |
| Bounce for mail the user sent                                                                       | Actions | `review`                     |
| Meeting the user must accept/decline, or choose/confirm a new time                                  | Actions | `schedule`                   |
| Interview scheduling, assessment, or missing application documents                                  | Actions | `schedule` / `submit`        |
| Parcel collection, address correction, or customs-information request                               | Actions | `follow_up` / `submit`       |
| Check-in still needed                                                                               | Actions | `submit`                     |
| User already asked/sent/signed; no reply yet                                                        | Pending | `waiting`                    |
| Out-of-office reply or support-ticket acknowledgment while that request is unanswered               | Pending | `waiting` (not resolved)     |
| Webinar / mass calendar invite                                                                      | Ignore  | `ignore`                     |
| Confirmed meeting reschedule or cancellation (no new time to choose)                                | For You | `informational`              |
| Lab results or “document ready in the portal”                                                       | For You | `informational`              |
| Drive/Docs/Dropbox “shared a document/file with you” (access granted)                               | For You | `informational`              |
| Routine tracking / shipment out for delivery, itinerary, boarding pass, confirmed appointment       | For You | `informational`              |
| Useful mail that assigns work only to someone else; being CC’d is not a task                        | For You | `informational`              |
| Job alerts, receipt-only application acknowledgments, bot mail with no user action, surveys, promos | Ignore  | `ignore`                     |

## App-account emails (Supabase Auth)

Signup / magic-link / password-reset mail is sent by **Supabase Auth**, not Gmail
and not MailPriority. Default From is “Supabase Auth”
(`noreply@mail.app.supabase.io`). Clicking the link confirms the **MailPriority
app account**. Do not confuse this with **Connect Gmail** (Google OAuth to scan
the mailbox).

**Continue with Google** is also app authentication (Supabase Auth
`signInWithOAuth`, no Gmail scopes). Mailbox access remains the separate Connect
Gmail step. Owner console steps: [`OWNER_TASKS.md`](OWNER_TASKS.md).

- **Subject/body:** Authentication → Email → Templates. Keep `{{ .ConfirmationURL }}`.
- **From / sender:** requires custom SMTP (Resend, SendGrid, Google Workspace,
  etc.). Without it, Gmail keeps showing Supabase Auth. Not required for an
  internal launch; templates alone change subject and body immediately.

## Urgency indicators

Every email displays **Urgency: High, Medium, Low, None, or Unknown**.
Email and action rows have matching left markers: red, orange, green, gray,
and blue respectively. Stored AI values remain compatible: `urgent` maps to
High, `soon` to Medium, `normal` to Low, and `none` to None. Missing or
unrecognized values display Unknown. Existing deadline proximity overrides
stored urgency: overdue maps to High, within seven days to Medium, later to Low.
Urgency is independent of importance and mail placement.
