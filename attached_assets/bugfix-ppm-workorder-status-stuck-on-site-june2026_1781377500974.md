# Bugfix: PPM work order stuck on "On Site" — admin can't move it back to Scheduled or In Progress (June 2026)

On the PPM **Work Orders** tab, once a contractor has tapped "I've arrived" on their job link, the work order is permanently locked to the **On Site** status from the admin's point of view. In the work order detail panel there's a "Change Status" row with buttons — Scheduled, In Progress, On Site, Completed, Overdue. After arrival, the only button that actually does anything is **Completed**. Click "Scheduled" or "In Progress" and nothing visibly happens — the badge snaps straight back to "On Site". So if a contractor arrives by mistake, or the admin needs to push the job back to Scheduled, there is no way to do it from the screen.

There's also a small, unrelated tidy-up at the end (a missing TypeScript field) that's worth doing in the same pass.

Copy everything below the line into the Replit agent.

---

## THE BUG

The work order list and detail panel both compute a *display* status with a helper called `effectiveWOStatus` (`client/src/pages/PPM.tsx` ~line 236):

```ts
function effectiveWOStatus(wo: { status: string; arrivedAt?: string | null }): string {
  if (wo.arrivedAt && wo.status !== "completed") return "on_site";
  return wo.status;
}
```

The intent is sound — if a contractor has arrived but the job isn't finished, show it as "On Site" (this was added to cover older records that pre-date the `on_site` status). The problem is that this override **ignores any deliberate status change the admin makes**, as long as `arrivedAt` is still set.

Walk through what happens when an admin opens the detail panel and clicks **Scheduled**:

1. The "Change Status" buttons (`PPM.tsx` ~lines 2075–2086) send `{ status: "scheduled" }` to `PUT /api/ppm/work-orders/:id`.
2. The server (`server/routes/ppm.ts` ~line 499) saves `status = "scheduled"` — **but never clears `arrivedAt`.** There is no line that touches `arrivedAt` anywhere in the PUT route.
3. The list refetches. For this work order, `arrivedAt` is still set and the status isn't "completed", so `effectiveWOStatus` returns **"on_site"** again.
4. Result: the badge shows "On Site", the "Scheduled" button is not highlighted and not disabled, the "On Site" button stays selected. To the admin it looks like the click was ignored.

The same trap hits **In Progress** — clicking it sets `status = "in_progress"` in the database, but the override forces the display back to "On Site", so it can never be shown.

Net effect: **once `arrivedAt` is set, the work order is frozen on "On Site" until it is marked Completed.** There is no supported way to revert an arrived job to Scheduled.

(For context on where `arrivedAt` comes from: the contractor "arrive" handler at `server/routes/ppm.ts` ~line 2524 sets `arrivedAt` and flips `status` to `on_site`. Nothing ever clears `arrivedAt` again.)

## THE FIX

Two changes — one on the server so a revert actually takes effect, one on the client so the panel reflects the truth immediately.

### 1. Server — clear `arrivedAt` when the admin reverts to Scheduled

In `server/routes/ppm.ts`, in the `PUT /api/ppm/work-orders/:id` route, just after the existing block that handles status changes (the `if (updates.status === "completed" …)` / `if (updates.status && updates.status !== "overdue")` lines, ~line 523–529), add:

```ts
// Reverting a work order to "scheduled" means it is no longer on site —
// clear the arrival timestamp so the display status isn't forced back to "on_site".
if (updates.status === "scheduled") {
  updates.arrivedAt = null;
}
```

Rationale: "Scheduled" is a genuine reset to *before* the contractor arrived, so dropping the arrival timestamp is correct. Leave `arrivedAt` untouched for `completed` (we want the arrival kept on the record) and for `on_site`/`in_progress`. This single line makes the **Scheduled** button work end-to-end.

### 2. Client — don't redundantly offer "In Progress" once arrived, and refresh the panel from the server

Two parts in `client/src/pages/PPM.tsx`:

**(a) Stop the panel showing stale data after a status change.** The `updateWOMutation` `onSuccess` (~lines 1236–1247) currently rebuilds `selectedWO` by finding the **old** cached record and spreading the new field over it:

```ts
const updated = workOrders.find(w => w.id === vars.id);
if (updated) setSelectedWO({ ...updated, ...vars.data } as PpmWorkOrder);
```

Because `workOrders` is the pre-update list, `arrivedAt` (and anything the server changed, e.g. `completedDate`) is stale. Change this so it uses the row the server returns. The mutation calls `apiRequest("PUT", …)`, which returns the `fetch` Response — parse it:

```ts
const updateWOMutation = useMutation({
  mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
    const res = await apiRequest("PUT", `/api/ppm/work-orders/${id}`, data);
    return res.json() as Promise<PpmWorkOrder>;
  },
  onSuccess: (updated) => {
    queryClient.invalidateQueries({ queryKey: ["/api/ppm/work-orders"] });
    if (selectedWO && updated?.id === selectedWO.id) setSelectedWO(updated);
    setShowEditWO(false);
    setEditingWO(null);
    toast({ title: "Work order updated" });
  },
  onError: (error: unknown) => toastError(error, toast),
});
```

Now after clicking Scheduled, the panel receives the server row with `arrivedAt: null`, so `effectiveWOStatus` returns "scheduled" and the UI updates correctly. (Check the existing edit-dialog save path still works — it uses the same mutation; the only behavioural change is the panel now mirrors the server, which is what we want.)

**(b) Optional polish — "In Progress" while on site.** Once a contractor is on site, "On Site" already *is* the in-progress state, so the separate "In Progress" button is redundant and (until 2a) looked broken. This is a judgement call: either leave both buttons (they now behave correctly after the fixes above — In Progress will keep arrivedAt and so still display as On Site, which is acceptable), or hide the "In Progress" button when `selectedWO.arrivedAt` is set to avoid confusion. Hiding it is the cleaner UX but not required to fix the reported bug.

## ALSO (minor, same file) — add the missing `missingDocsAlertedAt` field to the client type

In `client/src/pages/PPM.tsx`, the work order list row reads `wo.missingDocsAlertedAt` (~line 1608) to show the "No documents uploaded" warning, but that field is **not declared** on the `PpmWorkOrder` interface (~lines 82–106). It works at runtime because the API returns it, but it's an untyped property access that will fail `npm run check` (strict `tsc`). Add it alongside the other nullable timestamp fields:

```ts
missingDocsAlertedAt?: string | null;
```

Don't change anything else for this — it's a one-line type addition.

## WHAT NOT TO CHANGE

- Don't change the contractor "arrive" handler (`server/routes/ppm.ts` ~line 2524) — setting `arrivedAt` + `on_site` on arrival is correct.
- Don't remove the `effectiveWOStatus` helper or its `arrivedAt → on_site` override — it's still needed for legacy records and for the normal arrived-but-not-finished case. We're only making a deliberate revert to Scheduled clear the flag.
- Don't touch the document, assign-contractor, or schedule logic.

## VERIFICATION

1. Create a work order, assign a contractor, open the contractor link and tap "I've arrived" → in the admin Work Orders list the status shows **On Site**.
2. Open the work order detail panel → click **Scheduled** → the badge changes to **Scheduled** and stays there after the list refetches and after closing/reopening the panel. The "Arrived on Site" field is now blank.
3. Repeat the arrival, then click **Completed** → status shows **Completed** and the "Arrived on Site" timestamp is still shown (arrival kept on completed records).
4. A work order that has *not* had an arrival still moves freely between Scheduled / In Progress / Overdue / Completed as before — no regression.
5. The "No documents uploaded" warning still appears on overdue work orders with no documents (the `missingDocsAlertedAt` change is type-only — no behaviour change).
6. `npx tsc --noEmit` is clean for `client/src/pages/PPM.tsx`.
7. Tenant isolation unaffected — all queries still run against the customer-scoped database via `req.customerId`.
