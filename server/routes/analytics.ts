import type { Express } from 'express';
import { requireAuth } from '../auth';
import {
  isDevDataBypass,
  isDatabaseConnectionError,
  getMockDepartmentAnalytics,
  getMockPeakHoursAnalytics,
  getMockRecentActivity,
  getMockCompanyStats,
} from '../auth';
import { databaseService } from '../databaseService';
import { simpleDatabaseService } from '../simpleDatabaseService';
import { customerDbService } from '../customerDatabase';
import * as isolatedSchema from '../isolatedSchema';
import { VoiceNotificationService } from '../voiceNotificationService';
import { eq, sql } from 'drizzle-orm';
import { logger } from '../utils/logger';

export function registerAnalyticsRoutes(app: Express): void {
  // Stats endpoint
  app.get("/api/stats", requireAuth, async (req, res) => {
    try {
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
        // ignore members error
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
      logger.error("Error fetching stats:", error);
      
      if (isDevDataBypass() && isDatabaseConnectionError(error)) {
        const mockStats = getMockCompanyStats();
        return res.json({
          currentVisitors: mockStats.currentVisitors,
          todayCheckins: mockStats.todayCheckIns,
          staffOnSite: mockStats.staffOnSite,
          totalStaff: mockStats.totalStaff,
          contractorsOnSite: 3,
          totalPeopleOnSite: mockStats.currentVisitors + mockStats.staffOnSite + 3,
          totalCompanies: 4
        });
      }
      
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Voice Notification endpoints
  app.get("/api/voice-notifications/logs", requireAuth, async (req, res) => {
    try {
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
      logger.error("Failed to fetch voice notification logs:", error);
      res.status(500).json({ error: "Failed to fetch voice notification logs" });
    }
  });

  app.post("/api/voice-notifications/test", requireAuth, async (req, res) => {
    try {
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const { staffId, customMessage } = req.body;
      
      if (!staffId) {
        return res.status(400).json({ error: "Staff ID is required" });
      }
      
      const staff = await databaseService.getStaffById(context, staffId);
      if (!staff) {
        return res.status(404).json({ error: "Staff member not found" });
      }
      
      if (!(staff as any).voiceNotificationsEnabled || !(staff as any).phoneNumber) {
        return res.status(400).json({ 
          error: "Voice notifications not enabled or no phone number configured" 
        });
      }
      
      const voiceService = new VoiceNotificationService(databaseService as any);
      const testMessage = customMessage || `Hello ${staff.firstName}, this is a test call from TPR voice notification system. Your notifications are working correctly.`;
      
      const notification = await voiceService.sendTestNotification(context, staff, testMessage);
      
      if (notification) {
        res.json({ success: true, message: "Test voice notification sent successfully", notificationId: notification.id });
      } else {
        res.status(500).json({ error: "Failed to send test voice notification" });
      }
    } catch (error) {
      logger.error("Failed to send test voice notification:", error);
      res.status(500).json({ error: "Failed to send test voice notification" });
    }
  });

  app.get("/api/voice-notifications/analytics", requireAuth, async (req, res) => {
    try {
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const { startDate, endDate } = req.query;
      
      const analytics = await databaseService.getVoiceNotificationAnalytics(context, {
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined
      });
      
      res.json(analytics);
    } catch (error) {
      logger.error("Failed to fetch voice notification analytics:", error);
      res.status(500).json({ error: "Failed to fetch voice notification analytics" });
    }
  });

  // Recent activity endpoint
  app.get("/api/activity/recent", requireAuth, async (req, res) => {
    try {
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      if (isDevDataBypass()) {
        return res.json(getMockRecentActivity());
      }
      
      res.json([]);
    } catch (error) {
      logger.error("Failed to fetch recent activity:", error);
      
      if (isDevDataBypass() && isDatabaseConnectionError(error)) {
        return res.json(getMockRecentActivity());
      }
      
      res.status(500).json({ error: "Failed to fetch recent activity" });
    }
  });

  // Department analytics endpoint
  app.get("/api/analytics/departments", requireAuth, async (req, res) => {
    try {
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const departmentData = await databaseService.getDepartmentAnalytics(context);
      res.json(departmentData);
    } catch (error) {
      logger.error("Failed to fetch department analytics:", error);
      
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
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const details = await databaseService.getDepartmentDetails(context, department);
      res.json(details);
    } catch (error) {
      logger.error("Failed to fetch department details:", error);
      res.status(500).json({ error: "Failed to fetch department details" });
    }
  });

  // Peak hours analytics endpoint
  app.get("/api/analytics/peak-hours", requireAuth, async (req, res) => {
    try {
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const peakHoursData = await databaseService.getPeakHoursAnalytics(context);
      res.json(peakHoursData);
    } catch (error) {
      logger.error("Failed to fetch peak hours analytics:", error);
      
      if (isDevDataBypass() && isDatabaseConnectionError(error)) {
        return res.json(getMockPeakHoursAnalytics());
      }
      
      res.status(500).json({ error: "Failed to fetch peak hours analytics" });
    }
  });
}
