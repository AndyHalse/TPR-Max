---
name: line_manager_id raw SQL only
description: staff.line_manager_id was added via raw ALTER TABLE, not in Drizzle schema — must be handled with raw SQL
---

## Rule
`line_manager_id` on the `staff` table exists in the database but is NOT defined in the Drizzle schema (`isolatedSchema.ts`). Any field derived from it (`lineManagerId`) will be silently stripped by `insertStaffSchema.partial().parse()` before Drizzle's `.set()` call.

**Why:** The column was added via a raw `ALTER TABLE` migration outside of the Drizzle schema definition.

**How to apply:**
- **Write:** Destructure `lineManagerId` from `req.body` *before* Zod parsing, then after the Drizzle update apply via raw SQL:
  ```ts
  const pool = (customerDb as any).$client ?? (customerDb as any).session?.client;
  await pool.query(`UPDATE "${schemaName}".staff SET line_manager_id = $1 WHERE id = $2`, [val, id]);
  ```
- **Read:** The org-chart endpoint already reads it via raw SQL SELECT correctly.
- Do NOT add it to the Drizzle schema without an idempotent migration — the column already exists.
