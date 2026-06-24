import type { Express } from 'express';
import { requireAuth } from '../auth';
import { customerDbService } from '../customerDatabase';
import { simpleDatabaseService } from '../simpleDatabaseService';
import * as schema from '../isolatedSchema';
import { eq, ne, and } from 'drizzle-orm';
import { logger } from '../utils/logger';
import { getScopedDb, scopedWhere, SiteContextError } from '../siteScope';
import { db } from '../db';
import { ramsDocuments as sharedRamsDocuments } from '@shared/schema';

// Module-level dashboard cache: 90-second TTL, keyed by customerId
const _dashboardCache = new Map<string, { data: any; expiresAt: number }>();
const DASHBOARD_CACHE_TTL_MS = 90_000;

const requireComplianceDashboardFeature = async (req: any, res: any, next: any) => {
  try {
    const allowedRoles = ['admin', 'manager', 'hr_admin'];
    if (!allowedRoles.includes(req.user!.role)) {
      return res.status(403).json({ error: 'You do not have permission to view the Compliance Dashboard. This page is restricted to administrators, managers, and HR admins.' });
    }
    const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
    const settings = await simpleDatabaseService.getCompanySettings(context);
    if (!settings?.featureComplianceDashboard) {
      return res.status(403).json({ error: 'Compliance Dashboard is not enabled for your account.' });
    }
    next();
  } catch (error) {
    next(error);
  }
};

export function registerComplianceDashboardRoutes(app: Express): void {
  app.use('/api/compliance-dashboard', requireAuth, requireComplianceDashboardFeature);

  // Fix 7 — audit log when a user exports a PDF
  app.post('/api/compliance-dashboard/pdf-export-audit', async (req, res) => {
    logger.info(`Compliance Dashboard PDF exported by user ${req.user?.username} (customerId: ${req.customerId})`);
    res.status(204).end();
  });

  app.get('/api/compliance-dashboard', async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      const pool = (custDb as any).$client ?? (custDb as any).session?.client;

      // Resolve enterprise site context so the dashboard only shows data for the
      // active site (matching how every other site-scoped route works).
      let siteContext: Awaited<ReturnType<typeof getScopedDb>>['siteContext'] = {
        isEnterprise: false, activeSiteId: null, allowedSiteIds: 'all',
      };
      try {
        const { siteContext: ctx } = await getScopedDb(req);
        siteContext = ctx;
      } catch (err: any) {
        if (err instanceof SiteContextError) {
          return res.status(403).json({ error: err.message });
        }
        logger.warn('Failed to resolve site context for compliance dashboard (non-fatal):', err?.message);
      }
      const enterpriseSiteId = siteContext.isEnterprise ? siteContext.activeSiteId : null;

      // Helper: append a site_id filter param to a parameterized SQL query.
      // When enterpriseSiteId is null (non-enterprise) this is a no-op.
      function addSiteParam(baseParams: any[], alias?: string): { clause: string; params: any[] } {
        if (!enterpriseSiteId) return { clause: '', params: baseParams };
        const col = alias ? `${alias}.site_id` : 'site_id';
        return { clause: ` AND ${col} = $${baseParams.length + 1}`, params: [...baseParams, enterpriseSiteId] };
      }

      // Fix 4 — cache check (bypass with ?refresh=1)
      // Include active site in cache key so enterprise users switching sites get fresh data.
      const cacheKey = enterpriseSiteId ? `${req.customerId!}_${enterpriseSiteId}` : req.customerId!;
      if (req.query.refresh !== '1') {
        const cached = _dashboardCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
          return res.json(cached.data);
        }
      }

      const now = new Date();
      const ago12Months = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

      // Fix 2 — track sections that fail to load
      const loadErrors: string[] = [];

      const criticalIssues: any[] = [];
      const warnings: any[] = [];
      const expiryTimeline: any[] = [];
      const contractorRiskMap: Record<string, { id: string; name: string; issues: string[]; issueCount: number }> = {};

      // Fix 6 — compare dates at London-timezone day boundaries for UK accuracy
      function daysUntil(date: Date | string | null | undefined): number | null {
        if (!date) return null;
        const d = date instanceof Date ? date : new Date(date);
        if (isNaN(d.getTime())) return null;
        const nowLondon = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
        const dLondon  = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/London' }));
        const nowDay = new Date(nowLondon.getFullYear(), nowLondon.getMonth(), nowLondon.getDate());
        const dDay   = new Date(dLondon.getFullYear(),  dLondon.getMonth(),  dLondon.getDate());
        return Math.round((dDay.getTime() - nowDay.getTime()) / 86400000);
      }

      function isoDate(date: Date | string | null | undefined): string | null {
        if (!date) return null;
        const d = date instanceof Date ? date : new Date(date);
        if (isNaN(d.getTime())) return null;
        // en-CA gives YYYY-MM-DD in Europe/London timezone
        return d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
      }

      function addTimeline(date: Date | string | null | undefined, category: string, item: string, linkPath?: string) {
        const days = daysUntil(date);
        if (days !== null && days >= 0 && days <= 90) {
          expiryTimeline.push({ date: isoDate(date)!, category, item, daysUntilExpiry: days, linkPath });
        }
      }

      function ensureContractorRisk(id: string, name: string) {
        if (!contractorRiskMap[id]) contractorRiskMap[id] = { id, name, issues: [], issueCount: 0 };
      }

      // ── 1. Contractor Insurance ───────────────────────────────────────────────
      let insTotal = 0, insCompliant = 0, insExpiring = 0, insExpired = 0, insMissing = 0;
      let companies: any[] = [];

      try {
        const { clause: ccSite, params: ccSiteP } = addSiteParam([]);
        const companiesResult = await pool.query(
          `SELECT id, company_name, is_active,
                  public_liability_expiry_date, employers_liability_expiry_date,
                  professional_indemnity_expiry_date, health_safety_policy_expiry_date,
                  chas_expiry_date, chas_certified,
                  safe_contractor_expiry_date, safe_contractor_certified
           FROM "${schemaName}".contractor_companies
           WHERE is_active = TRUE${ccSite}`,
          ccSiteP
        );
        companies = companiesResult.rows;
      } catch (e: any) {
        logger.warn('Contractor companies extended query error, falling back to Drizzle (non-fatal):', e.message);
        try {
          const drizzleCompanies = await custDb.select({
            id: schema.contractorCompanies.id,
            companyName: schema.contractorCompanies.companyName,
            plExpiry: schema.contractorCompanies.publicLiabilityExpiryDate,
            elExpiry: schema.contractorCompanies.employersLiabilityExpiryDate,
            isActive: schema.contractorCompanies.isActive,
          }).from(schema.contractorCompanies).where(and(
            eq(schema.contractorCompanies.isActive, true),
            scopedWhere(siteContext, schema.contractorCompanies),
          ));
          companies = drizzleCompanies.map(c => ({
            id: c.id,
            company_name: c.companyName,
            public_liability_expiry_date: c.plExpiry,
            employers_liability_expiry_date: c.elExpiry,
          }));
        } catch (e2: any) {
          logger.warn('Contractor companies fallback query error (non-fatal):', e2.message);
          loadErrors.push('Contractor Companies');
        }
      }

      // Fix 5 — O(1) company name lookup instead of O(n) companies.find() per row
      const companiesMap = new Map<string, any>(companies.map((c: any) => [c.id, c]));

      // Fix 4 — pre-fetch all company IDs with pending insurance docs (eliminates N+1)
      const pendingInsuranceCompanyIds = new Set<string>();
      try {
        const { clause: piSite, params: piSiteP } = addSiteParam([]);
        const pendingInsResult = await pool.query(
          `SELECT DISTINCT company_id FROM "${schemaName}".contractor_documents
           WHERE document_type IN ('publicLiability','employersLiability')
             AND status = 'pending'
             AND is_active = TRUE${piSite}`,
          piSiteP
        );
        for (const row of pendingInsResult.rows) {
          if (row.company_id) pendingInsuranceCompanyIds.add(row.company_id);
        }
      } catch (e: any) {
        logger.warn('Pending insurance pre-fetch error (non-fatal):', e.message);
      }

      try {
        for (const c of companies) {
          ensureContractorRisk(c.id, c.company_name);

          const checkInsurance = (expiry: any, label: string, idPrefix: string) => {
            if (!expiry) return;
            insTotal++;
            const days = daysUntil(expiry)!;
            if (days < 0) {
              insExpired++;
              criticalIssues.push({
                id: `${idPrefix}-expired-${c.id}`, category: 'Contractor Insurance', severity: 'critical',
                title: `${label} expired`,
                detail: `${c.company_name} — expired ${Math.abs(days)} days ago`,
                daysOverdue: Math.abs(days), linkPath: `/contractors/${c.id}?tab=documents&filter=missing`,
              });
              contractorRiskMap[c.id].issues.push(`${label} expired`);
              contractorRiskMap[c.id].issueCount++;
            } else if (days <= 30) {
              insExpiring++;
              warnings.push({
                id: `${idPrefix}-expiring-${c.id}`, category: 'Contractor Insurance', severity: 'warning',
                title: `${label} expiring soon`,
                detail: `${c.company_name} — expires in ${days} days`, linkPath: `/contractors/${c.id}?tab=documents`,
              });
              contractorRiskMap[c.id].issues.push(`${label} expires in ${days} days`);
              contractorRiskMap[c.id].issueCount++;
              addTimeline(expiry, 'Contractor Insurance', `${c.company_name} — ${label}`);
            } else {
              insCompliant++;
              addTimeline(expiry, 'Contractor Insurance', `${c.company_name} — ${label}`);
            }
          };

          checkInsurance(c.public_liability_expiry_date, 'Public Liability insurance', 'pl');
          checkInsurance(c.employers_liability_expiry_date, 'Employers Liability insurance', 'el');
          checkInsurance(c.professional_indemnity_expiry_date, 'Professional Indemnity insurance', 'pi');
          checkInsurance(c.health_safety_policy_expiry_date, 'Health & Safety Policy', 'hs');
          if (c.chas_certified) checkInsurance(c.chas_expiry_date, 'CHAS certification', 'chas');
          if (c.safe_contractor_certified) checkInsurance(c.safe_contractor_expiry_date, 'SafeContractor certification', 'sc');

          // Missing-data blindness: companies with no PL and no EL expiry at all
          if (!c.public_liability_expiry_date && !c.employers_liability_expiry_date) {
            insTotal++;
            insMissing++;
            // Fix 4 — use pre-fetched Set instead of per-company query
            const hasPendingInsurance = pendingInsuranceCompanyIds.has(c.id);
            warnings.push({
              id: `ins-missing-${c.id}`, category: 'Contractor Insurance', severity: 'warning',
              title: hasPendingInsurance ? 'Insurance awaiting approval' : 'No insurance on record',
              detail: hasPendingInsurance
                ? `${c.company_name} — insurance uploaded but not yet approved`
                : `${c.company_name} — no Public Liability or Employers Liability expiry date recorded`,
              linkPath: hasPendingInsurance
                ? `/contractors/${c.id}?tab=documents`
                : `/contractors/${c.id}?tab=documents&filter=missing`,
            });
            contractorRiskMap[c.id].issues.push(hasPendingInsurance ? 'Insurance awaiting approval' : 'No insurance on record');
            contractorRiskMap[c.id].issueCount++;
          }
        }
      } catch (e: any) {
        logger.warn('Insurance check error (non-fatal):', e.message);
        loadErrors.push('Contractor Insurance');
      }

      const insScore = insTotal === 0 ? null : Math.round((insCompliant / insTotal) * 100);

      // ── 2. RAMS Documents ─────────────────────────────────────────────────────
      // IMPORTANT: RAMS documents live in the SHARED management DB (ramsDocuments
      // from @shared/schema), NOT the customer-isolated DB. The isolated schema's
      // ramsDocuments table is always empty. Query the shared DB filtered by
      // customerId, mirroring what GET /api/rams does.
      const ramsConditions: any[] = [
        eq(sharedRamsDocuments.customerId, req.customerId!),
        eq(sharedRamsDocuments.isActive, true),
      ];
      if (enterpriseSiteId) ramsConditions.push(eq(sharedRamsDocuments.siteId, enterpriseSiteId));
      const rams = await db.select().from(sharedRamsDocuments).where(and(...ramsConditions));

      let ramsTotal = rams.length, ramsValid = 0, ramsExpiring = 0, ramsExpired = 0;

      for (const r of rams) {
        const companyName = companiesMap.get(r.companyId)?.company_name;
        const ramsDays = daysUntil(r.expiryDate);
        const link = '/contractors?tab=rams';

        // ── rejected: always a critical issue ─────────────────────────────────
        if (r.status === 'rejected') {
          ramsExpired++;
          criticalIssues.push({
            id: `rams-rejected-${r.id}`, category: 'RAMS Documents', severity: 'critical',
            title: 'RAMS document rejected',
            detail: `${r.documentName} (${r.ramsIdRef}) — rejected, resubmission required`,
            linkPath: link,
          });
          if (companyName && r.companyId) {
            ensureContractorRisk(r.companyId, companyName);
            contractorRiskMap[r.companyId].issues.push(`RAMS rejected: ${r.documentName}`);
            contractorRiskMap[r.companyId].issueCount++;
          }
        // ── pending_review: warning — awaiting approval ────────────────────────
        } else if (r.status === 'pending_review') {
          ramsExpiring++;
          warnings.push({
            id: `rams-pending-${r.id}`, category: 'RAMS Documents', severity: 'warning',
            title: 'RAMS document awaiting approval',
            detail: `${r.documentName} (${r.ramsIdRef}) — pending review`,
            linkPath: link,
          });
          if (companyName && r.companyId) {
            ensureContractorRisk(r.companyId, companyName);
            contractorRiskMap[r.companyId].issues.push(`RAMS pending: ${r.documentName}`);
            contractorRiskMap[r.companyId].issueCount++;
          }
        // ── approved but expired ───────────────────────────────────────────────
        } else if (r.status === 'expired' || (ramsDays !== null && ramsDays < 0)) {
          ramsExpired++;
          criticalIssues.push({
            id: `rams-expired-${r.id}`, category: 'RAMS Documents', severity: 'critical',
            title: 'RAMS document expired',
            detail: ramsDays !== null && ramsDays < 0
              ? `${r.documentName} (${r.ramsIdRef}) — expired ${Math.abs(ramsDays)} days ago`
              : `${r.documentName} (${r.ramsIdRef})`,
            daysOverdue: ramsDays !== null && ramsDays < 0 ? Math.abs(ramsDays) : undefined,
            linkPath: link,
          });
          if (companyName && r.companyId) {
            ensureContractorRisk(r.companyId, companyName);
            contractorRiskMap[r.companyId].issues.push(`RAMS expired: ${r.documentName}`);
            contractorRiskMap[r.companyId].issueCount++;
          }
        // ── approved but expiring within 30 days ──────────────────────────────
        } else if (r.status === 'expiring' || (ramsDays !== null && ramsDays <= 30)) {
          ramsExpiring++;
          warnings.push({
            id: `rams-expiring-${r.id}`, category: 'RAMS Documents', severity: 'warning',
            title: 'RAMS document expiring soon',
            detail: ramsDays !== null
              ? `${r.documentName} (${r.ramsIdRef}) — expires in ${ramsDays} days`
              : `${r.documentName} (${r.ramsIdRef})`,
            linkPath: link,
          });
          if (companyName && r.companyId) {
            ensureContractorRisk(r.companyId, companyName);
            contractorRiskMap[r.companyId].issues.push(`RAMS expiring: ${r.documentName}`);
            contractorRiskMap[r.companyId].issueCount++;
          }
          addTimeline(r.expiryDate, 'RAMS', r.documentName);
        // ── approved and valid ─────────────────────────────────────────────────
        } else {
          ramsValid++;
          addTimeline(r.expiryDate, 'RAMS', r.documentName);
        }
      }

      const ramsScore = ramsTotal === 0 ? null : Math.round((ramsValid / ramsTotal) * 100);

      // ── Active worker IDs (hoisted — reused across contractor worker sections) ──
      let activeWorkerIds = new Set<string>();
      try {
        const { clause: cvSite, params: cvSiteP } = addSiteParam([ago12Months.toISOString()]);
        const recentVisitsResult = await pool.query(
          `SELECT DISTINCT worker_id FROM "${schemaName}".contractor_visits WHERE checked_in_at >= $1${cvSite}`,
          cvSiteP
        );
        activeWorkerIds = new Set<string>(recentVisitsResult.rows.map((r: any) => r.worker_id).filter(Boolean));
      } catch (e: any) {
        logger.warn('Active worker IDs query error (non-fatal):', e.message);
        loadErrors.push('Active Workers');
      }

      // ── 3. Contractor Inductions ──────────────────────────────────────────────
      let indTotal = 0, indCompliant = 0, indOverdue = 0;

      // Load induction reminder threshold from settings (falls back to 30)
      let inductionReminderDays = 30;
      try {
        const [indSettings] = await custDb
          .select({ inductionExpiryReminderDays: schema.companySettings.inductionExpiryReminderDays })
          .from(schema.companySettings)
          .limit(1);
        inductionReminderDays = parseInt(indSettings?.inductionExpiryReminderDays ?? '30', 10) || 30;
      } catch (_) { /* non-fatal, keep default */ }

      try {
        const { clause: indSite, params: indSiteP } = addSiteParam([], 'cw');
        const workersResult = await pool.query(
          `SELECT cw.id, cw.first_name, cw.last_name, cw.company_id,
                  cw.site_induction_completed, cw.site_induction_expiry_date, cw.site_induction_required
           FROM "${schemaName}".contractor_workers cw
           INNER JOIN "${schemaName}".contractor_companies cc
             ON cc.id = cw.company_id AND cc.is_active = TRUE
           WHERE cw.is_active = TRUE${indSite}`,
          indSiteP
        );
        // Only count workers whose company exists and is active.
        // Orphaned workers (company deleted/inactive) are excluded via INNER JOIN.
        indTotal = workersResult.rows.length;

        for (const w of workersResult.rows) {
          const workerName = `${w.first_name} ${w.last_name}`;
          const companyName = companiesMap.get(w.company_id)?.company_name ?? '';
          const expiryDays = daysUntil(w.site_induction_expiry_date);

          if (expiryDays !== null && expiryDays < 0) {
            indOverdue++;
            criticalIssues.push({
              id: `ind-expired-${w.id}`, category: 'Contractor Inductions', severity: 'critical',
              title: 'Site induction expired', detail: workerName,
              daysOverdue: Math.abs(expiryDays), linkPath: w.company_id ? `/contractors/${w.company_id}?tab=workers&workerId=${w.id}` : '/contractors',
            });
            if (w.company_id && companyName) {
              ensureContractorRisk(w.company_id, companyName);
              contractorRiskMap[w.company_id].issues.push(`Induction expired: ${workerName}`);
              contractorRiskMap[w.company_id].issueCount++;
            }
          } else if (!w.site_induction_completed && w.site_induction_required !== false) {
            indOverdue++;
            warnings.push({
              id: `ind-incomplete-${w.id}`, category: 'Contractor Inductions', severity: 'warning',
              title: 'Site induction not completed', detail: workerName,
              linkPath: w.company_id ? `/contractors/${w.company_id}?tab=workers&workerId=${w.id}` : '/contractors',
            });
          } else {
            indCompliant++;
            if (expiryDays !== null && expiryDays <= inductionReminderDays) {
              warnings.push({
                id: `ind-expiring-${w.id}`, category: 'Contractor Inductions', severity: 'warning',
                title: 'Site induction expiring soon',
                detail: `${workerName} — expires in ${expiryDays} days`,
                linkPath: w.company_id ? `/contractors/${w.company_id}?tab=workers&workerId=${w.id}` : '/contractors',
              });
            }
            addTimeline(w.site_induction_expiry_date, 'Contractor Inductions', `${workerName} — Induction`);
          }
        }
      } catch (e: any) {
        logger.warn('Induction query error (non-fatal):', e.message);
        loadErrors.push('Contractor Inductions');
      }

      const indScore = indTotal === 0 ? null : Math.round((indCompliant / indTotal) * 100);

      // ── 4. Worker Right to Work ───────────────────────────────────────────────
      // RTW data lives in contractor_documents (document_type='right_to_work'),
      // NOT on contractor_workers.right_to_work_status (that field is never
      // synced when documents are uploaded). We pick one row per worker using
      // DISTINCT ON, preferring the best document (approved first, then by
      // expiry desc). Only workers with an active company are counted.
      let workerRtwTotal = 0, workerRtwCompliant = 0;
      try {
        const { clause: rtwSite, params: rtwSiteP } = addSiteParam([], 'cw');
        const workerRtwResult = await pool.query(
          `SELECT DISTINCT ON (cw.id)
                  cw.id, cw.first_name, cw.last_name, cw.company_id,
                  cd.expiry_date AS right_to_work_expiry_date,
                  cd.status      AS right_to_work_status
           FROM "${schemaName}".contractor_workers cw
           INNER JOIN "${schemaName}".contractor_companies cc
             ON cc.id = cw.company_id AND cc.is_active = TRUE
           INNER JOIN "${schemaName}".contractor_documents cd
             ON cd.worker_id = cw.id
            AND cd.document_type = 'right_to_work'
            AND cd.is_active = TRUE
           WHERE cw.is_active = TRUE${rtwSite}
           ORDER BY cw.id,
             CASE cd.status WHEN 'approved' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END,
             cd.expiry_date DESC NULLS LAST`,
          rtwSiteP
        );
        workerRtwTotal = workerRtwResult.rows.length;

        for (const w of workerRtwResult.rows) {
          const workerName = `${w.first_name} ${w.last_name}`;
          const companyName = companiesMap.get(w.company_id)?.company_name ?? '';
          const days = daysUntil(w.right_to_work_expiry_date);
          const status = w.right_to_work_status;

          if ((days !== null && days < 0) || status === 'expired' || status === 'invalid') {
            criticalIssues.push({
              id: `wrtw-expired-${w.id}`, category: 'Worker Right to Work', severity: 'critical',
              title: 'Worker Right to Work expired or invalid',
              detail: days !== null && days < 0
                ? `${workerName} — expired ${Math.abs(days)} days ago`
                : `${workerName} — status: ${status}`,
              daysOverdue: days !== null && days < 0 ? Math.abs(days) : undefined,
              linkPath: w.company_id ? `/contractors/${w.company_id}?tab=workers&workerId=${w.id}` : '/contractors',
            });
            if (w.company_id && companyName) {
              ensureContractorRisk(w.company_id, companyName);
              contractorRiskMap[w.company_id].issues.push(`Right to Work expired: ${workerName}`);
              contractorRiskMap[w.company_id].issueCount++;
            }
          } else if (status === 'pending' || (days !== null && days <= 30)) {
            warnings.push({
              id: `wrtw-expiring-${w.id}`, category: 'Worker Right to Work', severity: 'warning',
              title: status === 'pending' ? 'Worker Right to Work pending' : 'Worker Right to Work expiring soon',
              detail: days !== null && days > 0
                ? `${workerName} — expires in ${days} days`
                : `${workerName} — pending verification`,
              linkPath: w.company_id ? `/contractors/${w.company_id}?tab=workers&workerId=${w.id}` : '/contractors',
            });
            if (w.company_id && companyName) {
              ensureContractorRisk(w.company_id, companyName);
              contractorRiskMap[w.company_id].issues.push(`Right to Work issue: ${workerName}`);
              contractorRiskMap[w.company_id].issueCount++;
            }
            addTimeline(w.right_to_work_expiry_date, 'Worker Right to Work', `${workerName} — Right to Work`);
          } else {
            workerRtwCompliant++;
            addTimeline(w.right_to_work_expiry_date, 'Worker Right to Work', `${workerName} — Right to Work`);
          }
        }
      } catch (e: any) {
        logger.warn('Worker RTW query error (non-fatal):', e.message);
        loadErrors.push('Worker Right to Work');
      }

      const workerRtwScore = workerRtwTotal === 0 ? null : Math.round((workerRtwCompliant / workerRtwTotal) * 100);

      // ── 5. Worker DBS ─────────────────────────────────────────────────────────
      let workerDbsTotal = 0, workerDbsCompliant = 0;
      try {
        const { clause: dbsSite, params: dbsSiteP } = addSiteParam([], 'cw');
        const dbsResult = await pool.query(
          `SELECT d.id, d.policy_expiry_date, d.worker_id,
                  cw.first_name, cw.last_name, cw.company_id
           FROM "${schemaName}".contractor_worker_dbs d
           JOIN "${schemaName}".contractor_workers cw ON cw.id = d.worker_id
           WHERE d.is_current = TRUE AND d.deleted_at IS NULL AND cw.is_active = TRUE${dbsSite}`,
          dbsSiteP
        );

        for (const row of dbsResult.rows) {
          if (!activeWorkerIds.has(row.worker_id)) continue;
          workerDbsTotal++;
          const workerName = `${row.first_name} ${row.last_name}`;
          const companyName = companiesMap.get(row.company_id)?.company_name ?? '';
          const days = daysUntil(row.policy_expiry_date);

          if (days !== null && days < 0) {
            criticalIssues.push({
              id: `wdbs-expired-${row.id}`, category: 'Worker DBS', severity: 'critical',
              title: 'Worker DBS expired',
              detail: `${workerName} — expired ${Math.abs(days)} days ago`,
              daysOverdue: Math.abs(days),
              linkPath: row.company_id ? `/contractors/${row.company_id}?tab=workers&workerId=${row.worker_id}` : '/contractors',
            });
            if (row.company_id && companyName) {
              ensureContractorRisk(row.company_id, companyName);
              contractorRiskMap[row.company_id].issues.push(`DBS expired: ${workerName}`);
              contractorRiskMap[row.company_id].issueCount++;
            }
          } else if (days !== null && days <= 30) {
            warnings.push({
              id: `wdbs-expiring-${row.id}`, category: 'Worker DBS', severity: 'warning',
              title: 'Worker DBS expiring soon',
              detail: `${workerName} — expires in ${days} days`,
              linkPath: row.company_id ? `/contractors/${row.company_id}?tab=workers&workerId=${row.worker_id}` : '/contractors',
            });
            if (row.company_id && companyName) {
              ensureContractorRisk(row.company_id, companyName);
              contractorRiskMap[row.company_id].issues.push(`DBS expiring: ${workerName}`);
              contractorRiskMap[row.company_id].issueCount++;
            }
            addTimeline(row.policy_expiry_date, 'Worker DBS', `${workerName} — DBS`);
          } else {
            workerDbsCompliant++;
            addTimeline(row.policy_expiry_date, 'Worker DBS', `${workerName} — DBS`);
          }
        }

        // Flag active workers with dbs_required = TRUE who have no current DBS record
        const { clause: dbsReqSite, params: dbsReqSiteP } = addSiteParam([], 'cw');
        const dbsRequiredResult = await pool.query(
          `SELECT cw.id, cw.first_name, cw.last_name, cw.company_id
           FROM "${schemaName}".contractor_workers cw
           WHERE cw.is_active = TRUE AND cw.dbs_required = TRUE
             AND NOT EXISTS (
               SELECT 1 FROM "${schemaName}".contractor_worker_dbs d
               WHERE d.worker_id = cw.id AND d.is_current = TRUE AND d.deleted_at IS NULL
             )${dbsReqSite}`,
          dbsReqSiteP
        );
        for (const row of dbsRequiredResult.rows) {
          if (!activeWorkerIds.has(row.id)) continue;
          workerDbsTotal++;
          const workerName = `${row.first_name} ${row.last_name}`;
          const companyName = companiesMap.get(row.company_id)?.company_name ?? '';
          warnings.push({
            id: `wdbs-missing-${row.id}`, category: 'Worker DBS', severity: 'warning',
            title: 'Worker DBS required but not on record',
            detail: workerName,
            linkPath: row.company_id ? `/contractors/${row.company_id}?tab=workers&workerId=${row.id}` : '/contractors',
          });
          if (row.company_id && companyName) {
            ensureContractorRisk(row.company_id, companyName);
            contractorRiskMap[row.company_id].issues.push(`DBS missing: ${workerName}`);
            contractorRiskMap[row.company_id].issueCount++;
          }
        }
      } catch (e: any) {
        logger.warn('Worker DBS query error (non-fatal):', e.message);
        loadErrors.push('Worker DBS');
      }

      const workerDbsScore = workerDbsTotal === 0 ? null : Math.round((workerDbsCompliant / workerDbsTotal) * 100);

      // ── 6. Worker Certifications ──────────────────────────────────────────────
      // Excludes right_to_work (has its own domain in Section 4 — would double-count).
      // Only approved docs count as compliant; pending = warning; rejected = warning.
      let workerCertTotal = 0, workerCertCompliant = 0;
      try {
        const { clause: wcertSite, params: wcertSiteP } = addSiteParam([], 'cw');
        const workerCertResult = await pool.query(
          `SELECT cd.id, cd.expiry_date, cd.document_name, cd.status, cd.document_type,
                  cw.id AS worker_id, cw.first_name, cw.last_name, cw.company_id
           FROM "${schemaName}".contractor_documents cd
           JOIN "${schemaName}".contractor_workers cw ON cw.id = cd.worker_id
           WHERE cd.worker_id IS NOT NULL
             AND cd.is_active = TRUE
             AND cw.is_active = TRUE
             AND cd.document_type <> 'right_to_work'${wcertSite}`,
          wcertSiteP
        );

        for (const row of workerCertResult.rows) {
          if (!activeWorkerIds.has(row.worker_id)) continue;
          workerCertTotal++;
          const workerName = `${row.first_name} ${row.last_name}`;
          const companyName = companiesMap.get(row.company_id)?.company_name ?? '';
          const docStatus: string = row.status ?? 'pending';

          if (docStatus === 'rejected') {
            warnings.push({
              id: `wcert-rejected-${row.id}`, category: 'Worker Certifications', severity: 'warning',
              title: 'Worker certificate rejected — re-upload required',
              detail: `${row.document_name} — ${workerName}`,
              linkPath: row.company_id ? `/contractors/${row.company_id}?tab=workers&workerId=${row.worker_id}` : '/contractors',
            });
            if (row.company_id && companyName) {
              ensureContractorRisk(row.company_id, companyName);
              contractorRiskMap[row.company_id].issues.push(`Cert rejected: ${row.document_name}`);
              contractorRiskMap[row.company_id].issueCount++;
            }
          } else if (docStatus === 'pending') {
            warnings.push({
              id: `wcert-pending-${row.id}`, category: 'Worker Certifications', severity: 'warning',
              title: 'Worker certificate awaiting review',
              detail: `${row.document_name} — ${workerName}`,
              linkPath: row.company_id ? `/contractors/${row.company_id}?tab=workers&workerId=${row.worker_id}` : '/contractors',
            });
            if (row.company_id && companyName) {
              ensureContractorRisk(row.company_id, companyName);
              contractorRiskMap[row.company_id].issues.push(`Cert pending review: ${row.document_name}`);
              contractorRiskMap[row.company_id].issueCount++;
            }
          } else {
            // approved — use expiry date logic
            const days = daysUntil(row.expiry_date);
            if (days !== null && days < 0) {
              criticalIssues.push({
                id: `wcert-expired-${row.id}`, category: 'Worker Certifications', severity: 'critical',
                title: 'Worker certification expired',
                detail: `${row.document_name} — ${workerName}, expired ${Math.abs(days)} days ago`,
                daysOverdue: Math.abs(days),
                linkPath: row.company_id ? `/contractors/${row.company_id}?tab=workers&workerId=${row.worker_id}` : '/contractors',
              });
              if (row.company_id && companyName) {
                ensureContractorRisk(row.company_id, companyName);
                contractorRiskMap[row.company_id].issues.push(`Cert expired: ${row.document_name}`);
                contractorRiskMap[row.company_id].issueCount++;
              }
            } else if (days !== null && days <= 30) {
              warnings.push({
                id: `wcert-expiring-${row.id}`, category: 'Worker Certifications', severity: 'warning',
                title: 'Worker certification expiring soon',
                detail: `${row.document_name} — ${workerName}, expires in ${days} days`,
                linkPath: row.company_id ? `/contractors/${row.company_id}?tab=workers&workerId=${row.worker_id}` : '/contractors',
              });
              if (row.company_id && companyName) {
                ensureContractorRisk(row.company_id, companyName);
                contractorRiskMap[row.company_id].issues.push(`Cert expiring: ${row.document_name}`);
                contractorRiskMap[row.company_id].issueCount++;
              }
              addTimeline(row.expiry_date, 'Worker Certifications', `${row.document_name} — ${workerName}`);
            } else {
              workerCertCompliant++;
              if (row.expiry_date) addTimeline(row.expiry_date, 'Worker Certifications', `${row.document_name} — ${workerName}`);
            }
          }
        }
      } catch (e: any) {
        logger.warn('Worker certifications query error (non-fatal):', e.message);
        loadErrors.push('Worker Certifications');
      }

      const workerCertScore = workerCertTotal === 0 ? null : Math.round((workerCertCompliant / workerCertTotal) * 100);

      // ── 7. Equipment ──────────────────────────────────────────────────────────
      let equipTotal = 0, equipCompliant = 0;
      try {
        const equipResult = await pool.query(
          `SELECT ce.id, ce.name AS equipment_name, ce.company_id
           FROM "${schemaName}".contractor_equipment ce
           WHERE ce.is_active = TRUE`
        );
        const equipCertResult = await pool.query(
          `SELECT cd.id, cd.equipment_id, cd.expiry_date, cd.document_name
           FROM "${schemaName}".contractor_documents cd
           WHERE cd.equipment_id IS NOT NULL AND cd.is_active = TRUE`
        );

        const certsByEquip = new Map<string, any[]>();
        for (const cert of equipCertResult.rows) {
          if (!certsByEquip.has(cert.equipment_id)) certsByEquip.set(cert.equipment_id, []);
          certsByEquip.get(cert.equipment_id)!.push(cert);
        }

        for (const equip of equipResult.rows) {
          equipTotal++;
          const companyName = companiesMap.get(equip.company_id)?.company_name ?? '';
          const certs = certsByEquip.get(equip.id) ?? [];

          if (certs.length === 0) {
            warnings.push({
              id: `equip-nocert-${equip.id}`, category: 'Equipment', severity: 'warning',
              title: 'Equipment has no certification on record',
              detail: equip.equipment_name,
              linkPath: equip.company_id ? `/contractors/${equip.company_id}?tab=equipment` : '/contractors',
            });
            if (equip.company_id && companyName) {
              ensureContractorRisk(equip.company_id, companyName);
              contractorRiskMap[equip.company_id].issues.push(`No cert: ${equip.equipment_name}`);
              contractorRiskMap[equip.company_id].issueCount++;
            }
          } else {
            let equipHasIssue = false;
            for (const cert of certs) {
              const days = daysUntil(cert.expiry_date);
              if (days !== null && days < 0) {
                equipHasIssue = true;
                criticalIssues.push({
                  id: `equip-expired-${cert.id}`, category: 'Equipment', severity: 'critical',
                  title: 'Equipment certificate expired',
                  detail: `${cert.document_name} — ${equip.equipment_name}, expired ${Math.abs(days)} days ago`,
                  daysOverdue: Math.abs(days),
                  linkPath: equip.company_id ? `/contractors/${equip.company_id}?tab=equipment` : '/contractors',
                });
                if (equip.company_id && companyName) {
                  ensureContractorRisk(equip.company_id, companyName);
                  contractorRiskMap[equip.company_id].issues.push(`Cert expired: ${equip.equipment_name}`);
                  contractorRiskMap[equip.company_id].issueCount++;
                }
              } else if (days !== null && days <= 30) {
                equipHasIssue = true;
                warnings.push({
                  id: `equip-expiring-${cert.id}`, category: 'Equipment', severity: 'warning',
                  title: 'Equipment certificate expiring soon',
                  detail: `${cert.document_name} — ${equip.equipment_name}, expires in ${days} days`,
                  linkPath: equip.company_id ? `/contractors/${equip.company_id}?tab=equipment` : '/contractors',
                });
                if (equip.company_id && companyName) {
                  ensureContractorRisk(equip.company_id, companyName);
                  contractorRiskMap[equip.company_id].issues.push(`Cert expiring: ${equip.equipment_name}`);
                  contractorRiskMap[equip.company_id].issueCount++;
                }
                addTimeline(cert.expiry_date, 'Equipment', `${cert.document_name} — ${equip.equipment_name}`);
              } else {
                addTimeline(cert.expiry_date, 'Equipment', `${cert.document_name} — ${equip.equipment_name}`);
              }
            }
            if (!equipHasIssue) equipCompliant++;
          }
        }
      } catch (e: any) {
        logger.warn('Equipment query error (non-fatal):', e.message);
        loadErrors.push('Equipment');
      }

      const equipScore = equipTotal === 0 ? null : Math.round((equipCompliant / equipTotal) * 100);

      // ── 8. Staff Right to Work ────────────────────────────────────────────────
      let rtwTracked = 0, rtwCompliant = 0, rtwExpiring = 0, rtwExpired = 0;
      try {
        const { clause: srtwSite, params: srtwSiteP } = addSiteParam([], 's');
        const rtwResult = await pool.query(
          `SELECT rtw.staff_id, rtw.expiry_date, s.first_name, s.last_name, s.department
           FROM "${schemaName}".right_to_work rtw
           JOIN "${schemaName}".staff s ON s.id = rtw.staff_id
           WHERE rtw.is_current = TRUE AND rtw.expiry_date IS NOT NULL AND s.is_active = TRUE${srtwSite}`,
          srtwSiteP
        );
        rtwTracked = rtwResult.rows.length;
        for (const row of rtwResult.rows) {
          const days = daysUntil(row.expiry_date)!;
          const staffName = `${row.first_name} ${row.last_name}`;
          if (days < 0) {
            rtwExpired++;
            criticalIssues.push({
              id: `rtw-expired-${row.staff_id}`, category: 'Staff Right to Work', severity: 'critical',
              title: 'Right to Work expired',
              detail: `${staffName} (${row.department}) — expired ${Math.abs(days)} days ago`,
              daysOverdue: Math.abs(days), linkPath: `/hr/staff/${row.staff_id}?tab=rtw`,
            });
          } else if (days <= 30) {
            rtwExpiring++;
            warnings.push({
              id: `rtw-expiring-${row.staff_id}`, category: 'Staff Right to Work', severity: 'warning',
              title: 'Right to Work expiring soon',
              detail: `${staffName} — expires in ${days} days`, linkPath: `/hr/staff/${row.staff_id}?tab=rtw`,
            });
            addTimeline(row.expiry_date, 'Staff Right to Work', `${staffName} — Right to Work`);
          } else {
            rtwCompliant++;
            addTimeline(row.expiry_date, 'Staff Right to Work', `${staffName} — Right to Work`);
          }
        }
      } catch (e: any) {
        logger.warn('RTW query error (non-fatal):', e.message);
        loadErrors.push('Staff Right to Work');
      }

      const rtwScore = rtwTracked === 0 ? null : Math.round((rtwCompliant / rtwTracked) * 100);

      // ── 9. Staff DBS ──────────────────────────────────────────────────────────
      let staffDbsTotal = 0, staffDbsCompliant = 0;
      try {
        const { clause: sdbsSite, params: sdbsSiteP } = addSiteParam([], 's');
        const staffDbsResult = await pool.query(
          `SELECT d.id AS dbs_id, d.policy_expiry_date, s.id AS staff_id, s.first_name, s.last_name
           FROM "${schemaName}".staff_dbs d
           JOIN "${schemaName}".staff s ON s.id = d.staff_id
           WHERE d.is_current = TRUE AND d.deleted_at IS NULL AND s.is_active = TRUE${sdbsSite}`,
          sdbsSiteP
        );
        staffDbsTotal = staffDbsResult.rows.length;
        for (const row of staffDbsResult.rows) {
          const staffName = `${row.first_name} ${row.last_name}`;
          const days = daysUntil(row.policy_expiry_date);
          if (days !== null && days < 0) {
            criticalIssues.push({
              id: `sdbs-expired-${row.dbs_id}`, category: 'Staff DBS', severity: 'critical',
              title: 'Staff DBS expired',
              detail: `${staffName} — expired ${Math.abs(days)} days ago`,
              daysOverdue: Math.abs(days), linkPath: `/hr/staff/${row.staff_id}?tab=dbs`,
            });
          } else if (days !== null && days <= 30) {
            warnings.push({
              id: `sdbs-expiring-${row.dbs_id}`, category: 'Staff DBS', severity: 'warning',
              title: 'Staff DBS expiring soon',
              detail: `${staffName} — expires in ${days} days`, linkPath: `/hr/staff/${row.staff_id}?tab=dbs`,
            });
            addTimeline(row.policy_expiry_date, 'Staff DBS', `${staffName} — DBS`);
          } else {
            staffDbsCompliant++;
            addTimeline(row.policy_expiry_date, 'Staff DBS', `${staffName} — DBS`);
          }
        }
      } catch (e: any) {
        logger.warn('Staff DBS query error (non-fatal):', e.message);
        loadErrors.push('Staff DBS');
      }

      const staffDbsScore = staffDbsTotal === 0 ? null : Math.round((staffDbsCompliant / staffDbsTotal) * 100);

      // ── 10. Staff Training ────────────────────────────────────────────────────
      let staffTrainingTotal = 0, staffTrainingCompliant = 0;
      try {
        const { clause: strSite, params: strSiteP } = addSiteParam([], 's');
        const staffTrainingResult = await pool.query(
          `SELECT tr.id, tr.expiry_date, tr.course_name AS training_name,
                  s.id AS staff_id, s.first_name, s.last_name
           FROM "${schemaName}".staff_training_records tr
           JOIN "${schemaName}".staff s ON s.id = tr.staff_id
           WHERE tr.deleted_at IS NULL
             AND tr.is_mandatory = TRUE
             AND s.is_active = TRUE
             AND (s.employment_status IS NULL OR s.employment_status NOT IN ('leaver','archived'))
             AND tr.expiry_date IS NOT NULL${strSite}`,
          strSiteP
        );
        staffTrainingTotal = staffTrainingResult.rows.length;
        for (const row of staffTrainingResult.rows) {
          const staffName = `${row.first_name} ${row.last_name}`;
          const days = daysUntil(row.expiry_date);
          if (days !== null && days < 0) {
            criticalIssues.push({
              id: `strtrain-expired-${row.id}`, category: 'Staff Training', severity: 'critical',
              title: 'Mandatory training expired',
              detail: `${row.training_name} — ${staffName}, expired ${Math.abs(days)} days ago`,
              daysOverdue: Math.abs(days), linkPath: `/hr/staff/${row.staff_id}?tab=training`,
            });
          } else if (days !== null && days <= 30) {
            warnings.push({
              id: `strtrain-expiring-${row.id}`, category: 'Staff Training', severity: 'warning',
              title: 'Mandatory training expiring soon',
              detail: `${row.training_name} — ${staffName}, expires in ${days} days`,
              linkPath: `/hr/staff/${row.staff_id}?tab=training`,
            });
            addTimeline(row.expiry_date, 'Staff Training', `${row.training_name} — ${staffName}`);
          } else {
            staffTrainingCompliant++;
            addTimeline(row.expiry_date, 'Staff Training', `${row.training_name} — ${staffName}`);
          }
        }
      } catch (e: any) {
        logger.warn('Staff training query error (non-fatal):', e.message);
        loadErrors.push('Staff Training');
      }

      const staffTrainingScore = staffTrainingTotal === 0 ? null : Math.round((staffTrainingCompliant / staffTrainingTotal) * 100);

      // ── 11. Compliance Certificates ───────────────────────────────────────────
      let certsTotal = 0, certsCompliant = 0, certsExpiring = 0, certsExpired = 0;
      try {
        const { clause: cctSite, params: cctSiteP } = addSiteParam([], 'cc');
        const certRows = await pool.query(
          `SELECT ct.id, ct.display_name, cc.expiry_date, cc.status
           FROM "${schemaName}".compliance_certificate_types ct
           LEFT JOIN "${schemaName}".compliance_certificates cc
             ON cc.certificate_type_id = ct.id AND cc.is_current = true AND cc.deleted_at IS NULL${cctSite}
           WHERE ct.is_active = true`,
          cctSiteP
        );
        for (const row of certRows.rows) {
          if (!row.expiry_date && !row.status) continue;
          certsTotal++;
          const days = daysUntil(row.expiry_date);
          if (row.status === 'expired' || (days !== null && days < 0)) {
            certsExpired++;
            criticalIssues.push({
              id: `cert-expired-${row.id}`, category: 'Compliance Certificates', severity: 'critical',
              title: 'Compliance certificate expired', detail: row.display_name,
              daysOverdue: days !== null ? Math.abs(days) : undefined, linkPath: `/compliance-certificates?highlight=${row.id}`,
            });
          } else if (days !== null && days <= 30) {
            certsExpiring++;
            warnings.push({
              id: `cert-expiring-${row.id}`, category: 'Compliance Certificates', severity: 'warning',
              title: 'Compliance certificate expiring soon',
              detail: `${row.display_name} — expires in ${days} days`, linkPath: `/compliance-certificates?highlight=${row.id}`,
            });
            addTimeline(row.expiry_date, 'Compliance Certificates', row.display_name, `/compliance-certificates?highlight=${row.id}`);
          } else {
            certsCompliant++;
            addTimeline(row.expiry_date, 'Compliance Certificates', row.display_name, `/compliance-certificates?highlight=${row.id}`);
          }
        }
      } catch (e: any) {
        logger.warn('Compliance cert query error (non-fatal):', e.message);
        loadErrors.push('Compliance Certificates');
      }

      const certsScore = certsTotal === 0 ? null : Math.round((certsCompliant / certsTotal) * 100);

      // ── 12. Permits to Work ───────────────────────────────────────────────────
      let permitsTotal = 0, permitsCompliant = 0, permitsExpired = 0, permitsPending = 0;
      try {
        const { clause: ptwSite, params: ptwSiteP } = addSiteParam([ago12Months.toISOString()]);
        const permitsResult = await pool.query(
          `SELECT id, work_description, status, permit_valid_until, permit_number
           FROM "${schemaName}".permit_to_work
           WHERE status NOT IN ('completed', 'rejected', 'draft', 'cancelled')
           AND created_at >= $1${ptwSite}`,
          ptwSiteP
        );
        for (const row of permitsResult.rows) {
          permitsTotal++;
          const validUntil = row.permit_valid_until ? new Date(row.permit_valid_until) : null;
          const days = validUntil ? daysUntil(validUntil) : null;
          if (row.status === 'expired' || (days !== null && days < 0)) {
            permitsExpired++;
            criticalIssues.push({
              id: `permit-expired-${row.id}`, category: 'Permits to Work', severity: 'critical',
              title: 'Permit to Work expired without closure',
              detail: `${row.work_description} (${row.permit_number})`,
              daysOverdue: days !== null ? Math.abs(days) : undefined, linkPath: `/permit-to-work?highlight=${row.id}`,
            });
          } else if (row.status === 'pending') {
            permitsPending++;
            warnings.push({
              id: `permit-pending-${row.id}`, category: 'Permits to Work', severity: 'warning',
              title: 'Permit to Work awaiting authorisation',
              detail: `${row.work_description} (${row.permit_number})`, linkPath: `/permit-to-work?highlight=${row.id}`,
            });
          } else {
            permitsCompliant++;
            if (days !== null && days <= 7) {
              addTimeline(row.permit_valid_until, 'Permits to Work', row.work_description, `/permit-to-work?highlight=${row.id}`);
            }
          }
        }
      } catch (e: any) {
        logger.warn('Permits query error (non-fatal):', e.message);
        loadErrors.push('Permits to Work');
      }

      const permitsScore = permitsTotal === 0 ? null : Math.round((permitsCompliant / permitsTotal) * 100);

      // ── 13. Risk Assessments ──────────────────────────────────────────────────
      let raTotal = 0, raCompliant = 0, raReviewDue = 0;
      try {
        const raRows = await custDb.select({
          id: schema.raBuilderAssessments.id,
          title: schema.raBuilderAssessments.title,
          status: schema.raBuilderAssessments.status,
          nextReviewDate: schema.raBuilderAssessments.nextReviewDate,
        }).from(schema.raBuilderAssessments)
          .where(and(ne(schema.raBuilderAssessments.status, 'archived'), scopedWhere(siteContext, schema.raBuilderAssessments)));

        for (const ra of raRows) {
          raTotal++;
          const reviewDays = daysUntil(ra.nextReviewDate);
          if (reviewDays !== null && reviewDays < 0) {
            raReviewDue++;
            criticalIssues.push({
              id: `ra-overdue-${ra.id}`, category: 'Risk Assessments', severity: 'critical',
              title: 'Risk Assessment review overdue', detail: ra.title,
              daysOverdue: Math.abs(reviewDays), linkPath: `/ra-builder?highlight=${ra.id}`,
            });
          } else if (ra.status === 'review') {
            raReviewDue++;
            warnings.push({
              id: `ra-review-${ra.id}`, category: 'Risk Assessments', severity: 'warning',
              title: 'Risk Assessment pending review', detail: ra.title, linkPath: `/ra-builder?highlight=${ra.id}`,
            });
            addTimeline(ra.nextReviewDate, 'Risk Assessments', ra.title, `/ra-builder?highlight=${ra.id}`);
          } else {
            raCompliant++;
            addTimeline(ra.nextReviewDate, 'Risk Assessments', `${ra.title} — review`, `/ra-builder?highlight=${ra.id}`);
          }
        }
      } catch (e: any) {
        logger.warn('RA query error (non-fatal):', e.message);
        loadErrors.push('Risk Assessments');
      }

      const raScore = raTotal === 0 ? null : Math.round((raCompliant / raTotal) * 100);

      // ── 14. Audits ────────────────────────────────────────────────────────────
      let auditsTotal = 0, auditsCompliant = 0, auditsOverdue = 0;
      try {
        const auditRows = await custDb.select({
          id: schema.auditRecords.id,
          title: schema.auditRecords.title,
          status: schema.auditRecords.status,
          scheduledDate: schema.auditRecords.scheduledDate,
          passed: schema.auditRecords.passed,
        }).from(schema.auditRecords)
          .where(scopedWhere(siteContext, schema.auditRecords));

        for (const audit of auditRows) {
          if (audit.status === 'completed') {
            auditsTotal++;
            if (audit.passed !== false) {
              auditsCompliant++;
            } else {
              criticalIssues.push({
                id: `audit-failed-${audit.id}`, category: 'Audits', severity: 'critical',
                title: 'Audit failed', detail: audit.title, linkPath: `/audits?highlight=${audit.id}`,
              });
            }
          } else if (audit.status === 'overdue') {
            auditsTotal++;
            auditsOverdue++;
            criticalIssues.push({
              id: `audit-overdue-${audit.id}`, category: 'Audits', severity: 'critical',
              title: 'Audit overdue', detail: audit.title, linkPath: `/audits?highlight=${audit.id}`,
            });
          } else if (audit.status === 'scheduled' && audit.scheduledDate) {
            const scheduledDays = daysUntil(audit.scheduledDate);
            if (scheduledDays !== null && scheduledDays < 0) {
              auditsTotal++;
              auditsOverdue++;
              warnings.push({
                id: `audit-missed-${audit.id}`, category: 'Audits', severity: 'warning',
                title: 'Scheduled audit missed',
                detail: `${audit.title} — was due ${Math.abs(scheduledDays)} days ago`, linkPath: `/audits?highlight=${audit.id}`,
              });
            } else if (scheduledDays !== null && scheduledDays <= 14) {
              addTimeline(audit.scheduledDate, 'Audits', audit.title, `/audits?highlight=${audit.id}`);
            }
          }
        }

        // Extended: open corrective actions with overdue due dates
        try {
          const caSiteP: any[] = enterpriseSiteId ? [enterpriseSiteId] : [];
          const siteAuditFilter = enterpriseSiteId
            ? ` AND audit_id IN (SELECT id FROM "${schemaName}".audit_records WHERE site_id = $1)`
            : '';
          const correctiveResult = await pool.query(
            `SELECT id, description, due_date
             FROM "${schemaName}".audit_corrective_actions
             WHERE status = 'open' AND due_date < NOW()${siteAuditFilter}`,
            caSiteP
          );
          for (const row of correctiveResult.rows) {
            const days = daysUntil(row.due_date);
            criticalIssues.push({
              id: `audit-ca-overdue-${row.id}`, category: 'Audits', severity: 'critical',
              title: 'Corrective action overdue',
              detail: row.description,
              daysOverdue: days !== null ? Math.abs(days) : undefined,
              linkPath: `/audits?action=${row.id}`,
            });
          }
        } catch (e: any) {
          logger.warn('Audit corrective actions query error (non-fatal):', e.message);
        }
      } catch (e: any) {
        logger.warn('Audit query error (non-fatal):', e.message);
        loadErrors.push('Audits');
      }

      const auditsScore = auditsTotal === 0 ? null : Math.round((auditsCompliant / auditsTotal) * 100);

      // ── 15. PPM Work Orders ───────────────────────────────────────────────────
      let ppmTotal = 0, ppmOverdue = 0, ppmDueSoon = 0;
      try {
        const ppmOrders = await custDb.select({
          id: schema.ppmWorkOrders.id,
          title: schema.ppmWorkOrders.title,
          status: schema.ppmWorkOrders.status,
          dueDate: schema.ppmWorkOrders.dueDate,
        }).from(schema.ppmWorkOrders)
          .where(and(ne(schema.ppmWorkOrders.status, 'completed'), scopedWhere(siteContext, schema.ppmWorkOrders)));

        ppmTotal = ppmOrders.length;

        for (const o of ppmOrders) {
          if (o.status === 'overdue') {
            ppmOverdue++;
            const dueDate = o.dueDate ? new Date(o.dueDate) : null;
            criticalIssues.push({
              id: `ppm-overdue-${o.id}`, category: 'PPM / Maintenance', severity: 'critical',
              title: 'PPM work order overdue', detail: o.title,
              daysOverdue: dueDate ? Math.ceil((now.getTime() - dueDate.getTime()) / 86400000) : undefined,
              linkPath: `/ppm?highlight=${o.id}`,
            });
          } else if (o.dueDate) {
            const days = daysUntil(o.dueDate)!;
            if (days <= 7 && days >= 0) {
              ppmDueSoon++;
              warnings.push({
                id: `ppm-soon-${o.id}`, category: 'PPM / Maintenance', severity: 'warning',
                title: 'PPM work order due this week',
                detail: `${o.title} — due in ${days} days`, linkPath: `/ppm?highlight=${o.id}`,
              });
            }
            addTimeline(o.dueDate, 'PPM', o.title, `/ppm?highlight=${o.id}`);
          }
        }
      } catch (e: any) {
        logger.warn('PPM query error (non-fatal):', e.message);
        loadErrors.push('PPM');
      }

      const ppmCompliant = ppmTotal - ppmOverdue;
      const ppmScore = ppmTotal === 0 ? null : Math.round((ppmCompliant / ppmTotal) * 100);

      // ── 16. Fire Risk Assessments ─────────────────────────────────────────────
      let fraTotal = 0, fraCurrent = 0, fraReviewDue = 0, fraOverdue = 0;
      try {
        const fras = await custDb.select().from(schema.fireRiskAssessments)
          .where(scopedWhere(siteContext, schema.fireRiskAssessments));
        fraTotal = fras.length;
        for (const fra of fras) {
          if (fra.status === 'overdue') {
            fraOverdue++;
            criticalIssues.push({
              id: `fra-overdue-${fra.id}`, category: 'Fire Risk Assessment', severity: 'critical',
              title: 'Fire Risk Assessment overdue',
              detail: fra.title || 'Fire Risk Assessment', linkPath: `/fire-risk-assessment?highlight=${fra.id}`,
            });
          } else if (fra.status === 'review_due') {
            fraReviewDue++;
            warnings.push({
              id: `fra-review-${fra.id}`, category: 'Fire Risk Assessment', severity: 'warning',
              title: 'Fire Risk Assessment review due',
              detail: `${fra.title} — next review: ${fra.nextReviewDate}`, linkPath: `/fire-risk-assessment?highlight=${fra.id}`,
            });
            addTimeline(fra.nextReviewDate, 'Fire Risk Assessment', `${fra.title} — review`, `/fire-risk-assessment?highlight=${fra.id}`);
          } else {
            fraCurrent++;
            addTimeline(fra.nextReviewDate, 'Fire Risk Assessment', `${fra.title} — review`, `/fire-risk-assessment?highlight=${fra.id}`);
          }
        }
      } catch (e: any) {
        logger.warn('FRA query error (non-fatal):', e.message);
        loadErrors.push('Fire Risk Assessment');
      }

      const fraScore = fraTotal === 0 ? null : Math.round((fraCurrent / fraTotal) * 100);

      // ── 17. Document Approvals ────────────────────────────────────────────────
      let docApprovalsCount = 0;
      try {
        const { clause: daSite, params: daSiteP } = addSiteParam([]);
        const docApprovalsResult = await pool.query(
          `SELECT COUNT(*)::int AS n
           FROM "${schemaName}".contractor_documents
           WHERE status = 'pending' AND is_active = TRUE${daSite}`,
          daSiteP
        );
        docApprovalsCount = Number(docApprovalsResult.rows[0]?.n || 0);
        if (docApprovalsCount > 0) {
          warnings.push({
            id: `doc-approvals-pending`, category: 'Document Approvals', severity: 'warning',
            title: `${docApprovalsCount} document${docApprovalsCount !== 1 ? 's' : ''} awaiting approval`,
            detail: `${docApprovalsCount} contractor document${docApprovalsCount !== 1 ? 's' : ''} pending review`,
            linkPath: '/contractors?tab=contractors&gaps=true&sort=true',
          });
        }
      } catch (e: any) {
        logger.warn('Document approvals query error (non-fatal):', e.message);
        loadErrors.push('Document Approvals');
      }

      // ── Score helpers ─────────────────────────────────────────────────────────
      // Null scores mean "no data tracked" — excluded from weighted averages so
      // untracked categories never inflate the overall score.
      function weightedAverage(items: { score: number | null; weight: number }[]): number | null {
        const tracked = items.filter(i => i.score !== null) as { score: number; weight: number }[];
        if (tracked.length === 0) return null;
        const totalW = tracked.reduce((s, i) => s + i.weight, 0);
        return Math.round(tracked.reduce((s, i) => s + i.score * (i.weight / totalW), 0));
      }
      function scoreToBand(score: number | null): 'green' | 'amber' | 'orange' | 'red' | 'grey' {
        if (score === null) return 'grey';
        return score >= 90 ? 'green' : score >= 70 ? 'amber' : score >= 50 ? 'orange' : 'red';
      }

      // ── Domain Scores ─────────────────────────────────────────────────────────
      // Untracked categories (null) are excluded; weights are re-normalised across
      // the tracked subset so missing data never inflates the domain score.
      // Contractor: Insurance 25%, RAMS 15%, Inductions 15%, Worker RTW 15%,
      //             Worker DBS 10%, Worker Certifications 10%, Equipment 10%
      const contractorItems = [
        { score: insScore,        weight: 0.25 },
        { score: ramsScore,       weight: 0.15 },
        { score: indScore,        weight: 0.15 },
        { score: workerRtwScore,  weight: 0.15 },
        { score: workerDbsScore,  weight: 0.10 },
        { score: workerCertScore, weight: 0.10 },
        { score: equipScore,      weight: 0.10 },
      ];
      const contractorScore = weightedAverage(contractorItems);
      const contractorTracked = contractorItems.filter(i => i.score !== null).length;

      // Site: Compliance Certs 20%, Permits 15%, Risk Assessments 15%, Audits 15%,
      //       PPM 10%, FRA 10%, Staff RTW 10%, Staff DBS 2.5%, Staff Training 2.5%
      const siteItems = [
        { score: certsScore,         weight: 0.20 },
        { score: permitsScore,       weight: 0.15 },
        { score: raScore,            weight: 0.15 },
        { score: auditsScore,        weight: 0.15 },
        { score: ppmScore,           weight: 0.10 },
        { score: fraScore,           weight: 0.10 },
        { score: rtwScore,           weight: 0.10 },
        { score: staffDbsScore,      weight: 0.025 },
        { score: staffTrainingScore, weight: 0.025 },
      ];
      const siteScore = weightedAverage(siteItems);
      const siteTracked = siteItems.filter(i => i.score !== null).length;

      // Overall = 50% contractor + 50% site (tracked domains only)
      const overallScore = weightedAverage([
        { score: contractorScore, weight: 0.50 },
        { score: siteScore,       weight: 0.50 },
      ]);

      const contractorBand = scoreToBand(contractorScore);
      const siteBand = scoreToBand(siteScore);
      const riskBand = scoreToBand(overallScore);
      const riskLabel = riskBand === 'green' ? 'Good Standing'
        : riskBand === 'amber' ? 'Attention Required'
        : riskBand === 'orange' ? 'At Risk'
        : riskBand === 'red' ? 'Critical'
        : 'Insufficient Data';

      const contractorTotal = contractorItems.length;
      const siteTotal = siteItems.length;
      const trackedCategories = contractorTracked + siteTracked;
      const totalCategories = contractorTotal + siteTotal;

      const topContractorRisks = Object.values(contractorRiskMap)
        .filter(c => c.issueCount > 0)
        .sort((a, b) => b.issueCount - a.issueCount)
        .slice(0, 5);

      expiryTimeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const totalChecks = insTotal + ramsTotal + indTotal +
        workerRtwTotal + workerDbsTotal + workerCertTotal + equipTotal +
        rtwTracked + staffDbsTotal + staffTrainingTotal +
        certsTotal + permitsTotal + raTotal + auditsTotal + ppmTotal + fraTotal;

      const responseData = {
        overallScore,
        contractorScore,
        siteScore,
        contractorBand,
        siteBand,
        riskBand,
        riskLabel,
        calculatedAt: new Date().toISOString(),
        totalChecks,
        trackedCategories,
        totalCategories,
        contractorTracked,
        contractorTotal,
        siteTracked,
        siteTotal,
        loadErrors,
        categories: {
          contractorInsurance: { total: insTotal, compliant: insCompliant, expiring: insExpiring, expired: insExpired, missing: insMissing, score: insScore },
          rams: { total: ramsTotal, compliant: ramsValid, expiring: ramsExpiring, expired: ramsExpired, score: ramsScore },
          inductions: { total: indTotal, compliant: indCompliant, overdue: indOverdue, score: indScore },
          workerRightToWork: { total: workerRtwTotal, compliant: workerRtwCompliant, score: workerRtwScore },
          workerDbs: { total: workerDbsTotal, compliant: workerDbsCompliant, score: workerDbsScore },
          workerCertifications: { total: workerCertTotal, compliant: workerCertCompliant, score: workerCertScore },
          equipment: { total: equipTotal, compliant: equipCompliant, score: equipScore },
          staffRightToWork: { tracked: rtwTracked, compliant: rtwCompliant, expiring: rtwExpiring, expired: rtwExpired, score: rtwScore },
          staffDbs: { total: staffDbsTotal, compliant: staffDbsCompliant, score: staffDbsScore },
          staffTraining: { total: staffTrainingTotal, compliant: staffTrainingCompliant, score: staffTrainingScore },
          complianceCerts: { total: certsTotal, compliant: certsCompliant, expiring: certsExpiring, expired: certsExpired, score: certsScore },
          permits: { total: permitsTotal, compliant: permitsCompliant, expired: permitsExpired, pending: permitsPending, score: permitsScore },
          riskAssessments: { total: raTotal, compliant: raCompliant, reviewDue: raReviewDue, score: raScore },
          audits: { total: auditsTotal, compliant: auditsCompliant, overdue: auditsOverdue, score: auditsScore },
          ppm: { total: ppmTotal, compliant: ppmCompliant, overdue: ppmOverdue, dueSoon: ppmDueSoon, score: ppmScore },
          fireRiskAssessment: { total: fraTotal, current: fraCurrent, reviewDue: fraReviewDue, overdue: fraOverdue, score: fraScore },
          documentApprovals: { total: docApprovalsCount, compliant: docApprovalsCount, score: null },
        },
        criticalIssues,
        warnings,
        topContractorRisks,
        expiryTimeline,
      };

      // Fix 4 — populate cache then respond
      _dashboardCache.set(cacheKey, { data: responseData, expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS });
      res.json(responseData);
    } catch (err: any) {
      logger.error('Compliance dashboard error:', err);
      res.status(500).json({ error: 'Failed to generate compliance dashboard' });
    }
  });
}
