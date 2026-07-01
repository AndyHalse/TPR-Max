# Feature: Generalise SSIP Accreditation Tracking (not just CHAS) + Explanatory Tooltips

## Context — why this matters
TPR Max currently tracks contractor company accreditations inconsistently:

| Scheme | Current storage | Certificate number? | Expiry date? | Expiry alert? |
|---|---|---|---|---|
| CHAS | `chas_certified` bool, `chas_certificate_number`, `chas_expiry_date` | ✅ | ✅ | ✅ (`complianceDashboard.ts`) |
| SafeContractor (Alcumus) | `safe_contractor_certified` bool, `safe_contractor_number`, `safe_contractor_expiry_date` | ✅ | ✅ | ✅ |
| Constructionline | `constructionline_grade` text only (not_registered/registered/silver/gold/platinum) | ❌ | ❌ | ❌ |
| SMAS Worksafe | `smas_accredited` bool only | ❌ | ❌ | ❌ |
| Everything else (Achilles, Altius/RISQS, Avetta, Acclaim Accreditation, Bureau Veritas, CQMS, ISO 9001/14001/45001, etc.) | single free-text `other_accreditations` field | ❌ | ❌ | ❌ |

SSIP (Safety Schemes in Procurement) is the UK umbrella recognising ~10 member schemes as equivalent to PAS 91 — a contractor only needs ONE recognised scheme, but property managers need to see WHICH one, its certificate number, and its expiry, for every scheme a contractor holds, not just CHAS/SafeContractor. Right now Constructionline/SMAS/anything else is a dead end: no number, no expiry, no alert, and multiple "other" accreditations can't be recorded at all (one field only).

Files confirmed by grep (2 Jul 2026): `shared/schema.ts` + `server/isolatedSchema.ts` (columns ~L1160-1170 / ~L874-898), `server/routes/contractors.ts` (CRUD ~L113-130, ~L1471-1472, ~L5259-5260), `server/routes/complianceDashboard.ts` (alert logic ~L207-242), `client/src/pages/contractor/ContractorEditCompanyDialog.tsx` (edit form), `client/src/pages/contractor/ContractorCompaniesTab.tsx` (badges ~L294-412), locale files `client/src/locales/{en,es}/contractors.json` (existing tooltip convention: keys ending `Tooltip`, e.g. `complianceTooltip`, `cdmRoleTooltip`).

There is already a proven pattern in this codebase for exactly this shape of problem — **worker certifications** (`server/routes/contractorWorkerCerts.ts`, `WorkerCertificatesTab.tsx`): a catalogue table (`worker_certification_types`: key, name, category, requires_expiry, is_active) joined against an evidence/records table, with derived status (`missing` / `pending_review` / `rejected` / `valid` / `expiring_soon` / `expired`). Mirror that pattern at company level instead of inventing a new one.

## Scope

### 1. Schema — new tables (needs `npm run db:push`)
- `company_accreditation_types` catalogue, seeded with: CHAS, SafeContractor (Alcumus), Constructionline, SMAS Worksafe, Achilles (Building Confidence / UVDB), Altius (RISQS), Avetta, Acclaim Accreditation, Bureau Veritas Certification, CQMS, and a generic "Other" entry. Columns: `key`, `name`, `is_ssip_member` (bool — true for all of the above except a customer-added custom "Other" entry), `has_grade` (bool, true only for Constructionline), `is_active`.
- `contractor_company_accreditations` records table: `id`, `company_id`, `type_key` (FK to catalogue), `custom_name` (text, only used when `type_key = 'other'` — preserves today's free-text flexibility but per-row instead of one shared blob), `certificate_number`, `grade` (nullable, only meaningful when `has_grade`), `expiry_date`, `evidence_document_id` (nullable FK to the existing contractor document upload, if one exists for company-level docs — check `contractor_documents` for a company-level analogue before adding a new upload path), `is_demo`, `created_at`/`updated_at`.
- Status derivation identical to the worker-cert pattern: `missing` (no row) / `valid` / `expiring_soon` (within 90 days, reuse the existing 90-day window from `contractorWorkerCerts.ts`) / `expired`.

### 2. Data migration (part of the same db:push migration, run once)
- For every existing contractor company: if `chas_certified`, insert a row (type_key='chas', number, expiry). Same for SafeContractor. If `constructionline_grade` not 'not_registered', insert a row (type_key='constructionline', grade, no number/expiry — those fields stay null until the customer fills them in). If `smas_accredited`, insert a row (type_key='smas'). If `other_accreditations` has text, insert ONE row (type_key='other', custom_name=that text, no number/expiry).
- **Do not drop the old columns yet.** Stop writing to them (routes now write only to the new table) but leave them in the schema as a rollback safety net. Note in the PR/summary that they can be dropped in a follow-up once Andy has verified the migrated data looks right in at least one live customer.

### 3. API (`server/routes/contractors.ts` or a new `server/routes/companyAccreditations.ts` alongside `contractorWorkerCerts.ts`)
- `GET /api/contractor-companies/accreditation-types` — active catalogue.
- `GET /api/contractor-companies/:companyId/accreditations` — catalogue joined to this company's records, derived status, same shape as the worker-cert endpoint.
- `POST` / `PATCH` / `DELETE /api/contractor-companies/:companyId/accreditations/:id` — add/edit/remove one accreditation row. A company can hold multiple "Other" rows (e.g. ISO 9001 AND ISO 45001) since each is its own row now.
- Update `complianceDashboard.ts` (~L207-242): replace the two hardcoded `checkInsurance(c.chas_expiry_date, ...)` / `checkInsurance(c.safe_contractor_expiry_date, ...)` calls with a loop over every row in `contractor_company_accreditations` that has an `expiry_date`, using the scheme's `name` from the catalogue as the alert label. This means Constructionline/SMAS/Achilles/etc. get real expiry alerts for the first time, not just CHAS/SafeContractor.

### 4. UI — `ContractorEditCompanyDialog.tsx`
- Replace the current single checkbox (CHAS) + dropdown (Constructionline grade) + checkbox (SMAS) + free-text box (other) with one repeatable "Accreditations" list: an "Add accreditation" button opens a row with scheme dropdown (populated from the catalogue, "Other" always last with a name field that appears only when selected) + certificate number + expiry date + optional evidence upload. Existing rows editable/removable inline, same interaction pattern as `WorkerCertificatesTab.tsx`.

### 5. UI — `ContractorCompaniesTab.tsx` badges (~L294-412)
- Replace the two hardcoded badges (Constructionline grade, CHAS) with one badge per held accreditation, colour-coded by derived status (green=valid, amber=expiring_soon, red=expired — reuse whatever colour convention the insurance-expiry badges already use elsewhere on this page for consistency). Cap visible badges at 3-4 with a "+N more" overflow that expands on click/hover.

### 6. Tooltips (Andy's explicit ask — plain English, no assumed knowledge)
Using the existing `xTooltip` key convention in `client/src/locales/{en,es}/contractors.json`:
- A section-level tooltip on "Accreditations" (both the edit dialog and wherever the section header appears) explaining SSIP in one or two sentences: what it is, and that a contractor only needs ONE recognised scheme to be SSIP-compliant — holding several doesn't mean more compliant, it's redundant.
- A per-scheme tooltip (on the badge and in the dropdown) naming the scheme in full and flagging `is_ssip_member` — e.g. hovering "CHAS" → "Contractor Health and Safety Assessment Scheme — an SSIP-recognised accreditation." Hovering a custom "Other" entry that isn't SSIP-recognised (e.g. ISO 9001) → plain description with a small "(not an SSIP scheme)" note so users don't mistake it for SSIP cover.
- A tooltip on the expiry date field: what happens when it lapses (alert generated, feeds into the compliance dashboard/score).
- Add the new keys to BOTH `en/contractors.json` and `es/contractors.json` (the codebase already ships bilingual tooltips throughout — match that, don't leave Spanish half-done).

### 7. Tests
- Extend whatever contractor/company test coverage exists to cover: migration produces expected rows from existing CHAS/SafeContractor/Constructionline/SMAS/other data; expiry alert fires for a non-CHAS scheme (e.g. Constructionline with an expiry date) — this is the actual bug being fixed, so it needs its own assertion, not just a CHAS regression check.

## Explicitly out of scope
- Marketing copy (`MarketingPage.tsx` CHAS/SMAS/Constructionline mentions) — update separately once this ships, not part of this prompt.
- Dropping the old CHAS/SafeContractor/Constructionline/SMAS/other columns — flagged as a follow-up once Andy verifies migrated data.
- Any change to worker-level certifications (`contractorWorkerCerts.ts`) — that pattern is already correct and is only being used here as the template.

## Needs `npm run db:push`: YES (two new tables)
