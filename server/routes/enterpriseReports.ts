/**
 * Enterprise Reports API — Phase 5a
 * ===================================
 * POST /api/enterprise/reports          — generate a PDF report (synchronous, ~5-25s)
 * GET  /api/enterprise/reports          — list recent reports for this customer
 * GET  /api/enterprise/reports/:id/download — stream PDF from GCS
 */

import type { Application } from 'express';
import { eq, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { requireAuth } from '../auth';
import { requireEnterpriseRole } from '../enterpriseRoles';
import { customerDbService } from '../customerDatabase';
import * as iso from '../isolatedSchema';
import { objectStorageClient, parseObjectPath } from '../objectStorage';
import { generateReport, type ReportType } from '../enterpriseReportService';
import { logger } from '../utils/logger';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Return allowed site IDs from enterprise grants attached by requireEnterpriseRole. */
function callerAllowedSiteIds(req: any): string[] | 'all' {
  const grants = req.enterpriseGrants;
  if (!grants) return [];
  if (grants.roles.includes('enterprise_admin')) return 'all';
  return Array.isArray(grants.allowedSiteIds) ? grants.allowedSiteIds : [];
}

const VALID_REPORT_TYPES: ReportType[] = [
  'portfolio_compliance_snapshot',
  'single_site_report',
  'contractor_compliance_report',
  'expiry_forecast',
  'ppm_performance',
  'evacuation_muster_log',
  'audit_trail_export',
];

// Reports that require site_coordinator scope to be a single-site report
const ESTATE_ONLY_TYPES: ReportType[] = [
  'portfolio_compliance_snapshot',
  'contractor_compliance_report',
  'ppm_performance',
  'audit_trail_export',
];

// ─── Routes ───────────────────────────────────────────────────────────────────

export function registerEnterpriseReportRoutes(app: Application) {
  const ROLE_GATE = requireEnterpriseRole('enterprise_admin', 'area_manager', 'site_coordinator');

  // ── POST /api/enterprise/reports ──────────────────────────────────────────
  // Generates a PDF report synchronously and stores the record in DB.
  // Body: { reportType, parameters: { siteId?, period?, dateFrom?, dateTo? } }
  app.post('/api/enterprise/reports', requireAuth, ROLE_GATE, async (req, res) => {
    try {
      const { reportType, parameters = {} } = req.body as {
        reportType: ReportType;
        parameters?: Record<string, any>;
      };

      if (!VALID_REPORT_TYPES.includes(reportType)) {
        return res.status(400).json({ error: `Invalid report type: ${reportType}` });
      }

      const customerId = req.customerId!;
      const allowedSiteIds = callerAllowedSiteIds(req);
      const grants = (req as any).enterpriseGrants;
      const isSiteCoordinator = grants?.roles?.includes('site_coordinator') && !grants?.roles?.includes('enterprise_admin') && !grants?.roles?.includes('area_manager');

      // Site coordinators cannot generate estate-wide reports
      if (isSiteCoordinator && ESTATE_ONLY_TYPES.includes(reportType)) {
        return res.status(403).json({ error: 'Site coordinators may only generate single-site reports.' });
      }

      // Single-site / muster reports must have a siteId
      if (['single_site_report', 'evacuation_muster_log'].includes(reportType) && !parameters.siteId) {
        return res.status(400).json({ error: 'siteId is required for this report type.' });
      }

      // Verify the caller can access the requested site
      if (parameters.siteId && allowedSiteIds !== 'all' && !allowedSiteIds.includes(parameters.siteId)) {
        return res.status(403).json({ error: 'You do not have access to the requested site.' });
      }

      logger.info('[enterpriseReports] starting generation', { customerId, reportType, userId: (req as any).user?.id });

      const db = await customerDbService.getCustomerDatabase(customerId);
      logger.info('[enterpriseReports] db acquired', { customerId });

      // Get company name for branding
      let companyName = 'Your Organisation';
      try {
        const [settings] = await db
          .select({ companyName: iso.companySettings.companyName })
          .from(iso.companySettings)
          .limit(1);
        companyName = settings?.companyName ?? 'Your Organisation';
      } catch (settingsErr: any) {
        logger.warn('[enterpriseReports] could not load company name (non-fatal)', { error: settingsErr.message });
      }

      // Insert a "generating" record
      const reportId = randomUUID();
      logger.info('[enterpriseReports] inserting generating record', { reportId, reportType });
      await db.insert(iso.enterpriseReports).values({
        id: reportId,
        reportType,
        reportTitle: reportType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        scope: parameters.siteId ? 'site' : 'estate',
        scopeId: parameters.siteId ?? null,
        parameters: parameters as any,
        generatedBy: (req as any).user?.id ?? null,
        generatedByName: (req as any).user?.username ?? null,
        status: 'generating',
      });
      logger.info('[enterpriseReports] generating record inserted', { reportId });

      // Generate the PDF
      let result;
      try {
        result = await generateReport(
          db,
          reportType,
          allowedSiteIds,
          parameters,
          customerId,
          reportId,
          companyName,
        );
      } catch (genErr: any) {
        const errMsg = genErr instanceof Error ? genErr.message : String(genErr);
        logger.error('[enterpriseReports] generation failed', { error: errMsg, stack: genErr?.stack });
        await db
          .update(iso.enterpriseReports)
          .set({ status: 'failed', errorMessage: errMsg, completedAt: new Date() })
          .where(eq(iso.enterpriseReports.id, reportId));
        return res.status(500).json({ error: 'Report generation failed', detail: errMsg });
      }

      // Update DB record
      await db
        .update(iso.enterpriseReports)
        .set({
          reportTitle: result.title,
          status: 'ready',
          storagePath: result.storagePath,
          fileSizeBytes: result.fileSizeBytes,
          completedAt: new Date(),
        })
        .where(eq(iso.enterpriseReports.id, reportId));

      // If GCS storage succeeded, return download URL; otherwise return PDF inline
      if (result.storagePath) {
        return res.json({
          reportId,
          title: result.title,
          status: 'ready',
          downloadUrl: `/api/enterprise/reports/${reportId}/download`,
          fileSizeBytes: result.fileSizeBytes,
        });
      } else {
        // Stream PDF directly (no GCS available in dev)
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${reportType}-${new Date().toISOString().slice(0, 10)}.pdf"`);
        res.setHeader('X-Report-Id', reportId);
        return res.send(result.pdfBuffer);
      }
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[enterpriseReports] POST unexpected error:', { message: msg, stack: err?.stack?.split?.('\n')?.slice(0,4)?.join(' | ') });
      if (!res.headersSent) res.status(500).json({ error: 'Unexpected error generating report', detail: msg });
    }
  });

  // ── GET /api/enterprise/reports ───────────────────────────────────────────
  // Lists the 50 most recent reports for this customer (scoped by role).
  app.get('/api/enterprise/reports', requireAuth, ROLE_GATE, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const db = await customerDbService.getCustomerDatabase(customerId);
      const allowedSiteIds = callerAllowedSiteIds(req);

      const reports = await db
        .select()
        .from(iso.enterpriseReports)
        .orderBy(desc(iso.enterpriseReports.createdAt))
        .limit(50);

      // Filter by allowed sites (for non-admin roles, hide estate-wide reports unless scoped to allowed sites)
      const filtered = allowedSiteIds === 'all'
        ? reports
        : reports.filter((r: any) =>
            r.scope === 'estate' ? false // area_manager/site_coordinator shouldn't see full estate reports
            : r.scopeId ? allowedSiteIds.includes(r.scopeId)
            : false
          );

      // Add download URL
      const withUrls = filtered.map((r: any) => ({
        ...r,
        downloadUrl: r.status === 'ready' && r.storagePath ? `/api/enterprise/reports/${r.id}/download` : null,
      }));

      res.json(withUrls);
    } catch (err) {
      logger.error('[enterpriseReports] GET list error:', err);
      res.status(500).json({ error: 'Failed to load report history' });
    }
  });

  // ── GET /api/enterprise/reports/:id/download ──────────────────────────────
  // Streams PDF from GCS.
  app.get('/api/enterprise/reports/:id/download', requireAuth, ROLE_GATE, async (req, res) => {
    try {
      const { id } = req.params;
      const customerId = req.customerId!;
      const db = await customerDbService.getCustomerDatabase(customerId);
      const allowedSiteIds = callerAllowedSiteIds(req);

      const [report] = await db
        .select()
        .from(iso.enterpriseReports)
        .where(eq(iso.enterpriseReports.id, id))
        .limit(1);

      if (!report) return res.status(404).json({ error: 'Report not found' });

      // Scope check
      if (allowedSiteIds !== 'all') {
        if (report.scope === 'estate') return res.status(403).json({ error: 'Access denied' });
        if (report.scopeId && !allowedSiteIds.includes(report.scopeId)) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }

      if (report.status !== 'ready' || !report.storagePath) {
        return res.status(404).json({ error: 'Report is not yet ready or has no stored file' });
      }

      const { bucketName, objectName } = parseObjectPath(report.storagePath);
      const file = objectStorageClient.bucket(bucketName).file(objectName);
      const [exists] = await file.exists();
      if (!exists) return res.status(404).json({ error: 'Report file not found in storage' });

      const safeTitle = (report.reportTitle ?? 'report').replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '-').toLowerCase();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}-${id.slice(0, 8)}.pdf"`);
      file.createReadStream().pipe(res);
    } catch (err) {
      logger.error('[enterpriseReports] download error:', err);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to download report' });
    }
  });
}
