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
      const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
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
      const companies = await custDb.select({
        id: schema.contractorCompanies.id,
        name: schema.contractorCompanies.companyName,
        plExpiry: schema.contractorCompanies.publicLiabilityExpiryDate,
        elExpiry: schema.contractorCompanies.employersLiabilityExpiryDate,
        isActive: schema.contractorCompanies.isActive,
      }).from(schema.contractorCompanies)
        .where(eq(schema.contractorCompanies.isActive, true));

      let insTotal = 0, insCompliant = 0, insExpiring = 0, insExpired = 0;

      for (const c of companies) {
        ensureContractorRisk(c.id, c.name);

        const checkInsurance = (expiry: Date | null | undefined, label: string, idPrefix: string) => {
          if (!expiry) return;
          insTotal++;
          const days = daysUntil(expiry)!;
          if (days < 0) {
            insExpired++;
            criticalIssues.push({
              id: `${idPrefix}-expired-${c.id}`, category: 'Contractor Insurance', severity: 'critical',
              title: `${label} expired`, detail: `${c.name} — expired ${Math.abs(days)} days ago`,
              daysOverdue: Math.abs(days), linkPath: '/contractors',
            });
            contractorRiskMap[c.id].issues.push(`${label} expired`);
            contractorRiskMap[c.id].issueCount++;
          } else if (days <= 30) {
            insExpiring++;
            warnings.push({
              id: `${idPrefix}-expiring-${c.id}`, category: 'Contractor Insurance', severity: 'warning',
              title: `${label} expiring soon`, detail: `${c.name} — expires in ${days} days`, linkPath: '/contractors',
            });
            contractorRiskMap[c.id].issues.push(`${label} expires in ${days} days`);
            contractorRiskMap[c.id].issueCount++;
            addTimeline(expiry, 'Contractor Insurance', `${c.name} — ${label}`);
          } else {
            insCompliant++;
            addTimeline(expiry, 'Contractor Insurance', `${c.name} — ${label}`);
          }
        };

        checkInsurance(c.plExpiry, 'Public Liability insurance', 'pl');
        checkInsurance(c.elExpiry, 'Employers Liability insurance', 'el');
      }

      const insScore = insTotal === 0 ? 100 : Math.round((insCompliant / insTotal) * 100);

      // ── 2. RAMS Documents ─────────────────────────────────────────────────────
      const rams = await custDb.select().from(schema.ramsDocuments)
        .where(eq(schema.ramsDocuments.isActive, true));

      let ramsTotal = rams.length, ramsValid = 0, ramsExpiring = 0, ramsExpired = 0;

      for (const r of rams) {
        const companyName = companies.find(c => c.id === r.companyId)?.name;
        if (r.status === 'expired') {
          ramsExpired++;
          criticalIssues.push({
            id: `rams-expired-${r.id}`, category: 'RAMS Documents', severity: 'critical',
            title: 'RAMS document expired', detail: `${r.documentName} (${r.ramsIdRef})`, linkPath: '/contractors',
          });
          if (companyName && r.companyId) {
            ensureContractorRisk(r.companyId, companyName);
            contractorRiskMap[r.companyId].issues.push(`RAMS expired: ${r.documentName}`);
            contractorRiskMap[r.companyId].issueCount++;
          }
        } else if (r.status === 'expiring') {
          ramsExpiring++;
          warnings.push({
            id: `rams-expiring-${r.id}`, category: 'RAMS Documents', severity: 'warning',
            title: 'RAMS document expiring soon', detail: `${r.documentName} (${r.ramsIdRef})`, linkPath: '/contractors',
          });
          addTimeline(r.expiryDate, 'RAMS', r.documentName);
        } else {
          ramsValid++;
          addTimeline(r.expiryDate, 'RAMS', r.documentName);
        }
      }

      const ramsScore = ramsTotal === 0 ? 100 : Math.round((ramsValid / ramsTotal) * 100);

      // ── 3. Contractor Inductions ──────────────────────────────────────────────
      let indTotal = 0, indCompliant = 0, indOverdue = 0;
      try {
        const recentVisitsResult = await pool.query(
          `SELECT DISTINCT worker_id FROM "${schemaName}".contractor_visits WHERE checked_in_at >= $1`,
          [ago12Months.toISOString()]
        );
        const activeWorkerIds = new Set<string>(recentVisitsResult.rows.map((r: any) => r.worker_id).filter(Boolean));

        const workers = await custDb.select({
          id: schema.contractorWorkers.id,
          firstName: schema.contractorWorkers.firstName,
          lastName: schema.contractorWorkers.lastName,
          companyId: schema.contractorWorkers.companyId,
          siteInductionCompleted: schema.contractorWorkers.siteInductionCompleted,
          siteInductionExpiryDate: schema.contractorWorkers.siteInductionExpiryDate,
          isActive: schema.contractorWorkers.isActive,
        }).from(schema.contractorWorkers)
          .where(eq(schema.contractorWorkers.isActive, true));

        const activeWorkers = workers.filter(w => activeWorkerIds.has(w.id));
        indTotal = activeWorkers.length;

        for (const w of activeWorkers) {
          const workerName = `${w.firstName} ${w.lastName}`;
          const companyName = companies.find(c => c.id === w.companyId)?.name ?? '';
          const expiryDays = daysUntil(w.siteInductionExpiryDate);

          if (expiryDays !== null && expiryDays < 0) {
            indOverdue++;
            criticalIssues.push({
              id: `ind-expired-${w.id}`, category: 'Contractor Inductions', severity: 'critical',
              title: 'Site induction expired', detail: `${workerName}`,
              daysOverdue: Math.abs(expiryDays), linkPath: '/contractors',
            });
            if (w.companyId && companyName) {
              ensureContractorRisk(w.companyId, companyName);
              contractorRiskMap[w.companyId].issues.push(`Induction expired: ${workerName}`);
              contractorRiskMap[w.companyId].issueCount++;
            }
          } else if (!w.siteInductionCompleted) {
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
                title: 'Site induction expiring soon', detail: `${workerName} — expires in ${expiryDays} days`, linkPath: '/contractors',
              });
            }
            addTimeline(w.siteInductionExpiryDate, 'Contractor Inductions', `${workerName} — Induction`);
          }
        }
      } catch (e: any) {
        logger.warn('Induction query error (non-fatal):', e.message);
      }

      const indScore = indTotal === 0 ? 100 : Math.round((indCompliant / indTotal) * 100);

      // ── 4. Compliance Certificates ────────────────────────────────────────────
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
              title: 'Compliance certificate expiring soon', detail: `${row.display_name} — expires in ${days} days`, linkPath: '/compliance-certificates',
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

      // ── 5. PPM Work Orders ────────────────────────────────────────────────────
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
                title: 'PPM work order due this week', detail: `${o.title} — due in ${days} days`, linkPath: '/ppm',
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

      // ── 6. Fire Risk Assessments ──────────────────────────────────────────────
      let fraTotal = 0, fraCurrent = 0, fraReviewDue = 0, fraOverdue = 0;
      try {
        const fras = await custDb.select().from(schema.fireRiskAssessments);
        fraTotal = fras.length;
        for (const fra of fras) {
          if (fra.status === 'overdue') {
            fraOverdue++;
            criticalIssues.push({
              id: `fra-overdue-${fra.id}`, category: 'Fire Risk Assessment', severity: 'critical',
              title: 'Fire Risk Assessment overdue', detail: fra.title || 'Fire Risk Assessment', linkPath: '/fire-risk-assessment',
            });
          } else if (fra.status === 'review_due') {
            fraReviewDue++;
            warnings.push({
              id: `fra-review-${fra.id}`, category: 'Fire Risk Assessment', severity: 'warning',
              title: 'Fire Risk Assessment review due', detail: `${fra.title} — next review: ${fra.nextReviewDate}`, linkPath: '/fire-risk-assessment',
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

      // ── 7. Staff Right to Work ────────────────────────────────────────────────
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
              title: 'Right to Work expired', detail: `${staffName} (${row.department}) — expired ${Math.abs(days)} days ago`,
              daysOverdue: Math.abs(days), linkPath: '/hr',
            });
          } else if (days <= 30) {
            rtwExpiring++;
            warnings.push({
              id: `rtw-expiring-${row.staff_id}`, category: 'Staff Right to Work', severity: 'warning',
              title: 'Right to Work expiring soon', detail: `${staffName} — expires in ${days} days`, linkPath: '/hr',
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

      // ── Overall Score ─────────────────────────────────────────────────────────
      const overallScore = Math.round(
        insScore * 0.20 +
        ramsScore * 0.15 +
        indScore * 0.15 +
        certsScore * 0.15 +
        ppmScore * 0.15 +
        fraScore * 0.10 +
        rtwScore * 0.10
      );

      const riskBand = overallScore >= 90 ? 'green' : overallScore >= 70 ? 'amber' : overallScore >= 50 ? 'orange' : 'red';
      const riskLabel = riskBand === 'green' ? 'Good Standing' : riskBand === 'amber' ? 'Attention Required' : riskBand === 'orange' ? 'At Risk' : 'Critical';

      const topContractorRisks = Object.values(contractorRiskMap)
        .filter(c => c.issueCount > 0)
        .sort((a, b) => b.issueCount - a.issueCount)
        .slice(0, 5);

      expiryTimeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const totalChecks = insTotal + ramsTotal + indTotal + certsTotal + ppmTotal + fraTotal + rtwTracked;

      res.json({
        overallScore,
        riskBand,
        riskLabel,
        calculatedAt: new Date().toISOString(),
        totalChecks,
        categories: {
          contractorInsurance: { total: insTotal, compliant: insCompliant, expiring: insExpiring, expired: insExpired, score: insScore },
          rams: { total: ramsTotal, compliant: ramsValid, expiring: ramsExpiring, expired: ramsExpired, score: ramsScore },
          inductions: { total: indTotal, compliant: indCompliant, overdue: indOverdue, score: indScore },
          complianceCerts: { total: certsTotal, compliant: certsCompliant, expiring: certsExpiring, expired: certsExpired, score: certsScore },
          ppm: { total: ppmTotal, compliant: ppmCompliant, overdue: ppmOverdue, dueSoon: ppmDueSoon, score: ppmScore },
          fireRiskAssessment: { total: fraTotal, current: fraCurrent, reviewDue: fraReviewDue, overdue: fraOverdue, score: fraScore },
          staffRightToWork: { tracked: rtwTracked, compliant: rtwCompliant, expiring: rtwExpiring, expired: rtwExpired, score: rtwScore },
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
