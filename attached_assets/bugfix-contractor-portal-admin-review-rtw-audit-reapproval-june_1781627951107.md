# Bugfix — Contractor Portal admin: Right-to-Work value drift, missing audit, stale approvals

**Found in a full review of the contractor-portal-admin feature (16 Jun). One process-breaking bug plus several logic/consistency gaps. Effort: medium. Fix all in one pass — they're all in `server/routes/contractors.ts` + `server/utils/contractorCompliance.ts`.**

---

## 1. CRITICAL — Approving Right to Work doesn't unblock the worker (value drift)

When an admin approves a worker's Right to Work document, the review route sets `rightToWork: 'verified'` (`contractors.ts:5342`). But **every gate that reads Right to Work compares against `'valid'`**, so an approved worker is still treated as unverified and still blocked at check-in:

- `getWorkerClearanceStatus` — `else if (rtw !== "valid")` (`contractorCompliance.ts:143`)
- regular check-in — `rightToWorkStatus !== 'valid'` → blocking (`contractors.ts:4438`)
- pre-booking check-in — same (`contractors.ts:678`)

There are **three different vocabularies** for this one field across the codebase:
- `isolatedSchema.ts:842` (runtime, the source of truth): `// pending, verified, expired, invalid`
- the gates above: `valid / expired / pending`
- `shared/schema.ts:1267` comment: `// valid, expired, pending, missing`

**Fix — standardise on the runtime schema's vocabulary: `pending | verified | expired | invalid`.** The live DB already stores `'verified'` on approval, so don't change the write — fix the readers.

- In `getWorkerClearanceStatus` and **both** check-in routes, apply one rule:
  - `null` / `pending` → **warning** ("Right to Work not yet verified")
  - `expired` / `invalid` / `missing` → **blocking**
  - `verified` → OK
- Pull this into a single helper (e.g. `evaluateRightToWork(status): { blocked, warning }`) and call it from all three places so it can never drift again.
- Update the `shared/schema.ts:1267` comment to match (`pending, verified, expired, invalid`).
- **Data migration** (one-off, per customer schema, idempotent): `UPDATE contractor_workers SET right_to_work_status = 'verified' WHERE right_to_work_status = 'valid'`. Leave `pending`/`expired` as-is; if any `missing` exist, map to `pending`.

**Verify:** approve a worker's RTW doc → their `rightToWork` reads `verified`, the readiness badge clears the RTW warning, and they can check in at the kiosk (assuming induction etc. are also done). Set the doc expiry to the past and reject → status becomes `expired`/`pending` and check-in blocks again.

---

## 2. Document approve/reject is never audited (and approvedBy is blank)

The per-document review route (`contractors.ts:5270`) is the most frequent admin action, yet it writes **no row** to `contractor_onboarding_audit` — while `approve-for-site` and `request-changes` do. For a compliance product whose whole point is "who did what, when", document decisions are invisible.

Also `const reviewerId = (req as any).userId` (`contractors.ts:5281`) — `req.userId` isn't populated here (the other routes use `req.user.email || req.user.username`), so `approvedBy` is saved blank.

**Fix:**
- Set `approvedBy` from `(req.user as any)?.email || (req.user as any)?.username`.
- After a successful review, insert an audit row: action `document_approved` or `document_rejected`, `actor` = same resolved identity, `company_id` = the doc's company, `worker_id` = the doc's worker (if any), `reason` = the document name (+ rejection reason). The `worker_id` column already exists on the audit table (`customerDatabase.ts:1305`).

---

## 3. "Approve for site" — allow override, but warn and log it

(Per decision: admins can approve an incomplete contractor, with accountability.)

In `POST /api/contractors/:id/approve-for-site` (`contractors.ts:5544`):
- Before approving, run `getCompanyComplianceStatus(db, id)`.
- If **compliant** → approve as now, audit action `approved_for_site`.
- If **not compliant** → still allow it, but require an `overrideReason` in the request body (return 400 if missing), and record audit action `approved_for_site_override` with `reason` = the override note **plus the list of what was missing** (from `getCompanyComplianceStatus().reasons`).
- Frontend (`ContractorPortalAdmin.tsx`, the Awaiting Approval view): if the contractor isn't compliant, show a warning listing what's missing and require the admin to type a short override reason before the Approve button works.

---

## 4. Approved status goes stale — auto-revert when compliance lapses

(Per decision: keep the "Approved" badge honest.)

Today, once `onboarding_status = 'approved'`, nothing ever re-checks it. If a required document later expires or is rejected, the contractor stays "Approved" with, e.g., lapsed insurance.

**Fix — two triggers, one shared function.** Add `reevaluateCompanyApproval(db, customerId, companyId)`:
- If the company is currently `approved` AND `getCompanyComplianceStatus` is now **not** compliant → set `contractor_companies.status = 'pending'`, `onboarding_status = 'attention_needed'` (add this value to the status set), write audit action `auto_reverted` with the reasons, and email the site admin ("X is no longer fully compliant — review needed").

Call it from:
- **(a)** the document review route (after any approve/**reject**), so rejecting a required doc on an approved contractor flips them immediately.
- **(b)** a **daily cron** (expiry is date-based, not event-based, so an event hook alone misses it). Wire into the existing daily contractor/compliance reminder job — iterate approved companies, call `reevaluateCompanyApproval`. Dedupe the alert email (don't re-send daily; only on the transition).

Note: hard-blocking these workers at the kiosk via the company gate is Phase 2 — this fix only keeps the **status/badge** accurate and alerts the admin.

---

## 5. "Changes requested" doesn't reset when the contractor acts

After `request-changes`, a contractor re-uploading a document leaves `onboarding_status` stuck on `changes_requested`. In the portal document-upload route(s) (`server/routes/contractorPortal.ts`), when a contractor uploads/re-uploads while status is `changes_requested`, move it back to `in_progress` so it re-enters the normal flow (they then re-submit). Small change, closes the loop.

---

## 6. Consistency tidy-ups (low priority, do while you're here)

- **One portal-URL builder.** The invite (`contractors.ts:5106`, uses `x-forwarded-*`), resend-login (`5220`, uses raw `req.protocol`/`req.get('host')` — can yield a non-HTTPS or internal Replit host), and request-changes (`5633`, uses `APP_URL`) build the portal URL three different ways. Extract one helper that prefers `APP_URL`, then `x-forwarded-proto`/`x-forwarded-host`, then falls back. Use it everywhere.
- **Invite greeting.** `contractors.ts:5116` greets with raw `firstName` so it shows "Hello," when only the company contact name is known. Use the already-computed `resolvedFirst`.
- **Feature-gating is inconsistent** — `admin-overview`, `portal-invite`, `revoke`, `resend-login`, document review and `portal-documents` require `requirePortalFeature`, but `onboarding-requirements`, `approve-for-site`, `request-changes` and `onboarding-audit` don't. For now make them **consistent** (keep `requirePortalFeature` on all portal-admin endpoints). The deliberate core-vs-premium split (so the `/contractors` page works without the portal flag) is Phase 2 — don't half-do it here.

---

## How to verify (the whole prompt)

1. Approve a worker's RTW doc → `rightToWork = 'verified'`, readiness badge clears, kiosk check-in succeeds (with induction done). This is the headline fix.
2. Approve a document → an audit row `document_approved` appears in the timeline with the correct admin name; the document's `approvedBy` is populated.
3. Approve a contractor who's missing a required doc → you're forced to enter an override reason; audit shows `approved_for_site_override` with the reason and the missing items.
4. On an already-approved contractor, reject a required document (or let one expire and run the daily job) → status drops to `attention_needed`, an alert email is sent once, and the audit shows `auto_reverted`.
5. Request changes, then upload a document as the contractor → status moves from `changes_requested` to `in_progress`.
6. Invite, resend-login and request-changes emails all contain the same correctly-formed HTTPS portal URL; the invite greets by name when a contact name exists.
