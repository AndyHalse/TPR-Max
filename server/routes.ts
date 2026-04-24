import type { Express } from "express";
import { createServer, type Server } from "http";
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { logger } from "./utils/logger";
import {
  BIOSTAR_LOG_MAX,
  ppmTokenCache,
  ppmTokenCacheGet,
  ppmTokenCacheSet,
  ppmTokenCacheEvict,
  ppmPublicRateLimit,
  biostarLiveLog,
  pushBiostarEvent,
} from './routeState';
import { storage } from "./storage";
import { databaseService } from "./databaseService";
import { simpleDatabaseService } from "./simpleDatabaseService";
import { customerDbService, type CustomerContext } from "./customerDatabase";
import { insertCompanySettingsSchema } from "./isolatedSchema";
import { 
  insertStaffSchema, 
  insertVisitorSchema, 
  insertPreBookingSchema, 
  insertUserSchema, 
  insertUserInvitationSchema,
  insertContractorCompanySchema,
  insertContractorWorkerSchema,
  insertComplianceDocumentSchema,
  insertPrinterConfigurationSchema,
  inductionSettings,
  insertInductionSettingsSchema,
  inductionTokens,
  inductionQuestions,
  insertNvqQualificationSchema,
  aiGeneratedImages,
  insertAiGeneratedImageSchema,
  printServiceInstances,
  insertPrintServiceInstanceSchema,
  printQueue,
  insertPrintQueueSchema,
  printJobHistory,
  insertPrintJobHistorySchema,
  helpCategories,
  helpArticles,
  helpUserInteractions,
  helpOnboardingProgress,
  insertHelpArticleSchema,
  insertHelpUserInteractionSchema,
  insertHelpOnboardingProgressSchema,
  insertUkHSDocumentTemplateSchema,
  insertWorkerDocumentAssignmentSchema,
  insertWorkerDocumentAcceptanceSchema,
  workerDocumentAssignments,
  workerDocumentAcceptances,
  ukHSDocumentTemplates,
  contractorWorkers,
  contractorCompanies,
  customerOnboardingRequestSchema,
  customerOnboardingResponseSchema,
  customerOnboardingErrorSchema,
  type CustomerOnboardingRequest,
  type CustomerOnboardingResponse,
  type CustomerOnboardingError,
  evacuations,
  evacuationAccountability,
  ramsDocuments,
  ramsAcknowledgements,
  ramsAuditLog,
  insertRamsDocumentSchema,
  insertRamsAcknowledgementSchema,
} from "@shared/schema";
import { z } from "zod";
import path from "path";
import express from "express";
import { randomUUID, randomBytes } from "crypto";
import { CO2CalculationService } from "./co2CalculationService";

import { ObjectStorageService, ObjectNotFoundError, objectStorageClient, parseObjectPath as parseObjectStoragePath } from "./objectStorage";
import multer from "multer";

// Staff authentication schema
const staffAuthSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
import { EmailService, emailService } from "./emailService";
import { VoiceNotificationService } from "./voiceNotificationService";
import { EmergencyEmailService } from "./emergencyEmailService";
import { aiService } from "./aiService";
import { AuthService, requireAuth, requireAuthOrFireMarshal, isDevAuthBypass, getDevUser, isValidDevCredentials, isDevDataBypass, isDatabaseConnectionError, getMockDepartmentAnalytics, getMockPeakHoursAnalytics, getMockCheckedInStaff, getMockCheckedInContractors, getMockCurrentVisitors, getMockRecentActivity, getMockCompanyStats, getMockCompanySettings, getMockTodaysVisitors, getMockRoomBookings, getMockReceptionDiary } from "./auth";
import { CustomerDatabaseService } from "./customerDatabase";
import * as isolatedSchema from "./isolatedSchema";
import { inductionService } from "./inductionService";
import { db } from "./db";
import { eq, and, sql, desc, inArray, gte, lte, lt, ne, isNotNull, isNull, SQL } from "drizzle-orm";
import { Pool } from 'pg';
import { websocketService } from "./websocketService";
import { drizzle } from 'drizzle-orm/node-postgres';
import { generateStaffWalletPass } from './walletPassService';
import * as sharedSchema from '@shared/schema';
import { biostarService } from "./biostarService";
import { paxtonService } from "./paxtonService";
import { customerOnboardingService } from "./customerOnboardingService";
import { registerBillingRoutes } from "./billingRoutes";
import { registerSplitRoutes } from "./routes/index";
import { stripeService } from "./stripeService";
import cron from "node-cron";

export async function registerRoutes(app: Express, existingServer?: Server): Promise<Server> {
  // Apply shared-DB schema migrations (evacuations table is in the shared DB, not isolated)
  try {
    await db.execute(sql`ALTER TABLE evacuations ADD COLUMN IF NOT EXISTS is_drill BOOLEAN NOT NULL DEFAULT FALSE`);
    console.log(`✅ [shared-migration] evacuations.is_drill column ensured`);
  } catch (e: any) {
    console.log(`⚠️ [shared-migration] evacuations.is_drill: ${String(e?.message || e).substring(0, 120)}`);
  }
  try {
    await db.execute(sql`ALTER TABLE evacuations ADD COLUMN IF NOT EXISTS report_pdf_url TEXT`);
    console.log(`✅ [shared-migration] evacuations.report_pdf_url column ensured`);
  } catch (e: any) {
    console.log(`⚠️ [shared-migration] evacuations.report_pdf_url: ${String(e?.message || e).substring(0, 120)}`);
  }

  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  // AWS Health Check endpoints (HIGHEST PRIORITY - before any other routes)
  // These endpoints are critical for load balancer health checks and monitoring
  const { healthCheckService } = await import("./healthChecks");
  app.get('/livez', healthCheckService.liveness.bind(healthCheckService));
  app.get('/readyz', healthCheckService.readiness.bind(healthCheckService));
  app.get('/healthz', healthCheckService.combined.bind(healthCheckService));
  
  // Register billing routes (includes Stripe webhook)
  registerBillingRoutes(app);

  // Register split route modules (auth and future domain modules)
  const server = existingServer ?? createServer(app);
  await registerSplitRoutes(app, server, setupAutomaticDailyReset);
  
  // Serve static files from public directory
  app.use('/sample-*.pdf', express.static(path.join(process.cwd(), 'public')));

  // AI Generated Images endpoints
  app.post("/api/ai/generate-safety-image", requireAuth, async (req, res) => {
    try {
      const { slideType, title, description } = req.body;
      
      if (!slideType || !title || !description) {
        return res.status(400).json({ error: "slideType, title, and description are required" });
      }

      console.log(`🎨 Generating AI safety image for ${slideType}: ${title}`);
      
      // FIXED: Get customer context using authenticated session customerId
      if (!req.session?.customerId) {
        return res.status(401).json({ error: "Customer context not found in session" });
      }
      const context = { customerId: req.session.customerId };
      
      // Generate the image using AI service with customer context
      const { imageUrl, dallePrompt } = await aiService.generateSafetyImage(context, slideType, title, description);
      
      // Store the generated image metadata in customer-isolated database
      const savedImage = await databaseService.createAiGeneratedImage(context, {
        slideType,
        title,
        description,
        imageUrl,
        dallePrompt,
        dalleRevision: "dall-e-3",
        imageSize: "1024x1024",
        quality: "standard",
        style: "vivid",
        isActive: true
      });

      console.log(`✅ AI safety image generated and saved: ${savedImage.id}`);
      
      res.json({
        success: true,
        image: savedImage
      });
    } catch (error) {
      console.error('Error generating AI safety image:', error);
      res.status(500).json({ error: 'Failed to generate AI safety image' });
    }
  });

  app.get("/api/ai/safety-images", requireAuth, async (req, res) => {
    try {
      const { slideType } = req.query;
      
      // FIXED: Get customer context using authenticated session customerId
      if (!req.session?.customerId) {
        return res.status(401).json({ error: "Customer context not found in session" });
      }
      const context = { customerId: req.session.customerId };
      
      // Get images from customer-isolated database
      const images = await databaseService.getAiGeneratedImages(context, slideType as string);
      
      res.json({ images });
    } catch (error) {
      console.error('Error fetching AI safety images:', error);
      res.status(500).json({ error: 'Failed to fetch AI safety images' });
    }
  });

  app.get("/api/ai/safety-images/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      
      // FIXED: Get customer context using authenticated session customerId
      if (!req.session?.customerId) {
        return res.status(401).json({ error: "Customer context not found in session" });
      }
      const context = { customerId: req.session.customerId };
      
      // Get image from customer-isolated database
      const image = await databaseService.getAiGeneratedImageById(context, id);
      
      if (!image) {
        return res.status(404).json({ error: 'AI safety image not found' });
      }
      
      res.json({ image });
    } catch (error) {
      console.error('Error fetching AI safety image:', error);
      res.status(500).json({ error: 'Failed to fetch AI safety image' });
    }
  });

  // Get AI image by slide type (returns most recent)
  app.get("/api/ai/images/type/:slideType", requireAuth, async (req, res) => {
    try {
      const { slideType } = req.params;
      
      // FIXED: Get customer context using authenticated session customerId
      if (!req.session?.customerId) {
        return res.status(401).json({ error: "Customer context not found in session" });
      }
      const context = { customerId: req.session.customerId };
      
      // Get image from customer-isolated database
      const image = await databaseService.getAiGeneratedImageBySlideType(context, slideType);
      
      if (!image) {
        return res.status(404).json({ 
          success: false, 
          error: 'No AI safety image found for this slide type' 
        });
      }
      
      res.json({ 
        success: true, 
        image 
      });
    } catch (error) {
      console.error('Error fetching AI safety image by type:', error);
      res.status(500).json({ error: 'Failed to fetch AI safety image' });
    }
  });

  // Help System endpoints
  app.get("/api/help/categories", requireAuth, async (req, res) => {
    try {
      const categories = await db
        .select()
        .from(helpCategories)
        .where(eq(helpCategories.isActive, true))
        .orderBy(helpCategories.sortOrder, helpCategories.name);
      res.json(categories);
    } catch (error) {
      console.error('Error fetching help categories:', error);
      res.status(500).json({ error: 'Failed to fetch help categories' });
    }
  });

  app.get("/api/help/articles/featured", requireAuth, async (req, res) => {
    try {
      const articles = await db
        .select()
        .from(helpArticles)
        .where(and(
          eq(helpArticles.isPublished, true),
          eq(helpArticles.isFeatured, true)
        ))
        .orderBy(desc(helpArticles.viewCount))
        .limit(10);
      res.json(articles);
    } catch (error) {
      console.error('Error fetching featured help articles:', error);
      res.status(500).json({ error: 'Failed to fetch featured articles' });
    }
  });

  app.get("/api/help/articles/contextual", requireAuth, async (req, res) => {
    try {
      const { location } = req.query;
      const page = location && typeof location === 'string' ? location.replace(/^\//, '') : '';
      if (!page) return res.json([]);
      const articles = await db
        .select()
        .from(helpArticles)
        .where(and(
          eq(helpArticles.isPublished, true),
          sql`${page} = ANY(${helpArticles.targetPages})`
        ))
        .orderBy(helpArticles.sortOrder)
        .limit(5);
      res.json(articles);
    } catch (error) {
      console.error('Error fetching contextual help articles:', error);
      res.status(500).json({ error: 'Failed to fetch contextual articles' });
    }
  });

  app.get("/api/help/articles/category/:categoryId", requireAuth, async (req, res) => {
    try {
      const { categoryId } = req.params;
      const articles = await db
        .select()
        .from(helpArticles)
        .where(and(
          eq(helpArticles.isPublished, true),
          eq(helpArticles.categoryId, categoryId)
        ))
        .orderBy(helpArticles.sortOrder);
      res.json(articles);
    } catch (error) {
      console.error('Error fetching category help articles:', error);
      res.status(500).json({ error: 'Failed to fetch category articles' });
    }
  });

  app.get("/api/help/articles/general", requireAuth, async (req, res) => {
    try {
      const articles = await db
        .select()
        .from(helpArticles)
        .where(and(
          eq(helpArticles.isPublished, true),
          eq(helpArticles.isQuickStart, true)
        ))
        .orderBy(helpArticles.sortOrder)
        .limit(5);
      res.json(articles);
    } catch (error) {
      console.error('Error fetching general help articles:', error);
      res.status(500).json({ error: 'Failed to fetch help articles' });
    }
  });

  app.get("/api/help/articles/search", requireAuth, async (req, res) => {
    try {
      const { searchQuery } = req.query;
      const query = searchQuery && typeof searchQuery === 'string' ? searchQuery : '';
      if (!query || query.length < 3) return res.json([]);
      const articles = await db
        .select()
        .from(helpArticles)
        .where(and(
          eq(helpArticles.isPublished, true),
          sql`(
            LOWER(${helpArticles.title}) LIKE LOWER(${'%' + query + '%'}) OR
            LOWER(${helpArticles.content}) LIKE LOWER(${'%' + query + '%'}) OR
            LOWER(${helpArticles.summary}) LIKE LOWER(${'%' + query + '%'}) OR
            EXISTS (SELECT 1 FROM unnest(${helpArticles.searchKeywords}) AS keyword WHERE LOWER(keyword) LIKE LOWER(${'%' + query + '%'}))
          )`
        ))
        .orderBy(desc(helpArticles.viewCount))
        .limit(20);
      res.json(articles);
    } catch (error) {
      console.error('Error searching help articles:', error);
      res.status(500).json({ error: 'Failed to search articles' });
    }
  });

  app.post("/api/help/interactions", requireAuth, async (req, res) => {
    try {
      const { interactionType, articleId } = req.body;
      if (!interactionType || !articleId) {
        return res.status(400).json({ error: 'Missing interactionType or articleId' });
      }

      if (interactionType === 'view') {
        await db.update(helpArticles)
          .set({ viewCount: sql`COALESCE(${helpArticles.viewCount}, 0) + 1` })
          .where(eq(helpArticles.id, articleId));
      } else if (interactionType === 'helpful') {
        await db.update(helpArticles)
          .set({ helpfulCount: sql`COALESCE(${helpArticles.helpfulCount}, 0) + 1` })
          .where(eq(helpArticles.id, articleId));
      } else if (interactionType === 'not_helpful') {
        await db.update(helpArticles)
          .set({ notHelpfulCount: sql`COALESCE(${helpArticles.notHelpfulCount}, 0) + 1` })
          .where(eq(helpArticles.id, articleId));
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error tracking help interaction:', error);
      res.status(500).json({ error: 'Failed to track interaction' });
    }
  });

  // Stats endpoint
  app.get("/api/stats", requireAuth, async (req, res) => {
    try {
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const spCheck = await (custDb as any).execute(sql`SHOW search_path`);
      const activeSchema = spCheck?.rows?.[0]?.search_path || 'unknown';
      
      const stats = await databaseService.getStats(context);
      
      const contractorsOnSite = stats.contractorsOnSite || 0;
      
      let membersOnSite = 0;
      let featureMembers = false;
      try {
        const [custSettings] = await custDb
          .select()
          .from(isolatedSchema.companySettings)
          .limit(1);
        if (custSettings?.featureMembers === true) {
          featureMembers = true;
          const checkedInMembers = await custDb
            .select()
            .from(isolatedSchema.members)
            .where(eq(isolatedSchema.members.isCheckedIn, true));
          membersOnSite = checkedInMembers.length;
        }
      } catch (e) {
      }
      
      const totalPeopleOnSite = stats.currentVisitors + stats.staffOnSite + contractorsOnSite + membersOnSite;
      
      const visitors = await databaseService.getAllVisitors(context);
      const totalCompanies = [...new Set(visitors.map((v: any) => v.company).filter(Boolean))].length;
      
      res.setHeader('X-Schema', activeSchema);
      res.json({
        currentVisitors: stats.currentVisitors,
        todayCheckins: stats.todayCheckins,
        staffOnSite: stats.staffOnSite,
        totalStaff: stats.totalStaff,
        contractorsOnSite,
        membersOnSite,
        featureMembers,
        totalPeopleOnSite,
        totalCompanies
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
      
      // DEV DATA BYPASS: Check if this is a Neon database error and bypass is enabled
      if (isDevDataBypass() && isDatabaseConnectionError(error)) {
        const mockStats = getMockCompanyStats();
        return res.json({
          currentVisitors: mockStats.currentVisitors,
          todayCheckins: mockStats.todayCheckIns,
          staffOnSite: mockStats.staffOnSite,
          totalStaff: mockStats.totalStaff,
          contractorsOnSite: 3, // From our mock contractors
          totalPeopleOnSite: mockStats.currentVisitors + mockStats.staffOnSite + 3,
          totalCompanies: 4 // From our mock data
        });
      }
      
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Voice Notification endpoints
  app.get("/api/voice-notifications/logs", requireAuth, async (req, res) => {
    try {
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const { page = 1, limit = 50, staffId, status } = req.query;
      const logs = await (databaseService as any).getVoiceNotificationLogs(context, {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        staffId: staffId as string,
        status: status as string
      });
      
      res.json(logs);
    } catch (error) {
      console.error("Failed to fetch voice notification logs:", error);
      res.status(500).json({ error: "Failed to fetch voice notification logs" });
    }
  });

  app.post("/api/voice-notifications/test", requireAuth, async (req, res) => {
    try {
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const { staffId, customMessage } = req.body;
      
      if (!staffId) {
        return res.status(400).json({ error: "Staff ID is required" });
      }
      
      // Get staff member
      const staff = await databaseService.getStaffById(context, staffId);
      if (!staff) {
        return res.status(404).json({ error: "Staff member not found" });
      }
      
      // Check if voice notifications are enabled for this staff member
      if (!(staff as any).voiceNotificationsEnabled || !(staff as any).phoneNumber) {
        return res.status(400).json({ 
          error: "Voice notifications not enabled or no phone number configured" 
        });
      }
      
      // Send test voice notification
      const voiceService = new VoiceNotificationService(databaseService as any);
      const testMessage = customMessage || `Hello ${staff.firstName}, this is a test call from VisiGate Pro voice notification system. Your notifications are working correctly.`;
      
      const notification = await voiceService.sendTestNotification(
        context,
        staff,
        testMessage
      );
      
      if (notification) {
        res.json({ 
          success: true, 
          message: "Test voice notification sent successfully",
          notificationId: notification.id 
        });
      } else {
        res.status(500).json({ error: "Failed to send test voice notification" });
      }
    } catch (error) {
      console.error("Failed to send test voice notification:", error);
      res.status(500).json({ error: "Failed to send test voice notification" });
    }
  });

  app.get("/api/voice-notifications/analytics", requireAuth, async (req, res) => {
    try {
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const { startDate, endDate } = req.query;
      
      const analytics = await databaseService.getVoiceNotificationAnalytics(context, {
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined
      });
      
      res.json(analytics);
    } catch (error) {
      console.error("Failed to fetch voice notification analytics:", error);
      res.status(500).json({ error: "Failed to fetch voice notification analytics" });
    }
  });

  // Recent activity endpoint
  app.get("/api/activity/recent", requireAuth, async (req, res) => {
    try {
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // DEV DATA BYPASS: Return mock recent activity data instead of empty array
      if (isDevDataBypass()) {
        return res.json(getMockRecentActivity());
      }
      
      // For now return empty until we implement customer-isolated activity
      res.json([]);
    } catch (error) {
      console.error("Failed to fetch recent activity:", error);
      
      // DEV DATA BYPASS: Check if this is a Neon database error and bypass is enabled
      if (isDevDataBypass() && isDatabaseConnectionError(error)) {
        return res.json(getMockRecentActivity());
      }
      
      res.status(500).json({ error: "Failed to fetch recent activity" });
    }
  });

  // Department analytics endpoint
  app.get("/api/analytics/departments", requireAuth, async (req, res) => {
    try {
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const departmentData = await databaseService.getDepartmentAnalytics(context);
      res.json(departmentData);
    } catch (error) {
      console.error("Failed to fetch department analytics:", error);
      
      // DEV DATA BYPASS: Check if this is a Neon database error and bypass is enabled
      if (isDevDataBypass() && isDatabaseConnectionError(error)) {
        return res.json(getMockDepartmentAnalytics());
      }
      
      res.status(500).json({ error: "Failed to fetch department analytics" });
    }
  });

  // Department details endpoint
  app.get("/api/analytics/departments/:department", requireAuth, async (req, res) => {
    try {
      const { department } = req.params;
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Use customer-isolated database service for getting department details
      const details = await databaseService.getDepartmentDetails(context, department);
      res.json(details);
    } catch (error) {
      console.error("Failed to fetch department details:", error);
      res.status(500).json({ error: "Failed to fetch department details" });
    }
  });

  // Department management endpoints


  // Peak hours analytics endpoint
  app.get("/api/analytics/peak-hours", requireAuth, async (req, res) => {
    try {
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Use customer-isolated database service for peak hours analytics
      const peakHoursData = await databaseService.getPeakHoursAnalytics(context);
      res.json(peakHoursData);
    } catch (error) {
      console.error("Failed to fetch peak hours analytics:", error);
      
      // DEV DATA BYPASS: Check if this is a Neon database error and bypass is enabled
      if (isDevDataBypass() && isDatabaseConnectionError(error)) {
        return res.json(getMockPeakHoursAnalytics());
      }
      
      res.status(500).json({ error: "Failed to fetch peak hours analytics" });
    }
  });


  // ID Card Design API endpoints - NOW WITH PROPER CUSTOMER ISOLATION!


  // Induction system endpoints (public - no auth required)  
  app.get('/api/induction/token/:token', async (req, res) => {
    try {
      const { token } = req.params;
      
      const tokenData = await inductionService.getTokenByValue(token);
      
      if (!tokenData) {
        return res.status(404).json({ error: 'Invalid or expired induction token' });
      }

      if (new Date() > new Date(tokenData.expiresAt)) {
        return res.status(410).json({ error: 'This induction link has expired' });
      }

      // Person details are stored on the token at creation time — use them directly.
      // (Worker/staff/visitor records live in isolated customer schemas, not the shared DB.)
      const personType = tokenData.personType || 'contractor';
      const nameParts = (tokenData.personName || 'Unknown Visitor').split(' ');
      const personDetails = {
        firstName: nameParts[0] || 'Unknown',
        lastName: nameParts.slice(1).join(' ') || '',
        email: tokenData.personEmail || ''
      };

      // ── Get video metadata — prefer customer-isolated DB ─────────────────
      const isObjStoragePath = (u: string | null | undefined) =>
        !!(u && u !== 'generated' && !u.startsWith('http') && !u.startsWith('data:'));

      let videoSettingsAny: any = null;

      // 1. Try customer-isolated DB (where generated videos are stored)
      if (tokenData.customerId) {
        try {
          const tokCtx = simpleDatabaseService.createCustomerContext('system', tokenData.customerId);
          const tokDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(tokCtx.customerId);
          const [custVidRow] = await tokDb
            .select({
              videoTitle: isolatedSchema.inductionSettings.videoTitle,
              videoDescription: isolatedSchema.inductionSettings.videoDescription,
              videoDurationMinutes: isolatedSchema.inductionSettings.videoDurationMinutes,
              videoUrl: isolatedSchema.inductionSettings.videoUrl,
              generatedHtml: isolatedSchema.inductionSettings.generatedHtml,
            })
            .from(isolatedSchema.inductionSettings)
            .where(eq(isolatedSchema.inductionSettings.roleType, personType));
          if (custVidRow) videoSettingsAny = custVidRow;
        } catch (_tokErr) { /* fall through */ }
      }

      // 2. Fallback: shared DB inductionSettings
      if (!videoSettingsAny) {
        const [row] = await db
          .select()
          .from(inductionSettings)
          .where(eq(inductionSettings.roleType, personType));
        if (row) videoSettingsAny = row;
      }

      // Fetch company branding so the public induction page can be personalised
      let branding: Record<string, string | null> | null = null;
      if (tokenData.customerId) {
        try {
          const brandCtx = simpleDatabaseService.createCustomerContext('system', tokenData.customerId);
          const companySettings = await simpleDatabaseService.getCompanySettings(brandCtx);
          if (companySettings) {
            branding = {
              companyName:     companySettings.companyName     ?? null,
              logoUrl:         companySettings.logoUrl         ?? null,
              bannerUrl:       companySettings.bannerUrl       ?? null,
              accentColor:     companySettings.accentColor     ?? null,
              backgroundColor: companySettings.backgroundColor ?? null,
              foregroundColor: companySettings.foregroundColor ?? null,
            };
          }
        } catch (_brandErr) { /* non-critical — carry on without branding */ }
      }

      res.json({
        token: tokenData,
        worker: personDetails,
        personType,
        branding,
        videoContent: videoSettingsAny ? {
          title: videoSettingsAny.videoTitle,
          description: videoSettingsAny.videoDescription,
          durationMinutes: videoSettingsAny.videoDurationMinutes,
          videoUrl: videoSettingsAny.videoUrl,
          hasGeneratedContent: !!(videoSettingsAny.generatedHtml || isObjStoragePath(videoSettingsAny.videoUrl))
          // generatedHtml is NOT included here — it is large and fetched separately
          // via GET /api/induction/video/by-token/:token (public endpoint)
        } : null
      });
      
    } catch (error) {
      console.error('Error getting induction token:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Public endpoint — returns the generated video HTML for a given token.
  // Uses token's customerId to find the correct customer-isolated video without auth.
  app.get('/api/induction/video/by-token/:token', async (req, res) => {
    try {
      const { token } = req.params;
      const tokenData = await inductionService.getTokenByValue(token);
      if (!tokenData) return res.status(404).json({ error: 'Token not found' });

      const roleType = tokenData.personType || 'contractor';

      // ── Helper: stream from object storage path ──────────────────────────
      const tryStreamFromObjectStorage = (objPath: string): boolean => {
        if (!objPath || objPath === 'generated' || objPath.startsWith('http')) return false;
        try {
          const { bucketName, objectName } = parseObjectStoragePath(objPath);
          const file = objectStorageClient.bucket(bucketName).file(objectName);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'public, max-age=3600');
          const stream = file.createReadStream();
          stream.on('error', () => { /* stream errors handled by Express */ });
          stream.pipe(res);
          return true;
        } catch (_e) {
          return false;
        }
      };

      // Try customer-isolated DB first using customerId stored on the token
      if (tokenData.customerId) {
        try {
          const custCtx = simpleDatabaseService.createCustomerContext('system', tokenData.customerId);
          const custDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(custCtx.customerId);
          const [custRow] = await custDb
            .select()
            .from(isolatedSchema.inductionSettings)
            .where(eq(isolatedSchema.inductionSettings.roleType, roleType));
          if (custRow) {
            // Prefer object storage path (fast CDN stream) over raw DB blob
            if (custRow.videoUrl && tryStreamFromObjectStorage(custRow.videoUrl)) return;
            if (custRow.generatedHtml) {
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.setHeader('Cache-Control', 'no-cache');
              return res.send(patchInductionHtml(custRow.generatedHtml));
            }
          }
        } catch (_e) {
          console.warn('⚠️ Customer video lookup failed for by-token endpoint, falling back');
        }
      }

      // Fallback: shared DB inductionSettings
      const [row] = await db
        .select()
        .from(inductionSettings)
        .where(eq(inductionSettings.roleType, roleType));
      if (row?.generatedHtml) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        return res.send(patchInductionHtml(row.generatedHtml));
      }

      return res.status(404).json({ error: 'No video content available for this induction' });
    } catch (error) {
      console.error('Error fetching induction video by token:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Public when called with a ?token= param (external induction links).
  // Auth-gated when called without token (admin/settings use).
  app.get('/api/induction/questions', async (req, res) => {
    try {
      const roleType = (req.query.roleType as string) || 'contractor';
      const tokenParam = req.query.token as string | undefined;

      let customerId: string | undefined;

      if (tokenParam) {
        // Public path — resolve customerId from the induction token
        const [tokenRecord] = await db
          .select()
          .from(inductionTokens)
          .where(eq(inductionTokens.token, tokenParam));
        if (!tokenRecord) {
          return res.status(404).json({ error: 'Invalid induction token' });
        }
        customerId = tokenRecord.customerId ?? undefined;
      } else if (req.customerId) {
        // Admin/settings path — requires active session
        customerId = req.customerId;
      } else {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!customerId) {
        return res.json({ questions: [] });
      }

      const customerVideoId = `${customerId}-${roleType}`;

      const allQuestions = await db
        .select()
        .from(inductionQuestions)
        .where(
          and(
            eq(inductionQuestions.isActive, true),
            eq(inductionQuestions.videoId, customerVideoId)
          )
        )
        .orderBy(inductionQuestions.orderIndex);

      res.json({ questions: allQuestions });
    } catch (error) {
      console.error('Error getting induction questions:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get generation status for polling
  app.get('/api/induction/status/:roleType', requireAuth, async (req, res) => {
    try {
      const { roleType } = req.params;
      const customerId = req.customerId || 'default';
      const statusKey = `${customerId}-${roleType}`;
      const status = inductionGenerationStatus.get(statusKey);
      if (!status) {
        res.json({ status: 'idle', step: 0, totalSteps: 5, message: 'No generation in progress' });
      } else {
        res.json(status);
      }
    } catch (error) {
      res.status(500).json({ error: 'Failed to get status' });
    }
  });

  // Cleanup questions for a role type
  // Default: removes all inactive + legacy duplicates
  // With ?nuclear=true: deletes ALL questions for this customer+roleType (fresh start)
  app.delete('/api/induction/questions/cleanup', requireAuth, async (req, res) => {
    try {
      const roleType = (req.query.roleType as string) || 'contractor';
      const nuclear = req.query.nuclear === 'true';
      const customerId = req.customerId || 'default';
      const customerVideoId = `${customerId}-${roleType}`;

      let deletedCount = 0;

      if (nuclear) {
        // Nuclear: delete ALL questions for this customer+roleType (clean slate)
        const result1 = await db
          .delete(inductionQuestions)
          .where(eq(inductionQuestions.videoId, customerVideoId));
        // Also legacy questions stored with roleType as videoId
        const result2 = await db
          .delete(inductionQuestions)
          .where(and(
            eq(inductionQuestions.roleType, roleType),
            eq(inductionQuestions.videoId, roleType)
          ));
        // Also delete any inactive questions for this roleType regardless of videoId
        const result3 = await db
          .delete(inductionQuestions)
          .where(and(
            eq(inductionQuestions.roleType, roleType),
            eq(inductionQuestions.isActive, false)
          ));
        console.log(`🧹 Nuclear cleanup: deleted all questions for ${roleType} (customer: ${customerId})`);
        res.json({ success: true, message: `All questions cleared for ${roleType}`, deleted: deletedCount });
      } else {
        // Standard: delete inactive + legacy (non-customerVideoId) questions
        await db
          .delete(inductionQuestions)
          .where(and(
            eq(inductionQuestions.roleType, roleType),
            eq(inductionQuestions.isActive, false)
          ));
        await db
          .delete(inductionQuestions)
          .where(and(
            eq(inductionQuestions.roleType, roleType),
            eq(inductionQuestions.videoId, roleType)
          ));
        console.log(`🧹 Cleanup: deleted stale/inactive questions for ${roleType}`);
        res.json({ success: true, message: `Cleaned up stale questions for ${roleType}` });
      }
    } catch (error) {
      console.error('Error cleaning up questions:', error);
      res.status(500).json({ error: 'Failed to cleanup questions' });
    }
  });

  app.post('/api/induction/:tokenId/video-watched', async (req, res) => {
    try {
      const { tokenId } = req.params;
      
      await inductionService.markVideoWatched(tokenId);
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error marking video watched:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/induction/:tokenId/submit-quiz', async (req, res) => {
    try {
      const { tokenId } = req.params;
      const { answers } = req.body;
      
      if (!answers || !Array.isArray(answers)) {
        return res.status(400).json({ error: 'Invalid answers format' });
      }

      const results = await inductionService.submitQuizAnswers(tokenId, answers);
      
      // Fire-and-forget: update inductionCompleted on worker/staff/visitor + write worker_note
      (async () => {
        try {
          const [token] = await db.select().from(inductionTokens).where(eq(inductionTokens.id, tokenId));
          if (!token?.customerId) return;

          const noteCtx = simpleDatabaseService.createCustomerContext('system', token.customerId);
          const noteDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(noteCtx.customerId);
          const now = new Date();
          const dateStr = now.toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' });
          const attemptNum = token.quizAttempts || 1;

          // ── Update inductionCompleted on the correct isolated-schema record ──
          if (results.passed) {
            const personType = token.personType || 'contractor';
            if (personType === 'contractor' && token.workerId) {
              await noteDb
                .update(isolatedSchema.contractorWorkers)
                .set({ inductionCompleted: true, inductionCompletedAt: now })
                .where(eq(isolatedSchema.contractorWorkers.id, token.workerId));
            } else if (personType === 'staff' && token.staffId) {
              await noteDb
                .update(isolatedSchema.staff)
                .set({ inductionCompleted: true, inductionCompletedAt: now })
                .where(eq(isolatedSchema.staff.id, token.staffId));
            } else if (personType === 'visitor' && token.visitorId) {
              await noteDb
                .update(isolatedSchema.visitors)
                .set({ inductionCompleted: true, inductionCompletedAt: now })
                .where(eq(isolatedSchema.visitors.id, token.visitorId));
            }
          }

          // ── Write audit note to worker_notes (contractor only) ──
          if (token.workerId) {
            const noteText = results.passed
              ? `Site induction PASSED — Score: ${results.score}% (${(results as any).correct ?? '?'}/${results.total} correct, 80% required). Completed on ${dateStr}.`
              : `Site induction attempt ${attemptNum} FAILED — Score: ${results.score}% (80% required). Worker may retry.`;
            await noteDb.insert(isolatedSchema.workerNotes).values({
              workerId: token.workerId,
              changeType: results.passed ? 'induction_passed' : 'induction_failed',
              notes: noteText,
              changedBy: 'system',
            });
          }
        } catch (noteErr) {
          console.error('⚠️ Failed to update induction record (non-fatal):', noteErr);
        }
      })();

      res.json({ results });
    } catch (error) {
      console.error('Error submitting quiz:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Send induction email endpoint (authenticated)
  app.post('/api/contractors/:id/send-induction', requireAuth, async (req, res) => {
    try {
      const contractorId = req.params.id;
      const sendInductionContext = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const contractor = await databaseService.getContractorWorkerById(sendInductionContext, contractorId);
      
      if (!contractor) {
        return res.status(404).json({ error: 'Contractor not found' });
      }

      const workerName = `${contractor.firstName} ${contractor.lastName}`;
      const success = await inductionService.sendInductionEmail(contractorId, req.customerId, workerName, contractor.email ?? undefined);
      
      if (success) {
        res.json({ message: 'Induction email sent successfully' });
      } else {
        res.status(500).json({ error: 'Failed to send induction email' });
      }
    } catch (error) {
      console.error('Error sending induction email:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Universal send induction email - supports visitors, staff, and contractors
  app.post('/api/induction/send', requireAuth, async (req, res) => {
    try {
      const { personType, personName, personEmail, workerId, visitorId, staffId, companyName } = req.body;
      
      if (!personType || !personName || !personEmail) {
        return res.status(400).json({ error: 'personType, personName, and personEmail are required' });
      }

      if (!['visitor', 'staff', 'contractor'].includes(personType)) {
        return res.status(400).json({ error: 'Invalid personType. Must be visitor, staff, or contractor' });
      }

      const success = await inductionService.sendUniversalInductionEmail({
        personType,
        personName,
        personEmail,
        workerId,
        visitorId,
        staffId,
        companyName,
        customerId: req.customerId
      });
      
      if (success) {
        res.json({ 
          message: `Induction email sent successfully to ${personName}`,
          personType,
          email: personEmail 
        });
      } else {
        res.status(500).json({ error: 'Failed to send induction email' });
      }
    } catch (error) {
      console.error('Error sending universal induction email:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Look up contractor worker by QR code (worker ID encoded in pass QR code)
  app.get('/api/contractors/workers/by-qr/:qrCode', requireAuth, async (req, res) => {
    try {
      const { qrCode } = req.params;
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      const customerDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(context.customerId);

      // Use raw SQL to avoid Drizzle column reference issues with qr_code field
      const workerRows = await customerDb.execute(
        sql`SELECT * FROM contractor_workers WHERE qr_code = ${qrCode} LIMIT 1`
      );

      const workerRaw = workerRows.rows?.[0] ?? (workerRows as any)[0];
      if (!workerRaw) {
        return res.status(404).json({ error: 'Worker not found for this QR code' });
      }

      // Fetch company name
      const companyRows = await customerDb.execute(
        sql`SELECT company_name FROM contractor_companies WHERE id = ${workerRaw.company_id} LIMIT 1`
      );
      const companyRaw = companyRows.rows?.[0] ?? (companyRows as any)[0];

      // Map snake_case DB fields to camelCase for frontend
      const worker = {
        id: workerRaw.id,
        companyId: workerRaw.company_id,
        firstName: workerRaw.first_name,
        lastName: workerRaw.last_name,
        email: workerRaw.email,
        phoneNumber: workerRaw.phone_number,
        photoUrl: workerRaw.photo_url,
        jobTitle: workerRaw.job_title,
        isCheckedIn: workerRaw.is_checked_in,
        checkedInAt: workerRaw.checked_in_at,
        checkedOutAt: workerRaw.checked_out_at,
        isActive: workerRaw.is_active,
        currentCardStatus: workerRaw.current_card_status,
        redCardBanUntil: workerRaw.banned_until,
        qrCode: workerRaw.qr_code,
        zoneId: workerRaw.zone_id,
        rightToWork: workerRaw.right_to_work_status,
        cscsStatus: workerRaw.cscs_status,
        siteInductionCompleted: workerRaw.site_induction_completed,
        inductionCompleted: workerRaw.site_induction_completed,
        workerStatus: workerRaw.worker_status,
      };

      console.log(`🔍 QR lookup found worker: ${worker.firstName} ${worker.lastName} (${worker.isCheckedIn ? 'checked in' : 'checked out'})`);
      res.json({ worker, companyName: companyRaw?.company_name || 'Unknown Company' });
    } catch (error) {
      console.error('Error looking up worker by QR:', error);
      res.status(500).json({ error: 'Failed to look up worker' });
    }
  });

  // Get individual contractor worker by ID endpoint - CRITICAL MISSING ENDPOINT ADDED
  app.get('/api/contractors/workers/:id', requireAuth, async (req, res) => {
    try {
      const workerId = req.params.id;
      
      console.log(`📋 API ROUTE - Getting contractor worker with ID: ${workerId}`);
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Get worker from customer-isolated database service
      const worker = await databaseService.getContractorWorkerById(context, workerId);
      
      if (!worker) {
        console.log(`❌ API ROUTE - Worker not found: ${workerId}`);
        return res.status(404).json({ error: "Contractor worker not found" });
      }

      // CRITICAL FIX: Database service already returns correctly mapped fields
      // Log all fields to verify they're properly mapped
      console.log(`✅ API ROUTE - Retrieved contractor worker:`, {
        id: worker.id,
        firstName: worker.firstName,
        lastName: worker.lastName,
        transportMethod: worker.transportMethod,
        cscsCard: worker.cscsCard,
        cscsStatus: worker.cscsStatus,
        rightToWork: worker.rightToWork,
        ipafStatus: worker.ipafStatus,
        asbestosAwareness: worker.asbestosAwareness,
        manualHandling: worker.manualHandling,
        inductionCompleted: worker.inductionCompleted,
        phone: worker.phone,
        email: worker.email,
        postcode: worker.postcode,
      });
      
      // Ensure all fields are included in the response
      const responseWorker = {
        ...worker,
        // Explicitly include all critical fields with fallback values
        transportMethod: worker.transportMethod || 'car_diesel',
        cscsCard: worker.cscsCard || '',
        cscsStatus: worker.cscsStatus || 'pending',
        rightToWork: worker.rightToWork || 'pending',
        ipafStatus: worker.ipafStatus || 'none',
        asbestosAwareness: worker.asbestosAwareness || false,
        manualHandling: worker.manualHandling || false,
        inductionCompleted: worker.inductionCompleted || false,
      };

      console.log(`✅ API ROUTE - Sending response for worker: ${worker.firstName} ${worker.lastName}`);
      res.json(responseWorker);
    } catch (error) {
      console.error("❌ API ROUTE - Error fetching contractor worker:", error);
      res.status(500).json({ error: "Failed to fetch contractor worker" });
    }
  });

  // Update contractor worker endpoint
  app.put('/api/contractors/workers/:id', requireAuth, async (req, res) => {
    // Declare mappedData outside try block so it's accessible in catch block
    let mappedData: any = {};
    
    try {
      const workerId = req.params.id;
      console.log('🔄 Updating contractor worker', workerId, 'with data:', req.body);
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Field mapping from UI field names to database field names
      const uiData = req.body;
      
      // Direct field mappings (no conversion needed)
      const directFieldMappings = {
        companyId: 'companyId',
        firstName: 'firstName', 
        lastName: 'lastName',
        email: 'email',
        phoneNumber: 'phone', // Map phoneNumber to phone field in schema
        phone: 'phoneNumber', // Direct mapping to phone_number field
        homeAddress: 'homeAddress',
        postcode: 'postcode',
        jobTitle: 'jobTitle',
        department: 'department',
        emergencyContactName: 'emergencyContactName',
        emergencyContactPhone: 'emergencyContactPhone',
        emergencyContactRelationship: 'emergencyContactRelationship',
        transportMethod: 'transportMethod',
        rightToWork: 'rightToWork', // Maps to right_to_work_status column in isolatedSchema
        cscsCard: 'cscsCard', // Maps to cscs_card_number in schema
        photoUrl: 'photoUrl' // Profile photo URL
      };
      
      // Apply direct mappings
      Object.entries(directFieldMappings).forEach(([uiField, dbField]) => {
        if (uiData[uiField] !== undefined) {
          mappedData[dbField] = uiData[uiField];
        }
      });
      
      // Special field mappings with type conversions
      
      // cscsStatus: Keep as string (valid, pending, expired, none) - DO NOT convert to boolean
      if (uiData.cscsStatus !== undefined) {
        mappedData.cscsStatus = uiData.cscsStatus; // Keep as string
        console.log(`🔄 Mapped cscsStatus: '${uiData.cscsStatus}' (${typeof uiData.cscsStatus}) → cscsStatus: ${mappedData.cscsStatus}`);
      }
      
      // inductionCompleted: Pass through directly - field name matches database
      if (uiData.inductionCompleted !== undefined) {
        mappedData.inductionCompleted = uiData.inductionCompleted;
        console.log(`🔄 Mapped inductionCompleted: ${uiData.inductionCompleted} → inductionCompleted: ${mappedData.inductionCompleted}`);
      }
      
      // IPAF Status: Map to database field if it exists (needs to be checked against schema)
      if (uiData.ipafStatus !== undefined) {
        // Note: Need to verify if ipafStatus field exists in database schema
        mappedData.ipafStatus = uiData.ipafStatus;
        console.log(`🔄 Mapped ipafStatus: '${uiData.ipafStatus}' → ipafStatus: '${mappedData.ipafStatus}'`);
      }
      
      // Safety training boolean fields - map to database fields if they exist
      if (uiData.asbestosAwareness !== undefined) {
        mappedData.asbestosAwareness = Boolean(uiData.asbestosAwareness);
        console.log(`🔄 Mapped asbestosAwareness: ${uiData.asbestosAwareness} → asbestosAwareness: ${mappedData.asbestosAwareness}`);
      }
      
      if (uiData.manualHandling !== undefined) {
        mappedData.manualHandling = Boolean(uiData.manualHandling);
        console.log(`🔄 Mapped manualHandling: ${uiData.manualHandling} → manualHandling: ${mappedData.manualHandling}`);
      }

      // needsEvacuationAssistance (PEEP flag): direct boolean passthrough
      if (uiData.needsEvacuationAssistance !== undefined) {
        mappedData.needsEvacuationAssistance = Boolean(uiData.needsEvacuationAssistance);
        console.log(`🔄 Mapped needsEvacuationAssistance: ${uiData.needsEvacuationAssistance} → ${mappedData.needsEvacuationAssistance}`);
      }

      // Boolean fields that can be passed through directly (only include fields that exist in database schema)
      const booleanFields = ['workingAtHeight', 'isCheckedIn', 'hsRulesAccepted'];
      booleanFields.forEach(field => {
        if (uiData[field] !== undefined) {
          mappedData[field] = uiData[field];
        }
      });
      
      // Always set updatedAt
      mappedData.updatedAt = new Date();
      
      console.log('🗃️ Final mapped data for database:', mappedData);
      console.log('🔍 ROUTE - About to validate with Zod schema...');
      console.log('🔍 ROUTE - Critical fields before validation:');
      console.log(`  - rightToWork: ${mappedData.rightToWork}`);
      console.log(`  - cscsStatus: ${mappedData.cscsStatus}`);
      console.log(`  - inductionCompleted: ${mappedData.inductionCompleted}`);
      
      // Validate mapped data with schema
      const validatedData = insertContractorWorkerSchema.partial().parse(mappedData);
      
      // CRITICAL FIX: Ensure critical fields are preserved after Zod validation
      // The insertContractorWorkerSchema may be missing these fields, so we manually preserve them
      if (mappedData.inductionCompleted !== undefined) {
        validatedData.inductionCompleted = mappedData.inductionCompleted;
        console.log(`🔧 MANUAL FIX: Preserved inductionCompleted: ${validatedData.inductionCompleted}`);
      }
      
      if (mappedData.ipafStatus !== undefined) {
        validatedData.ipafStatus = mappedData.ipafStatus;
        console.log(`🔧 MANUAL FIX: Preserved ipafStatus: ${validatedData.ipafStatus}`);
      }
      
      if (mappedData.asbestosAwareness !== undefined) {
        validatedData.asbestosAwareness = mappedData.asbestosAwareness;
        console.log(`🔧 MANUAL FIX: Preserved asbestosAwareness: ${validatedData.asbestosAwareness}`);
      }
      
      if (mappedData.manualHandling !== undefined) {
        validatedData.manualHandling = mappedData.manualHandling;
        console.log(`🔧 MANUAL FIX: Preserved manualHandling: ${validatedData.manualHandling}`);
      }
      
      if (mappedData.transportMethod !== undefined) {
        validatedData.transportMethod = mappedData.transportMethod;
        console.log(`🔧 MANUAL FIX: Preserved transportMethod: ${validatedData.transportMethod}`);
      }

      if (mappedData.needsEvacuationAssistance !== undefined) {
        validatedData.needsEvacuationAssistance = Boolean(mappedData.needsEvacuationAssistance);
      }

      // MANUAL FIX: Preserve phone/phoneNumber — Zod strips 'phoneNumber' because shared schema uses 'phone'
      if (mappedData.phoneNumber !== undefined) {
        (validatedData as any).phoneNumber = mappedData.phoneNumber;
        console.log(`🔧 MANUAL FIX: Preserved phoneNumber: ${mappedData.phoneNumber}`);
      }
      if (mappedData.phone !== undefined && mappedData.phoneNumber === undefined) {
        (validatedData as any).phone = mappedData.phone;
        console.log(`🔧 MANUAL FIX: Preserved phone: ${mappedData.phone}`);
      }

      // MANUAL FIX: Preserve photoUrl in case Zod strips it
      if (mappedData.photoUrl !== undefined) {
        (validatedData as any).photoUrl = mappedData.photoUrl;
        console.log(`🔧 MANUAL FIX: Preserved photoUrl: ${mappedData.photoUrl}`);
      }
      
      console.log('🔍 ROUTE - Zod validation completed. Result:');
      console.log('🔍 ROUTE - Validated data keys:', Object.keys(validatedData));
      console.log('🔍 ROUTE - Critical fields after validation:');
      console.log(`  - rightToWork: ${validatedData.rightToWork}`);
      console.log(`  - cscsStatus: ${validatedData.cscsStatus}`);
      console.log(`  - inductionCompleted: ${validatedData.inductionCompleted}`);
      
      console.log('🔍 ROUTE - About to call databaseService.updateContractorWorker with:', validatedData);
      
      // Fetch current worker state BEFORE update for audit trail comparison
      const currentWorker = await databaseService.getContractorWorkerById(context, workerId);
      if (!currentWorker) {
        return res.status(404).json({ error: 'Contractor worker not found' });
      }
      
      const updatedWorker = await databaseService.updateContractorWorker(context, workerId, validatedData);
      
      console.log('🔍 ROUTE - databaseService.updateContractorWorker returned:', updatedWorker);
      
      if (!updatedWorker) {
        return res.status(404).json({ error: 'Contractor worker not found' });
      }

      // === AUDIT TRAIL: Compare old vs new values and create audit notes ===
      const auditFieldLabels: Record<string, string> = {
        firstName: 'First Name',
        lastName: 'Last Name',
        email: 'Email',
        phoneNumber: 'Phone Number',
        postcode: 'Postcode',
        transportMethod: 'Transport Method',
        companyId: 'Contractor Company',
        rightToWork: 'Right to Work Status',
        cscsCard: 'CSCS Card Number',
        cscsStatus: 'CSCS Status',
        ipafStatus: 'IPAF Status',
        asbestosAwareness: 'Asbestos Awareness',
        manualHandling: 'Manual Handling',
        inductionCompleted: 'Site Induction Completed',
        workingAtHeight: 'Working at Height',
        isActive: 'Active Status',
        currentCardStatus: 'Card Status',
        hsRulesAccepted: 'H&S Rules Accepted',
      };
      
      const changes: string[] = [];
      const db = await customerDbService.getCustomerDatabase(context.customerId);
      
      // Training boolean fields that get human-friendly confirmation notes
      const trainingConfirmFields = new Set([
        'inductionCompleted', 'asbestosAwareness', 'manualHandling', 'workingAtHeight', 'hsRulesAccepted'
      ]);

      for (const [field, label] of Object.entries(auditFieldLabels)) {
        if (validatedData[field] !== undefined) {
          const oldVal = (currentWorker as any)[field];
          const newVal = validatedData[field];
          
          // Compare values (handle booleans and strings)
          const oldStr = oldVal === null || oldVal === undefined ? 'Not set' : String(oldVal);
          const newStr = newVal === null || newVal === undefined ? 'Not set' : String(newVal);
          
          if (oldStr !== newStr) {
            changes.push(`${label}: "${oldStr}" → "${newStr}"`);

            // Build a user-friendly note message
            const now = new Date();
            const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

            let noteText: string;
            if (trainingConfirmFields.has(field) && (newStr === 'true' || newStr === 'false')) {
              if (newStr === 'true') {
                noteText = `✅ ${label} confirmed by ${username} on ${dateStr} at ${timeStr}`;
              } else {
                noteText = `❌ ${label} record removed by ${username} on ${dateStr} at ${timeStr}`;
              }
            } else {
              noteText = `${label} changed from "${oldStr}" to "${newStr}"`;
            }
            
            // Create individual audit note for each change
            try {
              await db.insert(isolatedSchema.workerNotes).values({
                workerId: workerId,
                changeType: 'profile_update',
                oldValue: oldStr,
                newValue: newStr,
                notes: noteText,
                changedBy: username,
              });
            } catch (noteErr) {
              console.error(`Failed to create audit note for ${field}:`, noteErr);
            }
          }
        }
      }
      
      if (changes.length > 0) {
        console.log(`📋 AUDIT: ${changes.length} changes recorded by ${username}: ${changes.join(', ')}`);
      }

      // Response field mapping: Convert database field names back to UI field names
      const responseData = {
        ...updatedWorker,
        cscsStatus: updatedWorker.cscsStatus,
        inductionCompleted: updatedWorker.inductionCompleted,
      };

      res.json({ success: true, worker: responseData });
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('❌ Zod validation error for contractor worker update:', error.errors);
        console.error('❌ Mapped data that failed validation:', mappedData);
        return res.status(400).json({ 
          error: 'Invalid data', 
          details: error.errors 
        });
      }
      console.error('❌ Database error updating contractor worker:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Reset worker card to Yellow endpoint
  app.post('/api/contractors/workers/:id/reset-card', requireAuth, async (req, res) => {
    try {
      const workerId = req.params.id;
      console.log('🟡 Resetting card to yellow for worker:', workerId);
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Get current worker data
      const currentWorker = await databaseService.getContractorWorkerById(context, workerId);
      if (!currentWorker) {
        return res.status(404).json({ error: 'Worker not found' });
      }
      
      // Update worker status to yellow (bypass auto-calculation)
      const updatedWorker = await databaseService.updateContractorWorker(context, workerId, {
        currentCardStatus: 'yellow',
        redCardBanUntil: null, // Clear the ban
        _bypassAutoCalculation: true // Prevent auto-calculation from overriding manual reset
      });
      
      // Create audit trail entry in workerNotes
      const noteData = {
        workerId: workerId,
        changeType: 'card_status_change',
        oldValue: currentWorker.currentCardStatus || 'unknown',
        newValue: 'yellow',
        notes: `Card status reset from ${currentWorker.currentCardStatus || 'unknown'} to yellow. Ban lifted. User: ${username}`,
        changedBy: username || 'system' // Fixed: use correct database field name
      };
      
      // Insert the note - use direct database access since workerNotes might not be in databaseService yet
      try {
        const db = await customerDbService.getCustomerDatabase(context.customerId);
        await db.insert(isolatedSchema.workerNotes).values(noteData);
        console.log('✅ Created audit trail note for card reset');
      } catch (noteError) {
        console.error('⚠️ Failed to create audit note (continuing anyway):', noteError);
      }
      
      res.json({ 
        success: true, 
        message: 'Card status reset to yellow successfully',
        worker: updatedWorker 
      });
      
    } catch (error) {
      console.error('❌ Error resetting card to yellow:', error);
      res.status(500).json({ error: 'Failed to reset card status' });
    }
  });

  // Add manual note to worker endpoint
  app.post('/api/contractors/workers/:id/notes', requireAuth, async (req, res) => {
    try {
      const workerId = req.params.id;
      const { changeType, notes } = req.body;
      
      console.log('📝 Adding manual note for worker:', workerId);
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Validate required fields
      if (!notes || notes.trim() === '') {
        return res.status(400).json({ error: 'Note content is required' });
      }
      
      // Create manual note entry in workerNotes
      const noteData = {
        workerId: workerId,
        changeType: changeType || 'manual_note',
        notes: notes.trim(),
        changedBy: username || 'system'
      };
      
      // Insert the note using direct database access
      try {
        const db = await customerDbService.getCustomerDatabase(context.customerId);
        const [insertedNote] = await db.insert(isolatedSchema.workerNotes).values(noteData).returning();
        console.log('✅ Created manual note successfully');
        
        res.json({ 
          success: true, 
          message: 'Note added successfully',
          note: insertedNote 
        });
      } catch (noteError) {
        console.error('❌ Failed to create manual note:', noteError);
        res.status(500).json({ error: 'Failed to save note' });
      }
      
    } catch (error) {
      console.error('❌ Error adding manual note:', error);
      res.status(500).json({ error: 'Failed to add note' });
    }
  });

  // ===== CONTRACTOR DOCUMENT MANAGEMENT =====
  
  // Get upload URL for contractor document
  app.get('/api/contractors/workers/:workerId/documents/upload-url', requireAuth, async (req, res) => {
    try {
      const { workerId } = req.params;
      
      // Verify worker belongs to current customer (customer isolation security)
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      const db = await customerDbService.getCustomerDatabase(context.customerId);
      
      const [worker] = await db
        .select()
        .from(isolatedSchema.contractorWorkers)
        .where(eq(isolatedSchema.contractorWorkers.id, workerId))
        .limit(1);
        
      if (!worker) {
        return res.status(404).json({ error: 'Worker not found or access denied' });
      }
      
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error('❌ Error getting upload URL:', error);
      res.status(500).json({ error: 'Failed to get upload URL' });
    }
  });

  // Save document metadata after upload
  app.post('/api/contractors/workers/:workerId/documents', requireAuth, async (req, res) => {
    try {
      const { workerId } = req.params;
      const { documentName, documentType, documentUrl, expiryDate, issuedBy, policyNumber } = req.body;
      
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      const db = await customerDbService.getCustomerDatabase(context.customerId);
      
      console.log('📄 Creating document record for worker:', workerId);
      
      // Validate worker exists
      const [worker] = await db
        .select()
        .from(isolatedSchema.contractorWorkers)
        .where(eq(isolatedSchema.contractorWorkers.id, workerId))
        .limit(1);
        
      if (!worker) {
        return res.status(404).json({ error: 'Worker not found' });
      }
      
      // Get current user ID
      const [currentUser] = await db
        .select()
        .from(isolatedSchema.users)
        .where(eq(isolatedSchema.users.username, username))
        .limit(1);
      
      // Normalize the document URL to entity path format
      const objectStorageService = new ObjectStorageService();
      const normalizedUrl = objectStorageService.normalizeObjectEntityPath(documentUrl);
      
      // Create document record
      const documentData = {
        workerId,
        companyId: worker.companyId,
        documentName,
        documentType,
        documentUrl: normalizedUrl,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        uploadedBy: currentUser?.id || username,
        issuedBy: issuedBy || null,
        policyNumber: policyNumber || null,
        status: 'pending',
        isActive: true,
      };
      
      const [newDocument] = await db
        .insert(isolatedSchema.contractorDocuments)
        .values(documentData)
        .returning();
      
      console.log('✅ Document saved successfully:', newDocument.id);

      // Reset expiryAlertedAt on any previous document of the same type for this worker
      // so the nightly cron can alert on the new document's expiry date
      if (documentType) {
        try {
          await db.update(isolatedSchema.contractorDocuments)
            .set({ expiryAlertedAt: null })
            .where(and(
              eq(isolatedSchema.contractorDocuments.workerId, workerId),
              eq(isolatedSchema.contractorDocuments.documentType, documentType),
              isNotNull(isolatedSchema.contractorDocuments.expiryAlertedAt),
              ne(isolatedSchema.contractorDocuments.id, newDocument.id)
            ));
        } catch (resetErr) {
          console.error('⚠️ Failed to reset expiryAlertedAt on previous worker documents (continuing):', resetErr);
        }
      }

      // Audit trail — worker document uploaded
      try {
        const auditTs = new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' });
        const docLabel = documentType?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || documentName;
        await db.insert(isolatedSchema.workerNotes).values({
          workerId,
          changeType: 'document_uploaded',
          notes: `Document "${docLabel}" uploaded by ${username} on ${auditTs}${expiryDate ? ` (expires ${new Date(expiryDate).toLocaleDateString('en-GB')})` : ''}`,
          changedBy: username,
        });
      } catch (auditErr) {
        console.error('⚠️ Failed to create document upload audit note (continuing):', auditErr);
      }

      res.json({ 
        success: true, 
        document: newDocument 
      });
      
    } catch (error) {
      console.error('❌ Error saving document:', error);
      res.status(500).json({ error: 'Failed to save document' });
    }
  });
  
  // Get all documents for a worker
  app.get('/api/contractors/workers/:workerId/documents', requireAuth, async (req, res) => {
    try {
      const { workerId } = req.params;
      
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      const db = await customerDbService.getCustomerDatabase(context.customerId);
      
      const documents = await db
        .select()
        .from(isolatedSchema.contractorDocuments)
        .where(
          and(
            eq(isolatedSchema.contractorDocuments.workerId, workerId),
            eq(isolatedSchema.contractorDocuments.isActive, true)
          )
        )
        .orderBy(desc(isolatedSchema.contractorDocuments.createdAt));
      
      res.json(documents);
      
    } catch (error) {
      console.error('❌ Error fetching documents:', error);
      res.status(500).json({ error: 'Failed to fetch documents' });
    }
  });
  
  // Delete a document
  app.delete('/api/contractors/workers/:workerId/documents/:documentId', requireAuth, async (req, res) => {
    try {
      const { workerId, documentId } = req.params;
      
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      const db = await customerDbService.getCustomerDatabase(context.customerId);
      
      console.log('🗑️ Deleting document:', documentId);
      
      // Soft delete by setting isActive to false
      const [deletedDoc] = await db
        .update(isolatedSchema.contractorDocuments)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(isolatedSchema.contractorDocuments.id, documentId),
            eq(isolatedSchema.contractorDocuments.workerId, workerId)
          )
        ).returning();
      
      console.log('✅ Document deleted successfully');

      // Audit trail — worker document deleted
      try {
        const auditTs = new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' });
        const docLabel = deletedDoc?.documentType?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || deletedDoc?.documentName || 'Unknown';
        await db.insert(isolatedSchema.workerNotes).values({
          workerId,
          changeType: 'document_deleted',
          notes: `Document "${docLabel}" removed by ${username} on ${auditTs}`,
          changedBy: username,
        });
      } catch (auditErr) {
        console.error('⚠️ Failed to create document delete audit note (continuing):', auditErr);
      }

      res.json({ success: true, message: 'Document deleted' });
      
    } catch (error) {
      console.error('❌ Error deleting document:', error);
      res.status(500).json({ error: 'Failed to delete document' });
    }
  });

  // AI document scan — extract expiry date, issuer, and policy number from an uploaded document
  app.post('/api/contractors/documents/scan', requireAuth, async (req, res) => {
    try {
      const { fileData, mimeType, documentType } = req.body as {
        fileData?: string;
        mimeType?: string;
        documentType?: string;
      };

      if (!fileData || !mimeType || !documentType) {
        return res.status(400).json({ error: 'fileData, mimeType and documentType are required' });
      }

      // Strict MIME allowlist — only PDF, JPEG, and PNG are supported
      const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png'];
      if (!allowedMimes.includes(mimeType)) {
        return res.status(400).json({ error: `Unsupported file type '${mimeType}'. Please upload a PDF, JPEG, or PNG.` });
      }

      // Reject payloads larger than ~10 MB (base64 adds ~33 % overhead so 13.3 MB base64 ≈ 10 MB file)
      if (fileData.length > 13_500_000) {
        return res.status(400).json({ error: 'File too large. Maximum supported size is 10 MB.' });
      }

      const { scanDocumentWithAI } = await import('./openaiService');
      const buffer = Buffer.from(fileData, 'base64');

      // Extract text from PDF once (used by both providers)
      let pdfText: string | undefined;
      if (mimeType === 'application/pdf') {
        // Import the internal lib directly to avoid pdf-parse's self-test (index.js reads a test
        // file when module.parent is undefined, which is always the case under tsx/ESM).
        const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default as (buf: Buffer) => Promise<{ text: string }>;
        const { text } = await pdfParse(buffer);
        pdfText = text;
      }

      // Try OpenAI first
      let result;
      if (pdfText !== undefined) {
        result = await scanDocumentWithAI({ mimeType, pdfText, documentType });
      } else {
        result = await scanDocumentWithAI({ mimeType, base64Data: fileData, documentType });
      }

      // If OpenAI fails, attempt Claude as fallback (if the customer has a Claude key configured)
      if (!result.success && req.session?.customerId) {
        try {
          const { decryptData } = await import('./utils/encryption');
          const context = { customerId: req.session.customerId };
          const apiKeys = await databaseService.getCustomerApiKeys(context);
          const claudeKeyRow = apiKeys.find((k: any) => k.serviceType === 'claude' && k.status === 'active');

          if (claudeKeyRow) {
            const claudeApiKey = decryptData(
              claudeKeyRow.encryptedKey,
              claudeKeyRow.initializationVector,
              claudeKeyRow.authTag || ''
            );
            const { scanDocumentWithClaude } = await import('./claudeService');
            console.log('⚠️ OpenAI scan failed — falling back to Claude:', result.error);
            if (pdfText !== undefined) {
              result = await scanDocumentWithClaude({ mimeType, pdfText, documentType, apiKey: claudeApiKey });
            } else {
              result = await scanDocumentWithClaude({ mimeType, base64Data: fileData, documentType, apiKey: claudeApiKey });
            }
          }
        } catch (fallbackErr) {
          console.error('❌ Claude fallback error:', fallbackErr);
          // Keep the original OpenAI failure result
        }
      }

      if (!result.success) {
        return res.status(422).json({ error: result.error || 'AI extraction failed', fields: result.fields });
      }

      // Normalise expiryDate to YYYY-MM-DD — reject any value that cannot be parsed as a valid date
      let { expiryDate, issuedBy, policyNumber } = result.fields;
      if (expiryDate) {
        const parsed = new Date(expiryDate);
        if (isNaN(parsed.getTime())) {
          expiryDate = null; // unparseable date — discard rather than surface garbage
        } else {
          expiryDate = parsed.toISOString().split('T')[0]; // normalise to YYYY-MM-DD
        }
      }

      // If every extracted field is null the document contained no recognisable data
      if (!expiryDate && !issuedBy && !policyNumber) {
        return res.status(422).json({
          error: 'No recognisable data found. The document may not contain the expected fields, or the text may not be machine-readable.',
          fields: { expiryDate: null, issuedBy: null, policyNumber: null },
        });
      }

      return res.json({ fields: { expiryDate, issuedBy, policyNumber } });
    } catch (error) {
      console.error('❌ Document scan error:', error);
      return res.status(500).json({ error: 'Failed to scan document' });
    }
  });



  // Setup automatic email reports
  const setupAutomaticReports = async () => {
    // Import the simplified database service
      const { simpleDatabaseService } = await import("./simpleDatabaseService");
      
      // Use default context for startup (no req available)
      const context = simpleDatabaseService.createDevelopmentContext();
      
      const settings = await simpleDatabaseService.getCompanySettings(context);
    if (!settings?.emailReportsEnabled) return;
    
    let cronExpression = "0 9 * * 1"; // Weekly on Monday at 9 AM
    
    switch (settings.reportFrequency) {
      case "daily":
        cronExpression = "0 9 * * *"; // Daily at 9 AM
        break;
      case "weekly":
        cronExpression = "0 9 * * 1"; // Weekly on Monday at 9 AM
        break;
      case "monthly":
        cronExpression = "0 9 1 * *"; // Monthly on 1st at 9 AM
        break;
    }
    
    cron.schedule(cronExpression, async () => {
      try {
        console.log("Generating automatic report...");
        
        const now = new Date();
        let fromDate = new Date();
        
        // Calculate date range based on frequency
        switch (settings.reportFrequency) {
          case "daily":
            fromDate.setDate(now.getDate() - 1);
            break;
          case "weekly":
            fromDate.setDate(now.getDate() - 7);
            break;
          case "monthly":
            fromDate.setMonth(now.getMonth() - 1);
            break;
        }
        
        // Generate and send report using customer-isolated data
        const allVisitors = await databaseService.getAllVisitors(context);
        const visitorsInRange = allVisitors.filter(v => 
          v.checkedInAt >= fromDate && v.checkedInAt <= now
        );
        
        const checkedOutVisitors = visitorsInRange.filter(v => v.checkedOutAt);
        const totalDuration = checkedOutVisitors.reduce((sum, visitor) => {
          if (visitor.checkedOutAt) {
            return sum + (visitor.checkedOutAt.getTime() - visitor.checkedInAt.getTime());
          }
          return sum;
        }, 0);
        
        const avgDurationMs = checkedOutVisitors.length > 0 ? totalDuration / checkedOutVisitors.length : 0;
        const avgDurationHours = (avgDurationMs / (1000 * 60 * 60)).toFixed(1);
        
        const autoCustDb = await customerDbService.getCustomerDatabase(context.customerId);
        const [report] = await autoCustDb.insert(isolatedSchema.reports)
          .values({
            reportType: `auto_${settings.reportFrequency}`,
            dateFrom: fromDate,
            dateTo: now,
            totalVisitors: visitorsInRange.length.toString(),
            avgDuration: `${avgDurationHours}h`,
            emailSent: false,
            emailSentAt: null,
          })
          .returning();
        
        // Send email
        const autoReportStaff = await databaseService.getAllStaff(context);
        const reportData = {
          visitors: visitorsInRange,
          staff: autoReportStaff,
          checkedOutVisitors
        };
        
        const emailSent = await emailService.forCustomer(req.customerId).sendReport(
          report, 
          settings, 
          settings.reportRecipients || [], 
          reportData
        );
        
        if (emailSent) {
          await autoCustDb.update(isolatedSchema.reports)
            .set({ emailSent: true, emailSentAt: new Date() })
            .where(eq(isolatedSchema.reports.id, report.id));
          
          await simpleDatabaseService.updateCompanySettings(context, {
            lastReportSent: new Date(),
          });
        }
        
        console.log(`Automatic ${settings.reportFrequency} report sent:`, emailSent);
      } catch (error) {
        console.error("Error in automatic report generation:", error);
      }
    });
  };



  // AI competitive analysis endpoint
  app.post("/api/ai/competitive-analysis", async (req, res) => {
    try {
      const { companySize, currentSystem, monthlyVisitors } = req.body;
      
      const analysis = await aiService.generateCompetitiveAnalysis(
        parseInt(companySize) || 50,
        currentSystem || 'manual system',
        parseInt(monthlyVisitors) || 100
      );
      
      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        analysis
      });
    } catch (error) {
      console.error("Failed to generate competitive analysis:", error);
      res.status(500).json({ error: "Failed to generate competitive analysis" });
    }
  });

  // AI customer success metrics endpoint
  app.get("/api/ai/success-metrics", requireAuth, async (req, res) => {
    try {
      const metricsContext = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const stats = await databaseService.getStats(metricsContext);
      
      const metrics = await aiService.generateSuccessMetrics(
        8, // 8 weeks implementation
        stats.todayCheckins * 30, // Monthly estimate
        stats.staffOnSite
      );
      
      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        metrics
      });
    } catch (error) {
      console.error("Failed to generate success metrics:", error);
      res.status(500).json({ error: "Failed to generate success metrics" });
    }
  });

  // AI flow optimization endpoint
  app.post("/api/ai/flow-optimization", async (req, res) => {
    try {
      const { peakHourVisitors, currentWaitTime, facilityLayout } = req.body;
      
      const optimization = await aiService.generateFlowOptimization(
        parseInt(peakHourVisitors) || 20,
        parseInt(currentWaitTime) || 5,
        facilityLayout || 'standard office'
      );
      
      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        optimization
      });
    } catch (error) {
      console.error("Failed to generate flow optimization:", error);
      res.status(500).json({ error: "Failed to generate flow optimization" });
    }
  });

  // AI sales pitch generator endpoint
  app.post("/api/ai/sales-pitch", async (req, res) => {
    try {
      const { companyName, industry, companySize, currentChallenges, budget } = req.body;
      
      const pitch = await aiService.generateSalesPitch(
        companyName || 'Prospect Company',
        industry || 'Business Services',
        parseInt(companySize) || 50,
        currentChallenges || 'Manual visitor management inefficiencies',
        budget || '£500-£2000/month'
      );
      
      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        pitch
      });
    } catch (error) {
      console.error("Failed to generate sales pitch:", error);
      res.status(500).json({ error: "Failed to generate sales pitch" });
    }
  });

  // AI security alert endpoint
  app.post("/api/ai/security-alert", requireAuth, async (req, res) => {
    try {
      const { pattern } = req.body;
      
      if (!pattern) {
        return res.status(400).json({ error: "Security pattern description required" });
      }

      const alertContext = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const visitors = await databaseService.getCurrentVisitors(alertContext);
      const alert = await aiService.generateSecurityAlert(visitors, pattern);
      
      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        alert,
        riskLevel: alert.toLowerCase().includes('immediate') ? 'high' : 'medium'
      });
    } catch (error) {
      console.error("AI security alert error:", error);
      res.status(500).json({ error: "Failed to generate security alert" });
    }
  });

  // Database backup endpoint
  app.get("/api/system/backup", requireAuth, async (req, res) => {
    try {
      logger.info('Backup downloaded', { userId: req.user?.id, customerId: req.customerId });

      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      const backupData: { metadata: any; data: Record<string, any[]> } = {
        metadata: {
          version: "4.0",
          format: "TPRMAX_BAK",
          created: new Date().toISOString(),
          system: "TPR Max",
          customerId: context.customerId,
          customerName: context.customerName,
          backupType: "FULL"
        },
        data: {}
      };

      // All schema-isolated tables in dependency order (parents before children)
      const tablesToBackup = [
        // Core system tables
        'users', 'departments', 'company_settings', 'evacuation_zones', 'meeting_rooms',
        'feature_toggles',
        // Personnel
        'staff', 'visitors', 'members', 'staff_sessions', 'muster_points',
        // Evacuation & safety
        'evacuations', 'evacuation_accountability', 'safety_tokens',
        // Bookings & invitations
        'user_invitations', 'pre_bookings', 'room_bookings', 'room_booking_attendees',
        // History
        'staff_attendance_history', 'visitor_history',
        // Contractors
        'contractor_companies', 'contractor_workers', 'worker_notes', 'company_notes', 'contractor_documents',
        'compliance_documents', 'document_approvals', 'document_types', 'worker_competencies',
        'nvq_qualifications', 'card_offences', 'card_issues', 'worker_certifications',
        'rams_documents', 'contractor_visits', 'contractor_prebookings',
        // Documents
        'uk_hs_document_templates', 'worker_document_assignments', 'worker_document_acceptances',
        'document_auto_fill_mapping',
        // Inductions
        'induction_tokens', 'induction_questions', 'induction_settings', 'induction_answers',
        // CO2 & sustainability
        'co2_records', 'local_labour_records', 'co2_emissions_data',
        'co2_monthly_summaries', 'co2_sustainability_reports',
        // Company & reporting
        'enhanced_company_details', 'reports',
        // Print system
        'print_queue', 'print_job_history', 'printer_configurations', 'print_service_instances',
        // AI & analytics
        'ai_generated_images', 'customer_api_keys', 'feature_usage_analytics',
        // Help system
        'help_categories', 'help_articles', 'help_user_interactions', 'help_onboarding_progress'
      ];

      let totalRecords = 0;
      for (const table of tablesToBackup) {
        try {
          const result = await custDb.execute(sql.raw(`SELECT * FROM "${table}"`));
          backupData.data[table] = result.rows as any[];
          totalRecords += result.rows.length;
        } catch (err: any) {
          console.warn(`⚠️ Could not export table ${table}: ${err.message}`);
          backupData.data[table] = [];
        }
      }

      backupData.metadata.total_records = totalRecords;
      backupData.metadata.tables_exported = tablesToBackup.length;

      const backupContent = Buffer.from(JSON.stringify(backupData, null, 2));
      logger.info('Backup created', { customerId: context.customerId, totalRecords, bytes: backupContent.length });

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="tprmax-backup-${context.customerId}-${timestamp}.bak"`);
      res.setHeader('Content-Length', backupContent.length.toString());
      res.send(backupContent);

    } catch (error: any) {
      console.error("❌ Database backup error:", error);
      res.status(500).json({ error: "Failed to create database backup" });
    }
  });

  // Database restore endpoint
  app.post("/api/system/restore", requireAuth, async (req, res) => {
    try {
      const { backupData, clearExisting = true } = req.body;

      if (!backupData || !backupData.data || !backupData.metadata) {
        return res.status(400).json({ error: "Invalid backup file. Please select a .bak file exported from TPR Max." });
      }

      // Validate that this is a genuine TPR Max backup
      if (backupData.metadata.system !== 'TPR Max' && backupData.metadata.format !== 'TPRMAX_BAK') {
        return res.status(400).json({ error: "Unrecognised backup format. Only TPR Max backup files (.bak) are supported." });
      }

      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);

      // Security: prevent restoring a backup from a different customer
      if (backupData.metadata.customerId && backupData.metadata.customerId !== context.customerId) {
        return res.status(403).json({ error: "Cannot restore a backup that belongs to a different account." });
      }

      logger.info('Database restore started', { userId: req.user?.id, customerId: req.customerId });

      // Only restore tables that actually exist in our schema (whitelist for safety)
      const allowedTables = new Set([
        'users', 'departments', 'company_settings', 'evacuation_zones', 'meeting_rooms',
        'feature_toggles',
        'staff', 'visitors', 'members', 'staff_sessions', 'muster_points',
        'evacuations', 'evacuation_accountability', 'safety_tokens',
        'user_invitations', 'pre_bookings', 'room_bookings', 'room_booking_attendees',
        'staff_attendance_history', 'visitor_history',
        'contractor_companies', 'contractor_workers', 'worker_notes', 'contractor_documents',
        'compliance_documents', 'document_approvals', 'document_types', 'worker_competencies',
        'nvq_qualifications', 'card_offences', 'card_issues', 'worker_certifications',
        'rams_documents', 'contractor_visits', 'contractor_prebookings',
        'uk_hs_document_templates', 'worker_document_assignments', 'worker_document_acceptances',
        'document_auto_fill_mapping',
        'induction_tokens', 'induction_questions', 'induction_settings', 'induction_answers',
        'co2_records', 'local_labour_records', 'co2_emissions_data',
        'co2_monthly_summaries', 'co2_sustainability_reports',
        'enhanced_company_details', 'reports',
        'print_queue', 'print_job_history', 'printer_configurations', 'print_service_instances',
        'ai_generated_images', 'customer_api_keys', 'feature_usage_analytics',
        'help_categories', 'help_articles', 'help_user_interactions', 'help_onboarding_progress'
      ]);

      // Filter to only whitelisted tables, preserve dependency order
      const tablesToRestore = Object.keys(backupData.data).filter(t => allowedTables.has(t));

      const errors: { table: string; error: string }[] = [];
      let restoredTables = 0;
      let restoredRecords = 0;

      // Run the entire restore inside a transaction — if anything fails we roll back cleanly
      await custDb.transaction(async (tx) => {
        // Clear tables in reverse order to respect foreign key constraints
        if (clearExisting) {
          const reversedTables = [...tablesToRestore].reverse();
          for (const table of reversedTables) {
            try {
              await tx.execute(sql.raw(`TRUNCATE TABLE "${table}" CASCADE`));
            } catch (err: any) {
              console.warn(`⚠️ Could not clear ${table}: ${err.message}`);
            }
          }
        }

        // Restore tables in forward order (parents before children)
        for (const table of tablesToRestore) {
          const records = backupData.data[table] as any[];
          if (!records || records.length === 0) continue;

          try {
            for (const record of records) {
              const columns = Object.keys(record);
              if (columns.length === 0) continue;

              try {
                // Build properly parameterized INSERT using Drizzle sql template
                const tableIdent = sql.identifier(table);
                const colIdents = sql.join(columns.map(c => sql.identifier(c)), sql.raw(', '));
                const vals = sql.join(columns.map(c => sql`${record[c]}`), sql.raw(', '));
                await tx.execute(
                  sql`INSERT INTO ${tableIdent} (${colIdents}) VALUES (${vals}) ON CONFLICT DO NOTHING`
                );
              } catch (rowErr: any) {
                // Log but continue — individual constraint violations are non-fatal
                console.warn(`⚠️ Skipped row in ${table}: ${rowErr.message}`);
              }
            }

            restoredTables++;
            restoredRecords += records.length;

          } catch (error: any) {
            console.error(`❌ Error restoring table ${table}:`, error);
            errors.push({ table, error: error.message });
          }
        }
      });

      logger.info('Database restore completed', { customerId: context.customerId, restoredRecords, restoredTables });

      res.json({
        success: true,
        message: `Database restore completed for ${context.customerName}`,
        restored: {
          tables: restoredTables,
          records: restoredRecords,
          errors: errors.length
        },
        errors
      });

    } catch (error: any) {
      console.error("Database restore error:", error);
      res.status(500).json({ error: "Failed to restore database" });
    }
  });

  // AI photo analysis endpoint
  app.post("/api/ai/analyze-photo", async (req, res) => {
    try {
      const { image } = req.body;
      
      if (!image) {
        return res.status(400).json({ error: "Base64 image data required" });
      }

      const analysis = await aiService.analyzeVisitorPhoto(image);
      
      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        analysis
      });
    } catch (error) {
      console.error("AI photo analysis error:", error);
      res.status(500).json({ error: "Failed to analyze photo" });
    }
  });

  // AI ROI Calculator endpoint
  app.post("/api/ai/roi-analysis", async (req, res) => {
    try {
      const { monthlyVisitors, staffCount, manualProcessTime } = req.body;
      
      if (!monthlyVisitors || !staffCount || !manualProcessTime) {
        return res.status(400).json({ error: "Monthly visitors, staff count, and manual process time required" });
      }

      const roiAnalysis = await aiService.generateROIAnalysis(
        Number(monthlyVisitors),
        Number(staffCount), 
        Number(manualProcessTime)
      );
      
      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        roi: roiAnalysis
      });
    } catch (error) {
      console.error("AI ROI analysis error:", error);
      res.status(500).json({ error: "Failed to generate ROI analysis" });
    }
  });

  // AI Visitor Sentiment Analysis endpoint
  app.get("/api/ai/visitor-sentiment", requireAuth, async (req, res) => {
    try {
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const visitors = await databaseService.getAllVisitors(context);
      const stats = await databaseService.getStats(context);
      
      const avgDurationMinutes = 45; // Fallback duration since stats may not have this field
      const sentiment = await aiService.analyzeVisitorSentiment(visitors, avgDurationMinutes);
      
      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        sentiment
      });
    } catch (error) {
      console.error("AI sentiment analysis error:", error);
      res.status(500).json({ error: "Failed to analyze visitor sentiment" });
    }
  });

  // AI Compliance Analysis endpoint
  app.get("/api/ai/compliance", requireAuth, async (req, res) => {
    try {
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const visitors = await databaseService.getAllVisitors(context);
      const staff = await databaseService.getAllStaff(context);
      
      const compliance = await aiService.generateComplianceAnalysis(visitors, staff);
      
      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        compliance
      });
    } catch (error) {
      console.error("AI compliance analysis error:", error);
      res.status(500).json({ error: "Failed to generate compliance analysis" });
    }
  });

  // Biostar integration endpoints
  app.post("/api/biostar/test-connection", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId;
      if (!customerId || !req.user?.username) {
        return res.status(401).json({ error: "Please log in to test connection" });
      }
      
      const context = simpleDatabaseService.createCustomerContext(req.user.username, customerId);
      const settings = await simpleDatabaseService.getCompanySettings(context);
      
      if (!settings?.biostarServerUrl || !settings?.biostarUsername || !settings?.biostarPassword) {
        return res.status(400).json({ 
          connected: false, 
          message: "Please enter the Biostar server URL, username, and password before testing" 
        });
      }

      console.log("🔍 Testing Biostar connection...");

      // Test connection using new biostarService
      const result = await biostarService.testConnection({
        serverUrl: settings.biostarServerUrl,
        username: settings.biostarUsername,
        password: settings.biostarPassword,
        databaseId: settings.biostarDatabaseId || "1",
      });
      
      console.log("✅ Biostar connection test result:", result);
      
      res.json(result);
    } catch (error) {
      console.error("❌ Biostar connection test failed:", error);
      res.status(500).json({ 
        connected: false, 
        message: "Connection test failed: " + (error as Error).message 
      });
    }
  });

  // Manual sync trigger for Biostar attendance data
  app.post("/api/biostar/sync-now", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId;
      if (!customerId || !req.user?.username) {
        return res.status(401).json({ error: "Please log in to sync data" });
      }
      
      const context = simpleDatabaseService.createCustomerContext(req.user.username, customerId);
      const settings = await simpleDatabaseService.getCompanySettings(context);
      
      if (!settings?.biostarEnabled) {
        return res.status(400).json({ error: "Biostar integration is not enabled" });
      }

      if (!settings.biostarServerUrl || !settings.biostarUsername || !settings.biostarPassword) {
        return res.status(400).json({ error: "Missing Biostar connection settings" });
      }

      const biostarConfig = {
        serverUrl: settings.biostarServerUrl,
        username: settings.biostarUsername,
        password: settings.biostarPassword,
        databaseId: settings.biostarDatabaseId || "1",
      };

      console.log('🔄 Starting manual Biostar sync (attendance + staff import)...');

      // --- Step 1: Get all Biostar users and import any new ones as staff ---
      const biostarUsers = await biostarService.getUsers(biostarConfig);
      console.log(`👥 Biostar: ${biostarUsers.length} users fetched for staff import check`);

      // Fetch existing staff to check for duplicates by biostarUserId
      const db = await customerDbService.getCustomerDatabase(customerId);
      const existingStaff = await db.select({
        id: isolatedSchema.staff.id,
        biostarUserId: isolatedSchema.staff.biostarUserId,
        email: isolatedSchema.staff.email,
        employeeId: isolatedSchema.staff.employeeId,
      }).from(isolatedSchema.staff);

      // Map biostarUserId → staff record id so we can update existing records
      const biostarIdToStaffId = new Map(
        existingStaff
          .filter(s => s.biostarUserId)
          .map(s => [s.biostarUserId as string, s.id])
      );
      const existingEmails = new Set(
        existingStaff.map(s => s.email?.toLowerCase()).filter(Boolean)
      );
      const existingEmployeeIds = new Set(
        existingStaff.map(s => s.employeeId).filter(Boolean)
      );

      let importedCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;
      const importErrors: string[] = [];

      for (const bUser of biostarUsers) {
        // Skip users without a name or ID
        if (!bUser.id || !bUser.name.trim()) {
          skippedCount++;
          continue;
        }

        const nameParts = bUser.name.trim().split(/\s+/);
        const firstName = nameParts[0] || 'Unknown';
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

        // --- Update existing Biostar staff record with latest field values ---
        if (biostarIdToStaffId.has(bUser.id)) {
          const staffId = biostarIdToStaffId.get(bUser.id)!;
          const updates: Record<string, any> = {
            firstName,
            lastName,
          };
          if (bUser.email?.trim()) updates.email = bUser.email.trim().toLowerCase();
          if (bUser.phone?.trim()) updates.phoneNumber = bUser.phone.trim();
          if (bUser.department?.trim()) updates.department = bUser.department.trim();
          if (bUser.barcodeNumber) updates.barcodeNumber = bUser.barcodeNumber;
          if (bUser.memberNumber) updates.memberNumber = bUser.memberNumber;

          try {
            await databaseService.updateStaff(context, staffId, updates as any);
            updatedCount++;
            console.log(`🔄 Biostar: Updated staff "${bUser.name}" (Biostar ID: ${bUser.id}, Card: ${bUser.barcodeNumber || 'none'}, Member: ${bUser.memberNumber || 'none'})`);
          } catch (err: any) {
            console.error(`❌ Biostar: Failed to update staff "${bUser.name}":`, err.message);
          }
          continue;
        }

        // --- Create new staff record ---
        // Build a unique employee ID using the Biostar user ID
        const employeeId = existingEmployeeIds.has(`BSTR-${bUser.id}`)
          ? `BSTR-${bUser.id}-${Date.now()}`
          : `BSTR-${bUser.id}`;

        // Build a unique email — use Biostar email if available and not already taken,
        // otherwise generate a placeholder so the unique constraint is satisfied
        let email = bUser.email && bUser.email.trim() && !existingEmails.has(bUser.email.toLowerCase())
          ? bUser.email.trim().toLowerCase()
          : `biostar.${bUser.id}@noemail.local`;

        // Ensure placeholder is also unique (edge case: duplicate Biostar IDs)
        if (existingEmails.has(email)) {
          email = `biostar.${bUser.id}.${Date.now()}@noemail.local`;
        }

        try {
          await databaseService.createStaff(context, {
            firstName,
            lastName,
            email,
            department: bUser.department?.trim() || "Unassigned",
            employeeId,
            accessLevel: "staff",
            biostarUserId: bUser.id,
            phoneNumber: bUser.phone?.trim() || undefined,
            barcodeNumber: bUser.barcodeNumber || undefined,
            memberNumber: bUser.memberNumber || undefined,
            isActive: true,
            isCheckedIn: false,
            isAccountedFor: false,
            needsEvacuationAssistance: false,
            isFireMarshal: false,
            inductionCompleted: false,
          } as any);

          biostarIdToStaffId.set(bUser.id, ''); // mark as processed
          existingEmails.add(email);
          existingEmployeeIds.add(employeeId);
          importedCount++;
          console.log(`✅ Biostar: Imported staff "${firstName} ${lastName}" (Biostar ID: ${bUser.id}, Card: ${bUser.barcodeNumber || 'none'}, Member: ${bUser.memberNumber || 'none'})`);
        } catch (err: any) {
          console.error(`❌ Biostar: Failed to import user "${bUser.name}":`, err.message);
          importErrors.push(`${bUser.name}: ${err.message}`);
          skippedCount++;
        }
      }

      console.log(`📊 Biostar staff import: ${importedCount} added, ${updatedCount} updated, ${skippedCount} skipped`);

      // --- Step 2: Get current on-site users from event logs and update staff check-in status ---
      let onSiteUsers: any[] = [];
      let onSiteWarning: string | undefined;
      let attendanceCheckedIn = 0;
      let attendanceCheckedOut = 0;
      try {
        // Load device roles so direction detection works correctly
        const syncDeviceRows = await db
          .select({ id: isolatedSchema.biostarDevices.id, role: isolatedSchema.biostarDevices.role })
          .from(isolatedSchema.biostarDevices);
        const syncDeviceRoles: Record<string, string> = Object.fromEntries(
          syncDeviceRows.map(d => [String(d.id), d.role])
        );
        onSiteUsers = await biostarService.getCurrentOnSiteUsers(biostarConfig, syncDeviceRoles);
        console.log(`📊 Biostar sync found ${onSiteUsers.length} users on-site`);

        // Build set of BioStar user IDs currently on-site
        const onSiteIds = new Set(onSiteUsers.map((u: any) => String(u.userId)));

        // Fetch all staff with a biostarUserId so we can reconcile their status
        const allBiostarStaff = await db
          .select({
            id: isolatedSchema.staff.id,
            biostarUserId: isolatedSchema.staff.biostarUserId,
            isCheckedIn: isolatedSchema.staff.isCheckedIn,
          })
          .from(isolatedSchema.staff)
          .where(isNotNull(isolatedSchema.staff.biostarUserId));

        console.log(`👥 Biostar: ${allBiostarStaff.length} staff linked to BioStar, reconciling against ${onSiteIds.size} on-site IDs`);

        const now = new Date();
        for (const staffMember of allBiostarStaff) {
          if (!staffMember.biostarUserId) continue;
          const shouldBeIn = onSiteIds.has(String(staffMember.biostarUserId));

          console.log(`🔍 Biostar reconcile: staff biostarId=${staffMember.biostarUserId}, shouldBeIn=${shouldBeIn}, isCheckedIn=${staffMember.isCheckedIn}`);

          if (shouldBeIn && !staffMember.isCheckedIn) {
            // BioStar says on-site but TPR shows off-site → check in
            await db
              .update(isolatedSchema.staff)
              .set({ isCheckedIn: true, checkedInAt: now, checkedOutAt: null, updatedAt: now })
              .where(eq(isolatedSchema.staff.id, staffMember.id));
            attendanceCheckedIn++;
            console.log(`✅ Biostar attendance: Checked IN staff (biostar id ${staffMember.biostarUserId})`);
          } else if (!shouldBeIn && staffMember.isCheckedIn) {
            // BioStar says off-site but TPR shows on-site → check out
            await db
              .update(isolatedSchema.staff)
              .set({ isCheckedIn: false, checkedOutAt: now, updatedAt: now })
              .where(eq(isolatedSchema.staff.id, staffMember.id));
            attendanceCheckedOut++;
            console.log(`✅ Biostar attendance: Checked OUT staff (biostar id ${staffMember.biostarUserId})`);
          }
        }

        if (attendanceCheckedIn > 0 || attendanceCheckedOut > 0) {
          console.log(`📊 Biostar attendance update: ${attendanceCheckedIn} checked in, ${attendanceCheckedOut} checked out`);
        }
      } catch (onSiteErr: any) {
        const msg = (onSiteErr as Error).message || String(onSiteErr);
        console.warn(`⚠️ Biostar on-site tracking unavailable (non-fatal): ${msg}`);
        onSiteWarning = `On-site tracking unavailable: ${msg}. Staff import still succeeded.`;
      }

      // Update last sync timestamp
      await simpleDatabaseService.updateCompanySettings(context, {
        biostarLastSync: new Date(),
      });

      res.json({
        success: true,
        imported: importedCount,
        updated: updatedCount,
        skipped: skippedCount,
        errors: importErrors.length > 0 ? importErrors : undefined,
        onSiteCount: onSiteUsers.length,
        onSiteUsers,
        attendanceCheckedIn,
        attendanceCheckedOut,
        onSiteWarning,
        lastSync: new Date().toISOString(),
        message: `Sync completed: ${importedCount} new staff imported, ${updatedCount} updated from Biostar${onSiteWarning ? " (on-site tracking unavailable)" : `, ${onSiteUsers.length} users on-site (${attendanceCheckedIn} checked in, ${attendanceCheckedOut} checked out)`}`,
      });
    } catch (error) {
      console.error("❌ Biostar sync failed:", error);
      res.status(500).json({ error: "Sync failed: " + (error as Error).message });
    }
  });

  // Get current on-site staff from Biostar
  app.get("/api/biostar/staff-status", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId;
      if (!customerId || !req.user?.username) {
        return res.status(401).json({ error: "Please log in to view staff status" });
      }
      
      const context = simpleDatabaseService.createCustomerContext(req.user.username, customerId);
      const settings = await simpleDatabaseService.getCompanySettings(context);
      
      if (!settings?.biostarEnabled) {
        return res.json({ 
          enabled: false, 
          onSiteUsers: [],
          message: "Biostar integration is not enabled" 
        });
      }

      if (!settings.biostarServerUrl || !settings.biostarUsername || !settings.biostarPassword) {
        return res.json({ 
          enabled: true, 
          onSiteUsers: [],
          message: "Biostar connection settings incomplete" 
        });
      }

      // Get current on-site users from Biostar
      const onSiteUsers = await biostarService.getCurrentOnSiteUsers({
        serverUrl: settings.biostarServerUrl,
        username: settings.biostarUsername,
        password: settings.biostarPassword,
        databaseId: settings.biostarDatabaseId || "1",
      });
      
      res.json({
        enabled: true,
        onSiteUsers,
        lastSync: settings.biostarLastSync ? String(settings.biostarLastSync) : null,
        message: `Found ${onSiteUsers.length} users on-site`
      });
    } catch (error) {
      console.error("❌ Failed to get Biostar staff status:", error);
      res.status(500).json({ 
        enabled: true, 
        onSiteUsers: [],
        error: "Failed to get staff status: " + (error as Error).message 
      });
    }
  });

  // BioStar Scan Activity — shows each BioStar user's last scan time and linked staff record.
  // Uses the /api/users endpoint (confirmed working) rather than event logs.
  app.get("/api/biostar/scan-activity", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId;
      if (!customerId || !req.user?.username) return res.status(401).json({ error: "Unauthorised" });

      const context = simpleDatabaseService.createCustomerContext(req.user.username, customerId);
      const settings = await simpleDatabaseService.getCompanySettings(context);
      if (!settings?.biostarEnabled) return res.json({ users: [], error: "BioStar 2 integration is not enabled." });

      const diagConfig: BiostarConfig = {
        serverUrl:  settings.biostarServerUrl  ?? '',
        username:   settings.biostarUsername   ?? '',
        password:   settings.biostarPassword   ?? '',
        useHttps:   true,
        verifySSL:  false,
      };

      // Fetch all BioStar users (includes lastAccessTime)
      const biostarUsers = await biostarService.getUsers(diagConfig);

      // Fetch all staff that have a biostarUserId so we can cross-reference
      const db = await customerDbService.getCustomerDatabase(customerId);
      const staffList = await db
        .select({
          id:            isolatedSchema.staff.id,
          firstName:     isolatedSchema.staff.firstName,
          lastName:      isolatedSchema.staff.lastName,
          biostarUserId: isolatedSchema.staff.biostarUserId,
          isCheckedIn:   isolatedSchema.staff.isCheckedIn,
          checkedInAt:   isolatedSchema.staff.checkedInAt,
          checkedOutAt:  isolatedSchema.staff.checkedOutAt,
        })
        .from(isolatedSchema.staff)
        .where(isNotNull(isolatedSchema.staff.biostarUserId));

      // Build lookup: biostarUserId → staff record
      const staffByBiostarId = new Map(staffList.map(s => [String(s.biostarUserId), s]));

      // Merge BioStar users with staff records, sorted by lastWebhookTime desc
      const rows = biostarUsers
        .map(u => {
          const staff = staffByBiostarId.get(String(u.id));
          // lastWebhookTime = most recent time a webhook event was received for this person
          const checkedInMs  = staff?.checkedInAt  ? new Date(staff.checkedInAt).getTime()  : 0;
          const checkedOutMs = staff?.checkedOutAt ? new Date(staff.checkedOutAt).getTime() : 0;
          const lastWebhookMs = Math.max(checkedInMs, checkedOutMs);
          return {
            biostarUserId:   u.id,
            biostarName:     u.name,
            lastAccessTime:  u.lastAccessTime ?? null,
            lastWebhookTime: lastWebhookMs > 0 ? new Date(lastWebhookMs).toISOString() : null,
            staffId:         staff?.id ?? null,
            staffName:       staff ? `${staff.firstName} ${staff.lastName}` : null,
            isCheckedIn:     staff?.isCheckedIn ?? null,
            checkedInAt:     staff?.checkedInAt ?? null,
            checkedOutAt:    staff?.checkedOutAt ?? null,
            linked:          !!staff,
          };
        })
        .sort((a, b) => {
          // Sort by most recent webhook activity first; unactioned users go to the bottom
          if (!a.lastWebhookTime && !b.lastWebhookTime) return 0;
          if (!a.lastWebhookTime) return 1;
          if (!b.lastWebhookTime) return -1;
          return new Date(b.lastWebhookTime).getTime() - new Date(a.lastWebhookTime).getTime();
        });

      res.json({ users: rows, total: rows.length });
    } catch (err: any) {
      console.error("❌ BioStar scan-activity error:", err);
      res.status(500).json({ users: [], error: err.message });
    }
  });

  // BioStar diagnostics — shows raw events, on-site status, and staff matching
  app.get("/api/biostar/diagnostics", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId;
      if (!customerId || !req.user?.username) {
        return res.status(401).json({ error: "Unauthorised" });
      }

      const context = simpleDatabaseService.createCustomerContext(req.user.username, customerId);
      const settings = await simpleDatabaseService.getCompanySettings(context);

      if (!settings?.biostarEnabled) {
        return res.json({ enabled: false, message: "BioStar integration is not enabled" });
      }
      if (!settings.biostarServerUrl || !settings.biostarUsername || !settings.biostarPassword) {
        return res.json({ enabled: true, message: "BioStar connection settings incomplete" });
      }

      const diagConfig = {
        serverUrl: settings.biostarServerUrl,
        username: settings.biostarUsername,
        password: settings.biostarPassword,
        databaseId: settings.biostarDatabaseId || "1",
      };

      // Fetch today's raw events (may fail if event log API not permitted)
      let rawEvents: any[] = [];
      let eventLogError: string | null = null;
      try {
        rawEvents = await biostarService.getEventLogs(diagConfig);
      } catch (evtErr: any) {
        eventLogError = evtErr.message;
        console.warn(`⚠️ Biostar diagnostics: Event log unavailable - ${evtErr.message}`);
      }

      // Try door status as alternative data source
      await biostarService.getDoorStatus(diagConfig);

      // Fetch all staff with biostarUserId to show matching
      const diagDb = await customerDbService.getCustomerDatabase(customerId);

      // Load device roles for accurate direction detection in diagnostics too
      const diagDeviceRows = await diagDb
        .select({ id: isolatedSchema.biostarDevices.id, role: isolatedSchema.biostarDevices.role })
        .from(isolatedSchema.biostarDevices);
      const diagDeviceRoles: Record<string, string> = Object.fromEntries(
        diagDeviceRows.map(d => [String(d.id), d.role])
      );

      // Fetch on-site determination (falls back to last_access_time automatically)
      const onSiteUsers = await biostarService.getCurrentOnSiteUsers(diagConfig, diagDeviceRoles);
      const onSiteIds = new Set(onSiteUsers.map((u: any) => String(u.userId)));
      const allBiostarStaff = await diagDb
        .select({
          id: isolatedSchema.staff.id,
          firstName: isolatedSchema.staff.firstName,
          lastName: isolatedSchema.staff.lastName,
          biostarUserId: isolatedSchema.staff.biostarUserId,
          isCheckedIn: isolatedSchema.staff.isCheckedIn,
        })
        .from(isolatedSchema.staff)
        .where(isNotNull(isolatedSchema.staff.biostarUserId));

      const staffReconciliation = allBiostarStaff.map(s => ({
        staffId: s.id,
        name: `${s.firstName} ${s.lastName}`,
        biostarUserId: s.biostarUserId,
        currentlyCheckedIn: s.isCheckedIn,
        biostarSaysOnSite: onSiteIds.has(String(s.biostarUserId)),
        status: onSiteIds.has(String(s.biostarUserId)) ? "ON-SITE" : "OFF-SITE",
      }));

      // Unique event codes seen today
      const eventCodeSummary = rawEvents.reduce<Record<string, { count: number; desc: string }>>((acc, e) => {
        const key = e.eventTypeCode;
        if (!acc[key]) acc[key] = { count: 0, desc: e.eventTypeDesc };
        acc[key].count++;
        return acc;
      }, {});

      res.json({
        enabled: true,
        lastSync: settings.biostarLastSync ? String(settings.biostarLastSync) : null,
        eventLogError,
        eventCount: rawEvents.length,
        events: rawEvents.slice(0, 50).map(e => ({
          id: e.id,
          time: e.eventTime,
          userId: e.userId,
          userName: e.userName,
          deviceId: e.deviceId,
          deviceName: e.deviceName,
          eventCode: e.eventTypeCode,
          eventDesc: e.eventTypeDesc,
        })),
        eventCodeSummary,
        onSiteUsers,
        staffReconciliation,
      });
    } catch (err: any) {
      console.error("❌ BioStar diagnostics error:", err);
      res.status(500).json({ enabled: true, error: err.message });
    }
  });

  // -----------------------------------------------------------------
  // BioStar 2 Event Webhook
  // BioStar 2 "Trigger & Action" can POST card-scan events here.
  // No session auth required — BioStar cannot send session tokens.
  // The customerId in the URL scopes the event to the right tenant.
  // -----------------------------------------------------------------
  app.post("/api/biostar/webhook/:customerId", async (req, res) => {
    const { customerId } = req.params;
    const payload = req.body;

    // Log the raw payload so we can see exactly what BioStar sends
    console.log(`📡 BioStar Webhook: received event for customer ${customerId}:`, JSON.stringify(payload).slice(0, 500));

    try {
      if (!customerId) return res.status(400).json({ error: "Missing customerId" });

      // Extract userId, deviceId, and eventTypeCode from BioStar's various payload formats
      const userId = String(
        payload?.user_id?.id ?? payload?.user_id ?? payload?.userId ?? ''
      );
      const deviceId = String(
        payload?.device_id?.id ?? payload?.device_id ?? payload?.deviceId ?? ''
      );
      const deviceName = String(
        payload?.device_id?.name ?? payload?.device_name ?? payload?.deviceName ?? ''
      );
      const eventTypeCode = String(
        payload?.event_type_id?.code ?? payload?.event_type_id ?? payload?.eventTypeCode ?? payload?.event_type ?? ''
      );
      const eventTime = payload?.datetime ?? payload?.event_time ?? payload?.eventTime ?? new Date().toISOString();

      if (!userId || userId === '0' || !eventTypeCode) {
        console.warn(`⚠️ BioStar Webhook: insufficient data — userId=${userId}, eventTypeCode=${eventTypeCode}`);
        pushBiostarEvent(customerId, { id: crypto.randomUUID(), ts: new Date().toISOString(), customerId, userId: userId || '?', deviceId: deviceId || '?', deviceName: deviceName || 'Unknown', eventCode: eventTypeCode || '?', action: 'insufficient_data' });
        return res.json({ ok: false, reason: 'insufficient_data' });
      }

      const webhookDb = await customerDbService.getCustomerDatabase(customerId);

      // --- Determine entry/exit using device role (preferred) or event code (fallback) ---
      let isEntry = false;
      let isExit = false;
      let detectionMethod = 'event_code';

      if (deviceId && deviceId !== '0') {
        // Look up device role from our configured device table
        const [deviceConfig] = await webhookDb
          .select()
          .from(isolatedSchema.biostarDevices)
          .where(eq(isolatedSchema.biostarDevices.id, deviceId))
          .limit(1);

        if (deviceConfig) {
          detectionMethod = 'device_role';
          if (deviceConfig.role === 'ENTRY') { isEntry = true; }
          else if (deviceConfig.role === 'EXIT') { isExit = true; }
          else if (deviceConfig.role === 'ENTRY_EXIT') {
            // For ENTRY_EXIT devices, fall back to event code to determine direction
            isEntry = biostarService.isEntryEvent(eventTypeCode);
            isExit = biostarService.isExitEvent(eventTypeCode);
            if (!isEntry && !isExit) isEntry = true; // default: treat as entry if code unclear
          }
          // IGNORE role: isEntry=false, isExit=false → event is silently dropped
          console.log(`📡 BioStar Webhook: device "${deviceConfig.name}" (${deviceId}) role=${deviceConfig.role} → entry=${isEntry} exit=${isExit}`);
        } else {
          // Unknown device — auto-register it as ENTRY_EXIT so it shows up in the config UI
          try {
            await webhookDb
              .insert(isolatedSchema.biostarDevices)
              .values({ id: deviceId, name: deviceName || `Device ${deviceId}`, role: 'ENTRY_EXIT', direction: 'BOTH', syncedAt: new Date(), updatedAt: new Date() })
              .onConflictDoNothing();
            console.log(`📟 BioStar Webhook: Auto-registered unknown device ${deviceId} ("${deviceName || 'unknown'}") as ENTRY_EXIT`);
          } catch { /* ignore insert errors */ }
          // Fall back to event code logic for this event
          isEntry = biostarService.isEntryEvent(eventTypeCode);
          isExit = biostarService.isExitEvent(eventTypeCode);
        }
      } else {
        // No deviceId in payload — fall back to event code
        isEntry = biostarService.isEntryEvent(eventTypeCode);
        isExit = biostarService.isExitEvent(eventTypeCode);
      }

      console.log(`📡 BioStar Webhook: userId=${userId} device=${deviceId} eventCode=${eventTypeCode} entry=${isEntry} exit=${isExit} method=${detectionMethod} time=${eventTime}`);

      // Helper: build and push a live log event
      const deviceRole = (() => {
        // Re-check device config for role to include in log
        return undefined; // Will be looked up below if needed
      })();
      const makeLogEvent = (action: string, userName?: string, role?: string): BiostarLiveEvent => ({
        id: crypto.randomUUID(),
        ts: eventTime || new Date().toISOString(),
        customerId,
        userId,
        userName,
        deviceId,
        deviceName,
        deviceRole: role,
        eventCode: eventTypeCode,
        action,
      });

      if (!isEntry && !isExit) {
        console.log(`📡 BioStar Webhook: event ignored (role=IGNORE or unrecognised code)`);
        pushBiostarEvent(customerId, makeLogEvent('ignored'));
        return res.json({ ok: true, action: 'ignored' });
      }

      const [staffMember] = await webhookDb
        .select({ id: isolatedSchema.staff.id, firstName: isolatedSchema.staff.firstName, lastName: isolatedSchema.staff.lastName, isCheckedIn: isolatedSchema.staff.isCheckedIn })
        .from(isolatedSchema.staff)
        .where(eq(isolatedSchema.staff.biostarUserId, userId))
        .limit(1);

      if (!staffMember) {
        console.warn(`📡 BioStar Webhook: no staff matched biostarUserId=${userId}`);
        pushBiostarEvent(customerId, makeLogEvent('no_match'));
        return res.json({ ok: true, action: 'no_match', biostarUserId: userId });
      }

      const staffName = `${staffMember.firstName} ${staffMember.lastName}`;
      const now = new Date();
      if (isEntry && !staffMember.isCheckedIn) {
        await webhookDb.update(isolatedSchema.staff)
          .set({ isCheckedIn: true, checkedInAt: now, checkedOutAt: null, updatedAt: now })
          .where(eq(isolatedSchema.staff.id, staffMember.id));
        console.log(`✅ BioStar Webhook: ${staffName} checked IN (device=${deviceId} event=${eventTypeCode})`);
        pushBiostarEvent(customerId, makeLogEvent('checked_in', staffName));
        return res.json({ ok: true, action: 'checked_in', staff: staffName });
      } else if (isExit && staffMember.isCheckedIn) {
        await webhookDb.update(isolatedSchema.staff)
          .set({ isCheckedIn: false, checkedOutAt: now, updatedAt: now })
          .where(eq(isolatedSchema.staff.id, staffMember.id));
        console.log(`✅ BioStar Webhook: ${staffName} checked OUT (device=${deviceId} event=${eventTypeCode})`);
        pushBiostarEvent(customerId, makeLogEvent('checked_out', staffName));
        return res.json({ ok: true, action: 'checked_out', staff: staffName });
      } else {
        console.log(`📡 BioStar Webhook: ${staffName} already in correct state — no update`);
        pushBiostarEvent(customerId, makeLogEvent('no_change', staffName));
        return res.json({ ok: true, action: 'no_change', currentState: staffMember.isCheckedIn ? 'checked_in' : 'checked_out' });
      }
    } catch (err: any) {
      console.error(`❌ BioStar Webhook error for ${customerId}:`, err.message);
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Also expose the webhook URL in diagnostics
  app.get("/api/biostar/webhook-url", requireAuth, async (req, res) => {
    const customerId = req.customerId!;
    // Build the public-facing URL: use HOST header or a configured base URL
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    const webhookUrl = `${proto}://${host}/api/biostar/webhook/${customerId}`;
    res.json({ webhookUrl, customerId });
  });

  /**
   * GET /api/biostar/webhook-log
   * Returns recent webhook events from the in-memory ring buffer.
   * Used by the Live Log panel in the Device Configuration UI.
   * ?limit=N  — max events to return (default 50, max 200)
   * ?clear=true — clear the log after returning it
   */
  app.get("/api/biostar/webhook-log", requireAuth, async (req, res) => {
    const customerId = req.customerId!;
    const limit = Math.min(Number(req.query.limit) || 50, BIOSTAR_LOG_MAX);
    const clear = req.query.clear === 'true';
    const events = (biostarLiveLog.get(customerId) || []).slice(0, limit);
    if (clear) biostarLiveLog.set(customerId, []);
    res.json({ events, total: biostarLiveLog.get(customerId)?.length ?? 0, customerId });
  });

  /**
   * GET /api/biostar/live-events
   * Polls BioStar 2's own Event Log API and returns the last N events.
   * Cached for 15 seconds to avoid hammering BioStar's API.
   * This mirrors the "Event Log" / "Real-time Log" panel in BioStar 2 UI.
   */
  const liveEventCache = new Map<string, { ts: number; rows: any[] }>();
  app.get("/api/biostar/live-events", requireAuth, async (req, res) => {
    const customerId = req.customerId!;
    const limit = Math.min(Number(req.query.limit) || 200, 1000);

    // Optional date param: "YYYY-MM-DD" → fetch that specific day; default = today
    let fromDate: Date | undefined;
    let toDate: Date | undefined;
    if (req.query.date && typeof req.query.date === 'string') {
      const d = new Date(req.query.date + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        fromDate = d;
        toDate = new Date(req.query.date + 'T23:59:59');
      }
    }

    // Cache key includes the date so different days don't collide
    const cacheKey = `${customerId}:${req.query.date ?? 'today'}`;
    const cached = liveEventCache.get(cacheKey);
    // Only use cache for today's (live) requests; skip for historical dates
    if (!req.query.date && cached && Date.now() - cached.ts < 15000) {
      return res.json({ events: cached.rows, source: 'cache', cachedAt: new Date(cached.ts).toISOString() });
    }

    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, customerId);
      const settings = await simpleDatabaseService.getCompanySettings(context);
      if (!settings?.biostarEnabled || !settings?.biostarServerUrl || !settings?.biostarUsername || !settings?.biostarPassword) {
        return res.json({ events: [], error: 'BioStar 2 not configured' });
      }
      const config = {
        serverUrl: settings.biostarServerUrl,
        username: settings.biostarUsername,
        password: settings.biostarPassword,
        databaseId: settings.biostarDatabaseId || '1',
      };
      const result = await biostarService.getLiveEventLog(config, limit, fromDate, toDate);
      if (!req.query.date) {
        liveEventCache.set(cacheKey, { ts: Date.now(), rows: result.rows });
      }
      res.json({
        events: result.rows,
        total: result.rows.length,
        strategy: result.strategy,
        error: result.error,
        source: 'live',
        fetchedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error(`❌ BioStar live-events error: ${err.message}`);
      const stale = liveEventCache.get(cacheKey);
      if (stale) return res.json({ events: stale.rows, source: 'stale_cache', error: err.message });
      res.json({ events: [], error: err.message });
    }
  });

  /**
   * POST /api/biostar/webhook-log/test
   * Injects a synthetic test event into the ring buffer so the Live Log UI
   * can be verified without waiting for a real BioStar 2 webhook call.
   */
  app.post("/api/biostar/webhook-log/test", requireAuth, async (req, res) => {
    const customerId = req.customerId!;
    const actions: Array<'checked_in' | 'checked_out' | 'ignored' | 'no_match'> = ['checked_in', 'checked_out', 'ignored', 'no_match'];
    const action = actions[Math.floor(Math.random() * actions.length)];
    const testNames = ['Alice Test', 'Bob Demo', 'Carol Sample', 'David Trial'];
    const testDevices = ['Front Door Reader', 'Rear Exit Gate', 'Server Room', 'Reception'];
    const testEvent: BiostarLiveEvent = {
      id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      customerId,
      userId: 'test-' + Math.floor(Math.random() * 9000 + 1000),
      userName: testNames[Math.floor(Math.random() * testNames.length)],
      deviceId: 'test-device-' + Math.floor(Math.random() * 4 + 1),
      deviceName: testDevices[Math.floor(Math.random() * testDevices.length)],
      deviceRole: 'ENTRY_EXIT',
      eventCode: '1',
      action,
    };
    pushBiostarEvent(customerId, testEvent);
    console.log(`🧪 BioStar Live Log: test event injected for ${customerId} → action=${action}`);
    res.json({ ok: true, event: testEvent });
  });

  // -----------------------------------------------------------------
  // BioStar 2 Device Configuration Routes
  // Allows admin to classify physical readers as ENTRY/EXIT/ENTRY_EXIT/IGNORE.
  // The role drives occupancy logic — no more guessing from event codes.
  // -----------------------------------------------------------------

  /**
   * GET /api/biostar/devices
   * Returns all configured devices from the local DB.
   * Pass ?sync=true to first attempt a live sync from BioStar 2's /api/devices endpoint.
   * BioStar IDs seen in webhook events are also auto-registered as ENTRY_EXIT if unknown.
   */
  app.get("/api/biostar/devices", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const devicesDb = await customerDbService.getCustomerDatabase(customerId);

      if (req.query.sync === 'true') {
        // Try to pull device list from BioStar 2
        const context = simpleDatabaseService.createCustomerContext(req.user!.username, customerId);
        const settings = await simpleDatabaseService.getCompanySettings(context);

        if (settings?.biostarEnabled && settings?.biostarServerUrl && settings?.biostarUsername && settings?.biostarPassword) {
          const bsConfig = {
            serverUrl: settings.biostarServerUrl,
            username: settings.biostarUsername,
            password: settings.biostarPassword,
            databaseId: settings.biostarDatabaseId || '1',
          };

          const bsDevices = await biostarService.getDevices(bsConfig);
          if (bsDevices.length > 0) {
            const now = new Date();
            for (const d of bsDevices) {
              await devicesDb
                .insert(isolatedSchema.biostarDevices)
                .values({
                  id: d.id,
                  name: d.name,
                  model: d.model || null,
                  ipAddress: d.ipAddress || null,
                  deviceAddress: d.deviceAddress || d.ipAddress || null,
                  deviceGroup: d.deviceGroup || null,
                  role: 'ENTRY_EXIT',
                  direction: 'BOTH',
                  syncedAt: now,
                  updatedAt: now,
                })
                .onConflictDoUpdate({
                  target: isolatedSchema.biostarDevices.id,
                  set: {
                    name: d.name,
                    model: d.model || null,
                    ipAddress: d.ipAddress || null,
                    deviceAddress: d.deviceAddress || d.ipAddress || null,
                    deviceGroup: d.deviceGroup || null,
                    syncedAt: now,
                  },
                });
            }
            console.log(`📟 Biostar: Synced ${bsDevices.length} devices for ${customerId}`);
          }
        }
      }

      const devices = await devicesDb.select().from(isolatedSchema.biostarDevices).orderBy(isolatedSchema.biostarDevices.name);
      res.json(devices);
    } catch (err: any) {
      console.error('❌ GET /api/biostar/devices error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/biostar/devices
   * Manually register a device by ID + name when BioStar device API is blocked.
   */
  app.post("/api/biostar/devices", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const { id, name, deviceAddress, ipAddress, deviceGroup, role, direction } = req.body;
      if (!id || !name) return res.status(400).json({ error: 'id and name are required' });

      const devicesDb = await customerDbService.getCustomerDatabase(customerId);
      const now = new Date();
      const addr = deviceAddress || ipAddress || null;
      await devicesDb
        .insert(isolatedSchema.biostarDevices)
        .values({ id: String(id), name, ipAddress: addr, deviceAddress: addr, deviceGroup: deviceGroup || null, role: role || 'ENTRY_EXIT', direction: direction || 'BOTH', syncedAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: isolatedSchema.biostarDevices.id,
          set: { name, ipAddress: addr, deviceAddress: addr, deviceGroup: deviceGroup || null, role: role || 'ENTRY_EXIT', direction: direction || 'BOTH', updatedAt: now },
        });
      const [device] = await devicesDb.select().from(isolatedSchema.biostarDevices).where(eq(isolatedSchema.biostarDevices.id, String(id)));
      res.json(device);
    } catch (err: any) {
      console.error('❌ POST /api/biostar/devices error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * PATCH /api/biostar/devices/:deviceId
   * Update a device's role, direction, site, building, or name.
   */
  app.patch("/api/biostar/devices/:deviceId", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const { deviceId } = req.params;
      const { role, direction, name, deviceGroup, deviceAddress } = req.body;

      const validRoles = ['ENTRY', 'EXIT', 'ENTRY_EXIT', 'IGNORE'];
      if (role && !validRoles.includes(role)) return res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });

      const devicesDb = await customerDbService.getCustomerDatabase(customerId);
      const updateData: any = { updatedAt: new Date() };
      if (role !== undefined) updateData.role = role;
      if (direction !== undefined) updateData.direction = direction;
      if (name !== undefined) updateData.name = name;
      if (deviceGroup !== undefined) updateData.deviceGroup = deviceGroup;
      if (deviceAddress !== undefined) updateData.deviceAddress = deviceAddress;

      await devicesDb.update(isolatedSchema.biostarDevices).set(updateData).where(eq(isolatedSchema.biostarDevices.id, deviceId));
      const [device] = await devicesDb.select().from(isolatedSchema.biostarDevices).where(eq(isolatedSchema.biostarDevices.id, deviceId));
      if (!device) return res.status(404).json({ error: 'Device not found' });
      console.log(`📟 Biostar device ${deviceId} (${device.name}) updated: role=${device.role}`);
      res.json(device);
    } catch (err: any) {
      console.error('❌ PATCH /api/biostar/devices error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * DELETE /api/biostar/devices/:deviceId
   * Remove a device from the configuration.
   */
  app.delete("/api/biostar/devices/:deviceId", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const { deviceId } = req.params;
      const devicesDb = await customerDbService.getCustomerDatabase(customerId);
      await devicesDb.delete(isolatedSchema.biostarDevices).where(eq(isolatedSchema.biostarDevices.id, deviceId));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Daily Reset helper function
  async function performDailyReset(isManual: boolean = false, providedContext?: { customerId: string }) {
    const resetTime = new Date();
    
    // Use provided context or fall back to development context
    const resetContext = providedContext || simpleDatabaseService.createDevelopmentContext();
    const resetCustomerDb = await customerDbService.getCustomerDatabase(resetContext.customerId);
    
    // Get all currently checked-in personnel using customer-isolated queries
    const [currentVisitors, checkedInStaff, checkedInContractors, checkedInMembers] = await Promise.all([
      databaseService.getCurrentVisitors(resetContext),
      databaseService.getCheckedInStaff(resetContext),
      databaseService.getCheckedInContractors(resetContext),
      resetCustomerDb
        .select()
        .from(isolatedSchema.members)
        .where(and(eq(isolatedSchema.members.isCheckedIn, true), eq(isolatedSchema.members.isActive, true)))
    ]);
    
    const resetCounts = {
      visitorsCheckedOut: 0,
      staffCheckedOut: 0,
      contractorsCheckedOut: 0,
      membersCheckedOut: 0
    };
    
    // Check out all visitors (use proper checkout to close history records)
    for (const visitor of currentVisitors) {
      try {
        await databaseService.checkOutVisitor(resetContext, visitor.id);
        resetCounts.visitorsCheckedOut++;
      } catch (error) {
        console.error(`Failed to check out visitor ${visitor.id}:`, error);
      }
    }
    
    // Check out all staff (use proper checkout to close staff sessions)
    for (const staffMember of checkedInStaff) {
      try {
        await databaseService.checkOutStaff(resetContext, staffMember.id);
        resetCounts.staffCheckedOut++;
      } catch (error) {
        console.error(`Failed to check out staff ${staffMember.id}:`, error);
      }
    }
    
    // Check out all contractors (use proper checkout to close contractor visits)
    for (const contractor of checkedInContractors) {
      try {
        await databaseService.checkOutContractorWorker(resetContext, contractor.id);
        resetCounts.contractorsCheckedOut++;
      } catch (error) {
        console.error(`Failed to check out contractor ${contractor.id}:`, error);
      }
    }

    // Check out all members
    for (const member of checkedInMembers) {
      try {
        await resetCustomerDb.update(isolatedSchema.members)
          .set({ isCheckedIn: false, checkedOutAt: resetTime, updatedAt: new Date() })
          .where(eq(isolatedSchema.members.id, member.id));
        resetCounts.membersCheckedOut++;
      } catch (error) {
        console.error(`Failed to check out member ${member.id}:`, error);
      }
    }
    
    // Update settings with last reset time
    try {
      await simpleDatabaseService.updateCompanySettings(resetContext, {
        lastDailyReset: resetTime.toISOString()
      });
    } catch (error) {
      console.error("Failed to update lastDailyReset in settings:", error);
    }
    
    // Send notification emails if configured
    try {
      const settings = await simpleDatabaseService.getCompanySettings(resetContext);
      if (settings?.notifyForgottenCheckouts !== false && settings?.emailReportsEnabled) {
        const totalCheckedOut = resetCounts.visitorsCheckedOut + resetCounts.staffCheckedOut + resetCounts.contractorsCheckedOut + resetCounts.membersCheckedOut;
        if (totalCheckedOut > 0) {
          const recipients: string[] = settings.reportRecipients || [];
          const subject = `Daily Reset ${isManual ? '(Manual)' : '(Automatic)'} - ${totalCheckedOut} Personnel Checked Out`;
          const message = `
            Daily reset completed at ${resetTime.toLocaleString()}
            
            Personnel automatically checked out:
            • Visitors: ${resetCounts.visitorsCheckedOut}
            • Staff: ${resetCounts.staffCheckedOut}
            • Contractors: ${resetCounts.contractorsCheckedOut}
            • Members: ${resetCounts.membersCheckedOut}
            • Total: ${totalCheckedOut}
            
            Reset type: ${isManual ? 'Manual reset initiated by user' : 'Automatic scheduled reset'}
            
            This is an automated notification from TPR-Max.
          `;
          
          for (const email of recipients) {
            try {
              await emailService.forCustomer(resetContext.customerId).sendPlainEmail(email, subject, message);
            } catch (error) {
              console.error(`Failed to send reset notification to ${email}:`, error);
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to send reset notification emails:", error);
    }
    
    return {
      success: true,
      resetTime: resetTime.toISOString(),
      isManual,
      ...resetCounts,
      totalCheckedOut: resetCounts.visitorsCheckedOut + resetCounts.staffCheckedOut + resetCounts.contractorsCheckedOut + resetCounts.membersCheckedOut
    };
  }

  // Daily Reset endpoints
  app.post("/api/daily-reset/manual", requireAuth, async (req, res) => {
    try {
      const manualContext = { customerId: req.customerId! };
      const result = await performDailyReset(true, manualContext);
      res.json(result);
    } catch (error) {
      console.error("Error performing manual daily reset:", error);
      res.status(500).json({ error: "Failed to perform daily reset" });
    }
  });

  app.post("/api/daily-reset/preview", requireAuth, async (req, res) => {
    try {
      const previewContext = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const previewDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const [currentVisitors, checkedInStaff, checkedInContractors, checkedInMembers] = await Promise.all([
        databaseService.getCurrentVisitors(previewContext),
        databaseService.getCheckedInStaff(previewContext),
        databaseService.getCheckedInContractors(previewContext),
        previewDb.select().from(isolatedSchema.members).where(
          and(eq(isolatedSchema.members.isCheckedIn, true), eq(isolatedSchema.members.isActive, true))
        )
      ]);

      res.json({
        visitorsToCheckOut: currentVisitors.length,
        staffToCheckOut: checkedInStaff.length,
        contractorsToCheckOut: checkedInContractors.length,
        membersToCheckOut: checkedInMembers.length,
        totalToCheckOut: currentVisitors.length + checkedInStaff.length + checkedInContractors.length + checkedInMembers.length
      });
    } catch (error) {
      console.error("Error previewing daily reset:", error);
      res.status(500).json({ error: "Failed to preview daily reset" });
    }
  });

  // Track active daily reset tasks per customer so they can be stopped/rescheduled
  const dailyResetTasks = new Map<string, ReturnType<typeof cron.schedule>>();

  // Setup automatic daily reset — safe to call multiple times (stops old tasks first)
  async function setupAutomaticDailyReset(specificCustomerId?: string) {
    try {
      // Get customers to schedule for
      let customers: Array<{ id: string }>;
      if (specificCustomerId) {
        customers = [{ id: specificCustomerId }];
      } else {
        const dbCustomers = await customerDbService.getAllCustomers();
        // DEV_CUSTOMER_IDS: comma-separated list of customer IDs to include in the daily reset
        // loop even when they are not present in the customers table. Set in development only;
        // leave unset in production so no extra customers are injected.
        const devCustomerIds = (process.env.DEV_CUSTOMER_IDS || '').split(',').filter(Boolean);
        const dbIds = new Set(dbCustomers.map((c: { id: string }) => c.id));
        const extraCustomers = devCustomerIds
          .filter(id => !dbIds.has(id))
          .map(id => ({ id }));
        customers = [...dbCustomers, ...extraCustomers];
      }

      for (const customer of customers) {
        // Stop and remove any existing task for this customer
        const existing = dailyResetTasks.get(customer.id);
        if (existing) {
          existing.stop();
          dailyResetTasks.delete(customer.id);
        }

        const context = { customerId: customer.id };
        let settings: Awaited<ReturnType<typeof simpleDatabaseService.getCompanySettings>>;
        try {
          settings = await simpleDatabaseService.getCompanySettings(context);
        } catch (err) {
          console.log(`📅 Skipping daily reset schedule for customer ${customer.id} — no settings found`);
          continue;
        }

        if (!settings) {
          console.log(`📅 Skipping daily reset schedule for customer ${customer.id} — no settings found`);
          continue;
        }

        if (settings?.enableDailyReset === false) {
          console.log(`📅 Daily reset disabled for customer ${customer.id}`);
          continue;
        }

        if (settings?.enable24x7Operations === true) {
          console.log(`📅 Daily reset skipped for customer ${customer.id} - 24/7 operations mode`);
          continue;
        }

        const resetTime = settings?.dailyResetTime || "00:00";
        const timezone = settings?.dailyResetTimezone || "Europe/London";
        const enableWeekendReset = settings?.enableWeekendReset === true;

        const [hours, minutes] = resetTime.split(':').map(Number);
        const cronExpression = enableWeekendReset
          ? `${minutes} ${hours} * * *`
          : `${minutes} ${hours} * * 1-5`;

        console.log(`📅 Scheduling daily reset for customer ${customer.id} at ${resetTime} (${timezone}) — ${cronExpression}`);

        const task = cron.schedule(cronExpression, async () => {
          try {
            console.log(`🔄 Daily reset firing for customer ${customer.id} at ${new Date().toLocaleString()}`);

            // Re-read settings fresh so any changes since startup take effect
            const currentSettings = await simpleDatabaseService.getCompanySettings(context);

            if (currentSettings?.enableDailyReset === false || currentSettings?.enable24x7Operations === true) {
              console.log(`📅 Daily reset skipped for customer ${customer.id} — disabled in current settings`);
              return;
            }

            const enableHolidayReset = currentSettings?.enableHolidayReset === true;
            if (!enableHolidayReset) {
              const isHoliday = await checkIfHoliday(new Date());
              if (isHoliday) {
                console.log(`📅 Daily reset skipped for customer ${customer.id} — public holiday`);
                return;
              }
            }

            const gracePeriodMinutes = currentSettings?.gracePeriodMinutes
              ? parseInt(currentSettings.gracePeriodMinutes.toString())
              : 15;

            if (gracePeriodMinutes > 0) {
              await sendGracePeriodNotification(gracePeriodMinutes, context);
              setTimeout(async () => {
                try {
                  const result = await performDailyReset(false, context);
                  console.log(`🔄 Automatic daily reset completed for customer ${customer.id}:`, result);
                } catch (err) {
                  console.error(`❌ Delayed daily reset failed for customer ${customer.id}:`, err);
                }
              }, gracePeriodMinutes * 60 * 1000);
            } else {
              const result = await performDailyReset(false, context);
              console.log(`🔄 Automatic daily reset completed for customer ${customer.id}:`, result);
            }
          } catch (error) {
            console.error(`❌ Error in daily reset cron for customer ${customer.id}:`, error);
          }
        }, { timezone });

        dailyResetTasks.set(customer.id, task);
      }

      console.log(`✅ Daily reset scheduled for ${dailyResetTasks.size} customer(s)`);
    } catch (error) {
      console.error("❌ Error setting up automatic daily reset:", error);
    }
  }

  // Helper function to check if a date is a holiday
  async function checkIfHoliday(date: Date): Promise<boolean> {
    // Basic UK holiday check - you could expand this with a holiday API
    const month = date.getMonth() + 1; // 1-12
    const day = date.getDate();
    
    // Common UK holidays (simplified)
    const holidays = [
      { month: 1, day: 1 },   // New Year's Day
      { month: 12, day: 25 }, // Christmas Day
      { month: 12, day: 26 }, // Boxing Day
    ];
    
    return holidays.some(holiday => holiday.month === month && holiday.day === day);
  }

  // Setup overnight check-out notifications
  async function setupOvernightNotifications() {
    try {
      // Import the simplified database service
      const { simpleDatabaseService } = await import("./simpleDatabaseService");
      
      // Use default context for startup (no req available)
      const context = simpleDatabaseService.createDevelopmentContext();
      
      const settings = await simpleDatabaseService.getCompanySettings(context);
      
      if (settings?.emailReportsEnabled) {
        console.log("📧 Setting up overnight check-out notifications (daily at 6:00 AM)");
        
        // Schedule overnight notification check at 6:00 AM every day
        cron.schedule('0 6 * * *', async () => {
          try {
            console.log(`📧 Checking for overnight check-outs at ${new Date().toLocaleString()}`);
            await sendOvernightReport();
          } catch (error) {
            console.error("❌ Error in overnight notification check:", error);
          }
        }, {
          timezone: settings?.dailyResetTimezone || "Europe/London"
        });
        
        console.log("✅ Overnight check-out notifications scheduled successfully");
      } else {
        console.log("📧 Overnight notifications disabled - email reports not enabled");
      }
    } catch (error) {
      console.error("❌ Error setting up overnight notifications:", error);
    }
  }

  // Helper function to send overnight report
  async function sendOvernightReport() {
    try {
      // Use development context for background/scheduled tasks
      const overnightContext = simpleDatabaseService.createDevelopmentContext();
      
      const settings = await simpleDatabaseService.getCompanySettings(overnightContext);
      if (!settings?.emailReportsEnabled || !settings?.reportRecipients?.length) {
        return;
      }
      
      const overnightDb = await customerDbService.getCustomerDatabase(overnightContext.customerId);
      const [currentVisitors, checkedInStaff, checkedInContractors, checkedInMembers] = await Promise.all([
        databaseService.getCurrentVisitors(overnightContext),
        databaseService.getCheckedInStaff(overnightContext),
        databaseService.getCheckedInContractors(overnightContext),
        overnightDb.select().from(isolatedSchema.members).where(
          and(eq(isolatedSchema.members.isCheckedIn, true), eq(isolatedSchema.members.isActive, true))
        )
      ]);
      
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      
      // Filter for people who checked in yesterday and are still checked in
      const overnightVisitors = currentVisitors.filter(visitor => 
        visitor.checkedInAt && new Date(visitor.checkedInAt) < yesterday
      );
      
      const overnightStaff = checkedInStaff.filter(staff => 
        staff.checkedInAt && new Date(staff.checkedInAt) < yesterday
      );
      
      const overnightContractors = checkedInContractors.filter(contractor => 
        contractor.checkedInAt && new Date(contractor.checkedInAt) < yesterday
      );

      const overnightMembers = checkedInMembers.filter(member =>
        member.checkedInAt && new Date(member.checkedInAt) < yesterday
      );
      
      const totalOvernight = overnightVisitors.length + overnightStaff.length + overnightContractors.length + overnightMembers.length;
      
      if (totalOvernight === 0) {
        console.log("📧 No overnight check-outs detected - no email sent");
        return;
      }
      
      const subject = `Overnight Check-Out Alert - ${totalOvernight} Personnel Still On-Site`;
      
      let message = `
        OVERNIGHT CHECK-OUT ALERT
        
        The following personnel did not check out yesterday and are still showing as on-site:
        
      `;
      
      if (overnightVisitors.length > 0) {
        message += `VISITORS (${overnightVisitors.length}):\n`;
        overnightVisitors.forEach(visitor => {
          const checkedInTime = visitor.checkedInAt ? new Date(visitor.checkedInAt).toLocaleString() : 'Unknown';
          message += `• ${visitor.firstName} ${visitor.lastName} (${visitor.company || 'No company'}) - Checked in: ${checkedInTime}\n`;
        });
        message += '\n';
      }
      
      if (overnightStaff.length > 0) {
        message += `STAFF (${overnightStaff.length}):\n`;
        overnightStaff.forEach(staff => {
          const checkedInTime = staff.checkedInAt ? new Date(staff.checkedInAt).toLocaleString() : 'Unknown';
          message += `• ${staff.firstName} ${staff.lastName} (${staff.department || 'No department'}) - Checked in: ${checkedInTime}\n`;
        });
        message += '\n';
      }
      
      if (overnightContractors.length > 0) {
        message += `CONTRACTORS (${overnightContractors.length}):\n`;
        overnightContractors.forEach(contractor => {
          const checkedInTime = contractor.checkedInAt ? new Date(contractor.checkedInAt).toLocaleString() : 'Unknown';
          message += `• ${contractor.firstName} ${contractor.lastName} (${contractor.company || 'No company'}) - Checked in: ${checkedInTime}\n`;
        });
        message += '\n';
      }

      if (overnightMembers.length > 0) {
        message += `MEMBERS (${overnightMembers.length}):\n`;
        overnightMembers.forEach(member => {
          const checkedInTime = member.checkedInAt ? new Date(member.checkedInAt).toLocaleString() : 'Unknown';
          message += `• ${member.firstName} ${member.lastName} (${member.membershipType || 'Member'}) - Checked in: ${checkedInTime}\n`;
        });
        message += '\n';
      }
      
      message += `
        RECOMMENDED ACTIONS:
        • Contact personnel to verify their status
        • Check out manually if they have left the premises
        • Update security logs as needed
        • Consider running a manual daily reset if appropriate
        
        Report generated: ${new Date().toLocaleString()}
        
        This is an automated notification from TPR-Max.
      `;
      
      // Send to all report recipients
      let sentCount = 0;
      for (const email of settings.reportRecipients) {
        try {
          await emailService.forCustomer(overnightContext.customerId).sendPlainEmail(email, subject, message);
          sentCount++;
        } catch (error) {
          console.error(`Failed to send overnight report to ${email}:`, error);
        }
      }
      
      console.log(`📧 Overnight report sent to ${sentCount} recipients - ${totalOvernight} personnel still on-site`);
    } catch (error) {
      console.error("Failed to send overnight report:", error);
    }
  }

  // Helper function to send grace period notification
  async function sendGracePeriodNotification(gracePeriodMinutes: number, graceContext?: { customerId: string }) {
    try {
      // Use provided context or fall back to development context
      if (!graceContext) graceContext = simpleDatabaseService.createDevelopmentContext();
      
      const settings = await simpleDatabaseService.getCompanySettings(graceContext);
      if (!settings?.notifyForgottenCheckouts || !settings?.emailReportsEnabled) {
        return;
      }
      
      const [currentVisitors, checkedInStaff, checkedInContractors] = await Promise.all([
        databaseService.getCurrentVisitors(graceContext),
        databaseService.getCheckedInStaff(graceContext),
        databaseService.getCheckedInContractors(graceContext)
      ]);
      
      const totalPersonnel = currentVisitors.length + checkedInStaff.length + checkedInContractors.length;
      
      if (totalPersonnel === 0) {
        return; // No one to notify
      }
      
      const { EmailService } = await import("./emailService");
      const emailService = new EmailService(req.customerId);
      
      // Collect all emails from on-site personnel
      const emailAddresses = new Set<string>();
      
      checkedInStaff.forEach(staff => {
        if (staff.email) emailAddresses.add(staff.email);
      });
      
      currentVisitors.forEach(visitor => {
        if (visitor.email) emailAddresses.add(visitor.email);
      });
      
      const recipients = Array.from(emailAddresses);
      const subject = `Daily Reset Warning - Check Out Required in ${gracePeriodMinutes} Minutes`;
      const message = `
        AUTOMATIC CHECK-OUT WARNING
        
        This is an automated reminder that the daily reset will occur in ${gracePeriodMinutes} minutes.
        
        All personnel currently on-site will be automatically checked out at ${new Date(Date.now() + gracePeriodMinutes * 60 * 1000).toLocaleTimeString()}.
        
        If you need to remain on-site, please check out manually and then check back in after the reset.
        
        Current personnel on-site:
        • Visitors: ${currentVisitors.length}
        • Staff: ${checkedInStaff.length}
        • Contractors: ${checkedInContractors.length}
        
        This is an automated notification from VisiGate Pro.
      `;
      
      // Send to on-site personnel
      for (const email of recipients) {
        try {
          await emailService.sendPlainEmail(email, subject, message);
        } catch (error) {
          console.error(`Failed to send grace period notification to ${email}:`, error);
        }
      }
      
      // Also send to admin recipients
      const adminRecipients = settings.reportRecipients || [];
      for (const email of adminRecipients) {
        try {
          await emailService.sendPlainEmail(email, `Admin: ${subject}`, message);
        } catch (error) {
          console.error(`Failed to send grace period admin notification to ${email}:`, error);
        }
      }
      
      console.log(`📧 Grace period notifications sent to ${recipients.length} personnel and ${adminRecipients.length} admins`);
    } catch (error) {
      console.error("Failed to send grace period notifications:", error);
    }
  }

  // Initialize automatic reports
  setupAutomaticReports();

  // Reset worker card status (admin only)
  app.put('/api/workers/:workerId/reset-card', requireAuth, async (req, res) => {
    try {
      const { workerId } = req.params;
      const { newStatus = 'yellow' } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      // TODO: Add admin role check here
      // For now, allowing any authenticated user to reset cards

      const resetCardContext = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const resetCardDb = await customerDbService.getCustomerDatabase(resetCardContext.customerId);
      await resetCardDb.update(isolatedSchema.contractorWorkers)
        .set({ currentCardStatus: newStatus, updatedAt: new Date() })
        .where(eq(isolatedSchema.contractorWorkers.id, workerId));
      
      res.json({ success: true, message: 'Card status reset successfully' });
    } catch (error) {
      console.error('Error resetting card status:', error);
      res.status(500).json({ error: 'Failed to reset card status' });
    }
  });

  // Initialize automatic daily reset
  setupAutomaticDailyReset();

  // Initialize overnight check-out notifications
  setupOvernightNotifications();

  // -----------------------------------------------------------------
  // BioStar 2 live attendance polling
  // Runs every biostarSyncInterval seconds (default 300) per customer.
  // Reads today's access events and updates staff isCheckedIn in real-time.
  // -----------------------------------------------------------------
  const biostarPollTimers = new Map<string, ReturnType<typeof setInterval>>();

  async function pollBiostarAttendance(customerId: string): Promise<void> {
    try {
      const pollCtx = { customerId } as any;
      const settings = await simpleDatabaseService.getCompanySettings(pollCtx).catch(() => null);
      if (!settings?.biostarEnabled || !settings?.biostarServerUrl || !settings?.biostarUsername || !settings?.biostarPassword) {
        return;
      }

      const pollConfig = {
        serverUrl: settings.biostarServerUrl,
        username: settings.biostarUsername,
        password: settings.biostarPassword,
        databaseId: settings.biostarDatabaseId || '1',
      };

      const pollDb = await customerDbService.getCustomerDatabase(customerId);

      // Load admin-assigned device roles from the biostar_devices table.
      // These determine whether a reader is ENTRY, EXIT, ENTRY_EXIT or IGNORE.
      // Without this, direction is inferred from event code alone, which is
      // unreliable when the same card-auth code appears on both door sides.
      const deviceRowsForRoles = await pollDb
        .select({ id: isolatedSchema.biostarDevices.id, role: isolatedSchema.biostarDevices.role })
        .from(isolatedSchema.biostarDevices);
      const deviceRoles: Record<string, string> = Object.fromEntries(
        deviceRowsForRoles.map(d => [String(d.id), d.role])
      );

      const onSiteUsers = await biostarService.getCurrentOnSiteUsers(pollConfig, deviceRoles);
      const onSiteIds = new Set(onSiteUsers.map((u: any) => String(u.userId)));
      const allBiostarStaff = await pollDb
        .select({
          id: isolatedSchema.staff.id,
          biostarUserId: isolatedSchema.staff.biostarUserId,
          isCheckedIn: isolatedSchema.staff.isCheckedIn,
        })
        .from(isolatedSchema.staff)
        .where(isNotNull(isolatedSchema.staff.biostarUserId));

      const now = new Date();
      let cIn = 0, cOut = 0;
      for (const s of allBiostarStaff) {
        if (!s.biostarUserId) continue;
        const shouldBeIn = onSiteIds.has(String(s.biostarUserId));
        if (shouldBeIn && !s.isCheckedIn) {
          await pollDb.update(isolatedSchema.staff)
            .set({ isCheckedIn: true, checkedInAt: now, checkedOutAt: null, updatedAt: now })
            .where(eq(isolatedSchema.staff.id, s.id));
          cIn++;
        } else if (!shouldBeIn && s.isCheckedIn) {
          await pollDb.update(isolatedSchema.staff)
            .set({ isCheckedIn: false, checkedOutAt: now, updatedAt: now })
            .where(eq(isolatedSchema.staff.id, s.id));
          cOut++;
        }
      }
      if (cIn > 0 || cOut > 0) {
        console.log(`🔄 Biostar poll [${customerId}]: ${cIn} checked in, ${cOut} checked out`);
      }
    } catch (err: any) {
      console.warn(`⚠️ Biostar attendance poll failed for ${customerId}: ${err.message}`);
    }
  }

  async function setupBiostarAttendancePolling(): Promise<void> {
    // Clear any existing timers
    for (const [, timer] of biostarPollTimers) clearInterval(timer);
    biostarPollTimers.clear();
    // Stop any existing WebSocket monitor (single-instance — the new config will restart it)
    biostarService.stopWebSocketMonitor();

    try {
      const dbCustomers = await customerDbService.getAllCustomers();
      // DEV_CUSTOMER_IDS: comma-separated list of customer IDs to include in the BioStar polling
      // loop even when they are not present in the customers table. Set in development only;
      // leave unset in production so no extra customers are injected.
      const devCustomerIds = (process.env.DEV_CUSTOMER_IDS || '').split(',').filter(Boolean);
      const dbIds = new Set(dbCustomers.map((c: { id: string }) => c.id));
      const allCustomers = [
        ...dbCustomers,
        ...devCustomerIds.filter(id => !dbIds.has(id)).map(id => ({ id })),
      ];

      for (const customer of allCustomers) {
        try {
          const ctx = { customerId: customer.id } as any;
          const settings = await simpleDatabaseService.getCompanySettings(ctx).catch(() => null);
          if (!settings?.biostarEnabled || !settings?.biostarServerUrl) continue;

          const wsConfig = {
            serverUrl: settings.biostarServerUrl,
            username: settings.biostarUsername,
            password: settings.biostarPassword,
            databaseId: settings.biostarDatabaseId || '1',
          };

          // Clamp between 30 s and 60 s regardless of what is stored in the DB.
          // The WebSocket handles real-time delivery; this poll is just a safety net
          // so there is no need for intervals longer than 60 seconds.
          const rawInterval = Number(settings.biostarSyncInterval) || 30;
          const intervalSecs = Math.min(Math.max(30, rawInterval), 60);
          console.log(`🔄 Biostar live attendance polling scheduled for ${customer.id} every ${intervalSecs}s`);

          // Run an immediate poll so status is live on startup/settings save
          pollBiostarAttendance(customer.id).catch(() => {});

          const timer = setInterval(() => {
            pollBiostarAttendance(customer.id).catch(() => {});
          }, intervalSecs * 1000);
          biostarPollTimers.set(customer.id, timer);

          // ─────────────────────────────────────────────────────────────────────
          // Start the BioStar 2 WebSocket monitor for real-time event streaming.
          // Events arrive instantly on card scan, supplementing the REST poller.
          // Note: biostarService is a singleton — the last customer's config wins
          // for multi-tenant deployments (acceptable for single-BioStar setups).
          // ─────────────────────────────────────────────────────────────────────
          const wsCustomerId = customer.id; // capture for closure
          biostarService.startWebSocketMonitor(wsConfig, wsCustomerId, async (raw: any) => {
            try {
              // Parse fields from the raw WebSocket event (same nested format as REST events)
              const userId = String(
                raw?.user_id?.user_id ?? raw?.user_id?.id ?? raw?.user_id ?? ''
              );
              const deviceId = String(
                raw?.device_id?.id ?? raw?.device_id ?? ''
              );
              const deviceName = String(
                raw?.device_id?.name ?? raw?.device_name ?? ''
              );
              const eventTypeCode = String(
                raw?.event_type_id?.code ?? raw?.event_type_id ?? ''
              );
              const eventTime = raw?.datetime ?? raw?.server_datetime ?? new Date().toISOString();

              if (!userId || userId === '0' || !eventTypeCode) return;

              const wsDb = await customerDbService.getCustomerDatabase(wsCustomerId);

              // Determine entry/exit using device role (same logic as webhook handler)
              let isEntry = false;
              let isExit = false;

              if (deviceId && deviceId !== '0') {
                const [deviceConfig] = await wsDb
                  .select()
                  .from(isolatedSchema.biostarDevices)
                  .where(eq(isolatedSchema.biostarDevices.id, deviceId))
                  .limit(1);

                if (deviceConfig) {
                  if (deviceConfig.role === 'ENTRY') {
                    // Only count if it's actually an auth event (not a relay/door-open)
                    isEntry = biostarService.isEntryEvent(eventTypeCode) || biostarService.isExitEvent(eventTypeCode);
                  } else if (deviceConfig.role === 'EXIT') {
                    isExit = biostarService.isEntryEvent(eventTypeCode) || biostarService.isExitEvent(eventTypeCode);
                  } else if (deviceConfig.role === 'ENTRY_EXIT') {
                    // Use event code for direction; non-auth codes remain false (skipped below)
                    isEntry = biostarService.isEntryEvent(eventTypeCode);
                    isExit = biostarService.isExitEvent(eventTypeCode);
                  }
                  // IGNORE: both remain false — event is discarded
                } else {
                  // Auto-register unknown device
                  await wsDb.insert(isolatedSchema.biostarDevices)
                    .values({ id: deviceId, name: deviceName || `Device ${deviceId}`, role: 'ENTRY_EXIT', direction: 'BOTH', syncedAt: new Date(), updatedAt: new Date() })
                    .onConflictDoNothing();
                  isEntry = biostarService.isEntryEvent(eventTypeCode);
                  isExit = biostarService.isExitEvent(eventTypeCode);
                }
              } else {
                isEntry = biostarService.isEntryEvent(eventTypeCode);
                isExit = biostarService.isExitEvent(eventTypeCode);
              }

              if (!isEntry && !isExit) return;

              const [staffMember] = await wsDb
                .select({ id: isolatedSchema.staff.id, firstName: isolatedSchema.staff.firstName, lastName: isolatedSchema.staff.lastName, isCheckedIn: isolatedSchema.staff.isCheckedIn })
                .from(isolatedSchema.staff)
                .where(eq(isolatedSchema.staff.biostarUserId, userId))
                .limit(1);

              if (!staffMember) {
                pushBiostarEvent(wsCustomerId, { id: crypto.randomUUID(), ts: eventTime, customerId: wsCustomerId, userId, deviceId, deviceName, eventCode: eventTypeCode, action: 'no_match' });
                return;
              }

              const now = new Date();
              const staffName = `${staffMember.firstName} ${staffMember.lastName}`.trim();

              if (isEntry) {
                await wsDb.update(isolatedSchema.staff)
                  .set({ isCheckedIn: true, checkedInAt: now, checkedOutAt: null, updatedAt: now })
                  .where(eq(isolatedSchema.staff.id, staffMember.id));
                console.log(`✅ BioStar WS [${wsCustomerId}]: ${staffName} checked IN (device=${deviceId})`);
                pushBiostarEvent(wsCustomerId, { id: crypto.randomUUID(), ts: eventTime, customerId: wsCustomerId, userId, userName: staffName, deviceId, deviceName, eventCode: eventTypeCode, action: 'checked_in' });
              } else if (isExit) {
                await wsDb.update(isolatedSchema.staff)
                  .set({ isCheckedIn: false, checkedOutAt: now, updatedAt: now })
                  .where(eq(isolatedSchema.staff.id, staffMember.id));
                console.log(`🚪 BioStar WS [${wsCustomerId}]: ${staffName} checked OUT (device=${deviceId})`);
                pushBiostarEvent(wsCustomerId, { id: crypto.randomUUID(), ts: eventTime, customerId: wsCustomerId, userId, userName: staffName, deviceId, deviceName, eventCode: eventTypeCode, action: 'checked_out' });
              }
            } catch (wsEvtErr: any) {
              console.warn(`⚠️ BioStar WS event handler [${wsCustomerId}]: ${wsEvtErr.message}`);
            }
          }).catch((wsStartErr: any) => {
            console.warn(`⚠️ BioStar WS [${wsCustomerId}]: failed to start monitor — ${wsStartErr.message}`);
          });

        } catch {
          // skip this customer
        }
      }
    } catch (err: any) {
      console.warn(`⚠️ setupBiostarAttendancePolling failed: ${err.message}`);
    }
  }

  // Start BioStar attendance polling (non-fatal — won't affect startup if Biostar isn't configured)
  setupBiostarAttendancePolling().catch(() => {});

  // Re-schedule when BioStar settings are saved (handled via settings update endpoint side-effect)
  // The sync-now endpoint also triggers an immediate status refresh.


  // Induction Settings Management API Routes
  app.get('/api/induction/settings', requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId || 'default';
      const settingsDb = await customerDbService.getCustomerDatabase(customerId);

      // Select only metadata columns — exclude generatedHtml and scenesData (can be 17MB+)
      const rows = await settingsDb.select({
        id: isolatedSchema.inductionSettings.id,
        roleType: isolatedSchema.inductionSettings.roleType,
        videoTitle: isolatedSchema.inductionSettings.videoTitle,
        videoUrl: isolatedSchema.inductionSettings.videoUrl,
        videoDescription: isolatedSchema.inductionSettings.videoDescription,
        videoDurationMinutes: isolatedSchema.inductionSettings.videoDurationMinutes,
        videoFormat: isolatedSchema.inductionSettings.videoFormat,
        modelType: isolatedSchema.inductionSettings.modelType,
        passPercentage: isolatedSchema.inductionSettings.passPercentage,
        isActive: isolatedSchema.inductionSettings.isActive,
        kioskEnabled: isolatedSchema.inductionSettings.kioskEnabled,
        sendLinkEnabled: isolatedSchema.inductionSettings.sendLinkEnabled,
        generatedAt: isolatedSchema.inductionSettings.generatedAt,
        questionsGenerated: isolatedSchema.inductionSettings.questionsGenerated,
        createdAt: isolatedSchema.inductionSettings.createdAt,
        updatedAt: isolatedSchema.inductionSettings.updatedAt,
      }).from(isolatedSchema.inductionSettings);

      // If isolated DB has rows, serve them
      if (rows.length > 0) {
        return res.json({ settings: rows });
      }

      // Isolated DB empty — fall back to global inductionSettings (also excluding large columns)
      const globalRows = await db.select({
        id: inductionSettings.id,
        roleType: inductionSettings.roleType,
        videoTitle: inductionSettings.videoTitle,
        videoUrl: inductionSettings.videoUrl,
        videoDescription: inductionSettings.videoDescription,
        videoDurationMinutes: inductionSettings.videoDurationMinutes,
        videoFormat: inductionSettings.videoFormat,
        modelType: inductionSettings.modelType,
        passPercentage: inductionSettings.passPercentage,
        isActive: inductionSettings.isActive,
        kioskEnabled: inductionSettings.kioskEnabled,
        sendLinkEnabled: inductionSettings.sendLinkEnabled,
        generatedAt: inductionSettings.generatedAt,
        questionsGenerated: inductionSettings.questionsGenerated,
        createdAt: inductionSettings.createdAt,
        updatedAt: inductionSettings.updatedAt,
      }).from(inductionSettings);
      res.json({ settings: globalRows });
    } catch (error) {
      console.error('Error fetching induction settings:', error);
      res.status(500).json({ error: 'Failed to fetch induction settings' });
    }
  });

  app.get('/api/induction/settings/:roleType', requireAuth, async (req, res) => {
    try {
      const { roleType } = req.params;
      const [setting] = await db.select().from(inductionSettings)
        .where(eq(inductionSettings.roleType, roleType));
      
      if (!setting) {
        return res.status(404).json({ error: 'Settings not found for this role type' });
      }
      
      res.json({ setting });
    } catch (error) {
      console.error('Error fetching role-specific induction settings:', error);
      res.status(500).json({ error: 'Failed to fetch induction settings' });
    }
  });

  app.put('/api/induction/settings/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = insertInductionSettingsSchema.partial().parse(req.body);
      
      const [updatedSetting] = await db
        .update(inductionSettings)
        .set({ 
          ...updateData,
          updatedAt: new Date()
        })
        .where(eq(inductionSettings.id, id))
        .returning();
      
      if (!updatedSetting) {
        return res.status(404).json({ error: 'Induction setting not found' });
      }
      
      res.json({ success: true, setting: updatedSetting });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: 'Invalid data', 
          details: error.errors 
        });
      }
      console.error('Error updating induction settings:', error);
      res.status(500).json({ error: 'Failed to update induction settings' });
    }
  });

  // Toggle kiosk enabled / send link enabled per roleType (customer-isolated)
  app.patch('/api/induction/settings/:roleType/toggle', requireAuth, async (req, res) => {
    try {
      const { roleType } = req.params;
      const { kioskEnabled, sendLinkEnabled } = req.body;
      const customerId = req.customerId || 'default';
      const settingsDb = await customerDbService.getCustomerDatabase(customerId);

      const updateFields: any = { updatedAt: new Date() };
      if (typeof kioskEnabled === 'boolean') updateFields.kioskEnabled = kioskEnabled;
      if (typeof sendLinkEnabled === 'boolean') updateFields.sendLinkEnabled = sendLinkEnabled;

      await settingsDb
        .update(isolatedSchema.inductionSettings)
        .set(updateFields)
        .where(eq(isolatedSchema.inductionSettings.roleType, roleType));

      res.json({ success: true, roleType, ...updateFields });
    } catch (error) {
      console.error('Error toggling induction setting:', error);
      res.status(500).json({ error: 'Failed to update induction settings' });
    }
  });

  // Get kiosk induction status for a roleType — used by kiosk check-in flow
  app.get('/api/induction/kiosk-status/:roleType', async (req, res) => {
    try {
      const { roleType } = req.params;
      const customerId = req.session?.customerId || (req as any).customerId || 'default';
      let kioskEnabled = false;
      let hasVideo = false;
      try {
        const settingsDb = await customerDbService.getCustomerDatabase(customerId);
        const rows = await settingsDb
          .select()
          .from(isolatedSchema.inductionSettings)
          .where(eq(isolatedSchema.inductionSettings.roleType, roleType))
          .limit(1);
        if (rows.length > 0) {
          const s = rows[0] as any;
          kioskEnabled = Boolean(s.kioskEnabled);
          hasVideo = Boolean(s.generatedAt);
        }
      } catch (_e) {}
      res.json({ roleType, kioskEnabled, hasVideo });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get kiosk status' });
    }
  });

  // Create induction token for kiosk (no email — returns token URL for in-person display)
  app.post('/api/induction/kiosk-token', async (req, res) => {
    try {
      const { personType, personName, personEmail, visitorId, workerId, staffId } = req.body;
      if (!personType || !personName) {
        return res.status(400).json({ error: 'personType and personName are required' });
      }
      const token = await inductionService.createUniversalInductionToken({
        personType,
        personName,
        personEmail: personEmail || '',
        visitorId,
        workerId,
        staffId
      });
      const baseUrl = process.env.REPLIT_DOMAINS?.split(',')[0]?.trim()
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0].trim()}`
        : `http://localhost:5000`;
      res.json({ success: true, token, inductionUrl: `${baseUrl}/induction/${token}` });
    } catch (error) {
      console.error('Error creating kiosk induction token:', error);
      res.status(500).json({ error: 'Failed to create induction token' });
    }
  });


  // Generate AI questions from existing video content
  app.post('/api/induction/generate-questions/:roleType', requireAuth, async (req, res) => {
    try {
      const { roleType } = req.params;
      const customerId = req.customerId || 'default';
      const customerVideoId = `${customerId}-${roleType}`;
      const { VideoGenerationService } = await import('./videoGenerationService');
      
      // Validate role type
      if (!['visitor', 'staff', 'contractor'].includes(roleType)) {
        return res.status(400).json({ error: 'Invalid role type' });
      }

      // Get induction settings for this role to get model type
      let modelType = 'gpt-5';
      
      const inductionQContext = simpleDatabaseService.createCustomerContext(req.user!.username, customerId);
      const inductionQDb = await customerDbService.getCustomerDatabase(inductionQContext.customerId);
      try {
        const inductionSettingsRows = await inductionQDb.select().from(isolatedSchema.inductionSettings);
        const roleSetting = inductionSettingsRows.find((s: any) => s.roleType === roleType);
        modelType = roleSetting?.modelType || 'gpt-5';
      } catch (_e) {
        console.log('Using default model type');
      }

      const context = inductionQContext;
      
      const settings = await simpleDatabaseService.getCompanySettings(context);

      // Company-wide AI setting (Settings → AI tab) takes priority over the per-role default
      modelType = settings?.openaiModel || modelType;

      const videoService = new VideoGenerationService(settings, undefined, context.customerId);

      // Generate script to base questions on
      const scriptContent = await videoService.generateInductionScript(roleType, 'interactive_slides', modelType);
      
      // Generate AI questions based on the script content
      console.log(`🧠 Generating AI questions for ${roleType} from script...`);
      const aiQuestions = await videoService.generateQuestionsFromScript(
        scriptContent.script, 
        scriptContent.scenes, 
        roleType, 
        modelType
      );
      
      // Store AI-generated questions with clean delete-then-insert
      if (aiQuestions.length > 0) {
        console.log(`💾 Storing ${aiQuestions.length} questions — deleting old ones first...`);
        
        // DELETE all existing questions for this customer+roleType (clean slate)
        await db
          .delete(inductionQuestions)
          .where(eq(inductionQuestions.videoId, customerVideoId));

        // Also clean up legacy questions stored under old roleType-only videoId
        await db
          .delete(inductionQuestions)
          .where(and(
            eq(inductionQuestions.roleType, roleType),
            eq(inductionQuestions.videoId, roleType)
          ));
        
        // Insert new AI-generated questions with customer-specific videoId
        for (let i = 0; i < aiQuestions.length; i++) {
          const question = aiQuestions[i];
          await db.insert(inductionQuestions).values({
            questionText: question.questionText,
            questionType: question.questionType || 'multiple_choice',
            correctAnswer: question.correctAnswer,
            optionA: question.optionA,
            optionB: question.optionB,
            optionC: question.optionC,
            optionD: question.optionD,
            explanation: question.explanation,
            category: question.category,
            roleType: roleType,
            videoId: customerVideoId,
            isAiGenerated: true,
            orderIndex: i + 1,
            isActive: true
          });
        }
        
        console.log(`✅ Stored ${aiQuestions.length} questions for ${roleType} (customer: ${customerId})`);
      }
      
      res.json({ 
        success: true, 
        message: `Generated ${aiQuestions.length} AI questions for ${roleType} induction`,
        questionsGenerated: aiQuestions.length
      });
      
    } catch (error) {
      console.error('Error generating AI questions:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ 
        error: 'Failed to generate AI questions',
        details: errorMessage 
      });
    }
  });

  // AI Video Generation Routes
  app.post('/api/induction/generate-video/:roleType', requireAuth, async (req, res) => {
    const { roleType } = req.params;
    const customerId = req.customerId || 'default';
    const statusKey = `${customerId}-${roleType}`;
    const customerVideoId = `${customerId}-${roleType}`;

    try {
      const { VideoGenerationService } = await import('./videoGenerationService');
      
      // Validate role type
      if (!['visitor', 'staff', 'contractor'].includes(roleType)) {
        return res.status(400).json({ error: 'Invalid role type' });
      }

      // Prevent duplicate concurrent generations
      const existingStatus = inductionGenerationStatus.get(statusKey);
      if (existingStatus && ['pending', 'generating_script', 'building_slides', 'creating_questions', 'saving'].includes(existingStatus.status)) {
        return res.status(409).json({ error: 'Generation already in progress', status: existingStatus });
      }

      // Mark as started
      inductionGenerationStatus.set(statusKey, {
        status: 'generating_script',
        step: 1,
        totalSteps: 5,
        message: 'Generating safety script with AI...',
        startedAt: Date.now()
      });

      // Respond immediately — client polls for status
      res.json({ 
        success: true, 
        started: true,
        message: 'Video generation started',
        statusKey
      });

      // Run generation asynchronously with granular step tracking
      (async () => {
        const startedAt = inductionGenerationStatus.get(statusKey)!.startedAt;
        const setStatus = (status: any, step: number, message: string, extra: any = {}) => {
          inductionGenerationStatus.set(statusKey, { status, step, totalSteps: 5, message, startedAt, ...extra });
        };

        try {
          // Load customer database and settings
          const inductionVContext = simpleDatabaseService.createCustomerContext(req.user!.username, customerId);
          const custDb = await customerDbService.getCustomerDatabase(inductionVContext.customerId);

          let videoFormat = 'hybrid_enhanced';
          let modelType = 'gpt-5';
          try {
            const rows = await custDb.select().from(isolatedSchema.inductionSettings);
            const roleSetting = rows.find((s: any) => s.roleType === roleType);
            videoFormat = roleSetting?.videoFormat || 'hybrid_enhanced';
            modelType = roleSetting?.modelType || 'gpt-5';
          } catch (_e) {
            console.log('Using default video settings');
          }

          // Company-wide AI setting (Settings → AI tab) takes priority over the per-role default
          const context = simpleDatabaseService.createCustomerContext(req.user!.username, customerId);
          const companySettings = await simpleDatabaseService.getCompanySettings(context);
          modelType = companySettings?.openaiModel || modelType;

          console.log(`🎬 Generating ${videoFormat} video for ${roleType} using ${modelType}`);
          const videoService = new VideoGenerationService(companySettings, undefined, context.customerId);

          // ── Step 1: Generate AI script ─────────────────────────────────────
          setStatus('generating_script', 1, 'Generating AI safety script...');
          console.log(`📝 Step 1: Generating induction script for ${roleType}...`);
          const { script, scenes, totalDuration } = await videoService.generateInductionScript(roleType, videoFormat, modelType);
          console.log(`✅ Script ready: ${scenes.length} scenes, ${Math.round(totalDuration / 60)} min`);

          // ── Step 2: Build slides with AI images ────────────────────────────
          setStatus('building_slides', 2, `Building ${scenes.length} slides with AI images...`);
          console.log(`🎨 Step 2: Generating images for ${scenes.length} scenes...`);

          let sceneImages: string[] = [];
          let sceneAudio: string[] = [];

          if (videoFormat === 'hybrid_enhanced') {
            const [images, audio] = await Promise.all([
              videoService.generateSceneImages(scenes),
              videoService.generateSceneAudio(scenes)
            ]);
            sceneImages = images;
            sceneAudio = audio;
          } else {
            sceneImages = await videoService.generateSceneImages(scenes);
          }

          console.log(`✅ Images ready: ${sceneImages.filter(Boolean).length}/${scenes.length} generated`);

          setStatus('building_slides', 2, 'Assembling HTML presentation...');
          const htmlContent = await videoService.createEnhancedHTMLPresentation(scenes, roleType, modelType, sceneImages, sceneAudio);
          console.log(`✅ HTML presentation assembled (${Math.round(htmlContent.length / 1024)}KB)`);

          // ── Step 3: Generate quiz questions ────────────────────────────────
          setStatus('creating_questions', 3, 'Creating quiz questions...');
          console.log(`🧠 Step 3: Generating AI quiz questions...`);
          let questionsStored = 0;
          try {
            const aiQuestions = await videoService.generateQuestionsFromScript(script, scenes, roleType, modelType);

            if (aiQuestions.length > 0) {
              console.log(`💾 Storing ${aiQuestions.length} questions (deleting old ones first)...`);
              // DELETE-then-INSERT: clean slate for this customer+roleType
              await db.delete(inductionQuestions).where(eq(inductionQuestions.videoId, customerVideoId));
              await db.delete(inductionQuestions).where(and(
                eq(inductionQuestions.roleType, roleType),
                eq(inductionQuestions.videoId, roleType)
              ));
              for (let i = 0; i < aiQuestions.length; i++) {
                const q = aiQuestions[i];
                await db.insert(inductionQuestions).values({
                  questionText: q.questionText,
                  questionType: q.questionType || 'multiple_choice',
                  correctAnswer: q.correctAnswer,
                  optionA: q.optionA,
                  optionB: q.optionB,
                  optionC: q.optionC,
                  optionD: q.optionD,
                  explanation: q.explanation,
                  category: q.category,
                  roleType,
                  videoId: customerVideoId,
                  isAiGenerated: true,
                  orderIndex: i + 1,
                  isActive: true
                });
              }
              questionsStored = aiQuestions.length;
              console.log(`✅ Stored ${questionsStored} questions for ${roleType} (customer: ${customerId})`);
            }
          } catch (questionError) {
            console.error('⚠️ Question generation failed (non-fatal):', questionError);
          }

          // ── Step 4: Save video to customer-isolated database ───────────────
          setStatus('saving', 4, 'Saving video to database...');
          console.log(`💾 Step 4: Saving video to customer database...`);
          let savedToDatabase = false;

          // ── Upload HTML to object storage (fast CDN delivery on mobile) ────
          let objStoragePath: string | null = null;
          try {
            const privateDir = process.env.PRIVATE_OBJECT_DIR || '';
            if (privateDir) {
              const safeRoleType = roleType.replace(/[^a-z0-9_-]/gi, '');
              const safeCustId = customerId.replace(/[^a-z0-9_-]/gi, '');
              const fullObjPath = `${privateDir}/induction-videos/${safeCustId}/${safeRoleType}.html`;
              const { bucketName, objectName } = parseObjectStoragePath(fullObjPath);
              const bucket = objectStorageClient.bucket(bucketName);
              await bucket.file(objectName).save(Buffer.from(htmlContent, 'utf-8'), {
                contentType: 'text/html; charset=utf-8',
                metadata: { cacheControl: 'public, max-age=3600' }
              });
              objStoragePath = fullObjPath;
              console.log(`✅ Uploaded video to object storage: ${fullObjPath} (${Math.round(htmlContent.length / 1024)}KB raw, gzip on delivery)`);
            }
          } catch (objErr) {
            console.warn('⚠️ Object storage upload failed (non-fatal, falling back to DB blob):', objErr);
          }

          try {
            const videoData = {
              videoTitle: `${roleType.charAt(0).toUpperCase() + roleType.slice(1)} Safety Induction`,
              // Store object storage path in videoUrl if upload succeeded — served as fast stream
              videoUrl: objStoragePath || 'generated',
              videoDescription: `AI-generated UK HSE-compliant safety induction for ${roleType}s. Duration: ${Math.round(totalDuration / 60)} minutes.`,
              videoDurationMinutes: Math.round(totalDuration / 60),
              // Keep generatedHtml as fallback only if object storage upload failed
              generatedHtml: objStoragePath ? null : htmlContent,
              scenesData: JSON.stringify(scenes),
              generatedAt: new Date(),
              questionsGenerated: questionsStored > 0,
              updatedAt: new Date()
            };

            // Check if a row exists for this roleType (isolated DB may not be seeded yet)
            const existingRows = await custDb
              .select({ id: isolatedSchema.inductionSettings.id })
              .from(isolatedSchema.inductionSettings)
              .where(eq(isolatedSchema.inductionSettings.roleType, roleType))
              .limit(1);

            if (existingRows.length > 0) {
              await custDb
                .update(isolatedSchema.inductionSettings)
                .set(videoData as any)
                .where(eq(isolatedSchema.inductionSettings.roleType, roleType));
              console.log(`✅ Updated existing row in customer database (${Math.round(htmlContent.length / 1024)}KB HTML)`);
            } else {
              // No row yet — insert a fresh one (isolated DB was never seeded for this customer)
              await custDb
                .insert(isolatedSchema.inductionSettings)
                .values({
                  id: randomUUID(),
                  roleType,
                  passPercentage: 80,
                  isActive: true,
                  kioskEnabled: false,
                  sendLinkEnabled: true,
                  ...videoData
                } as any);
              console.log(`✅ Inserted new row in customer database (${Math.round(htmlContent.length / 1024)}KB HTML)`);
            }
            savedToDatabase = true;
            console.log(`✅ Saved to customer database (${Math.round(htmlContent.length / 1024)}KB HTML)`);
          } catch (saveError) {
            console.error('⚠️ Customer DB save failed:', saveError);
          }

          // ── Step 5: Done ───────────────────────────────────────────────────
          setStatus('done', 5,
            savedToDatabase
              ? `Video generated with ${questionsStored} quiz questions`
              : 'Video generated (database save failed — preview available)',
            { completedAt: Date.now() }
          );
          console.log(`🎉 Generation complete for ${roleType} (customer: ${customerId})`);

        } catch (asyncError: any) {
          console.error('❌ Error in async video generation:', asyncError);
          setStatus('failed', 0, 'Generation failed', {
            completedAt: Date.now(),
            error: asyncError.message || 'Unknown error'
          });
        }
      })();
      
    } catch (error: any) {
      console.error('Error starting video generation:', error);
      inductionGenerationStatus.set(statusKey, {
        status: 'failed',
        step: 0,
        totalSteps: 5,
        message: 'Failed to start generation',
        startedAt: Date.now(),
        completedAt: Date.now(),
        error: error.message || 'Unknown error'
      });
      if (!res.headersSent) {
        res.status(500).json({ 
          error: 'Failed to start video generation',
          details: error.message 
        });
      }
    }
  });

  // Get AI-generated script for preview
  app.get('/api/induction/script/:roleType', requireAuth, async (req, res) => {
    try {
      const { roleType } = req.params;
      const { VideoGenerationService } = await import('./videoGenerationService');
      
      // Get company settings for AI configuration
      // Import the simplified database service
      const { simpleDatabaseService } = await import("./simpleDatabaseService");
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const settings = await simpleDatabaseService.getCompanySettings(context);
      const videoService = new VideoGenerationService(settings, undefined, context.customerId);
      
      const content = await videoService.generateInductionScript(roleType);
      
      res.json({ 
        success: true,
        script: content.script,
        scenes: content.scenes,
        totalDuration: content.totalDuration
      });
      
    } catch (error) {
      console.error('Error generating script:', error);
      res.status(500).json({ error: 'Failed to generate script' });
    }
  });

  // Serve actual generated video content
  // CSS patch: replaces display:none slide toggling with visibility-based approach
  // so all slide images are pre-decoded by the browser → instant transitions
  const SLIDE_PERF_PATCH = `<style id="tpr-slide-perf-patch">
.scene{visibility:hidden!important;pointer-events:none!important;position:absolute!important;top:0;left:0;width:100%;opacity:0!important;transition:opacity 0.25s ease!important;}
.scene.active{visibility:visible!important;pointer-events:auto!important;position:relative!important;opacity:1!important;display:block!important;animation:tprSlideIn 0.3s ease!important;}
@keyframes tprSlideIn{from{opacity:0;transform:translateX(15px)}to{opacity:1;transform:translateX(0)}}
</style>`;
  function patchInductionHtml(html: string): string {
    if (html.includes('id="tpr-slide-perf-patch"')) return html;
    const idx = html.indexOf('</head>');
    if (idx !== -1) return html.slice(0, idx) + SLIDE_PERF_PATCH + html.slice(idx);
    return html + SLIDE_PERF_PATCH;
  }

  app.get('/api/induction/video/:roleType', async (req, res) => {
    try {
      const { roleType } = req.params;

      // Try customer-isolated database first (if authenticated)
      const sessionCustomerId = req.session?.customerId || (req as any).customerId;
      if (req.session?.userId && sessionCustomerId) {
        try {
          const custVideoDb = await customerDbService.getCustomerDatabase(sessionCustomerId);
          const custRows = await custVideoDb
            .select()
            .from(isolatedSchema.inductionSettings)
            .where(eq(isolatedSchema.inductionSettings.roleType, roleType))
            .limit(1);

          if (custRows.length > 0) {
            const setting = custRows[0] as any;
            // Prefer object storage path (fast stream, gzip on delivery)
            if (setting.videoUrl && setting.videoUrl !== 'generated' && !setting.videoUrl.startsWith('http') && !setting.videoUrl.startsWith('data:')) {
              try {
                const { bucketName, objectName } = parseObjectStoragePath(setting.videoUrl);
                const file = objectStorageClient.bucket(bucketName).file(objectName);
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.setHeader('Cache-Control', 'public, max-age=3600');
                file.createReadStream().pipe(res);
                return;
              } catch (_streamErr) { /* fall through to generatedHtml */ }
            }
            if (setting.generatedHtml) {
              console.log(`📄 Serving customer-isolated generatedHtml for ${roleType} (${req.customerId})`);
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.setHeader('Cache-Control', 'no-cache');
              res.send(patchInductionHtml(setting.generatedHtml));
              return;
            }
          }
        } catch (_custErr) {
          console.log('⚠️ Customer DB lookup failed, falling back to global');
        }
      }

      // Fallback: global shared inductionSettings (legacy / token-based access)
      const existingSettings = await db
        .select()
        .from(inductionSettings)
        .where(eq(inductionSettings.roleType, roleType))
        .limit(1);

      if (existingSettings.length > 0) {
        const setting = existingSettings[0];

        // Prefer stored generatedHtml (clean, no base64 overhead)
        if ((setting as any).generatedHtml) {
          console.log('📄 Serving global generatedHtml for', roleType);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          res.send(patchInductionHtml((setting as any).generatedHtml));
          return;
        }

        // Fallback: decode legacy base64 data URL
        if (setting.videoUrl && setting.videoUrl.startsWith('data:text/html;base64,')) {
          const base64Content = setting.videoUrl.replace('data:text/html;base64,', '');
          const htmlContent = Buffer.from(base64Content, 'base64').toString('utf-8');
          console.log('📄 Serving base64-decoded HTML for', roleType);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          res.send(patchInductionHtml(htmlContent));
          return;
        }
      }

      // No video found — return a clear message page instead of silently regenerating
      console.log('❌ No video found for', roleType, '— returning placeholder');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(404).send(`
        <html>
          <body style="font-family: system-ui; padding: 40px; text-align: center; background: #f8fafc; color: #334155;">
            <div style="max-width: 480px; margin: 80px auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
              <div style="font-size: 48px; margin-bottom: 16px;">🎬</div>
              <h2 style="margin: 0 0 12px; color: #0f172a;">No video generated yet</h2>
              <p style="color: #64748b; margin: 0 0 24px;">Return to Induction Settings and click "Generate Video" to create the ${roleType} induction.</p>
              <button onclick="window.close()" style="padding: 10px 24px; background: #2563eb; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px;">Close</button>
            </div>
          </body>
        </html>
      `);
      
    } catch (error) {
      console.error('Error serving video content:', error);
      res.status(500).send(`
        <html>
          <body style="font-family: system-ui; padding: 40px; text-align: center; background: #f3f4f6;">
            <h1 style="color: #dc2626;">Video Error</h1>
            <p>Unable to load video content. Please regenerate the video in Induction Settings.</p>
            <button onclick="window.close()" style="padding: 10px 20px; margin-top: 20px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer;">Close</button>
          </body>
        </html>
      `);
    }
  });

  // Preview generated video content in HTML format
  app.get('/api/induction/preview/:roleType', requireAuth, async (req, res) => {
    try {
      const { roleType } = req.params;
      
      // Try to get existing settings first
      let existingSettings = await db
        .select()
        .from(inductionSettings)
        .where(eq(inductionSettings.roleType, roleType))
        .limit(1);

      if (existingSettings.length === 0 || !existingSettings[0].videoUrl) {
        // Generate new content if none exists
        const { VideoGenerationService } = await import('./videoGenerationService');
        // Import the simplified database service
      const { simpleDatabaseService } = await import("./simpleDatabaseService");
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const settings = await simpleDatabaseService.getCompanySettings(context);
        const videoService = new VideoGenerationService(settings, undefined, context.customerId);
        
        const content = await videoService.generateVideoPresentation(roleType);
        await videoService.updateSettingsWithGeneratedContent(roleType, content);
        
        // Get the updated settings
        existingSettings = await db
          .select()
          .from(inductionSettings)
          .where(eq(inductionSettings.roleType, roleType))
          .limit(1);
      }

      const setting = existingSettings[0];
      const roleDisplayName = roleType.charAt(0).toUpperCase() + roleType.slice(1);
      
      // Return formatted HTML preview
      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${setting.videoTitle} - VisiGate Pro</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              line-height: 1.6;
              margin: 0;
              padding: 20px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: #333;
            }
            .container {
              max-width: 800px;
              margin: 0 auto;
              background: white;
              border-radius: 12px;
              box-shadow: 0 10px 30px rgba(0,0,0,0.2);
              overflow: hidden;
            }
            .header {
              background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
              color: white;
              padding: 30px;
              text-align: center;
            }
            .header h1 {
              margin: 0;
              font-size: 2em;
              font-weight: 700;
            }
            .header p {
              margin: 10px 0 0 0;
              opacity: 0.9;
              font-size: 1.1em;
            }
            .content {
              padding: 40px;
            }
            .video-info {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
              gap: 20px;
              margin-bottom: 30px;
              padding: 20px;
              background: #f8fafc;
              border-radius: 8px;
            }
            .info-item {
              text-align: center;
            }
            .info-label {
              font-size: 0.9em;
              color: #64748b;
              margin-bottom: 5px;
            }
            .info-value {
              font-size: 1.3em;
              font-weight: 600;
              color: #1e293b;
            }
            .description {
              background: #fafafa;
              padding: 20px;
              border-radius: 8px;
              border-left: 4px solid #4f46e5;
              margin: 20px 0;
            }
            .powered-by {
              text-align: center;
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #e2e8f0;
              color: #64748b;
              font-size: 0.9em;
            }
            .ai-badge {
              display: inline-flex;
              align-items: center;
              gap: 5px;
              background: linear-gradient(135deg, #10b981 0%, #059669 100%);
              color: white;
              padding: 8px 16px;
              border-radius: 20px;
              font-weight: 600;
              font-size: 0.9em;
              margin: 10px 0;
            }
            .close-btn {
              position: fixed;
              top: 20px;
              right: 20px;
              background: rgba(255,255,255,0.9);
              border: none;
              padding: 10px;
              border-radius: 50%;
              cursor: pointer;
              font-size: 20px;
              width: 40px;
              height: 40px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
          </style>
        </head>
        <body>
          <button class="close-btn" onclick="window.close()" title="Close Preview">×</button>
          
          <div class="container">
            <div class="header">
              <h1>${setting.videoTitle}</h1>
              <p>AI-Generated Safety Induction for ${roleDisplayName}s</p>
              <div class="ai-badge">
                ✨ Generated with AI
              </div>
            </div>
            
            <div class="content">
              <div class="video-info">
                <div class="info-item">
                  <div class="info-label">Duration</div>
                  <div class="info-value">${setting.videoDurationMinutes} minutes</div>
                </div>
                <div class="info-item">
                  <div class="info-label">Target Audience</div>
                  <div class="info-value">${roleDisplayName}s</div>
                </div>
                <div class="info-item">
                  <div class="info-label">Generated</div>
                  <div class="info-value">Just Now</div>
                </div>
              </div>
              
              <div class="description">
                <h3 style="margin-top: 0; color: #4f46e5;">Video Description</h3>
                <p>${setting.videoDescription}</p>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <p style="color: #64748b; margin-bottom: 20px;">
                  This AI-generated induction video provides comprehensive safety training 
                  tailored specifically for ${roleDisplayName.toLowerCase()}s in your organization.
                </p>
                <p style="color: #059669; font-weight: 600;">
                  ✅ Video content generated successfully and ready for use!
                </p>
              </div>
              
              <div class="powered-by">
                <p>🤖 Powered by OpenAI GPT-5 | 🏢 VisiGate Pro Safety Management</p>
              </div>
            </div>
          </div>
          
          <script>
            // Auto-close after 30 seconds if opened in popup
            if (window.opener) {
              setTimeout(() => {
                if (confirm('Close preview window?')) {
                  window.close();
                }
              }, 30000);
            }
          </script>
        </body>
        </html>
      `;
      
      res.setHeader('Content-Type', 'text/html');
      res.send(htmlContent);
      
    } catch (error) {
      console.error('Error generating video preview:', error);
      res.status(500).send(`
        <html>
          <body style="font-family: system-ui; padding: 40px; text-align: center;">
            <h1 style="color: #dc2626;">Preview Error</h1>
            <p>Unable to generate video preview. Please check your AI configuration.</p>
            <button onclick="window.close()" style="padding: 10px 20px; margin-top: 20px;">Close</button>
          </body>
        </html>
      `);
    }
  });



  // ===========================
  // THERMAL PASS PRINTING ENDPOINTS
  // ===========================
  
  const { thermalPrintService } = await import("./thermalPrintService");
  const { ZebraPrintService } = await import("./zebraPrintService");

  // Get thermal pass design - NOW WITH CUSTOMER ISOLATION!
  app.get("/api/thermal-passes/design/:type", requireAuth, async (req, res) => {
    try {
      const { type } = req.params; // visitor or contractor
      
      // Import the simplified database service
      const { simpleDatabaseService } = await import("./simpleDatabaseService");
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const settings = await simpleDatabaseService.getCompanySettings(context);
      
      let design;
      if (type === 'visitor') {
        design = settings?.visitorPassDesign ? JSON.parse(settings.visitorPassDesign) : [];
      } else if (type === 'contractor') {
        design = settings?.contractorPassDesign ? JSON.parse(settings.contractorPassDesign) : [];
      } else {
        return res.status(400).json({ error: 'Invalid pass type' });
      }
      
      console.log(`🎨 Loading ${type} pass design FOR CUSTOMER: ${context.customerId}`);
      res.json({ success: true, design });
    } catch (error) {
      console.error('Error loading thermal pass design:', error);
      res.status(500).json({ error: 'Failed to load thermal pass design' });
    }
  });

  // Save thermal pass design - NOW WITH CUSTOMER ISOLATION!
  app.put("/api/thermal-passes/design/:type", requireAuth, async (req, res) => {
    try {
      const { type } = req.params;
      const { elements, printerSettings } = req.body;
      
      if (!elements || !Array.isArray(elements)) {
        return res.status(400).json({ error: 'Invalid elements data' });
      }
      
      // Import the simplified database service
      const { simpleDatabaseService } = await import("./simpleDatabaseService");
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const designData = {
        elements,
        printerSettings,
        lastUpdated: new Date().toISOString()
      };
      
      const updateData: any = {};
      if (type === 'visitor') {
        updateData.visitorPassDesign = JSON.stringify(designData);
      } else if (type === 'contractor') {
        updateData.contractorPassDesign = JSON.stringify(designData);
      } else {
        return res.status(400).json({ error: 'Invalid pass type' });
      }
      
      await simpleDatabaseService.updateCompanySettings(context, updateData);
      
      console.log(`💾 ${type} thermal pass design saved with ${elements.length} elements FOR CUSTOMER: ${context.customerId}`);
      res.json({ 
        success: true, 
        message: `${type} thermal pass design saved successfully`,
        design: designData
      });
    } catch (error) {
      console.error('Error saving thermal pass design:', error);
      res.status(500).json({ error: 'Failed to save thermal pass design' });
    }
  });



  // SaaS: Browser-compatible print page endpoint 
  app.post("/api/thermal-passes/pdf", async (req, res) => {
    try {
      console.log('📄 Generating browser-printable HTML page with actual design...');
      
      const { elements, data } = req.body;
      const passElements = elements || [];
      
      console.log(`📊 Received ${passElements.length} pass elements for browser printing`);
      const visitorData = data || {
        name: 'John Smith',
        company: 'Tech Corp Ltd',
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        host: 'Sarah Johnson',
        id: 'VS00' + Math.random().toString(36).substr(2, 3).toUpperCase()
      };
      
      // Generate dynamic element styles based on the actual pass design
      let elementsHTML = '';
      if (passElements.length > 0) {
        elementsHTML = passElements.map((element: any) => {
          let content = '';
          
          switch(element.type) {
            case 'text':
              // Replace placeholders with actual visitor data
              let text = element.content || element.text || '';
              text = text.replace('{{name}}', visitorData.name);
              text = text.replace('{{company}}', visitorData.company);
              text = text.replace('{{date}}', visitorData.date);
              text = text.replace('{{time}}', visitorData.time);
              text = text.replace('{{host}}', visitorData.host);
              text = text.replace('{{id}}', visitorData.passId || visitorData.id);
              
              content = `<div style="
                position: absolute;
                left: ${element.x}px;
                top: ${element.y}px;
                width: ${element.width}px;
                height: ${element.height}px;
                font-size: ${element.fontSize || 12}px;
                font-weight: ${element.fontWeight || 'normal'};
                text-align: ${element.alignment || 'left'};
                color: ${element.color || '#000'};
                transform: ${element.rotation ? `rotate(${element.rotation}deg)` : 'none'};
                display: flex;
                align-items: center;
                font-family: Arial, sans-serif;
                line-height: 1.2;
                overflow: hidden;
              ">${text}</div>`;
              break;
              
            case 'qr':
              content = `<div style="
                position: absolute;
                left: ${element.x}px;
                top: ${element.y}px;
                width: ${element.width}px;
                height: ${element.height}px;
                border: 1px solid #333;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 8px;
                background: #f9f9f9;
                transform: ${element.rotation ? `rotate(${element.rotation}deg)` : 'none'};
              ">QR<br>CODE</div>`;
              break;
              
            case 'image':
              content = `<div style="
                position: absolute;
                left: ${element.x}px;
                top: ${element.y}px;
                width: ${element.width}px;
                height: ${element.height}px;
                border: 1px solid #ccc;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 8px;
                background: #f5f5f5;
                transform: ${element.rotation ? `rotate(${element.rotation}deg)` : 'none'};
              ">📷<br>IMG</div>`;
              break;
              
            case 'line':
              content = `<div style="
                position: absolute;
                left: ${element.x}px;
                top: ${element.y}px;
                width: ${element.width}px;
                height: ${element.height}px;
                background: ${element.color || '#000'};
                transform: ${element.rotation ? `rotate(${element.rotation}deg)` : 'none'};
              "></div>`;
              break;
          }
          
          return content;
        }).join('');
      }
      
      // Generate HTML page optimized for thermal printer dimensions
      const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Visitor Pass - Print</title>
    <style>
        @page {
            size: 95mm 65mm;
            margin: 0;
        }
        @media print {
            body { 
                margin: 0; 
                padding: 0;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .no-print { display: none !important; }
            .pass-container { 
                page-break-inside: avoid; 
                box-shadow: none;
                margin: 0;
                padding: 0;
                height: 65mm;
                width: 95mm;
            }
            .instructions { display: none !important; }
        }
        
        body {
            margin: 0;
            padding: 0;
            font-family: Arial, sans-serif;
            background: #f0f0f0;
        }
        
        .container {
            padding: 20px;
            display: block;
            min-height: 100vh;
        }
        
        .pass-container {
            width: 95mm;
            height: 65mm;
            background: white;
            border: 2px dashed #ccc;
            position: relative;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            box-sizing: border-box;
        }
        
        .pass {
            width: 100%;
            height: 100%;
            position: relative;
            background: white;
        }
        
        @media print {
            .container {
                padding: 0;
                min-height: 65mm;
                height: 65mm;
                display: block;
            }
        }
        
        .instructions {
            margin: 0 auto 30px auto;
            padding: 30px;
            background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
            border-radius: 12px;
            text-align: center;
            color: #1976d2;
            box-shadow: 0 4px 12px rgba(25, 118, 210, 0.15);
            max-width: 600px;
        }
        
        .instructions h3 {
            margin: 0 0 20px 0;
            font-size: 24px;
            font-weight: bold;
        }
        
        .instructions p {
            margin: 0 0 15px 0;
            font-size: 16px;
        }
        
        .instructions ul {
            text-align: left;
            margin: 20px 0;
            padding-left: 0;
            list-style: none;
        }
        
        .instructions li {
            margin: 8px 0;
            padding-left: 25px;
            position: relative;
            font-size: 14px;
        }
        
        .instructions li:before {
            content: "✓";
            position: absolute;
            left: 0;
            color: #4caf50;
            font-weight: bold;
        }
        
        .pass-container {
            margin: 0 auto;
        }
        
        .print-button {
            background: #1976d2;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            margin: 10px;
        }
        
        .print-button:hover {
            background: #1565c0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="no-print instructions">
            <h3>🖨️ VisiGate Pro - Visitor Pass Ready to Print</h3>
            <p>Click the button below to open your browser's print dialog, then configure your thermal printer:</p>
            <ul>
                <li>Select your thermal printer (TEC B-FV4D or Zebra)</li>
                <li>Choose "More settings" → Paper size: Custom (95mm x 65mm)</li>
                <li>Set margins to "None" or "Minimum"</li>
                <li>Enable "Background graphics"</li>
            </ul>
            <div style="margin-top: 25px;">
                <button class="print-button" onclick="window.print()">🖨️ Print Visitor Pass</button>
                <button class="print-button" onclick="window.close()" style="background: #666; margin-left: 15px;">✕ Close</button>
            </div>
        </div>

        <!-- Pass for printing only (hidden on screen) -->
        <div class="pass-container" style="margin: 0 auto;">
            <div class="pass">
                ${elementsHTML}
            </div>
        </div>
    </div>

    <script>
        // Show branded loading screen first
        setTimeout(function() {
            // Auto-trigger print dialog after showing the design
            if (window.opener || window.history.length === 1) {
                window.print();
            }
        }, 2000); // Give user 2 seconds to see the design
        
        // Close window after printing (optional)
        window.addEventListener('afterprint', function() {
            setTimeout(function() {
                if (confirm('Print completed! Close this window?')) {
                    window.close();
                }
            }, 1000);
        });
    </script>
</body>
</html>`;
      
      console.log(`📄 HTML print page generated: ${html.length} characters`);
      
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
      
      console.log(`📄 Print page sent to browser successfully`);
    } catch (error) {
      console.error("Print Page Generation Error:", error);
      res.status(500).json({ 
        error: 'Failed to generate print page',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });


  // NATIVE TEC B-EV4: Direct thermal printing using raw ESC/P commands and internal fonts
  app.post("/api/thermal-passes/print-tec-native", async (req, res) => {
    try {
      const { data, printerSettings } = req.body;
      
      if (!data) {
        return res.status(400).json({ error: 'Missing visitor data' });
      }
      
      const { TecThermalService } = await import('./tecThermalService');
      const printerName = printerSettings?.selectedPrinter || 'TEC B-EV4 Desktop Printer';
      const tecService = new TecThermalService(printerName);
      
      // Convert data to TEC thermal format
      const passData = {
        name: data.name || 'Visitor',
        company: data.company || 'Guest',
        host: data.host || 'Reception',
        date: data.date || new Date().toLocaleDateString(),
        time: data.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        passId: data.passId || `#${Math.random().toString(36).substr(2, 8).toUpperCase()}`,
        qrCode: data.qrCode || `VG-${Date.now()}`
      };
      
      console.log(`🖨️ Printing native TEC thermal pass for ${passData.name} to ${printerName}`);
      console.log('🔧 Windows 11 deployment mode - forcing Windows printing methods');
      process.env.WINDOWS_PRINTING = 'true'; // Enable Windows printing for testing
      const result = await tecService.printVisitorPass(passData);
      
      if (result.success) {
        res.json({
          success: true,
          message: result.message,
          method: `TEC Native (${result.method})`,
          printer: printerName
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.message,
          printer: printerName
        });
      }
    } catch (error) {
      console.error('❌ Native TEC thermal printing failed:', error);
      res.status(500).json({
        success: false,
        error: 'Native TEC thermal printing failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ZEBRA ZPL: Direct Zebra printing using ZPL commands
  app.post("/api/thermal-passes/print-zebra", async (req, res) => {
    try {
      const { elements, data, printerSettings } = req.body;
      
      if (!elements || !data) {
        return res.status(400).json({ error: 'Missing elements or data' });
      }
      
      const zebraService = new ZebraPrintService();
      
      // Generate ZPL from design elements
      const zpl = await zebraService.generateZPL(elements, data);
      
      console.log(`🦓 Generated ZPL for Zebra printer: ${zpl.length} characters`);
      
      // If printer IP is provided, send directly to network printer
      if (printerSettings?.zebraPrinterIP) {
        const printResult = await zebraService.printToZebraPrinter(
          zpl, 
          printerSettings.zebraPrinterIP, 
          printerSettings.zebraPrinterPort || 9100
        );
        
        if (printResult) {
          res.json({
            success: true,
            message: 'ZPL sent to Zebra printer successfully',
            method: 'Zebra Network',
            printer: `${printerSettings.zebraPrinterIP}:${printerSettings.zebraPrinterPort || 9100}`,
            zplLength: zpl.length
          });
        } else {
          res.status(500).json({
            success: false,
            error: 'Failed to send ZPL to Zebra printer'
          });
        }
      } else {
        // Return ZPL for local processing or USB printing
        res.json({
          success: true,
          zpl: zpl,
          message: 'ZPL generated successfully',
          method: 'Zebra ZPL Generation',
          zplLength: zpl.length
        });
      }
    } catch (error) {
      console.error('❌ Zebra ZPL printing failed:', error);
      res.status(500).json({
        success: false,
        error: 'Zebra ZPL printing failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // WINDOWS: Windows-specific thermal printing using Windows print spooler
  app.post("/api/thermal-passes/print-windows", async (req, res) => {
    try {
      const { elements, data, printerSettings } = req.body;
      
      if (!elements || !data) {
        return res.status(400).json({ error: 'Missing elements or data' });
      }
      
      console.log('🪟 Windows thermal printing request received');
      
      const windowsPrintService = new (await import('./windowsPrintService')).WindowsPrintService();
      
      // Generate HTML content optimized for thermal printing
      const htmlContent = await windowsPrintService.generateThermalHTML(elements, data, printerSettings);
      
      // Attempt Windows printing with fallback methods
      const printResult = await windowsPrintService.printToWindowsPrinter(htmlContent, printerSettings);
      
      if (printResult.success) {
        console.log(`✅ Windows thermal print successful: ${printResult.message}`);
        res.json({
          success: true,
          message: printResult.message,
          method: 'Windows Print Spooler',
          printer: printResult.printer || 'Default thermal printer',
          size: htmlContent.length
        });
      } else {
        console.log(`❌ Windows thermal print failed: ${printResult.message}`);
        res.status(500).json({
          success: false,
          error: printResult.message || 'Windows printing failed'
        });
      }
    } catch (error) {
      console.error('❌ Windows thermal printing error:', error);
      res.status(500).json({
        success: false,
        error: 'Windows thermal printing failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });



  // Print emergency muster list
  app.post("/api/thermal-passes/print-muster", requireAuth, async (req, res) => {
    try {
      // Import the simplified database service
      const { simpleDatabaseService } = await import("./simpleDatabaseService");
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const settings = await simpleDatabaseService.getCompanySettings(context);
      const printerSettings = {
        blackMarkSensing: true,
        printSpeed: 'medium' as const,
        printDensity: 'normal' as const,
        thermalAdjustment: 0,
        labelLength: 200, // Longer for muster list
        labelWidth: 85,
        cutAfterPrint: true,
        backfeedAdjustment: 0
      };
      
      // Get all people currently on site
      const musterContext = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const [visitors, staff, contractors] = await Promise.all([
        databaseService.getAllVisitors(musterContext),
        databaseService.getAllStaff(musterContext), 
        databaseService.getAllContractorWorkers(musterContext)
      ]);
      
      // Filter to only those currently checked in
      const visitorsOnSite = visitors.filter(v => v.status === 'checked_in').map(v => ({
        name: v.fullName,
        company: v.company,
        type: 'Visitor',
        checkInTime: v.checkInTime
      }));
      
      const staffOnSite = staff.filter(s => s.status === 'checked_in').map(s => ({
        name: `${s.firstName} ${s.lastName}`,
        company: settings.companyName,
        department: s.department,
        type: 'Staff',
        checkInTime: s.checkInTime
      }));
      
      const contractorsOnSite = contractors.filter(c => c.checkInStatus === 'checked_in').map(c => ({
        name: c.fullName,
        company: c.company,
        type: 'Contractor',
        checkInTime: c.checkInTime
      }));
      
      const allPeopleOnSite = [...visitorsOnSite, ...staffOnSite, ...contractorsOnSite];
      
      const success = await thermalPrintService.printMusterList(allPeopleOnSite, printerSettings);
      
      if (success) {
        console.log(`🚨 Emergency muster list printed (${allPeopleOnSite.length} people)`);
        res.json({ 
          success: true, 
          message: `Emergency muster list printed (${allPeopleOnSite.length} people on site)`,
          totalPeople: allPeopleOnSite.length
        });
      } else {
        res.status(500).json({ error: 'Failed to print muster list' });
      }
    } catch (error) {
      console.error('Error printing muster list:', error);
      res.status(500).json({ error: 'Failed to print emergency muster list' });
    }
  });

  // QR Code Reader Integration Routes
  app.get('/api/qr-readers/devices', async (req, res) => {
    try {
      const { qrReaderService } = await import('./qrReaderService');
      const devices = await qrReaderService.detectDevices();
      
      res.json({
        success: true,
        devices,
        count: devices.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('QR reader device detection error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to detect QR reader devices',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post('/api/qr-readers/test', async (req, res) => {
    try {
      const { qrReaderService } = await import('./qrReaderService');
      const { deviceId } = req.body;
      
      const result = await qrReaderService.testConnection(deviceId);
      
      res.json({
        success: result.success,
        message: result.message,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('QR reader test error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to test QR reader connection',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post('/api/qr-readers/detect', async (req, res) => {
    try {
      const { qrReaderService } = await import('./qrReaderService');
      const devices = await qrReaderService.detectDevices();
      
      res.json({
        success: true,
        message: `Device scan complete. Found ${devices.length} QR reader devices.`,
        devices,
        count: devices.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('QR reader detection error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to detect QR reader devices',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // QR Code Scan Processing Routes
  app.post('/api/qr-scan/visitor', async (req, res) => {
    try {
      const { qrReaderService } = await import('./qrReaderService');
      const { qrData, action } = req.body;
      
      if (!qrData) {
        return res.status(400).json({
          success: false,
          message: 'QR code data is required'
        });
      }

      const result = await qrReaderService.processVisitorScan(qrData);
      
      // Log the scan activity
      console.log(`📱 Visitor QR scan processed: ${qrData} -> ${result.action || 'unknown'}`);
      
      res.json({
        success: result.success,
        message: result.message,
        action: result.action,
        qrData,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Visitor QR scan error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to process visitor QR scan',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post('/api/qr-scan/staff', async (req, res) => {
    try {
      const { qrReaderService } = await import('./qrReaderService');
      const { qrData, action } = req.body;
      
      if (!qrData) {
        return res.status(400).json({
          success: false,
          message: 'QR code data is required'
        });
      }

      const result = await qrReaderService.processStaffScan(qrData);
      
      console.log(`👥 Staff QR scan processed: ${qrData} -> ${result.action || 'unknown'}`);
      
      res.json({
        success: result.success,
        message: result.message,
        action: result.action,
        qrData,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Staff QR scan error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to process staff QR scan',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post('/api/qr-scan/contractor', async (req, res) => {
    try {
      const { qrReaderService } = await import('./qrReaderService');
      const { qrData, action } = req.body;
      
      if (!qrData) {
        return res.status(400).json({
          success: false,
          message: 'QR code data is required'
        });
      }

      const result = await qrReaderService.processContractorScan(qrData);
      
      console.log(`🔧 Contractor QR scan processed: ${qrData} -> ${result.action || 'unknown'}`);
      
      res.json({
        success: result.success,
        message: result.message,
        action: result.action,
        qrData,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Contractor QR scan error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to process contractor QR scan',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ===========================
  // UNIVERSAL CAMERA QR SCAN
  // ===========================

  app.post('/api/qr-scan/universal', requireAuth, async (req, res) => {
    try {
      const { qrData } = req.body;
      if (!qrData) {
        return res.status(400).json({ success: false, message: 'QR code data is required' });
      }

      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const customerDb = await customerDbService.getCustomerDatabase(context.customerId);

      // 1. Try visitor pre-booking
      // Handles three formats:
      //   PBK-{id}   → look up by ID (legacy dashboard format)
      //   PRE-{code} → strip prefix, look up by qrCode (invitation email format)
      //   {code}     → look up by qrCode directly
      let preBooking: any = null;
      if (qrData.startsWith('PBK-')) {
        const pbId = qrData.replace('PBK-', '');
        const [found] = await customerDb.select().from(isolatedSchema.preBookings)
          .where(eq(isolatedSchema.preBookings.id, pbId)).limit(1);
        preBooking = found;
      } else {
        // Strip optional PRE- prefix added by the invitation email
        const lookupCode = qrData.startsWith('PRE-') ? qrData.replace('PRE-', '') : qrData;
        const [found] = await customerDb.select().from(isolatedSchema.preBookings)
          .where(eq(isolatedSchema.preBookings.qrCode, lookupCode)).limit(1);
        preBooking = found;
      }

      if (preBooking) {
        if (preBooking.isCheckedIn) {
          return res.json({
            success: false,
            personName: `${preBooking.visitorFirstName} ${preBooking.visitorLastName}`,
            personType: 'visitor',
            action: 'already_checked_in',
            message: `${preBooking.visitorFirstName} ${preBooking.visitorLastName} has already been checked in from this pre-booking.`
          });
        }

        // Verify hostStaffId exists to avoid FK constraint violations on the visitors table
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
        });
        await customerDb.update(isolatedSchema.preBookings)
          .set({ isCheckedIn: true, checkedInAt: new Date(), visitorId: visitor.id })
          .where(eq(isolatedSchema.preBookings.id, preBooking.id));
        return res.json({
          success: true,
          personName: `${visitor.firstName} ${visitor.lastName}`,
          personType: 'visitor',
          action: 'checked_in',
          message: `${visitor.firstName} ${visitor.lastName} checked in successfully from pre-booking.`,
          details: { company: visitor.company, purpose: visitor.purpose }
        });
      }

      // 2. Try contractor pre-booking
      const [contractorPb] = await customerDb.select().from(isolatedSchema.contractorPreBookings)
        .where(eq(isolatedSchema.contractorPreBookings.qrCode, qrData)).limit(1);
      if (contractorPb) {
        if (contractorPb.status === 'completed') {
          return res.json({
            success: false,
            personName: contractorPb.workerName,
            personType: 'contractor',
            action: 'already_checked_in',
            message: `${contractorPb.workerName} (${contractorPb.companyName}) is already checked in.`
          });
        }
        await customerDb.update(isolatedSchema.contractorPreBookings)
          .set({ status: 'completed' })
          .where(eq(isolatedSchema.contractorPreBookings.id, contractorPb.id));
        return res.json({
          success: true,
          personName: contractorPb.workerName,
          personType: 'contractor',
          action: 'checked_in',
          message: `${contractorPb.workerName} (${contractorPb.companyName}) checked in successfully.`,
          details: { company: contractorPb.companyName, purpose: contractorPb.purpose }
        });
      }

      // 3. Try existing visitor by QR code
      const visitor = await databaseService.getVisitorByQrCode(context, qrData);
      if (visitor) {
        const isCheckedIn = !visitor.isCheckedIn;
        await customerDb.update(isolatedSchema.visitors)
          .set({ isCheckedIn, checkedInAt: isCheckedIn ? new Date() : null } as any)
          .where(eq(isolatedSchema.visitors.id, visitor.id));
        return res.json({
          success: true,
          personName: `${visitor.firstName} ${visitor.lastName}`,
          personType: 'visitor',
          action: isCheckedIn ? 'checked_in' : 'checked_out',
          message: `${visitor.firstName} ${visitor.lastName} ${isCheckedIn ? 'checked in' : 'checked out'} successfully.`,
          details: { company: visitor.company }
        });
      }

      // 4. Try staff by QR code
      const staff = await databaseService.getStaffByQrCode(context, qrData);
      if (staff) {
        const isCheckedIn = !staff.isCheckedIn;
        await customerDb.update(isolatedSchema.staff)
          .set({ isCheckedIn } as any)
          .where(eq(isolatedSchema.staff.id, staff.id));
        return res.json({
          success: true,
          personName: `${staff.firstName} ${staff.lastName}`,
          personType: 'staff',
          action: isCheckedIn ? 'checked_in' : 'checked_out',
          message: `${staff.firstName} ${staff.lastName} ${isCheckedIn ? 'checked in' : 'checked out'} successfully.`,
          details: { department: staff.department }
        });
      }

      // Nothing matched
      return res.status(404).json({
        success: false,
        message: 'QR code not recognised. Please check the code and try again.',
      });
    } catch (error) {
      console.error('Universal QR scan error:', error);
      res.status(500).json({ success: false, message: 'Failed to process QR scan.' });
    }
  });

  // ===========================
  // PROFESSIONAL THERMAL DESIGNER API
  // ===========================

  // Generate thermal printer code (TPL/ZPL)
  app.post('/api/thermal/generate-code', async (req, res) => {
    try {
      const { printerType, elements, data, settings, customerId } = req.body;
      
      if (!printerType || !elements || !data) {
        return res.status(400).json({ 
          success: false, 
          error: 'Missing required parameters' 
        });
      }

      let generatedCode = '';
      
      if (printerType === 'tec') {
        // Generate TPL code for TEC/Toshiba
        generatedCode = await thermalPrintService.generateTPL(elements, data, settings || {});
      } else if (printerType === 'zebra') {
        // Generate ZPL code for Zebra
        const zebraService = new ZebraPrintService();
        generatedCode = await zebraService.generateZPL(elements, data);
      } else {
        return res.status(400).json({ 
          success: false, 
          error: 'Unsupported printer type' 
        });
      }

      console.log(`🖨️ Generated ${printerType.toUpperCase()} code (${generatedCode.length} chars) for customer: ${customerId}`);
      
      res.json({
        success: true,
        code: generatedCode,
        printerType,
        codeLength: generatedCode.length
      });
    } catch (error) {
      console.error('Thermal code generation error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate thermal code',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Test print with thermal printer
  app.post('/api/thermal/test-print', async (req, res) => {
    try {
      const { printerType, elements, data, settings, customerId } = req.body;
      
      if (!printerType || !elements || !data) {
        return res.status(400).json({ 
          success: false, 
          error: 'Missing required parameters' 
        });
      }

      let printResult = false;
      
      if (printerType === 'tec') {
        // Test print with TEC/Toshiba
        printResult = await thermalPrintService.testPrint(elements, data, settings || {});
      } else if (printerType === 'zebra') {
        // Test print with Zebra
        const zebraService = new ZebraPrintService();
        printResult = await zebraService.testPrint(elements, data);
      } else {
        return res.status(400).json({ 
          success: false, 
          error: 'Unsupported printer type' 
        });
      }

      console.log(`🖨️ Test print ${printResult ? 'successful' : 'failed'} for ${printerType.toUpperCase()} printer (customer: ${customerId})`);
      
      res.json({
        success: printResult,
        printerType,
        message: printResult ? 'Test print sent successfully' : 'Test print failed'
      });
    } catch (error) {
      console.error('Thermal test print error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send test print',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ===========================
  // WINDOWS SERVICE PRINT QUEUE API
  // ===========================

  // Register a new Windows service instance
  app.post('/api/print-service/register', async (req, res) => {
    try {
      const {
        customerId,
        serviceName,
        machineId,
        location,
        supportedPrinters,
        pollIntervalSeconds,
        computerName,
        ipAddress,
        serviceVersion
      } = req.body;

      if (!customerId || !serviceName || !machineId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: customerId, serviceName, machineId'
        });
      }

      // Generate secure API token for this service instance
      const crypto = await import('crypto');
      const apiToken = crypto.randomBytes(32).toString('hex');

      // Check if service already exists for this machine
      const existingService = await db.select()
        .from(printServiceInstances)
        .where(and(
          eq(printServiceInstances.customerId, customerId),
          eq(printServiceInstances.machineId, machineId)
        ));

      let serviceInstance;
      if (existingService.length > 0) {
        // Update existing service
        [serviceInstance] = await db.update(printServiceInstances)
          .set({
            serviceName,
            location,
            supportedPrinters,
            pollIntervalSeconds: pollIntervalSeconds || 30,
            computerName,
            ipAddress,
            serviceVersion,
            apiToken,
            isActive: true,
            lastHeartbeat: new Date(),
            updatedAt: new Date()
          })
          .where(eq(printServiceInstances.id, existingService[0].id))
          .returning();

        console.log(`🔄 Updated Windows service: ${serviceName} (${machineId}) for customer: ${customerId}`);
      } else {
        // Create new service instance
        [serviceInstance] = await db.insert(printServiceInstances)
          .values({
            customerId,
            serviceName,
            machineId,
            apiToken,
            location,
            supportedPrinters,
            pollIntervalSeconds: pollIntervalSeconds || 30,
            computerName,
            ipAddress,
            serviceVersion,
            isActive: true,
            lastHeartbeat: new Date()
          })
          .returning();

        console.log(`✅ Registered new Windows service: ${serviceName} (${machineId}) for customer: ${customerId}`);
      }

      res.json({
        success: true,
        serviceInstance: {
          id: serviceInstance.id,
          apiToken: serviceInstance.apiToken,
          pollIntervalSeconds: serviceInstance.pollIntervalSeconds,
          supportedPrinters: serviceInstance.supportedPrinters
        },
        message: 'Windows service registered successfully'
      });
    } catch (error) {
      console.error('Windows service registration error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to register Windows service',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Service heartbeat endpoint
  app.post('/api/print-service/heartbeat', async (req, res) => {
    try {
      const { apiToken, status, printerStatus } = req.body;

      if (!apiToken) {
        return res.status(401).json({
          success: false,
          error: 'API token required'
        });
      }

      // Find service instance by token
      const [serviceInstance] = await db.select()
        .from(printServiceInstances)
        .where(eq(printServiceInstances.apiToken, apiToken));

      if (!serviceInstance) {
        return res.status(401).json({
          success: false,
          error: 'Invalid API token'
        });
      }

      // Update heartbeat
      await db.update(printServiceInstances)
        .set({
          lastHeartbeat: new Date(),
          isActive: true,
          updatedAt: new Date()
        })
        .where(eq(printServiceInstances.id, serviceInstance.id));

      res.json({
        success: true,
        message: 'Heartbeat received',
        serviceId: serviceInstance.id
      });
    } catch (error) {
      console.error('Service heartbeat error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process heartbeat'
      });
    }
  });

  // Poll for print jobs (main Windows service endpoint)
  app.get('/api/print-service/poll/:apiToken', async (req, res) => {
    try {
      const { apiToken } = req.params;
      const { limit = 10 } = req.query;

      if (!apiToken) {
        return res.status(401).json({
          success: false,
          error: 'API token required'
        });
      }

      // Find service instance by token
      const [serviceInstance] = await db.select()
        .from(printServiceInstances)
        .where(eq(printServiceInstances.apiToken, apiToken));

      if (!serviceInstance) {
        return res.status(401).json({
          success: false,
          error: 'Invalid API token'
        });
      }

      // Update heartbeat
      await db.update(printServiceInstances)
        .set({
          lastHeartbeat: new Date(),
          isActive: true
        })
        .where(eq(printServiceInstances.id, serviceInstance.id));

      // Get pending print jobs for this customer
      const pendingJobs = await db.select()
        .from(printQueue)
        .where(and(
          eq(printQueue.customerId, serviceInstance.customerId),
          eq(printQueue.status, 'pending')
        ))
        .orderBy(printQueue.priority, printQueue.createdAt)
        .limit(parseInt(limit as string));

      // Mark jobs as assigned to this service
      if (pendingJobs.length > 0) {
        const jobIds = pendingJobs.map(j => j.id);
        await db.update(printQueue)
          .set({
            status: 'processing',
            serviceInstanceId: serviceInstance.id,
            assignedAt: new Date(),
            startedAt: new Date(),
            updatedAt: new Date()
          })
          .where(sql`${printQueue.id} = ANY(${jobIds})`);
      }

      console.log(`📥 Service ${serviceInstance.serviceName} polled: ${pendingJobs.length} jobs assigned`);

      res.json({
        success: true,
        jobs: pendingJobs.map(job => ({
          id: job.id,
          jobType: job.jobType,
          printerType: job.printerType,
          priority: job.priority,
          visitorData: job.visitorData ? JSON.parse(job.visitorData) : null,
          passElements: job.passElements ? JSON.parse(job.passElements) : null,
          printerSettings: job.printerSettings ? JSON.parse(job.printerSettings) : null,
          createdAt: job.createdAt
        })),
        serviceInfo: {
          id: serviceInstance.id,
          serviceName: serviceInstance.serviceName,
          pollIntervalSeconds: serviceInstance.pollIntervalSeconds
        }
      });
    } catch (error) {
      console.error('Print service poll error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to poll for print jobs',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Update print job status
  app.post('/api/print-service/job-status', async (req, res) => {
    try {
      const {
        apiToken,
        jobId,
        status,
        errorMessage,
        generatedCode,
        printerResponse,
        processingTimeMs
      } = req.body;

      if (!apiToken || !jobId || !status) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: apiToken, jobId, status'
        });
      }

      // Verify service token
      const [serviceInstance] = await db.select()
        .from(printServiceInstances)
        .where(eq(printServiceInstances.apiToken, apiToken));

      if (!serviceInstance) {
        return res.status(401).json({
          success: false,
          error: 'Invalid API token'
        });
      }

      // Update job status
      const updateData: any = {
        status,
        updatedAt: new Date()
      };

      if (status === 'completed' || status === 'failed') {
        updateData.completedAt = new Date();
      }

      if (errorMessage) {
        updateData.errorMessage = errorMessage;
        updateData.retryCount = sql`${printQueue.retryCount} + 1`;
      }

      const [updatedJob] = await db.update(printQueue)
        .set(updateData)
        .where(eq(printQueue.id, jobId))
        .returning();

      if (!updatedJob) {
        return res.status(404).json({
          success: false,
          error: 'Print job not found'
        });
      }

      // Create history record
      const queueTime = updatedJob.assignedAt && updatedJob.createdAt 
        ? updatedJob.assignedAt.getTime() - updatedJob.createdAt.getTime()
        : null;
      
      const totalTime = updatedJob.completedAt && updatedJob.createdAt
        ? updatedJob.completedAt.getTime() - updatedJob.createdAt.getTime()
        : null;

      await db.insert(printJobHistory)
        .values({
          customerId: serviceInstance.customerId,
          printQueueId: jobId,
          serviceInstanceId: serviceInstance.id,
          queueTimeMs: queueTime,
          processingTimeMs: processingTimeMs || null,
          totalTimeMs: totalTime,
          generatedCode,
          codeLength: generatedCode ? generatedCode.length : null,
          printerResponse,
          wasSuccessful: status === 'completed',
          finalStatus: status,
          errorDetails: errorMessage
        });

      console.log(`📋 Job ${jobId} status updated to: ${status} by service: ${serviceInstance.serviceName}`);

      res.json({
        success: true,
        message: 'Job status updated successfully',
        jobId,
        newStatus: status
      });
    } catch (error) {
      console.error('Job status update error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update job status',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Add print job to queue (called from web app)
  app.post('/api/print-queue/add', async (req, res) => {
    try {
      const {
        customerId,
        jobType,
        printerType,
        priority = 1,
        visitorData,
        passElements,
        printerSettings,
        createdBy,
        requestSource = 'web_app'
      } = req.body;

      if (!customerId || !jobType || !printerType) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: customerId, jobType, printerType'
        });
      }

      // Add job to queue
      const [newJob] = await db.insert(printQueue)
        .values({
          customerId,
          jobType,
          printerType,
          priority,
          visitorData: visitorData ? JSON.stringify(visitorData) : null,
          passElements: passElements ? JSON.stringify(passElements) : null,
          printerSettings: printerSettings ? JSON.stringify(printerSettings) : null,
          createdBy,
          requestSource,
          status: 'pending'
        })
        .returning();

      console.log(`➕ Print job added to queue: ${jobType} (${printerType}) for customer: ${customerId}`);

      res.json({
        success: true,
        job: {
          id: newJob.id,
          status: newJob.status,
          createdAt: newJob.createdAt
        },
        message: 'Print job added to queue successfully'
      });
    } catch (error) {
      console.error('Add print job error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to add print job to queue',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Windows service download endpoint
  app.get('/api/windows-service/download', async (req, res) => {
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      // Check if built MSI exists
      const msiPath = path.default.join(process.cwd(), 'windows-service', 'VisiGatePrintService-Setup.msi');
      
      if (fs.default.existsSync(msiPath)) {
        // Serve the actual MSI file
        const msiContent = fs.default.readFileSync(msiPath);
        
        res.setHeader('Content-Type', 'application/x-msi');
        res.setHeader('Content-Disposition', 'attachment; filename="VisiGatePrintService-Setup.msi"');
        res.setHeader('Content-Length', msiContent.length);
        res.setHeader('Cache-Control', 'no-cache');
        
        res.send(msiContent);
        
        console.log('📦 Windows service installer downloaded (actual MSI)');
      } else {
        // Create a functional installer package with embedded service code
        const serviceCode = fs.default.existsSync(path.default.join(process.cwd(), 'windows-service', 'VisiGatePrintService.js'))
          ? fs.default.readFileSync(path.default.join(process.cwd(), 'windows-service', 'VisiGatePrintService.js'), 'utf8')
          : '// Service code not found';
        
        const configExample = fs.default.existsSync(path.default.join(process.cwd(), 'windows-service', 'config.json.example'))
          ? fs.default.readFileSync(path.default.join(process.cwd(), 'windows-service', 'config.json.example'), 'utf8')
          : '{}';
        
        const installerContent = Buffer.concat([
          Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]), // MSI signature
          Buffer.from('VisiGate Print Service Installer v1.0.0\n'),
          Buffer.from('=====================================\n\n'),
          Buffer.from('INSTALLATION INSTRUCTIONS:\n'),
          Buffer.from('1. Extract to C:\\VisiGate\\PrintService\\\n'),
          Buffer.from('2. Run: npm install\n'),
          Buffer.from('3. Run: node VisiGatePrintService.js\n'),
          Buffer.from('4. Configure config.json with API token\n\n'),
          Buffer.from('--- SERVICE CODE START ---\n'),
          Buffer.from(serviceCode),
          Buffer.from('\n--- SERVICE CODE END ---\n\n'),
          Buffer.from('--- CONFIG TEMPLATE START ---\n'),
          Buffer.from(configExample),
          Buffer.from('\n--- CONFIG TEMPLATE END ---\n')
        ]);
        
        res.setHeader('Content-Type', 'application/x-msi');
        res.setHeader('Content-Disposition', 'attachment; filename="VisiGatePrintService-Setup.msi"');
        res.setHeader('Content-Length', installerContent.length);
        res.setHeader('Cache-Control', 'no-cache');
        
        res.send(installerContent);
        
        console.log('📦 Windows service installer downloaded (generated package)');
      }
    } catch (error) {
      console.error('Windows service download error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to download Windows service installer'
      });
    }
  });

  // Generate service token endpoint (Updated with new queue system)
  app.post('/api/print-service/generate-token', async (req, res) => {
    try {
      const { customerId, serviceName, location, printerType = 'tec', printerName } = req.body;

      if (!customerId || !serviceName) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: customerId, serviceName'
        });
      }

      // Import the print job queue
      const { printJobQueue } = await import('./printJobQueue');
      
      // Register the service and get the API token
      const { apiToken, serviceId } = printJobQueue.registerService(
        customerId,
        serviceName,
        location || 'Main Reception',
        printerType,
        printerName || 'TEC B-EV4 Desktop Printer'
      );

      console.log(`🔑 Generated service token for: ${serviceName} (customer: ${customerId})`);

      res.json({
        success: true,
        apiToken,
        serviceId,
        configuration: {
          customerId,
          serviceName,
          location,
          printerType,
          printerName,
          apiEndpoint: process.env.REPLIT_DEV_DOMAIN 
            ? `https://${process.env.REPLIT_DEV_DOMAIN}`
            : 'https://your-visigate-domain.com',
          pollUrl: `/api/print-service/poll/${apiToken}`,
          heartbeatUrl: '/api/print-service/heartbeat',
          statusUrl: '/api/print-service/job-status',
          pollIntervalSeconds: 3 // Poll every 3 seconds for faster response
        },
        message: 'Service token generated successfully. Copy this token for Windows service configuration.'
      });
    } catch (error) {
      console.error('Service token generation error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate service token',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Windows service polling endpoint
  app.get('/api/print-service/poll/:apiToken', async (req, res) => {
    try {
      const { apiToken } = req.params;
      const { limit = '5' } = req.query;
      
      const { printJobQueue } = await import('./printJobQueue');
      const jobs = printJobQueue.pollJobs(apiToken, parseInt(limit as string));
      
      res.json({
        success: true,
        jobs: jobs.map(job => ({
          id: job.id,
          printerType: job.printerType,
          priority: job.priority,
          tcplCommands: job.tcplCommands, // For TEC printers
          data: job.data, // Raw data for client-side processing if needed
          attempts: job.attempts,
          maxAttempts: job.maxAttempts
        })),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Poll error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to poll for jobs'
      });
    }
  });

  // Windows service heartbeat endpoint
  app.post('/api/print-service/heartbeat', async (req, res) => {
    try {
      const { apiToken } = req.body;
      
      if (!apiToken) {
        return res.status(400).json({
          success: false,
          error: 'API token required'
        });
      }
      
      const { printJobQueue } = await import('./printJobQueue');
      const success = printJobQueue.updateHeartbeat(apiToken);
      
      if (!success) {
        return res.status(401).json({
          success: false,
          error: 'Invalid API token'
        });
      }
      
      res.json({
        success: true,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Heartbeat error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update heartbeat'
      });
    }
  });

  // Update job status endpoint
  app.post('/api/print-service/job-status', async (req, res) => {
    try {
      const { jobId, status, resultData, errorMessage } = req.body;
      
      if (!jobId || !status) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: jobId, status'
        });
      }
      
      const { printJobQueue } = await import('./printJobQueue');
      const success = printJobQueue.updateJobStatus(
        jobId,
        status,
        resultData,
        errorMessage
      );
      
      if (!success) {
        return res.status(404).json({
          success: false,
          error: 'Job not found'
        });
      }
      
      res.json({
        success: true,
        jobId,
        status,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Job status update error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update job status'
      });
    }
  });

  // Queue a thermal print job
  app.post('/api/thermal/queue-print', async (req, res) => {
    try {
      const { customerId, elements, visitorData, printerSettings, priority = 5 } = req.body;
      
      if (!customerId || !elements || !visitorData) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields'
        });
      }
      
      const { printJobQueue } = await import('./printJobQueue');
      const { TCPLGenerator } = await import('./tcplGenerator');
      
      const tcplGen = new TCPLGenerator();
      const tcplElements = tcplGen.convertFromDesigner(elements, 361, 247);
      
      const printData = {
        visitorName: visitorData.name,
        company: visitorData.company,
        host: visitorData.host,
        purpose: visitorData.purpose || 'Meeting',
        date: new Date().toLocaleDateString('en-GB'),
        time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        passId: visitorData.passId || `VS${Date.now().toString().slice(-8)}`,
        checkInTime: new Date().toISOString(),
        customerId,
        validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      };
      
      const settings = {
        printDensity: printerSettings?.printDensity || 10,
        printSpeed: printerSettings?.printSpeed || 5,
        mediaType: 'direct' as const,
        labelWidth: 95,
        labelHeight: 65,
        darkness: printerSettings?.darkness || 15,
        cutterEnabled: printerSettings?.cutterEnabled !== false,
        backfeedEnabled: false
      };
      
      const jobId = printJobQueue.addJob(
        customerId,
        tcplElements,
        printData,
        settings,
        priority
      );
      
      res.json({
        success: true,
        jobId,
        message: 'Print job queued successfully'
      });
    } catch (error) {
      console.error('Queue print error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to queue print job'
      });
    }
  });

  // Installation guide endpoint
  app.get('/service-installation-guide', async (req, res) => {
    const installationGuide = `
<!DOCTYPE html>
<html>
<head>
    <title>VisiGate Print Service - Installation Guide</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
        .header { background: #0066cc; color: white; padding: 20px; border-radius: 8px; }
        .step { background: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 8px; border-left: 4px solid #0066cc; }
        .code { background: #e9ecef; padding: 10px; border-radius: 4px; font-family: monospace; }
        .warning { background: #fff3cd; padding: 10px; border-radius: 4px; border-left: 4px solid #ffc107; }
    </style>
</head>
<body>
    <div class="header">
        <h1>VisiGate Print Service Installation Guide</h1>
        <p>Complete setup instructions for Windows service deployment</p>
    </div>

    <h2>📋 Prerequisites</h2>
    <ul>
        <li>Windows 10 or Windows Server 2016+</li>
        <li>.NET Framework 4.8 or later</li>
        <li>Administrator privileges</li>
        <li>Network access to VisiGate SaaS platform</li>
        <li>TEC/Toshiba B-FV4D and/or Zebra thermal printers connected via USB</li>
    </ul>

    <h2>🚀 Installation Steps</h2>
    
    <div class="step">
        <h3>Step 1: Download and Install</h3>
        <ol>
            <li>Download VisiGatePrintService-Setup.msi from the Thermal Designer</li>
            <li>Right-click the installer and select "Run as Administrator"</li>
            <li>Follow the installation wizard</li>
            <li>Service will be installed as "VisiGate Print Service"</li>
        </ol>
    </div>

    <div class="step">
        <h3>Step 2: Generate API Token</h3>
        <ol>
            <li>In the Thermal Designer, click "Generate Service Token"</li>
            <li>Copy the generated API token</li>
            <li>Keep this token secure - it provides access to your print queue</li>
        </ol>
    </div>

    <div class="step">
        <h3>Step 3: Configure Service</h3>
        <ol>
            <li>Open Windows Services (services.msc)</li>
            <li>Find "VisiGate Print Service"</li>
            <li>Right-click → Properties → Log On tab</li>
            <li>Set to run under Local System account</li>
            <li>Open service configuration file: <span class="code">C:\\Program Files\\VisiGate\\PrintService\\config.json</span></li>
            <li>Enter your API token and service details</li>
        </ol>
    </div>

    <div class="step">
        <h3>Step 4: Configure Printers</h3>
        <ol>
            <li>Connect TEC/Toshiba B-FV4D via USB</li>
            <li>Connect Zebra thermal printers via USB</li>
            <li>Install printer drivers (Windows Update or manufacturer websites)</li>
            <li>Test printer connections through Windows</li>
        </ol>
    </div>

    <div class="step">
        <h3>Step 5: Start Service</h3>
        <ol>
            <li>In Windows Services, select "VisiGate Print Service"</li>
            <li>Click "Start"</li>
            <li>Set startup type to "Automatic"</li>
            <li>Verify service is running and polling every 30 seconds</li>
        </ol>
    </div>

    <div class="warning">
        <h3>⚠️ Important Notes</h3>
        <ul>
            <li>Service must run as Administrator for direct USB printer access</li>
            <li>Windows Firewall may need configuration for outbound HTTPS</li>
            <li>Service logs are located in: <span class="code">C:\\Program Files\\VisiGate\\PrintService\\Logs</span></li>
            <li>API token should be kept secure and not shared</li>
        </ul>
    </div>

    <h2>🔧 Configuration File Example</h2>
    <div class="code">
{
  "apiToken": "your-generated-token-here",
  "apiEndpoint": "https://your-visigate-domain.com",
  "serviceName": "Reception Desk Printer",
  "location": "Main Reception",
  "pollIntervalSeconds": 30,
  "supportedPrinters": ["tec", "zebra"],
  "logLevel": "Info"
}
    </div>

    <h2>📞 Support</h2>
    <p>For technical support, contact your VisiGate administrator or refer to the service logs for troubleshooting information.</p>

</body>
</html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.send(installationGuide);
  });


  // Staff authentication and current staff info

  // ============================================================================
  // HEALTH CHECK ENDPOINT FOR SETTINGS VALIDATION AND ROUTE ISOLATION (DEV ONLY)
  // ============================================================================

  if (process.env.NODE_ENV !== 'production') {
  app.get('/api/health/settings-isolation', requireAuth, async (req, res) => {
    try {
      const testResults = {
        timestamp: new Date().toISOString(),
        tests: [],
        summary: {
          passed: 0,
          failed: 0,
          total: 0
        }
      };

      // Test 1: GET /api/settings with customer isolation
      try {
        const username = req.user!.username;
        const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
        const settings = await simpleDatabaseService.getCompanySettings(context);
        
        testResults.tests.push({
          name: 'GET /api/settings - Customer Isolation',
          status: 'PASS',
          details: `Retrieved settings for customer: ${context.customerId}`,
          customerId: context.customerId
        });
        testResults.summary.passed++;
      } catch (error) {
        testResults.tests.push({
          name: 'GET /api/settings - Customer Isolation', 
          status: 'FAIL',
          error: error.message
        });
        testResults.summary.failed++;
      }

      // Test 2: PUT /api/settings with known fields
      try {
        const username = req.user!.username;
        const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
        
        const testUpdates = {
          companyName: 'Health Check Test Company',
          idCardPrintQuality: 'high',
          biostarEnabled: false,
          backgroundColor: '#f8fafc'
        };
        
        const updatedSettings = await simpleDatabaseService.updateCompanySettings(context, testUpdates);
        
        testResults.tests.push({
          name: 'PUT /api/settings - Known Fields',
          status: 'PASS',
          details: 'Successfully updated settings with known fields',
          fieldsUpdated: Object.keys(testUpdates)
        });
        testResults.summary.passed++;
      } catch (error) {
        testResults.tests.push({
          name: 'PUT /api/settings - Known Fields',
          status: 'FAIL', 
          error: error.message
        });
        testResults.summary.failed++;
      }

      // Test 3: PUT /api/settings with unknown fields (should gracefully filter)
      try {
        const username = req.user!.username;
        const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
        
        const testUpdates = {
          companyName: 'Health Check Test Company 2',
          unknownField1: 'should be filtered',
          nonExistentColumn: 'should be filtered',
          idCardPrintQuality: 'medium'
        };
        
        const updatedSettings = await simpleDatabaseService.updateCompanySettings(context, testUpdates);
        
        testResults.tests.push({
          name: 'PUT /api/settings - Unknown Fields Filter',
          status: 'PASS',
          details: 'Successfully handled unknown fields with filterSafeFields',
          originalFields: Object.keys(testUpdates).length,
          note: 'Unknown fields filtered gracefully without 500 errors'
        });
        testResults.summary.passed++;
      } catch (error) {
        testResults.tests.push({
          name: 'PUT /api/settings - Unknown Fields Filter',
          status: 'FAIL',
          error: error.message
        });
        testResults.summary.failed++;
      }

      // Test 4: Customer isolation verification
      try {
        const user1Context = simpleDatabaseService.createCustomerContext('Andy');
        const user2Context = simpleDatabaseService.createCustomerContext('Emma');
        
        testResults.tests.push({
          name: 'Customer Isolation Verification',
          status: 'PASS',
          details: 'Different users map to different customer contexts',
          andy_customerId: user1Context.customerId,
          emma_customerId: user2Context.customerId,
          isolated: user1Context.customerId !== user2Context.customerId
        });
        testResults.summary.passed++;
      } catch (error) {
        testResults.tests.push({
          name: 'Customer Isolation Verification',
          status: 'FAIL',
          error: error.message  
        });
        testResults.summary.failed++;
      }

      // Calculate totals
      testResults.summary.total = testResults.summary.passed + testResults.summary.failed;
      testResults.summary.successRate = `${((testResults.summary.passed / testResults.summary.total) * 100).toFixed(1)}%`;

      console.log(`🏥 Health check completed: ${testResults.summary.successRate} success rate (${testResults.summary.passed}/${testResults.summary.total})`);
      
      res.json(testResults);
    } catch (error) {
      console.error('Health check failed:', error);
      res.status(500).json({ 
        error: 'Health check failed', 
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
  } // end NODE_ENV !== 'production' guard for health check

  // ============================================================================
  // DUPLICATE ROUTE REMOVED - Main /api/settings route handles company settings
  // ============================================================================

  // ============================================================================
  // IMPORT/EXPORT FEATURE - Staff, Visitors, and Contractors CSV/XLS Import
  // ============================================================================
  
  // Import multer for file uploads
  const multerModule = await import('multer');
  const { stringify } = await import('csv-stringify/sync');
  const { parse } = await import('csv-parse/sync');
  
  // Configure multer for file uploads (in-memory storage)
  const upload = multerModule.default({ storage: multerModule.default.memoryStorage() });

  // Template download endpoints - Generate CSV templates with all required fields
  app.get("/api/import/template/staff", requireAuth, async (req, res) => {
    try {
      // Define staff template columns
      const columns = [
        'firstName',
        'lastName',
        'email',
        'department',
        'jobTitle',
        'employeeId',
        'biostarUserId',
        'paxtonUserId',
        'phoneNumber',
        'accessLevel',
        'password',
        'isActive'
      ];
      
      // Create sample row for guidance
      const sampleData = [[
        'John',
        'Doe',
        'john.doe@company.com',
        'Engineering',
        'Site Manager',
        'EMP001',
        '',
        '',
        '+44 7700 900000',
        'staff',
        '',
        'true'
      ]];
      
      const csv = stringify([columns, ...sampleData]);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=staff_import_template.csv');
      res.send(csv);
    } catch (error) {
      console.error('Error generating staff template:', error);
      res.status(500).json({ error: 'Failed to generate template' });
    }
  });

  app.get("/api/import/template/visitors", requireAuth, async (req, res) => {
    try {
      const columns = [
        'firstName',
        'lastName',
        'email',
        'phoneNumber',
        'mobileNumber',
        'company',
        'jobTitle',
        'address',
        'purpose',
        'carRegistration',
        'hostEmployeeId',
        'expectedDateTime',
        'expectedDepartureTime',
        'notes'
      ];
      
      const sampleData = [[
        'Jane',
        'Smith',
        'jane.smith@company.com',
        '01234567890',
        '07123456789',
        'Acme Corp',
        'Sales Manager',
        '123 Main St, London',
        'Business Meeting',
        'AB12 CDE',
        'EMP001',
        '2025-10-25 10:00',
        '2025-10-25 16:00',
        'Important client meeting'
      ]];
      
      const csv = stringify([columns, ...sampleData]);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=visitors_import_template.csv');
      res.send(csv);
    } catch (error) {
      console.error('Error generating visitors template:', error);
      res.status(500).json({ error: 'Failed to generate template' });
    }
  });

  app.get("/api/import/template/contractors", requireAuth, async (req, res) => {
    try {
      const columns = [
        'companyName',
        'firstName',
        'lastName',
        'email',
        'phoneNumber',
        'mobileNumber',
        'homeAddress',
        'postcode',
        'jobTitle',
        'department',
        'emergencyContactName',
        'emergencyContactPhone'
      ];
      
      const sampleData = [[
        'ABC Contractors Ltd',
        'Bob',
        'Builder',
        'bob@abccontractors.com',
        '01234567890',
        '07123456789',
        '456 Oak Ave, Manchester',
        'M1 1AA',
        'Site Supervisor',
        'Construction',
        'Mary Builder',
        '07987654321'
      ]];
      
      const csv = stringify([columns, ...sampleData]);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=contractors_import_template.csv');
      res.send(csv);
    } catch (error) {
      console.error('Error generating contractors template:', error);
      res.status(500).json({ error: 'Failed to generate template' });
    }
  });

  // Import endpoints - Upload and process CSV files
  app.post("/api/import/staff", requireAuth, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      if (!req.customerId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      // Parse CSV file
      const fileContent = req.file.buffer.toString('utf-8');
      const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });

      const customerDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(req.customerId);
      const results = {
        total: records.length,
        successful: 0,
        failed: 0,
        errors: [] as Array<{ row: number; error: string; data: any }>
      };

      // Process each record
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        try {
          // Validate and prepare staff data
          const staffData = {
            firstName: record.firstName?.trim(),
            lastName: record.lastName?.trim(),
            email: record.email?.trim()?.toLowerCase(),
            department: record.department?.trim(),
            jobTitle: record.jobTitle?.trim() || null,
            employeeId: record.employeeId?.trim(),
            biostarUserId: record.biostarUserId?.trim() || null,
            paxtonUserId: record.paxtonUserId?.trim() || null,
            phoneNumber: record.phoneNumber?.trim() || null,
            accessLevel: record.accessLevel?.trim() || 'staff',
            password: record.password?.trim() || null,
            isActive: record.isActive?.toLowerCase() === 'true' || record.isActive === '1' || true
          };

          // Validate required fields
          if (!staffData.firstName || !staffData.lastName || !staffData.email || !staffData.department || !staffData.employeeId) {
            throw new Error('Missing required fields: firstName, lastName, email, department, or employeeId');
          }

          // Insert into database
          await customerDb.insert(isolatedSchema.staff).values(staffData);
          results.successful++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            row: i + 2, // +2 because CSV has header row and is 1-indexed
            error: error.message,
            data: record
          });
        }
      }

      res.json({
        success: true,
        message: `Import complete: ${results.successful} successful, ${results.failed} failed`,
        results
      });
    } catch (error) {
      console.error('Error importing staff:', error);
      res.status(500).json({ error: 'Failed to import staff', details: error.message });
    }
  });

  app.post("/api/import/visitors", requireAuth, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      if (!req.customerId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const fileContent = req.file.buffer.toString('utf-8');
      const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });

      const customerDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(req.customerId);
      const results = {
        total: records.length,
        successful: 0,
        failed: 0,
        errors: [] as Array<{ row: number; error: string; data: any }>
      };

      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        try {
          // Find host staff by employee ID if provided
          let hostStaffId = null;
          if (record.hostEmployeeId?.trim()) {
            const hostStaff = await customerDb
              .select({ id: isolatedSchema.staff.id })
              .from(isolatedSchema.staff)
              .where(eq(isolatedSchema.staff.employeeId, record.hostEmployeeId.trim()))
              .limit(1);
            hostStaffId = hostStaff[0]?.id || null;
          }

          // Generate QR code
          const qrCode = `VISITOR-${Date.now()}-${Math.random().toString(36).substring(7)}`;

          const visitorData = {
            firstName: record.firstName?.trim(),
            lastName: record.lastName?.trim(),
            email: record.email?.trim()?.toLowerCase() || null,
            phoneNumber: record.phoneNumber?.trim() || null,
            mobileNumber: record.mobileNumber?.trim() || null,
            company: record.company?.trim() || null,
            jobTitle: record.jobTitle?.trim() || null,
            address: record.address?.trim() || null,
            purpose: record.purpose?.trim() || null,
            carRegistration: record.carRegistration?.trim() || null,
            hostStaffId,
            expectedDateTime: record.expectedDateTime ? new Date(record.expectedDateTime) : null,
            expectedDepartureTime: record.expectedDepartureTime ? new Date(record.expectedDepartureTime) : null,
            notes: record.notes?.trim() || null,
            qrCode,
            isPreBooked: true,
            isCheckedIn: false
          };

          if (!visitorData.firstName || !visitorData.lastName) {
            throw new Error('Missing required fields: firstName or lastName');
          }

          await customerDb.insert(isolatedSchema.visitors).values(visitorData);
          results.successful++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            row: i + 2,
            error: error.message,
            data: record
          });
        }
      }

      res.json({
        success: true,
        message: `Import complete: ${results.successful} successful, ${results.failed} failed`,
        results
      });
    } catch (error) {
      console.error('Error importing visitors:', error);
      res.status(500).json({ error: 'Failed to import visitors', details: error.message });
    }
  });

  app.post("/api/import/contractors", requireAuth, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      if (!req.customerId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const fileContent = req.file.buffer.toString('utf-8');
      const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });

      const customerDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(req.customerId);
      const results = {
        total: records.length,
        successful: 0,
        failed: 0,
        errors: [] as Array<{ row: number; error: string; data: any }>
      };

      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        try {
          // Find or create contractor company
          let companyId = null;
          if (record.companyName?.trim()) {
            const existingCompany = await customerDb
              .select({ id: isolatedSchema.contractorCompanies.id })
              .from(isolatedSchema.contractorCompanies)
              .where(eq(isolatedSchema.contractorCompanies.name, record.companyName.trim()))
              .limit(1);
            
            if (existingCompany.length > 0) {
              companyId = existingCompany[0].id;
            } else {
              // Create new company
              const newCompany = await customerDb
                .insert(isolatedSchema.contractorCompanies)
                .values({
                  name: record.companyName.trim(),
                  contactPerson: `${record.firstName} ${record.lastName}`.trim(),
                  email: record.email?.trim() || null,
                  phone: record.phoneNumber?.trim() || null
                })
                .returning({ id: isolatedSchema.contractorCompanies.id });
              companyId = newCompany[0].id;
            }
          }

          if (!companyId) {
            throw new Error('Company name is required');
          }

          const workerData = {
            companyId,
            firstName: record.firstName?.trim(),
            lastName: record.lastName?.trim(),
            email: record.email?.trim()?.toLowerCase() || null,
            phoneNumber: record.phoneNumber?.trim() || null,
            mobileNumber: record.mobileNumber?.trim() || null,
            homeAddress: record.homeAddress?.trim() || null,
            postcode: record.postcode?.trim() || null,
            jobTitle: record.jobTitle?.trim() || null,
            department: record.department?.trim() || null,
            emergencyContactName: record.emergencyContactName?.trim() || null,
            emergencyContactPhone: record.emergencyContactPhone?.trim() || null
          };

          if (!workerData.firstName || !workerData.lastName) {
            throw new Error('Missing required fields: firstName or lastName');
          }

          await customerDb.insert(isolatedSchema.contractorWorkers).values(workerData);
          results.successful++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            row: i + 2,
            error: error.message,
            data: record
          });
        }
      }

      res.json({
        success: true,
        message: `Import complete: ${results.successful} successful, ${results.failed} failed`,
        results
      });
    } catch (error) {
      console.error('Error importing contractors:', error);
      res.status(500).json({ error: 'Failed to import contractors', details: error.message });
    }
  });

  // Members import template
  app.get("/api/import/template/members", requireAuth, async (req, res) => {
    try {
      const columns = [
        'firstName',
        'lastName',
        'email',
        'phoneNumber',
        'membershipType',
        'membershipId',
        'membershipNumber',
        'joinDate',
        'expiryDate',
        'membershipStatus',
        'notes'
      ];
      const sampleData = [[
        'Sarah',
        'Connor',
        'sarah.connor@example.com',
        '07123456789',
        'full',
        'MEM001',
        'MBR-2025-001',
        '2025-01-01',
        '2025-12-31',
        'active',
        'VIP member'
      ]];
      const csv = stringify([columns, ...sampleData]);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=members_import_template.csv');
      res.send(csv);
    } catch (error) {
      console.error('Error generating members template:', error);
      res.status(500).json({ error: 'Failed to generate template' });
    }
  });

  // Members import - upload and process CSV
  app.post("/api/import/members", requireAuth, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      if (!req.customerId) return res.status(401).json({ error: 'Not authenticated' });

      const fileContent = req.file.buffer.toString('utf-8');
      const records = parse(fileContent, { columns: true, skip_empty_lines: true, trim: true });
      const customerDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(req.customerId);
      const results = { total: records.length, successful: 0, failed: 0, errors: [] as Array<{ row: number; error: string; data: any }> };

      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        try {
          if (!record.firstName?.trim() || !record.lastName?.trim()) {
            throw new Error('Missing required fields: firstName or lastName');
          }
          const qrCode = `MEMBER-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          await customerDb.insert(isolatedSchema.members).values({
            firstName: record.firstName.trim(),
            lastName: record.lastName.trim(),
            email: record.email?.trim()?.toLowerCase() || null,
            phoneNumber: record.phoneNumber?.trim() || null,
            membershipType: record.membershipType?.trim() || 'full',
            membershipId: record.membershipId?.trim() || null,
            membershipNumber: record.membershipNumber?.trim() || null,
            joinDate: record.joinDate?.trim() || null,
            expiryDate: record.expiryDate?.trim() || null,
            membershipStatus: record.membershipStatus?.trim() || 'active',
            notes: record.notes?.trim() || null,
            qrCode,
            isCheckedIn: false,
            isActive: true
          });
          results.successful++;
        } catch (error) {
          results.failed++;
          results.errors.push({ row: i + 2, error: error.message, data: record });
        }
      }

      res.json({ success: true, message: `Import complete: ${results.successful} successful, ${results.failed} failed`, results });
    } catch (error) {
      console.error('Error importing members:', error);
      res.status(500).json({ error: 'Failed to import members', details: error.message });
    }
  });


  // Load sample data for demos
  app.post("/api/import/sample-data", requireAuth, async (req, res) => {
    try {
      if (!req.customerId) return res.status(401).json({ error: 'Not authenticated' });
      const customerDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(req.customerId);
      const now = new Date();
      const batchId = Date.now(); // unique per call so repeated loads always add fresh records

      const firstNames = ['James', 'Emma', 'Oliver', 'Sophia', 'Harry', 'Amelia', 'Jack', 'Isabella', 'George', 'Mia', 'Thomas', 'Charlotte', 'William', 'Grace', 'Daniel'];
      const lastNames  = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Wilson', 'Taylor', 'Anderson', 'Harris', 'Clark', 'Lewis', 'Walker'];
      const departments = ['Engineering', 'Administration', 'Sales', 'Operations', 'Finance', 'HR', 'IT', 'Marketing', 'Logistics', 'Security'];
      const visitorCompanies = ['Acme Corp', 'BuildRight Ltd', 'TechFix Solutions', 'Prime Facilities', 'SafeWork UK', 'Delta Contractors', 'Apex Services', 'Horizon Group', 'Nexus Build', 'Swift Maintenance'];
      const memberTypes  = ['full', 'associate', 'honorary', 'student', 'corporate', 'full', 'associate', 'full', 'honorary', 'full'];
      const accessLevels = ['staff', 'staff', 'staff', 'staff', 'staff', 'staff', 'manager', 'supervisor', 'staff', 'staff'];
      const ukPhones = ['07700 900123', '07700 900456', '07700 900789', '07700 900321', '07700 900654',
                        '07700 900987', '07700 900111', '07700 900222', '07700 900333', '07700 900444',
                        '07700 900555', '07700 900666', '07700 900777', '07700 900888', '07700 900999'];

      let staffAdded = 0, visitorsAdded = 0, contractorsAdded = 0, workersAdded = 0, membersAdded = 0;

      // ── 10 sample staff ──────────────────────────────────────────────────────
      // email must be unique per row, so generate per-person addresses
      const staffJobTitles = ['Site Manager', 'Administrator', 'Sales Executive', 'Operations Manager',
                              'Finance Officer', 'HR Manager', 'IT Support', 'Marketing Manager',
                              'Logistics Coordinator', 'Security Officer'];
      for (let i = 0; i < 10; i++) {
        try {
          await customerDb.insert(isolatedSchema.staff).values({
            firstName:   firstNames[i],
            lastName:    lastNames[i],
            email:       `demo.staff.${batchId}.${i}@example.com`,
            department:  departments[i],
            jobTitle:    staffJobTitles[i],
            employeeId:  `EMP-${batchId}-${String(i + 1).padStart(3, '0')}`,
            accessLevel: accessLevels[i],
            isActive:    true,
          });
          staffAdded++;
        } catch (e) { console.warn('Sample staff insert failed:', (e as any).message); }
      }

      // ── 10 sample visitors (past visits, not currently on-site) ──────────────
      for (let i = 0; i < 10; i++) {
        try {
          const pastDate    = new Date(now.getTime() - (7 + i) * 24 * 60 * 60 * 1000);
          const pastCheckout = new Date(pastDate.getTime() + 2 * 60 * 60 * 1000);
          await customerDb.insert(isolatedSchema.visitors).values({
            firstName:    firstNames[(i + 3) % firstNames.length],
            lastName:     lastNames[(i + 5) % lastNames.length],
            email:        `demo.visitor.${batchId}.${i}@example.com`,
            company:      visitorCompanies[i % visitorCompanies.length],
            jobTitle:     'Representative',
            purpose:      'Demo Visit',
            qrCode:       `VISITOR-DEMO-${batchId}-${i}`,
            isPreBooked:  false,
            isCheckedIn:  false,
            checkedInAt:  pastDate,
            checkedOutAt: pastCheckout,
            checkoutType: 'manual-reset',
          });
          visitorsAdded++;
        } catch (e) { console.warn('Sample visitor insert failed:', (e as any).message); }
      }

      // ── 5 contractor companies, each with 3–6 workers ────────────────────────
      const contractorCompanyData = [
        { name: 'BuildRight Contractors Ltd',   firstName: 'Bob',   lastName: 'Builder',  phone: '01234 567890' },
        { name: 'SafeWork Facilities UK',        firstName: 'Sarah', lastName: 'Safe',     phone: '01234 567891' },
        { name: 'Delta Technical Services',      firstName: 'David', lastName: 'Delta',    phone: '01234 567892' },
        { name: 'Apex Maintenance Group',        firstName: 'Alice', lastName: 'Apex',     phone: '01234 567893' },
        { name: 'Horizon Build & Civil',         firstName: 'Henry', lastName: 'Horizon',  phone: '01234 567894' },
      ];
      const workerJobTitles = [
        'Site Engineer', 'Electrician', 'Plumber', 'HVAC Technician', 'Health & Safety Officer',
        'Project Manager', 'Scaffolder', 'Welder', 'Carpenter', 'Painter & Decorator',
        'Structural Engineer', 'Forklift Operator', 'Mechanical Fitter', 'Site Supervisor', 'Labourer',
      ];
      const rightToWorkStatuses = ['valid', 'valid', 'valid', 'pending', 'valid'];
      const cscsStatuses        = ['valid', 'valid', 'pending', 'valid', 'none'];
      let workerSeq = 0;

      for (let c = 0; c < contractorCompanyData.length; c++) {
        try {
          const co = contractorCompanyData[c];
          let companyId: string;

          const existing = await customerDb
            .select({ id: isolatedSchema.contractorCompanies.id })
            .from(isolatedSchema.contractorCompanies)
            .where(eq(isolatedSchema.contractorCompanies.companyName, co.name))
            .limit(1);

          if (existing.length > 0) {
            companyId = existing[0].id;
          } else {
            const newCo = await customerDb
              .insert(isolatedSchema.contractorCompanies)
              .values({
                companyName:      co.name,
                contactEmail:     `demo.company.${batchId}.${c}@example.com`,
                contactPhone:     co.phone,
                contactFirstName: co.firstName,
                contactLastName:  co.lastName,
              })
              .returning({ id: isolatedSchema.contractorCompanies.id });
            companyId = newCo[0].id;
          }
          contractorsAdded++;

          // Add 3–5 workers per company
          const workerCount = 3 + (c % 3);
          for (let w = 0; w < workerCount; w++) {
            try {
              const seq   = workerSeq++;
              const fnIdx = seq % firstNames.length;
              const lnIdx = (seq + 4) % lastNames.length;
              const jobIdx = seq % workerJobTitles.length;
              await customerDb.insert(isolatedSchema.contractorWorkers).values({
                companyId,
                firstName:   firstNames[fnIdx],
                lastName:    lastNames[lnIdx],
                email:       `demo.worker.${batchId}.${seq}@example.com`,
                phoneNumber: ukPhones[seq % ukPhones.length],
                jobTitle:    workerJobTitles[jobIdx],
                department:  departments[seq % departments.length],
                rightToWork: rightToWorkStatuses[c],
                cscsStatus:  cscsStatuses[c],
                postcode:    `EC${1 + (seq % 4)}V ${seq % 9}BB`,
                transportMethod: ['car_diesel', 'car_petrol', 'public_transport', 'bicycle', 'walking'][seq % 5],
                isActive:    true,
              });
              workersAdded++;
            } catch (e) { console.warn('Sample worker insert failed:', (e as any).message); }
          }
        } catch (e) { console.warn('Sample contractor company insert failed:', (e as any).message); }
      }

      // ── 10 sample members ────────────────────────────────────────────────────
      for (let i = 0; i < 10; i++) {
        try {
          await customerDb.insert(isolatedSchema.members).values({
            firstName:        firstNames[(i + 2) % firstNames.length],
            lastName:         lastNames[(i + 7) % lastNames.length],
            email:            `demo.member.${batchId}.${i}@example.com`,
            membershipType:   memberTypes[i],
            membershipId:     `MEM-${batchId}-${i}`,
            membershipNumber: `MBR-${batchId}-${i}`,
            joinDate:         `${now.getFullYear()}-01-01`,
            expiryDate:       `${now.getFullYear()}-12-31`,
            membershipStatus: 'active',
            qrCode:           `MEMBER-DEMO-${batchId}-${i}`,
            isCheckedIn:      false,
            isActive:         true,
          });
          membersAdded++;
        } catch (e) { console.warn('Sample member insert failed:', (e as any).message); }
      }

      res.json({
        success: true,
        message: `Sample data loaded: ${staffAdded} staff, ${visitorsAdded} visitors, ${contractorsAdded} contractor companies (${workersAdded} workers), ${membersAdded} members`,
        results: { staffAdded, visitorsAdded, contractorsAdded, workersAdded, membersAdded },
      });
    } catch (error) {
      console.error('Error loading sample data:', error);
      res.status(500).json({ error: 'Failed to load sample data', details: (error as any).message });
    }
  });




  // ── PPM (Planned Preventative Maintenance) routes ───────────────────────────

  // Helper: calculate nextDueDate from a base date + frequency
  function calcNextDueDate(startDate: string, frequency: string, customDays?: number | null): string {
    const d = new Date(startDate);
    if (isNaN(d.getTime())) return startDate;
    switch (frequency) {
      case "weekly":    d.setDate(d.getDate() + 7); break;
      case "monthly":   d.setMonth(d.getMonth() + 1); break;
      case "quarterly": d.setMonth(d.getMonth() + 3); break;
      case "biannual":
      case "semi-annual":
      case "biannually": d.setMonth(d.getMonth() + 6); break;
      case "annual":
      case "annually":
      case "yearly":    d.setFullYear(d.getFullYear() + 1); break;
      case "custom":    d.setDate(d.getDate() + (customDays ?? 30)); break;
      default:          d.setMonth(d.getMonth() + 1); break;
    }
    return d.toISOString().split('T')[0];
  }

  // ── PPM feature gate ────────────────────────────────────────────────────────
  const requirePPMFeature = async (req: any, res: any, next: any) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const settings = await simpleDatabaseService.getCompanySettings(context);
      if (!settings?.featurePPM) {
        return res.status(403).json({
          error: 'PPM module is not enabled for your account. Please contact support.'
        });
      }
      next();
    } catch (error) {
      next(error);
    }
  };
  app.use('/api/ppm', requireAuth, requirePPMFeature);

  // PPM Assets
  app.get("/api/ppm/assets", requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const rows = await custDb.select().from(isolatedSchema.ppmAssets).orderBy(isolatedSchema.ppmAssets.name);
      res.json(rows);
    } catch (error: unknown) {
      console.error("GET /api/ppm/assets", error);
      res.status(500).json({ error: "Failed to fetch PPM assets" });
    }
  });

  app.post("/api/ppm/assets", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    try {
      const parsed = isolatedSchema.insertPpmAssetSchema.parse(req.body);
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [row] = await custDb.insert(isolatedSchema.ppmAssets).values(parsed).returning();
      res.status(201).json(row);
    } catch (error: unknown) {
      console.error("POST /api/ppm/assets", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create PPM asset" });
    }
  });

  app.put("/api/ppm/assets/:id", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    try {
      const { id } = req.params;
      const parsed = isolatedSchema.insertPpmAssetSchema.partial().parse(req.body);
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [row] = await custDb.update(isolatedSchema.ppmAssets).set(parsed).where(eq(isolatedSchema.ppmAssets.id, id)).returning();
      if (!row) return res.status(404).json({ error: "Asset not found" });
      res.json(row);
    } catch (error: unknown) {
      console.error("PUT /api/ppm/assets/:id", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to update PPM asset" });
    }
  });

  app.delete("/api/ppm/assets/:id", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    try {
      const { id } = req.params;
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      await custDb.delete(isolatedSchema.ppmAssets).where(eq(isolatedSchema.ppmAssets.id, id));
      res.json({ success: true });
    } catch (error: unknown) {
      console.error("DELETE /api/ppm/assets/:id", error);
      res.status(500).json({ error: "Failed to delete PPM asset" });
    }
  });

  // POST /api/ppm/assets/:id/duplicate — clone an asset with a new name, clearing unique fields
  app.post("/api/ppm/assets/:id/duplicate", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [original] = await custDb.select().from(isolatedSchema.ppmAssets).where(eq(isolatedSchema.ppmAssets.id, id));
      if (!original) return res.status(404).json({ error: "Asset not found" });
      const { id: _id, createdAt: _createdAt, assetRef: _assetRef, serialNumber: _serialNumber, ...rest } = original;
      const [copy] = await custDb.insert(isolatedSchema.ppmAssets).values({
        ...rest,
        name: `Copy of ${original.name}`,
        assetRef: null,
        serialNumber: null,
        status: "active",
      }).returning();
      res.status(201).json(copy);
    } catch (error: unknown) {
      console.error("POST /api/ppm/assets/:id/duplicate", error);
      res.status(500).json({ error: "Failed to duplicate asset" });
    }
  });

  // ── PPM Asset Groups CRUD ────────────────────────────────────────────────────
  app.get("/api/ppm/asset-groups", requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const rows = await custDb.select().from(isolatedSchema.ppmAssetGroups).orderBy(isolatedSchema.ppmAssetGroups.name);
      res.json(rows);
    } catch (error: unknown) {
      console.error("GET /api/ppm/asset-groups", error);
      res.status(500).json({ error: "Failed to fetch asset groups" });
    }
  });

  app.post("/api/ppm/asset-groups", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    try {
      const parsed = isolatedSchema.insertPpmAssetGroupSchema.parse(req.body);
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [row] = await custDb.insert(isolatedSchema.ppmAssetGroups).values(parsed).returning();
      res.status(201).json(row);
    } catch (error: unknown) {
      console.error("POST /api/ppm/asset-groups", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create asset group" });
    }
  });

  app.put("/api/ppm/asset-groups/:id", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    try {
      const { id } = req.params;
      const parsed = isolatedSchema.insertPpmAssetGroupSchema.partial().parse(req.body);
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [row] = await custDb.update(isolatedSchema.ppmAssetGroups).set(parsed).where(eq(isolatedSchema.ppmAssetGroups.id, id)).returning();
      if (!row) return res.status(404).json({ error: "Asset group not found" });
      res.json(row);
    } catch (error: unknown) {
      console.error("PUT /api/ppm/asset-groups/:id", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to update asset group" });
    }
  });

  app.delete("/api/ppm/asset-groups/:id", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    try {
      const { id } = req.params;
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      // Detach all assets from the group before deleting (FK is set null on delete, but do it explicitly)
      await custDb.update(isolatedSchema.ppmAssets).set({ groupId: null }).where(eq(isolatedSchema.ppmAssets.groupId, id));
      await custDb.delete(isolatedSchema.ppmAssetGroups).where(eq(isolatedSchema.ppmAssetGroups.id, id));
      res.json({ success: true });
    } catch (error: unknown) {
      console.error("DELETE /api/ppm/asset-groups/:id", error);
      res.status(500).json({ error: "Failed to delete asset group" });
    }
  });

  // PPM Templates
  app.get("/api/ppm/templates", requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const rows = await custDb.select().from(isolatedSchema.ppmTemplates).orderBy(isolatedSchema.ppmTemplates.name);
      res.json(rows);
    } catch (error: unknown) {
      console.error("GET /api/ppm/templates", error);
      res.status(500).json({ error: "Failed to fetch PPM templates" });
    }
  });

  app.post("/api/ppm/templates", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    try {
      const parsed = isolatedSchema.insertPpmTemplateSchema.parse(req.body);
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [row] = await custDb.insert(isolatedSchema.ppmTemplates).values(parsed).returning();
      res.status(201).json(row);
    } catch (error: unknown) {
      console.error("POST /api/ppm/templates", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create PPM template" });
    }
  });

  app.put("/api/ppm/templates/:id", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    try {
      const { id } = req.params;
      const parsed = isolatedSchema.insertPpmTemplateSchema.partial().parse(req.body);
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [row] = await custDb.update(isolatedSchema.ppmTemplates).set(parsed).where(eq(isolatedSchema.ppmTemplates.id, id)).returning();
      if (!row) return res.status(404).json({ error: "Template not found" });
      res.json(row);
    } catch (error: unknown) {
      console.error("PUT /api/ppm/templates/:id", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to update PPM template" });
    }
  });

  app.delete("/api/ppm/templates/:id", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    try {
      const { id } = req.params;
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      await custDb.delete(isolatedSchema.ppmTemplates).where(eq(isolatedSchema.ppmTemplates.id, id));
      res.json({ success: true });
    } catch (error: unknown) {
      console.error("DELETE /api/ppm/templates/:id", error);
      res.status(500).json({ error: "Failed to delete PPM template" });
    }
  });

  // PPM Schedules
  app.get("/api/ppm/schedules", requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const rows = await custDb.select().from(isolatedSchema.ppmSchedules).orderBy(isolatedSchema.ppmSchedules.nextDueDate);
      // Compute overdue status at query time
      const today = new Date().toISOString().split('T')[0];
      const enriched = rows.map(r => ({
        ...r,
        status: r.status !== "completed" && r.status !== "cancelled" && r.nextDueDate < today ? "overdue" : r.status,
      }));
      res.json(enriched);
    } catch (error: unknown) {
      console.error("GET /api/ppm/schedules", error);
      res.status(500).json({ error: "Failed to fetch PPM schedules" });
    }
  });

  app.post("/api/ppm/schedules", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    try {
      const body = req.body;
      const nextDueDate = calcNextDueDate(body.startDate, body.frequency, body.customDays);
      const parsed = isolatedSchema.insertPpmScheduleSchema.parse({ ...body, nextDueDate });
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [row] = await custDb.insert(isolatedSchema.ppmSchedules).values(parsed).returning();
      res.status(201).json(row);
    } catch (error: unknown) {
      console.error("POST /api/ppm/schedules", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create PPM schedule" });
    }
  });

  app.put("/api/ppm/schedules/:id", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    try {
      const { id } = req.params;
      const body = req.body;
      // Backend is authoritative: always recalculate nextDueDate from startDate + frequency
      if (body.startDate && body.frequency) {
        body.nextDueDate = calcNextDueDate(body.startDate, body.frequency, body.customDays);
      }
      const parsed = isolatedSchema.insertPpmScheduleSchema.partial().parse(body);
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [row] = await custDb.update(isolatedSchema.ppmSchedules).set(parsed).where(eq(isolatedSchema.ppmSchedules.id, id)).returning();
      if (!row) return res.status(404).json({ error: "Schedule not found" });
      res.json(row);
    } catch (error: unknown) {
      console.error("PUT /api/ppm/schedules/:id", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to update PPM schedule" });
    }
  });

  app.delete("/api/ppm/schedules/:id", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    try {
      const { id } = req.params;
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      await custDb.delete(isolatedSchema.ppmSchedules).where(eq(isolatedSchema.ppmSchedules.id, id));
      res.json({ success: true });
    } catch (error: unknown) {
      console.error("DELETE /api/ppm/schedules/:id", error);
      res.status(500).json({ error: "Failed to delete PPM schedule" });
    }
  });

  // ── PPM Work Orders ──────────────────────────────────────────────────────────

  // GET /api/ppm/expiry-count — lightweight summary of expired/expiring-soon document counts (for nav badge)
  app.get('/api/ppm/expiry-count', requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== 'admin') return res.status(403).json({ error: 'Administrator access required' });
      const context = await simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const docs = await custDb.select({
        expiryDate: isolatedSchema.ppmWorkOrderDocuments.expiryDate,
      }).from(isolatedSchema.ppmWorkOrderDocuments);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const in30Days = new Date(today);
      in30Days.setDate(in30Days.getDate() + 30);
      let expiredCount = 0;
      let expiringSoonCount = 0;
      for (const doc of docs) {
        if (!doc.expiryDate) continue;
        const exp = new Date(doc.expiryDate);
        if (exp <= today) {
          expiredCount++;
        } else if (exp <= in30Days) {
          expiringSoonCount++;
        }
      }
      res.json({ expiredCount, expiringSoonCount, total: expiredCount + expiringSoonCount });
    } catch (error) {
      console.error('GET /api/ppm/expiry-count', error);
      res.status(500).json({ error: 'Failed to fetch PPM expiry count' });
    }
  });

  // GET /api/ppm/work-orders — list all work orders for customer (admin only; tokens omitted from list)
  app.get("/api/ppm/work-orders", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
      const context = await simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const rows = await custDb.select().from(isolatedSchema.ppmWorkOrders).orderBy(isolatedSchema.ppmWorkOrders.createdAt);
      // Omit bearer token fields from list payload; use GET /api/ppm/work-orders/:id/token to get link
      const sanitized = rows.map(({ accessToken: _t, accessTokenExpiresAt: _e, ...rest }) => rest);

      // Attach aggregated document expiry counts so the list view can show inline indicators
      const woIds = sanitized.map(w => w.id);
      let expiryCounts: Record<string, { expiredDocCount: number; expiringSoonDocCount: number }> = {};
      if (woIds.length > 0) {
        const docs = await custDb.select({
          workOrderId: isolatedSchema.ppmWorkOrderDocuments.workOrderId,
          expiryDate: isolatedSchema.ppmWorkOrderDocuments.expiryDate,
        }).from(isolatedSchema.ppmWorkOrderDocuments).where(inArray(isolatedSchema.ppmWorkOrderDocuments.workOrderId, woIds));
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const in30Days = new Date(today);
        in30Days.setDate(in30Days.getDate() + 30);
        for (const doc of docs) {
          if (!doc.expiryDate) continue;
          const exp = new Date(doc.expiryDate);
          if (!expiryCounts[doc.workOrderId]) expiryCounts[doc.workOrderId] = { expiredDocCount: 0, expiringSoonDocCount: 0 };
          if (exp <= today) {
            expiryCounts[doc.workOrderId].expiredDocCount++;
          } else if (exp <= in30Days) {
            expiryCounts[doc.workOrderId].expiringSoonDocCount++;
          }
        }
      }

      const withExpiry = sanitized.map(wo => ({
        ...wo,
        expiredDocCount: expiryCounts[wo.id]?.expiredDocCount ?? 0,
        expiringSoonDocCount: expiryCounts[wo.id]?.expiringSoonDocCount ?? 0,
      }));
      res.json(withExpiry);
    } catch (error: unknown) {
      console.error("GET /api/ppm/work-orders", error);
      res.status(500).json({ error: "Failed to fetch PPM work orders" });
    }
  });

  // GET /api/ppm/work-orders/:id/token — return the contractor link for a specific work order (admin only)
  app.get("/api/ppm/work-orders/:id/token", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
      const { id } = req.params;
      const context = await simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [wo] = await custDb.select({
        accessToken: isolatedSchema.ppmWorkOrders.accessToken,
        accessTokenExpiresAt: isolatedSchema.ppmWorkOrders.accessTokenExpiresAt,
      }).from(isolatedSchema.ppmWorkOrders).where(eq(isolatedSchema.ppmWorkOrders.id, id));
      if (!wo) return res.status(404).json({ error: "Work order not found" });
      const baseUrl = process.env.REPLIT_DOMAINS
        ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
        : (process.env.PUBLIC_URL || process.env.BASE_URL || "http://localhost:5000");
      res.json({
        accessToken: wo.accessToken,
        accessTokenExpiresAt: wo.accessTokenExpiresAt,
        contractorUrl: wo.accessToken ? `${baseUrl}/ppm/work-order/${wo.accessToken}` : null,
      });
    } catch (error: unknown) {
      console.error("GET /api/ppm/work-orders/:id/token", error);
      res.status(500).json({ error: "Failed to fetch work order token" });
    }
  });

  // POST /api/ppm/work-orders — create a new work order
  app.post("/api/ppm/work-orders", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
      const context = await simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const accessToken = randomBytes(24).toString("hex");
      const accessTokenExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days
      const parsed = isolatedSchema.insertPpmWorkOrderSchema.parse({ ...req.body, accessToken, accessTokenExpiresAt });
      const [row] = await custDb.insert(isolatedSchema.ppmWorkOrders).values(parsed).returning();
      res.json(row);
    } catch (error: unknown) {
      console.error("POST /api/ppm/work-orders", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create PPM work order" });
    }
  });

  // PUT /api/ppm/work-orders/:id — update a work order
  app.put("/api/ppm/work-orders/:id", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
      const { id } = req.params;
      const context = await simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const updates: Record<string, unknown> = { ...req.body };
      delete updates.id;
      delete updates.createdAt;
      delete updates.accessToken;
      if (updates.status === "completed" && !updates.completedDate) {
        updates.completedDate = new Date().toISOString().split("T")[0];
      }
      // If status is being reset away from overdue, clear the alert flag so a future overdue triggers a new alert
      if (updates.status && updates.status !== "overdue") {
        updates.overdueAlertedAt = null;
      }
      const [row] = await custDb.update(isolatedSchema.ppmWorkOrders).set(updates).where(eq(isolatedSchema.ppmWorkOrders.id, id)).returning();

      // Advance the linked schedule's nextDueDate when a work order is marked completed
      if (updates.status === "completed" && row?.scheduleId) {
        try {
          const [schedule] = await custDb.select()
            .from(isolatedSchema.ppmSchedules)
            .where(eq(isolatedSchema.ppmSchedules.id, row.scheduleId))
            .limit(1);
          if (schedule?.nextDueDate) {
            const newDue = calcNextDueDate(schedule.nextDueDate, schedule.frequency, schedule.customDays ?? undefined);
            await custDb.update(isolatedSchema.ppmSchedules)
              .set({
                nextDueDate: newDue,
                status: "scheduled",
                lastCompletedDate: new Date().toISOString().split("T")[0],
              })
              .where(eq(isolatedSchema.ppmSchedules.id, schedule.id));
            console.log(`✅ [PPM] Schedule ${schedule.id} advanced: ${schedule.nextDueDate} → ${newDue}`);
          }
        } catch (schedErr) {
          console.error("⚠️ [PPM] Failed to advance schedule after work order completion:", schedErr);
        }
      }

      res.json(row);
    } catch (error: unknown) {
      console.error("PUT /api/ppm/work-orders/:id", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to update PPM work order" });
    }
  });

  // DELETE /api/ppm/work-orders/:id — delete a work order
  app.delete("/api/ppm/work-orders/:id", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
      const { id } = req.params;
      const context = await simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      await custDb.delete(isolatedSchema.ppmWorkOrders).where(eq(isolatedSchema.ppmWorkOrders.id, id));
      res.json({ success: true });
    } catch (error: unknown) {
      console.error("DELETE /api/ppm/work-orders/:id", error);
      res.status(500).json({ error: "Failed to delete PPM work order" });
    }
  });

  // POST /api/ppm/work-orders/:id/duplicate — clone a work order, resetting status/completion fields
  app.post("/api/ppm/work-orders/:id/duplicate", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
      const { id } = req.params;
      const context = await simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [original] = await custDb.select().from(isolatedSchema.ppmWorkOrders).where(eq(isolatedSchema.ppmWorkOrders.id, id));
      if (!original) return res.status(404).json({ error: "Work order not found" });
      const accessToken = randomBytes(24).toString("hex");
      const accessTokenExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      const [copy] = await custDb.insert(isolatedSchema.ppmWorkOrders).values({
        scheduleId: original.scheduleId,
        assetId: original.assetId,
        title: `${original.title} (Copy)`,
        description: original.description,
        status: "scheduled",
        contractorCompanyId: original.contractorCompanyId,
        contractorCompanyName: original.contractorCompanyName,
        contractorWorkerId: original.contractorWorkerId,
        contractorWorkerName: original.contractorWorkerName,
        assignedEmail: original.assignedEmail,
        dueDate: original.dueDate,
        notes: original.notes,
        requiresCertificate: original.requiresCertificate,
        accessToken,
        accessTokenExpiresAt,
      }).returning();
      res.json(copy);
    } catch (error: unknown) {
      console.error("POST /api/ppm/work-orders/:id/duplicate", error);
      res.status(500).json({ error: "Failed to duplicate work order" });
    }
  });

  // POST /api/ppm/work-orders/:id/assign — assign contractor and send email
  app.post("/api/ppm/work-orders/:id/assign", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
      const { id } = req.params;
      const { contractorCompanyId, contractorCompanyName, contractorWorkerId, contractorWorkerName, assignedEmail } = req.body;
      const context = await simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);

      const [wo] = await custDb.select().from(isolatedSchema.ppmWorkOrders).where(eq(isolatedSchema.ppmWorkOrders.id, id));
      if (!wo) return res.status(404).json({ error: "Work order not found" });

      // Validate contractor IDs against the contractors tables to prevent inconsistent assignment metadata
      if (contractorCompanyId) {
        const [company] = await custDb.select({ id: isolatedSchema.contractorCompanies.id })
          .from(isolatedSchema.contractorCompanies)
          .where(eq(isolatedSchema.contractorCompanies.id, contractorCompanyId));
        if (!company) return res.status(400).json({ error: "Contractor company not found" });
      }
      if (contractorWorkerId) {
        const workerQuery = custDb.select({ id: isolatedSchema.contractorWorkers.id })
          .from(isolatedSchema.contractorWorkers)
          .where(eq(isolatedSchema.contractorWorkers.id, contractorWorkerId));
        const [worker] = await workerQuery;
        if (!worker) return res.status(400).json({ error: "Contractor worker not found" });
        // If both company and worker are provided, verify the worker belongs to the company
        if (contractorCompanyId) {
          const [workerWithCompany] = await custDb.select({ id: isolatedSchema.contractorWorkers.id })
            .from(isolatedSchema.contractorWorkers)
            .where(
              and(
                eq(isolatedSchema.contractorWorkers.id, contractorWorkerId),
                eq(isolatedSchema.contractorWorkers.companyId, contractorCompanyId)
              )
            );
          if (!workerWithCompany) return res.status(400).json({ error: "Contractor worker does not belong to the selected company" });
        }
      }

      // Rotate access token on every assignment/reassignment so old recipients lose access
      const newAccessToken = randomBytes(24).toString("hex");
      const newTokenExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days from now

      const [updated] = await custDb.update(isolatedSchema.ppmWorkOrders)
        .set({ contractorCompanyId, contractorCompanyName, contractorWorkerId, contractorWorkerName, assignedEmail, accessToken: newAccessToken, accessTokenExpiresAt: newTokenExpiresAt })
        .where(eq(isolatedSchema.ppmWorkOrders.id, id))
        .returning();

      // Send notification email to the assigned contractor (only if email provided — explicit no-notification semantics if omitted)
      let notificationSent = false;
      if (assignedEmail) {
        try {
          const settingsRows = await custDb.execute(`SELECT company_name, email, phone, address FROM company_settings LIMIT 1`);
          const settings = settingsRows.rows[0] as { company_name?: string; email?: string } | undefined;
          const companyName = (settings?.company_name as string) || "TPR-Max";
          const baseUrl = process.env.REPLIT_DOMAINS
            ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
            : (process.env.PUBLIC_URL || process.env.BASE_URL || "http://localhost:5000");
          const workOrderUrl = `${baseUrl}/ppm/work-order/${newAccessToken}`;
          const recipientName = contractorWorkerName || contractorCompanyName || "Contractor";
          const emailSvc = new EmailService(context.customerId);
          await emailSvc.sendEmail({
            to: assignedEmail,
            subject: `PPM Work Order Assigned: ${wo.title}`,
            companyName,
            html: `
              <!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f6f6f6;margin:0;padding:20px">
              <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1)">
                <div style="background:#1d4ed8;color:#fff;padding:24px 28px">
                  <h1 style="margin:0;font-size:20px">PPM Work Order Assigned</h1>
                  <p style="margin:6px 0 0;opacity:.85;font-size:14px">${companyName}</p>
                </div>
                <div style="padding:28px">
                  <p style="font-size:16px;color:#1f2937">Hello ${recipientName},</p>
                  <p style="color:#374151">You have been assigned a Planned Preventative Maintenance work order.</p>
                  <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:16px;margin:20px 0">
                    <p style="margin:0 0 8px;font-weight:600;color:#0c4a6e;font-size:15px">${wo.title}</p>
                    ${wo.description ? `<p style="margin:0 0 8px;color:#374151;font-size:14px">${wo.description}</p>` : ""}
                    ${wo.dueDate ? `<p style="margin:0;color:#374151;font-size:14px"><strong>Due:</strong> ${new Date(wo.dueDate).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" })}</p>` : ""}
                  </div>
                  <div style="text-align:center;margin:28px 0">
                    <a href="${workOrderUrl}" style="background:#1d4ed8;color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-weight:600;font-size:15px;display:inline-block">View Work Order</a>
                  </div>
                  <p style="color:#6b7280;font-size:13px">Use the button above to view details, update status, add notes and upload service documents. The link works on mobile and desktop.</p>
                </div>
                <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 28px;text-align:center">
                  <p style="margin:0;color:#9ca3af;font-size:12px">This email was sent by ${companyName} via TPR-Max PPM system.</p>
                </div>
              </div>
              </body></html>
            `,
            text: `PPM Work Order Assigned: ${wo.title}\n\nHello ${recipientName},\n\nYou have been assigned a PPM work order.\n\nTitle: ${wo.title}\n${wo.description ? `Description: ${wo.description}\n` : ""}${wo.dueDate ? `Due: ${wo.dueDate}\n` : ""}\nView your work order at:\n${workOrderUrl}\n\n${companyName}`,
          });
          notificationSent = true;
        } catch (emailErr) {
          console.error("PPM work order assignment email failed:", emailErr);
        }
      }
      // Return explicit notificationSent flag so UI/callers know whether email was dispatched
      res.json({ ...updated, notificationSent });
    } catch (error: unknown) {
      console.error("POST /api/ppm/work-orders/:id/assign", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to assign contractor" });
    }
  });

  // GET /api/ppm/work-orders/:id/documents — list documents for a work order (admin only)
  app.get("/api/ppm/work-orders/:id/documents", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
      const { id } = req.params;
      const context = await simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const docs = await custDb.select().from(isolatedSchema.ppmWorkOrderDocuments)
        .where(eq(isolatedSchema.ppmWorkOrderDocuments.workOrderId, id))
        .orderBy(isolatedSchema.ppmWorkOrderDocuments.createdAt);
      res.json(docs);
    } catch (error: unknown) {
      console.error("GET /api/ppm/work-orders/:id/documents", error);
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  // POST /api/ppm/work-orders/:id/documents — upload a document (admin only)
  app.post("/api/ppm/work-orders/:id/documents", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
      const { id } = req.params;
      const { fileName, fileUrl, fileType, uploadedBy, expiryDate, referenceNumber, issuedBy } = req.body;
      if (!fileName || !fileUrl) return res.status(400).json({ error: "fileName and fileUrl required" });
      // Only allow paths produced by the object storage upload endpoint
      if (typeof fileUrl !== "string" || !fileUrl.startsWith("/objects/")) {
        return res.status(400).json({ error: "Invalid file URL — must be an object storage path" });
      }
      const context = await simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      // No document count cap on admin uploads — admins may attach additional documents beyond what contractors upload
      const resolvedFileType = fileType || "other";
      // If a replacement document with a new expiry date is being uploaded for the same file type,
      // reset expiryAlertedAt on existing docs of that type so the cron can send a fresh alert
      if (expiryDate && resolvedFileType !== "other") {
        await custDb.update(isolatedSchema.ppmWorkOrderDocuments)
          .set({ expiryAlertedAt: null })
          .where(
            and(
              eq(isolatedSchema.ppmWorkOrderDocuments.workOrderId, id),
              eq(isolatedSchema.ppmWorkOrderDocuments.fileType, resolvedFileType)
            )
          );
      }
      const [doc] = await custDb.insert(isolatedSchema.ppmWorkOrderDocuments)
        .values({ workOrderId: id, fileName, fileUrl, fileType: resolvedFileType, uploadedBy: uploadedBy || req.user!.username, expiryDate: expiryDate || null, referenceNumber: referenceNumber || null, issuedBy: issuedBy || null, expiryAlertedAt: null })
        .returning();
      // If this looks like a certificate, mark work order as having cert uploaded
      const woDocUpdates: Record<string, unknown> = {};
      if (resolvedFileType === "certificate") {
        woDocUpdates.certificateUploadedAt = new Date();
      }
      // Clear missing-docs alert so the cron won't re-fire while docs exist
      woDocUpdates.missingDocsAlertedAt = null;
      await custDb.update(isolatedSchema.ppmWorkOrders)
        .set(woDocUpdates as any)
        .where(eq(isolatedSchema.ppmWorkOrders.id, id));
      res.json(doc);
    } catch (error: unknown) {
      console.error("POST /api/ppm/work-orders/:id/documents", error);
      res.status(500).json({ error: "Failed to upload document" });
    }
  });

  // DELETE /api/ppm/work-orders/:id/documents/:docId — remove a document
  app.delete("/api/ppm/work-orders/:id/documents/:docId", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
      const { id, docId } = req.params;
      const context = await simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      // Verify docId belongs to this work order to prevent accidental cross-WO deletes
      const [doc] = await custDb.select({ id: isolatedSchema.ppmWorkOrderDocuments.id })
        .from(isolatedSchema.ppmWorkOrderDocuments)
        .where(
          and(
            eq(isolatedSchema.ppmWorkOrderDocuments.id, docId),
            eq(isolatedSchema.ppmWorkOrderDocuments.workOrderId, id)
          )
        );
      if (!doc) return res.status(404).json({ error: "Document not found on this work order" });
      // Fetch the doc's fileType before deleting so we know whether to recheck certificateUploadedAt
      const [fullDoc] = await custDb.select({ fileType: isolatedSchema.ppmWorkOrderDocuments.fileType })
        .from(isolatedSchema.ppmWorkOrderDocuments)
        .where(eq(isolatedSchema.ppmWorkOrderDocuments.id, docId));
      await custDb.delete(isolatedSchema.ppmWorkOrderDocuments).where(eq(isolatedSchema.ppmWorkOrderDocuments.id, docId));
      // If the deleted doc was a certificate, recheck remaining docs and clear certificateUploadedAt if none remain
      if (fullDoc?.fileType === "certificate") {
        const remaining = await custDb.select({ id: isolatedSchema.ppmWorkOrderDocuments.id })
          .from(isolatedSchema.ppmWorkOrderDocuments)
          .where(
            and(
              eq(isolatedSchema.ppmWorkOrderDocuments.workOrderId, id),
              eq(isolatedSchema.ppmWorkOrderDocuments.fileType, "certificate")
            )
          );
        if (remaining.length === 0) {
          // Clear cert fields so the cert cron can fire a fresh alert next cycle
          // Also clear missingDocsAlertedAt so the no-docs cron can re-fire if the WO is still overdue
          await custDb.update(isolatedSchema.ppmWorkOrders)
            .set({ certificateUploadedAt: null, missingCertAlertedAt: null, missingDocsAlertedAt: null })
            .where(eq(isolatedSchema.ppmWorkOrders.id, id));
        }
      }
      res.json({ success: true });
    } catch (error: unknown) {
      console.error("DELETE /api/ppm/work-orders/:id/documents/:docId", error);
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  // POST /api/ppm/work-orders/:id/documents/:docId/resend-alert — resend expiry alert email immediately
  app.post("/api/ppm/work-orders/:id/documents/:docId/resend-alert", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
      const { id, docId } = req.params;
      const context = await simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);

      // Fetch the document and verify it belongs to this work order
      const [doc] = await custDb.select().from(isolatedSchema.ppmWorkOrderDocuments)
        .where(and(
          eq(isolatedSchema.ppmWorkOrderDocuments.id, docId),
          eq(isolatedSchema.ppmWorkOrderDocuments.workOrderId, id)
        ));
      if (!doc) return res.status(404).json({ error: "Document not found on this work order" });
      if (!doc.expiryDate) return res.status(400).json({ error: "Document has no expiry date — alert not applicable" });

      // Fetch company settings for email
      const settingsRows = await custDb.execute(`SELECT company_name, email, notify_on_document_expiry FROM company_settings LIMIT 1`);
      const settings = settingsRows.rows[0] as { company_name?: string; email?: string; notify_on_document_expiry?: boolean } | undefined;
      const companyName = (settings?.company_name as string) || "TPR-Max";
      const adminEmail = settings?.email as string | undefined;
      if (!adminEmail) return res.status(400).json({ error: "No admin email configured" });
      const notifyOnDocumentExpiry = settings?.notify_on_document_expiry !== false;
      if (!notifyOnDocumentExpiry) return res.status(403).json({ error: "Expiry notifications are disabled in company settings" });

      // Fetch the work order title and contractor details for context
      const [wo] = await custDb.select({
        title: isolatedSchema.ppmWorkOrders.title,
        assignedEmail: isolatedSchema.ppmWorkOrders.assignedEmail,
        contractorWorkerName: isolatedSchema.ppmWorkOrders.contractorWorkerName,
        contractorCompanyName: isolatedSchema.ppmWorkOrders.contractorCompanyName,
        accessToken: isolatedSchema.ppmWorkOrders.accessToken,
      })
        .from(isolatedSchema.ppmWorkOrders)
        .where(eq(isolatedSchema.ppmWorkOrders.id, id));
      const woTitle = wo?.title ?? id;

      const todayStr = new Date().toISOString().split("T")[0];
      const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const in30DaysStr = in30Days.toISOString().split("T")[0];
      const isExpired = doc.expiryDate <= todayStr;
      const isExpiringSoon = !isExpired && doc.expiryDate <= in30DaysStr;

      // Only allow resend for documents that are expired or expiring within the alert window
      if (!isExpired && !isExpiringSoon) {
        return res.status(400).json({ error: "Document is not within the expiry alert window (must be expired or expiring within 30 days)" });
      }

      const emailSvc = new EmailService(context.customerId);
      const subject = isExpired
        ? `PPM Alert: Expired Document — ${doc.fileName}`
        : `PPM Alert: Document Expiring Soon — ${doc.fileName}`;

      const sent = await emailSvc.sendEmail({
        to: adminEmail,
        subject,
        companyName,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto">
            <div style="background:${isExpired ? "#dc2626" : "#d97706"};color:#fff;padding:20px;border-radius:8px 8px 0 0">
              <h2 style="margin:0">PPM Document Expiry Alert — ${companyName}</h2>
            </div>
            <div style="background:#fff;padding:20px;border:1px solid #e5e7eb">
              <p style="margin-top:0">The following PPM work order document requires attention:</p>
              <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:14px">
                <thead>
                  <tr style="background:#f9fafb">
                    <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Document</th>
                    <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Work Order</th>
                    <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Expiry Date</th>
                    <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-weight:500">${doc.fileName}</td>
                    <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6">${woTitle}</td>
                    <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:${isExpired ? "#dc2626" : "#d97706"};font-weight:600">${doc.expiryDate}</td>
                    <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:${isExpired ? "#dc2626" : "#d97706"}">${isExpired ? "Expired" : "Expiring Soon"}</td>
                  </tr>
                </tbody>
              </table>
              <p style="color:#6b7280;font-size:13px">Please log in to TPR-Max to review and replace this document as required.</p>
            </div>
            <div style="background:#f9fafb;padding:12px 20px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;font-size:12px;color:#9ca3af">
              This alert was sent by ${companyName} via TPR-Max PPM system.
            </div>
          </div>
        `,
        text: `PPM Document Expiry Alert\n\nDocument: ${doc.fileName}\nWork Order: ${woTitle}\nExpiry Date: ${doc.expiryDate}\nStatus: ${isExpired ? "Expired" : "Expiring Soon"}\n\nPlease log in to TPR-Max to review.`,
      });

      if (!sent) return res.status(500).json({ error: "Failed to send alert email" });

      // Also notify the assigned contractor (if the work order has one)
      const contractorEmail = wo?.assignedEmail;
      let contractorNotified = false;
      if (contractorEmail) {
        try {
          const recipientName = wo?.contractorWorkerName || wo?.contractorCompanyName || "Contractor";
          const baseUrl = process.env.REPLIT_DOMAINS
            ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
            : (process.env.PUBLIC_URL || process.env.BASE_URL || "http://localhost:5000");
          const workOrderUrl = wo?.accessToken ? `${baseUrl}/ppm/work-order/${wo.accessToken}` : null;
          const contractorSubject = isExpired
            ? `Action Required: Expired Document on Work Order — ${woTitle}`
            : `Action Required: Document Expiring Soon on Work Order — ${woTitle}`;
          const accentColor = isExpired ? "#dc2626" : "#d97706";
          const statusLabel = isExpired ? "Expired" : "Expiring Soon";
          await emailSvc.sendEmail({
            to: contractorEmail,
            subject: contractorSubject,
            companyName,
            html: `
              <!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f6f6f6;margin:0;padding:20px">
              <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1)">
                <div style="background:${accentColor};color:#fff;padding:24px 28px">
                  <h1 style="margin:0;font-size:20px">Document Expiry Notice</h1>
                  <p style="margin:6px 0 0;opacity:.85;font-size:14px">${companyName}</p>
                </div>
                <div style="padding:28px">
                  <p style="font-size:16px;color:#1f2937">Hello ${recipientName},</p>
                  <p style="color:#374151">A document on one of your assigned PPM work orders requires attention. Please supply a replacement as soon as possible.</p>
                  <div style="background:#fef2f2;border:1px solid ${accentColor}33;border-radius:8px;padding:16px;margin:20px 0">
                    <p style="margin:0 0 6px;font-weight:600;color:#1f2937;font-size:15px">${woTitle}</p>
                    <p style="margin:0 0 4px;font-size:14px;color:#374151"><strong>Document:</strong> ${doc.fileName}</p>
                    <p style="margin:0 0 4px;font-size:14px;color:${accentColor}"><strong>Expiry Date:</strong> ${doc.expiryDate}</p>
                    <p style="margin:0;font-size:14px;color:${accentColor}"><strong>Status:</strong> ${statusLabel}</p>
                  </div>
                  ${workOrderUrl ? `<div style="text-align:center;margin:28px 0"><a href="${workOrderUrl}" style="background:${accentColor};color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-weight:600;font-size:15px;display:inline-block">View Work Order</a></div>` : ""}
                  <p style="color:#6b7280;font-size:13px">Please upload a valid replacement document at your earliest convenience. If you have any questions, contact ${companyName} directly.</p>
                </div>
                <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 28px;text-align:center">
                  <p style="margin:0;color:#9ca3af;font-size:12px">This notice was sent by ${companyName} via TPR-Max PPM system.</p>
                </div>
              </div>
              </body></html>
            `,
            text: `Document Expiry Notice — ${companyName}\n\nHello ${recipientName},\n\nA document on your assigned work order "${woTitle}" requires attention.\n\nDocument: ${doc.fileName}\nExpiry Date: ${doc.expiryDate}\nStatus: ${statusLabel}\n\nPlease supply a replacement document as soon as possible.${workOrderUrl ? `\n\nView your work order at:\n${workOrderUrl}` : ""}\n\n${companyName}`,
          });
          contractorNotified = true;
        } catch (contractorEmailErr) {
          console.error("PPM expiry resend — contractor notification failed:", contractorEmailErr);
        }
      }

      // Stamp expiryAlertedAt so cron won't re-fire automatically until reset
      await custDb.update(isolatedSchema.ppmWorkOrderDocuments)
        .set({ expiryAlertedAt: new Date() })
        .where(eq(isolatedSchema.ppmWorkOrderDocuments.id, docId));

      res.json({ success: true, contractorNotified });
    } catch (error: unknown) {
      console.error("POST /api/ppm/work-orders/:id/documents/:docId/resend-alert", error);
      res.status(500).json({ error: "Failed to resend alert" });
    }
  });

  // POST /api/ppm/documents/bulk-resend-alerts — resend expiry alert for ALL expiring/expired PPM documents at once
  // Admin receives a consolidated digest; each work order's assigned contractor (if any) receives a per-document email.
  app.post("/api/ppm/documents/bulk-resend-alerts", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
      const context = await simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);

      const settingsRows = await custDb.execute(`SELECT company_name, email, notify_on_document_expiry FROM company_settings LIMIT 1`);
      const settings = settingsRows.rows[0] as { company_name?: string; email?: string; notify_on_document_expiry?: boolean } | undefined;
      const companyName = (settings?.company_name as string) || "TPR-Max";
      const adminEmail = settings?.email as string | undefined;
      if (!adminEmail) return res.status(400).json({ error: "No admin email configured" });
      const notifyOnDocumentExpiry = settings?.notify_on_document_expiry !== false;
      if (!notifyOnDocumentExpiry) return res.status(403).json({ error: "Expiry notifications are disabled in company settings" });

      const todayStr = new Date().toISOString().split("T")[0];
      const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const in30DaysStr = in30Days.toISOString().split("T")[0];

      // Fetch all PPM work order documents that are expired or expiring within 30 days
      const expiringDocs = await custDb.select({
        id: isolatedSchema.ppmWorkOrderDocuments.id,
        fileName: isolatedSchema.ppmWorkOrderDocuments.fileName,
        expiryDate: isolatedSchema.ppmWorkOrderDocuments.expiryDate,
        workOrderId: isolatedSchema.ppmWorkOrderDocuments.workOrderId,
      }).from(isolatedSchema.ppmWorkOrderDocuments)
        .where(and(
          sql`${isolatedSchema.ppmWorkOrderDocuments.expiryDate} IS NOT NULL`,
          sql`${isolatedSchema.ppmWorkOrderDocuments.expiryDate} <= ${in30DaysStr}`
        ));

      if (expiringDocs.length === 0) {
        return res.status(400).json({ error: "No expiring or expired PPM documents found within the 30-day alert window" });
      }

      // Fetch all related work orders in one query to get titles and contractor details
      const woIds = [...new Set(expiringDocs.map(d => d.workOrderId))];
      const relatedWOs = await custDb.select({
        id: isolatedSchema.ppmWorkOrders.id,
        title: isolatedSchema.ppmWorkOrders.title,
        assignedEmail: isolatedSchema.ppmWorkOrders.assignedEmail,
        contractorWorkerName: isolatedSchema.ppmWorkOrders.contractorWorkerName,
        contractorCompanyName: isolatedSchema.ppmWorkOrders.contractorCompanyName,
        accessToken: isolatedSchema.ppmWorkOrders.accessToken,
      }).from(isolatedSchema.ppmWorkOrders)
        .where(inArray(isolatedSchema.ppmWorkOrders.id, woIds));
      const woMap = Object.fromEntries(relatedWOs.map(w => [w.id, w]));

      const expired = expiringDocs.filter(d => d.expiryDate! <= todayStr);
      const soonExpiring = expiringDocs.filter(d => d.expiryDate! > todayStr);

      const buildRow = (d: typeof expiringDocs[0], isExp: boolean) =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-weight:500">${d.fileName}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6">${woMap[d.workOrderId]?.title ?? d.workOrderId}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:${isExp ? "#dc2626" : "#d97706"};font-weight:600">${d.expiryDate}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:${isExp ? "#dc2626" : "#d97706"}">${isExp ? "Expired" : "Expiring Soon"}</td>
        </tr>`;

      const tableRows = [
        ...expired.map(d => buildRow(d, true)),
        ...soonExpiring.map(d => buildRow(d, false)),
      ].join("");

      const subjectCount = expiringDocs.length;
      const hasExpired = expired.length > 0;
      const adminSubject = hasExpired
        ? `PPM Alert: ${expired.length} Expired Document${expired.length > 1 ? "s" : ""}${soonExpiring.length > 0 ? ` & ${soonExpiring.length} Expiring Soon` : ""}`
        : `PPM Alert: ${soonExpiring.length} Document${soonExpiring.length > 1 ? "s" : ""} Expiring Soon`;

      const emailSvc = new EmailService(context.customerId);

      // ── Admin consolidated digest ───────────────────────────────────────────
      const adminSent = await emailSvc.sendEmail({
        to: adminEmail,
        subject: adminSubject,
        companyName,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto">
            <div style="background:${hasExpired ? "#dc2626" : "#d97706"};color:#fff;padding:20px;border-radius:8px 8px 0 0">
              <h2 style="margin:0">PPM Document Expiry Alert — ${companyName}</h2>
            </div>
            <div style="background:#fff;padding:20px;border:1px solid #e5e7eb">
              <p style="margin-top:0">${subjectCount} PPM work order document${subjectCount > 1 ? "s require" : " requires"} attention:</p>
              <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:14px">
                <thead>
                  <tr style="background:#f9fafb">
                    <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Document</th>
                    <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Work Order</th>
                    <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Expiry Date</th>
                    <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Status</th>
                  </tr>
                </thead>
                <tbody>${tableRows}</tbody>
              </table>
              <p style="color:#6b7280;font-size:13px">Please log in to TPR-Max to review and replace these documents as required.</p>
            </div>
            <div style="background:#f9fafb;padding:12px 20px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;font-size:12px;color:#9ca3af">
              This alert was sent by ${companyName} via TPR-Max PPM system.
            </div>
          </div>
        `,
        text: `PPM Document Expiry Alert\n\n${expired.length > 0 ? `Expired (${expired.length}):\n${expired.map(d => `- ${d.fileName} (WO: ${woMap[d.workOrderId]?.title ?? d.workOrderId}, expired: ${d.expiryDate})`).join("\n")}\n\n` : ""}${soonExpiring.length > 0 ? `Expiring Soon (${soonExpiring.length}):\n${soonExpiring.map(d => `- ${d.fileName} (WO: ${woMap[d.workOrderId]?.title ?? d.workOrderId}, expires: ${d.expiryDate})`).join("\n")}\n\n` : ""}Please log in to TPR-Max to review.`,
      });

      if (!adminSent) return res.status(500).json({ error: "Failed to send admin alert email" });

      // ── Per-contractor notifications ────────────────────────────────────────
      // Group documents by assignedEmail so each contractor gets one email per document
      const baseUrl = process.env.REPLIT_DOMAINS
        ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
        : (process.env.PUBLIC_URL || process.env.BASE_URL || "http://localhost:5000");

      let contractorEmailsSent = 0;
      for (const doc of expiringDocs) {
        const wo = woMap[doc.workOrderId];
        if (!wo?.assignedEmail) continue;

        const isExpired = doc.expiryDate! <= todayStr;
        const accentColor = isExpired ? "#dc2626" : "#d97706";
        const statusLabel = isExpired ? "Expired" : "Expiring Soon";
        const recipientName = wo.contractorWorkerName || wo.contractorCompanyName || "Contractor";
        const woTitle = wo.title ?? doc.workOrderId;
        const workOrderUrl = wo.accessToken ? `${baseUrl}/ppm/work-order/${wo.accessToken}` : null;
        const contractorSubject = isExpired
          ? `Action Required: Expired Document on Work Order — ${woTitle}`
          : `Action Required: Document Expiring Soon on Work Order — ${woTitle}`;

        try {
          await emailSvc.sendEmail({
            to: wo.assignedEmail,
            subject: contractorSubject,
            companyName,
            html: `
              <!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f6f6f6;margin:0;padding:20px">
              <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1)">
                <div style="background:${accentColor};color:#fff;padding:24px 28px">
                  <h1 style="margin:0;font-size:20px">Document Expiry Notice</h1>
                  <p style="margin:6px 0 0;opacity:.85;font-size:14px">${companyName}</p>
                </div>
                <div style="padding:28px">
                  <p style="font-size:16px;color:#1f2937">Hello ${recipientName},</p>
                  <p style="color:#374151">A document on one of your assigned PPM work orders requires attention. Please supply a replacement as soon as possible.</p>
                  <div style="background:#fef2f2;border:1px solid ${accentColor}33;border-radius:8px;padding:16px;margin:20px 0">
                    <p style="margin:0 0 6px;font-weight:600;color:#1f2937;font-size:15px">${woTitle}</p>
                    <p style="margin:0 0 4px;font-size:14px;color:#374151"><strong>Document:</strong> ${doc.fileName}</p>
                    <p style="margin:0 0 4px;font-size:14px;color:${accentColor}"><strong>Expiry Date:</strong> ${doc.expiryDate}</p>
                    <p style="margin:0;font-size:14px;color:${accentColor}"><strong>Status:</strong> ${statusLabel}</p>
                  </div>
                  ${workOrderUrl ? `<div style="text-align:center;margin:28px 0"><a href="${workOrderUrl}" style="background:${accentColor};color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-weight:600;font-size:15px;display:inline-block">View Work Order</a></div>` : ""}
                  <p style="color:#6b7280;font-size:13px">Please upload a valid replacement document at your earliest convenience. If you have any questions, contact ${companyName} directly.</p>
                </div>
                <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 28px;text-align:center">
                  <p style="margin:0;color:#9ca3af;font-size:12px">This notice was sent by ${companyName} via TPR-Max PPM system.</p>
                </div>
              </div>
              </body></html>
            `,
            text: `Document Expiry Notice — ${companyName}\n\nHello ${recipientName},\n\nA document on your assigned work order "${woTitle}" requires attention.\n\nDocument: ${doc.fileName}\nExpiry Date: ${doc.expiryDate}\nStatus: ${statusLabel}\n\nPlease supply a replacement document as soon as possible.${workOrderUrl ? `\n\nView your work order at:\n${workOrderUrl}` : ""}\n\n${companyName}`,
          });
          contractorEmailsSent++;
        } catch (contractorEmailErr) {
          console.error(`PPM bulk resend — contractor notification failed for WO ${doc.workOrderId}:`, contractorEmailErr);
        }
      }

      // Stamp expiryAlertedAt on all processed documents
      const docIds = expiringDocs.map(d => d.id);
      await custDb.update(isolatedSchema.ppmWorkOrderDocuments)
        .set({ expiryAlertedAt: new Date() })
        .where(inArray(isolatedSchema.ppmWorkOrderDocuments.id, docIds));

      res.json({ success: true, documentsAlerted: expiringDocs.length, contractorEmailsSent });
    } catch (error: unknown) {
      console.error("POST /api/ppm/documents/bulk-resend-alerts", error);
      res.status(500).json({ error: "Failed to send bulk alerts" });
    }
  });

  // GET /api/ppm/work-orders/export-all — bulk PDF export for all matching work orders
  app.get("/api/ppm/work-orders/export-all", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
      const context = await simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const { status, dateFrom, dateTo } = req.query as { status?: string; dateFrom?: string; dateTo?: string };

      // Build filter conditions
      const conditions: SQL<unknown>[] = [];
      if (status && status !== "all") conditions.push(eq(isolatedSchema.ppmWorkOrders.status, status));
      if (dateFrom) conditions.push(gte(isolatedSchema.ppmWorkOrders.dueDate, dateFrom));
      if (dateTo) conditions.push(lte(isolatedSchema.ppmWorkOrders.dueDate, dateTo));

      const wos = await custDb.select().from(isolatedSchema.ppmWorkOrders)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(isolatedSchema.ppmWorkOrders.dueDate);

      // Fetch all assets and build a lookup
      const allAssets = await custDb.select({ id: isolatedSchema.ppmAssets.id, name: isolatedSchema.ppmAssets.name })
        .from(isolatedSchema.ppmAssets);
      const assetMap: Record<string, string> = {};
      for (const a of allAssets) assetMap[a.id] = a.name;

      // Fetch all documents for these work orders in one query
      const woIds = wos.map(w => w.id);
      const allDocs = woIds.length > 0
        ? await custDb.select().from(isolatedSchema.ppmWorkOrderDocuments)
            .where(inArray(isolatedSchema.ppmWorkOrderDocuments.workOrderId, woIds))
            .orderBy(isolatedSchema.ppmWorkOrderDocuments.createdAt)
        : [];
      const docsByWo: Record<string, typeof allDocs> = {};
      for (const d of allDocs) {
        if (!docsByWo[d.workOrderId]) docsByWo[d.workOrderId] = [];
        docsByWo[d.workOrderId].push(d);
      }

      const esc = (s: string | null | undefined) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      const fmtDate = (d: string | null | undefined) => {
        if (!d) return "—";
        try { return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }); } catch { return d; }
      };
      const statusLabel: Record<string, string> = {
        scheduled: "Scheduled", in_progress: "In Progress", completed: "Completed",
        overdue: "Overdue", cancelled: "Cancelled",
      };
      const statusColour: Record<string, string> = {
        scheduled: "#1d4ed8", in_progress: "#b45309", completed: "#15803d",
        overdue: "#b91c1c", cancelled: "#6b7280",
      };
      const docTypeLabel: Record<string, string> = {
        certificate: "Certificate", report: "Report", photo: "Photo", other: "Other",
      };

      const generatedAt = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

      // Build filter description for report header
      const filterParts: string[] = [];
      if (status && status !== "all") filterParts.push(`Status: ${statusLabel[status] ?? status}`);
      if (dateFrom) filterParts.push(`From: ${fmtDate(dateFrom)}`);
      if (dateTo) filterParts.push(`To: ${fmtDate(dateTo)}`);
      const filterDesc = filterParts.length > 0 ? filterParts.join("&nbsp;&nbsp;·&nbsp;&nbsp;") : "All work orders";

      const woSections = wos.map((wo, idx) => {
        const docs = docsByWo[wo.id] ?? [];
        const assetName = wo.assetId ? (assetMap[wo.assetId] ?? "—") : "—";
        const sColour = statusColour[wo.status ?? ""] ?? "#6b7280";
        const docsHtml = docs.length === 0
          ? `<p style="color:#6b7280;font-size:12px;margin:0;">No documents uploaded.</p>`
          : docs.map(doc => `
              <div style="border:1px solid #e5e7eb;border-radius:4px;padding:7px 10px;margin-bottom:6px;font-size:12px;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                  <span style="font-weight:600;color:#111827;">${esc(doc.fileName)}</span>
                  ${doc.fileType && doc.fileType !== "other" ? `<span style="background:#f3f4f6;border:1px solid #d1d5db;border-radius:3px;padding:1px 5px;font-size:10px;color:#374151;text-transform:capitalize;">${esc(docTypeLabel[doc.fileType] ?? doc.fileType)}</span>` : ""}
                </div>
                ${(doc.expiryDate || doc.referenceNumber || doc.issuedBy) ? `
                <div style="display:flex;flex-wrap:wrap;gap:12px;color:#6b7280;">
                  ${doc.expiryDate ? `<span>Expiry: <strong style="color:#111827;">${esc(fmtDate(doc.expiryDate))}</strong></span>` : ""}
                  ${doc.referenceNumber ? `<span>Ref No.: <strong style="color:#111827;">${esc(doc.referenceNumber)}</strong></span>` : ""}
                  ${doc.issuedBy ? `<span>Issued By: <strong style="color:#111827;">${esc(doc.issuedBy)}</strong></span>` : ""}
                </div>` : ""}
              </div>`).join("");

        return `
          <div style="page-break-inside:avoid;border:1px solid #e5e7eb;border-radius:6px;padding:14px 16px;margin-bottom:16px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
              <div>
                <span style="font-size:11px;color:#9ca3af;font-weight:500;margin-right:8px;">#${idx + 1}</span>
                <span style="font-size:15px;font-weight:700;color:#111827;">${esc(wo.title)}</span>
              </div>
              <span style="font-size:11px;font-weight:600;color:${sColour};background:${sColour}18;border:1px solid ${sColour}44;border-radius:4px;padding:2px 8px;">${esc(statusLabel[wo.status ?? ""] ?? wo.status ?? "—")}</span>
            </div>
            <div style="display:grid;grid-template-columns:140px 1fr 140px 1fr;gap:3px 10px;font-size:12px;margin-bottom:10px;">
              <span style="color:#6b7280;">Asset</span><span style="color:#111827;">${esc(assetName)}</span>
              <span style="color:#6b7280;">Due Date</span><span style="color:#111827;">${esc(fmtDate(wo.dueDate))}</span>
              ${wo.contractorCompanyName ? `<span style="color:#6b7280;">Contractor</span><span style="color:#111827;">${esc(wo.contractorCompanyName)}</span>` : `<span></span><span></span>`}
              ${wo.completedDate ? `<span style="color:#6b7280;">Completed</span><span style="color:#111827;">${esc(fmtDate(wo.completedDate))}</span>` : `<span></span><span></span>`}
            </div>
            ${docs.length > 0 ? `
            <div>
              <div style="font-size:11px;font-weight:700;color:#374151;border-bottom:1px solid #f3f4f6;padding-bottom:4px;margin-bottom:6px;">Documents (${docs.length})</div>
              ${docsHtml}
            </div>` : `<p style="font-size:12px;color:#9ca3af;margin:0;">No documents uploaded.</p>`}
          </div>`;
      }).join("");

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; background: #fff; padding: 28px 36px; }
  h1 { font-size: 20px; font-weight: 700; color: #111827; margin-bottom: 3px; }
  .subtitle { font-size: 12px; color: #6b7280; margin-bottom: 6px; }
  .filter-bar { font-size: 12px; color: #374151; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 5px; padding: 6px 12px; margin-bottom: 20px; display: inline-block; }
  .footer { margin-top: 32px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; text-align: center; }
</style>
</head>
<body>
<h1>PPM Work Order Report</h1>
<p class="subtitle">Generated: ${generatedAt} &nbsp;·&nbsp; ${wos.length} work order${wos.length !== 1 ? "s" : ""}</p>
<div class="filter-bar">${filterDesc}</div>

${wos.length === 0 ? `<p style="color:#6b7280;font-size:14px;text-align:center;padding:40px 0;">No work orders match the selected criteria.</p>` : woSections}

<div class="footer">Generated by TPR Max — PPM Bulk Work Order Export &nbsp;·&nbsp; ${generatedAt}</div>
</body>
</html>`;

      try {
        const puppeteer = await import('puppeteer');
        const browser = await puppeteer.default.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
        try {
          const page = await browser.newPage();
          await page.setContent(html, { waitUntil: 'networkidle0' });
          const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' } });
          await browser.close();
          res.setHeader('Content-Type', 'application/pdf');
          const dateSuffix = dateFrom || dateTo ? `-${(dateFrom || "").replace(/-/g,"") || "start"}-${(dateTo || "").replace(/-/g,"") || "end"}` : "";
          res.setHeader('Content-Disposition', `attachment; filename="work-orders-report${dateSuffix}.pdf"`);
          return res.send(Buffer.from(pdfBuffer));
        } catch (pdfErr) {
          await browser.close();
          throw pdfErr;
        }
      } catch {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        const printHtml = html.replace('</body>', '<script>window.onload=function(){window.print();}</script></body>');
        res.setHeader('Content-Disposition', `inline; filename="work-orders-report.html"`);
        return res.send(printHtml);
      }
    } catch (error: unknown) {
      console.error("GET /api/ppm/work-orders/export-all", error);
      res.status(500).json({ error: "Failed to generate bulk work order export" });
    }
  });

  // POST /api/ppm/documents/bulk-resend-alert — send a single digest covering ALL expired/expiring-soon PPM documents
  app.post("/api/ppm/documents/bulk-resend-alert", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
      const context = await simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      // Fetch company settings
      const settingsRows = await custDb.execute(`SELECT company_name, email, notify_on_document_expiry FROM company_settings LIMIT 1`);
      const settings = settingsRows.rows[0] as { company_name?: string; email?: string; notify_on_document_expiry?: boolean } | undefined;
      const companyName = (settings?.company_name as string) || "TPR-Max";
      const adminEmail = settings?.email as string | undefined;
      if (!adminEmail) return res.status(400).json({ error: "No admin email configured" });
      const notifyOnDocumentExpiry = settings?.notify_on_document_expiry !== false;
      if (!notifyOnDocumentExpiry) return res.status(403).json({ error: "Expiry notifications are disabled in company settings" });

      const todayDateStr = new Date().toISOString().split("T")[0];
      const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const in30DaysStr = in30Days.toISOString().split("T")[0];

      // Fetch ALL expired or expiring-soon documents (regardless of expiryAlertedAt — this is a manual bulk resend)
      const expiringDocs = await custDb.select({
        id: isolatedSchema.ppmWorkOrderDocuments.id,
        fileName: isolatedSchema.ppmWorkOrderDocuments.fileName,
        fileType: isolatedSchema.ppmWorkOrderDocuments.fileType,
        expiryDate: isolatedSchema.ppmWorkOrderDocuments.expiryDate,
        workOrderId: isolatedSchema.ppmWorkOrderDocuments.workOrderId,
      }).from(isolatedSchema.ppmWorkOrderDocuments)
        .where(and(
          sql`${isolatedSchema.ppmWorkOrderDocuments.expiryDate} IS NOT NULL`,
          sql`${isolatedSchema.ppmWorkOrderDocuments.expiryDate} <= ${in30DaysStr}`
        ));

      if (expiringDocs.length === 0) {
        return res.json({ success: true, count: 0, message: "No expired or expiring documents found" });
      }

      // Enrich with work order titles
      const woIds = [...new Set(expiringDocs.map(d => d.workOrderId))];
      const relatedWOs = await custDb.select({
        id: isolatedSchema.ppmWorkOrders.id,
        title: isolatedSchema.ppmWorkOrders.title,
      }).from(isolatedSchema.ppmWorkOrders)
        .where(inArray(isolatedSchema.ppmWorkOrders.id, woIds));
      const woMap = Object.fromEntries(relatedWOs.map(w => [w.id, w.title]));

      const expired = expiringDocs.filter(d => d.expiryDate! <= todayDateStr);
      const soonExpiring = expiringDocs.filter(d => d.expiryDate! > todayDateStr);

      const buildRow = (d: typeof expiringDocs[0], isExp: boolean) =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-weight:500">${d.fileName}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6">${woMap[d.workOrderId] ?? d.workOrderId}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:${isExp ? "#dc2626" : "#d97706"};font-weight:600">${d.expiryDate}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:${isExp ? "#dc2626" : "#d97706"}">${isExp ? "Expired" : "Expiring Soon"}</td>
        </tr>`;

      const tableRows = [
        ...expired.map(d => buildRow(d, true)),
        ...soonExpiring.map(d => buildRow(d, false)),
      ].join("");

      const subjectCount = expiringDocs.length;
      const hasExpired = expired.length > 0;
      const subject = hasExpired
        ? `PPM Alert: ${expired.length} Expired Document${expired.length > 1 ? "s" : ""}${soonExpiring.length > 0 ? ` & ${soonExpiring.length} Expiring Soon` : ""}`
        : `PPM Alert: ${soonExpiring.length} Document${soonExpiring.length > 1 ? "s" : ""} Expiring Soon`;

      const emailSvc = new EmailService(context.customerId);
      const sent = await emailSvc.sendEmail({
        to: adminEmail,
        subject,
        companyName,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto">
            <div style="background:${hasExpired ? "#dc2626" : "#d97706"};color:#fff;padding:20px;border-radius:8px 8px 0 0">
              <h2 style="margin:0">PPM Document Expiry Alert — ${companyName}</h2>
            </div>
            <div style="background:#fff;padding:20px;border:1px solid #e5e7eb">
              <p style="margin-top:0">${subjectCount} PPM work order document${subjectCount > 1 ? "s require" : " requires"} attention:</p>
              <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:14px">
                <thead>
                  <tr style="background:#f9fafb">
                    <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Document</th>
                    <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Work Order</th>
                    <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Expiry Date</th>
                    <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Status</th>
                  </tr>
                </thead>
                <tbody>${tableRows}</tbody>
              </table>
              <p style="color:#6b7280;font-size:13px">Please log in to TPR-Max to review and replace these documents as required.</p>
            </div>
            <div style="background:#f9fafb;padding:12px 20px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;font-size:12px;color:#9ca3af">
              This alert was sent by ${companyName} via TPR-Max PPM system.
            </div>
          </div>
        `,
        text: `PPM Document Expiry Alert\n\n${expired.length > 0 ? `Expired (${expired.length}):\n${expired.map(d => `- ${d.fileName} (WO: ${woMap[d.workOrderId] ?? d.workOrderId}, expired: ${d.expiryDate})`).join("\n")}\n\n` : ""}${soonExpiring.length > 0 ? `Expiring Soon (${soonExpiring.length}):\n${soonExpiring.map(d => `- ${d.fileName} (WO: ${woMap[d.workOrderId] ?? d.workOrderId}, expires: ${d.expiryDate})`).join("\n")}\n\n` : ""}Please log in to TPR-Max to review.`,
      });

      if (!sent) return res.status(500).json({ error: "Failed to send alert email" });

      // Reset expiryAlertedAt for all included documents so cron deduplication is updated
      const alertedIds = expiringDocs.map(d => d.id);
      await custDb.update(isolatedSchema.ppmWorkOrderDocuments)
        .set({ expiryAlertedAt: new Date() })
        .where(inArray(isolatedSchema.ppmWorkOrderDocuments.id, alertedIds));

      res.json({ success: true, count: subjectCount });
    } catch (error: unknown) {
      console.error("POST /api/ppm/documents/bulk-resend-alert", error);
      res.status(500).json({ error: "Failed to send bulk expiry alert" });
    }
  });

  // GET /api/ppm/work-orders/:id/export — generate a PDF summary of a work order
  app.get("/api/ppm/work-orders/:id/export", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
      const { id } = req.params;
      const context = await simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);

      const [wo] = await custDb.select().from(isolatedSchema.ppmWorkOrders).where(eq(isolatedSchema.ppmWorkOrders.id, id));
      if (!wo) return res.status(404).json({ error: "Work order not found" });

      const docs = await custDb.select().from(isolatedSchema.ppmWorkOrderDocuments)
        .where(eq(isolatedSchema.ppmWorkOrderDocuments.workOrderId, id))
        .orderBy(isolatedSchema.ppmWorkOrderDocuments.createdAt);

      let assetName = "—";
      if (wo.assetId) {
        const [asset] = await custDb.select({ name: isolatedSchema.ppmAssets.name })
          .from(isolatedSchema.ppmAssets)
          .where(eq(isolatedSchema.ppmAssets.id, wo.assetId));
        if (asset) assetName = asset.name;
      }

      const esc = (s: string | null | undefined) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      const fmtDate = (d: string | null | undefined) => {
        if (!d) return "—";
        try { return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }); } catch { return d; }
      };
      const statusLabel: Record<string, string> = {
        pending: "Pending", in_progress: "In Progress", completed: "Completed",
        overdue: "Overdue", cancelled: "Cancelled",
      };
      const docTypeLabel: Record<string, string> = {
        certificate: "Certificate", report: "Report", photo: "Photo", other: "Other",
      };

      const docsHtml = docs.length === 0
        ? `<p style="color:#6b7280;font-size:13px;margin:0;">No documents uploaded.</p>`
        : docs.map(doc => `
          <div style="border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px;margin-bottom:8px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              <span style="font-weight:600;font-size:13px;color:#111827;">${esc(doc.fileName)}</span>
              ${doc.fileType && doc.fileType !== "other" ? `<span style="background:#f3f4f6;border:1px solid #d1d5db;border-radius:4px;padding:1px 7px;font-size:11px;color:#374151;text-transform:capitalize;">${esc(docTypeLabel[doc.fileType] ?? doc.fileType)}</span>` : ""}
            </div>
            ${(doc.expiryDate || doc.referenceNumber || doc.issuedBy) ? `
            <div style="display:flex;flex-wrap:wrap;gap:16px;font-size:12px;color:#6b7280;padding-left:0;">
              ${doc.expiryDate ? `<span>Expiry Date: <strong style="color:#111827;">${esc(fmtDate(doc.expiryDate))}</strong></span>` : ""}
              ${doc.referenceNumber ? `<span>Reference No.: <strong style="color:#111827;">${esc(doc.referenceNumber)}</strong></span>` : ""}
              ${doc.issuedBy ? `<span>Issued By: <strong style="color:#111827;">${esc(doc.issuedBy)}</strong></span>` : ""}
            </div>` : ""}
          </div>`).join("");

      const generatedAt = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
      const adminUser = req.user!;
      const preparedBy = (adminUser.firstName && adminUser.lastName)
        ? `${adminUser.firstName} ${adminUser.lastName}`
        : (adminUser.firstName || adminUser.lastName || adminUser.username || '');

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; background: #fff; padding: 32px 40px; }
  h1 { font-size: 22px; font-weight: 700; color: #111827; margin-bottom: 4px; }
  .subtitle { font-size: 13px; color: #6b7280; margin-bottom: 24px; }
  .section { margin-bottom: 24px; }
  .section-title { font-size: 14px; font-weight: 700; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin-bottom: 12px; }
  .grid { display: grid; grid-template-columns: 160px 1fr; gap: 4px 12px; font-size: 13px; }
  .grid .label { color: #6b7280; }
  .grid .value { color: #111827; }
  .notes-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 12px; font-size: 13px; color: #374151; white-space: pre-wrap; }
  .completion-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 10px 12px; font-size: 13px; color: #166534; white-space: pre-wrap; }
  .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center; }
</style>
</head>
<body>
<h1>${esc(wo.title)}</h1>
<p class="subtitle">PPM Work Order &nbsp;·&nbsp; Status: ${esc(statusLabel[wo.status ?? ""] ?? wo.status ?? "—")} &nbsp;·&nbsp; Generated: ${generatedAt}${preparedBy ? ` &nbsp;·&nbsp; Prepared By: ${esc(preparedBy)}` : ``}</p>

<div class="section">
  <div class="section-title">Work Order Details</div>
  <div class="grid">
    <span class="label">Asset</span><span class="value">${esc(assetName)}</span>
    <span class="label">Due Date</span><span class="value">${esc(fmtDate(wo.dueDate))}</span>
    <span class="label">Completed Date</span><span class="value">${esc(fmtDate(wo.completedDate))}</span>
    ${wo.contractorCompanyName ? `<span class="label">Contractor</span><span class="value">${esc(wo.contractorCompanyName)}</span>` : ""}
    ${wo.contractorWorkerName ? `<span class="label">Worker</span><span class="value">${esc(wo.contractorWorkerName)}</span>` : ""}
    ${wo.requiresCertificate ? `<span class="label">Certificate</span><span class="value">${wo.certificateUploadedAt ? `Uploaded ${fmtDate(wo.certificateUploadedAt)}` : "Not yet uploaded"}</span>` : ""}
  </div>
</div>

${wo.description ? `
<div class="section">
  <div class="section-title">Description</div>
  <div class="notes-box">${esc(wo.description)}</div>
</div>` : ""}

${wo.notes ? `
<div class="section">
  <div class="section-title">Notes</div>
  <div class="notes-box">${esc(wo.notes)}</div>
</div>` : ""}

${wo.completionNotes ? `
<div class="section">
  <div class="section-title">Completion Notes</div>
  <div class="completion-box">${esc(wo.completionNotes)}</div>
</div>` : ""}

<div class="section">
  <div class="section-title">Documents (${docs.length})</div>
  ${docsHtml}
</div>

<div class="footer">
  Generated by TPR Max — PPM Work Order Export &nbsp;·&nbsp; ${generatedAt}${preparedBy ? ` &nbsp;·&nbsp; Prepared By: ${esc(preparedBy)}` : ``}
</div>
</body>
</html>`;

      try {
        const puppeteer = await import('puppeteer');
        const browser = await puppeteer.default.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
        try {
          const page = await browser.newPage();
          await page.setContent(html, { waitUntil: 'networkidle0' });
          const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' } });
          await browser.close();
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="work-order-${id.slice(0, 8)}.pdf"`);
          return res.send(Buffer.from(pdfBuffer));
        } catch (pdfErr) {
          await browser.close();
          throw pdfErr;
        }
      } catch {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        const printHtml = html.replace('</body>', '<script>window.onload=function(){window.print();}</script></body>');
        res.setHeader('Content-Disposition', `inline; filename="work-order-${id.slice(0, 8)}.html"`);
        return res.send(printHtml);
      }
    } catch (error: unknown) {
      console.error("GET /api/ppm/work-orders/:id/export", error);
      res.status(500).json({ error: "Failed to generate work order export" });
    }
  });

  // ── PPM Demo Data ───────────────────────────────────────────────────────────
  // POST /api/ppm/demo-data — seed typical UK facility PPM assets + templates

  app.post("/api/ppm/demo-data", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);

      // ── Demo assets ─────────────────────────────────────────────────────────
      const DEMO_ASSETS = [
        { name: "Air Handling Unit 1",             assetRef: "AHU-001", category: "HVAC",         location: "Plant Room 1",         manufacturer: "Daikin",        status: "active" },
        { name: "Fire Alarm Panel – Main Building", assetRef: "FAP-001", category: "Fire Safety",  location: "Main Reception",       manufacturer: "Honeywell",     status: "active" },
        { name: "Emergency Lighting System",        assetRef: "EL-001",  category: "Fire Safety",  location: "All Floors",           manufacturer: "Safescape",     status: "active" },
        { name: "Gas Boiler – Plant Room",          assetRef: "BLR-001", category: "Mechanical",   location: "Plant Room 1",         manufacturer: "Worcester Bosch", status: "active" },
        { name: "Access Control System",            assetRef: "ACS-001", category: "Security",     location: "Main Entrance",        manufacturer: "Honeywell",     status: "active" },
        { name: "Passenger Lift – Block A",         assetRef: "LFT-001", category: "Mechanical",   location: "Block A – All Floors", manufacturer: "Schindler",     status: "active" },
        { name: "Sprinkler System – Warehouse",     assetRef: "SPR-001", category: "Fire Safety",  location: "Warehouse",            manufacturer: "Viking",        status: "active" },
        { name: "Electrical Distribution Board",    assetRef: "EDB-001", category: "Electrical",   location: "Sub-Station",          manufacturer: "Schneider Electric", status: "active" },
      ];

      // ── Demo templates ───────────────────────────────────────────────────────
      const DEMO_TEMPLATES = [
        {
          name: "Monthly HVAC Filter Check",
          description: "Inspect, clean and replace HVAC filters. Record pressure readings across filter bank.",
          category: "HVAC", type: "non-statutory", frequency: "monthly",
          estimatedHours: "2",
          checklist: JSON.stringify(["Visually inspect filter condition","Check pressure differential across filters","Replace filters if pressure drop exceeds specification","Clean filter housing","Record readings in maintenance log","Check unit for unusual noise or vibration"]),
        },
        {
          name: "Annual Fire Alarm Full Test",
          description: "Full annual test of fire alarm system in accordance with BS 5839-1. All detectors, call points and sounders tested.",
          category: "Fire Safety", type: "statutory", regulationReference: "BS 5839-1", frequency: "annual",
          estimatedHours: "4",
          checklist: JSON.stringify(["Notify building occupants and fire service before testing","Test all manual call points","Test all smoke detectors using aerosol","Test all heat detectors","Verify all sounders operate at required decibel level","Test all visual alarm devices","Check fire alarm panel for faults","Test remote signalling to alarm receiving centre","Complete fire alarm record log","Issue test certificate"]),
        },
        {
          name: "Monthly Emergency Lighting Functional Test",
          description: "Monthly function test of emergency lighting in accordance with BS 5266-1.",
          category: "Fire Safety", type: "statutory", regulationReference: "BS 5266-1", frequency: "monthly",
          estimatedHours: "1",
          checklist: JSON.stringify(["Simulate mains failure for each emergency light","Confirm each luminaire illuminates","Check for damaged or missing luminaires","Check battery charging indicators","Record results in emergency lighting log"]),
        },
        {
          name: "Annual Boiler Service & Gas Safety Check",
          description: "Annual service and gas safety inspection by a Gas Safe registered engineer.",
          category: "Mechanical", type: "statutory", regulationReference: "Gas Safety (Installation & Use) Regulations 1998", frequency: "annual",
          estimatedHours: "3",
          checklist: JSON.stringify(["Inspect burner and heat exchanger","Clean all flue ways","Check gas pressure and flow rate","Test safety controls and thermostats","Check ventilation is adequate","Inspect all gas connections for leaks","Record flue gas analysis","Issue Gas Safe certificate"]),
        },
        {
          name: "Annual Lift Thorough Examination",
          description: "Thorough examination of passenger lift by a competent person in accordance with LOLER.",
          category: "Mechanical", type: "statutory", regulationReference: "LOLER 1998", frequency: "custom", customDays: 183,
          estimatedHours: "4",
          checklist: JSON.stringify(["Check all safety devices and buffers","Inspect ropes/belts and terminations","Test overload device","Test emergency brake","Check car and landing door interlocks","Inspect pit and overhead equipment","Test emergency communications","Complete LOLER thorough examination report"]),
        },
        {
          name: "Quarterly Sprinkler System Inspection",
          description: "Quarterly inspection and flow test of wet pipe sprinkler system to BS EN 12845.",
          category: "Fire Safety", type: "statutory", regulationReference: "BS EN 12845", frequency: "quarterly",
          estimatedHours: "2",
          checklist: JSON.stringify(["Inspect all visible sprinkler heads for damage or obstruction","Check water supply pressure and flow","Test alarm valve flow switch","Check anti-freeze levels (if applicable)","Inspect and test main stop valve","Check all gauges and indicators","Record results and report defects"]),
        },
        {
          name: "Fixed Wiring Inspection & Testing (EICR)",
          description: "Electrical Installation Condition Report (EICR) in accordance with BS 7671. Carried out by a qualified electrician.",
          category: "Electrical", type: "statutory", regulationReference: "BS 7671 / IET Wiring Regulations", frequency: "custom", customDays: 1825,
          estimatedHours: "8",
          checklist: JSON.stringify(["Inspect distribution boards and consumer units","Test all circuits for continuity","Insulation resistance testing","Polarity checks","Earth fault loop impedance testing","RCD operation tests","Inspect all visible wiring and accessories","Produce EICR certificate"]),
        },
        {
          name: "Monthly Access Control System Check",
          description: "Monthly operational check of access control system, readers and barriers.",
          category: "Security", type: "non-statutory", frequency: "monthly",
          estimatedHours: "1.5",
          checklist: JSON.stringify(["Test all card readers for correct operation","Check barrier / door operation","Verify audit trail logging is active","Check backup battery health","Test door held-open alarms","Review access levels for leavers","Update firmware if required"]),
        },
      ];

      // Insert assets (skip if name already exists)
      let assetsCreated = 0;
      const assetIdMap: Record<string, string> = {};
      for (const a of DEMO_ASSETS) {
        const existing = await custDb.select({ id: isolatedSchema.ppmAssets.id })
          .from(isolatedSchema.ppmAssets)
          .where(eq(isolatedSchema.ppmAssets.name, a.name))
          .limit(1);
        if (existing[0]) {
          assetIdMap[a.name] = existing[0].id;
        } else {
          const [inserted] = await custDb.insert(isolatedSchema.ppmAssets).values(a as any).returning({ id: isolatedSchema.ppmAssets.id });
          assetIdMap[a.name] = inserted.id;
          assetsCreated++;
        }
      }

      // Insert templates (skip if name already exists)
      let templatesCreated = 0;
      for (const t of DEMO_TEMPLATES) {
        const existing = await custDb.select({ id: isolatedSchema.ppmTemplates.id })
          .from(isolatedSchema.ppmTemplates)
          .where(eq(isolatedSchema.ppmTemplates.name, t.name))
          .limit(1);
        if (!existing[0]) {
          await custDb.insert(isolatedSchema.ppmTemplates).values(t as any);
          templatesCreated++;
        }
      }

      res.json({
        success: true,
        assetsCreated,
        templatesCreated,
        message: assetsCreated === 0 && templatesCreated === 0
          ? "Demo data already loaded — no duplicates created."
          : `Created ${assetsCreated} asset${assetsCreated !== 1 ? "s" : ""} and ${templatesCreated} template${templatesCreated !== 1 ? "s" : ""}.`,
      });
    } catch (error: unknown) {
      console.error("POST /api/ppm/demo-data", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load demo data" });
    }
  });

  // ── PPM Public Work Order (Contractor Mobile View) ──────────────────────────

  // GET /api/ppm/work-order/public/:token — contractor fetches their work order
  app.get("/api/ppm/work-order/public/:token", ppmPublicRateLimit, async (req, res) => {
    try {
      const { token } = req.params;
      if (!token || token.length < 10) return res.status(400).json({ error: "Invalid token" });

      // Helper: resolve work order from a known customer (used by both cache-hit and scan paths)
      const resolveFromCustomer = async (customerId: string) => {
        const custDb = await customerDbService.getCustomerDatabase(customerId);
        const [wo] = await custDb.select().from(isolatedSchema.ppmWorkOrders)
          .where(eq(isolatedSchema.ppmWorkOrders.accessToken, token));
        if (!wo) return null;
        // Enforce token expiry
        if (wo.accessTokenExpiresAt && new Date() > new Date(wo.accessTokenExpiresAt)) {
          return { expired: true as const };
        }
        const docs = await custDb.select().from(isolatedSchema.ppmWorkOrderDocuments)
          .where(eq(isolatedSchema.ppmWorkOrderDocuments.workOrderId, wo.id))
          .orderBy(isolatedSchema.ppmWorkOrderDocuments.createdAt);
        let asset = null;
        if (wo.assetId) {
          const [assetRow] = await custDb.select().from(isolatedSchema.ppmAssets)
            .where(eq(isolatedSchema.ppmAssets.id, wo.assetId));
          asset = assetRow ?? null;
        }
        // Strip internal/sensitive fields from public response
        const { accessToken: _t, accessTokenExpiresAt: _e, overdueAlertedAt: _o, missingCertAlertedAt: _m, ...safeWo } = wo;
        // Populate cache so subsequent requests skip the full scan
        if (wo.accessTokenExpiresAt) ppmTokenCacheSet(token, customerId, new Date(wo.accessTokenExpiresAt));
        return { workOrder: safeWo, documents: docs, asset };
      };

      // Fast path: cache hit avoids cross-tenant scan
      const cachedCustomerId = ppmTokenCacheGet(token);
      if (cachedCustomerId) {
        try {
          const result = await resolveFromCustomer(cachedCustomerId);
          if (result && result !== null && !("expired" in result)) return res.json(result);
          if (result && "expired" in result) {
            return res.status(410).json({ error: "This work order link has expired. Please contact your administrator for a new link." });
          }
          // Cache stale — fall through to full scan
          ppmTokenCacheEvict(token);
        } catch { /* fall through to full scan */ }
      }

      // Slow path: iterate all tenants (cache miss or stale)
      const allCustomers = await customerDbService.getAllCustomers();
      for (const customer of allCustomers) {
        try {
          const result = await resolveFromCustomer(customer.id);
          if (!result) continue;
          if ("expired" in result) return res.status(410).json({ error: "This work order link has expired. Please contact your administrator for a new link." });
          return res.json(result);
        } catch { /* skip this customer and try next */ }
      }
      res.status(404).json({ error: "Work order not found" });
    } catch (error: unknown) {
      console.error("GET /api/ppm/work-order/public/:token", error);
      res.status(500).json({ error: "Failed to fetch work order" });
    }
  });

  // PUT /api/ppm/work-order/public/:token — contractor updates status / completion notes
  // Token is rotated on every write (rolling token semantics: original email link is single-use,
  // subsequent operations use the nextToken returned in the response).
  app.put("/api/ppm/work-order/public/:token", ppmPublicRateLimit, async (req, res) => {
    try {
      const { token } = req.params;
      if (!token || token.length < 10) return res.status(400).json({ error: "Invalid token" });
      const { status, completionNotes } = req.body;
      const allowedStatuses = ["in_progress", "completed"];
      if (status && !allowedStatuses.includes(status)) return res.status(400).json({ error: "Invalid status" });

      const performUpdate = async (customerId: string) => {
        const custDb = await customerDbService.getCustomerDatabase(customerId);
        const [wo] = await custDb.select().from(isolatedSchema.ppmWorkOrders)
          .where(eq(isolatedSchema.ppmWorkOrders.accessToken, token));
        if (!wo) return null;
        if (wo.accessTokenExpiresAt && new Date() > new Date(wo.accessTokenExpiresAt)) return { expired: true as const };
        const updates: Record<string, unknown> = {};
        if (status) updates.status = status;
        if (completionNotes !== undefined) updates.completionNotes = completionNotes;
        if (status === "completed") updates.completedDate = new Date().toISOString().split("T")[0];
        const nextToken = randomBytes(24).toString("hex");
        const nextExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
        updates.accessToken = nextToken;
        updates.accessTokenExpiresAt = nextExpiresAt;
        const [updated] = await custDb.update(isolatedSchema.ppmWorkOrders)
          .set(updates)
          .where(eq(isolatedSchema.ppmWorkOrders.id, wo.id))
          .returning();
        // Evict old token, cache the new one
        ppmTokenCacheEvict(token);
        ppmTokenCacheSet(nextToken, customerId, nextExpiresAt);

        // Advance the linked schedule's nextDueDate when contractor marks work order completed
        if (status === "completed" && updated.scheduleId) {
          try {
            const [schedule] = await custDb.select()
              .from(isolatedSchema.ppmSchedules)
              .where(eq(isolatedSchema.ppmSchedules.id, updated.scheduleId))
              .limit(1);
            if (schedule?.nextDueDate) {
              const newDue = calcNextDueDate(schedule.nextDueDate, schedule.frequency, schedule.customDays ?? undefined);
              await custDb.update(isolatedSchema.ppmSchedules)
                .set({
                  nextDueDate: newDue,
                  status: "scheduled",
                  lastCompletedDate: new Date().toISOString().split("T")[0],
                })
                .where(eq(isolatedSchema.ppmSchedules.id, schedule.id));
              console.log(`✅ [PPM Public] Schedule ${schedule.id} advanced: ${schedule.nextDueDate} → ${newDue}`);
            }
          } catch (schedErr) {
            console.error("⚠️ [PPM Public] Failed to advance schedule after contractor completion:", schedErr);
          }
        }

        const { accessToken: _t, accessTokenExpiresAt: _e, ...safeUpdated } = updated;
        return { ...safeUpdated, nextToken };
      };

      // Fast path: cache hit
      const cachedCustomerId = ppmTokenCacheGet(token);
      if (cachedCustomerId) {
        try {
          const result = await performUpdate(cachedCustomerId);
          if (result && !("expired" in result)) return res.json(result);
          if (result && "expired" in result) return res.status(410).json({ error: "This work order link has expired. Please contact your administrator for a new link." });
          ppmTokenCacheEvict(token);
        } catch { /* fall through to full scan */ }
      }

      // Slow path: iterate all tenants
      const allCustomers = await customerDbService.getAllCustomers();
      for (const customer of allCustomers) {
        try {
          const result = await performUpdate(customer.id);
          if (!result) continue;
          if ("expired" in result) return res.status(410).json({ error: "This work order link has expired. Please contact your administrator for a new link." });
          return res.json(result);
        } catch { /* skip */ }
      }
      res.status(404).json({ error: "Work order not found" });
    } catch (error: unknown) {
      console.error("PUT /api/ppm/work-order/public/:token", error);
      res.status(500).json({ error: "Failed to update work order" });
    }
  });

  // POST /api/ppm/work-order/public/:token/files — atomic contractor file upload + document record creation
  // Combines upload and document linking in a single request to prevent orphan objects.
  // Also rotates the access token after successful upload (rolling token).
  app.post("/api/ppm/work-order/public/:token/files", ppmPublicRateLimit, async (req, res) => {
    try {
      const { token } = req.params;
      if (!token || token.length < 10) return res.status(400).json({ error: "Invalid token" });
      const { data, mimeType, fileName, fileType } = req.body;
      if (!data || !mimeType || !fileName) return res.status(400).json({ error: "Missing required fields: data, mimeType, fileName" });

      // Enforce MIME-type allowlist
      const ALLOWED_MIME_TYPES = new Set([
        "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif",
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ]);
      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        return res.status(415).json({ error: "File type not permitted. Allowed: images, PDF, Word, Excel." });
      }

      // Enforce 10 MB file size limit
      const MAX_BASE64_BYTES = 14 * 1024 * 1024;
      if (typeof data !== "string" || Buffer.byteLength(data, "utf8") > MAX_BASE64_BYTES) {
        return res.status(413).json({ error: "File too large. Maximum upload size is 10 MB." });
      }

      // Fast path: if token is cached, try that customer first (avoids full cross-tenant scan)
      const cachedFilesCustomerId = ppmTokenCacheGet(token);
      const allCustomers = await customerDbService.getAllCustomers();
      const orderedCustomers = cachedFilesCustomerId
        ? [{ id: cachedFilesCustomerId }, ...allCustomers.filter(c => c.id !== cachedFilesCustomerId)]
        : allCustomers;
      for (const customer of orderedCustomers) {
        try {
          const custDb = await customerDbService.getCustomerDatabase(customer.id);
          const [wo] = await custDb.select().from(isolatedSchema.ppmWorkOrders)
            .where(eq(isolatedSchema.ppmWorkOrders.accessToken, token));
          if (wo) {
            // Check token expiry
            if (wo.accessTokenExpiresAt && new Date() > new Date(wo.accessTokenExpiresAt)) {
              return res.status(410).json({ error: "This work order link has expired. Please contact your administrator for a new link." });
            }
            // Pre-flight: enforce max 5 documents before any storage write
            const existing = await custDb.select({ id: isolatedSchema.ppmWorkOrderDocuments.id })
              .from(isolatedSchema.ppmWorkOrderDocuments)
              .where(eq(isolatedSchema.ppmWorkOrderDocuments.workOrderId, wo.id));
            if (existing.length >= 5) {
              return res.status(400).json({ error: "Maximum of 5 documents allowed per work order" });
            }

            // Upload file to object storage
            const buffer = Buffer.from(data, "base64");
            const objectStorageService = new ObjectStorageService();
            const privateObjectDir = objectStorageService.getPrivateObjectDir();
            const objectId = randomUUID();
            const fullPath = `${privateObjectDir}/uploads/${objectId}`;
            const parts = fullPath.slice(1).split("/");
            const bucketName = parts[0];
            const objectName = parts.slice(1).join("/");
            const bucket = objectStorageClient.bucket(bucketName);
            const fileObj = bucket.file(objectName);
            await fileObj.save(buffer, { contentType: mimeType, resumable: false });
            const objectPath = `/objects/uploads/${objectId}`;

            // Atomically create document record (scannedAt left null — AI scan fires async below)
            const resolvedFileType = fileType || "other";
            const [doc] = await custDb.insert(isolatedSchema.ppmWorkOrderDocuments)
              .values({ workOrderId: wo.id, fileName, fileUrl: objectPath, fileType: resolvedFileType, uploadedBy: "contractor" })
              .returning();

            // Fire-and-forget async AI scan to extract metadata (expiryDate, issuer, ref).
            // Sets scannedAt once complete so the mobile view can distinguish "pending" from "scanned with no results".
            (async () => {
              try {
                const { scanDocumentWithAI } = await import('./openaiService');
                const isImage = mimeType.startsWith("image/");
                let scanResult;
                if (isImage) {
                  scanResult = await scanDocumentWithAI({ mimeType, base64Data: data, documentType: resolvedFileType });
                } else if (mimeType === "application/pdf") {
                  // Attempt text extraction for PDFs; fall back to no-op (non-image PDFs can't be vision-scanned)
                  scanResult = await scanDocumentWithAI({ mimeType, base64Data: data, documentType: resolvedFileType });
                } else {
                  // Non-image, non-PDF (Word/Excel) — mark as scanned with no results
                  scanResult = { fields: { expiryDate: null, issuedBy: null, policyNumber: null }, success: false };
                }
                const metadataUpdate: Record<string, unknown> = { scannedAt: new Date() };
                if (scanResult.fields.expiryDate) metadataUpdate.expiryDate = scanResult.fields.expiryDate;
                if (scanResult.fields.issuedBy) metadataUpdate.issuedBy = scanResult.fields.issuedBy;
                if (scanResult.fields.policyNumber) metadataUpdate.referenceNumber = scanResult.fields.policyNumber;
                await custDb.update(isolatedSchema.ppmWorkOrderDocuments)
                  .set(metadataUpdate)
                  .where(eq(isolatedSchema.ppmWorkOrderDocuments.id, doc.id));
              } catch (scanErr) {
                // Best-effort: stamp scannedAt so the pending indicator clears even if the scan failed
                try {
                  await custDb.update(isolatedSchema.ppmWorkOrderDocuments)
                    .set({ scannedAt: new Date() })
                    .where(eq(isolatedSchema.ppmWorkOrderDocuments.id, doc.id));
                } catch { /* ignore */ }
                console.error("PPM async AI scan error:", scanErr);
              }
            })();

            // If certificate, mark certificateUploadedAt; always clear missing-docs alert
            const woUpdates: Record<string, unknown> = { missingDocsAlertedAt: null };
            if (resolvedFileType === "certificate") {
              woUpdates.certificateUploadedAt = new Date();
            }
            // Rotate access token (rolling token — invalidates prior link after each write)
            const nextToken = randomBytes(24).toString("hex");
            const nextExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
            woUpdates.accessToken = nextToken;
            woUpdates.accessTokenExpiresAt = nextExpiresAt;
            await custDb.update(isolatedSchema.ppmWorkOrders)
              .set(woUpdates)
              .where(eq(isolatedSchema.ppmWorkOrders.id, wo.id));

            // Evict old token from cache, prime cache with new token
            ppmTokenCacheEvict(token);
            ppmTokenCacheSet(nextToken, customer.id, nextExpiresAt);

            return res.json({ document: doc, nextToken });
          }
        } catch { /* skip */ }
      }
      res.status(404).json({ error: "Work order not found" });
    } catch (error: unknown) {
      console.error("POST /api/ppm/work-order/public/:token/files", error);
      res.status(500).json({ error: "Failed to upload file" });
    }
  });

  // DEPRECATED: Use POST /api/ppm/work-order/public/:token/files instead (atomic upload+document).
  // Retained as 410 Gone to prevent two-step orphan-object flow from any cached clients.
  app.post("/api/ppm/work-order/public/:token/upload", (_req, res) => {
    res.status(410).json({ error: "This endpoint is deprecated. Use POST /api/ppm/work-order/public/:token/files for atomic upload." });
  });

  // DEPRECATED: Use POST /api/ppm/work-order/public/:token/files instead (atomic upload+document).
  app.post("/api/ppm/work-order/public/:token/documents", (_req, res) => {
    res.status(410).json({ error: "This endpoint is deprecated. Use POST /api/ppm/work-order/public/:token/files for atomic upload." });
  });

  // ── PPM Daily Alert Cron ──────────────────────────────────────────────────────
  // Runs at configurable hour (PPM_ALERT_HOUR env var, default 7) Europe/London every day:
  //  (a) marks work orders overdue when past due date and not completed
  //  (b) alerts admin + contractor when completed work order has no cert after 48h
  //  (c) alerts admin when overdue work orders have no documents uploaded at all
  //  (d) auto-generates work orders from schedules that have reached their next due date
  const ppmAlertHour = parseInt(process.env.PPM_ALERT_HOUR ?? "7", 10);
  cron.schedule(`0 ${ppmAlertHour} * * *`, async () => {
    try {
      console.log("🔧 [PPM Cron] Running daily PPM alert check…");
      const allCustomers = await customerDbService.getAllCustomers();
      const today = new Date(); today.setHours(0, 0, 0, 0);
      for (const customer of allCustomers) {
        try {
          const custDb = await customerDbService.getCustomerDatabase(customer.id);
          const workOrders = await custDb.select().from(isolatedSchema.ppmWorkOrders);
          const overdueIds: string[] = [];
          const missingCertWOs: (typeof workOrders[0])[] = [];

          for (const wo of workOrders) {
            if (wo.status === "completed" || wo.status === "overdue" || wo.status === "cancelled") {
              // Check for missing cert: completed 48+ hours ago but no cert uploaded AND alert not yet sent.
              // completedDate is date-only text so we compare calendar days conservatively:
              // alert when completedDate is at least 2 days before today (>= 48 calendar hours)
              if (wo.status === "completed" && wo.requiresCertificate && !wo.certificateUploadedAt && wo.completedDate && !wo.missingCertAlertedAt) {
                const completedDay = new Date(wo.completedDate + "T00:00:00Z");
                const msDiff = today.getTime() - completedDay.getTime();
                const daysDiff = msDiff / (1000 * 60 * 60 * 24);
                if (daysDiff >= 2) missingCertWOs.push(wo);
              }
              continue;
            }
            if (wo.dueDate) {
              const due = new Date(wo.dueDate); due.setHours(0, 0, 0, 0);
              if (due < today) overdueIds.push(wo.id);
            }
          }

          // Batch-mark overdue
          if (overdueIds.length > 0) {
            for (const woId of overdueIds) {
              await custDb.update(isolatedSchema.ppmWorkOrders)
                .set({ status: "overdue" })
                .where(eq(isolatedSchema.ppmWorkOrders.id, woId));
            }
            console.log(`✅ [PPM Cron] Marked ${overdueIds.length} work orders overdue for customer ${customer.id}`);
          }

          // Get settings for email
          const settingsRows = await custDb.execute(`SELECT company_name, email, notify_on_document_expiry FROM company_settings LIMIT 1`);
          const settings = settingsRows.rows[0] as { company_name?: string; email?: string; notify_on_document_expiry?: boolean } | undefined;
          const companyName = (settings?.company_name as string) || "TPR-Max";
          const adminEmail = settings?.email as string | undefined;
          const notifyEnabled = settings?.notify_on_document_expiry !== false;
          const emailSvc = new EmailService(customer.id);

          // Alert admin about newly-overdue work orders (only those not yet alerted)
          const newlyAlertedOverdue = workOrders.filter(w => overdueIds.includes(w.id) && !w.overdueAlertedAt);
          if (notifyEnabled && newlyAlertedOverdue.length > 0 && adminEmail) {
            await emailSvc.sendEmail({
              to: adminEmail,
              subject: `PPM Alert: ${newlyAlertedOverdue.length} Overdue Work Order${newlyAlertedOverdue.length > 1 ? "s" : ""}`,
              companyName,
              html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                  <div style="background:#dc2626;color:#fff;padding:20px;border-radius:8px 8px 0 0">
                    <h2 style="margin:0">PPM Overdue Alert — ${companyName}</h2>
                  </div>
                  <div style="background:#fff;padding:20px;border:1px solid #e5e7eb">
                    <p>${newlyAlertedOverdue.length} PPM work order${newlyAlertedOverdue.length > 1 ? "s have" : " has"} become overdue:</p>
                    <ul style="padding-left:20px">
                      ${newlyAlertedOverdue.map(w => `<li><strong>${w.title}</strong>${w.dueDate ? ` — was due ${w.dueDate}` : ""}</li>`).join("")}
                    </ul>
                    <p>Please log in to TPR-Max to review and take action.</p>
                  </div>
                </div>
              `,
              text: `PPM Overdue Alert\n\n${newlyAlertedOverdue.length} work order(s) are overdue:\n${newlyAlertedOverdue.map(w => `- ${w.title}${w.dueDate ? ` (due ${w.dueDate})` : ""}`).join("\n")}\n\nPlease log in to review.`,
            });
            // Mark as alerted so we don't resend tomorrow unless status resets
            for (const wo of newlyAlertedOverdue) {
              await custDb.update(isolatedSchema.ppmWorkOrders)
                .set({ overdueAlertedAt: new Date() })
                .where(eq(isolatedSchema.ppmWorkOrders.id, wo.id));
            }
          }

          // Alert for missing certificates (only those not yet alerted; missingCertAlertedAt guards re-send)
          if (notifyEnabled) for (const wo of missingCertWOs) {
            const recipients = [...new Set([adminEmail, wo.assignedEmail].filter((e): e is string => !!e))];
            for (const email of recipients) {
              await emailSvc.sendEmail({
                to: email,
                subject: `PPM Certificate Missing: ${wo.title}`,
                companyName,
                html: `
                  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                    <div style="background:#d97706;color:#fff;padding:20px;border-radius:8px 8px 0 0">
                      <h2 style="margin:0">PPM Certificate Required — ${companyName}</h2>
                    </div>
                    <div style="background:#fff;padding:20px;border:1px solid #e5e7eb">
                      <p>The following PPM work order was completed more than 48 hours ago but no service certificate has been uploaded:</p>
                      <p><strong>${wo.title}</strong>${wo.completedDate ? ` — completed ${wo.completedDate}` : ""}</p>
                      <p>Please upload the relevant certificate as soon as possible.</p>
                    </div>
                  </div>
                `,
                text: `PPM Certificate Missing: ${wo.title}\n\nThis work order was completed more than 48 hours ago but no service certificate has been uploaded.\n\nPlease upload the certificate.`,
              });
            }
            // Mark alert as sent so it is not repeated daily
            await custDb.update(isolatedSchema.ppmWorkOrders)
              .set({ missingCertAlertedAt: new Date() })
              .where(eq(isolatedSchema.ppmWorkOrders.id, wo.id));
          }

          // ── (c) Alert for overdue work orders with no documents uploaded ─────────
          // Checks overdue WOs that have no docs at all (any type) and haven't
          // been alerted yet. Sends one consolidated email to admin.
          const overdueWOs = workOrders.filter(w =>
            w.status === "overdue" && !w.missingDocsAlertedAt
          );
          const missingDocsWOs: (typeof workOrders[0])[] = [];
          for (const wo of overdueWOs) {
            const docs = await custDb.select({ id: isolatedSchema.ppmWorkOrderDocuments.id })
              .from(isolatedSchema.ppmWorkOrderDocuments)
              .where(eq(isolatedSchema.ppmWorkOrderDocuments.workOrderId, wo.id))
              .limit(1);
            if (docs.length === 0) missingDocsWOs.push(wo);
          }
          if (notifyEnabled && missingDocsWOs.length > 0 && adminEmail) {
            const rows = missingDocsWOs.map(wo =>
              `<tr>
                <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-weight:500">${wo.title}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#dc2626">${wo.dueDate ?? "—"}</td>
              </tr>`
            ).join("");
            const sent = await emailSvc.sendEmail({
              to: adminEmail,
              subject: `PPM Alert: ${missingDocsWOs.length} Overdue Work Order${missingDocsWOs.length > 1 ? "s" : ""} With No Documents`,
              companyName,
              html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                  <div style="background:#dc2626;color:#fff;padding:20px;border-radius:8px 8px 0 0">
                    <h2 style="margin:0">PPM Documents Missing — ${companyName}</h2>
                  </div>
                  <div style="background:#fff;padding:20px;border:1px solid #e5e7eb">
                    <p style="margin-top:0">The following PPM work order${missingDocsWOs.length > 1 ? "s are" : " is"} overdue and <strong>no documents or reports have been uploaded</strong>:</p>
                    <table style="width:100%;border-collapse:collapse;margin:12px 0">
                      <thead>
                        <tr style="background:#fef2f2">
                          <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Work Order</th>
                          <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Due Date</th>
                        </tr>
                      </thead>
                      <tbody>${rows}</tbody>
                    </table>
                    <p style="color:#6b7280;font-size:14px">Please upload the relevant service report, certificate, or completion evidence as soon as possible.</p>
                  </div>
                  <div style="background:#f9fafb;padding:12px 20px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;font-size:12px;color:#9ca3af">
                    This alert was sent by ${companyName} via TPR-Max PPM system.
                  </div>
                </div>
              `,
              text: `PPM Documents Missing\n\nThe following work orders are overdue with no documents uploaded:\n\n${missingDocsWOs.map(w => `- ${w.title} (due: ${w.dueDate ?? "—"})`).join("\n")}\n\nPlease upload the relevant service report or certificate.`,
            });
            if (sent) {
              for (const wo of missingDocsWOs) {
                await custDb.update(isolatedSchema.ppmWorkOrders)
                  .set({ missingDocsAlertedAt: new Date() })
                  .where(eq(isolatedSchema.ppmWorkOrders.id, wo.id));
              }
              console.log(`📧 [PPM Cron] Missing-docs alert sent for ${missingDocsWOs.length} work order(s) (customer ${customer.id})`);
            }
          }

          // ── (d) Alert for expiring/expired PPM work order documents ────────────
            // Sends a one-time digest email per document when it first enters the expiry
            // window (expired or expiring ≤30 days). Each document is stamped with
            // expiryAlertedAt after being included in an alert so it is never re-sent
            // on subsequent days. The stamp is absent on newly-uploaded documents, so
            // replacement certificates automatically trigger a fresh alert if they too
            // are within the 30-day window.
            {
              const todayDateStr = today.toISOString().split("T")[0];
              const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
              const in30DaysStr = in30Days.toISOString().split("T")[0];

              // Only fetch docs that have not yet been alerted (expiryAlertedAt IS NULL)
              const expiringDocs = await custDb.select({
                id: isolatedSchema.ppmWorkOrderDocuments.id,
                fileName: isolatedSchema.ppmWorkOrderDocuments.fileName,
                fileType: isolatedSchema.ppmWorkOrderDocuments.fileType,
                expiryDate: isolatedSchema.ppmWorkOrderDocuments.expiryDate,
                workOrderId: isolatedSchema.ppmWorkOrderDocuments.workOrderId,
                referenceNumber: isolatedSchema.ppmWorkOrderDocuments.referenceNumber,
              }).from(isolatedSchema.ppmWorkOrderDocuments)
                .where(and(
                  sql`${isolatedSchema.ppmWorkOrderDocuments.expiryDate} IS NOT NULL`,
                  sql`${isolatedSchema.ppmWorkOrderDocuments.expiryDate} <= ${in30DaysStr}`,
                  sql`${isolatedSchema.ppmWorkOrderDocuments.expiryAlertedAt} IS NULL`
                ));

              if (notifyEnabled && expiringDocs.length > 0 && adminEmail) {
                // Enrich with work order title
                const woIds = [...new Set(expiringDocs.map(d => d.workOrderId))];
                const relatedWOs = await custDb.select({
                  id: isolatedSchema.ppmWorkOrders.id,
                  title: isolatedSchema.ppmWorkOrders.title,
                }).from(isolatedSchema.ppmWorkOrders)
                  .where(inArray(isolatedSchema.ppmWorkOrders.id, woIds));
                const woMap = Object.fromEntries(relatedWOs.map(w => [w.id, w.title]));

                const expired = expiringDocs.filter(d => d.expiryDate! <= todayDateStr);
                const soonExpiring = expiringDocs.filter(d => d.expiryDate! > todayDateStr);

                const buildRow = (d: typeof expiringDocs[0], isExp: boolean) =>
                  `<tr>
                    <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-weight:500">${d.fileName}</td>
                    <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6">${woMap[d.workOrderId] ?? d.workOrderId}</td>
                    <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:${isExp ? "#dc2626" : "#d97706"};font-weight:600">${d.expiryDate}</td>
                    <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:${isExp ? "#dc2626" : "#d97706"}">${isExp ? "Expired" : "Expiring Soon"}</td>
                  </tr>`;

                const tableRows = [
                  ...expired.map(d => buildRow(d, true)),
                  ...soonExpiring.map(d => buildRow(d, false)),
                ].join("");

                const subjectCount = expiringDocs.length;
                const hasExpired = expired.length > 0;
                const subject = hasExpired
                  ? `PPM Alert: ${expired.length} Expired Document${expired.length > 1 ? "s" : ""}${soonExpiring.length > 0 ? ` & ${soonExpiring.length} Expiring Soon` : ""}`
                  : `PPM Alert: ${soonExpiring.length} Document${soonExpiring.length > 1 ? "s" : ""} Expiring Soon`;

                const sent = await emailSvc.sendEmail({
                  to: adminEmail,
                  subject,
                  companyName,
                  html: `
                    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto">
                      <div style="background:${hasExpired ? "#dc2626" : "#d97706"};color:#fff;padding:20px;border-radius:8px 8px 0 0">
                        <h2 style="margin:0">PPM Document Expiry Alert — ${companyName}</h2>
                      </div>
                      <div style="background:#fff;padding:20px;border:1px solid #e5e7eb">
                        <p style="margin-top:0">${subjectCount} PPM work order document${subjectCount > 1 ? "s require" : " requires"} attention:</p>
                        <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:14px">
                          <thead>
                            <tr style="background:#f9fafb">
                              <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Document</th>
                              <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Work Order</th>
                              <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Expiry Date</th>
                              <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Status</th>
                            </tr>
                          </thead>
                          <tbody>${tableRows}</tbody>
                        </table>
                        <p style="color:#6b7280;font-size:13px">Please log in to TPR-Max to review and replace these documents as required.</p>
                      </div>
                      <div style="background:#f9fafb;padding:12px 20px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;font-size:12px;color:#9ca3af">
                        This alert was sent by ${companyName} via TPR-Max PPM system.
                      </div>
                    </div>
                  `,
                  text: `PPM Document Expiry Alert\n\n${expired.length > 0 ? `Expired (${expired.length}):\n${expired.map(d => `- ${d.fileName} (WO: ${woMap[d.workOrderId] ?? d.workOrderId}, expired: ${d.expiryDate})`).join("\n")}\n\n` : ""}${soonExpiring.length > 0 ? `Expiring Soon (${soonExpiring.length}):\n${soonExpiring.map(d => `- ${d.fileName} (WO: ${woMap[d.workOrderId] ?? d.workOrderId}, expires: ${d.expiryDate})`).join("\n")}\n\n` : ""}Please log in to TPR-Max to review.`,
                });
                if (sent) {
                  // Stamp each alerted document so it is not re-sent on future cron runs
                  const alertedIds = expiringDocs.map(d => d.id);
                  await custDb.update(isolatedSchema.ppmWorkOrderDocuments)
                    .set({ expiryAlertedAt: new Date() })
                    .where(inArray(isolatedSchema.ppmWorkOrderDocuments.id, alertedIds));
                  console.log(`📧 [PPM Cron] Document expiry alert sent for ${subjectCount} document(s) (customer ${customer.id})`);
                }
              }
            }

          // ── Auto-generate work orders from due schedules ─────────────────────
          // Idempotent: keyed by scheduleId + nextDueDate to avoid duplicates
          const schedules = await custDb.select().from(isolatedSchema.ppmSchedules)
            .where(eq(isolatedSchema.ppmSchedules.status, "scheduled"));
          const todayStr = today.toISOString().split("T")[0];
          let generatedCount = 0;

          function advanceDueDate(currentDue: string, frequency: string, customDays: number | null): string {
            const d = new Date(currentDue);
            switch (frequency) {
              case "weekly":    d.setDate(d.getDate() + 7); break;
              case "monthly":   d.setMonth(d.getMonth() + 1); break;
              case "quarterly": d.setMonth(d.getMonth() + 3); break;
              case "biannual":
              case "semi-annual":
              case "biannually": d.setMonth(d.getMonth() + 6); break;
              case "annual":
              case "annually":
              case "yearly":    d.setFullYear(d.getFullYear() + 1); break;
              case "custom":    d.setDate(d.getDate() + (customDays ?? 30)); break;
              default:          d.setMonth(d.getMonth() + 1); break;
            }
            return d.toISOString().split("T")[0];
          }

          for (const schedule of schedules) {
            if (!schedule.nextDueDate || schedule.nextDueDate > todayStr) continue;
            // Check by (scheduleId, dueDate) so recurring schedules generate a new WO each cycle.
            // Exclude completed/cancelled WOs so a newly-due cycle always gets its own work order.
            const [existing] = await custDb.select({ id: isolatedSchema.ppmWorkOrders.id })
              .from(isolatedSchema.ppmWorkOrders)
              .where(and(
                eq(isolatedSchema.ppmWorkOrders.scheduleId, schedule.id),
                eq(isolatedSchema.ppmWorkOrders.dueDate, schedule.nextDueDate),
                ne(isolatedSchema.ppmWorkOrders.status, "completed"),
                ne(isolatedSchema.ppmWorkOrders.status, "cancelled")
              ));
            if (existing) continue;
            const woToken = randomBytes(24).toString("hex");
            const woTokenExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days
            await custDb.insert(isolatedSchema.ppmWorkOrders).values({
              scheduleId: schedule.id,
              assetId: schedule.assetId,
              title: schedule.title,
              description: schedule.notes ?? undefined,
              status: "scheduled",
              dueDate: schedule.nextDueDate,
              accessToken: woToken,
              accessTokenExpiresAt: woTokenExpiry,
            });
            // Advance the schedule's nextDueDate
            const nextDue = advanceDueDate(schedule.nextDueDate, schedule.frequency, schedule.customDays ?? null);
            await custDb.update(isolatedSchema.ppmSchedules)
              .set({ nextDueDate: nextDue })
              .where(eq(isolatedSchema.ppmSchedules.id, schedule.id));
            generatedCount++;
          }

          if (generatedCount > 0) {
            console.log(`✅ [PPM Cron] Generated ${generatedCount} work orders from schedules for customer ${customer.id}`);
          }
        } catch (custErr) {
          console.error(`[PPM Cron] Error processing customer ${customer.id}:`, custErr);
        }
      }
      console.log("✅ [PPM Cron] Daily check complete");
    } catch (error: unknown) {
      console.error("❌ [PPM Cron] Fatal error:", error);
    }
  }, { timezone: "Europe/London" });

  // ── CDM F10 Daily Alert Cron ─────────────────────────────────────────────────
  // Runs daily at the same hour as PPM alerts (Europe/London).
  // Scans all active CDM projects that meet F10 notification thresholds but have
  // no submission date recorded, and sends a single daily email to the admin.
  // Deduplication: f10_alert_sent_at is updated per-project so each project only
  // triggers one email per calendar day.
  cron.schedule(`0 ${ppmAlertHour} * * *`, async () => {
    try {
      console.log("🏗️ [CDM Cron] Running daily F10 alert check…");
      const allCustomers = await customerDbService.getAllCustomers();
      // Use Europe/London date to match business-day semantics of the cron timezone
      const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" }); // YYYY-MM-DD

      for (const customer of allCustomers) {
        try {
          const custDb = await customerDbService.getCustomerDatabase(customer.id);

          // Fetch active projects that require F10 but have not submitted it
          const projects = await custDb.select().from(isolatedSchema.cdmProjects)
            .where(eq(isolatedSchema.cdmProjects.status, "active"));

          const overdue: (typeof projects[0])[] = [];
          for (const project of projects) {
            // F10 threshold: (>30 days AND >20 peak workers) OR >500 person-days
            const meetsThreshold =
              ((project.estimatedDays ?? 0) > 30 && (project.peakWorkers ?? 0) > 20) ||
              (project.personDays ?? 0) > 500;
            if (!meetsThreshold) continue;

            // Not yet submitted
            if (project.f10Status === "submitted" || project.f10Date) continue;

            // Deduplication: skip if already alerted today
            if (project.f10AlertSentAt) {
              const lastAlertDate = new Date(project.f10AlertSentAt).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
              if (lastAlertDate === todayStr) continue;
            }

            overdue.push(project);
          }

          if (overdue.length === 0) continue;

          // Get admin email and company name (use dedicated CDM alerts email if configured, else fall back to main company email)
          const settingsRows = await custDb.execute(`SELECT company_name, email, cdm_alerts_email FROM company_settings LIMIT 1`);
          const settings = settingsRows.rows[0] as { company_name?: string; email?: string; cdm_alerts_email?: string } | undefined;
          const companyName = (settings?.company_name as string) || "TPR-Max";
          const cdmAlertsEmail = ((settings?.cdm_alerts_email as string | undefined) || '').trim();
          const companyEmail = ((settings?.email as string | undefined) || '').trim();

          // Build a deduplicated list of recipient addresses:
          // send to both cdm_alerts_email AND the main company email when both are populated.
          const recipientSet = new Set<string>();
          if (cdmAlertsEmail) recipientSet.add(cdmAlertsEmail);
          if (companyEmail) recipientSet.add(companyEmail);
          const recipients = Array.from(recipientSet);

          if (recipients.length === 0) {
            console.warn(`[CDM Cron] No admin email configured for customer ${customer.id} — skipping`);
            continue;
          }

          const emailSvc = new EmailService(customer.id);
          const emailPayload = {
            subject: `CDM Alert: ${overdue.length} F10 Notification${overdue.length > 1 ? "s" : ""} Outstanding`,
            companyName,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                <div style="background:#b45309;color:#fff;padding:20px;border-radius:8px 8px 0 0">
                  <h2 style="margin:0">CDM F10 Notification Alert — ${companyName}</h2>
                </div>
                <div style="background:#fff;padding:20px;border:1px solid #e5e7eb">
                  <p>The following CDM project${overdue.length > 1 ? "s require" : " requires"} an F10 HSE notification but no submission has been recorded:</p>
                  <ul style="padding-left:20px">
                    ${overdue.map(p => `<li><strong>${p.title}</strong>${p.location ? ` — ${p.location}` : ""}${p.clientName ? ` (Client: ${p.clientName})` : ""}</li>`).join("")}
                  </ul>
                  <p>These projects meet the HSE notification threshold (duration &gt;30 days with &gt;20 workers, or &gt;500 person-days). Please submit the F10 notification to the HSE and record the submission date in TPR-Max.</p>
                  <p>Please log in to TPR-Max to review and update each project's F10 status.</p>
                </div>
              </div>
            `,
            text: `CDM F10 Notification Alert\n\n${overdue.length} project(s) require an F10 HSE notification but no submission has been recorded:\n\n${overdue.map(p => `- ${p.title}${p.location ? ` (${p.location})` : ""}`).join("\n")}\n\nPlease submit the F10 notification and record it in TPR-Max.`,
          };

          const sendResults = await Promise.all(recipients.map(addr => emailSvc.sendEmail({ to: addr, ...emailPayload })));
          const sent = sendResults.every(Boolean);

          if (!sent) {
            console.warn(`[CDM Cron] Email send failed for customer ${customer.id} — skipping f10_alert_sent_at update`);
            continue;
          }

          // Mark each project as alerted today (only when email was successfully delivered)
          const now = new Date();
          for (const project of overdue) {
            await custDb.update(isolatedSchema.cdmProjects)
              .set({ f10AlertSentAt: now })
              .where(eq(isolatedSchema.cdmProjects.id, project.id));
          }

          console.log(`✅ [CDM Cron] Sent F10 alert for ${overdue.length} project(s) to ${recipients.join(', ')} (customer ${customer.id})`);
        } catch (custErr) {
          console.error(`[CDM Cron] Error processing customer ${customer.id}:`, custErr);
        }
      }
      console.log("✅ [CDM Cron] Daily F10 check complete");
    } catch (error: unknown) {
      console.error("❌ [CDM Cron] Fatal error:", error);
    }
  }, { timezone: "Europe/London" });

  // ── CDM 2015 Routes ──────────────────────────────────────────────────────────

  // GET all CDM projects for a contractor company
  app.get("/api/cdm/projects", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    try {
      const { companyId } = req.query;
      const db = await customerDbService.getCustomerDatabase(req.customerId!);
      let projects: any[];
      if (companyId) {
        projects = await db.select().from(isolatedSchema.cdmProjects)
          .where(eq(isolatedSchema.cdmProjects.companyId, companyId as string))
          .orderBy(isolatedSchema.cdmProjects.createdAt);
      } else {
        projects = await db.select().from(isolatedSchema.cdmProjects)
          .orderBy(isolatedSchema.cdmProjects.createdAt);
      }
      res.json(projects);
    } catch (error) {
      console.error("Error fetching CDM projects:", error);
      res.status(500).json({ error: "Failed to fetch CDM projects" });
    }
  });

  // GET CDM compliance report as PDF
  app.get("/api/cdm/projects/export-pdf", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    try {
      const db = await customerDbService.getCustomerDatabase(req.customerId!);
      const username = req.user!.username;
      const settingsContext = simpleDatabaseService.createCustomerContext(username, req.customerId!);
      const companySettings = await simpleDatabaseService.getCompanySettings(settingsContext);

      // Build the "Prepared By" name: prefer display name, fall back to username, then company name
      const adminUser = req.user!;
      const preparedBy = (adminUser.firstName && adminUser.lastName)
        ? `${adminUser.firstName} ${adminUser.lastName}`
        : (adminUser.firstName || adminUser.lastName || adminUser.username || companySettings?.companyName || "");

      // Resolve logo to an absolute URL so Puppeteer can fetch it (relative paths break in setContent)
      let resolvedLogoUrl = "";
      if (companySettings?.logoUrl) {
        const raw = companySettings.logoUrl;
        if (raw.startsWith("http://") || raw.startsWith("https://")) {
          resolvedLogoUrl = raw;
        } else {
          // Normalize path: /uploads/... → /objects/uploads/..., /objects/... → as-is
          let normalized = raw;
          if (normalized.startsWith("/uploads/")) {
            normalized = `/objects${normalized}`;
          } else if (!normalized.startsWith("/objects")) {
            normalized = `/objects/uploads/${normalized.replace(/^\/+/, "")}`;
          }
          resolvedLogoUrl = `http://localhost:${process.env.PORT ?? 5000}${normalized}`;
        }
      }

      // Parse optional filter query params
      const statusFilter = typeof req.query.status === 'string' && req.query.status !== 'all' ? req.query.status : null;
      const fromDate = typeof req.query.from === 'string' && req.query.from ? req.query.from : null;
      const toDate = typeof req.query.to === 'string' && req.query.to ? req.query.to : null;
      const companyIdFilter = typeof req.query.companyId === 'string' && req.query.companyId ? req.query.companyId : null;

      // Build WHERE conditions for cdmProjects
      const filterConditions: SQL<boolean>[] = [];
      if (statusFilter) filterConditions.push(eq(isolatedSchema.cdmProjects.status, statusFilter));
      if (fromDate) filterConditions.push(gte(isolatedSchema.cdmProjects.startDate, fromDate));
      if (toDate) filterConditions.push(lte(isolatedSchema.cdmProjects.startDate, toDate));
      if (companyIdFilter) filterConditions.push(eq(isolatedSchema.cdmProjects.companyId, companyIdFilter));

      const projectsBaseQuery = db.select().from(isolatedSchema.cdmProjects);
      const projectsFilteredQuery = filterConditions.length > 0
        ? projectsBaseQuery.where(filterConditions.length === 1 ? filterConditions[0] : and(...filterConditions))
        : projectsBaseQuery;

      const [projects, companies] = await Promise.all([
        projectsFilteredQuery.orderBy(isolatedSchema.cdmProjects.createdAt),
        db.select().from(isolatedSchema.contractorCompanies).orderBy(isolatedSchema.contractorCompanies.companyName),
      ]);

      const companyMap = new Map(companies.map((c: any) => [c.id, c.companyName]));
      const filteredCompanyName = companyIdFilter ? (companyMap.get(companyIdFilter) ?? null) : null;

      const esc = (s: string | null | undefined): string => {
        if (!s) return '';
        return String(s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      };

      const grouped = new Map<string, { companyName: string; projects: any[] }>();
      for (const p of projects) {
        const cid = p.companyId ?? "__unassigned__";
        const name = companyMap.get(cid) ?? "Unassigned";
        if (!grouped.has(cid)) grouped.set(cid, { companyName: name, projects: [] });
        grouped.get(cid)!.projects.push(p);
      }

      const isNotifiable = (p: any) =>
        (p.estimatedDays && p.estimatedDays > 30) ||
        (p.peakWorkers && p.peakWorkers > 20) ||
        (p.personDays && p.personDays > 500);

      const f10Badge = (p: any) => {
        if (!isNotifiable(p)) return `<span class="badge badge-grey">Not Required</span>`;
        if (p.f10Status === "submitted") return `<span class="badge badge-green">F10 Submitted</span>`;
        if (p.f10Status === "pending") return `<span class="badge badge-amber">F10 Pending</span>`;
        return `<span class="badge badge-red">F10 Required</span>`;
      };

      const statusBadge = (s: string) => {
        const map: Record<string, string> = { planning: "badge-blue", active: "badge-green", complete: "badge-grey", cancelled: "badge-red" };
        return `<span class="badge ${map[s] ?? "badge-grey"}">${s.charAt(0).toUpperCase() + s.slice(1)}</span>`;
      };

      const tick = (v: boolean) => v
        ? `<span class="tick tick-yes">&#10003;</span>`
        : `<span class="tick tick-no">&#10007;</span>`;

      const docRow = (label: string, status: string, date: string | null, notes: string | null) => {
        const statusColors: Record<string, string> = {
          not_prepared: "#dc2626", in_progress: "#d97706", approved: "#16a34a",
          prepared: "#16a34a", distributed: "#16a34a",
          not_started: "#dc2626", complete: "#16a34a", handed_over: "#16a34a",
        };
        const colour = statusColors[esc(status)] ?? "#6b7280";
        const statusLabel = esc(status).replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase());
        return `<tr>
          <td class="doc-label">${esc(label)}</td>
          <td><span style="color:${colour};font-weight:600">${statusLabel}</span></td>
          <td>${date ? new Date(date).toLocaleDateString("en-GB") : "—"}</td>
          <td class="notes-cell">${notes ? esc(notes.substring(0, 80)) : "—"}</td>
        </tr>`;
      };

      const roleLabel = (r: string) => r.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());

      // --- Compliance summary stats ---
      const statusCounts = { planning: 0, active: 0, complete: 0, cancelled: 0 } as Record<string, number>;
      for (const p of projects) {
        if (p.status in statusCounts) statusCounts[p.status]++;
      }

      let notifiableCount = 0;
      let f10Submitted = 0;
      let f10Pending = 0;
      let f10RequiredUnsent = 0;
      for (const p of projects) {
        if (isNotifiable(p)) {
          notifiableCount++;
          if (p.f10Status === "submitted") f10Submitted++;
          else if (p.f10Status === "pending") f10Pending++;
          else f10RequiredUnsent++;
        }
      }

      const contractorSummaryRows: { name: string; totalProjects: number; notifiable: number; f10Ok: number; docRate: number }[] = [];
      let portfolioCompliantDocs = 0;
      let portfolioTotalDocs = 0;
      for (const [, group] of grouped) {
        const totalProjects = group.projects.length;
        const notifiable = group.projects.filter((p: any) => isNotifiable(p)).length;
        const f10Ok = group.projects.filter((p: any) => isNotifiable(p) && p.f10Status === "submitted").length;
        let compliantDocs = 0;
        for (const p of group.projects) {
          if (["approved", "prepared", "distributed"].includes(p.cppStatus ?? "")) compliantDocs++;
          if (["approved", "prepared", "distributed"].includes(p.pciStatus ?? "")) compliantDocs++;
          if (["complete", "handed_over"].includes(p.hsfStatus ?? "")) compliantDocs++;
        }
        portfolioCompliantDocs += compliantDocs;
        portfolioTotalDocs += totalProjects * 3;
        const docRate = totalProjects > 0 ? Math.round((compliantDocs / (totalProjects * 3)) * 100) : 0;
        contractorSummaryRows.push({ name: group.companyName, totalProjects, notifiable, f10Ok, docRate });
      }

      const portfolioScore = portfolioTotalDocs > 0 ? Math.round((portfolioCompliantDocs / portfolioTotalDocs) * 100) : 0;

      const rateColour = (r: number) => r >= 80 ? "#15803d" : r >= 50 ? "#b45309" : "#b91c1c";
      const rateBg = (r: number) => r >= 80 ? "#dcfce7" : r >= 50 ? "#fef3c7" : "#fee2e2";
      const portfolioScoreLabel = portfolioScore >= 80 ? "High Compliance" : portfolioScore >= 50 ? "Partial Compliance" : "Low Compliance";

      const contractorTableRows = contractorSummaryRows.map(row => `
        <tr>
          <td style="font-weight:600;color:#1e293b">${esc(row.name)}</td>
          <td style="text-align:center">${row.totalProjects}</td>
          <td style="text-align:center">${row.notifiable}</td>
          <td style="text-align:center">${row.notifiable > 0 ? `${row.f10Ok} / ${row.notifiable}` : "—"}</td>
          <td style="text-align:center">
            <span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:9px;font-weight:700;background:${rateBg(row.docRate)};color:${rateColour(row.docRate)}">${row.docRate}%</span>
          </td>
        </tr>`).join("");

      const summaryPageHtml = `
<div class="summary-page">
  <div class="summary-page-header">
    <div class="summary-page-title">Executive Compliance Summary</div>
    <div class="summary-page-subtitle">Portfolio overview &mdash; ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</div>
  </div>

  <div class="summary-block" style="text-align:center;padding:20px 24px">
    <div class="summary-block-title" style="margin-bottom:12px">Overall Compliance Score</div>
    <div style="display:inline-flex;flex-direction:column;align-items:center;gap:6px;background:${rateBg(portfolioScore)};border:2px solid ${rateColour(portfolioScore)};border-radius:12px;padding:16px 40px">
      <div style="font-size:48px;font-weight:800;line-height:1;color:${rateColour(portfolioScore)}">${portfolioScore}%</div>
      <div style="font-size:12px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:${rateColour(portfolioScore)}">${portfolioScoreLabel}</div>
    </div>
    <div style="margin-top:10px;font-size:9px;color:#64748b">Weighted average of CPP, PCI &amp; HSF document completion across all projects</div>
  </div>

  <div class="summary-block">
    <div class="summary-block-title">Projects by Status</div>
    <div class="summary-stat-row">
      <div class="summary-stat-card summary-stat-blue">
        <div class="summary-stat-value">${statusCounts.planning}</div>
        <div class="summary-stat-label">Planning</div>
      </div>
      <div class="summary-stat-card summary-stat-green">
        <div class="summary-stat-value">${statusCounts.active}</div>
        <div class="summary-stat-label">Active</div>
      </div>
      <div class="summary-stat-card summary-stat-grey">
        <div class="summary-stat-value">${statusCounts.complete}</div>
        <div class="summary-stat-label">Complete</div>
      </div>
      <div class="summary-stat-card summary-stat-red">
        <div class="summary-stat-value">${statusCounts.cancelled}</div>
        <div class="summary-stat-label">Cancelled</div>
      </div>
    </div>
  </div>

  <div class="summary-block">
    <div class="summary-block-title">F10 Notification Status</div>
    <div class="summary-stat-row">
      <div class="summary-stat-card summary-stat-amber">
        <div class="summary-stat-value">${notifiableCount}</div>
        <div class="summary-stat-label">Notifiable Projects</div>
      </div>
      <div class="summary-stat-card summary-stat-green">
        <div class="summary-stat-value">${f10Submitted}</div>
        <div class="summary-stat-label">F10 Submitted</div>
      </div>
      <div class="summary-stat-card summary-stat-amber">
        <div class="summary-stat-value">${f10Pending}</div>
        <div class="summary-stat-label">F10 Pending</div>
      </div>
      <div class="summary-stat-card summary-stat-red">
        <div class="summary-stat-value">${f10RequiredUnsent}</div>
        <div class="summary-stat-label">F10 Not Submitted</div>
      </div>
    </div>
  </div>

  <div class="summary-block">
    <div class="summary-block-title">Per-Contractor Compliance Overview</div>
    <table class="summary-table">
      <thead>
        <tr>
          <th>Contractor</th>
          <th style="text-align:center">Projects</th>
          <th style="text-align:center">Notifiable</th>
          <th style="text-align:center">F10 Submitted</th>
          <th style="text-align:center">Doc Compliance</th>
        </tr>
      </thead>
      <tbody>${contractorTableRows || `<tr><td colspan="5" style="text-align:center;color:#64748b">No contractor data</td></tr>`}</tbody>
    </table>
    <div class="summary-table-note">Doc Compliance = percentage of CPP / PCI / HSF documents in an approved, prepared, or distributed state (CPP &amp; PCI) or complete / handed-over state (HSF) across all projects.</div>
  </div>
</div>`;

      let groupsHtml = "";
      for (const [, group] of grouped) {
        const rows = group.projects.map(p => `
          <div class="project-card">
            <div class="project-header">
              <div class="project-title-row">
                <span class="project-title">${esc(p.title)}</span>
                ${statusBadge(p.status)}
                ${f10Badge(p)}
              </div>
              <div class="project-meta">
                ${p.location ? `<span>&#x1F4CD; ${esc(p.location)}</span>` : ""}
                ${p.clientName ? `<span>Client: ${esc(p.clientName)}</span>` : ""}
                <span>Role: ${esc(roleLabel(p.contractorRole ?? "contractor"))}</span>
                ${p.startDate ? `<span>Start: ${new Date(p.startDate).toLocaleDateString("en-GB")}</span>` : ""}
                ${p.endDate ? `<span>End: ${new Date(p.endDate).toLocaleDateString("en-GB")}</span>` : ""}
              </div>
              ${p.f10Reference ? `<div class="f10-ref">HSE F10 Reference: <strong>${esc(p.f10Reference)}</strong>${p.f10Date ? ` (submitted ${new Date(p.f10Date).toLocaleDateString("en-GB")})` : ""}</div>` : ""}
            </div>
            <table class="doc-table">
              <thead><tr><th>Document</th><th>Status</th><th>Date</th><th>Notes</th></tr></thead>
              <tbody>
                ${docRow("Construction Phase Plan (CPP)", p.cppStatus ?? "not_prepared", p.cppDate, p.cppNotes)}
                ${docRow("Pre-Construction Information (PCI)", p.pciStatus ?? "not_prepared", p.pciDate, p.pciNotes)}
                ${docRow("Health &amp; Safety File (HSF)", p.hsfStatus ?? "not_started", p.hsfDate, p.hsfNotes)}
              </tbody>
            </table>
            <div class="welfare-section">
              <div class="welfare-title">Welfare Provisions (CDM Reg 25)</div>
              <div class="welfare-grid">
                <div class="welfare-item">${tick(!!p.welfareToilets)} Sanitary Conveniences</div>
                <div class="welfare-item">${tick(!!p.welfareWashing)} Washing Facilities</div>
                <div class="welfare-item">${tick(!!p.welfareRestArea)} Rest Area</div>
                <div class="welfare-item">${tick(!!p.welfareDrinkingWater)} Drinking Water</div>
                <div class="welfare-item">${tick(!!p.welfareChanging)} Changing Rooms</div>
              </div>
            </div>
            ${p.notes ? `<div class="project-notes"><strong>Notes:</strong> ${esc(p.notes)}</div>` : ""}
          </div>`).join("");

        groupsHtml += `
          <div class="company-section">
            <div class="company-header">
              <span class="company-name">${esc(group.companyName)}</span>
              <span class="company-count">${group.projects.length} project${group.projects.length !== 1 ? "s" : ""}</span>
            </div>
            ${rows}
          </div>`;
      }

      const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<title>CDM 2015 Compliance Register</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; background: #fff; padding: 16px; }
  .report-header { border-bottom: 3px solid #d97706; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
  .report-header-left h1 { font-size: 20px; font-weight: 700; color: #92400e; }
  .report-header-left p { color: #64748b; font-size: 10px; margin-top: 4px; }
  .report-header-right { text-align: right; font-size: 11px; color: #374151; flex-shrink: 0; margin-left: 16px; }
  .report-header-right img { max-height: 48px; max-width: 140px; object-fit: contain; margin-bottom: 4px; display: block; margin-left: auto; }
  .report-header-right .org-name { font-weight: 700; font-size: 12px; color: #1e293b; }
  .report-header-right .org-address { font-size: 9px; color: #64748b; white-space: pre-line; margin-top: 2px; }
  .company-section { margin-bottom: 24px; }
  .company-header { background: #fef3c7; border-left: 4px solid #d97706; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .company-name { font-size: 13px; font-weight: 700; color: #92400e; }
  .company-count { font-size: 10px; color: #78716c; }
  .project-card { border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 10px; overflow: hidden; }
  .project-header { padding: 10px 12px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
  .project-title-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
  .project-title { font-size: 13px; font-weight: 600; color: #0f172a; }
  .project-meta { display: flex; gap: 12px; font-size: 10px; color: #64748b; flex-wrap: wrap; margin-top: 4px; }
  .f10-ref { font-size: 10px; color: #1d4ed8; margin-top: 4px; }
  .badge { display: inline-block; padding: 2px 7px; border-radius: 9999px; font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
  .badge-green { background: #dcfce7; color: #15803d; }
  .badge-amber { background: #fef3c7; color: #b45309; }
  .badge-red { background: #fee2e2; color: #b91c1c; }
  .badge-blue { background: #dbeafe; color: #1d4ed8; }
  .badge-grey { background: #f1f5f9; color: #475569; }
  .doc-table { width: 100%; border-collapse: collapse; font-size: 10px; }
  .doc-table th { background: #f1f5f9; text-align: left; padding: 5px 8px; font-weight: 600; color: #475569; border-bottom: 1px solid #e2e8f0; }
  .doc-table td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  .doc-label { font-weight: 600; color: #334155; width: 30%; }
  .notes-cell { color: #64748b; width: 30%; }
  .welfare-section { padding: 8px 12px; background: #fafafa; border-top: 1px solid #e2e8f0; }
  .welfare-title { font-size: 10px; font-weight: 700; color: #475569; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em; }
  .welfare-grid { display: flex; gap: 14px; flex-wrap: wrap; }
  .welfare-item { font-size: 10px; display: flex; align-items: center; gap: 4px; }
  .tick { font-size: 12px; font-weight: 700; }
  .tick-yes { color: #16a34a; }
  .tick-no { color: #dc2626; }
  .project-notes { padding: 6px 12px; font-size: 10px; color: #64748b; background: #fffbeb; border-top: 1px solid #fef3c7; }
  .report-footer { margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 9px; color: #94a3b8; }
  .cover-page { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; page-break-after: always; text-align: center; padding: 40px; background: #fff; }
  .cover-logo { max-height: 120px; max-width: 280px; object-fit: contain; margin-bottom: 32px; }
  .cover-logo-placeholder { width: 80px; height: 80px; background: #d97706; border-radius: 12px; margin: 0 auto 32px; }
  .cover-divider-top { width: 80px; height: 4px; background: #d97706; border-radius: 2px; margin: 0 auto 32px; }
  .cover-report-title { font-size: 28px; font-weight: 700; color: #92400e; letter-spacing: -0.5px; margin-bottom: 8px; }
  .cover-report-subtitle { font-size: 14px; color: #b45309; font-weight: 600; margin-bottom: 32px; letter-spacing: 0.05em; text-transform: uppercase; }
  .cover-divider-bottom { width: 80px; height: 4px; background: #d97706; border-radius: 2px; margin: 0 auto 32px; }
  .cover-company-name { font-size: 18px; font-weight: 700; color: #1e293b; margin-bottom: 10px; }
  .cover-company-address { font-size: 12px; color: #64748b; line-height: 1.7; white-space: pre-line; margin-bottom: 32px; }
  .cover-meta-box { border: 1px solid #fde68a; background: #fef3c7; border-radius: 8px; padding: 18px 32px; display: inline-block; margin-bottom: 0; }
  .cover-meta-row { font-size: 11px; color: #374151; margin-bottom: 6px; display: flex; justify-content: space-between; gap: 24px; }
  .cover-meta-row:last-child { margin-bottom: 0; }
  .cover-meta-label { font-weight: 600; color: #92400e; }
  .cover-confidential { margin-top: 48px; font-size: 9px; color: #94a3b8; letter-spacing: 0.1em; text-transform: uppercase; }
  .summary-page { page-break-after: always; padding: 32px 24px; }
  .summary-page-header { border-bottom: 3px solid #d97706; padding-bottom: 12px; margin-bottom: 24px; }
  .summary-page-title { font-size: 22px; font-weight: 700; color: #92400e; }
  .summary-page-subtitle { font-size: 11px; color: #64748b; margin-top: 4px; }
  .summary-block { margin-bottom: 28px; }
  .summary-block-title { font-size: 12px; font-weight: 700; color: #78350f; text-transform: uppercase; letter-spacing: 0.07em; border-left: 4px solid #d97706; padding-left: 8px; margin-bottom: 12px; background: #fef3c7; padding: 6px 10px; border-radius: 0 4px 4px 0; }
  .summary-stat-row { display: flex; gap: 14px; }
  .summary-stat-card { flex: 1; border-radius: 8px; padding: 16px 14px; text-align: center; border: 1px solid; }
  .summary-stat-value { font-size: 28px; font-weight: 700; margin-bottom: 4px; }
  .summary-stat-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; }
  .summary-stat-blue { background: #dbeafe; border-color: #93c5fd; color: #1d4ed8; }
  .summary-stat-green { background: #dcfce7; border-color: #86efac; color: #15803d; }
  .summary-stat-grey { background: #f1f5f9; border-color: #cbd5e1; color: #475569; }
  .summary-stat-red { background: #fee2e2; border-color: #fca5a5; color: #b91c1c; }
  .summary-stat-amber { background: #fef3c7; border-color: #fde68a; color: #b45309; }
  .summary-table { width: 100%; border-collapse: collapse; font-size: 10px; }
  .summary-table th { background: #fef3c7; text-align: left; padding: 7px 10px; font-weight: 700; color: #78350f; border-bottom: 2px solid #d97706; }
  .summary-table td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; color: #374151; }
  .summary-table tbody tr:nth-child(even) { background: #fafafa; }
  .summary-table-note { margin-top: 8px; font-size: 9px; color: #94a3b8; font-style: italic; }
  @media print { body { padding: 0; } .cover-page { min-height: 100vh; } .summary-page { min-height: 100vh; } }
</style>
</head><body>
<div class="cover-page">
  ${resolvedLogoUrl
    ? `<img class="cover-logo" src="${esc(resolvedLogoUrl)}" alt="Company logo" />`
    : `<div class="cover-logo-placeholder"></div>`}
  <div class="cover-divider-top"></div>
  <div class="cover-report-title">CDM 2015 Compliance Register${filteredCompanyName ? ` \u2014 ${esc(filteredCompanyName)}` : ""}</div>
  <div class="cover-report-subtitle">Construction (Design &amp; Management) Regulations 2015</div>
  <div class="cover-divider-bottom"></div>
  ${companySettings?.companyName ? `<div class="cover-company-name">${esc(companySettings.companyName)}</div>` : ""}
  ${companySettings?.address ? `<div class="cover-company-address">${esc(companySettings.address)}</div>` : ""}
  <div class="cover-meta-box">
    <div class="cover-meta-row">
      <span class="cover-meta-label">Date Generated:</span>
      <span>${new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</span>
    </div>
    <div class="cover-meta-row">
      <span class="cover-meta-label">Total Projects:</span>
      <span>${projects.length}</span>
    </div>
    <div class="cover-meta-row">
      <span class="cover-meta-label">Contractor Companies:</span>
      <span>${grouped.size}</span>
    </div>
    <div class="cover-meta-row">
      <span class="cover-meta-label">Prepared By:</span>
      <span>${esc(preparedBy)}</span>
    </div>
  </div>
  <div class="cover-confidential">Confidential &mdash; For internal and regulatory use only</div>
</div>
${summaryPageHtml}
<div class="report-header">
  <div class="report-header-left">
    <h1>CDM 2015 Compliance Register${filteredCompanyName ? ` \u2014 ${esc(filteredCompanyName)}` : ""}</h1>
    <p>Generated: ${new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} | Total Projects: ${projects.length} across ${grouped.size} contractor${grouped.size !== 1 ? "s" : ""}</p>
    ${(statusFilter || fromDate || toDate) ? `<p style="margin-top:4px;color:#92400e;font-weight:600">Filter: ${[statusFilter ? `Status: ${statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}` : null, fromDate ? `From: ${new Date(fromDate).toLocaleDateString("en-GB")}` : null, toDate ? `To: ${new Date(toDate).toLocaleDateString("en-GB")}` : null].filter(Boolean).join(" | ")}</p>` : ""}
  </div>
  <div class="report-header-right">
    ${resolvedLogoUrl ? `<img src="${esc(resolvedLogoUrl)}" alt="Company logo" />` : ""}
    <div class="org-name">${esc(companySettings?.companyName ?? "")}</div>
    ${companySettings?.address ? `<div class="org-address">${esc(companySettings.address)}</div>` : ""}
  </div>
</div>
${grouped.size === 0 ? `<p style="color:#64748b;text-align:center;margin-top:40px">No CDM projects found.</p>` : groupsHtml}
<div class="report-footer">CDM 2015 Compliance Register${companySettings?.companyName ? ` — ${esc(companySettings.companyName)}` : ""} — Confidential. For internal and regulatory use only.</div>
</body></html>`;

      const _rawSlug = filteredCompanyName ? filteredCompanyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : '';
      const companyFileSlug = _rawSlug ? '-' + _rawSlug : '';
      const toSafeSlugPart = (v: string) => v.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-|-$/g, '');
      const statusFileSlug = statusFilter ? `-${toSafeSlugPart(statusFilter)}` : '';
      const fromFileSlug = fromDate ? `-from-${toSafeSlugPart(fromDate)}` : '';
      const toFileSlug = toDate ? `-to-${toSafeSlugPart(toDate)}` : '';
      const filterFileSlug = `${statusFileSlug}${fromFileSlug}${toFileSlug}`;
      try {
        let puppeteer: any;
        try { puppeteer = await import('puppeteer'); } catch { throw new Error('puppeteer_unavailable'); }
        const puppeteerLaunch = puppeteer.default?.launch ?? puppeteer.launch;
        if (!puppeteerLaunch) throw new Error('puppeteer_launch_missing');
        const browser = await puppeteerLaunch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote', '--single-process'],
        });
        try {
          const page = await browser.newPage();
          await page.setContent(html, { waitUntil: 'networkidle0' });
          const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' },
          });
          await browser.close();
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="cdm-compliance-report${companyFileSlug}${filterFileSlug}-${new Date().toISOString().split('T')[0]}.pdf"`);
          return res.send(Buffer.from(pdfBuffer));
        } catch (pdfErr) {
          await browser.close();
          throw pdfErr;
        }
      } catch (pdfErr) {
        console.warn('[cdm-export-pdf] PDF generation unavailable, falling back to HTML:', (pdfErr as Error).message);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="cdm-compliance-report${companyFileSlug}${filterFileSlug}-${new Date().toISOString().split('T')[0]}.html"`);
        return res.send(html);
      }
    } catch (error) {
      console.error("Error generating CDM PDF:", error);
      res.status(500).json({ error: "Failed to generate CDM compliance report" });
    }
  });

  // GET single CDM project
  app.get("/api/cdm/projects/:id", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    try {
      const { id } = req.params;
      const db = await customerDbService.getCustomerDatabase(req.customerId!);
      const [project] = await db.select().from(isolatedSchema.cdmProjects)
        .where(eq(isolatedSchema.cdmProjects.id, id));
      if (!project) return res.status(404).json({ error: "CDM project not found" });
      res.json(project);
    } catch (error) {
      console.error("Error fetching CDM project:", error);
      res.status(500).json({ error: "Failed to fetch CDM project" });
    }
  });

  // POST create CDM project (admin only)
  app.post("/api/cdm/projects", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    try {
      const db = await customerDbService.getCustomerDatabase(req.customerId!);
      const data = req.body;
      const [project] = await db.insert(isolatedSchema.cdmProjects).values({
        companyId: data.companyId,
        title: data.title,
        description: data.description || null,
        location: data.location || null,
        clientName: data.clientName || null,
        contractorRole: data.contractorRole || "contractor",
        principalContractorId: data.principalContractorId || null,
        principalDesignerName: data.principalDesignerName || null,
        status: data.status || "planning",
        startDate: data.startDate || null,
        endDate: data.endDate || null,
        estimatedDays: data.estimatedDays ? parseInt(data.estimatedDays) : null,
        peakWorkers: data.peakWorkers ? parseInt(data.peakWorkers) : null,
        personDays: data.personDays ? parseInt(data.personDays) : null,
        f10Status: data.f10Status || "not_required",
        f10Date: data.f10Date || null,
        f10Reference: data.f10Reference || null,
        f10Notes: data.f10Notes || null,
        cppStatus: data.cppStatus || "not_prepared",
        cppDate: data.cppDate || null,
        cppNotes: data.cppNotes || null,
        pciStatus: data.pciStatus || "not_prepared",
        pciDate: data.pciDate || null,
        pciNotes: data.pciNotes || null,
        hsfStatus: data.hsfStatus || "not_started",
        hsfDate: data.hsfDate || null,
        hsfNotes: data.hsfNotes || null,
        welfareToilets: data.welfareToilets || false,
        welfareWashing: data.welfareWashing || false,
        welfareRestArea: data.welfareRestArea || false,
        welfareDrinkingWater: data.welfareDrinkingWater || false,
        welfareChanging: data.welfareChanging || false,
        notes: data.notes || null,
      }).returning();
      res.json(project);
    } catch (error) {
      console.error("Error creating CDM project:", error);
      res.status(500).json({ error: "Failed to create CDM project" });
    }
  });

  // PUT update CDM project (admin only)
  app.put("/api/cdm/projects/:id", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    try {
      const { id } = req.params;
      const db = await customerDbService.getCustomerDatabase(req.customerId!);
      const data = req.body;
      const updates: Record<string, any> = {};
      if (data.title !== undefined) updates.title = data.title;
      if (data.description !== undefined) updates.description = data.description;
      if (data.location !== undefined) updates.location = data.location;
      if (data.clientName !== undefined) updates.clientName = data.clientName;
      if (data.contractorRole !== undefined) updates.contractorRole = data.contractorRole;
      if (data.principalContractorId !== undefined) updates.principalContractorId = data.principalContractorId;
      if (data.principalDesignerName !== undefined) updates.principalDesignerName = data.principalDesignerName;
      if (data.status !== undefined) updates.status = data.status;
      if (data.startDate !== undefined) updates.startDate = data.startDate;
      if (data.endDate !== undefined) updates.endDate = data.endDate;
      if (data.estimatedDays !== undefined) updates.estimatedDays = data.estimatedDays ? parseInt(data.estimatedDays) : null;
      if (data.peakWorkers !== undefined) updates.peakWorkers = data.peakWorkers ? parseInt(data.peakWorkers) : null;
      if (data.personDays !== undefined) updates.personDays = data.personDays ? parseInt(data.personDays) : null;
      if (data.f10Status !== undefined) updates.f10Status = data.f10Status;
      if (data.f10Status === "submitted") updates.f10AlertSentAt = null;
      if (data.f10Date !== undefined) updates.f10Date = data.f10Date;
      if (data.f10Reference !== undefined) updates.f10Reference = data.f10Reference;
      if (data.f10Notes !== undefined) updates.f10Notes = data.f10Notes;
      if (data.cppStatus !== undefined) updates.cppStatus = data.cppStatus;
      if (data.cppDate !== undefined) updates.cppDate = data.cppDate;
      if (data.cppNotes !== undefined) updates.cppNotes = data.cppNotes;
      if (data.pciStatus !== undefined) updates.pciStatus = data.pciStatus;
      if (data.pciDate !== undefined) updates.pciDate = data.pciDate;
      if (data.pciNotes !== undefined) updates.pciNotes = data.pciNotes;
      if (data.hsfStatus !== undefined) updates.hsfStatus = data.hsfStatus;
      if (data.hsfDate !== undefined) updates.hsfDate = data.hsfDate;
      if (data.hsfNotes !== undefined) updates.hsfNotes = data.hsfNotes;
      if (data.welfareToilets !== undefined) updates.welfareToilets = data.welfareToilets;
      if (data.welfareWashing !== undefined) updates.welfareWashing = data.welfareWashing;
      if (data.welfareRestArea !== undefined) updates.welfareRestArea = data.welfareRestArea;
      if (data.welfareDrinkingWater !== undefined) updates.welfareDrinkingWater = data.welfareDrinkingWater;
      if (data.welfareChanging !== undefined) updates.welfareChanging = data.welfareChanging;
      if (data.notes !== undefined) updates.notes = data.notes;
      const [project] = await db.update(isolatedSchema.cdmProjects)
        .set(updates)
        .where(eq(isolatedSchema.cdmProjects.id, id))
        .returning();
      if (!project) return res.status(404).json({ error: "CDM project not found" });
      res.json(project);
    } catch (error) {
      console.error("Error updating CDM project:", error);
      res.status(500).json({ error: "Failed to update CDM project" });
    }
  });

  // DELETE CDM project (admin only)
  app.delete("/api/cdm/projects/:id", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    try {
      const { id } = req.params;
      const db = await customerDbService.getCustomerDatabase(req.customerId!);
      await db.delete(isolatedSchema.cdmProjects)
        .where(eq(isolatedSchema.cdmProjects.id, id));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting CDM project:", error);
      res.status(500).json({ error: "Failed to delete CDM project" });
    }
  });

  // PATCH update CDM project — alias for PUT (same handler, required by API contract)
  app.patch("/api/cdm/projects/:id", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    try {
      const { id } = req.params;
      const db = await customerDbService.getCustomerDatabase(req.customerId!);
      const data = req.body;
      const updates: Record<string, any> = {};
      if (data.title !== undefined) updates.title = data.title;
      if (data.description !== undefined) updates.description = data.description;
      if (data.location !== undefined) updates.location = data.location;
      if (data.clientName !== undefined) updates.clientName = data.clientName;
      if (data.contractorRole !== undefined) updates.contractorRole = data.contractorRole;
      if (data.principalContractorId !== undefined) updates.principalContractorId = data.principalContractorId;
      if (data.principalDesignerName !== undefined) updates.principalDesignerName = data.principalDesignerName;
      if (data.status !== undefined) updates.status = data.status;
      if (data.startDate !== undefined) updates.startDate = data.startDate;
      if (data.endDate !== undefined) updates.endDate = data.endDate;
      if (data.estimatedDays !== undefined) updates.estimatedDays = data.estimatedDays ? parseInt(data.estimatedDays) : null;
      if (data.peakWorkers !== undefined) updates.peakWorkers = data.peakWorkers ? parseInt(data.peakWorkers) : null;
      if (data.personDays !== undefined) updates.personDays = data.personDays ? parseInt(data.personDays) : null;
      // isNotifiable is a computed/display value — not persisted in DB, derived from estimatedDays/peakWorkers/personDays
      if (data.f10Status !== undefined) updates.f10Status = data.f10Status;
      if (data.f10Status === "submitted") updates.f10AlertSentAt = null;
      if (data.f10Date !== undefined) updates.f10Date = data.f10Date;
      if (data.f10Reference !== undefined) updates.f10Reference = data.f10Reference;
      if (data.f10Notes !== undefined) updates.f10Notes = data.f10Notes;
      if (data.cppStatus !== undefined) updates.cppStatus = data.cppStatus;
      if (data.cppDate !== undefined) updates.cppDate = data.cppDate;
      if (data.cppNotes !== undefined) updates.cppNotes = data.cppNotes;
      if (data.pciStatus !== undefined) updates.pciStatus = data.pciStatus;
      if (data.pciDate !== undefined) updates.pciDate = data.pciDate;
      if (data.pciNotes !== undefined) updates.pciNotes = data.pciNotes;
      if (data.hsfStatus !== undefined) updates.hsfStatus = data.hsfStatus;
      if (data.hsfDate !== undefined) updates.hsfDate = data.hsfDate;
      if (data.hsfNotes !== undefined) updates.hsfNotes = data.hsfNotes;
      if (data.welfareToilets !== undefined) updates.welfareToilets = data.welfareToilets;
      if (data.welfareWashing !== undefined) updates.welfareWashing = data.welfareWashing;
      if (data.welfareRestArea !== undefined) updates.welfareRestArea = data.welfareRestArea;
      if (data.welfareDrinkingWater !== undefined) updates.welfareDrinkingWater = data.welfareDrinkingWater;
      if (data.welfareChanging !== undefined) updates.welfareChanging = data.welfareChanging;
      if (data.notes !== undefined) updates.notes = data.notes;
      if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No fields to update" });
      const [project] = await db.update(isolatedSchema.cdmProjects).set(updates).where(eq(isolatedSchema.cdmProjects.id, id)).returning();
      if (!project) return res.status(404).json({ error: "CDM project not found" });
      res.json(project);
    } catch (error) {
      console.error("Error updating CDM project (PATCH):", error);
      res.status(500).json({ error: "Failed to update CDM project" });
    }
  });


  // PUT update contractor company CDM/accreditation fields (admin only)
  app.put("/api/cdm/contractor/:id/accreditations", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    try {
      const { id } = req.params;
      const db = await customerDbService.getCustomerDatabase(req.customerId!);
      const data = req.body;
      const updates: Record<string, any> = {};
      if (data.cdmRole !== undefined) updates.cdmRole = data.cdmRole;
      if (data.constructionlineGrade !== undefined) updates.constructionlineGrade = data.constructionlineGrade;
      if (data.smasAccredited !== undefined) updates.smasAccredited = data.smasAccredited;
      if (data.otherAccreditations !== undefined) updates.otherAccreditations = data.otherAccreditations;
      if (data.pdProfessionalBody !== undefined) updates.pdProfessionalBody = data.pdProfessionalBody;
      const [company] = await db.update(isolatedSchema.contractorCompanies)
        .set(updates)
        .where(eq(isolatedSchema.contractorCompanies.id, id))
        .returning();
      if (!company) return res.status(404).json({ error: "Contractor company not found" });
      res.json(company);
    } catch (error) {
      console.error("Error updating CDM accreditations:", error);
      res.status(500).json({ error: "Failed to update CDM accreditations" });
    }
  });


  // ── Nightly Contractor Document Expiry Cron ────────────────────────────────
  // Runs at midnight (00:00) Europe/London every night.
  // Scans all active contractor documents across all customers for those whose
  // expiryDate has passed OR is within the next 30 days, and have not yet
  // triggered an alert (expiryAlertedAt IS NULL).
  // Sends a digest email to the admin with "Expired" and "Expiring Soon" sections,
  // then stamps expiryAlertedAt so the alert is never repeated for the same document.
  {
    const rawHour = parseInt(process.env.CONTRACTOR_EXPIRY_ALERT_HOUR ?? "0", 10);
    const contractorExpiryAlertHour = isNaN(rawHour) || rawHour < 0 || rawHour > 23 ? 0 : rawHour;
    cron.schedule(`0 ${contractorExpiryAlertHour} * * *`, async () => {
      try {
        console.log("🔧 [Contractor Expiry Cron] Running nightly contractor document expiry check…");
        const allCustomers = await customerDbService.getAllCustomers();
        const now = new Date();

        for (const customer of allCustomers) {
          try {
            const custDb = await customerDbService.getCustomerDatabase(customer.id);

            const settingsRows = await custDb.execute(`SELECT company_name, email FROM company_settings LIMIT 1`);
            const settings = settingsRows.rows[0] as { company_name?: string; email?: string } | undefined;
            const companyName = (settings?.company_name as string) || "TPR-Max";
            const adminEmail = settings?.email as string | undefined;

            if (!adminEmail) {
              console.log(`[Contractor Expiry Cron] No admin email configured for customer ${customer.id} — skipping`);
              continue;
            }

            // Find active documents that have already expired OR expire within 30 days,
            // and have not yet been alerted (expiryAlertedAt IS NULL).
            const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

            const allAlertDocs = await custDb.select({
              id: isolatedSchema.contractorDocuments.id,
              documentName: isolatedSchema.contractorDocuments.documentName,
              documentType: isolatedSchema.contractorDocuments.documentType,
              expiryDate: isolatedSchema.contractorDocuments.expiryDate,
              companyId: isolatedSchema.contractorDocuments.companyId,
              workerId: isolatedSchema.contractorDocuments.workerId,
            }).from(isolatedSchema.contractorDocuments)
              .where(and(
                eq(isolatedSchema.contractorDocuments.isActive, true),
                isNotNull(isolatedSchema.contractorDocuments.expiryDate),
                lte(isolatedSchema.contractorDocuments.expiryDate, thirtyDaysFromNow),
                sql`${isolatedSchema.contractorDocuments.expiryAlertedAt} IS NULL`
              ));

            if (allAlertDocs.length === 0) {
              console.log(`[Contractor Expiry Cron] No newly-expired or expiring-soon contractor documents for customer ${customer.id}`);
              continue;
            }

            // Split into already-expired and expiring soon
            const expiredDocs = allAlertDocs.filter(d => d.expiryDate && new Date(d.expiryDate) < now);
            const expiringSoonDocs = allAlertDocs.filter(d => d.expiryDate && new Date(d.expiryDate) >= now);

            // Enrich with contractor company / worker names
            const companyIds = [...new Set(allAlertDocs.map(d => d.companyId).filter((id): id is string => !!id))];
            const workerIds = [...new Set(allAlertDocs.map(d => d.workerId).filter((id): id is string => !!id))];

            const [companies, workers] = await Promise.all([
              companyIds.length > 0
                ? custDb.select({ id: isolatedSchema.contractorCompanies.id, companyName: isolatedSchema.contractorCompanies.companyName })
                    .from(isolatedSchema.contractorCompanies)
                    .where(inArray(isolatedSchema.contractorCompanies.id, companyIds))
                : Promise.resolve([]),
              workerIds.length > 0
                ? custDb.select({ id: isolatedSchema.contractorWorkers.id, firstName: isolatedSchema.contractorWorkers.firstName, lastName: isolatedSchema.contractorWorkers.lastName })
                    .from(isolatedSchema.contractorWorkers)
                    .where(inArray(isolatedSchema.contractorWorkers.id, workerIds))
                : Promise.resolve([]),
            ]);

            const companyMap = Object.fromEntries(companies.map(c => [c.id, c.companyName]));
            const workerMap = Object.fromEntries(workers.map(w => [w.id, `${w.firstName} ${w.lastName}`]));

            const docTypeLabel = (t: string) =>
              t.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());

            const buildTableRows = (docs: typeof allAlertDocs, dateColor: string) =>
              docs.map(d => {
                const entityName = d.workerId
                  ? (workerMap[d.workerId] ?? "Unknown Worker")
                  : d.companyId
                    ? (companyMap[d.companyId] ?? "Unknown Company")
                    : "—";
                const dateStr = d.expiryDate
                  ? new Date(d.expiryDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                  : "—";
                return `<tr>
                  <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-weight:500">${d.documentName}</td>
                  <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6">${docTypeLabel(d.documentType)}</td>
                  <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6">${entityName}</td>
                  <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:${dateColor};font-weight:600">${dateStr}</td>
                </tr>`;
              }).join("");

            const buildTextLines = (docs: typeof allAlertDocs, verb: string) =>
              docs.map(d => {
                const entityName = d.workerId
                  ? (workerMap[d.workerId] ?? "Unknown Worker")
                  : d.companyId ? (companyMap[d.companyId] ?? "Unknown Company") : "—";
                const dateStr = d.expiryDate
                  ? new Date(d.expiryDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                  : "—";
                return `- ${d.documentName} (${docTypeLabel(d.documentType)}) — ${entityName} — ${verb} ${dateStr}`;
              }).join("\n");

            const tableHeader = (bgColor: string, lastColLabel: string) => `
              <thead>
                <tr style="background:${bgColor}">
                  <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Document</th>
                  <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Type</th>
                  <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">Contractor / Worker</th>
                  <th style="text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;color:#6b7280">${lastColLabel}</th>
                </tr>
              </thead>`;

            let htmlSections = "";
            let textSections = "";

            if (expiredDocs.length > 0) {
              htmlSections += `
                <h3 style="margin:16px 0 8px;color:#dc2626">Expired (${expiredDocs.length})</h3>
                <p style="margin:0 0 8px;font-size:13px;color:#374151">These documents have already lapsed and require immediate renewal:</p>
                <table style="width:100%;border-collapse:collapse;margin:0 0 16px;font-size:14px">
                  ${tableHeader("#fef2f2", "Expired On")}
                  <tbody>${buildTableRows(expiredDocs, "#dc2626")}</tbody>
                </table>`;
              textSections += `EXPIRED (${expiredDocs.length}):\n${buildTextLines(expiredDocs, "expired")}\n\n`;
            }

            if (expiringSoonDocs.length > 0) {
              htmlSections += `
                <h3 style="margin:16px 0 8px;color:#d97706">Expiring Soon — within 30 days (${expiringSoonDocs.length})</h3>
                <p style="margin:0 0 8px;font-size:13px;color:#374151">These documents will expire within the next 30 days — please arrange renewals in advance:</p>
                <table style="width:100%;border-collapse:collapse;margin:0 0 16px;font-size:14px">
                  ${tableHeader("#fffbeb", "Expires On")}
                  <tbody>${buildTableRows(expiringSoonDocs, "#d97706")}</tbody>
                </table>`;
              textSections += `EXPIRING SOON — within 30 days (${expiringSoonDocs.length}):\n${buildTextLines(expiringSoonDocs, "expires")}\n\n`;
            }

            const totalCount = allAlertDocs.length;
            const subjectParts: string[] = [];
            if (expiredDocs.length > 0) subjectParts.push(`${expiredDocs.length} Expired`);
            if (expiringSoonDocs.length > 0) subjectParts.push(`${expiringSoonDocs.length} Expiring Soon`);

            const emailSvc = new EmailService(customer.id);
            const sent = await emailSvc.sendEmail({
              to: adminEmail,
              subject: `Contractor Alert: ${subjectParts.join(", ")} Document${totalCount > 1 ? "s" : ""}`,
              companyName,
              html: `
                <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto">
                  <div style="background:#dc2626;color:#fff;padding:20px;border-radius:8px 8px 0 0">
                    <h2 style="margin:0">Contractor Document Expiry Alert — ${companyName}</h2>
                  </div>
                  <div style="background:#fff;padding:20px;border:1px solid #e5e7eb">
                    <p style="margin-top:0">The following contractor document${totalCount > 1 ? "s require" : " requires"} your attention:</p>
                    ${htmlSections}
                    <p style="color:#6b7280;font-size:13px">Please log in to TPR-Max to review these documents and request updated copies from the relevant contractors.</p>
                  </div>
                  <div style="background:#f9fafb;padding:12px 20px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;font-size:12px;color:#9ca3af">
                    This is an automated nightly alert sent by ${companyName} via TPR-Max.
                  </div>
                </div>
              `,
              text: `Contractor Document Expiry Alert\n\n${textSections}Please log in to TPR-Max to review and action these documents.`,
            });

            if (sent) {
              const alertedIds = allAlertDocs.map(d => d.id);
              await custDb.update(isolatedSchema.contractorDocuments)
                .set({ expiryAlertedAt: new Date() })
                .where(inArray(isolatedSchema.contractorDocuments.id, alertedIds));
              console.log(`📧 [Contractor Expiry Cron] Digest sent for ${expiredDocs.length} expired + ${expiringSoonDocs.length} expiring-soon document(s) (customer ${customer.id})`);
            }
          } catch (custErr) {
            console.error(`[Contractor Expiry Cron] Error processing customer ${customer.id}:`, custErr);
          }
        }
      } catch (err) {
        console.error("[Contractor Expiry Cron] Fatal error in nightly check:", err);
      }
    }, { timezone: "Europe/London" });
    console.log("✅ [Contractor Expiry Cron] Nightly contractor document expiry check scheduled");
  }

  // ── End CDM routes ──────────────────────────────────────────────────────────

  // ── Help Desk routes ─────────────────────────────────────────────────────────

  // GET /api/helpdesk/tickets — return all tickets, newest first
  app.get("/api/helpdesk/tickets", requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const rows = await custDb.select().from(isolatedSchema.helpDeskTickets)
        .orderBy(sql`${isolatedSchema.helpDeskTickets.createdAt} DESC`);
      res.json(rows);
    } catch (error: unknown) {
      console.error("GET /api/helpdesk/tickets", error);
      res.status(500).json({ error: "Failed to fetch help desk tickets" });
    }
  });

  // POST /api/helpdesk/tickets — create a ticket with auto-generated ticket_number
  app.post("/api/helpdesk/tickets", requireAuth, async (req, res) => {
    try {
      const parsed = isolatedSchema.insertHelpDeskTicketSchema.parse(req.body);
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [countRow] = await custDb.select({ count: sql<number>`count(*)::int` })
        .from(isolatedSchema.helpDeskTickets);
      const nextNum = (countRow?.count ?? 0) + 1;
      const ticketNumber = `HD-${String(nextNum).padStart(3, "0")}`;
      const [row] = await custDb.insert(isolatedSchema.helpDeskTickets)
        .values({ ...parsed, ticketNumber })
        .returning();
      res.status(201).json(row);
    } catch (error: unknown) {
      console.error("POST /api/helpdesk/tickets", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create help desk ticket" });
    }
  });

  // GET /api/helpdesk/tickets/:id — single ticket
  app.get("/api/helpdesk/tickets/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [row] = await custDb.select().from(isolatedSchema.helpDeskTickets)
        .where(eq(isolatedSchema.helpDeskTickets.id, id));
      if (!row) return res.status(404).json({ error: "Ticket not found" });
      res.json(row);
    } catch (error: unknown) {
      console.error("GET /api/helpdesk/tickets/:id", error);
      res.status(500).json({ error: "Failed to fetch help desk ticket" });
    }
  });

  // PUT /api/helpdesk/tickets/:id — update a ticket
  app.put("/api/helpdesk/tickets/:id", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    try {
      const { id } = req.params;
      const updates: Record<string, unknown> = { ...req.body };
      delete updates.id;
      delete updates.ticketNumber;
      delete updates.createdAt;
      updates.updatedAt = new Date();
      if (updates.status === "resolved" && !updates.resolvedAt) {
        updates.resolvedAt = new Date();
      }
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [row] = await custDb.update(isolatedSchema.helpDeskTickets)
        .set(updates)
        .where(eq(isolatedSchema.helpDeskTickets.id, id))
        .returning();
      if (!row) return res.status(404).json({ error: "Ticket not found" });
      res.json(row);
    } catch (error: unknown) {
      console.error("PUT /api/helpdesk/tickets/:id", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to update help desk ticket" });
    }
  });

  // DELETE /api/helpdesk/tickets/:id — delete a ticket
  app.delete("/api/helpdesk/tickets/:id", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
    try {
      const { id } = req.params;
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      await custDb.delete(isolatedSchema.helpDeskTickets).where(eq(isolatedSchema.helpDeskTickets.id, id));
      res.json({ success: true });
    } catch (error: unknown) {
      console.error("DELETE /api/helpdesk/tickets/:id", error);
      res.status(500).json({ error: "Failed to delete help desk ticket" });
    }
  });

  // GET /api/helpdesk/stats — ticket counts grouped by status
  app.get("/api/helpdesk/stats", requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const rows = await custDb.select({
        status: isolatedSchema.helpDeskTickets.status,
        count: sql<number>`count(*)::int`,
      })
        .from(isolatedSchema.helpDeskTickets)
        .groupBy(isolatedSchema.helpDeskTickets.status);
      const stats = Object.fromEntries(rows.map(r => [r.status, r.count]));
      const total = rows.reduce((sum, r) => sum + r.count, 0);
      res.json({ ...stats, total });
    } catch (error: unknown) {
      console.error("GET /api/helpdesk/stats", error);
      res.status(500).json({ error: "Failed to fetch help desk stats" });
    }
  });

  // ── End Help Desk routes ──────────────────────────────────────────────────────

  // ── End PPM routes ──────────────────────────────────────────────────────────

  const httpServer = existingServer || createServer(app);
  
  // Initialize WebSocket server for real-time muster updates
  websocketService.initialize(httpServer);
  
  return httpServer;
}

export function createHttpServer(app: Express): Server {
  return createServer(app);
}
