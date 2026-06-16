# Feature — Contractor Portal: onboarding flow + "Approve for site" gate (Phase 1)

**Priority: HIGH — turns the portal from a document inbox into a proper onboarding process with a clear finish line. Effort: medium (one config table, one audit table, two new columns, status logic in an existing helper, admin + contractor UI, a few emails). Builds on what already exists — do not rebuild the document-upload or invite flows.**

## Background (what and why)

The Contractor Portal works today but it's a **document inbox, not an onboarding process**:

- **Contractor side** (`client/src/pages/contractor-portal/*`): they log in, see a flat list of 9 document tiles (`ContractorPortalDocuments.tsx`), upload files, and add workers (`ContractorPortalWorkers.tsx`). There's no guidance on what's actually required, no progress, and no "I'm done — what now?" moment.
- **Admin side** (`client/src/pages/ContractorPortalAdmin.tsx`): you approve/reject files one at a time in the "Pending Documents" tab. There's no single point where a contractor becomes **approved to work on site**, and no audit trail of who approved what.

Two things already exist that we'll build on, so check them before writing anything new:

1. **The company gate field already exists.** `contractors` table has `status text NOT NULL DEFAULT 'pending'` with comment `// pending, approved, suspended` (`shared/schema.ts:1111`). Nothing currently drives or surfaces this from the portal. **This is our access gate.**
2. **A company compliance helper already exists.** `server/utils/contractorCompliance.ts` → `getCompanyComplianceStatus()` checks a **hard-coded** `LEGALLY_REQUIRED_DOC_TYPES` list (only Public Liability + Employers' Liability). We're going to make that required set **configurable per customer** and reuse this helper to compute "ready to submit / ready to approve".

The model we're building (one status, moving one direction):

**Not started → In progress → Submitted for review → Approved (or Changes requested → back to In progress)**

---

## 1. Configurable required-document set (per customer, sensible UK defaults)

Right now "what's required" is two hard-coded types. Make it configurable so different customers/sites can require different things, but ship with defaults so nobody has to configure anything to get value.

**New table `contractor_onboarding_requirements`** (provision it for every customer schema the same way other contractor tables are added — follow the `ADD COLUMN`/`CREATE TABLE IF NOT EXISTS` pattern in `server/customerDatabase.ts` / `server/missingTablesMigration.ts`):

```sql
CREATE TABLE IF NOT EXISTS contractor_onboarding_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type TEXT NOT NULL,      -- matches the keys in UK_DOC_TYPES (publicLiability, employersLiability, rams, healthSafety, ...)
  label TEXT NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**Seed defaults on first use** (if the table is empty for a customer): `publicLiability` (required), `employersLiability` (required), `rams` (required), `healthSafety` (required) — everything else from the existing `UK_DOC_TYPES` list in `ContractorPortalDocuments.tsx` as **optional** (`is_required = false`). Keep the document-type keys identical to that list so nothing else has to change.

**Admin settings UI:** a small "Onboarding Requirements" section. Simplest home is a new card on the existing **Contractor Portal admin page** (`ContractorPortalAdmin.tsx`) — a third tab "Requirements" next to "Portal Users" and "Pending Documents", or a settings sub-page if that fits the pattern better. Each known document type is a row with a Required/Optional toggle. Save writes to the table above.

API: `GET /api/contractors/onboarding-requirements` and `PUT /api/contractors/onboarding-requirements` (admin, `requireAuth`, customer-scoped). Add these where the other contractor admin routes live (`server/routes/contractors.ts`).

---

## 2. Company onboarding status + the "Approve for site" gate

Keep the existing `status` field (`pending`/`approved`/`suspended`) as the **access gate** — `approved` means "cleared to work on site". Add a separate column to track where they are in the **workflow** (so we don't overload one field):

- Add `onboarding_status TEXT NOT NULL DEFAULT 'not_started'` to `contractors` (`ADD COLUMN IF NOT EXISTS` in `customerDatabase.ts`). Values: `not_started | in_progress | submitted | approved | changes_requested`.
- Add `onboarding_submitted_at TIMESTAMP` and `onboarding_approved_at TIMESTAMP` while you're there.

**How the status moves:**

- `not_started` → `in_progress` automatically the first time the contractor uploads any document via the portal.
- The contractor can **Submit for review** (new action, see §4) only once every **required** document (from §1) is uploaded and not expired — reuse `getCompanyComplianceStatus`, but rewrite it to read the configurable requirements table instead of the hard-coded `LEGALLY_REQUIRED_DOC_TYPES` constant (keep the same `{ compliant, reasons }` return shape so existing callers don't break). Submitting sets `onboarding_status = 'submitted'`, stamps `onboarding_submitted_at`.
- **Admin "Approve for site"** (new button, see §3): sets `status = 'approved'`, `onboarding_status = 'approved'`, stamps `onboarding_approved_at`, writes an audit row (§5), emails the contractor (§6).
- **Admin "Request changes"**: sets `onboarding_status = 'changes_requested'` with a reason; contractor sees what to fix; once they re-upload it goes back to `in_progress` and they can re-submit. (Document-level reject already exists — keep it; this is the company-level send-back.)

New endpoints (admin, `requireAuth`, in `server/routes/contractors.ts`):
- `POST /api/contractors/:id/approve-for-site`
- `POST /api/contractors/:id/request-changes`  (body: `{ reason }`)

New endpoint (portal, in `server/routes/contractorPortal.ts`, behind the existing portal auth):
- `POST /api/contractor-portal/submit-for-review` — server re-checks required docs before accepting (never trust the client); returns 400 with the missing list if incomplete.

---

## 3. Admin UI changes (`ContractorPortalAdmin.tsx`)

- **New stat tile / status:** show how many contractors are **awaiting site approval** (`onboarding_status = 'submitted'`). This is the queue that matters most to you.
- **New "Awaiting Approval" view** (a tab, or a section above Pending Documents): each submitted contractor as one row with company name, a green tick list of their required docs, and **one primary button: "Approve for site"** plus a secondary "Request changes". This is the one-click finish line — don't make the admin approve five files individually to clear a contractor.
- On the existing per-contractor view (`/contractors/:id`), show the onboarding status badge (Not started / In progress / Submitted / **Approved for site** / Changes requested) prominently.
- Keep the existing document-by-document approve/reject — it still feeds document validity. The company gate sits on top of it.

Match the existing look: `GlassCard`, tooltips on every action button, ACS blue `#2460A9` for primary actions, toasts on success/error (same patterns already in this file).

---

## 4. Contractor UI changes — make it a guided checklist

**`ContractorPortalDashboard.tsx`:** replace the four flat stat cards as the hero with an **onboarding progress panel**:
- A progress bar: "Onboarding: 3 of 4 required documents complete".
- A clear current-state line: e.g. "You're nearly there — upload your RAMS to finish" / "Submitted on 16 Jun — waiting for the site team to review" / "✅ Approved — you're cleared to work on site" / "Changes requested: …".
- A primary **"Submit for review"** button that's disabled (with a tooltip listing what's missing) until all required docs are in, then becomes active.
- Keep the rejected-docs alert that's already there.

**`ContractorPortalDocuments.tsx`:** mark each document tile **Required** or **Optional** (from §1's config), and sort required ones to the top. A contractor should be able to glance at the page and know exactly what they must do.

The point of the whole phase: a contractor logs in and immediately knows **what to do, how far they've got, and when they're done** — without anyone explaining it to them.

---

## 5. Audit trail (this is a compliance product — approvals must be logged)

There is currently **no record of who approved or rejected a contractor**. Add one.

**New table `contractor_onboarding_audit`** (provision per customer schema):

```sql
CREATE TABLE IF NOT EXISTS contractor_onboarding_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,
  action TEXT NOT NULL,             -- submitted | approved_for_site | changes_requested | access_revoked
  actor TEXT NOT NULL,              -- staff user email, or portal:<email> when the contractor submits
  reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

Write a row on every status transition in §2. Surface the history on the contractor's admin detail view (a simple timeline list). If there's an existing platform `auditLogs` table being used elsewhere, log there too — but this dedicated table keeps the contractor timeline easy to query.

---

## 6. Notifications

Reuse `EmailService` (already imported and used in `contractorPortal.ts`). Plain, branded emails consistent with the existing portal emails:

- **Contractor submits** → email the site admin (use the same notify-address resolution already in this file: `process.env.CONTRACTOR_NOTIFY_EMAIL || process.env.BUG_REPORT_NOTIFY_EMAIL`): "X has submitted their onboarding for review."
- **Approved for site** → email the contractor: "Good news — you're approved to work on [site]." (genuinely useful; nothing tells them today).
- **Changes requested** → email the contractor with the reason and a link back to the portal.

---

## 7. Wire the gate into the rest of the platform

- `getCompanyComplianceStatus` now reads the configurable requirements (§2) — so the **Compliance Dashboard** (`server/routes/complianceDashboard.ts`) automatically reflects the real required set rather than just PL+EL. Confirm it still returns the same shape.
- Anywhere site access / check-in already keys off `contractors.status === 'approved'`, it now gets driven properly by the portal flow. **Do not** add new hard blocks to kiosk/check-in in this phase — just make the status accurate and visible. (Enforcing "block non-approved contractors at the kiosk" is a deliberate follow-up so we don't surprise live sites.)

---

## Known bug to fix while you're in here

The portal's "Expired" document count is always 0 — nothing ever sets a contractor document's `status` to `expired` (the column at `shared/schema.ts:1237` supports it; the value is just never written). Since "required docs complete" depends on expiry being correct, compute expiry from `expiry_date < now()` wherever the required-set check and the `document-stats` endpoint run (don't rely on a stored `expired` status). This is the same class of bug already noted for the RAMS/compliance dashboards.

---

## Scope guard — what's NOT in Phase 1 (this is deliberate)

- **Per-worker readiness + worker site induction inside the portal.** Workers can still be added and have documents uploaded (unchanged). The per-worker "Ready / Not ready" badge and letting workers complete the **site induction** inside the portal is **Phase 2** — it's the bigger, riskier piece and we agreed to land the company-level gate first. Leave a clean seam for it (the `getWorkerClearanceStatus` helper already exists and is where Phase 2 will hook in).
- **Hard-blocking non-approved contractors at the kiosk/check-in** — follow-up, see §7.
- **Contractor-worker DBS** — already specced separately (`feature-contractor-worker-dbs-phase1-june2026.md`); it slots into the worker readiness phase, not this one.

---

## How to verify

1. A brand-new contractor with no documents shows `onboarding_status = not_started`; the portal dashboard shows 0% and "Submit for review" is disabled with a tooltip listing all required docs.
2. Upload one document → status flips to `in_progress`; progress bar updates; Submit still disabled until every **required** doc is uploaded and unexpired.
3. As admin, mark "RAMS" optional in Requirements → that contractor's required count drops and Submit can become available without it. Mark it required again → Submit blocks again.
4. Upload all required docs → Submit enables; submitting sets `submitted`, emails the admin, and the contractor appears in the admin "Awaiting Approval" view.
5. Admin clicks **Approve for site** → `status = approved`, `onboarding_status = approved`, contractor gets the approval email, an audit row is written, and the contractor's dashboard shows "✅ Approved — cleared to work on site".
6. Admin clicks **Request changes** with a reason → contractor sees the reason, status is `changes_requested`; re-uploading moves them back to `in_progress` and they can re-submit.
7. The contractor's admin detail view shows the full onboarding timeline (submitted → approved, with who and when).
8. A document with an expiry date in the past is counted as expired everywhere (dashboard "Expired" count, and it blocks "ready to submit") — confirming the expiry bug is fixed.
9. The Compliance Dashboard's contractor scoring reflects the configurable required set, not just PL+EL.
