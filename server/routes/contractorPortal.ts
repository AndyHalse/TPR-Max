import type { Express } from 'express';
import bcrypt from 'bcryptjs';
import {
  requireContractorPortalAuth,
  generatePortalToken,
  type PortalTokenPayload,
} from '../utils/contractorPortalAuth';
import { customerDbService } from '../customerDatabase';
import { ObjectStorageService, objectStorageClient } from '../objectStorage';
import * as isolatedSchema from '../isolatedSchema';
import { eq, and, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';
import {
  createWorker as svcCreateWorker,
  ServiceError,
  type WorkerServiceContext,
} from '../services/workerService';
import { generateLogoToken } from '../utils/logoToken';
import { EmailService } from '../emailService';

export async function registerContractorPortalRoutes(app: Express): Promise<void> {
  const multerModule = await import('multer');
  const uploadSingle = multerModule.default({
    storage: multerModule.default.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
  }).single('file');

  function portalUpload(req: any, res: any, next: any) {
    uploadSingle(req, res, (err: any) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE')
        return res.status(413).json({ error: 'File too large. Maximum 20 MB per upload.' });
      return res.status(500).json({ error: 'File upload failed.' });
    });
  }

  // ── Public: Login ──────────────────────────────────────────────────────────
  app.post('/api/contractor-portal/login', async (req, res) => {
    try {
      const { email, password, customerId } = req.body as Record<string, string>;
      if (!email || !password || !customerId) {
        return res.status(400).json({ error: 'Email, password and company ID are required.' });
      }

      let db: any;
      try {
        db = await customerDbService.getCustomerDatabase(customerId);
      } catch {
        return res.status(401).json({ error: 'Invalid company access code.' });
      }

      const candidates = await db
        .select()
        .from(isolatedSchema.contractorPortalUsers)
        .where(
          and(
            eq(isolatedSchema.contractorPortalUsers.email, email.toLowerCase().trim()),
            eq(isolatedSchema.contractorPortalUsers.isActive, true)
          )
        );

      if (!candidates.length) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      // Find all candidates whose password matches (handles duplicate-email edge case)
      const matched: typeof candidates = [];
      for (const c of candidates) {
        if (c.passwordHash && await bcrypt.compare(password, c.passwordHash)) {
          matched.push(c);
        }
      }

      if (matched.length === 0) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }
      if (matched.length > 1) {
        return res.status(409).json({
          error: 'Multiple accounts share this email address. Please use the invitation link sent to your email to log in to the correct account.',
          code: 'PORTAL_EMAIL_AMBIGUOUS',
        });
      }

      const user = matched[0];

      await db
        .update(isolatedSchema.contractorPortalUsers)
        .set({ lastLoginAt: new Date() })
        .where(eq(isolatedSchema.contractorPortalUsers.id, user.id));

      const companies = await db
        .select({ companyName: isolatedSchema.contractorCompanies.companyName })
        .from(isolatedSchema.contractorCompanies)
        .where(eq(isolatedSchema.contractorCompanies.id, user.contractorCompanyId))
        .limit(1);

      const token = generatePortalToken({
        portalUserId: user.id,
        contractorCompanyId: user.contractorCompanyId,
        customerId,
        email: user.email,
        role: user.role,
      });

      return res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          contractorCompanyId: user.contractorCompanyId,
          companyName: companies[0]?.companyName ?? '',
          customerId,
        },
      });
    } catch (err: any) {
      logger.error('[portal-login]', err);
      return res.status(500).json({ error: 'Login failed. Please try again.' });
    }
  });

  // ── Public: Company branding (logo + name) by customerId ─────────────────
  app.get('/api/contractor-portal/branding', async (req, res) => {
    try {
      const { cid } = req.query as Record<string, string>;
      if (!cid) return res.status(400).json({ error: 'Missing cid.' });

      let db: any;
      try {
        db = await customerDbService.getCustomerDatabase(cid);
      } catch {
        return res.status(404).json({ error: 'Company not found.' });
      }

      const settings = await db
        .select({
          companyName: isolatedSchema.companySettings.companyName,
          logoUrl: isolatedSchema.companySettings.logoUrl,
        })
        .from(isolatedSchema.companySettings)
        .limit(1);

      const s = settings[0];
      const rawLogo = s?.logoUrl ?? '';
      const logoUrl = rawLogo ? `/api/public-logo/${generateLogoToken(cid)}` : '';

      return res.json({ companyName: s?.companyName ?? '', logoUrl });
    } catch (err: any) {
      logger.error('[portal-branding]', err);
      return res.status(500).json({ error: 'Failed to load branding.' });
    }
  });

  // ── Public: Look up invite token → return pre-fill data ──────────────────
  app.get('/api/contractor-portal/invite-info', async (req, res) => {
    try {
      const { token, cid } = req.query as Record<string, string>;
      if (!token || !cid) return res.status(400).json({ error: 'Missing token or cid.' });

      const db = await customerDbService.getCustomerDatabase(cid);

      const [usersResult, settingsResult] = await Promise.all([
        db
          .select()
          .from(isolatedSchema.contractorPortalUsers)
          .where(eq(isolatedSchema.contractorPortalUsers.inviteToken, token))
          .limit(1),
        db
          .select({ companyName: isolatedSchema.companySettings.companyName, logoUrl: isolatedSchema.companySettings.logoUrl })
          .from(isolatedSchema.companySettings)
          .limit(1),
      ]);

      const user = usersResult[0];
      if (!user) return res.status(404).json({ error: 'Invalid or expired invitation.' });
      if (user.inviteExpiresAt && new Date(user.inviteExpiresAt) < new Date()) {
        return res.status(410).json({ error: 'This invitation has expired. Please ask for a new one.' });
      }

      const s = settingsResult[0];
      const rawLogo = s?.logoUrl ?? '';
      const logoUrl = rawLogo ? `/api/public-logo/${generateLogoToken(cid)}` : '';

      return res.json({
        email: user.email,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        companyName: s?.companyName ?? '',
        logoUrl,
      });
    } catch (err: any) {
      logger.error('[portal-invite-info]', err);
      return res.status(500).json({ error: 'Failed to load invite.' });
    }
  });

  // ── Public: Accept Invite ──────────────────────────────────────────────────
  app.post('/api/contractor-portal/accept-invite', async (req, res) => {
    try {
      const { inviteToken, password, firstName, lastName, customerId } =
        req.body as Record<string, string>;
      if (!inviteToken || !password || !customerId) {
        return res.status(400).json({ error: 'Invite token, password and company ID are required.' });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters.' });
      }

      let db: any;
      try {
        db = await customerDbService.getCustomerDatabase(customerId);
      } catch {
        return res.status(400).json({ error: 'Invalid company access code.' });
      }

      const users = await db
        .select()
        .from(isolatedSchema.contractorPortalUsers)
        .where(eq(isolatedSchema.contractorPortalUsers.inviteToken, inviteToken))
        .limit(1);

      const user = users[0];
      if (!user) {
        return res.status(400).json({ error: 'Invitation not found or already used.' });
      }
      if (user.inviteExpiresAt && new Date(user.inviteExpiresAt) < new Date()) {
        return res.status(400).json({
          error: 'This invitation has expired. Please ask the site administrator for a new one.',
        });
      }

      const hash = await bcrypt.hash(password, 12);
      await db
        .update(isolatedSchema.contractorPortalUsers)
        .set({
          passwordHash: hash,
          inviteToken: null,
          inviteExpiresAt: null,
          isActive: true,
          firstName: firstName?.trim() || user.firstName,
          lastName: lastName?.trim() || user.lastName,
          lastLoginAt: new Date(),
        })
        .where(eq(isolatedSchema.contractorPortalUsers.id, user.id));

      const companies = await db
        .select({ companyName: isolatedSchema.contractorCompanies.companyName })
        .from(isolatedSchema.contractorCompanies)
        .where(eq(isolatedSchema.contractorCompanies.id, user.contractorCompanyId))
        .limit(1);

      const token = generatePortalToken({
        portalUserId: user.id,
        contractorCompanyId: user.contractorCompanyId,
        customerId,
        email: user.email,
        role: user.role,
      });

      // Send welcome/login-details email so contractor has their credentials saved
      try {
        const resolvedFirst = firstName?.trim() || user.firstName;
        const companyDisplayName = companies[0]?.companyName ?? '';
        const emailSvc = new EmailService(customerId);
        const settings = await db.select({ companyName: isolatedSchema.companySettings.companyName }).from(isolatedSchema.companySettings).limit(1);
        const siteCompanyName = settings[0]?.companyName ?? companyDisplayName;
        const portalLoginUrl = `${req.protocol}://${req.get('host')}/contractor-portal/login`;
        await emailSvc.sendEmail({
          to: user.email,
          subject: `Your Contractor Portal login details — ${siteCompanyName}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
              <h2 style="color:#1e293b">Contractor Portal — Account Activated</h2>
              <p>Hello${resolvedFirst ? ` ${resolvedFirst}` : ''},</p>
              <p>Your contractor portal account for <strong>${siteCompanyName}</strong> has been activated. Please save this email — it contains the details you'll need every time you log in.</p>
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:24px 0">
                <p style="margin:0 0 12px;font-weight:bold;color:#0f172a">Your login details</p>
                <table style="width:100%;border-collapse:collapse">
                  <tr>
                    <td style="padding:6px 0;color:#64748b;font-size:14px;width:140px">Portal URL</td>
                    <td style="padding:6px 0;font-size:14px"><a href="${portalLoginUrl}" style="color:#2563eb">${portalLoginUrl}</a></td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;color:#64748b;font-size:14px">Email (username)</td>
                    <td style="padding:6px 0;font-size:14px;font-weight:bold">${user.email}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;color:#64748b;font-size:14px">Password</td>
                    <td style="padding:6px 0;font-size:14px;color:#64748b">The password you just set</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;color:#64748b;font-size:14px">Company access code</td>
                    <td style="padding:6px 0;font-size:14px;font-family:monospace;font-weight:bold;background:#f1f5f9;padding:4px 8px;border-radius:4px">${customerId}</td>
                  </tr>
                </table>
              </div>
              <p style="color:#64748b;font-size:13px">You'll need all three — your email, your password, and the company access code — each time you sign in on a new device.</p>
              <p style="color:#64748b;font-size:13px">If you ever forget your password, use the <strong>Forgot password?</strong> link on the login page to reset it.</p>
              <p style="color:#94a3b8;font-size:12px;margin-top:24px">If you did not create this account, please contact ${siteCompanyName} immediately.</p>
            </div>
          `,
          text: `Contractor Portal — Account Activated\n\nHello${resolvedFirst ? ` ${resolvedFirst}` : ''},\n\nYour contractor portal account for ${siteCompanyName} is now active.\n\nYour login details:\n  Portal: ${portalLoginUrl}\n  Email: ${user.email}\n  Password: the password you just set\n  Company access code: ${customerId}\n\nKeep this email safe — you'll need these details each time you sign in.`,
        });
      } catch (emailErr: any) {
        logger.warn('[portal-accept-invite] Welcome email failed:', emailErr.message?.substring(0, 80));
      }

      return res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: firstName?.trim() || user.firstName,
          lastName: lastName?.trim() || user.lastName,
          role: user.role,
          contractorCompanyId: user.contractorCompanyId,
          companyName: companies[0]?.companyName ?? '',
          customerId,
        },
      });
    } catch (err: any) {
      logger.error('[portal-accept-invite]', err);
      return res.status(500).json({ error: 'Failed to accept invitation. Please try again.' });
    }
  });

  // ── Public: Forgot Password ───────────────────────────────────────────────
  app.post('/api/contractor-portal/forgot-password', async (req, res) => {
    try {
      const { email, customerId } = req.body as Record<string, string>;
      if (!email || !customerId) {
        return res.status(400).json({ error: 'Email and company access code are required.' });
      }

      let db: any;
      try {
        db = await customerDbService.getCustomerDatabase(customerId);
      } catch {
        // Don't reveal if company ID is invalid
        return res.json({ success: true });
      }

      const users = await db
        .select()
        .from(isolatedSchema.contractorPortalUsers)
        .where(
          and(
            eq(isolatedSchema.contractorPortalUsers.email, email.toLowerCase().trim()),
            eq(isolatedSchema.contractorPortalUsers.isActive, true)
          )
        )
        .limit(1);

      // Always return success to prevent email enumeration
      if (!users.length) return res.json({ success: true });

      const user = users[0];
      const resetToken = randomUUID();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await db
        .update(isolatedSchema.contractorPortalUsers)
        .set({ passwordResetToken: resetToken, passwordResetExpiresAt: expiresAt })
        .where(eq(isolatedSchema.contractorPortalUsers.id, user.id));

      const settings = await db
        .select({ companyName: isolatedSchema.companySettings.companyName })
        .from(isolatedSchema.companySettings)
        .limit(1);
      const siteCompanyName = settings[0]?.companyName ?? '';

      const resetUrl = `/contractor-portal/reset-password?token=${resetToken}&cid=${customerId}`;

      try {
        const emailSvc = new EmailService(customerId);
        await emailSvc.sendEmail({
          to: user.email,
          subject: `Reset your Contractor Portal password — ${siteCompanyName}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
              <h2 style="color:#1e293b">Password Reset Request</h2>
              <p>Hello${user.firstName ? ` ${user.firstName}` : ''},</p>
              <p>We received a request to reset the password for your contractor portal account at <strong>${siteCompanyName}</strong>.</p>
              <p>Click the button below to choose a new password. This link expires in <strong>1 hour</strong>.</p>
              <p style="text-align:center;margin:32px 0">
                <a href="${resetUrl}" style="background:#2563eb;color:white;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">
                  Reset My Password
                </a>
              </p>
              <p style="color:#64748b;font-size:13px">If you didn't request a password reset, you can safely ignore this email — your password will not change.</p>
              <p style="color:#64748b;font-size:13px">Your company access code is: <strong>${customerId}</strong></p>
            </div>
          `,
          text: `Password Reset Request\n\nHello${user.firstName ? ` ${user.firstName}` : ''},\n\nClick the link below to reset your contractor portal password (expires in 1 hour):\n${resetUrl}\n\nIf you didn't request this, ignore this email.`,
        });
      } catch (emailErr: any) {
        logger.warn('[portal-forgot-password] Email failed:', emailErr.message?.substring(0, 80));
      }

      return res.json({ success: true });
    } catch (err: any) {
      logger.error('[portal-forgot-password]', err);
      return res.status(500).json({ error: 'Failed to process request. Please try again.' });
    }
  });

  // ── Public: Reset Password ────────────────────────────────────────────────
  app.post('/api/contractor-portal/reset-password', async (req, res) => {
    try {
      const { resetToken, customerId, password } = req.body as Record<string, string>;
      if (!resetToken || !customerId || !password) {
        return res.status(400).json({ error: 'Reset token, company access code, and new password are required.' });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters.' });
      }

      let db: any;
      try {
        db = await customerDbService.getCustomerDatabase(customerId);
      } catch {
        return res.status(400).json({ error: 'Invalid company access code.' });
      }

      const users = await db
        .select()
        .from(isolatedSchema.contractorPortalUsers)
        .where(eq(isolatedSchema.contractorPortalUsers.passwordResetToken, resetToken))
        .limit(1);

      if (!users.length) {
        return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
      }

      const user = users[0];
      if (!user.passwordResetExpiresAt || new Date(user.passwordResetExpiresAt) < new Date()) {
        return res.status(400).json({ error: 'This reset link has expired. Please request a new one.' });
      }

      const hash = await bcrypt.hash(password, 12);
      await db
        .update(isolatedSchema.contractorPortalUsers)
        .set({ passwordHash: hash, passwordResetToken: null, passwordResetExpiresAt: null })
        .where(eq(isolatedSchema.contractorPortalUsers.id, user.id));

      return res.json({ success: true });
    } catch (err: any) {
      logger.error('[portal-reset-password]', err);
      return res.status(500).json({ error: 'Failed to reset password. Please try again.' });
    }
  });

  // ── Auth: Me ───────────────────────────────────────────────────────────────
  app.get('/api/contractor-portal/me', requireContractorPortalAuth, async (req, res) => {
    try {
      const pu = (req as any).portalUser as PortalTokenPayload;
      const db = await customerDbService.getCustomerDatabase(pu.customerId);

      const users = await db
        .select()
        .from(isolatedSchema.contractorPortalUsers)
        .where(eq(isolatedSchema.contractorPortalUsers.id, pu.portalUserId))
        .limit(1);

      const user = users[0];
      if (!user) return res.status(404).json({ error: 'User not found.' });

      const companies = await db
        .select()
        .from(isolatedSchema.contractorCompanies)
        .where(eq(isolatedSchema.contractorCompanies.id, user.contractorCompanyId))
        .limit(1);

      const company = companies[0];

      const settingsRows = await db
        .select({ logoUrl: isolatedSchema.companySettings.logoUrl })
        .from(isolatedSchema.companySettings)
        .limit(1);
      const rawLogo = settingsRows[0]?.logoUrl ?? '';
      const logoUrl = rawLogo ? `/api/public-logo/${generateLogoToken(pu.customerId)}` : '';

      // Get onboarding status via raw SQL (not in Drizzle schema)
      let onboardingStatus = 'not_started';
      try {
        const pool = (db as any).$client ?? (db as any).session?.client;
        const schemaName = customerDbService.generateSchemaName(pu.customerId);
        const osResult = await pool.query(
          `SELECT onboarding_status FROM "${schemaName}".contractor_companies WHERE id = $1 LIMIT 1`,
          [pu.contractorCompanyId]
        );
        onboardingStatus = osResult.rows[0]?.onboarding_status ?? 'not_started';
      } catch (_) { /* non-fatal — column may not exist on old schema */ }

      return res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        contractorCompanyId: user.contractorCompanyId,
        companyName: company?.companyName ?? '',
        industry: company?.industry ?? '',
        contactEmail: company?.contactEmail ?? '',
        companyStatus: company?.status ?? '',
        customerId: pu.customerId,
        logoUrl,
        onboardingStatus,
      });
    } catch (err: any) {
      logger.error('[portal-me]', err);
      return res.status(500).json({ error: 'Failed to load user.' });
    }
  });

  // ── Auth: List documents ───────────────────────────────────────────────────
  app.get('/api/contractor-portal/documents', requireContractorPortalAuth, async (req, res) => {
    try {
      const pu = (req as any).portalUser as PortalTokenPayload;
      const db = await customerDbService.getCustomerDatabase(pu.customerId);

      const docs = await db
        .select()
        .from(isolatedSchema.contractorDocuments)
        .where(
          and(
            eq(isolatedSchema.contractorDocuments.companyId, pu.contractorCompanyId),
            eq(isolatedSchema.contractorDocuments.isActive, true)
          )
        )
        .orderBy(desc(isolatedSchema.contractorDocuments.uploadedAt));

      return res.json(docs);
    } catch (err: any) {
      logger.error('[portal-documents]', err);
      return res.status(500).json({ error: 'Failed to load documents.' });
    }
  });

  // ── Auth: Upload document ──────────────────────────────────────────────────
  app.post(
    '/api/contractor-portal/documents/upload',
    requireContractorPortalAuth,
    portalUpload,
    async (req: any, res: any) => {
      try {
        const pu = req.portalUser as PortalTokenPayload;

        if (!req.file) {
          return res.status(400).json({ error: 'No file was uploaded.' });
        }

        const { documentType, documentName, expiryDate, issuedBy } =
          req.body as Record<string, string>;
        if (!documentType || !documentName) {
          return res.status(400).json({ error: 'Document type and name are required.' });
        }

        let documentUrl: string;
        try {
          const objService = new ObjectStorageService();
          const privateDir = objService.getPrivateObjectDir();
          const objectId = randomUUID();
          const ext = (req.file.originalname.split('.').pop() ?? 'bin').toLowerCase();
          const fullPath = `${privateDir}/${pu.customerId}/contractor-portal/${objectId}.${ext}`;
          const parts = fullPath.slice(1).split('/');
          const bucketName = parts[0];
          const objectName = parts.slice(1).join('/');

          await objectStorageClient.bucket(bucketName).file(objectName).save(req.file.buffer, {
            contentType: req.file.mimetype,
            resumable: false,
          });
          documentUrl = `/objects/${pu.customerId}/contractor-portal/${objectId}.${ext}`;
        } catch (storageErr: any) {
          logger.error('[portal-upload] Object storage save failed:', storageErr?.message);
          return res.status(502).json({
            error: 'We could not store your file right now. Please try again in a moment.',
          });
        }

        const db = await customerDbService.getCustomerDatabase(pu.customerId);
        const [doc] = await db
          .insert(isolatedSchema.contractorDocuments)
          .values({
            companyId: pu.contractorCompanyId,
            documentName,
            documentType,
            documentUrl,
            expiryDate: expiryDate ? new Date(expiryDate) : null,
            issuedBy: issuedBy || null,
            uploadedBy: `portal:${pu.portalUserId}`,
            status: 'pending',
            isActive: true,
          })
          .returning();

        // Notify admin that a new document is awaiting review (non-fatal)
        try {
          const notifyEmail = process.env.CONTRACTOR_NOTIFY_EMAIL || process.env.BUG_REPORT_NOTIFY_EMAIL || 'andy@acsltd.eu';
          const emailSvc = new EmailService(pu.customerId);
          const baseUrl = process.env.APP_URL || process.env.REPL_SLUG ? `https://${process.env.REPL_SLUG}.replit.app` : 'https://www.tpr-max.com';
          await emailSvc.sendEmail({
            to: notifyEmail,
            subject: `📋 Document awaiting review — ${documentName}`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
                <div style="background:#2460A9;padding:16px 24px;border-radius:8px 8px 0 0">
                  <p style="color:white;margin:0;font-size:18px;font-weight:bold">TPR — Document Awaiting Review</p>
                </div>
                <div style="padding:20px 24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
                  <p>A contractor has uploaded a new document that needs your review.</p>
                  <table style="width:100%;border-collapse:collapse;margin:16px 0">
                    <tr><td style="padding:6px 0;color:#64748b;width:140px">Document</td><td style="padding:6px 0;font-weight:600">${documentName}</td></tr>
                    <tr><td style="padding:6px 0;color:#64748b">Type</td><td style="padding:6px 0">${documentType}</td></tr>
                    ${expiryDate ? `<tr><td style="padding:6px 0;color:#64748b">Expiry</td><td style="padding:6px 0">${new Date(expiryDate).toLocaleDateString('en-GB')}</td></tr>` : ''}
                  </table>
                  <a href="${baseUrl}/contractor-portal-admin" style="display:inline-block;background:#2460A9;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;margin-top:8px">Review in Portal Admin →</a>
                </div>
              </div>
            `,
            text: `Document Awaiting Review\n\nDocument: ${documentName}\nType: ${documentType}${expiryDate ? `\nExpiry: ${new Date(expiryDate).toLocaleDateString('en-GB')}` : ''}\n\nReview at: ${baseUrl}/contractor-portal-admin`,
          });
        } catch (_) { /* non-fatal — upload already succeeded */ }

        // Auto-advance onboarding status: not_started → in_progress (or changes_requested → in_progress on re-upload)
        try {
          const pool = (db as any).$client ?? (db as any).session?.client;
          const schemaName = customerDbService.generateSchemaName(pu.customerId);
          await pool.query(
            `UPDATE "${schemaName}".contractor_companies SET onboarding_status = 'in_progress', updated_at = NOW() WHERE id = $1 AND onboarding_status IN ('not_started', 'changes_requested')`,
            [pu.contractorCompanyId]
          );
        } catch (_) { /* non-fatal */ }

        return res.status(201).json(doc);
      } catch (err: any) {
        logger.error('[portal-upload]', err);
        return res.status(500).json({ error: 'Failed to upload document. Please try again.' });
      }
    }
  );

  // ── Auth: List workers ─────────────────────────────────────────────────────
  app.get('/api/contractor-portal/workers', requireContractorPortalAuth, async (req, res) => {
    try {
      const pu = (req as any).portalUser as PortalTokenPayload;
      const db = await customerDbService.getCustomerDatabase(pu.customerId);

      const workers = await db
        .select()
        .from(isolatedSchema.contractorWorkers)
        .where(eq(isolatedSchema.contractorWorkers.companyId, pu.contractorCompanyId))
        .orderBy(isolatedSchema.contractorWorkers.firstName);

      return res.json(workers);
    } catch (err: any) {
      logger.error('[portal-workers]', err);
      return res.status(500).json({ error: 'Failed to load workers.' });
    }
  });

  // ── Auth: Worker certification types (one-per-customer catalogue) ─────────
  app.get('/api/contractor-portal/worker-cert-types', requireContractorPortalAuth, async (req, res) => {
    try {
      const pu = (req as any).portalUser as PortalTokenPayload;
      const custDb = await customerDbService.getCustomerDatabase(pu.customerId);
      const schemaName = customerDbService.generateSchemaName(pu.customerId);
      const pool = (custDb as any).$client ?? (custDb as any).session?.client;
      const result = await pool.query(
        `SELECT * FROM "${schemaName}".worker_certification_types
         WHERE is_active = TRUE
         ORDER BY CASE category WHEN 'legal' THEN 1 WHEN 'site' THEN 2 WHEN 'training' THEN 3 ELSE 4 END, name`
      );
      return res.json(result.rows ?? []);
    } catch (err: any) {
      logger.error('[portal-cert-types]', err);
      return res.status(500).json({ error: 'Failed to load certification types.' });
    }
  });

  // ── Auth: Add worker ──────────────────────────────────────────────────────
  app.post('/api/contractor-portal/workers', requireContractorPortalAuth, async (req, res) => {
    try {
      const pu = (req as any).portalUser as PortalTokenPayload;
      const db = await customerDbService.getCustomerDatabase(pu.customerId);
      // actor = the portal user's email (recorded in audit notes as portal:<email>)
      const svcCtx: WorkerServiceContext = { db, customerId: pu.customerId, actor: pu.email };
      const worker = await svcCreateWorker(svcCtx, pu.contractorCompanyId, req.body, 'portal');
      return res.status(201).json(worker);
    } catch (err: any) {
      if (err instanceof ServiceError) {
        return res.status(err.status).json({ error: err.message });
      }
      logger.error('[portal-add-worker]', err);
      return res.status(500).json({ error: 'Failed to add worker.' });
    }
  });

  // ── Auth: List worker documents ────────────────────────────────────────────
  app.get('/api/contractor-portal/workers/:workerId/documents', requireContractorPortalAuth, async (req, res) => {
    try {
      const pu = (req as any).portalUser as PortalTokenPayload;
      const { workerId } = req.params;
      const db = await customerDbService.getCustomerDatabase(pu.customerId);

      const [worker] = await db
        .select({ id: isolatedSchema.contractorWorkers.id })
        .from(isolatedSchema.contractorWorkers)
        .where(
          and(
            eq(isolatedSchema.contractorWorkers.id, workerId),
            eq(isolatedSchema.contractorWorkers.companyId, pu.contractorCompanyId)
          )
        )
        .limit(1);

      if (!worker) return res.status(403).json({ error: 'Worker not found or access denied.' });

      const docs = await db
        .select()
        .from(isolatedSchema.contractorDocuments)
        .where(
          and(
            eq(isolatedSchema.contractorDocuments.workerId, workerId),
            eq(isolatedSchema.contractorDocuments.isActive, true)
          )
        )
        .orderBy(desc(isolatedSchema.contractorDocuments.uploadedAt));

      return res.json(docs);
    } catch (err: any) {
      logger.error('[portal-worker-docs-list]', err);
      return res.status(500).json({ error: 'Failed to load worker documents.' });
    }
  });

  // ── Auth: Upload worker document ───────────────────────────────────────────
  app.post(
    '/api/contractor-portal/workers/:workerId/documents',
    requireContractorPortalAuth,
    portalUpload,
    async (req: any, res: any) => {
      try {
        const pu = req.portalUser as PortalTokenPayload;
        const { workerId } = req.params;
        const db = await customerDbService.getCustomerDatabase(pu.customerId);

        const [worker] = await db
          .select({ id: isolatedSchema.contractorWorkers.id })
          .from(isolatedSchema.contractorWorkers)
          .where(
            and(
              eq(isolatedSchema.contractorWorkers.id, workerId),
              eq(isolatedSchema.contractorWorkers.companyId, pu.contractorCompanyId)
            )
          )
          .limit(1);

        if (!worker) return res.status(403).json({ error: 'Worker not found or access denied.' });
        if (!req.file) return res.status(400).json({ error: 'No file was uploaded.' });

        const { documentType, documentName, expiryDate, issuedBy } =
          req.body as Record<string, string>;
        if (!documentType || !documentName) {
          return res.status(400).json({ error: 'Document type and name are required.' });
        }

        let documentUrl: string;
        try {
          const objService = new ObjectStorageService();
          const privateDir = objService.getPrivateObjectDir();
          const objectId = randomUUID();
          const ext = (req.file.originalname.split('.').pop() ?? 'bin').toLowerCase();
          const fullPath = `${privateDir}/${pu.customerId}/contractor-portal/workers/${objectId}.${ext}`;
          const parts = fullPath.slice(1).split('/');
          const bucketName = parts[0];
          const objectName = parts.slice(1).join('/');

          await objectStorageClient.bucket(bucketName).file(objectName).save(req.file.buffer, {
            contentType: req.file.mimetype,
            resumable: false,
          });
          documentUrl = `/objects/${pu.customerId}/contractor-portal/workers/${objectId}.${ext}`;
        } catch (storageErr: any) {
          logger.error('[portal-worker-upload] Storage failed:', storageErr?.message);
          return res.status(502).json({ error: 'Could not store file. Please try again.' });
        }

        const [doc] = await db
          .insert(isolatedSchema.contractorDocuments)
          .values({
            companyId: pu.contractorCompanyId,
            workerId,
            documentName,
            documentType,
            documentUrl,
            expiryDate: expiryDate ? new Date(expiryDate) : null,
            issuedBy: issuedBy || null,
            uploadedBy: `portal:${pu.portalUserId}`,
            status: 'pending',
            isActive: true,
          })
          .returning();

        // Notify admin that a new worker document is awaiting review (non-fatal)
        try {
          const notifyEmail = process.env.CONTRACTOR_NOTIFY_EMAIL || process.env.BUG_REPORT_NOTIFY_EMAIL || 'andy@acsltd.eu';
          const emailSvc = new EmailService(pu.customerId);
          const baseUrl = process.env.APP_URL || process.env.REPL_SLUG ? `https://${process.env.REPL_SLUG}.replit.app` : 'https://www.tpr-max.com';

          // Resolve worker name for the email (non-fatal if it fails)
          let workerLabel = 'a worker';
          try {
            const [w] = await db
              .select({ firstName: isolatedSchema.contractorWorkers.firstName, lastName: isolatedSchema.contractorWorkers.lastName })
              .from(isolatedSchema.contractorWorkers)
              .where(eq(isolatedSchema.contractorWorkers.id, workerId))
              .limit(1);
            if (w) workerLabel = [w.firstName, w.lastName].filter(Boolean).join(' ') || workerLabel;
          } catch (_) {}

          await emailSvc.sendEmail({
            to: notifyEmail,
            subject: `📋 Worker document awaiting review — ${documentName} (${workerLabel})`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
                <div style="background:#2460A9;padding:16px 24px;border-radius:8px 8px 0 0">
                  <p style="color:white;margin:0;font-size:18px;font-weight:bold">TPR — Worker Document Awaiting Review</p>
                </div>
                <div style="padding:20px 24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
                  <p>A contractor has uploaded a worker document that needs your review.</p>
                  <table style="width:100%;border-collapse:collapse;margin:16px 0">
                    <tr><td style="padding:6px 0;color:#64748b;width:140px">Worker</td><td style="padding:6px 0;font-weight:600">${workerLabel}</td></tr>
                    <tr><td style="padding:6px 0;color:#64748b">Document</td><td style="padding:6px 0;font-weight:600">${documentName}</td></tr>
                    <tr><td style="padding:6px 0;color:#64748b">Type</td><td style="padding:6px 0">${documentType}</td></tr>
                    ${expiryDate ? `<tr><td style="padding:6px 0;color:#64748b">Expiry</td><td style="padding:6px 0">${new Date(expiryDate).toLocaleDateString('en-GB')}</td></tr>` : ''}
                  </table>
                  <a href="${baseUrl}/contractor-portal-admin" style="display:inline-block;background:#2460A9;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;margin-top:8px">Review in Portal Admin →</a>
                </div>
              </div>
            `,
            text: `Worker Document Awaiting Review\n\nWorker: ${workerLabel}\nDocument: ${documentName}\nType: ${documentType}${expiryDate ? `\nExpiry: ${new Date(expiryDate).toLocaleDateString('en-GB')}` : ''}\n\nReview at: ${baseUrl}/contractor-portal-admin`,
          });
        } catch (_) { /* non-fatal — upload already succeeded */ }

        // Auto-advance onboarding status on any upload
        try {
          const pool2 = (db as any).$client ?? (db as any).session?.client;
          const schemaName2 = customerDbService.generateSchemaName(pu.customerId);
          await pool2.query(
            `UPDATE "${schemaName2}".contractor_companies SET onboarding_status = 'in_progress', updated_at = NOW() WHERE id = $1 AND onboarding_status IN ('not_started', 'changes_requested')`,
            [pu.contractorCompanyId]
          );
        } catch (_) { /* non-fatal */ }

        return res.status(201).json(doc);
      } catch (err: any) {
        logger.error('[portal-worker-upload]', err);
        return res.status(500).json({ error: 'Failed to upload worker document.' });
      }
    }
  );

  // ── Auth: Onboarding progress ─────────────────────────────────────────────
  app.get('/api/contractor-portal/onboarding-progress', requireContractorPortalAuth, async (req, res) => {
    try {
      const pu = (req as any).portalUser as PortalTokenPayload;
      const db = await customerDbService.getCustomerDatabase(pu.customerId);
      const pool = (db as any).$client ?? (db as any).session?.client;
      const schemaName = customerDbService.generateSchemaName(pu.customerId);

      // Load requirements + company onboarding status in parallel
      const [reqResult, companyResult, docs] = await Promise.all([
        pool.query(
          `SELECT document_type, label, is_required FROM "${schemaName}".contractor_onboarding_requirements ORDER BY sort_order`
        ),
        pool.query(
          `SELECT onboarding_status, onboarding_submitted_at, onboarding_approved_at FROM "${schemaName}".contractor_companies WHERE id = $1 LIMIT 1`,
          [pu.contractorCompanyId]
        ),
        db
          .select({
            documentType: isolatedSchema.contractorDocuments.documentType,
            status: isolatedSchema.contractorDocuments.status,
            expiryDate: isolatedSchema.contractorDocuments.expiryDate,
          })
          .from(isolatedSchema.contractorDocuments)
          .where(
            and(
              eq(isolatedSchema.contractorDocuments.companyId, pu.contractorCompanyId),
              eq(isolatedSchema.contractorDocuments.isActive, true)
            )
          ),
      ]);

      const requirements: Array<{ document_type: string; label: string; is_required: boolean }> = reqResult.rows;
      const company = companyResult.rows[0];
      const onboardingStatus: string = company?.onboarding_status ?? 'not_started';
      const onboardingSubmittedAt: string | null = company?.onboarding_submitted_at ?? null;
      const onboardingApprovedAt: string | null = company?.onboarding_approved_at ?? null;

      const now = new Date();
      const requiredTypes = requirements.filter((r) => r.is_required);
      const completedRequired = requiredTypes.filter((r) => {
        const matching = docs.filter((d: any) => d.documentType === r.document_type);
        return matching.some((d: any) => {
          if (d.status === 'rejected') return false;
          if (d.expiryDate && new Date(d.expiryDate) < now) return false;
          return true;
        });
      });

      // Get latest changes-requested reason from audit
      let changesRequestedReason: string | null = null;
      if (onboardingStatus === 'changes_requested') {
        try {
          const auditResult = await pool.query(
            `SELECT reason FROM "${schemaName}".contractor_onboarding_audit WHERE company_id = $1 AND action = 'changes_requested' ORDER BY created_at DESC LIMIT 1`,
            [pu.contractorCompanyId]
          );
          changesRequestedReason = auditResult.rows[0]?.reason ?? null;
        } catch (_) {}
      }

      const canSubmit =
        completedRequired.length >= requiredTypes.length &&
        requiredTypes.length > 0 &&
        ['not_started', 'in_progress', 'changes_requested'].includes(onboardingStatus);

      return res.json({
        onboardingStatus,
        onboardingSubmittedAt,
        onboardingApprovedAt,
        requirements,
        requiredCount: requiredTypes.length,
        completedCount: completedRequired.length,
        canSubmit,
        missingRequired: requiredTypes
          .filter((r) => !completedRequired.includes(r))
          .map((r) => r.label),
        changesRequestedReason,
      });
    } catch (err: any) {
      logger.error('[portal-onboarding-progress]', err);
      return res.status(500).json({ error: 'Failed to load onboarding progress.' });
    }
  });

  // ── Auth: Submit for review ────────────────────────────────────────────────
  app.post('/api/contractor-portal/submit-for-review', requireContractorPortalAuth, async (req, res) => {
    try {
      const pu = (req as any).portalUser as PortalTokenPayload;
      const db = await customerDbService.getCustomerDatabase(pu.customerId);
      const pool = (db as any).$client ?? (db as any).session?.client;
      const schemaName = customerDbService.generateSchemaName(pu.customerId);

      // Server-side re-check: get required types
      const reqResult = await pool.query(
        `SELECT document_type, label FROM "${schemaName}".contractor_onboarding_requirements WHERE is_required = true ORDER BY sort_order`
      );
      const requiredTypes: Array<{ document_type: string; label: string }> = reqResult.rows;

      const docs = await db
        .select({
          documentType: isolatedSchema.contractorDocuments.documentType,
          status: isolatedSchema.contractorDocuments.status,
          expiryDate: isolatedSchema.contractorDocuments.expiryDate,
        })
        .from(isolatedSchema.contractorDocuments)
        .where(
          and(
            eq(isolatedSchema.contractorDocuments.companyId, pu.contractorCompanyId),
            eq(isolatedSchema.contractorDocuments.isActive, true)
          )
        );

      const now = new Date();
      const missing: string[] = [];
      for (const req of requiredTypes) {
        const valid = docs.some((d: any) => {
          if (d.documentType !== req.document_type) return false;
          if (d.status === 'rejected') return false;
          if (d.expiryDate && new Date(d.expiryDate) < now) return false;
          return true;
        });
        if (!valid) missing.push(req.label);
      }

      if (missing.length > 0) {
        return res.status(400).json({ error: 'Not all required documents are complete.', missing });
      }

      await pool.query(
        `UPDATE "${schemaName}".contractor_companies SET onboarding_status = 'submitted', onboarding_submitted_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [pu.contractorCompanyId]
      );
      await pool.query(
        `INSERT INTO "${schemaName}".contractor_onboarding_audit (company_id, action, actor) VALUES ($1, 'submitted', $2)`,
        [pu.contractorCompanyId, `portal:${pu.portalUserId}`]
      );

      // Notify admin (non-fatal)
      try {
        const notifyEmail = process.env.CONTRACTOR_NOTIFY_EMAIL || process.env.BUG_REPORT_NOTIFY_EMAIL || 'andy@acsltd.eu';
        const emailSvc = new EmailService(pu.customerId);
        const companyResult = await pool.query(
          `SELECT company_name FROM "${schemaName}".contractor_companies WHERE id = $1`,
          [pu.contractorCompanyId]
        );
        const companyName = companyResult.rows[0]?.company_name || 'A contractor';
        const baseUrl = process.env.APP_URL || 'https://www.tpr-max.com';
        await emailSvc.sendEmail({
          to: notifyEmail,
          subject: `🔔 Onboarding submission — ${companyName} is ready for review`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
              <div style="background:#2460A9;padding:16px 24px;border-radius:8px 8px 0 0">
                <p style="color:white;margin:0;font-size:18px;font-weight:bold">Onboarding Submission</p>
              </div>
              <div style="padding:20px 24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
                <p><strong>${companyName}</strong> has submitted their onboarding for review. All required documents are in place.</p>
                <a href="${baseUrl}/contractor-portal-admin" style="display:inline-block;background:#2460A9;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;margin-top:8px">Review in Portal Admin →</a>
              </div>
            </div>
          `,
          text: `${companyName} has submitted their onboarding for review.\n\nReview at: ${baseUrl}/contractor-portal-admin`,
        });
      } catch (_) { /* non-fatal */ }

      return res.json({ success: true });
    } catch (err: any) {
      logger.error('[portal-submit-for-review]', err);
      return res.status(500).json({ error: 'Failed to submit for review.' });
    }
  });

  // ── Auth: Document stats summary ──────────────────────────────────────────
  app.get('/api/contractor-portal/document-stats', requireContractorPortalAuth, async (req, res) => {
    try {
      const pu = (req as any).portalUser as PortalTokenPayload;
      const db = await customerDbService.getCustomerDatabase(pu.customerId);

      const docs = await db
        .select({
          status: isolatedSchema.contractorDocuments.status,
          expiryDate: isolatedSchema.contractorDocuments.expiryDate,
        })
        .from(isolatedSchema.contractorDocuments)
        .where(
          and(
            eq(isolatedSchema.contractorDocuments.companyId, pu.contractorCompanyId),
            eq(isolatedSchema.contractorDocuments.isActive, true)
          )
        );

      const now = new Date();
      let pending = 0, approved = 0, rejected = 0, expired = 0;
      for (const d of docs) {
        if (d.expiryDate && new Date(d.expiryDate) < now) { expired++; continue; }
        if (d.status === 'approved') approved++;
        else if (d.status === 'rejected') rejected++;
        else pending++;
      }

      return res.json({ pending, approved, rejected, expired, total: docs.length });
    } catch (err: any) {
      logger.error('[portal-doc-stats]', err);
      return res.status(500).json({ error: 'Failed to load document stats.' });
    }
  });
}
