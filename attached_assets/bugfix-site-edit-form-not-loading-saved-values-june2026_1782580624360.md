# Bugfix — Edit Site form opens blank (doesn't load the saved site details)

**Module:** Enterprise → Sites (`client/src/pages/EnterpriseSites.tsx`)
**Symptom:** After saving a site's address/contact/property details, reopening **Edit**
shows empty fields (placeholders), as if nothing was saved. The data *is* saved
correctly — the site card shows the address — but the Edit form never displays it.

> No `npm run db:push`. Front-end only. No schema, route, or API change.

## Root cause

`<SiteFormDialog>` is rendered **once and kept permanently mounted** — `open={showForm}`
only toggles its visibility (around line 1789):

```tsx
<SiteFormDialog
  open={showForm}
  onOpenChange={setShowForm}
  site={editingSite}
  areas={areas}
  onSaved={() => setEditingSite(null)}
/>
```

Inside `SiteFormDialog`, every field is initialised with
`useState(site?.field ?? "")` (lines ~1139–1163). React only reads a `useState`
initial value **once, on first mount**. The page first renders with no site selected
(`editingSite = null`), so all fields initialise blank. Later clicking **Edit** changes
the `site` prop, but the `useState` initialisers never run again — so the form stays
blank. (This affects every field, old and new — name, address, postcode, contact, etc.)

## Fix — remount the dialog per site

Add a `key` to `<SiteFormDialog>` so React gives a **fresh component instance** (and
therefore re-runs the `useState` initialisers from the current `site`) whenever you
switch between Add and Edit, or between different sites. Also clear `editingSite` when
the dialog closes, so reopening always re-triggers a clean mount:

```tsx
<SiteFormDialog
  key={editingSite?.id ?? 'new'}
  open={showForm}
  onOpenChange={(v) => { setShowForm(v); if (!v) setEditingSite(null); }}
  site={editingSite}
  areas={areas}
  onSaved={() => setEditingSite(null)}
/>
```

That's the whole fix. Do **not** change `SiteFormDialog`'s internals — the field
bindings (`value={address}` etc.) and the save mutation are already correct; they were
just never re-seeded from the saved site.

> Equivalent alternative if you prefer: instead of the `key`, add inside
> `SiteFormDialog` a `useEffect(() => { /* setName(site?.name ?? "") … for every field */ },
> [site])` that resets all state when `site` changes. The `key` approach is simpler and
> covers it in one line — prefer it unless there's a reason not to.

## Acceptance test
1. Edit a site, fill Address line 1/2, Town/City, County, Postcode, the on-site
   contact and property fields, save.
2. Reopen **Edit** on that same site → **every field shows the saved value**, not a
   placeholder.
3. Click **Edit** on a *different* site → the form shows *that* site's values (no
   bleed-through from the previous one).
4. Click **Add Site** → the form opens blank (all fields empty, status "Active").
5. The postcode you saved still drives the Estate Map pin as before.
