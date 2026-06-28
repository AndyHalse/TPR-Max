# Bugfix — Enterprise Compliance Overview: show ALL sites (with names) + auto-plot every site on the Estate Map

**Module:** Enterprise → Compliance Overview
**Customer impact:** multi-site enterprise customers (Cowiesburn, CPI) — demo-blocking.
**Symptom (from a 13-site demo estate):** the Estate Map shows only the 2 sites that
were manually saved; 11 sites with valid postcodes sit in the "Not yet plotted" list.
The "Site scores" panel shows only 8 entries, and they're bare numbers with no site
names.

> **No `npm run db:push`** — the `latitude`/`longitude` and other columns already exist.
> This is code-only: a display cap, a missing field in one payload, and the demo seed
> + page load not geocoding.

There are **three** distinct faults. Fix all three.

---

## Fault 1 — "Site scores" capped at 8

`client/src/pages/EnterpriseCompliance.tsx` ~line 946:

```tsx
{(summary?.siteScores ?? []).slice(0, 8).map((ss) => (
```

The `.slice(0, 8)` throws away every site after the 8th. A 13-site estate shows 8.

**Fix:** remove the `.slice(0, 8)` and render **all** sites. To keep the layout tidy
with many sites, wrap the `grid grid-cols-2` in a scrollable container, e.g.:

```tsx
<div className="max-h-72 overflow-y-auto pr-1">
  <div className="grid grid-cols-2 gap-2">
    {(summary?.siteScores ?? []).map((ss) => ( ... ))}
  </div>
</div>
```

Sort the list worst-score-first so problem sites are visible without scrolling.

---

## Fault 2 — Site scores show no name (blank labels)

The button renders `ss.siteName` (~line 952), but the summary endpoint never returns a
name. In `server/routes/enterpriseCompliance.ts`, the `GET /api/enterprise/compliance/summary`
payload (~line 134) is:

```ts
siteScores: siteScores.map(s => ({ siteId: s.siteId, score: s.score })),
```

**Fix (server):** there's already a `loadSiteNames(custDb, siteIds)` helper (line 47).
Use it to attach names:

```ts
const names = await loadSiteNames(custDb, siteScores.map(s => s.siteId));
// ...
siteScores: siteScores
  .map(s => ({ siteId: s.siteId, siteName: names.get(s.siteId) ?? 'Unnamed site', score: s.score }))
  .sort((a, b) => a.score - b.score),   // worst first
```

**Fix (client):** add `siteName: string` to the `siteScores` type in the
`SummaryResponse`/summary interface (~line 74) so `ss.siteName` is typed.

---

## Fault 3 — Estate Map doesn't auto-plot sites (only manually-saved ones appear)

Coordinates are only filled when a site is saved via POST/PATCH or when someone clicks
**Re-plot**. The demo-data seed inserts sites **without** coordinates, so a freshly
seeded estate is almost empty on the map. Two fixes — do both:

### 3a. Geocode demo sites when the demo data is seeded
In `server/routes/enterpriseDemoRoutes.ts`, the site insert (~line 177) writes
`(id, name, reference, address, postcode, region, area_id, status, is_default, is_demo)`
with no lat/lng. After the demo sites are inserted, geocode them:

- `import { geocodePostcodesBulk } from '../geocodeService';`
- Collect the inserted demo sites' `{ id, postcode }`, call `geocodePostcodesBulk`,
  and `UPDATE` each site's `latitude`/`longitude` where a result came back.
- Best-effort: a geocode failure must not fail the demo seed.

So loading the demo estate plots every site immediately — no manual step.

### 3b. Auto-plot on the Compliance Overview (so nobody has to click Re-plot)
In `client/src/pages/EnterpriseCompliance.tsx`, when `geoSites` has loaded and there is
at least one site with a `postcode` but no `latitude`/`longitude`, automatically POST
`/api/enterprise/sites/geocode-missing` once, then invalidate the
`["/api/enterprise/sites"]` query so the new pins appear. Guard it:

- Fire **once per mount** (a `useRef` flag), not on every render — no loops.
- Only when there are unplotted-but-postcoded sites, and only refetch if `updated > 0`.
- The `geocode-missing` route is `enterprise_admin`-only — so only auto-fire (and only
  show the manual **Re-plot** button) when the current user is an enterprise admin;
  for other roles, fail silently (no error toast on load).

Keep the manual **Re-plot** button as the fallback, and keep the "Not yet plotted" list
for postcodes that genuinely don't geocode.

---

## Acceptance test
1. On a multi-site customer, **Load demo data** → every demo site appears as a pin on
   the Estate Map straight away (no Re-plot click needed).
2. "Site scores" lists **all** sites (e.g. all 13), each with its **name** and score,
   worst-first, scrollable.
3. Add a site with an English postcode (e.g. M1 1AE) → it plots in Manchester.
4. A site with no postcode still appears only in "Not yet plotted", not on the map.
5. Log in as a non-admin enterprise role → the page loads with no error toast (no
   failed geocode call), site scores still list all in-scope sites.
6. `npm run test:site-isolation-routes` still passes.

---

## What I'd like you (Andy) to confirm after applying
- Click **Load demo data** on a test enterprise customer and tell me how many pins
  appear vs how many sites exist — they should match (minus any with no postcode).
- If any site still won't plot, paste its postcode so I can check it geocodes.
