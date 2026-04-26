import type { Express } from 'express';
import { randomUUID } from 'crypto';
import path from 'path';
import cron from 'node-cron';
import { requireAuth } from '../auth';
import { customerDbService } from '../customerDatabase';
import { simpleDatabaseService } from '../simpleDatabaseService';
import { EmailService } from '../emailService';
import { ObjectStorageService } from '../objectStorage';
import { logger } from '../utils/logger';
import * as isolatedSchema from '../isolatedSchema';
import { eq, and, sql, desc, or, not, ne, isNotNull, gt, gte, lt, lte, inArray, count } from 'drizzle-orm';
import { ppmTokenCacheGet, ppmTokenCacheSet, ppmTokenCacheEvict, ppmPublicRateLimit } from '../routeState';

// ─── Module-scope helpers ─────────────────────────────────────────────────────

function calcNextDueDate(startDate: string, frequency: string, customDays?: number | null): string {
  const d = new Date(startDate);
  if (isNaN(d.getTime())) return startDate;
  switch (frequency) {
    case "weekly":    d.setDate(d.getDate() + 7); break;
    case "monthly":   d.setMonth(d.getMonth() + 1); break;
    case "quarterly": d.setMonth(d.getMonth() + 3); break;
    case "biannual":
    case "semi-annual":
    case "biannually": d.setMonth(d.getMonth() + 6); break;
    case "annual":
    case "annually":
    case "yearly":    d.setFullYear(d.getFullYear() + 1); break;
    case "custom":    d.setDate(d.getDate() + (customDays ?? 30)); break;
    default:          d.setMonth(d.getMonth() + 1); break;
  }
  return d.toISOString().split('T')[0];
}

// ── PPM feature gate ────────────────────────────────────────────────────────
const requirePPMFeature = async (req: any, res: any, next: any) => {
  try {
    const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const settings = await simpleDatabaseService.getCompanySettings(context);
    if (!settings?.featurePPM) {
      return res.status(403).json({
        error: 'PPM module is not enabled for your account. Please contact support.'
      });
    }
    next();
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────

export function registerPPMRoutes(app: Express): void {
app.use('/api/ppm', requireAuth, requirePPMFeature);

// PPM Assets
app.get("/api/ppm/assets", requireAuth, async (req, res) => {
  try {
    const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);
    const rows = await custDb.select().from(isolatedSchema.ppmAssets).orderBy(isolatedSchema.ppmAssets.name);
    res.json(rows);
  } catch (error: unknown) {
    console.error("GET /api/ppm/assets", error);
    res.status(500).json({ error: "Failed to fetch PPM assets" });
  }
});

app.post("/api/ppm/assets", requireAuth, async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  try {
    const parsed = isolatedSchema.insertPpmAssetSchema.parse(req.body);
    const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);
    const [row] = await custDb.insert(isolatedSchema.ppmAssets).values(parsed).returning();
    res.status(201).json(row);
  } catch (error: unknown) {
    console.error("POST /api/ppm/assets", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create PPM asset" });
  }
});

app.put("/api/ppm/assets/:id", requireAuth, async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  try {
    const { id } = req.params;
    const parsed = isolatedSchema.insertPpmAssetSchema.partial().parse(req.body);
    const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);
    const [row] = await custDb.update(isolatedSchema.ppmAssets).set(parsed).where(eq(isolatedSchema.ppmAssets.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Asset not found" });
    res.json(row);
  } catch (error: unknown) {
    console.error("PUT /api/ppm/assets/:id", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to update PPM asset" });
  }
});

app.delete("/api/ppm/assets/:id", requireAuth, async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  try {
    const { id } = req.params;
    const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);
    await custDb.delete(isolatedSchema.ppmAssets).where(eq(isolatedSchema.ppmAssets.id, id));
    res.json({ success: true });
  } catch (error: unknown) {
    console.error("DELETE /api/ppm/assets/:id", error);
    res.status(500).json({ error: "Failed to delete PPM asset" });
  }
});

// POST /api/ppm/assets/:id/duplicate — clone an asset with a new name, clearing unique fields
app.post("/api/ppm/assets/:id/duplicate", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);
    const [original] = await custDb.select().from(isolatedSchema.ppmAssets).where(eq(isolatedSchema.ppmAssets.id, id));
    if (!original) return res.status(404).json({ error: "Asset not found" });
    const { id: _id, createdAt: _createdAt, assetRef: _assetRef, serialNumber: _serialNumber, ...rest } = original;
    const [copy] = await custDb.insert(isolatedSchema.ppmAssets).values({
      ...rest,
      name: `Copy of ${original.name}`,
      assetRef: null,
      serialNumber: null,
      status: "active",
    }).returning();
    res.status(201).json(copy);
  } catch (error: unknown) {
    console.error("POST /api/ppm/assets/:id/duplicate", error);
    res.status(500).json({ error: "Failed to duplicate asset" });
  }
});

// ── PPM Asset Groups CRUD ────────────────────────────────────────────────────
app.get("/api/ppm/asset-groups", requireAuth, async (req, res) => {
  try {
    const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);
    const rows = await custDb.select().from(isolatedSchema.ppmAssetGroups).orderBy(isolatedSchema.ppmAssetGroups.name);
    res.json(rows);
  } catch (error: unknown) {
    console.error("GET /api/ppm/asset-groups", error);
    res.status(500).json({ error: "Failed to fetch asset groups" });
  }
});

app.post("/api/ppm/asset-groups", requireAuth, async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  try {
    const parsed = isolatedSchema.insertPpmAssetGroupSchema.parse(req.body);
    const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);
    const [row] = await custDb.insert(isolatedSchema.ppmAssetGroups).values(parsed).returning();
    res.status(201).json(row);
  } catch (error: unknown) {
    console.error("POST /api/ppm/asset-groups", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create asset group" });
  }
});

app.put("/api/ppm/asset-groups/:id", requireAuth, async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  try {
    const { id } = req.params;
    const parsed = isolatedSchema.insertPpmAssetGroupSchema.partial().parse(req.body);
    const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);
    const [row] = await custDb.update(isolatedSchema.ppmAssetGroups).set(parsed).where(eq(isolatedSchema.ppmAssetGroups.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Asset group not found" });
    res.json(row);
  } catch (error: unknown) {
    console.error("PUT /api/ppm/asset-groups/:id", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to update asset group" });
  }
});

app.delete("/api/ppm/asset-groups/:id", requireAuth, async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  try {
    const { id } = req.params;
    const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);
    // Detach all assets from the group before deleting (FK is set null on delete, but do it explicitly)
    await custDb.update(isolatedSchema.ppmAssets).set({ groupId: null }).where(eq(isolatedSchema.ppmAssets.groupId, id));
    await custDb.delete(isolatedSchema.ppmAssetGroups).where(eq(isolatedSchema.ppmAssetGroups.id, id));
    res.json({ success: true });
  } catch (error: unknown) {
    console.error("DELETE /api/ppm/asset-groups/:id", error);
    res.status(500).json({ error: "Failed to delete asset group" });
  }
});

// PPM Templates
app.get("/api/ppm/templates", requireAuth, async (req, res) => {
  try {
    const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);
    const rows = await custDb.select().from(isolatedSchema.ppmTemplates).orderBy(isolatedSchema.ppmTemplates.name);
    res.json(rows);
  } catch (error: unknown) {
    console.error("GET /api/ppm/templates", error);
    res.status(500).json({ error: "Failed to fetch PPM templates" });
  }
});

app.post("/api/ppm/templates", requireAuth, async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  try {
    const parsed = isolatedSchema.insertPpmTemplateSchema.parse(req.body);
    const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);
    const [row] = await custDb.insert(isolatedSchema.ppmTemplates).values(parsed).returning();
    res.status(201).json(row);
  } catch (error: unknown) {
    console.error("POST /api/ppm/templates", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create PPM template" });
  }
});

app.put("/api/ppm/templates/:id", requireAuth, async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  try {
    const { id } = req.params;
    const parsed = isolatedSchema.insertPpmTemplateSchema.partial().parse(req.body);
    const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);
    const [row] = await custDb.update(isolatedSchema.ppmTemplates).set(parsed).where(eq(isolatedSchema.ppmTemplates.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Template not found" });
    res.json(row);
  } catch (error: unknown) {
    console.error("PUT /api/ppm/templates/:id", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to update PPM template" });
  }
});

app.delete("/api/ppm/templates/:id", requireAuth, async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  try {
    const { id } = req.params;
    const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);
    await custDb.delete(isolatedSchema.ppmTemplates).where(eq(isolatedSchema.ppmTemplates.id, id));
    res.json({ success: true });
  } catch (error: unknown) {
    console.error("DELETE /api/ppm/templates/:id", error);
    res.status(500).json({ error: "Failed to delete PPM template" });
  }
});

// PPM Schedules
app.get("/api/ppm/schedules", requireAuth, async (req, res) => {
  try {
    const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);
    const rows = await custDb.select().from(isolatedSchema.ppmSchedules).orderBy(isolatedSchema.ppmSchedules.nextDueDate);
    // Compute overdue status at query time
    const today = new Date().toISOString().split('T')[0];
    const enriched = rows.map(r => ({
      ...r,
      status: r.status !== "completed" && r.status !== "cancelled" && r.nextDueDate < today ? "overdue" : r.status,
    }));
    res.json(enriched);
  } catch (error: unknown) {
    console.error("GET /api/ppm/schedules", error);
    res.status(500).json({ error: "Failed to fetch PPM schedules" });
  }
});

app.post("/api/ppm/schedules", requireAuth, async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  try {
    const body = req.body;
    const nextDueDate = calcNextDueDate(body.startDate, body.frequency, body.customDays);
    const parsed = isolatedSchema.insertPpmScheduleSchema.parse({ ...body, nextDueDate });
    const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);
    const [row] = await custDb.insert(isolatedSchema.ppmSchedules).values(parsed).returning();
    res.status(201).json(row);
  } catch (error: unknown) {
    console.error("POST /api/ppm/schedules", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create PPM schedule" });
  }
});

app.put("/api/ppm/schedules/:id", requireAuth, async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  try {
    const { id } = req.params;
    const body = req.body;
    // Backend is authoritative: always recalculate nextDueDate from startDate + frequency
    if (body.startDate && body.frequency) {
      body.nextDueDate = calcNextDueDate(body.startDate, body.frequency, body.customDays);
    }
    const parsed = isolatedSchema.insertPpmScheduleSchema.partial().parse(body);
    const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);
    const [row] = await custDb.update(isolatedSchema.ppmSchedules).set(parsed).where(eq(isolatedSchema.ppmSchedules.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Schedule not found" });
    res.json(row);
  } catch (error: unknown) {
    console.error("PUT /api/ppm/schedules/:id", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to update PPM schedule" });
  }
});

app.delete("/api/ppm/schedules/:id", requireAuth, async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  try {
    const { id } = req.params;
    const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);
    await custDb.delete(isolatedSchema.ppmSchedules).where(eq(isolatedSchema.ppmSchedules.id, id));
    res.json({ success: true });
  } catch (error: unknown) {
    console.error("DELETE /api/ppm/schedules/:id", error);
    res.status(500).json({ error: "Failed to delete PPM schedule" });
  }
});

// ── PPM Work Orders ──────────────────────────────────────────────────────────

// GET /api/ppm/expiry-count — lightweight summary of expired/expiring-soon document counts (for nav badge)
app.get('/api/ppm/expiry-count', requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== 'admin') return res.status(403).json({ error: 'Administrator access required' });
    const context = await simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);
    const docs = await custDb.select({
      expiryDate: isolatedSchema.ppmWorkOrderDocuments.expiryDate,
    }).from(isolatedSchema.ppmWorkOrderDocuments);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30Days = new Date(today);
    in30Days.setDate(in30Days.getDate() + 30);
    let expiredCount = 0;
    let expiringSoonCount = 0;
    for (const doc of docs) {
      if (!doc.expiryDate) continue;
      const exp = new Date(doc.expiryDate);
      if (exp <= today) {
        expiredCount++;
      } else if (exp <= in30Days) {
        expiringSoonCount++;
      }
    }
    res.json({ expiredCount, expiringSoonCount, total: expiredCount + expiringSoonCount });
  } catch (error) {
    console.error('GET /api/ppm/expiry-count', error);
    res.status(500).json({ error: 'Failed to fetch PPM expiry count' });
  }
});

// GET /api/ppm/work-orders — list all work orders for customer (admin only; tokens omitted from list)
app.get("/api/ppm/work-orders", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    const context = await simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);

    // Optional year filter — EXTRACT(YEAR FROM due_date) = year
    const yearParam = req.query.year ? parseInt(req.query.year as string, 10) : null;
    const yearCondition = yearParam ? sql`EXTRACT(YEAR FROM ${isolatedSchema.ppmWorkOrders.dueDate}) = ${yearParam}` : undefined;

    const rows = await custDb.select().from(isolatedSchema.ppmWorkOrders)
      .where(yearCondition)
      .orderBy(isolatedSchema.ppmWorkOrders.createdAt);

    // Omit bearer token fields from list payload; use GET /api/ppm/work-orders/:id/token to get link
    const sanitized = rows.map(({ accessToken: _t, accessTokenExpiresAt: _e, ...rest }) => rest);

    // Attach templateType via schedule → template join
    const scheduleIds = [...new Set(sanitized.map(w => w.scheduleId).filter(Boolean))] as string[];
    const templateTypeByScheduleId: Record<string, string | null> = {};
    if (scheduleIds.length > 0) {
      const schedRows = await custDb.select({
        id: isolatedSchema.ppmSchedules.id,
        templateType: isolatedSchema.ppmTemplates.type,
      }).from(isolatedSchema.ppmSchedules)
        .leftJoin(isolatedSchema.ppmTemplates, eq(isolatedSchema.ppmSchedules.templateId, isolatedSchema.ppmTemplates.id))
        .where(inArray(isolatedSchema.ppmSchedules.id, scheduleIds));
      for (const s of schedRows) templateTypeByScheduleId[s.id] = s.templateType ?? null;
    }

    // Attach aggregated document expiry counts so the list view can show inline indicators
    const woIds = sanitized.map(w => w.id);
    let expiryCounts: Record<string, { expiredDocCount: number; expiringSoonDocCount: number }> = {};
    if (woIds.length > 0) {
      const docs = await custDb.select({
        workOrderId: isolatedSchema.ppmWorkOrderDocuments.workOrderId,
        expiryDate: isolatedSchema.ppmWorkOrderDocuments.expiryDate,
      }).from(isolatedSchema.ppmWorkOrderDocuments).where(inArray(isolatedSchema.ppmWorkOrderDocuments.workOrderId, woIds));
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const in30Days = new Date(today);
      in30Days.setDate(in30Days.getDate() + 30);
      for (const doc of docs) {
        if (!doc.expiryDate) continue;
        const exp = new Date(doc.expiryDate);
        if (!expiryCounts[doc.workOrderId]) expiryCounts[doc.workOrderId] = { expiredDocCount: 0, expiringSoonDocCount: 0 };
        if (exp <= today) {
          expiryCounts[doc.workOrderId].expiredDocCount++;
        } else if (exp <= in30Days) {
          expiryCounts[doc.workOrderId].expiringSoonDocCount++;
        }
      }
    }

    const withExpiry = sanitized.map(wo => ({
      ...wo,
      templateType: wo.scheduleId ? (templateTypeByScheduleId[wo.scheduleId] ?? null) : null,
      expiredDocCount: expiryCounts[wo.id]?.expiredDocCount ?? 0,
      expiringSoonDocCount: expiryCounts[wo.id]?.expiringSoonDocCount ?? 0,
    }));
    res.json(withExpiry);
  } catch (error: unknown) {
    console.error("GET /api/ppm/work-orders", error);
    res.status(500).json({ error: "Failed to fetch PPM work orders" });
  }
});

// GET /api/ppm/work-orders/:id/token — return the contractor link for a specific work order (admin only)
app.get("/api/ppm/work-orders/:id/token", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    const { id } = req.params;
    const context = await simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);
    const [wo] = await custDb.select({
      accessToken: isolatedSchema.ppmWorkOrders.accessToken,
      accessTokenExpiresAt: isolatedSchema.ppmWorkOrders.accessTokenExpiresAt,
    }).from(isolatedSchema.ppmWorkOrders).where(eq(isolatedSchema.ppmWorkOrders.id, id));
    if (!wo) return res.status(404).json({ error: "Work order not found" });
    const baseUrl = process.env.REPLIT_DOMAINS
      ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
      : (process.env.PUBLIC_URL || process.env.BASE_URL || "http://localhost:5000");
    res.json({
      accessToken: wo.accessToken,
      accessTokenExpiresAt: wo.accessTokenExpiresAt,
      contractorUrl: wo.accessToken ? `${baseUrl}/ppm/work-order/${wo.accessToken}` : null,
    });
  } catch (error: unknown) {
    console.error("GET /api/ppm/work-orders/:id/token", error);
    res.status(500).json({ error: "Failed to fetch work order token" });
  }
});

// POST /api/ppm/work-orders — create a new work order
app.post("/api/ppm/work-orders", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    const context = await simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);
    const accessToken = randomBytes(24).toString("hex");
    const accessTokenExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days
    const parsed = isolatedSchema.insertPpmWorkOrderSchema.parse({ ...req.body, accessToken, accessTokenExpiresAt });
    const [row] = await custDb.insert(isolatedSchema.ppmWorkOrders).values(parsed).returning();
    res.json(row);
  } catch (error: unknown) {
    console.error("POST /api/ppm/work-orders", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create PPM work order" });
  }
});

// PUT /api/ppm/work-orders/:id — update a work order
app.put("/api/ppm/work-orders/:id", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    const { id } = req.params;
    const context = await simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);
    const updates: Record<string, unknown> = { ...req.body };
    delete updates.id;
    delete updates.createdAt;
    delete updates.accessToken;
    if (updates.status === "completed" && !updates.completedDate) {
      updates.completedDate = new Date().toISOString().split("T")[0];
    }
    // If status is being reset away from overdue, clear the alert flag so a future overdue triggers a new alert
    if (updates.status && updates.status !== "overdue") {
      updates.overdueAlertedAt = null;
    }
    const [row] = await custDb.update(isolatedSchema.ppmWorkOrders).set(updates).where(eq(isolatedSchema.ppmWorkOrders.id, id)).returning();

    // Advance the linked schedule's nextDueDate when a work order is marked completed
    if (updates.status === "completed" && row?.scheduleId) {
      try {
        const [schedule] = await custDb.select()
          .from(isolatedSchema.ppmSchedules)
          .where(eq(isolatedSchema.ppmSchedules.id, row.scheduleId))
          .limit(1);
        if (schedule?.nextDueDate) {
          const newDue = calcNextDueDate(schedule.nextDueDate, schedule.frequency, schedule.customDays ?? undefined);
          await custDb.update(isolatedSchema.ppmSchedules)
            .set({
              nextDueDate: newDue,
              status: "scheduled",
              lastCompletedDate: new Date().toISOString().split("T")[0],
            })
            .where(eq(isolatedSchema.ppmSchedules.id, schedule.id));
          console.log(`✅ [PPM] Schedule ${schedule.id} advanced: ${schedule.nextDueDate} → ${newDue}`);
        }
      } catch (schedErr) {
        console.error("⚠️ [PPM] Failed to advance schedule after work order completion:", schedErr);
      }
    }

    res.json(row);
  } catch (error: unknown) {
    console.error("PUT /api/ppm/work-orders/:id", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to update PPM work order" });
  }
});

// DELETE /api/ppm/work-orders/:id — delete a work order
app.delete("/api/ppm/work-orders/:id", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    const { id } = req.params;
    const context = await simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);
    await custDb.delete(isolatedSchema.ppmWorkOrders).where(eq(isolatedSchema.ppmWorkOrders.id, id));
    res.json({ success: true });
  } catch (error: unknown) {
    console.error("DELETE /api/ppm/work-orders/:id", error);
    res.status(500).json({ error: "Failed to delete PPM work order" });
  }
});

// POST /api/ppm/work-orders/:id/duplicate — clone a work order, resetting status/completion fields
app.post("/api/ppm/work-orders/:id/duplicate", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    const { id } = req.params;
    const context = await simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);
    const [original] = await custDb.select().from(isolatedSchema.ppmWorkOrders).where(eq(isolatedSchema.ppmWorkOrders.id, id));
    if (!original) return res.status(404).json({ error: "Work order not found" });
    const accessToken = randomBytes(24).toString("hex");
    const accessTokenExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const [copy] = await custDb.insert(isolatedSchema.ppmWorkOrders).values({
      scheduleId: original.scheduleId,
      assetId: original.assetId,
      title: `${original.title} (Copy)`,
      description: original.description,
      status: "scheduled",
      contractorCompanyId: original.contractorCompanyId,
      contractorCompanyName: original.contractorCompanyName,
      contractorWorkerId: original.contractorWorkerId,
      contractorWorkerName: original.contractorWorkerName,
      assignedEmail: original.assignedEmail,
      dueDate: original.dueDate,
      notes: original.notes,
      requiresCertificate: original.requiresCertificate,
      accessToken,
      accessTokenExpiresAt,
    }).returning();
    res.json(copy);
  } catch (error: unknown) {
    console.error("POST /api/ppm/work-orders/:id/duplicate", error);
    res.status(500).json({ error: "Failed to duplicate work order" });
  }
});

// POST /api/ppm/work-orders/:id/assign — assign contractor and send email
app.post("/api/ppm/work-orders/:id/assign", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    const { id } = req.params;
    const { contractorCompanyId, contractorCompanyName, contractorWorkerId, contractorWorkerName, assignedEmail } = req.body;
    const context = await simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);

    const [wo] = await custDb.select().from(isolatedSchema.ppmWorkOrders).where(eq(isolatedSchema.ppmWorkOrders.id, id));
    if (!wo) return res.status(404).json({ error: "Work order not found" });

    // Validate contractor IDs against the contractors tables to prevent inconsistent assignment metadata
    if (contractorCompanyId) {
      const [company] = await custDb.select({ id: isolatedSchema.contractorCompanies.id })
        .from(isolatedSchema.contractorCompanies)
        .where(eq(isolatedSchema.contractorCompanies.id, contractorCompanyId));
      if (!company) return res.status(400).json({ error: "Contractor company not found" });
    }
    if (contractorWorkerId) {
      const workerQuery = custDb.select({ id: isolatedSchema.contractorWorkers.id })
        .from(isolatedSchema.contractorWorkers)
        .where(eq(isolatedSchema.contractorWorkers.id, contractorWorkerId));
      const [worker] = await workerQuery;
      if (!worker) return res.status(400).json({ error: "Contractor worker not found" });
      // If both company and worker are provided, verify the worker belongs to the company
      if (contractorCompanyId) {
        const [workerWithCompany] = await custDb.select({ id: isolatedSchema.contractorWorkers.id })
          .from(isolatedSchema.contractorWorkers)
          .where(
            and(
              eq(isolatedSchema.contractorWorkers.id, contractorWorkerId),
              eq(isolatedSchema.contractorWorkers.companyId, contractorCompanyId)
            )
          );
        if (!workerWithCompany) return res.status(400).json({ error: "Contractor worker does not belong to the selected company" });
      }
    }

    // Rotate access token on every assignment/reassignment so old recipients lose access
    const newAccessToken = randomBytes(24).toString("hex");
    const newTokenExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days from now

    const [updated] = await custDb.update(isolatedSchema.ppmWorkOrders)
      .set({ contractorCompanyId, contractorCompanyName, contractorWorkerId, contractorWorkerName, assignedEmail, accessToken: newAccessToken, accessTokenExpiresAt: newTokenExpiresAt })
      .where(eq(isolatedSchema.ppmWorkOrders.id, id))
      .returning();

    // Send notification email to the assigned contractor (only if email provided — explicit no-notification semantics if omitted)
    let notificationSent = false;
    if (assignedEmail) {
      try {
        const settingsRows = await custDb.execute(`SELECT company_name, email, phone, address FROM company_settings LIMIT 1`);
        const settings = settingsRows.rows[0] as { company_name?: string; email?: string } | undefined;
        const companyName = (settings?.company_name as string) || "TPR-Max";
        const baseUrl = process.env.REPLIT_DOMAINS
          ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
          : (process.env.PUBLIC_URL || process.env.BASE_URL || "http://localhost:5000");
        const workOrderUrl = `${baseUrl}/ppm/work-order/${newAccessToken}`;
        const recipientName = contractorWorkerName || contractorCompanyName || "Contractor";
        const emailSvc = new EmailService(context.customerId);
        await emailSvc.sendEmail({
          to: assignedEmail,
          subject: `PPM Work Order Assigned: ${wo.title}`,
          companyName,
          html: `
            <!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f6f6f6;margin:0;padding:20px">
            <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1)">
              <div style="background:#1d4ed8;color:#fff;padding:24px 28px">
                <h1 style="margin:0;font-size:20px">PPM Work Order Assigned</h1>
                <p style="margin:6px 0 0;opacity:.85;font-size:14px">${companyName}</p>
              </div>
              <div style="padding:28px">
                <p style="font-size:16px;color:#1f2937">Hello ${recipientName},</p>
                <p style="color:#374151">You have been assigned a Planned Preventative Maintenance work order.</p>
                <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:16px;margin:20px 0">
                  <p style="margin:0 0 8px;font-weight:600;color:#0c4a6e;font-size:15px">${wo.title}</p>
                  ${wo.description ? `<p style="margin:0 0 8px;color:#374151;font-size:14px">${wo.description}</p>` : ""}
                  ${wo.dueDate ? `<p style="margin:0;color:#374151;font-size:14px"><strong>Due:</strong> ${new Date(wo.dueDate).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" })}</p>` : ""}
                </div>
                <div style="text-align:center;margin:28px 0">
                  <a href="${workOrderUrl}" style="background:#1d4ed8;color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-weight:600;font-size:15px;display:inline-block">View Work Order</a>
                </div>
                <p style="color:#6b7280;font-size:13px">Use the button above to view details, update status, add notes and upload service documents. The link works on mobile and desktop.</p>
              </div>
              <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 28px;text-align:center">
                <p style="margin:0;color:#9ca3af;font-size:12px">This email was sent by ${companyName} via TPR-Max PPM system.</p>
              </div>
            </div>
            </body></html>
          `,
          text: `PPM Work Order Assigned: ${wo.title}\n\nHello ${recipientName},\n\nYou have been assigned a PPM work order.\n\nTitle: ${wo.title}\n${wo.description ? `Description: ${wo.description}\n` : ""}${wo.dueDate ? `Due: ${wo.dueDate}\n` : ""}\nView your work order at:\n${workOrderUrl}\n\n${companyName}`,
        });
        notificationSent = true;
      } catch (emailErr) {
        console.error("PPM work order assignment email failed:", emailErr);
      }
    }
    // Return explicit notificationSent flag so UI/callers know whether email was dispatched
    res.json({ ...updated, notificationSent });
  } catch (error: unknown) {
    console.error("POST /api/ppm/work-orders/:id/assign", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to assign contractor" });
  }
});

// GET /api/ppm/work-orders/:id/documents — list documents for a work order (admin only)
app.get("/api/ppm/work-orders/:id/documents", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    const { id } = req.params;
    const context = await simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);
    const docs = await custDb.select().from(isolatedSchema.ppmWorkOrderDocuments)
      .where(eq(isolatedSchema.ppmWorkOrderDocuments.workOrderId, id))
      .orderBy(isolatedSchema.ppmWorkOrderDocuments.createdAt);
    res.json(docs);
  } catch (error: unknown) {
    console.error("GET /api/ppm/work-orders/:id/documents", error);
    res.status(500).json({ error: "Failed to fetch documents" });
  }
});

// POST /api/ppm/work-orders/:id/documents — upload a document (admin only)
app.post("/api/ppm/work-orders/:id/documents", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    const { id } = req.params;
    const { fileName, fileUrl, fileType, uploadedBy, expiryDate, referenceNumber, issuedBy } = req.body;
    if (!fileName || !fileUrl) return res.status(400).json({ error: "fileName and fileUrl required" });
    // Only allow paths produced by the object storage upload endpoint
    if (typeof fileUrl !== "string" || !fileUrl.startsWith("/objects/")) {
      return res.status(400).json({ error: "Invalid file URL — must be an object storage path" });
    }
    const context = await simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);
    // No document count cap on admin uploads — admins may attach additional documents beyond what contractors upload
    const resolvedFileType = fileType || "other";
    // If a replacement document with a new expiry date is being uploaded for the same file type,
    // reset expiryAlertedAt on existing docs of that type so the cron can send a fresh alert
    if (expiryDate && resolvedFileType !== "other") {
      await custDb.update(isolatedSchema.ppmWorkOrderDocuments)
        .set({ expiryAlertedAt: null })
        .where(
          and(
            eq(isolatedSchema.ppmWorkOrderDocuments.workOrderId, id),
            eq(isolatedSchema.ppmWorkOrderDocuments.fileType, resolvedFileType)
          )
        );
    }
    const [doc] = await custDb.insert(isolatedSchema.ppmWorkOrderDocuments)
      .values({ workOrderId: id, fileName, fileUrl, fileType: resolvedFileType, uploadedBy: uploadedBy || req.user!.username, expiryDate: expiryDate || null, referenceNumber: referenceNumber || null, issuedBy: issuedBy || null, expiryAlertedAt: null })
      .returning();
    // If this looks like a certificate, mark work order as having cert uploaded
    const woDocUpdates: Record<string, unknown> = {};
    if (resolvedFileType === "certificate") {
      woDocUpdates.certificateUploadedAt = new Date();
    }
    // Clear missing-docs alert so the cron won't re-fire while docs exist
    woDocUpdates.missingDocsAlertedAt = null;
    await custDb.update(isolatedSchema.ppmWorkOrders)
      .set(woDocUpdates as any)
      .where(eq(isolatedSchema.ppmWorkOrders.id, id));
    res.json(doc);
  } catch (error: unknown) {
    console.error("POST /api/ppm/work-orders/:id/documents", error);
    res.status(500).json({ error: "Failed to upload document" });
  }
});

// DELETE /api/ppm/work-orders/:id/documents/:docId — remove a document
app.delete("/api/ppm/work-orders/:id/documents/:docId", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    const { id, docId } = req.params;
    const context = await simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);
    // Verify docId belongs to this work order to prevent accidental cross-WO deletes
    const [doc] = await custDb.select({ id: isolatedSchema.ppmWorkOrderDocuments.id })
      .from(isolatedSchema.ppmWorkOrderDocuments)
      .where(
        and(
          eq(isolatedSchema.ppmWorkOrderDocuments.id, docId),
          eq(isolatedSchema.ppmWorkOrderDocuments.workOrderId, id)
        )
      );
    if (!doc) return res.status(404).json({ error: "Document not found on this work order" });
    // Fetch the doc's fileType before deleting so we know whether to recheck certificateUploadedAt
    const [fullDoc] = await custDb.select({ fileType: isolatedSchema.ppmWorkOrderDocuments.fileType })
      .from(isolatedSchema.ppmWorkOrderDocuments)
      .where(eq(isolatedSchema.ppmWorkOrderDocuments.id, docId));
    await custDb.delete(isolatedSchema.ppmWorkOrderDocuments).where(eq(isolatedSchema.ppmWorkOrderDocuments.id, docId));
    // If the deleted doc was a certificate, recheck remaining docs and clear certificateUploadedAt if none remain
    if (fullDoc?.fileType === "certificate") {
      const remaining = await custDb.select({ id: isolatedSchema.ppmWorkOrderDocuments.id })
        .from(isolatedSchema.ppmWorkOrderDocuments)
        .where(
          and(
            eq(isolatedSchema.ppmWorkOrderDocuments.workOrderId, id),
            eq(isolatedSchema.ppmWorkOrderDocuments.fileType, "certificate")
          )
        );
      if (remaining.length === 0) {
        // Clear cert fields so the cert cron can fire a fresh alert next cycle
        // Also clear missingDocsAlertedAt so the no-docs cron can re-fire if the WO is still overdue
        await custDb.update(isolatedSchema.ppmWorkOrders)
          .set({ certificateUploadedAt: null, missingCertAlertedAt: null, missingDocsAlertedAt: null })
          .where(eq(isolatedSchema.ppmWorkOrders.id, id));
      }
    }
    res.json({ success: true });
  } catch (error: unknown) {
    console.error("DELETE /api/ppm/work-orders/:id/documents/:docId", error);
    res.status(500).json({ error: "Failed to delete document" });
  }
});

// POST /api/ppm/work-orders/:id/documents/:docId/resend-alert — resend expiry alert email immediately
app.post("/api/ppm/work-orders/:id/documents/:docId/resend-alert", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    const { id, docId } = req.params;
    const context = await simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);

    // Fetch the document and verify it belongs to this work order
    const [doc] = await custDb.select().from(isolatedSchema.ppmWorkOrderDocuments)
      .where(and(
        eq(isolatedSchema.ppmWorkOrderDocuments.id, docId),
        eq(isolatedSchema.ppmWorkOrderDocuments.workOrderId, id)
      ));
    if (!doc) return res.status(404).json({ error: "Document not found on this work order" });
    if (!doc.expiryDate) return res.status(400).json({ error: "Document has no expiry date — alert not applicable" });

    // Fetch company settings for email
    const settingsRows = await custDb.execute(`SELECT company_name, email, notify_on_document_expiry FROM company_settings LIMIT 1`);
    const settings = settingsRows.rows[0] as { company_name?: string; email?: string; notify_on_document_expiry?: boolean } | undefined;
    const companyName = (settings?.company_name as string) || "TPR-Max";
    const adminEmail = settings?.email as string | undefined;
    if (!adminEmail) return res.status(400).json({ error: "No admin email configured" });
    const notifyOnDocumentExpiry = settings?.notify_on_document_expiry !== false;
    if (!notifyOnDocumentExpiry) return res.status(403).json({ error: "Expiry notifications are disabled in company settings" });

    // Fetch the work order title and contractor details for context
    const [wo] = await custDb.select({
      title: isolatedSchema.ppmWorkOrders.title,
      assignedEmail: isolatedSchema.ppmWorkOrders.assignedEmail,
      contractorWorkerName: isolatedSchema.ppmWorkOrders.contractorWorkerName,
      contractorCompanyName: isolatedSchema.ppmWorkOrders.contractorCompanyName,
      accessToken: isolatedSchema.ppmWorkOrders.accessToken,
    })
      .from(isolatedSchema.ppmWorkOrders)
      .where(eq(isolatedSchema.ppmWorkOrders.id, id));
    const woTitle = wo?.title ?? id;

    const todayStr = new Date().toISOString().split("T")[0];
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const in30DaysStr = in30Days.toISOString().split("T")[0];
    const isExpired = doc.expiryDate <= todayStr;
    const isExpiringSoon = !isExpired && doc.expiryDate <= in30DaysStr;

    // Only allow resend for documents that are expired or expiring within the alert window
    if (!isExpired && !isExpiringSoon) {
      return res.status(400).json({ error: "Document is not within the expiry alert window (must be expired or expiring within 30 days)" });
    }

    const emailSvc = new EmailService(context.customerId);
    const subject = isExpired
      ? `PPM Alert: Expired Document — ${doc.fileName}`
      : `PPM Alert: Document Expiring Soon — ${doc.fileName}`;

    const sent = await emailSvc.sendEmail({
      to: adminEmail,
      subject,
      companyName,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto">
          <div style="background:${isExpired ? "#dc2626" : "#d97706"};color:#fff;padding:20px;border-radius:8px 8px 0 0">
            <h2 style="margin:0">PPM Document Expiry Alert — ${companyName}</h2>
          </div>
          <div style="background:#fff;padding:20px;border:1px solid #e5e7eb">
            <p style="margin-top:0">The following PPM work order document requires attention:</p>
            <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:14px">
              <thead>
                <tr style="background:#f9fafb">
                  <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Document</th>
                  <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Work Order</th>
                  <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Expiry Date</th>
                  <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-weight:500">${doc.fileName}</td>
                  <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6">${woTitle}</td>
                  <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:${isExpired ? "#dc2626" : "#d97706"};font-weight:600">${doc.expiryDate}</td>
                  <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:${isExpired ? "#dc2626" : "#d97706"}">${isExpired ? "Expired" : "Expiring Soon"}</td>
                </tr>
              </tbody>
            </table>
            <p style="color:#6b7280;font-size:13px">Please log in to TPR-Max to review and replace this document as required.</p>
          </div>
          <div style="background:#f9fafb;padding:12px 20px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;font-size:12px;color:#9ca3af">
            This alert was sent by ${companyName} via TPR-Max PPM system.
          </div>
        </div>
      `,
      text: `PPM Document Expiry Alert\n\nDocument: ${doc.fileName}\nWork Order: ${woTitle}\nExpiry Date: ${doc.expiryDate}\nStatus: ${isExpired ? "Expired" : "Expiring Soon"}\n\nPlease log in to TPR-Max to review.`,
    });

    if (!sent) return res.status(500).json({ error: "Failed to send alert email" });

    // Also notify the assigned contractor (if the work order has one)
    const contractorEmail = wo?.assignedEmail;
    let contractorNotified = false;
    if (contractorEmail) {
      try {
        const recipientName = wo?.contractorWorkerName || wo?.contractorCompanyName || "Contractor";
        const baseUrl = process.env.REPLIT_DOMAINS
          ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
          : (process.env.PUBLIC_URL || process.env.BASE_URL || "http://localhost:5000");
        const workOrderUrl = wo?.accessToken ? `${baseUrl}/ppm/work-order/${wo.accessToken}` : null;
        const contractorSubject = isExpired
          ? `Action Required: Expired Document on Work Order — ${woTitle}`
          : `Action Required: Document Expiring Soon on Work Order — ${woTitle}`;
        const accentColor = isExpired ? "#dc2626" : "#d97706";
        const statusLabel = isExpired ? "Expired" : "Expiring Soon";
        await emailSvc.sendEmail({
          to: contractorEmail,
          subject: contractorSubject,
          companyName,
          html: `
            <!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f6f6f6;margin:0;padding:20px">
            <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1)">
              <div style="background:${accentColor};color:#fff;padding:24px 28px">
                <h1 style="margin:0;font-size:20px">Document Expiry Notice</h1>
                <p style="margin:6px 0 0;opacity:.85;font-size:14px">${companyName}</p>
              </div>
              <div style="padding:28px">
                <p style="font-size:16px;color:#1f2937">Hello ${recipientName},</p>
                <p style="color:#374151">A document on one of your assigned PPM work orders requires attention. Please supply a replacement as soon as possible.</p>
                <div style="background:#fef2f2;border:1px solid ${accentColor}33;border-radius:8px;padding:16px;margin:20px 0">
                  <p style="margin:0 0 6px;font-weight:600;color:#1f2937;font-size:15px">${woTitle}</p>
                  <p style="margin:0 0 4px;font-size:14px;color:#374151"><strong>Document:</strong> ${doc.fileName}</p>
                  <p style="margin:0 0 4px;font-size:14px;color:${accentColor}"><strong>Expiry Date:</strong> ${doc.expiryDate}</p>
                  <p style="margin:0;font-size:14px;color:${accentColor}"><strong>Status:</strong> ${statusLabel}</p>
                </div>
                ${workOrderUrl ? `<div style="text-align:center;margin:28px 0"><a href="${workOrderUrl}" style="background:${accentColor};color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-weight:600;font-size:15px;display:inline-block">View Work Order</a></div>` : ""}
                <p style="color:#6b7280;font-size:13px">Please upload a valid replacement document at your earliest convenience. If you have any questions, contact ${companyName} directly.</p>
              </div>
              <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 28px;text-align:center">
                <p style="margin:0;color:#9ca3af;font-size:12px">This notice was sent by ${companyName} via TPR-Max PPM system.</p>
              </div>
            </div>
            </body></html>
          `,
          text: `Document Expiry Notice — ${companyName}\n\nHello ${recipientName},\n\nA document on your assigned work order "${woTitle}" requires attention.\n\nDocument: ${doc.fileName}\nExpiry Date: ${doc.expiryDate}\nStatus: ${statusLabel}\n\nPlease supply a replacement document as soon as possible.${workOrderUrl ? `\n\nView your work order at:\n${workOrderUrl}` : ""}\n\n${companyName}`,
        });
        contractorNotified = true;
      } catch (contractorEmailErr) {
        console.error("PPM expiry resend — contractor notification failed:", contractorEmailErr);
      }
    }

    // Stamp expiryAlertedAt so cron won't re-fire automatically until reset
    await custDb.update(isolatedSchema.ppmWorkOrderDocuments)
      .set({ expiryAlertedAt: new Date() })
      .where(eq(isolatedSchema.ppmWorkOrderDocuments.id, docId));

    res.json({ success: true, contractorNotified });
  } catch (error: unknown) {
    console.error("POST /api/ppm/work-orders/:id/documents/:docId/resend-alert", error);
    res.status(500).json({ error: "Failed to resend alert" });
  }
});

// POST /api/ppm/documents/bulk-resend-alerts — resend expiry alert for ALL expiring/expired PPM documents at once
// Admin receives a consolidated digest; each work order's assigned contractor (if any) receives a per-document email.
app.post("/api/ppm/documents/bulk-resend-alerts", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    const context = await simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);

    const settingsRows = await custDb.execute(`SELECT company_name, email, notify_on_document_expiry FROM company_settings LIMIT 1`);
    const settings = settingsRows.rows[0] as { company_name?: string; email?: string; notify_on_document_expiry?: boolean } | undefined;
    const companyName = (settings?.company_name as string) || "TPR-Max";
    const adminEmail = settings?.email as string | undefined;
    if (!adminEmail) return res.status(400).json({ error: "No admin email configured" });
    const notifyOnDocumentExpiry = settings?.notify_on_document_expiry !== false;
    if (!notifyOnDocumentExpiry) return res.status(403).json({ error: "Expiry notifications are disabled in company settings" });

    const todayStr = new Date().toISOString().split("T")[0];
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const in30DaysStr = in30Days.toISOString().split("T")[0];

    // Fetch all PPM work order documents that are expired or expiring within 30 days
    const expiringDocs = await custDb.select({
      id: isolatedSchema.ppmWorkOrderDocuments.id,
      fileName: isolatedSchema.ppmWorkOrderDocuments.fileName,
      expiryDate: isolatedSchema.ppmWorkOrderDocuments.expiryDate,
      workOrderId: isolatedSchema.ppmWorkOrderDocuments.workOrderId,
    }).from(isolatedSchema.ppmWorkOrderDocuments)
      .where(and(
        sql`${isolatedSchema.ppmWorkOrderDocuments.expiryDate} IS NOT NULL`,
        sql`${isolatedSchema.ppmWorkOrderDocuments.expiryDate} <= ${in30DaysStr}`
      ));

    if (expiringDocs.length === 0) {
      return res.status(400).json({ error: "No expiring or expired PPM documents found within the 30-day alert window" });
    }

    // Fetch all related work orders in one query to get titles and contractor details
    const woIds = [...new Set(expiringDocs.map(d => d.workOrderId))];
    const relatedWOs = await custDb.select({
      id: isolatedSchema.ppmWorkOrders.id,
      title: isolatedSchema.ppmWorkOrders.title,
      assignedEmail: isolatedSchema.ppmWorkOrders.assignedEmail,
      contractorWorkerName: isolatedSchema.ppmWorkOrders.contractorWorkerName,
      contractorCompanyName: isolatedSchema.ppmWorkOrders.contractorCompanyName,
      accessToken: isolatedSchema.ppmWorkOrders.accessToken,
    }).from(isolatedSchema.ppmWorkOrders)
      .where(inArray(isolatedSchema.ppmWorkOrders.id, woIds));
    const woMap = Object.fromEntries(relatedWOs.map(w => [w.id, w]));

    const expired = expiringDocs.filter(d => d.expiryDate! <= todayStr);
    const soonExpiring = expiringDocs.filter(d => d.expiryDate! > todayStr);

    const buildRow = (d: typeof expiringDocs[0], isExp: boolean) =>
      `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-weight:500">${d.fileName}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6">${woMap[d.workOrderId]?.title ?? d.workOrderId}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:${isExp ? "#dc2626" : "#d97706"};font-weight:600">${d.expiryDate}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:${isExp ? "#dc2626" : "#d97706"}">${isExp ? "Expired" : "Expiring Soon"}</td>
      </tr>`;

    const tableRows = [
      ...expired.map(d => buildRow(d, true)),
      ...soonExpiring.map(d => buildRow(d, false)),
    ].join("");

    const subjectCount = expiringDocs.length;
    const hasExpired = expired.length > 0;
    const adminSubject = hasExpired
      ? `PPM Alert: ${expired.length} Expired Document${expired.length > 1 ? "s" : ""}${soonExpiring.length > 0 ? ` & ${soonExpiring.length} Expiring Soon` : ""}`
      : `PPM Alert: ${soonExpiring.length} Document${soonExpiring.length > 1 ? "s" : ""} Expiring Soon`;

    const emailSvc = new EmailService(context.customerId);

    // ── Admin consolidated digest ───────────────────────────────────────────
    const adminSent = await emailSvc.sendEmail({
      to: adminEmail,
      subject: adminSubject,
      companyName,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto">
          <div style="background:${hasExpired ? "#dc2626" : "#d97706"};color:#fff;padding:20px;border-radius:8px 8px 0 0">
            <h2 style="margin:0">PPM Document Expiry Alert — ${companyName}</h2>
          </div>
          <div style="background:#fff;padding:20px;border:1px solid #e5e7eb">
            <p style="margin-top:0">${subjectCount} PPM work order document${subjectCount > 1 ? "s require" : " requires"} attention:</p>
            <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:14px">
              <thead>
                <tr style="background:#f9fafb">
                  <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Document</th>
                  <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Work Order</th>
                  <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Expiry Date</th>
                  <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Status</th>
                </tr>
              </thead>
              <tbody>${tableRows}</tbody>
            </table>
            <p style="color:#6b7280;font-size:13px">Please log in to TPR-Max to review and replace these documents as required.</p>
          </div>
          <div style="background:#f9fafb;padding:12px 20px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;font-size:12px;color:#9ca3af">
            This alert was sent by ${companyName} via TPR-Max PPM system.
          </div>
        </div>
      `,
      text: `PPM Document Expiry Alert\n\n${expired.length > 0 ? `Expired (${expired.length}):\n${expired.map(d => `- ${d.fileName} (WO: ${woMap[d.workOrderId]?.title ?? d.workOrderId}, expired: ${d.expiryDate})`).join("\n")}\n\n` : ""}${soonExpiring.length > 0 ? `Expiring Soon (${soonExpiring.length}):\n${soonExpiring.map(d => `- ${d.fileName} (WO: ${woMap[d.workOrderId]?.title ?? d.workOrderId}, expires: ${d.expiryDate})`).join("\n")}\n\n` : ""}Please log in to TPR-Max to review.`,
    });

    if (!adminSent) return res.status(500).json({ error: "Failed to send admin alert email" });

    // ── Per-contractor notifications ────────────────────────────────────────
    // Group documents by assignedEmail so each contractor gets one email per document
    const baseUrl = process.env.REPLIT_DOMAINS
      ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
      : (process.env.PUBLIC_URL || process.env.BASE_URL || "http://localhost:5000");

    let contractorEmailsSent = 0;
    for (const doc of expiringDocs) {
      const wo = woMap[doc.workOrderId];
      if (!wo?.assignedEmail) continue;

      const isExpired = doc.expiryDate! <= todayStr;
      const accentColor = isExpired ? "#dc2626" : "#d97706";
      const statusLabel = isExpired ? "Expired" : "Expiring Soon";
      const recipientName = wo.contractorWorkerName || wo.contractorCompanyName || "Contractor";
      const woTitle = wo.title ?? doc.workOrderId;
      const workOrderUrl = wo.accessToken ? `${baseUrl}/ppm/work-order/${wo.accessToken}` : null;
      const contractorSubject = isExpired
        ? `Action Required: Expired Document on Work Order — ${woTitle}`
        : `Action Required: Document Expiring Soon on Work Order — ${woTitle}`;

      try {
        await emailSvc.sendEmail({
          to: wo.assignedEmail,
          subject: contractorSubject,
          companyName,
          html: `
            <!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f6f6f6;margin:0;padding:20px">
            <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1)">
              <div style="background:${accentColor};color:#fff;padding:24px 28px">
                <h1 style="margin:0;font-size:20px">Document Expiry Notice</h1>
                <p style="margin:6px 0 0;opacity:.85;font-size:14px">${companyName}</p>
              </div>
              <div style="padding:28px">
                <p style="font-size:16px;color:#1f2937">Hello ${recipientName},</p>
                <p style="color:#374151">A document on one of your assigned PPM work orders requires attention. Please supply a replacement as soon as possible.</p>
                <div style="background:#fef2f2;border:1px solid ${accentColor}33;border-radius:8px;padding:16px;margin:20px 0">
                  <p style="margin:0 0 6px;font-weight:600;color:#1f2937;font-size:15px">${woTitle}</p>
                  <p style="margin:0 0 4px;font-size:14px;color:#374151"><strong>Document:</strong> ${doc.fileName}</p>
                  <p style="margin:0 0 4px;font-size:14px;color:${accentColor}"><strong>Expiry Date:</strong> ${doc.expiryDate}</p>
                  <p style="margin:0;font-size:14px;color:${accentColor}"><strong>Status:</strong> ${statusLabel}</p>
                </div>
                ${workOrderUrl ? `<div style="text-align:center;margin:28px 0"><a href="${workOrderUrl}" style="background:${accentColor};color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-weight:600;font-size:15px;display:inline-block">View Work Order</a></div>` : ""}
                <p style="color:#6b7280;font-size:13px">Please upload a valid replacement document at your earliest convenience. If you have any questions, contact ${companyName} directly.</p>
              </div>
              <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 28px;text-align:center">
                <p style="margin:0;color:#9ca3af;font-size:12px">This notice was sent by ${companyName} via TPR-Max PPM system.</p>
              </div>
            </div>
            </body></html>
          `,
          text: `Document Expiry Notice — ${companyName}\n\nHello ${recipientName},\n\nA document on your assigned work order "${woTitle}" requires attention.\n\nDocument: ${doc.fileName}\nExpiry Date: ${doc.expiryDate}\nStatus: ${statusLabel}\n\nPlease supply a replacement document as soon as possible.${workOrderUrl ? `\n\nView your work order at:\n${workOrderUrl}` : ""}\n\n${companyName}`,
        });
        contractorEmailsSent++;
      } catch (contractorEmailErr) {
        console.error(`PPM bulk resend — contractor notification failed for WO ${doc.workOrderId}:`, contractorEmailErr);
      }
    }

    // Stamp expiryAlertedAt on all processed documents
    const docIds = expiringDocs.map(d => d.id);
    await custDb.update(isolatedSchema.ppmWorkOrderDocuments)
      .set({ expiryAlertedAt: new Date() })
      .where(inArray(isolatedSchema.ppmWorkOrderDocuments.id, docIds));

    res.json({ success: true, documentsAlerted: expiringDocs.length, contractorEmailsSent });
  } catch (error: unknown) {
    console.error("POST /api/ppm/documents/bulk-resend-alerts", error);
    res.status(500).json({ error: "Failed to send bulk alerts" });
  }
});

// GET /api/ppm/work-orders/export-all — bulk PDF export for all matching work orders
app.get("/api/ppm/work-orders/export-all", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    const context = await simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);
    const { status, dateFrom, dateTo } = req.query as { status?: string; dateFrom?: string; dateTo?: string };

    // Build filter conditions
    const conditions: SQL<unknown>[] = [];
    if (status && status !== "all") conditions.push(eq(isolatedSchema.ppmWorkOrders.status, status));
    if (dateFrom) conditions.push(gte(isolatedSchema.ppmWorkOrders.dueDate, dateFrom));
    if (dateTo) conditions.push(lte(isolatedSchema.ppmWorkOrders.dueDate, dateTo));

    const wos = await custDb.select().from(isolatedSchema.ppmWorkOrders)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(isolatedSchema.ppmWorkOrders.dueDate);

    // Fetch all assets and build a lookup
    const allAssets = await custDb.select({ id: isolatedSchema.ppmAssets.id, name: isolatedSchema.ppmAssets.name })
      .from(isolatedSchema.ppmAssets);
    const assetMap: Record<string, string> = {};
    for (const a of allAssets) assetMap[a.id] = a.name;

    // Fetch all documents for these work orders in one query
    const woIds = wos.map(w => w.id);
    const allDocs = woIds.length > 0
      ? await custDb.select().from(isolatedSchema.ppmWorkOrderDocuments)
          .where(inArray(isolatedSchema.ppmWorkOrderDocuments.workOrderId, woIds))
          .orderBy(isolatedSchema.ppmWorkOrderDocuments.createdAt)
      : [];
    const docsByWo: Record<string, typeof allDocs> = {};
    for (const d of allDocs) {
      if (!docsByWo[d.workOrderId]) docsByWo[d.workOrderId] = [];
      docsByWo[d.workOrderId].push(d);
    }

    const esc = (s: string | null | undefined) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const fmtDate = (d: string | null | undefined) => {
      if (!d) return "—";
      try { return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }); } catch { return d; }
    };
    const statusLabel: Record<string, string> = {
      scheduled: "Scheduled", in_progress: "In Progress", completed: "Completed",
      overdue: "Overdue", cancelled: "Cancelled",
    };
    const statusColour: Record<string, string> = {
      scheduled: "#1d4ed8", in_progress: "#b45309", completed: "#15803d",
      overdue: "#b91c1c", cancelled: "#6b7280",
    };
    const docTypeLabel: Record<string, string> = {
      certificate: "Certificate", report: "Report", photo: "Photo", other: "Other",
    };

    const generatedAt = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

    // Build filter description for report header
    const filterParts: string[] = [];
    if (status && status !== "all") filterParts.push(`Status: ${statusLabel[status] ?? status}`);
    if (dateFrom) filterParts.push(`From: ${fmtDate(dateFrom)}`);
    if (dateTo) filterParts.push(`To: ${fmtDate(dateTo)}`);
    const filterDesc = filterParts.length > 0 ? filterParts.join("&nbsp;&nbsp;·&nbsp;&nbsp;") : "All work orders";

    const woSections = wos.map((wo, idx) => {
      const docs = docsByWo[wo.id] ?? [];
      const assetName = wo.assetId ? (assetMap[wo.assetId] ?? "—") : "—";
      const sColour = statusColour[wo.status ?? ""] ?? "#6b7280";
      const docsHtml = docs.length === 0
        ? `<p style="color:#6b7280;font-size:12px;margin:0;">No documents uploaded.</p>`
        : docs.map(doc => `
            <div style="border:1px solid #e5e7eb;border-radius:4px;padding:7px 10px;margin-bottom:6px;font-size:12px;">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                <span style="font-weight:600;color:#111827;">${esc(doc.fileName)}</span>
                ${doc.fileType && doc.fileType !== "other" ? `<span style="background:#f3f4f6;border:1px solid #d1d5db;border-radius:3px;padding:1px 5px;font-size:10px;color:#374151;text-transform:capitalize;">${esc(docTypeLabel[doc.fileType] ?? doc.fileType)}</span>` : ""}
              </div>
              ${(doc.expiryDate || doc.referenceNumber || doc.issuedBy) ? `
              <div style="display:flex;flex-wrap:wrap;gap:12px;color:#6b7280;">
                ${doc.expiryDate ? `<span>Expiry: <strong style="color:#111827;">${esc(fmtDate(doc.expiryDate))}</strong></span>` : ""}
                ${doc.referenceNumber ? `<span>Ref No.: <strong style="color:#111827;">${esc(doc.referenceNumber)}</strong></span>` : ""}
                ${doc.issuedBy ? `<span>Issued By: <strong style="color:#111827;">${esc(doc.issuedBy)}</strong></span>` : ""}
              </div>` : ""}
            </div>`).join("");

      return `
        <div style="page-break-inside:avoid;border:1px solid #e5e7eb;border-radius:6px;padding:14px 16px;margin-bottom:16px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <div>
              <span style="font-size:11px;color:#9ca3af;font-weight:500;margin-right:8px;">#${idx + 1}</span>
              <span style="font-size:15px;font-weight:700;color:#111827;">${esc(wo.title)}</span>
            </div>
            <span style="font-size:11px;font-weight:600;color:${sColour};background:${sColour}18;border:1px solid ${sColour}44;border-radius:4px;padding:2px 8px;">${esc(statusLabel[wo.status ?? ""] ?? wo.status ?? "—")}</span>
          </div>
          <div style="display:grid;grid-template-columns:140px 1fr 140px 1fr;gap:3px 10px;font-size:12px;margin-bottom:10px;">
            <span style="color:#6b7280;">Asset</span><span style="color:#111827;">${esc(assetName)}</span>
            <span style="color:#6b7280;">Due Date</span><span style="color:#111827;">${esc(fmtDate(wo.dueDate))}</span>
            ${wo.contractorCompanyName ? `<span style="color:#6b7280;">Contractor</span><span style="color:#111827;">${esc(wo.contractorCompanyName)}</span>` : `<span></span><span></span>`}
            ${wo.completedDate ? `<span style="color:#6b7280;">Completed</span><span style="color:#111827;">${esc(fmtDate(wo.completedDate))}</span>` : `<span></span><span></span>`}
          </div>
          ${docs.length > 0 ? `
          <div>
            <div style="font-size:11px;font-weight:700;color:#374151;border-bottom:1px solid #f3f4f6;padding-bottom:4px;margin-bottom:6px;">Documents (${docs.length})</div>
            ${docsHtml}
          </div>` : `<p style="font-size:12px;color:#9ca3af;margin:0;">No documents uploaded.</p>`}
        </div>`;
    }).join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; background: #fff; padding: 28px 36px; }
h1 { font-size: 20px; font-weight: 700; color: #111827; margin-bottom: 3px; }
.subtitle { font-size: 12px; color: #6b7280; margin-bottom: 6px; }
.filter-bar { font-size: 12px; color: #374151; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 5px; padding: 6px 12px; margin-bottom: 20px; display: inline-block; }
.footer { margin-top: 32px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; text-align: center; }
</style>
</head>
<body>
<h1>PPM Work Order Report</h1>
<p class="subtitle">Generated: ${generatedAt} &nbsp;·&nbsp; ${wos.length} work order${wos.length !== 1 ? "s" : ""}</p>
<div class="filter-bar">${filterDesc}</div>

${wos.length === 0 ? `<p style="color:#6b7280;font-size:14px;text-align:center;padding:40px 0;">No work orders match the selected criteria.</p>` : woSections}

<div class="footer">Generated by TPR Max — PPM Bulk Work Order Export &nbsp;·&nbsp; ${generatedAt}</div>
</body>
</html>`;

    try {
      const puppeteer = await import('puppeteer');
      const browser = await puppeteer.default.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
      try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' } });
        await browser.close();
        res.setHeader('Content-Type', 'application/pdf');
        const dateSuffix = dateFrom || dateTo ? `-${(dateFrom || "").replace(/-/g,"") || "start"}-${(dateTo || "").replace(/-/g,"") || "end"}` : "";
        res.setHeader('Content-Disposition', `attachment; filename="work-orders-report${dateSuffix}.pdf"`);
        return res.send(Buffer.from(pdfBuffer));
      } catch (pdfErr) {
        await browser.close();
        throw pdfErr;
      }
    } catch {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      const printHtml = html.replace('</body>', '<script>window.onload=function(){window.print();}</script></body>');
      res.setHeader('Content-Disposition', `inline; filename="work-orders-report.html"`);
      return res.send(printHtml);
    }
  } catch (error: unknown) {
    console.error("GET /api/ppm/work-orders/export-all", error);
    res.status(500).json({ error: "Failed to generate bulk work order export" });
  }
});

// POST /api/ppm/documents/bulk-resend-alert — send a single digest covering ALL expired/expiring-soon PPM documents
app.post("/api/ppm/documents/bulk-resend-alert", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    const context = await simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);
    // Fetch company settings
    const settingsRows = await custDb.execute(`SELECT company_name, email, notify_on_document_expiry FROM company_settings LIMIT 1`);
    const settings = settingsRows.rows[0] as { company_name?: string; email?: string; notify_on_document_expiry?: boolean } | undefined;
    const companyName = (settings?.company_name as string) || "TPR-Max";
    const adminEmail = settings?.email as string | undefined;
    if (!adminEmail) return res.status(400).json({ error: "No admin email configured" });
    const notifyOnDocumentExpiry = settings?.notify_on_document_expiry !== false;
    if (!notifyOnDocumentExpiry) return res.status(403).json({ error: "Expiry notifications are disabled in company settings" });

    const todayDateStr = new Date().toISOString().split("T")[0];
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const in30DaysStr = in30Days.toISOString().split("T")[0];

    // Fetch ALL expired or expiring-soon documents (regardless of expiryAlertedAt — this is a manual bulk resend)
    const expiringDocs = await custDb.select({
      id: isolatedSchema.ppmWorkOrderDocuments.id,
      fileName: isolatedSchema.ppmWorkOrderDocuments.fileName,
      fileType: isolatedSchema.ppmWorkOrderDocuments.fileType,
      expiryDate: isolatedSchema.ppmWorkOrderDocuments.expiryDate,
      workOrderId: isolatedSchema.ppmWorkOrderDocuments.workOrderId,
    }).from(isolatedSchema.ppmWorkOrderDocuments)
      .where(and(
        sql`${isolatedSchema.ppmWorkOrderDocuments.expiryDate} IS NOT NULL`,
        sql`${isolatedSchema.ppmWorkOrderDocuments.expiryDate} <= ${in30DaysStr}`
      ));

    if (expiringDocs.length === 0) {
      return res.json({ success: true, count: 0, message: "No expired or expiring documents found" });
    }

    // Enrich with work order titles
    const woIds = [...new Set(expiringDocs.map(d => d.workOrderId))];
    const relatedWOs = await custDb.select({
      id: isolatedSchema.ppmWorkOrders.id,
      title: isolatedSchema.ppmWorkOrders.title,
    }).from(isolatedSchema.ppmWorkOrders)
      .where(inArray(isolatedSchema.ppmWorkOrders.id, woIds));
    const woMap = Object.fromEntries(relatedWOs.map(w => [w.id, w.title]));

    const expired = expiringDocs.filter(d => d.expiryDate! <= todayDateStr);
    const soonExpiring = expiringDocs.filter(d => d.expiryDate! > todayDateStr);

    const buildRow = (d: typeof expiringDocs[0], isExp: boolean) =>
      `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-weight:500">${d.fileName}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6">${woMap[d.workOrderId] ?? d.workOrderId}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:${isExp ? "#dc2626" : "#d97706"};font-weight:600">${d.expiryDate}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:${isExp ? "#dc2626" : "#d97706"}">${isExp ? "Expired" : "Expiring Soon"}</td>
      </tr>`;

    const tableRows = [
      ...expired.map(d => buildRow(d, true)),
      ...soonExpiring.map(d => buildRow(d, false)),
    ].join("");

    const subjectCount = expiringDocs.length;
    const hasExpired = expired.length > 0;
    const subject = hasExpired
      ? `PPM Alert: ${expired.length} Expired Document${expired.length > 1 ? "s" : ""}${soonExpiring.length > 0 ? ` & ${soonExpiring.length} Expiring Soon` : ""}`
      : `PPM Alert: ${soonExpiring.length} Document${soonExpiring.length > 1 ? "s" : ""} Expiring Soon`;

    const emailSvc = new EmailService(context.customerId);
    const sent = await emailSvc.sendEmail({
      to: adminEmail,
      subject,
      companyName,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto">
          <div style="background:${hasExpired ? "#dc2626" : "#d97706"};color:#fff;padding:20px;border-radius:8px 8px 0 0">
            <h2 style="margin:0">PPM Document Expiry Alert — ${companyName}</h2>
          </div>
          <div style="background:#fff;padding:20px;border:1px solid #e5e7eb">
            <p style="margin-top:0">${subjectCount} PPM work order document${subjectCount > 1 ? "s require" : " requires"} attention:</p>
            <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:14px">
              <thead>
                <tr style="background:#f9fafb">
                  <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Document</th>
                  <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Work Order</th>
                  <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Expiry Date</th>
                  <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Status</th>
                </tr>
              </thead>
              <tbody>${tableRows}</tbody>
            </table>
            <p style="color:#6b7280;font-size:13px">Please log in to TPR-Max to review and replace these documents as required.</p>
          </div>
          <div style="background:#f9fafb;padding:12px 20px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;font-size:12px;color:#9ca3af">
            This alert was sent by ${companyName} via TPR-Max PPM system.
          </div>
        </div>
      `,
      text: `PPM Document Expiry Alert\n\n${expired.length > 0 ? `Expired (${expired.length}):\n${expired.map(d => `- ${d.fileName} (WO: ${woMap[d.workOrderId] ?? d.workOrderId}, expired: ${d.expiryDate})`).join("\n")}\n\n` : ""}${soonExpiring.length > 0 ? `Expiring Soon (${soonExpiring.length}):\n${soonExpiring.map(d => `- ${d.fileName} (WO: ${woMap[d.workOrderId] ?? d.workOrderId}, expires: ${d.expiryDate})`).join("\n")}\n\n` : ""}Please log in to TPR-Max to review.`,
    });

    if (!sent) return res.status(500).json({ error: "Failed to send alert email" });

    // Reset expiryAlertedAt for all included documents so cron deduplication is updated
    const alertedIds = expiringDocs.map(d => d.id);
    await custDb.update(isolatedSchema.ppmWorkOrderDocuments)
      .set({ expiryAlertedAt: new Date() })
      .where(inArray(isolatedSchema.ppmWorkOrderDocuments.id, alertedIds));

    res.json({ success: true, count: subjectCount });
  } catch (error: unknown) {
    console.error("POST /api/ppm/documents/bulk-resend-alert", error);
    res.status(500).json({ error: "Failed to send bulk expiry alert" });
  }
});

// GET /api/ppm/work-orders/:id/export — generate a PDF summary of a work order
app.get("/api/ppm/work-orders/:id/export", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    const { id } = req.params;
    const context = await simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);

    const [wo] = await custDb.select().from(isolatedSchema.ppmWorkOrders).where(eq(isolatedSchema.ppmWorkOrders.id, id));
    if (!wo) return res.status(404).json({ error: "Work order not found" });

    const docs = await custDb.select().from(isolatedSchema.ppmWorkOrderDocuments)
      .where(eq(isolatedSchema.ppmWorkOrderDocuments.workOrderId, id))
      .orderBy(isolatedSchema.ppmWorkOrderDocuments.createdAt);

    let assetName = "—";
    if (wo.assetId) {
      const [asset] = await custDb.select({ name: isolatedSchema.ppmAssets.name })
        .from(isolatedSchema.ppmAssets)
        .where(eq(isolatedSchema.ppmAssets.id, wo.assetId));
      if (asset) assetName = asset.name;
    }

    const esc = (s: string | null | undefined) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const fmtDate = (d: string | null | undefined) => {
      if (!d) return "—";
      try { return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }); } catch { return d; }
    };
    const statusLabel: Record<string, string> = {
      pending: "Pending", in_progress: "In Progress", completed: "Completed",
      overdue: "Overdue", cancelled: "Cancelled",
    };
    const docTypeLabel: Record<string, string> = {
      certificate: "Certificate", report: "Report", photo: "Photo", other: "Other",
    };

    const docsHtml = docs.length === 0
      ? `<p style="color:#6b7280;font-size:13px;margin:0;">No documents uploaded.</p>`
      : docs.map(doc => `
        <div style="border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <span style="font-weight:600;font-size:13px;color:#111827;">${esc(doc.fileName)}</span>
            ${doc.fileType && doc.fileType !== "other" ? `<span style="background:#f3f4f6;border:1px solid #d1d5db;border-radius:4px;padding:1px 7px;font-size:11px;color:#374151;text-transform:capitalize;">${esc(docTypeLabel[doc.fileType] ?? doc.fileType)}</span>` : ""}
          </div>
          ${(doc.expiryDate || doc.referenceNumber || doc.issuedBy) ? `
          <div style="display:flex;flex-wrap:wrap;gap:16px;font-size:12px;color:#6b7280;padding-left:0;">
            ${doc.expiryDate ? `<span>Expiry Date: <strong style="color:#111827;">${esc(fmtDate(doc.expiryDate))}</strong></span>` : ""}
            ${doc.referenceNumber ? `<span>Reference No.: <strong style="color:#111827;">${esc(doc.referenceNumber)}</strong></span>` : ""}
            ${doc.issuedBy ? `<span>Issued By: <strong style="color:#111827;">${esc(doc.issuedBy)}</strong></span>` : ""}
          </div>` : ""}
        </div>`).join("");

    const generatedAt = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const adminUser = req.user!;
    const preparedBy = (adminUser.firstName && adminUser.lastName)
      ? `${adminUser.firstName} ${adminUser.lastName}`
      : (adminUser.firstName || adminUser.lastName || adminUser.username || '');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; background: #fff; padding: 32px 40px; }
h1 { font-size: 22px; font-weight: 700; color: #111827; margin-bottom: 4px; }
.subtitle { font-size: 13px; color: #6b7280; margin-bottom: 24px; }
.section { margin-bottom: 24px; }
.section-title { font-size: 14px; font-weight: 700; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin-bottom: 12px; }
.grid { display: grid; grid-template-columns: 160px 1fr; gap: 4px 12px; font-size: 13px; }
.grid .label { color: #6b7280; }
.grid .value { color: #111827; }
.notes-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 12px; font-size: 13px; color: #374151; white-space: pre-wrap; }
.completion-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 10px 12px; font-size: 13px; color: #166534; white-space: pre-wrap; }
.footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center; }
</style>
</head>
<body>
<h1>${esc(wo.title)}</h1>
<p class="subtitle">PPM Work Order &nbsp;·&nbsp; Status: ${esc(statusLabel[wo.status ?? ""] ?? wo.status ?? "—")} &nbsp;·&nbsp; Generated: ${generatedAt}${preparedBy ? ` &nbsp;·&nbsp; Prepared By: ${esc(preparedBy)}` : ``}</p>

<div class="section">
<div class="section-title">Work Order Details</div>
<div class="grid">
  <span class="label">Asset</span><span class="value">${esc(assetName)}</span>
  <span class="label">Due Date</span><span class="value">${esc(fmtDate(wo.dueDate))}</span>
  <span class="label">Completed Date</span><span class="value">${esc(fmtDate(wo.completedDate))}</span>
  ${wo.contractorCompanyName ? `<span class="label">Contractor</span><span class="value">${esc(wo.contractorCompanyName)}</span>` : ""}
  ${wo.contractorWorkerName ? `<span class="label">Worker</span><span class="value">${esc(wo.contractorWorkerName)}</span>` : ""}
  ${wo.requiresCertificate ? `<span class="label">Certificate</span><span class="value">${wo.certificateUploadedAt ? `Uploaded ${fmtDate(wo.certificateUploadedAt)}` : "Not yet uploaded"}</span>` : ""}
</div>
</div>

${wo.description ? `
<div class="section">
<div class="section-title">Description</div>
<div class="notes-box">${esc(wo.description)}</div>
</div>` : ""}

${wo.notes ? `
<div class="section">
<div class="section-title">Notes</div>
<div class="notes-box">${esc(wo.notes)}</div>
</div>` : ""}

${wo.completionNotes ? `
<div class="section">
<div class="section-title">Completion Notes</div>
<div class="completion-box">${esc(wo.completionNotes)}</div>
</div>` : ""}

<div class="section">
<div class="section-title">Documents (${docs.length})</div>
${docsHtml}
</div>

<div class="footer">
Generated by TPR Max — PPM Work Order Export &nbsp;·&nbsp; ${generatedAt}${preparedBy ? ` &nbsp;·&nbsp; Prepared By: ${esc(preparedBy)}` : ``}
</div>
</body>
</html>`;

    try {
      const puppeteer = await import('puppeteer');
      const browser = await puppeteer.default.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
      try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' } });
        await browser.close();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="work-order-${id.slice(0, 8)}.pdf"`);
        return res.send(Buffer.from(pdfBuffer));
      } catch (pdfErr) {
        await browser.close();
        throw pdfErr;
      }
    } catch {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      const printHtml = html.replace('</body>', '<script>window.onload=function(){window.print();}</script></body>');
      res.setHeader('Content-Disposition', `inline; filename="work-order-${id.slice(0, 8)}.html"`);
      return res.send(printHtml);
    }
  } catch (error: unknown) {
    console.error("GET /api/ppm/work-orders/:id/export", error);
    res.status(500).json({ error: "Failed to generate work order export" });
  }
});

// ── PPM Demo Data ───────────────────────────────────────────────────────────
// POST /api/ppm/demo-data — seed typical UK facility PPM assets + templates

app.post("/api/ppm/demo-data", requireAuth, async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  try {
    const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);

    // ── All demo assets (checked by assetRef) ────────────────────────────────
    const ALL_DEMO_ASSETS = [
      // Original 8
      { name: "Air Handling Unit 1",             assetRef: "AHU-001", category: "HVAC",           location: "Plant Room 1",              manufacturer: "Daikin",             status: "active" },
      { name: "Fire Alarm Panel – Main Building", assetRef: "FAP-001", category: "Fire Safety",    location: "Ground Floor Reception",    manufacturer: "Honeywell",           status: "active" },
      { name: "Emergency Lighting System",        assetRef: "EL-001",  category: "Fire Safety",    location: "All Floors",                manufacturer: "Safescape",           status: "active" },
      { name: "Gas Boiler 1",                     assetRef: "BLR-001", category: "Mechanical",     location: "Basement Plant Room",       manufacturer: "Worcester Bosch",     status: "active" },
      { name: "Access Control Panel",             assetRef: "ACS-001", category: "Security",       location: "Ground Floor Reception",    manufacturer: "Honeywell",           status: "active" },
      { name: "Passenger Lift A",                 assetRef: "LFT-001", category: "Lifts & Hoists", location: "Ground Floor Lift Lobby",   manufacturer: "Schindler",           status: "active" },
      { name: "Sprinkler System Control Valve",   assetRef: "SPR-001", category: "Fire Safety",    location: "Basement Plant Room",       manufacturer: "Viking",              status: "active" },
      { name: "Main Electrical Distribution Board",assetRef: "EDB-001",category: "Electrical",     location: "Basement Sub-Station",      manufacturer: "Schneider Electric",  status: "active" },
      // Additional basement
      { name: "Gas Boiler 2",                     assetRef: "BLR-002", category: "Mechanical",     location: "Basement Plant Room",       manufacturer: "Worcester Bosch",     status: "active" },
      { name: "Cold Water Storage Tank",          assetRef: "CWT-001", category: "Water Hygiene",  location: "Basement Plant Room",       manufacturer: "Ware",                status: "active" },
      { name: "Hot Water Calorifier",             assetRef: "HWC-001", category: "Water Hygiene",  location: "Basement Plant Room",       manufacturer: "Andrews",             status: "active" },
      { name: "Generator – Standby",              assetRef: "GEN-001", category: "Electrical",     location: "Basement Plant Room",       manufacturer: "Cummins",             status: "active" },
      // Ground floor additions
      { name: "CCTV NVR System",                  assetRef: "CCTV-001",category: "Security",       location: "Ground Floor Reception",    manufacturer: "Hikvision",           status: "active" },
      { name: "Passenger Lift B",                 assetRef: "LFT-002", category: "Lifts & Hoists", location: "Ground Floor Lift Lobby",   manufacturer: "Schindler",           status: "active" },
      { name: "Emergency Lighting – Ground Floor",assetRef: "EL-GF",   category: "Fire Safety",    location: "Ground Floor",              manufacturer: "Safescape",           status: "active" },
      { name: "Air Handling Unit – Ground Floor", assetRef: "AHU-GF",  category: "HVAC",           location: "Ground Floor Plant Room",   manufacturer: "Daikin",              status: "active" },
      // Floors 1–4 AHUs
      { name: "Air Handling Unit – Floor 1",      assetRef: "AHU-01",  category: "HVAC",           location: "Floor 1 Plant Room",        manufacturer: "Daikin",              status: "active" },
      { name: "Air Handling Unit – Floor 2",      assetRef: "AHU-02",  category: "HVAC",           location: "Floor 2 Plant Room",        manufacturer: "Daikin",              status: "active" },
      { name: "Air Handling Unit – Floor 3",      assetRef: "AHU-03",  category: "HVAC",           location: "Floor 3 Plant Room",        manufacturer: "Daikin",              status: "active" },
      { name: "Air Handling Unit – Floor 4",      assetRef: "AHU-04",  category: "HVAC",           location: "Floor 4 Plant Room",        manufacturer: "Daikin",              status: "active" },
      // Floors 1–4 Emergency Lighting
      { name: "Emergency Lighting – Floor 1",     assetRef: "EL-01",   category: "Fire Safety",    location: "Floor 1",                   manufacturer: "Safescape",           status: "active" },
      { name: "Emergency Lighting – Floor 2",     assetRef: "EL-02",   category: "Fire Safety",    location: "Floor 2",                   manufacturer: "Safescape",           status: "active" },
      { name: "Emergency Lighting – Floor 3",     assetRef: "EL-03",   category: "Fire Safety",    location: "Floor 3",                   manufacturer: "Safescape",           status: "active" },
      { name: "Emergency Lighting – Floor 4",     assetRef: "EL-04",   category: "Fire Safety",    location: "Floor 4",                   manufacturer: "Safescape",           status: "active" },
      // Floors 1–4 Fan Coil Units
      { name: "Fan Coil Units – Floor 1",         assetRef: "FCU-01",  category: "HVAC",           location: "Floor 1",                   manufacturer: "Daikin",              status: "active" },
      { name: "Fan Coil Units – Floor 2",         assetRef: "FCU-02",  category: "HVAC",           location: "Floor 2",                   manufacturer: "Daikin",              status: "active" },
      { name: "Fan Coil Units – Floor 3",         assetRef: "FCU-03",  category: "HVAC",           location: "Floor 3",                   manufacturer: "Daikin",              status: "active" },
      { name: "Fan Coil Units – Floor 4",         assetRef: "FCU-04",  category: "HVAC",           location: "Floor 4",                   manufacturer: "Daikin",              status: "active" },
      // Roof
      { name: "Cooling Tower",                    assetRef: "CT-001",  category: "HVAC",           location: "Roof Plant",                manufacturer: "Baltimore Aircoil",   status: "active" },
      { name: "Water Tank – Roof",                assetRef: "WT-001",  category: "Water Hygiene",  location: "Roof",                      manufacturer: "Titan",               status: "active" },
      { name: "Lightning Protection System",      assetRef: "LPS-001", category: "Electrical",     location: "Roof",                      manufacturer: "Erico",               status: "active" },
    ];

    // ── Demo templates ───────────────────────────────────────────────────────
    const DEMO_TEMPLATES = [
      {
        name: "Monthly HVAC Filter Check",
        description: "Inspect, clean and replace HVAC filters. Record pressure readings across filter bank.",
        category: "HVAC", type: "non-statutory", frequency: "monthly",
        estimatedHours: "2",
        checklist: JSON.stringify(["Visually inspect filter condition","Check pressure differential across filters","Replace filters if pressure drop exceeds specification","Clean filter housing","Record readings in maintenance log","Check unit for unusual noise or vibration"]),
      },
      {
        name: "Annual Fire Alarm Full Test",
        description: "Full annual test of fire alarm system in accordance with BS 5839-1. All detectors, call points and sounders tested.",
        category: "Fire Safety", type: "statutory", regulationReference: "BS 5839-1", frequency: "annual",
        estimatedHours: "4",
        checklist: JSON.stringify(["Notify building occupants and fire service before testing","Test all manual call points","Test all smoke detectors using aerosol","Test all heat detectors","Verify all sounders operate at required decibel level","Test all visual alarm devices","Check fire alarm panel for faults","Test remote signalling to alarm receiving centre","Complete fire alarm record log","Issue test certificate"]),
      },
      {
        name: "Monthly Emergency Lighting Functional Test",
        description: "Monthly function test of emergency lighting in accordance with BS 5266-1.",
        category: "Fire Safety", type: "statutory", regulationReference: "BS 5266-1", frequency: "monthly",
        estimatedHours: "1",
        checklist: JSON.stringify(["Simulate mains failure for each emergency light","Confirm each luminaire illuminates","Check for damaged or missing luminaires","Check battery charging indicators","Record results in emergency lighting log"]),
      },
      {
        name: "Annual Boiler Service & Gas Safety Check",
        description: "Annual service and gas safety inspection by a Gas Safe registered engineer.",
        category: "Mechanical", type: "statutory", regulationReference: "Gas Safety (Installation & Use) Regulations 1998", frequency: "annual",
        estimatedHours: "3",
        checklist: JSON.stringify(["Inspect burner and heat exchanger","Clean all flue ways","Check gas pressure and flow rate","Test safety controls and thermostats","Check ventilation is adequate","Inspect all gas connections for leaks","Record flue gas analysis","Issue Gas Safe certificate"]),
      },
      {
        name: "6-Monthly Lift Thorough Examination",
        description: "Thorough examination of passenger lift by a competent person in accordance with LOLER.",
        category: "Lifts & Hoists", type: "statutory", regulationReference: "LOLER 1998", frequency: "custom", customDays: 183,
        estimatedHours: "4",
        checklist: JSON.stringify(["Check all safety devices and buffers","Inspect ropes/belts and terminations","Test overload device","Test emergency brake","Check car and landing door interlocks","Inspect pit and overhead equipment","Test emergency communications","Complete LOLER thorough examination report"]),
      },
      {
        name: "Quarterly Sprinkler System Inspection",
        description: "Quarterly inspection and flow test of wet pipe sprinkler system to BS EN 12845.",
        category: "Fire Safety", type: "statutory", regulationReference: "BS EN 12845", frequency: "quarterly",
        estimatedHours: "2",
        checklist: JSON.stringify(["Inspect all visible sprinkler heads for damage or obstruction","Check water supply pressure and flow","Test alarm valve flow switch","Check anti-freeze levels (if applicable)","Inspect and test main stop valve","Check all gauges and indicators","Record results and report defects"]),
      },
      {
        name: "Fixed Wiring Inspection & Testing (EICR)",
        description: "Electrical Installation Condition Report (EICR) in accordance with BS 7671. Carried out by a qualified electrician.",
        category: "Electrical", type: "statutory", regulationReference: "BS 7671 / IET Wiring Regulations", frequency: "custom", customDays: 1825,
        estimatedHours: "8",
        checklist: JSON.stringify(["Inspect distribution boards and consumer units","Test all circuits for continuity","Insulation resistance testing","Polarity checks","Earth fault loop impedance testing","RCD operation tests","Inspect all visible wiring and accessories","Produce EICR certificate"]),
      },
      {
        name: "Monthly Access Control System Check",
        description: "Monthly operational check of access control system, readers and barriers.",
        category: "Security", type: "non-statutory", frequency: "monthly",
        estimatedHours: "1.5",
        checklist: JSON.stringify(["Test all card readers for correct operation","Check barrier / door operation","Verify audit trail logging is active","Check backup battery health","Test door held-open alarms","Review access levels for leavers","Update firmware if required"]),
      },
      {
        name: "Monthly Water Hygiene Inspection",
        description: "Monthly Legionella risk management inspection and temperature checks in accordance with L8.",
        category: "Water Hygiene", type: "statutory", regulationReference: "HSE L8 / HTM 04-01", frequency: "monthly",
        estimatedHours: "2",
        checklist: JSON.stringify(["Check cold water temperature at sentinel outlets","Check hot water temperature at sentinel outlets","Inspect cold water storage tank","Check TMVs are operating correctly","Flush little-used outlets","Record all temperatures in log","Report any temperature failures immediately"]),
      },
    ];

    // ── STEP 1: Wipe all existing PPM data (FK-safe order) ─────────────────
    // Documents → Work Orders → Schedules → Assets → Groups → Templates
    await custDb.delete(isolatedSchema.ppmWorkOrderDocuments);
    await custDb.delete(isolatedSchema.ppmWorkOrders);
    await custDb.delete(isolatedSchema.ppmSchedules);
    await custDb.delete(isolatedSchema.ppmAssets);
    await custDb.delete(isolatedSchema.ppmAssetGroups);
    await custDb.delete(isolatedSchema.ppmTemplates);

    // ── STEP 2: Asset groups — one per maintenance category ─────────────────
    const DEMO_GROUPS = [
      { name: "HVAC Systems",        description: "Air handling, fan coil units, cooling towers and ventilation plant" },
      { name: "Fire Safety Systems", description: "Fire alarm panels, emergency lighting, sprinkler and suppression systems" },
      { name: "Mechanical Services", description: "Boilers, pressure vessels and gas plant" },
      { name: "Electrical Systems",  description: "Distribution boards, generators and lightning protection" },
      { name: "Water Hygiene",       description: "Cold water storage, calorifiers and Legionella management" },
      { name: "Security Systems",    description: "Access control, CCTV and intruder alarm systems" },
      { name: "Lifts & Hoists",      description: "Passenger and goods lifts — LOLER thorough examinations" },
    ];
    const groupIdByCategory: Record<string, string> = {};
    const categoryToGroup: Record<string, string> = {
      "HVAC":           "HVAC Systems",
      "Fire Safety":    "Fire Safety Systems",
      "Mechanical":     "Mechanical Services",
      "Electrical":     "Electrical Systems",
      "Water Hygiene":  "Water Hygiene",
      "Security":       "Security Systems",
      "Lifts & Hoists": "Lifts & Hoists",
    };
    for (const g of DEMO_GROUPS) {
      const [ins] = await custDb.insert(isolatedSchema.ppmAssetGroups)
        .values(g).returning({ id: isolatedSchema.ppmAssetGroups.id });
      // Map each category that uses this group name
      for (const [cat, grpName] of Object.entries(categoryToGroup)) {
        if (grpName === g.name) groupIdByCategory[cat] = ins.id;
      }
    }

    // ── STEP 3: Insert assets (fresh — all prior data wiped above) ───────────
    let assetsCreated = 0;
    const assetIdByRef: Record<string, string> = {};
    for (const a of ALL_DEMO_ASSETS) {
      const groupId = groupIdByCategory[a.category] ?? null;
      const [inserted] = await custDb.insert(isolatedSchema.ppmAssets)
        .values({ ...a, groupId } as any)
        .returning({ id: isolatedSchema.ppmAssets.id });
      assetIdByRef[a.assetRef] = inserted.id;
      assetsCreated++;
    }

    // ── STEP 4: Insert templates (fresh — table was wiped above) ─────────────
    let templatesCreated = 0;
    const templateIdByName: Record<string, string> = {};
    for (const t of DEMO_TEMPLATES) {
      const [ins] = await custDb.insert(isolatedSchema.ppmTemplates)
        .values(t as any).returning({ id: isolatedSchema.ppmTemplates.id });
      templateIdByName[t.name] = ins.id;
      templatesCreated++;
    }

    // ── Contractor assignment per category ────────────────────────────────────
    const CATEGORY_CONTRACTOR: Record<string, { company: string; worker: string }> = {
      "HVAC":           { company: "CoolAir Services Ltd",    worker: "Tom Briggs"    },
      "Fire Safety":    { company: "FireGuard UK Ltd",         worker: "Sarah Webb"    },
      "Mechanical":     { company: "BuildRight Co",            worker: "James Carter"  },
      "Electrical":     { company: "Volt-Safe Electrical Ltd", worker: "Raj Patel"     },
      "Water Hygiene":  { company: "AquaSafe Hygiene Ltd",     worker: "Claire Morris" },
      "Security":       { company: "SecureAccess Systems",     worker: "Dan Hughes"    },
      "Lifts & Hoists": { company: "Schindler UK",             worker: "Mark Taylor"   },
    };

    // ── Due day within each month per category (staggered for realism) ─────────
    function getCategoryDueDay(category: string): number {
      switch (category) {
        case "HVAC":           return 7;   // 1st week
        case "Fire Safety":    return 14;  // 2nd week
        case "Water Hygiene":  return 21;  // 3rd week
        case "Security":       return 28;  // 4th week
        case "Lifts & Hoists": return 10;  // early month
        case "Mechanical":     return 12;  // mid-month
        case "Electrical":     return 16;  // mid-month
        default:               return 15;
      }
    }

    // ── Schedules FIRST — so work orders can reference their scheduleId ────────
    type SchedDef = { assetRef: string; templateName: string; frequency: string; customDays?: number; nextDueDate: string; assignedTo?: string };
    const DEMO_SCHEDULES: SchedDef[] = [
      // HVAC – monthly
      ...(["AHU-001","AHU-GF","AHU-01","AHU-02","AHU-03","AHU-04","FCU-01","FCU-02","FCU-03","FCU-04","CT-001"] as const).map(r => ({
        assetRef: r, templateName: "Monthly HVAC Filter Check", frequency: "monthly", nextDueDate: "2026-05-07", assignedTo: "CoolAir Services Ltd",
      })),
      // Fire alarm panel – annual test + monthly emergency lighting
      { assetRef: "FAP-001", templateName: "Annual Fire Alarm Full Test", frequency: "annual", nextDueDate: "2026-12-14", assignedTo: "FireGuard UK Ltd" },
      ...(["FAP-001","EL-001","EL-GF","EL-01","EL-02","EL-03","EL-04"] as const).map(r => ({
        assetRef: r, templateName: "Monthly Emergency Lighting Functional Test", frequency: "monthly", nextDueDate: "2026-05-14", assignedTo: "FireGuard UK Ltd",
      })),
      // Sprinkler – quarterly
      { assetRef: "SPR-001", templateName: "Quarterly Sprinkler System Inspection", frequency: "quarterly", nextDueDate: "2026-06-14", assignedTo: "FireGuard UK Ltd" },
      // Boilers – annual (quarterly service WOs, annual gas safety)
      { assetRef: "BLR-001", templateName: "Annual Boiler Service & Gas Safety Check", frequency: "annual", nextDueDate: "2026-12-12", assignedTo: "BuildRight Co" },
      { assetRef: "BLR-002", templateName: "Annual Boiler Service & Gas Safety Check", frequency: "annual", nextDueDate: "2026-12-12", assignedTo: "BuildRight Co" },
      // Lifts – 6-monthly LOLER
      { assetRef: "LFT-001", templateName: "6-Monthly Lift Thorough Examination", frequency: "custom", customDays: 183, nextDueDate: "2026-06-10", assignedTo: "Schindler UK" },
      { assetRef: "LFT-002", templateName: "6-Monthly Lift Thorough Examination", frequency: "custom", customDays: 183, nextDueDate: "2026-06-10", assignedTo: "Schindler UK" },
      // Electrical – 5-yearly EICR
      ...(["EDB-001","GEN-001","LPS-001"] as const).map(r => ({
        assetRef: r, templateName: "Fixed Wiring Inspection & Testing (EICR)", frequency: "custom", customDays: 1825, nextDueDate: "2031-01-16", assignedTo: "Volt-Safe Electrical Ltd",
      })),
      // Security – monthly
      { assetRef: "ACS-001",  templateName: "Monthly Access Control System Check", frequency: "monthly", nextDueDate: "2026-05-28", assignedTo: "SecureAccess Systems" },
      { assetRef: "CCTV-001", templateName: "Monthly Access Control System Check", frequency: "monthly", nextDueDate: "2026-05-28", assignedTo: "SecureAccess Systems" },
      // Water hygiene – monthly
      ...(["CWT-001","HWC-001","WT-001"] as const).map(r => ({
        assetRef: r, templateName: "Monthly Water Hygiene Inspection", frequency: "monthly", nextDueDate: "2026-05-21", assignedTo: "AquaSafe Hygiene Ltd",
      })),
    ];

    // ── STEP 5: Insert schedules (fresh) ─────────────────────────────────────
    let schedulesCreated = 0;
    const primaryScheduleIdByRef: Record<string, string> = {};

    for (const s of DEMO_SCHEDULES) {
      const assetId = assetIdByRef[s.assetRef];
      if (!assetId) continue;
      const templateId = templateIdByName[s.templateName] ?? null;

      const [ins] = await custDb.insert(isolatedSchema.ppmSchedules).values({
        assetId, templateId,
        title: s.templateName,
        frequency: s.frequency,
        customDays: s.customDays ?? null,
        startDate: "2026-01-01",
        nextDueDate: s.nextDueDate,
        status: "scheduled",
        assignedTo: s.assignedTo ?? null,
      } as any).returning({ id: isolatedSchema.ppmSchedules.id });
      schedulesCreated++;

      // Keep the primary (most-frequently-recurring) schedule per asset
      const prev = primaryScheduleIdByRef[s.assetRef];
      if (!prev || s.frequency === "monthly") {
        primaryScheduleIdByRef[s.assetRef] = ins.id;
      }
    }

    // ── STEP 6: Work orders: Jan–Dec 2026 linked to their schedules ──────────
    // (table already wiped in STEP 1 — insert fresh)

    // posIdx cycles the starting offset so quarterly/6-monthly assets hit different months,
    // spreading the maintenance load visibly across the whole year in the annual planner.
    function getServiceMonths(category: string, posIdx: number = 0): number[] {
      const off = posIdx % 3; // rotates 0→1→2→0 per asset
      switch (category) {
        case "HVAC":           return [0,1,2,3,4,5,6,7,8,9,10,11]; // monthly – always all 12
        case "Fire Safety":    return [0,1,2,3,4,5,6,7,8,9,10,11]; // monthly
        case "Water Hygiene":  return [0,1,2,3,4,5,6,7,8,9,10,11]; // monthly
        case "Security":       return [0,1,2,3,4,5,6,7,8,9,10,11]; // monthly
        case "Mechanical":     return [off, off+3, off+6, off+9].filter(m => m < 12);  // staggered quarterly
        case "Electrical":     return [off, off+3, off+6, off+9].filter(m => m < 12);  // staggered quarterly
        case "Lifts & Hoists": return posIdx % 2 === 0 ? [5,11] : [2,8]; // Jun/Dec or Mar/Sep
        default:               return [off, off+3, off+6, off+9].filter(m => m < 12);
      }
    }

    function getTaskTitle(category: string, assetName: string): string {
      switch (category) {
        case "HVAC":           return `HVAC Service – ${assetName}`;
        case "Fire Safety":    return `Fire Safety Inspection – ${assetName}`;
        case "Water Hygiene":  return `Water Hygiene Check – ${assetName}`;
        case "Security":       return `Security System Check – ${assetName}`;
        case "Mechanical":     return `Mechanical Service – ${assetName}`;
        case "Electrical":     return `Electrical Inspection – ${assetName}`;
        case "Lifts & Hoists": return `Lift Thorough Examination – ${assetName}`;
        default:               return `Maintenance – ${assetName}`;
      }
    }

    // Build a work-order record for a given year + month, with realistic per-year statuses.
    // 2024 — full historical year: all completed, small fraction overdue for realism
    // 2025 — recent historical year: mostly completed, a few overdue late in the year
    // 2026 — current year: Jan–Apr realistic mix; May+ scheduled
    // 2027 — forward planning year: all scheduled
    function buildWoRecord(
      year: number, monthIdx: number, assetPosition: number, category: string
    ): { status: string; completedDate?: string; dueDate: string; notes?: string } {
      const dueDay = getCategoryDueDay(category);
      const lastDay = new Date(year, monthIdx + 1, 0).getDate();
      const day = String(Math.min(dueDay, lastDay)).padStart(2, "0");
      const mm  = String(monthIdx + 1).padStart(2, "0");
      const dueDate = `${year}-${mm}-${day}`;

      if (year === 2024) {
        // Completed historical year — ~85% completed on time, ~10% completed late, ~5% overdue
        const slot = (assetPosition + monthIdx) % 20;
        if (slot === 3) return { status: "overdue", dueDate, notes: "Contractor unavailable — not completed." };
        if (slot === 9) {
          // completed a week late
          const lateDay = String(Math.min(dueDay + 7, lastDay)).padStart(2, "0");
          return { status: "completed", completedDate: `${year}-${mm}-${lateDay}`, dueDate, notes: "Completed 7 days late." };
        }
        return { status: "completed", completedDate: dueDate, dueDate };
      }

      if (year === 2025) {
        // Mostly done — Q1–Q3 all completed, Q4 has a few overdue
        if (monthIdx >= 9 && (assetPosition + monthIdx) % 5 === 0) {
          return { status: "overdue", dueDate, notes: "Outstanding — Q4 contractor scheduling issue." };
        }
        if (monthIdx >= 9 && (assetPosition + monthIdx) % 7 === 0) {
          // completed a few days late
          const lateDay = String(Math.min(dueDay + 5, lastDay)).padStart(2, "0");
          return { status: "completed", completedDate: `${year}-${mm}-${lateDay}`, dueDate, notes: "Completed late." };
        }
        return { status: "completed", completedDate: dueDate, dueDate };
      }

      if (year === 2026) {
        // Current year (today = April 2026)
        if (monthIdx <= 1) {
          return { status: "completed", completedDate: dueDate, dueDate };
        }
        if (monthIdx === 2) {
          // March: 2/3 completed; 1/3 overdue
          if (assetPosition % 3 === 1) {
            return { status: "overdue", dueDate, notes: "Contractor visit missed — rescheduled for April." };
          }
          return { status: "completed", completedDate: dueDate, dueDate };
        }
        if (monthIdx === 3) {
          // April: completed / overdue / in_progress spread
          const mod = assetPosition % 3;
          if (mod === 0) return { status: "completed", completedDate: `2026-04-${day}`, dueDate };
          if (mod === 1) return { status: "overdue", dueDate, notes: "Work overdue — contractor visit rescheduled." };
          return { status: "in_progress", dueDate };
        }
        // May onwards: scheduled
        return { status: "scheduled", dueDate };
      }

      // 2027 — forward planning, all scheduled
      return { status: "scheduled", dueDate };
    }

    const STATUTORY_CATEGORIES = new Set(["Fire Safety", "Mechanical", "Electrical", "Water Hygiene", "Lifts & Hoists"]);

    let workOrdersCreated = 0;
    let assetPosition = 0;

    // Generate work orders for 4 years: 2024 (history), 2025 (recent), 2026 (current), 2027 (planned)
    const PLANNER_YEARS = [2024, 2025, 2026, 2027];

    for (const asset of ALL_DEMO_ASSETS) {
      const assetId = assetIdByRef[asset.assetRef];
      if (!assetId) continue;
      const months     = getServiceMonths(asset.category, assetPosition);
      const title      = getTaskTitle(asset.category, asset.name);
      const scheduleId = primaryScheduleIdByRef[asset.assetRef] ?? null;
      const contractor = CATEGORY_CONTRACTOR[asset.category];
      const requiresCertificate = STATUTORY_CATEGORIES.has(asset.category ?? "");

      for (const year of PLANNER_YEARS) {
        for (const monthIdx of months) {
          const rec = buildWoRecord(year, monthIdx, assetPosition, asset.category);
          // For historical years: assign the contractor who did the work; future: leave blank
          const showContractor = rec.status !== "scheduled";
          await custDb.insert(isolatedSchema.ppmWorkOrders).values({
            assetId,
            scheduleId,
            title,
            status: rec.status,
            dueDate: rec.dueDate,
            completedDate: rec.completedDate ?? null,
            contractorCompanyName: showContractor ? contractor?.company ?? null : null,
            contractorWorkerName:  showContractor ? contractor?.worker  ?? null : null,
            notes: rec.notes ?? null,
            requiresCertificate,
          } as any);
          workOrdersCreated++;
        }
      }
      assetPosition++;
    }

    res.json({
      success: true,
      groupsCreated: DEMO_GROUPS.length,
      assetsCreated,
      templatesCreated,
      schedulesCreated,
      workOrdersCreated,
      message: `Demo data refreshed: ${DEMO_GROUPS.length} asset groups, ${assetsCreated} assets, ${templatesCreated} templates, ${schedulesCreated} schedules, and ${workOrdersCreated} work orders across 2024–2027. Use the year picker in the Annual Planner to navigate between years.`,
    });
  } catch (error: unknown) {
    console.error("POST /api/ppm/demo-data", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load demo data" });
  }
});

// ── PPM Annual Planner — Email Report ───────────────────────────────────────

// POST /api/ppm/annual-planner/email — send a formatted annual planner to an email address
app.post("/api/ppm/annual-planner/email", requireAuth, async (req, res) => {
  try {
    const { email, year, message } = req.body as { email?: string; year?: number; message?: string };
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "A valid recipient email address is required." });
    }
    const planYear = year ?? new Date().getFullYear();
    const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const custDb = await customerDbService.getCustomerDatabase(context.customerId);

    const assets = await custDb.select().from(isolatedSchema.ppmAssets).orderBy(isolatedSchema.ppmAssets.name);
    const workOrders = await custDb.select().from(isolatedSchema.ppmWorkOrders);
    const yearWOs = workOrders.filter(wo => wo.dueDate && new Date(wo.dueDate).getFullYear() === planYear);

    // Build assetId → month → [wos] index
    const woIndex = new Map<string, Map<number, typeof yearWOs>>();
    for (const wo of yearWOs) {
      if (!wo.assetId || !wo.dueDate) continue;
      const m = new Date(wo.dueDate).getMonth();
      if (!woIndex.has(wo.assetId)) woIndex.set(wo.assetId, new Map());
      const mm = woIndex.get(wo.assetId)!;
      if (!mm.has(m)) mm.set(m, []);
      mm.get(m)!.push(wo);
    }

    const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    function statusColor(status: string): string {
      switch (status) {
        case "completed":   return "#2E7D32";
        case "overdue":     return "#C62828";
        case "in_progress": return "#1565C0";
        case "scheduled":   return "#546E7A";
        default:            return "#9CA3AF";
      }
    }
    function statusBg(status: string): string {
      switch (status) {
        case "completed":   return "#EAF3DE";
        case "overdue":     return "#FDEAEA";
        case "in_progress": return "#EBF5FB";
        case "scheduled":   return "#F0F4F8";
        default:            return "#FFFFFF";
      }
    }
    function bestStatus(wos: typeof yearWOs): string {
      if (!wos || wos.length === 0) return "empty";
      const priority = ["overdue","in_progress","scheduled","completed"];
      for (const p of priority) { if (wos.some(w => w.status === p)) return p; }
      return wos[0].status;
    }

    const totalTasks = yearWOs.length;
    const complete = yearWOs.filter(w => w.status === "completed").length;
    const overdue  = yearWOs.filter(w => w.status === "overdue").length;
    const pct = totalTasks ? Math.round((complete / totalTasks) * 100) : 0;

    const senderName = req.user!.username;

    const headerRow = `<tr style="background:#1a2e4a;color:white;">
      <th style="padding:8px 10px;text-align:left;font-size:12px;white-space:nowrap;min-width:200px;">Asset</th>
      ${MONTHS.map(m => `<th style="padding:6px 4px;text-align:center;font-size:11px;min-width:44px;">${m}</th>`).join("")}
    </tr>`;

    const bodyRows = assets.map((asset, i) => {
      const monthMap = woIndex.get(asset.id) ?? new Map();
      const rowBg = i % 2 === 0 ? "#ffffff" : "#f7f9fb";
      const cells = MONTHS.map((_, mIdx) => {
        const wos = monthMap.get(mIdx) ?? [];
        const st = bestStatus(wos);
        if (st === "empty") return `<td style="padding:4px;text-align:center;background:${rowBg};border:1px solid #e5e7eb;">
          <span style="display:inline-block;width:32px;height:22px;background:#f3f4f6;border-radius:3px;border:1px solid #d1d5db;"></span>
        </td>`;
        return `<td style="padding:4px;text-align:center;background:${rowBg};border:1px solid #e5e7eb;">
          <span style="display:inline-block;width:32px;height:22px;background:${statusBg(st)};border-radius:3px;border:1px solid ${statusColor(st)};color:${statusColor(st)};font-size:9px;font-weight:700;line-height:22px;text-align:center;">
            ${st === "completed" ? "✓" : st === "overdue" ? "!" : st === "in_progress" ? "→" : "·"}
          </span>
        </td>`;
      }).join("");
      return `<tr>
        <td style="padding:6px 10px;font-size:12px;font-weight:600;white-space:nowrap;background:${rowBg};border:1px solid #e5e7eb;min-width:200px;">
          ${asset.name}
          <div style="font-size:10px;color:#6b7280;font-weight:400;">${[asset.assetRef, asset.category].filter(Boolean).join(" · ")}</div>
        </td>
        ${cells}
      </tr>`;
    }).join("");

    const legend = `<tr>
      ${[["#EAF3DE","#2E7D32","Completed"],["#FDEAEA","#C62828","Overdue"],["#EBF5FB","#1565C0","In Progress"],["#F0F4F8","#546E7A","Scheduled"],["#FFFFFF","#9CA3AF","No Task"]].map(([bg,c,label]) =>
        `<td style="padding:4px 8px;"><span style="display:inline-block;width:12px;height:12px;background:${bg};border:1px solid ${c};border-radius:2px;vertical-align:middle;margin-right:4px;"></span><span style="font-size:11px;color:#374151;">${label}</span></td>`
      ).join("")}
    </tr>`;

    const htmlBody = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#1a2e4a;background:#f0f4f8;margin:0;padding:0;">
<div style="max-width:900px;margin:20px auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
  <div style="background:#1a2e4a;color:white;padding:24px 28px;">
    <h1 style="margin:0 0 4px 0;font-size:22px;">PPM Annual Planner ${planYear}</h1>
    <p style="margin:0;font-size:14px;opacity:0.8;">Planned Preventive Maintenance Schedule — generated ${new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"})}</p>
  </div>
  <div style="padding:20px 28px;background:#f0f4f8;display:flex;gap:24px;flex-wrap:wrap;">
    <div style="background:white;border-radius:6px;padding:14px 20px;min-width:120px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      <div style="font-size:28px;font-weight:700;">${totalTasks}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:2px;">Total Tasks</div>
    </div>
    <div style="background:white;border-radius:6px;padding:14px 20px;min-width:120px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      <div style="font-size:28px;font-weight:700;color:#2E7D32;">${complete}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:2px;">Completed (${pct}%)</div>
    </div>
    <div style="background:white;border-radius:6px;padding:14px 20px;min-width:120px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      <div style="font-size:28px;font-weight:700;color:#C62828;">${overdue}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:2px;">Overdue</div>
    </div>
    <div style="background:white;border-radius:6px;padding:14px 20px;min-width:120px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      <div style="font-size:28px;font-weight:700;">${assets.length}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:2px;">Assets</div>
    </div>
  </div>
  ${message ? `<div style="padding:16px 28px;background:#fffbeb;border-top:1px solid #fde68a;font-size:13px;color:#92400e;">${message.replace(/\n/g,"<br>")}</div>` : ""}
  <div style="padding:20px 28px;">
    <h2 style="font-size:15px;margin:0 0 12px 0;color:#1a2e4a;">12-Month Maintenance Grid</h2>
    <div style="overflow-x:auto;">
      <table style="border-collapse:collapse;min-width:600px;width:100%;font-family:Arial,sans-serif;">
        <thead>${headerRow}</thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
    <table style="margin-top:12px;border-collapse:collapse;">${legend}</table>
  </div>
  <div style="padding:16px 28px;background:#f7f9fb;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;">
    Sent by ${senderName} via TPR-Max PPM Module. This is an automated report — please do not reply to this email.
  </div>
</div>
</body></html>`;

    const emailSvc = new EmailService(context.customerId);
    const sent = await emailSvc.sendEmail({
      to: email,
      subject: `PPM Annual Planner ${planYear} — Maintenance Schedule Report`,
      html: htmlBody,
    });

    if (!sent) return res.status(500).json({ error: "Failed to send email. Check your email settings." });
    res.json({ success: true, message: `Annual Planner ${planYear} sent to ${email}.` });
  } catch (error: unknown) {
    console.error("POST /api/ppm/annual-planner/email", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to send email" });
  }
});

// ── PPM Public Work Order (Contractor Mobile View) ──────────────────────────

// GET /api/ppm/work-order/public/:token — contractor fetches their work order
app.get("/api/ppm/work-order/public/:token", ppmPublicRateLimit, async (req, res) => {
  try {
    const { token } = req.params;
    if (!token || token.length < 10) return res.status(400).json({ error: "Invalid token" });

    // Helper: resolve work order from a known customer (used by both cache-hit and scan paths)
    const resolveFromCustomer = async (customerId: string) => {
      const custDb = await customerDbService.getCustomerDatabase(customerId);
      const [wo] = await custDb.select().from(isolatedSchema.ppmWorkOrders)
        .where(eq(isolatedSchema.ppmWorkOrders.accessToken, token));
      if (!wo) return null;
      // Enforce token expiry
      if (wo.accessTokenExpiresAt && new Date() > new Date(wo.accessTokenExpiresAt)) {
        return { expired: true as const };
      }
      const docs = await custDb.select().from(isolatedSchema.ppmWorkOrderDocuments)
        .where(eq(isolatedSchema.ppmWorkOrderDocuments.workOrderId, wo.id))
        .orderBy(isolatedSchema.ppmWorkOrderDocuments.createdAt);
      let asset = null;
      if (wo.assetId) {
        const [assetRow] = await custDb.select().from(isolatedSchema.ppmAssets)
          .where(eq(isolatedSchema.ppmAssets.id, wo.assetId));
        asset = assetRow ?? null;
      }
      // Strip internal/sensitive fields from public response
      const { accessToken: _t, accessTokenExpiresAt: _e, overdueAlertedAt: _o, missingCertAlertedAt: _m, ...safeWo } = wo;
      // Populate cache so subsequent requests skip the full scan
      if (wo.accessTokenExpiresAt) ppmTokenCacheSet(token, customerId, new Date(wo.accessTokenExpiresAt));
      return { workOrder: safeWo, documents: docs, asset };
    };

    // Fast path: cache hit avoids cross-tenant scan
    const cachedCustomerId = ppmTokenCacheGet(token);
    if (cachedCustomerId) {
      try {
        const result = await resolveFromCustomer(cachedCustomerId);
        if (result && result !== null && !("expired" in result)) return res.json(result);
        if (result && "expired" in result) {
          return res.status(410).json({ error: "This work order link has expired. Please contact your administrator for a new link." });
        }
        // Cache stale — fall through to full scan
        ppmTokenCacheEvict(token);
      } catch { /* fall through to full scan */ }
    }

    // Slow path: iterate all tenants (cache miss or stale)
    const allCustomers = await customerDbService.getAllCustomers();
    for (const customer of allCustomers) {
      try {
        const result = await resolveFromCustomer(customer.id);
        if (!result) continue;
        if ("expired" in result) return res.status(410).json({ error: "This work order link has expired. Please contact your administrator for a new link." });
        return res.json(result);
      } catch { /* skip this customer and try next */ }
    }
    res.status(404).json({ error: "Work order not found" });
  } catch (error: unknown) {
    console.error("GET /api/ppm/work-order/public/:token", error);
    res.status(500).json({ error: "Failed to fetch work order" });
  }
});

// PUT /api/ppm/work-order/public/:token — contractor updates status / completion notes
// Token is rotated on every write (rolling token semantics: original email link is single-use,
// subsequent operations use the nextToken returned in the response).
app.put("/api/ppm/work-order/public/:token", ppmPublicRateLimit, async (req, res) => {
  try {
    const { token } = req.params;
    if (!token || token.length < 10) return res.status(400).json({ error: "Invalid token" });
    const { status, completionNotes } = req.body;
    const allowedStatuses = ["in_progress", "completed"];
    if (status && !allowedStatuses.includes(status)) return res.status(400).json({ error: "Invalid status" });

    const performUpdate = async (customerId: string) => {
      const custDb = await customerDbService.getCustomerDatabase(customerId);
      const [wo] = await custDb.select().from(isolatedSchema.ppmWorkOrders)
        .where(eq(isolatedSchema.ppmWorkOrders.accessToken, token));
      if (!wo) return null;
      if (wo.accessTokenExpiresAt && new Date() > new Date(wo.accessTokenExpiresAt)) return { expired: true as const };
      const updates: Record<string, unknown> = {};
      if (status) updates.status = status;
      if (completionNotes !== undefined) updates.completionNotes = completionNotes;
      if (status === "completed") updates.completedDate = new Date().toISOString().split("T")[0];
      const nextToken = randomBytes(24).toString("hex");
      const nextExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      updates.accessToken = nextToken;
      updates.accessTokenExpiresAt = nextExpiresAt;
      const [updated] = await custDb.update(isolatedSchema.ppmWorkOrders)
        .set(updates)
        .where(eq(isolatedSchema.ppmWorkOrders.id, wo.id))
        .returning();
      // Evict old token, cache the new one
      ppmTokenCacheEvict(token);
      ppmTokenCacheSet(nextToken, customerId, nextExpiresAt);

      // Advance the linked schedule's nextDueDate when contractor marks work order completed
      if (status === "completed" && updated.scheduleId) {
        try {
          const [schedule] = await custDb.select()
            .from(isolatedSchema.ppmSchedules)
            .where(eq(isolatedSchema.ppmSchedules.id, updated.scheduleId))
            .limit(1);
          if (schedule?.nextDueDate) {
            const newDue = calcNextDueDate(schedule.nextDueDate, schedule.frequency, schedule.customDays ?? undefined);
            await custDb.update(isolatedSchema.ppmSchedules)
              .set({
                nextDueDate: newDue,
                status: "scheduled",
                lastCompletedDate: new Date().toISOString().split("T")[0],
              })
              .where(eq(isolatedSchema.ppmSchedules.id, schedule.id));
            console.log(`✅ [PPM Public] Schedule ${schedule.id} advanced: ${schedule.nextDueDate} → ${newDue}`);
          }
        } catch (schedErr) {
          console.error("⚠️ [PPM Public] Failed to advance schedule after contractor completion:", schedErr);
        }
      }

      const { accessToken: _t, accessTokenExpiresAt: _e, ...safeUpdated } = updated;
      return { ...safeUpdated, nextToken };
    };

    // Fast path: cache hit
    const cachedCustomerId = ppmTokenCacheGet(token);
    if (cachedCustomerId) {
      try {
        const result = await performUpdate(cachedCustomerId);
        if (result && !("expired" in result)) return res.json(result);
        if (result && "expired" in result) return res.status(410).json({ error: "This work order link has expired. Please contact your administrator for a new link." });
        ppmTokenCacheEvict(token);
      } catch { /* fall through to full scan */ }
    }

    // Slow path: iterate all tenants
    const allCustomers = await customerDbService.getAllCustomers();
    for (const customer of allCustomers) {
      try {
        const result = await performUpdate(customer.id);
        if (!result) continue;
        if ("expired" in result) return res.status(410).json({ error: "This work order link has expired. Please contact your administrator for a new link." });
        return res.json(result);
      } catch { /* skip */ }
    }
    res.status(404).json({ error: "Work order not found" });
  } catch (error: unknown) {
    console.error("PUT /api/ppm/work-order/public/:token", error);
    res.status(500).json({ error: "Failed to update work order" });
  }
});

// POST /api/ppm/work-order/public/:token/files — atomic contractor file upload + document record creation
// Combines upload and document linking in a single request to prevent orphan objects.
// Also rotates the access token after successful upload (rolling token).
app.post("/api/ppm/work-order/public/:token/files", ppmPublicRateLimit, async (req, res) => {
  try {
    const { token } = req.params;
    if (!token || token.length < 10) return res.status(400).json({ error: "Invalid token" });
    const { data, mimeType, fileName, fileType } = req.body;
    if (!data || !mimeType || !fileName) return res.status(400).json({ error: "Missing required fields: data, mimeType, fileName" });

    // Enforce MIME-type allowlist
    const ALLOWED_MIME_TYPES = new Set([
      "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ]);
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return res.status(415).json({ error: "File type not permitted. Allowed: images, PDF, Word, Excel." });
    }

    // Enforce 10 MB file size limit
    const MAX_BASE64_BYTES = 14 * 1024 * 1024;
    if (typeof data !== "string" || Buffer.byteLength(data, "utf8") > MAX_BASE64_BYTES) {
      return res.status(413).json({ error: "File too large. Maximum upload size is 10 MB." });
    }

    // Fast path: if token is cached, try that customer first (avoids full cross-tenant scan)
    const cachedFilesCustomerId = ppmTokenCacheGet(token);
    const allCustomers = await customerDbService.getAllCustomers();
    const orderedCustomers = cachedFilesCustomerId
      ? [{ id: cachedFilesCustomerId }, ...allCustomers.filter(c => c.id !== cachedFilesCustomerId)]
      : allCustomers;
    for (const customer of orderedCustomers) {
      try {
        const custDb = await customerDbService.getCustomerDatabase(customer.id);
        const [wo] = await custDb.select().from(isolatedSchema.ppmWorkOrders)
          .where(eq(isolatedSchema.ppmWorkOrders.accessToken, token));
        if (wo) {
          // Check token expiry
          if (wo.accessTokenExpiresAt && new Date() > new Date(wo.accessTokenExpiresAt)) {
            return res.status(410).json({ error: "This work order link has expired. Please contact your administrator for a new link." });
          }
          // Pre-flight: enforce max 5 documents before any storage write
          const existing = await custDb.select({ id: isolatedSchema.ppmWorkOrderDocuments.id })
            .from(isolatedSchema.ppmWorkOrderDocuments)
            .where(eq(isolatedSchema.ppmWorkOrderDocuments.workOrderId, wo.id));
          if (existing.length >= 5) {
            return res.status(400).json({ error: "Maximum of 5 documents allowed per work order" });
          }

          // Upload file to object storage
          const buffer = Buffer.from(data, "base64");
          const objectStorageService = new ObjectStorageService();
          const privateObjectDir = objectStorageService.getPrivateObjectDir();
          const objectId = randomUUID();
          const fullPath = `${privateObjectDir}/uploads/${objectId}`;
          const parts = fullPath.slice(1).split("/");
          const bucketName = parts[0];
          const objectName = parts.slice(1).join("/");
          const bucket = objectStorageClient.bucket(bucketName);
          const fileObj = bucket.file(objectName);
          await fileObj.save(buffer, { contentType: mimeType, resumable: false });
          const objectPath = `/objects/uploads/${objectId}`;

          // Atomically create document record (scannedAt left null — AI scan fires async below)
          const resolvedFileType = fileType || "other";
          const [doc] = await custDb.insert(isolatedSchema.ppmWorkOrderDocuments)
            .values({ workOrderId: wo.id, fileName, fileUrl: objectPath, fileType: resolvedFileType, uploadedBy: "contractor" })
            .returning();

          // Fire-and-forget async AI scan to extract metadata (expiryDate, issuer, ref).
          // Sets scannedAt once complete so the mobile view can distinguish "pending" from "scanned with no results".
          (async () => {
            try {
              const { scanDocumentWithAI } = await import('../openaiService');
              const isImage = mimeType.startsWith("image/");
              let scanResult;
              if (isImage) {
                scanResult = await scanDocumentWithAI({ mimeType, base64Data: data, documentType: resolvedFileType });
              } else if (mimeType === "application/pdf") {
                // Attempt text extraction for PDFs; fall back to no-op (non-image PDFs can't be vision-scanned)
                scanResult = await scanDocumentWithAI({ mimeType, base64Data: data, documentType: resolvedFileType });
              } else {
                // Non-image, non-PDF (Word/Excel) — mark as scanned with no results
                scanResult = { fields: { expiryDate: null, issuedBy: null, policyNumber: null }, success: false };
              }
              const metadataUpdate: Record<string, unknown> = { scannedAt: new Date() };
              if (scanResult.fields.expiryDate) metadataUpdate.expiryDate = scanResult.fields.expiryDate;
              if (scanResult.fields.issuedBy) metadataUpdate.issuedBy = scanResult.fields.issuedBy;
              if (scanResult.fields.policyNumber) metadataUpdate.referenceNumber = scanResult.fields.policyNumber;
              await custDb.update(isolatedSchema.ppmWorkOrderDocuments)
                .set(metadataUpdate)
                .where(eq(isolatedSchema.ppmWorkOrderDocuments.id, doc.id));
            } catch (scanErr) {
              // Best-effort: stamp scannedAt so the pending indicator clears even if the scan failed
              try {
                await custDb.update(isolatedSchema.ppmWorkOrderDocuments)
                  .set({ scannedAt: new Date() })
                  .where(eq(isolatedSchema.ppmWorkOrderDocuments.id, doc.id));
              } catch { /* ignore */ }
              console.error("PPM async AI scan error:", scanErr);
            }
          })();

          // If certificate, mark certificateUploadedAt; always clear missing-docs alert
          const woUpdates: Record<string, unknown> = { missingDocsAlertedAt: null };
          if (resolvedFileType === "certificate") {
            woUpdates.certificateUploadedAt = new Date();
          }
          // Rotate access token (rolling token — invalidates prior link after each write)
          const nextToken = randomBytes(24).toString("hex");
          const nextExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
          woUpdates.accessToken = nextToken;
          woUpdates.accessTokenExpiresAt = nextExpiresAt;
          await custDb.update(isolatedSchema.ppmWorkOrders)
            .set(woUpdates)
            .where(eq(isolatedSchema.ppmWorkOrders.id, wo.id));

          // Evict old token from cache, prime cache with new token
          ppmTokenCacheEvict(token);
          ppmTokenCacheSet(nextToken, customer.id, nextExpiresAt);

          return res.json({ document: doc, nextToken });
        }
      } catch { /* skip */ }
    }
    res.status(404).json({ error: "Work order not found" });
  } catch (error: unknown) {
    console.error("POST /api/ppm/work-order/public/:token/files", error);
    res.status(500).json({ error: "Failed to upload file" });
  }
});

// DEPRECATED: Use POST /api/ppm/work-order/public/:token/files instead (atomic upload+document).
// Retained as 410 Gone to prevent two-step orphan-object flow from any cached clients.
app.post("/api/ppm/work-order/public/:token/upload", (_req, res) => {
  res.status(410).json({ error: "This endpoint is deprecated. Use POST /api/ppm/work-order/public/:token/files for atomic upload." });
});

// DEPRECATED: Use POST /api/ppm/work-order/public/:token/files instead (atomic upload+document).
app.post("/api/ppm/work-order/public/:token/documents", (_req, res) => {
  res.status(410).json({ error: "This endpoint is deprecated. Use POST /api/ppm/work-order/public/:token/files for atomic upload." });
});

// ── PPM Daily Alert Cron ──────────────────────────────────────────────────────
// Runs at configurable hour (PPM_ALERT_HOUR env var, default 7) Europe/London every day:
//  (a) marks work orders overdue when past due date and not completed
//  (b) alerts admin + contractor when completed work order has no cert after 48h
//  (c) alerts admin when overdue work orders have no documents uploaded at all
//  (d) auto-generates work orders from schedules that have reached their next due date
const ppmAlertHour = parseInt(process.env.PPM_ALERT_HOUR ?? "7", 10);
cron.schedule(`0 ${ppmAlertHour} * * *`, async () => {
  try {
    console.log("🔧 [PPM Cron] Running daily PPM alert check…");
    const allCustomers = await customerDbService.getAllCustomers();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (const customer of allCustomers) {
      try {
        const custDb = await customerDbService.getCustomerDatabase(customer.id);
        const workOrders = await custDb.select().from(isolatedSchema.ppmWorkOrders);
        const overdueIds: string[] = [];
        const missingCertWOs: (typeof workOrders[0])[] = [];

        for (const wo of workOrders) {
          if (wo.status === "completed" || wo.status === "overdue" || wo.status === "cancelled") {
            // Check for missing cert: completed 48+ hours ago but no cert uploaded AND alert not yet sent.
            // completedDate is date-only text so we compare calendar days conservatively:
            // alert when completedDate is at least 2 days before today (>= 48 calendar hours)
            if (wo.status === "completed" && wo.requiresCertificate && !wo.certificateUploadedAt && wo.completedDate && !wo.missingCertAlertedAt) {
              const completedDay = new Date(wo.completedDate + "T00:00:00Z");
              const msDiff = today.getTime() - completedDay.getTime();
              const daysDiff = msDiff / (1000 * 60 * 60 * 24);
              if (daysDiff >= 2) missingCertWOs.push(wo);
            }
            continue;
          }
          if (wo.dueDate) {
            const due = new Date(wo.dueDate); due.setHours(0, 0, 0, 0);
            if (due < today) overdueIds.push(wo.id);
          }
        }

        // Batch-mark overdue
        if (overdueIds.length > 0) {
          for (const woId of overdueIds) {
            await custDb.update(isolatedSchema.ppmWorkOrders)
              .set({ status: "overdue" })
              .where(eq(isolatedSchema.ppmWorkOrders.id, woId));
          }
          console.log(`✅ [PPM Cron] Marked ${overdueIds.length} work orders overdue for customer ${customer.id}`);
        }

        // Get settings for email
        const settingsRows = await custDb.execute(`SELECT company_name, email, notify_on_document_expiry FROM company_settings LIMIT 1`);
        const settings = settingsRows.rows[0] as { company_name?: string; email?: string; notify_on_document_expiry?: boolean } | undefined;
        const companyName = (settings?.company_name as string) || "TPR-Max";
        const adminEmail = settings?.email as string | undefined;
        const notifyEnabled = settings?.notify_on_document_expiry !== false;
        const emailSvc = new EmailService(customer.id);

        // Alert admin about newly-overdue work orders (only those not yet alerted)
        const newlyAlertedOverdue = workOrders.filter(w => overdueIds.includes(w.id) && !w.overdueAlertedAt);
        if (notifyEnabled && newlyAlertedOverdue.length > 0 && adminEmail) {
          await emailSvc.sendEmail({
            to: adminEmail,
            subject: `PPM Alert: ${newlyAlertedOverdue.length} Overdue Work Order${newlyAlertedOverdue.length > 1 ? "s" : ""}`,
            companyName,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                <div style="background:#dc2626;color:#fff;padding:20px;border-radius:8px 8px 0 0">
                  <h2 style="margin:0">PPM Overdue Alert — ${companyName}</h2>
                </div>
                <div style="background:#fff;padding:20px;border:1px solid #e5e7eb">
                  <p>${newlyAlertedOverdue.length} PPM work order${newlyAlertedOverdue.length > 1 ? "s have" : " has"} become overdue:</p>
                  <ul style="padding-left:20px">
                    ${newlyAlertedOverdue.map(w => `<li><strong>${w.title}</strong>${w.dueDate ? ` — was due ${w.dueDate}` : ""}</li>`).join("")}
                  </ul>
                  <p>Please log in to TPR-Max to review and take action.</p>
                </div>
              </div>
            `,
            text: `PPM Overdue Alert\n\n${newlyAlertedOverdue.length} work order(s) are overdue:\n${newlyAlertedOverdue.map(w => `- ${w.title}${w.dueDate ? ` (due ${w.dueDate})` : ""}`).join("\n")}\n\nPlease log in to review.`,
          });
          // Mark as alerted so we don't resend tomorrow unless status resets
          for (const wo of newlyAlertedOverdue) {
            await custDb.update(isolatedSchema.ppmWorkOrders)
              .set({ overdueAlertedAt: new Date() })
              .where(eq(isolatedSchema.ppmWorkOrders.id, wo.id));
          }
        }

        // Alert for missing certificates (only those not yet alerted; missingCertAlertedAt guards re-send)
        if (notifyEnabled) for (const wo of missingCertWOs) {
          const recipients = [...new Set([adminEmail, wo.assignedEmail].filter((e): e is string => !!e))];
          for (const email of recipients) {
            await emailSvc.sendEmail({
              to: email,
              subject: `PPM Certificate Missing: ${wo.title}`,
              companyName,
              html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                  <div style="background:#d97706;color:#fff;padding:20px;border-radius:8px 8px 0 0">
                    <h2 style="margin:0">PPM Certificate Required — ${companyName}</h2>
                  </div>
                  <div style="background:#fff;padding:20px;border:1px solid #e5e7eb">
                    <p>The following PPM work order was completed more than 48 hours ago but no service certificate has been uploaded:</p>
                    <p><strong>${wo.title}</strong>${wo.completedDate ? ` — completed ${wo.completedDate}` : ""}</p>
                    <p>Please upload the relevant certificate as soon as possible.</p>
                  </div>
                </div>
              `,
              text: `PPM Certificate Missing: ${wo.title}\n\nThis work order was completed more than 48 hours ago but no service certificate has been uploaded.\n\nPlease upload the certificate.`,
            });
          }
          // Mark alert as sent so it is not repeated daily
          await custDb.update(isolatedSchema.ppmWorkOrders)
            .set({ missingCertAlertedAt: new Date() })
            .where(eq(isolatedSchema.ppmWorkOrders.id, wo.id));
        }

        // ── (c) Alert for overdue work orders with no documents uploaded ─────────
        // Checks overdue WOs that have no docs at all (any type) and haven't
        // been alerted yet. Sends one consolidated email to admin.
        const overdueWOs = workOrders.filter(w =>
          w.status === "overdue" && !w.missingDocsAlertedAt
        );
        const missingDocsWOs: (typeof workOrders[0])[] = [];
        for (const wo of overdueWOs) {
          const docs = await custDb.select({ id: isolatedSchema.ppmWorkOrderDocuments.id })
            .from(isolatedSchema.ppmWorkOrderDocuments)
            .where(eq(isolatedSchema.ppmWorkOrderDocuments.workOrderId, wo.id))
            .limit(1);
          if (docs.length === 0) missingDocsWOs.push(wo);
        }
        if (notifyEnabled && missingDocsWOs.length > 0 && adminEmail) {
          const rows = missingDocsWOs.map(wo =>
            `<tr>
              <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-weight:500">${wo.title}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#dc2626">${wo.dueDate ?? "—"}</td>
            </tr>`
          ).join("");
          const sent = await emailSvc.sendEmail({
            to: adminEmail,
            subject: `PPM Alert: ${missingDocsWOs.length} Overdue Work Order${missingDocsWOs.length > 1 ? "s" : ""} With No Documents`,
            companyName,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                <div style="background:#dc2626;color:#fff;padding:20px;border-radius:8px 8px 0 0">
                  <h2 style="margin:0">PPM Documents Missing — ${companyName}</h2>
                </div>
                <div style="background:#fff;padding:20px;border:1px solid #e5e7eb">
                  <p style="margin-top:0">The following PPM work order${missingDocsWOs.length > 1 ? "s are" : " is"} overdue and <strong>no documents or reports have been uploaded</strong>:</p>
                  <table style="width:100%;border-collapse:collapse;margin:12px 0">
                    <thead>
                      <tr style="background:#fef2f2">
                        <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Work Order</th>
                        <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Due Date</th>
                      </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                  </table>
                  <p style="color:#6b7280;font-size:14px">Please upload the relevant service report, certificate, or completion evidence as soon as possible.</p>
                </div>
                <div style="background:#f9fafb;padding:12px 20px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;font-size:12px;color:#9ca3af">
                  This alert was sent by ${companyName} via TPR-Max PPM system.
                </div>
              </div>
            `,
            text: `PPM Documents Missing\n\nThe following work orders are overdue with no documents uploaded:\n\n${missingDocsWOs.map(w => `- ${w.title} (due: ${w.dueDate ?? "—"})`).join("\n")}\n\nPlease upload the relevant service report or certificate.`,
          });
          if (sent) {
            for (const wo of missingDocsWOs) {
              await custDb.update(isolatedSchema.ppmWorkOrders)
                .set({ missingDocsAlertedAt: new Date() })
                .where(eq(isolatedSchema.ppmWorkOrders.id, wo.id));
            }
            console.log(`📧 [PPM Cron] Missing-docs alert sent for ${missingDocsWOs.length} work order(s) (customer ${customer.id})`);
          }
        }

        // ── (d) Alert for expiring/expired PPM work order documents ────────────
          // Sends a one-time digest email per document when it first enters the expiry
          // window (expired or expiring ≤30 days). Each document is stamped with
          // expiryAlertedAt after being included in an alert so it is never re-sent
          // on subsequent days. The stamp is absent on newly-uploaded documents, so
          // replacement certificates automatically trigger a fresh alert if they too
          // are within the 30-day window.
          {
            const todayDateStr = today.toISOString().split("T")[0];
            const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
            const in30DaysStr = in30Days.toISOString().split("T")[0];

            // Only fetch docs that have not yet been alerted (expiryAlertedAt IS NULL)
            const expiringDocs = await custDb.select({
              id: isolatedSchema.ppmWorkOrderDocuments.id,
              fileName: isolatedSchema.ppmWorkOrderDocuments.fileName,
              fileType: isolatedSchema.ppmWorkOrderDocuments.fileType,
              expiryDate: isolatedSchema.ppmWorkOrderDocuments.expiryDate,
              workOrderId: isolatedSchema.ppmWorkOrderDocuments.workOrderId,
              referenceNumber: isolatedSchema.ppmWorkOrderDocuments.referenceNumber,
            }).from(isolatedSchema.ppmWorkOrderDocuments)
              .where(and(
                sql`${isolatedSchema.ppmWorkOrderDocuments.expiryDate} IS NOT NULL`,
                sql`${isolatedSchema.ppmWorkOrderDocuments.expiryDate} <= ${in30DaysStr}`,
                sql`${isolatedSchema.ppmWorkOrderDocuments.expiryAlertedAt} IS NULL`
              ));

            if (notifyEnabled && expiringDocs.length > 0 && adminEmail) {
              // Enrich with work order title
              const woIds = [...new Set(expiringDocs.map(d => d.workOrderId))];
              const relatedWOs = await custDb.select({
                id: isolatedSchema.ppmWorkOrders.id,
                title: isolatedSchema.ppmWorkOrders.title,
              }).from(isolatedSchema.ppmWorkOrders)
                .where(inArray(isolatedSchema.ppmWorkOrders.id, woIds));
              const woMap = Object.fromEntries(relatedWOs.map(w => [w.id, w.title]));

              const expired = expiringDocs.filter(d => d.expiryDate! <= todayDateStr);
              const soonExpiring = expiringDocs.filter(d => d.expiryDate! > todayDateStr);

              const buildRow = (d: typeof expiringDocs[0], isExp: boolean) =>
                `<tr>
                  <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-weight:500">${d.fileName}</td>
                  <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6">${woMap[d.workOrderId] ?? d.workOrderId}</td>
                  <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:${isExp ? "#dc2626" : "#d97706"};font-weight:600">${d.expiryDate}</td>
                  <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:${isExp ? "#dc2626" : "#d97706"}">${isExp ? "Expired" : "Expiring Soon"}</td>
                </tr>`;

              const tableRows = [
                ...expired.map(d => buildRow(d, true)),
                ...soonExpiring.map(d => buildRow(d, false)),
              ].join("");

              const subjectCount = expiringDocs.length;
              const hasExpired = expired.length > 0;
              const subject = hasExpired
                ? `PPM Alert: ${expired.length} Expired Document${expired.length > 1 ? "s" : ""}${soonExpiring.length > 0 ? ` & ${soonExpiring.length} Expiring Soon` : ""}`
                : `PPM Alert: ${soonExpiring.length} Document${soonExpiring.length > 1 ? "s" : ""} Expiring Soon`;

              const sent = await emailSvc.sendEmail({
                to: adminEmail,
                subject,
                companyName,
                html: `
                  <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto">
                    <div style="background:${hasExpired ? "#dc2626" : "#d97706"};color:#fff;padding:20px;border-radius:8px 8px 0 0">
                      <h2 style="margin:0">PPM Document Expiry Alert — ${companyName}</h2>
                    </div>
                    <div style="background:#fff;padding:20px;border:1px solid #e5e7eb">
                      <p style="margin-top:0">${subjectCount} PPM work order document${subjectCount > 1 ? "s require" : " requires"} attention:</p>
                      <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:14px">
                        <thead>
                          <tr style="background:#f9fafb">
                            <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Document</th>
                            <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Work Order</th>
                            <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Expiry Date</th>
                            <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Status</th>
                          </tr>
                        </thead>
                        <tbody>${tableRows}</tbody>
                      </table>
                      <p style="color:#6b7280;font-size:13px">Please log in to TPR-Max to review and replace these documents as required.</p>
                    </div>
                    <div style="background:#f9fafb;padding:12px 20px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;font-size:12px;color:#9ca3af">
                      This alert was sent by ${companyName} via TPR-Max PPM system.
                    </div>
                  </div>
                `,
                text: `PPM Document Expiry Alert\n\n${expired.length > 0 ? `Expired (${expired.length}):\n${expired.map(d => `- ${d.fileName} (WO: ${woMap[d.workOrderId] ?? d.workOrderId}, expired: ${d.expiryDate})`).join("\n")}\n\n` : ""}${soonExpiring.length > 0 ? `Expiring Soon (${soonExpiring.length}):\n${soonExpiring.map(d => `- ${d.fileName} (WO: ${woMap[d.workOrderId] ?? d.workOrderId}, expires: ${d.expiryDate})`).join("\n")}\n\n` : ""}Please log in to TPR-Max to review.`,
              });
              if (sent) {
                // Stamp each alerted document so it is not re-sent on future cron runs
                const alertedIds = expiringDocs.map(d => d.id);
                await custDb.update(isolatedSchema.ppmWorkOrderDocuments)
                  .set({ expiryAlertedAt: new Date() })
                  .where(inArray(isolatedSchema.ppmWorkOrderDocuments.id, alertedIds));
                console.log(`📧 [PPM Cron] Document expiry alert sent for ${subjectCount} document(s) (customer ${customer.id})`);
              }
            }
          }

        // ── Auto-generate work orders from due schedules ─────────────────────
        // Idempotent: keyed by scheduleId + nextDueDate to avoid duplicates
        const schedules = await custDb.select().from(isolatedSchema.ppmSchedules)
          .where(eq(isolatedSchema.ppmSchedules.status, "scheduled"));
        const todayStr = today.toISOString().split("T")[0];
        let generatedCount = 0;

        function advanceDueDate(currentDue: string, frequency: string, customDays: number | null): string {
          const d = new Date(currentDue);
          switch (frequency) {
            case "weekly":    d.setDate(d.getDate() + 7); break;
            case "monthly":   d.setMonth(d.getMonth() + 1); break;
            case "quarterly": d.setMonth(d.getMonth() + 3); break;
            case "biannual":
            case "semi-annual":
            case "biannually": d.setMonth(d.getMonth() + 6); break;
            case "annual":
            case "annually":
            case "yearly":    d.setFullYear(d.getFullYear() + 1); break;
            case "custom":    d.setDate(d.getDate() + (customDays ?? 30)); break;
            default:          d.setMonth(d.getMonth() + 1); break;
          }
          return d.toISOString().split("T")[0];
        }

        for (const schedule of schedules) {
          if (!schedule.nextDueDate || schedule.nextDueDate > todayStr) continue;
          // Check by (scheduleId, dueDate) so recurring schedules generate a new WO each cycle.
          // Exclude completed/cancelled WOs so a newly-due cycle always gets its own work order.
          const [existing] = await custDb.select({ id: isolatedSchema.ppmWorkOrders.id })
            .from(isolatedSchema.ppmWorkOrders)
            .where(and(
              eq(isolatedSchema.ppmWorkOrders.scheduleId, schedule.id),
              eq(isolatedSchema.ppmWorkOrders.dueDate, schedule.nextDueDate),
              ne(isolatedSchema.ppmWorkOrders.status, "completed"),
              ne(isolatedSchema.ppmWorkOrders.status, "cancelled")
            ));
          if (existing) continue;
          const woToken = randomBytes(24).toString("hex");
          const woTokenExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days
          await custDb.insert(isolatedSchema.ppmWorkOrders).values({
            scheduleId: schedule.id,
            assetId: schedule.assetId,
            title: schedule.title,
            description: schedule.notes ?? undefined,
            status: "scheduled",
            dueDate: schedule.nextDueDate,
            accessToken: woToken,
            accessTokenExpiresAt: woTokenExpiry,
          });
          // Advance the schedule's nextDueDate
          const nextDue = advanceDueDate(schedule.nextDueDate, schedule.frequency, schedule.customDays ?? null);
          await custDb.update(isolatedSchema.ppmSchedules)
            .set({ nextDueDate: nextDue })
            .where(eq(isolatedSchema.ppmSchedules.id, schedule.id));
          generatedCount++;
        }

        if (generatedCount > 0) {
          console.log(`✅ [PPM Cron] Generated ${generatedCount} work orders from schedules for customer ${customer.id}`);
        }
      } catch (custErr) {
        console.error(`[PPM Cron] Error processing customer ${customer.id}:`, custErr);
      }
    }
    console.log("✅ [PPM Cron] Daily check complete");
  } catch (error: unknown) {
    console.error("❌ [PPM Cron] Fatal error:", error);
  }
}, { timezone: "Europe/London" });
}
