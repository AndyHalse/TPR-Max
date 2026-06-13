# Bugfix: Worker phone lost at creation + company-vs-worker document ownership (June 2026)

This is a follow-up to `bugfix-add-worker-process-audit-june2026.md` (already applied). That work fixed the audit trail, the phantom yellow cards, archiving, and the *update* path. But two problems remain. Both are confirmed in the code below. Fix both, then run the verification.

Copy everything below the line into the Replit agent.

---

## PROBLEM 1 — Phone number is lost when a NEW worker is created (and induction-complete too)

### Confirmed root cause — a schema-name mismatch across two table definitions

There are TWO Drizzle definitions of the `contractor_workers` table:
- `shared/schema.ts` (line ~1258) — column is named **`phone`** (`text("phone")`). It has NO `phoneNumber` field.
- `server/isolatedSchema.ts` (line ~815) — column is named **`phoneNumber`** (`text("phone_number")`). It has NO `phone` field. **This is the table actually written to** (the per-customer isolated DB).

In `server/services/workerService.ts`, the `updateWorker` function handles this correctly: after `insertContractorWorkerSchema.partial().parse(...)` strips the unknown `phoneNumber` key, it **re-adds it** via the `preserveFields` array (lines ~247–254). That path works.

But `createWorker` (admin path, lines ~147–166) does NOT have that preserve step. It does:
```ts
const workerData = insertContractorWorkerSchema.parse({
  ...body,
  companyId,
  phoneNumber: normalisedPhone,          // ← set here…
  siteInductionCompleted: body.inductionCompleted ? ... : false,  // ← and here…
  ...
});
```
`insertContractorWorkerSchema` is built from `shared/schema.ts`, whose only phone field is `phone`. So Zod **strips `phoneNumber`** (unknown key) AND **strips `siteInductionCompleted`** (shared calls it `inductionCompleted`, not `siteInductionCompleted`). The carefully-set values are gone before the insert. Then `databaseService.createContractorWorker` inserts `workerData` into the **isolated** table, which needs `phoneNumber` / `siteInductionCompleted` — neither is present — so `phone_number` and `site_induction_completed` are written as NULL/false.

Net effect: every worker created through the admin wizard loses their phone number, and loses the "site induction completed" tick if the admin set it on step 3. (`postcode`, `cscsCard`, `cscsStatus`, `ipafStatus`, `transportMethod`, `rightToWork`, training booleans all survive because both schemas share those JS key names — phone and induction are the only two that diverge AND are collected at create.)

### Required fix

In `workerService.createWorker`, admin path, **after** the `insertContractorWorkerSchema.parse(...)` call, bridge the isolated-only fields — mirror exactly what `updateWorker` already does:

```ts
const workerData: any = insertContractorWorkerSchema.parse({ ...body, companyId, ... });

// Bridge fields whose name differs between shared/schema.ts and isolatedSchema.ts.
// Zod (built from shared) strips these, but the isolated insert table needs them.
workerData.phoneNumber = normalisedPhone;
workerData.siteInductionCompleted =
  body.inductionCompleted !== undefined ? Boolean(body.inductionCompleted) : false;

// Drop the stray shared-only keys so they don't cause confusion downstream.
delete workerData.phone;
delete workerData.inductionCompleted;
```

Keep the existing mandatory-field validation (phone is already required — that's why the edit modal correctly shows "Please fill in this field": the worker was saved with NULL phone, and the edit modal's required attribute then blocks re-saving). The point is to stop writing NULL in the first place.

### Hardening (do this too — it prevents the whole class of bug)

The real disease is that the create path validates against one schema and writes to another. Add a single normalisation helper used by BOTH create and update so the two can never drift again, OR (preferred) stop round-tripping isolated-table writes through the shared insert schema — build the insert object explicitly with isolated field names the way `databaseService.updateContractorWorker` maps fields one by one. At minimum, add a code comment at both schema definitions pointing at each other and noting that `phone`↔`phoneNumber` and `inductionCompleted`↔`siteInductionCompleted` are the same column under different JS keys.

### Backfill existing broken records

Any worker created via the admin wizard since the last deploy may already have NULL `phone_number`. You cannot recover a number that was never stored, but: produce a one-off report (per customer schema) of active workers with a NULL or empty `phone_number` so the admin knows which records need the number re-entered. Do NOT auto-guess. Surface it as a list in the app or a logged report — your call, but make it visible.

---

## PROBLEM 2 — Company documents are wrongly listed on the individual worker

The worker profile's **Certificates & Qualifications** tab lists, under "Legal Requirements": **Employers' Liability Insurance**, **Public Liability Insurance**, and (under "Site Qualifications") **Health & Safety Policy**. These are **company-level** documents held by the contracting business, not by the individual worker. They already exist on the **company** Documents tab (Public Liability, Employers' Liability, CIS Registration are shown there). Listing them per-worker is duplication and is legally wrong about who is responsible.

### The legal split (HSE / UK statute) — use this as the rule

**The CONTRACTING COMPANY provides (one per company, on the company Documents tab):**
| Document | Legal basis | Why it's company-level |
|---|---|---|
| Employers' Liability Insurance | Employers' Liability (Compulsory Insurance) Act 1969 | A single company policy (min £5m) covering ALL its employees. Never held by an individual. |
| Public Liability Insurance | Contractual / common-law duty of care | Company policy covering third-party injury/damage. Company-level. |
| Written Health & Safety Policy | Health and Safety at Work etc. Act 1974, s.2(3) | Any employer with 5+ employees must have ONE written H&S policy for the business. |
| Professional Indemnity Insurance | Contractual | Company policy. |
| CIS Registration | Finance Act 2004 (Construction Industry Scheme) | Company tax registration. |
| RAMS (Risk Assessments / Method Statements) | MHSWR 1999 / CDM 2015 | Produced by the company for the works (job-level). |
| Modern Slavery statement | Modern Slavery Act 2015, s.54 | Company-level (turnover threshold). |
| Environmental Policy | Contractual / ISO 14001 | Company-level. |

**The individual WORKER provides (per person, on the worker Certificates & Qualifications tab):**
| Document | Legal basis | Why it's worker-level |
|---|---|---|
| Right to Work | Immigration, Asylum and Nationality Act 2006 | The individual's own passport/visa/share-code. Employer checks it, but it belongs to the person. |
| CSCS Card | Construction Skills Certification Scheme | Individual competence card. |
| IPAF / PASMA Card | PUWER 1998 / Work at Height Regulations 2005 | Individual operator licence for MEWPs / mobile towers. |
| CPCS / NPORS Card | Site/plant requirement | Individual plant-operator card. |
| Asbestos Awareness | Control of Asbestos Regulations 2012 | Individual training certificate. |
| Manual Handling | Manual Handling Operations Regulations 1992 | Individual training certificate. |
| Working at Height | Work at Height Regulations 2005 | Individual training certificate. |
| First Aid (where applicable) | Health and Safety (First-Aid) Regulations 1981 | Individual qualification. |
| DBS check (where applicable) | Safeguarding / site requirement | Individual. (Already a separate worker tab.) |
| Site induction / Occupational health | CDM 2015 / site policy | Individual. |

### Required fix

1. In the worker certificate catalogue seed — `server/missingTablesMigration.ts`, migration `20260611_002_worker_certification_types` (the `INSERT INTO worker_certification_types … VALUES …` block, ~line 711) — **remove** the three company-level rows: `public_liability`, `employers_liability`, and `health_safety_policy`. Leave: `right_to_work`, `cscs_card`, `ipaf_card`, `training`, `certification`.
2. Add a new migration that **deactivates** those three types for customers who already have them seeded: `UPDATE worker_certification_types SET is_active = FALSE WHERE key IN ('public_liability','employers_liability','health_safety_policy');` (run per customer schema, the same way the catalogue was seeded). Use `is_active = FALSE` rather than DELETE so any already-uploaded evidence isn't orphaned by a foreign-key break.
3. Any existing **worker-level** `contractor_documents` rows of `document_type` in those three keys: set `is_active = FALSE` (they are duplicated at company level and should not count toward worker compliance). Write a one-line `companyNotes` audit entry per affected company: "Company-level document <type> removed from worker profiles — managed on the company Documents tab (correcting document ownership)."
4. While you're in the catalogue, **add** the individual training certificates the wizard already collects so admins can attach the actual certificate file as evidence (today they're only booleans): add `asbestos_awareness` (CAR 2012), `manual_handling` (MHOR 1992), `working_at_height` (Work at Height Regs 2005) as `category = 'training'`, `requires_expiry = TRUE`, `requires_number = FALSE`. Also add `cpcs_card` (`category = 'site'`, `requires_number = TRUE`) and `first_aid` (`category = 'training'`, `requires_expiry = TRUE`). Map the existing boolean fields to "valid" status where a worker already has the boolean ticked, so nothing regresses.
5. Sanity-check the "X missing" counter on the worker tab so it only counts the worker-level catalogue (it will drop from "8 missing" once the three company docs are removed).

Do NOT touch the company Documents tab — those three documents are correct there and must stay.

---

## PROBLEM 3 — Verify the rest of the previously-applied changes are sound

The previous prompt's changes are mostly in and look correct. Confirm each of these still holds after your edits, and fix anything that regressed:

1. **Phantom yellow cards** — `calculateWorkerCardStatus` / the auto-calculation block must NOT exist in `databaseService.updateContractorWorker` (it was removed — confirm it stays removed and nothing re-introduced a write to `currentCardStatus` outside `issueCard` / `revokeCard` / `correctCardStatus`). Confirm the phantom-card correction migration actually RAN against existing customers and that no active worker has `currentCardStatus` of `yellow`/`red` without a matching active `card_issues` row. Report the count it corrected.
2. **One edit modal** — `EditContractorWorkerModal.tsx` is deleted (good). `Contractors.tsx` now renders `ContractorEditModal` (good). Remove the now-dead `editWorkerForm` state, `handleEditWorker` form-population, and `updateWorkerMutation` in `Contractors.tsx` if nothing else uses them — they're leftover from the old inline modal. (Cleanup only; verify nothing references them first.)
3. **Audit notes** — creating, updating, archiving, deleting, issuing/resetting a card, and check-out all write a `worker_notes` row with `changedBy` + timestamp (confirmed present in `workerService.ts`). Spot-check that the Notes tab renders them newest-first with user + date AND time.
4. **Role checks** — add-worker (admin/manager), archive, hard-delete (admin + type-name confirm), card-issue are all gated server-side. Confirm none were lost.
5. **Mandatory fields** — create and update both reject blank firstName/lastName/email/phone with a clear 400. Confirm the portal create path requires phone too.

---

## Verification (run all before declaring done)

1. Add a worker via the admin wizard with a phone number and the "Site Induction Completed" box ticked → open the worker's edit profile → **phone number is present** and induction shows completed. Re-open after a refresh — still present (persisted, not just cached).
2. Add a worker WITHOUT a phone → rejected with a clear 400 (both admin wizard and contractor portal).
3. Edit that worker's phone → save → reopen → new number persists; Notes tab shows a `profile_update` note with old → new, user, date and time.
4. Open the worker Certificates & Qualifications tab → **Employers' Liability, Public Liability, and Health & Safety Policy are gone**. Remaining: Right to Work, CSCS, IPAF, plus the individual training certs (Asbestos, Manual Handling, Working at Height, First Aid, CPCS). The "X missing" count reflects only worker-level items.
5. Company Documents tab still shows Public Liability, Employers' Liability, CIS Registration unchanged.
6. New worker with induction NOT completed → shows a compliance chip ("Induction outstanding"), NOT a "YELLOW CARD" banner. Issue a real yellow card → banner appears with an audit note. Edit the worker's profile → the yellow card banner is still there (not erased).
7. Run the phantom-card migration check → report how many phantom yellows were corrected and confirm zero remain.
8. `npm run db:push` (or the project migration command) runs cleanly. Report the new/removed catalogue rows and any backfill report of NULL-phone workers.
9. `npx tsc --noEmit` is clean for `workerService.ts`, `missingTablesMigration.ts`, `contractorWorkerCerts.ts`, and `Contractors.tsx`.
10. Add/extend tests: create-worker persists phoneNumber + siteInductionCompleted; worker catalogue excludes the three company doc types; mandatory-phone rejection on create.
