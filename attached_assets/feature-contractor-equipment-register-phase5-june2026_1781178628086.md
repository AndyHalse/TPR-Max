# Feature — Contractor plant & equipment register (Phase 5 of the worker-compliance roadmap)

**Priority: HIGH — the biggest non-cert gap, and the one an experienced H&S manager will ask about in a demo. Effort: medium. Reuses the Phase 2 evidence engine. Do after Phase 2 (`feature-contractor-worker-certs-phase2-june2026.md`).**

Roadmap: `TPR Max - Roadmap/contractor-worker-compliance-roadmap.md` + audit `TPR Max - Roadmap/uk-contractor-compliance-coverage-audit.md`.

## The problem

TPR tracks the *people* a contractor brings on site (workers + certificates), but not the *equipment* they bring — MEWPs, scissor lifts, generators, ladders, mobile towers, power tools, vehicles, lifting gear. That kit carries its own legal paperwork: **LOLER 1998** thorough examination (lifting equipment, every 6–12 months), **PUWER 1998** inspection, **PAT testing** (electrical), plant/tool insurance, and MOT/road tax for vehicles. There's nowhere in TPR to record or chase any of it. `ppm_assets` is the customer's *own* asset register, not contractor-supplied equipment — don't reuse it.

## What to build

Mirror the worker-certificate pattern from Phase 2 — an equipment record, with evidence documents and expiry, reusing `contractor_documents` as the evidence store.

1. **`contractor_equipment` table** (customer schema, same provisioning pattern as other contractor tables): `id`, `company_id` (FK contractor_companies), `name`, `category` (mewp / scissor_lift / generator / ladder / tower / power_tool / vehicle / lifting_gear / other), `make_model`, `serial_or_reg` (serial number or vehicle reg), `notes`, `is_active`, timestamps.

2. **Equipment evidence on `contractor_documents`.** Add a nullable `equipment_id` column (FK contractor_equipment), the same way `worker_id` already exists. An equipment certificate is a document row tagged with `equipment_id` + a `document_type` from an equipment-cert catalogue, carrying the uploaded copy, expiry date, and approval status. Reuse the Phase 2 upload/review/expiry logic wholesale — including the rule that a storage failure returns an error and never saves an empty `document_url`.

3. **Equipment certificate catalogue** — add equipment cert types to the Phase 2 `worker_certification_types` catalogue (or a parallel `equipment_certification_types` if you prefer to keep worker vs equipment separate): LOLER Thorough Examination (LOLER 1998), PUWER Inspection (PUWER 1998), PAT Test, Plant/Tool Insurance, MOT, Road Tax/Insurance. Each with `requires_expiry: true` and the legal basis string.

4. **Compliance + expiry.** Equipment with an expired LOLER or PAT certificate must surface as non-compliant — opt-in per category, same approach as Phase 1/2 (don't make every category mandatory for every customer). Feed equipment cert expiry into the existing contractor-document expiry digest and the compliance dashboard (a "contractor equipment" signal alongside worker competency).

5. **Portal + admin UI.**
   - Admin: an Equipment tab on the contractor company record — add equipment, upload its certificates, see status badges (valid / expiring / expired / missing-required). Reuse the document review flow.
   - Portal (depends on Phase 3): let a logged-in contractor add their equipment and upload its certificates, scoped to their own company (same ownership checks as Phase 3 worker docs). Admin approves.

## Scope guard

- Don't reuse `ppm_assets` — that's the customer's own maintenance register, a different thing.
- Reuse the Phase 2 evidence engine and catalogue — don't build a separate upload/expiry/review path.
- Equipment-required certificates are opt-in per category, defaulting off, so existing customers aren't suddenly non-compliant.

## Verify

1. Add a MEWP to a contractor, upload a LOLER thorough-examination certificate with a future expiry → equipment shows "valid".
2. Set the LOLER expiry to yesterday → equipment shows "expired", appears in the expiry digest, and (if LOLER is marked required for MEWPs) marks the contractor non-compliant on the dashboard.
3. A contractor with no equipment-required certs configured is unaffected (no false non-compliance).
4. Storage failure on a certificate upload returns an error, creates no row.
5. (With Phase 3) a contractor uploads equipment certs through the portal; they land pending for admin review and can't touch another company's equipment.
