import type { Express } from 'express';
import {
  requireAuth,
  isDevDataBypass,
  isDatabaseConnectionError,
  getMockReceptionDiary,
  getMockCurrentVisitors,
  getMockTodaysVisitors,
} from '../auth';
import { databaseService } from '../databaseService';
import { simpleDatabaseService } from '../simpleDatabaseService';
import { customerDbService } from '../customerDatabase';
import { EmailService, emailService } from '../emailService';
import * as isolatedSchema from '../isolatedSchema';
import { insertVisitorSchema, insertPreBookingSchema } from '../isolatedSchema';
import { evacuations } from '@shared/schema';
import { db } from '../db';
import { sendTeamsNotification } from '../utils/teamsNotifier';
import { websocketService } from '../websocketService';
import { VoiceNotificationService } from '../voiceNotificationService';
import { paxtonService } from '../paxtonService';
import { eq, and, desc, gte, ne, or, isNull, ilike } from 'drizzle-orm';
import { randomUUID, randomBytes } from 'crypto';
import { z } from 'zod';
import { logger } from '../utils/logger';

export function registerVisitorRoutes(app: Express): void {

  // Visitor Emergency Notification - Send urgent alert to Reception
  app.post("/api/visitors/:id/emergency-notify", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { urgencyReason } = req.body;
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Get visitor details
      const visitor = await databaseService.getVisitorById(context, id);
      if (!visitor) {
        return res.status(404).json({ error: "Visitor not found" });
      }
      
      // Get host staff details
      let hostStaff = null;
      if (visitor.hostStaffId) {
        hostStaff = await databaseService.getStaffById(context, visitor.hostStaffId);
      }
      
      // Get company settings for reception email and company details
      
      const companySettings = await simpleDatabaseService.getCompanySettings(context);
      
      if (!companySettings) {
        return res.status(400).json({ 
          error: "Company settings not found", 
          message: "Please configure company settings first" 
        });
      }
      
      // Use company email as reception email (could be enhanced to have separate reception email in settings)
      const receptionEmail = companySettings.email;
      
      if (!receptionEmail) {
        return res.status(400).json({ 
          error: "Reception email not configured", 
          message: "Please configure company email in settings first" 
        });
      }
      
      // Alert reception/staff about the visitor — receptionEmail is already validated above
      const visitorName = `${visitor.firstName} ${visitor.lastName}`;
      const siteName = companySettings.companyName || 'the site';
      const hostName = hostStaff ? `${hostStaff.firstName} ${hostStaff.lastName}` : 'Unknown';
      const urgencyNote = urgencyReason ? `<p><strong>Reason:</strong> ${urgencyReason}</p>` : '';

      const emailService = new EmailService(req.customerId);
      const emailSent = await emailService.sendEmail({
        to: receptionEmail,
        subject: `URGENT: Emergency Alert for Visitor — ${visitorName} at ${siteName}`,
        html: `<p>An emergency notification has been raised for a visitor currently on site.</p>
               <p><strong>Visitor:</strong> ${visitorName}</p>
               <p><strong>Host:</strong> ${hostName}</p>
               ${urgencyNote}
               <p>Please locate this visitor and ensure they are safe or have been evacuated.</p>`,
        text: `Emergency notification for visitor ${visitorName} (host: ${hostName}) at ${siteName}.${urgencyReason ? ' Reason: ' + urgencyReason : ''} Please locate this visitor and ensure they are safe.`,
        companyName: companySettings.companyName || 'TPR Max',
      });

      if (emailSent) {
        res.json({
          success: true,
          message: "Emergency notification sent to reception",
          recipient: receptionEmail,
          visitorName,
        });
      } else {
        res.status(500).json({
          error: "Failed to send emergency notification",
          message: "Email service may not be configured properly"
        });
      }
    } catch (error) {
      logger.error("Failed to send visitor emergency notification:", error);
      res.status(500).json({ error: "Failed to send emergency notification" });
    }
  });

  // Visitor endpoints
  app.get("/api/visitors", requireAuth, async (req, res) => {
    try {
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Use deduplicated unique visitors to prevent duplicate entries in "Previous Visitors" list
      const visitors = await databaseService.getUniqueVisitors(context);
      res.json(visitors);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch visitors" });
    }
  });

  app.get("/api/visitors/current", requireAuth, async (req, res) => {
    try {
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const visitors = await databaseService.getCurrentVisitors(context);
      res.json(visitors);
    } catch (error) {
      logger.error("Failed to fetch current visitors:", error);
      
      // DEV DATA BYPASS: Check if this is a Neon database error and bypass is enabled
      if (isDevDataBypass() && isDatabaseConnectionError(error)) {
        return res.json(getMockCurrentVisitors());
      }
      
      res.status(500).json({ error: "Failed to fetch current visitors" });
    }
  });

  app.get("/api/visitors/today", requireAuth, async (req, res) => {
    try {
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const todayVisitors = await databaseService.getTodaysVisitors(context);
      res.json(todayVisitors);
    } catch (error) {
      logger.error("Error fetching today visitors:", error);
      
      // DEV DATA BYPASS: Check if this is a Neon database error and bypass is enabled
      if (isDevDataBypass() && isDatabaseConnectionError(error)) {
        return res.json(getMockTodaysVisitors());
      }
      
      res.status(500).json({ error: "Failed to fetch today visitors" });
    }
  });

  app.post("/api/visitors/checkin", requireAuth, async (req, res) => {
    try {
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Add customerId to visitor data for proper customer isolation
      const visitorData = insertVisitorSchema.parse({ ...req.body, customerId: context.customerId });

      // Fetch company settings early (needed for H&S enforcement and e-pass)
      const settings = await databaseService.getCompanySettings(context);

      // Server-side H&S enforcement: reject check-in if acceptance is required but not provided
      if ((settings as any)?.hsRulesEnabled !== false && (settings as any)?.hsRulesRequireAcceptance && !(req.body.hsRulesAccepted)) {
        return res.status(400).json({
          error: "Health & Safety acceptance required",
          message: "You must accept the Health & Safety rules before checking in.",
          requireHsAcceptance: true
        });
      }

      // NDA enforcement
      const ndaEnabled = !!(settings as any)?.ndaEnabled;
      const ndaAppliesTo = (settings as any)?.ndaAppliesTo || 'visitors';
      const ndaAppliesToVisitors = ndaAppliesTo === 'visitors' || ndaAppliesTo === 'both';
      const ndaRequireSig = !!(settings as any)?.ndaRequireSignature;
      const ndaHasContent = !!((settings as any)?.ndaContent?.trim());
      const ndaBodyAccepted = req.body.ndaAccepted === true;
      if (ndaEnabled && ndaAppliesToVisitors && ndaRequireSig && ndaHasContent && !ndaBodyAccepted) {
        return res.status(400).json({
          error: "NDA acceptance required",
          message: "You must accept the Non-Disclosure Agreement before checking in.",
          requireNdaAcceptance: true
        });
      }

      const hsAccepted = req.body.hsRulesAccepted === true;
      const hsAcceptedAt = hsAccepted ? new Date() : undefined;
      
      logger.info(`Checking for duplicate: ID ${visitorData.id} from ${visitorData.company || 'no company'}`);
      
      // Check if visitor already exists
      const existingVisitor = await databaseService.findExistingVisitor(context, visitorData.firstName, visitorData.lastName, visitorData.company || undefined);
      
      let visitor;
      
      if (existingVisitor) {
        // If visitor exists but is checked out, check them in again
        if (!existingVisitor.isCheckedIn) {
          logger.info(`Checking in existing visitor: ID ${visitorData.id}`);
          const hsToken = existingVisitor.hsRulesAcceptanceToken || randomBytes(16).toString('hex');
          const checkInTime = new Date();

          // Pre-fetch host info before the transaction (SELECT only — avoids holding the connection)
          let hostName: string | undefined;
          let resolvedHostStaffId = visitorData.hostStaffId || null;
          if (visitorData.hostStaffId) {
            const host = await databaseService.getStaffById(context, visitorData.hostStaffId);
            if (host) {
              hostName = `${host.firstName} ${host.lastName}`;
            } else {
              resolvedHostStaffId = null;
            }
          }

          const returningVisitorDb = await customerDbService.getCustomerDatabase(context.customerId);
          visitor = await returningVisitorDb.transaction(async (tx) => {
            const [updated] = await tx
              .update(isolatedSchema.visitors)
              .set({
                isCheckedIn: true,
                checkedInAt: checkInTime,
                checkedOutAt: null,
                hostStaffId: resolvedHostStaffId,
                purpose: visitorData.purpose || '',
                carRegistration: visitorData.carRegistration || undefined,
                hsRulesAcceptanceToken: hsToken,
                ...(hsAccepted ? { hsRulesAccepted: true, hsRulesAcceptedAt: hsAcceptedAt } : {}),
                ...(ndaBodyAccepted ? { ndaAccepted: true, ndaAcceptedAt: new Date() } : {}),
                ePassSent: false,
                ePassSentAt: null,
                updatedAt: new Date(),
              })
              .where(eq(isolatedSchema.visitors.id, existingVisitor.id))
              .returning();

            await tx.insert(isolatedSchema.visitorHistory).values({
              visitorId: existingVisitor.id,
              checkInTime,
              checkOutTime: null,
              purpose: visitorData.purpose || '',
              hostStaffId: resolvedHostStaffId,
              hostName: hostName || null,
              inductionCompleted: existingVisitor.inductionCompleted || false,
              inductionCompletedAt: existingVisitor.inductionCompletedAt || null,
              hsRulesAccepted: hsAccepted || existingVisitor.hsRulesAccepted || false,
              hsRulesAcceptedAt: hsAccepted ? (hsAcceptedAt || null) : (existingVisitor.hsRulesAcceptedAt || null),
              ePassSent: false,
              ePassSentAt: null,
              checkoutType: null,
              notes: existingVisitor.notes || null,
              qrCode: existingVisitor.qrCode || null,
            });

            return updated;
          });
        } else {
          // Visitor is already checked in
          logger.info(`Visitor already checked in: ID ${visitorData.id}`);
          res.status(409).json({ 
            error: "Visitor already checked in", 
            visitor: existingVisitor,
            message: `${visitorData.firstName} ${visitorData.lastName} is already on site.`
          });
          return;
        }
      } else {
        // Create new visitor with H&S token
        const hsToken = randomBytes(16).toString('hex');
        visitor = await databaseService.createVisitor(context, {
          ...visitorData,
          hsRulesAcceptanceToken: hsToken,
          ...(hsAccepted ? { hsRulesAccepted: true, hsRulesAcceptedAt: hsAcceptedAt } : {}),
          ...(ndaBodyAccepted ? { ndaAccepted: true, ndaAcceptedAt: new Date() } : {})
        });
        logger.info(`Created new visitor: ID ${visitorData.id}`);
      }
      
      // Reset ePassSent so the response only reflects what this request actually sent
      if (visitor) {
        visitor.ePassSent = false;
        visitor.ePassSentAt = null;
      }

      // Track actual ePass send outcome for accurate history recording
      let ePassActuallySent = false;
      let ePassActuallySentAt: Date | null = null;

      // Send e-Pass if enabled
      if (settings?.ePassEnabled && visitor) {
        logger.info(`E-Pass is enabled, sending digital pass`);

        const baseUrl = process.env.APP_URL ||
          `${req.get('x-forwarded-proto') || req.protocol}://${req.get('x-forwarded-host') || req.get('host')}`;

        {
        
        // Get host information if available
        let host = null;
        if (visitor.hostStaffId) {
          host = await databaseService.getStaffById(context, visitor.hostStaffId);
        }
        
        // Generate e-Pass URL
        const ePassUrl = `${baseUrl}/epass/${visitor.id}`;
        
        // Update visitor with e-Pass URL
        await databaseService.updateVisitor(context, visitor.id, {
          ePassUrl: ePassUrl,
          ePassDeliveryType: settings.ePassDeliveryMethod || 'email'
        });
        
        // Send e-Pass via email
        if (visitor.email && (settings.ePassDeliveryMethod === 'email' || settings.ePassDeliveryMethod === 'both' || settings.ePassDeliveryMethod === 'choice')) {
          try {
            const emailSent = await emailService.forCustomer(req.customerId).sendDigitalEPass(
              visitor as any,
              (host || null) as any,
              settings!,
              ePassUrl
            );
            
            if (emailSent) {
              const sentAt = new Date();
              await databaseService.updateVisitor(context, visitor.id, {
                ePassSent: true,
                ePassSentAt: sentAt
              });
              ePassActuallySent = true;
              ePassActuallySentAt = sentAt;
              logger.info(`E-Pass sent successfully to [email]`);
            }
          } catch (emailError) {
            logger.error('Failed to send e-Pass email:', emailError);
          }
        }
        
        // Send host notification if enabled (Email + Voice)
        if (settings.ePassHostNotificationEnabled && host) {
          let notificationSent = false;
          
          // Try voice notification first if enabled and configured
          if ((host as any).voiceNotificationsEnabled && (host as any).phoneNumber && 
              ((host as any).preferredNotificationMethod === 'voice' || (host as any).preferredNotificationMethod === 'both')) {
            try {
              const voiceService = new VoiceNotificationService(databaseService as any);
              const voiceNotification = await voiceService.sendVisitorArrivalNotification(host, visitor);
              
              if (voiceNotification) {
                logger.info(`Voice notification sent to host ID ${host.id}`);
                notificationSent = true;
              } else {
                logger.info(`Voice notification not sent - falling back to email`);
              }
            } catch (voiceError) {
              logger.error('Failed to send voice notification to host:', voiceError);
              logger.info(`Falling back to email notification`);
            }
          }
          
          // Send branded arrival email notification if voice failed or if email is preferred/both
          if (host.email && (!notificationSent || 
              host.preferredNotificationMethod === 'email' || 
              host.preferredNotificationMethod === 'both' ||
              !host.voiceNotificationsEnabled)) {
            try {
              await emailService.forCustomer(req.customerId).sendArrivalNotification({
                hostEmail: host.email,
                hostFirstName: host.firstName,
                visitorName: `${visitor.firstName} ${visitor.lastName}`,
                visitorCompany: visitor.company || 'N/A',
                visitorType: 'visitor',
                purpose: visitor.purpose || undefined,
                checkedInAt: new Date(),
                companyName: settings?.companyName || 'TPR Max',
              });
              logger.info(`Arrival notification sent to host [email]`);
              notificationSent = true;
            } catch (emailError) {
              logger.error('Failed to send arrival notification to host:', emailError);
            }
          }
          
          // Update visitor record if any notification was sent
          if (notificationSent) {
            await databaseService.updateVisitor(context, visitor.id, {
              hostNotificationSent: true
            });
          }
        }
        
        // Add e-Pass info to response
        visitor.ePassSent = true;
        visitor.ePassUrl = ePassUrl;
        }
      }

      // Visitor history for returning visitors is created atomically inside the
      // check-in transaction above — no separate call needed here.
      
      // Check for active evacuations and add visitor to accountability list if needed
      try {
        if (context.customerId) {
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
            const visitorEvacDb = await customerDbService.getCustomerDatabase(context.customerId);

            // Check if visitor is already in accountability list
            const existingRecord = await visitorEvacDb
              .select()
              .from(isolatedSchema.evacuationAccountability)
              .where(and(
                eq(isolatedSchema.evacuationAccountability.evacuationId, evacuation.evacuationId),
                eq(isolatedSchema.evacuationAccountability.personId, visitor.id)
              ))
              .limit(1);

            if (existingRecord.length === 0) {
              await visitorEvacDb.insert(isolatedSchema.evacuationAccountability).values({
                customerId: context.customerId,
                evacuationId: evacuation.evacuationId,
                personId: visitor.id,
                personType: 'visitor',
                personName: `${visitor.firstName} ${visitor.lastName}`,
                department: '',
                company: visitor.company || '',
                lastKnownLocation: 'Just Checked In',
                isAccountedFor: false
              });
              logger.info(`Added visitor ID ${visitor.id} to active evacuation ${evacuation.evacuationId} accountability list`);
            }
          }
        }
      } catch (evacErr) {
        logger.error('Failed to update evacuation accountability on visitor check-in:', evacErr);
      }
      
      websocketService.broadcastPersonnelUpdate(context.customerId, {
        personId: visitor.id,
        personName: `${visitor.firstName} ${visitor.lastName}`,
        personType: 'visitor',
        action: 'checkin'
      });

      // Background: generate NDA token and send email if visitor has email and hasn't accepted yet
      if (ndaEnabled && ndaAppliesToVisitors && ndaHasContent && visitor?.email && !ndaBodyAccepted) {
        void (async () => {
          try {
            const rawNdaToken = randomBytes(32).toString('hex');
            const encodedNdaToken = Buffer.from(`${context.customerId}:${rawNdaToken}`).toString('base64url');
            const ndaTokenExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours
            const ndaEmailDb = await customerDbService.getCustomerDatabase(context.customerId);
            await ndaEmailDb.update(isolatedSchema.visitors)
              .set({ ndaToken: rawNdaToken, ndaTokenExpiresAt })
              .where(eq(isolatedSchema.visitors.id, visitor.id));
            const baseUrl = process.env.APP_URL ||
              `${req.get('x-forwarded-proto') || req.protocol}://${req.get('x-forwarded-host') || req.get('host')}`;
            const ndaUrl = `${baseUrl}/nda/${encodedNdaToken}`;
            const companyDisplayName = (settings as any)?.companyName || 'Your Host';
            const emailSvc = new EmailService(req.customerId);
            await emailSvc.sendEmail({
              to: visitor.email!,
              subject: `Non-Disclosure Agreement — ${companyDisplayName}`,
              html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
                <h2 style="color:#4f46e5;margin-bottom:8px">Non-Disclosure Agreement</h2>
                <p>Dear ${visitor.firstName},</p>
                <p>Thank you for visiting ${companyDisplayName}. Please click the button below to read and sign our Non-Disclosure Agreement.</p>
                <p style="text-align:center;margin:32px 0">
                  <a href="${ndaUrl}" style="background:#4f46e5;color:#ffffff;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;display:inline-block">Read &amp; Sign NDA</a>
                </p>
                <p style="color:#6b7280;font-size:13px">This link will expire in 48 hours.</p>
              </div>`,
              text: `Dear ${visitor.firstName}, please sign our NDA at: ${ndaUrl} (valid 48 hours)`,
              companyName: companyDisplayName,
            });
            logger.info(`NDA email sent to visitor ${visitor.id}`);
          } catch (emailErr) {
            logger.error('Failed to send NDA email to visitor:', emailErr);
          }
        })();
      }

      // Teams notification — fire and forget, never blocks check-in
      const _teamsSchema = customerDbService.generateSchemaName(context.customerId);
      sendTeamsNotification(_teamsSchema, 'visitor_arrival', {
        eventType: 'visitor_arrival',
        title: '👤 Visitor arrived',
        summary: `${visitor.firstName} ${visitor.lastName} has signed in at ${(settings as any)?.companyName || 'site'}.`,
        facts: [
          { name: 'Visitor', value: `${visitor.firstName} ${visitor.lastName}` },
          { name: 'Purpose', value: visitor.purpose || 'Not specified' },
          { name: 'Time', value: new Date().toLocaleTimeString('en-GB') },
        ],
      }).catch(() => {});

      res.json(visitor);
    } catch (error) {
      logger.error("Error during visitor check-in:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid visitor data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to check in visitor" });
      }
    }
  });

  // Add visitor profile without checking them in (admin "Add Visitor" action)
  app.post("/api/visitors/add-profile", requireAuth, async (req, res) => {
    try {
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);

      const visitorData = insertVisitorSchema.parse({ ...req.body, customerId: context.customerId });

      const visitor = await databaseService.createVisitor(context, {
        ...visitorData,
        isCheckedIn: false,
      });

      res.status(201).json(visitor);
    } catch (error) {
      logger.error("Error creating visitor profile:", error);
      res.status(500).json({ error: "Failed to create visitor profile" });
    }
  });

  app.put("/api/visitors/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Add customerId to updates for proper customer isolation
      const updates = { ...req.body, customerId: context.customerId };
      
      // Use customer-isolated database service for updating visitor
      const visitor = await databaseService.updateVisitor(context, id, updates);
      
      if (!visitor) {
        return res.status(404).json({ error: "Visitor not found" });
      }
      
      res.json(visitor);
    } catch (error) {
      logger.error("Error updating visitor:", error);
      res.status(500).json({ error: "Failed to update visitor" });
    }
  });

  app.post("/api/visitors/:id/checkout", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Use customer-isolated database service for visitor checkout
      const visitor = await databaseService.checkOutVisitor(context, id);
      
      if (!visitor) {
        return res.status(404).json({ error: "Visitor not found or already checked out" });
      }
      
      websocketService.broadcastPersonnelUpdate(context.customerId, {
        personId: visitor.id,
        personName: `${visitor.firstName} ${visitor.lastName}`,
        personType: 'visitor',
        action: 'checkout'
      });
      
      res.json(visitor);
    } catch (error) {
      logger.error("Error checking out visitor:", error);
      res.status(500).json({ error: "Failed to check out visitor" });
    }
  });

  // Send e-Pass endpoint for testing or re-sending
  app.post("/api/visitors/:id/send-epass", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { email } = req.body;
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Get visitor
      const visitor = await databaseService.getVisitorById(context, id);
      if (!visitor) {
        return res.status(404).json({ error: "Visitor not found" });
      }
      
      // Get company settings
      const settings = await databaseService.getCompanySettings(context);
      
      // Get host information if available
      let host = null;
      if (visitor.hostStaffId) {
        host = await databaseService.getStaffById(context, visitor.hostStaffId);
      }
      
      // Generate e-Pass URL
      const baseUrl = process.env.APP_URL ||
        `${req.get('x-forwarded-proto') || req.protocol}://${req.get('x-forwarded-host') || req.get('host')}`;
      const ePassUrl = `${baseUrl}/epass/${visitor.id}`;
      
      // Update visitor email if provided
      if (email) {
        visitor.email = email;
        await databaseService.updateVisitor(context, visitor.id, { email });
      }
      
      // Send e-Pass via email
      if (visitor.email) {
        try {
          const emailSent = await emailService.forCustomer(req.customerId).sendDigitalEPass(
            visitor,
            host || null,
            settings!,
            ePassUrl
          );
          
          if (emailSent) {
            await databaseService.updateVisitor(context, visitor.id, {
              ePassSent: true,
              ePassSentAt: new Date(),
              ePassUrl: ePassUrl
            });
            logger.info(`E-Pass sent successfully to [email]`);
            res.json({ success: true, message: `E-Pass sent to ${visitor.email}` });
          } else {
            res.status(500).json({ error: "Failed to send e-Pass email" });
          }
        } catch (emailError) {
          logger.error('Failed to send e-Pass email:', emailError);
          res.status(500).json({ error: "Failed to send e-Pass email", details: emailError instanceof Error ? emailError.message : String(emailError) });
        }
      } else {
        res.status(400).json({ error: "No email address available for visitor" });
      }
    } catch (error) {
      logger.error("Error sending e-Pass:", error);
      res.status(500).json({ error: "Failed to send e-Pass" });
    }
  });


  // Contractor H&S Rules acceptance endpoint (NO AUTH - uses hs-contractor path to avoid Vite middleware)
  app.get("/hs-contractor/:workerId/accept-rules", async (req, res) => {
    try {
      const { workerId } = req.params;
      const token = req.query.token as string | undefined;

      const customerIdParam = req.query.customerId as string;
      if (!customerIdParam) {
        return res.status(400).send(`
          <html>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
              <h1 style="color: #ef4444;">❌ Invalid Link</h1>
              <p>This link is missing required information. Please use the link from your e-Pass email.</p>
            </body>
          </html>
        `);
      }
      const context = simpleDatabaseService.createCustomerContext(customerIdParam);

      const worker = await databaseService.getContractorWorkerById(context, workerId);
      if (!worker) {
        return res.status(404).send(`
          <html>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
              <h1 style="color: #ef4444;">❌ Invalid Link</h1>
              <p>This link is not valid. Please use the link from your e-Pass email.</p>
            </body>
          </html>
        `);
      }

      // FAIL-CLOSED token validation — must pass before any personal data is used or returned
      if (!token || !worker.hsRulesAcceptanceToken || worker.hsRulesAcceptanceToken !== token) {
        logger.warn(`Contractor H&S link rejected — invalid or missing token for worker ${workerId}`);
        return res.status(401).send(`
          <html>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
              <h1 style="color: #ef4444;">❌ Invalid or Missing Link</h1>
              <p>This link is not valid or has expired. Please use the link from your e-Pass email.</p>
            </body>
          </html>
        `);
      }

      if (worker.hsRulesAccepted && worker.hsRulesAcceptedAt) {
        return res.send(`
          <html>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
              <h1 style="color: #10b981;">✅ Already Accepted</h1>
              <h2>Health &amp; Safety Rules Already Accepted</h2>
              <p>You have already accepted the Health &amp; Safety Rules. You may now close this window and proceed with your work.</p>
            </body>
          </html>
        `);
      }

      const now = new Date();
      const updatedWorker = await databaseService.updateContractorWorker(context, workerId, {
        hsRulesAccepted: true,
        hsRulesAcceptedAt: now,
        isCheckedIn: true,
        checkedInAt: now
        // Note: token is intentionally NOT cleared — link must remain idempotent
      });

      if (!updatedWorker) {
        return res.status(500).send(`
          <html>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
              <h1 style="color: #ef4444;">❌ Update Failed</h1>
              <p>Failed to update H&amp;S acceptance. Please contact reception for assistance.</p>
            </body>
          </html>
        `);
      }

      logger.info(`H&S Rules accepted by contractor: ID ${worker.id} - Now fully checked in`);
      res.send(`
        <html>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1 style="color: #10b981;">✅ Thank You!</h1>
            <h2>Health &amp; Safety Rules Accepted</h2>
            <p>Thank you ${worker.firstName} ${worker.lastName} for accepting our Health &amp; Safety Rules.</p>
            <p>Your acceptance has been recorded at ${updatedWorker.hsRulesAcceptedAt ? new Date(updatedWorker.hsRulesAcceptedAt).toLocaleString('en-GB') : new Date().toLocaleString('en-GB')}.</p>
            <p><strong>You are now fully checked in and may proceed with your work.</strong></p>
            <p style="margin-top: 20px;">You may now close this window.</p>
          </body>
        </html>
      `);
    } catch (error) {
      logger.error("Error accepting contractor H&S rules:", error);
      res.status(500).send(`
        <html>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1 style="color: #ef4444;">❌ System Error</h1>
            <p>An unexpected error occurred. Please contact reception for assistance.</p>
          </body>
        </html>
      `);
    }
  });

  // POST endpoint for contractor H&S acceptance (NO AUTH - uses hs-contractor path to avoid Vite middleware)
  app.post("/hs-contractor/:workerId/accept-rules", async (req, res) => {
    try {
      const { workerId } = req.params;
      const { token: bodyToken, customerId: bodyCustomerId } = req.body;
      const token = (req.query.token as string | undefined) || bodyToken;
      const customerIdParam = (req.query.customerId as string) || bodyCustomerId;
      if (!customerIdParam) {
        return res.status(400).json({ error: "Missing customerId parameter" });
      }
      const context = simpleDatabaseService.createCustomerContext(customerIdParam);

      const worker = await databaseService.getContractorWorkerById(context, workerId);
      if (!worker) {
        return res.status(404).json({ error: "Invalid or missing link" });
      }

      // FAIL-CLOSED token validation — must pass before any personal data is used or returned
      if (!token || !worker.hsRulesAcceptanceToken || worker.hsRulesAcceptanceToken !== token) {
        logger.warn(`Contractor H&S POST rejected — invalid or missing token for worker ${workerId}`);
        return res.status(401).json({ error: "Invalid or missing link" });
      }

      if (worker.hsRulesAccepted) {
        return res.json({
          success: true,
          message: "Health & Safety Rules already accepted",
          checkedIn: true
        });
      }

      // Update contractor worker with H&S acceptance and complete check-in
      // Note: token is intentionally NOT cleared — link must remain idempotent
      const now = new Date();
      const updatedWorker = await databaseService.updateContractorWorker(context, workerId, {
        hsRulesAccepted: true,
        hsRulesAcceptedAt: now,
        isCheckedIn: true,
        checkedInAt: now
      });

      if (!updatedWorker) {
        return res.status(500).json({ error: "Failed to update H&S acceptance" });
      }

      logger.info(`H&S Rules accepted by contractor: ID ${worker.id} - Now fully checked in`);
      res.json({
        success: true,
        message: "Health & Safety Rules accepted successfully and contractor checked in",
        checkedIn: true
      });
    } catch (error) {
      logger.error("Error accepting contractor H&S rules:", error);
      res.status(500).json({ error: "Failed to accept H&S rules" });
    }
  });

  // H&S Rules acceptance endpoint (supports both GET for email links and POST for API)
  app.get("/api/visitors/:id/accept-hs-rules", async (req, res) => {
    try {
      const { id } = req.params;
      const { token, customerId: queryCustomerId } = req.query;

      // Public endpoint — customerId must come from the query string (embedded in the email link)
      const resolvedCustomerId = (queryCustomerId as string) || req.customerId;
      if (!resolvedCustomerId) {
        return res.status(400).send(`
          <html>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
              <h1 style="color: #ef4444;">❌ Invalid Link</h1>
              <p>This acceptance link is missing required information. Please contact reception.</p>
            </body>
          </html>
        `);
      }
      const context = { customerId: resolvedCustomerId };
      
      // Get visitor
      const visitor = await databaseService.getVisitorById(context, id);
      if (!visitor) {
        return res.status(404).send(`
          <html>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
              <h1 style="color: #ef4444;">❌ Visitor Not Found</h1>
              <p>The visitor record could not be found.</p>
            </body>
          </html>
        `);
      }
      
      // Verify token if provided (for email link validation)
      // Skip token validation if visitor has no token (existing visitors before H&S was added)
      if (token && visitor.hsRulesAcceptanceToken && visitor.hsRulesAcceptanceToken !== token) {
        return res.status(401).send(`
          <html>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
              <h1 style="color: #ef4444;">❌ Invalid Link</h1>
              <p>This acceptance link is invalid or has expired.</p>
            </body>
          </html>
        `);
      }
      
      // Check if already accepted
      if (visitor.hsRulesAccepted) {
        return res.send(`
          <html>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
              <h1 style="color: #10b981;">✅ Already Accepted</h1>
              <p>You have already accepted the Health & Safety Rules on ${visitor.hsRulesAcceptedAt ? new Date(visitor.hsRulesAcceptedAt).toLocaleString('en-GB') : 'a previous visit'}.</p>
              <p style="margin-top: 20px;">You may close this window.</p>
            </body>
          </html>
        `);
      }
      
      // Update visitor with H&S acceptance and timestamp
      const now = new Date();
      const updatedVisitor = await databaseService.updateVisitor(context, id, {
        hsRulesAccepted: true,
        hsRulesAcceptedAt: now
      });
      
      if (!updatedVisitor) {
        return res.status(500).send(`
          <html>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
              <h1 style="color: #ef4444;">❌ Error</h1>
              <p>Failed to record your acceptance. Please try again or contact reception.</p>
            </body>
          </html>
        `);
      }
      
      logger.info(`H&S Rules accepted by visitor: ID ${visitor.id}`);
      res.send(`
        <html>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1 style="color: #10b981;">✅ Thank You!</h1>
            <h2>Health & Safety Rules Accepted</h2>
            <p>Thank you ${visitor.firstName} ${visitor.lastName} for accepting our Health & Safety Rules.</p>
            <p>Your acceptance has been recorded at ${updatedVisitor.hsRulesAcceptedAt ? new Date(updatedVisitor.hsRulesAcceptedAt).toLocaleString('en-GB') : new Date().toLocaleString('en-GB')}.</p>
            <p style="margin-top: 20px;">You may now close this window and proceed with your visit.</p>
          </body>
        </html>
      `);
    } catch (error) {
      logger.error("Error accepting H&S rules:", error);
      res.status(500).send(`
        <html>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1 style="color: #ef4444;">❌ System Error</h1>
            <p>An unexpected error occurred. Please contact reception for assistance.</p>
          </body>
        </html>
      `);
    }
  });

  // CONTRACTOR H&S ENDPOINTS REMOVED FROM HERE - NOW POSITIONED BEFORE VISITOR ENDPOINTS TO AVOID AUTH ISSUES
  
  // POST endpoint for API-based H&S acceptance
  app.post("/api/visitors/:id/accept-hs-rules", async (req, res) => {
    try {
      const { id } = req.params;
      const { token } = req.body;

      // Public endpoint — customerId must come from the query string or body
      const resolvedCustomerId = (req.query.customerId as string) || (req.body.customerId as string) || req.customerId;
      if (!resolvedCustomerId) {
        return res.status(400).json({ error: "Customer context missing. Ensure the link includes a customerId parameter." });
      }
      const context = { customerId: resolvedCustomerId };
      
      // Get visitor
      const visitor = await databaseService.getVisitorById(context, id);
      if (!visitor) {
        return res.status(404).json({ error: "Visitor not found" });
      }
      
      // Verify token if provided (for email link validation)
      if (token && visitor.hsRulesAcceptanceToken !== token) {
        return res.status(401).json({ error: "Invalid acceptance token" });
      }
      
      // Update visitor with H&S acceptance and timestamp
      const now = new Date();
      const updatedVisitor = await databaseService.updateVisitor(context, id, {
        hsRulesAccepted: true,
        hsRulesAcceptedAt: now
      });
      
      if (!updatedVisitor) {
        return res.status(500).json({ error: "Failed to update H&S acceptance" });
      }
      
      logger.info(`H&S Rules accepted by visitor: ID ${visitor.id}`);
      res.json({ 
        success: true, 
        message: "Health & Safety Rules accepted successfully",
        acceptedAt: updatedVisitor.hsRulesAcceptedAt
      });
    } catch (error) {
      logger.error("Error accepting H&S rules:", error);
      res.status(500).json({ error: "Failed to accept H&S rules" });
    }
  });

  // CONTRACTOR H&S ENDPOINTS HAVE BEEN MOVED TO THE TOP OF THE FILE BEFORE VISITOR ENDPOINTS

  // H&S Rules acceptance for contractor workers (POST only for security)
  app.post("/api/contractors/workers/:workerId/accept-hs-rules", async (req, res) => {
    try {
      const { workerId } = req.params;
      const { token } = req.query as { token?: string };

      logger.info(`Processing H&S rules acceptance for contractor worker ${workerId}`);

      if (!token) {
        return res.status(400).json({ error: "Token is required" });
      }

      // Public endpoint — customerId must come from the query string (embedded in the email link)
      const resolvedCustomerId = (req.query.customerId as string) || req.customerId;
      if (!resolvedCustomerId) {
        return res.status(400).json({ error: "Customer context missing. Ensure the link includes a customerId parameter." });
      }
      const context = { customerId: resolvedCustomerId };

      // Get the contractor worker using customer-isolated database
      const worker = await databaseService.getContractorWorkerById(context, workerId);
      if (!worker) {
        logger.info(`Contractor worker ${workerId} not found`);
        return res.status(404).json({ error: "Worker not found" });
      }

      if (worker.hsRulesAcceptanceToken !== token) {
        logger.info(`Invalid token for contractor worker ${workerId}`);
        return res.status(400).json({ error: "Invalid token" });
      }

      if (worker.hsRulesAccepted) {
        logger.info(`ℹ H&S rules already accepted for contractor worker ${workerId}`);
        return res.status(200).json({ 
          message: "H&S rules already accepted",
          worker: { 
            id: worker.id,
            firstName: worker.firstName,
            lastName: worker.lastName,
            hsRulesAccepted: worker.hsRulesAccepted,
            hsRulesAcceptedAt: worker.hsRulesAcceptedAt
          }
        });
      }

      // Mark H&S rules as accepted using customer-isolated database
      await databaseService.updateContractorWorkerHsRules(context, workerId, {
        hsRulesAccepted: true,
        hsRulesAcceptedAt: new Date(),
        hsRulesAcceptanceToken: null // Clear the token after use
      });

      logger.info(`H&S rules accepted for contractor worker ${workerId}`);
      res.json({ 
        message: "H&S rules accepted successfully",
        worker: {
          id: worker.id,
          firstName: worker.firstName,
          lastName: worker.lastName,
          hsRulesAccepted: true,
          hsRulesAcceptedAt: new Date()
        }
      });

    } catch (error) {
      logger.error("Error accepting H&S rules for contractor worker:", error);
      res.status(500).json({ error: "Failed to accept H&S rules" });
    }
  });

  app.post("/api/visitors/checkout-by-qr", async (req, res) => {
    try {
      const { qrCode } = req.body;
      if (!qrCode) {
        return res.status(400).json({ error: "QR code is required" });
      }
      
      // Get customer context for isolation based on logged-in user
      const username = req.user?.username || 'system';
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const visitor = await databaseService.getVisitorByQrCode(context, qrCode);
      if (!visitor) {
        return res.status(404).json({ error: "Visitor not found" });
      }

      if (!visitor.isCheckedIn) {
        // Visitor is currently out — check them IN
        const customerDb = await customerDbService.getCustomerDatabase(context.customerId);
        const [checkedInVisitor] = await customerDb
          .update(isolatedSchema.visitors)
          .set({
            isCheckedIn: true,
            checkedInAt: new Date(),
            checkedOutAt: null,
            updatedAt: new Date(),
          })
          .where(eq(isolatedSchema.visitors.id, visitor.id))
          .returning();
        return res.json({ ...checkedInVisitor, action: 'checkin' });
      }

      // Visitor is currently on-site — check them OUT
      const checkedOutVisitor = await databaseService.checkOutVisitor(context, visitor.id);
      res.json({ ...checkedOutVisitor, action: 'checkout' });
    } catch (error) {
      res.status(500).json({ error: "Failed to process visitor QR" });
    }
  });
  
  // Get visitor history
  app.get("/api/visitors/:id/history", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const history = await databaseService.getVisitorHistory(context, id);
      res.json(history);
    } catch (error) {
      logger.error("Error fetching visitor history:", error);
      res.status(500).json({ error: "Failed to fetch visitor history" });
    }
  });
  
  // Pre-booking endpoints
  app.get("/api/prebookings", requireAuth, async (req, res) => {
    try {
      if (!req.user?.username) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const context = simpleDatabaseService.createCustomerContext(req.user.username, req.customerId);
      const customerDb = await customerDbService.getCustomerDatabase(context.customerId);
      
      const preBookings = await customerDb.select().from(isolatedSchema.preBookings);
      res.json(preBookings);
    } catch (error) {
      logger.info("getAllPreBookings failed - returning empty array:", (error as any).message);
      res.json([]);
    }
  });

  app.get("/api/prebookings/upcoming", requireAuth, async (req, res) => {
    try {
      if (!req.user?.username) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const context = simpleDatabaseService.createCustomerContext(req.user.username, req.customerId);
      const customerDb = await customerDbService.getCustomerDatabase(context.customerId);
      
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const preBookings = await customerDb.select().from(isolatedSchema.preBookings)
        .where(and(
          gte(isolatedSchema.preBookings.visitDate, startOfToday),
          ne(isolatedSchema.preBookings.status, 'cancelled'),
          ne(isolatedSchema.preBookings.status, 'completed'),
          eq(isolatedSchema.preBookings.isCheckedIn, false)
        ))
        .orderBy(isolatedSchema.preBookings.visitDate);
      res.json(preBookings);
    } catch (error) {
      logger.info("getUpcomingPreBookings failed - returning empty array:", (error as any).message);
      res.json([]);
    }
  });

  // NEW: Search visitors for quick rebooking
  app.get("/api/visitors/search", requireAuth, async (req, res) => {
    try {
      const { q } = req.query;
      if (!q || typeof q !== 'string' || q.trim().length < 2) {
        return res.json([]);
      }

      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      const customerDb = await customerDbService.getCustomerDatabase(context.customerId);

      const results = await customerDb
        .select()
        .from(isolatedSchema.visitors)
        .where(ilike(isolatedSchema.visitors.lastName, `%${q.trim()}%`))
        .orderBy(desc(isolatedSchema.visitors.checkedInAt))
        .limit(50);

      // Deduplicate: keep most-recent record per unique person (firstName+lastName)
      const seen = new Map<string, typeof results[0]>();
      for (const v of results) {
        const key = `${(v.firstName || '').toLowerCase().trim()}|${(v.lastName || '').toLowerCase().trim()}`;
        if (!seen.has(key)) seen.set(key, v);
      }

      res.json(Array.from(seen.values()).slice(0, 6));
    } catch (error) {
      logger.error("Error searching visitors:", error);
      res.status(500).json({ message: "Failed to search visitors" });
    }
  });

  // NEW: Search pre-bookings for quick rebooking
  app.get("/api/prebookings/search", async (req, res) => {
    try {
      const { q } = req.query;
      if (!q || typeof q !== 'string') {
        return res.status(400).json({ message: "Search query required" });
      }
      
      const preBookings = await (storage as any).searchPreBookings(q);
      res.json(preBookings);
    } catch (error) {
      logger.error("Error searching pre-bookings:", error);
      res.status(500).json({ message: "Failed to search pre-bookings" });
    }
  });

  app.post("/api/prebookings", requireAuth, async (req, res) => {
    try {
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      const customerDb = await customerDbService.getCustomerDatabase(context.customerId);
      
      const transformedData = {
        ...req.body,
        visitDate: new Date(req.body.visitDate),
      };
      delete transformedData.customerId;
      
      const preBookingData = insertPreBookingSchema.parse(transformedData);

      // ── Duplicate prevention ──────────────────────────────────────────────
      // Reject if another active (non-cancelled, not yet checked-in) pre-booking
      // already exists for the same visitor on the same calendar day at the same
      // time. Exclude already-checked-in bookings so a new slot can be created
      // for the same person if they've already used a previous booking today.
      const visitDayStr = preBookingData.visitDate.toDateString();
      const existingToday = await customerDb
        .select()
        .from(isolatedSchema.preBookings)
        .where(
          and(
            ne(isolatedSchema.preBookings.status, 'cancelled'),
            ne(isolatedSchema.preBookings.status, 'completed'),
            eq(isolatedSchema.preBookings.isCheckedIn, false),
            isNull(isolatedSchema.preBookings.visitorId) // exclude any booking already used (visitor was linked then checked out)
          )
        );

      const duplicate = existingToday.find((b: any) => {
        if (new Date(b.visitDate).toDateString() !== visitDayStr) return false;
        // The frontend embeds the visit time into visitDate (visitTime is not sent separately).
        // Compare the hour+minute of both visitDate timestamps — different time slots = not a dup.
        const existingHour = new Date(b.visitDate).getUTCHours();
        const existingMin  = new Date(b.visitDate).getUTCMinutes();
        const newHour      = preBookingData.visitDate.getUTCHours();
        const newMin       = preBookingData.visitDate.getUTCMinutes();
        if (existingHour !== newHour || existingMin !== newMin) return false;
        // Match by email (if both present)
        if (b.visitorEmail && preBookingData.visitorEmail &&
            b.visitorEmail.toLowerCase() === preBookingData.visitorEmail.toLowerCase()) return true;
        // Match by full name + company (case-insensitive)
        const sameName =
          b.visitorFirstName?.toLowerCase() === preBookingData.visitorFirstName?.toLowerCase() &&
          b.visitorLastName?.toLowerCase() === preBookingData.visitorLastName?.toLowerCase();
        const sameCompany = (!b.company && !preBookingData.company) ||
          b.company?.toLowerCase() === preBookingData.company?.toLowerCase();
        return sameName && sameCompany;
      });

      if (duplicate) {
        const visitorName = `${preBookingData.visitorFirstName} ${preBookingData.visitorLastName}`;
        const dateLabel = preBookingData.visitDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
        const timeLabel = preBookingData.visitTime ? ` at ${preBookingData.visitTime}` : '';
        return res.status(409).json({
          error: "Duplicate pre-booking",
          message: `${visitorName} is already pre-booked for ${dateLabel}${timeLabel}. Cancel the existing booking first if you need to reschedule.`
        });
      }
      // ─────────────────────────────────────────────────────────────────────

      const [preBooking] = await customerDb.insert(isolatedSchema.preBookings)
        .values({
          ...preBookingData,
          customerId: context.customerId,
          qrCode: 'PB-' + randomUUID().replace(/-/g, '').substring(0, 12),
        }).returning();
      
      let hostStaff;
      try {
        hostStaff = preBooking.hostStaffId ? await databaseService.getStaffById(context, preBooking.hostStaffId) : undefined;
      } catch (dbError) {
        logger.error(`Error fetching staff for pre-booking:`, dbError);
      }
      
      const meetingRoom = null;
      
      if (hostStaff) {
        try {
          const companySettings = await databaseService.getCompanySettings(context);
          
          const { EmailService } = await import("../emailService");
          const emailService = new EmailService(req.customerId);
          const emailSent = await emailService.sendVisitorInvitation(
            preBooking,
            hostStaff,
            meetingRoom,
            companySettings
          );
          
          if (emailSent) {
            await customerDb.update(isolatedSchema.preBookings)
              .set({ emailSent: true, emailSentAt: new Date() })
              .where(eq(isolatedSchema.preBookings.id, preBooking.id));
          } else {
            logger.info(`Pre-booking invitation email failed to send to ${preBooking.visitorEmail}`);
          }
        } catch (emailError) {
          logger.error("Failed to send visitor invitation email:", emailError);
        }
      } else {
        logger.info("No host staff found, skipping pre-booking email");
      }
      
      res.json(preBooking);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid pre-booking data", details: error.errors });
      } else {
        logger.error("Error creating pre-booking:", error);
        res.status(500).json({ error: "Failed to create pre-booking" });
      }
    }
  });

  app.post("/api/prebookings/:id/send-invitation", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const customerDb = await customerDbService.getCustomerDatabase(context.customerId);
      
      const [preBooking] = await customerDb.select().from(isolatedSchema.preBookings)
        .where(eq(isolatedSchema.preBookings.id, id)).limit(1);
      
      if (!preBooking) {
        return res.status(404).json({ error: "Pre-booking not found" });
      }
      
      if (preBooking.emailSent) {
        return res.status(400).json({ error: "Invitation already sent" });
      }
      
      let hostStaff;
      if (preBooking.hostStaffId) {
        const [staff] = await customerDb.select().from(isolatedSchema.staff)
          .where(eq(isolatedSchema.staff.id, preBooking.hostStaffId)).limit(1);
        hostStaff = staff;
      }
      const meetingRoom = null;
      
      if (!hostStaff) {
        return res.status(400).json({ error: "Host staff not found" });
      }
      
      const { EmailService } = await import("../emailService");
      const emailService = new EmailService(req.customerId);
      const emailSent = await emailService.sendVisitorInvitation(
        preBooking,
        hostStaff,
        meetingRoom
      );
      
      if (emailSent) {
        await customerDb.update(isolatedSchema.preBookings)
          .set({ emailSent: true, emailSentAt: new Date() })
          .where(eq(isolatedSchema.preBookings.id, preBooking.id));
      }
      
      res.json({ success: emailSent, preBooking });
    } catch (error) {
      logger.error("Error sending visitor invitation:", error);
      res.status(500).json({ error: "Failed to send visitor invitation" });
    }
  });

  app.delete("/api/prebookings/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const customerDb = await customerDbService.getCustomerDatabase(context.customerId);

      const [preBooking] = await customerDb.select().from(isolatedSchema.preBookings)
        .where(eq(isolatedSchema.preBookings.id, id)).limit(1);

      if (!preBooking) {
        return res.status(404).json({ error: "Pre-booking not found" });
      }
      if (preBooking.isCheckedIn) {
        return res.status(400).json({ error: "Cannot cancel a pre-booking that has already been checked in" });
      }

      await customerDb.delete(isolatedSchema.preBookings)
        .where(eq(isolatedSchema.preBookings.id, id));

      logger.info(`Pre-booking cancelled: ${id}`);
      res.json({ success: true });
    } catch (error) {
      logger.error("Error cancelling pre-booking:", error);
      res.status(500).json({ error: "Failed to cancel pre-booking" });
    }
  });

  app.post("/api/prebookings/checkin", requireAuth, async (req, res) => {
    try {
      const { qrCode, deviceType, deviceIp, hsRulesAccepted } = req.body;
      if (!qrCode) {
        return res.status(400).json({ error: "QR code is required" });
      }
      
      if (deviceType === 'xstation' && deviceIp) {
        logger.info(`X-Station QR scan from ${deviceIp}: ${qrCode}`);
      }
      
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      const customerDb = await customerDbService.getCustomerDatabase(context.customerId);

      // Server-side H&S enforcement for pre-booked visitors
      // Only enforce if there is actual H&S content to show — mirrors the client-side modal gate
      const pbSettings = await databaseService.getCompanySettings(context);
      const hsEnabled = (pbSettings as any)?.hsRulesEnabled !== false;
      const hsRequiresAcceptance = !!(pbSettings as any)?.hsRulesRequireAcceptance;
      const hsHasContent = !!((pbSettings as any)?.hsRulesContent?.trim());
      if (hsEnabled && hsRequiresAcceptance && hsHasContent && !hsRulesAccepted) {
        return res.status(400).json({
          error: "Health & Safety acceptance required",
          message: "You must accept the Health & Safety rules before checking in.",
          requireHsAcceptance: true
        });
      }
      
      let preBooking;
      
      // Support lookup by QR code or by pre-booking ID
      // PBK-{id} → dashboard format, PRE-{code} → invitation email format, else raw qrCode
      if (qrCode.startsWith('PBK-')) {
        const preBookingId = qrCode.replace('PBK-', '');
        const [found] = await customerDb.select().from(isolatedSchema.preBookings)
          .where(eq(isolatedSchema.preBookings.id, preBookingId)).limit(1);
        preBooking = found;
      } else {
        const lookupCode = qrCode.startsWith('PRE-') ? qrCode.replace('PRE-', '') : qrCode;
        const [found] = await customerDb.select().from(isolatedSchema.preBookings)
          .where(eq(isolatedSchema.preBookings.qrCode, lookupCode)).limit(1);
        preBooking = found;
      }
      
      if (!preBooking) {
        return res.status(404).json({ error: "Pre-booking not found" });
      }
      
      if (preBooking.isCheckedIn) {
        return res.status(400).json({ error: "Pre-booking already checked in" });
      }
      
      // Verify hostStaffId exists to avoid FK constraint violations
      let resolvedHostStaffId: string | null = null;
      if (preBooking.hostStaffId) {
        try {
          const hostStaff = await databaseService.getStaffById(context, preBooking.hostStaffId);
          resolvedHostStaffId = hostStaff ? preBooking.hostStaffId : null;
        } catch {
          resolvedHostStaffId = null;
        }
      }

      const visitor = await databaseService.createVisitor(context, {
        firstName: preBooking.visitorFirstName,
        lastName: preBooking.visitorLastName,
        email: preBooking.visitorEmail,
        company: preBooking.company,
        purpose: preBooking.purpose,
        carRegistration: null,
        hostStaffId: resolvedHostStaffId,
        isPreBooked: true,
        expectedDateTime: preBooking.visitDate,
        visitPurpose: preBooking.purpose,
        isCheckedIn: true,
        ...(hsRulesAccepted ? { hsRulesAccepted: true, hsRulesAcceptedAt: new Date() } : {})
      });
      
      await customerDb.update(isolatedSchema.preBookings)
        .set({ isCheckedIn: true, checkedInAt: new Date(), visitorId: visitor.id })
        .where(eq(isolatedSchema.preBookings.id, preBooking.id));
      
      logger.info(`Visitor checked in from pre-booking: ID ${visitor.id} (ID: ${visitor.id}) in customer DB`);
      logger.info(`Pre-booking checkin: ePassEnabled=${pbSettings?.ePassEnabled}, visitorEmail=${visitor?.email ? '[set]' : '[missing]'}`);

      // Send e-Pass if enabled — mirrors the main /api/visitors/checkin route
      if (pbSettings?.ePassEnabled && visitor) {
        try {
          const baseUrl = process.env.APP_URL ||
            `${req.get('x-forwarded-proto') || req.protocol}://${req.get('x-forwarded-host') || req.get('host')}`;
          const ePassUrl = `${baseUrl}/epass/${visitor.id}`;

          await databaseService.updateVisitor(context, visitor.id, {
            ePassUrl,
            ePassDeliveryType: pbSettings.ePassDeliveryMethod || 'email'
          });

          let host = null;
          if (visitor.hostStaffId) {
            try { host = await databaseService.getStaffById(context, visitor.hostStaffId); } catch {}
          }

          const method = pbSettings.ePassDeliveryMethod || 'email';
          if (visitor.email && (method === 'email' || method === 'both' || method === 'choice')) {
            try {
              const emailSent = await emailService.forCustomer(req.customerId).sendDigitalEPass(
                visitor as any,
                host as any || null,
                pbSettings as any,
                ePassUrl
              );
              if (emailSent) {
                const sentAt = new Date();
                await databaseService.updateVisitor(context, visitor.id, { ePassSent: true, ePassSentAt: sentAt });
                logger.info(`Pre-booking check-in: E-Pass sent to [email]`);
              }
            } catch (emailError) {
              logger.error('Pre-booking check-in: Failed to send e-Pass email:', emailError);
            }
          }

          // Always mark ePassSent on the response object when ePass is enabled
          (visitor as any).ePassSent = true;
          (visitor as any).ePassUrl = ePassUrl;
        } catch (ePassError) {
          logger.error('Pre-booking check-in: e-Pass block failed:', ePassError);
        }
      }

      res.json({ visitor, preBooking });
    } catch (error) {
      logger.error("Error checking in pre-booking:", error);
      res.status(500).json({ error: "Failed to check in pre-booking" });
    }
  });

  app.post("/api/prebookings/manual-checkin", requireAuth, async (req, res) => {
    try {
      const { preBookingId } = req.body;
      
      if (!preBookingId) {
        return res.status(400).json({ error: "Pre-booking ID is required" });
      }

      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const customerDb = await customerDbService.getCustomerDatabase(context.customerId);

      const [preBooking] = await customerDb.select().from(isolatedSchema.preBookings)
        .where(eq(isolatedSchema.preBookings.id, preBookingId)).limit(1);
      if (!preBooking) {
        return res.status(404).json({ error: "Pre-booking not found" });
      }

      if (preBooking.isCheckedIn) {
        return res.status(400).json({ error: "Visitor already checked in" });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const visitDate = new Date(preBooking.visitDate);
      visitDate.setHours(0, 0, 0, 0);
      
      if (visitDate < today) {
        return res.status(400).json({ error: "Cannot check in for past visits" });
      }

      const firstName = preBooking.visitorFirstName;
      const lastName = preBooking.visitorLastName;
      
      logger.info(`Pre-booking manual check-in: ${firstName} ${lastName} from ${preBooking.company || 'no company'}`);
      
      const existingVisitors = await customerDb.select().from(isolatedSchema.visitors)
        .where(and(
          eq(isolatedSchema.visitors.isCheckedIn, true),
          eq(isolatedSchema.visitors.firstName, firstName),
          eq(isolatedSchema.visitors.lastName, lastName)
        )).limit(1);
      const existingVisitor = existingVisitors[0];
      
      if (existingVisitor) {
        logger.info(`DUPLICATE FOUND in pre-booking: ID ${existingVisitor.id} (ID: ${existingVisitor.id}) is already checked in`);
        return res.status(400).json({ 
          error: "Visitor already checked in", 
          details: `${firstName} ${lastName} from ${preBooking.company || 'this company'} is already on-site.`
        });
      }
      
      logger.info(`No duplicate found in pre-booking, creating new visitor: ${firstName} ${lastName}`);
      
      // Look up the host staff member in the customer database by their ID
      let hostStaffInCustomerDb = null;
      if (preBooking.hostStaffId) {
        const hostStaffResults = await customerDb
          .select()
          .from(isolatedSchema.staff)
          .where(eq(isolatedSchema.staff.id, preBooking.hostStaffId))
          .limit(1);
        
        hostStaffInCustomerDb = hostStaffResults[0];
        
        if (!hostStaffInCustomerDb) {
          logger.info(`Warning: Host staff ${preBooking.hostStaffId} not found in customer database`);
        }
      }

      // Create visitor record from pre-booking using customer database
      const hsToken = randomBytes(16).toString('hex');
      const visitor = await databaseService.createVisitor(context, {
        firstName,
        lastName,
        email: preBooking.visitorEmail,
        company: preBooking.company,
        purpose: preBooking.purpose,
        carRegistration: null,
        hostStaffId: hostStaffInCustomerDb ? hostStaffInCustomerDb.id : null,
        hsRulesAcceptanceToken: hsToken,
        isCheckedIn: true,
        checkedInAt: new Date()
      });

      const [updatedPreBooking] = await customerDb.update(isolatedSchema.preBookings)
        .set({ isCheckedIn: true, checkedInAt: new Date(), visitorId: visitor.id })
        .where(eq(isolatedSchema.preBookings.id, preBooking.id)).returning();

      // Send email notification to host if host exists
      if (hostStaffInCustomerDb && hostStaffInCustomerDb.email) {
        try {
          const emailService = new EmailService(req.customerId);
          const subject = `✅ Visitor Arrived: ${firstName} ${lastName}`;
          
          const html = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f6f6f6;">
              <div style="max-width: 600px; margin: 20px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; padding: 30px; text-align: center;">
                  <h1 style="margin: 0; font-size: 24px;">✅ Visitor Checked In</h1>
                </div>
                
                <div style="padding: 30px;">
                  <p style="color: #333; font-size: 16px; margin-bottom: 20px;">
                    Hello <strong>${hostStaffInCustomerDb.firstName} ${hostStaffInCustomerDb.lastName}</strong>,
                  </p>
                  
                  <p style="color: #333; font-size: 16px; margin-bottom: 20px;">
                    Your visitor has just checked in at reception.
                  </p>
                  
                  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #2563eb; margin: 20px 0;">
                    <h3 style="margin: 0 0 15px 0; color: #2563eb; font-size: 18px;">Visitor Details</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 8px 0; color: #666; font-size: 14px;">Name:</td>
                        <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">${firstName} ${lastName}</td>
                      </tr>
                      ${preBooking.company ? `
                      <tr>
                        <td style="padding: 8px 0; color: #666; font-size: 14px;">Company:</td>
                        <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">${preBooking.company}</td>
                      </tr>
                      ` : ''}
                      ${preBooking.purpose ? `
                      <tr>
                        <td style="padding: 8px 0; color: #666; font-size: 14px;">Purpose:</td>
                        <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">${preBooking.purpose}</td>
                      </tr>
                      ` : ''}
                      <tr>
                        <td style="padding: 8px 0; color: #666; font-size: 14px;">Check-in Time:</td>
                        <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">${new Date().toLocaleString('en-GB')}</td>
                      </tr>
                    </table>
                  </div>
                  
                  <p style="color: #666; font-size: 14px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                    📧 This is an automated notification from your visitor management system.
                  </p>
                </div>
              </div>
            </body>
            </html>
          `;
          
          const text = `Visitor Checked In

Hello ${hostStaffInCustomerDb.firstName} ${hostStaffInCustomerDb.lastName},

Your visitor has just checked in at reception.

Visitor Details:
- Name: ${firstName} ${lastName}
${preBooking.company ? `- Company: ${preBooking.company}` : ''}
${preBooking.purpose ? `- Purpose: ${preBooking.purpose}` : ''}
- Check-in Time: ${new Date().toLocaleString('en-GB')}

This is an automated notification from your visitor management system.`;
          
          await emailService.forCustomer(req.customerId).sendEmail({
            to: hostStaffInCustomerDb.email,
            subject,
            html,
            text
          });
          
          logger.info(`Check-in notification sent to host: [email]`);
        } catch (emailError) {
          logger.error('Failed to send check-in notification email:', emailError);
          // Don't fail the check-in if email fails
        }
      }

      // Send e-Pass if enabled (same as the main checkin route)
      let ePassSentForManual = false;
      try {
        const settings = await databaseService.getCompanySettings(context);
        if (settings?.ePassEnabled && visitor?.email) {
          const baseUrl = process.env.APP_URL ||
            `${req.get('x-forwarded-proto') || req.protocol}://${req.get('x-forwarded-host') || req.get('host')}`;
          const ePassUrl = `${baseUrl}/epass/${visitor.id}`;
          await databaseService.updateVisitor(context, visitor.id, {
            ePassUrl,
            ePassDeliveryType: settings.ePassDeliveryMethod || 'email'
          });
          const method = settings.ePassDeliveryMethod || 'email';
          if (method === 'email' || method === 'both' || method === 'choice') {
            const emailSvc = new EmailService(req.customerId);
            const emailSent = await emailSvc.forCustomer(req.customerId).sendDigitalEPass(
              visitor as any,
              hostStaffInCustomerDb as any || null,
              settings as any,
              ePassUrl
            );
            if (emailSent) {
              await databaseService.updateVisitor(context, visitor.id, { ePassSent: true, ePassSentAt: new Date() });
              visitor.ePassSent = true;
              visitor.ePassUrl = ePassUrl;
              ePassSentForManual = true;
              logger.info(`Manual check-in: E-Pass sent to [email]`);
            }
          }
        }
      } catch (ePassError) {
        logger.error('Manual check-in: Failed to send e-Pass:', ePassError);
      }

      res.json({ 
        success: true,
        visitor: { ...visitor, ePassSent: ePassSentForManual },
        preBooking: updatedPreBooking,
        message: "Visitor checked in manually successfully"
      });
    } catch (error) {
      logger.error("Manual pre-booking check-in error:", error);
      res.status(500).json({ error: "Failed to manually check in visitor" });
    }
  });

  app.post("/api/xstation/qr-scan", async (req, res) => {
    try {
      const { qrCode, deviceIp, action = 'checkin', timestamp, customerId: bodyCustomerId } = req.body;
      
      logger.info(`X-Station QR scan event:`, { deviceIp, action, qrCode, timestamp });
      
      if (!qrCode) {
        return res.status(400).json({ error: "QR code is required" });
      }
      
      const resolvedCustomerId = bodyCustomerId || (req as any).customerId;
      if (!resolvedCustomerId) {
        return res.status(400).json({ error: 'customerId is required' });
      }
      const context = simpleDatabaseService.createCustomerContext('xstation-device', resolvedCustomerId);
      const customerDb = await customerDbService.getCustomerDatabase(context.customerId);
      
      if (qrCode.startsWith('MTG:')) {
        const parts = qrCode.split(':');
        if (parts.length >= 5) {
          const [, bookingId, attendeeType, attendeeId, providedHmac] = parts;
          
          const payload = `MTG:${bookingId}:${attendeeType}:${attendeeId}`;
          const secret = process.env.SESSION_SECRET || process.env.QR_SIGNING_SECRET || 'tpr-max-qr-signing-key';
          const crypto = await import('crypto');
          const expectedHmac = crypto.createHmac('sha256', secret).update(payload).digest('hex').substring(0, 12);
          
          if (providedHmac !== expectedHmac) {
            logger.warn(`Invalid QR signature for meeting scan: ${qrCode}`);
            return res.status(403).json({ error: "Invalid QR code signature" });
          }
          
          logger.info(`Meeting room QR scan (verified): booking=${bookingId}, type=${attendeeType}, id=${attendeeId}`);
          
          const [roomBooking] = await customerDb.select().from(isolatedSchema.roomBookings)
            .where(eq(isolatedSchema.roomBookings.id, bookingId)).limit(1);
          
          if (!roomBooking) {
            return res.status(404).json({ error: "Meeting booking not found" });
          }
          
          const bookingStart = new Date(roomBooking.startTime || roomBooking.startDateTime);
          const bookingEnd = new Date(roomBooking.endTime || roomBooking.endDateTime);
          const now = new Date();
          const earlyWindow = new Date(bookingStart.getTime() - 30 * 60 * 1000);
          const lateWindow = new Date(bookingEnd.getTime() + 30 * 60 * 1000);
          
          if (now < earlyWindow || now > lateWindow) {
            return res.status(400).json({ 
              error: "QR code is not valid at this time",
              bookingTime: `${bookingStart.toLocaleString('en-GB')} - ${bookingEnd.toLocaleString('en-GB')}`
            });
          }
          
          const bookingAttendees = await customerDb.select().from(isolatedSchema.roomBookingAttendees)
            .where(eq(isolatedSchema.roomBookingAttendees.bookingId, bookingId));
          
          const [room] = await customerDb.select().from(isolatedSchema.meetingRooms)
            .where(eq(isolatedSchema.meetingRooms.id, roomBooking.meetingRoomId)).limit(1);
          
          if (attendeeType === 'staff') {
            const isRegisteredAttendee = bookingAttendees.some(
              (a: any) => a.staffId === attendeeId || roomBooking.bookedByStaffId === attendeeId
            );
            if (!isRegisteredAttendee) {
              return res.status(403).json({ error: "You are not a registered attendee of this meeting" });
            }
            
            const [staffMember] = await customerDb.select().from(isolatedSchema.staff)
              .where(eq(isolatedSchema.staff.id, attendeeId)).limit(1);
            
            if (staffMember && !staffMember.isCheckedIn) {
              await customerDb.update(isolatedSchema.staff)
                .set({ isCheckedIn: true, checkedInAt: new Date() })
                .where(eq(isolatedSchema.staff.id, attendeeId));
            }
            
            return res.json({
              success: true,
              type: 'meeting-attendee',
              action: 'access-granted',
              attendeeName: staffMember ? `${staffMember.firstName} ${staffMember.lastName}` : attendeeId,
              meeting: roomBooking.title,
              room: room?.name || 'Unknown',
              deviceIp
            });
          } else {
            const isRegisteredExternal = bookingAttendees.some(
              (a: any) => !a.staffId && a.email && a.email.replace(/[^a-zA-Z0-9]/g, '').substring(0, 20) === attendeeId
            );
            if (!isRegisteredExternal) {
              return res.status(403).json({ error: "You are not a registered attendee of this meeting" });
            }
            
            return res.json({
              success: true,
              type: 'meeting-external',
              action: 'access-granted',
              attendeeId,
              meeting: roomBooking.title,
              room: room?.name || 'Unknown',
              deviceIp
            });
          }
        }
        return res.status(400).json({ error: "Invalid meeting QR code format" });
      }
      
      const [preBooking] = await customerDb.select().from(isolatedSchema.preBookings)
        .where(eq(isolatedSchema.preBookings.qrCode, qrCode)).limit(1);
      if (preBooking) {
        if (action === 'checkin' && !preBooking.isCheckedIn) {
          const visitor = await databaseService.createVisitor(context, {
            firstName: preBooking.visitorFirstName,
            lastName: preBooking.visitorLastName,
            email: preBooking.visitorEmail,
            company: preBooking.company,
            purpose: preBooking.purpose,
            carRegistration: null,
            hostStaffId: preBooking.hostStaffId,
            isPreBooked: true,
            expectedDateTime: preBooking.visitDate,
            visitPurpose: preBooking.purpose,
          });
          
          await customerDb.update(isolatedSchema.preBookings)
            .set({ isCheckedIn: true, checkedInAt: new Date(), visitorId: visitor.id })
            .where(eq(isolatedSchema.preBookings.id, preBooking.id));
          
          return res.json({
            success: true,
            type: 'pre-booking',
            action: 'checked-in',
            visitor,
            deviceIp
          });
        }
        return res.status(400).json({ error: "Pre-booking already checked in" });
      }
      
      const [visitor] = await customerDb.select().from(isolatedSchema.visitors)
        .where(eq(isolatedSchema.visitors.qrCode, qrCode)).limit(1);
      if (visitor) {
        if (action === 'checkout' && visitor.isCheckedIn) {
          const [checkedOut] = await customerDb.update(isolatedSchema.visitors)
            .set({ isCheckedIn: false, checkedOutAt: new Date() })
            .where(eq(isolatedSchema.visitors.id, visitor.id)).returning();
          // Mark any linked pre-booking as completed so it leaves Upcoming Visits
          await customerDb.update(isolatedSchema.preBookings)
            .set({ isCheckedIn: false, status: 'completed' })
            .where(and(
              eq(isolatedSchema.preBookings.visitorId, visitor.id),
              ne(isolatedSchema.preBookings.status, 'cancelled')
            ));
          return res.json({
            success: true,
            type: 'visitor',
            action: 'checked-out',
            visitor: checkedOut,
            deviceIp
          });
        }
        return res.status(400).json({ error: "Visitor already checked out or not checked in" });
      }
      
      return res.status(404).json({ error: "QR code not recognized" });
    } catch (error) {
      logger.error("X-Station QR scan error:", error);
      res.status(500).json({ error: "Failed to process X-Station QR scan" });
    }
  });

  // ============================================================
  // PAXTON NET2 ACCESS CONTROL INTEGRATION
  // ============================================================

  app.post("/api/paxton/test-connection", requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const customerDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [settings] = await customerDb.select().from(isolatedSchema.companySettings).limit(1);

      if (!settings?.paxtonEnabled || !settings?.paxtonServerUrl) {
        return res.status(400).json({ error: "Paxton Net2 integration is not configured" });
      }

      const result = await paxtonService.testConnection({
        serverUrl: settings.paxtonServerUrl,
        port: settings.paxtonPort || '8080',
        clientId: settings.paxtonClientId || '',
        username: settings.paxtonUsername || '',
        password: settings.paxtonPassword || '',
      });

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to test Paxton connection" });
    }
  });

  app.get("/api/paxton/doors", requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const customerDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [settings] = await customerDb.select().from(isolatedSchema.companySettings).limit(1);

      if (!settings?.paxtonEnabled || !settings?.paxtonServerUrl) {
        return res.status(400).json({ error: "Paxton Net2 integration is not configured" });
      }

      const config = {
        serverUrl: settings.paxtonServerUrl,
        port: settings.paxtonPort || '8080',
        clientId: settings.paxtonClientId || '',
        username: settings.paxtonUsername || '',
        password: settings.paxtonPassword || '',
      };

      const doors = await paxtonService.getDoors(config);
      res.json(doors);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch Paxton doors" });
    }
  });

  app.get("/api/paxton/access-levels", requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const customerDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [settings] = await customerDb.select().from(isolatedSchema.companySettings).limit(1);

      if (!settings?.paxtonEnabled || !settings?.paxtonServerUrl) {
        return res.status(400).json({ error: "Paxton Net2 integration is not configured" });
      }

      const config = {
        serverUrl: settings.paxtonServerUrl,
        port: settings.paxtonPort || '8080',
        clientId: settings.paxtonClientId || '',
        username: settings.paxtonUsername || '',
        password: settings.paxtonPassword || '',
      };

      const levels = await paxtonService.getAccessLevels(config);
      res.json(levels);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch Paxton access levels" });
    }
  });

  app.post("/api/paxton/open-door", requireAuth, async (req, res) => {
    try {
      const { doorId, duration = 5 } = req.body;
      if (!doorId) return res.status(400).json({ error: "Door ID is required" });

      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const customerDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [settings] = await customerDb.select().from(isolatedSchema.companySettings).limit(1);

      if (!settings?.paxtonEnabled || !settings?.paxtonServerUrl) {
        return res.status(400).json({ error: "Paxton Net2 integration is not configured" });
      }

      const config = {
        serverUrl: settings.paxtonServerUrl,
        port: settings.paxtonPort || '8080',
        clientId: settings.paxtonClientId || '',
        username: settings.paxtonUsername || '',
        password: settings.paxtonPassword || '',
      };

      const success = await paxtonService.openDoor(config, doorId, duration);
      res.json({ success, doorId, duration });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to open door" });
    }
  });

  app.post("/api/paxton/sync-staff", requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const customerDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [settings] = await customerDb.select().from(isolatedSchema.companySettings).limit(1);

      if (!settings?.paxtonEnabled || !settings?.paxtonServerUrl) {
        return res.status(400).json({ error: "Paxton Net2 integration is not configured" });
      }

      const config = {
        serverUrl: settings.paxtonServerUrl,
        port: settings.paxtonPort || '8080',
        clientId: settings.paxtonClientId || '',
        username: settings.paxtonUsername || '',
        password: settings.paxtonPassword || '',
      };

      const allStaff = await customerDb.select().from(isolatedSchema.staff);
      const staffList = allStaff.map((s: any) => ({
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        department: s.department,
        isCheckedIn: s.isCheckedIn,
      }));

      const result = await paxtonService.syncStaffToNet2(config, staffList, settings.paxtonDefaultAccessLevel || undefined);

      await customerDb.update(isolatedSchema.companySettings)
        .set({ paxtonLastSync: new Date() })
        .where(eq(isolatedSchema.companySettings.id, settings.id));

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to sync staff to Paxton" });
    }
  });

  app.get("/api/paxton/events", requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const customerDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [settings] = await customerDb.select().from(isolatedSchema.companySettings).limit(1);

      if (!settings?.paxtonEnabled || !settings?.paxtonServerUrl) {
        return res.status(400).json({ error: "Paxton Net2 integration is not configured" });
      }

      const config = {
        serverUrl: settings.paxtonServerUrl,
        port: settings.paxtonPort || '8080',
        clientId: settings.paxtonClientId || '',
        username: settings.paxtonUsername || '',
        password: settings.paxtonPassword || '',
      };

      const { from, to, doorId } = req.query;
      const events = await paxtonService.getEvents(config, {
        from: from as string,
        to: to as string,
        doorId: doorId ? parseInt(doorId as string) : undefined,
      });

      res.json(events);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch Paxton events" });
    }
  });

  app.post("/api/paxton/webhook", async (req, res) => {
    try {
      const { customerId } = req.query;
      const resolvedCustomerId = (customerId as string);
      if (!resolvedCustomerId) {
        return res.status(400).json({ error: 'customerId is required' });
      }
      const customerDb = await customerDbService.getCustomerDatabase(resolvedCustomerId);
      const [settings] = await customerDb.select().from(isolatedSchema.companySettings).limit(1);

      const result = paxtonService.handleWebhookEvent(req.body, settings?.paxtonWebhookSecret || undefined);

      if (!result.valid) {
        return res.status(401).json({ error: "Invalid webhook signature" });
      }

      logger.info(`Paxton webhook event: ${result.eventType}`, result.data);
      res.json({ received: true, eventType: result.eventType });
    } catch (error: any) {
      logger.error("Paxton webhook error:", error);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  // ============================================================
  // API KEY & WEBHOOK MANAGEMENT
  // ============================================================

  app.post("/api/integrations/generate-api-key", requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const customerDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [settings] = await customerDb.select().from(isolatedSchema.companySettings).limit(1);

      if (!settings) return res.status(404).json({ error: "Company settings not found" });

      const crypto = await import('crypto');
      const apiKey = `tpr_${crypto.randomBytes(32).toString('hex')}`;
      const webhookSecret = `whsec_${crypto.randomBytes(24).toString('hex')}`;

      await customerDb.update(isolatedSchema.companySettings)
        .set({ apiKey, apiWebhookSecret: webhookSecret, apiWebhooksEnabled: true })
        .where(eq(isolatedSchema.companySettings.id, settings.id));

      res.json({ apiKey, webhookSecret });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to generate API key" });
    }
  });

  app.post("/api/integrations/revoke-api-key", requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const customerDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [settings] = await customerDb.select().from(isolatedSchema.companySettings).limit(1);

      if (!settings) return res.status(404).json({ error: "Company settings not found" });

      await customerDb.update(isolatedSchema.companySettings)
        .set({ apiKey: '', apiWebhookSecret: '', apiWebhooksEnabled: false })
        .where(eq(isolatedSchema.companySettings.id, settings.id));

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to revoke API key" });
    }
  });

  app.post("/api/integrations/test-webhook", requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const customerDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [settings] = await customerDb.select().from(isolatedSchema.companySettings).limit(1);

      if (!settings?.apiWebhookUrl) {
        return res.status(400).json({ error: "No webhook URL configured" });
      }

      const testPayload = {
        event: 'test.webhook',
        timestamp: new Date().toISOString(),
        data: { message: 'This is a test webhook from TPR Max' },
      };

      try {
        const response = await fetch(settings.apiWebhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-TPR-Webhook-Secret': settings.apiWebhookSecret || '',
            'X-TPR-Event': 'test.webhook',
          },
          body: JSON.stringify(testPayload),
        });

        res.json({
          success: response.ok,
          statusCode: response.status,
          message: response.ok ? 'Webhook delivered successfully' : `Webhook returned ${response.status}`,
        });
      } catch (fetchError: any) {
        res.json({
          success: false,
          message: `Failed to reach webhook URL: ${fetchError.message}`,
        });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to test webhook" });
    }
  });

  // Reception Diary: Customer-isolated pre-bookings for reception
  app.get("/api/reception/diary", requireAuth, async (req, res) => {
    try {
      if (!req.user?.username) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const context = simpleDatabaseService.createCustomerContext(req.user.username, req.customerId);
      
      const { date, days = 7 } = req.query;
      const targetDate = date ? new Date(date as string) : new Date();
      targetDate.setHours(0, 0, 0, 0);
      const daysAhead = parseInt(days as string) || 7;
      
      const endDate = new Date(targetDate);
      endDate.setDate(targetDate.getDate() + daysAhead);
      endDate.setHours(23, 59, 59, 999);
      
      const customerDb = await customerDbService.getCustomerDatabase(context.customerId);
      
      const allStoredPreBookings = await customerDb.select().from(isolatedSchema.preBookings)
        .where(and(
          ne(isolatedSchema.preBookings.status, 'cancelled'),
          ne(isolatedSchema.preBookings.status, 'completed'),
          eq(isolatedSchema.preBookings.isCheckedIn, false)
        ));
      const visitorPreBookings = allStoredPreBookings.filter((pb: any) => {
        const visitDate = new Date(pb.visitDate);
        return visitDate >= targetDate && visitDate <= endDate;
      });
      
      logger.info(`Diary query: customer=${context.customerId}, targetDate=${targetDate.toISOString()}, endDate=${endDate.toISOString()}, found ${visitorPreBookings.length} visitor pre-bookings`);
      
      const allStaff = await customerDb.select().from(isolatedSchema.staff);
      const staffMap = new Map(allStaff.map((s: any) => [s.id, s]));
      
      const enrichedVisitors = visitorPreBookings.map((pb: any) => {
        const hostStaff = pb.hostStaffId ? staffMap.get(pb.hostStaffId) : null;
        return {
          ...pb,
          hostFirstName: hostStaff?.firstName || (pb.hostName ? pb.hostName.split(' ')[0] : null),
          hostLastName: hostStaff?.lastName || (pb.hostName ? pb.hostName.split(' ').slice(1).join(' ') : null),
          hostDepartment: hostStaff?.department || null,
          hostEmail: hostStaff?.email || null,
        };
      });
      
      let contractorBookings: any[] = [];
      try {
        const allContractorBookings = await customerDb.select().from(isolatedSchema.contractorPreBookings);
        contractorBookings = allContractorBookings.filter((booking: any) => {
          const scheduledDate = new Date(booking.scheduledDate);
          return scheduledDate >= targetDate && scheduledDate <= endDate;
        });
      } catch (contractorError) {
        logger.info("Note: contractor_prebookings table may not exist yet:", (contractorError as any).message);
      }
      
      const enrichedContractors = contractorBookings.map((booking: any) => {
        const hostStaff = booking.hostStaffId ? staffMap.get(booking.hostStaffId) : null;
        return {
          ...booking,
          hostFirstName: hostStaff?.firstName || (booking.hostName ? booking.hostName.split(' ')[0] : null),
          hostLastName: hostStaff?.lastName || (booking.hostName ? booking.hostName.split(' ').slice(1).join(' ') : null),
          hostDepartment: hostStaff?.department || null,
        };
      });
      
      let roomBookingsForDiary: any[] = [];
      try {
        const allRoomBookings = await customerDb.select().from(isolatedSchema.roomBookings);
        const filteredRoomBookings = allRoomBookings.filter((rb: any) => {
          const bookingStart = new Date(rb.startTime);
          return bookingStart >= targetDate && bookingStart <= endDate;
        });
        
        if (filteredRoomBookings.length > 0) {
          const allRooms = await customerDb.select().from(isolatedSchema.meetingRooms);
          const roomMap = new Map(allRooms.map((r: any) => [r.id, r]));
          
          roomBookingsForDiary = filteredRoomBookings.map((rb: any) => {
            const room = roomMap.get(rb.meetingRoomId);
            const organizer = rb.bookedByStaffId ? staffMap.get(rb.bookedByStaffId) : null;
            return {
              ...rb,
              roomName: room?.name || 'Unknown Room',
              roomLocation: room?.location || '',
              organizerName: organizer ? `${organizer.firstName} ${organizer.lastName}` : 'Unknown',
              organizerEmail: organizer?.email || '',
            };
          });
        }
      } catch (roomBookingError) {
        logger.info("Note: room_bookings table may not exist yet:", (roomBookingError as any).message);
      }
      
      res.json({
        visitors: enrichedVisitors,
        contractors: enrichedContractors,
        roomBookings: roomBookingsForDiary,
      });
    } catch (error) {
      logger.error("Error fetching reception diary:", error);
      
      // DEV DATA BYPASS: Check if this is a Neon database error and bypass is enabled
      if (isDevDataBypass() && isDatabaseConnectionError(error)) {
        return res.json(getMockReceptionDiary());
      }
      
      res.status(500).json({ error: "Failed to fetch reception diary" });
    }
  });

  app.get("/api/prebookings/today", requireAuth, async (req, res) => {
    try {
      const today = new Date();
      const pbContext = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const pbCustomerDb = await customerDbService.getCustomerDatabase(pbContext.customerId);
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
      const preBookings = await pbCustomerDb.select().from(isolatedSchema.preBookings)
        .where(and(gte(isolatedSchema.preBookings.expectedDate, todayStart), gte(todayEnd, isolatedSchema.preBookings.expectedDate)));
      res.json(preBookings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch today's pre-bookings" });
    }
  });
}
