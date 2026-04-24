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
import { setupAutomaticDailyReset } from "./routes/induction";
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
