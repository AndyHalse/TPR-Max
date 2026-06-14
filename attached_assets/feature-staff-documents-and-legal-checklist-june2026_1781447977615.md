# Staff page — enable document upload + a "required documents" checklist (reusing RTW & DBS)

## Background / what already exists (read this first — don't rebuild it)

There are **two** staff views and they're inconsistent:

1. **`/staff` → `client/src/pages/StaffManagement.tsx`** — the operational staff page. Clicking a staff member opens a "Staff Profile" modal (`StaffProfilePanel`) with three tabs: **Profile**, **Documents**, **DBS**. The **Documents tab is read-only** — it lists documents but has **no upload button**, so it shows "No documents stored." and looks dead. (The DBS tab here is real — it renders `StaffDbsTab`.)

2. **`/hr/staff/:id` → `client/src/pages/hr/StaffProfile.tsx`** — the deep HR profile. This **already has full document upload** (component `StaffDocumentsTab` inside that file) plus dedicated **Right to Work**, **DBS** and **Training** tabs.

The backend already exists and is shared by both:
- Documents: `GET /api/staff/:staffId/documents`, `POST /api/staff/:staffId/documents/upload`, `DELETE /api/staff/:staffId/documents/:id`
- Right to Work: `GET /api/staff/:staffId/right-to-work` and `GET /api/right-to-work/status/:staffId`
- DBS: `GET /api/staff/:staffId/dbs` (records carry a `status` of `valid` / `expiring_soon` / `expired` / `no_expiry`)
- All of these are gated by **`featureHrModule`** (TPR Max) via `requireHrFeature` (`server/routes/hrMiddleware.ts`).

So this is **not** a new backend feature. It's: (1) expose the existing upload in the `/staff` modal, and (2) add a small legal-document checklist that **reuses the existing Right to Work and DBS records** rather than creating a second, disconnected copy.

**Do NOT build a contractor-style document framework here.** For UK employees the genuinely legally-required list is short — Right to Work, a written Statement of Employment Particulars / Contract, and (role-dependent) DBS. Everything else is HR good-practice, not law. Keep it light.

---

## Part 1 — Make the `/staff` modal Documents tab able to upload (and delete)

File: **`client/src/pages/StaffManagement.tsx`** (the `StaffProfilePanel` component, Documents tab around lines 151–179).

The cleanest approach: **extract the existing working document UI from `StaffProfile.tsx` into a shared component and reuse it in both places** — one source of truth, no duplication.

1. Create **`client/src/components/StaffDocumentsTab.tsx`** by lifting the `StaffDocumentsTab` component (and the small `FileUploadField` helper it depends on) out of `client/src/pages/hr/StaffProfile.tsx`. It already contains:
   - the `/api/staff/:id/documents` query,
   - the "Add Document" dialog (document-type select, title, file upload via `FileUploadField`, expiry date, confidential flag, notes),
   - the `POST .../documents/upload` and `DELETE .../documents/:id` mutations,
   - the `docTypeLabels` map (`contract`, `right_to_work`, `certificate`, `health_questionnaire`, `disciplinary`, `appraisal`, `other`).
2. Update `StaffProfile.tsx` to import the shared component (behaviour unchanged).
3. In `StaffManagement.tsx`, replace the read-only Documents tab body with `<StaffDocumentsTab staffId={vs.id} />`.

Result: users working from `/staff` (most do) can now add and remove staff documents, including a "Right to Work" document type — without leaving the modal.

---

## Part 2 — Add a "Required documents" checklist to the Documents tab

At the **top** of the Documents tab (above the document list), add a compact checklist card showing the three legally-significant items for an employee, each with a clear status and one action. **Each row reads from the correct existing source — this is the important bit.**

| Item | Source of truth | Statuses to show | Action when not satisfied |
|---|---|---|---|
| **Right to Work** | `GET /api/right-to-work/status/:staffId` (the structured RTW record) | Verified / Expiring soon / Expired / Not recorded | "Manage" → link to `/hr/staff/${staffId}?tab=rtw` |
| **Contract / Statement of Particulars** | the documents list — is there a doc with `document_type === 'contract'`? | Stored / Missing | "Upload" → opens the Add Document dialog **pre-set to type `contract`** |
| **DBS check** | `GET /api/staff/:staffId/dbs` (current record's `status`) | Valid / Expiring soon / Expired / Not recorded | switch to the existing **DBS tab** in the same modal |

Rules:
- **Right to Work and DBS must reflect their structured records, never a document upload.** Do not let someone "satisfy" Right to Work by uploading a loose file here — that would create two sources of truth for the same legal check (the exact mismatch we just fixed on the contractor side). The RTW document type stays available in the document list as supporting evidence, but the checklist's RTW status comes from the RTW record.
- **DBS is role-dependent, so don't show "Missing" as a red failure for everyone.** If the staff record has a `dbsRequired` (or equivalent) flag, honour it: red/amber only when required. If no such flag exists, show DBS as neutral grey "Not recorded" rather than a compliance fail. (Check the staff schema for an existing flag before adding one; don't invent a new column unless asked.)
- Colour: green = satisfied, amber = expiring/missing-but-required, red = expired, grey = not applicable/not recorded. Glassmorphism styling is fine here (this is an admin screen, not an emergency/kiosk screen).

---

## Part 3 — Gate it on the HR module

All the staff document / RTW / DBS endpoints require **`featureHrModule`** (TPR Max). Read company settings (`GET /api/settings`) in the modal and:
- Only render the Documents upload, the checklist, and the DBS tab when `featureHrModule` is true.
- When it's off, either hide those tabs or show a short "Upgrade to TPR Max for staff documents, Right to Work and DBS tracking" note instead of a broken/403 UI.

(Note: the DBS tab in this modal currently renders unconditionally and will 403 for non-Max customers — fold it into the same gate while you're here.)

---

## Acceptance criteria

- From `/staff`, opening a staff member → Documents tab → you can **upload a document** (with a type, including Right to Work), see it listed, and delete it. The same component is used on `/hr/staff/:id` (no behaviour change there).
- The Documents tab shows a **Required documents** checklist: Right to Work (from the RTW record), Contract (from documents), DBS (from the DBS record), each with correct status and a working action.
- Uploading a "Right to Work" document does **not** flip the checklist's Right to Work status — that status still comes from the structured RTW record. No second source of truth.
- DBS shows as neutral, not a red failure, for staff where it isn't required.
- For customers without the HR module, the upload/checklist/DBS UI is hidden or shows an upgrade note — no 403 errors on screen.
- British English throughout; dates `dd/mm/yyyy` / `dd MMM yyyy`.

## Out of scope
- No contractor-style legal-document framework for staff (keep the checklist to the three items above).
- No new RTW or DBS data model — reuse the existing records and pages.
- No changes to the Compliance Dashboard in this prompt (though a richer staff checklist will naturally improve the Staff RTW / Staff DBS data it already reads).
