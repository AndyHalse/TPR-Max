/**
 * Enterprise Contractor Pool — Phase 4b
 * ======================================
 * Shared contractor pool for enterprise multi-site customers.
 * A contractor company / worker onboarded once is visible estate-wide;
 * site-level clearance (induction) is tracked per-site in
 * contractor_site_clearances.
 *
 * All routes require an enterprise role (enterprise_admin or area_manager).
 */

import type { Application } from 'express';
import { eq, and, inArray, isNull } from 'drizzle-orm';
import * as isolatedSchema from '../isolatedSchema';
import { customerDbService } from '../customerDatabase';
import { requireAuth } from '../auth';
import { requireEnterpriseRole } from '../enterpriseRoles';
import { getScopedDb, SiteContextError } from '../siteScope';
import { logger } from '../utils/logger';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Summarise company document status (mirrors databaseService helper). */
function docStatus(
  docs: Array<{ documentType: string; status: string; expiryDate: Date | null; isActive: boolean }>,
  docType: string,
): string {
  const doc = docs.find(d => d.documentType === docType && d.isActive);
  if (!doc) return 'missing';
  if (doc.expiryDate) {
    const now = new Date();
    const expiry = new Date(doc.expiryDate);
    const days = Math.ceil((expiry.getTime() - now.getTime()) / 86_400_000);
    if (expiry < now) return 'expired';
    if (days <= 30) return 'expiring';
  }
  return doc.status || 'pending';
}

// ─── route registration ──────────────────────────────────────────────────────

export function registerEnterpriseContractorPoolRoutes(app: Application) {

  // ── GET /api/enterprise/contractor-pool ─────────────────────────────────
  // Estate-wide list of contractor companies with compliance summary and
  // per-site clearance counts for each site in the estate.
  app.get(
    '/api/enterprise/contractor-pool',
    requireAuth,
    requireEnterpriseRole('enterprise_admin', 'area_manager'),
    async (req, res) => {
      try {
        const db = await customerDbService.getCustomerDatabase(req.customerId!);

        const companies = await db
          .select()
          .from(isolatedSchema.contractorCompanies)
          .where(eq(isolatedSchema.contractorCompanies.isActive, true));

        if (companies.length === 0) return res.json([]);

        const companyIds = companies.map(c => c.id);

        // Worker counts
        const workerCounts = await db
          .select({ companyId: isolatedSchema.contractorWorkers.companyId, count: isolatedSchema.contractorWorkers.id })
          .from(isolatedSchema.contractorWorkers)
          .where(and(
            inArray(isolatedSchema.contractorWorkers.companyId, companyIds),
            eq(isolatedSchema.contractorWorkers.isActive, true),
          ));

        const countMap = new Map<string, number>();
        for (const r of workerCounts) {
          countMap.set(r.companyId, (countMap.get(r.companyId) ?? 0) + 1);
        }

        // Company-level documents
        const allDocs = await db
          .select()
          .from(isolatedSchema.contractorDocuments)
          .where(and(
            inArray(isolatedSchema.contractorDocuments.companyId, companyIds),
            isNull(isolatedSchema.contractorDocuments.workerId),
          ));

        const docsByCompany = new Map<string, typeof allDocs>();
        for (const d of allDocs) {
          const list = docsByCompany.get(d.companyId) ?? [];
          list.push(d);
          docsByCompany.set(d.companyId, list);
        }

        // Clearance counts — how many workers at each company are inducted at any site
        const clearances = await db
          .select()
          .from(isolatedSchema.contractorSiteClearances)
          .where(and(
            inArray(isolatedSchema.contractorSiteClearances.companyId, companyIds),
            eq(isolatedSchema.contractorSiteClearances.status, 'inducted'),
          ));

        const clearedWorkersByCompany = new Map<string, Set<string>>();
        const clearedSitesByCompany = new Map<string, Set<string>>();
        const clearancesBySite = new Map<string, Map<string, string>>(); // siteId → workerId → status
        for (const c of clearances) {
          const s = clearedWorkersByCompany.get(c.companyId) ?? new Set();
          s.add(c.workerId);
          clearedWorkersByCompany.set(c.companyId, s);

          const ss = clearedSitesByCompany.get(c.companyId) ?? new Set();
          ss.add(c.siteId);
          clearedSitesByCompany.set(c.companyId, ss);

          const bySite = clearancesBySite.get(c.siteId) ?? new Map();
          bySite.set(c.workerId, c.status);
          clearancesBySite.set(c.siteId, bySite);
        }

        const allActiveSites = await db
          .select({ id: isolatedSchema.sites.id })
          .from(isolatedSchema.sites)
          .where(eq(isolatedSchema.sites.status, 'active'));
        const totalSites = allActiveSites.length;

        const KEY_DOCS = ['publicLiability', 'employersLiability', 'healthSafety', 'rams'];

        const result = companies.map(co => {
          const docs = docsByCompany.get(co.id) ?? [];
          const docSummary = Object.fromEntries(KEY_DOCS.map(k => [k, docStatus(docs as any, k)]));
          const missingDocs = KEY_DOCS.filter(k => ['missing', 'expired'].includes(docSummary[k]));
          const workerCount = countMap.get(co.id) ?? 0;
          const clearedCount = clearedWorkersByCompany.get(co.id)?.size ?? 0;

          return {
            id: co.id,
            companyName: co.companyName,
            status: co.status,
            riskRating: co.riskRating,
            workerCount,
            clearedCount,
            sitesClearedCount: clearedSitesByCompany.get(co.id)?.size ?? 0,
            totalSitesCount: totalSites,
            documentsStatus: docSummary,
            complianceIssues: missingDocs.length,
            overallCompliance: missingDocs.length === 0 && co.status === 'approved' ? 'compliant' : 'attention',
          };
        });

        res.json(result);
      } catch (err) {
        if (err instanceof SiteContextError) return res.status(403).json({ error: (err as Error).message });
        logger.error('[contractor-pool] list error:', err);
        res.status(500).json({ error: 'Failed to load contractor pool' });
      }
    },
  );

  // ── GET /api/enterprise/contractor-pool/sites ───────────────────────────
  // List all enterprise sites (for building clearance status per site)
  app.get(
    '/api/enterprise/contractor-pool/sites',
    requireAuth,
    requireEnterpriseRole('enterprise_admin', 'area_manager'),
    async (req, res) => {
      try {
        const db = await customerDbService.getCustomerDatabase(req.customerId!);
        const sites = await db
          .select({ id: isolatedSchema.sites.id, name: isolatedSchema.sites.name, reference: isolatedSchema.sites.siteReference })
          .from(isolatedSchema.sites)
          .where(eq(isolatedSchema.sites.isActive, true));
        res.json(sites);
      } catch (err) {
        logger.error('[contractor-pool] sites error:', err);
        res.status(500).json({ error: 'Failed to load sites' });
      }
    },
  );

  // ── GET /api/enterprise/contractor-pool/:companyId/workers ──────────────
  // Workers for a company with their per-site clearance status
  app.get(
    '/api/enterprise/contractor-pool/:companyId/workers',
    requireAuth,
    requireEnterpriseRole('enterprise_admin', 'area_manager'),
    async (req, res) => {
      try {
        const { companyId } = req.params;
        const db = await customerDbService.getCustomerDatabase(req.customerId!);

        const [company] = await db
          .select()
          .from(isolatedSchema.contractorCompanies)
          .where(eq(isolatedSchema.contractorCompanies.id, companyId))
          .limit(1);

        if (!company) return res.status(404).json({ error: 'Company not found' });

        const workers = await db
          .select()
          .from(isolatedSchema.contractorWorkers)
          .where(and(
            eq(isolatedSchema.contractorWorkers.companyId, companyId),
            eq(isolatedSchema.contractorWorkers.isActive, true),
          ));

        const workerIds = workers.map(w => w.id);
        const clearances = workerIds.length > 0
          ? await db
              .select()
              .from(isolatedSchema.contractorSiteClearances)
              .where(inArray(isolatedSchema.contractorSiteClearances.workerId, workerIds))
          : [];

        // Build map: workerId → siteId → clearance record
        const clearanceMap = new Map<string, Map<string, typeof clearances[0]>>();
        for (const c of clearances) {
          const m = clearanceMap.get(c.workerId) ?? new Map();
          m.set(c.siteId, c);
          clearanceMap.set(c.workerId, m);
        }

        const result = workers.map(w => ({
          ...w,
          siteClearances: Object.fromEntries(
            [...(clearanceMap.get(w.id) ?? new Map()).entries()].map(([siteId, c]) => [
              siteId,
              { status: c.status, inductedAt: c.inductedAt, expiryDate: c.expiryDate, notes: c.notes, clearanceId: c.id },
            ])
          ),
        }));

        res.json(result);
      } catch (err) {
        logger.error('[contractor-pool] workers error:', err);
        res.status(500).json({ error: 'Failed to load workers' });
      }
    },
  );

  // ── POST /api/enterprise/contractor-pool/workers/:workerId/clear ─────────
  // Upsert a site clearance for a worker (mark as inducted at a site)
  app.post(
    '/api/enterprise/contractor-pool/workers/:workerId/clear',
    requireAuth,
    requireEnterpriseRole('enterprise_admin', 'area_manager'),
    async (req, res) => {
      try {
        const { workerId } = req.params;
        const { siteId, status = 'inducted', inductedAt, expiryDate, notes } = req.body as {
          siteId: string;
          status?: string;
          inductedAt?: string;
          expiryDate?: string;
          notes?: string;
        };

        if (!siteId) return res.status(400).json({ error: 'siteId is required' });

        const db = await customerDbService.getCustomerDatabase(req.customerId!);

        // Scope check: area_manager must only grant clearance for sites in their area.
        // enterprise_admin gets allowedSiteIds='all' (bypass); others are limited to
        // the resolved site list attached by requireEnterpriseRole middleware.
        const grants = req.enterpriseGrants;
        if (grants?.allowedSiteIds !== 'all') {
          const allowed = Array.isArray(grants?.allowedSiteIds) ? grants!.allowedSiteIds : [];
          if (!allowed.includes(siteId)) {
            return res.status(403).json({ error: 'Site is outside your managed scope' });
          }
        }

        // Verify the siteId actually exists in this customer's sites table
        const [siteRow] = await db
          .select({ id: isolatedSchema.sites.id })
          .from(isolatedSchema.sites)
          .where(eq(isolatedSchema.sites.id, siteId))
          .limit(1);
        if (!siteRow) return res.status(404).json({ error: 'Site not found' });

        const [worker] = await db
          .select({ id: isolatedSchema.contractorWorkers.id, companyId: isolatedSchema.contractorWorkers.companyId })
          .from(isolatedSchema.contractorWorkers)
          .where(eq(isolatedSchema.contractorWorkers.id, workerId))
          .limit(1);

        if (!worker) return res.status(404).json({ error: 'Worker not found' });

        const schemaName = customerDbService.generateSchemaName(req.customerId!);
        const pool = (db as any).$client ?? (db as any).session?.client;

        const result = await pool.query(
          `INSERT INTO "${schemaName}".contractor_site_clearances
             (worker_id, company_id, site_id, status, inducted_at, expiry_date, cleared_by, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (worker_id, site_id) DO UPDATE SET
             status = EXCLUDED.status,
             inducted_at = EXCLUDED.inducted_at,
             expiry_date = EXCLUDED.expiry_date,
             cleared_by = EXCLUDED.cleared_by,
             notes = EXCLUDED.notes,
             updated_at = NOW()
           RETURNING *`,
          [
            workerId,
            worker.companyId,
            siteId,
            status,
            inductedAt ? new Date(inductedAt) : new Date(),
            expiryDate ? new Date(expiryDate) : null,
            (req as any).user?.id ?? null,
            notes ?? null,
          ]
        );

        res.json(result.rows[0]);
      } catch (err) {
        logger.error('[contractor-pool] clear error:', err);
        res.status(500).json({ error: 'Failed to record clearance' });
      }
    },
  );

  // ── DELETE /api/enterprise/contractor-pool/clearances/:clearanceId ───────
  // Remove a site clearance record
  app.delete(
    '/api/enterprise/contractor-pool/clearances/:clearanceId',
    requireAuth,
    requireEnterpriseRole('enterprise_admin'),
    async (req, res) => {
      try {
        const { clearanceId } = req.params;
        const db = await customerDbService.getCustomerDatabase(req.customerId!);

        const [deleted] = await db
          .delete(isolatedSchema.contractorSiteClearances)
          .where(eq(isolatedSchema.contractorSiteClearances.id, clearanceId))
          .returning();

        if (!deleted) return res.status(404).json({ error: 'Clearance record not found' });
        res.json({ success: true });
      } catch (err) {
        logger.error('[contractor-pool] delete clearance error:', err);
        res.status(500).json({ error: 'Failed to delete clearance' });
      }
    },
  );

  // ── GET /api/enterprise/contractor-pool/workers/:workerId/clearances ─────
  // Get all site clearances for a single worker
  app.get(
    '/api/enterprise/contractor-pool/workers/:workerId/clearances',
    requireAuth,
    requireEnterpriseRole('enterprise_admin', 'area_manager'),
    async (req, res) => {
      try {
        const { workerId } = req.params;
        const db = await customerDbService.getCustomerDatabase(req.customerId!);

        const clearances = await db
          .select()
          .from(isolatedSchema.contractorSiteClearances)
          .where(eq(isolatedSchema.contractorSiteClearances.workerId, workerId));

        res.json(clearances);
      } catch (err) {
        logger.error('[contractor-pool] worker clearances error:', err);
        res.status(500).json({ error: 'Failed to load clearances' });
      }
    },
  );
}
