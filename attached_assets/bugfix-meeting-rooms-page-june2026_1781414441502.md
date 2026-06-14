# Fix — Meeting Rooms page: editing a booking is broken, "Cancel" hard-deletes with no notice, plus three smaller bugs (verified against codebase 14 June 2026)

## Read this first — there are two clashing schema definitions

The meeting-room tables are defined **twice, differently**, and that is the root of most of these bugs:

- `shared/schema.ts` (used by the React client + the `insertMeetingRoomSchema` validator) calls the columns `roomId`, `startDateTime`, `endDateTime`, and gives rooms `hasProjector`, `hasVideoConference`, `isSharedRoom`, etc.
- `server/isolatedSchema.ts` (what **every server query actually runs against** — `server/routes/meetingRooms.ts` imports `* as isolatedSchema`) calls them `meetingRoomId`, `startTime`, `endTime`, and rooms have an `equipment` text array instead of the `has*` booleans, and **no** `isSharedRoom`.

So the client speaks one column language and the server speaks another. The server is the source of truth at runtime because that's what Drizzle maps to SQL.

**Before changing anything, confirm the real columns in a live tenant database** (psql `\d meeting_rooms` and `\d room_bookings`). Apply the fixes below using whatever the live tables actually contain. Where I name a column, I've used the `isolatedSchema` name because that's what the running queries use — verify it matches the live DB.

**Scope:** `server/routes/meetingRooms.ts`, `client/src/pages/MeetingRooms.tsx`, `client/src/components/RoomBookingForm.tsx`, and possibly a small migration. Run `npm run check` when done.

---

## Bug 1 — Editing a booking doesn't save (and may error) — HIGH

`client/src/components/RoomBookingForm.tsx` (the `updateBookingMutation`, ~line 298) PATCHes the booking with the **form** field names:

```ts
apiRequest('PATCH', `/api/room-bookings/${editBooking.id}`, {
  ...data,                                   // roomId, cateringRequired, technicalRequirements, priority…
  startDateTime: new Date(data.startDateTime).toISOString(),
  endDateTime: new Date(data.endDateTime).toISOString(),
  staffAttendeeIds: data.staffAttendeeIds || [],
  externalAttendeeEmails: data.externalAttendeeEmails || [],
});
```

The server (`PATCH /api/room-bookings/:id`, ~line 544) then spreads that whole body straight into Drizzle:

```ts
const updates = req.body;
...
const [booking] = await patchDb.update(isolatedSchema.roomBookings)
  .set(updates)                              // ← raw body
  .where(eq(isolatedSchema.roomBookings.id, id)).returning();
```

But the actual columns are `startTime` / `endTime` / `meetingRoomId` / `requiresCatering` / `specialRequirements`. So `startDateTime`, `endDateTime`, `roomId`, `cateringRequired`, `technicalRequirements`, `priority`, `staffAttendeeIds`, `externalAttendeeEmails`, `recurringType`, `recurringEndDate` are **not real columns**. Best case the changed fields are silently dropped (so editing a time/room appears to work but nothing saves); worst case Drizzle throws on the unknown keys and the whole PATCH returns 500 — which also kills the attendee-update block that runs afterwards. Notice the conflict check just above it *does* correctly build `startTime`/`endTime` — only the write is wrong.

Contrast with the POST handler (~line 369), which maps every field explicitly. The PATCH handler must do the same.

**Fix:** in `PATCH /api/room-bookings/:id`, stop spreading `req.body`. Build an explicit update object, mirroring the POST mapping:

```ts
const body = req.body;

const updates: Record<string, any> = {};
if (body.title !== undefined)        updates.title = body.title;
if (body.description !== undefined)  updates.description = body.description;
if (body.roomId !== undefined)       updates.meetingRoomId = body.roomId;
if (body.startDateTime !== undefined) updates.startTime = new Date(body.startDateTime);
if (body.endDateTime !== undefined)   updates.endTime = new Date(body.endDateTime);
if (body.expectedAttendees !== undefined) updates.expectedAttendees = body.expectedAttendees;
if (body.cateringRequired !== undefined)  updates.requiresCatering = body.cateringRequired;
if (body.cateringNotes !== undefined)     updates.cateringNotes = body.cateringNotes;
if (body.technicalRequirements !== undefined) updates.specialRequirements = body.technicalRequirements;
updates.updatedAt = new Date();
```

Then `.set(updates)` with that object. Keep the existing conflict check and the attendee re-sync block (those already use the right column names). `staffAttendeeIds` / `externalAttendeeEmails` should be read off `body` for the attendee block, **not** written to the bookings row.

---

## Bug 2 — "Cancel booking" permanently deletes it and never tells the attendees — HIGH

In `client/src/pages/MeetingRooms.tsx`, `handleBookingCancel` (~line 235) calls:

```ts
await apiRequest('DELETE', `/api/room-bookings/${booking.id}`);
...
toast({ title: 'Booking Cancelled', description: 'The booking has been cancelled successfully.' });
```

Two problems:

1. It calls the **hard-delete** endpoint, which physically removes the row. So a cancelled meeting vanishes from history entirely — no audit trail, no record it ever existed. The toast says "cancelled" but it was deleted.
2. There is already a proper cancel endpoint — `POST /api/room-bookings/:id/cancel` (~line 638) — which sets `status = 'cancelled'` **and emails every attendee a cancellation notice** (`sendBookingCancellation`). It's never called. So everyone who got a booking confirmation email is left thinking the meeting is still on.

**Fix (client):** point the cancel handler at the cancel endpoint:

```ts
await apiRequest('POST', `/api/room-bookings/${booking.id}/cancel`, {
  cancelledBy: /* current staff id or name if available, else omit */ undefined,
});
```

Keep `DELETE` only for a genuine "delete permanently" action if you want one — but the user-facing "Cancel" must use the cancel route.

**Fix (server) — the cancel endpoint is itself broken.** It writes columns that don't exist on the table:

```ts
.set({ status: 'cancelled', cancelledBy, cancelledAt: new Date() })   // ← cancelledBy / cancelledAt
```

Neither `cancelledBy` nor `cancelledAt` exists in `isolatedSchema.roomBookings`. So as soon as the UI starts calling this route it will 500. Either:

- add `cancelledBy` (varchar) and `cancelledAt` (timestamp) columns to the room-bookings table (migration), **or**
- drop those two fields and just set `{ status: 'cancelled', updatedAt: new Date() }`.

The email send is the valuable part — keep it.

---

## Bug 3 — Check-in / end-meeting endpoints write columns that don't exist — MEDIUM

Same class of bug, two more endpoints:

- `POST /api/room-bookings/:id/check-in` (~line 729) sets `{ status: 'in_progress', checkedInAt: new Date() }` — there is no `checkedInAt` column.
- `POST /api/room-bookings/:id/end-meeting` (~line 754) sets `{ status: 'completed', endedAt: new Date() }` — there is no `endedAt` column.

Both will 500 if anything ever calls them. They aren't wired to any button today, so pick one:

- if room-usage check-in is wanted, add the columns (the live `shared/schema.ts` already imagines `actualStartTime` / `actualEndTime` / `checkedInByStaffId` for this — use those names if the live table has them), **or**
- delete the two dead endpoints so they can't be called by mistake.

---

## Bug 4 — Monthly recurring bookings drift on month-end dates — MEDIUM

In the recurring path of `POST /api/room-bookings` (~line 472):

```ts
else if (bookingData.recurringType === 'monthly') {
  const next = new Date(cursor);
  next.setMonth(next.getMonth() + 1);
  cursor = next;
}
```

`setMonth` overflows: a meeting that starts on the 31st rolls to "31 February" → 2 or 3 March, and every later occurrence then lands on the 3rd. Booking on the 29th–31st silently produces wrong dates. The form's preview count (`getOccurrenceCount` using `differenceInMonths`) can also disagree with how many the server actually creates.

**Fix:** anchor to the original day-of-month and clamp to the month length, e.g.:

```ts
const anchorDay = baseStart.getDate();
...
else if (bookingData.recurringType === 'monthly') {
  const next = new Date(cursor);
  next.setDate(1);                                   // avoid rollover while changing month
  next.setMonth(next.getMonth() + 1);
  const daysInMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(anchorDay, daysInMonth));
  cursor = next;
}
```

---

## Bug 5 — The conflict list in the booking form always reads "Time not available" — LOW

When a slot clashes, `GET /api/room-bookings/check-availability` returns the raw booking rows (`startTime` / `endTime`). But the form renders them using `conflict.startDateTime` / `conflict.endDateTime` (`RoomBookingForm.tsx` ~line 783), which don't exist on those rows — so it always falls back to "Time not available" instead of showing the clashing time.

**Fix:** read `conflict.startTime` / `conflict.endTime` (whatever the live column names are) in that block.

---

## One to check with Andy before changing — shared vs "Tenant Only" rooms aren't actually enforced

The room form has a "Shared Room / Tenant Only" toggle ("Available to all tenants"), and bookings have an `isPrivate` flag. But `GET /api/meeting-rooms` and `GET /api/room-bookings` return **every** row to **every** logged-in user with no tenant filter — full booking titles, organiser emails and attendee lists included. So in a multi-tenant building the "Tenant Only" label is cosmetic and one tenant can see another's meeting details.

This may be fine if "tenant" here just means departments inside a single customer (each customer already has its own isolated database). **Don't change this blind** — confirm the intended visibility with Andy first, then decide whether the list endpoints need to filter by the caller's tenant.

---

## How to test when done

1. `npm run check` passes with no new type errors.
2. **Edit test:** create a booking, then edit its time and room and save. Reopen it — the new time and room are actually saved. (Before this fix they weren't.)
3. **Cancel test:** cancel a booking with at least one staff attendee and one external email. Confirm the booking shows as `cancelled` (still in the list/history, not gone), and that a cancellation email goes to the attendees.
4. **Monthly recurrence test:** create a monthly recurring booking starting on the 31st. Confirm every occurrence lands on (or near) the 31st, not drifting to the 3rd.
5. **Conflict test:** try to book a slot that overlaps an existing booking — the conflict panel shows the real clashing start/end times.
