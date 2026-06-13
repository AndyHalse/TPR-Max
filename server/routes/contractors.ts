import type { Express } from 'express';
import { handleContractorWorkerUpdate } from './induction';
import { requireAuth, isDevDataBypass, isDatabaseConnectionError, getMockCheckedInContractors } from '../auth';
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
  like,
} from 'drizzle-orm';
import { logger } from '../utils/logger';

// ─── Module-scope helpers ────────────────────────────────────────────────────

  function calculateDuration(start: Date, end: Date): string {
    const diff = end.getTime() - start.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

const docRequestUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

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
        await databaseService.updateContractorWorker(context, id, { qrCode } as any);
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


  // Contractor Pre-booking endpoints
  app.get("/api/contractors/prebookings", requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const customerDb = await customerDbService.getCustomerDatabase(context.customerId);
      const preBookings = await customerDb.select().from(isolatedSchema.contractorPreBookings);
      res.json(preBookings);
    } catch (error) {
      logger.error("Error fetching contractor pre-bookings:", error);
      res.status(500).json({ error: "Failed to fetch contractor pre-bookings" });
    }
  });

  app.get("/api/contractors/prebookings/upcoming", requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const customerDb = await customerDbService.getCustomerDatabase(context.customerId);
      const now = new Date();
      const preBookings = await customerDb.select().from(isolatedSchema.contractorPreBookings)
        .where(and(
          gte(isolatedSchema.contractorPreBookings.scheduledDate, now),
          ne(isolatedSchema.contractorPreBookings.status, 'cancelled')
        ));
      res.json(preBookings);
    } catch (error) {
      logger.error("Error fetching upcoming contractor pre-bookings:", error);
      res.status(500).json({ error: "Failed to fetch upcoming contractor pre-bookings" });
    }
  });

  app.get("/api/contractors/prebookings/today", requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const customerDb = await customerDbService.getCustomerDatabase(context.customerId);
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
      const preBookings = await customerDb.select().from(isolatedSchema.contractorPreBookings)
        .where(and(
          gte(isolatedSchema.contractorPreBookings.scheduledDate, startOfDay),
          sql`${isolatedSchema.contractorPreBookings.scheduledDate} <= ${endOfDay}`
        ));
      res.json(preBookings);
    } catch (error) {
      logger.error("Error fetching today's contractor pre-bookings:", error);
      res.status(500).json({ error: "Failed to fetch today's contractor pre-bookings" });
    }
  });

  app.get("/api/contractors/prebookings/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const customerDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [preBooking] = await customerDb.select().from(isolatedSchema.contractorPreBookings)
        .where(eq(isolatedSchema.contractorPreBookings.id, id));
      
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
      const customerDb = await customerDbService.getCustomerDatabase(context.customerId);
      const parsedScheduledDate = new Date(req.body.scheduledDate);
      if (!req.body.scheduledDate || isNaN(parsedScheduledDate.getTime())) {
        return res.status(400).json({ error: "Pre-booking scheduled date is invalid." });
      }
      const preBookingData = {
        ...req.body,
        scheduledDate: parsedScheduledDate
      };
      
      // Duplicate prevention: check for existing ACTIVE booking with same worker, company, date, and time
      const existingBookings = await customerDb.select().from(isolatedSchema.contractorPreBookings);
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
        .values({ ...preBookingData, qrCode })
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
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const customerDb = await customerDbService.getCustomerDatabase(context.customerId);
      const updates = {
        ...req.body,
        scheduledDate: req.body.scheduledDate ? new Date(req.body.scheduledDate) : undefined,
        updatedAt: new Date()
      };
      
      const [updatedPreBooking] = await customerDb.update(isolatedSchema.contractorPreBookings)
        .set(updates)
        .where(eq(isolatedSchema.contractorPreBookings.id, id))
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
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const customerDb = await customerDbService.getCustomerDatabase(context.customerId);
      
      const [deleted] = await customerDb.delete(isolatedSchema.contractorPreBookings)
        .where(eq(isolatedSchema.contractorPreBookings.id, id))
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
      const customerDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [preBooking] = await customerDb.select().from(isolatedSchema.contractorPreBookings)
        .where(eq(isolatedSchema.contractorPreBookings.qrCode, qrCode));
      
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
        
        const [newWorker] = await customerDb.insert(isolatedSchema.contractorWorkers)
          .values({
            id: workerId,
            companyId: company.id,
            firstName,
            lastName,
            email: preBooking.workerEmail,
            phone: preBooking.contactPhone,
            rightToWork: 'pending',
            isActive: true,
            inductionCompleted: false,
            safetyRating: 'N/A'
          })
          .returning();
        worker = newWorker;
      }
      
      // Check worker status — align with regular check-in blocking rules
      const inductionCompleted = worker.inductionCompleted ?? false;
      const rightToWorkStatus = worker.rightToWork ?? 'pending';
      const blockingIssues = [];
      const warnings = [];

      if (!worker.isActive) {
        blockingIssues.push("Worker account is inactive");
      }
      if (worker.currentCardStatus === 'red') {
        blockingIssues.push("Worker has active Red Card (site ban)");
      }
      // Block if induction not completed (matches regular check-in)
      if (!inductionCompleted) {
        blockingIssues.push("Site induction not completed");
      }
      // Block if right-to-work expired; warn for pending (pre-booking leniency)
      if (rightToWorkStatus === 'expired') {
        blockingIssues.push("Right to work has expired");
      } else if (rightToWorkStatus !== 'valid') {
        warnings.push(`Right to work not verified (status: ${rightToWorkStatus})`);
      }

      if (blockingIssues.length > 0) {
        return res.status(400).json({ 
          error: `Cannot check in: ${blockingIssues.join(' · ')}`,
          issues: blockingIssues
        });
      }
      
      // Check if worker is already checked in
      if (worker.isCheckedIn) {
        return res.status(400).json({ error: "Worker is already checked in" });
      }
      
      // Update pre-booking status
      await customerDb.update(isolatedSchema.contractorPreBookings)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(eq(isolatedSchema.contractorPreBookings.id, preBooking.id));
      
      // Update worker check-in status in customer database (do NOT overwrite qrCode — CPB- belongs to the visit, not the worker)
      await customerDb.update(isolatedSchema.contractorWorkers)
        .set({
          isCheckedIn: true,
          checkedInAt: new Date()
        })
        .where(eq(isolatedSchema.contractorWorkers.id, worker.id));
      
      // Create contractor visit record in customer database
      const visitId = randomUUID();
      const [visit] = await customerDb.insert(isolatedSchema.contractorVisits)
        .values({
          id: visitId,
          workerId: worker.id,
          companyId: company.id,
          purpose: preBooking.purpose,
          hsRulesAccepted: true,
          hsRulesAcceptedAt: new Date(),
          qrCode: qrCode,
          checkedInAt: new Date()
        })
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
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Get all contractors using customer-isolated database service
      const contractors = await databaseService.getAllContractorCompanies(context);
      
      // Add worker counts, document status, and dynamic safety ratings for each contractor
      const contractorsWithStats = await Promise.all(contractors.map(async (contractor) => {
        const workers = await databaseService.getWorkersByCompanyId(context, contractor.id);
        const docsDb = await customerDbService.getCustomerDatabase(context.customerId);
        const documents = await docsDb.select().from(isolatedSchema.contractorDocuments)
          .where(eq(isolatedSchema.contractorDocuments.companyId, contractor.id));
        
        const docTypes = ['publicLiability', 'employersLiability', 'healthSafety', 'cisRegistration', 'rams', 'modernSlavery', 'environmentalPolicy', 'professionalIndemnity'];
        const documentsStatus = docTypes.reduce((acc, type) => {
          const doc = documents.find(d => d.documentType === type);
          if (!doc) {
            acc[type] = 'missing';
          } else if (doc.expiryDate && new Date(doc.expiryDate) < new Date()) {
            acc[type] = 'expired';
          } else {
            acc[type] = 'valid';
          }
          return acc;
        }, {} as Record<string, string>);
        
        // Use existing compliance score without AI calculation for performance
        const safetyRating = contractor.complianceScore || "A+";
        
        return {
          ...contractor,
          workersCount: workers.length,
          documentsStatus,
          complianceScore: safetyRating,
          lastUpdated: new Date().toISOString() // Force cache refresh
        };
      }));
      
      res.json(contractorsWithStats);
    } catch (error) {
      logger.error("Error fetching contractors:", error);
      res.status(500).json({ error: "Failed to fetch contractors" });
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
        .where(eq(isolatedSchema.contractorDocuments.companyId, id));
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
      // Use customer database service with proper isolation
      const context = simpleDatabaseService.createCustomerContext(req.user?.username || 'system', req.customerId);
      
      // Override issuedBy with the actual authenticated user ID to ensure FK constraint is met
      const cardData = { ...req.body, issuedBy: req.user?.id || req.body.issuedBy };
      logger.info(`Card issue - session user ID: ${req.user?.id}, body issuedBy: ${req.body.issuedBy}`);
      const issue = await databaseService.createCardIssue(context, cardData);
      
      logger.info(`Card issue created successfully for customer ${context.customerId}:`, issue);

      // Write audit note synchronously
      try {
        const noteDb = await customerDbService.getCustomerDatabase(context.customerId);
        const { workerId: ciWorkerId, offenceId: ciOffenceId, cardType: ciCardType, description: ciDesc, location: ciLoc, witness: ciWit } = req.body;
        const ciCardLabel = ciCardType === 'red' ? '🔴 Red' : '🟡 Yellow';
        // Look up offence name if offenceId provided
        let ciOffenceName: string | null = null;
        if (ciOffenceId) {
          try {
            const [offence] = await noteDb.select({ offence: isolatedSchema.cardOffences.offence })
              .from(isolatedSchema.cardOffences)
              .where(eq(isolatedSchema.cardOffences.id, ciOffenceId))
              .limit(1);
            if (offence) ciOffenceName = offence.offence;
          } catch (_) {}
        }
        const ciNoteText = [
          `${ciCardLabel} card issued by ${req.user!.username}.`,
          ciOffenceName ? `Offence: ${ciOffenceName}` : null,
          ciDesc ? `Description: ${ciDesc}` : null,
          ciLoc ? `Location: ${ciLoc}` : null,
          ciWit ? `Witness: ${ciWit}` : null,
        ].filter(Boolean).join(' ');
        await noteDb.insert(isolatedSchema.workerNotes).values({
          workerId: ciWorkerId,
          changeType: 'card_issued',
          oldValue: 'clear',
          newValue: ciCardType,
          notes: ciNoteText,
          changedBy: req.user!.username,
        });
      } catch (noteErr) {
        logger.error('Failed to write card-issue audit note (non-blocking):', noteErr);
      }

      // Send email notification (async - don't block the response)
      (async () => {
        try {
          const { workerId, offenceId, cardType, description, location, witness, issuedBy, contractorId } = req.body;
          
          // Get worker details
          const customerDb = await customerDbService.getCustomerDatabase(context.customerId);
          const [worker] = await customerDb
            .select()
            .from(isolatedSchema.contractorWorkers)
            .where(eq(isolatedSchema.contractorWorkers.id, workerId));
          
          if (!worker) {
            logger.info(`Card issue email skipped - worker not found: ${workerId}`);
            return;
          }
          
          // Get offence details
          const [offence] = await customerDb
            .select()
            .from(isolatedSchema.cardOffences)
            .where(eq(isolatedSchema.cardOffences.id, offenceId));
          
          // Get contractor company details
          const [contractorCompany] = await customerDb
            .select()
            .from(isolatedSchema.contractorCompanies)
            .where(eq(isolatedSchema.contractorCompanies.id, worker.companyId || contractorId));
          
          // Get company settings for branding
          const [companySettings] = await customerDb
            .select()
            .from(isolatedSchema.companySettings)
            .limit(1);
          
          // Get issuer name
          let issuedByName = 'Site Management';
          if (issuedBy) {
            const [issuer] = await customerDb
              .select()
              .from(isolatedSchema.users)
              .where(eq(isolatedSchema.users.id, issuedBy));
            if (issuer) {
              issuedByName = issuer.username || 'Site Management';
            }
          }
          
          // Count previous yellow cards for this worker
          const previousCards = await customerDb
            .select()
            .from(isolatedSchema.cardIssues)
            .where(eq(isolatedSchema.cardIssues.workerId, workerId));
          const previousYellowCards = previousCards.filter(c => c.cardType === 'yellow' && c.id !== issue.id).length;
          
          // Send the notification email
          const workerEmail = worker.workerEmail || worker.email;
          if (!workerEmail) {
            logger.info(`Card issue email skipped - no email for worker: ID ${worker.id}`);
            return;
          }
          
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
            companySettings
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
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Add customerId to request body before validation
      const requestDataWithCustomerId = {
        ...req.body,
        customerId: context.customerId
      };
      
      // DEBUG: Log the request body to see what's actually being sent
      
      // Parse and validate contractor data
      const contractorData = insertContractorCompanySchema.parse(requestDataWithCustomerId);
      
      // Map shared schema format to isolated schema format
      const mappedContractorData = {
        ...contractorData,
        companyName: contractorData.name, // Map name to companyName for isolated schema
        contactEmail: contractorData.email, // Map email to contactEmail for isolated schema
        contactPhone: contractorData.phone, // Map phone to contactPhone for isolated schema
      };
      // Remove the original fields since isolated schema uses different field names
      delete mappedContractorData.name;
      delete mappedContractorData.email;
      delete mappedContractorData.phone;
      
      // Use customer-isolated database service
      const contractor = await databaseService.createContractorCompany(context, mappedContractorData);

      // Audit trail — company created
      try {
        const auditDb = await customerDbService.getCustomerDatabase(context.customerId);
        const auditTs = new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' });
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
        const auditTs = new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' });
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
        await databaseService.updateContractorWorker(context, workerId, { postcode });
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
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);

      const body = req.body;

      // Mandatory field validation — reject blank required fields
      if (!body.firstName || !String(body.firstName).trim()) {
        return res.status(400).json({ error: 'First name is required.' });
      }
      if (!body.lastName || !String(body.lastName).trim()) {
        return res.status(400).json({ error: 'Last name is required.' });
      }
      if (!body.email || !String(body.email).trim()) {
        return res.status(400).json({ error: 'Email address is required.' });
      }
      const rawPhone = body.phoneNumber || body.phone;
      if (!rawPhone || !String(rawPhone).trim()) {
        return res.status(400).json({ error: 'Phone number is required.' });
      }
      
      // Generate H&S acceptance token for new worker
      const hsToken = randomBytes(16).toString('hex');
      
      const workerData = insertContractorWorkerSchema.parse({
        ...body,
        companyId,
        // Map frontend 'phone' field to DB column 'phoneNumber'
        phoneNumber: body.phoneNumber || body.phone || undefined,
        hsRulesAcceptanceToken: hsToken,
        siteInductionCompleted: body.inductionCompleted !== undefined 
          ? Boolean(body.inductionCompleted) 
          : false,
        asbestosAwareness: body.asbestosAwareness !== undefined ? Boolean(body.asbestosAwareness) : false,
        manualHandling: body.manualHandling !== undefined ? Boolean(body.manualHandling) : false,
        workingAtHeight: body.workingAtHeight !== undefined ? Boolean(body.workingAtHeight) : false,
      });
      
      // Use customer-isolated database service instead of old storage
      const worker = await databaseService.createContractorWorker(context, workerData);
      
      logger.info(`Created contractor worker: ID ${workerData.id} (ID: ${worker.id}) for customer ${context.customerId}`);

      // Audit trail — worker created with full step-by-step detail
      try {
        const auditDb = await customerDbService.getCustomerDatabase(context.customerId);
        const auditTs = new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' });

        // Step 1 — Personal details
        const transportLabels: Record<string, string> = {
          car_diesel: 'Car (diesel)', car_petrol: 'Car (petrol)', electric_car: 'Electric car',
          public_transport: 'Public transport', motorcycle: 'Motorcycle',
        };
        await auditDb.insert(isolatedSchema.workerNotes).values({
          workerId: worker.id,
          changeType: 'worker_created',
          notes: `Worker profile created by ${username} on ${auditTs}. Personal details recorded — Name: ${workerData.firstName} ${workerData.lastName}, Email: ${workerData.email || '—'}, Phone: ${workerData.phoneNumber || '—'}, Postcode: ${(body.postcode) || '—'}, Transport: ${transportLabels[body.transportMethod] || body.transportMethod || '—'}.`,
          changedBy: username,
        });

        // Step 2 — Compliance (RTW, CSCS, IPAF)
        const rtwLabel: Record<string, string> = { valid: 'Valid ✅', pending: 'Pending ⏳', expired: 'Expired ❌', not_required: 'Not required' };
        const cardLabel: Record<string, string> = { valid: 'Valid ✅', pending: 'Pending ⏳', expired: 'Expired ❌', none: 'Not held' };
        const rtwExpiry = workerData.rightToWorkExpiryDate ? ` (expiry: ${new Date(workerData.rightToWorkExpiryDate).toLocaleDateString('en-GB')})` : '';
        await auditDb.insert(isolatedSchema.workerNotes).values({
          workerId: worker.id,
          changeType: 'compliance_recorded',
          notes: `Compliance data recorded by ${username} on ${auditTs}. Right to Work: ${rtwLabel[workerData.rightToWork || ''] || workerData.rightToWork || '—'}${rtwExpiry}. CSCS: ${cardLabel[workerData.cscsStatus || ''] || workerData.cscsStatus || '—'}${workerData.cscsCard ? ` (card no. ${workerData.cscsCard})` : ''}. IPAF: ${cardLabel[workerData.ipafStatus || ''] || workerData.ipafStatus || '—'}.`,
          changedBy: username,
        });

        // Step 3 — Training certs + induction
        const certs: string[] = [];
        if (workerData.asbestosAwareness) certs.push('Asbestos Awareness');
        if (workerData.manualHandling) certs.push('Manual Handling');
        if (workerData.workingAtHeight) certs.push('Working at Height');
        await auditDb.insert(isolatedSchema.workerNotes).values({
          workerId: worker.id,
          changeType: 'training_recorded',
          notes: `Training data recorded by ${username} on ${auditTs}. Certificates declared: ${certs.length > 0 ? certs.join(', ') : 'None'}. Site induction: ${workerData.siteInductionCompleted ? `Completed (confirmed by ${username})` : 'Not yet completed'}.`,
          changedBy: username,
        });

        // Also log on the company audit trail
        await auditDb.insert(isolatedSchema.companyNotes).values({
          companyId: companyId,
          changeType: 'worker_added',
          notes: `Worker "${workerData.firstName} ${workerData.lastName}" added by ${username} on ${auditTs}`,
          changedBy: username,
        });

        // If induction was marked complete at creation, add a dedicated induction note
        if (workerData.siteInductionCompleted) {
          await auditDb.insert(isolatedSchema.workerNotes).values({
            workerId: worker.id,
            changeType: 'induction_confirmed',
            notes: `Site induction confirmed by ${username} on ${auditTs}`,
            changedBy: username,
          });
        }
      } catch (auditErr) {
        logger.error('Failed to create worker audit note (continuing):', auditErr);
      }

      res.json(worker);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid worker data", details: error.errors });
      } else {
        logger.error("Error creating worker:", error);
        res.status(500).json({ error: "Failed to create worker" });
      }
    }
  });

  app.put("/api/workers/:id", requireAuth, handleContractorWorkerUpdate);

  // Archive a worker (soft-delete) — admin/manager only
  app.post("/api/contractors/workers/:id/archive", requireAuth, async (req, res) => {
    try {
      const role = req.user!.role;
      if (!['admin', 'manager'].includes(role)) {
        return res.status(403).json({ error: "Only admins and managers can archive workers." });
      }
      const workerId = req.params.id;
      const { reason } = req.body;
      const username = req.user!.username;
      const archCtx = simpleDatabaseService.createCustomerContext(username, req.customerId);
      const archDb = await customerDbService.getCustomerDatabase(archCtx.customerId);

      // Ensure archive columns exist (lazy migration)
      try {
        const schemaName = customerDbService.generateSchemaName(archCtx.customerId);
        const pool = (archDb as any).$client ?? (archDb as any).session?.client;
        await pool.query(`ALTER TABLE "${schemaName}".contractor_workers ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`);
        await pool.query(`ALTER TABLE "${schemaName}".contractor_workers ADD COLUMN IF NOT EXISTS archived_by TEXT`);
        await pool.query(`ALTER TABLE "${schemaName}".contractor_workers ADD COLUMN IF NOT EXISTS archive_reason TEXT`);
      } catch (migErr) {
        logger.warn('Archive migration warning (non-fatal):', migErr);
      }

      // Load worker
      const [worker] = await archDb.select().from(isolatedSchema.contractorWorkers)
        .where(eq(isolatedSchema.contractorWorkers.id, workerId)).limit(1);
      if (!worker) return res.status(404).json({ error: "Worker not found" });
      if (!worker.isActive) return res.status(400).json({ error: "Worker is already archived." });

      // Soft-delete
      await archDb.execute(sql`
        UPDATE contractor_workers
        SET is_active = false,
            archived_at = NOW(),
            archived_by = ${username},
            archive_reason = ${reason || null},
            updated_at = NOW()
        WHERE id = ${workerId}
      `);

      // Audit note
      try {
        await archDb.insert(isolatedSchema.workerNotes).values({
          workerId,
          changeType: 'worker_archived',
          notes: `Worker archived by ${username}.${reason ? ` Reason: ${reason}` : ''}`,
          changedBy: username,
        });
      } catch (noteErr) {
        logger.error('Failed to write archive audit note:', noteErr);
      }

      res.json({ success: true, message: "Worker archived successfully." });
    } catch (error) {
      logger.error("Error archiving worker:", error);
      res.status(500).json({ error: "Failed to archive worker" });
    }
  });

  // Unarchive a worker — admin/manager only
  app.post("/api/contractors/workers/:id/unarchive", requireAuth, async (req, res) => {
    try {
      const role = req.user!.role;
      if (!['admin', 'manager'].includes(role)) {
        return res.status(403).json({ error: "Only admins and managers can unarchive workers." });
      }
      const workerId = req.params.id;
      const username = req.user!.username;
      const unarchCtx = simpleDatabaseService.createCustomerContext(username, req.customerId);
      const unarchDb = await customerDbService.getCustomerDatabase(unarchCtx.customerId);

      const [worker] = await unarchDb.select().from(isolatedSchema.contractorWorkers)
        .where(eq(isolatedSchema.contractorWorkers.id, workerId)).limit(1);
      if (!worker) return res.status(404).json({ error: "Worker not found" });

      await unarchDb.execute(sql`
        UPDATE contractor_workers
        SET is_active = true,
            archived_at = NULL,
            archived_by = NULL,
            archive_reason = NULL,
            updated_at = NOW()
        WHERE id = ${workerId}
      `);

      try {
        await unarchDb.insert(isolatedSchema.workerNotes).values({
          workerId,
          changeType: 'worker_unarchived',
          notes: `Worker unarchived (reactivated) by ${username}.`,
          changedBy: username,
        });
      } catch (noteErr) {
        logger.error('Failed to write unarchive audit note:', noteErr);
      }

      res.json({ success: true, message: "Worker unarchived successfully." });
    } catch (error) {
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
      // Role check — admin only
      if (req.user!.role !== 'admin') {
        return res.status(403).json({ error: "Only admins can permanently delete workers." });
      }

      const { id } = req.params;
      const { confirmName } = req.body;
      const delUsername = req.user!.username;
      const delCtx = simpleDatabaseService.createCustomerContext(delUsername, req.customerId);
      const delDb = await customerDbService.getCustomerDatabase(delCtx.customerId);

      // Load the worker
      const [worker] = await delDb.select().from(isolatedSchema.contractorWorkers)
        .where(eq(isolatedSchema.contractorWorkers.id, id)).limit(1);
      if (!worker) return res.status(404).json({ error: "Worker not found" });

      // Verify confirmName matches full name
      const fullName = `${worker.firstName} ${worker.lastName}`;
      if (!confirmName || confirmName.trim() !== fullName.trim()) {
        return res.status(400).json({
          error: `Name confirmation required. Please type "${fullName}" to confirm deletion.`,
          expectedName: fullName,
        });
      }

      // Write company-level audit note before deletion
      try {
        await delDb.insert(isolatedSchema.companyNotes).values({
          companyId: worker.companyId,
          changeType: 'worker_deleted',
          notes: `Worker "${fullName}" permanently deleted by ${delUsername}. All records purged.`,
          changedBy: delUsername,
        });
      } catch (noteErr) {
        logger.error('Failed to write deletion company note:', noteErr);
      }

      // Delete child rows in dependency order, then the worker
      await delDb.transaction(async (tx) => {
        // workerDocumentAcceptances references workerDocumentAssignments + contractorWorkers
        await tx.delete(isolatedSchema.workerDocumentAcceptances)
          .where(eq(isolatedSchema.workerDocumentAcceptances.workerId, id));
        await tx.delete(isolatedSchema.workerDocumentAssignments)
          .where(eq(isolatedSchema.workerDocumentAssignments.workerId, id));
        await tx.delete(isolatedSchema.workerNotes)
          .where(eq(isolatedSchema.workerNotes.workerId, id));
        await tx.delete(isolatedSchema.cardIssues)
          .where(eq(isolatedSchema.cardIssues.workerId, id));
        await tx.delete(isolatedSchema.contractorVisits)
          .where(eq(isolatedSchema.contractorVisits.workerId, id));
        await tx.delete(isolatedSchema.contractorDocuments)
          .where(eq(isolatedSchema.contractorDocuments.workerId, id));
        await tx.delete(isolatedSchema.workerCompetencies)
          .where(eq(isolatedSchema.workerCompetencies.workerId, id));
        await tx.delete(isolatedSchema.nvqQualifications)
          .where(eq(isolatedSchema.nvqQualifications.workerId, id));
        await tx.delete(isolatedSchema.workerCertifications)
          .where(eq(isolatedSchema.workerCertifications.workerId, id));
        await tx.delete(isolatedSchema.co2Records)
          .where(eq(isolatedSchema.co2Records.workerId, id));
        await tx.delete(isolatedSchema.co2EmissionsData)
          .where(eq(isolatedSchema.co2EmissionsData.workerId, id));
        await tx.delete(isolatedSchema.localLabourRecords)
          .where(eq(isolatedSchema.localLabourRecords.workerId, id));
        // inductionTokens has nullable workerId — SET NULL rather than hard-delete
        await tx.execute(sql`UPDATE induction_tokens SET worker_id = NULL WHERE worker_id = ${id}`);
        // Finally, delete the worker row
        await tx.delete(isolatedSchema.contractorWorkers)
          .where(eq(isolatedSchema.contractorWorkers.id, id));
      });

      res.json({ success: true, message: `Worker "${fullName}" permanently deleted.` });
    } catch (error) {
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
      const { companyId } = req.params;
      const { documentName, documentType, documentUrl, expiryDate, issuedBy, policyNumber } = req.body;
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      const db = await customerDbService.getCustomerDatabase(context.customerId);

      const [currentUser] = await db.select().from(isolatedSchema.users)
        .where(eq(isolatedSchema.users.username, username)).limit(1);

      const objectStorageService = new ObjectStorageService();
      const normalizedUrl = documentUrl ? objectStorageService.normalizeObjectEntityPath(documentUrl) : documentUrl;

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
        const auditTs = new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' });
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
      const { companyId, documentId } = req.params;
      const { documentUrl, expiryDate, issuedBy, policyNumber, status } = req.body;
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      const db = await customerDbService.getCustomerDatabase(context.customerId);

      const objectStorageService = new ObjectStorageService();
      const normalizedUrl = documentUrl ? objectStorageService.normalizeObjectEntityPath(documentUrl) : undefined;

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
        const auditTs = new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' });
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
            const auditTs = new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' });
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

  // Delete a company document
  app.delete("/api/contractors/:companyId/documents/:documentId", requireAuth, async (req, res) => {
    try {
      const { companyId, documentId } = req.params;
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      const db = await customerDbService.getCustomerDatabase(context.customerId);

      const [deleted] = await db.delete(isolatedSchema.contractorDocuments)
        .where(and(
          eq(isolatedSchema.contractorDocuments.id, documentId),
          eq(isolatedSchema.contractorDocuments.companyId, companyId)
        )).returning();

      if (!deleted) {
        return res.status(404).json({ error: "Document not found" });
      }

      try {
        const auditTs = new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' });
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
          const auditTs = new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' });
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

      // Audit trail
      try {
        const auditTs = now.toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' });
        const docLabel = (updated.documentType || updated.documentName || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
        await db.insert(isolatedSchema.companyNotes).values({
          companyId,
          changeType: 'document_approved',
          notes: `Document "${docLabel}" approved by ${displayName} on ${auditTs}.`,
          changedBy: username,
        });
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
      <p style="font-weight:600;margin-bottom:8px">Documents that may be required:</p>
      <ul>
        <li>Right to Work (passport, driving licence, or biometric residence permit)</li>
        <li>CSCS Card</li>
        <li>IPAF Card (if working at height)</li>
        <li>Public Liability Insurance</li>
        <li>Employers' Liability Insurance</li>
        <li>Health &amp; Safety Policy</li>
        <li>Training Certificates</li>
        <li>Other relevant certifications</li>
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

      res.json({
        worker: { id: (worker as any).id, firstName: (worker as any).firstName, lastName: (worker as any).lastName },
        company: { companyName: (company as any)?.companyName },
        settings: { companyName: settings?.companyName, logoUrl: settings?.logoUrl, accentColor: settings?.accentColor, backgroundColor: settings?.backgroundColor },
        documents: existingDocs,
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

  // Delete (soft-delete) a company document
  app.delete("/api/contractors/:companyId/documents/:documentId", requireAuth, async (req, res) => {
    try {
      const { companyId, documentId } = req.params;
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      const db = await customerDbService.getCustomerDatabase(context.customerId);

      const [deletedDoc] = await db
        .update(isolatedSchema.contractorDocuments)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(isolatedSchema.contractorDocuments.id, documentId),
            eq(isolatedSchema.contractorDocuments.companyId, companyId)
          )
        )
        .returning();

      if (!deletedDoc) {
        return res.status(404).json({ error: 'Document not found' });
      }

      // Audit trail — company document deleted
      try {
        const auditTs = new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' });
        const docLabel = (deletedDoc.documentType || deletedDoc.documentName || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || 'Document';
        await db.insert(isolatedSchema.companyNotes).values({
          companyId,
          changeType: 'document_deleted',
          notes: `Document "${docLabel}" deleted by ${username} on ${auditTs}`,
          changedBy: username,
        });
      } catch (auditErr) {
        logger.error('Failed to create company document delete audit note (continuing):', auditErr);
      }

      res.json({ success: true, message: 'Document deleted' });
    } catch (error) {
      logger.error('Error deleting company document:', error);
      res.status(500).json({ error: 'Failed to delete document' });
    }
  });

  // Company notes / audit trail
  app.get("/api/contractors/:companyId/notes", requireAuth, async (req, res) => {
    try {
      const { companyId } = req.params;
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const db = await customerDbService.getCustomerDatabase(context.customerId);
      const notes = await db.select().from(isolatedSchema.companyNotes)
        .where(eq(isolatedSchema.companyNotes.companyId, companyId))
        .orderBy(desc(isolatedSchema.companyNotes.changedAt));
      res.json(notes);
    } catch (error) {
      logger.error("Error fetching company notes:", error);
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

      // Check if worker can check in (induction completed, valid status, etc.)
      const issues = [];
      
      // Validation fields now correctly read from database
      
      // Check company status — only block suspended companies (pending/active are fine)
      if (company.status === 'suspended') {
        issues.push(`Contractor company is suspended`);
      }
      
      // Handle inductionCompleted with proper default (schema defaults to false)
      const inductionCompleted = worker.inductionCompleted ?? false;
      if (!inductionCompleted) {
        issues.push("Site induction not completed");
      }
      
      // Handle rightToWork with proper default (schema defaults to 'pending')
      const rightToWorkStatus = worker.rightToWork ?? 'pending';
      if (rightToWorkStatus === 'expired') {
        issues.push("Right to work has expired");
      } else if (rightToWorkStatus !== 'valid') {
        issues.push("Right to work not verified (status: pending)");
      }
      // Check for Red Card (site ban) - Yellow Cards are warnings only, not blockages
      if (worker.currentCardStatus === 'red') {
        issues.push("Worker has an active Red Card (site ban)");
      }
      
      if (issues.length > 0) {
        return res.status(400).json({ 
          error: `Cannot check in: ${issues.join(' · ')}`,
          issues: issues
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
      const contractorCheckinDb = await customerDbService.getCustomerDatabase(context.customerId);
      await contractorCheckinDb.transaction(async (tx) => {
        await tx
          .update(isolatedSchema.contractorWorkers)
          .set({
            qrCode: workerQrCode,
            isCheckedIn: true,
            checkedInAt: checkInTime,
            hsRulesAccepted: contractorHsAccepted,
            hsRulesAcceptedAt: contractorHsAcceptedAt,
            ...(cNdaBodyAccepted ? { ndaAccepted: true, ndaAcceptedAt: new Date() } : {}),
            updatedAt: new Date(),
          })
          .where(eq(isolatedSchema.contractorWorkers.id, workerId));

        await tx.insert(isolatedSchema.contractorVisits).values({
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
        });
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
              await databaseService.updateContractorWorker(context, workerId, {
                hsRulesAcceptanceToken: workerHsToken
              });
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

      // Update worker status using customer-isolated database service
      const updatedWorker = await databaseService.updateContractorWorker(context, workerId, {
        isCheckedIn: false,
        checkedOutAt: new Date()
      });

      // Complete the current visit record
      const currentVisit = await databaseService.getCurrentContractorVisit(context, workerId);
      if (currentVisit) {
        await databaseService.updateContractorVisit(context, currentVisit.id, {
          checkedOutAt: new Date()
        });
        logger.info(`Completed visit record for ID ${worker.id}`);
      }

      // Create audit trail entry for check-out
      try {
        const db = await customerDbService.getCustomerDatabase(context.customerId);
        await db.insert(isolatedSchema.workerNotes).values({
          workerId: workerId,
          changeType: 'check_out',
          oldValue: 'Checked In',
          newValue: 'Checked Out',
          notes: `Checked out${checkoutType ? ` (${checkoutType})` : ''}`,
          changedBy: username,
        });
      } catch (auditErr) {
        logger.error('Failed to create check-out audit note:', auditErr);
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
          await contractorLwDb.update(isolatedSchema.contractorWorkers)
            .set({ isLoneWorker: false, loneWorkerSince: null, loneWorkerDeadline: null, loneWorkerEscalationLevel: 0 })
            .where(sql`${isolatedSchema.contractorWorkers.id} = ${workerId}`);
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

  // ── Portal-admin middleware ───────────────────────────────────────────────
  function requirePortalAdmin(req: any, res: any, next: any) {
    if (!['admin', 'tenant_admin'].includes(req.user?.role || '')) {
      return res.status(403).json({ error: 'Admin role required' });
    }
    next();
  }

  // ── Contractor Portal: Admin overview (replaces N+1 per-company fan-out) ──
  app.get('/api/contractor-portal/admin-overview', requireAuth, requirePortalAdmin, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const db = await customerDbService.getCustomerDatabase(customerId);

      const portalUsers = await db
        .select({
          id: isolatedSchema.contractorPortalUsers.id,
          email: isolatedSchema.contractorPortalUsers.email,
          firstName: isolatedSchema.contractorPortalUsers.firstName,
          lastName: isolatedSchema.contractorPortalUsers.lastName,
          role: isolatedSchema.contractorPortalUsers.role,
          isActive: isolatedSchema.contractorPortalUsers.isActive,
          hasPassword: sql<boolean>`(${isolatedSchema.contractorPortalUsers.passwordHash} IS NOT NULL)`,
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
        })
        .from(isolatedSchema.contractorDocuments)
        .leftJoin(
          isolatedSchema.contractorCompanies,
          eq(isolatedSchema.contractorDocuments.companyId, isolatedSchema.contractorCompanies.id)
        )
        .where(
          and(
            eq(isolatedSchema.contractorDocuments.status, 'pending'),
            eq(isolatedSchema.contractorDocuments.isActive, true),
            like(isolatedSchema.contractorDocuments.uploadedBy, 'portal:%')
          )
        )
        .orderBy(desc(isolatedSchema.contractorDocuments.uploadedAt));

      return res.json({ portalUsers, pendingDocs });
    } catch (error: any) {
      logger.error('Error loading portal admin overview:', error);
      return res.status(500).json({ error: 'Failed to load portal overview.' });
    }
  });

  // ── Contractor Portal: Invite a user ──────────────────────────────────────
  app.post('/api/contractors/:companyId/portal-invite', requireAuth, requirePortalAdmin, async (req, res) => {
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

      const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol;
      const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
      const portalUrl = `${protocol}://${host}/contractor-portal/accept-invite?token=${inviteToken}&cid=${customerId}`;

      try {
        const emailSvc = new EmailService(customerId);
        await emailSvc.sendEmail({
          to: email,
          subject: `Contractor Portal invitation — ${company.companyName}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
              <h2 style="color:#1e293b">Contractor Portal Invitation</h2>
              <p>Hello${firstName ? ` ${firstName}` : ''},</p>
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
      logger.error('Error sending portal invite:', error);
      return res.status(500).json({ error: 'Failed to send invitation.' });
    }
  });

  // ── Contractor Portal: List portal users for a company ────────────────────
  app.get('/api/contractors/:companyId/portal-users', requireAuth, requirePortalAdmin, async (req, res) => {
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
      logger.error('Error listing portal users:', error);
      return res.status(500).json({ error: 'Failed to load portal users.' });
    }
  });

  // ── Contractor Portal: Revoke / re-invite a portal user ──────────────────
  app.patch('/api/contractors/portal-users/:userId/revoke', requireAuth, requirePortalAdmin, async (req, res) => {
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
      logger.error('Error revoking portal user:', error);
      return res.status(500).json({ error: 'Failed to revoke access.' });
    }
  });

  // ── Contractor Portal: Resend login details to an active portal user ────────
  app.post('/api/contractors/portal-users/:userId/resend-login', requireAuth, requirePortalAdmin, async (req, res) => {
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

      const protocol = req.protocol;
      const host = req.get('host') ?? '';
      const portalUrl = `${protocol}://${host}/contractor-portal/login`;
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
      logger.error('Error resending login details:', error);
      return res.status(500).json({ error: 'Failed to resend login details.' });
    }
  });

  // ── Contractor Portal: Review a document (approve/reject) ─────────────────
  app.put('/api/contractors/documents/:docId/review', requireAuth, requirePortalAdmin, async (req, res) => {
    try {
      const { docId } = req.params;
      const customerId = req.customerId!;
      const { status, rejectedReason } = req.body as Record<string, string>;

      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Status must be "approved" or "rejected".' });
      }

      const db = await customerDbService.getCustomerDatabase(customerId);
      const reviewerId = (req as any).userId as string;

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

      return res.json(updated);
    } catch (error: any) {
      logger.error('Error reviewing document:', error);
      return res.status(500).json({ error: 'Failed to update document status.' });
    }
  });

  // ── Contractor Portal: List pending documents for admin review ────────────
  app.get('/api/contractors/:companyId/portal-documents', requireAuth, requirePortalAdmin, async (req, res) => {
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
}
