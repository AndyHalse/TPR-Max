import type { Express } from 'express';
import { requireAuth } from '../auth';
import { simpleDatabaseService } from '../simpleDatabaseService';
import { customerDbService } from '../customerDatabase';
import * as isolatedSchema from '../isolatedSchema';
import { eq, sql } from 'drizzle-orm';
import { logger } from '../utils/logger';

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
    const [countRow] = await custDb.select({ count: sql<number>`count(*)::int` })
      .from(isolatedSchema.helpDeskTickets);
    const nextNum = (countRow?.count ?? 0) + 1;
    const ticketNumber = `HD-${String(nextNum).padStart(3, "0")}`;
    const [row] = await custDb.insert(isolatedSchema.helpDeskTickets)
      .values({ ...parsed, ticketNumber })
      .returning();
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
    const updates: Record<string, unknown> = { ...req.body };
    delete updates.id;
    delete updates.ticketNumber;
    delete updates.createdAt;
    updates.updatedAt = new Date();
    if (updates.status === "resolved" && !updates.resolvedAt) {
      updates.resolvedAt = new Date();
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
