# Fix — Help Desk: duplicate ticket numbers after a delete, stale "Resolved" date on re-open, and no input validation (verified against live codebase 14 June 2026)

## The problem (read this first)

Three bugs in the Help Desk module. The first one breaks the audit trail, so it's the priority.

Files involved: `server/routes/helpdesk.ts` (all three fixes) and `server/isolatedSchema.ts` (one-line constraint for Fix 1).

### Bug 1 — Ticket numbers collide after a ticket is deleted (HIGH)

When a ticket is created, the ticket number is worked out from the row count:

```ts
const [countRow] = await custDb.select({ count: sql<number>`count(*)::int` })
  .from(isolatedSchema.helpDeskTickets);
const nextNum = (countRow?.count ?? 0) + 1;
const ticketNumber = `HD-${String(nextNum).padStart(3, "0")}`;
```

`server/routes/helpdesk.ts`, around lines 33–36.

Two problems with counting rows:

1. **Deleting a ticket causes duplicate numbers.** The page has a working "Delete Ticket" button (`DELETE /api/helpdesk/tickets/:id`). Say you have HD-001, HD-002, HD-003 and delete HD-002. The count is now 2, so the next ticket created becomes **HD-003 — a second one.** There's no unique constraint on the `ticket_number` column, so the database happily allows it. The ticket number is the human-facing identity of the ticket; two tickets sharing a number breaks the audit trail this page is built to provide. (The page itself cites the Health & Safety at Work Act 1974 and the Workplace Regulations 1992 — a clean, unique reference per fault actually matters here.)

2. **Two tickets logged at the same moment get the same number.** Both requests read the same count before either has inserted, so both compute the same next number. Less common on a help desk, but it's the same root cause and the same fix removes it.

### Bug 2 — Re-opening a resolved ticket leaves a stale "Resolved" date (MEDIUM)

In `PUT /api/helpdesk/tickets/:id` (around lines 73–75):

```ts
if (updates.status === "resolved" && !updates.resolvedAt) {
  updates.resolvedAt = new Date();
}
```

This stamps `resolvedAt` when a ticket is resolved, but **nothing ever clears it.** Re-open a resolved ticket (move it back to open / in progress / pending) and the detail panel still shows a "Resolved" date — the ticket looks both open and resolved at once. Separately, moving a ticket straight to **"closed"** (the dropdown allows open → closed directly) never stamps `resolvedAt` at all, so genuinely-finished tickets can have no completion date.

### Bug 3 — The update route writes the raw request body with no validation (LOW–MEDIUM)

Still in `PUT /api/helpdesk/tickets/:id`:

```ts
const updates: Record<string, unknown> = { ...req.body };
delete updates.id;
delete updates.ticketNumber;
delete updates.createdAt;
```

The whole request body is spread into the database update with only a few fields blacklisted. There's no check that `status` is one of the five allowed values (`open`, `in_progress`, `pending`, `resolved`, `closed`). A wrong value gets saved as-is, and that quietly breaks the summary cards at the top of the page: `GET /api/helpdesk/stats` groups by status, so a stray status still counts toward **total** but shows in **none** of the four cards — the numbers stop adding up. The `POST` route validates against `insertHelpDeskTicketSchema`, but that schema only checks types, not the allowed status/priority/category values either.

**Scope:** `server/routes/helpdesk.ts` (POST + PUT handlers) and one line in `server/isolatedSchema.ts`. Do not change the client page or the stats query. Run `npm run check` and `npm run db:push` when done.

---

## Fix 1 — Generate the ticket number from the highest existing number, add a unique constraint, and retry on collision (PRIORITY)

The goal: never reuse a number, even after deletions or simultaneous creates.

**Step 1 — add a unique constraint on `ticket_number`.** In `server/isolatedSchema.ts`, find the `helpDeskTickets` table (around line 2469). Change the `ticketNumber` column so it's unique:

```ts
  ticketNumber: text("ticket_number").unique(),   // e.g. "HD-001", auto-generated on create — unique per tenant
```

This is the safety net: even if two requests race, the database refuses the duplicate and the retry below picks the next free number.

**Step 2 — base the next number on the highest number that exists, not the row count, and retry if the number is taken.** In `server/routes/helpdesk.ts`, replace the body of the `POST /api/helpdesk/tickets` handler (the part after `const parsed = ...`) with:

```ts
    const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);

    // Work out the next number from the highest existing HD-#### number, not the row
    // count — counting rows reuses numbers after a delete. Retry on the off-chance two
    // tickets are created at the same instant (the unique constraint will reject a clash).
    let row;
    for (let attempt = 0; attempt < 5; attempt++) {
      const [maxRow] = await custDb
        .select({
          maxNum: sql<number>`COALESCE(MAX(NULLIF(regexp_replace(${isolatedSchema.helpDeskTickets.ticketNumber}, '\\D', '', 'g'), '')::int), 0)`,
        })
        .from(isolatedSchema.helpDeskTickets);
      const nextNum = (maxRow?.maxNum ?? 0) + 1 + attempt;
      const ticketNumber = `HD-${String(nextNum).padStart(3, "0")}`;
      try {
        [row] = await custDb.insert(isolatedSchema.helpDeskTickets)
          .values({ ...parsed, ticketNumber })
          .returning();
        break;
      } catch (err: unknown) {
        // 23505 = Postgres unique_violation — another ticket grabbed this number; try the next one.
        const code = (err as { code?: string })?.code;
        if (code === "23505" && attempt < 4) continue;
        throw err;
      }
    }
    res.status(201).json(row);
```

`regexp_replace(..., '\D', '', 'g')` strips everything except the digits from `HD-003` to give `3`, so the max works regardless of the `HD-` prefix. Deleting the highest ticket and then creating a new one will skip the deleted number rather than reuse it — that's correct: in an audit trail you never want a number to mean two different tickets.

Leave the existing `try/catch` and `logger.error` wrapper around the handler as it is.

---

## Fix 2 — Clear the resolved date when a ticket is re-opened, and stamp it on close too

In `PUT /api/helpdesk/tickets/:id`, replace:

```ts
    if (updates.status === "resolved" && !updates.resolvedAt) {
      updates.resolvedAt = new Date();
    }
```

with:

```ts
    // Stamp the completion date when a ticket is resolved or closed; clear it if the
    // ticket is re-opened, so it can never show as open and resolved at the same time.
    if (updates.status !== undefined) {
      if ((updates.status === "resolved" || updates.status === "closed") && !updates.resolvedAt) {
        updates.resolvedAt = new Date();
      } else if (updates.status !== "resolved" && updates.status !== "closed") {
        updates.resolvedAt = null;
      }
    }
```

---

## Fix 3 — Validate the status (and whitelist the editable fields) on update

Still in `PUT /api/helpdesk/tickets/:id`. The goal: only let the update endpoint change the fields the detail panel actually edits, and reject an invalid status before it reaches the database.

**Step 1.** Near the top of the file, just after the imports, add the allowed-value lists and a small whitelist helper:

```ts
const HELPDESK_STATUSES = ["open", "in_progress", "pending", "resolved", "closed"] as const;

// Only these fields may be changed via the update endpoint. ticketNumber, createdAt,
// id and reportedBy* are set once at creation and must not be editable here.
const TICKET_EDITABLE_FIELDS = [
  "title", "description", "category", "priority", "status",
  "location", "assetId", "assignedTo", "resolutionNotes",
] as const;

function pickTicketFields(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const key of TICKET_EDITABLE_FIELDS) {
    if (body[key] !== undefined) out[key] = body[key] === "" ? null : body[key];
  }
  return out;
}
```

**Step 2.** In the `PUT` handler, replace:

```ts
    const updates: Record<string, unknown> = { ...req.body };
    delete updates.id;
    delete updates.ticketNumber;
    delete updates.createdAt;
    updates.updatedAt = new Date();
```

with:

```ts
    const updates = pickTicketFields(req.body);
    if (updates.status !== undefined && !HELPDESK_STATUSES.includes(updates.status as typeof HELPDESK_STATUSES[number])) {
      return res.status(400).json({ error: "Invalid status" });
    }
    updates.updatedAt = new Date();
```

The `resolvedAt` logic from Fix 2 sits straight after this, unchanged. The detail panel only ever sends `status`, `priority`, `assignedTo` and `resolutionNotes`, so the form keeps working exactly as it does today — but the ticket number, creation date and reporter details can no longer be overwritten by a crafted request, and an invalid status is rejected before it can break the summary counts.

---

## How to test when done

1. `npm run check` passes with no new type errors; `npm run db:push` applies the unique constraint.
2. **Collision test (the important one):** create three tickets (HD-001, HD-002, HD-003). Delete HD-002. Create another ticket — confirm it is **HD-004**, not a second HD-003. Before this fix it would have been HD-003.
3. **Re-open test:** create a ticket, set it to Resolved (confirm a Resolved date appears), then move it back to Open — confirm the Resolved date clears. Set another ticket straight to Closed and confirm it gets a Resolved/completion date.
4. **Validation test:** send `PUT /api/helpdesk/tickets/:id` with `{ "status": "banana" }` and confirm it's rejected with 400 and the ticket is unchanged. Send `{ "ticketNumber": "HD-999", "reportedByName": "hacker" }` and confirm both are ignored.
5. **Summary cards:** confirm the four cards plus closed tickets reconcile against the total — no "missing" tickets caused by a stray status.
