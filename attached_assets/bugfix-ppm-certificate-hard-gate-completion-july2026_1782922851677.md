# PPM — Hard gate: block "Completed" until the required certificate is uploaded

## Plain-English summary (for Andy)
Right now a contractor (or an admin) can mark a statutory PPM job as **Completed** even if the
required certificate hasn't been uploaded — for example, ticking off fixed-wire (EICR) testing
without attaching the certificate. The system currently only *chases* the missing certificate by
email ~48 hours later; it does **not** stop the job being closed.

This change locks the door: **if a work order requires a certificate and none has been uploaded,
it cannot be set to "Completed"** — on both the contractor's mobile link and the admin screen.
The user gets a clear message telling them to upload the certificate first.

No database change is needed — the fields `requiresCertificate` and `certificateUploadedAt`
already exist on `ppm_work_orders`. **Do NOT run `db:push`.**

---

## The rule (single source of truth)
A work order may only be updated to `status = "completed"` when:

> `requiresCertificate === false` **OR** `certificateUploadedAt` is set (not null).

If that condition is not met, reject the completion with HTTP **400** and this exact error body:

```json
{ "error": "This work order requires a service certificate. Please upload the certificate before marking it complete.", "code": "CERTIFICATE_REQUIRED" }
```

Notes:
- This blocks **only** the transition to `completed`. All other status changes
  (`scheduled`, `in_progress`, `on_site`, `overdue`) are unaffected.
- Certificates are uploaded via the existing separate file-upload endpoints, which set
  `certificateUploadedAt`. So by the time a user marks the job complete, that field already
  reflects reality — no need to accept a certificate in the same request.

---

## Backend changes — `server/routes/ppm.ts`

### 1. Admin path — `PUT /api/ppm/work-orders/:id` (around line 768)
Currently the existing row is only loaded when contractor fields change. We now also need it
when the caller is setting `status = "completed"`, so we can read `requiresCertificate` /
`certificateUploadedAt`.

- When `updates.status === "completed"`, load the existing work order (respecting `siteFilter`
  / `scopedWhere` for tenant + site isolation — reuse the same lookup pattern already used in
  the contractor-fields branch). If it's not found, return `404`.
- Apply the rule above. If it fails, return `400` with the `CERTIFICATE_REQUIRED` body and
  **do not** perform the update or advance the linked schedule.
- Avoid loading the row twice — if the contractor-fields branch already loaded `existing`,
  reuse it.
- Keep the existing behaviour (auto-set `completedDate`, advance schedule, audit log) for the
  cases that pass the gate.

### 2. Contractor path — `PUT /api/ppm/work-order/public/:token` (around line 2998)
Inside `performUpdate`, the work order is already loaded as `wo`. Before applying updates:

- If `status === "completed"` and `wo.requiresCertificate && !wo.certificateUploadedAt`,
  return the `CERTIFICATE_REQUIRED` rejection (surface it as a `400` from the route; do not
  rotate the access token and do not advance the schedule when rejected).
- Everything else (status → `in_progress` / `on_site`, completion notes, token rotation)
  continues to work exactly as before.

### 3. Belt-and-braces (optional but preferred)
If there is any other place a work order can be flipped to `completed` (e.g. a bulk action),
apply the same guard there. Do a quick grep for `"completed"` writes to `ppmWorkOrders` to be
sure. The `duplicate` endpoint resets status to `scheduled`, so it is not affected.

---

## Frontend changes

### A. Contractor mobile work order — `client/src/pages/PPMWorkOrderMobile.tsx`
- When the work order `requiresCertificate` is true and no certificate has been uploaded yet:
  - Disable the **Mark as Complete** button, and show a short helper line beneath it:
    *"Upload the service certificate before you can mark this job complete."*
  - Once a certificate is uploaded (state refreshes / `certificateUploadedAt` becomes set),
    re-enable the button automatically.
- If the API still returns the `CERTIFICATE_REQUIRED` 400 (e.g. race condition), show the
  returned `error` message as a toast rather than a generic failure.

### B. Admin PPM screen — `client/src/pages/PPM.tsx` (and `PpmDashboard.tsx` if the status
control lives there)
- Apply the same treatment: where an admin changes a work order's status, prevent selecting
  **Completed** for a certificate-required job with no certificate uploaded (disable the option
  or guard the action), with the same helper text.
- On any `CERTIFICATE_REQUIRED` 400 from the API, show the returned `error` message as a toast.

Keep wording, tone and British spelling consistent with the rest of the app.

---

## Acceptance tests (please verify all)
1. **Contractor, cert required, no cert uploaded** → tapping "Mark as Complete" is blocked;
   helper text shown; API returns 400 `CERTIFICATE_REQUIRED`; status stays `on_site`/
   `in_progress`; schedule **not** advanced; access token **not** rotated on the rejected call.
2. **Contractor, cert required, cert uploaded** → completion succeeds as normal; schedule
   advances; token rotates.
3. **Contractor, cert NOT required** → completion succeeds with no certificate (unchanged
   behaviour).
4. **Admin, cert required, no cert** → cannot set status to Completed; 400 returned; no update
   written; no schedule advance.
5. **Admin, cert required, cert uploaded** → completes fine.
6. **Non-completion transitions** (in_progress, on_site, back to scheduled) → all still work
   with or without a certificate.
7. **Tenant / site isolation** unchanged — the admin lookup still respects `scopedWhere` /
   `siteFilter`.
8. Existing "Certificate Missing" 48-hour chase email still functions for any legacy jobs that
   slipped through before this gate (it becomes a safety net, not the primary control).

## Out of scope / do not do
- No `db:push` / schema migration.
- Do not change which categories are flagged `requiresCertificate` (the statutory-category
  logic stays as-is).
- Do not touch demo-data generation.
