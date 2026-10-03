# Owner tasks

Console and live checks only. App code stays in separate sessions. Check a box only when its **Done when** line is true.

Supabase migrations `0007`–`0012` and `20260929174644_analysis_scan_attribution` are applied on `mailpilot-dev`. Vercel has the required env vars. The public host is `https://mail-priority.vercel.app`. The Gmail redirect URI on record is `https://mail-priority.vercel.app/api/gmail/callback`. Sign-in, Connect Gmail, and a last-week Scan now already ran on the live app (699 conversations, finished partial: a few threads were not analyzed).

Do the sections in order. Section 8's scan-timeout code is in the tree; its live Success boxes stay open. Section 9's dispatch code is in the tree; its ten-account live check is still open. Sections 1–3 are done. Do not clear those boxes unless a new live check fails the **Done when** line.

## Code sessions

Live boxes below stay open until their **Done when** line is true. Session progress is also in `IgnoreFolder/plan_to_publish.md`.

- [x] Session 1, repo cleanup: `package.json` has one `overrides` object, and setup docs say the scan-attribution migration is applied on `mailpilot-dev`.
- [x] Session 2, scan timeouts: a retryable AI timeout is retried once before the scan is sealed partial, and a thread that still fails stays stored so a later scan can retry it.
- [x] Session 3, daily dispatch: one Hobby cron chains bounded slices so every due connection in the cycle is claimed, retries the next slice when it does not start, and raises a backlog alert if the queue does not drain.
- [x] Session 4, privacy and schedule copy: local privacy and terms pages state retention and name NVIDIA Build when an NVIDIA API key is configured, otherwise Google Gemini. Settings no longer promises a run at the saved local time. No support email exists in the repo.
- Still open: Google’s restricted-scope review (section 4), custom SMTP (section 5), a production database (section 6), two live Success scans (section 8), the ten-account daily cycle (section 9), and reading privacy and terms on the host (section 11). A support inbox a recruiter can read is still missing.

## Already done

- [x] Revoke Gmail access in Google Account settings, then reconnect from MailPriority.
- [x] Disconnect Gmail from MailPriority.
- [x] Add authorized redirect URI `https://kssolktnbxjppyqmodck.supabase.co/auth/v1/callback` on the existing Google web client.
- [x] Sign out → Continue with Google → land signed in → Gmail still disconnected until Connect Gmail.
- [x] If that Google email already has a password user, confirm Supabase did not create a second user. Check Authentication → Users.

Connect Gmail stays a separate step from Continue with Google. Do not remove the Gmail redirect URI when editing the Google client.

## 1. Finish Google sign-in on mailpilot-dev

- [x] In Supabase **mailpilot-dev** → Authentication → Providers → Google: enable it and paste that web client id and secret (dashboard only).

**Done when:** The Google provider shows Enabled, and a fresh Continue with Google sign-in still lands in the app with Gmail disconnected.

Continue with Google already lands signed in, and Gmail stays disconnected until Connect Gmail.

1. Open [Supabase](https://supabase.com/dashboard) → project **mailpilot-dev**.
2. Go to Authentication → Providers (or Sign In / Providers) → Google.
3. Turn Google on.
4. Paste the same OAuth **Web client** ID and secret already used for Connect Gmail. Copy them from Google Cloud → APIs & Services → Credentials. Do not put the secret in git, chat, or this file.
5. Save.
6. Sign out of the app, choose Continue with Google, and confirm you are signed in while Gmail is still disconnected.

## 2. Lock one public domain

- [x] Pick the one host that will be the public app, and confirm it does not redirect elsewhere.

**Done when:** One host loads MailPriority, `https://mail-priority.vercel.app/privacy` and `https://mail-priority.vercel.app/terms` open on that same host, and Google Search Console shows the property as verified.

The host is `https://mail-priority.vercel.app`. It loads MailPriority with no redirect. `/privacy` and `/terms` stay on that host. Search Console has the URL-prefix property `https://mail-priority.vercel.app/` verified. `public/googled943d3f3a32f577e.html` is deployed and returns the verification token. `gmailpilot.vercel.app` is no longer attached to the Vercel project and returns 404. Later URLs in this file use `https://mail-priority.vercel.app`.

## 3. Point every setting at that host

- [x] Vercel domain, env, Supabase URLs, and both Google callbacks use `https://mail-priority.vercel.app` only.

**Done when:** Continue with Google and Connect Gmail both return to `https://mail-priority.vercel.app/...`, and the consent screen links open without a redirect.

1. Vercel → this project → Settings → Domains. `https://mail-priority.vercel.app` is attached. `gmailpilot.vercel.app` is removed and returns 404.
2. Vercel → Settings → Environment Variables, Production:
   - `NEXT_PUBLIC_APP_URL` = `https://mail-priority.vercel.app`
   - `GOOGLE_REDIRECT_URI` = `https://mail-priority.vercel.app/api/gmail/callback`
3. Production was redeployed with those values.
4. Supabase **mailpilot-dev** → Authentication → URL Configuration:
   - Site URL = `https://mail-priority.vercel.app`
   - Redirect URLs include `http://localhost:3000/auth/confirm`, `http://localhost:3000/**`, and `https://mail-priority.vercel.app/auth/confirm`
5. Google Cloud → APIs & Services → Credentials → the Web client. Authorized redirect URIs include:
   - `https://kssolktnbxjppyqmodck.supabase.co/auth/v1/callback`
   - `https://mail-priority.vercel.app/api/gmail/callback`
   - `http://localhost:3000/api/gmail/callback`
6. Google Cloud → OAuth consent screen (Google Auth platform → Branding):
   - App home page = `https://mail-priority.vercel.app`
   - Privacy policy = `https://mail-priority.vercel.app/privacy`
   - Terms of service = `https://mail-priority.vercel.app/terms`
7. Those three links stay on `https://mail-priority.vercel.app`.
8. Continue with Google and Connect Gmail both finish on `https://mail-priority.vercel.app`.

## 4. Submit Google’s restricted-scope review

- [ ] `gmail.modify` verification is submitted, including the demo video and the security assessment Google requires.

**Done when:** The consent screen is In production (or Verification in progress), test-user-only Testing mode is no longer the thing standing between a new person and Connect Gmail, and any CASA task Google assigned is underway or passed.

Testing mode only allows listed test users, and those grants expire after seven days. `gmail.modify` is a restricted scope. Because this server stores Gmail data, Google also requires its restricted-scope security assessment (CASA) when it asks.

1. Sections 2 and 3 are done. On Branding, delete the unused authorized domain `gmailpilot.vercel.app` if it is still listed. Leave `mail-priority.vercel.app` and `kssolktnbxjppyqmodck.supabase.co`. Record the demo only on `https://mail-priority.vercel.app`.
2. Google Cloud → OAuth consent screen. Set user type to External, app name **MailPriority**, and a support email you actually read.
3. Add the scope `https://www.googleapis.com/auth/gmail.modify`. Leave Continue with Google out of this scope list. That button is Supabase sign-in and must not request Gmail scopes.
4. Scopes page → Prepare for verification / Submit for verification. Use the homepage, privacy, and terms URLs from section 3.
5. Record a silent or narrated demo that shows, in order:
   - Opening `https://mail-priority.vercel.app`
   - Creating or signing in to the MailPriority account
   - Clicking Connect Gmail and the Google consent screen that names Gmail access
   - A finished scan and the `MailPriority/` labels in Gmail
   - Opening `https://mail-priority.vercel.app/privacy`
6. Upload that video where the verification form asks for it. In the written explanation, say the app reads mail and applies labels, and that it does not send, delete, or archive mail.
7. If Google assigns a security assessment, complete it with the lab they name. Use `https://mail-priority.vercel.app` and the production data path you will actually launch.
8. Add no new public users while the app is still in Testing.

## 5. Send signup and password-reset mail from your own sender

- [ ] Custom SMTP is on, and an address outside the project team can sign up, confirm, and reset a password.

**Done when:** That outside inbox receives the confirm message and the reset message from your sender, both links open `https://mail-priority.vercel.app`, and the new user is still not Gmail-connected until they click Connect Gmail.

Supabase’s default sender is for testing. It restricts who can receive mail and is limited to about two messages an hour.

1. Create a sender in Resend, SendGrid, or Google Workspace. Verify the domain those messages come from.
2. Supabase → Authentication → Emails → SMTP Settings. Turn on custom SMTP and enter the host, port, username, password, sender email, and sender name from that provider.
3. Authentication → Emails → Templates. Leave `{{ .ConfirmationURL }}` in the confirm and reset templates.
4. From a browser that is not your usual admin profile, open `https://mail-priority.vercel.app` and create an account with an address that is not a project member.
5. Open the message, confirm the account, and land signed in.
6. Use Forgot password for that same address, set a new password, and sign in with it.
7. On that account, stop before Connect Gmail and confirm the dashboard still asks to connect.
8. Separately, on a different test user, use Continue with Google and confirm that path still does not connect a mailbox by itself.

## 6. Stand up a production database

- [ ] A new Supabase project holds production. `mailpilot-dev` stays for development. Testers reconnect after the cutover.

**Done when:** Production Vercel points at the new project, every migration below is applied, a backup has been restored into a scratch project, and an old tester can sign in and Connect Gmail again.

1. Supabase → New project. Name it for production, region Ireland (same region as today). Do not reuse `mailpilot-dev`.
2. In the SQL editor, run these files in order, one at a time, from `supabase/migrations/`:
   1. `0001_profiles.sql`
   2. `0002_gmail_connections.sql`
   3. `0003_initial_scan.sql`
   4. `0004_classification_feedback.sql`
   5. `0005_scan_progress.sql`
   6. `0006_digest_reports.sql`
   7. `0007_scan_scheduling.sql`
   8. `0008_scan_admission.sql`
   9. `0009_function_hardening.sql`
   10. `0010_gmail_mailbox_uniqueness.sql`
   11. `0011_check_constraints.sql`
   12. `0012_scan_chunk_resume.sql`
   13. `20260929174644_analysis_scan_attribution.sql`
3. On **mailpilot-dev**, open Database → Migrations and confirm `20260929174644_analysis_scan_attribution` is already listed. If it is missing there, apply that one file to dev too. If it is listed, do not run it again.
4. Authentication → Providers → Google on the new project: enable Google with the same web client id and secret.
5. Set the new project’s Site URL and redirect URLs exactly as in section 3.
6. Copy the new project’s URL, anon key, and service role key into Vercel Production as `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Redeploy. Leave local `.env.local` on `mailpilot-dev`.
7. Database → Backups: take a backup. If the plan has no backups, dump the database and restore it into a throwaway project, then confirm `profiles` exists there. Delete the throwaway project afterward.
8. Email each current tester: disconnect Gmail if it is still connected on dev, sign in on `https://mail-priority.vercel.app`, and Connect Gmail again. Old refresh tokens do not move to the new project.

## 7. Turn on leaked-password protection

- [ ] The production project rejects known leaked passwords.

**Done when:** Authentication shows leaked-password protection enabled, and a signup that uses a well-known leaked password is rejected.

1. Production project → Authentication → Providers → Email (password security / attack protection).
2. Enable leaked-password protection. This control is missing on plans that do not include it; upgrade that project before launch if the toggle is absent.
3. Try to sign up with a password from a public breach list and confirm the form rejects it.
4. Sign up again with a unique password and confirm that account still works.

## 8. Prove two first scans finish

The scan-timeout code is in the tree. These boxes stay open until two live accounts finish Success on `https://mail-priority.vercel.app`. The last live run was still partial; that proof was not re-run here.

- [ ] On `https://mail-priority.vercel.app`, two different Gmail accounts each finish a seven-day Scan now as Success.
- [ ] Mail shows separate Actions, For You, and Ignored lists, and Gmail shows the `MailPriority/` labels.
- [ ] A second Scan new mail on each account does not duplicate threads or actions.
- [ ] A thread that fails stays visible and can be scanned again.

**Done when:** Each account’s dashboard footer says `Last run … · Success` and does not say `Partial` or `Some conversations need another scan`.

1. Use two Gmail accounts that are allowed to connect (test users until section 4 is approved).
2. Sign each into its own MailPriority user on `https://mail-priority.vercel.app`. Connect Gmail on each.
3. On the dashboard, set the lookback to 7 days and click **Scan now**. Leave the tab open until it stops.
4. Pass only if the footer status is Success. Partial, Cancelled, or a timeout message fails this task.
5. Open Mail. Confirm the lists are labeled Actions, For You, and Ignored, and that a thread is not in two of those lists at once.
6. In Gmail, confirm labels exist under `MailPriority/`: `Important`, `Action Required`, `Low Priority`, and `Processed`. A thread’s label should match the Mail list it appeared in. If those four still use `MailPilot/`, run Scan now once so they rename in place and the threads keep them.
7. Click **Scan new mail**. Confirm thread counts and open actions do not double.
8. If any conversation failed, confirm it is visible in the app and that running the scan again retries it.

## 9. Prove the daily run reaches every connected account

Session 3 is in the tree: one daily cron chains a bounded slice per due connection, retries a slice that does not start, and alerts if the queue does not drain. Still open: this live check needs ten connected accounts on the host, which local tests cannot prove.

The schedule is best-effort once a day. Vercel Hobby cron is `0 6 * * *` UTC (09:00 in Israel during summer time). Settings may still show a local time; that clock is not a promise that Hobby will run at that minute.

- [ ] At least ten connected accounts each get a scan run from the same daily cron cycle.

**Done when:** After one daily cycle, all ten accounts show a new Last run, and none are stuck without a run while others succeeded.

1. Connect at least ten Gmail accounts (extra test users are fine) so each is due.
2. Wait for the Hobby cron at 06:00 UTC, or run it once from Vercel → Cron Jobs. A manual call is `POST https://mail-priority.vercel.app/api/cron/scan-dispatcher` with the `CRON_SECRET` from Vercel env. Do not paste that secret into git or chat.
3. Open each of the ten accounts and confirm Last run moved forward.
4. If some accounts are still waiting, confirm the app retries them on a later slice of the same cycle. A backlog that never drains fails this task.
5. Do not add more than the one Hobby cron. Hobby will not run a per-user schedule.

## 10. Check isolation, revoke, and deletion on production

- [ ] Two live users cannot see each other’s mail.
- [ ] Revoke and reconnect works on `https://mail-priority.vercel.app`.
- [ ] Delete analysis data and Delete account do what they say.

**Done when:** User B’s threads never appear for user A, reconnect scans again, analysis deletion clears Mail, and account deletion signs the user out.

1. Use two browsers. Sign in as two different users and connect two different Gmail accounts. Scan both.
2. As user A, open Mail and search for a subject that only exists in user B’s inbox. It must be absent.
3. In Google Account → Security → Third-party access, remove MailPriority for user A. In the app, confirm scanning asks you to reconnect, then Connect Gmail again and scan.
4. As user A, open Settings → Privacy. Type `DELETE ANALYSIS` and click **Delete analysis data**. Mail should be empty. Gmail stays connected. Gmail messages themselves stay in Gmail.
5. Type `DELETE ACCOUNT` and click **Delete account**. You should land signed out. Signing in again should require a new account, and Connect Gmail should be required again.
6. As user B, confirm nothing from user A disappeared.

## 11. Read the public privacy and terms pages

Code session 4 updated the local pages. This box stays open until you read them on `https://mail-priority.vercel.app`. The pages do not name a support email, because the repo does not have one.

- [ ] `https://mail-priority.vercel.app/privacy` and `https://mail-priority.vercel.app/terms` match what the app does.

**Done when:** You can point a recruiter at a support contact, a retention statement, and the AI processors actually in use (NVIDIA Build, Gemini, or both).

1. Open both pages on `https://mail-priority.vercel.app` while logged out.
2. Check that they name a support contact you read, say what is deleted when someone uses Delete analysis data or Delete account, and name the AI provider that production keys actually call.
3. If a sentence is wrong, leave the pages as they are and send that sentence to a code session. Do not edit production text only in the Supabase dashboard.

## 12. Set spend limits and a place to look when scans fail

- [ ] AI usage has a cap, and partial scans, timeouts, and a scheduler backlog have somewhere you will notice them.

**Done when:** A test alert or a billing cap is visible in that vendor’s dashboard, and you know where yesterday’s cron result is.

1. In the NVIDIA and Gemini consoles, set a monthly budget or hard cap on the key stored in Vercel Production.
2. Vercel → the project → Logs, filter to `/api/cron/scan-dispatcher` and to scan routes. Confirm you can see a failed or partial run from the last live attempt.
3. If you want email or Slack when that happens, set `NEXT_PUBLIC_SENTRY_DSN` (and the build-only `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN`) in Vercel and turn on an alert for new errors. Leave Gmail bodies, addresses, and tokens out of any alert text.
4. Vercel → Settings → Functions → Region. Production currently runs in Washington (`iad1`) while Supabase is in Ireland. Switch the region to Dublin (`dub1`), redeploy, and run one Scan now. Note how long it takes compared with the last `iad1` run.

## 13. Open signups

- [ ] Sections 1–12 are checked, and CI is green on the commit that is deployed to `https://mail-priority.vercel.app`.

**Done when:** A person who is not on the test-user list can sign up or sign in, connect Gmail, finish a successful first scan, see Mail and `MailPriority/` labels, run Scan new mail, and disconnect or delete their data.

1. Confirm Google’s consent screen is no longer limited to the test-user list.
2. On GitHub, confirm the latest `main` deploy’s CI and CodeQL checks passed.
3. Repeat one outside-email signup from section 5 against production, then Connect Gmail and one seven-day scan from section 8.
4. Only then share the link.
