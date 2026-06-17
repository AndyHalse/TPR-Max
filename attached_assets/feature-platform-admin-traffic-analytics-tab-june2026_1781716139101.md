# Feature: First-party website traffic tracking + a "Traffic" tab on the platform-admin dashboard

**Date:** 17 June 2026
**Area:** Public site analytics + Platform Admin dashboard
**Type:** Feature (additive, requires `npm run db:push` for one new table)

---

## Plain-English summary (for Andy)

You want to see how much traffic the public website (`/`, `/marketing`, `/about`, blog) is getting, on a new tab in the platform-admin dashboard — **without** signing up for Google Analytics or a paid tool.

This builds a **first-party tracker**: a tiny invisible "ping" fires when someone loads a public page, and the server records it in TPR's own database. A new **Traffic** tab then shows total visits, unique visitors, a day-by-day chart, your most-visited pages, and where visitors came from (referrers).

**Privacy by design — important:** it stores **no cookies and no personal data**. Unique visitors are counted using a one-way "fingerprint" (a salted hash of IP + browser, with the salt rotating daily) that **cannot be reversed back to a person**. Because there are no cookies and no PII, this needs **no cookie-consent banner** and is GDPR-friendly. State this clearly so it stays that way — do not add cookies or store raw IP addresses.

Because the ping runs in the browser via JavaScript, search-engine crawlers (which don't run JS) are naturally excluded, so you see **real human visits**, not bots.

---

## Current state (verified in codebase)

- Platform-admin pages live at `client/src/pages/PlatformAdminDashboard.tsx`, using a `Tabs` component with `defaultValue="customers"` and tabs: **Customers**, **Blog**, **Bug Reports** (around line 791). Data is fetched with `useQuery` + `fetch(..., { credentials: 'include' })` against `/platform-admin/...` routes.
- Platform-admin server routes are in `server/routes/platformAdmin.ts`, guarded by `requirePlatformAdmin` (from `../auth`), using the **shared** DB (`server/db`) and `@shared/schema`. These routes are **not** under `/api` — they are registered at `/platform-admin/...`.
- Tables are defined as `pgTable(...)` in `shared/schema.ts`.
- `recharts` (^2.15.2) and `date-fns` (^3.6.0) are already installed. `Europe/London` is the standard timezone used across the server.
- `express.json({ limit: '5mb' })` and rate limiting on `/api` are configured in `server/index.ts`.

---

## Implementation

### 1. New table `pageViews` in `shared/schema.ts`

```ts
export const pageViews = pgTable("page_views", {
  id: uuid("id").primaryKey().defaultRandom(),
  path: text("path").notNull(),              // e.g. "/marketing"
  referrerHost: text("referrer_host"),        // host only, e.g. "linkedin.com"; null if direct
  visitorHash: text("visitor_hash").notNull(),// daily-rotating salted hash of IP+UA — NOT reversible
  isBot: boolean("is_bot").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  createdAtIdx: index("page_views_created_at_idx").on(t.createdAt),
  pathIdx: index("page_views_path_idx").on(t.path),
}));
```

- Store **only the referrer host**, never the full referring URL (avoids capturing query strings that could contain PII).
- Requires `npm run db:push`.

### 2. Public tracking endpoint `POST /api/track`

Add a small public (unauthenticated) route. Place it so it is covered by the existing `/api` general rate limiter but does **not** require auth or CSRF (it is a fire-and-forget beacon). If CSRF middleware would block it, exempt this single path explicitly.

Behaviour:
- Accept JSON body `{ path: string, referrer?: string }`. Validate with `zod`: `path` required, must **start with `/`**, max length ~200.
- **Whitelist public paths only.** Record only if `path` is `/`, `/marketing`, `/about`, `/blog`, or matches `/blog/:slug`. Anything else (app routes, `/platform-admin`, portals, kiosk) → respond `204` and record nothing. This keeps it to marketing traffic and stops the tracker being abused to write arbitrary rows.
- Derive server-side (never trust the client for these):
  - **IP:** from `req.ip` / `X-Forwarded-For` (Replit sits behind a proxy — ensure `trust proxy` is set; it likely already is for rate limiting).
  - **User-agent:** from the `User-Agent` header.
  - **`isBot`:** true if the UA matches a simple bot pattern (`bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|lighthouse|monitor|pingdom`, case-insensitive). Still store bot hits (flagged) so they can be excluded in reporting.
  - **`visitorHash`:** `sha256(DAILY_SALT + ip + userAgent)` where `DAILY_SALT` = a server secret combined with the current `YYYY-MM-DD` in `Europe/London`. Because the salt changes daily, the same visitor counts as one unique per day and the hash cannot be traced to a person. Use a per-install secret (env var, e.g. `ANALYTICS_SALT`; fall back to `SESSION_SECRET` if not set).
  - **`referrerHost`:** parse the client-sent `referrer`; keep only the hostname; drop it if the host is `tpr-max.com`/`www.tpr-max.com` (internal navigation) or unparseable → `null` (counts as "Direct").
- Insert one row. Wrap in try/catch — **a tracking failure must never error the user's page**; on any failure just respond `204`.
- Always respond `204 No Content` (the beacon ignores the body).

### 3. Client beacon

Add a tiny tracker that fires once per public page view. In `client/src/App.tsx` (or a small `useTrackPageview` hook), on route change:
- Only fire when the current path is one of the public marketing paths (same whitelist as the server). Never fire on app/admin/portal/kiosk routes.
- Send `{ path, referrer: document.referrer }` to `/api/track` using `navigator.sendBeacon` if available, else a `fetch(..., { method: 'POST', keepalive: true })`. Fire-and-forget; ignore the response and never block render.
- Fire on initial load **and** on client-side navigation between public pages.

> Crawlers don't run JS, so this naturally records human visits. No cookies, no localStorage, no consent needed.

### 4. Reporting endpoint `GET /platform-admin/traffic` (auth-guarded)

In `server/routes/platformAdmin.ts`, add a route guarded by `requirePlatformAdmin`:
- Query param `range` = `7d` | `30d` | `90d` (default `30d`). Compute the window in `Europe/London`.
- Exclude `isBot = true` from all figures (optionally also return bot totals separately as a footnote).
- Return JSON:
  - `totals`: `{ views, uniqueVisitors }` for the window (`uniqueVisitors` = distinct `visitorHash`).
  - `series`: array of `{ date: 'YYYY-MM-DD', views, uniqueVisitors }`, one entry per day in the window (fill gaps with zero so the chart is continuous), dates in `Europe/London`.
  - `topPages`: top 10 `{ path, views }` ordered by views desc.
  - `topReferrers`: top 10 `{ referrerHost, views }` (null grouped as `"Direct"`).
- Use efficient aggregate SQL (`count`, `count(distinct visitor_hash)`, `group by`), relying on the indexes. Never load raw rows into memory to count.

### 5. New "Traffic" tab on the dashboard

In `client/src/pages/PlatformAdminDashboard.tsx`:
- Add a `<TabsTrigger value="traffic">` (with a suitable lucide icon, e.g. `BarChart3` or `TrendingUp`) next to the existing tabs, and a matching `<TabsContent value="traffic">`.
- Inside, add a range selector (7 / 30 / 90 days) and `useQuery` against `/platform-admin/traffic?range=...` (same `fetch(..., { credentials: 'include' })` pattern as the other tabs; include `range` in the `queryKey`).
- Display:
  - Two stat cards: **Total visits** and **Unique visitors** for the range (reuse the existing `Card` components for visual consistency).
  - A **line or area chart** (recharts) of views per day over the range.
  - A **Top pages** list (path + view count).
  - A **Top referrers** list (host + view count; null shown as "Direct").
- Format all dates/times in **en-GB**. Show a friendly empty state ("No traffic recorded yet") when there's no data.
- Match the existing dashboard styling — do not introduce new colours; use the ACS palette already in use.

---

## Acceptance criteria

1. Loading `/marketing`, `/`, `/about`, `/blog` and a blog post each records exactly one `page_views` row (verify the row has a non-null `visitorHash`, correct `path`, and `referrerHost` host-only or null).
2. Loading an app/admin/portal/kiosk route records **nothing**.
3. No cookies are set and no raw IP or full URL is stored anywhere. `visitorHash` differs for the same visitor across two different days (salt rotates).
4. A request from a bot user-agent is stored with `isBot = true` and is **excluded** from the dashboard figures.
5. The platform-admin dashboard shows a new **Traffic** tab with total visits, unique visitors, a per-day chart, top pages and top referrers, with a working 7/30/90-day range selector.
6. The tracking beacon never blocks page render and never throws a visible error if `/api/track` is slow or fails.
7. `GET /platform-admin/traffic` returns 401/redirect when not authenticated as a platform admin.
8. `npm run db:push` applied; `npm run check` passes; no console errors on the public pages or the dashboard.

---

## Notes

- This is **platform-level** data (your whole marketing site), so it lives in the shared DB and is **not** tenant-isolated — that is correct here. It must remain visible only to platform admins.
- Keep British spelling and en-GB date/number formatting.
- Future option (out of scope): a nightly cron to roll old rows into a daily-summary table if volume ever gets large — not needed at current scale.
