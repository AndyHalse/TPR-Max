# Replit Prompt — Watchlist (Denied Persons List)

## What This Does

Adds a watchlist to TPR — a list of individuals who should never be admitted to site. When a visitor or contractor tries to sign in (at the kiosk or via manual check-in), their name is checked against the watchlist. If there's a match, the system flags it and alerts the site admin immediately.

This is standard in Envoy, Proxyclick, and Sine. It's a basic security feature that buyers in education, healthcare, and high-security manufacturing will expect to see.

Feature flag: `featureWatchlist` (default: `true` — available on all plans).

---

## Files to Create

- `server/routes/watchlist.ts`
- `client/src/pages/settings/WatchlistSettings.tsx`

## Files to Change

- `server/isolatedSchema.ts` — add `watchlistEntries` table
- `server/customerDatabase.ts` — add `ALTER TABLE` migration for new table
- `server/routes/visitors.ts` — add watchlist check on sign-in
- `server/routes/contractors.ts` — add watchlist check on sign-in
- `server/routes/contractorKiosk.ts` — add watchlist check at kiosk
- `client/src/pages/Settings.tsx` — add Watchlist link in nav
- `client/src/App.tsx` — add route

---

## 1. Database — `server/isolatedSchema.ts`

Add the `watchlistEntries` table definition:

```typescript
export const watchlistEntries = pgTable('watchlist_entries', {
  id: serial('id').primaryKey(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  dateOfBirth: text('date_of_birth'),           // optional — improves match accuracy
  reason: text('reason').notNull(),              // why this person is banned
  addedBy: text('added_by').notNull(),           // admin username who added the entry
  addedAt: timestamp('added_at').defaultNow(),
  active: boolean('active').default(true),
  notes: text('notes'),
  photoUrl: text('photo_url'),                   // optional uploaded photo
});
```

## 2. Database Migration — `server/customerDatabase.ts`

In the `ensureSchema` block, add:

```typescript
await pool.query(`
  CREATE TABLE IF NOT EXISTS "${schemaName}".watchlist_entries (
    id SERIAL PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    date_of_birth TEXT,
    reason TEXT NOT NULL,
    added_by TEXT NOT NULL,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    active BOOLEAN DEFAULT true,
    notes TEXT,
    photo_url TEXT
  )
`);
```

---

## 3. Backend Routes — `server/routes/watchlist.ts`

Create a new route file registered on `/api/watchlist`.

### GET /api/watchlist
Returns all active watchlist entries for the customer. Admin only.

### POST /api/watchlist
Creates a new entry. Required body: `firstName`, `lastName`, `reason`. Optional: `dateOfBirth`, `notes`, `photoUrl`. Sets `addedBy` from `req.user.name`.

### PUT /api/watchlist/:id
Updates an existing entry (reason, notes, active status).

### DELETE /api/watchlist/:id
Soft delete — sets `active = false`. Never hard delete.

### POST /api/watchlist/check (internal helper — no auth required but only callable server-side)
Accepts `{ firstName, lastName, dateOfBirth? }` and returns `{ matched: boolean, entry?: WatchlistEntry }`.

**Matching logic:**
- Normalise both sides: lowercase, trim whitespace.
- Match if `firstName` AND `lastName` both match exactly (case-insensitive).
- If `dateOfBirth` is provided on both sides, also require DOB match (reduces false positives).
- If no DOB on the entry, name match alone is sufficient to flag.

---

## 4. Watchlist Check Helper

Create a shared utility function `checkWatchlist(pool, schemaName, firstName, lastName, dob?)` in `server/utils/watchlistCheck.ts`:

```typescript
export async function checkWatchlist(
  pool: Pool,
  schemaName: string,
  firstName: string,
  lastName: string,
  dob?: string
): Promise<{ matched: boolean; entry?: any }> {
  const result = await pool.query(
    `SELECT * FROM "${schemaName}".watchlist_entries
     WHERE active = true
     AND LOWER(TRIM(first_name)) = LOWER(TRIM($1))
     AND LOWER(TRIM(last_name)) = LOWER(TRIM($2))`,
    [firstName, lastName]
  );
  if (result.rows.length === 0) return { matched: false };
  // If DOB provided on entry, require it to match
  const entry = result.rows.find(e => !e.date_of_birth || !dob || e.date_of_birth === dob);
  if (!entry) return { matched: false };
  return { matched: true, entry };
}
```

---

## 5. Alert Email on Watchlist Match

When a match is found at sign-in, immediately send an alert email to the site admin:

**Subject:** `⚠️ Watchlist Alert — [First Name] [Last Name] attempted to sign in`

**Body:**
- Name of the person who attempted sign-in
- Date and time
- Reason they are on the watchlist
- Whether entry was denied or flagged (see below)
- Link to the watchlist settings page

Use the existing `sendEmail` utility, following the pattern from `sendGoodSpotNotification()` in `hsIncidents.ts`.

---

## 6. Integrate Check into Sign-In Flows

In `server/routes/visitors.ts`, in the visitor check-in POST handler, before confirming sign-in:

```typescript
const watchlistResult = await checkWatchlist(pool, schemaName, body.firstName, body.lastName, body.dateOfBirth);
if (watchlistResult.matched) {
  // Send alert email to admin
  await sendWatchlistAlert(pool, schemaName, body.firstName, body.lastName, watchlistResult.entry);
  // Return a flagged response — do NOT silently block (receptionist must make the final call)
  return res.status(200).json({
    watchlistMatch: true,
    watchlistReason: watchlistResult.entry.reason,
    message: 'This person is on the site watchlist. Please check with your manager before allowing entry.'
  });
}
```

**Important:** do not auto-deny. Return a `watchlistMatch: true` flag so the frontend can display a clear warning and prompt the receptionist to check with a manager. The final decision is human. Log the attempt regardless.

Apply the same pattern in `server/routes/contractors.ts` check-in and `server/routes/contractorKiosk.ts`.

---

## 7. Frontend — Kiosk and Manual Check-In

When the API returns `watchlistMatch: true`:
- Show a prominent red alert panel on screen.
- Display: "This person appears on the site watchlist. Please do not admit them without manager approval."
- Show the reason (if provided in the response).
- Do not show the normal "signed in successfully" message.
- On the kiosk, the alert should be clearly visible but not shout the reason at the person — the message should be neutral enough to show on screen ("Entry cannot be completed. Please speak to the site manager.") while the admin alert email contains the full detail.

---

## 8. Settings Page — `client/src/pages/settings/WatchlistSettings.tsx`

Admin-only settings page at `/settings/watchlist`.

**Displays:**
- List of all watchlist entries (active and inactive) with name, reason, date added, added by.
- Toggle to activate/deactivate entries.
- "Add to watchlist" button — form with firstName, lastName, dateOfBirth (optional), reason (required), notes (optional).
- Edit button on each entry.

**UI note:** Keep the tone factual and professional. This is a security tool, not a "banned persons" list in tone.

---

## 9. Feature Flag

Add to `server/isolatedSchema.ts` company_settings:
```typescript
featureWatchlist: boolean('feature_watchlist').default(true),
```

Add `ALTER TABLE` migration in `server/customerDatabase.ts`:
```typescript
await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS feature_watchlist BOOLEAN DEFAULT true`);
```

Create `requireWatchlistFeature` middleware following the pattern in `raBuilder.ts`.

---

## Done When

- [ ] `watchlist_entries` table created in migration and Drizzle schema
- [ ] CRUD routes working for watchlist admin management
- [ ] `checkWatchlist()` utility correctly matches on normalised name (case-insensitive)
- [ ] DOB match used when available to reduce false positives
- [ ] Visitor check-in returns `watchlistMatch: true` when match found
- [ ] Contractor check-in (manual and kiosk) checks watchlist
- [ ] Admin alert email sent immediately on match
- [ ] Kiosk shows neutral "speak to manager" message — does not show reason to the individual
- [ ] Settings page lists, adds, edits, and deactivates entries
- [ ] Soft delete only — no hard deletes
- [ ] `featureWatchlist` flag defaults to `true`
- [ ] `npm run check` passes with no new errors

---

*Prompt written: June 2026*
