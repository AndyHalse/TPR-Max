# BUGFIX — Contractor "Request Documents" worker upload portal (BR-023) + Contractor page hardening

**Source:** TPR Bug Report BR-023 (16 Jun 2026, `/contractors`, reporter Emma Leschenko), plus a code review of the live Contractor Management page and its hook.

This prompt covers the worker-level **Request Documents** flow (the email + the `/worker-upload/:token` page) and a few smaller robustness/performance fixes on the main Contractor page. Each item is independent — apply them all.

---

## BUG 1 — Expiry date "year" field is unusable (the "0002" bug) — HIGHEST PRIORITY

**Symptom (from the report):** On the worker upload page, the expiry date "works for day and month but the year gets stuck and only lets you enter 1 number, so it shows as `0002`." This blocks every document that requires an expiry date, so the worker can't complete the upload at all.

**Root cause:** The expiry field is a **controlled** native date input:

`client/src/pages/WorkerDocumentUpload.tsx` (~line 88):
```tsx
<Input
  type="date"
  value={state.expiry}
  onChange={e => onFieldChange({ expiry: e.target.value })}
/>
```
In Chromium/Edge, a *controlled* `<input type="date">` fires `change` after **each digit** of the year once the day and month are already filled. React immediately writes the partial value (`0002-03-02`) straight back into `value`, which truncates what the user is typing — so the year can never get past one digit. This is a well-known controlled-date-input issue.

**The same controlled-date pattern also exists in:**
- `client/src/pages/ContractorDocumentUpload.tsx` (~line 189) — the **company**-level upload portal (same bug).
- Any expiry-date input in the **Edit Contractor Worker Profile** modal that follows the same `value={...} onChange={...}` pattern (the BR-023 screenshots show `dd/mm/yyyy` fields there too). Search the contractor components for `type="date"` and fix every controlled instance.

**Fix (pick one consistent approach and apply everywhere):**
- **Preferred:** make the date input *uncontrolled* — use `defaultValue` and read the value on `onBlur` (or via a ref) instead of writing state on every `onChange`. This lets the browser's own date editing work normally.
- Keep the value in React state for validation/submit, but **do not feed it back into `value` while the user is typing** — only set `value` from state for a fully-formed date (year length === 4), otherwise leave the input uncontrolled.
- If you'd rather not rely on the native picker at all, replace it with three small numeric selects (day / month / year) — more code but bullet-proof and clearer on mobile.

**Acceptance:** On the worker upload page and the company upload page, a user can type or pick a full 4-digit year (e.g. 2027) and it stays. Uploading a document that requires an expiry date succeeds end-to-end.

---

## BUG 2 — No confirmation that a selected file is attached ("file is not saved")

**Symptom (from the report):** "On selecting 'Choose' you can browse and select your file but it is not saved."

**Finding:** The server side is fine — `POST /api/worker-doc-request/:token/upload-file` stores the file (20 MB multer memory limit, multipart so the 5 MB JSON body limit doesn't apply) and `POST /api/worker-doc-request/:token/upload` persists the document row. The file **is** held in React state after selection. The problem is **there is no visible confirmation in TPR's own UI**, and the one line that's meant to confirm it has inverted logic:

`client/src/pages/WorkerDocumentUpload.tsx` (~line 79):
```tsx
{state.fileName && !state.file && (
  <p className="text-xs text-slate-500 mt-1">Selected: {state.fileName}</p>
)}
```
`!state.file` means this "Selected: …" line **only renders when there is NO file** — i.e. essentially never after a real selection. So the user gets no feedback that the file attached, and (combined with Bug 1 blocking the Upload button via the broken expiry) it looks like "nothing saves."

**Fix:**
- Change the condition to show the filename **when a file is selected**: render "Selected: {fileName}" whenever `state.file` (or `state.fileName`) is truthy.
- Optionally add a small green tick + file size next to the filename so it's obvious the attachment worked.

**Acceptance:** After choosing a file, the card clearly shows the selected filename. After Bug 1 is fixed, the full select-file → set-expiry → Upload flow completes and the card flips to "Uploaded — Pending Review".

---

## BUG 3 — Worker request email lists a generic/irrelevant document set

**Symptom (from the report):** "Email sent mentions PLI and ELI and H&S Policy [which are] not required by the worker, only for the Contractor company."

**Finding:** The worker request email in `POST /api/contractors/workers/:workerId/request-documents` (`server/routes/contractors.ts` ~line 2595) sends a **hardcoded** "Documents that may be required" list:
```
Right to Work • CSCS Card • IPAF Card • Training Certificates • Other relevant worker certifications
```
The egregious company-only items (Public/Employers' Liability, H&S Policy) appear to have already been removed from this list in the current code — **please confirm** the live build matches. But the list is still **static** and does **not** reflect the actual `worker_certification_types` that the upload page (`GET /api/worker-doc-request/:token`) will show the worker. That mismatch is what makes the email feel wrong.

**Fix:**
- Build the email's document list from the **same source** the upload page uses: the active rows in `worker_certification_types` for that tenant (the query already exists in `GET /api/worker-doc-request/:token`). Pull those names and render them in the email so the email and the page always agree.
- If no certification types are configured, fall back to the current generic list (or omit the bullet list and just say "the documents listed on the upload page").

**Acceptance:** The email's "Documents required" list matches exactly what the worker sees on the upload page. No company-only insurance/policy items appear in a *worker* request email.

---

## BUG 4 — Count endpoints return 500 instead of 401 when the session is stale

**Symptom (from BR-023 logs):** a `401 GET /api/auth/me` followed shortly by `500 GET /api/contractors/compliance-gap-count` and two `500 GET /api/ppm/expiry-count`. When the session lapses, these "badge count" endpoints throw a 500 rather than cleanly returning 401, which spams the console with errors and can knock the page into a broken-looking state.

**Fix:**
- In `GET /api/contractors/compliance-gap-count` (`server/routes/contractors.ts` ~line 174) and the PPM expiry-count endpoint, guard for a missing `req.customerId` early and return `401`/`400` instead of letting `generateSchemaName(undefined)` / the raw `pool.query` blow up into a 500.
- Confirm `requireAuth` consistently rejects with 401 (not 500) when the session/token is invalid, so dependent count endpoints never run unauthenticated.

**Acceptance:** With an expired session, count endpoints return 401 and the client handles it (re-auth / silent), with no 500s in the console.

---

## BUG 5 — Main Contractor page: small performance & robustness cleanups (code review)

These are from reviewing `client/src/pages/contractor/useContractorManagement.ts` (the hook behind the live `/contractors` page). Low-risk, worth doing while you're in here.

1. **Check-in success handler can crash on a *successful* check-in.** (~line 168)
   ```ts
   const worker = data.worker;
   const company = companies.find((c: any) => c.id === worker.companyId); // throws if worker is undefined
   ```
   If the server response omits `worker`, the check-in succeeded but the UI throws and shows an error. **Fix:** guard for `data.worker` being null/undefined before reading `worker.companyId` / building the pass; if it's missing, still show a success toast and skip the pass preview.

2. **"Previous contractors" list is recomputed on every keystroke with an O(workers × companies) lookup.** (~line 229)
   `previousContractors` maps every worker and runs `companies.find(...)` inside the map, with no `useMemo`, on every render (including every search keystroke). **Fix:** build a `Map<companyId, company>` once, look companies up from the map, and wrap the whole derived list in `useMemo` keyed on `allWorkers`, `companies`, and `searchTerm`. Optionally debounce the search input.

3. **Confirm the "generate test workers" endpoint is dev-only.** The hook wires `POST /api/contractors/generate-test-workers` (~line 111). Verify the server route is gated to non-production / dev-bypass so it can never seed fake workers into a live tenant. If it isn't gated, gate it.

**Acceptance:** Checking a contractor in never throws on success; the previous-contractors list stays responsive while typing in search; the test-worker endpoint is confirmed unreachable in production.

---

## BUG 6 — `GET /api/contractors` computes everything twice (N+1 doubled) and loses the "expiring" status

**Finding (performance + correctness):** The contractor list endpoint does the same expensive work twice.
- `databaseService.getAllContractorCompanies()` (`server/databaseService.ts` ~line 1647) already loops every company and runs a worker-count query + a documents query, then returns each company with `name`, `email`, `phone`, `workersCount` **and** a rich `documentsStatus` (`missing` / `expired` / `expiring` (≤30 days) / `pending`).
- Then `GET /api/contractors` (`server/routes/contractors.ts` ~line 740) takes those finished results and **re-fetches workers and documents for every company again** and recomputes `documentsStatus` with a *simpler* set of values (`missing` / `expired` / `valid` only) — then overwrites the service's richer version via the `...contractor` spread.

**Two problems:**
1. **Double database load.** For a tenant with N companies this is ~2N extra queries per page load, all contending for the 5-connection customer pool. This is the single biggest scalability risk on the page — directly relevant to the 120-site Cowiesburn deal.
2. **The "expiring soon" status is silently lost.** Because the route's simpler recomputation wins, the service's `expiring` (≤30 days) and `pending` states never reach the front end from this endpoint — so a document that's about to expire shows as plain `valid`.

**Fix:** Delete the route-level recomputation in `GET /api/contractors` entirely. `databaseService.getAllContractorCompanies()` already returns `workersCount`, `documentsStatus`, `name`, `email`, `phone` — just return its result directly (optionally still stamping `complianceScore` / `safetyRating` if that isn't already on the row). Also drop `lastUpdated: new Date().toISOString()` unless something genuinely depends on it. Confirm the front end still gets `workersCount` and that compliance badges now reflect `expiring`.

**Acceptance:** The contractor list endpoint issues roughly half the queries it does today, and a company document within 30 days of expiry shows as "expiring", not "valid".

---

## BUG 7 — Inconsistent React Query keys cause duplicate fetches and a stale header badge

**Finding:** The same data is cached under two different keys depending on which component asks for it, so they don't share a cache and invalidating one doesn't refresh the other.

- **CDM projects:** the header "F10 overdue" badge in `useContractorManagement.ts` (~line 57) queries `["/api/cdm/projects", customerId]`, but `ContractorCDMTab.tsx` (~line 161) queries `["/api/cdm/projects"]`. When you create / edit / delete a CDM project in the tab it invalidates `["/api/cdm/projects"]` only — so **the header "F10 overdue" badge does not update** until a full page refetch. It's also a duplicate network request for identical data.
- **Contractor companies:** `useContractorManagement.ts` uses `["/api/contractors", customerId]` while `ContractorPreBooking.tsx` (~line 78) uses `["/api/contractors"]` — another duplicate fetch of the same list under a different key.

**Fix:** Standardise the query keys for each endpoint across all contractor components (pick one form — either always include `customerId` or never — and apply it everywhere). After that, a single invalidation refreshes every consumer, the header badge updates immediately after a CDM change, and the duplicate fetches disappear.

**Acceptance:** Creating or deleting a CDM project immediately updates the header "F10 overdue" badge; the network tab shows one fetch per endpoint, not two.

---

## BUG 8 — Pre-booking tab: minor cleanups (code review)

From reviewing `client/src/components/ContractorPreBooking.tsx`:
1. **Dead `companies` query.** A comment says "Fetch contractor companies for dropdown" and the query runs (~line 77), but Company Name is a free-text input — the dropdown was never wired. Either wire the dropdown (better data quality — links a booking to a real company) or remove the unused query.
2. **`documentsRequired` is a dead field.** It's in the Zod schema and always submitted as `[]`, but there's no UI to set it. Add a control or remove it from the schema.
3. **Past dates are bookable.** The date `Calendar` has no `disabled` for past dates, so a pre-booking can be created in the past. Disable past dates.
4. **Lossy name split on edit.** Submit joins first+last into `workerName`; `handleEdit` splits on the first space (first word = first name, remainder = last name). Multi-part first names get mis-split on edit. Low priority, but consider storing `workerFirstName`/`workerLastName` separately.

**Acceptance:** No unused queries/fields; past dates can't be selected for a new pre-booking.

---

## Cross-check note (already fixed — do NOT redo)
While reviewing, I confirmed these earlier contractor bugs are **already fixed** in the current code — leave them alone:
- The `max: 1` customer-DB pool (cause of the multi-endpoint 500 cascade, BR-008) is now `max: 5`, `idleTimeoutMillis: 30000`. ✅
- `GET /api/contractors/:companyId/notes` now validates the UUID, logs the real error with structured fields, and returns `[]` when the table is missing. ✅

## Deliverable
A short note confirming each of Bugs 1–5 is fixed, with the date field demonstrably accepting a 4-digit year and a full worker-document upload (file + expiry) completing end-to-end on `/worker-upload/:token`.
