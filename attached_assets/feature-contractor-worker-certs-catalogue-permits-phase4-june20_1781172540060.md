# Feature — Certificate catalogue expansion + Permit-to-Work linkage (Phase 4 of the worker-compliance roadmap)

**Priority: MEDIUM (the differentiator phase). Effort: small for the catalogue, medium for the permit linkage. Do after Phases 1–3.**

Roadmap: `TPR Max - Roadmap/contractor-worker-compliance-roadmap.md`. Depends on Phase 2 (`worker_certification_types` catalogue + evidence store) and Phase 3 (portal).

## Part A — Expand the certificate catalogue (small)

Because Phase 2 made certificate types catalogue-driven, adding the missing UK certificates is mostly seed data, not code. Add these `worker_certification_types` rows (key, name, legal/standard basis, category, requires_expiry):

- **First Aid at Work** — HSE first-aid requirement (category: safety; expiry: yes, 3 yrs)
- **SSSTS** — Site Supervisor Safety Training Scheme, CITB (site; yes, 5 yrs)
- **SMSTS** — Site Manager Safety Training Scheme, CITB (site; yes, 5 yrs)
- **PASMA** — mobile access towers (site; yes)
- **Confined Space** — Confined Spaces Regulations 1997 (site; yes)
- **Face-Fit (FFP3)** — COSHH / RPE fit testing (safety; yes)
- **Hot Works / Welding competency** (site; yes)
- **NVQ** (trade; usually no expiry — `requires_expiry: false`)
- **CPCS** — plant operator (trade; yes)
- **ECS / 18th Edition** — electrical (trade; yes)
- **Gas Safe** — gas work (trade; yes)
- **Drug & Alcohol screening** — common on rail/utilities/major projects (safety; yes)

Each one then automatically works everywhere Phase 2/3 already handle certificates: admin worker panel, portal upload, expiry alerts, compliance dashboard. No per-cert code.

Note on devolved nations (for completeness, not required): DBS is England & Wales; Scotland uses **PVG** and Northern Ireland uses **AccessNI** — these can be catalogue rows too if a customer needs them.

## Part B — Link worker competencies to Permit to Work (the differentiator)

TPR already has Permit to Work with seven types (`server/routes/permitToWork.ts`, `server/utils/ptwChecklists.ts`): hot works, working at height, electrical isolation, confined space, excavation, asbestos, general high risk. Right now nothing checks that the workers named on a permit actually hold the competency for it. Joining those up is a feature very few competitors have.

**What to build:**

1. **Map permit types → required certificate keys.** A small config (alongside `ptwChecklists.ts`): e.g. confined space permit → Confined Space cert; hot works → Hot Works competency; working at height → IPAF and/or relevant cert; electrical isolation → ECS/18th Edition. Make it a per-customer-editable mapping with sensible defaults, so customers can tune it to their site rules.

2. **Competency check when authorising a permit.** When a permit lists named workers and moves toward `authorised`/`active`, check each named worker has a **valid (approved, not expired)** certificate for every key the permit type requires (read from the Phase 2 evidence store). Surface any gaps in the authorisation step: "Worker X has no valid Confined Space certificate."

3. **Make it a warning, not a hard block, by default** — with a per-customer option to make it blocking. Some sites want a hard stop; others want the authoriser to see the gap and decide. Default to warn so this doesn't suddenly prevent permits being raised on existing customers.

4. **Show it both ways:** on the permit (which named workers are/aren't competent) and on the worker (which permit types they're cleared for, based on current certificates).

## Scope guard

- Part A is catalogue seed data + a quick check that each new type renders correctly in the existing Phase 2/3 UIs. No new plumbing.
- Part B reads the existing Phase 2 evidence store and the existing permit records — don't duplicate competency data onto permits; look it up live so it stays correct as certificates expire.
- Default the competency check to **warn**, configurable to **block**. Don't make it blocking by default.

## Verify

**Part A:** add the SSSTS catalogue row → it appears as an uploadable certificate on the admin worker panel and in the portal, tracks expiry, and shows on the dashboard when expired. No code change needed to make a new type work.

**Part B:**
1. Create a confined-space permit naming a worker with no Confined Space certificate → authorisation step flags the gap.
2. Add a valid Confined Space cert for that worker → the warning clears.
3. Let the cert expire → the warning returns (proves it's read live, not copied onto the permit).
4. With the per-customer "block" option on, the permit can't be authorised until the gap is resolved; with it off (default), it can be authorised with the warning acknowledged.
