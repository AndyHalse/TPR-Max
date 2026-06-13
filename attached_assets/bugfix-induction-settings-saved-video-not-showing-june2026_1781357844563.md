# Bugfix: /induction-settings says "No induction generated yet" when a working induction exists + full page sanity check (June 2026)

The `/induction-settings` page shows "No induction generated yet" for the Contractor role even though a saved induction works perfectly in the contractor flow (the worker received the link, watched the video, and it recorded onto their work card). Root cause found: the page can't *see* the saved video because the settings list endpoint doesn't return the field the page checks. Plus a handful of related sanity issues on the same page.

Copy everything below the line into the Replit agent.

---

## ROOT CAUSE — the page is told less than the player is

There are (at least) three different definitions of "does this role have a usable induction", and they disagree:

| Where | What it checks |
|---|---|
| **Worker player** — `GET /api/induction/token/:token` (server/routes/induction.ts ~line 371, 384) | `customVideoUrl` present (custom upload) **OR** `generatedHtml` present **OR** `videoUrl` is an object-storage path → `hasGeneratedContent` |
| **Admin page** — `client/src/pages/InductionSettings.tsx` line 416 | `hasVideo = settings?.generatedAt != null \|\| !!currentCustomVideoUrl` |
| **Kiosk** — `GET /api/induction/kiosk-status/:roleType` (induction.ts ~line 3985) | `Boolean(s.generatedAt)` |

The killer detail: the admin page gets its `settings` from `GET /api/induction/settings` (induction.ts line 3840). That handler **deliberately excludes `customVideoUrl`** (and `generatedHtml`/`scenesData`) from the SELECT (lines 3846–3863) to avoid shipping the 17MB+ content columns. So `settings.customVideoUrl` is **always `undefined`** on this page. `currentCustomVideoUrl` (initialised from it at lines 238, 263–265) is therefore always null, and `hasVideo` collapses to just `generatedAt != null`.

Result: any induction whose `generatedAt` is null — **a custom-uploaded MP4** (stored only in `customVideoUrl`), or an AI induction whose content lives in `generatedHtml`/`videoUrl` without a `generatedAt` timestamp — shows "No induction generated yet" on the admin page, while the worker player happily finds and plays it via the token endpoint. That is exactly the reported bug.

---

## FIX 1 — Make the settings list return enough to detect a saved induction (headline fix)

In `GET /api/induction/settings` (induction.ts ~line 3846) add the small fields the page needs, and lightweight booleans for the heavy columns (do NOT add the heavy columns themselves):
- Add `customVideoUrl` to the SELECT (it's a short URL string — safe and necessary).
- Add computed flags instead of the big columns, e.g. in SQL: `hasGeneratedHtml: sql\`(generated_html IS NOT NULL)\``, `hasScenes: sql\`(scenes_data IS NOT NULL)\``. Keep excluding the actual `generated_html`/`scenes_data` blobs.
- Apply the same to the global-fallback SELECT below it (lines 3871–3888) so both branches return the same shape.

---

## FIX 2 — One shared definition of "has a usable induction" (stops it recurring)

Define the induction-present test **once** and use it in all three places so the admin page, the kiosk, and the worker player can never disagree again (same single-source-of-truth principle as the other recent fixes).

"Has usable induction" = `customVideoUrl` present **OR** `generatedAt` present **OR** `hasGeneratedHtml` **OR** `hasScenes` **OR** `videoUrl` is a real object-storage video.

1. **Client** (`InductionSettings.tsx` line 416): rewrite `hasVideo` to this definition using the now-returned fields. Also fix the dependent state: `videoSource` (line 234) and `currentCustomVideoUrl` (line 238) initialise from `settings.customVideoUrl`, which now actually arrives — verify a custom-MP4 role correctly shows source = "Custom upload" and previews the saved video, not the "AI generated" default.
2. **Kiosk** (`GET /api/induction/kiosk-status/:roleType`, induction.ts ~3985): replace `Boolean(s.generatedAt)` with the same definition, so the kiosk toggle isn't blocked for custom-MP4 / HTML inductions.
3. Factor it into one helper (server util + matching client util) rather than copy-pasting the boolean.

After this, the Contractor card on `/induction-settings` shows "Ready" with the saved MP4 previewable, matching what the worker already sees.

---

## SANITY CHECK — other issues found on this page (fix or confirm)

**A. Two different InductionSettings pages exist and have already diverged.**
`client/src/pages/InductionSettings.tsx` is routed at `/induction-settings` (App.tsx:40/644). A SECOND one, `client/src/pages/settings/InductionSettings.tsx`, is embedded in `Settings.tsx` (line 18) and *does* read `customVideoUrl` directly (its line 71). Two induction UIs with different data logic is how this drift happened. Consolidate to one, or — at minimum — confirm which is canonical, make the other delegate to it, and ensure both use the shared `hasVideo` definition. Tell the user which you kept.

**B. `GET /api/induction/settings/:roleType` reads the GLOBAL table, not the customer-isolated DB.**
induction.ts line 3896–3911 does `db.select().from(inductionSettings)` (global `db`) instead of the per-customer `settingsDb` used everywhere else in this file. That's a tenant-isolation inconsistency — it can return another tenant's / stale settings. Switch it to the customer-isolated database like the list endpoint does. Verify nothing depended on the global behaviour.

**C. `generatedAt` is only set by the video-generation path.**
It's written in `POST /api/induction/generate-video/:roleType` (induction.ts ~4358). Confirm that every way an induction can become "ready" sets a consistent signal: AI video generation (sets `generatedAt` ✓), custom MP4 upload (sets `customVideoUrl`, no `generatedAt` — that's fine once Fix 2 lands), and any slides/HTML-only generation. After Fix 2 the page no longer depends solely on `generatedAt`, but make sure the "Generated <date>" label (line ~709) and status badge degrade gracefully (e.g. show "Custom video uploaded" or "Ready" when `generatedAt` is null but content exists), rather than implying nothing is there.

**D. The two empty-state messages must agree with `hasVideo`.**
Lines ~724 and ~1218 both say "No induction generated yet". With the corrected `hasVideo`, verify neither shows when a custom MP4 or HTML induction exists. The line ~1215 guard (`!hasVideo && videoSource === 'ai_generated'`) should also no longer fire for custom-upload roles.

**E. Quiz pass-rate / attempts wording.** Confirm the page shows the real pass threshold and attempt count from settings (earlier reviews moved this to /5 and dynamic) — re-verify nothing hardcodes "3 attempts" or a fixed pass %.

**F. Kiosk toggle + send-link gating.** Both are gated on `hasVideo` (lines ~1167, 1215). Once `hasVideo` is correct, confirm a custom-MP4 role can enable kiosk and send links (it currently can't, because `hasVideo` is false for it).

---

## Verification

1. The Contractor role on `/induction-settings` shows **"Ready"** with the saved MP4 previewable — matching the worker player. No "No induction generated yet".
2. Repeat for a role that has an **AI-generated** induction (content in `generatedHtml`, `generatedAt` set) and one with a **custom-uploaded MP4** (`customVideoUrl` set, `generatedAt` null) — both show Ready.
3. The kiosk toggle and "send link" are enabled for the custom-MP4 role.
4. The worker player and the admin page agree for every role (no role shows Ready in one and empty in the other).
5. `GET /api/induction/settings/:roleType` returns the current customer's row (tenant isolation verified).
6. Network check: the `/api/induction/settings` list response is still small (no 17MB blobs) — only `customVideoUrl` + the new boolean flags were added.
7. `npx tsc --noEmit` clean for the touched files.

Do NOT start shipping the heavy `generatedHtml`/`scenesData` columns in the list endpoint — only the short `customVideoUrl` and the boolean presence flags.
