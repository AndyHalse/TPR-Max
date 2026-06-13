# Bugfix: H&S Incident hazard photos upload but never save (June 2026)

On `/hs-incidents` you can attach a photo to an incident, near miss, Good Spot or Positive Action. The upload works — the file lands in object storage, the form shows a thumbnail, and the record saves without error. But the photo is **never attached to the record**. On reload it's gone, every time. The photo column exists and the page knows how to display it; the two server routes that write the record just don't persist the field.

Copy everything below the line into the Replit agent.

---

## THE BUG

The photo flow is broken at the database write step only — everything around it is correct:

- **Upload works.** `POST /api/hs-incidents/photo` (`server/routes/hsIncidents.ts` ~line 787) saves the image and returns `{ success: true, url: storedPath }`.
- **Client sends it.** `HSIncidents.tsx` `handleSubmit` (~line 352) uploads the file, gets the url back, and puts it on the payload as `photoUrl` (~line 369).
- **Schema has the column.** `isolatedSchema.hsIncidents` maps `photoUrl: text("photo_url")` (`server/isolatedSchema.ts` ~line 2526), and `ensureHsIncidentsTable` adds the column with an idempotent `ALTER TABLE … ADD COLUMN IF NOT EXISTS photo_url TEXT` (`hsIncidents.ts` ~line 53).
- **Display works.** The list renders the photo (`HSIncidents.tsx` ~line 1005) and the edit form shows it (~line 1265).

The break:

1. **CREATE never inserts `photoUrl`.** The `POST /api/hs-incidents` insert (`hsIncidents.ts` ~lines 125–147) lists every column *except* `photoUrl`. So new records always store `photo_url = null` no matter what the client sent.
2. **UPDATE never sets `photoUrl`.** The `PUT /api/hs-incidents/:id` builds an `updates` object (~lines 226–248) that never assigns `updates.photoUrl`. So editing a record to add or change a photo silently drops it too.

Net effect: a photo uploads, shows in the form preview, then vanishes the moment the record is saved or the page is reloaded.

## THE FIX

Both fixes are in `server/routes/hsIncidents.ts`. The field name on the body is `photoUrl` (the client already sends it).

1. **CREATE** — in the `POST /api/hs-incidents` insert `.values({ … })` block (~line 125), add:
   ```ts
   photoUrl: body.photoUrl || null,
   ```
   Put it alongside the other plain fields (e.g. next to `location` / `reportedBy`). The photo applies to every record type — incidents, near misses, Good Spots and Positive Actions — so do **not** gate it behind the `isBbs` check.

2. **UPDATE** — in the `PUT /api/hs-incidents/:id` route, in the block that builds `updates` (~lines 226–248), add:
   ```ts
   if (body.photoUrl !== undefined) updates.photoUrl = body.photoUrl || null;
   ```
   Using the `!== undefined` guard means an edit that doesn't touch the photo leaves the existing one alone, while clearing the photo (client sends `""`) correctly nulls it. This matches how the client behaves: removing the photo sets `form.photoUrl = ""`, and `handleSubmit` resolves `photoUrl` to `form.photoUrl || null`.

Don't change the upload endpoint, the schema, or the client — they're already correct. This is purely the two missing writes.

## OPTIONAL — include the photo in the PDF report (nice-to-have, not the bug)

The single-incident PDF (`GET /api/hs-incidents/:id/pdf`, ~line 311) builds its HTML from the incident record but never renders `incident.photoUrl`, so even once photos save, the printed/exported report won't show them. If you want the evidence photo on the report, embed it in the HTML — but note the stored path is an object-storage reference (`/hs-incidents/…`), not a public URL, so Puppeteer can't fetch it directly. To do it properly you'd read the image bytes from object storage and inline it as a base64 `data:` URI in the `<img>` tag. Treat this as a separate follow-up — it is **not** required to fix the reported bug.

## VERIFICATION

1. Create a new incident, attach a photo, save → reopen / reload the page → the photo is still shown on the record (persisted, not gone).
2. Create a Good Spot with a photo → same: photo persists after reload.
3. Edit an existing record, add a photo, save → photo persists.
4. Edit a record that already has a photo *without* touching the photo → the existing photo is unchanged.
5. Edit a record and remove the photo (the × button) → save → the photo is cleared and stays cleared after reload.
6. Tenant isolation intact — the photo path is scoped under the customer's object-storage folder (the upload route already uses `req.customerId`); confirm one customer's record never shows another's image.
7. `npx tsc --noEmit` clean for the touched file.
