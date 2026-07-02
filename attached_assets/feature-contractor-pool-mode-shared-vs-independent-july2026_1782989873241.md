# Feature — Contractor Pool Mode: Shared vs Independent (Enterprise Multi-Site)

**Needs `npm run db:push`** (one new column + one new table).

## Goal (plain English)
Enterprise customers currently share ONE contractor pool across the whole estate:
a firm is vetted once at head-office level and every site sees it. That is right for
central-control customers (Cowiesburn) but wrong for customers who run their sites
independently (CPI-style), where each site should approve its **own** contractors and
**not** see head office's list.

Add a per-customer switch:

- **Shared** (default) — exactly today's behaviour. Do not change anything for
  existing customers.
- **Independent** — one shared company *record* (vetting docs entered once, no
  re-keying), but **each site independently approves/rejects it and only sees firms
  linked to that site**.

The switch lives in **Group Standards**, is **enterprise-admin only**, and defaults to
**Shared** so no existing customer's behaviour changes on deploy.

## Non-negotiable design rules
1. **One resolver, every call site.** Create `resolveContractorPoolScope(req)` in
   `server/siteScope.ts` (or a sibling `server/contractorPoolScope.ts`) returning
   `{ mode: 'shared' | 'independent', activeSiteId: string | null }`. **Every**
   contractor-company list read and **every** approval/reject/suspend write MUST go
   through it. Do NOT re-derive mode or site inline anywhere. (This whole subsystem's
   bug history is "scope resolved inconsistently at different call sites" — do not
   repeat it.)
2. **Fail closed.** Independent mode with no active site selected for a non-admin →
   return no companies (never the estate-wide list).
3. **Single-site / non-enterprise customers unaffected.** Mode read only matters when
   `customers.isEnterprise` is true; otherwise behave exactly as today.
4. **Workers-on-site stay per-site as they are now** (already `siteId`-scoped). This
   change is ONLY about the *company pool* visibility and approval.
5. **British English**, en-GB dates/times, no glassmorphism on any emergency/kiosk view.

## Data changes (db:push)
1. Add `contractor_pool_mode text NOT NULL DEFAULT 'shared'` to the **customers**
   table (management DB, alongside `is_enterprise`). Allowed values: `'shared'`,
   `'independent'`.
2. New table `contractor_site_approvals` in the isolated customer schema:
   - `id` (uuid pk, default gen_random_uuid())
   - `company_id` varchar NOT NULL → references `contractor_companies.id`
   - `site_id` varchar NOT NULL
   - `status` text NOT NULL DEFAULT 'pending'  (pending | approved | rejected | suspended)
   - `approved_by` varchar → references users.id (nullable)
   - `approved_at` timestamp (nullable)
   - `reason` text (nullable — rejection/suspension/override reason)
   - `created_at` timestamp NOT NULL DEFAULT now()
   - `updated_at` timestamp NOT NULL DEFAULT now()
   - UNIQUE (`company_id`, `site_id`)
   Add it to the site-scoped table list documentation in `server/siteScope.ts` (it is
   inherently per-site via `site_id`).

## Server changes
- **`resolveContractorPoolScope(req)`** — reads `customers.isEnterprise` +
  `contractor_pool_mode` and the session `activeSiteId`. Non-enterprise → always
  `{ mode: 'shared', activeSiteId: null }`.
- **`GET /api/contractors`** ([contractors.ts:894](server/routes/contractors.ts:894)) —
  replace the hard-coded `getAllContractorCompanies(context, null)`:
  - `shared` → unchanged (estate-wide list, company.status as today).
  - `independent` → return only companies that have a `contractor_site_approvals` row
    for the active site, and surface **that row's** status (not the global
    `company.status`). No active site (non-admin) → empty list.
- **Every other company-list read must honour the same scope.** Audit and update:
  `pending-docs-count` (251), `compliance-gap-count` (269), and any read of
  `getAllContractorCompanies` / `.from(contractorCompanies)` that powers a
  user-facing list or count. Route each through `resolveContractorPoolScope`.
- **`POST /api/contractors/:id/approve-for-site`**
  ([contractors.ts:5973](server/routes/contractors.ts:5973)) — today this misleadingly
  sets the **global** `company.status='approved'`. Change:
  - `shared` → keep current behaviour (global approve).
  - `independent` → UPSERT the `contractor_site_approvals` row for
    (companyId, activeSiteId) to `status='approved'`, set approved_by/approved_at;
    do **not** touch the global `company.status`. Keep the existing compliance /
    override-reason gate. Keep the approval email.
- **Reject / suspend equivalents** — same split: independent mode writes the per-site
  row, shared mode keeps global behaviour.
- **Linking a firm to a site (independent mode)** — a site adds a contractor by
  creating a `contractor_site_approvals` row (status `pending`) against either an
  existing estate company or a newly-created one. Provide the endpoint/path the
  Contractors "Add" flow needs so a site can pull in an existing firm.
- **Mode switch endpoint** — `PUT /api/enterprise/contractor-pool-mode` (enterprise-admin
  only; reuse `resolveGrantsForReq` and reject anything that isn't `allowedSiteIds === 'all'`
  / customer-admin-on-enterprise). On switching **shared → independent**, back-fill:
  seed an `approved` `contractor_site_approvals` row for **every existing site** for
  every currently-`approved` company, so no site is locked out on day one. New firms
  thereafter start `pending` per site. (Andy's chosen default — continuity, not clean slate.)

## Client changes
- **Group Standards page** (`client/src/pages/EnterpriseStandards.tsx`) — add a
  "Contractor Pool" toggle: **Shared across estate** / **Independent per site**.
  Enterprise-admin only (hide/disable for area_manager & site_coordinator). Plain-English
  helper text explaining the trade-off, and a confirm dialog on switching (warn that
  switching to Independent seeds current approvals to all sites; switching back to
  Shared makes the estate-wide list visible again).
- **Contractors page** — in independent mode the status shown per firm is the
  **active site's** status; the "Approve for site" action approves for the current
  site only. Wording should make clear which site you're approving for (use the active
  site name from the switcher).
- Real error states on 403/failure (message + retry), crash-safe, distinct from empty.

## Tests (extend the route-level isolation test — must be able to BITE)
In `tests/site-isolation.routes.test.ts`, add cases driving **real `/api` routes** with
supertest:
- **Independent mode:** a company linked/approved only to Site B must NOT appear in a
  Site-A user's `GET /api/contractors`. Site A calling `approve-for-site` creates a
  Site-A approval row and does NOT approve the firm for Site B.
- **Shared mode:** `GET /api/contractors` still returns the estate-wide list unchanged.
- **Bite check:** temporarily un-scope the independent list read → the Site-A test must
  go red → restore. A green test that cannot fail is worthless.

## Acceptance
- Shared customers (incl. Cowiesburn) see zero behaviour change.
- In independent mode, Site A cannot see or approve Site B's contractors via the API.
- Vetting docs are entered once (shared record) even in independent mode.
- Toggle is enterprise-admin only and defaults to Shared.
- Route isolation test covers both modes and bites on a deliberate break.
