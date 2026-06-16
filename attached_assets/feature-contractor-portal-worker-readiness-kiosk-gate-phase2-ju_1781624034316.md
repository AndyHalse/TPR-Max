# Feature — Worker readiness, kiosk hard-block & two-surface parity (Contractor onboarding Phase 2)

**Priority: HIGH — closes the loop opened in Phase 1: a worker is now provably "cleared to work on site" before they ever scan in, and the same controls work whether a customer manages contractors from the `/contractors` admin page or from the self-service Contractor Portal. Effort: medium — most of the engine already exists; this is largely centralising duplicated logic, surfacing it, and adding one review flow. Lower risk than Phase 1.**

## Background — read this first, the plumbing already exists

Phase 1 is built and live in this codebase: `contractor_companies.onboarding_status`, the `contractor_onboarding_requirements` and `contractor_onboarding_audit` tables, and the `approve-for-site` / `request-changes` / `submit-for-review` endpoints. Phase 2 builds directly on those — **do not recreate them.**

Three things are already in the codebase that Phase 2 leans on. Check them before writing anything:

1. **Per-worker clearance logic already exists** — `getWorkerClearanceStatus(custDb, workerId, customerId)` in `server/utils/contractorCompliance.ts:40`. It already returns `{ compliant, reasons }` after checking: worker banned/suspended, Right to Work `=== 'valid'`, site induction completed, and DBS (only when the worker is flagged `dbsRequired`). **It is currently only called in one place — `server/routes/ppm.ts:36`.** Nothing surfaces it to a user and nothing at the kiosk uses it.

2. **Site induction already supports contractor workers** — `induction_tokens` table has a `workerId` column "For contractors"; admins can already send inductions via `POST /api/contractors/workers/:workerId/send-induction` (`contractors.ts:983`) and `POST /api/contractors/:companyId/send-induction-all` (`contractors.ts:1003`). Completion flips the worker's `inductionCompleted` flag.

3. **Worker fields already exist** — `contractor_workers` has `rightToWork` (`right_to_work_status`: valid/expired/pending/missing, `schema.ts:1267`), `rightToWorkExpiry`, `inductionCompleted` (`site_induction_completed`), and `dbsRequired`. Contractors can already upload worker documents via the portal (`ContractorPortalWorkers.tsx` → `/api/contractor-portal/workers/:id/documents`).

So Phase 2 is mostly **surfacing, centralising, and connecting** — not building from scratch.

---

## The two problems Phase 2 must solve

### Problem A — check-in blocking is duplicated and already drifting
The same block-on-check-in rules are hand-copied into at least three routes, and they **already disagree**:
- `POST /api/contractors/workers/:workerId/checkin` (`contractors.ts:4406`) — blocks RTW when status is **pending**.
- `POST /api/contractors/prebookings/checkin` (`contractors.ts:559`) — treats RTW **pending as a warning only**.
- `POST /api/dev/contractors/workers/:workerId/checkin` (`contractors.ts:4329`) — dev path.

None of them call `getWorkerClearanceStatus`, none check DBS, and none write an audit record of a refused check-in. This is exactly the "two ways that should behave the same but don't" risk.

### Problem B — Phase 1's gate is locked to portal customers
The onboarding endpoints (`approve-for-site`, `request-changes`, `onboarding-requirements`) are gated `requireAuth + requirePortalFeature + requirePortalAdmin` (`contractors.ts:5524+`, `requirePortalFeature` defined at `contractors.ts:4949`). That means a lower-tier customer using only the `/contractors` page **cannot approve a contractor for site, set requirements, or see the audit trail at all.** Managing and approving contractors is core — it must work on `/contractors` for every tier. Only the *contractor-facing self-service portal* (a contractor logging in themselves) should stay a premium, flag-gated feature.

---

## 1. One source of truth for "is this worker cleared?" — and hard-block the kiosk

**Extend `getWorkerClearanceStatus`** (`contractorCompliance.ts`) to be the single authority, returning enough for both a hard block and a friendly message:

- Keep the existing checks (banned/suspended, RTW, induction, DBS).
- Add: worker `isActive === false` → blocking; `currentCardStatus === 'red'` (Red Card site ban) → blocking; contractor **company** `status === 'suspended'` → blocking; company `onboarding_status !== 'approved'` → blocking (this is the Phase 1 gate finally being enforced).
- Return a richer shape so callers don't re-implement severity:
  ```ts
  { ready: boolean; blocking: string[]; warnings: string[] }
  ```
  Map RTW consistently in ONE place — decide the rule once: **`expired` and `missing` block; `pending` is a warning.** (Pick this and apply it everywhere — it ends the current disagreement. If you'd rather pending also blocks, fine, but it must be identical across all paths.)

**Replace the inline blocking in all three check-in routes** (`:workerId/checkin`, `prebookings/checkin`, and the dev route) with a single call to this helper. If `ready === false`, return `400` with `{ error: "Cannot check in: " + blocking.join(' · '), issues: blocking }` (same response contract the kiosk already reads). Warnings don't block but are returned so the kiosk can show them.

This is the **hard-block at the kiosk**: a worker who hasn't completed the induction, whose RTW isn't valid, whose DBS is required-but-missing, or whose company isn't approved for site, **physically cannot check in** — at the kiosk, via QR, or via pre-booking, identically.

**Audit every refused check-in** (see §4): action `check_in_blocked`, actor = the kiosk/staff context, reason = the blocking list. A turned-away worker must leave a trace for "what happened on the day".

---

## 2. Surface worker readiness everywhere (both surfaces + portal)

Add a readiness endpoint that wraps the helper, e.g. `GET /api/contractors/workers/:workerId/readiness` (admin, `requireAuth`) and a portal equivalent `GET /api/contractor-portal/workers/:workerId/readiness` (portal auth, scoped to the caller's own company). Both call the **same** `getWorkerClearanceStatus`.

Show a **Ready / Not ready** badge with the reasons on:
- **Portal** — `ContractorPortalWorkers.tsx`: each worker card shows Ready (green) or Not ready (amber) with the exact reasons ("Induction not completed", "Right to Work not verified").
- **`/contractors` admin** — the worker views under `client/src/pages/contractor/*` (e.g. `ContractorWorkerProfileDialog.tsx`) and the worker list. Same badge, same reasons.
- **Admin readiness summary** — a simple "who's cleared / who's not" roll-up so reception/management can see status across all contractors at a glance. Add it to both `ContractorManagement.tsx` (the `/contractors` page) and `ContractorPortalAdmin.tsx`.

---

## 3. Let contractors get their own workers cleared (portal) + roll readiness into the gate

**Induction from the portal.** Add portal endpoints so a logged-in contractor can send/resend the site induction to their own workers and see the result, reusing the existing admin induction logic (don't fork it — extract the shared bit if needed):
- `POST /api/contractor-portal/workers/:workerId/send-induction`
- Show per-worker induction state in `ContractorPortalWorkers.tsx`: Not sent / Sent (date) / Passed / Failed (attempts).

**Right to Work via the portal.** Let the contractor upload a worker's RTW evidence through the existing worker-document flow (it already exists), tagged as document type `rightToWork`. When an admin **approves** that document (existing review flow in `ContractorPortalAdmin.tsx`), set the worker's `rightToWork = 'valid'` and `rightToWorkExpiry` from the document's expiry. Rejecting leaves it unverified. (Verification stays with the customer's staff — the contractor supplies, the site approves.)

**Roll worker readiness into the company gate.** In `getCompanyComplianceStatus` / the Phase 1 `submit-for-review` and `approve-for-site` checks, include a worker dimension: a company can't be `approved` for site while workers it has marked as going on site are Not ready — or, at minimum, surface "3 of 5 workers ready" on the admin approval view so the approver sees it before clicking **Approve for site**. (Keep the company-document gate from Phase 1; add the worker readiness summary alongside it.)

---

## 4. Parity across the two surfaces + one unified audit trail

**Ungate the management/approval path from the portal feature.** Split the gating cleanly:
- **Core (all tiers, `/contractors` page):** approving a contractor for site, requesting changes, setting onboarding requirements, managing workers, sending inductions, reviewing documents, and the audit trail. Gate these on `requireAuth + requirePortalAdmin` (role) **only** — remove `requirePortalFeature` from them, or add `/api/contractors/...` admin equivalents that aren't flag-gated.
- **Premium (`featureContractorPortal`):** the contractor *self-service portal* — contractors logging in themselves to upload and submit. This stays flag-gated.

The result: a lower-tier customer does everything from `/contractors` (they do the data entry on the contractor's behalf); a higher-tier customer lets the contractor self-serve through the portal. **Same capabilities, same gate, same audit — different door.**

**Unified audit — who did what, when, on either surface.** Phase 1 added `contractor_onboarding_audit`. Broaden its use (keep the table; widen the `action` values) so every meaningful action is logged with `actor` and `created_at`, whether it came from a staff user (`actor = username`) or a portal user (`actor = portal:<email>`):
- `submitted`, `approved_for_site`, `changes_requested` (Phase 1, keep)
- `document_approved`, `document_rejected` (with which document + reason)
- `induction_sent`, `induction_passed`, `induction_failed`
- `rtw_verified`, `rtw_revoked`
- `worker_readiness_changed` (became ready / became not-ready, with reasons)
- `check_in_blocked` (worker, reasons) and `check_in_allowed`
- `access_revoked`

Surface a readable **timeline** on the contractor detail view of **both** `ContractorManagement.tsx` and `ContractorPortalAdmin.tsx` — newest first, plain English: *"16 Jun, 14:32 — Andy Halse approved Apex Electrical for site"*, *"16 Jun, 09:10 — portal:joe@apex.co.uk submitted for review"*. This is the "if something went wrong, who did what" record — for a safety/compliance product it's the point of the whole thing.

---

## Scope guard — what's NOT in Phase 2

- **No new induction engine** — reuse the existing tokens/quiz. Phase 2 just lets contractors trigger it and surfaces the result.
- **No worker DBS *upload* via the portal** — DBS recording/verification stays admin-side (per the existing `feature-contractor-worker-dbs-phase1-june2026.md`). Phase 2 only *enforces* DBS at check-in via `getWorkerClearanceStatus` for workers flagged `dbsRequired`.
- **Don't redesign the kiosk UI** — only change what it shows when a check-in is blocked (clear reasons) and make sure warnings display. The block itself is server-side.

---

## How to verify

1. **One source of truth:** a worker with no induction is blocked identically at the kiosk (`/checkin`), via pre-booking (`/prebookings/checkin`), and via QR — same message, same reasons. RTW `pending` behaves the same way in all three (no more drift).
2. **Hard-block proves out:** worker with induction done + RTW valid + (DBS not required) + company approved → checks in. Remove any one → check-in returns 400 with that exact reason, and a `check_in_blocked` audit row is written.
3. **Company gate enforced:** a contractor whose company `onboarding_status` isn't `approved` cannot check workers in, even if the worker's own docs are fine.
4. **Readiness visible:** the Ready/Not-ready badge with reasons shows on the portal worker card AND the `/contractors` worker view, both driven by the same endpoint.
5. **Contractor self-serve:** from the portal, a contractor sends an induction to their worker and uploads RTW; an admin approves the RTW → worker's `rightToWork` flips to `valid` and the readiness badge turns green.
6. **Two-surface parity:** with `featureContractorPortal` **off**, a staff user on `/contractors` can still set requirements, approve a contractor for site, request changes, manage workers, and view the full audit timeline. With it **on**, the contractor can also self-serve via the portal. Both write to the same audit trail.
7. **Audit completeness:** approving, rejecting a document, sending an induction, verifying RTW, and a blocked check-in each produce a timeline entry showing the correct actor (staff username vs `portal:<email>`) and timestamp, visible on both admin surfaces.
