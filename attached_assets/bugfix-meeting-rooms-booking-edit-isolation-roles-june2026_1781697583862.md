# Bugfix — Meeting Rooms: booking edit, tenant isolation, facilities, roles, validation, double-booking, performance (June 2026)

**Module:** Meeting Rooms & Booking Management
**Files:** `server/routes/meetingRooms.ts`, `client/src/components/RoomBookingForm.tsx`, `client/src/components/RoomBookingCalendar.tsx`, `client/src/pages/MeetingRooms.tsx`
**Live tables (per-customer isolated DB):** `server/isolatedSchema.ts` → `meetingRooms` (line 684), `roomBookings` (698), `roomBookingAttendees` (722).
**⚠️ No `npm run db:push` needed — this is a code-only change.** Do NOT add columns. Where the room form has amenity fields the live table lacks, map them into the existing `equipment` text array.

Apply all eight fixes below. Keep the existing per-customer isolation pattern (`customerDbService.getCustomerDatabase(customerId)`) everywhere — never query a shared table.

---

## Fix 1 (🔴) — Editing a booking wipes its attendees and then 500s

In `PATCH /api/room-bookings/:id` (`meetingRooms.ts` ~608-647) the handler deletes all attendee rows and re-inserts them **without** the `name` column, which is `NOT NULL` (`isolatedSchema.ts:727`). The insert throws, the request 500s, and the attendees are already gone. The form always sends both attendee arrays (`RoomBookingForm.tsx:312-313`).

Fix:
- Only touch attendees when the arrays are **actually provided** — check `body.staffAttendeeIds !== undefined || body.externalAttendeeEmails !== undefined` (not just truthiness; an empty array is truthy).
- When rebuilding, supply `name` and `email` for every row, exactly like the create path's `insertAttendees` helper (`meetingRooms.ts:406-416`): look up each staff member and store `name: \`${s.firstName} ${s.lastName}\``, `email: s?.email || ''`, `staffId: sid`; for external emails store `email`, `name: email`, `staffId: null`.
- Do the **delete + re-insert inside a single `patchDb.transaction(...)`** so a failure can't leave the booking with no attendees.
- Pre-load the staff records once (one `inArray` query) before the loop — don't query per attendee.

## Fix 2 (🔴) — Booking calendar & availability check bypass per-tab tenant isolation

`RoomBookingCalendar.tsx:59` and `RoomBookingForm.tsx:226` use raw `fetch(...)`, so they never attach the per-tab `Authorization: Bearer` session token. `requireAuth` then falls back to the shared session cookie (`server/auth.ts:835-847`), so in a multi-window session (window A = Customer 1 via cookie, window B = Customer 2 via per-tab token) window B's calendar/availability resolve to **Customer 1's** data. It also 401s if the cookie expires while the per-tab token is still valid.

Fix: route both calls through the shared `apiRequest` helper from `@/lib/queryClient` (which attaches the Bearer token and `credentials: include`), then `.json()` the response.
- `RoomBookingCalendar.tsx` `queryFn`: replace the raw `fetch` with `const res = await apiRequest('GET', \`/api/room-bookings?${params}\`); return res.json();` (import `apiRequest`).
- `RoomBookingForm.tsx` `checkAvailability`: replace the raw `fetch(url)` with `const response = await apiRequest('GET', url);` (keep the existing `response.ok`/`.json()` handling — `apiRequest` already throws on non-OK, so simplify accordingly).

## Fix 3 (⚠️) — Room facilities tick-boxes & "Shared Room" toggle save nothing

The room form (`MeetingRooms.tsx`) is built against the **shared** schema (`hasProjector`, `hasVideoConference`, `hasWhiteboard`, `hasTV`, `hasAirCon`, `hasCatering`, `isSharedRoom`), but the **live** isolated `meeting_rooms` table has none of those — only an `equipment` text array. The create/update endpoints do `insert(...).values(roomData)`, so Drizzle silently drops the unknown keys. Rooms always render "Basic room".

Fix without changing the DB — map both directions on the server:
- Add two small helpers in `meetingRooms.ts`:
  - `amenitiesToEquipment(body)` → builds a string array from the booleans, e.g. `projector`, `video_conference`, `whiteboard`, `tv`, `air_con`, `catering`.
  - `equipmentToAmenities(room)` → returns `{ hasProjector, hasVideoConference, hasWhiteboard, hasTV, hasAirCon, hasCatering }` derived from `room.equipment`.
- In `POST` and `PATCH /api/meeting-rooms`: build the row from a validated, whitelisted object (see Fix 5) and set `equipment: amenitiesToEquipment(body)`.
- In `GET /api/meeting-rooms`, `GET /api/meeting-rooms/:id`, and the objects returned by POST/PATCH: spread `...equipmentToAmenities(room)` onto each room so the frontend (which reads `room.hasProjector` etc.) shows them correctly — no frontend change needed for the facilities.
- **"Shared Room":** the live model has no shared-room concept and we're not changing the DB. Remove the non-functional control rather than ship a toggle that does nothing — in `MeetingRooms.tsx` remove the `isSharedRoom` `FormField` (the "Shared Room" switch) and the `🌐 Shared / 🏢 Tenant Only` badge + its `getAllocationTypeColor` helper, and drop `isSharedRoom` from the form `defaultValues` and `handleEdit`. (If shared-across-tenant rooms are wanted later, that's a separate feature needing a DB column.)

## Fix 4 (⚠️) — No permission checks on any write

Every endpoint is `requireAuth` only, so any authenticated user (including a basic reception account) can create/edit/delete rooms and delete/cancel/edit anyone's booking. Match the pattern already used elsewhere (`req.user!.role`, e.g. `cdm.ts:133`, `contractors.ts:857`).

- **Room management** — `POST`, `PATCH`, `DELETE /api/meeting-rooms/:id`: require `['admin','manager'].includes(req.user!.role)`, else `403 { error: "Administrator or manager access required" }`.
- **Booking edit / cancel / delete** (`PATCH /api/room-bookings/:id`, `POST /api/room-bookings/:id/cancel`, `DELETE /api/room-bookings/:id`): allow if the user is admin/manager **or** owns the booking. Resolve the requester's staff id the same way the create path does (`staff` where `userId = req.user.id`) and allow when `staffId === booking.bookedByStaffId`; otherwise `403`. Creating a booking stays open to any authenticated user.

## Fix 5 (⚠️) — No input validation on room create/update (mass-assignment + raw 500s)

`POST`/`PATCH /api/meeting-rooms` insert raw `req.body` (`meetingRooms.ts:55-58, 69-73`): a client can set `id`, `isActive`, `hourlyRate`, etc., and a missing `capacity` (NOT NULL) throws a raw 500.

Fix: validate with a small zod schema before insert/update — whitelist `name` (string, min 1, required on create), `location` (string, optional), `capacity` (int, min 1, required on create), `description` (string, optional), `isActive` (boolean, optional) plus the amenity booleans (consumed by Fix 3). Strip everything else (never accept `id`/`createdAt`). On failure return `400` with a readable message. Apply the same whitelist on PATCH (all fields optional there).

## Fix 6 (⚠️) — Two people can double-book the same room

In `createSingleBooking` (`meetingRooms.ts:420-446`) the conflict `SELECT` and the `INSERT` aren't atomic, so two near-simultaneous requests can both pass the check and both insert. Wrap the conflict check **and** the insert (and the attendee insert) for a single booking in `bookingDb.transaction(async (tx) => { ... })`, doing the conflict re-check inside the transaction and returning null if a conflict is found. Keep the recurring path using the same transactional single-booking helper per occurrence.

## Fix 7 (⚠️) — `GET /api/room-bookings` loads the entire history and ignores its filters

The client sends `start_date`, `end_date`, and optional `room_id` (`RoomBookingCalendar.tsx:52-56`) but the server selects **every** booking (`meetingRooms.ts:200`). Apply the filters server-side:
- Parse `start_date`/`end_date`/`room_id` from `req.query`.
- Filter `roomBookings` to those overlapping the window (`startTime <= end_date AND endTime >= start_date`) and, when `room_id` is present, `meetingRoomId = room_id`.
- Order by `startTime`.
- Keep the existing batched enrichment (rooms/staff/attendees maps — no N+1). If no dates are supplied, default to a sensible window (e.g. now → +90 days) rather than the whole table.

## Fix 8 (⚠️) — Availability summary always says "Available"; day list isn't sorted

In `RoomBookingCalendar.tsx` the API returns `meetingRoomId`/`startTime`, but:
- line 383 filters by `b.roomId` → never matches → every room shows green "Available". Change to `b.meetingRoomId`.
- line 359 sorts by `a.startDateTime`/`b.startDateTime` → undefined → no real sort. Sort by the start time using the same both-field fallback already used in `BookingCard` (`(b as any).startDateTime || (b as any).startTime`).

---

## Acceptance checks
1. Edit a booking that has 2 staff + 1 external attendee → saves, attendees preserved, update email sends, no 500.
2. Edit a booking and remove all attendees → saves cleanly, attendee list empties, no error.
3. Two browser windows logged into different customers → each window's Meeting Rooms calendar and availability check show only **that** window's customer's bookings.
4. Create a room with Projector + Video + Catering ticked → reopen it and the cards/edit form still show those amenities.
5. A non-admin/non-manager user cannot create/edit/delete rooms (403) and cannot delete/cancel a booking they didn't make, but **can** manage their own booking.
6. Creating a room with no capacity returns a friendly 400, not a 500.
7. Fire two identical bookings for the same room/time concurrently → only one succeeds.
8. The Room Availability Summary correctly shows booked rooms as booked, and the day's bookings list is in time order.

No DB migration required.
