import type { Express } from 'express';
import { randomUUID, randomBytes } from 'crypto';
import path from 'path';
import cron from 'node-cron';
import { requireAuth } from '../auth';
import { getScopedDb, scopedWhere, withSiteId, SiteContextError } from '../siteScope';
import type { SiteContext } from '../siteScope';
import { customerDbService } from '../customerDatabase';
import { simpleDatabaseService } from '../simpleDatabaseService';
import { EmailService } from '../emailService';
import { ObjectStorageService, objectStorageClient } from '../objectStorage';
import { logger } from '../utils/logger';
import * as isolatedSchema from '../isolatedSchema';
import { eq, and, sql, desc, or, not, ne, isNotNull, isNull, gt, gte, lt, lte, inArray, count, like } from 'drizzle-orm';
import { ppmTokenCacheGet, ppmTokenCacheSet, ppmTokenCacheEvict, ppmPublicRateLimit } from '../routeState';
import { getCompanyComplianceStatus, getWorkerClearanceStatus } from '../utils/contractorCompliance';
import { evaluateSiteBackground } from '../complianceEngine';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Renders a template checklist as an inline HTML block for email bodies. */
function buildEmailChecklistHtml(checklist: string | null | undefined): string {
  if (!checklist) return "";
  try {
    const raw = JSON.parse(checklist);
    if (!Array.isArray(raw) || raw.length === 0) return "";
    const items: string[] = raw.map((item: unknown) =>
      typeof item === "string" ? item : (item as { text?: string }).text ?? String(item)
    );
    return `
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:12px 16px;margin:12px 0">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151">Maintenance Checklist</p>
        <ul style="margin:0;padding-left:18px">
          ${items.map(t => `<li style="font-size:13px;color:#374151;margin-bottom:5px">${escapeHtml(t)}</li>`).join("")}
        </ul>
      </div>`;
  } catch { return ""; }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function logPpmAudit(
  custDb: Awaited<ReturnType<typeof customerDbService.getCustomerDatabase>>,
  event: string,
  performedBy: string,
  details?: Record<string, unknown> & { workOrderId?: string; assetId?: string; scheduleId?: string },
): Promise<void> {
  try {
    await custDb.insert(isolatedSchema.ppmAudit).values({
      event,
      performedBy,
      workOrderId: details?.workOrderId ?? null,
      assetId: details?.assetId ?? null,
      scheduleId: details?.scheduleId ?? null,
      details: details ? { ...details } : null,
    });
  } catch (auditErr) {
    logger.error("[PPM Audit] Failed to write audit row:", auditErr);
  }
}

// ── Runtime column migration (idempotent, per-customer DB) ───────────────────
// Adds columns to PPM tables that were introduced after initial schema creation.
// Safe to re-run on any DB — uses ADD COLUMN IF NOT EXISTS throughout.
const _ppmColumnsMigrated = new Set<string>();

// Per-customer PPM feature-flag cache — 60-second TTL avoids a DB round-trip on every request
const _ppmFeatureCache = new Map<string, { enabled: boolean; ts: number }>();
const PPM_FEATURE_CACHE_TTL_MS = 60_000;

async function ensurePpmColumns(custDb: any, customerId: string): Promise<void> {
  if (_ppmColumnsMigrated.has(customerId)) return;
  try {
    // ppm_asset_groups
    await custDb.execute(sql`ALTER TABLE ppm_asset_groups ADD COLUMN IF NOT EXISTS site_id TEXT`);
    await custDb.execute(sql`ALTER TABLE ppm_asset_groups ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE`);

    // ppm_assets — site_id was originally missing from this table's migration
    await custDb.execute(sql`ALTER TABLE ppm_assets ADD COLUMN IF NOT EXISTS site_id TEXT`);
    await custDb.execute(sql`ALTER TABLE ppm_assets ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE`);

    // ppm_schedules
    await custDb.execute(sql`ALTER TABLE ppm_schedules ADD COLUMN IF NOT EXISTS site_id TEXT`);
    await custDb.execute(sql`ALTER TABLE ppm_schedules ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE`);

    // ppm_work_orders — many columns were added after initial table creation
    await custDb.execute(sql`ALTER TABLE ppm_work_orders ADD COLUMN IF NOT EXISTS site_id TEXT`);
    await custDb.execute(sql`ALTER TABLE ppm_work_orders ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE`);
    await custDb.execute(sql`ALTER TABLE ppm_work_orders ADD COLUMN IF NOT EXISTS group_id TEXT`);
    await custDb.execute(sql`ALTER TABLE ppm_work_orders ADD COLUMN IF NOT EXISTS description TEXT`);
    await custDb.execute(sql`ALTER TABLE ppm_work_orders ADD COLUMN IF NOT EXISTS completion_notes TEXT`);
    await custDb.execute(sql`ALTER TABLE ppm_work_orders ADD COLUMN IF NOT EXISTS assigned_email TEXT`);
    await custDb.execute(sql`ALTER TABLE ppm_work_orders ADD COLUMN IF NOT EXISTS contractor_company_id TEXT`);
    await custDb.execute(sql`ALTER TABLE ppm_work_orders ADD COLUMN IF NOT EXISTS contractor_company_name TEXT`);
    await custDb.execute(sql`ALTER TABLE ppm_work_orders ADD COLUMN IF NOT EXISTS contractor_worker_id TEXT`);
    await custDb.execute(sql`ALTER TABLE ppm_work_orders ADD COLUMN IF NOT EXISTS contractor_worker_name TEXT`);
    await custDb.execute(sql`ALTER TABLE ppm_work_orders ADD COLUMN IF NOT EXISTS access_token TEXT`);
    await custDb.execute(sql`ALTER TABLE ppm_work_orders ADD COLUMN IF NOT EXISTS access_token_expires_at TIMESTAMP`);
    await custDb.execute(sql`ALTER TABLE ppm_work_orders ADD COLUMN IF NOT EXISTS requires_certificate BOOLEAN NOT NULL DEFAULT FALSE`);
    await custDb.execute(sql`ALTER TABLE ppm_work_orders ADD COLUMN IF NOT EXISTS certificate_uploaded_at TIMESTAMP`);
    await custDb.execute(sql`ALTER TABLE ppm_work_orders ADD COLUMN IF NOT EXISTS overdue_alerted_at TIMESTAMP`);
    await custDb.execute(sql`ALTER TABLE ppm_work_orders ADD COLUMN IF NOT EXISTS missing_cert_alerted_at TIMESTAMP`);
    await custDb.execute(sql`ALTER TABLE ppm_work_orders ADD COLUMN IF NOT EXISTS missing_docs_alerted_at TIMESTAMP`);
    await custDb.execute(sql`ALTER TABLE ppm_work_orders ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMP`);

    // ppm_work_order_documents — expiry_alerted_at and scanned_at added after initial migration
    await custDb.execute(sql`ALTER TABLE ppm_work_order_documents ADD COLUMN IF NOT EXISTS expiry_alerted_at TIMESTAMP`);
    await custDb.execute(sql`ALTER TABLE ppm_work_order_documents ADD COLUMN IF NOT EXISTS scanned_at TIMESTAMP`);

    // Contractor tables — is_demo flag added for safe demo-data scoping (Fix 3)
    await custDb.execute(sql`ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE`);
    await custDb.execute(sql`ALTER TABLE contractor_workers   ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE`);

    _ppmColumnsMigrated.add(customerId);
  } catch (err) {
    logger.warn('[PPM] Column migration warning (non-fatal):', err);
  }
}

/**
 * Verify that a work order exists and belongs to the caller's allowed site(s).
 * Returns the row's id+siteId on success, null when not found or out of scope.
 * Documents have no siteId — always gate through this helper before touching them.
 */
async function fetchWoInScope(
  custDb: any,
  woId: string,
  siteContext: SiteContext,
): Promise<{ id: string; siteId: string | null } | null> {
  const siteFilter = scopedWhere(siteContext, isolatedSchema.ppmWorkOrders);
  const [wo] = await custDb
    .select({ id: isolatedSchema.ppmWorkOrders.id, siteId: isolatedSchema.ppmWorkOrders.siteId })
    .from(isolatedSchema.ppmWorkOrders)
    .where(and(eq(isolatedSchema.ppmWorkOrders.id, woId), siteFilter));
  return wo ?? null;
}

// ── Known demo identifiers (used to catch pre-is_demo legacy rows) ───────────
// These refs/names are ONLY used by the seeder — real customer data won't collide.
const DEMO_ASSET_REFS = [
  "AHU-001","FAP-001","EL-001","BLR-001","ACS-001","LFT-001","SPR-001","EDB-001",
  "BLR-002","CWT-001","HWC-001","GEN-001","CCTV-001","LFT-002","EL-GF","AHU-GF",
  "AHU-01","AHU-02","AHU-03","AHU-04","EL-01","EL-02","EL-03","EL-04",
  "FCU-01","FCU-02","FCU-03","FCU-04","CT-001","WT-001","LPS-001",
];
const DEMO_GROUP_NAMES = [
  "HVAC Systems","Fire Safety Systems","Mechanical Services",
  "Electrical Systems","Water Hygiene","Security Systems","Lifts & Hoists",
];
const DEMO_COMPANY_NAMES_LIST = [
  "CoolAir Services Ltd","FireGuard UK Ltd","BuildRight Co",
  "Volt-Safe Electrical Ltd","AquaSafe Hygiene Ltd","SecureAccess Systems","Schindler UK",
];

// All template names created by the demo seeder (DEMO_TEMPLATES array + templateName refs in DEMO_SCHEDULES).
// Used by the delete route to remove demo templates without touching real customer templates.
const DEMO_TEMPLATE_NAMES = [
  // From DEMO_TEMPLATES array
  "Monthly HVAC Filter Check",
  "Annual Fire Alarm Full Test",
  "Monthly Emergency Lighting Functional Test",
  "Annual Boiler Service & Gas Safety Check",
  "6-Monthly Lift Thorough Examination",
  "Quarterly Sprinkler System Inspection",
  "Fixed Wiring Inspection & Testing (EICR)",
  "Monthly Access Control System Check",
  "Monthly Water Hygiene Inspection",
  // Additional names referenced as templateName in DEMO_SCHEDULES
  "Quarterly HVAC Filter & Coil Service",
  "Annual HVAC Full Plant Service",
  "Quarterly Emergency Lighting Functional Test",
  "Annual Emergency Lighting Duration Test",
  "Annual Sprinkler Full Flow Test",
  "6-Monthly Access Control System Health Check",
  "6-Monthly CCTV System Health Check",
];

/**
 * Hard-gate helper: validates that a (company, worker) pair is cleared to be assigned
 * to a PPM work order. Returns null if cleared, or a JSON-ready error payload if blocked.
 * Centralised here so create/update/duplicate/assign all enforce the same rules.
 */
async function assertContractorClearance(
  custDb: any,
  companyId: string | null | undefined,
  workerId: string | null | undefined,
  customerId?: string,
): Promise<{ error: string; code: string; reasons: string[] } | null> {
  if (!companyId && workerId) {
    return { error: "Select a contractor company before assigning a worker", code: "WORKER_WITHOUT_COMPANY", reasons: ["No company selected"] };
  }
  if (!companyId) return null;
  const company = await getCompanyComplianceStatus(custDb, companyId);
  if (!company.compliant) {
    return { error: "Contractor is not cleared to work", code: "CONTRACTOR_NOT_COMPLIANT", reasons: company.reasons };
  }
  if (workerId) {
    const worker = await getWorkerClearanceStatus(custDb, workerId, customerId);
    if (!worker.compliant) {
      return { error: "Worker is not cleared to work", code: "WORKER_NOT_CLEARED", reasons: worker.reasons };
    }
  }
  return null;
}

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
    const customerId = req.customerId as string;
    const now = Date.now();
    const cached = customerId ? _ppmFeatureCache.get(customerId) : undefined;

    let featureEnabled: boolean;
    if (cached && now - cached.ts < PPM_FEATURE_CACHE_TTL_MS) {
      featureEnabled = cached.enabled;
    } else {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, customerId);
      const settings = await simpleDatabaseService.getCompanySettings(context);
      featureEnabled = !!settings?.featurePPM;
      if (customerId) _ppmFeatureCache.set(customerId, { enabled: featureEnabled, ts: now });
    }

    if (!featureEnabled) {
      return res.status(403).json({
        error: 'PPM module is not enabled for your account. Please contact support.'
      });
    }

    // Ensure PPM-specific DB columns exist for this customer (idempotent, memoised per-process).
    // Doing this here covers ALL authenticated PPM routes — including work-order routes that
    // previously didn't call ensurePpmColumns, which would crash on scopedWhere if site_id
    // hadn't been added yet (e.g. server restart followed by a deep-link to /ppm/work-orders).
    if (customerId) {
      const custDb = await customerDbService.getCustomerDatabase(customerId);
      await ensurePpmColumns(custDb, customerId);
    }
    next();
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────

export function registerPPMRoutes(app: Express): void {
// Gate all authenticated PPM routes — but let the public contractor work-order endpoints
// through (they authenticate via rolling token, not session, so no requireAuth here).
app.use('/api/ppm', (req, res, next) => {
  if (req.path.startsWith('/work-order/public')) return next();
  return requireAuth(req, res, () => requirePPMFeature(req, res, next));
});

// PPM Assets
app.get("/api/ppm/assets", requireAuth, async (req, res) => {
  try {
    const { db: custDb, siteContext } = await getScopedDb(req);
    const rows = await custDb.select().from(isolatedSchema.ppmAssets)
      .where(scopedWhere(siteContext, isolatedSchema.ppmAssets))
      .orderBy(isolatedSchema.ppmAssets.name);
    res.json(rows);
  } catch (err: unknown) {
    if (err instanceof SiteContextError) return res.status(err.statusCode).json({ error: err.message });
    logger.error("GET /api/ppm/assets", err);
    res.status(500).json({ error: "Failed to fetch PPM assets" });
  }
});

app.post("/api/ppm/assets", requireAuth, async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  try {
    const parsed = isolatedSchema.insertPpmAssetSchema.parse(req.body);
    const { db: custDb, siteId } = await getScopedDb(req);
    const [row] = await custDb.insert(isolatedSchema.ppmAssets).values(withSiteId(siteId, parsed)).returning();
    await logPpmAudit(custDb, "asset_created", req.user!.username, { assetId: row.id, name: (parsed as any).name });
    res.status(201).json(row);
  } catch (err: unknown) {
    if (err instanceof SiteContextError) return res.status(err.statusCode).json({ error: err.message });
    logger.error("POST /api/ppm/assets", err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to create PPM asset" });
  }
});

app.put("/api/ppm/assets/:id", requireAuth, async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  try {
    const { id } = req.params;
    const parsed = isolatedSchema.insertPpmAssetSchema.partial().parse(req.body);
    const { db: custDb, siteContext } = await getScopedDb(req);
    await ensurePpmColumns(custDb, req.customerId!);
    const [row] = await custDb.update(isolatedSchema.ppmAssets).set(parsed)
      .where(and(eq(isolatedSchema.ppmAssets.id, id), scopedWhere(siteContext, isolatedSchema.ppmAssets)))
      .returning();
    if (!row) return res.status(404).json({ error: "Asset not found" });
    await logPpmAudit(custDb, "asset_updated", req.user!.username, { assetId: id });
    res.json(row);
  } catch (error: unknown) {
    if (error instanceof SiteContextError) return res.status(error.statusCode).json({ error: error.message });
    logger.error("PUT /api/ppm/assets/:id", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to update PPM asset" });
  }
});

app.delete("/api/ppm/assets/:id", requireAuth, async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  try {
    const { id } = req.params;
    const { db: custDb, siteContext } = await getScopedDb(req);
    await ensurePpmColumns(custDb, req.customerId!);
    const [deleted] = await custDb.delete(isolatedSchema.ppmAssets)
      .where(and(eq(isolatedSchema.ppmAssets.id, id), scopedWhere(siteContext, isolatedSchema.ppmAssets)))
      .returning({ id: isolatedSchema.ppmAssets.id });
    if (!deleted) return res.status(404).json({ error: "Asset not found" });
    await logPpmAudit(custDb, "asset_deleted", req.user!.username, { assetId: id });
    res.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof SiteContextError) return res.status(error.statusCode).json({ error: error.message });
    logger.error("DELETE /api/ppm/assets/:id", error);
    res.status(500).json({ error: "Failed to delete PPM asset" });
  }
});

// POST /api/ppm/assets/:id/duplicate — clone an asset with a new name, clearing unique fields
app.post("/api/ppm/assets/:id/duplicate", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { db: custDb, siteId, siteContext } = await getScopedDb(req);
    await ensurePpmColumns(custDb, req.customerId!);
    const [original] = await custDb.select().from(isolatedSchema.ppmAssets)
      .where(and(eq(isolatedSchema.ppmAssets.id, id), scopedWhere(siteContext, isolatedSchema.ppmAssets)));
    if (!original) return res.status(404).json({ error: "Asset not found" });
    const { id: _id, createdAt: _createdAt, assetRef: _assetRef, serialNumber: _serialNumber, ...rest } = original;
    const [copy] = await custDb.insert(isolatedSchema.ppmAssets).values(withSiteId(siteId, {
      ...rest,
      name: `Copy of ${original.name}`,
      assetRef: null,
      serialNumber: null,
      status: "active",
    })).returning();
    res.status(201).json(copy);
  } catch (error: unknown) {
    if (error instanceof SiteContextError) return res.status(error.statusCode).json({ error: error.message });
    logger.error("POST /api/ppm/assets/:id/duplicate", error);
    res.status(500).json({ error: "Failed to duplicate asset" });
  }
});

// ── PPM Asset Groups CRUD ────────────────────────────────────────────────────
app.get("/api/ppm/asset-groups", requireAuth, async (req, res) => {
  try {
    const { db: custDb, siteContext } = await getScopedDb(req);
    await ensurePpmColumns(custDb, req.customerId!);
    const rows = await custDb.select().from(isolatedSchema.ppmAssetGroups)
      .where(scopedWhere(siteContext, isolatedSchema.ppmAssetGroups))
      .orderBy(isolatedSchema.ppmAssetGroups.name);
    res.json(rows);
  } catch (error: unknown) {
    if (error instanceof SiteContextError) return res.status(error.statusCode).json({ error: error.message });
    logger.error("GET /api/ppm/asset-groups", error);
    res.status(500).json({ error: "Failed to fetch asset groups" });
  }
});

app.post("/api/ppm/asset-groups", requireAuth, async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  try {
    const parsed = isolatedSchema.insertPpmAssetGroupSchema.parse(req.body);
    const { db: custDb, siteId } = await getScopedDb(req);
    await ensurePpmColumns(custDb, req.customerId!);
    const [row] = await custDb.insert(isolatedSchema.ppmAssetGroups).values(withSiteId(siteId, parsed)).returning();
    res.status(201).json(row);
  } catch (error: unknown) {
    if (error instanceof SiteContextError) return res.status(error.statusCode).json({ error: error.message });
    logger.error("POST /api/ppm/asset-groups", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create asset group" });
  }
});

app.put("/api/ppm/asset-groups/:id", requireAuth, async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  try {
    const { id } = req.params;
    const parsed = isolatedSchema.insertPpmAssetGroupSchema.partial().parse(req.body);
    const { db: custDb, siteContext } = await getScopedDb(req);
    await ensurePpmColumns(custDb, req.customerId!);
    const [row] = await custDb.update(isolatedSchema.ppmAssetGroups).set(parsed)
      .where(and(eq(isolatedSchema.ppmAssetGroups.id, id), scopedWhere(siteContext, isolatedSchema.ppmAssetGroups)))
      .returning();
    if (!row) return res.status(404).json({ error: "Asset group not found" });
    res.json(row);
  } catch (error: unknown) {
    if (error instanceof SiteContextError) return res.status(error.statusCode).json({ error: error.message });
    logger.error("PUT /api/ppm/asset-groups/:id", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to update asset group" });
  }
});

app.delete("/api/ppm/asset-groups/:id", requireAuth, async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  try {
    const { id } = req.params;
    const { db: custDb, siteContext } = await getScopedDb(req);
    await ensurePpmColumns(custDb, req.customerId!);
    // Detach all assets from the group before deleting (FK is set null on delete, but do it explicitly)
    await custDb.update(isolatedSchema.ppmAssets).set({ groupId: null }).where(eq(isolatedSchema.ppmAssets.groupId, id));
    const [deleted] = await custDb.delete(isolatedSchema.ppmAssetGroups)
      .where(and(eq(isolatedSchema.ppmAssetGroups.id, id), scopedWhere(siteContext, isolatedSchema.ppmAssetGroups)))
      .returning({ id: isolatedSchema.ppmAssetGroups.id });
    if (!deleted) return res.status(404).json({ error: "Asset group not found" });
    res.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof SiteContextError) return res.status(error.statusCode).json({ error: error.message });
    logger.error("DELETE /api/ppm/asset-groups/:id", error);
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
    logger.error("GET /api/ppm/templates", error);
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
    logger.error("POST /api/ppm/templates", error);
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
    logger.error("PUT /api/ppm/templates/:id", error);
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
    logger.error("DELETE /api/ppm/templates/:id", error);
    res.status(500).json({ error: "Failed to delete PPM template" });
  }
});

// PPM Schedules
app.get("/api/ppm/schedules", requireAuth, async (req, res) => {
  try {
    const { db: custDb, siteContext } = await getScopedDb(req);
    await ensurePpmColumns(custDb, req.customerId!);
    const rows = await custDb.select().from(isolatedSchema.ppmSchedules)
      .where(scopedWhere(siteContext, isolatedSchema.ppmSchedules))
      .orderBy(isolatedSchema.ppmSchedules.nextDueDate);
    // Compute overdue status at query time
    const today = new Date().toISOString().split('T')[0];
    const enriched = rows.map(r => ({
      ...r,
      status: r.status !== "completed" && r.status !== "cancelled" && r.nextDueDate < today ? "overdue" : r.status,
    }));
    res.json(enriched);
  } catch (error: unknown) {
    if (error instanceof SiteContextError) return res.status(error.statusCode).json({ error: error.message });
    logger.error("GET /api/ppm/schedules", error);
    res.status(500).json({ error: "Failed to fetch PPM schedules" });
  }
});

app.post("/api/ppm/schedules", requireAuth, async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  try {
    const body = req.body;
    const nextDueDate = calcNextDueDate(body.startDate, body.frequency, body.customDays);
    const parsed = isolatedSchema.insertPpmScheduleSchema.parse({ ...body, nextDueDate });
    const { db: custDb, siteId } = await getScopedDb(req);
    await ensurePpmColumns(custDb, req.customerId!);
    const [row] = await custDb.insert(isolatedSchema.ppmSchedules).values(withSiteId(siteId, parsed)).returning();
    await logPpmAudit(custDb, "schedule_created", req.user!.username, { scheduleId: row.id });
    res.status(201).json(row);
  } catch (error: unknown) {
    if (error instanceof SiteContextError) return res.status(error.statusCode).json({ error: error.message });
    logger.error("POST /api/ppm/schedules", error);
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
    const { db: custDb, siteContext } = await getScopedDb(req);
    await ensurePpmColumns(custDb, req.customerId!);
    const [row] = await custDb.update(isolatedSchema.ppmSchedules).set(parsed)
      .where(and(eq(isolatedSchema.ppmSchedules.id, id), scopedWhere(siteContext, isolatedSchema.ppmSchedules)))
      .returning();
    if (!row) return res.status(404).json({ error: "Schedule not found" });
    await logPpmAudit(custDb, "schedule_updated", req.user!.username, { scheduleId: id });
    res.json(row);
  } catch (error: unknown) {
    if (error instanceof SiteContextError) return res.status(error.statusCode).json({ error: error.message });
    logger.error("PUT /api/ppm/schedules/:id", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to update PPM schedule" });
  }
});

app.delete("/api/ppm/schedules/:id", requireAuth, async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  try {
    const { id } = req.params;
    const { db: custDb, siteContext } = await getScopedDb(req);
    await ensurePpmColumns(custDb, req.customerId!);
    const [deleted] = await custDb.delete(isolatedSchema.ppmSchedules)
      .where(and(eq(isolatedSchema.ppmSchedules.id, id), scopedWhere(siteContext, isolatedSchema.ppmSchedules)))
      .returning({ id: isolatedSchema.ppmSchedules.id });
    if (!deleted) return res.status(404).json({ error: "Schedule not found" });
    await logPpmAudit(custDb, "schedule_deleted", req.user!.username, { scheduleId: id });
    res.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof SiteContextError) return res.status(error.statusCode).json({ error: error.message });
    logger.error("DELETE /api/ppm/schedules/:id", error);
    res.status(500).json({ error: "Failed to delete PPM schedule" });
  }
});

// ── PPM Work Orders ──────────────────────────────────────────────────────────

// GET /api/ppm/expiry-count — lightweight summary of expired/expiring-soon document counts (for nav badge)
app.get('/api/ppm/expiry-count', requireAuth, async (req, res) => {
  try {
    if (!req.customerId) return res.status(401).json({ error: 'Not authenticated' });
    if (req.user!.role !== 'admin') return res.status(403).json({ error: 'Administrator access required' });
    const { db: custDb, siteContext } = await getScopedDb(req);
    await ensurePpmColumns(custDb, req.customerId!);
    let expiredCount = 0;
    let expiringSoonCount = 0;
    try {
      // Documents have no siteId — scope via parent work orders
      const scopedWoRows = await custDb.select({ id: isolatedSchema.ppmWorkOrders.id })
        .from(isolatedSchema.ppmWorkOrders)
        .where(scopedWhere(siteContext, isolatedSchema.ppmWorkOrders));
      const scopedWoIds = scopedWoRows.map((w: { id: string }) => w.id);
      const docs = scopedWoIds.length > 0
        ? await custDb.select({ expiryDate: isolatedSchema.ppmWorkOrderDocuments.expiryDate })
            .from(isolatedSchema.ppmWorkOrderDocuments)
            .where(inArray(isolatedSchema.ppmWorkOrderDocuments.workOrderId, scopedWoIds))
        : [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const in30Days = new Date(today);
      in30Days.setDate(in30Days.getDate() + 30);
      for (const doc of docs) {
        if (!doc.expiryDate) continue;
        const exp = new Date(doc.expiryDate);
        if (exp <= today) {
          expiredCount++;
        } else if (exp <= in30Days) {
          expiringSoonCount++;
        }
      }
    } catch (tableErr: any) {
      // PPM tables don't exist yet for this customer (older schema) — return zero counts
      if (tableErr?.code === '42P01' || tableErr?.code === '42703') {
        logger.warn(`[PPM] expiry-count: table/column missing for ${req.customerId} — returning zeros (${tableErr.code})`);
      } else {
        throw tableErr;
      }
    }
    res.json({ expiredCount, expiringSoonCount, total: expiredCount + expiringSoonCount });
  } catch (error) {
    if (error instanceof SiteContextError) return res.status(error.statusCode).json({ error: error.message });
    logger.error('GET /api/ppm/expiry-count', error);
    res.status(500).json({ error: 'Failed to fetch PPM expiry count' });
  }
});

// GET /api/ppm/work-orders — list work orders for customer (admin or manager; tokens omitted from list)
app.get("/api/ppm/work-orders", requireAuth, async (req, res) => {
  try {
    if (!["admin", "manager"].includes(req.user!.role)) return res.status(403).json({ error: "Administrator access required" });
    const { db: custDb, siteContext } = await getScopedDb(req);

    // Optional year filter — use EXTRACT(YEAR FROM due_date) for robustness.
    // Avoids timezone-conversion edge cases that gte/lt with JS Date objects can hit
    // on timestamp-without-timezone columns, and is immune to the LIKE type error.
    const yearParam = req.query.year ? parseInt(req.query.year as string, 10) : null;
    const yearCondition = yearParam
      ? sql`EXTRACT(YEAR FROM ${isolatedSchema.ppmWorkOrders.dueDate}::date) = ${yearParam}`
      : undefined;
    const siteFilter = scopedWhere(siteContext, isolatedSchema.ppmWorkOrders);

    // Pagination — only applied when caller explicitly passes ?limit=N (e.g. Work Orders tab).
    // Annual Planner omits limit so it gets all records for the selected year.
    const hasExplicitLimit = req.query.limit !== undefined;
    const limitParam  = hasExplicitLimit ? Math.min(parseInt(req.query.limit as string, 10), 500) : null;
    const offsetParam = hasExplicitLimit ? Math.max(parseInt((req.query.offset as string) || "0", 10), 0) : 0;

    const baseQuery = custDb.select().from(isolatedSchema.ppmWorkOrders)
      .where(and(yearCondition, siteFilter))
      .orderBy(isolatedSchema.ppmWorkOrders.createdAt);

    const rows = await (limitParam !== null
      ? baseQuery.limit(limitParam).offset(offsetParam)
      : baseQuery);

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
    if (error instanceof SiteContextError) return res.status(error.statusCode).json({ error: (error as any).message });
    logger.error("GET /api/ppm/work-orders", error);
    res.status(500).json({ error: "Failed to fetch PPM work orders" });
  }
});

// GET /api/ppm/work-orders/:id/token — return the contractor link for a specific work order (admin only)
app.get("/api/ppm/work-orders/:id/token", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    const { id } = req.params;
    const { db: custDb, siteContext } = await getScopedDb(req);
    const [wo] = await custDb.select({
      accessToken: isolatedSchema.ppmWorkOrders.accessToken,
      accessTokenExpiresAt: isolatedSchema.ppmWorkOrders.accessTokenExpiresAt,
    }).from(isolatedSchema.ppmWorkOrders)
      .where(and(eq(isolatedSchema.ppmWorkOrders.id, id), scopedWhere(siteContext, isolatedSchema.ppmWorkOrders)));
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
    logger.error("GET /api/ppm/work-orders/:id/token", error);
    res.status(500).json({ error: "Failed to fetch work order token" });
  }
});

// POST /api/ppm/work-orders — create a new work order
app.post("/api/ppm/work-orders", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    const { db: custDb, siteId } = await getScopedDb(req);
    const accessToken = randomBytes(24).toString("hex");
    const accessTokenExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const parsed = isolatedSchema.insertPpmWorkOrderSchema.parse({ ...req.body, accessToken, accessTokenExpiresAt });
    const gate = await assertContractorClearance(custDb, parsed.contractorCompanyId, parsed.contractorWorkerId, req.customerId);
    if (gate) return res.status(400).json(gate);
    const [row] = await custDb.insert(isolatedSchema.ppmWorkOrders).values(withSiteId(siteId, parsed)).returning();
    await logPpmAudit(custDb, "work_order_created", req.user!.username, { workOrderId: row.id, title: row.title });
    evaluateSiteBackground(req.customerId!, row.siteId);
    res.json(row);
  } catch (err: unknown) {
    if (err instanceof SiteContextError) return res.status(err.statusCode).json({ error: err.message });
    logger.error("POST /api/ppm/work-orders", err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to create PPM work order" });
  }
});

// PUT /api/ppm/work-orders/:id — update a work order
app.put("/api/ppm/work-orders/:id", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    const { id } = req.params;
    const { db: custDb, siteContext } = await getScopedDb(req);
    const updates: Record<string, unknown> = { ...req.body };
    delete updates.id;
    delete updates.createdAt;
    delete updates.accessToken;
    const siteFilter = scopedWhere(siteContext, isolatedSchema.ppmWorkOrders);
    // Load existing row when contractor fields change OR when completing, so we can run both gates.
    let existing: typeof isolatedSchema.ppmWorkOrders.$inferSelect | undefined;
    if ("contractorCompanyId" in updates || "contractorWorkerId" in updates || updates.status === "completed") {
      const [found] = await custDb.select().from(isolatedSchema.ppmWorkOrders)
        .where(and(eq(isolatedSchema.ppmWorkOrders.id, id), siteFilter));
      if (!found) return res.status(404).json({ error: "Work order not found" });
      existing = found;
      if ("contractorCompanyId" in updates || "contractorWorkerId" in updates) {
        // Merge so partial updates can't bypass the clearance gate.
        const effectiveCompanyId = "contractorCompanyId" in updates
          ? (updates.contractorCompanyId as string | null | undefined)
          : existing.contractorCompanyId;
        const effectiveWorkerId = "contractorWorkerId" in updates
          ? (updates.contractorWorkerId as string | null | undefined)
          : existing.contractorWorkerId;
        const gate = await assertContractorClearance(custDb, effectiveCompanyId, effectiveWorkerId, req.customerId);
        if (gate) return res.status(400).json(gate);
      }
    }
    // Certificate hard gate: block completion if a certificate is required but not yet uploaded.
    if (updates.status === "completed" && existing?.requiresCertificate && !existing?.certificateUploadedAt) {
      return res.status(400).json({
        error: "This work order requires a service certificate. Please upload the certificate before marking it complete.",
        code: "CERTIFICATE_REQUIRED",
      });
    }
    if (updates.status === "completed" && !updates.completedDate) {
      updates.completedDate = new Date().toISOString().split("T")[0];
    }
    // If status is being reset away from overdue, clear the alert flag so a future overdue triggers a new alert
    if (updates.status && updates.status !== "overdue") {
      updates.overdueAlertedAt = null;
    }
    // Reverting to "scheduled" means the contractor hasn't arrived yet — clear the arrival timestamp
    // so effectiveWOStatus doesn't force the display back to "on_site".
    if (updates.status === "scheduled") {
      updates.arrivedAt = null;
    }
    const [row] = await custDb.update(isolatedSchema.ppmWorkOrders).set(updates)
      .where(and(eq(isolatedSchema.ppmWorkOrders.id, id), siteFilter))
      .returning();

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
              // Don't resurrect a cancelled schedule — only reset status if it was active
              ...(schedule.status !== "cancelled" ? { status: "scheduled" } : {}),
              lastCompletedDate: new Date().toISOString().split("T")[0],
            })
            .where(eq(isolatedSchema.ppmSchedules.id, schedule.id));
          logger.info(`✅ [PPM] Schedule ${schedule.id} advanced: ${schedule.nextDueDate} → ${newDue}`);
        }
      } catch (schedErr) {
        logger.error("⚠️ [PPM] Failed to advance schedule after work order completion:", schedErr);
      }
    }

    await logPpmAudit(custDb, "work_order_updated", req.user!.username, { workOrderId: id, status: updates.status as string | undefined });
    evaluateSiteBackground(req.customerId!, row?.siteId);
    res.json(row);
  } catch (error: unknown) {
    if (error instanceof SiteContextError) return res.status(error.statusCode).json({ error: error.message });
    logger.error("PUT /api/ppm/work-orders/:id", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to update PPM work order" });
  }
});

// DELETE /api/ppm/work-orders/:id — delete a work order
app.delete("/api/ppm/work-orders/:id", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    const { id } = req.params;
    const { db: custDb, siteContext } = await getScopedDb(req);
    const [existing] = await custDb.select({ id: isolatedSchema.ppmWorkOrders.id, status: isolatedSchema.ppmWorkOrders.status, title: isolatedSchema.ppmWorkOrders.title })
      .from(isolatedSchema.ppmWorkOrders)
      .where(and(eq(isolatedSchema.ppmWorkOrders.id, id), scopedWhere(siteContext, isolatedSchema.ppmWorkOrders)));
    if (!existing) return res.status(404).json({ error: "Work order not found" });
    if (existing.status === "completed") {
      return res.status(400).json({ error: "Completed work orders cannot be deleted. Change the status first if this record is in error." });
    }
    await custDb.delete(isolatedSchema.ppmWorkOrders).where(eq(isolatedSchema.ppmWorkOrders.id, id));
    await logPpmAudit(custDb, "work_order_deleted", req.user!.username, { workOrderId: id, title: existing.title ?? undefined });
    res.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof SiteContextError) return res.status(error.statusCode).json({ error: error.message });
    logger.error("DELETE /api/ppm/work-orders/:id", error);
    res.status(500).json({ error: "Failed to delete PPM work order" });
  }
});

// POST /api/ppm/work-orders/:id/duplicate — clone a work order, resetting status/completion fields
app.post("/api/ppm/work-orders/:id/duplicate", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    const { id } = req.params;
    const { db: custDb, siteId, siteContext } = await getScopedDb(req);
    const [original] = await custDb.select().from(isolatedSchema.ppmWorkOrders)
      .where(and(eq(isolatedSchema.ppmWorkOrders.id, id), scopedWhere(siteContext, isolatedSchema.ppmWorkOrders)));
    if (!original) return res.status(404).json({ error: "Work order not found" });
    const accessToken = randomBytes(24).toString("hex");
    const accessTokenExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    // Re-validate clearance on duplicate — the original may have been compliant at assignment time
    // but documents could have expired or worker could have been banned since.
    const dupGate = await assertContractorClearance(custDb, original.contractorCompanyId, original.contractorWorkerId, req.customerId);
    const carryCompany = dupGate ? null : original.contractorCompanyId;
    const carryCompanyName = dupGate ? null : original.contractorCompanyName;
    const carryWorker = dupGate ? null : original.contractorWorkerId;
    const carryWorkerName = dupGate ? null : original.contractorWorkerName;
    const carryEmail = dupGate ? null : original.assignedEmail;
    const [copy] = await custDb.insert(isolatedSchema.ppmWorkOrders).values(withSiteId(siteId, {
      scheduleId: original.scheduleId,
      assetId: original.assetId,
      title: `${original.title} (Copy)`,
      description: original.description,
      status: "scheduled",
      contractorCompanyId: carryCompany,
      contractorCompanyName: carryCompanyName,
      contractorWorkerId: carryWorker,
      contractorWorkerName: carryWorkerName,
      assignedEmail: carryEmail,
      dueDate: original.dueDate,
      notes: original.notes,
      requiresCertificate: original.requiresCertificate,
      accessToken,
      accessTokenExpiresAt,
    })).returning();
    await logPpmAudit(custDb, "work_order_duplicated", req.user!.username, { workOrderId: copy.id, sourceId: id });
    res.json(copy);
  } catch (error: unknown) {
    if (error instanceof SiteContextError) return res.status(error.statusCode).json({ error: error.message });
    logger.error("POST /api/ppm/work-orders/:id/duplicate", error);
    res.status(500).json({ error: "Failed to duplicate work order" });
  }
});

// POST /api/ppm/work-orders/:id/assign — assign contractor and send email
app.post("/api/ppm/work-orders/:id/assign", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    const { id } = req.params;
    const { contractorCompanyId, contractorCompanyName, contractorWorkerId, contractorWorkerName, assignedEmail } = req.body;
    const { db: custDb, siteContext } = await getScopedDb(req);

    const [wo] = await custDb.select().from(isolatedSchema.ppmWorkOrders)
      .where(and(eq(isolatedSchema.ppmWorkOrders.id, id), scopedWhere(siteContext, isolatedSchema.ppmWorkOrders)));
    if (!wo) return res.status(404).json({ error: "Work order not found" });

    // Validate contractor IDs against the contractors tables to prevent inconsistent assignment metadata
    if (contractorCompanyId) {
      const [company] = await custDb.select({ id: isolatedSchema.contractorCompanies.id })
        .from(isolatedSchema.contractorCompanies)
        .where(eq(isolatedSchema.contractorCompanies.id, contractorCompanyId));
      if (!company) return res.status(400).json({ error: "Contractor company not found" });

      if (contractorWorkerId) {
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

    // Compliance hard-gate: legally-required docs valid + worker cleared (induction, RTW, not banned)
    const clearanceGate = await assertContractorClearance(custDb, contractorCompanyId, contractorWorkerId, req.customerId);
    if (clearanceGate) return res.status(400).json(clearanceGate);

    // Rotate access token on every assignment/reassignment so old recipients lose access
    const newAccessToken = randomBytes(24).toString("hex");
    const newTokenExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days from now

    const [updated] = await custDb.update(isolatedSchema.ppmWorkOrders)
      .set({ contractorCompanyId, contractorCompanyName, contractorWorkerId, contractorWorkerName, assignedEmail, accessToken: newAccessToken, accessTokenExpiresAt: newTokenExpiresAt })
      .where(and(eq(isolatedSchema.ppmWorkOrders.id, id), scopedWhere(siteContext, isolatedSchema.ppmWorkOrders)))
      .returning();

    // Look up maintenance template (via schedule) to include specification + checklist in the email
    let assignEmailTemplate: { name: string; checklist: string | null; regulationReference: string | null; estimatedHours: string | null; type: string } | null = null;
    if (wo.scheduleId) {
      try {
        const [sched] = await custDb.select({ templateId: isolatedSchema.ppmSchedules.templateId })
          .from(isolatedSchema.ppmSchedules)
          .where(eq(isolatedSchema.ppmSchedules.id, wo.scheduleId));
        if (sched?.templateId) {
          const [tpl] = await custDb.select({
            name: isolatedSchema.ppmTemplates.name,
            checklist: isolatedSchema.ppmTemplates.checklist,
            regulationReference: isolatedSchema.ppmTemplates.regulationReference,
            estimatedHours: isolatedSchema.ppmTemplates.estimatedHours,
            type: isolatedSchema.ppmTemplates.type,
          }).from(isolatedSchema.ppmTemplates)
            .where(eq(isolatedSchema.ppmTemplates.id, sched.templateId));
          assignEmailTemplate = tpl ?? null;
        }
      } catch { /* non-fatal — template section is supplementary */ }
    }

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
        const emailSvc = new EmailService(req.customerId!);
        // Build optional maintenance specification block for the email
        const templateSpecHtml = assignEmailTemplate ? `
          <div style="margin:20px 0">
            <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#1f2937;text-transform:uppercase;letter-spacing:.05em">Maintenance Specification</p>
            ${assignEmailTemplate.type === "statutory" ? `<p style="margin:0 0 4px;font-size:13px;color:#b45309"><strong>⚑ Statutory maintenance</strong></p>` : ""}
            ${assignEmailTemplate.regulationReference ? `<p style="margin:0 0 4px;font-size:13px;color:#374151"><strong>Regulation:</strong> ${escapeHtml(assignEmailTemplate.regulationReference)}</p>` : ""}
            ${assignEmailTemplate.estimatedHours ? `<p style="margin:0 0 4px;font-size:13px;color:#374151"><strong>Estimated duration:</strong> ${escapeHtml(assignEmailTemplate.estimatedHours)} hours</p>` : ""}
            ${buildEmailChecklistHtml(assignEmailTemplate.checklist)}
          </div>` : "";
        const templateSpecText = assignEmailTemplate ? `\nMaintenance Specification\n${assignEmailTemplate.regulationReference ? `Regulation: ${assignEmailTemplate.regulationReference}\n` : ""}${assignEmailTemplate.estimatedHours ? `Estimated duration: ${assignEmailTemplate.estimatedHours} hours\n` : ""}` : "";
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
                  <p style="margin:0 0 8px;font-weight:600;color:#0c4a6e;font-size:15px">${escapeHtml(wo.title)}</p>
                  ${wo.description ? `<p style="margin:0 0 8px;color:#374151;font-size:14px">${escapeHtml(wo.description)}</p>` : ""}
                  ${wo.dueDate ? `<p style="margin:0;color:#374151;font-size:14px"><strong>Due:</strong> ${new Date(wo.dueDate).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" })}</p>` : ""}
                </div>
                ${templateSpecHtml}
                <div style="text-align:center;margin:28px 0">
                  <a href="${workOrderUrl}" style="background:#1d4ed8;color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-weight:600;font-size:15px;display:inline-block">View Work Order</a>
                </div>
                <p style="color:#6b7280;font-size:13px">Use the button above to view full details, update status, add notes and upload service documents. The link works on mobile and desktop.</p>
              </div>
              <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 28px;text-align:center">
                <p style="margin:0;color:#9ca3af;font-size:12px">This email was sent by ${companyName} via TPR-Max PPM system.</p>
              </div>
            </div>
            </body></html>
          `,
          text: `PPM Work Order Assigned: ${wo.title}\n\nHello ${recipientName},\n\nYou have been assigned a PPM work order.\n\nTitle: ${wo.title}\n${wo.description ? `Description: ${wo.description}\n` : ""}${wo.dueDate ? `Due: ${wo.dueDate}\n` : ""}${templateSpecText}\nView your work order at:\n${workOrderUrl}\n\n${companyName}`,
        });
        notificationSent = true;
      } catch (emailErr) {
        logger.error("PPM work order assignment email failed:", emailErr);
      }
    }
    await logPpmAudit(custDb, "work_order_assigned", req.user!.username, { workOrderId: id, contractorCompanyId: contractorCompanyId ?? undefined, contractorWorkerId: contractorWorkerId ?? undefined, notificationSent });
    // Return explicit notificationSent flag so UI/callers know whether email was dispatched
    res.json({ ...updated, notificationSent });
  } catch (error: unknown) {
    logger.error("POST /api/ppm/work-orders/:id/assign", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to assign contractor" });
  }
});

// GET /api/ppm/work-orders/:id/documents — list documents for a work order (admin only)
app.get("/api/ppm/work-orders/:id/documents", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    const { id } = req.params;
    const { db: custDb, siteContext } = await getScopedDb(req);
    const wo = await fetchWoInScope(custDb, id, siteContext);
    if (!wo) return res.status(404).json({ error: "Work order not found" });
    const docs = await custDb.select().from(isolatedSchema.ppmWorkOrderDocuments)
      .where(eq(isolatedSchema.ppmWorkOrderDocuments.workOrderId, id))
      .orderBy(isolatedSchema.ppmWorkOrderDocuments.createdAt);
    res.json(docs);
  } catch (error: unknown) {
    if (error instanceof SiteContextError) return res.status(error.statusCode).json({ error: error.message });
    logger.error("GET /api/ppm/work-orders/:id/documents", error);
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
    const { db: custDb, siteContext } = await getScopedDb(req);
    const woInScope = await fetchWoInScope(custDb, id, siteContext);
    if (!woInScope) return res.status(404).json({ error: "Work order not found" });
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
    await logPpmAudit(custDb, "document_uploaded", req.user!.username, { workOrderId: id, fileName: escapeHtml(fileName), fileType: resolvedFileType });
    res.json(doc);
  } catch (error: unknown) {
    logger.error("POST /api/ppm/work-orders/:id/documents", error);
    res.status(500).json({ error: "Failed to upload document" });
  }
});

// DELETE /api/ppm/work-orders/:id/documents/:docId — remove a document
app.delete("/api/ppm/work-orders/:id/documents/:docId", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    const { id, docId } = req.params;
    const { db: custDb, siteContext } = await getScopedDb(req);
    // Verify work order exists and is in caller's allowed site(s)
    const woCheck = await fetchWoInScope(custDb, id, siteContext);
    if (!woCheck) return res.status(404).json({ error: "Work order not found" });
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
    await logPpmAudit(custDb, "document_deleted", req.user!.username, { workOrderId: id, documentId: docId });
    res.json({ success: true });
  } catch (error: unknown) {
    logger.error("DELETE /api/ppm/work-orders/:id/documents/:docId", error);
    res.status(500).json({ error: "Failed to delete document" });
  }
});

// POST /api/ppm/work-orders/:id/documents/:docId/resend-alert — resend expiry alert email immediately
app.post("/api/ppm/work-orders/:id/documents/:docId/resend-alert", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    const { id, docId } = req.params;
    const { db: custDb, siteContext } = await getScopedDb(req);
    // Verify work order exists and is in caller's allowed site(s)
    const woCheck = await fetchWoInScope(custDb, id, siteContext);
    if (!woCheck) return res.status(404).json({ error: "Work order not found" });

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

    const emailSvc = new EmailService(req.customerId!);
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
                  <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-weight:500">${escapeHtml(doc.fileName)}</td>
                  <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6">${escapeHtml(woTitle)}</td>
                  <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:${isExpired ? "#dc2626" : "#d97706"};font-weight:600">${escapeHtml(String(doc.expiryDate ?? ""))}</td>
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
                  <p style="margin:0 0 6px;font-weight:600;color:#1f2937;font-size:15px">${escapeHtml(woTitle)}</p>
                  <p style="margin:0 0 4px;font-size:14px;color:#374151"><strong>Document:</strong> ${escapeHtml(doc.fileName)}</p>
                  <p style="margin:0 0 4px;font-size:14px;color:${accentColor}"><strong>Expiry Date:</strong> ${escapeHtml(String(doc.expiryDate ?? ""))}</p>
                  <p style="margin:0;font-size:14px;color:${accentColor}"><strong>Status:</strong> ${escapeHtml(statusLabel)}</p>
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
        logger.error("PPM expiry resend — contractor notification failed:", contractorEmailErr);
      }
    }

    // Stamp expiryAlertedAt so cron won't re-fire automatically until reset
    await custDb.update(isolatedSchema.ppmWorkOrderDocuments)
      .set({ expiryAlertedAt: new Date() })
      .where(eq(isolatedSchema.ppmWorkOrderDocuments.id, docId));

    res.json({ success: true, contractorNotified });
  } catch (error: unknown) {
    logger.error("POST /api/ppm/work-orders/:id/documents/:docId/resend-alert", error);
    res.status(500).json({ error: "Failed to resend alert" });
  }
});

// POST /api/ppm/documents/bulk-resend-alerts — resend expiry alert for ALL expiring/expired PPM documents at once
// Admin receives a consolidated digest; each work order's assigned contractor (if any) receives a per-document email.
app.post("/api/ppm/documents/bulk-resend-alerts", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    const { db: custDb, siteContext } = await getScopedDb(req);

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

    // Documents have no siteId — scope via parent work orders
    const scopedWoRows = await custDb.select({ id: isolatedSchema.ppmWorkOrders.id })
      .from(isolatedSchema.ppmWorkOrders)
      .where(scopedWhere(siteContext, isolatedSchema.ppmWorkOrders));
    const scopedWoIds = scopedWoRows.map(w => w.id);

    // Fetch all PPM work order documents that are expired or expiring within 30 days
    const expiringDocs = scopedWoIds.length > 0
      ? await custDb.select({
          id: isolatedSchema.ppmWorkOrderDocuments.id,
          fileName: isolatedSchema.ppmWorkOrderDocuments.fileName,
          expiryDate: isolatedSchema.ppmWorkOrderDocuments.expiryDate,
          workOrderId: isolatedSchema.ppmWorkOrderDocuments.workOrderId,
        }).from(isolatedSchema.ppmWorkOrderDocuments)
          .where(and(
            inArray(isolatedSchema.ppmWorkOrderDocuments.workOrderId, scopedWoIds),
            sql`${isolatedSchema.ppmWorkOrderDocuments.expiryDate} IS NOT NULL`,
            sql`${isolatedSchema.ppmWorkOrderDocuments.expiryDate} <= ${in30DaysStr}`
          ))
      : [];

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
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-weight:500">${escapeHtml(d.fileName)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6">${escapeHtml(woMap[d.workOrderId]?.title ?? d.workOrderId)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:${isExp ? "#dc2626" : "#d97706"};font-weight:600">${escapeHtml(String(d.expiryDate ?? ""))}</td>
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

    const emailSvc = new EmailService(req.customerId!);

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
                  <p style="margin:0 0 6px;font-weight:600;color:#1f2937;font-size:15px">${escapeHtml(woTitle)}</p>
                  <p style="margin:0 0 4px;font-size:14px;color:#374151"><strong>Document:</strong> ${escapeHtml(doc.fileName)}</p>
                  <p style="margin:0 0 4px;font-size:14px;color:${accentColor}"><strong>Expiry Date:</strong> ${escapeHtml(String(doc.expiryDate ?? ""))}</p>
                  <p style="margin:0;font-size:14px;color:${accentColor}"><strong>Status:</strong> ${escapeHtml(statusLabel)}</p>
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
        logger.error(`PPM bulk resend — contractor notification failed for WO ${doc.workOrderId}:`, contractorEmailErr);
      }
    }

    // Stamp expiryAlertedAt on all processed documents
    const docIds = expiringDocs.map(d => d.id);
    await custDb.update(isolatedSchema.ppmWorkOrderDocuments)
      .set({ expiryAlertedAt: new Date() })
      .where(inArray(isolatedSchema.ppmWorkOrderDocuments.id, docIds));

    res.json({ success: true, documentsAlerted: expiringDocs.length, contractorEmailsSent });
  } catch (error: unknown) {
    logger.error("POST /api/ppm/documents/bulk-resend-alerts", error);
    res.status(500).json({ error: "Failed to send bulk alerts" });
  }
});

// GET /api/ppm/work-orders/export-all — bulk PDF export for all matching work orders
app.get("/api/ppm/work-orders/export-all", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    const { db: custDb, siteContext } = await getScopedDb(req);
    const { status, dateFrom, dateTo } = req.query as { status?: string; dateFrom?: string; dateTo?: string };

    // Build filter conditions — site filter first so enterprise isolation is always applied
    const siteWoFilter = scopedWhere(siteContext, isolatedSchema.ppmWorkOrders);
    const conditions: SQL<unknown>[] = [];
    if (siteWoFilter) conditions.push(siteWoFilter);
    if (status && status !== "all") conditions.push(eq(isolatedSchema.ppmWorkOrders.status, status));
    if (dateFrom) conditions.push(gte(isolatedSchema.ppmWorkOrders.dueDate, dateFrom));
    if (dateTo) conditions.push(lte(isolatedSchema.ppmWorkOrders.dueDate, dateTo));

    const wos = await custDb.select().from(isolatedSchema.ppmWorkOrders)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(isolatedSchema.ppmWorkOrders.dueDate);

    // Fetch assets scoped to caller's allowed site(s)
    const allAssets = await custDb.select({ id: isolatedSchema.ppmAssets.id, name: isolatedSchema.ppmAssets.name })
      .from(isolatedSchema.ppmAssets)
      .where(scopedWhere(siteContext, isolatedSchema.ppmAssets));
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
    logger.error("GET /api/ppm/work-orders/export-all", error);
    res.status(500).json({ error: "Failed to generate bulk work order export" });
  }
});

// POST /api/ppm/documents/bulk-resend-alert — send a single digest covering ALL expired/expiring-soon PPM documents
app.post("/api/ppm/documents/bulk-resend-alert", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    const { db: custDb, siteContext } = await getScopedDb(req);
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

    // Documents have no siteId — scope via parent work orders
    const scopedWoRows = await custDb.select({ id: isolatedSchema.ppmWorkOrders.id })
      .from(isolatedSchema.ppmWorkOrders)
      .where(scopedWhere(siteContext, isolatedSchema.ppmWorkOrders));
    const scopedWoIds = scopedWoRows.map(w => w.id);

    // Fetch ALL expired or expiring-soon documents (regardless of expiryAlertedAt — this is a manual bulk resend)
    const expiringDocs = scopedWoIds.length > 0
      ? await custDb.select({
          id: isolatedSchema.ppmWorkOrderDocuments.id,
          fileName: isolatedSchema.ppmWorkOrderDocuments.fileName,
          fileType: isolatedSchema.ppmWorkOrderDocuments.fileType,
          expiryDate: isolatedSchema.ppmWorkOrderDocuments.expiryDate,
          workOrderId: isolatedSchema.ppmWorkOrderDocuments.workOrderId,
        }).from(isolatedSchema.ppmWorkOrderDocuments)
          .where(and(
            inArray(isolatedSchema.ppmWorkOrderDocuments.workOrderId, scopedWoIds),
            sql`${isolatedSchema.ppmWorkOrderDocuments.expiryDate} IS NOT NULL`,
            sql`${isolatedSchema.ppmWorkOrderDocuments.expiryDate} <= ${in30DaysStr}`
          ))
      : [];

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
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-weight:500">${escapeHtml(d.fileName)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6">${escapeHtml(woMap[d.workOrderId] ?? d.workOrderId)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:${isExp ? "#dc2626" : "#d97706"};font-weight:600">${escapeHtml(String(d.expiryDate ?? ""))}</td>
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

    const emailSvc = new EmailService(req.customerId!);
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
    logger.error("POST /api/ppm/documents/bulk-resend-alert", error);
    res.status(500).json({ error: "Failed to send bulk expiry alert" });
  }
});

// GET /api/ppm/work-orders/:id/export — generate a PDF summary of a work order
app.get("/api/ppm/work-orders/:id/export", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    const { id } = req.params;
    const { db: custDb, siteContext } = await getScopedDb(req);

    const [wo] = await custDb.select().from(isolatedSchema.ppmWorkOrders)
      .where(and(eq(isolatedSchema.ppmWorkOrders.id, id), scopedWhere(siteContext, isolatedSchema.ppmWorkOrders)));
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
    logger.error("GET /api/ppm/work-orders/:id/export", error);
    res.status(500).json({ error: "Failed to generate work order export" });
  }
});

// ── PPM Demo Data ───────────────────────────────────────────────────────────
// POST /api/ppm/demo-data — seed typical UK facility PPM assets + templates

app.post("/api/ppm/demo-data", requireAuth, async (req, res) => {
  if (!["admin", "manager"].includes(req.user!.role)) return res.status(403).json({ error: "Administrator access required" });
  try {
    const { db: custDb, siteId, siteContext } = await getScopedDb(req);
    await ensurePpmColumns(custDb, req.customerId!);

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

    // ── STEP 0: Seed demo contractor companies and workers ───────────────────
    // Safe to run multiple times — checks for existing entries before inserting.
    const DEMO_CONTRACTORS = [
      { company: "CoolAir Services Ltd",    firstName: "Tom",    lastName: "Briggs",  jobTitle: "HVAC Engineer",                   email: "tom.briggs@coolair-services.co.uk",    industry: "HVAC" },
      { company: "FireGuard UK Ltd",         firstName: "Sarah",  lastName: "Webb",    jobTitle: "Fire Safety Engineer",            email: "sarah.webb@fireguard-uk.co.uk",        industry: "Fire Safety" },
      { company: "BuildRight Co",            firstName: "James",  lastName: "Carter",  jobTitle: "Mechanical Engineer",             email: "james.carter@buildright.co.uk",        industry: "Mechanical" },
      { company: "Volt-Safe Electrical Ltd", firstName: "Raj",    lastName: "Patel",   jobTitle: "Electrical Engineer",             email: "raj.patel@volt-safe.co.uk",            industry: "Electrical" },
      { company: "AquaSafe Hygiene Ltd",     firstName: "Claire", lastName: "Morris",  jobTitle: "Water Hygiene Technician",        email: "claire.morris@aquasafe-hygiene.co.uk", industry: "Water Hygiene" },
      { company: "SecureAccess Systems",     firstName: "Dan",    lastName: "Hughes",  jobTitle: "Security Systems Engineer",       email: "dan.hughes@secureaccess-systems.co.uk",industry: "Security" },
      { company: "Schindler UK",             firstName: "Mark",   lastName: "Taylor",  jobTitle: "Lift Engineer (LOLER Competent)", email: "mark.taylor@schindler.com",            industry: "Lifts & Hoists" },
    ];
    let contractorsSeeded = 0;
    for (const c of DEMO_CONTRACTORS) {
      // Look up existing company by name (companyName is unique)
      const [existingCompany] = await custDb
        .select({ id: isolatedSchema.contractorCompanies.id })
        .from(isolatedSchema.contractorCompanies)
        .where(eq(isolatedSchema.contractorCompanies.companyName, c.company))
        .limit(1);

      let companyId: string;
      if (existingCompany) {
        companyId = existingCompany.id;
      } else {
        const [ins] = await custDb.insert(isolatedSchema.contractorCompanies).values(withSiteId(siteId, {
          companyName:       c.company,
          contactEmail:      c.email,
          contactFirstName:  c.firstName,
          contactLastName:   c.lastName,
          industry:          c.industry,
          status:            "approved",
          isDemo:            true,
        }) as any).returning({ id: isolatedSchema.contractorCompanies.id });
        companyId = ins.id;
        contractorsSeeded++;
      }

      // Look up existing worker by name within this company
      const [existingWorker] = await custDb
        .select({ id: isolatedSchema.contractorWorkers.id })
        .from(isolatedSchema.contractorWorkers)
        .where(and(
          eq(isolatedSchema.contractorWorkers.companyId, companyId),
          eq(isolatedSchema.contractorWorkers.firstName, c.firstName),
          eq(isolatedSchema.contractorWorkers.lastName,  c.lastName),
        ))
        .limit(1);

      if (!existingWorker) {
        await custDb.insert(isolatedSchema.contractorWorkers).values(withSiteId(siteId, {
          companyId,
          firstName: c.firstName,
          lastName:  c.lastName,
          jobTitle:  c.jobTitle,
          email:     c.email,
          isDemo:    true,
        }) as any);
      }
    }
    logger.info(`✅ [PPM Demo] Contractor companies seeded: ${contractorsSeeded} new, ${DEMO_CONTRACTORS.length - contractorsSeeded} already existed`);

    // ── STEP 1: Wipe any pre-existing demo data (nuclear — assetRef / name based) ─
    // Identifies demo rows ONLY by the hardcoded asset refs and group names so it
    // catches rows loaded before the is_demo column existed (those have is_demo=false
    // / NULL) AND rows with siteId=NULL from before site-scoping was added.
    // FK-safe order: WO docs → WOs → Schedules → Assets → Groups
    // Templates are customer-level — seeded idempotently in STEP 4 (left untouched here).
    {
      const _demoAssetRows = await custDb
        .select({ id: isolatedSchema.ppmAssets.id })
        .from(isolatedSchema.ppmAssets)
        .where(and(
          inArray(isolatedSchema.ppmAssets.assetRef, DEMO_ASSET_REFS),
          scopedWhere(siteContext, isolatedSchema.ppmAssets) ?? sql`true`,
        ));
      const _demoAssetIds = _demoAssetRows.map(r => r.id);

      if (_demoAssetIds.length > 0) {
        const _demoWoRows = await custDb
          .select({ id: isolatedSchema.ppmWorkOrders.id })
          .from(isolatedSchema.ppmWorkOrders)
          .where(inArray(isolatedSchema.ppmWorkOrders.assetId, _demoAssetIds));
        const _demoWoIds = _demoWoRows.map(r => r.id);

        if (_demoWoIds.length > 0) {
          await custDb.delete(isolatedSchema.ppmWorkOrderDocuments)
            .where(inArray(isolatedSchema.ppmWorkOrderDocuments.workOrderId, _demoWoIds));
        }
        await custDb.delete(isolatedSchema.ppmWorkOrders)
          .where(inArray(isolatedSchema.ppmWorkOrders.assetId, _demoAssetIds));
        await custDb.delete(isolatedSchema.ppmSchedules)
          .where(inArray(isolatedSchema.ppmSchedules.assetId, _demoAssetIds));
        await custDb.delete(isolatedSchema.ppmAssets)
          .where(inArray(isolatedSchema.ppmAssets.id, _demoAssetIds));
      }

      await custDb.delete(isolatedSchema.ppmAssetGroups)
        .where(and(
          inArray(isolatedSchema.ppmAssetGroups.name, DEMO_GROUP_NAMES),
          scopedWhere(siteContext, isolatedSchema.ppmAssetGroups) ?? sql`true`,
        ));
    }

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
        .values(withSiteId(siteId, { ...g, isDemo: true }) as any).returning({ id: isolatedSchema.ppmAssetGroups.id });
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
        .values(withSiteId(siteId, { ...a, groupId, isDemo: true }) as any)
        .returning({ id: isolatedSchema.ppmAssets.id });
      assetIdByRef[a.assetRef] = inserted.id;
      assetsCreated++;
    }

    // ── STEP 4: Seed templates idempotently (customer-level, not site-scoped) ──
    // Templates are shared across all sites for this customer. Insert only if
    // a template with the same name doesn't already exist.
    let templatesCreated = 0;
    const templateIdByName: Record<string, string> = {};
    for (const t of DEMO_TEMPLATES) {
      const [existing] = await custDb.select({ id: isolatedSchema.ppmTemplates.id })
        .from(isolatedSchema.ppmTemplates)
        .where(eq(isolatedSchema.ppmTemplates.name, t.name)).limit(1);
      if (existing) {
        templateIdByName[t.name] = existing.id;
      } else {
        const [ins] = await custDb.insert(isolatedSchema.ppmTemplates)
          .values(t as any).returning({ id: isolatedSchema.ppmTemplates.id });
        templateIdByName[t.name] = ins.id;
        templatesCreated++;
      }
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
    // Returns a realistic due-day for a work order, spread across the month so each
    // individual asset/schedule gets its own day rather than all sharing one fixed date.
    // Base day per category reflects typical contractor visit weeks; position index
    // staggers assets within the same category by 2 days each (capped at 28).
    function getDueDay(category: string, position: number): number {
      const base: Record<string, number> = {
        "HVAC":            3,
        "Fire Safety":     4,
        "Water Hygiene":   7,
        "Security":       11,
        "Lifts & Hoists":  8,
        "Mechanical":      5,
        "Electrical":     14,
      };
      const b = base[category] ?? 9;
      // Stagger each schedule within a category by 2 days, wrapping within 0–9
      return Math.min(28, b + (position % 10) * 2);
    }

    // ── Schedules FIRST — so work orders can reference their scheduleId ────────
    // Dates are always relative to the current year so the demo looks live, not stale.
    const _NOW = new Date();
    const CUR_YEAR  = _NOW.getFullYear();
    const CUR_MONTH = _NOW.getMonth();  // 0-indexed
    const CUR_DAY   = _NOW.getDate();
    const CY = CUR_YEAR; // shorthand

    type SchedDef = { assetRef: string; templateName: string; frequency: string; customDays?: number; nextDueDate: string; assignedTo?: string };
    const DEMO_SCHEDULES: SchedDef[] = [
      // HVAC – quarterly filter & coil service (staggered across 3 quarter-cycles for realism)
      // Group A (Jan/Apr/Jul/Oct): main AHUs
      ...(["AHU-001","AHU-GF","AHU-01","AHU-02"] as const).map(r => ({
        assetRef: r, templateName: "Quarterly HVAC Filter & Coil Service", frequency: "quarterly",
        nextDueDate: `${CY}-01-03`, assignedTo: "CoolAir Services Ltd",
      })),
      // Group B (Feb/May/Aug/Nov): upper-floor FCUs
      ...(["FCU-01","FCU-02","FCU-03","FCU-04"] as const).map(r => ({
        assetRef: r, templateName: "Quarterly HVAC Filter & Coil Service", frequency: "quarterly",
        nextDueDate: `${CY}-02-15`, assignedTo: "CoolAir Services Ltd",
      })),
      // Group C (Mar/Jun/Sep/Dec): remaining AHUs + cooling tower
      ...(["AHU-03","AHU-04","CT-001"] as const).map(r => ({
        assetRef: r, templateName: "Quarterly HVAC Filter & Coil Service", frequency: "quarterly",
        nextDueDate: `${CY}-03-19`, assignedTo: "CoolAir Services Ltd",
      })),
      // HVAC – annual full service for primary plant (belt/bearing/coil deep clean)
      ...(["AHU-001","AHU-GF","CT-001"] as const).map(r => ({
        assetRef: r, templateName: "Annual HVAC Full Plant Service", frequency: "annual",
        nextDueDate: `${CY}-08-05`, assignedTo: "CoolAir Services Ltd",
      })),
      // Fire safety – annual fire alarm full test
      { assetRef: "FAP-001", templateName: "Annual Fire Alarm Full Test", frequency: "annual",
        nextDueDate: `${CY}-12-06`, assignedTo: "FireGuard UK Ltd" },
      // Emergency lighting – quarterly functional test (BS 5266 minimum)
      ...(["EL-001","EL-GF","EL-01","EL-02","EL-03","EL-04"] as const).map(r => ({
        assetRef: r, templateName: "Quarterly Emergency Lighting Functional Test", frequency: "quarterly",
        nextDueDate: `${CY}-01-08`, assignedTo: "FireGuard UK Ltd",
      })),
      // Emergency lighting – annual 3-hour duration test (BS 5266 mandatory)
      ...(["EL-001","EL-GF","EL-01","EL-02","EL-03","EL-04"] as const).map(r => ({
        assetRef: r, templateName: "Annual Emergency Lighting Duration Test", frequency: "annual",
        nextDueDate: `${CY}-10-08`, assignedTo: "FireGuard UK Ltd",
      })),
      // Sprinkler – quarterly inspection + annual full flow test
      { assetRef: "SPR-001", templateName: "Quarterly Sprinkler System Inspection", frequency: "quarterly",
        nextDueDate: `${CY}-03-22`, assignedTo: "FireGuard UK Ltd" },
      { assetRef: "SPR-001", templateName: "Annual Sprinkler Full Flow Test", frequency: "annual",
        nextDueDate: `${CY}-09-22`, assignedTo: "FireGuard UK Ltd" },
      // Boilers – annual gas safety check (staggered slightly between the two boilers)
      { assetRef: "BLR-001", templateName: "Annual Boiler Service & Gas Safety Check", frequency: "annual",
        nextDueDate: `${CY}-11-05`, assignedTo: "BuildRight Co" },
      { assetRef: "BLR-002", templateName: "Annual Boiler Service & Gas Safety Check", frequency: "annual",
        nextDueDate: `${CY}-12-07`, assignedTo: "BuildRight Co" },
      // Lifts – 6-monthly LOLER thorough examination (statutory)
      { assetRef: "LFT-001", templateName: "6-Monthly Lift Thorough Examination", frequency: "custom",
        customDays: 183, nextDueDate: `${CY}-06-12`, assignedTo: "Schindler UK" },
      { assetRef: "LFT-002", templateName: "6-Monthly Lift Thorough Examination", frequency: "custom",
        customDays: 183, nextDueDate: `${CY}-06-14`, assignedTo: "Schindler UK" },
      // Electrical – 5-yearly EICR (baseline done 2 years ago; next due in 5 years' time)
      ...(["EDB-001","GEN-001","LPS-001"] as const).map(r => ({
        assetRef: r, templateName: "Fixed Wiring Inspection & Testing (EICR)", frequency: "custom",
        customDays: 1825, nextDueDate: `${CY + 5}-01-16`, assignedTo: "Volt-Safe Electrical Ltd",
      })),
      // Security – 6-monthly health check (ACS and CCTV on different 6M cycles)
      { assetRef: "ACS-001",  templateName: "6-Monthly Access Control System Health Check", frequency: "custom",
        customDays: 183, nextDueDate: `${CY}-05-25`, assignedTo: "SecureAccess Systems" },
      { assetRef: "CCTV-001", templateName: "6-Monthly CCTV System Health Check", frequency: "custom",
        customDays: 183, nextDueDate: `${CY}-07-27`, assignedTo: "SecureAccess Systems" },
      // Water hygiene – monthly L8 inspection (legally required under HSE L8/ACOP)
      ...(["CWT-001","HWC-001","WT-001"] as const).map(r => ({
        assetRef: r, templateName: "Monthly Water Hygiene Inspection", frequency: "monthly",
        nextDueDate: `${CY}-05-21`, assignedTo: "AquaSafe Hygiene Ltd",
      })),
    ];

    // ── STEP 5: Insert schedules (fresh) ─────────────────────────────────────
    let schedulesCreated = 0;
    // Key: "assetRef:templateName" → scheduleId — used to link work orders to their exact schedule
    const scheduleIdMap: Record<string, string> = {};

    for (const s of DEMO_SCHEDULES) {
      const assetId = assetIdByRef[s.assetRef];
      if (!assetId) continue;
      const templateId = templateIdByName[s.templateName] ?? null;

      const [ins] = await custDb.insert(isolatedSchema.ppmSchedules).values(
        withSiteId(siteId, {
          assetId, templateId,
          title: s.templateName,
          frequency: s.frequency,
          customDays: s.customDays ?? null,
          startDate: `${CUR_YEAR}-01-01`,
          nextDueDate: s.nextDueDate,
          status: "scheduled",
          assignedTo: s.assignedTo ?? null,
          isDemo: true,
        }) as any
      ).returning({ id: isolatedSchema.ppmSchedules.id });
      schedulesCreated++;
      scheduleIdMap[`${s.assetRef}:${s.templateName}`] = ins.id;
    }

    // ── STEP 6: Work orders: Jan–Dec 2026 linked to their schedules ──────────
    // (table already wiped in STEP 1 — insert fresh)

    // Returns the months (0-indexed) in which work orders should be created for a schedule,
    // based on the schedule's actual frequency rather than a crude category mapping.
    function getScheduleMonths(
      frequency: string,
      customDays: number | undefined | null,
      nextDueDate: string,
      posIdx: number,
      year: number
    ): number[] {
      if (frequency === "monthly") return [0,1,2,3,4,5,6,7,8,9,10,11];

      if (frequency === "quarterly") {
        // Anchor from the month in nextDueDate so quarters are realistic, not arbitrary
        const startMonth = new Date(nextDueDate).getMonth();
        return [0, 3, 6, 9].map(off => (startMonth + off) % 12).sort((a, b) => a - b);
      }

      if (frequency === "annual") {
        // Use the month from nextDueDate (e.g. "2026-12-12" → month 11)
        return [new Date(nextDueDate).getMonth()];
      }

      if (frequency === "custom") {
        const days = customDays ?? 0;
        if (days >= 175 && days <= 190) {
          // 6-monthly (e.g. LOLER 183 days): two visits per year, staggered by position
          return posIdx % 2 === 0 ? [5, 11] : [2, 8]; // Jun+Dec or Mar+Sep
        }
        if (days >= 1800) {
          // 5-yearly (e.g. EICR 1825 days): show once in (currentYear-2) as the baseline inspection;
          // the next occurrence falls outside the 4-year demo window.
          return year === CUR_YEAR - 2 ? [0] : [];
        }
      }

      return [];
    }

    // Build a work-order record for a given year + month, with realistic per-year statuses.
    // All year comparisons are relative to CUR_YEAR so the demo looks current whenever it is run.
    // CUR_YEAR-2  — full historical year: all completed, small fraction overdue for realism
    // CUR_YEAR-1  — recent historical year: mostly completed, a few overdue late in the year
    // CUR_YEAR    — current year: months before today completed/in-progress; future months scheduled
    //               Items due >14 days ago within the current month show as overdue (realistic backlog)
    // CUR_YEAR+1  — forward planning year: all scheduled
    function buildWoRecord(
      year: number, monthIdx: number, assetPosition: number, category: string
    ): { status: string; completedDate?: string; dueDate: string; notes?: string } {
      const dueDay = getDueDay(category, assetPosition);
      const lastDay = new Date(year, monthIdx + 1, 0).getDate();
      const day = String(Math.min(dueDay, lastDay)).padStart(2, "0");
      const mm  = String(monthIdx + 1).padStart(2, "0");
      const dueDate = `${year}-${mm}-${day}`;

      if (year === CUR_YEAR - 2) {
        // Two years ago — all fully completed. Occasional "completed late" entry for realism.
        // Nothing is ever overdue: those jobs would have been resolved long ago.
        const slot = (assetPosition + monthIdx) % 10;
        if (slot === 4) {
          const lateDay = String(Math.min(dueDay + 7, lastDay)).padStart(2, "0");
          return { status: "completed", completedDate: `${year}-${mm}-${lateDay}`, dueDate, notes: "Completed 7 days late." };
        }
        return { status: "completed", completedDate: dueDate, dueDate };
      }

      if (year === CUR_YEAR - 1) {
        // Last year — all completed. A few late completions in Q4 for realism.
        // Nothing is ever overdue: any missed job from last year would have been closed off.
        if (monthIdx >= 9 && (assetPosition + monthIdx) % 7 === 0) {
          const lateDay = String(Math.min(dueDay + 5, lastDay)).padStart(2, "0");
          return { status: "completed", completedDate: `${year}-${mm}-${lateDay}`, dueDate, notes: "Completed late — Q4 scheduling pressure." };
        }
        return { status: "completed", completedDate: dueDate, dueDate };
      }

      if (year === CUR_YEAR) {
        // Current year. Rule: ONLY items whose due date falls within the last 14 days
        // (i.e. this calendar month, due day ≤ today-14) may be overdue.
        // Anything older than 2 weeks is already completed or resolved.
        if (monthIdx < CUR_MONTH) {
          // Any prior month this year: completed
          return { status: "completed", completedDate: dueDate, dueDate };
        }
        if (monthIdx === CUR_MONTH) {
          // Items due MORE than 14 days ago are already completed — they were dealt with
          if (dueDay < CUR_DAY - 14) {
            return { status: "completed", completedDate: dueDate, dueDate };
          }
          // Items due WITHIN the last 14 days: realistic mix of overdue and in-progress
          // (these are the only ones that can appear as overdue — max age 2 weeks)
          if (dueDay <= CUR_DAY) {
            const mod = assetPosition % 3;
            if (mod === 0) return { status: "completed", completedDate: dueDate, dueDate };
            if (mod === 1) return { status: "overdue", dueDate, notes: "Work overdue — contractor visit rescheduled." };
            return { status: "in_progress", dueDate };
          }
          // Due later this month: scheduled
          return { status: "scheduled", dueDate };
        }
        // Future months: scheduled
        return { status: "scheduled", dueDate };
      }

      // Next year — forward planning, all scheduled
      return { status: "scheduled", dueDate };
    }

    const STATUTORY_CATEGORIES = new Set(["Fire Safety", "Mechanical", "Electrical", "Water Hygiene", "Lifts & Hoists"]);

    let workOrdersCreated = 0;

    // Generate work orders for 4 years: (curYear-2) history, (curYear-1) recent, curYear current, (curYear+1) planned
    const PLANNER_YEARS = [CUR_YEAR - 2, CUR_YEAR - 1, CUR_YEAR, CUR_YEAR + 1];

    // Build a quick lookup so we can get the full asset record inside the schedule loop
    const assetByRef: Record<string, typeof ALL_DEMO_ASSETS[number]> = {};
    for (const a of ALL_DEMO_ASSETS) assetByRef[a.assetRef] = a;

    // Loop over schedules, not assets — each schedule has an explicit frequency so work
    // orders are generated at the correct intervals (monthly / quarterly / annual / 6M / 5Y).
    let schedPosition = 0;
    for (const schedDef of DEMO_SCHEDULES) {
      const assetId = assetIdByRef[schedDef.assetRef];
      if (!assetId) continue;

      const asset = assetByRef[schedDef.assetRef];
      if (!asset) continue;

      const scheduleId = scheduleIdMap[`${schedDef.assetRef}:${schedDef.templateName}`] ?? null;
      const contractor = CATEGORY_CONTRACTOR[asset.category];
      const requiresCertificate = STATUTORY_CATEGORIES.has(asset.category ?? "");
      // Use the schedule's template name as the work order title for accuracy
      const title = schedDef.templateName;

      for (const year of PLANNER_YEARS) {
        const months = getScheduleMonths(schedDef.frequency, schedDef.customDays ?? null, schedDef.nextDueDate, schedPosition, year);
        for (const monthIdx of months) {
          const rec = buildWoRecord(year, monthIdx, schedPosition, asset.category);
          // For historical work orders: assign the contractor; future: leave blank
          const showContractor = rec.status !== "scheduled";
          // For completed demo WOs that require a certificate, simulate one having been
          // uploaded on the completion day — historical jobs are done and dusted.
          const demoCertUploadedAt = (rec.status === "completed" && requiresCertificate && rec.completedDate)
            ? new Date(rec.completedDate + "T09:00:00Z")
            : null;
          await custDb.insert(isolatedSchema.ppmWorkOrders).values(
            withSiteId(siteId, {
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
              certificateUploadedAt: demoCertUploadedAt,
              isDemo: true,
            }) as any
          );
          workOrdersCreated++;
        }
      }
      schedPosition++;
    }

    res.json({
      success: true,
      contractorsSeeded,
      groupsCreated: DEMO_GROUPS.length,
      assetsCreated,
      templatesCreated,
      schedulesCreated,
      workOrdersCreated,
      message: `Demo data refreshed: ${DEMO_GROUPS.length} asset groups, ${assetsCreated} assets, ${templatesCreated} templates, ${schedulesCreated} schedules, and ${workOrdersCreated} work orders across ${CUR_YEAR - 2}–${CUR_YEAR + 1}. ${contractorsSeeded > 0 ? `${contractorsSeeded} contractor companies added to Contractors.` : "Contractor companies already present."} Use the year picker in the Annual Planner to navigate between years.`,
    });
  } catch (error: unknown) {
    logger.error("POST /api/ppm/demo-data", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load demo data" });
  }
});

// ── PPM Demo Data — Delete ────────────────────────────────────────────────────
// DELETE /api/ppm/demo-data
// Full PPM wipe: removes ALL PPM records within the caller's allowed site(s),
// regardless of is_demo flag — this catches records created by older seeders
// that predated the is_demo column, enterprise site seeders, and ISO test runs.
// Contractor-company cleanup remains name-based (only known demo companies).
// FK-safe order: WO docs → work orders → schedules → assets → asset groups.
app.delete("/api/ppm/demo-data", requireAuth, async (req, res) => {
  if (!["admin", "manager"].includes(req.user!.role)) return res.status(403).json({ error: "Administrator access required" });
  try {
    const { db: custDb, siteContext } = await getScopedDb(req);
    await ensurePpmColumns(custDb, req.customerId!);

    // Helper — delete only demo rows within the caller's active site scope.
    // This protects real customer data: is_demo=false rows are never touched.
    const demoFilter = (table: { isDemo: any }) =>
      and(eq(table.isDemo, true), scopedWhere(siteContext, table as any) ?? sql`true`);

    // ── STEP 1: delete demo PPM data in FK-safe order ──────────────────────
    // Work order docs have no siteId / isDemo — collect demo WO ids first
    const demoWoRows = await custDb
      .select({ id: isolatedSchema.ppmWorkOrders.id })
      .from(isolatedSchema.ppmWorkOrders)
      .where(demoFilter(isolatedSchema.ppmWorkOrders));
    const demoWoIds = demoWoRows.map(w => w.id);

    let woDocCount = 0;
    if (demoWoIds.length > 0) {
      const deletedDocs = await custDb.delete(isolatedSchema.ppmWorkOrderDocuments)
        .where(inArray(isolatedSchema.ppmWorkOrderDocuments.workOrderId, demoWoIds))
        .returning({ id: isolatedSchema.ppmWorkOrderDocuments.id });
      woDocCount = deletedDocs.length;
    }

    const deletedWOs    = await custDb.delete(isolatedSchema.ppmWorkOrders).where(demoFilter(isolatedSchema.ppmWorkOrders)).returning({ id: isolatedSchema.ppmWorkOrders.id });
    const woCount       = deletedWOs.length;
    const deletedScheds = await custDb.delete(isolatedSchema.ppmSchedules).where(demoFilter(isolatedSchema.ppmSchedules)).returning({ id: isolatedSchema.ppmSchedules.id });
    const schedCount    = deletedScheds.length;
    const deletedAssets = await custDb.delete(isolatedSchema.ppmAssets).where(demoFilter(isolatedSchema.ppmAssets)).returning({ id: isolatedSchema.ppmAssets.id });
    const assetCount    = deletedAssets.length;
    const deletedGroups = await custDb.delete(isolatedSchema.ppmAssetGroups).where(demoFilter(isolatedSchema.ppmAssetGroups)).returning({ id: isolatedSchema.ppmAssetGroups.id });
    const groupCount    = deletedGroups.length;

    // ── STEP 2: delete demo contractor companies (and their workers) — is_demo=true only
    // A real customer's contractor with the same name (e.g. a genuine "Schindler UK")
    // has is_demo=false and is left completely untouched.
    let companiesDeleted = 0;
    for (const name of DEMO_COMPANY_NAMES_LIST) {
      const [existing] = await custDb
        .select({ id: isolatedSchema.contractorCompanies.id })
        .from(isolatedSchema.contractorCompanies)
        .where(and(
          eq(isolatedSchema.contractorCompanies.companyName, name),
          eq(isolatedSchema.contractorCompanies.isDemo, true),
        ))
        .limit(1);
      if (existing) {
        const cid = existing.id;

        // Collect worker IDs so we can delete worker-level children first
        const workers = await custDb
          .select({ id: isolatedSchema.contractorWorkers.id })
          .from(isolatedSchema.contractorWorkers)
          .where(eq(isolatedSchema.contractorWorkers.companyId, cid));
        const wids = workers.map(w => w.id);

        if (wids.length > 0) {
          // Worker children — delete before workers.
          // Must include every table with a notNull workerId FK to contractorWorkers,
          // otherwise the DELETE contractor_workers will fail with a FK violation.
          for (const table of [
            isolatedSchema.workerNotes,
            isolatedSchema.workerCompetencies,
            isolatedSchema.nvqQualifications,
            isolatedSchema.cardIssues,
            isolatedSchema.workerCertifications,
            isolatedSchema.workerDocumentAssignments,
            isolatedSchema.workerDocumentAcceptances,
            isolatedSchema.localLabourRecords,
            isolatedSchema.co2EmissionsData,
            isolatedSchema.contractorVisits,
          ] as any[]) {
            try {
              await custDb.delete(table).where(inArray(table.workerId, wids));
            } catch (_) { /* table may not have matching rows */ }
          }
          try {
            await custDb.delete(isolatedSchema.inductionTokens)
              .where(inArray(isolatedSchema.inductionTokens.workerId, wids));
          } catch (_) { /* ok */ }
          try {
            await custDb.delete(isolatedSchema.contractorSiteClearances)
              .where(inArray(isolatedSchema.contractorSiteClearances.workerId, wids));
          } catch (_) { /* ok */ }
          try {
            await custDb.delete(isolatedSchema.contractorDocuments)
              .where(inArray(isolatedSchema.contractorDocuments.workerId, wids));
          } catch (_) { /* ok */ }
        }

        // Delete workers
        await custDb.delete(isolatedSchema.contractorWorkers)
          .where(eq(isolatedSchema.contractorWorkers.companyId, cid));

        // Company children — delete before company
        for (const table of [
          isolatedSchema.companyNotes,
          isolatedSchema.co2Records,
          isolatedSchema.co2EmissionsData,
          isolatedSchema.co2MonthlySummaries,
          isolatedSchema.co2SustainabilityReports,
          isolatedSchema.enhancedCompanyDetails,
          isolatedSchema.localLabourRecords,
          isolatedSchema.ramsDocuments,
          isolatedSchema.contractorVisits,
        ] as any[]) {
          try {
            await custDb.delete(table).where(eq(table.companyId, cid));
          } catch (_) { /* table may not have matching rows */ }
        }
        try {
          await custDb.delete(isolatedSchema.contractorSiteClearances)
            .where(eq(isolatedSchema.contractorSiteClearances.companyId, cid));
        } catch (_) { /* ok */ }
        try {
          await custDb.delete(isolatedSchema.contractorDocuments)
            .where(eq(isolatedSchema.contractorDocuments.companyId, cid));
        } catch (_) { /* ok */ }
        try {
          await custDb.delete(isolatedSchema.cdmProjects)
            .where(eq(isolatedSchema.cdmProjects.companyId, cid));
        } catch (_) { /* ok */ }

        await custDb.delete(isolatedSchema.contractorCompanies)
          .where(eq(isolatedSchema.contractorCompanies.id, cid));
        companiesDeleted++;
      }
    }

    // ── STEP 3: delete demo templates by known name (templates have no is_demo column)
    const deletedTemplates = await custDb.delete(isolatedSchema.ppmTemplates)
      .where(inArray(isolatedSchema.ppmTemplates.name, DEMO_TEMPLATE_NAMES))
      .returning({ id: isolatedSchema.ppmTemplates.id });
    const templateCount = deletedTemplates.length;

    // ── POST-DELETE VERIFICATION — confirm zero DEMO rows remain in scope ─────────
    // Only counts is_demo=true rows so real customer data doesn't cause a false failure.
    const [{ remainingAssets }] = await custDb
      .select({ remainingAssets: count() }).from(isolatedSchema.ppmAssets)
      .where(demoFilter(isolatedSchema.ppmAssets));
    const [{ remainingWOs }] = await custDb
      .select({ remainingWOs: count() }).from(isolatedSchema.ppmWorkOrders)
      .where(demoFilter(isolatedSchema.ppmWorkOrders));
    const [{ remainingSchedules }] = await custDb
      .select({ remainingSchedules: count() }).from(isolatedSchema.ppmSchedules)
      .where(demoFilter(isolatedSchema.ppmSchedules));
    const [{ remainingGroups }] = await custDb
      .select({ remainingGroups: count() }).from(isolatedSchema.ppmAssetGroups)
      .where(demoFilter(isolatedSchema.ppmAssetGroups));

    const allClear =
      Number(remainingAssets) === 0 &&
      Number(remainingWOs) === 0 &&
      Number(remainingSchedules) === 0 &&
      Number(remainingGroups) === 0;

    if (!allClear) {
      logger.error(
        `❌ [PPM Demo] Post-delete verification FAILED — remaining: assets=${remainingAssets}, WOs=${remainingWOs}, schedules=${remainingSchedules}, groups=${remainingGroups}`,
      );
      return res.status(500).json({
        error: `Delete incomplete — ${remainingAssets} assets, ${remainingWOs} work orders, ${remainingSchedules} schedules, ${remainingGroups} groups still remain. Check server logs.`,
      });
    }

    logger.info(`✅ [PPM Demo] Demo wipe verified — deleted: assets=${assetCount}, WOs=${woCount}, schedules=${schedCount}, groups=${groupCount}, templates=${templateCount}, woDocs=${woDocCount}, companies=${companiesDeleted}`);
    await logPpmAudit(custDb, "demo_data_wiped", req.user!.username, {
      assetsDeleted: assetCount,
      workOrdersDeleted: woCount,
      schedulesDeleted: schedCount,
      groupsDeleted: groupCount,
      templatesDeleted: templateCount,
      companiesDeleted,
    });
    res.json({
      success: true,
      assetsDeleted: assetCount,
      workOrdersDeleted: woCount,
      schedulesDeleted: schedCount,
      groupsDeleted: groupCount,
      templatesDeleted: templateCount,
      companiesDeleted,
      verified: true,
      message: `Demo PPM data cleared — ${assetCount} assets, ${woCount} work orders, ${schedCount} schedules, ${groupCount} groups, ${templateCount} templates, ${companiesDeleted} contractor companies removed.`,
    });
  } catch (error: unknown) {
    if (error instanceof SiteContextError) return res.status(error.statusCode).json({ error: error.message });
    logger.error("DELETE /api/ppm/demo-data", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to delete demo data" });
  }
});

// ── PPM Annual Planner — Email Report ───────────────────────────────────────

// POST /api/ppm/annual-planner/email — send a formatted annual planner to an email address
app.post("/api/ppm/annual-planner/email", requireAuth, async (req, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  try {
    const { email, year, message } = req.body as { email?: string; year?: number; message?: string };
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "A valid recipient email address is required." });
    }
    const planYear = year ?? new Date().getFullYear();
    const { db: custDb, siteContext } = await getScopedDb(req);

    const assets = await custDb.select().from(isolatedSchema.ppmAssets)
      .where(scopedWhere(siteContext, isolatedSchema.ppmAssets))
      .orderBy(isolatedSchema.ppmAssets.name);
    const workOrders = await custDb.select().from(isolatedSchema.ppmWorkOrders)
      .where(scopedWhere(siteContext, isolatedSchema.ppmWorkOrders));
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
          ${escapeHtml(asset.name)}
          <div style="font-size:10px;color:#6b7280;font-weight:400;">${[asset.assetRef, asset.category].filter(Boolean).map(escapeHtml).join(" · ")}</div>
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
  ${message ? `<div style="padding:16px 28px;background:#fffbeb;border-top:1px solid #fde68a;font-size:13px;color:#92400e;">${escapeHtml(message).replace(/\n/g,"<br>")}</div>` : ""}
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

    const emailSvc = new EmailService(req.customerId!);
    const sent = await emailSvc.sendEmail({
      to: email,
      subject: `PPM Annual Planner ${planYear} — Maintenance Schedule Report`,
      html: htmlBody,
    });

    if (!sent) return res.status(500).json({ error: "Failed to send email. Check your email settings." });
    res.json({ success: true, message: `Annual Planner ${planYear} sent to ${email}.` });
  } catch (error: unknown) {
    logger.error("POST /api/ppm/annual-planner/email", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to send email" });
  }
});

// ── PPM Public Work Order (Contractor Mobile View) ──────────────────────────

// GET /api/ppm/work-order/public/:token — contractor fetches their work order
app.get("/api/ppm/work-order/public/:token", ppmPublicRateLimit, async (req, res) => {
  try {
    const { token } = req.params;
    if (!token || !/^[a-f0-9]{48}$/.test(token)) return res.status(400).json({ error: "Invalid token" });

    // Helper: resolve work order from a known customer (used by both cache-hit and scan paths)
    const resolveFromCustomer = async (customerId: string) => {
      const custDb = await customerDbService.getCustomerDatabase(customerId);
      // Ensure all schema columns exist before SELECT — covers standalone, enterprise-central
      // and enterprise-independent customers that haven't hit an authenticated PPM route yet.
      await ensurePpmColumns(custDb, customerId);
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
      // Resolve maintenance template for on-page specification panel
      let template: Record<string, unknown> | null = null;
      if (wo.scheduleId) {
        try {
          const [sched] = await custDb.select({ templateId: isolatedSchema.ppmSchedules.templateId })
            .from(isolatedSchema.ppmSchedules)
            .where(eq(isolatedSchema.ppmSchedules.id, wo.scheduleId));
          if (sched?.templateId) {
            const [tpl] = await custDb.select({
              name: isolatedSchema.ppmTemplates.name,
              description: isolatedSchema.ppmTemplates.description,
              type: isolatedSchema.ppmTemplates.type,
              regulationReference: isolatedSchema.ppmTemplates.regulationReference,
              estimatedHours: isolatedSchema.ppmTemplates.estimatedHours,
              frequency: isolatedSchema.ppmTemplates.frequency,
              checklist: isolatedSchema.ppmTemplates.checklist,
            }).from(isolatedSchema.ppmTemplates)
              .where(eq(isolatedSchema.ppmTemplates.id, sched.templateId));
            template = tpl ?? null;
          }
        } catch { /* non-fatal — template is supplementary */ }
      }
      return { workOrder: safeWo, documents: docs, asset, template };
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
    logger.error("GET /api/ppm/work-order/public/:token", error);
    res.status(500).json({ error: "Failed to fetch work order" });
  }
});

// PUT /api/ppm/work-order/public/:token — contractor updates status / completion notes
// Token is rotated on every write (rolling token semantics: original email link is single-use,
// subsequent operations use the nextToken returned in the response).
app.put("/api/ppm/work-order/public/:token", ppmPublicRateLimit, async (req, res) => {
  try {
    const { token } = req.params;
    if (!token || !/^[a-f0-9]{48}$/.test(token)) return res.status(400).json({ error: "Invalid token" });
    const { status, completionNotes } = req.body;
    const allowedStatuses = ["in_progress", "on_site", "completed"];
    if (status && !allowedStatuses.includes(status)) return res.status(400).json({ error: "Invalid status" });

    const performUpdate = async (customerId: string) => {
      const custDb = await customerDbService.getCustomerDatabase(customerId);
      const [wo] = await custDb.select().from(isolatedSchema.ppmWorkOrders)
        .where(eq(isolatedSchema.ppmWorkOrders.accessToken, token));
      if (!wo) return null;
      if (wo.accessTokenExpiresAt && new Date() > new Date(wo.accessTokenExpiresAt)) return { expired: true as const };
      // Certificate hard gate: block completion if a certificate is required but not yet uploaded.
      if (status === "completed" && wo.requiresCertificate && !wo.certificateUploadedAt) {
        return { certRequired: true as const };
      }
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
                // Don't resurrect a cancelled schedule — only reset status if it was active
                ...(schedule.status !== "cancelled" ? { status: "scheduled" } : {}),
                lastCompletedDate: new Date().toISOString().split("T")[0],
              })
              .where(eq(isolatedSchema.ppmSchedules.id, schedule.id));
            logger.info(`✅ [PPM Public] Schedule ${schedule.id} advanced: ${schedule.nextDueDate} → ${newDue}`);
          }
        } catch (schedErr) {
          logger.error("⚠️ [PPM Public] Failed to advance schedule after contractor completion:", schedErr);
        }
      }

      const { accessToken: _t, accessTokenExpiresAt: _e, ...safeUpdated } = updated;
      return { ...safeUpdated, nextToken };
    };

    const CERT_REQUIRED_BODY = { error: "This work order requires a service certificate. Please upload the certificate before marking it complete.", code: "CERTIFICATE_REQUIRED" };

    // Fast path: cache hit
    const cachedCustomerId = ppmTokenCacheGet(token);
    if (cachedCustomerId) {
      try {
        const result = await performUpdate(cachedCustomerId);
        if (result && "certRequired" in result) return res.status(400).json(CERT_REQUIRED_BODY);
        if (result && "expired" in result) return res.status(410).json({ error: "This work order link has expired. Please contact your administrator for a new link." });
        if (result && !("expired" in result)) return res.json(result);
        ppmTokenCacheEvict(token);
      } catch { /* fall through to full scan */ }
    }

    // Slow path: iterate all tenants
    const allCustomers = await customerDbService.getAllCustomers();
    for (const customer of allCustomers) {
      try {
        const result = await performUpdate(customer.id);
        if (!result) continue;
        if ("certRequired" in result) return res.status(400).json(CERT_REQUIRED_BODY);
        if ("expired" in result) return res.status(410).json({ error: "This work order link has expired. Please contact your administrator for a new link." });
        return res.json(result);
      } catch { /* skip */ }
    }
    res.status(404).json({ error: "Work order not found" });
  } catch (error: unknown) {
    logger.error("PUT /api/ppm/work-order/public/:token", error);
    res.status(500).json({ error: "Failed to update work order" });
  }
});

// POST /api/ppm/work-order/public/:token/arrive — contractor records on-site arrival
app.post("/api/ppm/work-order/public/:token/arrive", ppmPublicRateLimit, async (req, res) => {
  try {
    const { token } = req.params;
    if (!token || !/^[a-f0-9]{48}$/.test(token)) return res.status(400).json({ error: "Invalid token" });

    const performArrive = async (customerId: string) => {
      const custDb = await customerDbService.getCustomerDatabase(customerId);
      const [wo] = await custDb.select().from(isolatedSchema.ppmWorkOrders)
        .where(eq(isolatedSchema.ppmWorkOrders.accessToken, token));
      if (!wo) return null;
      if (wo.accessTokenExpiresAt && new Date() > new Date(wo.accessTokenExpiresAt)) return { expired: true as const };
      if (wo.arrivedAt) return { alreadyArrived: true as const, arrivedAt: wo.arrivedAt };

      const arrivedAt = new Date();
      const nextToken = randomBytes(24).toString("hex");
      const nextExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      const updates: Record<string, unknown> = {
        arrivedAt,
        accessToken: nextToken,
        accessTokenExpiresAt: nextExpiresAt,
      };
      if (wo.status === "scheduled" || wo.status === "overdue" || wo.status === "in_progress") {
        updates.status = "on_site";
      }
      await custDb.update(isolatedSchema.ppmWorkOrders)
        .set(updates)
        .where(eq(isolatedSchema.ppmWorkOrders.id, wo.id));
      ppmTokenCacheEvict(token);
      ppmTokenCacheSet(nextToken, customerId, nextExpiresAt);
      logger.info(`✅ [PPM Arrive] Work order ${wo.id} — contractor arrived at ${arrivedAt.toISOString()}`);
      return { arrivedAt, nextToken };
    };

    const cachedCustomerId = ppmTokenCacheGet(token);
    if (cachedCustomerId) {
      try {
        const result = await performArrive(cachedCustomerId);
        if (result && !("expired" in result) && !("alreadyArrived" in result)) return res.json(result);
        if (result && "expired" in result) return res.status(410).json({ error: "This work order link has expired." });
        if (result && "alreadyArrived" in result) return res.json(result);
        ppmTokenCacheEvict(token);
      } catch { /* fall through */ }
    }

    const allCustomers = await customerDbService.getAllCustomers();
    for (const customer of allCustomers) {
      try {
        const result = await performArrive(customer.id);
        if (!result) continue;
        if ("expired" in result) return res.status(410).json({ error: "This work order link has expired." });
        return res.json(result);
      } catch { /* skip */ }
    }
    res.status(404).json({ error: "Work order not found" });
  } catch (error: unknown) {
    logger.error("POST /api/ppm/work-order/public/:token/arrive", error);
    res.status(500).json({ error: "Failed to record arrival" });
  }
});

// POST /api/ppm/work-order/public/:token/files — atomic contractor file upload + document record creation
// Combines upload and document linking in a single request to prevent orphan objects.
// Also rotates the access token after successful upload (rolling token).
app.post("/api/ppm/work-order/public/:token/files", ppmPublicRateLimit, async (req, res) => {
  try {
    const { token } = req.params;
    if (!token || !/^[a-f0-9]{48}$/.test(token)) return res.status(400).json({ error: "Invalid token" });
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
          const fullPath = `${privateObjectDir}/${customer.id}/uploads/${objectId}`;
          const parts = fullPath.slice(1).split("/");
          const bucketName = parts[0];
          const objectName = parts.slice(1).join("/");
          const bucket = objectStorageClient.bucket(bucketName);
          const fileObj = bucket.file(objectName);
          await fileObj.save(buffer, { contentType: mimeType, resumable: false });
          const objectPath = `/objects/${customer.id}/uploads/${objectId}`;

          // Atomically create document record (scannedAt left null — AI scan fires async below)
          const resolvedFileType = fileType || "other";
          const [doc] = await custDb.insert(isolatedSchema.ppmWorkOrderDocuments)
            .values({ workOrderId: wo.id, fileName, fileUrl: objectPath, fileType: resolvedFileType, uploadedBy: "contractor" })
            .returning();

          // Audit: contractor uploaded a document via the public portal
          await logPpmAudit(custDb, "contractor_document_uploaded", "contractor", {
            workOrderId: wo.id,
          });

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
              logger.error("PPM async AI scan error:", scanErr);
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
    logger.error("POST /api/ppm/work-order/public/:token/files", error);
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
    logger.info("🔧 [PPM Cron] Running daily PPM alert check…");
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
              // Only alert if completed 2–90 days ago; anything older is not actionable
              if (daysDiff >= 2 && daysDiff <= 90) missingCertWOs.push(wo);
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
          logger.info(`✅ [PPM Cron] Marked ${overdueIds.length} work orders overdue for customer ${customer.id}`);
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
                    <p><strong>${escapeHtml(wo.title)}</strong>${wo.completedDate ? ` — completed ${escapeHtml(String(wo.completedDate))}` : ""}</p>
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
              <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-weight:500">${escapeHtml(wo.title)}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#dc2626">${escapeHtml(wo.dueDate ?? "—")}</td>
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
            logger.info(`📧 [PPM Cron] Missing-docs alert sent for ${missingDocsWOs.length} work order(s) (customer ${customer.id})`);
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
                  <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-weight:500">${escapeHtml(d.fileName)}</td>
                  <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6">${escapeHtml(woMap[d.workOrderId] ?? d.workOrderId)}</td>
                  <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:${isExp ? "#dc2626" : "#d97706"};font-weight:600">${escapeHtml(String(d.expiryDate ?? ""))}</td>
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
                logger.info(`📧 [PPM Cron] Document expiry alert sent for ${subjectCount} document(s) (customer ${customer.id})`);
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
          logger.info(`✅ [PPM Cron] Generated ${generatedCount} work orders from schedules for customer ${customer.id}`);
        }
      } catch (custErr) {
        logger.error(`[PPM Cron] Error processing customer ${customer.id}:`, custErr);
      }
    }
    logger.info("✅ [PPM Cron] Daily check complete");
  } catch (error: unknown) {
    logger.error("❌ [PPM Cron] Fatal error:", error);
  }
}, { timezone: "Europe/London" });
}
