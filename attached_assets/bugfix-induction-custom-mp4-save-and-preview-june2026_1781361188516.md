# Bugfix: Custom MP4 induction won't persist + Preview shows AI slides instead of the uploaded video (June 2026)

Follow-up to `bugfix-induction-settings-saved-video-not-showing-june2026.md` (the list endpoint + `hasVideo` fixes landed — the page now shows "Ready / Custom video uploaded"). But two real bugs remain with the **Upload MP4 Video** path on `/induction-settings`:
1. The uploaded MP4 doesn't persist — on reload the role reverts to "Not Generated"; you can only see it immediately after upload.
2. Clicking **Preview** plays an AI-generated slide induction, not the MP4 that was uploaded.

Copy everything below the line into the Replit agent.

---

## BUG 1 — Uploaded MP4 is not reliably saved

The upload endpoint `POST /api/induction/upload-video` (server/routes/induction.ts ~line 487) saves the file to object storage, then persists the reference with a bare UPDATE:
```ts
await custDb.update(isolatedSchema.inductionSettings)
  .set({ customVideoUrl: storedPath, updatedAt: new Date() })
  .where(eq(isolatedSchema.inductionSettings.roleType, roleType));
return res.json({ success: true, url: storedPath });
```
Problems:
- **It's an UPDATE, not an UPSERT.** If there is no `induction_settings` row for that `roleType` in this customer's isolated DB (common — a role can have AI slides served from a global/default fallback without an isolated row yet), the UPDATE matches **zero rows**, nothing is saved, and the endpoint **still returns `success: true` with the url**. The page shows the video optimistically from that response, but on reload `GET /api/induction/settings` returns `customVideoUrl = null` and the role reverts to "Not Generated". This is exactly the reported symptom.
- **No verification.** It never checks how many rows were affected, so a no-op save looks identical to a real one.

**Fix:**
1. Make it an **upsert**: if no `induction_settings` row exists for `(customer, roleType)`, INSERT one (with sensible defaults: the role, `videoFormat`/`modelType` defaults, `passPercentage` default, `isActive` true) carrying `customVideoUrl`; otherwise UPDATE. Use `.returning()` and confirm exactly one row now holds the `customVideoUrl`.
2. If, after the upsert, no row carries the value, return a **500/409 with a clear error** — never report success on a no-op.
3. Keep writing to the customer-isolated DB (it already resolves the same `customerId` the read endpoints use — `createCustomerContext(username, req.customerId)` returns `req.customerId`, so that part is fine; don't change it, just make the write actually land).
4. Client (`InductionSettings.tsx`, `handleVideoFileSelect` ~line 491): after a successful upload, **trust the refetched settings** to confirm persistence. Today it optimistically sets `currentCustomVideoUrl = data.url` and invalidates the query; if the server didn't actually persist, the optimistic value masks the failure until reload. After the invalidate/refetch, if `settings.customVideoUrl` is still null, surface an error toast ("Upload didn't save — please try again") instead of "Video uploaded". Also make sure the reconciling effect at lines ~265–267 does not wipe a just-uploaded value while the refetch is briefly in flight (guard against a transient null).

---

## BUG 2 — Preview shows AI slides, never the uploaded MP4

Both Preview buttons do the same thing:
```ts
onClick={() => window.open(`/induction-preview/${roleType}`, '_blank')}
```
— the custom-upload one at `InductionSettings.tsx` line ~639 and the AI one at ~725. And `/induction-preview/:roleType` (`InductionPreview.tsx`) always loads the AI slide/video HTML from `GET /api/induction/video/${roleType}` into an iframe — it has **no custom-video branch**. So for a role with an uploaded MP4, Preview shows AI slides (or a default induction), never the MP4. That's what the screenshot shows.

There is already an admin streaming endpoint — `GET /api/induction/custom-video-admin/:roleType` (induction.ts ~line 644, with HTTP Range support) — but (a) nothing calls it, and (b) it authenticates off `req.userId`, which a plain `<video>` element or `window.open` **cannot supply** (the app's per-tab auth is a Bearer token in `sessionStorage`; a media request can't attach that header). So even pointing a `<video>` straight at it would 401.

**Fix — make Preview show what the inductee will actually see, and stream it without needing an auth header:**
1. In `InductionPreview.tsx`, fetch the role's induction settings first (authenticated via `apiRequest`, which the page can do because it runs in the admin's logged-in tab). Branch:
   - **If `customVideoUrl` is set:** render an HTML5 `<video controls>` that plays the uploaded MP4 — do NOT load the AI slide iframe.
   - **Else:** render the AI slides as it does now.
2. Stream the MP4 in a way a `<video>` tag can authenticate. Preferred, mirroring the working worker flow: add an authenticated endpoint `POST /api/induction/preview-token/:roleType` (requireAuth) that mints a short-lived, single-purpose preview token, then have the preview `<video src={`/api/induction/custom-video/${previewToken}`}>` use the existing **public, range-supported** stream `GET /api/induction/custom-video/:token` (induction.ts ~line 578). This avoids the header-auth problem entirely and reuses proven code. (Alternative if you prefer: make `/api/induction/custom-video-admin/:roleType` authenticate via the session **cookie** through `requireAuth` rather than `req.userId`, and request it with `credentials: 'include'` — only if cookie sessions are reliably present; the token route is the safer bet.)
3. Update the custom-upload **Preview** button so it opens this custom-video preview (or the same `/induction-preview/:roleType` now that the page branches correctly). The label should read "Preview video".

---

## SANITY — related checks on the same flow

A. **`/api/induction/video/:roleType` serves a default/AI induction even when nothing is saved.** That's why Preview looked populated. Confirm this is intended as a fallback; if so, it should NOT be shown as "this role's induction" when the role actually has a custom MP4 (Bug 2 fixes that). Make sure the admin preview reflects the *real* content an inductee receives for that role, not a generic default.

B. **Remove / Replace round-trip.** After `handleRemoveVideo` (DELETE `/api/induction/upload-video`) the row's `customVideoUrl` is set to null — verify the page then correctly flips to "Not Generated" and `videoSource` back to AI, and that re-uploading works (the upsert from Bug 1 covers the "row may have been left without content" case).

C. **`videoSource` stickiness.** Confirm that selecting "Upload MP4 Video", uploading, and reloading keeps the role on the custom-upload tab with the video shown (depends on Bug 1 persisting `customVideoUrl`, which the effect at ~265 reads to set `videoSource`).

D. **Worker vs admin parity.** The worker player streams the custom video via `/api/induction/custom-video/:token` and it works (the contractor saw the video). After these fixes, the admin Preview must show the *same* MP4 — verify they match for the same role.

---

## Verification

1. Select "Upload MP4 Video" for Contractors, upload an MP4 → page shows "Ready / Custom video uploaded". **Reload the page** → it still shows Ready with the same video (persisted, not reverted to "Not Generated").
2. Upload to a role that has **no** existing induction settings row → it still persists (upsert), proving the zero-rows case is fixed.
3. If object storage write or DB upsert fails, the UI shows an error — never a false "Video uploaded".
4. Click **Preview** on the custom-upload card → the uploaded **MP4 plays**, not AI slides. The video matches what the contractor sees via their induction link.
5. Click **Preview** on an AI-slides role → AI slides still show (unchanged).
6. Remove the video → role flips to "Not Generated"; re-upload works.
7. `npx tsc --noEmit` clean for touched files; tenant isolation intact (preview token / stream scoped to the same customer + role).

Do NOT change the worker-facing induction flow (it already works) or start shipping the large `generated_html`/`scenes_data` blobs in the settings list.
