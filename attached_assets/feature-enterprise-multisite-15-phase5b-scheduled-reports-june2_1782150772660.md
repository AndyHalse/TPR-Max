# Enterprise Multi-Site — Prompt 15 — Phase 5b: Scheduled reports

**Phase 5 of the Enterprise Multi-Site build. Reports that arrive in inboxes automatically. The final prompt. Run after prompt 14.**

## Context
Prompt 14 generates reports on demand. This adds scheduling so, e.g., a weekly portfolio snapshot lands in the directors’ inboxes every Monday, and a daily critical-issues digest goes out when there are critical alerts.

## What to build

### 1. New table `scheduled_reports` (isolated schema + migration)
- id, `report_type` text, `scope` jsonb (estate / area / site), `cron` text (or a simple frequency + time), `recipients` jsonb (emails), `enabled` boolean default true, `last_run_at` timestamp NULL, `created_by` varchar, `created_at`.

### 2. Schedule runner
- A cron (Europe/London) that checks due schedules, generates the report via the prompt 14 generator, and emails it to recipients with the PDF attached or linked. Use the existing email service. Deduplicate (one send per schedule per due window); record `last_run_at`.
- Built-in useful defaults an admin can enable: **Weekly Portfolio Snapshot** (Mon 08:00), **Monthly Board Pack** (1st of month), **Expiry Forecast – 30 days** (Fri 18:00), **Critical Issues Digest** (daily 07:30, only when critical alerts exist).

### 3. UI
- In the Reports area (per `reports.png`, “Scheduled Reports” panel): list schedules with on/off toggles, recipients, frequency; add/edit/delete a schedule.
- Scope and management respect the role matrix (enterprise_admin manages all; area_manager their area; site_coordinator cannot manage schedules).

## Rules
- Scope-aware: a scheduled report only ever contains data the schedule’s scope (and creator’s role) permits.
- Respect the estate email volume — batch/digest rather than per-item where sensible; confirm the email service quota is adequate before enabling estate-wide daily digests.
- en-GB; audited (schedule create/edit/delete, and each send).

## Acceptance criteria
- A weekly portfolio snapshot schedule fires on time and emails the PDF to recipients.
- A daily critical-issues digest only sends when there are open critical alerts.
- Toggling a schedule off stops it; `last_run_at` updates correctly; no duplicate sends.
- Schedules are scope- and role-correct.

## Do NOT
- Do not send a scheduled report containing data outside its scope.
- Do not double-send if the runner executes twice in a window.

---
**This completes the Enterprise Multi-Site build.** After this, run a full pass of the prompt 04 isolation tests once more, then a performance check with a seeded 120+ site dataset (dashboard < 2s, sites list < 1s, portfolio PDF < 30s).
