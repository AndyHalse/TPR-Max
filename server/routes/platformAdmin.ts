import type { Express } from 'express';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import sgMail from '@sendgrid/mail';
import { eq, sql, desc, and, gte, isNull, ne } from 'drizzle-orm';
import { z } from 'zod';
import { requirePlatformAdmin, requireSuperAdmin } from '../auth';
import { CustomerDatabaseService, customerDbService } from '../customerDatabase';
import * as isolatedSchema from '../isolatedSchema';
import { clearCustomerEnterpriseCache } from '../enterpriseRoles';
import { db } from '../db';
import * as sharedSchema from '@shared/schema';
import { customerOnboardingRequestSchema, type CustomerOnboardingRequest } from '@shared/schema';
import { customerOnboardingService } from '../customerOnboardingService';
import { simpleDatabaseService } from '../simpleDatabaseService';
import { logger } from '../utils/logger';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    (cb as any)(new Error('INVALID_FILE_TYPE'));
  },
});

// Wrapper so multer errors return clean JSON instead of crashing
function logoUpload(req: any, res: any, next: any) {
  upload.single('logo')(req, res, (err: any) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, error: 'File too large. Maximum size is 2 MB.' });
    }
    if (err.message === 'INVALID_FILE_TYPE') {
      return res.status(400).json({ success: false, error: 'Unsupported file type. Only images (JPEG, PNG, GIF, WebP, SVG) are accepted.' });
    }
    return res.status(500).json({ success: false, error: 'File upload failed.' });
  });
}

// Separate multer instance for blog cover images — 5 MB limit, no SVG
const blogImageUploadMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    (cb as any)(new Error('INVALID_FILE_TYPE'));
  },
});

function blogImageUpload(req: any, res: any, next: any) {
  blogImageUploadMulter.single('image')(req, res, (err: any) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, error: 'File too large. Maximum size is 5 MB.' });
    }
    if (err.message === 'INVALID_FILE_TYPE') {
      return res.status(400).json({ success: false, error: 'Invalid file type. Only JPEG, PNG, GIF and WebP images are allowed.' });
    }
    return res.status(500).json({ success: false, error: 'File upload failed.' });
  });
}

// ─── In-memory OTP store ───────────────────────────────────────────────────
interface PendingOtp {
  adminId: string;
  adminEmail: string;
  adminFirstName: string;
  otp: string;
  expiresAt: number;
  failureCount: number; // per-token brute-force counter
}
// TODO: move to shared store (Redis/DB) if running multiple instances
const pendingOtps = new Map<string, PendingOtp>();

function generateOtp(): string {
  return String(crypto.randomInt(100000, 999999));
}

// Prune expired OTPs periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of pendingOtps.entries()) {
    if (now > entry.expiresAt) pendingOtps.delete(token);
  }
}, 5 * 60 * 1000);

/** Write a platform_admin_audit row. Never throws — failures are logged but never block the action. */
async function writeAudit(params: {
  adminId: string;
  adminUsername: string;
  action: string;
  targetType: string;
  targetId?: string;
  targetLabel?: string;
  details?: Record<string, unknown>;
}) {
  try {
    await db.insert(sharedSchema.platformAdminAudit).values({
      adminId: params.adminId,
      adminUsername: params.adminUsername,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId ?? null,
      targetLabel: params.targetLabel ?? null,
      details: params.details ?? null,
    });
  } catch (err) {
    logger.error('⚠️ AUDIT WRITE FAILED — action was NOT blocked but audit record is missing:', { params, err });
  }
}

export function registerPlatformAdminRoutes(app: Express): void {
  
  // ============================================
  // PLATFORM ADMIN AUTHENTICATION ENDPOINTS
  // ============================================
  
  /**
   * Platform Admin Login — Step 1: validate credentials, send OTP email
   * Does NOT create a session. Returns requiresOtp + pendingToken.
   */
  const platformAdminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many login attempts. Try again in 15 minutes.' }
  });

  app.post("/platform-admin/auth/login", platformAdminLimiter, async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }
      
      logger.info(`Platform admin login attempt: ${username}`);
      
      const { PlatformAdminAuthService } = await import("../auth");
      const admin = await PlatformAdminAuthService.authenticatePlatformAdmin(username, password);
      
      if (!admin) {
        logger.info(`Platform admin authentication failed: ${username}`);
        return res.status(401).json({ error: "Invalid username or password" });
      }

      // Generate OTP and store pending verification
      const pendingToken = crypto.randomUUID();
      const otp = generateOtp();
      pendingOtps.set(pendingToken, {
        adminId: admin.id,
        adminEmail: admin.email,
        adminFirstName: admin.firstName,
        otp,
        expiresAt: Date.now() + 10 * 60 * 1000,
        failureCount: 0,
      });

      // Send OTP via email — SendGrid first, SMTP fallback, keep OTP alive on failure
      const otpHtml = `
        <div style="font-family:Arial,sans-serif;max-width:420px;margin:0 auto;padding:24px;">
          <h2 style="margin-bottom:4px;">Platform Admin — 2-Step Verification</h2>
          <p>Hi ${admin.firstName},</p>
          <p>Someone is signing in to the TPR Max Platform Admin portal. Your verification code is:</p>
          <div style="font-size:36px;font-weight:700;letter-spacing:10px;text-align:center;padding:20px;background:#f3f4f6;border-radius:10px;margin:20px 0;">${otp}</div>
          <p>This code expires in <strong>10 minutes</strong>.</p>
          <p style="color:#6b7280;font-size:13px;">If you didn't attempt to sign in, change your password immediately.</p>
        </div>`;
      const otpText = `Your TPR Max Platform Admin verification code is: ${otp}. It expires in 10 minutes.`;

      let emailSent = false;

      const sgKey = process.env.SENDGRID_API_KEY;
      if (sgKey) {
        try {
          sgMail.setApiKey(sgKey);
          await sgMail.send({
            to: admin.email,
            from: { email: process.env.SMTP_USER || 'noreply@visigate.pro', name: 'TPR Max' },
            subject: 'TPR Max Admin — Verification Code',
            html: otpHtml,
            text: otpText,
          });
          logger.info(`Platform admin OTP sent via SendGrid to ${admin.email}`);
          emailSent = true;
        } catch (sgErr: any) {
          logger.warn(`SendGrid platform admin OTP failed, falling back to SMTP: ${sgErr?.message}`);
        }
      }

      if (!emailSent) {
        try {
          const { emailService } = await import('../emailService');
          await emailService.sendEmail({
            to: admin.email,
            subject: 'TPR Max Admin — Verification Code',
            html: otpHtml,
            text: otpText,
          });
          logger.info(`Platform admin OTP sent via SMTP to ${admin.email}`);
          emailSent = true;
        } catch (smtpErr: any) {
          logger.warn(`SMTP platform admin OTP failed: ${smtpErr?.message}`);
        }
      }

      if (!emailSent) {
        // Keep OTP alive — log for admin recovery, do NOT delete
        logger.error(
          `Platform admin OTP email delivery failed for ${admin.username} (${admin.email}). ` +
          `OTP [ADMIN-RECOVERY]: ${otp} | pendingToken: ${pendingToken}`
        );
        return res.status(503).json({ error: "EMAIL_DELIVERY_FAILED", message: "Verification email could not be delivered. Contact Replit support to retrieve your code from the server logs." });
      }

      return res.json({
        requiresOtp: true,
        pendingToken,
        maskedEmail: admin.email.replace(/(.{2})(.*)(@.*)/, '$1***$3'),
      });
    } catch (error) {
      logger.error("Platform admin login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  /**
   * Platform Admin Login — Step 2: verify OTP, create session
   */
  app.post("/platform-admin/auth/verify-otp", platformAdminLimiter, async (req, res) => {
    try {
      const { pendingToken, otp } = req.body;

      if (!pendingToken || !otp) {
        return res.status(400).json({ error: "Verification code is required" });
      }

      const pending = pendingOtps.get(pendingToken);

      if (!pending) {
        return res.status(400).json({ error: "Verification session not found. Please log in again." });
      }

      if (Date.now() > pending.expiresAt) {
        pendingOtps.delete(pendingToken);
        return res.status(400).json({ error: "Verification code expired. Please log in again." });
      }

      const submittedOtp = Buffer.from(otp.trim().padEnd(6, ' '));
      const expectedOtp  = Buffer.from(pending.otp.padEnd(6, ' '));
      if (submittedOtp.length !== expectedOtp.length || !crypto.timingSafeEqual(submittedOtp, expectedOtp)) {
        pending.failureCount += 1;
        if (pending.failureCount >= 5) {
          pendingOtps.delete(pendingToken);
          logger.warn(`Platform admin 2FA token invalidated after ${pending.failureCount} failed attempts for admin ${pending.adminEmail}`);
          return res.status(400).json({ error: "Too many incorrect attempts. Please log in again to receive a new verification code.", requiresRelogin: true });
        }
        return res.status(400).json({ error: "Invalid verification code. Please try again." });
      }

      pendingOtps.delete(pendingToken);

      const adminRows = await db
        .select()
        .from(sharedSchema.platformAdmins)
        .where(eq(sharedSchema.platformAdmins.id, pending.adminId))
        .limit(1);

      const admin = adminRows[0];
      if (!admin) {
        return res.status(401).json({ error: "Admin account not found" });
      }

      req.session.regenerate((regenerateErr) => {
        if (regenerateErr) {
          logger.error("Platform admin session regeneration error:", regenerateErr);
          return res.status(500).json({ error: "Failed to create secure session" });
        }

        req.session.platformAdminId = admin.id;
        req.session.platformAdminUsername = admin.username;

        req.session.save((saveErr) => {
          if (saveErr) {
            logger.error("Platform admin session save error:", saveErr);
            return res.status(500).json({ error: "Failed to establish session" });
          }

          logger.info(`Platform admin OTP verified and session created: ${admin.username} (ID: ${admin.id})`);

          res.json({
            success: true,
            admin: {
              id: admin.id,
              username: admin.username,
              email: admin.email,
              firstName: admin.firstName,
              lastName: admin.lastName,
              role: admin.role,
            },
          });
        });
      });
    } catch (error) {
      logger.error("Platform admin OTP verification error:", error);
      res.status(500).json({ error: "Verification failed" });
    }
  });

  /**
   * Platform Admin Logout
   */
  app.post("/platform-admin/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        logger.error("Platform admin session destroy error:", err);
        return res.status(500).json({ error: "Logout failed" });
      }
      logger.info(`Platform admin logged out`);
      res.json({ success: true });
    });
  });

  /**
   * Get Current Platform Admin
   */
  app.get("/platform-admin/auth/me", async (req, res) => {
    if (!req.session.platformAdminId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    try {
      // Get admin from database
      const admins = await db
        .select()
        .from(sharedSchema.platformAdmins)
        .where(eq(sharedSchema.platformAdmins.id, req.session.platformAdminId))
        .limit(1);
      
      const admin = admins[0];
      
      if (!admin || !admin.isActive) {
        return res.status(401).json({ error: "Admin not found or inactive" });
      }
      
      res.json({
        id: admin.id,
        username: admin.username,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        role: admin.role
      });
    } catch (error) {
      logger.error('Error in /platform-admin/auth/me:', error);
      return res.status(401).json({ error: "Authentication failed" });
    }
  });

  // ============================================
  // PLATFORM ADMIN CUSTOMER MANAGEMENT ENDPOINTS
  // ============================================

  // Features disabled for each tier (deny-list — everything not listed is ON)
  const DISABLED_FEATURES_BY_TIER: Record<string, string[]> = {
    trial: [
      'featureKiosk', 'featureTimeAttendance', 'featureContractorPage', 'featureContractors',
      'featureInductionSettings', 'featureMeetingRooms', 'featureMembers',
      'featureIncidentReports', 'featureHsIncidents', 'featureBbs', 'featureFireRiskAssessment',
      'featureComplianceDashboard', 'featureMartynLaw', 'featurePPM', 'featureHelpDesk',
      'featureComplianceCertificates', 'featurePermitToWork', 'featureAuditEngine',
      'featureRaBuilder', 'featureHrModule',
    ],
    tpr_basic: [
      'featureTimeAttendance', 'featureContractorPage', 'featureContractors',
      'featureInductionSettings', 'featureMeetingRooms', 'featureMembers',
      'featureIncidentReports', 'featureHsIncidents', 'featureBbs', 'featureFireRiskAssessment',
      'featureComplianceDashboard', 'featureMartynLaw', 'featurePPM', 'featureHelpDesk',
      'featureComplianceCertificates', 'featurePermitToWork', 'featureAuditEngine',
      'featureRaBuilder', 'featureHrModule',
    ],
    tpr_pro: [
      'featureMeetingRooms', 'featureMartynLaw', 'featurePPM', 'featureHelpDesk',
      'featurePermitToWork', 'featureAuditEngine', 'featureHrModule', 'featureContractorPortal',
    ],
    tpr_max: [],
  };

  /**
   * Direct Customer Provisioning (bypasses payment)
   * Platform admins can manually onboard customers
   */
  app.post("/platform-admin/customers", requirePlatformAdmin, async (req, res) => {
    try {
      logger.info(`Platform admin initiating customer provisioning`);
      
      // Validate request body against customer onboarding schema
      const onboardingData = customerOnboardingRequestSchema.parse(req.body);
      
      // Add flag to skip Stripe subscription creation
      const provisioningRequest: CustomerOnboardingRequest = {
        ...onboardingData,
        createSubscription: false, // Skip Stripe subscription
      };
      
      logger.info(`Provisioning customer without payment: ${provisioningRequest.companyName}`);
      
      // Provision customer directly using onboarding service
      const result = await customerOnboardingService.provisionCustomer(provisioningRequest);

      // Apply tier-based feature restrictions via the existing deny-list mechanism
      const tierDisabled = DISABLED_FEATURES_BY_TIER[provisioningRequest.planType] ?? DISABLED_FEATURES_BY_TIER['tpr_basic'];
      if (tierDisabled.length > 0) {
        await db.update(sharedSchema.customers)
          .set({ platformDisabledFeatures: tierDisabled })
          .where(eq(sharedSchema.customers.id, result.customerId));
        logger.info(`Applied tier deny-list for ${provisioningRequest.planType} (${tierDisabled.length} features disabled) to customer ${result.customerId}`);
      }
      
      logger.info(`Customer provisioned successfully by platform admin: ${result.customer.companyName}`);

      // Optionally flag as enterprise at creation time
      const isEnterpriseFlagSet = req.body.isEnterprise === true;
      if (isEnterpriseFlagSet) {
        await db.update(sharedSchema.customers)
          .set({ isEnterprise: true, updatedAt: sql`NOW()` })
          .where(eq(sharedSchema.customers.id, result.customerId));
        const adminId = req.session.platformAdminId!;
        const [adminRow] = await db.select({ username: sharedSchema.platformAdmins.username }).from(sharedSchema.platformAdmins).where(eq(sharedSchema.platformAdmins.id, adminId)).limit(1);
        await writeAudit({ adminId, adminUsername: adminRow?.username ?? 'unknown', action: 'customer.enterprise_enable', targetType: 'customer', targetId: result.customerId, targetLabel: result.customer.companyName, details: { setAtCreation: true } });
      }
      
      res.status(201).json({
        success: true,
        message: 'Customer provisioned successfully',
        customer: { ...result.customer, isEnterprise: isEnterpriseFlagSet || false },
        adminUser: result.adminUser,
        loginUrl: result.loginUrl,
      });
    } catch (error) {
      logger.error('Platform admin customer provisioning error:', error);
      
      if (error instanceof z.ZodError) {
        const messages = error.errors.map(e => e.message).join('. ');
        return res.status(400).json({
          success: false,
          error: messages || 'Invalid request data',
          details: error.errors
        });
      }
      
      // Handle structured onboarding errors
      if (error && typeof error === 'object' && 'success' in error && error.success === false) {
        const onboardingError = error as CustomerOnboardingError;
        
        let statusCode = 500;
        switch (onboardingError.code) {
          case 'COMPANY_EXISTS':
          case 'ADMIN_USER_EXISTS':
            statusCode = 409;
            break;
          case 'VALIDATION_ERROR':
            statusCode = 400;
            break;
          default:
            statusCode = 500;
            break;
        }
        
        return res.status(statusCode).json(onboardingError);
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to provision customer',
        details: process.env.NODE_ENV === 'development' ? error : undefined
      });
    }
  });

  /**
   * List all customers with details
   */
  app.get("/platform-admin/customers", requirePlatformAdmin, async (req, res) => {
    try {
      const includeDeleted = req.query.includeDeleted === 'true';
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const offset = Number(req.query.offset) || 0;

      logger.info(`Platform admin requesting customer list`, { includeDeleted, limit, offset });

      const baseQuery = db
        .select()
        .from(sharedSchema.customers)
        .orderBy(desc(sharedSchema.customers.createdAt))
        .limit(limit)
        .offset(offset);

      const customers = includeDeleted
        ? await baseQuery
        : await db
            .select()
            .from(sharedSchema.customers)
            .where(sql`${sharedSchema.customers.deletedAt} IS NULL`)
            .orderBy(desc(sharedSchema.customers.createdAt))
            .limit(limit)
            .offset(offset);

      logger.info(`Retrieved ${customers.length} customers`);

      res.json({
        success: true,
        customers: customers.map(customer => ({
          id: customer.id,
          companyName: customer.companyName,
          slug: customer.slug,
          contactEmail: customer.contactEmail,
          isActive: customer.isActive,
          onboardingCompleted: customer.onboardingCompleted,
          maxVisitorsPerMonth: customer.maxVisitorsPerMonth,
          stripeCustomerId: customer.stripeCustomerId,
          isEnterprise: customer.isEnterprise,
          enterpriseGroupId: customer.enterpriseGroupId,
          enterpriseRole: customer.enterpriseRole,
          createdAt: customer.createdAt,
          updatedAt: customer.updatedAt,
          deletedAt: customer.deletedAt,
          deletedBy: customer.deletedBy,
        })),
        pagination: { limit, offset },
      });
    } catch (error) {
      logger.error('Error fetching customers:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch customers' });
    }
  });

  /**
   * Get single customer details
   */
  app.get("/platform-admin/customers/:customerId", requirePlatformAdmin, async (req, res) => {
    try {
      const { customerId } = req.params;
      
      const customers = await db
        .select()
        .from(sharedSchema.customers)
        .where(eq(sharedSchema.customers.id, customerId))
        .limit(1);
      
      const customer = customers[0];
      
      if (!customer) {
        return res.status(404).json({
          success: false,
          error: 'Customer not found'
        });
      }
      
      res.json({
        success: true,
        customer
      });
    } catch (error) {
      logger.error('Error fetching customer:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch customer'
      });
    }
  });

  /**
   * Update customer status (activate/deactivate)
   */
  app.patch("/platform-admin/customers/:customerId/status", requirePlatformAdmin, async (req, res) => {
    try {
      const { customerId } = req.params;
      const { isActive } = req.body;
      
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: 'isActive must be a boolean'
        });
      }
      
      const updatedCustomers = await db
        .update(sharedSchema.customers)
        .set({ 
          isActive,
          updatedAt: sql`NOW()`
        })
        .where(eq(sharedSchema.customers.id, customerId))
        .returning();
      
      const updatedCustomer = updatedCustomers[0];
      
      if (!updatedCustomer) {
        return res.status(404).json({
          success: false,
          error: 'Customer not found'
        });
      }
      
      logger.info(`Customer ${customerId} status updated: ${isActive ? 'active' : 'inactive'}`);

      const adminId = req.session.platformAdminId!;
      const [adminRow] = await db.select({ username: sharedSchema.platformAdmins.username }).from(sharedSchema.platformAdmins).where(eq(sharedSchema.platformAdmins.id, adminId)).limit(1);
      await writeAudit({ adminId, adminUsername: adminRow?.username ?? 'unknown', action: 'customer.status_change', targetType: 'customer', targetId: customerId, targetLabel: updatedCustomer.companyName, details: { isActive } });

      res.json({
        success: true,
        customer: updatedCustomer
      });
    } catch (error) {
      logger.error('Error updating customer status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update customer status'
      });
    }
  });

  /**
   * Soft-delete customer account (recoverable). Super admin only.
   */
  app.delete("/platform-admin/customers/:customerId", requirePlatformAdmin, requireSuperAdmin, async (req, res) => {
    try {
      const { customerId } = req.params;
      const adminId = req.session.platformAdminId!;

      const existing = await db.select().from(sharedSchema.customers).where(eq(sharedSchema.customers.id, customerId)).limit(1);
      if (!existing.length) return res.status(404).json({ success: false, error: 'Customer not found' });
      if (existing[0].deletedAt) return res.status(400).json({ success: false, error: 'Customer is already deleted' });

      const customerName = existing[0].companyName;

      const [adminRow] = await db.select({ username: sharedSchema.platformAdmins.username }).from(sharedSchema.platformAdmins).where(eq(sharedSchema.platformAdmins.id, adminId)).limit(1);
      const adminUsername = adminRow?.username ?? 'unknown';

      await db.update(sharedSchema.customers)
        .set({ deletedAt: sql`NOW()`, deletedBy: adminId, updatedAt: sql`NOW()` })
        .where(eq(sharedSchema.customers.id, customerId));

      logger.info(`Customer soft-deleted: ${customerName} (${customerId}) by ${adminUsername}`);

      await writeAudit({ adminId, adminUsername, action: 'customer.soft_delete', targetType: 'customer', targetId: customerId, targetLabel: customerName });

      res.json({ success: true, message: `Customer "${customerName}" has been deactivated and hidden. Use Restore to recover or Purge to permanently erase.` });
    } catch (error) {
      logger.error('Error soft-deleting customer:', error);
      res.status(500).json({ success: false, error: 'Failed to delete customer' });
    }
  });

  /**
   * Restore a soft-deleted customer. Super admin only.
   */
  app.post("/platform-admin/customers/:customerId/restore", requirePlatformAdmin, requireSuperAdmin, async (req, res) => {
    try {
      const { customerId } = req.params;
      const adminId = req.session.platformAdminId!;

      const existing = await db.select().from(sharedSchema.customers).where(eq(sharedSchema.customers.id, customerId)).limit(1);
      if (!existing.length) return res.status(404).json({ success: false, error: 'Customer not found' });
      if (!existing[0].deletedAt) return res.status(400).json({ success: false, error: 'Customer is not deleted' });

      const customerName = existing[0].companyName;
      const [adminRow] = await db.select({ username: sharedSchema.platformAdmins.username }).from(sharedSchema.platformAdmins).where(eq(sharedSchema.platformAdmins.id, adminId)).limit(1);
      const adminUsername = adminRow?.username ?? 'unknown';

      await db.update(sharedSchema.customers)
        .set({ deletedAt: null, deletedBy: null, updatedAt: sql`NOW()` })
        .where(eq(sharedSchema.customers.id, customerId));

      logger.info(`Customer restored: ${customerName} (${customerId}) by ${adminUsername}`);
      await writeAudit({ adminId, adminUsername, action: 'customer.restore', targetType: 'customer', targetId: customerId, targetLabel: customerName });

      res.json({ success: true, message: `Customer "${customerName}" has been restored.` });
    } catch (error) {
      logger.error('Error restoring customer:', error);
      res.status(500).json({ success: false, error: 'Failed to restore customer' });
    }
  });

  /**
   * Permanently purge a soft-deleted customer — drops tenant schema + removes row. Super admin only.
   */
  app.delete("/platform-admin/customers/:customerId/purge", requirePlatformAdmin, requireSuperAdmin, async (req, res) => {
    try {
      const { customerId } = req.params;
      const adminId = req.session.platformAdminId!;

      const existing = await db.select().from(sharedSchema.customers).where(eq(sharedSchema.customers.id, customerId)).limit(1);
      if (!existing.length) return res.status(404).json({ success: false, error: 'Customer not found' });

      const customer = existing[0];
      const [adminRow] = await db.select({ username: sharedSchema.platformAdmins.username }).from(sharedSchema.platformAdmins).where(eq(sharedSchema.platformAdmins.id, adminId)).limit(1);
      const adminUsername = adminRow?.username ?? 'unknown';

      // Step 1: drop tenant schema (GDPR erasure)
      let schemaDropped = false;
      try {
        const { databaseProvisioningService } = await import('../databaseProvisioningService');
        await databaseProvisioningService.deleteCustomerDatabase(customerId);
        schemaDropped = true;
        logger.info(`✅ Tenant schema dropped for customer ${customerId}`);
      } catch (schemaErr: any) {
        logger.error(`❌ Failed to drop tenant schema for customer ${customerId}:`, schemaErr);
        // Report the failure but still remove the management row to avoid a half-deleted state
        // (the orphaned schema is the lesser risk vs an invisible ghost customer)
      }

      // Step 2: remove management row
      await db.delete(sharedSchema.customers).where(eq(sharedSchema.customers.id, customerId));

      logger.warn(`Customer PURGED: ${customer.companyName} (${customerId}) by ${adminUsername}, schemaDropped=${schemaDropped}`);
      await writeAudit({
        adminId, adminUsername,
        action: 'customer.purge',
        targetType: 'customer',
        targetId: customerId,
        targetLabel: customer.companyName,
        details: { schemaDropped },
      });

      res.json({
        success: true,
        message: `Customer "${customer.companyName}" has been permanently erased.`,
        schemaDropped,
      });
    } catch (error) {
      logger.error('Error purging customer:', error);
      res.status(500).json({ success: false, error: 'Failed to purge customer' });
    }
  });

  /**
   * Update customer details (PATCH endpoint for edit functionality)
   */
  app.patch("/platform-admin/customers/:customerId", requirePlatformAdmin, async (req, res) => {
    try {
      const { customerId } = req.params;
      
      // Validate request body with explicit schema for allowed fields only
      const updateCustomerSchema = z.object({
        companyName: z.string().trim().min(1).optional(),
        contactEmail: z.string().trim().email().optional(),
        maxVisitorsPerMonth: z.number().int().positive().optional(),
        supportContactEmail: z.string().trim().email().optional().nullable(),
      });
      
      const validatedData = updateCustomerSchema.parse(req.body);
      
      // Only update if there are fields to update
      if (Object.keys(validatedData).length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No valid fields provided for update'
        });
      }
      
      const updatedCustomers = await db
        .update(sharedSchema.customers)
        .set({ 
          ...validatedData,
          updatedAt: sql`NOW()`
        })
        .where(eq(sharedSchema.customers.id, customerId))
        .returning();
      
      const updatedCustomer = updatedCustomers[0];
      
      if (!updatedCustomer) {
        return res.status(404).json({
          success: false,
          error: 'Customer not found'
        });
      }
      
      logger.info(`Customer ${customerId} details updated`);

      const adminId3 = req.session.platformAdminId!;
      const [adminRow3] = await db.select({ username: sharedSchema.platformAdmins.username }).from(sharedSchema.platformAdmins).where(eq(sharedSchema.platformAdmins.id, adminId3)).limit(1);
      await writeAudit({ adminId: adminId3, adminUsername: adminRow3?.username ?? 'unknown', action: 'customer.update', targetType: 'customer', targetId: customerId, targetLabel: updatedCustomer.companyName, details: { fields: Object.keys(validatedData) } });

      res.json({
        success: true,
        customer: updatedCustomer
      });
    } catch (error) {
      logger.error('Error updating customer:', error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request data',
          details: error.errors
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to update customer'
      });
    }
  });

  // ============================================
  // PLATFORM ADMIN ENTERPRISE MANAGEMENT
  // ============================================

  /**
   * List all enterprise groups.
   */
  app.get('/platform-admin/enterprise-groups', requirePlatformAdmin, async (req, res) => {
    try {
      const groups = await db
        .select()
        .from(sharedSchema.enterpriseGroups)
        .orderBy(sharedSchema.enterpriseGroups.name);
      return res.json({ success: true, groups });
    } catch (err) {
      logger.error('Error fetching enterprise groups:', err);
      return res.status(500).json({ success: false, error: 'Failed to fetch enterprise groups' });
    }
  });

  /**
   * Create a new enterprise group. Super admin only.
   */
  app.post('/platform-admin/enterprise-groups', requirePlatformAdmin, async (req, res) => {
    try {
      const schema = z.object({
        name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
        slug: z.string().trim().min(2).max(50).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, or hyphens'),
        contactEmail: z.string().trim().email().optional().nullable(),
      });
      const body = schema.parse(req.body);
      const [group] = await db.insert(sharedSchema.enterpriseGroups).values({ ...body }).returning();
      const adminId = req.session.platformAdminId!;
      const [adminRow] = await db.select({ username: sharedSchema.platformAdmins.username }).from(sharedSchema.platformAdmins).where(eq(sharedSchema.platformAdmins.id, adminId)).limit(1);
      await writeAudit({ adminId, adminUsername: adminRow?.username ?? 'unknown', action: 'enterprise_group.create', targetType: 'enterprise_group', targetId: group.id, targetLabel: group.name });
      return res.status(201).json({ success: true, group });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message ?? 'Invalid data' });
      logger.error('Error creating enterprise group:', err);
      return res.status(500).json({ success: false, error: 'Failed to create enterprise group' });
    }
  });

  /**
   * Set or clear the enterprise flag on a customer. Audited.
   */
  app.patch('/platform-admin/customers/:customerId/enterprise', requirePlatformAdmin, async (req, res) => {
    try {
      const schema = z.object({
        isEnterprise: z.boolean(),
        enterpriseGroupId: z.string().nullable().optional(),
      });
      const { isEnterprise, enterpriseGroupId = null } = schema.parse(req.body);
      const { customerId } = req.params;

      if (isEnterprise && enterpriseGroupId) {
        const [grp] = await db.select({ id: sharedSchema.enterpriseGroups.id }).from(sharedSchema.enterpriseGroups).where(eq(sharedSchema.enterpriseGroups.id, enterpriseGroupId)).limit(1);
        if (!grp) return res.status(400).json({ success: false, error: 'Enterprise group not found' });
      }

      const [updated] = await db.update(sharedSchema.customers)
        .set({ isEnterprise, enterpriseGroupId: isEnterprise ? (enterpriseGroupId ?? null) : null, updatedAt: sql`NOW()` })
        .where(eq(sharedSchema.customers.id, customerId))
        .returning();

      if (!updated) return res.status(404).json({ success: false, error: 'Customer not found' });

      clearCustomerEnterpriseCache(customerId);

      const adminId = req.session.platformAdminId!;
      const [adminRow] = await db.select({ username: sharedSchema.platformAdmins.username }).from(sharedSchema.platformAdmins).where(eq(sharedSchema.platformAdmins.id, adminId)).limit(1);
      await writeAudit({
        adminId, adminUsername: adminRow?.username ?? 'unknown',
        action: isEnterprise ? 'customer.enterprise_enable' : 'customer.enterprise_disable',
        targetType: 'customer', targetId: customerId, targetLabel: updated.companyName,
        details: { isEnterprise, enterpriseGroupId },
      });

      return res.json({ success: true, customer: updated });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: 'Invalid request data' });
      logger.error('Error updating enterprise flag:', err);
      return res.status(500).json({ success: false, error: 'Failed to update enterprise flag' });
    }
  });

  /**
   * Set site management style (central | independent) for an enterprise customer.
   * Super admin only — audited.
   */
  app.patch('/platform-admin/customers/:customerId/site-management-style', requirePlatformAdmin, async (req, res) => {
    try {
      const styleSchema = z.object({
        siteManagementStyle: z.enum(['central', 'independent']),
      });
      const { siteManagementStyle } = styleSchema.parse(req.body);
      const { customerId } = req.params;

      const [updated] = await db.update(sharedSchema.customers)
        .set({ siteManagementStyle, updatedAt: sql`NOW()` })
        .where(eq(sharedSchema.customers.id, customerId))
        .returning();

      if (!updated) return res.status(404).json({ success: false, error: 'Customer not found' });

      clearCustomerEnterpriseCache(customerId);

      const adminId = req.session.platformAdminId!;
      const [adminRow] = await db.select({ username: sharedSchema.platformAdmins.username }).from(sharedSchema.platformAdmins).where(eq(sharedSchema.platformAdmins.id, adminId)).limit(1);
      await writeAudit({
        adminId, adminUsername: adminRow?.username ?? 'unknown',
        action: 'customer.site_management_style_update',
        targetType: 'customer', targetId: customerId, targetLabel: updated.companyName,
        details: { siteManagementStyle },
      });

      return res.json({ success: true, customer: updated });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: 'Invalid request data' });
      logger.error('Error updating site management style:', err);
      return res.status(500).json({ success: false, error: 'Failed to update site management style' });
    }
  });

  /**
   * Get enterprise stats (site count + latest estate compliance score) for a single customer.
   */
  app.get('/platform-admin/customers/:customerId/enterprise-stats', requirePlatformAdmin, async (req, res) => {
    try {
      const { customerId } = req.params;
      const custDb = await customerDbService.getCustomerDatabase(customerId);

      const [siteRow] = await custDb
        .select({ count: sql<number>`count(*)::int` })
        .from(isolatedSchema.sites)
        .where(ne(isolatedSchema.sites.status, 'archived'));

      const [snapshotRow] = await custDb
        .select({ score: isolatedSchema.complianceSnapshots.overallScore, date: isolatedSchema.complianceSnapshots.date })
        .from(isolatedSchema.complianceSnapshots)
        .where(isNull(isolatedSchema.complianceSnapshots.siteId))
        .orderBy(desc(isolatedSchema.complianceSnapshots.date))
        .limit(1);

      return res.json({
        success: true,
        siteCount: Number(siteRow?.count ?? 0),
        complianceScore: snapshotRow?.score ?? null,
        complianceDate: snapshotRow?.date ?? null,
      });
    } catch (err) {
      logger.error(`Error fetching enterprise stats for customer ${req.params.customerId}:`, err);
      return res.json({ success: true, siteCount: 0, complianceScore: null, complianceDate: null });
    }
  });

  // ============================================
  // PLATFORM ADMIN BRANDING SETTINGS
  // ============================================
  
  /**
   * Get platform branding settings
   */
  app.get("/platform-admin/branding", requirePlatformAdmin, async (req, res) => {
    try {
      logger.info(`Platform admin requesting branding settings`);
      
      // Get branding settings (should be single row)
      const settings = await db
        .select()
        .from(sharedSchema.platformBrandingSettings)
        .limit(1);
      
      let brandingSettings = settings[0];
      
      // If no settings exist yet, create default settings
      if (!brandingSettings) {
        const newSettings = await db
          .insert(sharedSchema.platformBrandingSettings)
          .values({
            primaryColor: '#2460A9',
            secondaryColor: '#1E3A8A',
            accentColor: '#3B82F6',
            platformName: 'TPR Max',
            companyName: 'Your Company',
          })
          .returning();
        
        brandingSettings = newSettings[0];
        logger.info(`Created default branding settings`);
      }
      
      res.json({
        success: true,
        branding: brandingSettings
      });
    } catch (error) {
      logger.error('Error fetching branding settings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch branding settings'
      });
    }
  });

  /**
   * Update platform branding settings
   */
  app.put("/platform-admin/branding", requirePlatformAdmin, async (req, res) => {
    try {
      logger.info(`Platform admin updating branding settings`);
      
      const { primaryColor, secondaryColor, accentColor, logoUrl, faviconUrl, platformName, companyName } = req.body;
      
      // Get existing settings
      const existing = await db
        .select()
        .from(sharedSchema.platformBrandingSettings)
        .limit(1);
      
      let updatedSettings;
      
      if (existing.length === 0) {
        // Create new settings
        const newSettings = await db
          .insert(sharedSchema.platformBrandingSettings)
          .values({
            primaryColor: primaryColor || '#2460A9',
            secondaryColor: secondaryColor || '#1E3A8A',
            accentColor: accentColor || '#3B82F6',
            logoUrl,
            faviconUrl,
            platformName: platformName || 'TPR Max',
            companyName: companyName || 'Your Company',
            updatedBy: req.session.platformAdminId,
          })
          .returning();
        
        updatedSettings = newSettings[0];
      } else {
        // Update existing settings
        const updated = await db
          .update(sharedSchema.platformBrandingSettings)
          .set({
            primaryColor: primaryColor || existing[0].primaryColor,
            secondaryColor: secondaryColor || existing[0].secondaryColor,
            accentColor: accentColor || existing[0].accentColor,
            logoUrl: logoUrl !== undefined ? logoUrl : existing[0].logoUrl,
            faviconUrl: faviconUrl !== undefined ? faviconUrl : existing[0].faviconUrl,
            platformName: platformName || existing[0].platformName,
            companyName: companyName || existing[0].companyName,
            updatedAt: sql`NOW()`,
            updatedBy: req.session.platformAdminId,
          })
          .where(eq(sharedSchema.platformBrandingSettings.id, existing[0].id))
          .returning();
        
        updatedSettings = updated[0];
      }
      
      logger.info(`Branding settings updated successfully`);
      
      res.json({
        success: true,
        branding: updatedSettings
      });
    } catch (error) {
      logger.error('Error updating branding settings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update branding settings'
      });
    }
  });

  app.post("/platform-admin/branding/upload-logo", requirePlatformAdmin, logoUpload, async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No logo file uploaded'
        });
      }

      // Validate file type (images only)
      const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
      if (!allowedMimeTypes.includes(req.file.mimetype)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid file type. Only images (JPEG, PNG, GIF, WebP, SVG) are allowed.'
        });
      }

      // Validate file size (max 5MB)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (req.file.size > maxSize) {
        return res.status(400).json({
          success: false,
          error: 'File too large. Maximum size is 5MB.'
        });
      }

      logger.info(`Uploading platform logo: ${req.file.originalname} (${req.file.mimetype}, ${req.file.size} bytes)`);

      const path = await import('path');
      const { objectStorageClient } = await import('../objectStorage');

      // Sanitize filename and upload to object storage in public directory
      const ext = path.default.extname(req.file.originalname).toLowerCase();
      const fileName = `platform-logo-${Date.now()}${ext}`;
      const bucketName = 'replit-objstore-9ec67884-ec26-4167-84d1-c8ceecee21b7';
      const objectName = `public/${fileName}`;

      // Upload to object storage using Google Cloud Storage API
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      
      await file.save(req.file.buffer, {
        metadata: {
          contentType: req.file.mimetype,
        },
      });

      // Return just the filename - the frontend will use /public-objects/ prefix
      const logoUrl = fileName;

      logger.info(`Logo uploaded successfully to object storage: ${fileName}`);

      res.json({
        success: true,
        logoUrl
      });
    } catch (error) {
      logger.error('Error uploading logo:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to upload logo'
      });
    }
  });

  app.post("/platform-admin/blog/upload-image", requirePlatformAdmin, blogImageUpload, async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No image file uploaded' });
      }

      logger.info(`Uploading blog cover image: ${req.file.originalname} (${req.file.mimetype}, ${req.file.size} bytes)`);

      const path = await import('path');
      const { objectStorageClient } = await import('../objectStorage');

      const ext = path.default.extname(req.file.originalname).toLowerCase() || '.jpg';
      const fileName = `blog-cover-${Date.now()}${ext}`;
      const bucketName = 'replit-objstore-9ec67884-ec26-4167-84d1-c8ceecee21b7';
      const objectName = `public/${fileName}`;

      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      await file.save(req.file.buffer, { metadata: { contentType: req.file.mimetype } });

      logger.info(`Blog cover image uploaded successfully: ${fileName}`);

      // Return full display path so it can be stored directly in coverImageUrl
      res.json({ success: true, coverImageUrl: `/public-objects/${fileName}` });
    } catch (error) {
      logger.error('Error uploading blog cover image:', error);
      res.status(500).json({ success: false, error: 'Failed to upload image' });
    }
  });

  /**
   * Reset customer admin credentials
   */
  app.patch("/platform-admin/customers/:customerId/credentials", requirePlatformAdmin, async (req, res) => {
    try {
      const { customerId } = req.params;
      const { username, password, email } = req.body;

      if (!username && !password && !email) {
        return res.status(400).json({
          success: false,
          error: 'Username, password or email required'
        });
      }

      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
      }

      // Get customer to find their database
      const customers = await db
        .select()
        .from(sharedSchema.customers)
        .where(eq(sharedSchema.customers.id, customerId))
        .limit(1);

      const customer = customers[0];

      if (!customer) {
        return res.status(404).json({
          success: false,
          error: 'Customer not found'
        });
      }

      // Use CustomerDatabaseService for proper schema isolation and retry logic
      const customerDbService = CustomerDatabaseService.getInstance();
      const customerDb = await customerDbService.getCustomerDatabase(customerId);

      // Step 1: Find the customer's primary admin user (role = admin, ordered by created_at)
      const adminUsers = await customerDb
        .select({ id: isolatedSchema.users.id, username: isolatedSchema.users.username, email: isolatedSchema.users.email })
        .from(isolatedSchema.users)
        .where(eq(isolatedSchema.users.role, 'admin'))
        .orderBy(isolatedSchema.users.createdAt)
        .limit(1);

      // Fallback: if no admin role found, take the first user ever created
      const [adminUser] = adminUsers.length > 0 ? adminUsers : await customerDb
        .select({ id: isolatedSchema.users.id, username: isolatedSchema.users.username, email: isolatedSchema.users.email })
        .from(isolatedSchema.users)
        .orderBy(isolatedSchema.users.createdAt)
        .limit(1);

      if (!adminUser) {
        return res.status(404).json({ success: false, error: 'No admin user found for this customer' });
      }

      // Step 2: Build update payload — only set fields that actually changed
      const updateData: any = {};
      if (username && username !== adminUser.username) updateData.username = username;
      if (password) updateData.password = await bcrypt.hash(password, 10);
      if (email && email.trim() !== adminUser.email) updateData.email = email.trim();

      if (Object.keys(updateData).length === 0) {
        // Nothing actually changed
        return res.json({ success: true, message: 'No changes to apply' });
      }

      // Step 3: Update by explicit ID (avoids any subquery / search_path ambiguity)
      await customerDb
        .update(isolatedSchema.users)
        .set(updateData)
        .where(eq(isolatedSchema.users.id, adminUser.id));

      logger.info(`Customer admin credentials updated for ${customer.companyName}`);

      const adminId2 = req.session.platformAdminId!;
      const [adminRow2] = await db.select({ username: sharedSchema.platformAdmins.username }).from(sharedSchema.platformAdmins).where(eq(sharedSchema.platformAdmins.id, adminId2)).limit(1);
      await writeAudit({ adminId: adminId2, adminUsername: adminRow2?.username ?? 'unknown', action: 'customer.credentials_reset', targetType: 'customer', targetId: customerId, targetLabel: customer.companyName, details: { fieldsChanged: Object.keys(updateData) } });

      res.json({
        success: true,
        message: 'Credentials updated successfully'
      });
    } catch (error: any) {
      logger.error('Error updating customer credentials:', error);
      // Give a clear message if the username is already taken by another user
      if (error?.code === '23505' && error?.constraint?.includes('username')) {
        return res.status(409).json({
          success: false,
          error: 'That username is already in use. Please choose a different username.'
        });
      }
      if (error?.code === '23505' && error?.constraint?.includes('email')) {
        return res.status(409).json({
          success: false,
          error: 'That email is already in use by another user. Please choose a different email.'
        });
      }
      res.status(500).json({
        success: false,
        error: 'Failed to update credentials'
      });
    }
  });

  // ── User Management per customer ─────────────────────────────────────────

  const VALID_ROLES = new Set(['admin', 'user', 'security', 'fire_marshal']);

  function validateUserFields(body: any): string | null {
    const { email, role } = body;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Please enter a valid email address.';
    if (role && !VALID_ROLES.has(role)) return 'Role must be admin, user, security, or fire_marshal.';
    return null;
  }

  // 1. List users
  app.get("/platform-admin/customers/:customerId/users", requirePlatformAdmin, async (req, res) => {
    try {
      const { customerId } = req.params;
      const customerDbService = CustomerDatabaseService.getInstance();
      const customerDb = await customerDbService.getCustomerDatabase(customerId);
      const users = await customerDb
        .select({
          id: isolatedSchema.users.id,
          username: isolatedSchema.users.username,
          email: isolatedSchema.users.email,
          role: isolatedSchema.users.role,
          firstName: isolatedSchema.users.firstName,
          lastName: isolatedSchema.users.lastName,
          isActive: isolatedSchema.users.isActive,
          lastLoginAt: isolatedSchema.users.lastLoginAt,
          createdAt: isolatedSchema.users.createdAt,
        })
        .from(isolatedSchema.users)
        .orderBy(isolatedSchema.users.createdAt);
      return res.json({ success: true, users });
    } catch (error: any) {
      logger.error('Error listing customer users:', error);
      return res.status(500).json({ success: false, error: 'Failed to list users' });
    }
  });

  // 2. Create user
  app.post("/platform-admin/customers/:customerId/users", requirePlatformAdmin, async (req, res) => {
    try {
      const { customerId } = req.params;
      const { username, email, password, role = 'user', firstName = '', lastName = '' } = req.body;
      if (!username || !password) return res.status(400).json({ success: false, error: 'Username and password are required.' });
      if (password.length < 8) return res.status(400).json({ success: false, error: 'Password must be at least 8 characters.' });
      const validationError = validateUserFields(req.body);
      if (validationError) return res.status(400).json({ success: false, error: validationError });

      const customerDbService = CustomerDatabaseService.getInstance();
      const customerDb = await customerDbService.getCustomerDatabase(customerId);
      const hashedPassword = await bcrypt.hash(password, 10);
      const [newUser] = await customerDb
        .insert(isolatedSchema.users)
        .values({ username, email: email?.trim() || null, password: hashedPassword, role, firstName, lastName })
        .returning({
          id: isolatedSchema.users.id,
          username: isolatedSchema.users.username,
          email: isolatedSchema.users.email,
          role: isolatedSchema.users.role,
          firstName: isolatedSchema.users.firstName,
          lastName: isolatedSchema.users.lastName,
          isActive: isolatedSchema.users.isActive,
          createdAt: isolatedSchema.users.createdAt,
        });
      return res.status(201).json({ success: true, user: newUser });
    } catch (error: any) {
      if (error?.code === '23505' && error?.constraint?.includes('username')) {
        return res.status(409).json({ success: false, error: 'That username is already in use.' });
      }
      logger.error('Error creating customer user:', error);
      return res.status(500).json({ success: false, error: 'Failed to create user' });
    }
  });

  // 3. Update user
  app.patch("/platform-admin/customers/:customerId/users/:userId", requirePlatformAdmin, async (req, res) => {
    try {
      const { customerId, userId } = req.params;
      const { username, email, password, role, firstName, lastName, isActive } = req.body;
      const validationError = validateUserFields(req.body);
      if (validationError) return res.status(400).json({ success: false, error: validationError });
      if (password !== undefined && password !== '' && password.length < 8) {
        return res.status(400).json({ success: false, error: 'Password must be at least 8 characters.' });
      }

      const customerDbService = CustomerDatabaseService.getInstance();
      const customerDb = await customerDbService.getCustomerDatabase(customerId);

      // Lock-out guard: if disabling or demoting this user, ensure at least one other active admin remains
      const currentUsers = await customerDb.select({ id: isolatedSchema.users.id, role: isolatedSchema.users.role, isActive: isolatedSchema.users.isActive }).from(isolatedSchema.users);
      const target = currentUsers.find(u => u.id === userId);
      if (!target) return res.status(404).json({ success: false, error: 'User not found' });

      const wouldDisable = isActive === false && target.isActive;
      const wouldDemote = role !== undefined && role !== 'admin' && target.role === 'admin';
      if ((wouldDisable || wouldDemote)) {
        const activeAdmins = currentUsers.filter(u => u.role === 'admin' && u.isActive && u.id !== userId);
        if (activeAdmins.length === 0) {
          return res.status(400).json({ success: false, error: "You can't disable or demote the last active admin — the customer would be locked out." });
        }
      }

      const updateData: any = { updatedAt: new Date() };
      if (username !== undefined) updateData.username = username;
      if (email !== undefined) updateData.email = email ? email.trim() : null;
      if (password) updateData.password = await bcrypt.hash(password, 10);
      if (role !== undefined) updateData.role = role;
      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;
      if (isActive !== undefined) updateData.isActive = isActive;

      const [updated] = await customerDb
        .update(isolatedSchema.users)
        .set(updateData)
        .where(eq(isolatedSchema.users.id, userId))
        .returning({
          id: isolatedSchema.users.id,
          username: isolatedSchema.users.username,
          email: isolatedSchema.users.email,
          role: isolatedSchema.users.role,
          firstName: isolatedSchema.users.firstName,
          lastName: isolatedSchema.users.lastName,
          isActive: isolatedSchema.users.isActive,
          lastLoginAt: isolatedSchema.users.lastLoginAt,
          createdAt: isolatedSchema.users.createdAt,
        });
      return res.json({ success: true, user: updated });
    } catch (error: any) {
      if (error?.code === '23505' && error?.constraint?.includes('username')) {
        return res.status(409).json({ success: false, error: 'That username is already in use.' });
      }
      logger.error('Error updating customer user:', error);
      return res.status(500).json({ success: false, error: 'Failed to update user' });
    }
  });

  // 4. Delete user
  app.delete("/platform-admin/customers/:customerId/users/:userId", requirePlatformAdmin, async (req, res) => {
    try {
      const { customerId, userId } = req.params;
      const customerDbService = CustomerDatabaseService.getInstance();
      const customerDb = await customerDbService.getCustomerDatabase(customerId);

      const allUsers = await customerDb.select({ id: isolatedSchema.users.id, role: isolatedSchema.users.role, isActive: isolatedSchema.users.isActive }).from(isolatedSchema.users);
      const target = allUsers.find(u => u.id === userId);
      if (!target) return res.status(404).json({ success: false, error: 'User not found' });

      // Lock-out guard
      const remainingActiveAdmins = allUsers.filter(u => u.role === 'admin' && u.isActive && u.id !== userId);
      if (target.role === 'admin' && target.isActive && remainingActiveAdmins.length === 0) {
        return res.status(400).json({ success: false, error: "You can't delete the last active admin — the customer would be locked out." });
      }

      await customerDb.delete(isolatedSchema.users).where(eq(isolatedSchema.users.id, userId));
      return res.json({ success: true });
    } catch (error: any) {
      if (error?.code === '23503') {
        return res.status(409).json({ success: false, error: 'This login is linked to a staff record. Deactivate it instead, or unlink the staff record first.' });
      }
      logger.error('Error deleting customer user:', error);
      return res.status(500).json({ success: false, error: 'Failed to delete user' });
    }
  });

  // ── End User Management ───────────────────────────────────────────────────

  const KNOWN_FEATURE_KEYS = new Set([
    'featureDashboard', 'featureVisitors', 'featureContractors', 'featureContractorPage',
    'featureStaff', 'featureMembers', 'featureMeetingRooms', 'featureTimeAttendance',
    'featureMusterList', 'featureIncidentReports', 'featureHsIncidents',
    'featureFireRiskAssessment', 'featureMartynLaw', 'featureReports',
    'featureInductionSettings', 'featureKiosk', 'featureEmailOutbox',
    'featureHrModule', 'featureComplianceDashboard', 'featureSettingsPage',
    'featurePPM', 'featureAuditEngine', 'featureComplianceCertificates',
    'featurePermitToWork', 'featureRaBuilder', 'featureHelpDesk', 'featureBbs',
    'featureContractorPortal',
  ]);

  // Platform admin: read per-customer platform-level feature locks
  app.get("/platform-admin/customers/:customerId/features", requirePlatformAdmin, async (req, res) => {
    try {
      const { customerId } = req.params;
      const [row] = await db.select({ platformDisabledFeatures: sharedSchema.customers.platformDisabledFeatures })
        .from(sharedSchema.customers)
        .where(eq(sharedSchema.customers.id, customerId));
      res.json({ platformDisabledFeatures: row?.platformDisabledFeatures ?? [] });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch customer features' });
    }
  });

  // Platform admin: update per-customer platform-level feature locks
  app.patch("/platform-admin/customers/:customerId/features", requirePlatformAdmin, async (req, res) => {
    try {
      const { customerId } = req.params;
      const { platformDisabledFeatures } = z.object({
        platformDisabledFeatures: z.array(z.string()),
      }).parse(req.body);

      const invalid = platformDisabledFeatures.filter(k => !KNOWN_FEATURE_KEYS.has(k));
      if (invalid.length > 0) {
        return res.status(400).json({ success: false, error: `Unknown feature keys: ${invalid.join(', ')}` });
      }

      await db.update(sharedSchema.customers)
        .set({ platformDisabledFeatures })
        .where(eq(sharedSchema.customers.id, customerId));

      const featureAdminId = req.session.platformAdminId!;
      const [featureAdminRow] = await db.select({ username: sharedSchema.platformAdmins.username })
        .from(sharedSchema.platformAdmins)
        .where(eq(sharedSchema.platformAdmins.id, featureAdminId))
        .limit(1);
      const [customerForFeature] = await db.select({ companyName: sharedSchema.customers.companyName }).from(sharedSchema.customers).where(eq(sharedSchema.customers.id, customerId)).limit(1);
      await writeAudit({ adminId: featureAdminId, adminUsername: featureAdminRow?.username ?? 'unknown', action: 'customer.features_change', targetType: 'customer', targetId: customerId, targetLabel: customerForFeature?.companyName, details: { platformDisabledFeatures } });

      res.json({ success: true, platformDisabledFeatures });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: 'platformDisabledFeatures must be an array of strings' });
      }
      res.status(500).json({ success: false, error: 'Failed to update customer features' });
    }
  });

  app.get("/platform-admin/admins", requirePlatformAdmin, async (req, res) => {
    try {
      const admins = await db
        .select({
          id: sharedSchema.platformAdmins.id,
          username: sharedSchema.platformAdmins.username,
          email: sharedSchema.platformAdmins.email,
          firstName: sharedSchema.platformAdmins.firstName,
          lastName: sharedSchema.platformAdmins.lastName,
          role: sharedSchema.platformAdmins.role,
          isActive: sharedSchema.platformAdmins.isActive,
          lastLoginAt: sharedSchema.platformAdmins.lastLoginAt,
          createdAt: sharedSchema.platformAdmins.createdAt,
        })
        .from(sharedSchema.platformAdmins)
        .orderBy(sharedSchema.platformAdmins.createdAt);

      res.json({ success: true, admins });
    } catch (error) {
      logger.error('Error fetching platform admins:', error);
      res.status(500).json({ error: 'Failed to fetch admins' });
    }
  });

  app.post("/platform-admin/admins", requirePlatformAdmin, requireSuperAdmin, async (req, res) => {
    try {
      const { username, email, password, firstName, lastName, role } = req.body;

      if (!username || !email || !password || !firstName || !lastName) {
        return res.status(400).json({ error: 'All fields are required' });
      }

      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      const existing = await db
        .select()
        .from(sharedSchema.platformAdmins)
        .where(eq(sharedSchema.platformAdmins.username, username))
        .limit(1);

      if (existing.length > 0) {
        return res.status(409).json({ error: 'Username already exists' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const [newAdmin] = await db
        .insert(sharedSchema.platformAdmins)
        .values({
          username,
          email,
          password: hashedPassword,
          firstName,
          lastName,
          role: role || 'admin',
        })
        .returning({
          id: sharedSchema.platformAdmins.id,
          username: sharedSchema.platformAdmins.username,
          email: sharedSchema.platformAdmins.email,
          firstName: sharedSchema.platformAdmins.firstName,
          lastName: sharedSchema.platformAdmins.lastName,
          role: sharedSchema.platformAdmins.role,
          isActive: sharedSchema.platformAdmins.isActive,
          createdAt: sharedSchema.platformAdmins.createdAt,
        });

      logger.info(`Platform admin created: ${username}`);
      const creatorId = req.session.platformAdminId!;
      const [creatorRow] = await db.select({ username: sharedSchema.platformAdmins.username }).from(sharedSchema.platformAdmins).where(eq(sharedSchema.platformAdmins.id, creatorId)).limit(1);
      await writeAudit({ adminId: creatorId, adminUsername: creatorRow?.username ?? 'unknown', action: 'admin.create', targetType: 'admin', targetId: newAdmin.id, targetLabel: username, details: { role: role || 'admin' } });
      res.json({ success: true, admin: newAdmin });
    } catch (error) {
      logger.error('Error creating platform admin:', error);
      res.status(500).json({ error: 'Failed to create admin' });
    }
  });

  app.patch("/platform-admin/admins/:adminId", requirePlatformAdmin, requireSuperAdmin, async (req, res) => {
    try {
      const { adminId } = req.params;
      const { password, firstName, lastName, email, role } = req.body;

      const updateData: any = { updatedAt: new Date() };
      if (password) updateData.password = await bcrypt.hash(password, 10);
      if (firstName) updateData.firstName = firstName;
      if (lastName) updateData.lastName = lastName;
      if (email) updateData.email = email;
      if (role) updateData.role = role;

      const [updated] = await db
        .update(sharedSchema.platformAdmins)
        .set(updateData)
        .where(eq(sharedSchema.platformAdmins.id, adminId))
        .returning({
          id: sharedSchema.platformAdmins.id,
          username: sharedSchema.platformAdmins.username,
          email: sharedSchema.platformAdmins.email,
          firstName: sharedSchema.platformAdmins.firstName,
          lastName: sharedSchema.platformAdmins.lastName,
          role: sharedSchema.platformAdmins.role,
          isActive: sharedSchema.platformAdmins.isActive,
        });

      if (!updated) {
        return res.status(404).json({ error: 'Admin not found' });
      }

      logger.info(`Platform admin updated: ${updated.username}`);
      const updaterId = req.session.platformAdminId!;
      const [updaterRow] = await db.select({ username: sharedSchema.platformAdmins.username }).from(sharedSchema.platformAdmins).where(eq(sharedSchema.platformAdmins.id, updaterId)).limit(1);
      await writeAudit({ adminId: updaterId, adminUsername: updaterRow?.username ?? 'unknown', action: 'admin.update', targetType: 'admin', targetId: adminId, targetLabel: updated.username, details: { fieldsChanged: Object.keys(updateData).filter(k => k !== 'updatedAt') } });
      res.json({ success: true, admin: updated });
    } catch (error) {
      logger.error('Error updating platform admin:', error);
      res.status(500).json({ error: 'Failed to update admin' });
    }
  });

  app.delete("/platform-admin/admins/:adminId", requirePlatformAdmin, requireSuperAdmin, async (req, res) => {
    try {
      const { adminId } = req.params;
      const currentAdminId = req.session.platformAdminId!;

      if (adminId === currentAdminId) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
      }

      const [deleted] = await db
        .delete(sharedSchema.platformAdmins)
        .where(eq(sharedSchema.platformAdmins.id, adminId))
        .returning({ id: sharedSchema.platformAdmins.id, username: sharedSchema.platformAdmins.username });

      if (!deleted) {
        return res.status(404).json({ error: 'Admin not found' });
      }

      logger.info(`Platform admin deleted: ${deleted.username}`);
      const [deleterRow] = await db.select({ username: sharedSchema.platformAdmins.username }).from(sharedSchema.platformAdmins).where(eq(sharedSchema.platformAdmins.id, currentAdminId)).limit(1);
      await writeAudit({ adminId: currentAdminId, adminUsername: deleterRow?.username ?? 'unknown', action: 'admin.delete', targetType: 'admin', targetId: adminId, targetLabel: deleted.username });
      res.json({ success: true, message: `Admin ${deleted.username} deleted` });
    } catch (error) {
      logger.error('Error deleting platform admin:', error);
      res.status(500).json({ error: 'Failed to delete admin' });
    }
  });

  // ── Platform Admin Audit Log ─────────────────────────────────────────────

  /**
   * GET /platform-admin/audit — paginated audit log, newest first. Super admin only.
   */
  app.get("/platform-admin/audit", requirePlatformAdmin, requireSuperAdmin, async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const offset = Number(req.query.offset) || 0;
      const targetType = req.query.targetType as string | undefined;
      const adminIdFilter = req.query.adminId as string | undefined;

      let query = db
        .select()
        .from(sharedSchema.platformAdminAudit)
        .orderBy(desc(sharedSchema.platformAdminAudit.createdAt))
        .limit(limit)
        .offset(offset)
        .$dynamic();

      if (targetType) {
        query = query.where(eq(sharedSchema.platformAdminAudit.targetType, targetType));
      }
      if (adminIdFilter) {
        query = query.where(eq(sharedSchema.platformAdminAudit.adminId, adminIdFilter));
      }

      const rows = await query;
      res.json({ success: true, audit: rows, pagination: { limit, offset } });
    } catch (error) {
      logger.error('Error fetching audit log:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch audit log' });
    }
  });

  // ── Blog Post Management (platform admin only) ────────────────────────────

  const blogPostSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    slug: z.string().min(1, 'Slug is required').regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers and hyphens only'),
    summary: z.string().min(1, 'Summary is required'),
    content: z.string().min(1, 'Content is required'),
    author: z.string().min(1, 'Author is required'),
    status: z.enum(['draft', 'published']).default('draft'),
    coverImageUrl: z.string().refine(
      (v) => /^https?:\/\//i.test(v) || v.startsWith('/'),
      'Cover image must be a full URL (https://...) or an uploaded image path (/public-objects/...)'
    ).optional().nullable(),
    tags: z.array(z.string()).default([]),
    publishedAt: z.string().optional().nullable(),
  });

  // GET /api/admin/blog — list all posts (all statuses)
  app.get('/api/admin/blog', requirePlatformAdmin, async (_req, res) => {
    try {
      const posts = await db
        .select()
        .from(sharedSchema.blogPosts)
        .orderBy(desc(sharedSchema.blogPosts.createdAt));
      res.json({ success: true, posts });
    } catch (error) {
      logger.error('Error fetching blog posts (admin):', error);
      res.status(500).json({ error: 'Failed to fetch blog posts' });
    }
  });

  // POST /api/admin/blog — create post
  app.post('/api/admin/blog', requirePlatformAdmin, async (req, res) => {
    try {
      const data = blogPostSchema.parse(req.body);
      const now = new Date();
      const publishedAt = data.status === 'published'
        ? (data.publishedAt ? new Date(data.publishedAt) : now)
        : (data.publishedAt ? new Date(data.publishedAt) : null);

      const [post] = await db
        .insert(sharedSchema.blogPosts)
        .values({
          ...data,
          coverImageUrl: data.coverImageUrl ?? null,
          publishedAt,
          updatedAt: now,
        })
        .returning();

      logger.info(`Blog post created: ${post.slug}`);
      res.status(201).json({ success: true, post });
    } catch (error) {
      logger.error('Error creating blog post:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      res.status(500).json({ error: 'Failed to create blog post' });
    }
  });

  // PATCH /api/admin/blog/:id — update post
  app.patch('/api/admin/blog/:id', requirePlatformAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const data = blogPostSchema.partial().parse(req.body);
      const now = new Date();

      const publishedAt = data.status === 'published' && !data.publishedAt
        ? now
        : (data.publishedAt ? new Date(data.publishedAt) : undefined);

      const updatePayload: Partial<typeof sharedSchema.blogPosts.$inferInsert> & { updatedAt: Date } = {
        ...data,
        updatedAt: now,
        ...(publishedAt !== undefined ? { publishedAt } : {}),
      };

      const [post] = await db
        .update(sharedSchema.blogPosts)
        .set(updatePayload)
        .where(eq(sharedSchema.blogPosts.id, id))
        .returning();

      if (!post) return res.status(404).json({ error: 'Post not found' });

      logger.info(`Blog post updated: ${post.slug}`);
      res.json({ success: true, post });
    } catch (error) {
      logger.error('Error updating blog post:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      res.status(500).json({ error: 'Failed to update blog post' });
    }
  });

  // DELETE /api/admin/blog/:id — delete post
  app.delete('/api/admin/blog/:id', requirePlatformAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const [deleted] = await db
        .delete(sharedSchema.blogPosts)
        .where(eq(sharedSchema.blogPosts.id, id))
        .returning({ id: sharedSchema.blogPosts.id, title: sharedSchema.blogPosts.title });

      if (!deleted) return res.status(404).json({ error: 'Post not found' });

      logger.info(`Blog post deleted: ${deleted.title}`);
      res.json({ success: true, message: `Post "${deleted.title}" deleted` });
    } catch (error) {
      logger.error('Error deleting blog post:', error);
      res.status(500).json({ error: 'Failed to delete blog post' });
    }
  });

  // ── First-party analytics ─────────────────────────────────────────────────

  // POST /api/track — public (no auth), fire-and-forget page view beacon
  const TRACKED_PATHS = ['/', '/marketing', '/about', '/blog'];
  const BLOG_POST_RE = /^\/blog\/[a-z0-9-]+$/i;
  const BOT_RE = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|lighthouse|monitor|pingdom/i;
  const OWN_HOSTS = new Set(['tpr-max.com', 'www.tpr-max.com', 'localhost']);

  const trackBodySchema = z.object({
    path: z.string().startsWith('/').max(200),
    referrer: z.string().max(2000).optional(),
  });

  app.post('/api/track', async (req, res) => {
    res.status(204).end();
    try {
      const parsed = trackBodySchema.safeParse(req.body);
      if (!parsed.success) return;
      const { path, referrer } = parsed.data;

      if (!TRACKED_PATHS.includes(path) && !BLOG_POST_RE.test(path)) return;

      const ua = String(req.headers['user-agent'] || '').slice(0, 500);
      const isBot = BOT_RE.test(ua);

      const rawIp = String(
        (req.headers['x-forwarded-for'] as string) || req.ip || ''
      ).split(',')[0].trim();

      const salt = process.env.ANALYTICS_SALT || process.env.SESSION_SECRET || 'tpr-analytics';
      const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
      const visitorHash = crypto.createHash('sha256').update(salt + date + rawIp + ua).digest('hex');

      let referrerHost: string | null = null;
      if (referrer) {
        try {
          const host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, '');
          if (host && !OWN_HOSTS.has(host) && !OWN_HOSTS.has('www.' + host)) {
            referrerHost = host;
          }
        } catch {}
      }

      await db.insert(sharedSchema.pageViews).values({ path, referrerHost, visitorHash, isBot });
    } catch {}
  });

  // GET /platform-admin/traffic — platform admin only
  app.get('/platform-admin/traffic', requirePlatformAdmin, async (req, res) => {
    try {
      const rangeParam = String(req.query.range || '30d');
      const days = rangeParam === '7d' ? 7 : rangeParam === '90d' ? 90 : 30;

      const windowResult = await db.execute(sql`
        SELECT
          ((NOW() AT TIME ZONE 'Europe/London')::date - (${days} - 1) * INTERVAL '1 day')::date AS start_date,
          (NOW() AT TIME ZONE 'Europe/London')::date AS end_date
      `);
      const { start_date, end_date } = (windowResult.rows as any[])[0];

      const totalsResult = await db.execute(sql`
        SELECT
          COUNT(*) AS views,
          COUNT(DISTINCT visitor_hash) AS unique_visitors
        FROM page_views
        WHERE is_bot = false
          AND (created_at AT TIME ZONE 'Europe/London')::date >= ${start_date}::date
          AND (created_at AT TIME ZONE 'Europe/London')::date <= ${end_date}::date
      `);
      const totalsRow = (totalsResult.rows as any[])[0] || {};
      const totals = {
        views: Number(totalsRow.views ?? 0),
        uniqueVisitors: Number(totalsRow.unique_visitors ?? 0),
      };

      const seriesResult = await db.execute(sql`
        WITH date_series AS (
          SELECT generate_series(${start_date}::date, ${end_date}::date, '1 day'::interval)::date AS day
        ),
        daily_stats AS (
          SELECT
            (created_at AT TIME ZONE 'Europe/London')::date AS day,
            COUNT(*) AS views,
            COUNT(DISTINCT visitor_hash) AS unique_visitors
          FROM page_views
          WHERE is_bot = false
            AND (created_at AT TIME ZONE 'Europe/London')::date >= ${start_date}::date
            AND (created_at AT TIME ZONE 'Europe/London')::date <= ${end_date}::date
          GROUP BY 1
        )
        SELECT
          to_char(ds.day, 'YYYY-MM-DD') AS date,
          COALESCE(stats.views, 0)::int AS views,
          COALESCE(stats.unique_visitors, 0)::int AS unique_visitors
        FROM date_series ds
        LEFT JOIN daily_stats stats ON stats.day = ds.day
        ORDER BY ds.day
      `);
      const series = (seriesResult.rows as any[]).map(r => ({
        date: String(r.date),
        views: Number(r.views),
        uniqueVisitors: Number(r.unique_visitors),
      }));

      const topPagesResult = await db.execute(sql`
        SELECT path, COUNT(*) AS views
        FROM page_views
        WHERE is_bot = false
          AND (created_at AT TIME ZONE 'Europe/London')::date >= ${start_date}::date
          AND (created_at AT TIME ZONE 'Europe/London')::date <= ${end_date}::date
        GROUP BY path
        ORDER BY views DESC
        LIMIT 10
      `);
      const topPages = (topPagesResult.rows as any[]).map(r => ({
        path: String(r.path),
        views: Number(r.views),
      }));

      const topReferrersResult = await db.execute(sql`
        SELECT
          COALESCE(referrer_host, 'Direct') AS referrer_host,
          COUNT(*) AS views
        FROM page_views
        WHERE is_bot = false
          AND (created_at AT TIME ZONE 'Europe/London')::date >= ${start_date}::date
          AND (created_at AT TIME ZONE 'Europe/London')::date <= ${end_date}::date
        GROUP BY referrer_host
        ORDER BY views DESC
        LIMIT 10
      `);
      const topReferrers = (topReferrersResult.rows as any[]).map(r => ({
        referrerHost: String(r.referrer_host),
        views: Number(r.views),
      }));

      res.json({ totals, series, topPages, topReferrers });
    } catch (error) {
      logger.error('Error fetching traffic data:', error);
      res.status(500).json({ error: 'Failed to fetch traffic data' });
    }
  });
}
