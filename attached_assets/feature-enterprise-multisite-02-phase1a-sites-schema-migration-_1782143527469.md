# Enterprise Multi-Site — Prompt 02 — Phase 1a: Sites schema + site_id + migration

**Phase 1 of the Enterprise Multi-Site build. This is the data-model foundation. Be precise. Everything else depends on this being correct.**

## Context
Each customer has their own isolated PostgreSQL database, schema in `server/isolatedSchema.ts` (96 tables, no `customerId` columns). Migrations are raw-SQL `Migration` objects (`{ version, description, async up(db) }`) registered in `createMigrationRunner()` in `server/migrationRunner.ts`, applied per customer by `ensureSchema(customerId)`. Follow the existing pattern in `server/contractorMigrations.ts` exactly (raw `db.execute(\`...\`)`, `CREATE TABLE IF NOT EXISTS`, `gen_random_uuid()` PKs).

We are adding the concept of a **site** inside a customer’s database. For non-enterprise customers, every record stays in a single default site, so behaviour is unchanged.

## What to build

### 1. New tables in `server/isolatedSchema.ts` (+ matching raw-SQL migration)

**`sites`**
- `id` varchar PK default gen_random_uuid()
- `name` text NOT NULL
- `reference` text UNIQUE (e.g. "SITE-001")
- `address` text, `postcode` text, `region` text
- `area_id` varchar NULL → `areas.id`
- `status` text NOT NULL default `'active'` (`active` | `onboarding` | `archived`)
- `is_default` boolean NOT NULL default false  — the single site that holds all data for non-enterprise customers
- `created_at` timestamp default now(), `archived_at` timestamp NULL

**`areas`** (grouping of sites for Area Manager scope)
- `id` varchar PK default gen_random_uuid()
- `name` text NOT NULL
- `description` text NULL
- `created_at` timestamp default now()

### 2. Add a nullable `site_id` column to the **site-scoped operational tables**

Add `site_id varchar NULL REFERENCES sites(id)` (with `ADD COLUMN IF NOT EXISTS`) and an index on `site_id` to **these tables** (the records that belong to a physical site):

```
staff, visitors, members, visitor_history, staff_attendance_history, pre_bookings,
departments, muster_points, evacuation_zones, safety_tokens,
contractor_companies, contractor_workers, contractor_documents, compliance_documents,
rams_documents, worker_certifications, induction_tokens, contractor_visits,
contractor_prebookings, local_labour_records, meeting_rooms, room_bookings,
ppm_assets, ppm_work_orders, cdm_projects, hs_incidents, fire_risk_assessments,
compliance_certificates, permit_to_work, audit_records, ra_builder_assessments,
incident_reports, lone_worker_sessions, help_desk_tickets
```

**Do NOT add `site_id` to these (they are customer-level config or pure child rows that inherit their site from a parent):**
```
company_settings, users, user_invitations, document_types, induction_settings,
visit_reasons, compliance_certificate_types, audit_templates, audit_template_items,
uk_hs_document_templates, help_categories, help_articles, customer_api_keys,
feature_usage_analytics, ai_generated_images, martyn_law_config,
-- child rows resolved via their parent's site_id:
evacuation_accountability, zone_sweeps, room_booking_attendees, induction_answers,
induction_questions, audit_record_items, audit_corrective_actions, permit_checklist,
worker_notes, company_notes, document_approvals, ppm_work_order_documents
```

### 3. Backfill migration (critical — run inside the same migration, after columns exist)
For **every existing customer database**:
- Insert one `sites` row: `name = 'Primary Site'`, `reference = 'SITE-001'`, `status = 'active'`, `is_default = true` — **only if no site exists yet** (idempotent).
- `UPDATE` every site-scoped table to set `site_id = <that default site id>` **where `site_id IS NULL`**.

This guarantees existing single-site customers have all their data attached to one default site, so nothing breaks.

### 4. Register the migration
Add the new migration(s) to `createMigrationRunner()` via `runner.registerMigration(...)`, with a `version` string later than all existing ones (e.g. `20260622_001_create_sites_and_site_id`). Idempotent and transactional, matching the existing pattern.

## Rules
- `site_id` is **nullable** everywhere. Existing rows get backfilled; new non-enterprise behaviour can keep using the default site.
- Match the exact migration style in `contractorMigrations.ts` (raw SQL, `IF NOT EXISTS`, the `ensurePgcrypto` helper if needed).
- Add a `site_id` index to each altered table for dashboard performance.
- Do not change any route or query logic yet — this prompt is schema only. (Scoping comes in prompt 03.)

## Acceptance criteria
- App builds; migration runs cleanly on a test customer with existing data.
- After migration, a test customer has exactly one `sites` row (`is_default = true`) and **every** site-scoped table row has that `site_id` (none left NULL).
- Re-running the migration does nothing (idempotent).
- A brand-new customer onboarding still works and ends up with a default site + all data attached to it.
- Non-enterprise customers behave identically to before.

## Do NOT
- Do not enforce site scoping in queries yet.
- Do not add `site_id` to the excluded tables above.
- Do not provision separate databases per site — sites are rows inside the one customer database (Option A in the spec).
