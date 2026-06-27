# Feature — Rich Site profiles + Estate Map driven by real UK postcode geocoding

**Module:** Enterprise → Sites, Site detail drill-in, and Compliance Overview (Estate Map)
**Goal:** Two joined-up things:
1. Let each **Site** hold a full property profile (structured UK address, on-site
   contact, property details, what3words/map link) — not just a name + one address line.
2. Make the **Estate Map** plot every site accurately anywhere in the UK from its
   **postcode** (geocoded), replacing today's hand-drawn Scotland outline that guesses
   a pin from town-name keywords and shows nothing for sites outside Scotland.

> ⚠️ **Requires `npm run db:push`** — adds columns to the `sites` table.
> Nothing is deleted. The existing `address`, `postcode`, `region` columns are kept
> and reused. Single-site (non-enterprise) customers are unaffected — every new
> column is nullable with no default, and the map only renders in the enterprise UI.

---

## Background (so you don't re-investigate)

- Sites live in the per-customer isolated DB: `server/isolatedSchema.ts` →
  `export const sites` — today has `name`, `reference`, `address`, `postcode`,
  `region`, `areaId`, `status`. **No structured address, no contact, no lat/lng.**
- Create/edit routes: `POST` and `PATCH /api/enterprise/sites/:id` in
  `server/routes/enterpriseSites.ts` (both `enterprise_admin`-only). Validation via
  `createSiteSchema` (~line 161) and `updateSiteSchema` (~line 290).
- The Add/Edit form is `SiteFormDialog` in `client/src/pages/EnterpriseSites.tsx`
  (~line 1117). The site **card** renders the MapPin address line ~962.
- The site **drill-in** is `client/src/pages/EnterpriseSiteDetail.tsx` (header
  shows address/postcode/region ~337; below it are Category Scores + reports).
- The map is `ScotlandEstateMap` in `client/src/pages/EnterpriseCompliance.tsx`
  (~lines 213–402). `getSiteMapCoords(name, region)` text-matches name+region against
  a hardcoded ~30-item Scottish-place dictionary and **ignores the address and
  postcode entirely** — which is why 3 London test sites currently plot zero pins.
- The map's data comes from `GET /api/enterprise/sites` (a full-row `.select()`),
  so any new column on `sites` is automatically returned to the client.

---

## 1. Schema — extend the `sites` table

In `server/isolatedSchema.ts`, add to the `sites` table (all nullable, no default).
**Keep** the existing `address` (now used as "Address line 1"), `postcode`, `region`.

```ts
// Structured address (address = line 1, kept above)
addressLine2:      text("address_line2"),
city:              text("city"),
county:            text("county"),
// Map coordinates (derived from postcode — see §3)
latitude:          doublePrecision("latitude"),
longitude:         doublePrecision("longitude"),
// On-site contact
siteContactName:   text("site_contact_name"),
siteContactRole:   text("site_contact_role"),
siteContactPhone:  text("site_contact_phone"),
siteContactEmail:  text("site_contact_email"),
accessNotes:       text("access_notes"),      // access / opening-hours notes
// Property profile
propertyType:      text("property_type"),     // office|retail|industrial|warehouse|mixed_use|residential|other
clientName:        text("client_name"),       // client / landlord
managingSurveyor:  text("managing_surveyor"),
floorArea:         text("floor_area"),         // free text, e.g. "12,000 sq ft"
unitCount:         integer("unit_count"),
// Wayfinding
what3words:        text("what3words"),
mapLink:           text("map_link"),           // e.g. a Google Maps URL
```

(`doublePrecision` and `integer` are already imported/used in this file.)
Then run `npm run db:push`.

---

## 2. Server — accept the new fields (create + update)

Extend **both** `createSiteSchema` and `updateSiteSchema` in
`server/routes/enterpriseSites.ts` with the new fields, all `.optional().nullable()`:

- Strings with sane max lengths (e.g. name/role ≤ 200, notes ≤ 1000, what3words ≤ 60,
  mapLink ≤ 500).
- `siteContactEmail`: `z.string().email().max(255)` (optional/nullable).
- `propertyType`: `z.enum([...]).optional().nullable()` using the list above.
- `unitCount`: `z.number().int().nonnegative().optional().nullable()`.
- **Do not** accept `latitude`/`longitude` from the client — they are server-derived
  (see §3).

Persist them in the existing insert (POST) and `.update().set(...)` (PATCH) calls.

---

## 3. Server — geocode the postcode to map coordinates

Create `server/geocodeService.ts` using **postcodes.io** (free, no API key, UK,
precise lat/lng):

- `geocodePostcode(postcode)` → `GET https://api.postcodes.io/postcodes/{encoded}`;
  return `{ lat: result.latitude, lng: result.longitude }` or `null` on 404 / error /
  non-200 (never throw). Normalise (trim, uppercase, single spaces). 5s timeout.
- `geocodePostcodesBulk(postcodes[])` → `POST https://api.postcodes.io/postcodes`
  `{ postcodes }` (chunk in 100s). Returns `postcode → {lat,lng} | null`.

Wire in:
- **POST (create):** if `postcode` present, `await geocodePostcode(...)` and set
  `latitude`/`longitude` (or both `null`). Wrap in try/catch — **a geocode failure
  must never fail the save.**
- **PATCH (update):** if `postcode` is in the body, re-geocode and update lat/lng
  (both `null` if postcode cleared or lookup fails), in the same write.

---

## 4. Server — one-off backfill for existing sites

Add `POST /api/enterprise/sites/geocode-missing` — `requireAuth` +
`requireEnterpriseRole('enterprise_admin')`. Selects sites in the caller's customer DB
where `postcode IS NOT NULL` AND (`latitude IS NULL` OR `longitude IS NULL`),
geocodes via `geocodePostcodesBulk`, writes coords back, returns
`{ updated, skipped }`. Use the same `customerDbService.getCustomerDatabase(customerId)`
pattern — **no new cross-site query.**

---

## 5. Client — richer Add/Edit Site form

In `SiteFormDialog` (`EnterpriseSites.tsx`), add state + inputs for all the new fields,
organised into clear sections with small headings (the dialog already scrolls —
`max-h-[90vh] overflow-y-auto`):

1. **Site details** (existing): Name, Reference, Status, Area.
2. **Address** — relabel the existing address input **"Address line 1"**; add
   **Address line 2**, **Town/City**, **County**, **Postcode** (keep Region).
   Add a one-line helper under Postcode: *"The postcode places this site on the
   Estate Map — please fill it in."*
3. **On-site contact** — Contact name, Role, Phone, Email, Access / opening-hours notes.
4. **Property** — Property type (a `Select` with the enum options, nicely labelled:
   Office, Retail, Industrial, Warehouse, Mixed-use, Residential, Other), Client /
   landlord, Managing surveyor, Floor area, Number of units.
5. **Wayfinding** — what3words, Map link.

Send all fields in the existing `mutation.mutate({...})` payload (trim strings;
empty → `null`; `unitCount` parsed to a number or `null`). Keep the existing
create-only "site administrator" section as-is.

---

## 6. Client — show it all on the Site drill-in

In `EnterpriseSiteDetail.tsx`, add a **"Site details"** panel (a card, same style as
Category Scores) that renders the full profile when present:

- Full structured address block (line 1, line 2, town/city, county, postcode, region).
- On-site contact (name + role, phone as a `tel:` link, email as a `mailto:` link,
  access/opening-hours notes).
- Property profile (type as a small badge, client/landlord, managing surveyor,
  floor area, unit count).
- Wayfinding (what3words shown as `///word.word.word`; Map link as an "Open in maps"
  external link if set, otherwise fall back to a Google Maps search link built from
  the postcode).
- Only render rows that have a value; if the whole profile is empty, show a muted
  *"No site details added yet — use Edit on the Sites page."*

On the Sites **card** (`EnterpriseSites.tsx` ~962), keep it concise: alongside the
existing MapPin address line, show the **property type** as a small badge and the
**town/city** if set. Don't cram the rest onto the card — that's what the drill-in is for.

---

## 7. Client — a real UK map

Replace `ScotlandEstateMap` (and delete the dead `SCOTLAND_OUTLINE`,
`MAP_REGION_COORDS`, `getSiteMapCoords`) in `EnterpriseCompliance.tsx` with a real
interactive GB map using **react-leaflet** + **leaflet** (OpenStreetMap tiles — free,
no key):

- Add `react-leaflet` + `leaflet` to `package.json`; import `leaflet/dist/leaflet.css`.
- Extend the `GeoSite` interface with `latitude: number | null; longitude: number | null`.
- Plot a coloured circle marker for every site that has both `latitude` and
  `longitude`. Reuse `mapPinColor(score)` (≥90 green, ≥70 amber, ≥50 orange, <50 red)
  and keep the legend. Hover/click shows the site name + score; click calls the
  existing `onPinClick(siteId)` to deep-link to the site detail.
- Auto-fit map bounds to the plotted markers.
- **Below the map**, list any sites with a postcode but no coords yet, and any with
  no postcode, under *"Not yet plotted — add a postcode and re-plot."*
- **Empty/error state (crash-safe):** if no sites have coords, show
  *"Add a postcode to your sites to plot them on the map."* plus a **"Re-plot estate"**
  button that calls `POST /api/enterprise/sites/geocode-missing`, invalidates the
  `/api/enterprise/sites` query, and toasts how many were plotted.
- en-GB throughout. No glassmorphism.

> Alternative if you'd rather not add a map dependency: render a GB SVG outline and
> project with `x = (lng + 8.2) / 10.0 * W`, `y = (60.9 − lat) / 11.4 * H` (GB bbox
> lat 49.5–60.9, lng −8.2→1.8). The data layer is identical; only rendering differs.
> **Default to react-leaflet unless told otherwise.**

---

## 8. Acceptance test (use Cowiesburn data)

1. `npm run db:push`, then create/edit two sites with full profiles:
   - *Cowiesburn — Edinburgh*: 22 Walker Street, Edinburgh, **EH3 7HR**;
     phone 0131 337 5134; email info@cowiesburn.co.uk; property type Office.
   - *Cowiesburn — Glasgow*: 134-138 West Regent Street, Glasgow, **G2 2RQ**;
     phone 0141 319 7115.
   Both save with `latitude`/`longitude` populated (Edinburgh ≈ 55.95,−3.21;
   Glasgow ≈ 55.86,−4.26).
2. The drill-in for each site shows the full address, contact (clickable phone/email),
   property type and any other fields entered.
3. Estate Map shows two pins in the right places, coloured by score; clicking a pin
   opens that site.
4. A site with **no** postcode appears in *"Not yet plotted"*, not on the map.
5. Add an English postcode (e.g. **M1 1AE**, Manchester) → its pin lands in
   Manchester, proving it's no longer Scotland-only.
6. Click **"Re-plot estate"** on a customer with pre-existing sites → pins appear
   without editing each site by hand.
7. `npm run test:site-isolation-routes` still passes (sites are customer-level;
   nothing here adds a cross-site read/write).

---

## Out of scope (don't do)
- No change to login, roles, or the site-scoping engine.
- Don't trust client-supplied coordinates — always derive from postcode server-side.
- Don't block a site save on a geocode failure.
