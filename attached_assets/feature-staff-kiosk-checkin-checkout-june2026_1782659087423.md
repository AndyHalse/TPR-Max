# Feature — Dedicated Staff Kiosk (tap-to-check-in / check-out) for wall tablet or reception iPad

## Goal
Build a **new, dedicated, full-screen Staff Kiosk** designed for an iPad or wall-mounted tablet. It must be dead simple: a staff member walks up, taps their name (or scans their QR/access card), and they're checked in. It is strongly branded with the site/company colours so it looks like it belongs on the wall at reception.

This is **separate** from the existing multi-purpose `KioskMode.tsx` (visitors + contractors + staff search). Do **not** modify or replace `KioskMode.tsx`. Create a new screen and a new route.

- New page: `client/src/pages/StaffKiosk.tsx`
- New route: `/staff-kiosk` (add to the router in `client/src/App.tsx`)

## Why this matters (read before building)
The check-in/check-out data this screen writes feeds the **fire muster roll**. If the list is wrong, the muster is wrong, and that is a life-safety issue. So the list must be accurate and the check-in/out action must be reliable. Use the **existing** staff check-in plumbing — do not invent a parallel one.

## Use the existing data and endpoints (do not build new ones unless noted)
- Staff list: `GET /api/staff` — each staff record has `id, firstName, lastName, department, jobTitle, photoUrl, isCheckedIn, checkedInAt, qrCode, barcodeNumber`.
- Currently checked-in staff: `GET /api/staff/checked-in`.
- Toggle check-in/out: `POST /api/staff/:id/kiosk-toggle` — returns `{ action: "checkin" | "checkout", staff: {...} }`. This is exactly what the existing kiosk uses for the staff toggle, so reuse it.
- QR / access-card match: reuse the same scan-to-staff lookup the existing `KioskMode.tsx` uses (it already scans QR codes and matches `qrCode` / `barcodeNumber`). Wire the scanner to call `kiosk-toggle` for the matched staff member.

If the back end does not already expose a reliable "last check-in time" for staff who are **not** currently checked in (i.e. `checkedInAt` is cleared on check-out), add a read-only field — e.g. `lastCheckInAt` — sourced from the most recent `staffSessions.checkInTime` for that staff member, so the kiosk can order the list correctly. Do not change any check-in/out write logic.

## The two modes (this is the core behaviour)

A clear **toggle switch at the top** flips the whole screen between two modes. Default is **Check In**.

### CHECK IN mode (default)
- Show **only staff who are NOT currently checked in** (`isCheckedIn === false`).
- The moment a person checks in, they **disappear from this list** (re-fetch / invalidate after every toggle so the list is always live).
- **Ordering — "last checked in" order:** sort by the person's most recent previous check-in, **most recent first** (`lastCheckInAt` descending). The idea: people who come in regularly / most recently float to the top so they're the easiest to tap. Anyone who has never checked in (no `lastCheckInAt`) goes to the bottom, sorted alphabetically by last name.
- Tapping a card → call `kiosk-toggle` → success → show a big friendly confirmation (see below) → the card is gone from the list.

### CHECK OUT mode (the reverse)
- Flipping the switch reverses everything: now show **only staff who ARE currently checked in** (`/api/staff/checked-in`).
- This makes it easy to find yourself and tap to check out.
- **Ordering:** most recent check-in first (`checkedInAt` descending) so the people who just arrived — and anyone leaving soon after — are near the top. (If you think longest-on-site-first is better for end-of-day, leave a code comment but default to most-recent-first.)
- Tapping a card → `kiosk-toggle` → success → "Goodbye / Have a safe trip" confirmation → card disappears from the checked-out list.

## Search (for when a name isn't on screen)
- A large search box at the top, under the mode toggle.
- Filters the **current mode's** list live by first name, last name, or department.
- On a long staff list this is how someone finds themselves quickly without scrolling.
- Big, touch-friendly. An on-screen behaviour that doesn't depend on a physical keyboard is ideal (the device may be wall-mounted with no keyboard), but the native tablet keyboard is acceptable for v1.

## QR / access-card scan
- A prominent **"Scan QR / Card"** button.
- Opens the camera scanner (reuse the scanner already in `KioskMode.tsx` — `jsQR`, `ScannerReticle`, `playBeep`).
- On a successful match to a staff member, call `kiosk-toggle` for them automatically and show the same confirmation. The scan respects the current mode (scanning in Check Out mode checks them out).
- If the scanned code matches no staff member, show a clear, non-technical message ("Card not recognised — please tap your name or see reception").

## Confirmation screen (after every check-in / check-out)
- Full-screen, big, unmissable, branded.
- Check-in: green tick, "Welcome, **[First name]**", "Checked in at **08:42**" (use UK 24-hour time, Europe/London).
- Check-out: "Goodbye, **[First name]**", "Checked out at **17:15**".
- Auto-dismisses back to the list after ~3 seconds (the existing kiosk already does this pattern — match it).

## Look & feel — branding rules (HARD)
- **NO glass / frosted / translucent effect anywhere on this screen.** This is an emergency-relevant kiosk and our standing rule is solid surfaces only. Do **not** use `GlassCard`. Use solid cards with strong contrast.
- Use the site/company brand colours. Primary is the app's `--primary` token (ACS blue, `#2460A9` / `hsl(213, 65%, 40%)`). Pull the company name and logo from `CompanySettings` (the same source the existing kiosk uses) and show them in a header bar so it's obviously *their* reception screen.
- Designed for **touch**: very large tap targets (each staff card should be a big, full-width-ish tile), generous spacing, large readable text. Assume the user may be a metre away or in a hurry.
- **Show the staff photo on each card** (`photoUrl`) as a clear circular avatar next to the name — this is how people spot themselves quickly. When `photoUrl` is missing, show a clean initials avatar (first + last initial) on a brand-colour background. (Photos are shown deliberately; Andy has accepted this for the reception wall mount.)
- **Check-in confirmation:** tapping a name checks the person straight in — no PIN, no second step ("tap and go", confirmed by Andy). Keep it that fast.
- High contrast, no reliance on hover. Works in both portrait and landscape on an iPad.
- Clean, calm, "obviously easy" — a stranger should understand it in two seconds.

## Edge cases / robustness (wall-mounted, unattended)
- **Idle reset:** if left untouched for ~60s on any sub-screen (scan, confirmation, search), return to the default Check In list and clear the search box.
- **Live list:** invalidate/re-fetch `["/api/staff"]` and `["/api/staff/checked-in"]` after every toggle so two people checking in at once both see the right list. Also poll/refetch periodically (e.g. every 20–30s) so a wall tablet left open all day stays current.
- **Network drop:** if a toggle fails, show a clear "Couldn't reach the system — please try again or see reception" message and leave the person on the list (do not optimistically remove them).
- **Empty states:** Check In mode with everyone already in → friendly "Everyone's checked in 👍". Check Out mode with nobody in → "No one is currently checked in."
- **Kiosk lock:** the screen should not let a random passer-by navigate into the rest of the app. No nav menu, no back-to-dashboard link visible. Provide a discreet way for a manager to exit kiosk mode (e.g. a small, unlabelled corner tap target that requires the logged-in admin — match however the existing `KioskMode.tsx` handles exit, if it does).

## What NOT to do
- Do not touch `KioskMode.tsx`, the visitor flow, or the contractor flow.
- Do not change any check-in/out write logic, muster logic, or `staffSessions` writes. This screen only **reads** the staff lists and **calls the existing `kiosk-toggle`** endpoint.
- Do not add a glass effect.
- Do not run `db:push` / schema changes unless the only way to get `lastCheckInAt` is a read-side query helper — and if so, it must be additive and read-only, with no change to existing columns.

## Acceptance test (please verify before handing back)
1. Open `/staff-kiosk` on a tablet-sized viewport. Header shows the company logo/name and brand colours. No glass anywhere.
2. Check In mode lists only not-checked-in staff, each card showing a photo (or initials avatar) + name + department, most-recent-previous-check-in at the top, never-checked-in alphabetical at the bottom.
3. Tap a name → confirmation with UK time → that person vanishes from the Check In list.
4. Flip to Check Out mode → the same person now appears in the checked-in list → tap → checkout confirmation → they vanish.
5. Search filters the visible list by name/department.
6. Scan a staff QR/card → checks them in/out per the current mode → confirmation.
7. Leave it idle 60s → returns to the default Check In list with search cleared.
8. Kill the network and tap a name → friendly error, person stays on the list.
