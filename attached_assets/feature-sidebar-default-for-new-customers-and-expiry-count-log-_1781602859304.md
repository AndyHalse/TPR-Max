# BR-017 — Make Sidebar the default layout for new customers (+ fix noisy expiry-count log)

**Reported by:** Andy Halse · 16 Jun 2026 · App v2026.06.16-3a013216 · Customer: CPI Books · Page: /settings

## What Andy wants
1. **Every brand-new customer account should start with the Sidebar layout switched on** (instead of Classic).
2. **Leave all existing customers exactly as they are** — they're demo accounts. Do NOT touch any layout choice already stored.
3. A console error was reported on the settings page — investigate and tidy it up.

---

## Part 1 — Sidebar as the default for new customers (the main fix)

### Root cause
There's a contradiction in the code:
- The front end already *treats* a missing layout choice as Sidebar — `client/src/components/Layout.tsx` line ~56:
  `const navStyle = (user?.navStyle === "classic") ? "classic" : "sidebar";`
- But the database column actually defaults to **`"classic"`** — `server/isolatedSchema.ts` line ~309:
  `navStyle: text("nav_style").default("classic"),`
- And new customer admin accounts are created **without** a `navStyle` value — `server/customerOnboardingService.ts` around line 283 (`adminUserData`), so they fall back to that `"classic"` column default.

Net effect: new customers get **Classic**, the opposite of what Andy wants.

### Changes

**1a. Change the column default to `"sidebar"`**
In `server/isolatedSchema.ts` (~line 309):
```ts
// before
navStyle: text("nav_style").default("classic"),
// after
navStyle: text("nav_style").default("sidebar"),
```

**1b. Set it explicitly when a new customer's admin user is created**
In `server/customerOnboardingService.ts`, in `setupCustomerInfrastructure` where `adminUserData` is built (~line 283), add `navStyle`:
```ts
const adminUserData = {
  username: request.adminUsername,
  email: request.adminEmail,
  firstName: request.adminFirstName,
  lastName: request.adminLastName,
  role: 'admin' as const,
  password: hashedPassword,
  isActive: true,
  navStyle: 'sidebar' as const,   // BR-017: new customers default to sidebar
};
```
(Belt-and-braces: this guarantees Sidebar even if a per-tenant DB hasn't picked up the new column default yet.)

**1c. Apply the schema change**
Run `npm run db:push` so the new column default takes effect for newly-provisioned customer databases.

### Critical — protect existing customers (Andy's point 2)
- Do **NOT** write any migration or script that updates or backfills `nav_style` on existing rows.
- Changing a column default only affects **future inserts** — existing users keep whatever they already have. That is exactly the behaviour we want. Leave them alone.

### How to verify
- Onboard a brand-new test customer → log in as its admin → confirm it opens in **Sidebar** layout with no manual change.
- Confirm an existing demo customer's layout is **unchanged** after the deploy.
- Confirm the Settings → Preferences toggle still lets a user switch to Classic and back, and that the choice persists.

---

## Part 2 — Tidy the `/api/ppm/expiry-count` console error

### What was in the report
```
[NETWORK] FETCH_ERR GET /api/ppm/expiry-count — Failed to fetch
[ERROR] Query failed: {}
```

### Assessment
- The endpoint (`server/routes/ppm.ts` ~line 355) is healthy. `Failed to fetch` is a **browser-level network blip** — this is a nav badge that polls every 30s (`client/src/components/Layout.tsx` ~line 69, `refetchInterval: 30 * 1000`). One poll didn't complete (transient — server restart or page navigation). It is **not** breaking the settings page.
- The real flaw is the **useless log**: `Query failed: {}` logs an empty object, so it tells us nothing. This is a low-priority polished-diagnostics fix, not an emergency.

### Changes (low priority — only if quick)
1. **Log the actual error** instead of an empty object. Find the `Query failed` log (global query error handler / `queryClient` `onError`, or wherever this is emitted) and serialise the real message, e.g.:
   ```ts
   console.error('Query failed:', error instanceof Error ? error.message : String(error), { url: queryKey?.[0] });
   ```
2. **Make this badge fail quietly.** It's non-critical decoration. On the `useQuery` for `/api/ppm/expiry-count` in `Layout.tsx`, consider `retry: 1` (or `false`) and ensure a failed poll never surfaces a visible error to the user — the badge should just show its last good value or nothing.

### How to verify
- Trigger a failed request (e.g. briefly stop the server) and confirm the console now logs a real, readable error message rather than `{}`.
- Confirm the expiry badge never shows an error state to the user when a poll fails.

---

## Summary
- **Must do:** Part 1 (1a, 1b, 1c) — flip new-customer default to Sidebar. **Do not backfill existing customers.**
- **Nice to have:** Part 2 — make the failing-poll log readable and silent. Not urgent.
