# Bugfix: Visitor PEEP / evacuation-assistance flag (and contact details) silently dropped when a returning visitor checks in (June 2026)

On the Visitors page, the **Walk-in Registration** form has a PEEP checkbox — "♿ Requires Evacuation Assistance (PEEP)" — plus fields for email, phone, mobile, job title and address. The front-end captures and sends all of these correctly.

The bug is on the server. When a visitor checks in, the check-in route first looks for an **existing** visitor with the same first name + last name + company. If it finds one (a previous visitor, or anyone added earlier), it **updates** that record rather than creating a new one — but the update only writes a small set of columns. It never writes `needsEvacuationAssistance`, `email`, `phoneNumber`, `mobileNumber`, `jobTitle` or `address`.

Net effect: tick "Requires Evacuation Assistance" while re-registering someone who's been on site before, and that flag is thrown away. A **first-time** visitor gets it saved (different code path); a **returning** visitor doesn't.

This is safety-critical. The muster / emergency roll-call reads `visitor.needsEvacuationAssistance` straight off this record (`server/routes/emergency.ts`), so a returning visitor who needs evacuation help won't be flagged for the Fire Marshal. The same code drop also means any updated email/phone/job-title entered at re-check-in is ignored.

One focused fix to one `.set()` block. Copy everything below the line into the Replit agent.

---

## THE BUG

In `server/routes/visitors.ts`, in the `POST /api/visitors/checkin` handler, there's a branch for when the visitor already exists but is checked out (`if (existingVisitor) { if (!existingVisitor.isCheckedIn) { ... } }`). It updates the existing row inside a transaction (around **lines 232–249**):

```ts
const [updated] = await tx
  .update(isolatedSchema.visitors)
  .set({
    isCheckedIn: true,
    checkedInAt: checkInTime,
    checkedOutAt: null,
    hostStaffId: resolvedHostStaffId,
    purpose: visitorData.purpose || '',
    carRegistration: visitorData.carRegistration || undefined,
    hsRulesAcceptanceToken: hsToken,
    ...(hsAccepted ? { hsRulesAccepted: true, hsRulesAcceptedAt: hsAcceptedAt } : {}),
    ...(ndaBodyAccepted ? { ndaAccepted: true, ndaAcceptedAt: new Date() } : {}),
    ePassSent: false,
    ePassSentAt: null,
    updatedAt: new Date(),
  })
  .where(eq(isolatedSchema.visitors.id, existingVisitor.id))
  .returning();
```

Notice what's **not** in that `.set()`: `needsEvacuationAssistance`, `email`, `phoneNumber`, `mobileNumber`, `jobTitle`, `address`. The brand-new-visitor branch lower down (`databaseService.createVisitor(context, { ...visitorData, ... })`) spreads the full `visitorData`, so those fields *are* saved for first-time visitors — which is why the bug only bites returning visitors.

Why it's the returning-visitor path that matches: `findExistingVisitor` matches on first name + last name + company, so any walk-in for a known name+company lands in this update branch.

## THE FIX

Add the missing fields to the `.set()` block, using the `??` (nullish-coalesce) pattern so we **only overwrite when a value was actually supplied** and never wipe existing data.

This matters because the two check-in paths send different payloads:
- **Walk-in form** sends `needsEvacuationAssistance` (a real boolean) plus email/phone/etc.
- **Previous-visitor check-in** (the "Who is X visiting?" host dialog) sends only name, company, host, purpose, car reg — the contact fields are `undefined`.

Using `visitorData.field ?? existingVisitor.field` means: a walk-in value updates the record; an absent value (`undefined`/`null`) leaves the existing value untouched. So we never blank out an email just because the previous-visitor dialog didn't include one.

Update the `.set({ ... })` to add these lines (alongside the existing entries):

```ts
.set({
  isCheckedIn: true,
  checkedInAt: checkInTime,
  checkedOutAt: null,
  hostStaffId: resolvedHostStaffId,
  purpose: visitorData.purpose || '',
  carRegistration: visitorData.carRegistration || undefined,
  // Preserve / update emergency + contact details on re-check-in.
  // `?? existing` so an absent field (e.g. from the previous-visitor dialog) never wipes saved data.
  needsEvacuationAssistance: visitorData.needsEvacuationAssistance ?? existingVisitor.needsEvacuationAssistance ?? false,
  email: visitorData.email ?? existingVisitor.email,
  phoneNumber: visitorData.phoneNumber ?? existingVisitor.phoneNumber,
  mobileNumber: visitorData.mobileNumber ?? existingVisitor.mobileNumber,
  jobTitle: visitorData.jobTitle ?? existingVisitor.jobTitle,
  address: visitorData.address ?? existingVisitor.address,
  hsRulesAcceptanceToken: hsToken,
  ...(hsAccepted ? { hsRulesAccepted: true, hsRulesAcceptedAt: hsAcceptedAt } : {}),
  ...(ndaBodyAccepted ? { ndaAccepted: true, ndaAcceptedAt: new Date() } : {}),
  ePassSent: false,
  ePassSentAt: null,
  updatedAt: new Date(),
})
```

Note on the PEEP checkbox specifically: the walk-in form always sends an explicit `true` or `false`, so ticking it sets it and leaving it unticked clears it — the form is the source of truth for that registration. The `?? existing` only applies when the field is absent entirely (the previous-visitor dialog), which is exactly what we want.

Don't touch the first-time-visitor branch (`createVisitor`) — it already saves everything via the `...visitorData` spread.

## VERIFICATION

1. **The core safety case.** On the Visitors page, register a Walk-in visitor (new name) **without** PEEP — check them in, then check them out. Now do a Walk-in for the **same name + company**, this time tick "Requires Evacuation Assistance (PEEP)", check in. Open the visitor's profile / the Mustering roll-call → the visitor is now flagged as needing evacuation assistance. (Before the fix, the flag was lost.)
2. **No data wiped via the previous-visitor path.** Take a visitor who has an email on record, check them out, then use the **Previous Visitors** tab → "Check In" → pick a host → confirm. Re-open their profile → email/phone/job title are still there (the host dialog doesn't send them, so `?? existing` must preserve them).
3. **Contact details update on walk-in.** Walk-in re-register a known visitor with a new phone number → the record shows the new number.
4. **First-time visitors still work.** A brand-new walk-in with PEEP ticked → flag saved as before (no regression).
5. `npx tsc --noEmit` clean for `server/routes/visitors.ts`.
