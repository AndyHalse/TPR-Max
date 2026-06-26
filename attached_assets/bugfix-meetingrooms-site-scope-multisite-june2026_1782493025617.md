# Bugfix — Meeting Rooms: site-scope by-id endpoints + bookings (multi-site)

**`meetingRooms.ts` scopes the main rooms list (L66 ✓) but every by-id room/booking endpoint and a list (L302) read with no site check — so a multi-site (enterprise) user can view/edit/delete another site's room or booking by id, and availability/calendar can span sites. Single-site customers unaffected. Test customers only. NO `npm run db:push`.**

## The fix (uniform site-scoping pattern)
With `const { db: custDb, siteContext, siteId } = await getScopedDb(req)`:
- **By-id reads/actions** of `meeting_rooms` (L81, L141, L614, L641, L763, L834 — view, update, delete, facilities, availability) → fetch with `and(eq(meetingRooms.id, id), scopedWhere(siteContext, isolatedSchema.meetingRooms))`; out-of-scope → 404.
- **List read** L302 → add `scopedWhere(siteContext, isolatedSchema.meetingRooms)`.
- **`room_bookings`** are site-scoped too: scope booking list/calendar/availability reads with `scopedWhere(siteContext, isolatedSchema.roomBookings)`, and stamp booking creates with `withSiteId(siteId, …)`. Availability/double-booking checks must be within the active site.
- **Child `room_booking_attendees`** resolves via the parent booking — load by `bookingId` once the parent is confirmed; don't scope separately.

## Acceptance criteria
- A multi-site user sees/books only their active site's rooms; another site's room or booking returns 404 by id.
- Availability and double-booking checks are per site.
- Single-site customers unchanged.
- Add a `meetingRooms` (rooms + roomBookings) by-id/list case to `tests/site-isolation.routes.test.ts`; confirm it passes and bites.

## Do NOT
- Do not separately scope `room_booking_attendees` (resolve via the verified parent booking).
- Do not regress single-site customers.
