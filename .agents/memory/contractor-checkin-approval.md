---
name: Contractor check-in & document approval logic
description: Three interacting bugs in contractor check-in gate and document approval routes — how they interact and the correct behaviour.
---

## The three bugs

### 1. reevaluateCompanyApproval fires on worker docs
`PUT /api/contractors/documents/:docId/review` (portal admin approval route) called
`reevaluateCompanyApproval` after EVERY document review, including worker-level docs (RTW, CSCS, IPAF).
Company compliance check (`getCompanyComplianceStatus`) only looks at company-level docs
(publicLiability, employersLiability, rams, healthSafety). If the company was missing any of those,
approving a worker RTW would trigger an auto-revert: company → 'attention_needed'.

**Fix:** Only call `reevaluateCompanyApproval` when `!updated.workerId` (company-level doc only).

### 2. 'attention_needed' hard-blocked check-in
`getWorkerClearanceStatus` in `contractorCompliance.ts` blocked check-in for any
`onboarding_status` that was truthy and not 'approved'. This included 'attention_needed',
which is an alert state (was approved, compliance lapsed) — not a ban.

**Fix:** Only hard-block on `onboarding_status === 'rejected'`. Move 'attention_needed'
to the `warnings` array so it surfaces as an advisory without blocking entry.

### 3. PATCH approve route didn't sync worker fields
`PATCH /api/contractors/:companyId/documents/:documentId/approve` set doc status to 'approved'
but never updated the worker's `rightToWork`, `cscsStatus`, or `ipafStatus` profile columns.
The portal PUT route did sync these. The mismatch meant RTW approval via PATCH left the
"Work Auth" badge amber even after the doc showed as approved.

**Fix:** Added the same worker-field sync block to the PATCH route (mirrors the PUT route).
Also added company expiry column sync for insurance docs, consistent with the PUT route.

## Rules to maintain

- `onboarding_status` blocking logic: NULL → allow, 'approved' → allow, 'attention_needed' → warn,
  'submitted'/'pending' → allow (legacy path), 'rejected' → BLOCK.
- `reevaluateCompanyApproval` must only run on company-level document reviews (no workerId on doc).
- Any route that approves a `contractorDocument` with a `workerId` MUST also update the
  matching worker profile column (rightToWork/cscsStatus/ipafStatus) in the same transaction.
- Both approval routes (`PUT /review` and `PATCH /approve`) must stay in sync with each other.

**Why:** These three bugs combined to create a situation where approving a worker's RTW doc
caused the company to be auto-reverted to 'attention_needed', which then hard-blocked
all workers from checking in. Fixed June 2026.
