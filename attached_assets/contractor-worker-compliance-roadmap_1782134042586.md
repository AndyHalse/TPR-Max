# Roadmap — Contractor Worker Compliance (documents, certificates & DBS)

*Investigation + plan, 11 June 2026. Grounded in the TPR-Max-main codebase, not assumptions.*

## The short version

Your instinct is right. Worker-level compliance in TPR is half-built and split across three systems that don't talk to each other. Certificates are mostly tick-boxes with no evidence and no expiry, the new self-service portal can't handle worker documents at all, and **DBS doesn't exist for contractor workers anywhere** — only for your own staff. For schools, care homes and the NHS, that's a real hole.

This roadmap pulls it all into one coherent worker-compliance system.

---

## What I found

### 1. Worker certificates are tick-boxes, not evidence

On a contractor worker record (`contractor_workers` table), the certifications are:

| Certificate | How it's stored today | Expiry tracked? | Copy uploaded? |
|---|---|---|---|
| CSCS | Card number + status (valid/expired/none) | ❌ No (schema note: "removed, doesn't exist in DB yet") | ❌ No |
| IPAF | Status only (3a/3b/1+/none) | ❌ No | ❌ No |
| Asbestos Awareness | Yes/no tick-box | ❌ No | ❌ No |
| Manual Handling | Yes/no tick-box | ❌ No | ❌ No |
| Working at Height | Yes/no tick-box | ❌ No | ❌ No |

So an admin can tick "Asbestos Awareness: completed" with nothing behind it — no certificate, no expiry date, no proof for an HSE audit. That's the weakest part. A tick-box is a claim; a dated certificate is evidence.

### 2. A proper document framework already exists — but it's bolted on the side

There's a separate, better system already in the code: a **token-based worker document upload** (`/api/worker-doc-request/:token`, `WorkerDocumentUpload.tsx`). You generate a link, send it to a worker, and they upload documents against a real UK framework with legal basis and expiry dates:

- Right to Work — Immigration, Asylum & Nationality Act 2006
- Public Liability (£2m) / Employers' Liability (£5m) — Employers' Liability Act 1969
- CSCS Card (with expiry)
- IPAF Card — Working at Height Regulations 2005 (with expiry)
- Health & Safety Policy — HSWA 1974
- Training Certificate (manual handling, asbestos, etc.)
- Other Certification (NVQ, CPCS, CIBT)

The documents table (`contractor_documents`) already has a `worker_id` column, so per-worker documents are structurally supported. This is good work — it's just not connected to the tick-boxes above or to the portal below.

### 3. The new self-service portal can't do worker documents at all

The Contractor Portal (the thing contractors log into) only lets them:
- upload **company** documents (insurance, RAMS) — never worker-level
- add a worker with name, email, phone, job title, trade — **no certificates, no card numbers, no uploads**

So the exact thing you're asking for — a contractor uploading their worker's CSCS card copy and Asbestos Awareness certificate through the portal — isn't possible today. The portal is the newest and thinnest of the three systems.

### 4. DBS — the real hole

DBS exists **only for your own staff** (HR module: `staff_dbs` table, `StaffDbsTab.tsx`, `hrDbs.ts`). There is **no DBS field anywhere on contractor workers or contractor companies**, and DBS isn't in the worker document framework either. So a cleaning contractor's worker going into a primary school has no way to record or verify their DBS in TPR.

**Marketing accuracy flag:** the product notes (about-me.md, memory.md) currently claim "DBS certificate verification" as a *contractor* compliance feature "used in healthcare and education sectors." Based on the code, that's true for staff but **not for contractors**. Worth correcting in the sales material until this roadmap closes the gap — we don't want to promise it in a demo to a school or NHS trust and then not have it.

---

## Are we missing UK certificates? Yes — here's the gap list

What a UK site realistically needs for a contractor worker, and where TPR stands:

**Have (but weak — tick-box only, needs evidence + expiry):** CSCS, IPAF, Asbestos Awareness, Manual Handling, Working at Height, Right to Work, Occupational Health.

**Missing entirely:**
- **DBS / Enhanced DBS** — schools, care homes, NHS, anywhere with vulnerable people. *Highest priority.*
- **First Aid at Work** — most sites expect at least one qualified first aider.
- **SSSTS / SMSTS** — Site Supervisor / Site Manager Safety Training (CITB). Standard for anyone supervising on a construction site.
- **Trade competency certs** with real fields, not free text: NVQ, CPCS (plant), ECS / 18th Edition (electrical), Gas Safe (gas), PASMA (mobile towers).
- **Confined Space**, **Face-Fit (FFP3)**, **Hot Works / welding** competency — and these tie directly to permit types TPR *already has* (Permit to Work covers confined space, hot works, working at height). Right now there's no link between "this worker holds the ticket" and "this worker is on the permit." That's a strong, ownable feature.
- **Drug & Alcohol** screening status — common on rail, utilities, major projects.

---

## The recommendation: one worker-certifications system

Don't keep adding boolean columns (`asbestosAwareness`, `manualHandling`…). Every new certificate then means a database change, and the three systems drift further apart. That doesn't scale.

**Build one flexible `worker_certifications` table** — certificate type, number, issuing body, issue date, expiry date, uploaded copy, and verification status (pending / verified / rejected / expired) — seeded with a **UK certificate catalogue** (CSCS, IPAF, DBS, First Aid, SSSTS, SMSTS, asbestos, manual handling, trade quals, etc.). Then:

- The **admin worker page**, the **token upload flow**, and the **self-service portal** all read and write the *same* data.
- Adding a new certificate type becomes a catalogue entry, not a code change.
- **Expiry tracking and the compliance dashboard work for every certificate automatically** — including DBS — instead of being hand-coded per cert.
- It matches how the rest of TPR already works well (compliance certificates, FRA action items all use date-driven expiry, not tick-boxes).

The lighter-touch alternative is to bolt expiry dates + upload onto the existing tick-box columns and add DBS columns separately. It's faster to ship but locks in the fragmentation and means doing DBS, then First Aid, then SSSTS as separate mini-projects forever. I'd take the slightly longer route once and be done with it.

**Build note (refined after a closer code read):** don't create a brand-new `worker_certifications` table — the platform already has `contractor_documents` with a `worker_id` column, expiry, status and an upload/review flow. The unified system is realised as a small **certificate-type catalogue** plus `contractor_documents` as the evidence store. Same outcome, less duplication. The Phase 2 prompt explains this in full.

---

## The roadmap

### Phase 1 — DBS for contractor workers *(highest priority — unblocks schools/NHS/care)*
- Add DBS to the worker compliance model (certificate number, type — Basic/Standard/Enhanced/Enhanced+Barred, issue date, expiry/renewal, uploaded copy, verification status).
- Surface it on the admin worker record, the token upload flow, and the self-service portal.
- Feed DBS expiry into the compliance dashboard and the site-access decision.
- Reuse the patterns already proven in the staff DBS module (`hrDbs.ts`) so it behaves consistently.
- **Outcome:** TPR can honestly say it handles contractor DBS for regulated sites. Closes the marketing gap.

### Phase 2 — Real evidence + expiry for existing worker certs
- Give CSCS, IPAF, Asbestos, Manual Handling, Working at Height proper expiry dates and an uploaded copy — turn the tick-boxes into dated, evidenced records.
- Wire them into expiry alerts and the compliance dashboard (worker-level cert expiry currently isn't scored anywhere).

### Phase 3 — Worker documents in the self-service portal
- Let a contractor, logged into the portal, manage their workers properly: add/edit a worker and upload that worker's CSCS, IPAF, DBS, training certificates — with expiry — straight into the same system.
- Admin reviews and approves per-worker documents the same way they already review company documents.
- **This is the feature you asked about — and it's mostly assembly once Phases 1–2 exist.**

### Phase 4 — Catalogue expansion + permit linkage
- Add First Aid, SSSTS/SMSTS, trade competencies (NVQ, CPCS, Gas Safe, 18th Edition, PASMA), confined space, face-fit, hot works.
- Link worker competencies to Permit to Work: e.g. a confined-space permit can require every named worker to hold a valid confined-space ticket. This is a genuine differentiator — very few competitors join competency to permits.

*(Sequencing logic: do the architecture once in Phase 1/2 so Phases 3–4 are mostly configuration and UI, not new plumbing each time. If you need a quick win for a specific school/NHS deal first, Phase 1 can ship on its own.)*

---

## Replit prompts (all four phases written)

- **Phase 1 — Contractor DBS:** `Replit Prompts/feature-contractor-worker-dbs-phase1-june2026.md`
- **Phase 2 — Evidence + expiry on worker certs:** `Replit Prompts/feature-contractor-worker-certs-phase2-june2026.md`
- **Phase 3 — Worker documents in the portal:** `Replit Prompts/feature-contractor-worker-certs-portal-phase3-june2026.md`
- **Phase 4 — Catalogue expansion + permit linkage:** `Replit Prompts/feature-contractor-worker-certs-catalogue-permits-phase4-june2026.md`

Do them in order — Phase 2 lays the foundation that 3 and 4 sit on.

## Pages and files that will need updating

- **Schema** — `server/isolatedSchema.ts` (new `worker_certifications` table + DBS; migration in `customerDatabase.ts`).
- **Self-service portal** — `client/src/pages/contractor-portal/ContractorPortalWorkers.tsx` and `server/routes/contractorPortal.ts` (worker cert fields + per-worker document upload using the existing `worker_id` column).
- **Admin worker record** — `client/src/pages/ContractorDetails.tsx` (replace tick-boxes with dated, evidenced certs + DBS tab).
- **Token upload framework** — `WorkerDocumentUpload.tsx` `WORKER_DOC_FRAMEWORK` (add DBS, First Aid, SSSTS/SMSTS).
- **Compliance engine** — `server/utils/contractorCompliance.ts` and `server/routes/complianceDashboard.ts` (score worker cert + DBS expiry; gate site access).
- **Marketing/product notes** — `About Me/about-me.md`, `memory.md`, `tpr-max-product-reference.md` (correct the contractor-DBS claim now; update when each phase ships).

---

## What I'd do next

Phase 1 (contractor DBS) is the one with a clear commercial trigger — it's what a school or NHS buyer will ask about in the first demo, and right now we'd have to say no. I'd start there. Say the word and I'll write the Phase 1 Replit prompt (schema, routes, portal + admin UI, compliance wiring), and separately correct the DBS claim in the sales material so we're not over-promising in the meantime.
