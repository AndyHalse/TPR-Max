import type { Express } from 'express';
import { logger } from '../utils/logger';
import { requireAuth } from '../auth';
import { customerDbService } from '../customerDatabase';
import { db } from '../db';
import { eq, and, desc } from 'drizzle-orm';
import * as isolatedSchema from '../isolatedSchema';
import { getScopedDb, scopedWhere, SiteContextError, type SiteContext } from '../siteScope';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { ObjectStorageService, objectStorageClient } from '../objectStorage';
import {
  evacuations,
  ramsDocuments,
  ramsAcknowledgements,
  ramsAuditLog,
  insertRamsDocumentSchema,
  insertRamsAcknowledgementSchema,
} from '@shared/schema';

const objectStorage = new ObjectStorageService();

// Fix 5: memory storage + MIME whitelist (no disk writes)
const ALLOWED_EVIDENCE_MIMETYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
]);
const evidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    return cb(new Error('Unsupported file type'));
  },
});

// Fix 6: Zod validation schema for PUT /api/martyn-law body
const martynLawBodySchema = z.object({
  venueType: z.string().max(200).optional().nullable(),
  venueCapacity: z.number().int().min(0).optional().nullable(),
  isInScope: z.boolean().optional(),
  scopeNotes: z.string().optional().nullable(),
  supervisorName: z.string().max(200).optional().nullable(),
  supervisorRole: z.string().max(200).optional().nullable(),
  supervisorPhone: z.string().max(50).optional().nullable(),
  supervisorEmail: z.union([z.string().email(), z.literal(''), z.null()]).optional(),
  supervisorStaffId: z.string().optional().nullable(),
  siaProviderName: z.string().max(200).optional().nullable(),
  siaLicenseNumber: z.string().max(100).optional().nullable(),
  siaExpiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  actionPlan: z.string().optional().nullable(),
  evacuationProcedure: z.string().optional().nullable(),
  lockdownProcedure: z.string().optional().nullable(),
  communicationPlan: z.string().optional().nullable(),
  checklistItems: z.array(z.any()).optional().nullable(),
  evidenceLog: z.array(z.any()).optional().nullable(),
  lastReviewedBy: z.string().max(200).optional().nullable(),
  lastReviewerStaffId: z.string().optional().nullable(),
  recordReviewNow: z.boolean().optional(),
});

// ─── One-time startup: ensure customer_id column exists in shared RAMS tables ─
// The RAMS tables live in the public (shared) schema.  This migration is safe
// to call on every startup because ADD COLUMN IF NOT EXISTS is idempotent.

async function ensureRamsCustomerIdColumns() {
  try {
    await db.execute(`ALTER TABLE rams_documents        ADD COLUMN IF NOT EXISTS customer_id TEXT NOT NULL DEFAULT ''` as any);
    await db.execute(`ALTER TABLE rams_acknowledgements ADD COLUMN IF NOT EXISTS customer_id TEXT NOT NULL DEFAULT ''` as any);
    await db.execute(`ALTER TABLE rams_audit_log        ADD COLUMN IF NOT EXISTS customer_id TEXT NOT NULL DEFAULT ''` as any);
    // Enterprise multi-site isolation — nullable so old records remain accessible
    // from non-enterprise contexts; enterprise routes filter strictly by this column.
    await db.execute(`ALTER TABLE rams_documents ADD COLUMN IF NOT EXISTS site_id TEXT` as any);
    logger.info('✅ RAMS customer_id columns ensured in shared schema');
  } catch (err: any) {
    logger.error('❌ Failed to ensure RAMS customer_id columns:', err);
  }
}

// ─── Helper: build structured compliance requirements from live customer data ─

async function buildComplianceRequirements(customerId: string, custDb: any, siteContext: SiteContext) {
  const esc2 = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const [settingsRows, zoneRows, martynRows, staffRows, preBookingRows, incidentRows, drillEvacRows] = await Promise.all([
    custDb.select().from(isolatedSchema.companySettings).limit(1),
    custDb.select({ id: isolatedSchema.evacuationZones.id }).from(isolatedSchema.evacuationZones)
      .where(and(eq(isolatedSchema.evacuationZones.isActive, true), scopedWhere(siteContext, isolatedSchema.evacuationZones))).limit(1),
    custDb.select().from(isolatedSchema.martynLawConfig).where(eq(isolatedSchema.martynLawConfig.customerId, customerId)).limit(1),
    custDb.select({ id: isolatedSchema.staff.id }).from(isolatedSchema.staff)
      .where(and(eq(isolatedSchema.staff.isFireMarshal, true), eq(isolatedSchema.staff.isActive, true), scopedWhere(siteContext, isolatedSchema.staff))).limit(1),
    custDb.select({ id: isolatedSchema.preBookings.id }).from(isolatedSchema.preBookings)
      .where(scopedWhere(siteContext, isolatedSchema.preBookings)).limit(1),
    custDb.select({ id: isolatedSchema.incidentReports.id }).from(isolatedSchema.incidentReports)
      .where(and(eq(isolatedSchema.incidentReports.customerId, customerId), scopedWhere(siteContext, isolatedSchema.incidentReports))).limit(1),
    db.select({ evacuationId: evacuations.evacuationId }).from(evacuations).where(and(eq(evacuations.customerId, customerId), eq(evacuations.status, "completed"), eq(evacuations.isDrill, true))).limit(1),
  ]);

  const settings = settingsRows[0];
  const martynRow = martynRows[0] || null;

  const hasZones = zoneRows.length > 0;
  const hasFireMarshal = staffRows.length > 0;
  const hasPreBookings = preBookingRows.length > 0;
  const hasIncidentReports = incidentRows.length > 0;
  const hasDrills = drillEvacRows.length > 0;
  const hasEvacProcedure = !!(martynRow?.evacuationProcedure || martynRow?.actionPlan);
  const featureIncidentReports = settings?.featureIncidentReports !== false;
  const featureKiosk = settings?.featureKiosk === true;

  const requirements = [
    {
      id: "personnel-tracking",
      label: "Real-time personnel tracking",
      legalObligation: "Premises must be able to account for all individuals on-site during an emergency or evacuation.",
      tprFeature: "Visitor Management & Muster List",
      active: true,
      detail: "TPR Max tracks visitors, staff, and contractors in real time with live on-site lists and emergency muster functionality.",
    },
    {
      id: "evacuation-procedure",
      label: "Documented evacuation procedures",
      legalObligation: "A written evacuation procedure must be in place and communicated to all relevant staff.",
      tprFeature: "Martyn's Law Security Plan",
      active: hasEvacProcedure,
      detail: hasEvacProcedure
        ? "Evacuation procedures are documented in the Martyn's Law security plan."
        : "Add your evacuation procedure in the Martyn's Law section to complete this requirement.",
    },
    {
      id: "fire-marshal",
      label: "Fire marshal accountability",
      legalObligation: "Named, trained individuals must be responsible for accounting for personnel during an evacuation.",
      tprFeature: "Fire Marshal Static URLs",
      active: hasFireMarshal,
      detail: hasFireMarshal
        ? "One or more staff members are designated as Fire Marshals with permanent emergency access links."
        : "Designate at least one staff member as a Fire Marshal in Staff Management.",
    },
    {
      id: "zone-evacuation",
      label: "Zone-based evacuation management",
      legalObligation: "For larger venues, evacuation must be coordinated by area/zone to ensure systematic accountability.",
      tprFeature: "Zone-Based Evacuation",
      active: hasZones,
      detail: hasZones
        ? "Evacuation zones are configured and active for zone-by-zone personnel sweep."
        : "Configure evacuation zones in Settings → Zones to enable zone-based muster.",
    },
    {
      id: "drill-recording",
      label: "Evacuation drill recording",
      legalObligation: "Regular evacuation drills must be conducted and recorded as evidence of preparedness.",
      tprFeature: "Drill Mode & Incident Reports",
      active: hasDrills,
      detail: hasDrills
        ? "At least one completed fire drill has been recorded and an incident report is available."
        : "Run an evacuation drill using Drill Mode on the Muster page to satisfy this requirement.",
    },
    {
      id: "post-event-reporting",
      label: "Post-event incident reporting",
      legalObligation: "Records of evacuation events and drills must be retained for audit purposes.",
      tprFeature: "Incident Reports",
      active: featureIncidentReports && hasIncidentReports,
      detail: featureIncidentReports
        ? (hasIncidentReports ? "Incident reports feature is enabled and at least one report has been generated." : "Incident Reports are enabled. Complete an evacuation or drill to generate your first report.")
        : "Enable the Incident Reports feature in Settings to satisfy this requirement.",
    },
    {
      id: "visitor-preregistration",
      label: "Visitor pre-registration",
      legalObligation: "Venues should maintain advance knowledge of expected visitors to support rapid accountability.",
      tprFeature: "Pre-booking System",
      active: hasPreBookings || featureKiosk,
      detail: (hasPreBookings || featureKiosk)
        ? "Visitor pre-booking or kiosk self-check-in is available to capture visitor details in advance."
        : "Use the Pre-booking or Kiosk feature to pre-register expected visitors.",
    },
    {
      id: "audit-trail",
      label: "Audit trail and access records",
      legalObligation: "A record of all individuals who access the premises must be maintained and available for inspection.",
      tprFeature: "Visitor & Contractor Logs",
      active: true,
      detail: "TPR Max maintains a complete, tamper-evident log of all visitor, contractor, and staff access records.",
    },
  ];

  const companyName = settings?.companyName || "Your Organisation";
  const activeCount = requirements.filter(r => r.active).length;
  const totalCount = requirements.length;
  const compliancePercent = Math.round((activeCount / totalCount) * 100);

  return { requirements, companyName, activeCount, totalCount, compliancePercent, esc: esc2 };
}

// ─── Helper: write an audit log entry ────────────────────────────────────────

async function writeRamsAudit(
  ramsDocumentId: string,
  companyId: string | null,
  action: string,
  performedBy: string | null,
  performedByName: string,
  notes?: string,
  metadata?: object,
  customerId?: string,
) {
  try {
    await db.insert(ramsAuditLog).values({
      ramsDocumentId,
      customerId: customerId || "",
      companyId,
      action,
      performedBy,
      performedByName,
      notes: notes || null,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
  } catch (e) {
    logger.error("writeRamsAudit error:", e);
  }
}

// Helper: fetch a RAMS document and verify it belongs to the requesting customer.
// Returns the document on success, or sends a 401/404 and returns null.
async function getOwnedRamsDoc(id: string, customerId: string, res: any) {
  const [doc] = await db.select().from(ramsDocuments).where(eq(ramsDocuments.id, id));
  if (!doc || doc.customerId !== customerId) {
    res.status(404).json({ error: "RAMS document not found" });
    return null;
  }
  return doc;
}

// ─────────────────────────────────────────────────────────────────────────────

export function registerRamsRoutes(app: Express): void {

  // Ensure customer_id columns exist in the shared (public) RAMS tables.
  // This runs once per process start and is safe to call repeatedly.
  ensureRamsCustomerIdColumns();

  // =========================================
  // MARTYN'S LAW (UK PROTECT DUTY) ENDPOINTS
  // =========================================

  app.get("/api/martyn-law", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const custDb = await customerDbService.getCustomerDatabase(customerId);
      const rows = await custDb.select().from(isolatedSchema.martynLawConfig).where(eq(isolatedSchema.martynLawConfig.customerId, customerId)).limit(1);
      if (!rows.length) {
        return res.json(null);
      }
      const row = rows[0] as any;
      res.json({
        ...row,
        checklistItems: row.checklistItems ? JSON.parse(row.checklistItems) : null,
        evidenceLog: row.evidenceLog ? JSON.parse(row.evidenceLog) : null,
        auditLog: row.auditLog ? JSON.parse(row.auditLog) : [],
      });
    } catch (error: any) {
      logger.error("GET /api/martyn-law error:", error);
      res.status(500).json({ error: "Failed to load Martyn's Law config" });
    }
  });

  app.put("/api/martyn-law", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId!;

      // Fix 1: role check — only admin/manager may write
      if (!['admin', 'manager'].includes((req.user as any)?.role)) {
        return res.status(403).json({ error: 'Administrator or manager access required' });
      }

      // Fix 6: Zod payload validation
      const parsed = martynLawBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
      }
      const body = parsed.data;

      const custDb = await customerDbService.getCustomerDatabase(customerId);

      // Fix 4 + Fix 8: load existing row first (for diff AND to build audit log in memory)
      const existingRows = await custDb
        .select()
        .from(isolatedSchema.martynLawConfig)
        .where(eq(isolatedSchema.martynLawConfig.customerId, customerId))
        .limit(1);
      const existing = (existingRows[0] as any) || null;

      // Fix 4: build honest change summary
      const changes: string[] = [];
      if (existing) {
        if (body.venueType !== undefined && body.venueType !== existing.venueType) changes.push('Venue type');
        if (body.venueCapacity !== undefined && body.venueCapacity !== existing.venueCapacity) changes.push('Capacity');
        if (body.isInScope !== undefined && body.isInScope !== existing.isInScope) changes.push('In-scope status');
        if (body.supervisorName !== undefined && body.supervisorName !== existing.supervisorName) changes.push('Supervisor');
        if (body.siaProviderName !== undefined && body.siaProviderName !== existing.siaProviderName) changes.push('SIA provider');
        if (body.siaExpiryDate !== undefined) {
          const nD = body.siaExpiryDate ? new Date(body.siaExpiryDate).toDateString() : null;
          const oD = existing.siaExpiryDate ? new Date(existing.siaExpiryDate).toDateString() : null;
          if (nD !== oD) changes.push('SIA expiry');
        }
        if (body.actionPlan !== undefined && body.actionPlan !== existing.actionPlan) changes.push('Action plan');
        if (body.evacuationProcedure !== undefined && body.evacuationProcedure !== existing.evacuationProcedure) changes.push('Evacuation procedure');
        if (body.lockdownProcedure !== undefined && body.lockdownProcedure !== existing.lockdownProcedure) changes.push('Lockdown procedure');
        if (body.communicationPlan !== undefined && body.communicationPlan !== existing.communicationPlan) changes.push('Communication plan');
        if (body.checklistItems) {
          try {
            const oldChecked = (JSON.parse(existing.checklistItems || '[]') as any[]).filter((i: any) => i.completed).length;
            const newChecked = body.checklistItems.filter((i: any) => i.completed).length;
            if (newChecked !== oldChecked) changes.push(`Checklist (${newChecked > oldChecked ? '+' : ''}${newChecked - oldChecked})`);
          } catch { /* ignore */ }
        }
        if (body.evidenceLog) {
          try {
            const oldCount = (JSON.parse(existing.evidenceLog || '[]') as any[]).length;
            const newCount = body.evidenceLog.length;
            if (newCount !== oldCount) changes.push(`Evidence (${newCount > oldCount ? '+' : ''}${newCount - oldCount})`);
          } catch { /* ignore */ }
        }
        if (body.recordReviewNow && body.lastReviewedBy) changes.push('Annual review recorded');
      }

      // Fix 8: build audit log in-memory, include in single UPDATE (no separate read-then-write)
      const userName = (req.user as any)?.username || (req.user as any)?.name || 'Unknown user';
      const actionText = changes.length > 0 ? `Updated: ${changes.join(', ')}` : 'Record saved';
      const newAuditEntry = { timestamp: new Date().toISOString(), action: actionText, userName };
      const existingAuditLog: any[] = (() => {
        try { return JSON.parse(existing?.auditLog || '[]'); } catch { return []; }
      })();
      existingAuditLog.push(newAuditEntry);
      const trimmedAuditLog = existingAuditLog.slice(-200);

      const updateData: any = {
        venueType: body.venueType ?? null,
        venueCapacity: body.venueCapacity ?? null,
        isInScope: body.isInScope ?? false,
        scopeNotes: body.scopeNotes ?? null,
        supervisorName: body.supervisorName ?? null,
        supervisorRole: body.supervisorRole ?? null,
        supervisorPhone: body.supervisorPhone ?? null,
        supervisorEmail: body.supervisorEmail || null,
        supervisorStaffId: body.supervisorStaffId ?? null,
        siaProviderName: body.siaProviderName ?? null,
        siaLicenseNumber: body.siaLicenseNumber ?? null,
        siaExpiryDate: body.siaExpiryDate ? new Date(body.siaExpiryDate) : null,
        actionPlan: body.actionPlan ?? null,
        evacuationProcedure: body.evacuationProcedure ?? null,
        lockdownProcedure: body.lockdownProcedure ?? null,
        communicationPlan: body.communicationPlan ?? null,
        checklistItems: body.checklistItems ? JSON.stringify(body.checklistItems) : null,
        evidenceLog: body.evidenceLog ? JSON.stringify(body.evidenceLog) : null,
        lastReviewedAt: (body.recordReviewNow && body.lastReviewedBy) ? new Date() : undefined,
        lastReviewedBy: body.lastReviewedBy ?? null,
        lastReviewerStaffId: body.lastReviewerStaffId ?? null,
        auditLog: JSON.stringify(trimmedAuditLog),
        updatedAt: new Date(),
      };

      let result: any;
      if (existing) {
        const updated = await custDb.update(isolatedSchema.martynLawConfig)
          .set(updateData)
          .where(eq(isolatedSchema.martynLawConfig.customerId, customerId))
          .returning();
        result = updated[0];
      } else {
        const inserted = await custDb.insert(isolatedSchema.martynLawConfig)
          .values({ ...updateData, customerId })
          .returning();
        result = inserted[0];
      }

      res.json({
        ...result,
        checklistItems: result.checklistItems ? JSON.parse(result.checklistItems) : null,
        evidenceLog: result.evidenceLog ? JSON.parse(result.evidenceLog) : null,
        auditLog: result.auditLog ? JSON.parse(result.auditLog) : [],
      });
    } catch (error: any) {
      logger.error("PUT /api/martyn-law error:", error);
      res.status(500).json({ error: "Failed to save Martyn's Law config" });
    }
  });

  // ============================================================
  // MARTYN'S LAW EVIDENCE DOCUMENT UPLOAD
  // ============================================================

  // Fix 1 + 2 + 5: role-gated, object-storage, MIME-validated evidence upload
  app.post("/api/martyn-law/evidence/upload", requireAuth, evidenceUpload.single("file"), async (req: any, res) => {
    try {
      // Fix 1: role check
      if (!['admin', 'manager'].includes((req.user as any)?.role)) {
        return res.status(403).json({ error: 'Administrator or manager access required' });
      }
      if (!req.file) return res.status(400).json({ error: "No file provided" });

      // Fix 5: server-side MIME check
      if (!ALLOWED_EVIDENCE_MIMETYPES.has(req.file.mimetype)) {
        return res.status(400).json({ error: 'File type not allowed. Accepted: PDF, Word, Excel, JPEG, PNG.' });
      }

      // Fix 2: save to object storage (not local disk)
      const customerId = req.customerId!;
      const objectId = randomUUID();
      const privateDir = objectStorage.getPrivateObjectDir();
      const fullPath = `${privateDir}/${customerId}/martyn-law/${objectId}`;
      const parts = fullPath.slice(1).split('/');
      await objectStorageClient.bucket(parts[0]).file(parts.slice(1).join('/')).save(req.file.buffer, {
        contentType: req.file.mimetype,
        resumable: false,
      });

      // Fix 3: customer-scoped URL — /objects route already enforces customerId matches session
      res.json({ url: `/objects/${customerId}/martyn-law/${objectId}`, name: req.file.originalname });
    } catch (error: any) {
      logger.error("POST /api/martyn-law/evidence/upload error:", error);
      res.status(500).json({ error: "Upload failed" });
    }
  });

  // ============================================================
  // MARTYN'S LAW COMPLIANCE REPORT ENDPOINTS
  // ============================================================

  app.get("/api/compliance/summary", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const { db: custDb, siteContext } = await getScopedDb(req);
      const { requirements, companyName, activeCount, totalCount, compliancePercent } = await buildComplianceRequirements(customerId, custDb, siteContext);

      res.json({
        companyName,
        compliancePercent,
        activeCount,
        totalCount,
        requirements: requirements.map(r => ({
          id: r.id,
          label: r.label,
          legalObligation: r.legalObligation,
          tprFeature: r.tprFeature,
          active: r.active,
          detail: r.detail,
        })),
      });
    } catch (error: any) {
      logger.error("GET /api/compliance/summary error:", error);
      res.status(500).json({ error: "Failed to fetch compliance summary" });
    }
  });

  app.get("/api/compliance/report", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const { db: custDb, siteContext } = await getScopedDb(req);
      const { requirements, companyName, activeCount, totalCount, compliancePercent, esc } = await buildComplianceRequirements(customerId, custDb, siteContext);

      const complianceColor = compliancePercent >= 80 ? "#16a34a" : compliancePercent >= 50 ? "#d97706" : "#dc2626";
      const complianceBg = compliancePercent >= 80 ? "#dcfce7" : compliancePercent >= 50 ? "#fef3c7" : "#fee2e2";
      const dateStr = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

      const requirementRows = requirements.map(r => `
        <tr>
          <td style="padding:10px 12px; border-bottom:1px solid #e5e7eb; vertical-align:top;">
            <div style="font-weight:600; font-size:13px; margin-bottom:2px;">${esc(r.label)}</div>
            <div style="font-size:11px; color:#6b7280; margin-bottom:4px;">${esc(r.legalObligation)}</div>
            <div style="font-size:11px; color:#3b82f6;">TPR Max: ${esc(r.tprFeature)}</div>
          </td>
          <td style="padding:10px 12px; border-bottom:1px solid #e5e7eb; text-align:center; vertical-align:middle; white-space:nowrap;">
            ${r.active
              ? '<span style="display:inline-flex;align-items:center;gap:4px;background:#dcfce7;color:#16a34a;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;">&#10003; Enabled</span>'
              : '<span style="display:inline-flex;align-items:center;gap:4px;background:#fef3c7;color:#d97706;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;">&#8869; Action needed</span>'
            }
          </td>
        </tr>
        ${!r.active ? `<tr><td colspan="2" style="padding:4px 12px 10px 12px; border-bottom:1px solid #e5e7eb; font-size:11px; color:#6b7280; font-style:italic;">${esc(r.detail)}</td></tr>` : ""}
      `).join("");

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Martyn's Law Compliance Summary — ${esc(companyName)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 28px; color: #1e293b; font-size: 14px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 24px 0 8px; color: #1e293b; border-bottom: 2px solid #e5e7eb; padding-bottom: 5px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f1f5f9; text-align: left; padding: 8px 12px; font-size: 12px; color: #64748b; border-bottom: 2px solid #e5e7eb; }
  @media print { body { padding: 14px; } }
</style>
</head>
<body>
<div style="display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:20px;">
  <div>
    <h1>Martyn's Law Compliance Summary</h1>
    <div style="font-size:13px; color:#64748b;">Terrorism (Protection of Premises) Act 2025 — UK Protect Duty</div>
    <div style="font-size:13px; color:#374151; margin-top:2px; font-weight:600;">${esc(companyName)}</div>
  </div>
  <div style="text-align:right; font-size:11px; color:#9ca3af;">
    Generated: ${dateStr}<br>
    TPR Max Visitor Management
  </div>
</div>

<div style="background:${complianceBg}; border:1px solid ${complianceColor}; border-radius:8px; padding:16px 24px; display:flex; align-items:center; gap:24px; margin-bottom:24px;">
  <div style="font-size:48px; font-weight:bold; color:${complianceColor}; line-height:1;">${compliancePercent}%</div>
  <div>
    <div style="font-weight:600; font-size:16px; color:#1e293b;">Overall Compliance Score</div>
    <div style="font-size:13px; color:#6b7280; margin-bottom:6px;">${activeCount} of ${totalCount} requirements met</div>
    <div style="background:#e5e7eb; height:10px; border-radius:5px; overflow:hidden; width:240px;">
      <div style="background:${complianceColor}; height:100%; border-radius:5px; width:${compliancePercent}%;"></div>
    </div>
  </div>
</div>

<h2>Compliance Requirements</h2>
<table>
  <thead>
    <tr>
      <th style="width:76%;">Requirement</th>
      <th style="width:24%; text-align:center;">Status</th>
    </tr>
  </thead>
  <tbody>${requirementRows}</tbody>
</table>

<div style="margin-top:32px; padding-top:16px; border-top:1px solid #e5e7eb; font-size:11px; color:#9ca3af;">
  <p style="margin:0 0 4px;">This compliance summary was generated by TPR Max Visitor Management for <strong>${esc(companyName)}</strong> on ${dateStr}.</p>
  <p style="margin:0;">This document does not constitute legal advice or certification. For guidance, refer to the UK Home Office Martyn's Law factsheet at <strong>gov.uk/government/publications/martyns-law</strong>.</p>
</div>
</body>
</html>`;

      // Server-side PDF using Puppeteer (with HTML fallback, same pattern as incident reports)
      try {
        let puppeteer: any;
        try {
          puppeteer = await import('puppeteer');
        } catch {
          throw new Error('puppeteer_unavailable');
        }
        const browser = await puppeteer.default.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        try {
          const page = await browser.newPage();
          await page.setContent(html, { waitUntil: 'networkidle0' });
          const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' }
          });
          await browser.close();
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="martyn-law-compliance-${new Date().toISOString().slice(0,10)}.pdf"`);
          return res.send(Buffer.from(pdfBuffer));
        } catch (pdfErr) {
          await browser.close();
          throw pdfErr;
        }
      } catch (pdfGenerationErr) {
        logger.warn('[compliance-report] PDF unavailable, falling back to HTML:', (pdfGenerationErr as Error).message);
        const printHtml = html.replace('</body>', '<script>window.onload=function(){window.print();}</script></body>');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Disposition', `inline; filename="martyn-law-compliance-${new Date().toISOString().slice(0,10)}.html"`);
        return res.send(printHtml);
      }
    } catch (error: any) {
      logger.error("GET /api/compliance/report error:", error);
      res.status(500).json({ error: "Failed to generate compliance report" });
    }
  });

  // ============================================================
  // RAMS MANAGEMENT ROUTES
  // ============================================================

  // GET /api/rams — list all RAMS documents (optionally filter by companyId or status)
  //
  // Enterprise multi-site isolation:
  //   When the session has an active site (is_enterprise customer), the query is
  //   further restricted to records whose site_id matches that active site.
  //   Documents created before site isolation was introduced (site_id IS NULL)
  //   are hidden in the enterprise context — fail-closed is the safe default.
  app.get("/api/rams", requireAuth, async (req, res) => {
    try {
      const customerId = (req as any).customerId as string | undefined;
      if (!customerId) return res.status(401).json({ error: "Unauthorized" });

      const { companyId, status } = req.query as Record<string, string>;

      // Resolve site context for enterprise isolation (SiteContextError = non-enterprise or no active site)
      let activeSiteId: string | null = null;
      try {
        const { siteId, siteContext } = await getScopedDb(req);
        if (siteContext.isEnterprise && siteId) activeSiteId = siteId;
      } catch {
        // Non-enterprise or no active site — no site filter applied
      }

      const conditions: any[] = [
        eq(ramsDocuments.customerId, customerId),
        eq(ramsDocuments.isActive, true),
      ];
      if (companyId) conditions.push(eq(ramsDocuments.companyId, companyId));
      if (status) conditions.push(eq(ramsDocuments.status, status));
      // PROVE-IT-BITES TARGET: removing this line makes the RAMS isolation test go RED.
      if (activeSiteId) conditions.push(eq(ramsDocuments.siteId, activeSiteId));

      const docs = await db.select().from(ramsDocuments)
        .where(and(...conditions))
        .orderBy(desc(ramsDocuments.uploadedAt));

      const enriched = await Promise.all(docs.map(async (doc) => {
        const acks = await db.select().from(ramsAcknowledgements)
          .where(and(
            eq(ramsAcknowledgements.ramsDocumentId, doc.id),
            eq(ramsAcknowledgements.customerId, customerId),
          ));
        return { ...doc, acknowledgementCount: acks.length };
      }));

      res.json(enriched);
    } catch (err: any) {
      logger.error("GET /api/rams error:", err);
      res.status(500).json({ error: "Failed to fetch RAMS documents" });
    }
  });

  // POST /api/rams — upload a new RAMS document
  //
  // Enterprise multi-site isolation:
  //   The active site from the session is stamped onto each new RAMS document so
  //   that the GET filter above can correctly scope it to the creating site.
  app.post("/api/rams", requireAuth, async (req, res) => {
    try {
      const customerId = (req as any).customerId as string | undefined;
      if (!customerId) return res.status(401).json({ error: "Unauthorized" });

      const { userId, name: userName } = (req as any).user;
      const parsed = insertRamsDocumentSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid RAMS data", details: parsed.error.flatten() });

      // Stamp the active site so the GET filter can scope the document correctly
      let ramsSiteId: string | null = null;
      try {
        const { siteId, siteContext } = await getScopedDb(req);
        if (siteContext.isEnterprise && siteId) ramsSiteId = siteId;
      } catch {
        // Non-enterprise — leave siteId null
      }

      const [created] = await db.insert(ramsDocuments).values({
        ...parsed.data,
        customerId,
        uploadedBy: userId,
        status: "pending_review",
        siteId: ramsSiteId ?? undefined,
      }).returning();

      await writeRamsAudit(created.id, created.companyId || null, "uploaded", userId, userName || "System",
        `RAMS document '${created.documentName}' v${created.version} uploaded`, undefined, customerId);

      res.status(201).json(created);
    } catch (err: any) {
      logger.error("POST /api/rams error:", err);
      res.status(500).json({ error: "Failed to create RAMS document" });
    }
  });

  // PUT /api/rams/:id — update a RAMS document (metadata only; use /new-version to upload a new file)
  app.put("/api/rams/:id", requireAuth, async (req, res) => {
    try {
      const customerId = (req as any).customerId as string | undefined;
      if (!customerId) return res.status(401).json({ error: "Unauthorized" });

      const { userId, name: userName } = (req as any).user;
      const { id } = req.params;
      const existing = await getOwnedRamsDoc(id, customerId, res);
      if (!existing) return;

      const allowed = ["documentName", "jobDescription", "siteLocation", "workCategory", "expiryDate", "alertDaysBefore", "requiredBeforeAccess", "reviewNotes"];
      const updates: Record<string, any> = {};
      allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

      const [updated] = await db.update(ramsDocuments).set(updates).where(eq(ramsDocuments.id, id)).returning();
      await writeRamsAudit(id, existing.companyId || null, "updated", userId, userName || "System", `Metadata updated`, undefined, customerId);
      res.json(updated);
    } catch (err: any) {
      logger.error("PUT /api/rams/:id error:", err);
      res.status(500).json({ error: "Failed to update RAMS document" });
    }
  });

  // POST /api/rams/:id/approve — approve a RAMS document
  app.post("/api/rams/:id/approve", requireAuth, async (req, res) => {
    try {
      const customerId = (req as any).customerId as string | undefined;
      if (!customerId) return res.status(401).json({ error: "Unauthorized" });

      const { userId, name: userName } = (req as any).user;
      const { id } = req.params;
      const { notes } = req.body;
      const existing = await getOwnedRamsDoc(id, customerId, res);
      if (!existing) return;

      const [updated] = await db.update(ramsDocuments).set({
        status: "approved",
        approvedBy: userId,
        approvedAt: new Date(),
        reviewedBy: userId,
        reviewedAt: new Date(),
        reviewNotes: notes || null,
        rejectionReason: null,
      }).where(eq(ramsDocuments.id, id)).returning();

      await writeRamsAudit(id, existing.companyId || null, "approved", userId, userName || "System",
        notes || "RAMS document approved for site access", { previousStatus: existing.status }, customerId);

      res.json(updated);
    } catch (err: any) {
      logger.error("POST /api/rams/:id/approve error:", err);
      res.status(500).json({ error: "Failed to approve RAMS document" });
    }
  });

  // POST /api/rams/:id/reject — reject a RAMS document
  app.post("/api/rams/:id/reject", requireAuth, async (req, res) => {
    try {
      const customerId = (req as any).customerId as string | undefined;
      if (!customerId) return res.status(401).json({ error: "Unauthorized" });

      const { userId, name: userName } = (req as any).user;
      const { id } = req.params;
      const { reason } = req.body;
      if (!reason) return res.status(400).json({ error: "Rejection reason is required" });

      const existing = await getOwnedRamsDoc(id, customerId, res);
      if (!existing) return;

      const [updated] = await db.update(ramsDocuments).set({
        status: "rejected",
        reviewedBy: userId,
        reviewedAt: new Date(),
        rejectionReason: reason,
      }).where(eq(ramsDocuments.id, id)).returning();

      await writeRamsAudit(id, existing.companyId || null, "rejected", userId, userName || "System",
        reason, { previousStatus: existing.status }, customerId);

      res.json(updated);
    } catch (err: any) {
      logger.error("POST /api/rams/:id/reject error:", err);
      res.status(500).json({ error: "Failed to reject RAMS document" });
    }
  });

  // POST /api/rams/:id/new-version — upload a new version (supersedes current)
  app.post("/api/rams/:id/new-version", requireAuth, async (req, res) => {
    try {
      const customerId = (req as any).customerId as string | undefined;
      if (!customerId) return res.status(401).json({ error: "Unauthorized" });

      const { userId, name: userName } = (req as any).user;
      const { id } = req.params;
      const existing = await getOwnedRamsDoc(id, customerId, res);
      if (!existing) return;

      await db.update(ramsDocuments).set({ isActive: false }).where(eq(ramsDocuments.id, id));

      const [created] = await db.insert(ramsDocuments).values({
        customerId,
        companyId: existing.companyId,
        departmentId: existing.departmentId,
        ramsIdRef: existing.ramsIdRef,
        documentName: req.body.documentName || existing.documentName,
        documentUrl: req.body.documentUrl || existing.documentUrl,
        expiryDate: req.body.expiryDate ? new Date(req.body.expiryDate) : existing.expiryDate,
        status: "pending_review",
        uploadedBy: userId,
        version: (existing.version || 1) + 1,
        previousVersionId: id,
        jobDescription: req.body.jobDescription || existing.jobDescription,
        siteLocation: req.body.siteLocation || existing.siteLocation,
        workCategory: req.body.workCategory || existing.workCategory,
        requiredBeforeAccess: existing.requiredBeforeAccess,
        alertDaysBefore: existing.alertDaysBefore,
      }).returning();

      await writeRamsAudit(created.id, created.companyId || null, "new_version", userId, userName || "System",
        `New version v${created.version} created, superseding v${existing.version}`, { previousVersionId: id }, customerId);

      res.status(201).json(created);
    } catch (err: any) {
      logger.error("POST /api/rams/:id/new-version error:", err);
      res.status(500).json({ error: "Failed to create new RAMS version" });
    }
  });

  // DELETE /api/rams/:id — soft-delete (archive) a RAMS document
  app.delete("/api/rams/:id", requireAuth, async (req, res) => {
    try {
      const customerId = (req as any).customerId as string | undefined;
      if (!customerId) return res.status(401).json({ error: "Unauthorized" });

      const { userId, name: userName } = (req as any).user;
      const { id } = req.params;
      const existing = await getOwnedRamsDoc(id, customerId, res);
      if (!existing) return;

      await db.update(ramsDocuments).set({ isActive: false }).where(eq(ramsDocuments.id, id));
      await writeRamsAudit(id, existing.companyId || null, "archived", userId, userName || "System", "Document archived", undefined, customerId);

      res.json({ success: true });
    } catch (err: any) {
      logger.error("DELETE /api/rams/:id error:", err);
      res.status(500).json({ error: "Failed to archive RAMS document" });
    }
  });

  // GET /api/rams/:id/acknowledgements — list worker acknowledgements for a RAMS document
  app.get("/api/rams/:id/acknowledgements", requireAuth, async (req, res) => {
    try {
      const customerId = (req as any).customerId as string | undefined;
      if (!customerId) return res.status(401).json({ error: "Unauthorized" });

      const { id } = req.params;
      const doc = await getOwnedRamsDoc(id, customerId, res);
      if (!doc) return;

      const acks = await db.select().from(ramsAcknowledgements)
        .where(and(
          eq(ramsAcknowledgements.ramsDocumentId, id),
          eq(ramsAcknowledgements.customerId, customerId),
        ))
        .orderBy(desc(ramsAcknowledgements.acknowledgedAt));
      res.json(acks);
    } catch (err: any) {
      logger.error("GET /api/rams/:id/acknowledgements error:", err);
      res.status(500).json({ error: "Failed to fetch acknowledgements" });
    }
  });

  // POST /api/rams/:id/acknowledge — worker digitally acknowledges a RAMS document
  app.post("/api/rams/:id/acknowledge", requireAuth, async (req, res) => {
    try {
      const customerId = (req as any).customerId as string | undefined;
      if (!customerId) return res.status(401).json({ error: "Unauthorized" });

      const { userId, name: userName } = (req as any).user;
      const { id } = req.params;
      const { workerId, method, signatureData } = req.body;
      if (!workerId) return res.status(400).json({ error: "workerId is required" });

      const existing = await getOwnedRamsDoc(id, customerId, res);
      if (!existing) return;

      const [alreadyAcked] = await db.select().from(ramsAcknowledgements)
        .where(and(
          eq(ramsAcknowledgements.ramsDocumentId, id),
          eq(ramsAcknowledgements.workerId, workerId),
          eq(ramsAcknowledgements.customerId, customerId),
        ));
      if (alreadyAcked) return res.status(409).json({ error: "Worker has already acknowledged this RAMS document", acknowledgement: alreadyAcked });

      const [ack] = await db.insert(ramsAcknowledgements).values({
        customerId,
        ramsDocumentId: id,
        workerId,
        companyId: existing.companyId || null,
        method: method || "digital",
        ipAddress: req.ip || null,
        deviceInfo: req.headers["user-agent"] || null,
        signatureData: signatureData || null,
      }).returning();

      await writeRamsAudit(id, existing.companyId || null, "acknowledged", workerId, userName || "Worker",
        `Worker acknowledged RAMS document`, { workerId, method: method || "digital" }, customerId);

      res.status(201).json(ack);
    } catch (err: any) {
      logger.error("POST /api/rams/:id/acknowledge error:", err);
      res.status(500).json({ error: "Failed to record acknowledgement" });
    }
  });

  // GET /api/rams/:id/audit — full audit trail for a RAMS document
  app.get("/api/rams/:id/audit", requireAuth, async (req, res) => {
    try {
      const customerId = (req as any).customerId as string | undefined;
      if (!customerId) return res.status(401).json({ error: "Unauthorized" });

      const { id } = req.params;
      const doc = await getOwnedRamsDoc(id, customerId, res);
      if (!doc) return;

      const logs = await db.select().from(ramsAuditLog)
        .where(and(
          eq(ramsAuditLog.ramsDocumentId, id),
          eq(ramsAuditLog.customerId, customerId),
        ))
        .orderBy(desc(ramsAuditLog.performedAt));
      res.json(logs);
    } catch (err: any) {
      logger.error("GET /api/rams/:id/audit error:", err);
      res.status(500).json({ error: "Failed to fetch audit log" });
    }
  });

  // GET /api/rams/:id — single RAMS document with full detail
  app.get("/api/rams/:id", requireAuth, async (req, res) => {
    try {
      const customerId = (req as any).customerId as string | undefined;
      if (!customerId) return res.status(401).json({ error: "Unauthorized" });

      const { id } = req.params;
      const doc = await getOwnedRamsDoc(id, customerId, res);
      if (!doc) return;

      const [acks, audit, versions] = await Promise.all([
        db.select().from(ramsAcknowledgements)
          .where(and(
            eq(ramsAcknowledgements.ramsDocumentId, id),
            eq(ramsAcknowledgements.customerId, customerId),
          ))
          .orderBy(desc(ramsAcknowledgements.acknowledgedAt)),
        db.select().from(ramsAuditLog)
          .where(and(
            eq(ramsAuditLog.ramsDocumentId, id),
            eq(ramsAuditLog.customerId, customerId),
          ))
          .orderBy(desc(ramsAuditLog.performedAt)).limit(50),
        doc.previousVersionId
          ? db.select().from(ramsDocuments)
              .where(and(
                eq(ramsDocuments.id, doc.previousVersionId),
                eq(ramsDocuments.customerId, customerId),
              ))
          : Promise.resolve([]),
      ]);

      res.json({ ...doc, acknowledgements: acks, auditLog: audit, previousVersion: versions[0] || null });
    } catch (err: any) {
      logger.error("GET /api/rams/:id error:", err);
      res.status(500).json({ error: "Failed to fetch RAMS document" });
    }
  });

}
