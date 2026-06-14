# Feature — Search staff when adding attendees to a meeting-room booking (verified against codebase 14 June 2026)

## Why

On the "Book Meeting Room" form, the **Staff Attendees** picker is a plain checkbox list of every staff member (`client/src/components/RoomBookingForm.tsx`, ~line 510). On a site with more than a handful of staff that's a long, unsearchable scroll — you have to eyeball the whole list to find one person. Add a search box that filters the list by name or email as you type.

**Scope:** one file — `client/src/components/RoomBookingForm.tsx`. Frontend only, no API or schema changes. Run `npm run check` when done.

## What it should do

1. A search box sits directly above the staff checklist.
2. Typing filters the list to staff whose **first name, last name, or email** contains the text (case-insensitive).
3. **Already-selected people stay selected even when filtered out of view** — clearing or changing the search must never silently drop a tick. Show the running count of how many are selected.
4. The list scrolls inside a fixed height so a big team doesn't blow the dialog out.
5. If the search matches nobody, show a short "No staff match" line rather than an empty gap.

## How

### Step 1 — add the search state

Near the other `useState` hooks at the top of the component (around line 83), add:

```ts
  const [staffSearch, setStaffSearch] = useState('');
```

(`useState` is already imported.)

### Step 2 — replace the Staff Attendees field

Replace the whole `staffAttendeeIds` `FormField` block (currently ~lines 511–548) with this. It keeps the exact same field wiring and `data-testid`s, just adds the search box, a filtered list, a selected count, and a scroll container:

```tsx
                    {/* Staff Attendees */}
                    <FormField
                      control={form.control}
                      name="staffAttendeeIds"
                      render={({ field }) => {
                        const selected = field.value || [];
                        const term = staffSearch.trim().toLowerCase();
                        const filteredStaff = term
                          ? staff.filter((m) =>
                              `${m.firstName} ${m.lastName}`.toLowerCase().includes(term) ||
                              (m.email || '').toLowerCase().includes(term)
                            )
                          : staff;

                        return (
                          <FormItem>
                            <FormLabel>Staff Attendees</FormLabel>
                            <FormDescription>
                              Search and select staff members who will attend this meeting
                              {selected.length > 0 && ` — ${selected.length} selected`}
                            </FormDescription>

                            <Input
                              type="text"
                              value={staffSearch}
                              onChange={(e) => setStaffSearch(e.target.value)}
                              placeholder="Search staff by name or email..."
                              data-testid="input-staff-search"
                              className="mb-2"
                            />

                            <div className="space-y-2 max-h-56 overflow-y-auto rounded-md border p-2">
                              {filteredStaff.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-1">
                                  No staff match "{staffSearch}".
                                </p>
                              ) : (
                                filteredStaff.map((member) => (
                                  <div key={member.id} className="flex items-center space-x-2">
                                    <input
                                      type="checkbox"
                                      id={`staff-${member.id}`}
                                      checked={selected.includes(member.id)}
                                      onChange={(e) => {
                                        const currentValue = field.value || [];
                                        if (e.target.checked) {
                                          field.onChange([...currentValue, member.id]);
                                        } else {
                                          field.onChange(currentValue.filter((id) => id !== member.id));
                                        }
                                      }}
                                      data-testid={`checkbox-staff-${member.id}`}
                                      className="rounded border-gray-300"
                                    />
                                    <label htmlFor={`staff-${member.id}`} className="text-sm font-medium">
                                      {member.firstName} {member.lastName}
                                      <span className="text-muted-foreground ml-1">({member.email})</span>
                                    </label>
                                  </div>
                                ))
                              )}
                            </div>
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />
```

`Input` is already imported at the top of the file, so no new imports are needed.

### Step 3 — clear the search when the dialog resets (small polish)

So a stale search term doesn't linger next time the form opens, clear it where the form is reset. In the edit-population `useEffect` (the one starting `if (editBooking && ...)`, ~line 141) and after a successful create/update, set `setStaffSearch('')`. If that's fiddly, at minimum add it to the existing `form.reset()` call sites in `createBookingMutation.onSuccess` and `updateBookingMutation.onSuccess`.

## How to test when done

1. `npm run check` passes with no new type errors.
2. Open Book Meeting Room. The Staff Attendees list now has a search box above it.
3. Type part of a name or an email — the list narrows to matches, case-insensitive.
4. Tick someone, then search for a *different* name. The first person stays selected (check the "N selected" count), and they're still included when you save the booking.
5. Search for nonsense — you get "No staff match" instead of a blank box.
6. A long staff list scrolls within the box rather than stretching the dialog.
