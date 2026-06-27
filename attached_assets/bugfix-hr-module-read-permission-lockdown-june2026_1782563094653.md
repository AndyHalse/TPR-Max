# Bugfix — HR Module: lock down READ access to sensitive personal data (GDPR)

**Date:** 27 June 2026
**Module:** HR
**Risk:** 🔴 High — UK GDPR exposure (criminal-offence + special-category health data)
**Database migration needed:** ❌ No `npm run db:push` — this is middleware + client-gating only. No new tables or columns.

---

## The problem in one paragraph

The June fix correctly locked down **changing** HR records (create / edit / delete now require an admin or HR-admin role). But it never locked down **viewing** them. Right now **any logged-in user in the customer's account** — a receptionist, a general staff login, anyone — can read a colleague's DBS criminal-record check, Right to Work status, sickness/absence history, training records, appraisals and HR documents straight from the API. Under UK GDPR, DBS data is criminal-offence data (Article 10) and sickness is special-category health data — both need tight access control. This is a real data-protection hole, even though it isn't visible on screen.

There's a second, linked problem: the HR pages show every tile to every user with **no role check in the front-end**. So once we lock the back-end, a non-admin who clicks an HR tile would hit a "restricted" error or a blank screen. We fix both halves together so the experience stays clean.

---

## Part 1 — Back-end: add the role check to the READ routes (the core fix)

The pattern already exists in the codebase. Writes already use `requireHrAdmin` (in `server/routes/hrMiddleware.ts`), which allows roles `admin` and `hr_admin`. `hrDbs.ts` has its own equivalent `requireAdminRole` helper. **Apply the same guard to the read (GET) routes below** — slot it in immediately after `requireAuth` (and after `requireHrFeature` where that's already present), exactly like the write routes in the same file.

### `server/routes/hrDbs.ts` — use the existing local `requireAdminRole`
- `GET /api/staff/:staffId/dbs` (~line 25)
- `GET /api/staff/:staffId/dbs-required` (~line 110)
- `GET /api/dbs/expiry-alerts` (~line 219)
- `GET /api/staff/:staffId/notes` (~line 246)

> Also delete the misleading comment on line 24 ("available to all authenticated users (no HR feature gate)") — it's no longer true once gated.

### `server/routes/hrAbsence.ts` — add `requireHrAdmin`
- `GET /api/staff/:staffId/absences` (~line 18)
- `GET /api/absences/overview` (~line 139)

### `server/routes/hrRightToWork.ts` — add `requireHrAdmin`
- `GET /api/staff/:staffId/right-to-work` (~line 18)
- `GET /api/right-to-work/expiring` (~line 81)
- `GET /api/right-to-work/status/:staffId` (~line 101)

### `server/routes/hrTraining.ts` — add `requireHrAdmin`
- `GET /api/staff/:staffId/training` (~line 28)
- `GET /api/training/matrix` (~line 108)
- `GET /api/training/expiring` (~line 142)
- `GET /api/training/requirements` (~line 163)

### `server/routes/hrDocuments.ts` — add `requireHrAdmin`
- `GET /api/staff/:staffId/documents` (~line 17)
- `GET /api/staff/:staffId/documents/:id/download` (~line 79)

### `server/routes/hrAppraisals.ts` — add `requireHrAdmin`
- `GET /api/staff/:staffId/appraisals` (~line 17)
- `GET /api/appraisals/due` (~line 135)

### `server/routes/hrLeaver.ts` — add `requireHrAdmin`
- `GET /api/staff/:staffId/leaver` (~line 198)
- `GET /api/hr/leavers` (~line 524)

### `server/routes/hrLeave.ts` — add `requireHrAdmin`
- `GET /api/staff/:staffId/leave` (~line 19)
- `GET /api/leave/overlap-check` (~line 268) — this returns the names of other staff who are off, so it's personal data.
- **Leave alone** (these are non-sensitive calculation/lookup helpers): `GET /api/leave/bank-holidays` (~293) and `GET /api/leave/working-days` (~298). Do **not** gate these.

### `server/routes/hrDashboard.ts` — add `requireHrAdmin`
- `GET /api/hr/dashboard` (~line 27) — it returns staff names, who's on leave today, birthdays and counts, so it should be HR-admin only now the whole module is admin-only.

### Judgement call — leave the org chart as-is
`server/routes/hrStaff.ts` org-chart routes (`/api/staff/org-chart`, `/api/staff/org-chart/validation`) show reporting structure, not sensitive personal data, and may be used elsewhere. **Don't gate these** unless you find they leak something sensitive.

---

## ⚠️ Important watch-out — test the `manager` role after this change

`requireHrAdmin` allows only `admin` and `hr_admin`. The Compliance Dashboard is open to `admin`, `manager` and `hr_admin` (see `Layout.tsx:311`). **Before deploying, log in as a `manager` and check the Compliance Dashboard and the Staff page still work.** If a legitimate manager view breaks because it was reading one of these HR endpoints (most likely a Right to Work or DBS *status* check used for site compliance), then for that **specific** endpoint only, widen the guard to also allow `manager` — but **never** widen the DBS-record, absence/sickness, documents or appraisals reads, as those are exactly the data GDPR wants kept tight.

---

## Part 2 — Front-end: hide HR from people who can't use it

So non-admins never hit a wall.

### `client/src/components/Layout.tsx` — gate the HR menu item to HR roles
There's already a working example for this on line ~309 (Compliance Dashboard restricted to specific roles). Add the same kind of guard for the HR menu item (path `/hr`), restricting it to `['admin', 'hr_admin']`:

```ts
// HR module is restricted to admin / hr_admin
if (item.path === '/hr') {
  const allowedRoles = ['admin', 'hr_admin'];
  if (!user?.role || !allowedRoles.includes(user.role)) return false;
}
```

### `client/src/pages/hr/HrHub.tsx` — defence-in-depth role guard
The page already returns an early "upgrade" screen when `featureHrModule === false`. Add a similar early return for users who aren't `admin`/`hr_admin`, showing a short "This area is restricted to HR administrators" message (reuse the existing `Lock` icon block already in the file). This protects anyone who reaches the URL directly.

### `client/src/pages/hr/StaffProfile.tsx` — hide the HR tab for non-admins
This page has an **HR tab** that calls the now-gated endpoints. For a non-`admin`/`hr_admin` user, hide that tab (and its content) so they don't see 403 errors. If the rest of the staff profile is used by non-HR roles, only the HR tab needs hiding — leave the basic profile visible.

---

## Part 3 — Two small bonuses while you're in here (optional, low effort)

1. **`client/src/pages/hr/HrHub.tsx` (~line 417)** — the "Today" date uses `.toLocaleDateString(undefined, …)`, so on a non-UK browser it shows the American format. Pin it to `'en-GB'`:
   `.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })`
2. **`client/src/pages/hr/HrHub.tsx`** — the "On site right now" card has no hover tooltip while the others do. Add an entry to `CARD_TOOLTIPS` keyed `"On site right now"`, e.g. *"Staff currently checked in on site with no check-out yet."* (Note the card label is "On site right now" — match it exactly.)

---

## Acceptance check (please confirm after applying)

- As a **non-admin** user: the HR menu item is gone; visiting `/hr` directly shows the restricted message; the HR tab on a staff profile is hidden; and calling any of the gated GET endpoints directly returns **403**, not data.
- As an **admin** and as an **hr_admin**: everything in HR works exactly as before — no new 403s.
- As a **manager**: the Compliance Dashboard and Staff page still load (see the watch-out above).
- No `npm run db:push` was run (none needed).
</content>
</invoke>
