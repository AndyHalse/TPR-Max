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
import { generateLogoToken } from '../utils/logoToken';

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
          const fullPath = `${privateDir}/contractor-portal/${objectId}.${ext}`;
          const parts = fullPath.slice(1).split('/');
          const bucketName = parts[0];
          const objectName = parts.slice(1).join('/');

          await objectStorageClient.bucket(bucketName).file(objectName).save(req.file.buffer, {
            contentType: req.file.mimetype,
            resumable: false,
          });
          documentUrl = `/objects/contractor-portal/${objectId}.${ext}`;
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

  // ── Auth: Add worker ──────────────────────────────────────────────────────
  app.post('/api/contractor-portal/workers', requireContractorPortalAuth, async (req, res) => {
    try {
      const pu = (req as any).portalUser as PortalTokenPayload;
      const { firstName, lastName, email, mobileNumber, phoneNumber, jobTitle, trade } =
        req.body as Record<string, string>;

      if (!firstName?.trim() || !lastName?.trim()) {
        return res.status(400).json({ error: 'First name and last name are required.' });
      }

      const db = await customerDbService.getCustomerDatabase(pu.customerId);
      const [worker] = await db
        .insert(isolatedSchema.contractorWorkers)
        .values({
          companyId: pu.contractorCompanyId,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email?.trim() || null,
          mobileNumber: mobileNumber?.trim() || null,
          phoneNumber: phoneNumber?.trim() || null,
          jobTitle: jobTitle?.trim() || null,
          trade: trade?.trim() || null,
          isActive: true,
        })
        .returning();

      return res.status(201).json(worker);
    } catch (err: any) {
      logger.error('[portal-add-worker]', err);
      return res.status(500).json({ error: 'Failed to add worker.' });
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
