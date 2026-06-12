import type { Express } from 'express';
import { requireAuth } from '../auth';
import { customerDbService } from '../customerDatabase';
import { simpleDatabaseService } from '../simpleDatabaseService';
import * as schema from '../isolatedSchema';
import { eq, ne } from 'drizzle-orm';
import { logger } from '../utils/logger';

const requireComplianceDashboardFeature = async (req: any, res: any, next: any) => {
  try {
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

  app.get('/api/compliance-dashboard', requireAuth, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      const pool = (custDb as any).$client ?? (custDb as any).session?.client;

      const now = new Date();
      const ago12Months = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

      const criticalIssues: any[] = [];
      const warnings: any[] = [];
      const expiryTimeline: any[] = [];
      const contractorRiskMap: Record<string, { id: string; name: string; issues: string[]; issueCount: number }> = {};

      function daysUntil(date: Date | string | null | undefined): number | null {
        if (!date) return null;
        const d = date instanceof Date ? date : new Date(date);
        if (isNaN(d.getTime())) return null;
        return Math.ceil((d.getTime() - now.getTime()) / 86400000);
      }

      function isoDate(date: Date | string | null | undefined): string | null {
        if (!date) return null;
        const d = date instanceof Date ? date : new Date(date);
        if (isNaN(d.getTime())) return null;
        return d.toISOString().split('T')[0];
      }

      function addTimeline(date: Date | string | null | undefined, category: string, item: string) {
        const days = daysUntil(date);
        if (days !== null && days >= 0 && days <= 90) {
          expiryTimeline.push({ date: isoDate(date)!, category, item, daysUntilExpiry: days });
        }
      }

      function ensureContractorRisk(id: string, name: string) {
        if (!contractorRiskMap[id]) contractorRiskMap[id] = { id, name, issues: [], issueCount: 0 };
      }

      // ── 1. Contractor Insurance ───────────────────────────────────────────────
      let insTotal = 0, insCompliant = 0, insExpiring = 0, insExpired = 0;
      let companies: any[] = [];

      try {
        const companiesResult = await pool.query(
          `SELECT id, company_name, is_active,
                  public_liability_expiry_date, employers_liability_expiry_date,
                  professional_indemnity_expiry_date, health_safety_policy_expiry_date,
                  chas_expiry_date, chas_certified,
                  safe_contractor_expiry_date, safe_contractor_certified
           FROM "${schemaName}".contractor_companies
           WHERE is_active = TRUE`
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
          }).from(schema.contractorCompanies).where(eq(schema.contractorCompanies.isActive, true));
          companies = drizzleCompanies.map(c => ({
            id: c.id,
            company_name: c.companyName,
            public_liability_expiry_date: c.plExpiry,
            employers_liability_expiry_date: c.elExpiry,
          }));
        } catch (e2: any) {
          logger.warn('Contractor companies fallback query error (non-fatal):', e2.message);
        }
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
                daysOverdue: Math.abs(days), linkPath: '/contractors',
              });
              contractorRiskMap[c.id].issues.push(`${label} expired`);
              contractorRiskMap[c.id].issueCount++;
            } else if (days <= 30) {
              insExpiring++;
              warnings.push({
                id: `${idPrefix}-expiring-${c.id}`, category: 'Contractor Insurance', severity: 'warning',
                title: `${label} expiring soon`,
                detail: `${c.company_name} — expires in ${days} days`, linkPath: '/contractors',
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
            warnings.push({
              id: `ins-missing-${c.id}`, category: 'Contractor Insurance', severity: 'warning',
              title: 'No insurance on record',
              detail: `${c.company_name} — no Public Liability or Employers Liability expiry date recorded`,
              linkPath: '/contractors',
            });
            contractorRiskMap[c.id].issues.push('No insurance on record');
            contractorRiskMap[c.id].issueCount++;
          }
        }
      } catch (e: any) {
        logger.warn('Insurance check error (non-fatal):', e.message);
      }

      const insScore = insTotal === 0 ? 100 : Math.round((insCompliant / insTotal) * 100);

      // ── 2. RAMS Documents ─────────────────────────────────────────────────────
      // NOTE: ramsDocuments.status is NOT kept in sync with expiryDate — nothing in
      // the system ever transitions it to 'expiring'/'expired'. So compute expiry
      // LIVE from expiryDate (matching Contractor Insurance / Compliance Certificates),
      // and treat the stored status only as a backstop for manual overrides.
      const rams = await custDb.select().from(schema.ramsDocuments)
        .where(eq(schema.ramsDocuments.isActive, true));

      let ramsTotal = rams.length, ramsValid = 0, ramsExpiring = 0, ramsExpired = 0;

      for (const r of rams) {
        const companyName = companies.find(c => c.id === r.companyId)?.company_name;
        const ramsDays = daysUntil(r.expiryDate);

        if (r.status === 'expired' || (ramsDays !== null && ramsDays < 0)) {
          ramsExpired++;
          criticalIssues.push({
            id: `rams-expired-${r.id}`, category: 'RAMS Documents', severity: 'critical',
            title: 'RAMS document expired',
            detail: ramsDays !== null && ramsDays < 0
              ? `${r.documentName} (${r.ramsIdRef}) — expired ${Math.abs(ramsDays)} days ago`
              : `${r.documentName} (${r.ramsIdRef})`,
            daysOverdue: ramsDays !== null && ramsDays < 0 ? Math.abs(ramsDays) : undefined,
            linkPath: '/contractors',
          });
          if (companyName && r.companyId) {
            ensureContractorRisk(r.companyId, companyName);
            contractorRiskMap[r.companyId].issues.push(`RAMS expired: ${r.documentName}`);
            contractorRiskMap[r.companyId].issueCount++;
          }
        } else if (r.status === 'expiring' || (ramsDays !== null && ramsDays <= 30)) {
          ramsExpiring++;
          warnings.push({
            id: `rams-expiring-${r.id}`, category: 'RAMS Documents', severity: 'warning',
            title: 'RAMS document expiring soon',
            detail: ramsDays !== null
              ? `${r.documentName} (${r.ramsIdRef}) — expires in ${ramsDays} days`
              : `${r.documentName} (${r.ramsIdRef})`,
            linkPath: '/contractors',
          });
          if (companyName && r.companyId) {
            ensureContractorRisk(r.companyId, companyName);
            contractorRiskMap[r.companyId].issues.push(`RAMS expiring: ${r.documentName}`);
            contractorRiskMap[r.companyId].issueCount++;
          }
          addTimeline(r.expiryDate, 'RAMS', r.documentName);
        } else {
          ramsValid++;
          addTimeline(r.expiryDate, 'RAMS', r.documentName);
        }
      }

      const ramsScore = ramsTotal === 0 ? 100 : Math.round((ramsValid / ramsTotal) * 100);

      // ── Active worker IDs (hoisted — reused across contractor worker sections) ──
      let activeWorkerIds = new Set<string>();
      try {
        const recentVisitsResult = await pool.query(
          `SELECT DISTINCT worker_id FROM "${schemaName}".contractor_visits WHERE checked_in_at >= $1`,
          [ago12Months.toISOString()]
        );
        activeWorkerIds = new Set<string>(recentVisitsResult.rows.map((r: any) => r.worker_id).filter(Boolean));
      } catch (e: any) {
        logger.warn('Active worker IDs query error (non-fatal):', e.message);
      }

      // ── 3. Contractor Inductions ──────────────────────────────────────────────
      let indTotal = 0, indCompliant = 0, indOverdue = 0;
      try {
        const workersResult = await pool.query(
          `SELECT id, first_name, last_name, company_id,
                  site_induction_completed, site_induction_expiry_date, site_induction_required
           FROM "${schemaName}".contractor_workers
           WHERE is_active = TRUE`
        );
        const activeWorkers = workersResult.rows.filter((w: any) => activeWorkerIds.has(w.id));
        indTotal = activeWorkers.length;

        for (const w of activeWorkers) {
          const workerName = `${w.first_name} ${w.last_name}`;
          const companyName = companies.find(c => c.id === w.company_id)?.company_name ?? '';
          const expiryDays = daysUntil(w.site_induction_expiry_date);

          if (expiryDays !== null && expiryDays < 0) {
            indOverdue++;
            criticalIssues.push({
              id: `ind-expired-${w.id}`, category: 'Contractor Inductions', severity: 'critical',
              title: 'Site induction expired', detail: workerName,
              daysOverdue: Math.abs(expiryDays), linkPath: '/contractors',
            });
            if (w.company_id && companyName) {
              ensureContractorRisk(w.company_id, companyName);
              contractorRiskMap[w.company_id].issues.push(`Induction expired: ${workerName}`);
              contractorRiskMap[w.company_id].issueCount++;
            }
          } else if (!w.site_induction_completed && w.site_induction_required !== false) {
            // Only flag as incomplete when induction is actually required
            indOverdue++;
            warnings.push({
              id: `ind-incomplete-${w.id}`, category: 'Contractor Inductions', severity: 'warning',
              title: 'Site induction not completed', detail: workerName, linkPath: '/contractors',
            });
          } else {
            indCompliant++;
            if (expiryDays !== null && expiryDays <= 30) {
              warnings.push({
                id: `ind-expiring-${w.id}`, category: 'Contractor Inductions', severity: 'warning',
                title: 'Site induction expiring soon',
                detail: `${workerName} — expires in ${expiryDays} days`, linkPath: '/contractors',
              });
            }
            addTimeline(w.site_induction_expiry_date, 'Contractor Inductions', `${workerName} — Induction`);
          }
        }
      } catch (e: any) {
        logger.warn('Induction query error (non-fatal):', e.message);
      }

      const indScore = indTotal === 0 ? 100 : Math.round((indCompliant / indTotal) * 100);

      // ── 4. Worker Right to Work ───────────────────────────────────────────────
      let workerRtwTotal = 0, workerRtwCompliant = 0;
      try {
        const workerRtwResult = await pool.query(
          `SELECT cw.id, cw.first_name, cw.last_name, cw.company_id,
                  cw.right_to_work_status, cw.right_to_work_expiry_date
           FROM "${schemaName}".contractor_workers cw
           WHERE cw.is_active = TRUE
             AND (cw.right_to_work_status IS NOT NULL OR cw.right_to_work_expiry_date IS NOT NULL)`
        );
        const activeRtwWorkers = workerRtwResult.rows.filter((w: any) => activeWorkerIds.has(w.id));
        workerRtwTotal = activeRtwWorkers.length;

        for (const w of activeRtwWorkers) {
          const workerName = `${w.first_name} ${w.last_name}`;
          const companyName = companies.find(c => c.id === w.company_id)?.company_name ?? '';
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
              linkPath: '/contractors',
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
              linkPath: '/contractors',
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
      }

      const workerRtwScore = workerRtwTotal === 0 ? 100 : Math.round((workerRtwCompliant / workerRtwTotal) * 100);

      // ── 5. Worker DBS ─────────────────────────────────────────────────────────
      let workerDbsTotal = 0, workerDbsCompliant = 0;
      try {
        const dbsResult = await pool.query(
          `SELECT d.id, d.policy_expiry_date, d.worker_id,
                  cw.first_name, cw.last_name, cw.company_id
           FROM "${schemaName}".contractor_worker_dbs d
           JOIN "${schemaName}".contractor_workers cw ON cw.id = d.worker_id
           WHERE d.is_current = TRUE AND d.deleted_at IS NULL AND cw.is_active = TRUE`
        );

        for (const row of dbsResult.rows) {
          workerDbsTotal++;
          const workerName = `${row.first_name} ${row.last_name}`;
          const companyName = companies.find(c => c.id === row.company_id)?.company_name ?? '';
          const days = daysUntil(row.policy_expiry_date);

          if (days !== null && days < 0) {
            criticalIssues.push({
              id: `wdbs-expired-${row.id}`, category: 'Worker DBS', severity: 'critical',
              title: 'Worker DBS expired',
              detail: `${workerName} — expired ${Math.abs(days)} days ago`,
              daysOverdue: Math.abs(days), linkPath: '/contractors',
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
              detail: `${workerName} — expires in ${days} days`, linkPath: '/contractors',
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
        const dbsRequiredResult = await pool.query(
          `SELECT cw.id, cw.first_name, cw.last_name, cw.company_id
           FROM "${schemaName}".contractor_workers cw
           WHERE cw.is_active = TRUE AND cw.dbs_required = TRUE
             AND NOT EXISTS (
               SELECT 1 FROM "${schemaName}".contractor_worker_dbs d
               WHERE d.worker_id = cw.id AND d.is_current = TRUE AND d.deleted_at IS NULL
             )`
        );
        for (const row of dbsRequiredResult.rows) {
          if (!activeWorkerIds.has(row.id)) continue;
          workerDbsTotal++;
          const workerName = `${row.first_name} ${row.last_name}`;
          const companyName = companies.find(c => c.id === row.company_id)?.company_name ?? '';
          warnings.push({
            id: `wdbs-missing-${row.id}`, category: 'Worker DBS', severity: 'warning',
            title: 'Worker DBS required but not on record',
            detail: workerName, linkPath: '/contractors',
          });
          if (row.company_id && companyName) {
            ensureContractorRisk(row.company_id, companyName);
            contractorRiskMap[row.company_id].issues.push(`DBS missing: ${workerName}`);
            contractorRiskMap[row.company_id].issueCount++;
          }
        }
      } catch (e: any) {
        logger.warn('Worker DBS query error (non-fatal):', e.message);
      }

      const workerDbsScore = workerDbsTotal === 0 ? 100 : Math.round((workerDbsCompliant / workerDbsTotal) * 100);

      // ── 6. Worker Certifications ──────────────────────────────────────────────
      let workerCertTotal = 0, workerCertCompliant = 0;
      try {
        const workerCertResult = await pool.query(
          `SELECT cd.id, cd.expiry_date, cd.document_name,
                  cw.id AS worker_id, cw.first_name, cw.last_name, cw.company_id
           FROM "${schemaName}".contractor_documents cd
           JOIN "${schemaName}".contractor_workers cw ON cw.id = cd.worker_id
           WHERE cd.worker_id IS NOT NULL AND cd.is_active = TRUE AND cd.expiry_date IS NOT NULL`
        );

        for (const row of workerCertResult.rows) {
          workerCertTotal++;
          const workerName = `${row.first_name} ${row.last_name}`;
          const companyName = companies.find(c => c.id === row.company_id)?.company_name ?? '';
          const days = daysUntil(row.expiry_date);

          if (days !== null && days < 0) {
            criticalIssues.push({
              id: `wcert-expired-${row.id}`, category: 'Worker Certifications', severity: 'critical',
              title: 'Worker certification expired',
              detail: `${row.document_name} — ${workerName}, expired ${Math.abs(days)} days ago`,
              daysOverdue: Math.abs(days), linkPath: '/contractors',
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
              detail: `${row.document_name} — ${workerName}, expires in ${days} days`, linkPath: '/contractors',
            });
            if (row.company_id && companyName) {
              ensureContractorRisk(row.company_id, companyName);
              contractorRiskMap[row.company_id].issues.push(`Cert expiring: ${row.document_name}`);
              contractorRiskMap[row.company_id].issueCount++;
            }
            addTimeline(row.expiry_date, 'Worker Certifications', `${row.document_name} — ${workerName}`);
          } else {
            workerCertCompliant++;
            addTimeline(row.expiry_date, 'Worker Certifications', `${row.document_name} — ${workerName}`);
          }
        }
      } catch (e: any) {
        logger.warn('Worker certifications query error (non-fatal):', e.message);
      }

      const workerCertScore = workerCertTotal === 0 ? 100 : Math.round((workerCertCompliant / workerCertTotal) * 100);

      // ── 7. Equipment ──────────────────────────────────────────────────────────
      let equipTotal = 0, equipCompliant = 0;
      try {
        const equipResult = await pool.query(
          `SELECT ce.id, ce.equipment_name, ce.company_id
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
          const companyName = companies.find(c => c.id === equip.company_id)?.company_name ?? '';
          const certs = certsByEquip.get(equip.id) ?? [];

          if (certs.length === 0) {
            warnings.push({
              id: `equip-nocert-${equip.id}`, category: 'Equipment', severity: 'warning',
              title: 'Equipment has no certification on record',
              detail: equip.equipment_name, linkPath: '/contractors',
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
                  daysOverdue: Math.abs(days), linkPath: '/contractors',
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
                  detail: `${cert.document_name} — ${equip.equipment_name}, expires in ${days} days`, linkPath: '/contractors',
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
      }

      const equipScore = equipTotal === 0 ? 100 : Math.round((equipCompliant / equipTotal) * 100);

      // ── 8. Staff Right to Work ────────────────────────────────────────────────
      let rtwTracked = 0, rtwCompliant = 0, rtwExpiring = 0, rtwExpired = 0;
      try {
        const rtwResult = await pool.query(
          `SELECT rtw.staff_id, rtw.expiry_date, s.first_name, s.last_name, s.department
           FROM "${schemaName}".right_to_work rtw
           JOIN "${schemaName}".staff s ON s.id = rtw.staff_id
           WHERE rtw.is_current = TRUE AND rtw.expiry_date IS NOT NULL AND s.is_active = TRUE`
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
              daysOverdue: Math.abs(days), linkPath: '/hr',
            });
          } else if (days <= 30) {
            rtwExpiring++;
            warnings.push({
              id: `rtw-expiring-${row.staff_id}`, category: 'Staff Right to Work', severity: 'warning',
              title: 'Right to Work expiring soon',
              detail: `${staffName} — expires in ${days} days`, linkPath: '/hr',
            });
            addTimeline(row.expiry_date, 'Staff Right to Work', `${staffName} — Right to Work`);
          } else {
            rtwCompliant++;
            addTimeline(row.expiry_date, 'Staff Right to Work', `${staffName} — Right to Work`);
          }
        }
      } catch (e: any) {
        logger.warn('RTW query error (non-fatal):', e.message);
      }

      const rtwScore = rtwTracked === 0 ? 100 : Math.round((rtwCompliant / rtwTracked) * 100);

      // ── 9. Staff DBS ──────────────────────────────────────────────────────────
      let staffDbsTotal = 0, staffDbsCompliant = 0;
      try {
        const staffDbsResult = await pool.query(
          `SELECT d.id AS dbs_id, d.policy_expiry_date, s.first_name, s.last_name
           FROM "${schemaName}".staff_dbs d
           JOIN "${schemaName}".staff s ON s.id = d.staff_id
           WHERE d.is_current = TRUE AND d.deleted_at IS NULL AND s.is_active = TRUE`
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
              daysOverdue: Math.abs(days), linkPath: '/hr',
            });
          } else if (days !== null && days <= 30) {
            warnings.push({
              id: `sdbs-expiring-${row.dbs_id}`, category: 'Staff DBS', severity: 'warning',
              title: 'Staff DBS expiring soon',
              detail: `${staffName} — expires in ${days} days`, linkPath: '/hr',
            });
            addTimeline(row.policy_expiry_date, 'Staff DBS', `${staffName} — DBS`);
          } else {
            staffDbsCompliant++;
            addTimeline(row.policy_expiry_date, 'Staff DBS', `${staffName} — DBS`);
          }
        }
      } catch (e: any) {
        logger.warn('Staff DBS query error (non-fatal):', e.message);
      }

      const staffDbsScore = staffDbsTotal === 0 ? 100 : Math.round((staffDbsCompliant / staffDbsTotal) * 100);

      // ── 10. Staff Training ────────────────────────────────────────────────────
      let staffTrainingTotal = 0, staffTrainingCompliant = 0;
      try {
        const staffTrainingResult = await pool.query(
          `SELECT tr.id, tr.expiry_date, tr.training_name,
                  s.first_name, s.last_name
           FROM "${schemaName}".staff_training_records tr
           JOIN "${schemaName}".staff s ON s.id = tr.staff_id
           WHERE tr.deleted_at IS NULL
             AND tr.is_mandatory = TRUE
             AND s.is_active = TRUE
             AND (s.employment_status IS NULL OR s.employment_status NOT IN ('leaver','archived'))
             AND tr.expiry_date IS NOT NULL`
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
              daysOverdue: Math.abs(days), linkPath: '/hr',
            });
          } else if (days !== null && days <= 30) {
            warnings.push({
              id: `strtrain-expiring-${row.id}`, category: 'Staff Training', severity: 'warning',
              title: 'Mandatory training expiring soon',
              detail: `${row.training_name} — ${staffName}, expires in ${days} days`, linkPath: '/hr',
            });
            addTimeline(row.expiry_date, 'Staff Training', `${row.training_name} — ${staffName}`);
          } else {
            staffTrainingCompliant++;
            addTimeline(row.expiry_date, 'Staff Training', `${row.training_name} — ${staffName}`);
          }
        }
      } catch (e: any) {
        logger.warn('Staff training query error (non-fatal):', e.message);
      }

      const staffTrainingScore = staffTrainingTotal === 0 ? 100 : Math.round((staffTrainingCompliant / staffTrainingTotal) * 100);

      // ── 11. Compliance Certificates ───────────────────────────────────────────
      let certsTotal = 0, certsCompliant = 0, certsExpiring = 0, certsExpired = 0;
      try {
        const certRows = await pool.query(
          `SELECT ct.id, ct.display_name, cc.expiry_date, cc.status
           FROM "${schemaName}".compliance_certificate_types ct
           LEFT JOIN "${schemaName}".compliance_certificates cc
             ON cc.certificate_type_id = ct.id AND cc.is_current = true AND cc.deleted_at IS NULL
           WHERE ct.is_active = true`
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
              daysOverdue: days !== null ? Math.abs(days) : undefined, linkPath: '/compliance-certificates',
            });
          } else if (days !== null && days <= 30) {
            certsExpiring++;
            warnings.push({
              id: `cert-expiring-${row.id}`, category: 'Compliance Certificates', severity: 'warning',
              title: 'Compliance certificate expiring soon',
              detail: `${row.display_name} — expires in ${days} days`, linkPath: '/compliance-certificates',
            });
            addTimeline(row.expiry_date, 'Compliance Certificates', row.display_name);
          } else {
            certsCompliant++;
            addTimeline(row.expiry_date, 'Compliance Certificates', row.display_name);
          }
        }
      } catch (e: any) {
        logger.warn('Compliance cert query error (non-fatal):', e.message);
      }

      const certsScore = certsTotal === 0 ? 100 : Math.round((certsCompliant / certsTotal) * 100);

      // ── 12. Permits to Work ───────────────────────────────────────────────────
      let permitsTotal = 0, permitsCompliant = 0, permitsExpired = 0, permitsPending = 0;
      try {
        const permitsResult = await pool.query(
          `SELECT id, work_description, status, permit_valid_until, permit_number
           FROM "${schemaName}".permit_to_work
           WHERE status NOT IN ('completed', 'rejected', 'draft')
           AND created_at >= $1`,
          [ago12Months.toISOString()]
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
              daysOverdue: days !== null ? Math.abs(days) : undefined, linkPath: '/permit-to-work',
            });
          } else if (row.status === 'pending') {
            permitsPending++;
            warnings.push({
              id: `permit-pending-${row.id}`, category: 'Permits to Work', severity: 'warning',
              title: 'Permit to Work awaiting authorisation',
              detail: `${row.work_description} (${row.permit_number})`, linkPath: '/permit-to-work',
            });
          } else {
            permitsCompliant++;
            if (days !== null && days <= 7) {
              addTimeline(row.permit_valid_until, 'Permits to Work', row.work_description);
            }
          }
        }
      } catch (e: any) {
        logger.warn('Permits query error (non-fatal):', e.message);
      }

      const permitsScore = permitsTotal === 0 ? 100 : Math.round((permitsCompliant / permitsTotal) * 100);

      // ── 13. Risk Assessments ──────────────────────────────────────────────────
      let raTotal = 0, raCompliant = 0, raReviewDue = 0;
      try {
        const raRows = await custDb.select({
          id: schema.raBuilderAssessments.id,
          title: schema.raBuilderAssessments.title,
          status: schema.raBuilderAssessments.status,
          nextReviewDate: schema.raBuilderAssessments.nextReviewDate,
        }).from(schema.raBuilderAssessments)
          .where(ne(schema.raBuilderAssessments.status, 'archived'));

        for (const ra of raRows) {
          raTotal++;
          const reviewDays = daysUntil(ra.nextReviewDate);
          if (reviewDays !== null && reviewDays < 0) {
            raReviewDue++;
            criticalIssues.push({
              id: `ra-overdue-${ra.id}`, category: 'Risk Assessments', severity: 'critical',
              title: 'Risk Assessment review overdue', detail: ra.title,
              daysOverdue: Math.abs(reviewDays), linkPath: '/ra-builder',
            });
          } else if (ra.status === 'review') {
            raReviewDue++;
            warnings.push({
              id: `ra-review-${ra.id}`, category: 'Risk Assessments', severity: 'warning',
              title: 'Risk Assessment pending review', detail: ra.title, linkPath: '/ra-builder',
            });
            addTimeline(ra.nextReviewDate, 'Risk Assessments', ra.title);
          } else {
            raCompliant++;
            addTimeline(ra.nextReviewDate, 'Risk Assessments', `${ra.title} — review`);
          }
        }
      } catch (e: any) {
        logger.warn('RA query error (non-fatal):', e.message);
      }

      const raScore = raTotal === 0 ? 100 : Math.round((raCompliant / raTotal) * 100);

      // ── 14. Audits ────────────────────────────────────────────────────────────
      let auditsTotal = 0, auditsCompliant = 0, auditsOverdue = 0;
      try {
        const auditRows = await custDb.select({
          id: schema.auditRecords.id,
          title: schema.auditRecords.title,
          status: schema.auditRecords.status,
          scheduledDate: schema.auditRecords.scheduledDate,
          passed: schema.auditRecords.passed,
        }).from(schema.auditRecords);

        for (const audit of auditRows) {
          if (audit.status === 'completed') {
            auditsTotal++;
            if (audit.passed !== false) {
              auditsCompliant++;
            } else {
              criticalIssues.push({
                id: `audit-failed-${audit.id}`, category: 'Audits', severity: 'critical',
                title: 'Audit failed', detail: audit.title, linkPath: '/audits',
              });
            }
          } else if (audit.status === 'overdue') {
            auditsTotal++;
            auditsOverdue++;
            criticalIssues.push({
              id: `audit-overdue-${audit.id}`, category: 'Audits', severity: 'critical',
              title: 'Audit overdue', detail: audit.title, linkPath: '/audits',
            });
          } else if (audit.status === 'scheduled' && audit.scheduledDate) {
            const scheduledDays = daysUntil(audit.scheduledDate);
            if (scheduledDays !== null && scheduledDays < 0) {
              auditsTotal++;
              auditsOverdue++;
              warnings.push({
                id: `audit-missed-${audit.id}`, category: 'Audits', severity: 'warning',
                title: 'Scheduled audit missed',
                detail: `${audit.title} — was due ${Math.abs(scheduledDays)} days ago`, linkPath: '/audits',
              });
            } else if (scheduledDays !== null && scheduledDays <= 14) {
              addTimeline(audit.scheduledDate, 'Audits', audit.title);
            }
          }
        }

        // Extended: open corrective actions with overdue due dates
        try {
          const correctiveResult = await pool.query(
            `SELECT id, description, due_date
             FROM "${schemaName}".audit_corrective_actions
             WHERE status = 'open' AND due_date < NOW()`
          );
          for (const row of correctiveResult.rows) {
            const days = daysUntil(row.due_date);
            criticalIssues.push({
              id: `audit-ca-overdue-${row.id}`, category: 'Audits', severity: 'critical',
              title: 'Corrective action overdue',
              detail: row.description,
              daysOverdue: days !== null ? Math.abs(days) : undefined,
              linkPath: '/audits',
            });
          }
        } catch (e: any) {
          logger.warn('Audit corrective actions query error (non-fatal):', e.message);
        }
      } catch (e: any) {
        logger.warn('Audit query error (non-fatal):', e.message);
      }

      const auditsScore = auditsTotal === 0 ? 100 : Math.round((auditsCompliant / auditsTotal) * 100);

      // ── 15. PPM Work Orders ───────────────────────────────────────────────────
      let ppmTotal = 0, ppmOverdue = 0, ppmDueSoon = 0;
      try {
        const ppmOrders = await custDb.select({
          id: schema.ppmWorkOrders.id,
          title: schema.ppmWorkOrders.title,
          status: schema.ppmWorkOrders.status,
          dueDate: schema.ppmWorkOrders.dueDate,
        }).from(schema.ppmWorkOrders)
          .where(ne(schema.ppmWorkOrders.status, 'completed'));

        ppmTotal = ppmOrders.length;

        for (const o of ppmOrders) {
          if (o.status === 'overdue') {
            ppmOverdue++;
            const dueDate = o.dueDate ? new Date(o.dueDate) : null;
            criticalIssues.push({
              id: `ppm-overdue-${o.id}`, category: 'PPM / Maintenance', severity: 'critical',
              title: 'PPM work order overdue', detail: o.title,
              daysOverdue: dueDate ? Math.ceil((now.getTime() - dueDate.getTime()) / 86400000) : undefined,
              linkPath: '/ppm',
            });
          } else if (o.dueDate) {
            const days = daysUntil(o.dueDate)!;
            if (days <= 7 && days >= 0) {
              ppmDueSoon++;
              warnings.push({
                id: `ppm-soon-${o.id}`, category: 'PPM / Maintenance', severity: 'warning',
                title: 'PPM work order due this week',
                detail: `${o.title} — due in ${days} days`, linkPath: '/ppm',
              });
            }
            addTimeline(o.dueDate, 'PPM', o.title);
          }
        }
      } catch (e: any) {
        logger.warn('PPM query error (non-fatal):', e.message);
      }

      const ppmCompliant = ppmTotal - ppmOverdue;
      const ppmScore = ppmTotal === 0 ? 100 : Math.round((ppmCompliant / ppmTotal) * 100);

      // ── 16. Fire Risk Assessments ─────────────────────────────────────────────
      let fraTotal = 0, fraCurrent = 0, fraReviewDue = 0, fraOverdue = 0;
      try {
        const fras = await custDb.select().from(schema.fireRiskAssessments);
        fraTotal = fras.length;
        for (const fra of fras) {
          if (fra.status === 'overdue') {
            fraOverdue++;
            criticalIssues.push({
              id: `fra-overdue-${fra.id}`, category: 'Fire Risk Assessment', severity: 'critical',
              title: 'Fire Risk Assessment overdue',
              detail: fra.title || 'Fire Risk Assessment', linkPath: '/fire-risk-assessment',
            });
          } else if (fra.status === 'review_due') {
            fraReviewDue++;
            warnings.push({
              id: `fra-review-${fra.id}`, category: 'Fire Risk Assessment', severity: 'warning',
              title: 'Fire Risk Assessment review due',
              detail: `${fra.title} — next review: ${fra.nextReviewDate}`, linkPath: '/fire-risk-assessment',
            });
            addTimeline(fra.nextReviewDate, 'Fire Risk Assessment', `${fra.title} — review`);
          } else {
            fraCurrent++;
            addTimeline(fra.nextReviewDate, 'Fire Risk Assessment', `${fra.title} — review`);
          }
        }
      } catch (e: any) {
        logger.warn('FRA query error (non-fatal):', e.message);
      }

      const fraScore = fraTotal === 0 ? 100 : Math.round((fraCurrent / fraTotal) * 100);

      // ── 17. Document Approvals ────────────────────────────────────────────────
      let docApprovalsCount = 0;
      try {
        const docApprovalsResult = await pool.query(
          `SELECT COUNT(*)::int AS n
           FROM "${schemaName}".contractor_documents
           WHERE status = 'pending' AND is_active = TRUE`
        );
        docApprovalsCount = Number(docApprovalsResult.rows[0]?.n || 0);
        if (docApprovalsCount > 0) {
          warnings.push({
            id: `doc-approvals-pending`, category: 'Document Approvals', severity: 'warning',
            title: `${docApprovalsCount} document${docApprovalsCount !== 1 ? 's' : ''} awaiting approval`,
            detail: `${docApprovalsCount} contractor document${docApprovalsCount !== 1 ? 's' : ''} pending review`,
            linkPath: '/contractors',
          });
        }
      } catch (e: any) {
        logger.warn('Document approvals query error (non-fatal):', e.message);
      }

      // ── Domain Scores ─────────────────────────────────────────────────────────
      // Contractor: Insurance 25%, RAMS 15%, Inductions 15%, Worker RTW 15%,
      //             Worker DBS 10%, Worker Certifications 10%, Equipment 10%
      const contractorScore = Math.round(
        insScore        * 0.25 +
        ramsScore       * 0.15 +
        indScore        * 0.15 +
        workerRtwScore  * 0.15 +
        workerDbsScore  * 0.10 +
        workerCertScore * 0.10 +
        equipScore      * 0.10
      );

      // Site: Compliance Certs 20%, Permits 15%, Risk Assessments 15%, Audits 15%,
      //       PPM 10%, FRA 10%, Staff RTW 10%, Staff DBS 2.5%, Staff Training 2.5%
      const siteScore = Math.round(
        certsScore        * 0.20 +
        permitsScore      * 0.15 +
        raScore           * 0.15 +
        auditsScore       * 0.15 +
        ppmScore          * 0.10 +
        fraScore          * 0.10 +
        rtwScore          * 0.10 +
        staffDbsScore     * 0.025 +
        staffTrainingScore * 0.025
      );

      // Overall = 50% contractor + 50% site
      const overallScore = Math.round(contractorScore * 0.50 + siteScore * 0.50);

      const contractorBand = contractorScore >= 90 ? 'green' : contractorScore >= 70 ? 'amber' : contractorScore >= 50 ? 'orange' : 'red';
      const siteBand = siteScore >= 90 ? 'green' : siteScore >= 70 ? 'amber' : siteScore >= 50 ? 'orange' : 'red';
      const riskBand = overallScore >= 90 ? 'green' : overallScore >= 70 ? 'amber' : overallScore >= 50 ? 'orange' : 'red';
      const riskLabel = riskBand === 'green' ? 'Good Standing' : riskBand === 'amber' ? 'Attention Required' : riskBand === 'orange' ? 'At Risk' : 'Critical';

      const topContractorRisks = Object.values(contractorRiskMap)
        .filter(c => c.issueCount > 0)
        .sort((a, b) => b.issueCount - a.issueCount)
        .slice(0, 5);

      expiryTimeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const totalChecks = insTotal + ramsTotal + indTotal +
        workerRtwTotal + workerDbsTotal + workerCertTotal + equipTotal +
        rtwTracked + staffDbsTotal + staffTrainingTotal +
        certsTotal + permitsTotal + raTotal + auditsTotal + ppmTotal + fraTotal;

      res.json({
        overallScore,
        contractorScore,
        siteScore,
        contractorBand,
        siteBand,
        riskBand,
        riskLabel,
        calculatedAt: new Date().toISOString(),
        totalChecks,
        categories: {
          contractorInsurance: { total: insTotal, compliant: insCompliant, expiring: insExpiring, expired: insExpired, score: insScore },
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
          documentApprovals: { total: docApprovalsCount, compliant: docApprovalsCount, score: 100 },
        },
        criticalIssues,
        warnings,
        topContractorRisks,
        expiryTimeline,
      });
    } catch (err: any) {
      logger.error('Compliance dashboard error:', err);
      res.status(500).json({ error: 'Failed to generate compliance dashboard' });
    }
  });
}
