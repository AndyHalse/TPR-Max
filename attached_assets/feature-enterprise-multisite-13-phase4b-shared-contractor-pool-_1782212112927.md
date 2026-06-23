# Enterprise Multi-Site — Prompt 13 — Phase 4b: Shared contractor pool

**Phase 4 of the Enterprise Multi-Site build. A contractor cleared once is known across the estate. Run after prompt 12.**

## Context
After prompt 02, `contractor_companies` and `contractor_workers` carry a `site_id`. For enterprise customers we want a contractor company and its workers to exist **once at the enterprise level**, with their compliance (insurance, Right to Work, CSCS, DBS) verified once — and then be bookable at any site, with a **per-site** clearance/induction record. This avoids re-onboarding the same contractor 120 times.

## What to build

### 1. Contractor company/worker at enterprise level
- For enterprise customers, treat `contractor_companies` and `contractor_workers` as **estate-level** (not bound to one site): set their `site_id` to NULL or a reserved “shared” marker for enterprise customers, and stop forcing the active-site filter on the company/worker records themselves.
- Keep **per-site** records site-scoped: `contractor_visits`, `contractor_prebookings`, `induction_tokens`, and the onboarding approval/clearance record carry the real `site_id`.
- “Cleared at site X” = a per-site induction/approval record on top of the shared company record, extending the existing onboarding approval gate with `site_id`.

### 2. Estate-wide contractor view
- For enterprise admins/area managers (within scope): a view of each contractor showing company-level compliance once, plus where they are **cleared / pending / missing** across sites (e.g. “compliant; cleared at Edinburgh HQ & Perth; induction missing at Glasgow”).
- Booking a contractor at a site reuses the shared company/worker; only the site clearance + visit is per-site.

### 3. Non-enterprise behaviour
- Non-enterprise customers keep the current behaviour exactly: one default site, contractors as today.

## Rules
- Company-level compliance (insurance, accreditations) is shared; **site clearance and inductions are per-site** and must remain site-scoped (a contractor inducted at Site A is NOT automatically inducted at Site B).
- Respect the role matrix and the prompt 03/07 scoping for all per-site records.
- The prompt 04 isolation tests must still pass for the per-site contractor tables.

## Acceptance criteria
- A contractor onboarded once appears as bookable at multiple sites without re-entering company compliance.
- The contractor is only “cleared” at a site once that site’s induction/approval is complete.
- The estate view shows per-site clearance status accurately.
- Non-enterprise customers’ contractor flow is unchanged.

## Do NOT
- Do not share **site clearance / induction** across sites — only the company/worker record and its company-level compliance are shared.
- Do not duplicate worker compliance documents per site.
