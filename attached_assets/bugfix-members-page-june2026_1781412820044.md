# Fix — Members page: deleted-while-on-site members become muster ghosts + no input validation (verified against live codebase 14 June 2026)

## The problem (read this first)

Two bugs in the Members module. The first one matters for emergency accountability, so it's the priority.

### Bug 1 — Deleting a checked-in member leaves a permanent ghost on the evacuation roll-call (HIGH)

When you delete a member, the system doesn't really delete them — it does a "soft delete" and just sets `isActive = false` (so they drop off the Members list). That's fine on its own.

The problem: **it never checks the member out.** So if you delete someone who is currently checked in (on site), their `isCheckedIn` flag stays `true`.

Now look at how the emergency muster and roll-call find members. Every one of these queries filters on `isCheckedIn = true` and **none of them filter on `isActive`**:

- `server/routes/emergency.ts:154` — checked-in members count
- `server/routes/emergency.ts:410` — checked-in members for muster
- `server/routes/emergency.ts:3284` — zone roll-call (unaccounted members in a zone)
- `server/routes/emergency.ts:4133` — checked-in members
- `server/routes/emergency.ts:5745` — checked-in members

Result: a member who was deleted while on site disappears from the Members page (so an admin can no longer see them or check them out) but **stays on the emergency muster forever as on-site and never accountable.** During a real evacuation a fire marshal would be chasing a person who can't be cleared. For an "instant emergency accountability" product this is the worst place to have a phantom record.

### Bug 2 — Create/update member writes raw request body straight to the database (MEDIUM)

`POST /api/members` (`server/routes/emergency.ts:4988`) and `PATCH /api/members/:id` (`server/routes/emergency.ts:5012`) both take the entire request body and spread it straight into the database insert/update with no validation:

```ts
const memberData = req.body;
// ...
.values({ ...memberData, qrCode })
```
```ts
const updates = req.body;
// ...
.set({ ...updates, updatedAt: new Date() })
```

There's no allow-list and no schema check. A malformed or malicious request could set internal fields it should never touch — `id`, `qrCode`, `isActive`, `createdAt`, and crucially `isCheckedIn` and `isAccountedFor`, the exact flags the muster depends on. Every other properly-built module in TPR validates and whitelists its input; this one doesn't.

**Scope:** one file, `server/routes/emergency.ts`. Three endpoints (delete, create, update). Do not touch the muster query logic itself. Run `npm run check` when done.

---

## Fix 1 — Check the member out when soft-deleting (PRIORITY)

In `server/routes/emergency.ts`, find the `DELETE /api/members/:id` handler (around line 5038). It currently does:

```ts
      const [deactivated] = await customerDb
        .update(isolatedSchema.members)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(isolatedSchema.members.id, id))
        .returning();
```

Change the `.set(...)` so deleting a member also checks them out and clears them from accountability:

```ts
      const [deactivated] = await customerDb
        .update(isolatedSchema.members)
        .set({
          isActive: false,
          isCheckedIn: false,
          checkedOutAt: new Date(),
          checkoutType: 'deleted',
          isAccountedFor: false,
          zoneId: null,
          updatedAt: new Date(),
        })
        .where(eq(isolatedSchema.members.id, id))
        .returning();
```

This makes deletion safe: the person is checked out at the same moment they're removed, so they can never linger on the muster.

### One-time cleanup of records already broken

Any member that was already deleted while checked in is already a ghost. After the code change, run this once against each customer database to clear them:

```sql
UPDATE members
SET is_checked_in = false,
    checked_out_at = NOW(),
    checkout_type = 'deleted',
    is_accounted_for = false,
    zone_id = NULL
WHERE is_active = false AND is_checked_in = true;
```

(If you'd rather not run raw SQL per tenant, tell me and I'll spec a small admin maintenance endpoint instead.)

---

## Fix 2 — Validate and whitelist member input

Still in `server/routes/emergency.ts`. The goal: only let the create/update endpoints write the fields the form is actually allowed to set, and reject anything else.

**Step 1.** Near the top of the members endpoints (just before the `GET /api/members` handler around line 4969), add a small allow-list helper. Use whatever validation style the rest of this file already uses — if `zod` is imported, prefer a `z.object`; otherwise this plain whitelist is fine and has no new dependencies:

```ts
  // Only these fields may be set by the client when creating/updating a member.
  // Everything else (id, qrCode, isActive, isCheckedIn, isAccountedFor, timestamps)
  // is controlled by the server only.
  const MEMBER_EDITABLE_FIELDS = [
    'firstName', 'lastName', 'email', 'phoneNumber', 'photoUrl',
    'membershipType', 'membershipId', 'membershipNumber',
    'joinDate', 'expiryDate', 'membershipStatus', 'notes',
  ] as const;

  function pickMemberFields(body: any) {
    const out: Record<string, any> = {};
    for (const key of MEMBER_EDITABLE_FIELDS) {
      if (body[key] !== undefined) {
        // store blank optional fields as null, not empty strings
        out[key] = body[key] === '' ? null : body[key];
      }
    }
    return out;
  }
```

**Step 2.** In `POST /api/members`, replace:

```ts
      const memberData = req.body;
```
with:
```ts
      const memberData = pickMemberFields(req.body);
      if (!memberData.firstName || !memberData.lastName) {
        return res.status(400).json({ error: "First name and last name are required" });
      }
```

**Step 3.** In `PATCH /api/members/:id`, replace:

```ts
      const updates = req.body;
```
with:
```ts
      const updates = pickMemberFields(req.body);
```

This keeps the form working exactly as it does today, but the muster-critical flags (`isCheckedIn`, `isAccountedFor`, `isActive`) and the identity fields can now only ever be changed by the proper check-in / check-out / delete endpoints. As a side benefit, blank dates now save as null instead of empty text.

---

## How to test when done

1. `npm run check` passes with no new type errors.
2. **Ghost test:** add a member, check them in, confirm they show on the muster / roll-call. Delete them. Confirm they now disappear from the muster as well as the Members page. (Before this fix they'd stay on the muster.)
3. **Validation test:** create and edit a member through the UI as normal — everything still works, dates and photo save correctly.
4. **Whitelist test:** send a `PATCH /api/members/:id` with `{ "isCheckedIn": true, "isActive": false }` in the body and confirm it is ignored (the member's checked-in and active status are unchanged).
