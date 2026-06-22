# Enterprise Multi-Site — Prompt 09 — Phase 3a: Compliance scoring engine

**Phase 3 of the Enterprise Multi-Site build. This is the heart of the product — the cross-site compliance intelligence. Run after Phase 2.**

## Context
With sites and roles in place, build the engine that scores each site’s compliance and rolls it up across the estate. It reads from tables that **already exist** in `isolatedSchema.ts`. PPM uses `ppm_work_orders`; FRA uses `fire_risk_assessments` — no new source tables needed.

## What to build

### 1. New tables (isolated schema + migration, raw-SQL pattern)
**`compliance_items`** — normalised row per tracked item:
- id, `site_id` → sites.id, `category` text, `source_table` text, `source_id` varchar, `status` text (`current`|`expiring`|`lapsed`|`missing`), `severity` text (`ok`|`warning`|`critical`), `expires_at` date NULL, `updated_at` timestamp.

**`compliance_snapshots`** — daily history for trends:
- id, `site_id` varchar NULL (NULL = whole estate), `date` date, `overall_score` int, `category_scores` jsonb.

**`compliance_alerts`**:
- id, `site_id` → sites.id, `category`, `severity`, `title`, `detail` jsonb, `status` text (`open`|`acknowledged`|`resolved`), `created_at`, `resolved_at` NULL.

### 2. `server/complianceEngine.ts`
- **Event-driven:** when a source record changes (contractor insurance, RAMS, induction, compliance certificate, PPM work order, FRA, staff right-to-work), re-evaluate the affected `compliance_items` for that site only.
- **Scheduled safety net:** a daily job at **03:00 Europe/London** re-evaluates all items per site (to catch pure time-based expiries), writes one `compliance_snapshot` per site plus one estate-level snapshot, and raises/clears alerts. Use the existing cron approach used elsewhere (e.g. the FRA/PPM daily crons) and the existing per-customer scheduling — make sure it runs per customer and is deduplicated (one run per day).

### 3. Status rules (per category)
| Category | Source | Critical when | Warning when |
|---|---|---|---|
| Contractor Insurance | contractor_documents (insurance) | Expired AND contractor has active/future bookings | Expires ≤ 30 days |
| RAMS | rams_documents | Missing with works starting ≤ 7 days | Expiring ≤ 30 days, or missing with works 7–30 days |
| Inductions | induction_tokens | Worker on site with no valid induction | Expiring ≤ 14 days with a visit booked |
| Compliance Certificates | compliance_certificates | Expired, not renewed | Expires ≤ 60 days |
| PPM | ppm_work_orders | Overdue > 30 days, or 3+ overdue at one site | Due ≤ 14 days |
| Fire Risk Assessment | fire_risk_assessments | Review overdue > 12 months | Due ≤ 60 days |
| Staff Right to Work | staff RTW fields | Expired with staff member active | Visa-based check expires ≤ 28 days |

### 4. Score formula (weights & penalty in config, NOT hardcoded)
```
category_score = 100 * (current + 0.5*expiring) / total_items   (empty category excluded)
site_score     = weighted mean of category scores
                 default weights: insurance 20, RAMS 15, inductions 15,
                 certs 15, PPM 15, fire 10, RTW 10
estate_score   = mean of site scores weighted by active contractor count
penalty        = -2 per open critical alert (floor 0), at site level
```
Store weights/penalty in `company_settings` (or a small dedicated config row) so they can be tuned with Cowiesburn at UAT.

## Rules
- All reads/writes are site-scoped via the prompt 03 helper and respect the prompt 07 allowlist.
- Engine logic must be covered by unit tests against fixtures hitting every status transition in the table above.
- en-GB dates; Europe/London for the cron.

## Acceptance criteria
- Scores match hand-calculated fixtures.
- A document edited to expire yesterday produces a `critical` alert on the next evaluation (and within 60s under the event hook).
- Daily snapshots are written per site + one estate row; the job is idempotent (no duplicates if it runs twice).
- An Area Manager only sees their area’s items/alerts/scores.

## Do NOT
- Do not create new source tables for PPM or FRA — use the existing ones.
- Do not hardcode weights or the penalty value.
- Do not aggregate across customers — only across sites within one customer.
