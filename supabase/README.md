# Supabase

Database schema and migrations for MailPriority (this repository is MailPilot).

- `migrations/` — SQL migrations, committed to the repository. Added from Phase 1 onward.
  - `0001_profiles.sql` — app profiles.
  - `0002_gmail_connections.sql` — Gmail OAuth connections and MailPilot labels.
  - `0003_initial_scan.sql` — triage settings, threads, messages (no bodies),
    action items, and scan runs.
  - `0004_classification_feedback.sql` — thread classification feedback.
  - `0005_scan_progress.sql` — live scan progress (`threads_discovered` / `threads_checked`).
  - `0006_digest_reports.sql` — History snapshots (not an email digest).
  - `0007_scan_scheduling.sql` — connection leases, `scan_jobs`, dispatcher claim.
  - `0008_scan_admission.sql` — at most one RUNNING `scan_runs` row per connection.
  - `0009_function_hardening.sql` — pin `search_path` on trigger functions; revoke Data API execute on `handle_new_user`.
  - `0010_gmail_mailbox_uniqueness.sql` — one active Gmail inbox per MailPilot user.
  - `0011_check_constraints.sql` — status, confidence, and counter checks.
  - `0012_scan_chunk_resume.sql` — scan thread cursor so large lookbacks resume across Hobby invocations.
  - `20260929174644_analysis_scan_attribution.sql` — durable analysis attribution for resumed scan counters. Applied on `mailpilot-dev`. Existing analysis from before that migration stays unattributed. Apply this file on any new project before deploying the matching app code.
- Row Level Security is required on every user-accessible table (`user_id = auth.uid()`).
  Scan writes use the service role.

See [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) for the schema overview, RLS,
and encryption requirements. SQL in this folder is authoritative.
