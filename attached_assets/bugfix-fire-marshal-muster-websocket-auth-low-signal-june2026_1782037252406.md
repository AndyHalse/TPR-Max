# BUGFIX — Fire Marshal / Muster: WebSocket auth leak + weak-signal resilience

Hardening of the live evacuation flow. The offline-first work already here is genuinely good — **do not rip it out**; this tightens two real gaps (a security leak and a weak-signal blind spot) and widens the offline net to the actions that matter.

> ✅ **No `npm run db:push` needed** — all changes are client-side + WebSocket-server logic. No schema changes.
> ⚠️ **Life-safety flow** — test carefully; never let a fix drop a "mark safe" action.

Files: `client/src/pages/FireMarshalMobile.tsx` (the phone link marshals use), `FireMarshalMuster.tsx`, `EmergencyMuster.tsx`, `IncidentMonitor.tsx`, `client/src/lib/fireMarshalOffline.ts`, `server/websocketService.ts`, `server/routes/emergency.ts`.

---

## 1. 🔴 Authenticate the muster WebSocket (cross-tenant data leak)
**Problem:** `server/websocketService.ts` (~line 46) trusts a client-supplied `customerId` on `register` with **no verification** (`client.customerId = message.customerId`). It then broadcasts muster updates — names + accountability status of who's on site during an evacuation — to every client registered under that id. Any client can connect to `/ws/muster`, send `{ type:'register', customerId:'<guessed>' }`, and watch another company's live evacuation. The REST endpoints are gated; this parallel channel is not.

**Fix — validate a credential on register before accepting the subscription:**
1. Change the `register` message to carry the credential the client legitimately holds, and validate it server-side against the claimed `customerId`. Only set `client.customerId` if validation passes; otherwise reject (send an error + do not subscribe).
   - **Fire Marshal pages** (`FireMarshalMobile.tsx` ~line 227, `FireMarshalMuster.tsx` ~line 246): include their `urlId` (or emergency token) in the register payload. Server validates via the existing `databaseService.findFireMarshalByUrlId(urlId)` (`databaseService.ts:354`) and confirms the returned `customerId` matches the claimed one.
   - **Logged-in muster** (`EmergencyMuster.tsx` ~line 292): include the session Bearer token (`getSessionToken()` is already available, used at line 651). Server validates via `verifySessionToken` (already imported in `emergency.ts`) and confirms `customerId` matches.
   - **IncidentMonitor.tsx** (~line 89): confirm how its monitor link authorises (it carries a `?customer=` + evacuationId) and validate equivalently — if the monitor link isn't itself a verifiable token, gate it behind a short-lived signed token rather than a bare customerId.
2. In `websocketService.ts`, make the `register` handler `async`, perform the validation, and if it fails, send `{ type:'register_failed' }` and leave `client.customerId` unset so the client receives no broadcasts.
3. Keep the existing reconnect logic on the client; on `register_failed`, surface a clear error rather than silently retrying forever.

## 2. 🔴 Close the weak-signal blind spot (the "one bar of 4G" case)
**Problem:** the offline outbox only triggers on `navigator.onLine === false` (fully offline). On weak/flaky signal the device reports "online", so a normal request is attempted — and because **no request has a timeout**, it can hang 30–60s+. In that state a mark-safe tap is NOT queued; it just hangs. This is the exact fire-marshal scenario.

**Fix:**
1. Add a small `fetchWithTimeout(url, opts, ms)` helper (using `AbortController`, default ~8000ms) and use it for the marshal action requests (and the polls in §4).
2. In the **mark-safe**, **mark-zone-safe**, and **note** mutations (`FireMarshalMobile.tsx` ~lines 393, 479, 557, 712), change the offline check from "if `navigator.onLine === false`" to **"if offline OR the request times out / fails with a network error"** → enqueue to the IndexedDB outbox (see §3) instead of erroring. Show the existing "queued — will sync" feedback and bump `pendingSyncCount`.
3. A real server error (e.g. 4xx/5xx with a response) should still surface as an error — only **network failures / timeouts** get queued (so we don't hide genuine rejections).

## 3. ⚠️ Extend the offline outbox to mark-zone-safe and notes
**Problem:** `client/src/lib/fireMarshalOffline.ts` `OutboxItem` is mark-safe-specific, so mark-WHOLE-zone-safe and notes can't be queued. "Mark my zone safe" is a common bulk action; notes are accountability evidence.

**Fix:**
1. Generalise `OutboxItem` to a typed action: add `kind: 'mark-safe' | 'mark-zone-safe' | 'note'` and the fields each needs (zone-safe: `zoneId` + the affected `personIds` or the zone identifier the server expects; note: `text`). Keep the existing `markedAt` timestamp on every item.
2. Generalise the flush (`flushMarkSafeOutbox` → e.g. `flushOutbox`) to dispatch each item to the right endpoint by `kind` (`/api/emergency/mark-safe/:id`, the zone-safe path, `/api/emergency/evacuation-note`), sequentially, removing each on success and keeping it on failure for the next attempt. Preserve item order.
3. **Crucial:** when these actions are replayed later, send the original `markedAt` so the incident record reflects when the marshal actually acted, not when the network recovered. (Mark-safe already carries `markedAt` — do the same for zone-safe and notes; confirm the server honours a supplied timestamp, and if not, have it record both "acted at" and "synced at".)
4. Photos and individual zone-sweeps stay **online-only / best-effort** for now (Andy's call) — but make their failure on bad signal honest: a clear "couldn't save — no/again when you have signal" toast, not a silent failure.

## 4. ⚠️ Timeouts on polls + honest stale-data warning
**Problem:** the 5s personnel poll and the auth fetch are raw `fetch()` with no timeout, so on weak signal they hang and the marshal sees stale numbers while the indicator says "online".

**Fix:**
1. Use `fetchWithTimeout` (from §2) for the personnel poll (~line 290), the auth fetch (~line 157), the active-evacuation poll, and zones/sweeps fetches.
2. There's already a `lastDataAt` timestamp (~lines 147, 307). When the most recent successful data is older than, say, 15s (i.e. polls are failing), show a clear amber banner: "⚠ Data may be out of date — last updated Xs ago" so the marshal knows not to trust the on-screen numbers. Clear it as soon as fresh data arrives.

## Out of scope (Andy deferred)
- #5 (full personnel list polled every 5s — heavy at Cowiesburn scale; widen to ~10–15s) and #6 (polling backoff) — leave for a later performance pass.

## Acceptance test
- **WS auth:** a client connecting to `/ws/muster` and registering with a customerId it has no valid urlId/session for receives NO muster broadcasts (validated reject). A real fire marshal (valid urlId) and a logged-in admin still get live updates.
- **Weak signal:** simulate slow/failing network (DevTools throttling / offline mid-request). Tapping "mark safe", "mark zone safe", and adding a note all **queue** (pending count rises) and **auto-sync** when signal returns — nothing is lost; synced records show the time the marshal acted, not the sync time.
- **Hang prevention:** a request on dead-slow signal aborts at ~8s and queues, rather than hanging the button.
- **Stale warning:** when polls stop succeeding, the "data may be out of date" banner appears within ~15s and clears when data returns.
- **No regression:** online behaviour, optimistic updates, WS single-person patching, photo resize, and the service worker all still work. A genuine server rejection (4xx) still shows an error (not silently queued).
