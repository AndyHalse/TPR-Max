# Feature: Fire Marshal Muster — Offline (PWA) Support

**Goal:** Make the existing Fire Marshal mobile muster page work **with no mobile signal** at the assembly point. The marshal opens the same URL they already use, and if signal drops, the page keeps showing the **last-known list of people on site** and lets them **carry on marking people safe**. Those "mark safe" taps are saved on the device and **sync back automatically** when signal returns.

This is an **add-on to existing, working code** — not a rebuild. Do **not** change how the muster works when online. Only add an offline fallback layer.

---

## Context — what already exists (do not break)

- Static, no-login Fire Marshal URL: `/fire-marshal/{urlId}` — routed in `client/src/App.tsx` (~line 174).
- The page itself: `client/src/pages/FireMarshalMobile.tsx`.
- It loads data from these GET endpoints (all keyed by `urlId`):
  - `GET /api/emergency/fire-marshal/:urlId` — marshal info
  - `GET /api/emergency/fire-marshal/:urlId/personnel` — **the people-on-site list** (polled every 5s via react-query `refetchInterval`)
  - `GET /api/emergency/fire-marshal/:urlId/zones` — zones
  - `GET /api/emergency/zone-sweeps/:evacuationId` — zone sweeps (sends header `X-Fire-Marshal-Id: {urlId}`)
- Marking a person safe: `POST /api/emergency/mark-safe/{personId}` — already uses react-query optimistic updates with rollback (`markSafeMutation`, `markSafeWithOptionMutation`).
- Build stack: **Vite + React + @tanstack/react-query**. Vite `root` is `client/`, build output is `dist/public`. No PWA tooling exists yet. App shell entry is `client/index.html` (`lang="en-GB"`).
- **Android only** is the target device (a site-owned tablet kept at the fire point). British English throughout.

---

## What to build

### 1. Make the app installable (PWA basics)
- Add a **web app manifest** (`client/public/manifest.webmanifest` or equivalent so Vite serves it at the site root) with: app name "TPR Fire Marshal", short name "Fire Marshal", `display: standalone`, ACS brand theme colour `#2460A9`, background `#ffffff`, and 192px + 512px icons (use the existing ACS logo asset; generate maskable + standard icons).
- Link the manifest from `client/index.html` and add `theme-color` meta `#2460A9`.
- Register a **service worker** on app start. **Scope it tightly** — it must only affect the Fire Marshal flow and must NOT interfere with the rest of the authenticated TPR app or any other API calls. Prefer registering it only when the path starts with `/fire-marshal`.

### 2. Cache the app shell so the page opens offline
- The service worker must **precache the built app shell** (HTML/JS/CSS for the Fire Marshal route) so `tpr-max.com/fire-marshal/{urlId}` opens and renders even with no connection.
- Use a build-time service worker so hashed Vite asset filenames are cached correctly. **Recommended: use `vite-plugin-pwa` (Workbox)** rather than a hand-rolled SW, to avoid stale-cache bugs. If you use it, configure `registerType: 'autoUpdate'` and only inject the SW for production builds.

### 3. Keep a fresh offline copy of the muster data (network-first)
For these GET endpoints only:
- `/api/emergency/fire-marshal/:urlId`
- `/api/emergency/fire-marshal/:urlId/personnel`
- `/api/emergency/fire-marshal/:urlId/zones`

Use a **network-first, fall-back-to-cache** strategy:
- When online: fetch live (as today), and **save the latest successful response** to the cache / IndexedDB, stamped with the time it was fetched.
- When the network call fails (no signal): **return the last saved copy** so the list still renders.
- In `FireMarshalMobile.tsx`, when the personnel query errors due to being offline, **fall back to the last-known cached personnel** instead of showing an error/blank. Do not wipe the on-screen list just because a refresh failed.

### 4. Offline status + staleness banner (safety-critical)
- Add a persistent banner at the top of the muster screen showing connection state and data age, e.g.:
  - Online: `Live · updated just now`
  - Offline: `OFFLINE · showing last-known list from 14:32` (use `en-GB` 24-hour time)
- Use `navigator.onLine` plus `online`/`offline` events. The marshal must **never** be misled into thinking a stale list is live. Make the offline state visually obvious (amber bar).

### 5. Offline "mark safe" with sync-back (the core of this feature)
- When the marshal taps a person safe **while offline**:
  1. Apply the change **locally and immediately** (optimistic update — person turns green, "missing" count drops), exactly like the online flow already does.
  2. Save the action to a **persistent outbox** in IndexedDB: `{ personId, urlId, evacuationId, option?, markedAt (ISO timestamp) }`.
- When connection returns (listen for the `online` event AND on app foreground/visibilitychange), **flush the outbox**: replay each queued `POST /api/emergency/mark-safe/{personId}` in order. On success, remove it from the outbox. On failure, keep it and retry next time.
- Prefer the **Background Sync API** (supported on Android Chrome) to flush even if the page was closed, with the `online`-event flush as a fallback.
- Preserve the existing `markedAt` time from when the marshal actually tapped (do not overwrite with sync time) so the audit trail reflects reality.

### 6. Server-side idempotency for replayed mark-safe calls (REQUIRED)
Because queued actions get replayed on reconnect (and two marshals may mark the same person offline), `POST /api/emergency/mark-safe/{personId}` **must be safe to call more than once**:
- Verify in `server/routes/emergency.ts` that marking safe is an **upsert keyed on (evacuationId, personId)** that simply sets `isAccountedFor = true` — NOT an insert that creates duplicate accountability rows or double-counts.
- If it currently inserts unconditionally, change it to upsert / "set if not already set". Marking an already-safe person safe again must be a no-op that returns success.

### 7. Auto-wipe cached muster data after an evacuation ends
- Once an evacuation is marked ended (no active evacuation for this `urlId`), **clear the cached personnel list and any IndexedDB muster data ~24 hours later**, so personal muster data does not linger on the tablet indefinitely.
- The empty outbox should also be cleared. Do not wipe data while an evacuation is still active.

---

## Explicitly out of scope (do NOT do)
- Do not change the online muster behaviour, the UI layout, or the existing endpoints' shapes.
- Do not add offline support to any other part of TPR — Fire Marshal route only.
- Do not cache or store anything for the main authenticated app.
- Do not weaken any existing auth or tenant-isolation checks.

---

## Acceptance criteria (test on a real Android tablet)
1. Open `/fire-marshal/{urlId}` online → "Add to Home screen" works; icon appears; opens standalone (no browser chrome).
2. With the page open and a list loaded, **switch the tablet to flight mode** → the list still shows, banner flips to `OFFLINE · showing last-known list from HH:MM`.
3. **Fully close and reopen the installed app while in flight mode** → it still opens and shows the last-known list (app shell + data both cached).
4. While offline, **tap several people safe** → they turn green immediately and the "missing" count updates.
5. **Turn signal back on** → queued mark-safe actions sync automatically; refreshing/server view confirms those people are recorded safe, with no duplicates and the original tap times preserved.
6. Marking the same person safe twice (e.g. queued + a second marshal) does **not** create duplicate records or errors.
7. After an evacuation ends, cached muster data is gone from the device within ~24h.
8. Online behaviour is unchanged from before.

---

## Notes for Andy (plain English)
- This makes the Fire Marshal page work like an installed app that **remembers the last roll-call** and lets marshals keep ticking people off even with no signal — syncing back once they're in range again.
- **Important real-world step:** the site tablet must be opened with signal occasionally so its saved copy stays fresh. The staleness banner (step 4) is what protects against a marshal trusting an old list.
- Caching is fiddly to get exactly right — **test the acceptance criteria on a real tablet in a real dead spot before relying on it in a live evacuation.**
