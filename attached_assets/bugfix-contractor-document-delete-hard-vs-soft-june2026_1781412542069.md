# Bugfix: Contractor document delete permanently destroys the record (hard delete shadowing the intended soft delete) — June 2026

A data-integrity bug on the Contractor Management page. Deleting a contractor company's compliance document (insurance, RAMS, H&S policy, etc.) **permanently removes the row** instead of soft-deactivating it, so the compliance audit history is lost. This is the same class of bug as the HR-module DBS hard-delete fixed in May 2026.

Copy everything below the line into the Replit agent.

---

## The bug

In `server/routes/contractors.ts` there are **two route handlers registered for the exact same path**:

`app.delete("/api/contractors/:companyId/documents/:documentId", ...)`

- **First registration (~line 2073)** — **hard deletes** the row with `db.delete(isolatedSchema.contractorDocuments)...returning()`, writes a `companyNotes` audit entry, and fires a "compliance document deleted" alert email to the admin.
- **Second registration (~line 2820)** — **soft deletes** correctly with `db.update(...).set({ isActive: false, updatedAt: new Date() })`, plus a `companyNotes` audit entry. **No email alert.**

Express matches the **first** route registered, so the soft-delete handler at ~line 2820 is **dead code that never executes**. Every document delete therefore hard-deletes the row.

This is wrong because the rest of the codebase is built around soft delete:
- `contractor_documents.isActive` exists (`shared/schema.ts`, `boolean("is_active").default(true)`).
- **Seven** other queries already filter `eq(isolatedSchema.contractorDocuments.isActive, true)` (e.g. the company documents list at ~line 1867, the doc-request flows at ~lines 2340/2404/2608/2691, and the compliance reads at ~lines 4972/5340).

So a deleted document should remain in the table as a deactivated record (preserving who-was-compliant-when for audit/GDPR), not vanish.

## The companion problem (must fix at the same time)

Two reads that build the **compliance status / badges** do **NOT** filter on `isActive`, so once delete becomes a true soft delete they would wrongly keep counting a deleted document as present:

- **Contractors list** — `GET /api/contractors` (~line 734): `docsDb.select().from(isolatedSchema.contractorDocuments).where(eq(...companyId, contractor.id))` then builds `documentsStatus` (drives the compliance badge on the Contractor Companies tab).
- **Contractor detail** — `GET /api/contractors/:id` (~line 791): same pattern, builds the per-company `documentsStatus`.

Both must also exclude soft-deleted documents, or a deleted insurance certificate will still show the company as compliant.

## The fix

1. **Consolidate to a single soft-delete route.** Keep ONE handler for `DELETE /api/contractors/:companyId/documents/:documentId` that:
   - Soft-deletes: `db.update(isolatedSchema.contractorDocuments).set({ isActive: false, updatedAt: new Date() }).where(and(eq(id, documentId), eq(companyId, companyId))).returning()` — and 404 if nothing returned.
   - Writes the `companyNotes` audit entry (`changeType: 'document_deleted'`, who/when) — already present in both versions.
   - **Keeps the admin alert email** from the first version (the `setImmediate(...)` block that reads `company_settings.notify_on_document_deletion` and sends the "Compliance Alert: Document Deleted" email). Do not lose this — merge it into the surviving handler.
   - Then **delete the other duplicate registration entirely** so only one route for this path exists. Net result: one route that soft-deletes, audits, and alerts.

2. **Add the `isActive` filter to the two compliance reads** so soft-deleted docs no longer count:
   - `GET /api/contractors` (~line 734): change the `.where(eq(...companyId, contractor.id))` to `.where(and(eq(...companyId, contractor.id), eq(isolatedSchema.contractorDocuments.isActive, true)))`.
   - `GET /api/contractors/:id` (~line 791): same change.
   - While you are there, sanity-check any other `from(isolatedSchema.contractorDocuments)` read that contributes to a compliance/expiry status (e.g. ~line 1975 in the document PATCH/lookup) and add the `isActive = true` filter where a deactivated document should be ignored. Do **not** add the filter where the code legitimately needs to look up a specific row by id regardless of state.

3. Make sure `and` is imported in the files you touch (it already is in `contractors.ts`).

## Important constraints

- Do **not** change the **company delete** route (`DELETE /api/contractors/:id`, ~line 1248) or the **worker delete** route (`DELETE /api/workers/:id`, ~line 1840). Those are intentional, admin-gated hard deletes with a typed confirmation, matching the "this cannot be undone" UI prompt. Leave them exactly as they are.
- Keep tenant isolation intact — every query stays scoped through `customerDbService.getCustomerDatabase(context.customerId)` and the `companyId` match in the WHERE clause.
- Do not change the document **upload**, **approve**, or **request** routes.

## Verification

1. Upload a Public Liability document to a contractor company, then delete it from the contractor's Documents page.
2. Confirm in the database the row **still exists** with `is_active = false` (NOT physically removed).
3. The contractor's compliance badge on the Contractor Management → Contractor Companies tab now shows that document as **missing** again (the soft-deleted doc is no longer counted as present).
4. The admin still receives the "Compliance Alert: Document Deleted" email (when `notify_on_document_deletion` is on) and a `companyNotes` audit entry is written recording who deleted it and when.
5. Grep `server/routes/contractors.ts` for `app.delete("/api/contractors/:companyId/documents/:documentId"` and confirm there is now exactly **one** match.
6. `npx tsc --noEmit` is clean for the changed file.
