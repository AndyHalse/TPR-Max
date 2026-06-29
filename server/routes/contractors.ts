import type { Express } from 'express';
import { handleContractorWorkerUpdate } from './induction';
import {
  createWorker as svcCreateWorker,
  archiveWorker as svcArchiveWorker,
  unarchiveWorker as svcUnarchiveWorker,
  hardDeleteWorker as svcHardDeleteWorker,
  issueCard as svcIssueCard,
  checkInWorker as svcCheckInWorker,
  checkOutWorker as svcCheckOutWorker,
  clearLoneWorkerState as svcClearLoneWorkerState,
  persistQrCode as svcPersistQrCode,
  persistHsToken as svcPersistHsToken,
  updateWorkerPostcode as svcUpdateWorkerPostcode,
  ServiceError,
  type WorkerServiceContext,
} from '../services/workerService';
import { requireAuth, isDevDataBypass, isDatabaseConnectionError, getMockCheckedInContractors } from '../auth';
import { getWorkerClearanceStatus, getCompanyComplianceStatus, reevaluateCompanyApproval, seedOnboardingRequirements, UK_DEFAULT_REQUIREMENTS } from '../utils/contractorCompliance';
import { databaseService } from '../databaseService';
import { simpleDatabaseService } from '../simpleDatabaseService';
import { CustomerDatabaseService, customerDbService } from '../customerDatabase';
import { EmailService, emailService } from '../emailService';
import { inductionService } from '../inductionService';
import { CO2CalculationService } from '../co2CalculationService';
import { ObjectStorageService, parseObjectPath, objectStorageClient } from '../objectStorage';
import { aiService } from '../aiService';
import { websocketService } from '../websocketService';
import multer from 'multer';
import { db } from '../db';
import * as isolatedSchema from '../isolatedSchema';
import {
  insertContractorCompanySchema,
  insertContractorWorkerSchema,
  insertComplianceDocumentSchema,
  insertNvqQualificationSchema,
  insertRamsDocumentSchema,
  insertWorkerDocumentAssignmentSchema,
  insertWorkerDocumentAcceptanceSchema,
  ukHSDocumentTemplates,
  workerDocumentAssignments,
  workerDocumentAcceptances,
  contractorWorkers,
  contractorCompanies,
  contractorDocuments,
  contractorVisits,
  evacuations,
  evacuationAccountability,
  documentAutoFillMapping,
  contractorDocumentRequests,
  contractorWorkerDocumentRequests,
} from '@shared/schema';
import { z } from 'zod';
import { randomUUID, randomBytes } from 'crypto';
import {
  eq,
  and,
  sql,
  desc,
  or,
  not,
  gte,
  lt,
  ne,
  inArray,
  isNull,
  isNotNull,
} from 'drizzle-orm';
import { logger } from '../utils/logger';
import { getScopedDb, scopedWhere, withSiteId, SiteContextError } from '../siteScope';

// ─── Module-scope helpers ────────────────────────────────────────────────────

// Ensure all columns from isolatedSchema.contractorCompanies exist in the DB.
// Drizzle's RETURNING * (used in INSERT/SELECT) generates every schema column by name —
// if any column is absent the query fails with 42703.  Safe to call on every request:
// the Set prevents redundant round-trips after the first successful run per customer.
const _contractorColumnsEnsured = new Set<string>();
async function ensureContractorColumns(custDb: any, customerId: string): Promise<void> {
  if (_contractorColumnsEnsured.has(customerId)) return;
  const alters = [
    // contractor_companies — all columns added after original table creation
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS company_number TEXT`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS vat_number TEXT`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS registration_number TEXT`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS postcode TEXT`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS website TEXT`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS description TEXT`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS industry TEXT`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS primary_contact_name TEXT`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS primary_contact_email TEXT`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS primary_contact_phone TEXT`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS public_liability_insurer TEXT`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS public_liability_amount TEXT`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS public_liability_expiry_date TIMESTAMP`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS public_liability_policy_number TEXT`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS employers_liability_insurer TEXT`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS employers_liability_amount TEXT`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS employers_liability_expiry_date TIMESTAMP`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS employers_liability_policy_number TEXT`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS professional_indemnity_insurer TEXT`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS professional_indemnity_amount TEXT`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS professional_indemnity_expiry_date TIMESTAMP`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS professional_indemnity_policy_number TEXT`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS approved_by VARCHAR`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS suspended_reason TEXT`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS has_health_safety_policy BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS health_safety_policy_url TEXT`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS health_safety_policy_expiry_date TIMESTAMP`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS chas_certified BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS chas_certificate_number TEXT`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS chas_expiry_date TIMESTAMP`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS safe_contractor_certified BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS safe_contractor_number TEXT`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS safe_contractor_expiry_date TIMESTAMP`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS risk_rating TEXT DEFAULT 'medium'`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS risk_notes TEXT`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS last_audit_date TIMESTAMP`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS next_audit_due TIMESTAMP`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS audit_frequency_months INTEGER DEFAULT 12`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS ai_compliance_score INTEGER DEFAULT 0`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS last_ai_review TIMESTAMP`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS auto_compliance_checks BOOLEAN DEFAULT TRUE`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS cdm_role TEXT`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS constructionline_grade TEXT`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS smas_accredited BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS other_accreditations TEXT`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS pd_professional_body TEXT`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS site_id VARCHAR`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS onboarding_status TEXT NOT NULL DEFAULT 'not_started'`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS onboarding_submitted_at TIMESTAMP`,
    `ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS onboarding_approved_at TIMESTAMP`,
    // contractor_workers
    `ALTER TABLE contractor_workers ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE`,
  ];
  try {
    for (const stmt of alters) {
      await custDb.execute(sql.raw(stmt));
    }
    _contractorColumnsEnsured.add(customerId);
    logger.info(`✅ Contractor schema columns ensured for ${customerId}`);
  } catch (e: any) {
    logger.warn('ensureContractorColumns: error adding columns — continuing:', e?.message);
  }
}

  function calculateDuration(start: Date, end: Date): string {
    const diff = end.getTime() - start.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

const docRequestUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
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

// ─────────────────────────────────────────────────────────────────────────────

export function registerContractorRoutes(app: Express): void {
  // Contractor worker QR pass endpoint
  app.post("/api/contractors/workers/:id/send-qr-pass", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { method = 'email' } = req.body;
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);

      const worker = await databaseService.getContractorWorkerById(context, id);
      if (!worker) return res.status(404).json({ error: "Contractor worker not found" });

      // Authorisation check — only authorised workers may receive QR passes
      const isBanned = worker.currentCardStatus === 'red' && worker.redCardBanUntil && new Date(worker.redCardBanUntil) > new Date();
      const isAuthorised = !isBanned && worker.isActive && (!worker.currentCardStatus || worker.currentCardStatus === 'clear' || worker.currentCardStatus === 'yellow');
      if (!isAuthorised) {
        return res.status(403).json({ error: "Worker is not authorised to work on site. QR passes can only be issued to active, cleared workers." });
      }

      // Refetch after update so resolvedWorker.qrCode reflects the saved DB state
      let resolvedWorker = worker;
      if (!worker.qrCode) {
        const qrCode = 'CTR-' + randomUUID().replace(/-/g, '').substring(0, 12);
        const qrDb = await customerDbService.getCustomerDatabase(context.customerId);
        await svcPersistQrCode({ db: qrDb, customerId: context.customerId, actor: username }, id, qrCode);
        resolvedWorker = (await databaseService.getContractorWorkerById(context, id)) ?? worker;
      }

      const settings = await databaseService.getCompanySettings(context);
      const companyName = resolvedWorker.companyName || 'Contractor';

      if (!settings?.ePassEnabled) {
        return res.status(200).json({
          success: false,
          message: 'Digital E-Pass is disabled. Enable it in Settings → Passes to send digital passes.'
        });
      }

      const passPayload = {
        success: true,
        method,
        qrCode: resolvedWorker.qrCode,
        workerName: `${resolvedWorker.firstName} ${resolvedWorker.lastName}`,
        companyName,
        email: resolvedWorker.email,
      };

      if (method === 'email') {
        if (!resolvedWorker.email) return res.status(400).json({ error: "Worker has no email address" });
        const emailSent = await emailService.forCustomer(req.customerId).sendContractorWorkerQrPass(
          resolvedWorker.email,
          `${resolvedWorker.firstName} ${resolvedWorker.lastName}`,
          companyName,
          resolvedWorker.qrCode!,
          settings
        );
        return res.json({ ...passPayload, emailSent, message: emailSent ? `QR pass sent to ${resolvedWorker.email}` : 'Failed to send email' });
      }

      res.json({ ...passPayload, message: 'QR pass ready' });
    } catch (error) {
      logger.error("Error sending contractor worker QR pass:", error);
      res.status(500).json({ error: "Failed to send contractor worker QR pass" });
    }
  });

  // ── Pending documents count — badge source for the Contractor Portal nav item ──
  // Returns number of contractor_documents rows with status = 'pending' across all companies.
  app.get("/api/contractors/pending-docs-count", requireAuth, async (req, res) => {
    try {
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const pool = (custDb as any).$client ?? (custDb as any).session?.client;
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS count FROM "${schemaName}".contractor_documents WHERE status = 'pending' AND is_active = TRUE`
      );
      return res.json({ count: rows[0]?.count ?? 0 });
    } catch (error) {
      logger.error("Error fetching pending docs count:", error);
      return res.json({ count: 0 });
    }
  });

  // ── Contractor compliance gap count (badge source — replaces client-side hasContractorComplianceGap) ──
  // Returns total CRITICAL (expired / missing) gaps across companies + workers.
  // Expiring-soon items are NOT included in the red badge total.
  app.get("/api/contractors/compliance-gap-count", requireAuth, async (req, res) => {
    try {
      if (!req.customerId) return res.status(401).json({ error: 'Not authenticated' });
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const schemaName = customerDbService.generateSchemaName(req.customerId!);
      const pool = (custDb as any).$client ?? (custDb as any).session?.client;
      const now = new Date();
      const ago12Months = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

      const breakdown = { insurance: 0, rams: 0, inductions: 0, workerRightToWork: 0, workerDbs: 0, workerCertifications: 0, equipment: 0 };

      // Active worker IDs (visited in last 12 months)
      let activeWorkerIds = new Set<string>();
      try {
        const r = await pool.query(
          `SELECT DISTINCT worker_id FROM "${schemaName}".contractor_visits WHERE checked_in_at >= $1`,
          [ago12Months.toISOString()]
        );
        activeWorkerIds = new Set<string>(r.rows.map((x: any) => x.worker_id).filter(Boolean));
      } catch { /* non-fatal */ }

      // 1. Insurance — expired policies per active company
      try {
        const { rows } = await pool.query(
          `SELECT id, public_liability_expiry_date, employers_liability_expiry_date,
                  professional_indemnity_expiry_date, health_safety_policy_expiry_date,
                  chas_expiry_date, chas_certified, safe_contractor_expiry_date, safe_contractor_certified
           FROM "${schemaName}".contractor_companies WHERE is_active = TRUE`
        );
        for (const c of rows) {
          const expiries = [
            c.public_liability_expiry_date, c.employers_liability_expiry_date,
            c.professional_indemnity_expiry_date, c.health_safety_policy_expiry_date,
          ];
          if (c.chas_certified) expiries.push(c.chas_expiry_date);
          if (c.safe_contractor_certified) expiries.push(c.safe_contractor_expiry_date);
          let noInsurance = !c.public_liability_expiry_date && !c.employers_liability_expiry_date;
          if (noInsurance) { breakdown.insurance++; continue; }
          for (const exp of expiries) {
            if (!exp) continue;
            const days = Math.ceil((new Date(exp).getTime() - now.getTime()) / 86400000);
            if (days < 0) breakdown.insurance++;
          }
        }
      } catch { /* non-fatal */ }

      // 2. RAMS — expired docs
      try {
        const { rows } = await pool.query(
          `SELECT expiry_date, status FROM "${schemaName}".rams_documents WHERE is_active = TRUE`
        );
        for (const r of rows) {
          const days = r.expiry_date ? Math.ceil((new Date(r.expiry_date).getTime() - now.getTime()) / 86400000) : null;
          if (r.status === 'expired' || (days !== null && days < 0)) breakdown.rams++;
        }
      } catch { /* non-fatal */ }

      // 3. Inductions — active workers with expired induction
      try {
        const { rows } = await pool.query(
          `SELECT id, site_induction_expiry_date FROM "${schemaName}".contractor_workers WHERE is_active = TRUE`
        );
        for (const w of rows) {
          if (!activeWorkerIds.has(w.id)) continue;
          if (!w.site_induction_expiry_date) continue;
          const days = Math.ceil((new Date(w.site_induction_expiry_date).getTime() - now.getTime()) / 86400000);
          if (days < 0) breakdown.inductions++;
        }
      } catch { /* non-fatal */ }

      // 4. Worker Right to Work — expired/invalid for active workers
      try {
        const { rows } = await pool.query(
          `SELECT id, right_to_work_status, right_to_work_expiry_date
           FROM "${schemaName}".contractor_workers
           WHERE is_active = TRUE AND (right_to_work_status IS NOT NULL OR right_to_work_expiry_date IS NOT NULL)`
        );
        for (const w of rows) {
          if (!activeWorkerIds.has(w.id)) continue;
          const days = w.right_to_work_expiry_date
            ? Math.ceil((new Date(w.right_to_work_expiry_date).getTime() - now.getTime()) / 86400000) : null;
          const st = w.right_to_work_status;
          if ((days !== null && days < 0) || st === 'expired' || st === 'invalid') breakdown.workerRightToWork++;
        }
      } catch { /* non-fatal */ }

      // 5. Worker DBS — expired current DBS for active workers
      try {
        const { rows } = await pool.query(
          `SELECT d.worker_id, d.policy_expiry_date
           FROM "${schemaName}".contractor_worker_dbs d
           JOIN "${schemaName}".contractor_workers cw ON cw.id = d.worker_id
           WHERE d.is_current = TRUE AND d.deleted_at IS NULL AND cw.is_active = TRUE`
        );
        for (const r of rows) {
          if (!activeWorkerIds.has(r.worker_id)) continue;
          if (!r.policy_expiry_date) continue;
          const days = Math.ceil((new Date(r.policy_expiry_date).getTime() - now.getTime()) / 86400000);
          if (days < 0) breakdown.workerDbs++;
        }
      } catch { /* non-fatal */ }

      // 6. Worker Certifications — approved+expired OR rejected (excludes right_to_work = separate domain)
      try {
        const { rows } = await pool.query(
          `SELECT cd.expiry_date, cd.status, cd.worker_id
           FROM "${schemaName}".contractor_documents cd
           JOIN "${schemaName}".contractor_workers cw ON cw.id = cd.worker_id
           WHERE cd.worker_id IS NOT NULL AND cd.is_active = TRUE
             AND cd.document_type NOT IN ('right_to_work', 'dbs_certificate')`
        );
        for (const r of rows) {
          const docStatus = r.status ?? 'pending';
          if (docStatus === 'rejected') { breakdown.workerCertifications++; continue; }
          if (docStatus === 'approved' && r.expiry_date) {
            const days = Math.ceil((new Date(r.expiry_date).getTime() - now.getTime()) / 86400000);
            if (days < 0) breakdown.workerCertifications++;
          }
          // pending = not a critical gap (warning only, excluded from red badge)
        }
      } catch { /* non-fatal */ }

      // 7. Equipment — expired certs
      try {
        const { rows } = await pool.query(
          `SELECT cd.expiry_date
           FROM "${schemaName}".contractor_documents cd
           WHERE cd.equipment_id IS NOT NULL AND cd.is_active = TRUE AND cd.expiry_date IS NOT NULL`
        );
        for (const r of rows) {
          const days = Math.ceil((new Date(r.expiry_date).getTime() - now.getTime()) / 86400000);
          if (days < 0) breakdown.equipment++;
        }
      } catch { /* non-fatal */ }

      const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
      res.json({ total, breakdown });
    } catch (error) {
      logger.error("Error fetching contractor compliance gap count:", error);
      res.status(500).json({ error: "Failed to fetch compliance gap count" });
    }
  });

  // Get checked-in contractors endpoint
  app.get("/api/contractors/checked-in", requireAuth, async (req, res) => {
    try {
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const checkedInContractors = await databaseService.getCheckedInContractors(context);
      res.json(checkedInContractors);
    } catch (error) {
      logger.error("Failed to fetch checked-in contractors:", error);
      
      // DEV DATA BYPASS: Check if this is a Neon database error and bypass is enabled
      if (isDevDataBypass() && isDatabaseConnectionError(error)) {
        return res.json(getMockCheckedInContractors());
      }
      
      res.status(500).json({ error: "Failed to fetch checked-in contractors" });
    }
  });


  // Get all contractor workers - MUST COME BEFORE :id route
  app.get("/api/contractors/workers/all", requireAuth, async (req, res) => {
    try {
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Use customer-isolated database service to get all contractor workers
      const workers = await databaseService.getAllContractorWorkers(context);
      
      logger.info(`Retrieved ${workers.length} contractor workers for customer ${context.customerId}`);
      
      res.json(workers);
    } catch (error) {
      logger.error("Error fetching all workers:", error);
      res.status(500).json({ error: "Failed to fetch all workers" });
    }
  });


  // ── Worker Right-to-Work document summary (all active workers + best RTW doc) ──
  app.get("/api/contractors/workers/right-to-work", requireAuth, async (req, res) => {
    try {
      if (!req.customerId) return res.status(401).json({ error: 'Not authenticated' });
      const schemaName = customerDbService.generateSchemaName(req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(req.customerId);
      const pool = (custDb as any).$client ?? (custDb as any).session?.client;
      const { rows } = await pool.query(`
        SELECT DISTINCT ON (cw.id)
          cw.id,
          cw.first_name,
          cw.last_name,
          cw.company_id,
          cc.name AS company_name,
          cd.id              AS doc_id,
          cd.status          AS doc_status,
          cd.expiry_date     AS doc_expiry,
          cd.approved_by,
          cd.approved_at,
          cd.created_at      AS uploaded_at
        FROM "${schemaName}".contractor_workers cw
        INNER JOIN "${schemaName}".contractor_companies cc
          ON cc.id = cw.company_id AND cc.is_active = TRUE
        LEFT JOIN "${schemaName}".contractor_documents cd
          ON cd.worker_id = cw.id
         AND cd.document_type = 'right_to_work'
         AND cd.is_active = TRUE
        WHERE cw.is_active = TRUE
        ORDER BY cw.id,
          CASE WHEN cd.id IS NULL THEN 99
               WHEN cd.status = 'approved' THEN 1
               WHEN cd.status = 'pending'  THEN 2
               ELSE 3 END,
          cd.expiry_date DESC NULLS LAST
      `);
      return res.json(rows);
    } catch (error) {
      logger.error("Error fetching worker RTW summary:", error);
      return res.status(500).json({ error: "Failed to fetch worker RTW summary" });
    }
  });

  // Contractor Pre-booking endpoints
  app.get("/api/contractors/prebookings", requireAuth, async (req, res) => {
    try {
      const { db: customerDb, siteContext } = await getScopedDb(req);
      const preBookings = await customerDb.select().from(isolatedSchema.contractorPreBookings)
        .where(scopedWhere(siteContext, isolatedSchema.contractorPreBookings));
      res.json(preBookings);
    } catch (error) {
      if (error instanceof SiteContextError) return res.status(403).json({ error: (error as Error).message });
      logger.error("Error fetching contractor pre-bookings:", error);
      res.status(500).json({ error: "Failed to fetch contractor pre-bookings" });
    }
  });

  app.get("/api/contractors/prebookings/upcoming", requireAuth, async (req, res) => {
    try {
      const { db: customerDb, siteContext } = await getScopedDb(req);
      const now = new Date();
      const preBookings = await customerDb.select().from(isolatedSchema.contractorPreBookings)
        .where(and(
          gte(isolatedSchema.contractorPreBookings.scheduledDate, now),
          ne(isolatedSchema.contractorPreBookings.status, 'cancelled'),
          scopedWhere(siteContext, isolatedSchema.contractorPreBookings)
        ));
      res.json(preBookings);
    } catch (error) {
      if (error instanceof SiteContextError) return res.status(403).json({ error: (error as Error).message });
      logger.error("Error fetching upcoming contractor pre-bookings:", error);
      res.status(500).json({ error: "Failed to fetch upcoming contractor pre-bookings" });
    }
  });

  app.get("/api/contractors/prebookings/today", requireAuth, async (req, res) => {
    try {
      const { db: customerDb, siteContext } = await getScopedDb(req);
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
      const preBookings = await customerDb.select().from(isolatedSchema.contractorPreBookings)
        .where(and(
          gte(isolatedSchema.contractorPreBookings.scheduledDate, startOfDay),
          sql`${isolatedSchema.contractorPreBookings.scheduledDate} <= ${endOfDay}`,
          scopedWhere(siteContext, isolatedSchema.contractorPreBookings)
        ));
      res.json(preBookings);
    } catch (error) {
      if (error instanceof SiteContextError) return res.status(403).json({ error: (error as Error).message });
      logger.error("Error fetching today's contractor pre-bookings:", error);
      res.status(500).json({ error: "Failed to fetch today's contractor pre-bookings" });
    }
  });

  app.get("/api/contractors/prebookings/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { db: customerDb, siteContext: cpbGetCtx } = await getScopedDb(req);
      const [preBooking] = await customerDb.select().from(isolatedSchema.contractorPreBookings)
        .where(and(eq(isolatedSchema.contractorPreBookings.id, id), scopedWhere(cpbGetCtx, isolatedSchema.contractorPreBookings)));
      
      if (!preBooking) {
        return res.status(404).json({ error: "Contractor pre-booking not found" });
      }
      
      res.json(preBooking);
    } catch (error) {
      logger.error("Error fetching contractor pre-booking:", error);
      res.status(500).json({ error: "Failed to fetch contractor pre-booking" });
    }
  });

  app.post("/api/contractors/prebookings", requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const { db: customerDb, siteId, siteContext } = await getScopedDb(req);
      const parsedScheduledDate = new Date(req.body.scheduledDate);
      if (!req.body.scheduledDate || isNaN(parsedScheduledDate.getTime())) {
        return res.status(400).json({ error: "Pre-booking scheduled date is invalid." });
      }
      const preBookingData = {
        ...req.body,
        scheduledDate: parsedScheduledDate
      };
      
      // Duplicate prevention: check for existing ACTIVE booking with same worker, company, date, and time
      // Scoped to the active site so duplicates are only checked within the same site.
      const existingBookings = await customerDb.select().from(isolatedSchema.contractorPreBookings)
        .where(scopedWhere(siteContext, isolatedSchema.contractorPreBookings));
      const scheduledDateStr = preBookingData.scheduledDate.toDateString();
      logger.info(`Duplicate check: worker="${preBookingData.workerName}", time="${preBookingData.scheduledTime}", date="${scheduledDateStr}", checking ${existingBookings.length} existing bookings`);
      existingBookings.forEach((b: any) => {
        const bDateStr = new Date(b.scheduledDate).toDateString();
        logger.info(`→ id=${b.id?.slice(0,8)} worker="${b.workerName}" time="${b.scheduledTime}" date="${bDateStr}" status="${b.status}"`);
      });
      const normalize = (s: string | undefined | null) => (s ?? '').toLowerCase().trim();
      const duplicate = existingBookings.find((b: any) => 
        normalize(b.workerName) === normalize(preBookingData.workerName) &&
        normalize(b.companyName) === normalize(preBookingData.companyName) &&
        new Date(b.scheduledDate).toDateString() === scheduledDateStr &&
        b.scheduledTime === preBookingData.scheduledTime &&
        b.status !== 'cancelled' &&
        b.status !== 'completed'
      );
      logger.info(`Duplicate found: ${duplicate ? `YES - id=${duplicate.id?.slice(0,8)} status="${duplicate.status}"` : 'NO'}`);
      
      if (duplicate) {
        return res.status(409).json({ 
          error: "Duplicate booking", 
          message: `${preBookingData.workerName} from ${preBookingData.companyName} already has a pre-booking on this date at ${preBookingData.scheduledTime}` 
        });
      }
      
      const qrCode = 'CPB-' + randomUUID().replace(/-/g, '').substring(0, 12);
      const [newPreBooking] = await customerDb.insert(isolatedSchema.contractorPreBookings)
        .values(withSiteId(siteId, { ...preBookingData, qrCode }))
        .returning();
      
      // Auto-send pre-booking pass with QR code to contractor's email
      const emailTarget = newPreBooking.workerEmail || newPreBooking.contactEmail;
      if (emailTarget) {
        try {
          const { simpleDatabaseService } = await import("../simpleDatabaseService");
          const prebookingUsername = req.user?.username || 'system';
          const prebookingContext = simpleDatabaseService.createCustomerContext(prebookingUsername, req.customerId);
          const companySettings = await simpleDatabaseService.getCompanySettings(prebookingContext);
          
          const emailService = new EmailService(req.customerId);
          const emailSent = await emailService.sendContractorPreBookingPass(
            emailTarget,
            newPreBooking.workerName,
            newPreBooking.companyName,
            newPreBooking.qrCode,
            newPreBooking.scheduledDate,
            newPreBooking.scheduledTime,
            newPreBooking.duration || '4',
            newPreBooking.purpose,
            newPreBooking.notes || '',
            companySettings
          );
          
          if (emailSent) {
            logger.info(`Pre-booking pass with QR code sent to ${emailTarget}`);
            return res.json({ ...newPreBooking, emailSent: true });
          } else {
            logger.info(`Failed to send pre-booking pass to ${emailTarget}`);
          }
        } catch (emailError) {
          logger.error("Failed to send contractor pre-booking pass:", emailError);
        }
      }
      
      res.json({ ...newPreBooking, emailSent: false });
    } catch (error) {
      logger.error("Error creating contractor pre-booking:", error);
      res.status(500).json({ error: "Failed to create contractor pre-booking" });
    }
  });

  app.put("/api/contractors/prebookings/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { db: customerDb, siteContext: cpbPutCtx } = await getScopedDb(req);
      const updates = {
        ...req.body,
        scheduledDate: req.body.scheduledDate ? new Date(req.body.scheduledDate) : undefined,
        updatedAt: new Date()
      };
      
      const [updatedPreBooking] = await customerDb.update(isolatedSchema.contractorPreBookings)
        .set(updates)
        .where(and(eq(isolatedSchema.contractorPreBookings.id, id), scopedWhere(cpbPutCtx, isolatedSchema.contractorPreBookings)))
        .returning();
      
      if (!updatedPreBooking) {
        return res.status(404).json({ error: "Contractor pre-booking not found" });
      }
      
      res.json(updatedPreBooking);
    } catch (error) {
      logger.error("Error updating contractor pre-booking:", error);
      res.status(500).json({ error: "Failed to update contractor pre-booking" });
    }
  });

  app.delete("/api/contractors/prebookings/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { db: customerDb, siteContext: cpbDelCtx } = await getScopedDb(req);
      
      const [deleted] = await customerDb.delete(isolatedSchema.contractorPreBookings)
        .where(and(eq(isolatedSchema.contractorPreBookings.id, id), scopedWhere(cpbDelCtx, isolatedSchema.contractorPreBookings)))
        .returning();
      
      if (!deleted) {
        return res.status(404).json({ error: "Contractor pre-booking not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      logger.error("Error deleting contractor pre-booking:", error);
      res.status(500).json({ error: "Failed to delete contractor pre-booking" });
    }
  });

  // Contractor pre-booking check-in
  app.post("/api/contractors/prebookings/checkin", requireAuth, async (req, res) => {
    try {
      const { qrCode } = req.body;
      
      if (!qrCode) {
        return res.status(400).json({ error: "QR code is required" });
      }
      
      // Find pre-booking by QR code
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const { db: customerDb, siteId: cpbCiSiteId, siteContext: cpbCiCtx } = await getScopedDb(req);
      const [preBooking] = await customerDb.select().from(isolatedSchema.contractorPreBookings)
        .where(and(eq(isolatedSchema.contractorPreBookings.qrCode, qrCode), scopedWhere(cpbCiCtx, isolatedSchema.contractorPreBookings)));
      
      if (!preBooking) {
        return res.status(404).json({ error: "Invalid QR code" });
      }
      
      // Check if already checked in
      if (preBooking.status === 'completed') {
        return res.status(400).json({ error: "Pre-booking already completed" });
      }
      
      // Customer context and database already created above for QR lookup
      
      // Strategy: First try to find worker by name across all companies, then resolve company
      const allCompanies = await customerDb.select()
        .from(isolatedSchema.contractorCompanies);
      const allWorkersGlobal = await customerDb.select()
        .from(isolatedSchema.contractorWorkers);
      
      // Try to find worker by name first (most reliable for pre-booking check-ins)
      let worker = allWorkersGlobal.find(w => 
        `${w.firstName} ${w.lastName}`.toLowerCase().trim() === preBooking.workerName?.toLowerCase().trim()
      );
      
      let company;
      
      if (worker) {
        // Worker found - resolve company from worker's companyId
        company = allCompanies.find(c => c.id === worker!.companyId);
      }
      
      if (!company) {
        // Fallback: try to find company by name from pre-booking (case-insensitive)
        company = allCompanies.find(c => 
          c.companyName?.toLowerCase().trim() === preBooking.companyName?.toLowerCase().trim()
        );
        
      }
      
      if (!company) {
        logger.error(`Company lookup failed for pre-booking. workerName: "${preBooking.workerName}", companyName: "${preBooking.companyName}". Available companies:`, allCompanies.map(c => ({ id: c.id, name: c.companyName })));
        return res.status(400).json({ 
          error: "Contractor company not found",
          details: `Contractor company '${preBooking.companyName}' not found. Ensure the company name in the pre-booking matches exactly.`
        });
      }
      
      // Check company status — only block suspended companies
      if (company.status === 'suspended') {
        return res.status(400).json({ 
          error: `Cannot check in: Contractor company "${company.companyName}" is suspended`,
          issues: [`Contractor company is suspended`]
        });
      }
      
      // If worker wasn't found earlier, search within this company
      if (!worker) {
        const companyWorkers = allWorkersGlobal.filter(w => w.companyId === company!.id);
        worker = companyWorkers.find(w => 
          `${w.firstName} ${w.lastName}`.toLowerCase().trim() === preBooking.workerName?.toLowerCase().trim()
        );
      }
      
      if (!worker) {
        // Guard: ensure the pre-booking has a usable worker name before creating a record
        if (!preBooking.workerName || !preBooking.workerName.trim()) {
          return res.status(400).json({ error: "Pre-booking worker name is invalid." });
        }
        // Create worker in customer database
        const nameParts = preBooking.workerName.trim().split(' ');
        const firstName = nameParts[0] || preBooking.workerName;
        const lastName = nameParts.slice(1).join(' ') || '';
        const workerId = randomUUID();
        
        const preSvcCtx: WorkerServiceContext = {
          db: customerDb, customerId: context.customerId, actor: req.user!.username,
        };
        const newWorker = await svcCreateWorker(preSvcCtx, company.id, {
          id: workerId,
          firstName,
          lastName,
          email: preBooking.workerEmail,
          phone: preBooking.contactPhone,
          rightToWork: 'pending',
        }, 'prebooking');
        worker = newWorker;
      }
      
      // Check worker clearance — single source of truth
      const pbClearance = await getWorkerClearanceStatus(customerDb, worker.id, context.customerId);
      if (!pbClearance.ready) {
        try {
          const pbSchema = customerDbService.generateSchemaName(context.customerId);
          const pbPool = (customerDb as any).$client ?? (customerDb as any).session?.client;
          if (pbPool) {
            await pbPool.query(
              `INSERT INTO "${pbSchema}".contractor_onboarding_audit (company_id, worker_id, action, actor, reason) VALUES ($1, $2, 'check_in_blocked', 'kiosk', $3)`,
              [company.id, worker.id, pbClearance.blocking.join(' · ')]
            );
          }
        } catch { /* Non-fatal */ }
        return res.status(400).json({
          error: `Cannot check in: ${pbClearance.blocking.join(' · ')}`,
          issues: pbClearance.blocking,
          warnings: pbClearance.warnings,
        });
      }
      const warnings = pbClearance.warnings;
      
      // Check if worker is already checked in
      if (worker.isCheckedIn) {
        return res.status(400).json({ error: "Worker is already checked in" });
      }
      
      // Update pre-booking status
      await customerDb.update(isolatedSchema.contractorPreBookings)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(eq(isolatedSchema.contractorPreBookings.id, preBooking.id));
      
      // Update worker check-in status via service (do NOT overwrite qrCode — CPB- belongs to the visit, not the worker)
      const pbCheckInCtx: WorkerServiceContext = {
        db: customerDb, customerId: context.customerId, actor: req.user!.username,
      };
      await svcCheckInWorker(pbCheckInCtx, worker.id, { isCheckedIn: true, checkedInAt: new Date() });
      
      // Create contractor visit record in customer database
      const visitId = randomUUID();
      const [visit] = await customerDb.insert(isolatedSchema.contractorVisits)
        .values(withSiteId(cpbCiSiteId, {
          id: visitId,
          workerId: worker.id,
          companyId: company.id,
          purpose: preBooking.purpose,
          hsRulesAccepted: true,
          hsRulesAcceptedAt: new Date(),
          qrCode: qrCode,
          checkedInAt: new Date()
        }))
        .returning();
      
      res.json({
        success: true,
        message: warnings.length > 0 
          ? `Contractor checked in successfully (Note: ${warnings.join(', ')})` 
          : "Contractor checked in successfully",
        visit: visit,
        worker: worker,
        company: company,
        warnings: warnings
      });
    } catch (error) {
      logger.error("Error checking in contractor from pre-booking:", error);
      res.status(500).json({ error: "Failed to check in contractor" });
    }
  });


  // Contractor Company endpoints
  app.get("/api/contractors", requireAuth, async (req, res) => {
    try {
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      await getScopedDb(req); // validates session / enterprise site context
      // Ensure is_demo column exists — SELECT * includes it via Drizzle schema
      const listDb = await customerDbService.getCustomerDatabase(context.customerId);
      await ensureContractorColumns(listDb, context.customerId);
      // For enterprise customers, contractor companies are estate-wide (not site-scoped).
      // Non-enterprise: null = no extra filter (single-site, already isolated by schema).
      const contractors = await databaseService.getAllContractorCompanies(context, null);
      res.json(contractors);
    } catch (err) {
      if (err instanceof SiteContextError) return res.status(err.statusCode).json({ error: err.message });
      logger.error("Error fetching contractors:", err);
      res.status(500).json({ error: "Failed to fetch contractors" });
    }
  });

  // ── Contractor Portal: Onboarding requirements (GET) ─────────────────────
  // MUST be before /api/contractors/:id — otherwise Express matches "onboarding-requirements" as :id
  app.get('/api/contractors/onboarding-requirements', requireAuth, requirePortalAdmin, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const db = await customerDbService.getCustomerDatabase(customerId);
      const pool = (db as any).$client ?? (db as any).session?.client;
      const schemaName = customerDbService.generateSchemaName(customerId);
      if (!pool) {
        logger.error('[portal-admin] onboarding-requirements: pool unavailable', { customerId });
        return res.status(500).json({ error: 'Database connection unavailable.', detail: 'pool_undefined' });
      }
      // Seed-on-read: ensures table + UK defaults exist on older schemas (no manual migration needed)
      await seedOnboardingRequirements(pool, schemaName);
      const result = await pool.query(
        `SELECT document_type, label, is_required, sort_order FROM "${schemaName}".contractor_onboarding_requirements ORDER BY sort_order`
      );
      return res.json(result.rows);
    } catch (error: any) {
      logger.error('[portal-admin] onboarding-requirements GET error', {
        customerId: req.customerId, user: (req.user as any)?.username,
        message: error?.message, code: error?.code,
        stack: error?.stack?.split('\n').slice(0, 6).join('\n'),
      });
      return res.status(500).json({ error: 'Failed to load requirements.', detail: error?.message });
    }
  });

  // ── Contractor Portal: Onboarding requirements (PUT toggle) ──────────────
  app.put('/api/contractors/onboarding-requirements/:docType', requireAuth, requirePortalAdmin, async (req, res) => {
    try {
      const { docType } = req.params;
      const { isRequired } = req.body as { isRequired: boolean };
      const customerId = req.customerId!;
      const db = await customerDbService.getCustomerDatabase(customerId);
      const pool = (db as any).$client ?? (db as any).session?.client;
      const schemaName = customerDbService.generateSchemaName(customerId);
      if (!pool) {
        logger.error('[portal-admin] onboarding-requirements PUT: pool unavailable', { customerId, docType });
        return res.status(500).json({ error: 'Database connection unavailable.', detail: 'pool_undefined' });
      }
      const knownDefault = UK_DEFAULT_REQUIREMENTS.find(r => r.document_type === docType);
      const label = knownDefault?.label ?? docType;
      const sortOrder = knownDefault?.sort_order ?? 99;
      // Upsert: silently inserts if the row was never seeded, or updates if it was
      await pool.query(
        `INSERT INTO "${schemaName}".contractor_onboarding_requirements (document_type, label, is_required, sort_order)
         VALUES ($2, $3, $1, $4)
         ON CONFLICT (document_type) DO UPDATE SET is_required = $1, updated_at = NOW()`,
        [!!isRequired, docType, label, sortOrder]
      );
      return res.json({ success: true });
    } catch (error: any) {
      logger.error('[portal-admin] onboarding-requirements PUT error', {
        customerId: req.customerId, user: (req.user as any)?.username,
        message: error?.message, code: error?.code,
        stack: error?.stack?.split('\n').slice(0, 6).join('\n'),
      });
      return res.status(500).json({ error: 'Failed to update requirement.', detail: error?.message });
    }
  });

  // ── Onboarding audit trail (all companies, latest first) ─────────────────
  // MUST be before /api/contractors/:id — otherwise Express matches "onboarding-audit" as :id
  app.get('/api/contractors/onboarding-audit', requireAuth, requirePortalAdmin, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const db = await customerDbService.getCustomerDatabase(customerId);
      const pool = (db as any).$client ?? (db as any).session?.client;
      const schemaName = customerDbService.generateSchemaName(customerId);
      if (!pool) {
        logger.error('[portal-admin] onboarding-audit: pool unavailable', { customerId });
        return res.status(500).json({ error: 'Database connection unavailable.', detail: 'pool_undefined' });
      }
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const companyId = req.query.companyId as string | undefined;

      const result = await pool.query(
        `SELECT a.id, a.company_id, a.worker_id, a.action, a.actor, a.reason, a.created_at,
                cc.company_name,
                cw.first_name AS worker_first_name, cw.last_name AS worker_last_name
         FROM "${schemaName}".contractor_onboarding_audit a
         LEFT JOIN "${schemaName}".contractor_companies cc ON cc.id = a.company_id
         LEFT JOIN "${schemaName}".contractor_workers cw ON cw.id = a.worker_id
         ${companyId ? 'WHERE a.company_id = $2' : ''}
         ORDER BY a.created_at DESC
         LIMIT $1`,
        companyId ? [limit, companyId] : [limit]
      );
      return res.json(result.rows);
    } catch (err: any) {
      logger.error('[portal-admin] onboarding-audit GET error', {
        customerId: req.customerId, user: (req.user as any)?.username,
        message: err?.message, code: err?.code,
        stack: err?.stack?.split('\n').slice(0, 6).join('\n'),
      });
      return res.status(500).json({ error: 'Failed to load audit trail.', detail: err?.message });
    }
  });

  // Get contractor company by ID
  app.get("/api/contractors/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Get all contractors and find the specific one (using same pattern as list endpoint)
      const contractors = await databaseService.getAllContractorCompanies(context);
      const contractor = contractors.find(c => c.id === id);
      
      if (!contractor) {
        return res.status(404).json({ error: "Contractor not found" });
      }

      // Get workers for this company using customer-isolated database service
      const workers = await databaseService.getWorkersByCompanyId(context, id);
      
      // Get documents and create status summary
      const detailDocsDb = await customerDbService.getCustomerDatabase(context.customerId);
      const documents = await detailDocsDb.select().from(isolatedSchema.contractorDocuments)
        .where(and(eq(isolatedSchema.contractorDocuments.companyId, id), eq(isolatedSchema.contractorDocuments.isActive, true)));
      const docTypes = ['publicLiability', 'employersLiability', 'healthSafety', 'cisRegistration'];
      const documentsStatus = docTypes.reduce((acc, docType) => {
        const doc = documents.find(d => d.documentType === docType);
        acc[docType] = doc?.status || 'missing';
        return acc;
      }, {} as Record<string, string>);

      const contractorWithDetails = {
        ...contractor,
        workers,
        workersCount: workers.length,
        documentsStatus,
        documents
      };

      res.json(contractorWithDetails);
    } catch (error) {
      logger.error('Error fetching contractor details:', error);
      res.status(500).json({ error: "Failed to fetch contractor details" });
    }
  });

  // Red and Yellow Card System Routes
  app.get("/api/card-offences", requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user?.username || 'system', req.customerId);
      
      // Ensure offences are seeded for this customer
      await databaseService.seedCustomerCardOffences(context);
      
      const offences = await databaseService.getAllCardOffences(context);
      res.json(offences);
    } catch (error) {
      logger.error("Error fetching card offences:", error);
      res.status(500).json({ error: "Failed to fetch offences" });
    }
  });

  app.post("/api/card-offences", requireAuth, async (req, res) => {
    try {
      const offenceContext = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const offenceDb = await customerDbService.getCustomerDatabase(offenceContext.customerId);
      const [offence] = await offenceDb.insert(isolatedSchema.cardOffences).values(req.body).returning();
      res.status(201).json(offence);
    } catch (error) {
      logger.error("Error creating card offence:", error);
      res.status(500).json({ error: "Failed to create offence" });
    }
  });

  app.put("/api/card-offences/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const db = await customerDbService.getCustomerDatabase(context.customerId);
      const [updated] = await db
        .update(isolatedSchema.cardOffences)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(isolatedSchema.cardOffences.id, id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Offence not found" });
      res.json(updated);
    } catch (error) {
      logger.error("Error updating card offence:", error);
      res.status(500).json({ error: "Failed to update offence" });
    }
  });

  app.delete("/api/card-offences/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const db = await customerDbService.getCustomerDatabase(context.customerId);
      await db.delete(isolatedSchema.cardOffences).where(eq(isolatedSchema.cardOffences.id, id));
      res.json({ success: true });
    } catch (error) {
      logger.error("Error deleting card offence:", error);
      res.status(500).json({ error: "Failed to delete offence" });
    }
  });

  app.post("/api/card-issues", requireAuth, async (req, res) => {
    try {
      // Role check — only admin/manager can issue disciplinary cards
      if (!['admin', 'manager'].includes(req.user!.role)) {
        return res.status(403).json({ error: 'Only admins and managers can issue disciplinary cards.' });
      }

      const db = await customerDbService.getCustomerDatabase(req.customerId);
      const svcCtx: WorkerServiceContext = { db, customerId: req.customerId, actor: req.user!.username };
      // Override issuedBy with the authenticated user's ID to satisfy the FK constraint
      const cardData = { ...req.body, issuedBy: req.user?.id || req.body.issuedBy };
      logger.info(`Card issue - session user ID: ${req.user?.id}, body issuedBy: ${req.body.issuedBy}`);

      const issue = await svcIssueCard(svcCtx, cardData);
      logger.info(`Card issue created successfully for customer ${req.customerId}:`, issue);

      // Send email notification (async, non-blocking — kept in the route)
      (async () => {
        try {
          const { workerId, offenceId, cardType, description, location, witness, issuedBy, contractorId } = req.body;
          const customerDb = await customerDbService.getCustomerDatabase(req.customerId);
          const [worker] = await customerDb
            .select()
            .from(isolatedSchema.contractorWorkers)
            .where(eq(isolatedSchema.contractorWorkers.id, workerId));
          if (!worker) { logger.info(`Card issue email skipped - worker not found: ${workerId}`); return; }

          const [offence] = await customerDb.select().from(isolatedSchema.cardOffences)
            .where(eq(isolatedSchema.cardOffences.id, offenceId));
          const [contractorCompany] = await customerDb.select().from(isolatedSchema.contractorCompanies)
            .where(eq(isolatedSchema.contractorCompanies.id, worker.companyId || contractorId));
          const [companySettings] = await customerDb.select().from(isolatedSchema.companySettings).limit(1);

          let issuedByName = 'Site Management';
          if (issuedBy) {
            const [issuer] = await customerDb.select().from(isolatedSchema.users)
              .where(eq(isolatedSchema.users.id, issuedBy));
            if (issuer) issuedByName = issuer.username || 'Site Management';
          }

          const previousCards = await customerDb.select().from(isolatedSchema.cardIssues)
            .where(eq(isolatedSchema.cardIssues.workerId, workerId));
          const previousYellowCards = previousCards.filter(c => c.cardType === 'yellow' && c.id !== issue.id).length;

          const workerEmail = worker.workerEmail || worker.email;
          if (!workerEmail) { logger.info(`Card issue email skipped - no email for worker: ID ${worker.id}`); return; }

          const result = await emailService.forCustomer(req.customerId).sendCardIssueNotification({
            workerEmail,
            workerName: `${worker.firstName} ${worker.lastName}`,
            cardType: cardType as 'yellow' | 'red',
            offenceName: offence?.name || 'Safety Violation',
            offenceDescription: description || offence?.description || 'No details provided',
            location,
            witness,
            issuedByName,
            issuedAt: new Date(),
            previousYellowCards,
            companyName: companySettings?.companyName || 'Site Management',
            contractorCompanyName: contractorCompany?.name || 'Contractor',
            contractorCompanyEmail: contractorCompany?.contactEmail,
            companySettings,
          });
          logger.info(`Card issue notification result:`, result);
        } catch (emailError) {
          logger.error('Failed to send card issue email (non-blocking):', emailError);
        }
      })();

      res.status(201).json(issue);
    } catch (error) {
      logger.error("Error creating card issue:", error);
      res.status(500).json({ error: "Failed to create card issue" });
    }
  });

  app.get("/api/workers/:workerId/card-issues", requireAuth, async (req, res) => {
    try {
      const ciContext = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const ciDb = await customerDbService.getCustomerDatabase(ciContext.customerId);
      const issues = await ciDb.select().from(isolatedSchema.cardIssues)
        .where(eq(isolatedSchema.cardIssues.workerId, req.params.workerId));
      res.json(issues);
    } catch (error) {
      logger.error("Error fetching worker card issues:", error);
      res.status(500).json({ error: "Failed to fetch card issues" });
    }
  });

  // ============= INDUCTION SYSTEM ROUTES =============
  
  // Send induction email to worker (legacy path — resolve name/email from isolated DB)
  app.post("/api/contractors/workers/:workerId/send-induction", requireAuth, async (req, res) => {
    try {
      const { workerId } = req.params;
      const siCtx = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const siWorker = await databaseService.getContractorWorkerById(siCtx, workerId);
      if (!siWorker) return res.status(404).json({ error: 'Worker not found' });
      const workerName = `${siWorker.firstName} ${siWorker.lastName}`;
      const success = await inductionService.sendInductionEmail(workerId, req.customerId, workerName, siWorker.email ?? undefined);
      if (success) {
        res.json({ success: true, message: "Induction email sent successfully" });
      } else {
        res.status(500).json({ error: "Failed to send induction email" });
      }
    } catch (error) {
      logger.error("Error sending induction email:", error);
      res.status(500).json({ error: "Failed to send induction email" });
    }
  });

  // Send induction email to all workers from a company
  app.post("/api/contractors/:companyId/send-induction-all", requireAuth, async (req, res) => {
    try {
      const { companyId } = req.params;
      const bulkInductionContext = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const workers = await databaseService.getWorkersByCompanyId(bulkInductionContext, companyId);
      
      const results = await Promise.all(
        workers.map(async (worker) => {
          if (worker.email && !worker.inductionCompleted) {
            return await inductionService.sendInductionEmail(worker.id, req.customerId);
          }
          return false;
        })
      );

      const successCount = results.filter(Boolean).length;
      const totalWorkers = workers.filter(w => w.email && !w.inductionCompleted).length;

      res.json({ 
        success: true, 
        message: `Sent induction emails to ${successCount}/${totalWorkers} eligible workers`,
        sent: successCount,
        total: totalWorkers
      });
    } catch (error) {
      logger.error("Error sending bulk induction emails:", error);
      res.status(500).json({ error: "Failed to send induction emails" });
    }
  });

  // Enhanced Worker Certifications Routes
  app.get("/api/workers/:workerId/certifications", requireAuth, async (req, res) => {
    try {
      const certContext = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const certDb = await customerDbService.getCustomerDatabase(certContext.customerId);
      const certifications = await certDb.select().from(isolatedSchema.workerCertifications)
        .where(eq(isolatedSchema.workerCertifications.workerId, req.params.workerId));
      res.json(certifications);
    } catch (error) {
      logger.error("Error fetching worker certifications:", error);
      res.status(500).json({ error: "Failed to fetch certifications" });
    }
  });

  app.post("/api/workers/:workerId/certifications", requireAuth, async (req, res) => {
    try {
      const certificationData = { ...req.body, workerId: req.params.workerId };
      const createCertContext = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const createCertDb = await customerDbService.getCustomerDatabase(createCertContext.customerId);
      const [certification] = await createCertDb.insert(isolatedSchema.workerCertifications)
        .values(certificationData).returning();
      res.status(201).json(certification);
    } catch (error) {
      logger.error("Error creating worker certification:", error);
      res.status(500).json({ error: "Failed to create certification" });
    }
  });

  // OpenAI auto-populate company description endpoint
  app.post("/api/contractors/generate-description", requireAuth, async (req, res) => {
    try {
      // Validate request body with Zod
      const bodySchema = z.object({
        website: z.string().min(1, "Website is required"),
        companyName: z.string().min(1, "Company name is required"),
        industry: z.string().optional()
      });
      
      const validatedData = bodySchema.parse(req.body);
      const { website, companyName, industry } = validatedData;

      const { generateCompanyDescription } = await import("../openaiService");
      const result = await generateCompanyDescription(website, companyName, industry);
      
      if (result.success) {
        res.json({ description: result.description });
      } else {
        // Return 502 for OpenAI service failures
        res.status(502).json({ 
          error: result.error || "Failed to generate description from AI service" 
        });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: error.errors.map(e => e.message).join(", ")
        });
      }
      logger.error("Error in generate-description endpoint:", error);
      res.status(500).json({ 
        error: "Internal server error while generating description" 
      });
    }
  });

  app.post("/api/contractors", requireAuth, async (req, res) => {
    try {
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      const { siteId, siteContext } = await getScopedDb(req);
      // For enterprise, companies are estate-wide (site_id = null).
      // For non-enterprise, stamp the default site id as before.
      const effectiveSiteId = siteContext.isEnterprise ? null : siteId;
      
      const requestDataWithCustomerId = { ...req.body, customerId: context.customerId };
      const contractorData = insertContractorCompanySchema.parse(requestDataWithCustomerId);

      // Ensure is_demo column exists before INSERT...RETURNING (RETURNING includes all columns)
      const custDbForEnsure = await customerDbService.getCustomerDatabase(context.customerId);
      await ensureContractorColumns(custDbForEnsure, context.customerId);

      const mappedContractorData = {
        ...contractorData,
        companyName: contractorData.name,
        contactEmail: contractorData.email,
        contactPhone: contractorData.phone,
      };
      delete mappedContractorData.name;
      delete mappedContractorData.email;
      delete mappedContractorData.phone;
      
      const contractor = await databaseService.createContractorCompany(context, mappedContractorData, effectiveSiteId);

      // Audit trail — company created
      try {
        const auditDb = await customerDbService.getCustomerDatabase(context.customerId);
        const auditTs = new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Europe/London' });
        await auditDb.insert(isolatedSchema.companyNotes).values({
          companyId: contractor.id,
          changeType: 'company_created',
          notes: `Company "${contractor.companyName || mappedContractorData.companyName}" registered by ${username} on ${auditTs}`,
          changedBy: username,
        });
      } catch (auditErr) {
        logger.error('Failed to create company audit note (continuing):', auditErr);
      }

      res.json(contractor);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid contractor data", details: error.errors });
      } else if (error?.code === "23505" && error?.constraint?.includes("company_name")) {
        res.status(409).json({ error: "A contractor company with that name already exists. Please use a different company name or find the existing record." });
      } else {
        logger.error("Error creating contractor:", error);
        res.status(500).json({ error: "Failed to create contractor" });
      }
    }
  });

  app.put("/api/contractors/:id", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    try {
      const { id } = req.params;
      const updates = req.body;
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Map form field names to isolated schema field names
      const mappedUpdates = {
        companyName: updates.name,
        contactEmail: updates.email,
        contactFirstName: updates.contactFirstName,
        contactLastName: updates.contactLastName,
        contactPhone: updates.phone,
        address: updates.address,
        postcode: updates.postcode,
        website: updates.website,
        description: updates.description,
        industry: updates.industry,
        status: updates.status,
      };
      
      // Remove undefined values and empty strings for optional fields
      const cleanUpdates = {};
      Object.entries(mappedUpdates).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          // Keep empty strings for required fields, but convert empty strings to null for optional phone
          if (key === 'contactPhone' && value === '') {
            cleanUpdates[key] = null;
          } else {
            cleanUpdates[key] = value;
          }
        }
      });
      
      // Use customer-isolated database service 
      const contractor = await databaseService.updateContractorCompany(context, id, cleanUpdates);
      
      if (!contractor) {
        return res.status(404).json({ error: "Contractor not found" });
      }
      

      // Audit trail — company updated
      try {
        const auditDb = await customerDbService.getCustomerDatabase(context.customerId);
        const auditTs = new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Europe/London' });
        const changedFields = Object.keys(cleanUpdates).join(', ');
        await auditDb.insert(isolatedSchema.companyNotes).values({
          companyId: id,
          changeType: 'company_updated',
          notes: `Company details updated by ${username} on ${auditTs}. Fields changed: ${changedFields || 'general update'}`,
          changedBy: username,
        });
      } catch (auditErr) {
        logger.error('Failed to create company update audit note (continuing):', auditErr);
      }

      res.json(contractor);
    } catch (error) {
      logger.error("Error updating contractor:", error);
      res.status(500).json({ error: "Failed to update contractor" });
    }
  });

  // PATCH /api/contractors/:id — partial update supporting CDM/accreditation fields
  app.patch("/api/contractors/:id", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    try {
      const { id } = req.params;
      const updates = req.body;
      const db = await customerDbService.getCustomerDatabase(req.customerId!);

      // Build field map for both regular and CDM fields
      const fieldMap: Record<string, any> = {};
      if (updates.name !== undefined) fieldMap.companyName = updates.name;
      if (updates.email !== undefined) fieldMap.contactEmail = updates.email;
      if (updates.phone !== undefined) fieldMap.contactPhone = updates.phone || null;
      if (updates.address !== undefined) fieldMap.address = updates.address;
      if (updates.postcode !== undefined) fieldMap.postcode = updates.postcode;
      if (updates.website !== undefined) fieldMap.website = updates.website;
      if (updates.description !== undefined) fieldMap.description = updates.description;
      if (updates.industry !== undefined) fieldMap.industry = updates.industry;
      if (updates.status !== undefined) fieldMap.status = updates.status;
      // CDM / accreditation fields
      if (updates.cdmRole !== undefined) fieldMap.cdmRole = updates.cdmRole;
      if (updates.constructionlineGrade !== undefined) fieldMap.constructionlineGrade = updates.constructionlineGrade;
      if (updates.chasCertified !== undefined) fieldMap.chasCertified = Boolean(updates.chasCertified);
      if (updates.smasAccredited !== undefined) fieldMap.smasAccredited = Boolean(updates.smasAccredited);
      if (updates.otherAccreditations !== undefined) fieldMap.otherAccreditations = updates.otherAccreditations;
      if (updates.pdProfessionalBody !== undefined) fieldMap.pdProfessionalBody = updates.pdProfessionalBody;

      if (Object.keys(fieldMap).length === 0) return res.status(400).json({ error: "No valid fields provided" });

      const [updated] = await db.update(isolatedSchema.contractorCompanies)
        .set(fieldMap)
        .where(eq(isolatedSchema.contractorCompanies.id, id))
        .returning();

      if (!updated) return res.status(404).json({ error: "Contractor not found" });
      res.json(updated);
    } catch (error) {
      logger.error("Error patching contractor:", error);
      res.status(500).json({ error: "Failed to update contractor" });
    }
  });

  app.delete("/api/contractors/:id", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    try {
      const { id } = req.params;
      const delCompContext = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const delCompDb = await customerDbService.getCustomerDatabase(delCompContext.customerId);
      const [deletedComp] = await delCompDb.delete(isolatedSchema.contractorCompanies)
        .where(eq(isolatedSchema.contractorCompanies.id, id)).returning();
      const success = !!deletedComp;
      
      if (!success) {
        return res.status(404).json({ error: "Contractor not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      logger.error("Error deleting contractor:", error);
      res.status(500).json({ error: "Failed to delete contractor" });
    }
  });

  // Contractor Worker endpoints

  // ======================================
  // CO2 EMISSIONS TRACKING ENDPOINTS  
  // ======================================

  // Initialize CO2 calculation service
  const co2Calculator = new CO2CalculationService(databaseService);

  // Calculate CO2 emissions for a worker
  app.post("/api/contractors/workers/:workerId/co2/calculate", requireAuth, async (req, res) => {
    try {
      const { workerId } = req.params;
      const { postcode, transportMethod, workingDaysPerMonth } = req.body;

      // FIXED: Get customer context using authenticated session customerId
      if (!req.customerId) {
        return res.status(401).json({ error: "Customer context not found in session" });
      }
      const context = { customerId: req.customerId };
      
      // Get company settings for address
      const companySettings = await simpleDatabaseService.getCompanySettings(context);
      if (!companySettings?.address) {
        return res.status(400).json({ error: "Company address not configured in settings" });
      }

      // Get worker details
      const worker = await databaseService.getContractorWorkerById(context, workerId);
      if (!worker) {
        return res.status(404).json({ error: "Worker not found" });
      }

      // Calculate CO2 emissions
      const co2Data = await co2Calculator.calculateWorkerCO2Emissions(
        context.customerId,
        worker.companyId,
        {
          workerId,
          workerPostcode: postcode,
          companyAddress: companySettings.address,
          transportMethod,
          workingDaysPerMonth
        }
      );

      res.json({
        success: true,
        data: co2Data,
        message: "CO2 emissions calculated successfully"
      });
    } catch (error) {
      logger.error("Error calculating CO2 emissions:", error);
      res.status(500).json({ error: error.message || "Failed to calculate CO2 emissions" });
    }
  });

  // Bulk calculate CO2 emissions for all workers in a company
  app.post("/api/contractors/:companyId/co2/calculate-all", requireAuth, async (req, res) => {
    try {
      const { companyId } = req.params;

      if (!req.customerId) {
        return res.status(401).json({ error: "Customer context not found in session" });
      }
      const context = { customerId: req.customerId };

      // Get company settings (which contains the address)
      const companySettings = await databaseService.getCompanySettings(context);
      if (!companySettings || !companySettings.address) {
        return res.status(400).json({ 
          error: "Company address not configured",
          message: "Please configure your company address in Settings to calculate CO2 emissions"
        });
      }

      // Get all workers for this company
      const workers = await databaseService.getWorkersByCompany(context, companyId);
      const workersWithPostcodes = workers.filter(w => w.postcode && w.postcode.trim());

      if (workersWithPostcodes.length === 0) {
        return res.status(400).json({ 
          error: "No workers found with postcodes",
          message: "Workers need postcodes to calculate CO2 emissions"
        });
      }

      const results = [];
      const errors = [];

      // Calculate CO2 for each worker
      for (const worker of workersWithPostcodes) {
        try {
          const co2Data = await co2Calculator.calculateWorkerCO2Emissions(
            context.customerId,
            companyId,
            {
              workerId: worker.id,
              workerPostcode: worker.postcode,
              companyAddress: companySettings.address,
              transportMethod: worker.transportMethod || 'car_diesel', // Use worker's transport method or default
              workingDaysPerMonth: 22 // Default
            }
          );
          results.push({
            workerId: worker.id,
            workerName: `${worker.firstName} ${worker.lastName}`,
            success: true,
            monthlyCO2kg: co2Data.monthlyCO2kg
          });
        } catch (error) {
          errors.push({
            workerId: worker.id,
            workerName: `${worker.firstName} ${worker.lastName}`,
            error: error.message
          });
        }
      }

      res.json({
        success: true,
        message: `Calculated CO2 emissions for ${results.length} workers`,
        data: {
          calculated: results,
          failed: errors,
          totalWorkers: workersWithPostcodes.length,
          successCount: results.length,
          failureCount: errors.length
        }
      });
    } catch (error) {
      logger.error("Error bulk calculating CO2 emissions:", error);
      res.status(500).json({ error: error.message || "Failed to calculate CO2 emissions" });
    }
  });

  // Get CO2 summary for a company
  app.get("/api/contractors/:companyId/co2/summary", requireAuth, async (req, res) => {
    try {
      const { companyId } = req.params;

      // FIXED: Get customer context using authenticated session customerId
      if (!req.customerId) {
        return res.status(401).json({ error: "Customer context not found in session" });
      }
      const context = { customerId: req.customerId };

      const summary = await co2Calculator.getCompanyCO2Summary(context.customerId, companyId);

      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      logger.error("Error fetching CO2 summary:", error);
      res.status(500).json({ error: "Failed to fetch CO2 summary" });
    }
  });

  // Get CO2 data for a specific worker
  app.get("/api/contractors/workers/:workerId/co2", requireAuth, async (req, res) => {
    try {
      const { workerId } = req.params;

      // FIXED: Get customer context using authenticated session customerId
      if (!req.customerId) {
        return res.status(401).json({ error: "Customer context not found in session" });
      }
      const context = { customerId: req.customerId };

      const co2Data = await databaseService.getCO2EmissionsByWorker(context.customerId, workerId);
      const suggestions = await co2Calculator.getReductionSuggestions(context.customerId, workerId);

      res.json({
        success: true,
        data: {
          emissions: co2Data,
          reductionSuggestions: suggestions
        }
      });
    } catch (error) {
      logger.error("Error fetching worker CO2 data:", error);
      res.status(500).json({ error: "Failed to fetch worker CO2 data" });
    }
  });

  // Generate sustainability report for a company
  app.post("/api/contractors/:companyId/co2/report", requireAuth, async (req, res) => {
    try {
      const { companyId } = req.params;
      const { reportType = 'monthly' } = req.body;

      // FIXED: Get customer context using authenticated session customerId
      if (!req.customerId) {
        return res.status(401).json({ error: "Customer context not found in session" });
      }
      const context = { customerId: req.customerId };

      const report = await co2Calculator.generateSustainabilityReport(
        context.customerId,
        companyId,
        reportType
      );

      res.json({
        success: true,
        data: report,
        message: "Sustainability report generated successfully"
      });
    } catch (error) {
      logger.error("Error generating sustainability report:", error);
      res.status(500).json({ error: "Failed to generate sustainability report" });
    }
  });

  // Get all sustainability reports for a company
  app.get("/api/contractors/:companyId/co2/reports", requireAuth, async (req, res) => {
    try {
      const { companyId } = req.params;

      // FIXED: Get customer context using authenticated session customerId
      if (!req.customerId) {
        return res.status(401).json({ error: "Customer context not found in session" });
      }
      const context = { customerId: req.customerId };

      const reports = await databaseService.getSustainabilityReports(context.customerId, companyId);

      // Map database fields to frontend expected fields
      const mappedReports = reports.map(report => ({
        id: report.id,
        companyId: report.companyId,
        companyName: report.companyId, // Will be enhanced with actual company name
        reportType: report.reportType,
        totalCO2kg: parseFloat(report.totalCO2Analyzed || '0'), // Map totalCO2Analyzed -> totalCO2kg
        workerCount: report.totalWorkersCovered || 0, // Map totalWorkersCovered -> workerCount
        recommendations: report.reductionRecommendations ? [report.reductionRecommendations] : [],
        insights: report.environmentalImpactAnalysis ? [report.environmentalImpactAnalysis] : [],
        generatedAt: report.generatedAt,
        isActive: true,
        // Include full report content for viewing
        fullReportContent: report.fullReportContent,
        executiveSummary: report.executiveSummary,
        actionPlan: report.actionPlan,
        topRecommendation: report.topRecommendation
      }));

      res.json({
        success: true,
        data: mappedReports
      });
    } catch (error) {
      logger.error("Error fetching sustainability reports:", error);
      res.status(500).json({ error: "Failed to fetch sustainability reports" });
    }
  });

  // Get individual sustainability report for viewing/PDF
  app.get("/api/sustainability-reports/:reportId", requireAuth, async (req, res) => {
    try {
      const { reportId } = req.params;

      // FIXED: Get customer context using authenticated session customerId
      if (!req.customerId) {
        return res.status(401).json({ error: "Customer context not found in session" });
      }
      const context = { customerId: req.customerId };

      const reports = await databaseService.getSustainabilityReports(context.customerId);
      const report = reports.find(r => r.id === reportId);

      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      res.json({
        success: true,
        data: {
          id: report.id,
          reportTitle: report.reportTitle,
          reportType: report.reportType,
          reportPeriod: report.reportPeriod,
          totalWorkersCovered: report.totalWorkersCovered,
          totalCO2Analyzed: parseFloat(report.totalCO2Analyzed || '0'),
          executiveSummary: report.executiveSummary,
          currentEmissionsStatus: report.currentEmissionsStatus,
          environmentalImpactAnalysis: report.environmentalImpactAnalysis,
          reductionRecommendations: report.reductionRecommendations,
          industryComparison: report.industryComparison,
          actionPlan: report.actionPlan,
          fullReportContent: report.fullReportContent,
          topRecommendation: report.topRecommendation,
          potentialSavings: parseFloat(report.potentialSavings || '0'),
          generatedBy: report.generatedBy,
          aiModel: report.aiModel,
          generatedAt: report.generatedAt
        }
      });
    } catch (error) {
      logger.error("Error fetching sustainability report:", error);
      res.status(500).json({ error: "Failed to fetch sustainability report" });
    }
  });

  // Get monthly CO2 summary for dashboard
  app.get("/api/co2/monthly-summary", requireAuth, async (req, res) => {
    try {
      const { year, month, companyId } = req.query;

      // FIXED: Get customer context using authenticated session customerId
      if (!req.customerId) {
        return res.status(401).json({ error: "Customer context not found in session" });
      }
      const context = { customerId: req.customerId };

      const summary = await databaseService.getMonthlySummary(
        context.customerId,
        companyId as string,
        parseInt(year as string) || new Date().getFullYear(),
        parseInt(month as string) || new Date().getMonth() + 1
      );

      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      logger.error("Error fetching monthly CO2 summary:", error);
      res.status(500).json({ error: "Failed to fetch monthly CO2 summary" });
    }
  });

  // Update transport method for a worker
  app.put("/api/contractors/workers/:workerId/transport", requireAuth, async (req, res) => {
    try {
      const { workerId } = req.params;
      const { transportMethod, postcode } = req.body;

      // FIXED: Get customer context using authenticated session customerId
      if (!req.customerId) {
        return res.status(401).json({ error: "Customer context not found in session" });
      }
      const context = { customerId: req.customerId };
      
      // Update worker postcode if provided
      if (postcode) {
        const postcodeDb = await customerDbService.getCustomerDatabase(context.customerId);
        await svcUpdateWorkerPostcode(
          { db: postcodeDb, customerId: context.customerId, actor: req.user!.username },
          workerId,
          postcode,
        );
      }

      // Get company settings for address
      const companySettings = await simpleDatabaseService.getCompanySettings(context);
      if (!companySettings?.address) {
        return res.status(400).json({ error: "Company address not configured" });
      }

      // Get worker details
      const worker = await databaseService.getContractorWorkerById(context, workerId);
      if (!worker) {
        return res.status(404).json({ error: "Worker not found" });
      }

      // Recalculate CO2 emissions with new transport method
      const co2Data = await co2Calculator.calculateWorkerCO2Emissions(
        context.customerId,
        worker.companyId,
        {
          workerId,
          workerPostcode: postcode || worker.postcode || '',
          companyAddress: companySettings.address,
          transportMethod,
        }
      );

      res.json({
        success: true,
        data: co2Data,
        message: "Transport method updated and CO2 emissions recalculated"
      });
    } catch (error) {
      logger.error("Error updating transport method:", error);
      res.status(500).json({ error: "Failed to update transport method" });
    }
  });

  // NVQ Qualifications endpoints
  app.get("/api/nvq-qualifications", requireAuth, async (req, res) => {
    try {
      const nvqContext = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const nvqDb = await customerDbService.getCustomerDatabase(nvqContext.customerId);
      const qualifications = await nvqDb.select().from(isolatedSchema.nvqQualifications)
        .where(eq(isolatedSchema.nvqQualifications.isActive, true));
      res.json(qualifications);
    } catch (error) {
      logger.error("Error fetching NVQ qualifications:", error);
      res.status(500).json({ error: "Failed to fetch NVQ qualifications" });
    }
  });

  app.get("/api/nvq-qualifications/all", requireAuth, async (req, res) => {
    try {
      const nvqAllContext = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const nvqAllDb = await customerDbService.getCustomerDatabase(nvqAllContext.customerId);
      const qualifications = await nvqAllDb.select().from(isolatedSchema.nvqQualifications);
      res.json(qualifications);
    } catch (error) {
      logger.error("Error fetching all NVQ qualifications:", error);
      res.status(500).json({ error: "Failed to fetch all NVQ qualifications" });
    }
  });

  app.post("/api/nvq-qualifications", requireAuth, async (req, res) => {
    try {
      const qualificationData = insertNvqQualificationSchema.parse(req.body);
      const nvqCreateContext = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const nvqCreateDb = await customerDbService.getCustomerDatabase(nvqCreateContext.customerId);
      const [qualification] = await nvqCreateDb.insert(isolatedSchema.nvqQualifications)
        .values(qualificationData).returning();
      res.json(qualification);
    } catch (error) {
      logger.error("Error creating NVQ qualification:", error);
      res.status(500).json({ error: "Failed to create NVQ qualification" });
    }
  });

  app.put("/api/nvq-qualifications/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const updates = insertNvqQualificationSchema.partial().parse(req.body);
      const nvqUpdateContext = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const nvqUpdateDb = await customerDbService.getCustomerDatabase(nvqUpdateContext.customerId);
      const [qualification] = await nvqUpdateDb.update(isolatedSchema.nvqQualifications)
        .set(updates).where(eq(isolatedSchema.nvqQualifications.id, id)).returning();
      
      if (!qualification) {
        return res.status(404).json({ error: "NVQ qualification not found" });
      }
      
      res.json(qualification);
    } catch (error) {
      logger.error("Error updating NVQ qualification:", error);
      res.status(500).json({ error: "Failed to update NVQ qualification" });
    }
  });

  app.delete("/api/nvq-qualifications/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const nvqDelContext = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const nvqDelDb = await customerDbService.getCustomerDatabase(nvqDelContext.customerId);
      const [deletedNvq] = await nvqDelDb.delete(isolatedSchema.nvqQualifications)
        .where(eq(isolatedSchema.nvqQualifications.id, id)).returning();
      const success = !!deletedNvq;
      
      if (!success) {
        return res.status(404).json({ error: "NVQ qualification not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      logger.error("Error deleting NVQ qualification:", error);
      res.status(500).json({ error: "Failed to delete NVQ qualification" });
    }
  });

  app.get("/api/contractors/:companyId/workers", requireAuth, async (req, res) => {
    try {
      const { companyId } = req.params;
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const workers = await databaseService.getWorkersByCompanyId(context, companyId);
      res.json(workers);
    } catch (error) {
      logger.error("Error fetching workers:", error);
      res.status(500).json({ error: "Failed to fetch workers" });
    }
  });

  app.post("/api/contractors/:companyId/workers", requireAuth, async (req, res) => {
    try {
      // Role check — only admin/manager can add workers
      if (!['admin', 'manager'].includes(req.user!.role)) {
        return res.status(403).json({ error: 'Only admins and managers can add workers.' });
      }
      const { companyId } = req.params;
      const db = await customerDbService.getCustomerDatabase(req.customerId);
      const svcCtx: WorkerServiceContext = { db, customerId: req.customerId, actor: req.user!.username };

      const worker = await svcCreateWorker(svcCtx, companyId, req.body, 'admin');
      logger.info(`Created contractor worker ${worker.id} for customer ${req.customerId}`);
      res.json(worker);
    } catch (error) {
      if (error instanceof ServiceError) {
        return res.status(error.status).json({ error: error.message, ...error.extra });
      }
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid worker data", details: error.errors });
      }
      logger.error("Error creating worker:", error);
      res.status(500).json({ error: "Failed to create worker" });
    }
  });

  app.put("/api/workers/:id", requireAuth, handleContractorWorkerUpdate);

  // Archive a worker (soft-delete) — admin/manager only
  app.post("/api/contractors/workers/:id/archive", requireAuth, async (req, res) => {
    try {
      if (!['admin', 'manager'].includes(req.user!.role)) {
        return res.status(403).json({ error: "Only admins and managers can archive workers." });
      }
      const db = await customerDbService.getCustomerDatabase(req.customerId);
      const svcCtx: WorkerServiceContext = { db, customerId: req.customerId, actor: req.user!.username };
      await svcArchiveWorker(svcCtx, req.params.id, req.body.reason);
      res.json({ success: true, message: "Worker archived successfully." });
    } catch (error) {
      if (error instanceof ServiceError) {
        return res.status(error.status).json({ error: error.message });
      }
      logger.error("Error archiving worker:", error);
      res.status(500).json({ error: "Failed to archive worker" });
    }
  });

  // Unarchive a worker — admin/manager only
  app.post("/api/contractors/workers/:id/unarchive", requireAuth, async (req, res) => {
    try {
      if (!['admin', 'manager'].includes(req.user!.role)) {
        return res.status(403).json({ error: "Only admins and managers can unarchive workers." });
      }
      const db = await customerDbService.getCustomerDatabase(req.customerId);
      const svcCtx: WorkerServiceContext = { db, customerId: req.customerId, actor: req.user!.username };
      await svcUnarchiveWorker(svcCtx, req.params.id);
      res.json({ success: true, message: "Worker unarchived successfully." });
    } catch (error) {
      if (error instanceof ServiceError) {
        return res.status(error.status).json({ error: error.message });
      }
      logger.error("Error unarchiving worker:", error);
      res.status(500).json({ error: "Failed to unarchive worker" });
    }
  });

  // Get archived workers for a company
  app.get("/api/contractors/:companyId/archived-workers", requireAuth, async (req, res) => {
    try {
      const { companyId } = req.params;
      const archivedCtx = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const archivedDb = await customerDbService.getCustomerDatabase(archivedCtx.customerId);
      const archivedWorkers = await archivedDb
        .select()
        .from(isolatedSchema.contractorWorkers)
        .where(and(
          eq(isolatedSchema.contractorWorkers.companyId, companyId),
          eq(isolatedSchema.contractorWorkers.isActive, false)
        ));
      res.json(archivedWorkers);
    } catch (error) {
      logger.error("Error fetching archived workers:", error);
      res.status(500).json({ error: "Failed to fetch archived workers" });
    }
  });

  // Hard delete worker — admin only, requires confirmName
  app.delete("/api/workers/:id", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== 'admin') {
        return res.status(403).json({ error: "Only admins can permanently delete workers." });
      }
      const db = await customerDbService.getCustomerDatabase(req.customerId);
      const svcCtx: WorkerServiceContext = { db, customerId: req.customerId, actor: req.user!.username };
      const { fullName } = await svcHardDeleteWorker(svcCtx, req.params.id, req.body.confirmName);
      res.json({ success: true, message: `Worker "${fullName}" permanently deleted.` });
    } catch (error) {
      if (error instanceof ServiceError) {
        return res.status(error.status).json({ error: error.message, ...error.extra });
      }
      logger.error("Error deleting worker:", error);
      res.status(500).json({ error: "Failed to delete worker" });
    }
  });

  // Compliance Document endpoints
  app.get("/api/contractors/:companyId/documents", requireAuth, async (req, res) => {
    try {
      const { companyId } = req.params;
      const compDocsContext = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const compDocsDb = await customerDbService.getCustomerDatabase(compDocsContext.customerId);
      const documents = await compDocsDb.select().from(isolatedSchema.contractorDocuments)
        .where(and(
          eq(isolatedSchema.contractorDocuments.companyId, companyId),
          eq(isolatedSchema.contractorDocuments.isActive, true)
        ));
      res.json(documents);
    } catch (error) {
      logger.error("Error fetching documents:", error);
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  // Server-side document upload — replaces the old signed-URL flow that failed
  // in browsers due to GCS CORS. The file is streamed through our server to GCS
  // using the Replit sidecar credentials (no browser-side GCS auth needed).
  const contractorDocUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
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
  app.post("/api/contractors/:companyId/documents/upload", requireAuth, contractorDocUpload.single('file'), async (req, res) => {
    try {
      if (!['admin', 'manager'].includes((req.user as any)?.role)) {
        return res.status(403).json({ error: 'Manager or administrator access required' });
      }
      if (!req.file) return res.status(400).json({ error: 'No file provided' });
      const { companyId } = req.params;
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      const db = await customerDbService.getCustomerDatabase(context.customerId);
      await ensureContractorColumns(db, context.customerId);
      const [company] = await db.select().from(isolatedSchema.contractorCompanies)
        .where(eq(isolatedSchema.contractorCompanies.id, companyId)).limit(1);
      if (!company) return res.status(404).json({ error: 'Company not found' });

      const objectStorageService = new ObjectStorageService();
      const privateObjectDir = objectStorageService.getPrivateObjectDir();
      const { randomUUID } = await import('crypto');
      const ext = (req.file.originalname.split('.').pop() || 'bin').toLowerCase();
      const objectId = randomUUID();
      const fullPath = `${privateObjectDir}/${req.customerId}/uploads/${objectId}.${ext}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const gcsFile = bucket.file(objectName);
      await gcsFile.save(req.file.buffer, {
        contentType: req.file.mimetype || 'application/octet-stream',
        resumable: false,
      });
      // Return namespaced internal object path — consumed by POST /api/contractors/:id/documents
      const fileUrl = `/objects/${req.customerId}/uploads/${objectId}.${ext}`;
      res.json({ fileUrl });
    } catch (error) {
      logger.error('Error uploading company document to object storage:', error);
      res.status(500).json({ error: 'Failed to upload document' });
    }
  });

  // Keep the old upload-url GET for any legacy callers; it still works for server-side flows
  app.get("/api/contractors/:companyId/documents/upload-url", requireAuth, async (req, res) => {
    try {
      const { companyId } = req.params;
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      const db = await customerDbService.getCustomerDatabase(context.customerId);
      const [company] = await db.select().from(isolatedSchema.contractorCompanies)
        .where(eq(isolatedSchema.contractorCompanies.id, companyId)).limit(1);
      if (!company) return res.status(404).json({ error: 'Company not found' });
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      logger.error('Error getting company document upload URL:', error);
      res.status(500).json({ error: 'Failed to get upload URL' });
    }
  });

  app.post("/api/contractors/:companyId/documents", requireAuth, async (req, res) => {
    try {
      if (!['admin', 'manager'].includes((req.user as any)?.role)) {
        return res.status(403).json({ error: 'Manager or administrator access required' });
      }
      const { companyId } = req.params;
      const { documentName, documentType, documentUrl, expiryDate, issuedBy, policyNumber } = req.body;
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      const db = await customerDbService.getCustomerDatabase(context.customerId);

      const [currentUser] = await db.select().from(isolatedSchema.users)
        .where(eq(isolatedSchema.users.username, username)).limit(1);

      const objectStorageService = new ObjectStorageService();
      const normalizedUrl = documentUrl ? objectStorageService.normalizeObjectEntityPath(documentUrl) : documentUrl;

      // Reject any /objects/ URL that is not namespaced to this customer.
      // Legacy paths (/objects/uploads/... or /objects/contractor-portal/...) do not carry
      // a tenant identifier and can be forged by an authorized user from another tenant to
      // gain access to that tenant's private files. Only namespaced paths belonging to the
      // current customer are permitted.
      if (normalizedUrl && normalizedUrl.startsWith('/objects/')) {
        const isNamespaced = normalizedUrl.startsWith(`/objects/${req.customerId}/`);
        if (!isNamespaced) {
          return res.status(400).json({ error: 'Invalid document URL: please use a freshly uploaded file' });
        }
      }

      const [document] = await db.insert(isolatedSchema.contractorDocuments).values({
        companyId,
        documentName: documentName || documentType,
        documentType,
        documentUrl: normalizedUrl,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        uploadedBy: currentUser?.id || username,
        issuedBy: issuedBy || null,
        policyNumber: policyNumber || null,
        status: 'pending',
        isActive: true,
      }).returning();

      // Reset expiryAlertedAt on any previous document of the same type for this company
      // so the nightly cron can alert on the new document's expiry date
      if (documentType) {
        try {
          await db.update(isolatedSchema.contractorDocuments)
            .set({ expiryAlertedAt: null })
            .where(and(
              eq(isolatedSchema.contractorDocuments.companyId, companyId),
              isNull(isolatedSchema.contractorDocuments.workerId),
              eq(isolatedSchema.contractorDocuments.documentType, documentType),
              isNotNull(isolatedSchema.contractorDocuments.expiryAlertedAt),
              ne(isolatedSchema.contractorDocuments.id, document.id)
            ));
        } catch (resetErr) {
          logger.error('Failed to reset expiryAlertedAt on previous company documents (continuing):', resetErr);
        }
      }

      // Audit trail — company document uploaded
      try {
        const auditTs = new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Europe/London' });
        const docLabel = (documentType || documentName || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
        await db.insert(isolatedSchema.companyNotes).values({
          companyId,
          changeType: 'document_uploaded',
          notes: `Document "${docLabel}" uploaded by ${username} on ${auditTs}${expiryDate ? ` (expires ${new Date(expiryDate).toLocaleDateString('en-GB')})` : ''}`,
          changedBy: username,
        });
      } catch (auditErr) {
        logger.error('Failed to create company document audit note (continuing):', auditErr);
      }

      res.json({ success: true, document });
    } catch (error) {
      logger.error("Error creating company document:", error);
      res.status(500).json({ error: "Failed to create document" });
    }
  });

  app.patch("/api/contractors/:companyId/documents/:documentId", requireAuth, async (req, res) => {
    try {
      if (!['admin', 'manager'].includes((req.user as any)?.role)) {
        return res.status(403).json({ error: 'Manager or administrator access required' });
      }
      const { companyId, documentId } = req.params;
      const { documentUrl, expiryDate, issuedBy, policyNumber, status } = req.body;
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      const db = await customerDbService.getCustomerDatabase(context.customerId);

      const objectStorageService = new ObjectStorageService();
      const normalizedUrl = documentUrl ? objectStorageService.normalizeObjectEntityPath(documentUrl) : undefined;

      // Reject any /objects/ URL that is not namespaced to this customer (same rule as create).
      if (normalizedUrl && normalizedUrl.startsWith('/objects/')) {
        const isNamespaced = normalizedUrl.startsWith(`/objects/${req.customerId}/`);
        if (!isNamespaced) {
          return res.status(400).json({ error: 'Invalid document URL: please use a freshly uploaded file' });
        }
      }

      // Read current state before updating so we can detect genuine expiry transitions
      const [prevDoc] = await db.select({
        status: isolatedSchema.contractorDocuments.status,
        expiryDate: isolatedSchema.contractorDocuments.expiryDate,
      }).from(isolatedSchema.contractorDocuments)
        .where(and(
          eq(isolatedSchema.contractorDocuments.id, documentId),
          eq(isolatedSchema.contractorDocuments.companyId, companyId)
        ));

      const updateData: any = { updatedAt: new Date() };
      if (normalizedUrl) updateData.documentUrl = normalizedUrl;
      if (expiryDate !== undefined) {
        updateData.expiryDate = expiryDate ? new Date(expiryDate) : null;
        // Reset the alert stamp so the cron can alert on the new expiry date
        updateData.expiryAlertedAt = null;
      }
      if (issuedBy !== undefined) updateData.issuedBy = issuedBy;
      if (policyNumber !== undefined) updateData.policyNumber = policyNumber;
      if (status) updateData.status = status;

      const [updated] = await db.update(isolatedSchema.contractorDocuments)
        .set(updateData)
        .where(and(
          eq(isolatedSchema.contractorDocuments.id, documentId),
          eq(isolatedSchema.contractorDocuments.companyId, companyId)
        )).returning();

      // Audit trail — company document replaced/updated
      try {
        const auditTs = new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Europe/London' });
        const docLabel = (updated?.documentType || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || 'Document';
        const action = normalizedUrl ? 'replaced' : 'updated';
        await db.insert(isolatedSchema.companyNotes).values({
          companyId,
          changeType: `document_${action}`,
          notes: `Document "${docLabel}" ${action} by ${username} on ${auditTs}${expiryDate ? ` (new expiry: ${new Date(expiryDate).toLocaleDateString('en-GB')})` : ''}`,
          changedBy: username,
        });
      } catch (auditErr) {
        logger.error('Failed to create company document update audit note (continuing):', auditErr);
      }

      // Fire-and-forget: notify admin only on genuine transition to expired
      const now = new Date();
      const wasAlreadyExpired = prevDoc
        ? (prevDoc.status === 'expired' || (prevDoc.expiryDate != null && new Date(prevDoc.expiryDate) < now))
        : false;
      const isNowExpired = (expiryDate && new Date(expiryDate) < now) || status === 'expired';
      if (updated && isNowExpired && !wasAlreadyExpired) {
        setImmediate(async () => {
          try {
            const auditTs = new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Europe/London' });
            const docLabel = (updated.documentType || updated.documentName || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || 'Document';
            const settingsRows = await db.execute(`SELECT company_name, email, notify_on_document_expiry FROM company_settings LIMIT 1`);
            const sRow = settingsRows.rows[0] as { company_name?: string; email?: string; notify_on_document_expiry?: boolean } | undefined;
            const adminEmail = sRow?.email as string | undefined;
            const notifyOnExpiry = sRow?.notify_on_document_expiry !== false;
            if (adminEmail && notifyOnExpiry) {
              const [contractor] = await db.select({ companyName: isolatedSchema.contractorCompanies.companyName })
                .from(isolatedSchema.contractorCompanies)
                .where(eq(isolatedSchema.contractorCompanies.id, companyId));
              const contractorName = contractor?.companyName || companyId;
              const companyName = (sRow?.company_name as string) || 'TPR Max';
              const expiryStr = expiryDate ? new Date(expiryDate).toLocaleDateString('en-GB') : 'N/A';
              const emailSvc = new EmailService(context.customerId);
              await emailSvc.sendEmail({
                to: adminEmail,
                subject: `Compliance Alert: Document Expired — ${contractorName}`,
                companyName,
                html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto">
                  <div style="background:#d97706;color:#fff;padding:20px;border-radius:8px 8px 0 0">
                    <h2 style="margin:0">Contractor Compliance Alert — ${companyName}</h2>
                  </div>
                  <div style="background:#fff;padding:20px;border:1px solid #e5e7eb">
                    <p style="margin-top:0">A compliance document has <strong>expired</strong>, which means this contractor may no longer be compliant.</p>
                    <table style="width:100%;border-collapse:collapse;margin:16px 0">
                      <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb">Contractor</td><td style="padding:8px;border:1px solid #e5e7eb">${contractorName}</td></tr>
                      <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb">Document</td><td style="padding:8px;border:1px solid #e5e7eb">${docLabel}</td></tr>
                      <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb">Expiry Date</td><td style="padding:8px;border:1px solid #e5e7eb">${expiryStr}</td></tr>
                      <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb">Recorded At</td><td style="padding:8px;border:1px solid #e5e7eb">${auditTs}</td></tr>
                    </table>
                    <p style="color:#6b7280;font-size:14px">Please contact the contractor to request an updated document before deploying them on site.</p>
                  </div>
                </div>`,
                text: `Contractor Compliance Alert\n\nA compliance document has expired.\n\nContractor: ${contractorName}\nDocument: ${docLabel}\nExpiry Date: ${expiryStr}\nRecorded At: ${auditTs}\n\nPlease contact the contractor to request an updated document.`,
              });
            }
          } catch (emailErr) {
            logger.error('Failed to send contractor compliance expiry alert email:', emailErr);
          }
        });
      }

      res.json({ success: true, document: updated });
    } catch (error) {
      logger.error("Error updating company document:", error);
      res.status(500).json({ error: "Failed to update document" });
    }
  });

  // Delete (soft-delete) a company document — preserves the row for audit/GDPR history
  app.delete("/api/contractors/:companyId/documents/:documentId", requireAuth, async (req, res) => {
    try {
      if (!['admin', 'manager'].includes((req.user as any)?.role)) {
        return res.status(403).json({ error: 'Manager or administrator access required' });
      }
      const { companyId, documentId } = req.params;
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      const db = await customerDbService.getCustomerDatabase(context.customerId);

      const [deleted] = await db
        .update(isolatedSchema.contractorDocuments)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(
          eq(isolatedSchema.contractorDocuments.id, documentId),
          eq(isolatedSchema.contractorDocuments.companyId, companyId)
        ))
        .returning();

      if (!deleted) {
        return res.status(404).json({ error: "Document not found" });
      }

      // Audit trail
      try {
        const auditTs = new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Europe/London' });
        const docLabel = (deleted.documentType || deleted.documentName || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || 'Document';
        await db.insert(isolatedSchema.companyNotes).values({
          companyId,
          changeType: 'document_deleted',
          notes: `Document "${docLabel}" deleted by ${username} on ${auditTs}`,
          changedBy: username,
        });
      } catch (auditErr) {
        logger.error('Failed to create company document delete audit note (continuing):', auditErr);
      }

      // Fire-and-forget: notify admin that a compliance document was deleted
      setImmediate(async () => {
        try {
          const auditTs = new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Europe/London' });
          const docLabel = (deleted.documentType || deleted.documentName || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || 'Document';
          const settingsRows = await db.execute(`SELECT company_name, email, notify_on_document_deletion FROM company_settings LIMIT 1`);
          const sRow = settingsRows.rows[0] as { company_name?: string; email?: string; notify_on_document_deletion?: boolean } | undefined;
          const adminEmail = sRow?.email as string | undefined;
          const notifyOnDeletion = sRow?.notify_on_document_deletion !== false;
          if (adminEmail && notifyOnDeletion) {
            const [contractor] = await db.select({ companyName: isolatedSchema.contractorCompanies.companyName })
              .from(isolatedSchema.contractorCompanies)
              .where(eq(isolatedSchema.contractorCompanies.id, companyId));
            const contractorName = contractor?.companyName || companyId;
            const companyName = (sRow?.company_name as string) || 'TPR Max';
            const emailSvc = new EmailService(context.customerId);
            await emailSvc.sendEmail({
              to: adminEmail,
              subject: `Compliance Alert: Document Deleted — ${contractorName}`,
              companyName,
              html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto">
                <div style="background:#dc2626;color:#fff;padding:20px;border-radius:8px 8px 0 0">
                  <h2 style="margin:0">Contractor Compliance Alert — ${companyName}</h2>
                </div>
                <div style="background:#fff;padding:20px;border:1px solid #e5e7eb">
                  <p style="margin-top:0">A compliance document has been <strong>deleted</strong>, which may affect the contractor's compliance status.</p>
                  <table style="width:100%;border-collapse:collapse;margin:16px 0">
                    <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb">Contractor</td><td style="padding:8px;border:1px solid #e5e7eb">${contractorName}</td></tr>
                    <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb">Document</td><td style="padding:8px;border:1px solid #e5e7eb">${docLabel}</td></tr>
                    <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb">Deleted By</td><td style="padding:8px;border:1px solid #e5e7eb">${username}</td></tr>
                    <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb">Deleted At</td><td style="padding:8px;border:1px solid #e5e7eb">${auditTs}</td></tr>
                  </table>
                  <p style="color:#6b7280;font-size:14px">Please review the contractor's compliance profile to ensure all required documents remain in place.</p>
                </div>
              </div>`,
              text: `Contractor Compliance Alert\n\nA compliance document has been deleted.\n\nContractor: ${contractorName}\nDocument: ${docLabel}\nDeleted By: ${username}\nDeleted At: ${auditTs}\n\nPlease review the contractor's compliance profile.`,
            });
          }
        } catch (emailErr) {
          logger.error('Failed to send contractor compliance deletion alert email:', emailErr);
        }
      });

      res.json({ success: true, message: 'Document deleted' });
    } catch (error) {
      logger.error("Error deleting company document:", error);
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  // Approve a company document
  app.patch("/api/contractors/:companyId/documents/:documentId/approve", requireAuth, async (req, res) => {
    try {
      if (!['admin', 'manager'].includes((req.user as any)?.role)) {
        return res.status(403).json({ error: 'Manager or administrator access required' });
      }
      const { companyId, documentId } = req.params;
      const username = req.user!.username;
      const displayName = req.user!.firstName && req.user!.lastName
        ? `${req.user!.firstName} ${req.user!.lastName}`
        : username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      const db = await customerDbService.getCustomerDatabase(context.customerId);
      const now = new Date();

      const [updated] = await db.update(isolatedSchema.contractorDocuments)
        .set({
          status: 'approved',
          approvedBy: displayName,
          approvedAt: now,
          updatedAt: now,
        })
        .where(and(
          eq(isolatedSchema.contractorDocuments.id, documentId),
          eq(isolatedSchema.contractorDocuments.companyId, companyId)
        ))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'Document not found' });
      }

      // ── Sync worker profile columns for worker-level documents ────────────
      // Mirrors the portal PUT /review route so both approval paths are consistent.
      // If the document belongs to a specific worker, update the matching profile field.
      const workerDocType = (updated as any).documentType as string | undefined;
      const workerDocExpiry = (updated as any).expiryDate as Date | string | null | undefined;
      const workerIdOnDoc = (updated as any).workerId as string | undefined;

      if (workerIdOnDoc && workerDocType) {
        type WorkerColUpdate = Partial<typeof isolatedSchema.contractorWorkers.$inferInsert>;
        let workerColUpdate: WorkerColUpdate | null = null;

        if (workerDocType === 'right_to_work') {
          workerColUpdate = {
            rightToWork: 'valid',
            rightToWorkExpiryDate: workerDocExpiry ? new Date(workerDocExpiry) : null,
          } as WorkerColUpdate;
        } else if (workerDocType === 'cscs_card') {
          workerColUpdate = { cscsStatus: 'valid' } as WorkerColUpdate;
        } else if (workerDocType === 'ipaf_card') {
          workerColUpdate = { ipafStatus: 'valid' } as WorkerColUpdate;
        }

        if (workerColUpdate) {
          try {
            await db
              .update(isolatedSchema.contractorWorkers)
              .set(workerColUpdate as any)
              .where(eq(isolatedSchema.contractorWorkers.id, workerIdOnDoc));
          } catch (syncErr: any) {
            logger.warn('[doc-approve-patch] Failed to sync worker status column (non-fatal):', syncErr.message?.substring(0, 80));
          }
        }
      }

      // ── Sync company-level expiry columns for insurance/policy documents ──
      const COMPANY_EXPIRY_COLUMN: Record<string, keyof typeof isolatedSchema.contractorCompanies.$inferInsert> = {
        publicLiability:       'publicLiabilityExpiryDate',
        employersLiability:    'employersLiabilityExpiryDate',
        professionalIndemnity: 'professionalIndemnityExpiryDate',
        healthSafety:          'healthSafetyPolicyExpiryDate',
      };
      const companyExpiryColumn = workerDocType ? COMPANY_EXPIRY_COLUMN[workerDocType] : undefined;
      if (companyExpiryColumn && workerDocExpiry && !workerIdOnDoc) {
        try {
          await db
            .update(isolatedSchema.contractorCompanies)
            .set({ [companyExpiryColumn]: new Date(workerDocExpiry) } as any)
            .where(eq(isolatedSchema.contractorCompanies.id, companyId));
        } catch (syncErr: any) {
          logger.warn('[doc-approve-patch] Failed to sync company expiry (non-fatal):', syncErr.message?.substring(0, 80));
        }
      }

      // Audit trail
      try {
        const auditTs = now.toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Europe/London' });
        const docLabel = (updated.documentType || updated.documentName || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
        const noteTable = workerIdOnDoc ? isolatedSchema.workerNotes : isolatedSchema.companyNotes;
        const noteValues = workerIdOnDoc
          ? { workerId: workerIdOnDoc, changeType: 'document_approved', notes: `Document "${docLabel}" approved by ${displayName} on ${auditTs}.`, changedBy: username }
          : { companyId, changeType: 'document_approved', notes: `Document "${docLabel}" approved by ${displayName} on ${auditTs}.`, changedBy: username };
        await db.insert(noteTable as any).values(noteValues);
      } catch (auditErr) {
        logger.error('Failed to create document approval audit note (continuing):', auditErr);
      }

      res.json({ success: true, document: updated });
    } catch (error) {
      logger.error("Error approving company document:", error);
      res.status(500).json({ error: "Failed to approve document" });
    }
  });

  // ── Request Documents via secure email link ──────────────────────────────
  app.post("/api/contractors/:companyId/request-documents", requireAuth, async (req, res) => {
    try {
      const { companyId } = req.params;
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);

      const [company] = await custDb.select().from(isolatedSchema.contractorCompanies)
        .where(eq(isolatedSchema.contractorCompanies.id, companyId)).limit(1);
      if (!company) return res.status(404).json({ error: 'Company not found' });

      const [settings] = await custDb.select({
        companyName: isolatedSchema.companySettings.companyName,
        logoUrl: isolatedSchema.companySettings.logoUrl,
        accentColor: isolatedSchema.companySettings.accentColor,
        backgroundColor: isolatedSchema.companySettings.backgroundColor,
      }).from(isolatedSchema.companySettings).limit(1);

      const token = randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      await db.insert(contractorDocumentRequests).values({
        token,
        customerId: context.customerId,
        companyId,
        expiresAt,
        status: 'active',
        requestedBy: username,
      });

      const host = req.headers.host || 'app.visigate.pro';
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const uploadLink = `${protocol}://${host}/contractor-upload/${token}`;

      const customerCompanyName = settings?.companyName || 'Your client';
      const contractorName = `${(company as any).contactFirstName || ''} ${(company as any).contactLastName || ''}`.trim() || 'Sir/Madam';
      const contractorEmail = (company as any).contactEmail;
      const contractorCompanyName = (company as any).companyName;

      let logoHtml = '';
      if (settings?.logoUrl) {
        const logoSrc = settings.logoUrl.startsWith('/uploads/') ? `/objects${settings.logoUrl}` : settings.logoUrl;
        logoHtml = `<img src="${protocol}://${host}${logoSrc}" alt="${customerCompanyName}" style="max-height:60px;max-width:200px;display:block;margin-bottom:16px;" />`;
      }

      const accentColor = settings?.accentColor || '#2460a9';

      const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8" /><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f7fa;margin:0;padding:0}
.wrap{max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)}
.header{background:${accentColor};padding:28px 32px;color:#fff}
.header h1{margin:0;font-size:20px;font-weight:600}
.body{padding:32px}
.body p{color:#374151;line-height:1.6;margin:0 0 16px}
.btn{display:inline-block;background:${accentColor};color:#fff!important;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px;margin:8px 0 24px}
.docs ul{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 16px 16px 32px;color:#374151}
.docs ul li{margin-bottom:6px}
.footer{border-top:1px solid #e5e7eb;padding:20px 32px;font-size:12px;color:#9ca3af}
</style></head>
<body>
<div class="wrap">
  <div class="header">
    ${logoHtml}
    <h1>Compliance Documents Required</h1>
  </div>
  <div class="body">
    <p>Dear ${contractorName},</p>
    <p>As part of our contractor onboarding and compliance process, <strong>${customerCompanyName}</strong> requires the following documents to be uploaded for <strong>${contractorCompanyName}</strong>.</p>
    <p>Please click the secure link below to upload your documents. The link is valid for <strong>7 days</strong>.</p>
    <a href="${uploadLink}" class="btn">📎 Upload Compliance Documents</a>
    <div class="docs">
      <p style="font-weight:600;margin-bottom:8px">Required documents:</p>
      <ul>
        <li>Public Liability Insurance (min. £2m)</li>
        <li>Employers' Liability Insurance (min. £5m)</li>
        <li>Health &amp; Safety Policy</li>
        <li>Risk Assessment &amp; Method Statement (RAMS)</li>
        <li>CIS Registration (if applicable)</li>
        <li>Modern Slavery Statement (if applicable)</li>
        <li>Environmental Policy (if applicable)</li>
        <li>Professional Indemnity Insurance (if applicable)</li>
      </ul>
    </div>
    <p style="margin-top:16px;font-size:13px;color:#6b7280">Each document must be uploaded as a PDF, image, or Word file. Please include the expiry date where applicable. Documents will be reviewed by our team before being marked as compliant.</p>
    <p style="font-size:13px;color:#6b7280">If the button above doesn't work, copy and paste this link into your browser:<br /><a href="${uploadLink}" style="color:${accentColor};word-break:break-all">${uploadLink}</a></p>
  </div>
  <div class="footer">This email was sent by ${customerCompanyName}. If you have any questions, please contact your account manager.</div>
</div>
</body></html>`;

      const emailSvc = new EmailService(context.customerId);
      await emailSvc.sendEmail({
        to: contractorEmail,
        subject: `Action Required: Compliance Documents for ${contractorCompanyName} — ${customerCompanyName}`,
        html,
        text: `Dear ${contractorName},\n\n${customerCompanyName} requires compliance documents for ${contractorCompanyName}.\n\nPlease upload your documents here (valid for 7 days):\n${uploadLink}\n\nRequired: Public Liability Insurance, Employers' Liability Insurance, H&S Policy, RAMS, CIS Registration, and others as applicable.\n\nDocuments will be reviewed before being marked as compliant.`,
        companyName: customerCompanyName,
      });

      res.json({ success: true, uploadLink, expiresAt });
    } catch (error) {
      logger.error('Error creating document request:', error);
      res.status(500).json({ error: 'Failed to send document request' });
    }
  });

  // ── Public: get token info for upload portal ─────────────────────────────
  app.get("/api/doc-request/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const [request] = await db.select().from(contractorDocumentRequests)
        .where(eq(contractorDocumentRequests.token, token)).limit(1);

      if (!request) return res.status(404).json({ error: 'Invalid or expired link' });
      if (request.status === 'completed') return res.status(410).json({ error: 'This upload link has already been used. Please contact your client for a new link.' });
      if (new Date() > new Date(request.expiresAt)) {
        await db.update(contractorDocumentRequests).set({ status: 'expired' }).where(eq(contractorDocumentRequests.token, token));
        return res.status(410).json({ error: 'This upload link has expired. Please contact your client for a new link.' });
      }

      const custDb = await customerDbService.getCustomerDatabase(request.customerId);
      const [company] = await custDb.select().from(isolatedSchema.contractorCompanies)
        .where(eq(isolatedSchema.contractorCompanies.id, request.companyId)).limit(1);
      if (!company) return res.status(404).json({ error: 'Company not found' });

      const [settings] = await custDb.select({
        companyName: isolatedSchema.companySettings.companyName,
        logoUrl: isolatedSchema.companySettings.logoUrl,
        accentColor: isolatedSchema.companySettings.accentColor,
        backgroundColor: isolatedSchema.companySettings.backgroundColor,
      }).from(isolatedSchema.companySettings).limit(1);

      const existingDocs = await custDb.select().from(isolatedSchema.contractorDocuments)
        .where(and(
          eq(isolatedSchema.contractorDocuments.companyId, request.companyId),
          eq(isolatedSchema.contractorDocuments.isActive, true)
        ));

      res.json({
        company: { id: (company as any).id, companyName: (company as any).companyName, contactFirstName: (company as any).contactFirstName, contactLastName: (company as any).contactLastName },
        settings: { companyName: settings?.companyName, logoUrl: settings?.logoUrl, accentColor: settings?.accentColor, backgroundColor: settings?.backgroundColor },
        documents: existingDocs,
        expiresAt: request.expiresAt,
        customerId: request.customerId,
      });
    } catch (error) {
      logger.error('Error fetching doc request:', error);
      res.status(500).json({ error: 'Failed to load upload portal' });
    }
  });

  // ── Public: get signed upload URL for upload portal ──────────────────────
  app.get("/api/doc-request/:token/upload-url", async (req, res) => {
    try {
      const { token } = req.params;
      const [request] = await db.select().from(contractorDocumentRequests)
        .where(eq(contractorDocumentRequests.token, token)).limit(1);
      if (!request || request.status !== 'active' || new Date() > new Date(request.expiresAt)) {
        return res.status(403).json({ error: 'Invalid or expired link' });
      }
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      logger.error('Error getting upload URL for doc request:', error);
      res.status(500).json({ error: 'Failed to get upload URL' });
    }
  });

  // ── Public: submit an uploaded document via token ────────────────────────
  app.post("/api/doc-request/:token/upload", async (req, res) => {
    try {
      const { token } = req.params;
      const { documentName, documentType, documentUrl, expiryDate, issuedBy, policyNumber } = req.body;

      const [request] = await db.select().from(contractorDocumentRequests)
        .where(eq(contractorDocumentRequests.token, token)).limit(1);
      if (!request || request.status !== 'active' || new Date() > new Date(request.expiresAt)) {
        return res.status(403).json({ error: 'Invalid or expired link' });
      }

      const custDb = await customerDbService.getCustomerDatabase(request.customerId);

      // Find the requesting admin user to satisfy the uploadedBy FK
      const [adminUser] = await custDb.select({ id: isolatedSchema.users.id })
        .from(isolatedSchema.users)
        .where(eq(isolatedSchema.users.username, request.requestedBy))
        .limit(1);
      const fallbackUser = adminUser || (await custDb.select({ id: isolatedSchema.users.id }).from(isolatedSchema.users).limit(1))[0];
      if (!fallbackUser) return res.status(500).json({ error: 'No admin user found in tenant' });

      const objectStorageService = new ObjectStorageService();
      const normalizedUrl = documentUrl ? objectStorageService.normalizeObjectEntityPath(documentUrl) : documentUrl;

      // Check if a document of this type already exists — update it if so
      const [existing] = await custDb.select().from(isolatedSchema.contractorDocuments)
        .where(and(
          eq(isolatedSchema.contractorDocuments.companyId, request.companyId),
          eq(isolatedSchema.contractorDocuments.documentType, documentType),
          eq(isolatedSchema.contractorDocuments.isActive, true)
        )).limit(1);

      let savedDoc;
      if (existing) {
        [savedDoc] = await custDb.update(isolatedSchema.contractorDocuments)
          .set({ documentUrl: normalizedUrl, expiryDate: expiryDate ? new Date(expiryDate) : null, issuedBy: issuedBy || null, policyNumber: policyNumber || null, status: 'pending', updatedAt: new Date(), expiryAlertedAt: null })
          .where(eq(isolatedSchema.contractorDocuments.id, existing.id))
          .returning();
      } else {
        [savedDoc] = await custDb.insert(isolatedSchema.contractorDocuments).values({
          companyId: request.companyId,
          documentName: documentName || documentType,
          documentType,
          documentUrl: normalizedUrl,
          expiryDate: expiryDate ? new Date(expiryDate) : null,
          uploadedBy: fallbackUser.id,
          issuedBy: issuedBy || null,
          policyNumber: policyNumber || null,
          status: 'pending',
          isActive: true,
        }).returning();
      }

      // Mark the upload token as used so the link cannot be reused
      await db.update(contractorDocumentRequests)
        .set({ status: 'completed' })
        .where(eq(contractorDocumentRequests.token, token));

      // Audit trail
      try {
        await custDb.insert(isolatedSchema.companyNotes).values({
          companyId: request.companyId,
          changeType: 'document_uploaded',
          notes: `Document "${documentName || documentType}" uploaded externally by contractor via secure link. Awaiting admin approval.`,
          changedBy: 'external-contractor',
        });
      } catch { /* non-fatal */ }

      // Notify the requesting admin by email
      try {
        const [company] = await custDb.select().from(isolatedSchema.contractorCompanies)
          .where(eq(isolatedSchema.contractorCompanies.id, request.companyId)).limit(1);
        const [settings] = await custDb.select({ companyName: isolatedSchema.companySettings.companyName })
          .from(isolatedSchema.companySettings).limit(1);
        const [adminFullUser] = await custDb.select({ email: isolatedSchema.users.email, firstName: isolatedSchema.users.firstName })
          .from(isolatedSchema.users).where(eq(isolatedSchema.users.username, request.requestedBy)).limit(1);
        if (adminFullUser?.email) {
          const emailSvc = new EmailService(request.customerId);
          const docLabel = (documentName || documentType || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
          await emailSvc.sendEmail({
            to: adminFullUser.email,
            subject: `Document Ready for Review: ${docLabel} — ${(company as any)?.companyName || 'Contractor'}`,
            html: `<p>Hi ${adminFullUser.firstName || 'there'},</p><p><strong>${(company as any)?.companyName || 'A contractor'}</strong> has uploaded <strong>${docLabel}</strong> via the secure document request link.</p><p>Please log in to TPR Max to review and approve the document.</p><p style="color:#6b7280;font-size:13px">The document is currently marked as <em>Pending Review</em> and will not count as compliant until approved.</p>`,
            text: `${(company as any)?.companyName || 'A contractor'} has uploaded ${docLabel}. Please log in to TPR Max to review and approve.`,
            companyName: settings?.companyName,
          });
        }
      } catch { /* non-fatal */ }

      res.json({ success: true, document: savedDoc });
    } catch (error) {
      logger.error('Error saving uploaded document via token:', error);
      res.status(500).json({ error: 'Failed to save document' });
    }
  });

  // ── Worker Document Requests ─────────────────────────────────────────────

  // Auth: Create a secure upload link and email it to the worker
  app.post("/api/contractors/workers/:workerId/request-documents", requireAuth, async (req, res) => {
    try {
      const { workerId } = req.params;
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);

      const [worker] = await custDb.select().from(isolatedSchema.contractorWorkers)
        .where(eq(isolatedSchema.contractorWorkers.id, workerId)).limit(1);
      if (!worker) return res.status(404).json({ error: 'Worker not found' });
      if (!worker.email) return res.status(400).json({ error: 'Worker has no email address on file' });

      const [company] = await custDb.select().from(isolatedSchema.contractorCompanies)
        .where(eq(isolatedSchema.contractorCompanies.id, worker.companyId)).limit(1);

      const [settings] = await custDb.select({
        companyName: isolatedSchema.companySettings.companyName,
        logoUrl: isolatedSchema.companySettings.logoUrl,
        accentColor: isolatedSchema.companySettings.accentColor,
        backgroundColor: isolatedSchema.companySettings.backgroundColor,
      }).from(isolatedSchema.companySettings).limit(1);

      // Fetch active worker certification types so the email lists exactly what the upload page shows
      const workerCertSchemaName = customerDbService.generateSchemaName(context.customerId);
      const workerCertPool = (custDb as any).$client ?? (custDb as any).session?.client;
      let docListHtml = `<li>Right to Work (passport, driving licence, or biometric residence permit)</li>
        <li>CSCS Card</li>
        <li>IPAF Card (if working at height)</li>
        <li>Training Certificates</li>
        <li>Other relevant worker certifications</li>`;
      try {
        const certResult = await workerCertPool.query(
          `SELECT name FROM "${workerCertSchemaName}".worker_certification_types
           WHERE is_active = TRUE
           ORDER BY CASE category WHEN 'legal' THEN 1 WHEN 'site' THEN 2 WHEN 'training' THEN 3 ELSE 4 END, name`
        );
        if (certResult.rows?.length) {
          docListHtml = certResult.rows.map((r: any) => `<li>${r.name}</li>`).join('\n        ');
        }
      } catch { /* non-fatal — fall back to generic list */ }

      const token = randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      await db.insert(contractorWorkerDocumentRequests).values({
        token,
        customerId: context.customerId,
        workerId,
        expiresAt,
        status: 'active',
        requestedBy: username,
      });

      const host = req.headers.host || 'app.visigate.pro';
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const uploadLink = `${protocol}://${host}/worker-upload/${token}`;

      const customerCompanyName = settings?.companyName || 'Your client';
      const workerName = `${worker.firstName || ''} ${worker.lastName || ''}`.trim() || 'there';
      const contractorCompanyName = (company as any)?.companyName || '';
      const accentColor = settings?.accentColor || '#2460a9';

      let logoHtml = '';
      if (settings?.logoUrl) {
        const logoSrc = settings.logoUrl.startsWith('/uploads/') ? `/objects${settings.logoUrl}` : settings.logoUrl;
        logoHtml = `<img src="${protocol}://${host}${logoSrc}" alt="${customerCompanyName}" style="max-height:60px;max-width:200px;display:block;margin-bottom:16px;" />`;
      }

      const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8" /><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f7fa;margin:0;padding:0}
.wrap{max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)}
.header{background:${accentColor};padding:28px 32px;color:#fff}
.header h1{margin:0;font-size:20px;font-weight:600}
.body{padding:32px}
.body p{color:#374151;line-height:1.6;margin:0 0 16px}
.btn{display:inline-block;background:${accentColor};color:#fff!important;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px;margin:8px 0 24px}
.docs ul{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 16px 16px 32px;color:#374151}
.docs ul li{margin-bottom:6px}
.footer{border-top:1px solid #e5e7eb;padding:20px 32px;font-size:12px;color:#9ca3af}
</style></head>
<body>
<div class="wrap">
  <div class="header">
    ${logoHtml}
    <h1>Worker Compliance Documents Required</h1>
  </div>
  <div class="body">
    <p>Dear ${workerName},</p>
    <p>As part of our contractor onboarding and compliance process, <strong>${customerCompanyName}</strong> requires the following documents to be uploaded for your worker profile${contractorCompanyName ? ` (${contractorCompanyName})` : ''}.</p>
    <p>Please click the secure link below to upload your documents. The link is valid for <strong>7 days</strong>.</p>
    <a href="${uploadLink}" class="btn">📎 Upload My Documents</a>
    <div class="docs">
      <p style="font-weight:600;margin-bottom:8px">Documents required:</p>
      <ul>
        ${docListHtml}
      </ul>
    </div>
    <p style="margin-top:16px;font-size:13px;color:#6b7280">Each document must be uploaded as a PDF, image, or Word file. Please include the expiry date where applicable. Documents will be reviewed by our team before being marked as compliant.</p>
    <p style="font-size:13px;color:#6b7280">If the button above doesn't work, copy and paste this link into your browser:<br /><a href="${uploadLink}" style="color:${accentColor};word-break:break-all">${uploadLink}</a></p>
  </div>
  <div class="footer">This email was sent by ${customerCompanyName}. If you have any questions, please contact your account manager.</div>
</div>
</body></html>`;

      const emailSvc = new EmailService(context.customerId);
      await emailSvc.sendEmail({
        to: worker.email,
        subject: `Action Required: Compliance Documents — ${customerCompanyName}`,
        html,
        text: `Dear ${workerName},\n\n${customerCompanyName} requires your compliance documents.\n\nPlease upload your documents here (valid for 7 days):\n${uploadLink}\n\nDocuments will be reviewed before being marked as compliant.`,
        companyName: customerCompanyName,
      });

      res.json({ success: true, uploadLink, expiresAt });
    } catch (error) {
      logger.error('Error creating worker document request:', error);
      res.status(500).json({ error: 'Failed to send document request' });
    }
  });

  // Public: get token info for worker upload portal
  app.get("/api/worker-doc-request/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const [request] = await db.select().from(contractorWorkerDocumentRequests)
        .where(eq(contractorWorkerDocumentRequests.token, token)).limit(1);
      if (!request) return res.status(404).json({ error: 'Upload link not found' });
      if (request.status !== 'active' || new Date() > new Date(request.expiresAt)) {
        return res.status(403).json({ error: 'This upload link has expired. Please contact your client for a new link.' });
      }

      const custDb = await customerDbService.getCustomerDatabase(request.customerId);

      const [worker] = await custDb.select().from(isolatedSchema.contractorWorkers)
        .where(eq(isolatedSchema.contractorWorkers.id, request.workerId)).limit(1);
      if (!worker) return res.status(404).json({ error: 'Worker not found' });

      const [company] = await custDb.select().from(isolatedSchema.contractorCompanies)
        .where(eq(isolatedSchema.contractorCompanies.id, worker.companyId)).limit(1);

      const [settings] = await custDb.select({
        companyName: isolatedSchema.companySettings.companyName,
        logoUrl: isolatedSchema.companySettings.logoUrl,
        accentColor: isolatedSchema.companySettings.accentColor,
        backgroundColor: isolatedSchema.companySettings.backgroundColor,
      }).from(isolatedSchema.companySettings).limit(1);

      const existingDocs = await custDb.select().from(isolatedSchema.contractorDocuments)
        .where(and(
          eq(isolatedSchema.contractorDocuments.workerId, request.workerId),
          eq(isolatedSchema.contractorDocuments.isActive, true)
        ));

      // Fetch the active worker-level certification types from the customer schema
      let certificationTypes: any[] = [];
      try {
        const schemaName = customerDbService.generateSchemaName(request.customerId);
        const certPool = (custDb as any).$client ?? (custDb as any).session?.client;
        const certResult = await certPool.query(
          `SELECT * FROM "${schemaName}".worker_certification_types
           WHERE is_active = TRUE
           ORDER BY CASE category WHEN 'legal' THEN 1 WHEN 'site' THEN 2 WHEN 'training' THEN 3 ELSE 4 END, name`
        );
        certificationTypes = certResult.rows ?? [];
      } catch (_certErr) {
        // Non-fatal: fall back to empty list; the page still loads
      }

      res.json({
        worker: { id: (worker as any).id, firstName: (worker as any).firstName, lastName: (worker as any).lastName },
        company: { companyName: (company as any)?.companyName },
        settings: { companyName: settings?.companyName, logoUrl: settings?.logoUrl, accentColor: settings?.accentColor, backgroundColor: settings?.backgroundColor },
        documents: existingDocs,
        certificationTypes,
        expiresAt: request.expiresAt,
        customerId: request.customerId,
      });
    } catch (error) {
      logger.error('Error fetching worker doc request:', error);
      res.status(500).json({ error: 'Failed to load upload portal' });
    }
  });

  // Public: get a presigned upload URL for a worker doc
  app.get("/api/worker-doc-request/:token/upload-url", async (req, res) => {
    try {
      const { token } = req.params;
      const [request] = await db.select().from(contractorWorkerDocumentRequests)
        .where(eq(contractorWorkerDocumentRequests.token, token)).limit(1);
      if (!request || request.status !== 'active' || new Date() > new Date(request.expiresAt)) {
        return res.status(403).json({ error: 'Invalid or expired link' });
      }
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      logger.error('Error getting upload URL for worker doc request:', error);
      res.status(500).json({ error: 'Failed to get upload URL' });
    }
  });

  // Public: submit an uploaded worker document via token
  app.post("/api/worker-doc-request/:token/upload", async (req, res) => {
    try {
      const { token } = req.params;
      const { documentName, documentType, documentUrl, expiryDate, issuedBy, policyNumber } = req.body;

      const [request] = await db.select().from(contractorWorkerDocumentRequests)
        .where(eq(contractorWorkerDocumentRequests.token, token)).limit(1);
      if (!request || request.status !== 'active' || new Date() > new Date(request.expiresAt)) {
        return res.status(403).json({ error: 'Invalid or expired link' });
      }

      const custDb = await customerDbService.getCustomerDatabase(request.customerId);

      const [worker] = await custDb.select().from(isolatedSchema.contractorWorkers)
        .where(eq(isolatedSchema.contractorWorkers.id, request.workerId)).limit(1);
      if (!worker) return res.status(404).json({ error: 'Worker not found' });

      const [adminUser] = await custDb.select({ id: isolatedSchema.users.id })
        .from(isolatedSchema.users)
        .where(eq(isolatedSchema.users.username, request.requestedBy))
        .limit(1);
      const fallbackUser = adminUser || (await custDb.select({ id: isolatedSchema.users.id }).from(isolatedSchema.users).limit(1))[0];
      if (!fallbackUser) return res.status(500).json({ error: 'No admin user found in tenant' });

      const objectStorageService = new ObjectStorageService();
      const normalizedUrl = documentUrl ? objectStorageService.normalizeObjectEntityPath(documentUrl) : documentUrl;

      const [existing] = await custDb.select().from(isolatedSchema.contractorDocuments)
        .where(and(
          eq(isolatedSchema.contractorDocuments.workerId, request.workerId),
          eq(isolatedSchema.contractorDocuments.documentType, documentType),
          eq(isolatedSchema.contractorDocuments.isActive, true)
        )).limit(1);

      let savedDoc;
      if (existing) {
        [savedDoc] = await custDb.update(isolatedSchema.contractorDocuments)
          .set({ documentUrl: normalizedUrl, expiryDate: expiryDate ? new Date(expiryDate) : null, issuedBy: issuedBy || null, policyNumber: policyNumber || null, status: 'pending', updatedAt: new Date(), expiryAlertedAt: null })
          .where(eq(isolatedSchema.contractorDocuments.id, existing.id))
          .returning();
      } else {
        [savedDoc] = await custDb.insert(isolatedSchema.contractorDocuments).values({
          workerId: request.workerId,
          companyId: worker.companyId,
          documentName: documentName || documentType,
          documentType,
          documentUrl: normalizedUrl,
          expiryDate: expiryDate ? new Date(expiryDate) : null,
          uploadedBy: fallbackUser.id,
          issuedBy: issuedBy || null,
          policyNumber: policyNumber || null,
          status: 'pending',
          isActive: true,
        }).returning();
      }

      // Mark the upload token as used so the link cannot be reused
      await db.update(contractorWorkerDocumentRequests)
        .set({ status: 'completed' })
        .where(eq(contractorWorkerDocumentRequests.token, token));

      // Audit trail
      try {
        await custDb.insert(isolatedSchema.workerNotes).values({
          workerId: request.workerId,
          changeType: 'document_uploaded',
          notes: `Document "${documentName || documentType}" uploaded externally by worker via secure link. Awaiting admin approval.`,
          changedBy: 'external-worker',
        });
      } catch { /* non-fatal */ }

      // Notify the requesting admin
      try {
        const [settings] = await custDb.select({ companyName: isolatedSchema.companySettings.companyName })
          .from(isolatedSchema.companySettings).limit(1);
        const [adminFullUser] = await custDb.select({ email: isolatedSchema.users.email, firstName: isolatedSchema.users.firstName })
          .from(isolatedSchema.users).where(eq(isolatedSchema.users.username, request.requestedBy)).limit(1);
        if (adminFullUser?.email) {
          const emailSvc = new EmailService(request.customerId);
          const docLabel = (documentName || documentType || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
          const workerFullName = `${(worker as any).firstName || ''} ${(worker as any).lastName || ''}`.trim();
          await emailSvc.sendEmail({
            to: adminFullUser.email,
            subject: `Document Ready for Review: ${docLabel} — ${workerFullName}`,
            html: `<p>Hi ${adminFullUser.firstName || 'there'},</p><p><strong>${workerFullName}</strong> has uploaded <strong>${docLabel}</strong> via the secure worker document request link.</p><p>Please log in to TPR Max to review and approve the document.</p><p style="color:#6b7280;font-size:13px">The document is currently marked as <em>Pending Review</em>.</p>`,
            text: `${workerFullName} has uploaded ${docLabel}. Please log in to TPR Max to review and approve.`,
            companyName: settings?.companyName,
          });
        }
      } catch { /* non-fatal */ }

      res.json({ success: true, document: savedDoc });
    } catch (error) {
      logger.error('Error saving worker document via token:', error);
      res.status(500).json({ error: 'Failed to save document' });
    }
  });

  // ── Public: proxy file upload for doc-request (avoids browser CORS with GCS signed URLs) ──
  app.post("/api/doc-request/:token/upload-file", docRequestUpload.single('file'), async (req: any, res) => {
    try {
      const { token } = req.params;
      const [request] = await db.select().from(contractorDocumentRequests)
        .where(eq(contractorDocumentRequests.token, token)).limit(1);
      if (!request || request.status !== 'active' || new Date() > new Date(request.expiresAt)) {
        return res.status(403).json({ error: 'Invalid or expired link' });
      }
      if (!req.file) return res.status(400).json({ error: 'No file provided' });

      const objectStorageService = new ObjectStorageService();
      const privateObjectDir = objectStorageService.getPrivateObjectDir();
      if (!privateObjectDir) return res.status(500).json({ error: 'Object storage not configured' });

      const ext = (req.file.originalname || '').split('.').pop()?.toLowerCase() || 'bin';
      const objectId = randomUUID();
      const docCustomerId = request.customerId;
      const fullPath = `${privateObjectDir}/${docCustomerId}/uploads/${objectId}.${ext}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);

      await objectStorageClient.bucket(bucketName).file(objectName).save(req.file.buffer, {
        contentType: req.file.mimetype || 'application/octet-stream',
      });

      const objectUrl = `/objects/${docCustomerId}/uploads/${objectId}.${ext}`;
      res.json({ objectUrl });
    } catch (error) {
      logger.error('Error proxying file upload for doc-request:', error);
      res.status(500).json({ error: 'File upload failed' });
    }
  });

  // ── Public: proxy file upload for worker-doc-request ──────────────────────
  app.post("/api/worker-doc-request/:token/upload-file", docRequestUpload.single('file'), async (req: any, res) => {
    try {
      const { token } = req.params;
      const [request] = await db.select().from(contractorWorkerDocumentRequests)
        .where(eq(contractorWorkerDocumentRequests.token, token)).limit(1);
      if (!request || request.status !== 'active' || new Date() > new Date(request.expiresAt)) {
        return res.status(403).json({ error: 'Invalid or expired link' });
      }
      if (!req.file) return res.status(400).json({ error: 'No file provided' });

      const objectStorageService = new ObjectStorageService();
      const privateObjectDir = objectStorageService.getPrivateObjectDir();
      if (!privateObjectDir) return res.status(500).json({ error: 'Object storage not configured' });

      const ext = (req.file.originalname || '').split('.').pop()?.toLowerCase() || 'bin';
      const objectId = randomUUID();
      const workerDocCustomerId = request.customerId;
      const fullPath = `${privateObjectDir}/${workerDocCustomerId}/uploads/${objectId}.${ext}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);

      await objectStorageClient.bucket(bucketName).file(objectName).save(req.file.buffer, {
        contentType: req.file.mimetype || 'application/octet-stream',
      });

      const objectUrl = `/objects/${workerDocCustomerId}/uploads/${objectId}.${ext}`;
      res.json({ objectUrl });
    } catch (error) {
      logger.error('Error proxying file upload for worker-doc-request:', error);
      res.status(500).json({ error: 'File upload failed' });
    }
  });

  // Company notes / audit trail
  app.get("/api/contractors/:companyId/notes", requireAuth, async (req, res) => {
    const { companyId } = req.params;
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(companyId)) {
      return res.status(400).json({ error: "Invalid companyId format" });
    }
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const db = await customerDbService.getCustomerDatabase(context.customerId);
      const notes = await db.select().from(isolatedSchema.companyNotes)
        .where(eq(isolatedSchema.companyNotes.companyId, companyId))
        .orderBy(desc(isolatedSchema.companyNotes.changedAt));
      res.json(notes);
    } catch (error: any) {
      const msg: string = error?.message ?? '';
      const code: string = error?.code ?? '';
      logger.error("Error fetching company notes", {
        companyId,
        customerId: req.customerId,
        errorMessage: msg,
        errorCode: code,
        stack: error?.stack?.split('\n').slice(0, 5).join(' | '),
      });
      if (msg.includes('does not exist') || msg.includes('undefined_table') || code === '42P01') {
        return res.json([]);
      }
      res.status(500).json({ error: "Failed to fetch company notes" });
    }
  });

  // Document approval endpoints
  app.get("/api/contractors/:contractorId/documents/:documentId/approvals", requireAuth, async (req, res) => {
    try {
      const { documentId } = req.params;
      const approvalsContext = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const approvalsDb = await customerDbService.getCustomerDatabase(approvalsContext.customerId);
      const approvals = await approvalsDb.select().from(isolatedSchema.documentApprovals)
        .where(eq(isolatedSchema.documentApprovals.documentId, documentId));
      res.json(approvals);
    } catch (error) {
      logger.error("Error fetching document approvals:", error);
      res.status(500).json({ error: "Failed to fetch document approvals" });
    }
  });

  // Approve or reject document
  app.post("/api/contractors/:contractorId/documents/:documentId/approve", requireAuth, async (req, res) => {
    try {
      const { contractorId, documentId } = req.params;
      const { approvalStatus, comments, rejectionReason } = req.body;
      const userId = req.user!.id || "andy-smith-001";
      
      const approveContext = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const approveDb = await customerDbService.getCustomerDatabase(approveContext.customerId);

      const [document] = await approveDb.select().from(isolatedSchema.complianceDocuments)
        .where(eq(isolatedSchema.complianceDocuments.id, documentId));
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      const [approval] = await approveDb.insert(isolatedSchema.documentApprovals)
        .values({
          documentId,
          contractorId,
          documentType: document.documentType,
          approvalStatus,
          approvedBy: userId,
          approvedAt: approvalStatus === "approved" ? new Date() : null,
          comments,
          rejectionReason
        })
        .returning();

      await approveDb.update(isolatedSchema.complianceDocuments)
        .set({
          status: approvalStatus === "approved" ? "valid" : approvalStatus === "rejected" ? "rejected" : "pending",
          reviewedBy: userId,
          reviewedAt: new Date(),
          reviewNotes: comments || rejectionReason
        })
        .where(eq(isolatedSchema.complianceDocuments.id, documentId));

      res.json(approval);
    } catch (error) {
      logger.error("Error approving/rejecting document:", error);
      res.status(500).json({ error: "Failed to process document approval" });
    }
  });

  // UK H&S Compliance Document Management API Routes
  
  // Get all UK H&S document templates for customer (with auto-copy from defaults)
  app.get("/api/uk-hs-documents/templates", requireAuth, async (req, res) => {
    try {
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // First check if customer has any templates
      let templates = await db
        .select()
        .from(ukHSDocumentTemplates)
        .where(and(
          eq(ukHSDocumentTemplates.customerId, context.customerId),
          eq(ukHSDocumentTemplates.isActive, true)
        ))
        .orderBy(ukHSDocumentTemplates.complianceCategory, ukHSDocumentTemplates.documentName);
      
      // If customer has no templates, copy default templates from dev-customer-001
      if (templates.length === 0) {
        logger.info(`Customer ${context.customerId} has no UK H&S templates, copying defaults...`);
        
        // Get default templates from dev-customer-001
        const defaultTemplates = await db
          .select()
          .from(ukHSDocumentTemplates)
          .where(and(
            eq(ukHSDocumentTemplates.customerId, 'dev-customer-001'),
            eq(ukHSDocumentTemplates.isActive, true)
          ));
        
        if (defaultTemplates.length > 0) {
          // Copy templates to customer's account
          const customerTemplates = defaultTemplates.map(template => ({
            customerId: context.customerId,
            documentCode: template.documentCode,
            documentName: template.documentName,
            documentDescription: template.documentDescription,
            templateContent: template.templateContent,
            autoFillFields: template.autoFillFields,
            isUKHSRequired: template.isUKHSRequired,
            complianceCategory: template.complianceCategory,
            legalReference: template.legalReference,
            version: template.version,
            isActive: true
          }));
          
          templates = await db
            .insert(ukHSDocumentTemplates)
            .values(customerTemplates)
            .returning();
          
          logger.info(`Copied ${templates.length} UK H&S templates for customer ${context.customerId}`);
        }
      }
      
      res.json(templates);
    } catch (error) {
      logger.error('Error fetching UK H&S document templates:', error);
      res.status(500).json({ error: 'Failed to fetch UK H&S document templates' });
    }
  });

  // Get specific UK H&S document template
  app.get("/api/uk-hs-documents/templates/:templateId", requireAuth, async (req, res) => {
    try {
      const { templateId } = req.params;
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const [template] = await db
        .select()
        .from(ukHSDocumentTemplates)
        .where(and(
          eq(ukHSDocumentTemplates.id, templateId),
          eq(ukHSDocumentTemplates.customerId, context.customerId)
        ));
      
      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }
      
      res.json(template);
    } catch (error) {
      logger.error('Error fetching UK H&S document template:', error);
      res.status(500).json({ error: 'Failed to fetch UK H&S document template' });
    }
  });

  // Update UK H&S document template
  app.put("/api/uk-hs-documents/templates/:templateId", requireAuth, async (req, res) => {
    try {
      const { templateId } = req.params;
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Validate request body
      const updateTemplateSchema = z.object({
        documentName: z.string().min(1, 'Document name is required').optional(),
        documentDescription: z.string().optional(),
        templateContent: z.string().min(1, 'Template content is required').optional(),
        autoFillFields: z.array(z.string()).optional(),
        complianceCategory: z.enum(['immigration', 'safety_training', 'work_permit', 'contract', 'risk_management', 'induction']).optional(),
        legalReference: z.string().optional(),
        isActive: z.boolean().optional()
      });
      
      const validatedData = updateTemplateSchema.parse(req.body);
      
      // Check if template exists and belongs to customer
      const [existingTemplate] = await db
        .select()
        .from(ukHSDocumentTemplates)
        .where(and(
          eq(ukHSDocumentTemplates.id, templateId),
          eq(ukHSDocumentTemplates.customerId, context.customerId)
        ));
      
      if (!existingTemplate) {
        return res.status(404).json({ error: 'Template not found' });
      }
      
      // Update template with new data
      const [updatedTemplate] = await db
        .update(ukHSDocumentTemplates)
        .set({
          ...validatedData,
          updatedAt: new Date()
        })
        .where(and(
          eq(ukHSDocumentTemplates.id, templateId),
          eq(ukHSDocumentTemplates.customerId, context.customerId)
        ))
        .returning();
      
      logger.info(`Updated UK H&S template ${templateId} for customer ${context.customerId}`);
      res.json(updatedTemplate);
    } catch (error) {
      logger.error('Error updating UK H&S document template:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      res.status(500).json({ error: 'Failed to update UK H&S document template' });
    }
  });

  // Create new UK H&S document template
  app.post("/api/uk-hs-documents/templates", requireAuth, async (req, res) => {
    try {
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Validate request body
      const createTemplateSchema = z.object({
        documentCode: z.string().min(1, 'Document code is required'),
        documentName: z.string().min(1, 'Document name is required'),
        documentDescription: z.string().optional(),
        templateContent: z.string().min(1, 'Template content is required'),
        autoFillFields: z.array(z.string()).default([]),
        complianceCategory: z.enum(['immigration', 'safety_training', 'work_permit', 'contract', 'risk_management', 'induction']),
        legalReference: z.string().optional(),
        isUKHSRequired: z.boolean().default(true),
        version: z.string().default('1.0')
      });
      
      const validatedData = createTemplateSchema.parse(req.body);
      
      // Check if document code already exists for this customer
      const [existingTemplate] = await db
        .select()
        .from(ukHSDocumentTemplates)
        .where(and(
          eq(ukHSDocumentTemplates.documentCode, validatedData.documentCode),
          eq(ukHSDocumentTemplates.customerId, context.customerId),
          eq(ukHSDocumentTemplates.isActive, true)
        ));
      
      if (existingTemplate) {
        return res.status(409).json({ error: 'A template with this document code already exists' });
      }
      
      // Create new template
      const [newTemplate] = await db
        .insert(ukHSDocumentTemplates)
        .values({
          ...validatedData,
          customerId: context.customerId,
          isActive: true
        })
        .returning();
      
      logger.info(`Created new UK H&S template ${newTemplate.id} for customer ${context.customerId}`);
      res.status(201).json(newTemplate);
    } catch (error) {
      logger.error('Error creating UK H&S document template:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      res.status(500).json({ error: 'Failed to create UK H&S document template' });
    }
  });

  // Delete UK H&S document template (soft delete)
  app.delete("/api/uk-hs-documents/templates/:templateId", requireAuth, async (req, res) => {
    try {
      const { templateId } = req.params;
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Check if template exists and belongs to customer
      const [existingTemplate] = await db
        .select()
        .from(ukHSDocumentTemplates)
        .where(and(
          eq(ukHSDocumentTemplates.id, templateId),
          eq(ukHSDocumentTemplates.customerId, context.customerId)
        ));
      
      if (!existingTemplate) {
        return res.status(404).json({ error: 'Template not found' });
      }
      
      // Check if template is used in any active assignments
      const [assignmentCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(workerDocumentAssignments)
        .where(and(
          eq(workerDocumentAssignments.documentTemplateId, templateId),
          eq(workerDocumentAssignments.customerId, context.customerId),
          eq(workerDocumentAssignments.isActive, true),
          sql`${workerDocumentAssignments.status} IN ('pending', 'sent')`
        ));
      
      if (assignmentCount.count > 0) {
        return res.status(409).json({ 
          error: 'Cannot delete template with active assignments',
          message: `This template has ${assignmentCount.count} active assignment(s). Complete or cancel them first.`
        });
      }
      
      // Soft delete the template
      const [deletedTemplate] = await db
        .update(ukHSDocumentTemplates)
        .set({
          isActive: false,
          updatedAt: new Date()
        })
        .where(and(
          eq(ukHSDocumentTemplates.id, templateId),
          eq(ukHSDocumentTemplates.customerId, context.customerId)
        ))
        .returning();
      
      logger.info(`Deleted UK H&S template ${templateId} for customer ${context.customerId}`);
      res.json({ success: true, message: 'Template deleted successfully' });
    } catch (error) {
      logger.error('Error deleting UK H&S document template:', error);
      res.status(500).json({ error: 'Failed to delete UK H&S document template' });
    }
  });

  // ===== Default UK H&S Document Template Management =====

  // Get customer's default UK H&S document templates (the 6 seeded templates)
  app.get("/api/uk-hs-documents/defaults", requireAuth, async (req, res) => {
    try {
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Get the 6 default document codes
      const defaultDocumentCodes = [
        'right_to_work', 
        'ladder_safety', 
        'permit_to_work', 
        'contractor_agreement', 
        'risk_assessment', 
        'site_induction'
      ];
      
      // Get default templates for this customer (seeded templates only)
      const defaultTemplates = await db
        .select()
        .from(ukHSDocumentTemplates)
        .where(and(
          eq(ukHSDocumentTemplates.customerId, context.customerId),
          eq(ukHSDocumentTemplates.isActive, true),
          inArray(ukHSDocumentTemplates.documentCode, defaultDocumentCodes)
        ))
        .orderBy(ukHSDocumentTemplates.documentCode);
      
      logger.info(`Retrieved ${defaultTemplates.length} default UK H&S templates for customer ${context.customerId}`);
      res.json(defaultTemplates);
    } catch (error) {
      logger.error('Error fetching default UK H&S document templates:', error);
      res.status(500).json({ error: 'Failed to fetch default UK H&S document templates' });
    }
  });

  // Update a customer's default UK H&S document template
  app.put("/api/uk-hs-documents/defaults/:templateId", requireAuth, async (req, res) => {
    try {
      const { templateId } = req.params;
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Validate request body - similar to regular template update but enforce it's a default
      const updateDefaultTemplateSchema = z.object({
        documentName: z.string().min(1, 'Document name is required').optional(),
        documentDescription: z.string().optional(),
        templateContent: z.string().min(1, 'Template content is required').optional(),
        autoFillFields: z.array(z.string()).optional(),
        complianceCategory: z.enum(['immigration', 'safety_training', 'work_permit', 'contract', 'risk_management', 'induction']).optional(),
        legalReference: z.string().optional()
      });
      
      const validatedData = updateDefaultTemplateSchema.parse(req.body);
      
      // Check if template exists, belongs to customer, and is a default template
      const defaultDocumentCodes = [
        'right_to_work', 
        'ladder_safety', 
        'permit_to_work', 
        'contractor_agreement', 
        'risk_assessment', 
        'site_induction'
      ];
      
      const [existingTemplate] = await db
        .select()
        .from(ukHSDocumentTemplates)
        .where(and(
          eq(ukHSDocumentTemplates.id, templateId),
          eq(ukHSDocumentTemplates.customerId, context.customerId),
          eq(ukHSDocumentTemplates.isActive, true),
          inArray(ukHSDocumentTemplates.documentCode, defaultDocumentCodes)
        ));
      
      if (!existingTemplate) {
        return res.status(404).json({ error: 'Default template not found' });
      }
      
      // Update default template with new data
      const [updatedTemplate] = await db
        .update(ukHSDocumentTemplates)
        .set({
          ...validatedData,
          updatedAt: new Date()
        })
        .where(and(
          eq(ukHSDocumentTemplates.id, templateId),
          eq(ukHSDocumentTemplates.customerId, context.customerId)
        ))
        .returning();
      
      logger.info(`Updated default UK H&S template ${templateId} (${existingTemplate.documentCode}) for customer ${context.customerId}`);
      res.json(updatedTemplate);
    } catch (error) {
      logger.error('Error updating default UK H&S document template:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      res.status(500).json({ error: 'Failed to update default UK H&S document template' });
    }
  });

  // Reset a customer's default template to system default
  app.post("/api/uk-hs-documents/defaults/:templateId/reset", requireAuth, async (req, res) => {
    try {
      const { templateId } = req.params;
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Get the template to find its document code
      const [existingTemplate] = await db
        .select()
        .from(ukHSDocumentTemplates)
        .where(and(
          eq(ukHSDocumentTemplates.id, templateId),
          eq(ukHSDocumentTemplates.customerId, context.customerId)
        ));
      
      if (!existingTemplate) {
        return res.status(404).json({ error: 'Template not found' });
      }
      
      // Import the system defaults from the seeding logic
      const { getSystemDefaultTemplate } = await import('../seed-uk-hs-documents');
      const systemDefault = getSystemDefaultTemplate(existingTemplate.documentCode);
      
      if (!systemDefault) {
        return res.status(400).json({ error: 'No system default available for this template' });
      }
      
      // Reset to system default
      const [resetTemplate] = await db
        .update(ukHSDocumentTemplates)
        .set({
          documentName: systemDefault.documentName,
          documentDescription: systemDefault.documentDescription,
          templateContent: systemDefault.templateContent,
          autoFillFields: systemDefault.autoFillFields,
          complianceCategory: systemDefault.complianceCategory,
          legalReference: systemDefault.legalReference,
          updatedAt: new Date()
        })
        .where(and(
          eq(ukHSDocumentTemplates.id, templateId),
          eq(ukHSDocumentTemplates.customerId, context.customerId)
        ))
        .returning();
      
      logger.info(`Reset default UK H&S template ${templateId} to system default for customer ${context.customerId}`);
      res.json(resetTemplate);
    } catch (error) {
      logger.error('Error resetting default UK H&S document template:', error);
      res.status(500).json({ error: 'Failed to reset default UK H&S document template' });
    }
  });

  // Assign UK H&S documents to workers
  app.post("/api/uk-hs-documents/assign", requireAuth, async (req, res) => {
    try {
      // Validate request body using Zod schema
      const assignmentRequestSchema = z.object({
        workerIds: z.array(z.string().min(1)).min(1, 'At least one worker ID required'),
        documentTemplateIds: z.array(z.string().min(1)).min(1, 'At least one document template ID required'),
        dueDate: z.string().datetime().optional(),
        assignedBy: z.string().optional()
      });
      
      const validatedData = assignmentRequestSchema.parse(req.body);
      const { workerIds, documentTemplateIds, dueDate, assignedBy } = validatedData;
      
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Get user ID for assignment tracking - ensure it's a valid user ID from customer's database
      let userId = assignedBy;
      
      // Always look up the user in the customer's database to ensure they exist
      const loggedInUser = await databaseService.getUserByUsername(context, username);
      if (loggedInUser) {
        userId = loggedInUser.id;
      } else {
        // Create customer user record if it doesn't exist (sync from auth system)
        try {
          const authUser = req.user;
          if (authUser) {
            const newUser = await databaseService.createUser(context, {
              username: authUser.username,
              password: '', // Auth users don't need passwords in customer DB
              customerId: context.customerId
            });
            userId = newUser.id;
            logger.info(`Created customer user record for ${authUser.username}`);
          }
        } catch (error) {
          logger.error('Failed to create customer user record:', error);
        }
      }
      
      // Skip assignments with invalid user IDs to prevent FK constraint violations
      if (!userId) {
        return res.status(400).json({ error: 'Could not resolve user for document assignment. Please contact support.' });
      }
      
      // Start transaction for data consistency
      const assignments = await db.transaction(async (tx) => {
        const newAssignments = [];
        
        // Create assignments for each worker-document combination
        for (const workerId of workerIds) {
          // Get worker and company details for validation
          const worker = await databaseService.getContractorWorkerById(context, workerId);
          if (!worker) {
            logger.warn(`Worker ${workerId} not found, skipping assignment`);
            continue;
          }
          
          for (const templateId of documentTemplateIds) {
            // Check for existing active assignment (duplicate prevention)
            const [existingAssignment] = await tx
              .select()
              .from(workerDocumentAssignments)
              .where(and(
                eq(workerDocumentAssignments.workerId, workerId),
                eq(workerDocumentAssignments.documentTemplateId, templateId),
                eq(workerDocumentAssignments.customerId, context.customerId),
                eq(workerDocumentAssignments.isActive, true),
                // Only prevent duplicates for non-completed assignments
                sql`${workerDocumentAssignments.status} NOT IN ('accepted', 'rejected')`
              ));
            
            if (existingAssignment) {
              logger.warn(`Assignment already exists for worker ${workerId} and template ${templateId}, skipping`);
              continue;
            }
            
            // Validate template exists and belongs to customer
            const [template] = await tx
              .select()
              .from(ukHSDocumentTemplates)
              .where(and(
                eq(ukHSDocumentTemplates.id, templateId),
                eq(ukHSDocumentTemplates.customerId, context.customerId),
                eq(ukHSDocumentTemplates.isActive, true)
              ));
            
            if (!template) {
              logger.warn(`Template ${templateId} not found or not accessible, skipping assignment`);
              continue;
            }
            
            // Generate unique acceptance token
            const acceptanceToken = randomUUID();
            
            // Don't store URL in database - generate it fresh at email time like contractor H&S acceptance
            const acceptanceUrl = null; // Will be generated fresh in email service
            
            const assignmentData = {
              customerId: context.customerId,
              workerId,
              companyId: worker.companyId,
              documentTemplateId: templateId,
              assignedBy: userId,
              dueDate: dueDate ? new Date(dueDate) : null,
              acceptanceToken,
              acceptanceUrl,
              status: 'pending' as const
            };
            
            // Validate assignment data with Zod
            const validatedAssignment = insertWorkerDocumentAssignmentSchema.parse(assignmentData);
            newAssignments.push(validatedAssignment);
          }
        }
        
        // If no new assignments needed, that's actually a success case
        if (newAssignments.length === 0) {
          logger.info('All H&S documents already assigned to selected workers - no new assignments needed');
          return []; // Return empty array instead of throwing error
        }
        
        // Insert all assignments atomically
        const insertedAssignments = await tx
          .insert(workerDocumentAssignments)
          .values(newAssignments)
          .returning();
        
        return insertedAssignments;
      });
      
      // Provide appropriate response message based on results
      const responseMessage = assignments.length === 0 
        ? 'All selected H&S documents are already assigned to the selected workers'
        : `Successfully assigned ${assignments.length} H&S document(s)`;

      res.json({
        success: true,
        message: responseMessage,
        assignmentsCreated: assignments.length,
        assignments
      });
      
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: 'Validation failed', 
          details: error.errors 
        });
      }
      logger.error('Error assigning UK H&S documents:', error);
      res.status(500).json({ error: 'Failed to assign UK H&S documents' });
    }
  });

  // Get worker document assignments
  app.get("/api/uk-hs-documents/assignments/worker/:workerId", requireAuth, async (req, res) => {
    try {
      const { workerId } = req.params;
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const assignments = await db
        .select()
        .from(workerDocumentAssignments)
        .where(and(
          eq(workerDocumentAssignments.workerId, workerId),
          eq(workerDocumentAssignments.isActive, true)
        ))
        .orderBy(desc(workerDocumentAssignments.assignedAt));
      
      res.json(assignments);
    } catch (error) {
      logger.error('Error fetching worker document assignments:', error);
      res.status(500).json({ error: 'Failed to fetch worker document assignments' });
    }
  });

  // Get all document assignments for a company
  app.get("/api/uk-hs-documents/assignments/company/:companyId", requireAuth, async (req, res) => {
    try {
      const { companyId } = req.params;
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const assignments = await db
        .select({
          assignment: workerDocumentAssignments,
          template: ukHSDocumentTemplates,
          worker: {
            id: contractorWorkers.id,
            firstName: contractorWorkers.firstName,
            lastName: contractorWorkers.lastName,
            email: contractorWorkers.email
          }
        })
        .from(workerDocumentAssignments)
        .innerJoin(ukHSDocumentTemplates, eq(workerDocumentAssignments.documentTemplateId, ukHSDocumentTemplates.id))
        .innerJoin(contractorWorkers, eq(workerDocumentAssignments.workerId, contractorWorkers.id))
        .where(and(
          eq(workerDocumentAssignments.companyId, companyId),
          eq(workerDocumentAssignments.customerId, context.customerId),
          eq(workerDocumentAssignments.isActive, true)
        ))
        .orderBy(workerDocumentAssignments.assignedAt);
      
      res.json(assignments);
    } catch (error) {
      logger.error('Error fetching company document assignments:', error);
      res.status(500).json({ error: 'Failed to fetch company document assignments' });
    }
  });

  // Send H&S document emails to workers (queries isolated customer DB for worker/company data)
  app.post("/api/uk-hs-documents/send-email", requireAuth, async (req, res) => {
    try {
      const { assignmentIds } = req.body;
      
      if (!Array.isArray(assignmentIds) || assignmentIds.length === 0) {
        return res.status(400).json({ error: 'Assignment IDs are required' });
      }
      
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Get assignments from shared DB — no JOIN to isolated worker/company tables
      const assignments = await db
        .select({
          assignment: workerDocumentAssignments,
          template: ukHSDocumentTemplates,
        })
        .from(workerDocumentAssignments)
        .innerJoin(ukHSDocumentTemplates, eq(workerDocumentAssignments.documentTemplateId, ukHSDocumentTemplates.id))
        .where(and(
          inArray(workerDocumentAssignments.id, assignmentIds),
          eq(workerDocumentAssignments.customerId, context.customerId),
          eq(workerDocumentAssignments.isActive, true)
        ));

      if (assignments.length === 0) {
        return res.status(404).json({ error: 'No matching assignments found for this customer' });
      }

      // Get isolated customer DB and company settings for branded email
      const customerDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(context.customerId);
      const companySettings = await simpleDatabaseService.getCompanySettings(context);
      
      let emailsSent = 0;
      const errors: string[] = [];
      const sentAt = new Date();
      
      for (const { assignment, template } of assignments) {
        try {
          // Look up worker from isolated customer DB (avoids shared-DB schema drift)
          const [worker] = await customerDb
            .select()
            .from(isolatedSchema.contractorWorkers)
            .where(eq(isolatedSchema.contractorWorkers.id, assignment.workerId))
            .limit(1);

          if (!worker) {
            errors.push(`Assignment ${assignment.id}: Worker ${assignment.workerId} not found`);
            continue;
          }

          if (!worker.email) {
            errors.push(`Assignment ${assignment.id}: Worker ${worker.firstName} ${worker.lastName} has no email`);
            continue;
          }

          // Look up company from isolated customer DB
          const [company] = await customerDb
            .select()
            .from(isolatedSchema.contractorCompanies)
            .where(eq(isolatedSchema.contractorCompanies.id, assignment.companyId))
            .limit(1);

          // Send branded H&S document assignment email (auto-logs to outbox via EmailService)
          const sent = await emailService.forCustomer(req.customerId).sendHSDocumentAssignment({
            workerEmail: worker.email,
            workerName: `${worker.firstName} ${worker.lastName}`,
            documentName: template.documentName,
            complianceCategory: template.complianceCategory || 'Health & Safety',
            companyName: company?.name || 'Your Company',
            acceptanceToken: assignment.acceptanceToken || '',
            dueDate: assignment.dueDate || undefined,
            companySettings,
          });

          if (!sent) {
            errors.push(`Assignment ${assignment.id}: Email delivery failed`);
            continue;
          }

          // Update assignment status in shared DB
          await db
            .update(workerDocumentAssignments)
            .set({ 
              status: 'sent',
              emailSent: true,
              emailSentAt: sentAt,
              updatedAt: sentAt,
            })
            .where(eq(workerDocumentAssignments.id, assignment.id));

          // Write worker audit note (non-fatal)
          try {
            await customerDb.insert(isolatedSchema.workerNotes).values({
              workerId: worker.id,
              changeType: 'hs_document_sent',
              notes: `H&S document email sent: "${template.documentName}" — sent by ${username} on ${sentAt.toLocaleString('en-GB')}`,
              changedBy: username,
              changedAt: sentAt,
            });
          } catch (noteErr) {
            logger.warn(`[H&S Email] Could not write worker note for ${worker.id}:`, noteErr);
          }

          // Write company audit note (non-fatal)
          if (company) {
            try {
              await customerDb.insert(isolatedSchema.companyNotes).values({
                companyId: company.id,
                changeType: 'hs_document_sent',
                notes: `H&S document email sent to ${worker.firstName} ${worker.lastName}: "${template.documentName}" — sent by ${username} on ${sentAt.toLocaleString('en-GB')}`,
                changedBy: username,
                changedAt: sentAt,
              });
            } catch (noteErr) {
              logger.warn(`[H&S Email] Could not write company note for ${company.id}:`, noteErr);
            }
          }

          emailsSent++;
          logger.info(`H&S email sent to [email] for document "${template.documentName}"`);
          
        } catch (assignmentError: any) {
          logger.error(`Failed to process assignment ${assignment.id}:`, assignmentError);
          errors.push(`Assignment ${assignment.id}: ${assignmentError.message}`);
        }
      }
      
      logger.info(`Sent ${emailsSent}/${assignments.length} H&S document emails for customer ${context.customerId}`);
      res.json({ 
        emailsSent,
        errors,
        message: emailsSent > 0
          ? `Successfully sent ${emailsSent} H&S document email${emailsSent !== 1 ? 's' : ''}`
          : `No emails sent${errors.length > 0 ? ': ' + errors[0] : ''}`,
      });
      
    } catch (error: any) {
      logger.error('Error sending UK H&S document emails:', error);
      res.status(500).json({ error: 'Failed to send UK H&S document emails' });
    }
  });

  // Worker document acceptance endpoint (public - no authentication required)
  app.get("/api/uk-hs-documents/accept/:token", async (req, res) => {
    try {
      // Validate token parameter
      const tokenSchema = z.string().uuid('Invalid token format');
      const token = tokenSchema.parse(req.params.token);
      
      // Step 1: Find assignment + template from shared DB only (no cross-schema join).
      // contractorWorkers and contractorCompanies live in the isolated customer schema —
      // they cannot be joined here. We fetch them separately below.
      const [row] = await db
        .select({
          assignment: workerDocumentAssignments,
          template: ukHSDocumentTemplates,
        })
        .from(workerDocumentAssignments)
        .innerJoin(ukHSDocumentTemplates, eq(workerDocumentAssignments.documentTemplateId, ukHSDocumentTemplates.id))
        .where(and(
          eq(workerDocumentAssignments.acceptanceToken, token),
          eq(workerDocumentAssignments.isActive, true)
        ));
      
      if (!row) {
        return res.status(404).json({ error: 'Document assignment not found or invalid token' });
      }

      const { assignment, template } = row;
      const customerId = assignment.customerId;

      if (!customerId) {
        return res.status(404).json({ error: 'Document assignment has no customer context' });
      }
      
      // Check if assignment is expired
      if (assignment.dueDate && new Date() > new Date(assignment.dueDate)) {
        return res.status(410).json({ 
          error: 'Document assignment has expired',
          dueDate: assignment.dueDate
        });
      }

      // Step 2: Fetch worker + company from the isolated customer DB
      const isolatedDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(customerId);

      const [workerRow] = assignment.workerId
        ? await isolatedDb
            .select()
            .from(isolatedSchema.contractorWorkers)
            .where(eq(isolatedSchema.contractorWorkers.id, assignment.workerId))
        : [undefined];

      const [companyRow] = assignment.companyId
        ? await isolatedDb
            .select()
            .from(isolatedSchema.contractorCompanies)
            .where(eq(isolatedSchema.contractorCompanies.id, assignment.companyId))
        : [undefined];

      const worker = workerRow ?? null;
      const company = companyRow ?? null;

      // Step 3: Fetch the customer's own company settings (for branding / issuing company details)
      const [settingsRow] = await isolatedDb
        .select({
          companyName: isolatedSchema.companySettings.companyName,
          logoUrl: isolatedSchema.companySettings.logoUrl,
          address: isolatedSchema.companySettings.address,
          phone: isolatedSchema.companySettings.phone,
          email: isolatedSchema.companySettings.email,
          smtpFromName: isolatedSchema.companySettings.smtpFromName,
        })
        .from(isolatedSchema.companySettings)
        .limit(1);

      // Step 4: Fill template variables with real data
      const fillTemplateVars = (content: string): string => {
        const workerFullName = worker ? `${worker.firstName} ${worker.lastName}` : '';
        const contractorCompanyName = company ? (company as any).companyName || '' : '';
        const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        const shortWorkerId = worker ? worker.id.slice(0, 8).toUpperCase() : '';
        const companyContactName = settingsRow?.smtpFromName || settingsRow?.companyName || '';

        // Fix logo URL: stored as /uploads/UUID but must be served via /objects/uploads/UUID
        let logoSrc = settingsRow?.logoUrl ?? '';
        if (logoSrc.startsWith('/uploads/')) {
          logoSrc = `/objects${logoSrc}`;
        } else if (logoSrc && !logoSrc.startsWith('/objects') && !logoSrc.startsWith('http')) {
          logoSrc = `/objects/uploads/${logoSrc}`;
        }
        const logoHtml = logoSrc
          ? `<img src="${logoSrc}" alt="${settingsRow?.companyName ?? ''} logo" style="max-height:60px;max-width:200px;display:block;" />`
          : '';

        return content
          .replace(/\{\{company_logo\}\}/gi, logoHtml)
          .replace(/\{\{company_name\}\}/gi, settingsRow?.companyName ?? '')
          .replace(/\{\{company_address\}\}/gi, settingsRow?.address ?? '')
          .replace(/\{\{company_phone\}\}/gi, settingsRow?.phone ?? '')
          .replace(/\{\{company_email\}\}/gi, settingsRow?.email ?? '')
          .replace(/\{\{company_contact_name\}\}/gi, companyContactName)
          .replace(/\{\{current_date\}\}/gi, today)
          .replace(/\{\{worker_full_name\}\}/gi, workerFullName)
          .replace(/\{\{worker_name\}\}/gi, workerFullName)
          .replace(/\{\{worker_id\}\}/gi, shortWorkerId)
          .replace(/\{\{contractor_company_name\}\}/gi, contractorCompanyName)
          .replace(/\{\{worker_email\}\}/gi, worker?.email ?? '')
          .replace(/\{\{worker_phone\}\}/gi, (worker as any)?.phoneNumber ?? '');
      };

      // Build normalized response objects for the frontend
      const workerNormalized = worker ? {
        id: worker.id,
        firstName: worker.firstName,
        lastName: worker.lastName,
        email: worker.email ?? '',
        companyId: (worker as any).companyId ?? '',
      } : null;

      const companyNormalized = company ? {
        id: company.id,
        name: (company as any).companyName ?? '',
        contactEmail: (company as any).contactEmail ?? undefined,
        phone: (company as any).contactPhone ?? undefined,
        address: (company as any).address ?? undefined,
      } : null;

      const templateFilled = {
        ...template,
        templateContent: fillTemplateVars(template.templateContent ?? ''),
        documentDescription: template.documentDescription
          ? fillTemplateVars(template.documentDescription)
          : template.documentDescription,
      };
      
      // Check if already accepted
      if (assignment.status === 'accepted') {
        return res.json({
          success: true,
          alreadyAccepted: true,
          message: 'Document already accepted',
          acceptedAt: assignment.acceptedAt,
          assignment,
          template: templateFilled,
          worker: workerNormalized,
          company: companyNormalized
        });
      }
      
      // Update viewed timestamp if first view
      if (!assignment.viewedAt) {
        await db
          .update(workerDocumentAssignments)
          .set({ viewedAt: new Date() })
          .where(eq(workerDocumentAssignments.id, assignment.id));
      }
      
      res.json({
        success: true,
        assignment,
        template: templateFilled,
        worker: workerNormalized,
        company: companyNormalized
      });
      
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: 'Invalid token format', 
          details: error.errors 
        });
      }
      logger.error('Error fetching document for acceptance:', error);
      res.status(500).json({ error: 'Failed to fetch document for acceptance' });
    }
  });

  // Submit worker document acceptance (public - no authentication required)
  app.post("/api/uk-hs-documents/accept/:token", async (req, res) => {
    try {
      // Validate token parameter
      const tokenSchema = z.string().uuid('Invalid token format');
      const token = tokenSchema.parse(req.params.token);
      
      // Validate request body
      const acceptanceRequestSchema = z.object({
        digitalSignature: z.string().optional(),
        confirmationText: z.string().min(1, 'Confirmation text is required'),
        acceptanceMethod: z.enum(['email_link', 'manual_entry']).default('email_link'),
        witnessName: z.string().optional(),
        witnessEmail: z.string().email().optional()
      });
      
      const validatedData = acceptanceRequestSchema.parse(req.body);
      const { digitalSignature, confirmationText, acceptanceMethod, witnessName, witnessEmail } = validatedData;
      
      // Use transaction for data consistency
      const result = await db.transaction(async (tx) => {
        // Find assignment by acceptance token with customer scoping
        const [assignment] = await tx
          .select()
          .from(workerDocumentAssignments)
          .where(and(
            eq(workerDocumentAssignments.acceptanceToken, token),
            eq(workerDocumentAssignments.isActive, true)
          ));
        
        if (!assignment) {
          throw new Error('Document assignment not found or invalid token');
        }
        
        // Check if assignment is expired
        if (assignment.dueDate && new Date() > new Date(assignment.dueDate)) {
          throw new Error('Document assignment has expired');
        }
        
        // Check if already accepted
        if (assignment.status === 'accepted') {
          throw new Error('Document has already been accepted');
        }
        
        const acceptedAt = new Date();
        
        // Update assignment status
        await tx
          .update(workerDocumentAssignments)
          .set({
            status: 'accepted',
            acceptedAt,
            updatedAt: acceptedAt
          })
          .where(eq(workerDocumentAssignments.id, assignment.id));
        
        // Create acceptance record with proper validation
        const acceptanceData = {
          customerId: assignment.customerId,
          assignmentId: assignment.id,
          workerId: assignment.workerId,
          documentTemplateId: assignment.documentTemplateId,
          acceptanceMethod,
          ipAddress: req.ip || 'unknown',
          userAgent: req.get('User-Agent') || null,
          acceptanceToken: token,
          digitalSignature,
          confirmationText,
          witnessName,
          witnessEmail
        };
        
        // Validate acceptance data with Zod
        const validatedAcceptance = insertWorkerDocumentAcceptanceSchema.parse(acceptanceData);
        
        const [acceptanceRecord] = await tx
          .insert(workerDocumentAcceptances)
          .values(validatedAcceptance)
          .returning();
        
        return { assignment, acceptanceRecord, acceptedAt };
      });
      
      res.json({
        success: true,
        message: 'Document accepted successfully',
        acceptedAt: result.acceptedAt,
        acceptanceId: result.acceptanceRecord.id
      });
      
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: 'Validation failed', 
          details: error.errors 
        });
      }
      if (error.message === 'Document assignment not found or invalid token') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message === 'Document assignment has expired') {
        return res.status(410).json({ error: error.message });
      }
      if (error.message === 'Document has already been accepted') {
        return res.status(400).json({ error: error.message });
      }
      logger.error('Error accepting document:', error);
      res.status(500).json({ error: 'Failed to accept document' });
    }
  });

  // Get auto-fill data for document template
  app.get("/api/uk-hs-documents/auto-fill/:workerId/:templateId", requireAuth, async (req, res) => {
    try {
      const { workerId, templateId } = req.params;
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Get worker details
      const worker = await databaseService.getContractorWorkerById(context, workerId);
      if (!worker) {
        return res.status(404).json({ error: 'Worker not found' });
      }
      
      // Get company details
      const company = await databaseService.getContractorCompany(context, worker.companyId);
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }
      
      const companySettings = await simpleDatabaseService.getCompanySettings(context);
      if (!companySettings) {
        return res.status(404).json({ error: 'Company settings not found' });
      }
      
      // Get template
      const [template] = await db
        .select()
        .from(ukHSDocumentTemplates)
        .where(and(
          eq(ukHSDocumentTemplates.id, templateId),
          eq(ukHSDocumentTemplates.customerId, context.customerId)
        ));
      
      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }
      
      // Get auto-fill mappings for this template
      const mappings = await db
        .select()
        .from(documentAutoFillMapping)
        .where(and(
          eq(documentAutoFillMapping.documentTemplateId, templateId),
          eq(documentAutoFillMapping.customerId, context.customerId)
        ));
      
      // Build auto-fill data
      const autoFillData: Record<string, any> = {};
      
      for (const mapping of mappings) {
        let value = null;
        
        // Extract value based on data source
        switch (mapping.dataSource) {
          case 'worker':
            value = (worker as any)[mapping.sourceField];
            break;
          case 'company':
            value = (company as any)[mapping.sourceField];
            break;
          case 'settings':
            value = (companySettings as any)[mapping.sourceField];
            break;
          case 'system':
            if (mapping.sourceField === 'current_date') {
              value = new Date().toLocaleDateString();
            } else if (mapping.sourceField === 'current_datetime') {
              value = new Date().toLocaleString();
            }
            break;
        }
        
        // Apply formatting if specified
        if (value && mapping.formatting) {
          switch (mapping.formatting) {
            case 'uppercase':
              value = String(value).toUpperCase();
              break;
            case 'lowercase':
              value = String(value).toLowerCase();
              break;
            case 'title_case':
              value = String(value).replace(/\w\S*/g, (txt) => 
                txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
              break;
            case 'date_uk':
              if (value instanceof Date || !isNaN(Date.parse(value))) {
                value = new Date(value).toLocaleDateString('en-GB');
              }
              break;
          }
        }
        
        if (value !== null && value !== undefined) {
          autoFillData[mapping.placeholderField] = value;
        }
      }
      
      res.json({
        success: true,
        autoFillData,
        template: {
          id: template.id,
          documentName: template.documentName,
          complianceCategory: template.complianceCategory
        },
        worker: {
          id: worker.id,
          firstName: worker.firstName,
          lastName: worker.lastName
        },
        company: {
          id: company.id,
          name: company.name
        }
      });
      
    } catch (error) {
      logger.error('Error generating auto-fill data:', error);
      res.status(500).json({ error: 'Failed to generate auto-fill data' });
    }
  });

  // Get document acceptance history for a worker
  app.get("/api/uk-hs-documents/acceptances/worker/:workerId", requireAuth, async (req, res) => {
    try {
      const { workerId } = req.params;
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const acceptances = await db
        .select({
          acceptance: workerDocumentAcceptances,
          template: ukHSDocumentTemplates
        })
        .from(workerDocumentAcceptances)
        .innerJoin(ukHSDocumentTemplates, eq(workerDocumentAcceptances.documentTemplateId, ukHSDocumentTemplates.id))
        .where(and(
          eq(workerDocumentAcceptances.workerId, workerId),
          eq(workerDocumentAcceptances.customerId, context.customerId)
        ))
        .orderBy(desc(workerDocumentAcceptances.acceptanceDate));
      
      res.json(acceptances);
    } catch (error) {
      logger.error('Error fetching worker document acceptances:', error);
      res.status(500).json({ error: 'Failed to fetch worker document acceptances' });
    }
  });

  // Get document compliance status summary for company
  app.get("/api/uk-hs-documents/compliance/company/:companyId", requireAuth, async (req, res) => {
    try {
      const { companyId } = req.params;
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Get all workers for the company
      const workers = await databaseService.getWorkersByCompanyId(context, companyId);
      
      // Get all document templates
      const templates = await db
        .select()
        .from(ukHSDocumentTemplates)
        .where(and(
          eq(ukHSDocumentTemplates.customerId, context.customerId),
          eq(ukHSDocumentTemplates.isActive, true)
        ));
      
      // Get all assignments for company
      const assignments = await db
        .select()
        .from(workerDocumentAssignments)
        .where(and(
          eq(workerDocumentAssignments.companyId, companyId),
          eq(workerDocumentAssignments.customerId, context.customerId),
          eq(workerDocumentAssignments.isActive, true)
        ));
      
      // Calculate compliance metrics
      const totalWorkers = workers.length;
      const totalDocuments = templates.length;
      const totalRequired = totalWorkers * totalDocuments;
      const totalAssigned = assignments.length;
      const totalAccepted = assignments.filter(a => a.status === 'accepted').length;
      const totalPending = assignments.filter(a => a.status === 'pending' || a.status === 'sent').length;
      
      const compliancePercentage = totalRequired > 0 ? Math.round((totalAccepted / totalRequired) * 100) : 0;
      
      res.json({
        companyId,
        totalWorkers,
        totalDocuments,
        totalRequired,
        totalAssigned,
        totalAccepted,
        totalPending,
        compliancePercentage,
        workers: workers.map(worker => ({
          id: worker.id,
          name: `${worker.firstName} ${worker.lastName}`,
          assignedCount: assignments.filter(a => a.workerId === worker.id).length,
          acceptedCount: assignments.filter(a => a.workerId === worker.id && a.status === 'accepted').length
        })),
        templates: templates.map(template => ({
          id: template.id,
          name: template.documentName,
          category: template.complianceCategory,
          assignedCount: assignments.filter(a => a.documentTemplateId === template.id).length,
          acceptedCount: assignments.filter(a => a.documentTemplateId === template.id && a.status === 'accepted').length
        }))
      });
      
    } catch (error) {
      logger.error('Error fetching company compliance status:', error);
      res.status(500).json({ error: 'Failed to fetch company compliance status' });
    }
  });

  // Get all document assignments across all workers (for H&S management dashboard)
  app.get("/api/uk-hs-documents/assignments/all", requireAuth, async (req, res) => {
    try {
      if (!req.user?.username) {
        return res.status(401).json({ error: 'User authentication required' });
      }
      const username = req.user.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      let assignments: any[] = [];
      try {
        assignments = await db
          .select()
          .from(workerDocumentAssignments)
          .where(and(
            eq(workerDocumentAssignments.customerId, context.customerId),
            eq(workerDocumentAssignments.isActive, true)
          ))
          .orderBy(desc(workerDocumentAssignments.assignedAt))
          .limit(500);
      } catch (dbError) {
        logger.error('Database query failed for H&S assignments:', dbError);
        assignments = [];
      }
      logger.info(`Retrieved ${assignments.length} H&S document assignments for customer ${context.customerId}`);
      res.status(200).json(assignments);
    } catch (error) {
      logger.error('Error fetching H&S document assignments:', error);
      res.status(500).json({ error: 'Failed to fetch document assignments' });
    }
  });

  // Get assignments by company ID (for compliance view)
  app.get("/api/uk-hs-documents/assignments/company/:companyId", requireAuth, async (req, res) => {
    try {
      const { companyId } = req.params;
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Get assignments for specific company with full details
      const assignments = await db
        .select({
          assignment: workerDocumentAssignments,
          worker: contractorWorkers,
          template: ukHSDocumentTemplates,
          company: contractorCompanies
        })
        .from(workerDocumentAssignments)
        .innerJoin(contractorWorkers, eq(workerDocumentAssignments.workerId, contractorWorkers.id))
        .innerJoin(ukHSDocumentTemplates, eq(workerDocumentAssignments.documentTemplateId, ukHSDocumentTemplates.id))
        .innerJoin(contractorCompanies, eq(workerDocumentAssignments.companyId, contractorCompanies.id))
        .where(and(
          eq(workerDocumentAssignments.companyId, companyId),
          eq(workerDocumentAssignments.customerId, context.customerId),
          eq(workerDocumentAssignments.isActive, true),
          eq(contractorWorkers.customerId, context.customerId),
          eq(ukHSDocumentTemplates.customerId, context.customerId),
          eq(contractorCompanies.customerId, context.customerId)
        ))
        .orderBy(desc(workerDocumentAssignments.assignedAt));
      
      logger.info(`Retrieved ${assignments.length} H&S document assignments for company ${companyId} and customer ${context.customerId}`);
      res.json(assignments);
    } catch (error) {
      logger.error('Error fetching company document assignments:', error);
      res.status(500).json({ error: 'Failed to fetch company document assignments' });
    }
  });

  // DEV-ONLY: CO2 calculation test endpoint.
  // The entire app.post() registration is inside this NODE_ENV guard, so this route
  // is never registered in production — production deployments cannot reach it.
  // Uses a hardcoded 'Andy' customer context; must NEVER be made available outside development.
  if (process.env.NODE_ENV === 'development') {
    app.post("/api/dev/contractors/workers/:workerId/checkin", async (req, res) => {
      try {
        const { workerId } = req.params;
        const { purpose, hostStaffId, hostName, hsRulesAccepted } = req.body;
        
        logger.info(`DEV-ONLY: Testing check-in for worker ${workerId}`);
        
        // Get customer context (use default for dev testing)
        const context = simpleDatabaseService.createCustomerContext('Andy');
        
        // Get worker details using customer-isolated database service
        const worker = await databaseService.getContractorWorkerById(context, workerId);
        if (!worker) {
          return res.status(404).json({ error: "Worker not found" });
        }

        // Get contractor company details using customer-isolated database service
        const contractors = await databaseService.getAllContractorCompanies(context);
        const company = contractors.find(c => c.id === worker.companyId);
        if (!company) {
          return res.status(404).json({ error: "Contractor company not found" });
        }

        logger.info(`DEV: Testing CO2 calculation for ID ${worker.id}`);
        logger.info(`Postcode: ${worker.postcode}, Transport: ${worker.transportMethod}`);
        logger.info(`Company address: ${company.address}`);

        // Calculate CO2 emissions for this worker's commute
        let co2CalculationResult = null;
        if (worker.postcode && company.address) {
          try {
            logger.info(`Calculating CO2 emissions for ID ${worker.id}`);
            
            const co2Calculator = new CO2CalculationService(databaseService);
            co2CalculationResult = await co2Calculator.calculateWorkerCO2Emissions(
              context.customerId,
              worker.companyId,
              {
                workerId: workerId,
                workerPostcode: worker.postcode,
                companyAddress: company.address,
                transportMethod: worker.transportMethod || 'car_diesel',
                workingDaysPerMonth: 22
              }
            );
            
            logger.info(`CO2 emissions calculated: ${co2CalculationResult.monthlyCO2kg} kg/month for ID ${worker.id}`);
          } catch (co2Error) {
            logger.error(`Failed to calculate CO2 emissions for ID ${worker.id}:`, co2Error);
            return res.status(500).json({ error: `CO2 calculation failed: ${co2Error.message}` });
          }
        } else {
          logger.info(`Skipping CO2 calculation for ID ${worker.id} - missing postcode or company address`);
        }

        res.json({
          success: true,
          message: "DEV: CO2 calculation test completed",
          worker: {
            id: worker.id,
            name: `${worker.firstName} ${worker.lastName}`,
            postcode: worker.postcode,
            transportMethod: worker.transportMethod
          },
          company: {
            address: company.address
          },
          co2Result: co2CalculationResult
        });
      } catch (error) {
        logger.error("DEV: Error in CO2 test check-in:", error);
        res.status(500).json({ error: `DEV test failed: ${error.message}` });
      }
    });
  }

  // Contractor Worker Check-in/Check-out endpoints
  app.post("/api/contractors/workers/:workerId/checkin", requireAuth, async (req, res) => {
    try {
      const { workerId } = req.params;
      const { purpose, hostStaffId, hostName, hsRulesAccepted } = req.body;
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Get worker details using customer-isolated database service
      const worker = await databaseService.getContractorWorkerById(context, workerId);
      if (!worker) {
        return res.status(404).json({ error: "Worker not found" });
      }

      // Get contractor company details using customer-isolated database service
      const contractors = await databaseService.getAllContractorCompanies(context);
      const company = contractors.find(c => c.id === worker.companyId);
      if (!company) {
        return res.status(404).json({ error: "Contractor company not found" });
      }

      // Check worker clearance — single source of truth
      const checkinDb = await customerDbService.getCustomerDatabase(context.customerId);
      const clearance = await getWorkerClearanceStatus(checkinDb, workerId, context.customerId);
      if (!clearance.ready) {
        try {
          const ciSchema = customerDbService.generateSchemaName(context.customerId);
          const ciPool = (checkinDb as any).$client ?? (checkinDb as any).session?.client;
          if (ciPool) {
            await ciPool.query(
              `INSERT INTO "${ciSchema}".contractor_onboarding_audit (company_id, worker_id, action, actor, reason) VALUES ($1, $2, 'check_in_blocked', $3, $4)`,
              [company.id, workerId, username, clearance.blocking.join(' · ')]
            );
          }
        } catch { /* Non-fatal */ }
        return res.status(400).json({
          error: `Cannot check in: ${clearance.blocking.join(' · ')}`,
          issues: clearance.blocking,
          warnings: clearance.warnings,
        });
      }

      // Check if worker is already checked in
      if (worker.isCheckedIn) {
        return res.status(400).json({ error: "Worker is already checked in" });
      }

      // Server-side H&S enforcement for contractors
      // Only enforce if there is actual H&S content to show — mirrors the client-side modal gate
      const contractorSettings = await databaseService.getCompanySettings(context);
      const cHsEnabled = contractorSettings?.hsRulesEnabled !== false;
      const cHsRequiresAcceptance = !!contractorSettings?.hsRulesRequireAcceptance;
      const cHsHasContent = !!(contractorSettings as any)?.hsRulesContent?.trim();
      if (cHsEnabled && cHsRequiresAcceptance && cHsHasContent && !hsRulesAccepted) {
        return res.status(400).json({
          error: "Health & Safety acceptance required",
          message: "You must accept the Health & Safety rules before checking in.",
          requireHsAcceptance: true
        });
      }

      const contractorHsAccepted = hsRulesAccepted === true || worker.hsRulesAccepted || false;
      const contractorHsAcceptedAt = hsRulesAccepted === true ? new Date() : worker.hsRulesAcceptedAt;

      // NDA enforcement for contractors
      const cNdaEnabled = !!(contractorSettings as any)?.ndaEnabled;
      const cNdaAppliesTo = (contractorSettings as any)?.ndaAppliesTo || 'visitors';
      const cNdaAppliesToContractors = cNdaAppliesTo === 'contractors' || cNdaAppliesTo === 'both';
      const cNdaRequireSig = !!(contractorSettings as any)?.ndaRequireSignature;
      const cNdaHasContent = !!((contractorSettings as any)?.ndaContent?.trim());
      const cNdaBodyAccepted = req.body.ndaAccepted === true;
      if (cNdaEnabled && cNdaAppliesToContractors && cNdaRequireSig && cNdaHasContent && !cNdaBodyAccepted) {
        return res.status(400).json({
          error: "NDA acceptance required",
          message: "You must accept the Non-Disclosure Agreement before checking in.",
          requireNdaAcceptance: true
        });
      }

      logger.info(`Starting contractor check-in for: ID ${worker.id} from ${company.name}`);
      
      // Worker's permanent QR code (their identity/pass) — generate once if missing
      const workerQrCode = worker.qrCode || `CTR-${randomUUID().replace(/-/g, '').substring(0, 12)}`;
      // Per-visit QR code — always fresh so the unique constraint on contractor_visits is never violated
      const visitQrCode = `CPB-${randomUUID().replace(/-/g, '').substring(0, 12)}`;
      const passUrl = `${process.env.REPLIT_DOMAINS || process.env.APP_URL || process.env.BASE_URL || process.env.PUBLIC_URL || `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`}/pass/contractor/${workerId}`;
      
      // Atomically mark the worker as checked-in and create the visit record so
      // they can never appear checked-in without a corresponding history entry.
      const checkInTime = new Date();
      const { siteId: workerCheckinSiteId } = await getScopedDb(req);
      const contractorCheckinDb = await customerDbService.getCustomerDatabase(context.customerId);
      await contractorCheckinDb.transaction(async (tx) => {
        // Pass the transaction as db so the update enrolls in the same atomic unit
        await svcCheckInWorker(
          { db: tx, customerId: context.customerId, actor: username },
          workerId,
          {
            qrCode: workerQrCode,
            isCheckedIn: true,
            checkedInAt: checkInTime,
            hsRulesAccepted: contractorHsAccepted,
            hsRulesAcceptedAt: contractorHsAcceptedAt,
            ...(cNdaBodyAccepted ? { ndaAccepted: true, ndaAcceptedAt: new Date() } : {}),
          },
        );

        await tx.insert(isolatedSchema.contractorVisits).values(withSiteId(workerCheckinSiteId, {
          workerId: workerId,
          companyId: worker.companyId,
          purpose: purpose || "Site work",
          checkedInAt: checkInTime,
          hostStaffId: hostStaffId,
          hostName: hostName,
          hsRulesAccepted: contractorHsAccepted,
          hsRulesAcceptedAt: contractorHsAcceptedAt,
          qrCode: visitQrCode,
          passUrl: passUrl,
        }));
      });
      logger.info(`Created visit record for ID ${worker.id}`);

      // Fetch the freshly-updated worker so we can return it in the response
      const updatedWorker = await databaseService.getContractorWorkerById(context, workerId);

      // Create audit trail entry for check-in
      try {
        const db = await customerDbService.getCustomerDatabase(context.customerId);
        await db.insert(isolatedSchema.workerNotes).values({
          workerId: workerId,
          changeType: 'check_in',
          oldValue: 'Checked Out',
          newValue: 'Checked In',
          notes: `Checked in for: ${purpose || 'Site work'}`,
          changedBy: username,
        });
      } catch (auditErr) {
        logger.error('Failed to create check-in audit note:', auditErr);
      }

      // Calculate CO2 emissions for this worker's commute
      let co2CalculationResult = null;
      if (worker.postcode && company.address) {
        try {
          logger.info(`Calculating CO2 emissions for ID ${worker.id}`);
          
          const co2Calculator = new CO2CalculationService(databaseService);
          co2CalculationResult = await co2Calculator.calculateWorkerCO2Emissions(
            context.customerId,
            worker.companyId,
            {
              workerId: workerId,
              workerPostcode: worker.postcode,
              companyAddress: company.address,
              transportMethod: worker.transportMethod || 'car_diesel',
              workingDaysPerMonth: 22
            }
          );
          
          logger.info(`CO2 emissions calculated: ${co2CalculationResult.monthlyCO2kg} kg/month for ID ${worker.id}`);
        } catch (co2Error) {
          logger.error(`Failed to calculate CO2 emissions for ID ${worker.id}:`, co2Error);
          // Don't fail the check-in if CO2 calculation fails
        }
      } else {
        logger.info(`Skipping CO2 calculation for ID ${worker.id} - missing postcode or company address`);
      }

      let ePassSent = false;
      let emailSentSuccessfully = false;
      
      // Send e-pass if email is available
      if (worker.email) {
        try {
          const { simpleDatabaseService } = await import("../simpleDatabaseService");
          
          // Retry settings fetch once in case of transient DB pool reconnection
          let companySettings: any = null;
          try {
            companySettings = await simpleDatabaseService.getCompanySettings(context);
          } catch (settingsErr) {
            logger.warn(`First settings fetch failed for e-pass, retrying in 300ms...`, settingsErr);
            await new Promise(r => setTimeout(r, 300));
            try {
              companySettings = await simpleDatabaseService.getCompanySettings(context);
              logger.info(`Settings retry succeeded`);
            } catch (retryErr) {
              logger.error(`Settings retry also failed — e-pass will be skipped:`, retryErr);
            }
          }
          
          // Check if e-Pass is enabled in settings
          if (companySettings?.ePassEnabled) {
            logger.info(`Sending contractor e-pass to [email]`);

            // Ensure the worker has an H&S acceptance token — generate and persist one if missing
            let workerHsToken: string = worker.hsRulesAcceptanceToken || '';
            if (!workerHsToken) {
              workerHsToken = randomBytes(16).toString('hex');
              await svcPersistHsToken(
                { db: contractorCheckinDb, customerId: context.customerId, actor: username },
                workerId,
                workerHsToken,
              );
              logger.info(`Generated H&S acceptance token for contractor worker ${workerId}`);
            }

            const emailService = new EmailService(req.customerId);

            emailSentSuccessfully = await emailService.sendContractorEPass(
              worker.email,
              `${worker.firstName} ${worker.lastName}`,
              company.name || 'Contractor',
              workerQrCode,
              passUrl,
              companySettings,
              workerId,
              hostName,
              context.customerId,
              workerHsToken
            );
            
            if (emailSentSuccessfully) {
              ePassSent = true;
              logger.info(`E-Pass sent successfully to contractor [email]`);
            } else {
              logger.info(`E-pass send returned false for [email] — physical pass will be shown`);
            }
          } else if (companySettings) {
            logger.info(`E-Pass disabled in settings, skipping for [email]`);
          } else {
            logger.error(`Could not load settings — e-pass skipped for [email]`);
          }
        } catch (emailError) {
          logger.error("Failed to send contractor e-pass:", emailError);
          // Don't fail the check-in if email fails
        }
      }

      // Send branded arrival notification to host staff member
      if (hostStaffId) {
        try {
          const hostStaff = await databaseService.getStaffById(context, hostStaffId);
          if (hostStaff && hostStaff.email) {
            const companySettings = await simpleDatabaseService.getCompanySettings(context);
            const arrivalEmailService = new EmailService(req.customerId);
            await arrivalEmailService.sendArrivalNotification({
              hostEmail: hostStaff.email,
              hostFirstName: hostStaff.firstName,
              visitorName: `${worker.firstName} ${worker.lastName}`,
              visitorCompany: company.name || 'Contractor',
              visitorType: 'contractor',
              purpose: purpose || 'Site work',
              checkedInAt: new Date(),
              companyName: companySettings?.companyName || 'TPR Max',
            });
            logger.info(`Arrival notification sent to host ID ${hostStaff.id} ([email])`);
          }
        } catch (notifyError) {
          logger.error('Failed to send arrival notification to host:', notifyError);
        }
      }

      // Check for active evacuations and add contractor to accountability list if needed
      // evacuations is a global table (queried via global db with customerId filter);
      // evacuationAccountability records are stored in the customer-isolated schema.
      try {
        const activeEvacuations = await db
          .select()
          .from(evacuations)
          .where(and(
            eq(evacuations.status, 'active'),
            eq(evacuations.customerId, context.customerId)
          ))
          .orderBy(desc(evacuations.startedAt))
          .limit(1);

        if (activeEvacuations.length > 0) {
          const evacuation = activeEvacuations[0];
          const checkinEvacDb = await customerDbService.getCustomerDatabase(context.customerId);

          // Check if contractor is already in accountability list
          const existingRecord = await checkinEvacDb
            .select()
            .from(isolatedSchema.evacuationAccountability)
            .where(and(
              eq(isolatedSchema.evacuationAccountability.evacuationId, evacuation.evacuationId),
              eq(isolatedSchema.evacuationAccountability.personId, workerId)
            ))
            .limit(1);

          if (existingRecord.length === 0) {
            await checkinEvacDb.insert(isolatedSchema.evacuationAccountability).values({
              customerId: context.customerId,
              evacuationId: evacuation.evacuationId,
              personId: workerId,
              personType: 'contractor',
              personName: `${worker.firstName} ${worker.lastName}`,
              department: worker.department || '',
              company: company.name || '',
              lastKnownLocation: 'Just Checked In',
              isAccountedFor: false
            });
            logger.info(`Added contractor ID ${worker.id} to active evacuation ${evacuation.evacuationId} accountability list`);
          }
        }
      } catch (evacErr) {
        logger.error('Failed to update evacuation accountability on check-in:', evacErr);
      }

      websocketService.broadcastPersonnelUpdate(context.customerId, {
        personId: workerId,
        personName: `${worker.firstName} ${worker.lastName}`,
        personType: 'contractor',
        action: 'checkin'
      });

      const ePassConfigured = !!contractorSettings?.ePassEnabled;
      res.json({
        success: true,
        worker: updatedWorker,
        ePassSent: ePassSent,
        ePassEnabled: ePassConfigured,
        hasEmail: !!worker.email,
        message: worker.email 
          ? (ePassSent 
              ? "E-Pass sent to worker's email"
              : ePassConfigured 
                ? "Check-in initiated (e-pass failed to send)"
                : "Check-in initiated — physical pass printing enabled")
          : "Check-in initiated (no email on file)"
      });
    } catch (error) {
      logger.error("Error checking in worker:", error);
      res.status(500).json({ error: "Failed to check in worker" });
    }
  });

  app.post("/api/contractors/workers/:workerId/checkout", requireAuth, async (req, res) => {
    try {
      const { workerId } = req.params;
      const { checkoutType } = req.body;
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Get worker details using customer-isolated database service
      const worker = await databaseService.getContractorWorkerById(context, workerId);
      if (!worker) {
        return res.status(404).json({ error: "Worker not found" });
      }

      // Update worker status via service (sets isCheckedIn=false, checkedOutAt, writes audit note)
      const checkOutDb = await customerDbService.getCustomerDatabase(context.customerId);
      const updatedWorker = await svcCheckOutWorker(
        { db: checkOutDb, customerId: context.customerId, actor: username },
        workerId,
        { checkoutType },
      );

      // Complete the current visit record
      const currentVisit = await databaseService.getCurrentContractorVisit(context, workerId);
      if (currentVisit) {
        await databaseService.updateContractorVisit(context, currentVisit.id, {
          checkedOutAt: new Date()
        });
        logger.info(`Completed visit record for ID ${worker.id}`);
      }

      // Remove contractor from evacuation accountability on checkout — they are no longer on site
      try {
        const checkoutActiveEvacs = await db
          .select()
          .from(evacuations)
          .where(and(
            eq(evacuations.status, 'active'),
            eq(evacuations.customerId, context.customerId)
          ))
          .orderBy(desc(evacuations.startedAt))
          .limit(1);

        if (checkoutActiveEvacs.length > 0) {
          const checkoutEvacDb = await customerDbService.getCustomerDatabase(context.customerId);
          await checkoutEvacDb
            .delete(isolatedSchema.evacuationAccountability)
            .where(and(
              eq(isolatedSchema.evacuationAccountability.evacuationId, checkoutActiveEvacs[0].evacuationId),
              eq(isolatedSchema.evacuationAccountability.personId, workerId)
            ));
          logger.info(`Removed contractor ID ${worker.id} from evacuation ${checkoutActiveEvacs[0].evacuationId} accountability on checkout`);
        }
      } catch (evacErr) {
        logger.warn('Could not remove contractor from evacuation accountability on checkout:', evacErr);
      }

      websocketService.broadcastPersonnelUpdate(context.customerId, {
        personId: workerId,
        personName: `${worker.firstName} ${worker.lastName}`,
        personType: 'contractor',
        action: 'checkout'
      });

      // Auto-end any active lone worker session on checkout
      try {
        const contractorLwDb = await customerDbService.getCustomerDatabase(context.customerId);
        const [activeSession] = await contractorLwDb.select().from(isolatedSchema.loneWorkerSessions)
          .where(sql`${isolatedSchema.loneWorkerSessions.personId} = ${workerId} AND ${isolatedSchema.loneWorkerSessions.personType} = 'contractor' AND ${isolatedSchema.loneWorkerSessions.status} IN ('active','escalated')`)
          .limit(1);
        if (activeSession) {
          await contractorLwDb.update(isolatedSchema.loneWorkerSessions)
            .set({ status: 'ended_ok', endedAt: new Date(), endedBy: 'checkout' })
            .where(sql`${isolatedSchema.loneWorkerSessions.id} = ${activeSession.id}`);
          await svcClearLoneWorkerState(
            { db: contractorLwDb, customerId: context.customerId, actor: username },
            workerId,
          );
          logger.info(`Auto-ended lone worker session for contractor ${workerId} on checkout`);
        }
      } catch (lwErr) {
        logger.warn('Could not auto-end lone worker session on contractor checkout:', lwErr);
      }

      res.json({
        success: true,
        worker: updatedWorker,
        message: "Worker checked out successfully"
      });
    } catch (error) {
      logger.error("Error checking out worker:", error);
      res.status(500).json({ error: "Failed to check out worker" });
    }
  });


  // Get contractor worker visit history  
  app.get("/api/contractors/workers/:workerId/history", requireAuth, async (req, res) => {
    try {
      const { workerId } = req.params;
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Get contractor visits from customer-isolated database
      const visits = await databaseService.getContractorVisitHistory(context, workerId);
      
      // Format visits with duration calculations
      const formattedVisits = visits.map(visit => ({
        id: visit.id,
        workerId: visit.workerId,
        companyId: visit.companyId,
        purpose: visit.purpose || "Site work",
        checkedInAt: visit.checkedInAt,
        checkedOutAt: visit.checkedOutAt,
        duration: visit.checkedOutAt 
          ? calculateDuration(new Date(visit.checkedInAt), new Date(visit.checkedOutAt))
          : null,
        qrCode: visit.qrCode,
        notes: visit.notes
      }));

      res.json(formattedVisits);
    } catch (error) {
      logger.error("Error fetching contractor visit history:", error);
      res.status(500).json({ error: "Failed to fetch visit history" });
    }
  });

  // Get contractor worker notes/audit trail
  app.get("/api/contractors/workers/:workerId/notes", requireAuth, async (req, res) => {
    try {
      const { workerId } = req.params;
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Get worker notes from customer-isolated database
      const notes = await databaseService.getWorkerNotes(context, workerId);
      
      // Sort notes by date (most recent first)
      const sortedNotes = notes.sort((a, b) => 
        new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime()
      );
      
      res.json(sortedNotes);
    } catch (error) {
      logger.error("Error fetching worker notes:", error);
      res.status(500).json({ error: "Failed to fetch worker notes" });
    }
  });

  // PATCH update contractor CDM fields — extends /api/contractors/:id for CDM/accreditation fields
  app.patch("/api/contractors/:id/cdm", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    try {
      const { id } = req.params;
      const db = await customerDbService.getCustomerDatabase(req.customerId!);
      const data = req.body;
      const updates: Record<string, any> = {};
      if (data.cdmRole !== undefined) updates.cdmRole = data.cdmRole;
      if (data.constructionlineGrade !== undefined) updates.constructionlineGrade = data.constructionlineGrade;
      if (data.chasCertified !== undefined) updates.chasCertified = data.chasCertified;
      if (data.smasAccredited !== undefined) updates.smasAccredited = data.smasAccredited;
      if (data.otherAccreditations !== undefined) updates.otherAccreditations = data.otherAccreditations;
      if (data.pdProfessionalBody !== undefined) updates.pdProfessionalBody = data.pdProfessionalBody;
      if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No CDM fields provided" });
      const [company] = await db.update(isolatedSchema.contractorCompanies)
        .set(updates)
        .where(eq(isolatedSchema.contractorCompanies.id, id))
        .returning();
      if (!company) return res.status(404).json({ error: "Contractor company not found" });
      res.json(company);
    } catch (error) {
      logger.error("Error updating contractor CDM fields:", error);
      res.status(500).json({ error: "Failed to update contractor CDM fields" });
    }
  });

  // ── Portal URL builder — single source of truth ──────────────────────────
  // Prefers APP_URL env var, then x-forwarded headers, then raw request host.
  function buildPortalUrl(req: any): string {
    if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
    const host  = (req.headers['x-forwarded-host']  as string) || req.headers.host || '';
    return `${proto}://${host}`;
  }

  // ── Portal-admin middleware ───────────────────────────────────────────────
  function requirePortalAdmin(req: any, res: any, next: any) {
    if (!['admin'].includes(req.user?.role || '')) {
      return res.status(403).json({ error: 'Admin role required' });
    }
    next();
  }

  // ── Portal feature gate (mirrors requirePermitToWorkFeature) ──────────────
  async function requirePortalFeature(req: any, res: any, next: any) {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const settings = await simpleDatabaseService.getCompanySettings(context);
      if (!settings?.featureContractorPortal) {
        return res.status(403).json({ error: 'Contractor Portal module is not enabled for your account.' });
      }
      next();
    } catch (error) {
      next(error);
    }
  }

  // ── Contractor Portal: Admin overview (replaces N+1 per-company fan-out) ──
  app.get('/api/contractor-portal/admin-overview', requireAuth, requirePortalFeature, requirePortalAdmin, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const db = await customerDbService.getCustomerDatabase(customerId);
      const pool = (db as any).$client ?? (db as any).session?.client;
      const schemaName = customerDbService.generateSchemaName(customerId);

      const portalUsers = await db
        .select({
          id: isolatedSchema.contractorPortalUsers.id,
          email: isolatedSchema.contractorPortalUsers.email,
          firstName: isolatedSchema.contractorPortalUsers.firstName,
          lastName: isolatedSchema.contractorPortalUsers.lastName,
          role: isolatedSchema.contractorPortalUsers.role,
          isActive: isolatedSchema.contractorPortalUsers.isActive,
          hasPassword: sql<boolean>`(${isolatedSchema.contractorPortalUsers.passwordHash} IS NOT NULL)`,
          hasPendingInvite: sql<boolean>`(${isolatedSchema.contractorPortalUsers.inviteToken} IS NOT NULL)`,
          inviteExpiresAt: isolatedSchema.contractorPortalUsers.inviteExpiresAt,
          lastLoginAt: isolatedSchema.contractorPortalUsers.lastLoginAt,
          invitedAt: isolatedSchema.contractorPortalUsers.invitedAt,
          companyId: isolatedSchema.contractorPortalUsers.contractorCompanyId,
          companyName: isolatedSchema.contractorCompanies.companyName,
        })
        .from(isolatedSchema.contractorPortalUsers)
        .leftJoin(
          isolatedSchema.contractorCompanies,
          eq(isolatedSchema.contractorPortalUsers.contractorCompanyId, isolatedSchema.contractorCompanies.id)
        )
        .orderBy(desc(isolatedSchema.contractorPortalUsers.invitedAt));

      const pendingDocs = await db
        .select({
          id: isolatedSchema.contractorDocuments.id,
          documentName: isolatedSchema.contractorDocuments.documentName,
          documentType: isolatedSchema.contractorDocuments.documentType,
          documentUrl: isolatedSchema.contractorDocuments.documentUrl,
          expiryDate: isolatedSchema.contractorDocuments.expiryDate,
          uploadedAt: isolatedSchema.contractorDocuments.uploadedAt,
          uploadedBy: isolatedSchema.contractorDocuments.uploadedBy,
          status: isolatedSchema.contractorDocuments.status,
          companyId: isolatedSchema.contractorDocuments.companyId,
          companyName: isolatedSchema.contractorCompanies.companyName,
          workerId: isolatedSchema.contractorDocuments.workerId,
          workerFirstName: isolatedSchema.contractorWorkers.firstName,
          workerLastName: isolatedSchema.contractorWorkers.lastName,
        })
        .from(isolatedSchema.contractorDocuments)
        .leftJoin(
          isolatedSchema.contractorCompanies,
          eq(isolatedSchema.contractorDocuments.companyId, isolatedSchema.contractorCompanies.id)
        )
        .leftJoin(
          isolatedSchema.contractorWorkers,
          eq(isolatedSchema.contractorDocuments.workerId, isolatedSchema.contractorWorkers.id)
        )
        .where(
          and(
            eq(isolatedSchema.contractorDocuments.status, 'pending'),
            eq(isolatedSchema.contractorDocuments.isActive, true)
          )
        )
        .orderBy(desc(isolatedSchema.contractorDocuments.uploadedAt));

      // Submitted companies awaiting site approval (raw SQL — onboarding_status not in Drizzle schema)
      let submittedCompanies: any[] = [];
      try {
        const submittedResult = await pool.query(`
          SELECT
            cc.id,
            cc.company_name,
            cc.contact_email,
            cc.onboarding_submitted_at,
            COALESCE((
              SELECT json_agg(json_build_object(
                'docType', r.document_type,
                'label', r.label,
                'valid', EXISTS(
                  SELECT 1 FROM "${schemaName}".contractor_documents cd
                  WHERE cd.company_id = cc.id
                    AND cd.is_active = true
                    AND cd.document_type = r.document_type
                    AND cd.status != 'rejected'
                    AND (cd.expiry_date IS NULL OR cd.expiry_date >= NOW())
                ) ) ORDER BY r.sort_order)
              FROM "${schemaName}".contractor_onboarding_requirements r
              WHERE r.is_required = true
            ), '[]'::json) AS required_docs
          FROM "${schemaName}".contractor_companies cc
          WHERE cc.onboarding_status = 'submitted'
            AND cc.is_active = true
          ORDER BY cc.onboarding_submitted_at ASC
        `);
        submittedCompanies = submittedResult.rows;
      } catch (_) { /* non-fatal — table may not exist on old schemas */ }

      return res.json({ portalUsers, pendingDocs, submittedCompanies });
    } catch (error: any) {
      logger.error('[portal-admin] admin-overview error', {
        customerId: req.customerId, user: (req.user as any)?.username,
        message: error?.message, code: error?.code,
        stack: error?.stack?.split('\n').slice(0, 6).join('\n'),
      });
      return res.status(500).json({ error: 'Failed to load portal overview.', detail: error?.message });
    }
  });

  // ── Contractor Portal: Invite a user ──────────────────────────────────────
  app.post('/api/contractors/:companyId/portal-invite', requireAuth, requirePortalFeature, requirePortalAdmin, async (req, res) => {
    try {
      const { companyId } = req.params;
      const customerId = req.customerId!;
      const { email, firstName, lastName, role = 'admin' } = req.body as Record<string, string>;

      if (!email) {
        return res.status(400).json({ error: 'Email address is required.' });
      }

      const db = await customerDbService.getCustomerDatabase(customerId);

      const companies = await db
        .select()
        .from(isolatedSchema.contractorCompanies)
        .where(eq(isolatedSchema.contractorCompanies.id, companyId))
        .limit(1);
      if (!companies[0]) {
        return res.status(404).json({ error: 'Contractor company not found.' });
      }
      const company = companies[0];

      const inviteToken = randomBytes(32).toString('hex');
      const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const existing = await db
        .select()
        .from(isolatedSchema.contractorPortalUsers)
        .where(
          and(
            eq(isolatedSchema.contractorPortalUsers.email, email.toLowerCase().trim()),
            eq(isolatedSchema.contractorPortalUsers.contractorCompanyId, companyId)
          )
        )
        .limit(1);

      const resolvedFirst = firstName?.trim() || company.contactFirstName || '';
      const resolvedLast  = lastName?.trim()  || company.contactLastName  || '';

      if (existing[0]) {
        await db
          .update(isolatedSchema.contractorPortalUsers)
          .set({
            inviteToken,
            inviteExpiresAt,
            invitedAt: new Date(),
            firstName: resolvedFirst || existing[0].firstName,
            lastName: resolvedLast  || existing[0].lastName,
          })
          .where(eq(isolatedSchema.contractorPortalUsers.id, existing[0].id));
      } else {
        await db.insert(isolatedSchema.contractorPortalUsers).values({
          email: email.toLowerCase().trim(),
          contractorCompanyId: companyId,
          firstName: resolvedFirst,
          lastName: resolvedLast,
          role,
          isActive: false,
          inviteToken,
          inviteExpiresAt,
        });
      }

      const portalUrl = buildPortalUrl(req) + `/contractor-portal/accept-invite?token=${inviteToken}&cid=${customerId}`;

      try {
        const emailSvc = new EmailService(customerId);
        await emailSvc.sendEmail({
          to: email,
          subject: `Contractor Portal invitation — ${company.companyName}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
              <h2 style="color:#1e293b">Contractor Portal Invitation</h2>
              <p>Hello${resolvedFirst ? ` ${resolvedFirst}` : ''},</p>
              <p>You have been invited to access the contractor compliance portal for <strong>${company.companyName}</strong>.</p>
              <p>Click the button below to set up your account and start uploading your compliance documents:</p>
              <p style="text-align:center;margin:32px 0">
                <a href="${portalUrl}" style="background:#2563eb;color:white;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">
                  Accept Invitation
                </a>
              </p>
              <p style="color:#64748b;font-size:13px">This invitation expires in 7 days. Your company access code is: <strong>${customerId}</strong></p>
              <p style="color:#64748b;font-size:12px">If you did not expect this email, you can safely ignore it.</p>
            </div>
          `,
          text: `You've been invited to the contractor compliance portal for ${company.companyName}.\n\nAccept your invitation at: ${portalUrl}\n\nYour company access code: ${customerId}\n\nThis link expires in 7 days.`,
        });
      } catch (emailErr: any) {
        logger.warn(`[portal-invite] Email failed for ${email}:`, emailErr.message?.substring(0, 80));
      }

      return res.json({ success: true, message: `Invitation sent to ${email}.`, portalUrl });
    } catch (error: any) {
      logger.error('[portal-admin] portal-invite error', {
        customerId: req.customerId, user: (req.user as any)?.username,
        message: error?.message, code: error?.code,
        stack: error?.stack?.split('\n').slice(0, 6).join('\n'),
      });
      return res.status(500).json({ error: 'Failed to send invitation.', detail: error?.message });
    }
  });

  // ── Contractor Portal: List portal users for a company ────────────────────
  app.get('/api/contractors/:companyId/portal-users', requireAuth, requirePortalFeature, requirePortalAdmin, async (req, res) => {
    try {
      const { companyId } = req.params;
      const customerId = req.customerId!;
      const db = await customerDbService.getCustomerDatabase(customerId);

      const portalUsers = await db
        .select()
        .from(isolatedSchema.contractorPortalUsers)
        .where(eq(isolatedSchema.contractorPortalUsers.contractorCompanyId, companyId))
        .orderBy(desc(isolatedSchema.contractorPortalUsers.invitedAt));

      return res.json(
        portalUsers.map((u: any) => ({
          id: u.id,
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
          role: u.role,
          isActive: u.isActive,
          hasPassword: !!u.passwordHash,
          inviteExpiresAt: u.inviteExpiresAt,
          lastLoginAt: u.lastLoginAt,
          invitedAt: u.invitedAt,
        }))
      );
    } catch (error: any) {
      logger.error('[portal-admin] portal-users list error', {
        customerId: req.customerId, user: (req.user as any)?.username,
        message: error?.message, code: error?.code,
        stack: error?.stack?.split('\n').slice(0, 6).join('\n'),
      });
      return res.status(500).json({ error: 'Failed to load portal users.', detail: error?.message });
    }
  });

  // ── Contractor Portal: Revoke / re-invite a portal user ──────────────────
  app.patch('/api/contractors/portal-users/:userId/revoke', requireAuth, requirePortalFeature, requirePortalAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const customerId = req.customerId!;
      const db = await customerDbService.getCustomerDatabase(customerId);

      const [updated] = await db
        .update(isolatedSchema.contractorPortalUsers)
        .set({ isActive: false, passwordHash: null, inviteToken: null, inviteExpiresAt: null })
        .where(eq(isolatedSchema.contractorPortalUsers.id, userId))
        .returning();

      if (!updated) return res.status(404).json({ error: 'Portal user not found.' });
      return res.json({ success: true });
    } catch (error: any) {
      logger.error('[portal-admin] revoke portal user error', {
        customerId: req.customerId, user: (req.user as any)?.username,
        message: error?.message, code: error?.code,
        stack: error?.stack?.split('\n').slice(0, 6).join('\n'),
      });
      return res.status(500).json({ error: 'Failed to revoke access.', detail: error?.message });
    }
  });

  // ── Contractor Portal: Edit portal user email / name ───────────────────────
  app.patch('/api/contractors/portal-users/:userId/edit', requireAuth, requirePortalFeature, requirePortalAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const customerId = req.customerId!;
      const { email, firstName, lastName } = req.body;
      if (!email?.trim()) return res.status(400).json({ error: 'Email is required.' });
      const db = await customerDbService.getCustomerDatabase(customerId);
      const [updated] = await db
        .update(isolatedSchema.contractorPortalUsers)
        .set({ email: email.trim().toLowerCase(), firstName: firstName?.trim() ?? '', lastName: lastName?.trim() ?? '' })
        .where(eq(isolatedSchema.contractorPortalUsers.id, userId))
        .returning();
      if (!updated) return res.status(404).json({ error: 'Portal user not found.' });
      return res.json({ success: true });
    } catch (error: any) {
      logger.error('[portal-admin] edit portal user error', {
        customerId: req.customerId, user: (req.user as any)?.username,
        message: error?.message, stack: error?.stack?.split('\n').slice(0, 6).join('\n'),
      });
      return res.status(500).json({ error: 'Failed to update portal user.', detail: error?.message });
    }
  });

  // ── Contractor Portal: Resend login details to an active portal user ────────
  app.post('/api/contractors/portal-users/:userId/resend-login', requireAuth, requirePortalFeature, requirePortalAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const customerId = req.customerId!;
      const db = await customerDbService.getCustomerDatabase(customerId);

      const users = await db
        .select()
        .from(isolatedSchema.contractorPortalUsers)
        .where(eq(isolatedSchema.contractorPortalUsers.id, userId))
        .limit(1);

      const user = users[0];
      if (!user) return res.status(404).json({ error: 'Portal user not found.' });
      if (!user.isActive) {
        return res.status(400).json({ error: 'User has not yet accepted their invite. Use Resend Invite instead.' });
      }

      const settings = await db
        .select({ companyName: isolatedSchema.companySettings.companyName })
        .from(isolatedSchema.companySettings)
        .limit(1);
      const siteCompanyName = settings[0]?.companyName ?? 'your client';

      const portalUrl = buildPortalUrl(req) + '/contractor-portal/login';
      const firstName = user.firstName ?? '';

      try {
        const emailSvc = new EmailService(customerId);
        await emailSvc.sendEmail({
          to: user.email,
          subject: `Your Contractor Portal login details — ${siteCompanyName}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
              <h2 style="color:#1e293b">Contractor Portal — Login Details</h2>
              <p>Hello${firstName ? ` ${firstName}` : ''},</p>
              <p>Here are your login details for the <strong>${siteCompanyName}</strong> contractor portal.</p>
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:24px 0">
                <p style="margin:0 0 12px;font-weight:bold;color:#0f172a">Your login details</p>
                <table style="width:100%;border-collapse:collapse">
                  <tr>
                    <td style="padding:6px 0;color:#64748b;font-size:14px;width:140px">Portal URL</td>
                    <td style="padding:6px 0;font-size:14px"><a href="${portalUrl}" style="color:#2563eb">${portalUrl}</a></td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;color:#64748b;font-size:14px">Email (username)</td>
                    <td style="padding:6px 0;font-size:14px;font-weight:bold">${user.email}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;color:#64748b;font-size:14px">Company access code</td>
                    <td style="padding:6px 0;font-size:14px;font-family:monospace;font-weight:bold;background:#f1f5f9;padding:4px 8px;border-radius:4px">${customerId}</td>
                  </tr>
                </table>
              </div>
              <p style="color:#64748b;font-size:13px">Forgotten your password? Use the <strong>Forgot password?</strong> link on the login page to reset it.</p>
            </div>
          `,
          text: `Contractor Portal — Login Details\n\nHello${firstName ? ` ${firstName}` : ''},\n\nYour login details for ${siteCompanyName}:\n  Portal: ${portalUrl}\n  Email: ${user.email}\n  Company access code: ${customerId}\n\nForgotten your password? Use the "Forgot password?" link on the login page.`,
        });
      } catch (emailErr: any) {
        logger.warn('[portal-resend-login] Email failed:', emailErr.message?.substring(0, 80));
        return res.status(500).json({ error: 'Failed to send email.' });
      }

      return res.json({ success: true });
    } catch (error: any) {
      logger.error('[portal-admin] resend-login error', {
        customerId: req.customerId, user: (req.user as any)?.username,
        message: error?.message, code: error?.code,
        stack: error?.stack?.split('\n').slice(0, 6).join('\n'),
      });
      return res.status(500).json({ error: 'Failed to resend login details.', detail: error?.message });
    }
  });

  // ── Contractor Portal: Review a document (approve/reject) ─────────────────
  app.put('/api/contractors/documents/:docId/review', requireAuth, requirePortalFeature, requirePortalAdmin, async (req, res) => {
    try {
      const { docId } = req.params;
      const customerId = req.customerId!;
      const { status, rejectedReason } = req.body as Record<string, string>;

      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Status must be "approved" or "rejected".' });
      }

      const db = await customerDbService.getCustomerDatabase(customerId);
      const reviewerId = (req.user as any)?.email || (req.user as any)?.username || 'admin';

      const [updated] = await db
        .update(isolatedSchema.contractorDocuments)
        .set({
          status,
          approvedBy: reviewerId,
          approvedAt: status === 'approved' ? new Date() : null,
          rejectedReason: status === 'rejected' ? (rejectedReason || 'Document rejected') : null,
          updatedAt: new Date(),
        })
        .where(eq(isolatedSchema.contractorDocuments.id, docId))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'Document not found.' });
      }

      // ── On approval, push the document's expiry date onto the contractor
      //    company record so the Compliance Dashboard actually reflects it.
      //    (The dashboard reads company-level expiry columns, not documents.)
      if (status === 'approved' && (updated as any).companyId) {
        const COMPANY_EXPIRY_COLUMN: Record<string, keyof typeof isolatedSchema.contractorCompanies.$inferInsert> = {
          publicLiability:       'publicLiabilityExpiryDate',
          employersLiability:    'employersLiabilityExpiryDate',
          professionalIndemnity: 'professionalIndemnityExpiryDate',
          healthSafety:          'healthSafetyPolicyExpiryDate',
        };
        const docType = (updated as any).documentType as string | undefined;
        const expiry  = (updated as any).expiryDate as Date | string | null | undefined;
        const column  = docType ? COMPANY_EXPIRY_COLUMN[docType] : undefined;

        // Only company-level docs (no workerId) update the company insurance columns.
        // Worker certs, CIS, RAMS, modern slavery and "other" are intentionally skipped.
        if (column && expiry && !(updated as any).workerId) {
          try {
            await db
              .update(isolatedSchema.contractorCompanies)
              .set({ [column]: new Date(expiry) } as any)
              .where(eq(isolatedSchema.contractorCompanies.id, (updated as any).companyId));
          } catch (syncErr: any) {
            logger.warn('[portal-review] Failed to sync company expiry (non-fatal):', syncErr.message?.substring(0, 80));
          }
        }
      }

      // ── On approval/rejection of a worker document, sync the worker profile
      //    column so the dashboard and profile always read from the same fact.
      //    Supported types: right_to_work, cscs_card, ipaf_card.
      if ((updated as any).workerId) {
        const workerDocType = (updated as any).documentType as string | undefined;
        const workerDocExpiry = (updated as any).expiryDate as Date | string | null | undefined;
        const isExpiredDoc = workerDocExpiry ? new Date(workerDocExpiry) < new Date() : false;

        type WorkerColUpdate = Partial<typeof isolatedSchema.contractorWorkers.$inferInsert>;
        let workerColUpdate: WorkerColUpdate | null = null;
        let syncDescription = '';

        if (workerDocType === 'right_to_work') {
          if (status === 'approved') {
            workerColUpdate = {
              rightToWork: 'valid',
              rightToWorkExpiryDate: workerDocExpiry ? new Date(workerDocExpiry) : null,
            } as WorkerColUpdate;
            syncDescription = `RTW status → valid${workerDocExpiry ? `, expiry ${new Date(workerDocExpiry).toLocaleDateString('en-GB')}` : ''}`;
          } else {
            workerColUpdate = { rightToWork: isExpiredDoc ? 'expired' : 'pending' } as WorkerColUpdate;
            syncDescription = `RTW status → ${isExpiredDoc ? 'expired' : 'pending'} (document rejected)`;
          }
        } else if (workerDocType === 'cscs_card') {
          if (status === 'approved') {
            workerColUpdate = { cscsStatus: 'valid' } as WorkerColUpdate;
            syncDescription = 'CSCS status → valid';
          } else {
            workerColUpdate = { cscsStatus: isExpiredDoc ? 'expired' : 'pending' } as WorkerColUpdate;
            syncDescription = `CSCS status → ${isExpiredDoc ? 'expired' : 'pending'} (document rejected)`;
          }
        } else if (workerDocType === 'ipaf_card') {
          if (status === 'approved') {
            workerColUpdate = { ipafStatus: 'valid' } as WorkerColUpdate;
            syncDescription = 'IPAF status → valid';
          } else {
            workerColUpdate = { ipafStatus: isExpiredDoc ? 'expired' : 'none' } as WorkerColUpdate;
            syncDescription = `IPAF status → ${isExpiredDoc ? 'expired' : 'none'} (document rejected)`;
          }
        }

        if (workerColUpdate) {
          try {
            await db
              .update(isolatedSchema.contractorWorkers)
              .set(workerColUpdate as any)
              .where(eq(isolatedSchema.contractorWorkers.id, (updated as any).workerId));
          } catch (workerSyncErr: any) {
            logger.warn('[portal-review] Failed to sync worker status column (non-fatal):', workerSyncErr.message?.substring(0, 80));
          }
        }
      }

      if (status === 'rejected') {
        try {
          const uploadedBy: string = (updated as any).uploadedBy ?? '';
          const portalUserId = uploadedBy.startsWith('portal:') ? uploadedBy.slice(7) : null;

          let recipientEmail: string | null = null;
          let recipientFirstName = '';

          if (portalUserId) {
            const portalUsers = await db
              .select({ email: isolatedSchema.contractorPortalUsers.email, firstName: isolatedSchema.contractorPortalUsers.firstName })
              .from(isolatedSchema.contractorPortalUsers)
              .where(eq(isolatedSchema.contractorPortalUsers.id, portalUserId))
              .limit(1);
            if (portalUsers[0]) {
              recipientEmail = portalUsers[0].email;
              recipientFirstName = portalUsers[0].firstName ?? '';
            }
          }

          if (!recipientEmail && (updated as any).companyId) {
            const companies = await db
              .select({ email: (isolatedSchema.contractorCompanies as any).email, contactFirstName: isolatedSchema.contractorCompanies.contactFirstName })
              .from(isolatedSchema.contractorCompanies)
              .where(eq(isolatedSchema.contractorCompanies.id, (updated as any).companyId))
              .limit(1);
            if (companies[0]?.email) {
              recipientEmail = companies[0].email;
              recipientFirstName = companies[0].contactFirstName ?? '';
            }
          }

          if (recipientEmail) {
            const docName = (updated as any).documentName ?? 'your document';
            const reason = rejectedReason || 'Document rejected';
            const emailSvc = new EmailService(customerId);
            await emailSvc.sendEmail({
              to: recipientEmail,
              subject: `Document rejected — ${docName}`,
              html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
                  <h2 style="color:#dc2626">Document Rejected</h2>
                  <p>Hello${recipientFirstName ? ` ${recipientFirstName}` : ''},</p>
                  <p>Unfortunately, the following document has been rejected:</p>
                  <p style="font-weight:bold;padding:12px 16px;background:#fef2f2;border-left:4px solid #dc2626;border-radius:4px">${docName}</p>
                  <p><strong>Reason:</strong> ${reason}</p>
                  <p>Please log in to the contractor portal to re-upload the corrected document.</p>
                  <p style="color:#64748b;font-size:13px">If you believe this rejection is in error, please contact the site manager directly.</p>
                </div>
              `,
              text: `Document Rejected\n\nHello${recipientFirstName ? ` ${recipientFirstName}` : ''},\n\nYour document "${docName}" has been rejected.\n\nReason: ${reason}\n\nPlease log in to the contractor portal to re-upload the corrected document.`,
            });
          }
        } catch (emailErr: any) {
          logger.warn('[portal-review] Rejection email failed:', emailErr.message?.substring(0, 80));
        }
      }

      // Write a worker-notes audit entry when the document belongs to a specific worker
      if ((updated as any).workerId) {
        try {
          const docLabel = (updated as any).documentName ?? (updated as any).documentType ?? 'document';
          const syncedTypes: Record<string, string> = { right_to_work: 'RTW', cscs_card: 'CSCS', ipaf_card: 'IPAF' };
          const syncedField = syncedTypes[(updated as any).documentType as string] ?? null;
          const syncSuffix = syncedField
            ? ` ${syncedField} worker profile column synced from this document.`
            : '';
          await db.insert(isolatedSchema.workerNotes).values({
            workerId: (updated as any).workerId,
            changeType: 'document_review',
            oldValue: 'pending',
            newValue: status,
            notes: status === 'rejected'
              ? `Document "${docLabel}" rejected by reviewer (${reviewerId}). Reason: ${rejectedReason || 'No reason given'}.${syncSuffix}`
              : `Document "${docLabel}" approved by reviewer (${reviewerId}).${syncSuffix}`,
            changedBy: reviewerId,
          });
        } catch (noteErr: any) {
          logger.warn('[portal-review] Failed to write worker note (non-fatal):', noteErr.message?.substring(0, 80));
        }
      }

      // Write a company_notes audit entry for company-level documents (no workerId)
      if (!(updated as any).workerId && (updated as any).companyId) {
        try {
          const docLabel = (updated as any).documentName ?? (updated as any).documentType ?? 'document';
          const expiryVal = (updated as any).expiryDate;
          const COMPANY_FRIENDLY: Record<string, string> = {
            publicLiability:       'Public Liability',
            employersLiability:    "Employers' Liability",
            professionalIndemnity: 'Professional Indemnity',
            healthSafety:          'Health & Safety Policy',
          };
          const friendlyType = COMPANY_FRIENDLY[(updated as any).documentType as string] ?? null;
          const syncNote = status === 'approved' && friendlyType && expiryVal
            ? ` Company ${friendlyType} expiry updated to ${new Date(expiryVal).toLocaleDateString('en-GB')}.`
            : '';
          const auditNote = status === 'rejected'
            ? `Document "${docLabel}" rejected by reviewer (${reviewerId}). Reason: ${rejectedReason || 'No reason given'}.`
            : `Document "${docLabel}" approved by reviewer (${reviewerId}).${syncNote}`;
          await db.insert(isolatedSchema.companyNotes).values({
            companyId: (updated as any).companyId,
            changeType: 'document_review',
            notes: auditNote,
            changedBy: reviewerId,
          });
        } catch (noteErr: any) {
          logger.warn('[portal-review] Failed to write company note (non-fatal):', noteErr.message?.substring(0, 80));
        }
      }

      // ── Audit row in contractor_onboarding_audit ──────────────────────────
      try {
        const pool = (db as any).$client ?? (db as any).session?.client;
        const schemaName = customerDbService.generateSchemaName(customerId);
        const docLabel = (updated as any).documentName ?? (updated as any).documentType ?? 'document';
        const auditAction = status === 'approved' ? 'document_approved' : 'document_rejected';
        const auditReason = status === 'rejected'
          ? `${docLabel} — ${rejectedReason || 'No reason given'}`
          : docLabel;
        if (pool) {
          await pool.query(
            `INSERT INTO "${schemaName}".contractor_onboarding_audit (company_id, worker_id, action, actor, reason) VALUES ($1, $2, $3, $4, $5)`,
            [
              (updated as any).companyId ?? null,
              (updated as any).workerId ?? null,
              auditAction,
              reviewerId,
              auditReason,
            ]
          );
        }
      } catch (auditErr: any) {
        logger.warn('[portal-review] Failed to write onboarding audit (non-fatal):', auditErr.message?.substring(0, 80));
      }

      // ── Auto-revert approved company if this review broke compliance ──────
      // Only re-evaluate for company-level documents (no workerId).
      // Worker cert approvals (RTW, CSCS, IPAF) must NOT trigger a company
      // compliance re-check — they are irrelevant to company-level insurance/RAMS
      // and previously caused the company to be auto-reverted to 'attention_needed'
      // any time a worker document was reviewed.
      if ((updated as any).companyId && !(updated as any).workerId) {
        reevaluateCompanyApproval(db, customerId, (updated as any).companyId).catch(() => {});
      }

      return res.json(updated);
    } catch (error: any) {
      logger.error('[portal-admin] document-review error', {
        customerId: req.customerId, user: (req.user as any)?.username,
        message: error?.message, code: error?.code,
        stack: error?.stack?.split('\n').slice(0, 6).join('\n'),
      });
      return res.status(500).json({ error: 'Failed to update document status.', detail: error?.message });
    }
  });

  // ── Contractor Portal: Approve company for site ───────────────────────────
  app.post('/api/contractors/:id/approve-for-site', requireAuth, requirePortalFeature, requirePortalAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const customerId = req.customerId!;
      const actor = (req.user as any)?.email || (req.user as any)?.username || 'admin';
      const { overrideReason } = req.body as { overrideReason?: string };
      const db = await customerDbService.getCustomerDatabase(customerId);
      const pool = (db as any).$client ?? (db as any).session?.client;
      const schemaName = customerDbService.generateSchemaName(customerId);
      if (!pool) {
        logger.error('[portal-admin] approve-for-site: pool unavailable', { customerId, id });
        return res.status(500).json({ error: 'Database connection unavailable.', detail: 'pool_undefined' });
      }

      // Check compliance before approving
      const compliance = await getCompanyComplianceStatus(db, id);
      let auditAction = 'approved_for_site';
      let auditReason: string | null = null;

      if (!compliance.compliant) {
        if (!overrideReason?.trim()) {
          return res.status(400).json({
            error: 'This contractor is not fully compliant. Provide an override reason to approve anyway.',
            missingItems: compliance.reasons,
            requiresOverride: true,
          });
        }
        auditAction = 'approved_for_site_override';
        auditReason = `Override: ${overrideReason.trim()} | Missing: ${compliance.reasons.join('; ')}`;
      }

      await pool.query(
        `UPDATE "${schemaName}".contractor_companies
         SET status = 'approved', onboarding_status = 'approved', onboarding_approved_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [id]
      );
      await pool.query(
        `INSERT INTO "${schemaName}".contractor_onboarding_audit (company_id, action, actor, reason) VALUES ($1, $2, $3, $4)`,
        [id, auditAction, actor, auditReason]
      );

      const companyResult = await pool.query(
        `SELECT company_name, contact_email FROM "${schemaName}".contractor_companies WHERE id = $1`,
        [id]
      );
      const company = companyResult.rows[0];

      if (company?.contact_email) {
        try {
          const emailSvc = new EmailService(customerId);
          const context = simpleDatabaseService.createCustomerContext((req.user as any)!.username, customerId);
          const settings = await simpleDatabaseService.getCompanySettings(context);
          const siteName = (settings as any)?.companyName || 'the site team';
          await emailSvc.sendEmail({
            to: company.contact_email,
            subject: `✅ You're approved to work on site — ${siteName}`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
                <div style="background:#2460A9;padding:16px 24px;border-radius:8px 8px 0 0">
                  <p style="color:white;margin:0;font-size:18px;font-weight:bold">Onboarding Approved</p>
                </div>
                <div style="padding:20px 24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
                  <p>Good news — <strong>${company.company_name}</strong> has been approved to work on site.</p>
                  <p>Your compliance documents have been reviewed and accepted by ${siteName}. You're now cleared to begin work.</p>
                  <p style="color:#64748b;font-size:13px;margin-top:16px">If you have any questions please contact ${siteName} directly.</p>
                </div>
              </div>
            `,
            text: `Your onboarding has been approved. ${company.company_name} is now cleared to work on site (approved by ${siteName}).`,
          });
        } catch (_) { /* non-fatal */ }
      }

      return res.json({ success: true });
    } catch (error: any) {
      logger.error('[portal-admin] approve-for-site error', {
        customerId: req.customerId, user: (req.user as any)?.username,
        message: error?.message, code: error?.code,
        stack: error?.stack?.split('\n').slice(0, 6).join('\n'),
      });
      return res.status(500).json({ error: 'Failed to approve contractor.', detail: error?.message });
    }
  });

  // ── Contractor Portal: Request changes on submitted onboarding ────────────
  app.post('/api/contractors/:id/request-changes', requireAuth, requirePortalFeature, requirePortalAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body as { reason: string };
      if (!reason?.trim()) return res.status(400).json({ error: 'Reason is required.' });
      const customerId = req.customerId!;
      const actor = (req.user as any)?.email || (req.user as any)?.username || 'admin';
      const db = await customerDbService.getCustomerDatabase(customerId);
      const pool = (db as any).$client ?? (db as any).session?.client;
      const schemaName = customerDbService.generateSchemaName(customerId);
      if (!pool) {
        logger.error('[portal-admin] request-changes: pool unavailable', { customerId, id });
        return res.status(500).json({ error: 'Database connection unavailable.', detail: 'pool_undefined' });
      }

      await pool.query(
        `UPDATE "${schemaName}".contractor_companies SET onboarding_status = 'changes_requested', updated_at = NOW() WHERE id = $1`,
        [id]
      );
      await pool.query(
        `INSERT INTO "${schemaName}".contractor_onboarding_audit (company_id, action, actor, reason) VALUES ($1, 'changes_requested', $2, $3)`,
        [id, actor, reason.trim()]
      );

      const companyResult = await pool.query(
        `SELECT company_name, contact_email FROM "${schemaName}".contractor_companies WHERE id = $1`,
        [id]
      );
      const company = companyResult.rows[0];

      if (company?.contact_email) {
        try {
          const emailSvc = new EmailService(customerId);
          const portalBase = buildPortalUrl(req);
          await emailSvc.sendEmail({
            to: company.contact_email,
            subject: `Action required — changes requested for your onboarding`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
                <div style="background:#2460A9;padding:16px 24px;border-radius:8px 8px 0 0">
                  <p style="color:white;margin:0;font-size:18px;font-weight:bold">Changes Requested</p>
                </div>
                <div style="padding:20px 24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
                  <p>The site team has reviewed your onboarding submission and has requested some changes.</p>
                  <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:6px;padding:12px 16px;margin:16px 0">
                    <p style="margin:0;font-weight:600;color:#92400e">Reason:</p>
                    <p style="margin:4px 0 0;color:#78350f">${reason.trim()}</p>
                  </div>
                  <p>Please log in to the portal, address the issues, and re-submit for review.</p>
                  <a href="${portalBase}/contractor-portal/dashboard" style="display:inline-block;background:#2460A9;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;margin-top:8px">Go to Portal →</a>
                </div>
              </div>
            `,
            text: `Changes requested for your onboarding.\n\nReason: ${reason.trim()}\n\nPlease log in to the portal and re-submit once changes are made.\n\n${portalBase}/contractor-portal/dashboard`,
          });
        } catch (_) { /* non-fatal */ }
      }

      return res.json({ success: true });
    } catch (error: any) {
      logger.error('[portal-admin] request-changes error', {
        customerId: req.customerId, user: (req.user as any)?.username,
        message: error?.message, code: error?.code,
        stack: error?.stack?.split('\n').slice(0, 6).join('\n'),
      });
      return res.status(500).json({ error: 'Failed to request changes.', detail: error?.message });
    }
  });

  // ── Contractor Portal: List pending documents for admin review ────────────
  // ── Worker readiness — single source of truth, same helper as kiosk ─────────
  app.get('/api/contractors/workers/:workerId/readiness', requireAuth, async (req, res) => {
    try {
      const { workerId } = req.params;
      const customerId = req.customerId!;
      const db = await customerDbService.getCustomerDatabase(customerId);
      const readiness = await getWorkerClearanceStatus(db, workerId, customerId);
      return res.json(readiness);
    } catch (err: any) {
      logger.error('Error getting worker readiness:', err);
      return res.status(500).json({ error: 'Failed to get worker readiness.' });
    }
  });

  app.get('/api/contractors/:companyId/portal-documents', requireAuth, requirePortalFeature, requirePortalAdmin, async (req, res) => {
    try {
      const { companyId } = req.params;
      const customerId = req.customerId!;
      const db = await customerDbService.getCustomerDatabase(customerId);

      const docs = await db
        .select()
        .from(isolatedSchema.contractorDocuments)
        .where(
          and(
            eq(isolatedSchema.contractorDocuments.companyId, companyId),
            eq(isolatedSchema.contractorDocuments.isActive, true)
          )
        )
        .orderBy(desc(isolatedSchema.contractorDocuments.uploadedAt));

      return res.json(docs);
    } catch (error: any) {
      logger.error('Error listing portal documents:', error);
      return res.status(500).json({ error: 'Failed to load portal documents.' });
    }
  });

  // ── Induction Validity — list workers with expiring/expired inductions ────
  app.get('/api/contractors/workers/expiring-inductions', requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const custDb = await customerDbService.getCustomerDatabase(customerId);
      const schemaName = customerDbService.generateSchemaName(customerId);
      const pool = (custDb as any).$client ?? (custDb as any).session?.client;

      const [settingsRow] = await custDb
        .select({
          inductionValidityPeriod: isolatedSchema.companySettings.inductionValidityPeriod,
          inductionExpiryReminderDays: isolatedSchema.companySettings.inductionExpiryReminderDays,
        })
        .from(isolatedSchema.companySettings)
        .limit(1);

      const period = settingsRow?.inductionValidityPeriod ?? 'none';
      if (period === 'none') return res.json({ workers: [], validityPeriod: 'none' });

      const reminderDays = parseInt(settingsRow?.inductionExpiryReminderDays ?? '30', 10) || 30;
      const now = new Date();
      const windowEnd = new Date(now.getTime() + reminderDays * 86400000);

      const { rows } = await pool.query(`
        SELECT cw.id, cw.first_name, cw.last_name, cw.email,
               cw.site_induction_completed, cw.site_induction_completed_at,
               cw.site_induction_expiry_date, cw.is_active,
               cc.company_name
        FROM "${schemaName}".contractor_workers cw
        LEFT JOIN "${schemaName}".contractor_companies cc ON cc.id = cw.company_id
        WHERE cw.is_active = TRUE
          AND cw.site_induction_completed = TRUE
          AND cw.site_induction_expiry_date IS NOT NULL
          AND cw.site_induction_expiry_date <= $1
        ORDER BY cw.site_induction_expiry_date ASC
      `, [windowEnd]);

      const workers = rows.map((w: any) => {
        const expiryDate = w.site_induction_expiry_date ? new Date(w.site_induction_expiry_date) : null;
        const daysUntilExpiry = expiryDate ? Math.ceil((expiryDate.getTime() - now.getTime()) / 86400000) : null;
        return {
          id: w.id,
          firstName: w.first_name,
          lastName: w.last_name,
          email: w.email,
          companyName: w.company_name,
          inductionCompletedAt: w.site_induction_completed_at,
          inductionExpiryDate: expiryDate,
          daysUntilExpiry,
          isExpired: daysUntilExpiry !== null && daysUntilExpiry < 0,
          isExpiringSoon: daysUntilExpiry !== null && daysUntilExpiry >= 0 && daysUntilExpiry <= reminderDays,
        };
      });

      return res.json({ workers, validityPeriod: period, reminderDays });
    } catch (error: any) {
      logger.error('Error fetching expiring inductions:', error);
      return res.status(500).json({ error: 'Failed to fetch expiring inductions.' });
    }
  });

  // ── Induction Validity — recalculate expiry dates for all inducted workers ──
  app.post('/api/contractors/settings/recalculate-induction-expiry', requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== 'admin') return res.status(403).json({ error: 'Administrator access required' });

      const customerId = req.customerId!;
      const custDb = await customerDbService.getCustomerDatabase(customerId);
      const schemaName = customerDbService.generateSchemaName(customerId);
      const pool = (custDb as any).$client ?? (custDb as any).session?.client;

      const [settingsRow] = await custDb
        .select({ inductionValidityPeriod: isolatedSchema.companySettings.inductionValidityPeriod })
        .from(isolatedSchema.companySettings)
        .limit(1);

      const period = settingsRow?.inductionValidityPeriod ?? 'none';
      if (period === 'none') {
        await pool.query(`UPDATE "${schemaName}".contractor_workers SET site_induction_expiry_date = NULL WHERE site_induction_completed = TRUE`);
        return res.json({ updated: 0, message: 'Expiry cleared (validity set to none)' });
      }

      const monthsMap: Record<string, number> = { '6_months': 6, '1_year': 12, '2_years': 24 };
      const months = monthsMap[period] ?? 12;

      const { rowCount } = await pool.query(`
        UPDATE "${schemaName}".contractor_workers
        SET site_induction_expiry_date = site_induction_completed_at + INTERVAL '${months} months'
        WHERE site_induction_completed = TRUE
          AND site_induction_completed_at IS NOT NULL
      `);

      logger.info(`[induction-expiry] Recalculated expiry for ${rowCount} workers in schema ${schemaName} (period: ${period})`);
      return res.json({ updated: rowCount ?? 0, period, message: `Updated ${rowCount ?? 0} workers` });
    } catch (error: any) {
      logger.error('Error recalculating induction expiry:', error);
      return res.status(500).json({ error: 'Failed to recalculate induction expiry.' });
    }
  });

  // ── Nightly induction expiry email check (runs at startup then every 24 h) ──
  (async function scheduleInductionExpiryEmails() {
    async function runCheck() {
      try {
        const customersResult = await db.execute(sql`SELECT id, schema_name FROM customers WHERE is_active = TRUE`);
        const customers = (customersResult.rows ?? (customersResult as any)) as Array<{ id: string; schema_name: string }>;
        for (const customer of customers) {
          try {
            const schemaName = customer.schema_name || customerDbService.generateSchemaName(customer.id);
            const custDb = await customerDbService.getCustomerDatabase(customer.id);
            const pool = (custDb as any).$client ?? (custDb as any).session?.client;

            const { rows: sRows } = await pool.query(
              `SELECT email, company_name, induction_validity_period, induction_expiry_reminder_days
               FROM "${schemaName}".company_settings LIMIT 1`
            );
            const s = sRows[0];
            if (!s || !s.email || !s.induction_validity_period || s.induction_validity_period === 'none') continue;

            const reminderDays = parseInt(s.induction_expiry_reminder_days ?? '30', 10) || 30;
            const windowEnd = new Date(Date.now() + reminderDays * 86400000);

            const { rows: workers } = await pool.query(`
              SELECT cw.first_name, cw.last_name, cw.site_induction_expiry_date,
                     cc.company_name AS contractor_company,
                     cw.induction_expiry_alerted_at
              FROM "${schemaName}".contractor_workers cw
              LEFT JOIN "${schemaName}".contractor_companies cc ON cc.id = cw.company_id
              WHERE cw.is_active = TRUE
                AND cw.site_induction_completed = TRUE
                AND cw.site_induction_expiry_date IS NOT NULL
                AND cw.site_induction_expiry_date <= $1
                AND (cw.induction_expiry_alerted_at IS NULL
                     OR cw.induction_expiry_alerted_at < NOW() - INTERVAL '25 days')
            `, [windowEnd]);

            if (!workers.length) continue;

            const emailSvc = new EmailService(customer.id);
            const companyName = s.company_name || 'TPR Max';
            const now = new Date();
            const rows = workers.map((w: any) => {
              const expiry = new Date(w.site_induction_expiry_date);
              const days = Math.ceil((expiry.getTime() - now.getTime()) / 86400000);
              const status = days < 0 ? `<strong style="color:#dc2626">EXPIRED ${Math.abs(days)} days ago</strong>` : `Expires in ${days} days`;
              return `<tr><td style="padding:8px;border:1px solid #e5e7eb">${w.first_name} ${w.last_name}</td><td style="padding:8px;border:1px solid #e5e7eb">${w.contractor_company || '—'}</td><td style="padding:8px;border:1px solid #e5e7eb">${expiry.toLocaleDateString('en-GB')}</td><td style="padding:8px;border:1px solid #e5e7eb">${status}</td></tr>`;
            }).join('');

            await emailSvc.sendEmail({
              to: s.email,
              subject: `Site Induction Expiry Alert — ${workers.length} worker${workers.length > 1 ? 's' : ''} need re-induction`,
              companyName,
              html: `<div style="font-family:Arial,sans-serif;max-width:660px;margin:0 auto">
                <div style="background:#2563eb;color:#fff;padding:20px;border-radius:8px 8px 0 0">
                  <h2 style="margin:0">Site Induction Expiry Alert — ${companyName}</h2>
                </div>
                <div style="background:#fff;padding:20px;border:1px solid #e5e7eb">
                  <p style="margin-top:0">The following contractor workers have inductions that are expiring or have already expired. Please arrange re-induction before they return to site.</p>
                  <table style="width:100%;border-collapse:collapse;margin:16px 0">
                    <thead><tr style="background:#f9fafb">
                      <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">Worker</th>
                      <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">Company</th>
                      <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">Expiry Date</th>
                      <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">Status</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                  </table>
                  <p style="color:#6b7280;font-size:13px">Visit the Compliance Dashboard in TPR Max to see all active compliance gaps. Workers cannot be re-inducted until they complete the site induction process again.</p>
                </div>
              </div>`,
            });

            // Stamp alerted_at to prevent duplicate emails (add column if not there)
            try {
              await pool.query(`ALTER TABLE "${schemaName}".contractor_workers ADD COLUMN IF NOT EXISTS induction_expiry_alerted_at TIMESTAMPTZ`);
              const ids = workers.map((_: any, i: number) => `$${i + 1}`).join(',');
              const workerNames = workers.map((w: any) => `${w.first_name} ${w.last_name}`);
              await pool.query(`UPDATE "${schemaName}".contractor_workers SET induction_expiry_alerted_at = NOW() WHERE CONCAT(first_name, ' ', last_name) = ANY(ARRAY[${ids}])`, workerNames);
            } catch (_) { /* non-fatal */ }

            logger.info(`[induction-expiry] Sent expiry alert to ${s.email} for ${workers.length} workers (customer: ${customer.id})`);
          } catch (custErr: any) {
            logger.warn(`[induction-expiry] Customer ${customer.id} check failed (non-fatal):`, custErr.message);
          }
        }
      } catch (err: any) {
        logger.warn('[induction-expiry] Nightly check error (non-fatal):', err.message);
      }
    }

    // Run once after 2 minutes (server startup grace), then every 24 hours
    setTimeout(() => {
      runCheck();
      setInterval(runCheck, 24 * 60 * 60 * 1000);
    }, 2 * 60 * 1000);
  })();
}
