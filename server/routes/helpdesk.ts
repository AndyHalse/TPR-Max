import type { Express } from 'express';
import { requireAuth } from '../auth';
import { simpleDatabaseService } from '../simpleDatabaseService';
import { customerDbService } from '../customerDatabase';
import * as isolatedSchema from '../isolatedSchema';
import { eq, sql } from 'drizzle-orm';
import { logger } from '../utils/logger';

const HELPDESK_STATUSES = ["open", "in_progress", "pending", "resolved", "closed"] as const;

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

export function registerHelpdeskRoutes(app: Express): void {

// ── Help Desk routes ─────────────────────────────────────────────────────────

// GET /api/helpdesk/tickets — return all tickets, newest first
app.get("/api/helpdesk/tickets", requireAuth, async (req, res) => {
  try {
    const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);
    const rows = await custDb.select().from(isolatedSchema.helpDeskTickets)
      .orderBy(sql`${isolatedSchema.helpDeskTickets.createdAt} DESC`);
    res.json(rows);
  } catch (error: unknown) {
    logger.error("GET /api/helpdesk/tickets", error);
    res.status(500).json({ error: "Failed to fetch help desk tickets" });
  }
});

// POST /api/helpdesk/tickets — create a ticket with auto-generated ticket_number
app.post("/api/helpdesk/tickets", requireAuth, async (req, res) => {
  try {
    const parsed = isolatedSchema.insertHelpDeskTicketSchema.parse(req.body);
    const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);

    // Base the next number on the highest existing HD-#### number, not the row count —
    // counting rows reuses numbers after a delete. Retry up to 5 times on the off-chance
    // two tickets are created at the same instant (the unique constraint rejects a clash).
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
  } catch (error: unknown) {
    logger.error("POST /api/helpdesk/tickets", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create help desk ticket" });
  }
});

// GET /api/helpdesk/tickets/:id — single ticket
app.get("/api/helpdesk/tickets/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);
    const [row] = await custDb.select().from(isolatedSchema.helpDeskTickets)
      .where(eq(isolatedSchema.helpDeskTickets.id, id));
    if (!row) return res.status(404).json({ error: "Ticket not found" });
    res.json(row);
  } catch (error: unknown) {
    logger.error("GET /api/helpdesk/tickets/:id", error);
    res.status(500).json({ error: "Failed to fetch help desk ticket" });
  }
});

// PUT /api/helpdesk/tickets/:id — update a ticket
app.put("/api/helpdesk/tickets/:id", requireAuth, async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  try {
    const { id } = req.params;
    const updates = pickTicketFields(req.body);
    if (updates.status !== undefined && !HELPDESK_STATUSES.includes(updates.status as typeof HELPDESK_STATUSES[number])) {
      return res.status(400).json({ error: "Invalid status" });
    }
    updates.updatedAt = new Date();
    // Stamp completion date when resolved or closed; clear it when re-opened so a ticket
    // can never appear both open and resolved at the same time.
    if (updates.status !== undefined) {
      if ((updates.status === "resolved" || updates.status === "closed") && !updates.resolvedAt) {
        updates.resolvedAt = new Date();
      } else if (updates.status !== "resolved" && updates.status !== "closed") {
        updates.resolvedAt = null;
      }
    }
    const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);
    const [row] = await custDb.update(isolatedSchema.helpDeskTickets)
      .set(updates)
      .where(eq(isolatedSchema.helpDeskTickets.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Ticket not found" });
    res.json(row);
  } catch (error: unknown) {
    logger.error("PUT /api/helpdesk/tickets/:id", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to update help desk ticket" });
  }
});

// DELETE /api/helpdesk/tickets/:id — delete a ticket
app.delete("/api/helpdesk/tickets/:id", requireAuth, async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  try {
    const { id } = req.params;
    const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);
    await custDb.delete(isolatedSchema.helpDeskTickets).where(eq(isolatedSchema.helpDeskTickets.id, id));
    res.json({ success: true });
  } catch (error: unknown) {
    logger.error("DELETE /api/helpdesk/tickets/:id", error);
    res.status(500).json({ error: "Failed to delete help desk ticket" });
  }
});

// GET /api/helpdesk/stats — ticket counts grouped by status
app.get("/api/helpdesk/stats", requireAuth, async (req, res) => {
  try {
    const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);
    const rows = await custDb.select({
      status: isolatedSchema.helpDeskTickets.status,
      count: sql<number>`count(*)::int`,
    })
      .from(isolatedSchema.helpDeskTickets)
      .groupBy(isolatedSchema.helpDeskTickets.status);
    const stats = Object.fromEntries(rows.map(r => [r.status, r.count]));
    const total = rows.reduce((sum, r) => sum + r.count, 0);
    res.json({ ...stats, total });
  } catch (error: unknown) {
    logger.error("GET /api/helpdesk/stats", error);
    res.status(500).json({ error: "Failed to fetch help desk stats" });
  }
});

// ── End Help Desk routes ──────────────────────────────────────────────────────
}
