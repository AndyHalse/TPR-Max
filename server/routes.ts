import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertStaffSchema, insertVisitorSchema, insertCompanySettingsSchema, insertPreBookingSchema, insertUserSchema } from "@shared/schema";
import { z } from "zod";

// Staff authentication schema
const staffAuthSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { emailService } from "./emailService";
import { aiService } from "./aiService";
import { AuthService, requireAuth } from "./auth";
import { testBiostarConnection, syncBiostarDevices, getBiostarStaffStatus } from "./biostarService";
import cron from "node-cron";

export async function registerRoutes(app: Express): Promise<Server> {
  // Authentication endpoints
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }

      const user = await AuthService.authenticateUser(username, password);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Set session
      req.session.userId = user.id;
      
      res.json({ 
        success: true, 
        user: { id: user.id, username: user.username }
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Logout failed" });
      }
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    res.json({ id: user.id, username: user.username });
  });

  // Stats endpoint
  app.get("/api/stats", async (req, res) => {
    try {
      const stats = await storage.getVisitorStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Recent activity endpoint
  app.get("/api/activity/recent", async (req, res) => {
    try {
      const activities = await storage.getRecentActivity();
      res.json(activities);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch recent activity" });
    }
  });

  // Muster endpoint for emergency situations
  app.get("/api/muster", async (req, res) => {
    try {
      const musterList = await storage.getMusterList();
      res.json(musterList);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch muster list" });
    }
  });

  // Staff endpoints
  app.get("/api/staff", async (req, res) => {
    try {
      const staff = await storage.getAllStaff();
      res.json(staff);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch staff" });
    }
  });

  // Remove duplicate object storage endpoints - using proper implementation below

  app.post("/api/staff", async (req, res) => {
    try {
      const staffData = insertStaffSchema.parse(req.body);
      const staff = await storage.createStaff(staffData);
      res.json(staff);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid staff data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create staff member" });
      }
    }
  });

  app.put("/api/staff/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = insertStaffSchema.partial().parse(req.body);
      const staff = await storage.updateStaff(id, updates);
      
      if (!staff) {
        return res.status(404).json({ error: "Staff member not found" });
      }
      
      res.json(staff);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid staff data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to update staff member" });
      }
    }
  });

  app.delete("/api/staff/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const success = await storage.deleteStaff(id);
      
      if (!success) {
        return res.status(404).json({ error: "Staff member not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete staff member" });
    }
  });

  // Staff authentication endpoint
  app.post("/api/staff/auth", async (req, res) => {
    try {
      const { email, password } = staffAuthSchema.parse(req.body);
      const staff = await storage.authenticateStaff(email, password);
      
      if (!staff) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      
      // Don't send password in response
      const { password: _, ...staffResponse } = staff;
      res.json({ success: true, staff: staffResponse });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid authentication data", details: error.errors });
      } else {
        res.status(500).json({ error: "Authentication failed" });
      }
    }
  });

  // Check staff access level endpoint
  app.get("/api/staff/:id/access", async (req, res) => {
    try {
      const { id } = req.params;
      const staff = await storage.getStaffById(id);
      
      if (!staff) {
        return res.status(404).json({ error: "Staff member not found" });
      }
      
      res.json({ accessLevel: staff.accessLevel, lastLoginAt: staff.lastLoginAt });
    } catch (error) {
      res.status(500).json({ error: "Failed to get staff access information" });
    }
  });

  // Visitor endpoints
  app.get("/api/visitors", async (req, res) => {
    try {
      const visitors = await storage.getAllVisitors();
      res.json(visitors);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch visitors" });
    }
  });

  app.get("/api/visitors/current", async (req, res) => {
    try {
      const visitors = await storage.getCurrentVisitors();
      res.json(visitors);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch current visitors" });
    }
  });

  app.post("/api/visitors/checkin", async (req, res) => {
    try {
      const visitorData = insertVisitorSchema.parse(req.body);
      const visitor = await storage.createVisitor(visitorData);
      res.json(visitor);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid visitor data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to check in visitor" });
      }
    }
  });

  app.post("/api/visitors/:id/checkout", async (req, res) => {
    try {
      const { id } = req.params;
      const visitor = await storage.checkOutVisitor(id);
      
      if (!visitor) {
        return res.status(404).json({ error: "Visitor not found or already checked out" });
      }
      
      res.json(visitor);
    } catch (error) {
      res.status(500).json({ error: "Failed to check out visitor" });
    }
  });

  app.post("/api/visitors/checkout-by-qr", async (req, res) => {
    try {
      const { qrCode } = req.body;
      if (!qrCode) {
        return res.status(400).json({ error: "QR code is required" });
      }
      
      const visitor = await storage.getVisitorByQrCode(qrCode);
      if (!visitor) {
        return res.status(404).json({ error: "Visitor not found" });
      }
      
      const checkedOutVisitor = await storage.checkOutVisitor(visitor.id);
      res.json(checkedOutVisitor);
    } catch (error) {
      res.status(500).json({ error: "Failed to check out visitor" });
    }
  });

  // Muster list endpoint
  app.get("/api/muster", async (req, res) => {
    try {
      const currentVisitors = await storage.getCurrentVisitors();
      const allStaff = await storage.getAllStaff();
      
      // Combine staff and visitors for muster list
      const musterList = [
        ...allStaff.map(staff => ({
          id: staff.id,
          name: `${staff.firstName} ${staff.lastName}`,
          type: 'staff' as const,
          department: staff.department,
          employeeId: staff.employeeId,
          checkedInAt: staff.createdAt, // Using created date as staff "check-in"
          location: 'On-Site'
        })),
        ...currentVisitors.map(visitor => ({
          id: visitor.id,
          name: visitor.name,
          type: 'visitor' as const,
          company: visitor.company,
          purpose: visitor.purpose,
          hostStaffId: visitor.hostStaffId,
          checkedInAt: visitor.checkedInAt,
          location: 'Reception'
        }))
      ];
      
      res.json(musterList);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch muster list" });
    }
  });

  // Company Settings endpoints
  app.get("/api/settings", async (req, res) => {
    try {
      const settings = await storage.getCompanySettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch company settings" });
    }
  });

  app.put("/api/settings", async (req, res) => {
    try {
      const updates = insertCompanySettingsSchema.partial().parse(req.body);
      const settings = await storage.updateCompanySettings(updates);
      res.json(settings);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid settings data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to update company settings" });
      }
    }
  });

  // Object Storage endpoints for logo upload
  app.post("/api/objects/upload", async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error accessing object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  app.get("/public-objects/:filePath(*)", async (req, res) => {
    const filePath = req.params.filePath;
    const objectStorageService = new ObjectStorageService();
    try {
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      objectStorageService.downloadObject(file, res);
    } catch (error) {
      console.error("Error searching for public object:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Reports endpoints
  app.get("/api/reports", async (req, res) => {
    try {
      const reports = await storage.getAllReports();
      res.json(reports);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch reports" });
    }
  });

  app.post("/api/reports/generate", async (req, res) => {
    try {
      const { reportType, dateFrom, dateTo } = req.body;
      
      if (!reportType || !dateFrom || !dateTo) {
        return res.status(400).json({ error: "Report type and date range are required" });
      }

      const fromDate = new Date(dateFrom);
      const toDate = new Date(dateTo);
      
      // Get data for the report
      const allVisitors = await storage.getAllVisitors();
      const visitorsInRange = allVisitors.filter(v => 
        v.checkedInAt >= fromDate && v.checkedInAt <= toDate
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
      
      const report = await storage.createReport({
        reportType,
        generatedAt: new Date(),
        dateFrom: fromDate,
        dateTo: toDate,
        totalVisitors: visitorsInRange.length.toString(),
        avgDuration: `${avgDurationHours}h`,
        emailSent: false,
        emailSentAt: null,
      });
      
      res.json(report);
    } catch (error) {
      console.error("Error generating report:", error);
      res.status(500).json({ error: "Failed to generate report" });
    }
  });

  app.post("/api/reports/:id/email", async (req, res) => {
    try {
      const { id } = req.params;
      const { recipients } = req.body;
      
      if (!recipients || !Array.isArray(recipients)) {
        return res.status(400).json({ error: "Recipients are required" });
      }
      
      // Get report and settings
      const reports = await storage.getAllReports();
      const report = reports.find(r => r.id === id);
      const settings = await storage.getCompanySettings();
      
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }
      
      if (!settings) {
        return res.status(500).json({ error: "Company settings not found" });
      }
      
      // Get report data
      const allVisitors = await storage.getAllVisitors();
      const staff = await storage.getAllStaff();
      const visitorsInRange = allVisitors.filter(v => 
        v.checkedInAt >= report.dateFrom && v.checkedInAt <= report.dateTo
      );
      
      const reportData = {
        visitors: visitorsInRange,
        staff,
        checkedOutVisitors: visitorsInRange.filter(v => v.checkedOutAt)
      };
      
      // Send email
      const emailSent = await emailService.sendReport(report, settings, recipients, reportData);
      
      if (emailSent) {
        await storage.updateReport(id, {
          emailSent: true,
          emailSentAt: new Date(),
        });
      }
      
      res.json({ success: emailSent });
    } catch (error) {
      console.error("Error sending report email:", error);
      res.status(500).json({ error: "Failed to send report email" });
    }
  });

  app.post("/api/test-email", async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email address is required" });
      }
      
      const success = await emailService.sendTestEmail(email);
      res.json({ success });
    } catch (error) {
      console.error("Error sending test email:", error);
      res.status(500).json({ error: "Failed to send test email" });
    }
  });

  // Setup automatic email reports
  const setupAutomaticReports = async () => {
    const settings = await storage.getCompanySettings();
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
        
        // Generate and send report
        const allVisitors = await storage.getAllVisitors();
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
        
        const report = await storage.createReport({
          reportType: `auto_${settings.reportFrequency}`,
          generatedAt: new Date(),
          dateFrom: fromDate,
          dateTo: now,
          totalVisitors: visitorsInRange.length.toString(),
          avgDuration: `${avgDurationHours}h`,
          emailSent: false,
          emailSentAt: null,
        });
        
        // Send email
        const staff = await storage.getAllStaff();
        const reportData = {
          visitors: visitorsInRange,
          staff,
          checkedOutVisitors
        };
        
        const emailSent = await emailService.sendReport(
          report, 
          settings, 
          settings.reportRecipients || [], 
          reportData
        );
        
        if (emailSent) {
          await storage.updateReport(report.id, {
            emailSent: true,
            emailSentAt: new Date(),
          });
          
          await storage.updateCompanySettings({
            lastReportSent: new Date(),
          });
        }
        
        console.log(`Automatic ${settings.reportFrequency} report sent:`, emailSent);
      } catch (error) {
        console.error("Error in automatic report generation:", error);
      }
    });
  };
  
  // Pre-booking endpoints
  app.get("/api/prebookings", async (req, res) => {
    try {
      const preBookings = await storage.getAllPreBookings();
      res.json(preBookings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pre-bookings" });
    }
  });

  app.get("/api/prebookings/upcoming", async (req, res) => {
    try {
      const preBookings = await storage.getUpcomingPreBookings();
      res.json(preBookings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch upcoming pre-bookings" });
    }
  });

  app.post("/api/prebookings", async (req, res) => {
    try {
      // Transform the request body to ensure proper date handling
      const transformedData = {
        ...req.body,
        visitDate: new Date(req.body.visitDate)
      };
      
      const preBookingData = insertPreBookingSchema.parse(transformedData);
      const preBooking = await storage.createPreBooking(preBookingData);
      
      // Get host staff and company settings for email
      const hostStaff = await storage.getStaffById(preBooking.hostStaffId!);
      const companySettings = await storage.getCompanySettings();
      
      if (hostStaff && companySettings) {
        // Generate QR code URL for email
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(preBooking.qrCode)}`;
        
        // Send email
        const emailSent = await emailService.sendPreBookingEmail(
          preBooking,
          hostStaff,
          companySettings,
          qrCodeUrl
        );
        
        if (emailSent) {
          await storage.updatePreBooking(preBooking.id, {
            emailSent: true,
            emailSentAt: new Date(),
          });
        }
      }
      
      res.json(preBooking);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid pre-booking data", details: error.errors });
      } else {
        console.error("Error creating pre-booking:", error);
        res.status(500).json({ error: "Failed to create pre-booking" });
      }
    }
  });

  app.post("/api/prebookings/checkin", async (req, res) => {
    try {
      const { qrCode } = req.body;
      if (!qrCode) {
        return res.status(400).json({ error: "QR code is required" });
      }
      
      // Check if it's a pre-booking QR code
      const preBooking = await storage.getPreBookingByQrCode(qrCode);
      if (!preBooking) {
        return res.status(404).json({ error: "Pre-booking not found" });
      }
      
      if (preBooking.isCheckedIn) {
        return res.status(400).json({ error: "Pre-booking already checked in" });
      }
      
      // Create visitor record from pre-booking
      const visitor = await storage.createVisitor({
        name: preBooking.visitorName,
        company: preBooking.company,
        purpose: preBooking.purpose,
        carRegistration: null,
        hostStaffId: preBooking.hostStaffId,
      });
      
      // Update pre-booking as checked in
      await storage.updatePreBooking(preBooking.id, {
        isCheckedIn: true,
        checkedInAt: new Date(),
        visitorId: visitor.id,
      });
      
      res.json({ visitor, preBooking });
    } catch (error) {
      console.error("Error checking in pre-booking:", error);
      res.status(500).json({ error: "Failed to check in pre-booking" });
    }
  });

  app.get("/api/prebookings/today", async (req, res) => {
    try {
      const today = new Date();
      const preBookings = await storage.getPreBookingsByDate(today);
      res.json(preBookings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch today's pre-bookings" });
    }
  });

  // Send manual visitor report endpoint
  app.post("/api/reports/send", async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email address required" });
      }

      console.log(`Sending visitor report to: ${email}`);

      // Get current data for report
      const stats = await storage.getVisitorStats();
      const currentVisitors = await storage.getCurrentVisitors();
      const staff = await storage.getAllStaff();
      const companySettings = await storage.getCompanySettings();
      
      // Create manual report data
      const reportData = {
        visitors: currentVisitors,
        staff,
        checkedOutVisitors: [],
        stats,
        reportDate: new Date().toLocaleDateString('en-GB'),
        reportTime: new Date().toLocaleTimeString('en-GB')
      };

      // Generate mock report for the email
      const report = {
        id: `RPT-${Date.now()}`,
        reportType: 'manual',
        generatedAt: new Date(),
        dateFrom: new Date(),
        dateTo: new Date(),
        totalVisitors: stats.todayCheckins.toString(),
        avgDuration: stats.avgVisitDuration,
        emailSent: false,
        emailSentAt: null
      };

      console.log('Sending email with report data:', { totalVisitors: report.totalVisitors, currentVisitors: currentVisitors.length });

      // Send email report
      const emailSent = await emailService.sendReport(
        report,
        companySettings!,
        [email],
        reportData
      );

      if (emailSent) {
        console.log(`Report email sent successfully to ${email}`);
        res.json({ 
          success: true, 
          message: `Visitor report sent successfully to ${email}`,
          reportId: report.id
        });
      } else {
        console.log(`Failed to send report email to ${email}`);
        res.status(500).json({ error: "Failed to send report email" });
      }
      
    } catch (error) {
      console.error("Error sending report:", error);
      res.status(500).json({ error: "Failed to send visitor report" });
    }
  });

  // AI-powered visitor insights endpoint
  app.get("/api/ai/insights", async (req, res) => {
    try {
      const visitors = await storage.getCurrentVisitors();
      const staff = await storage.getAllStaff();
      const stats = await storage.getVisitorStats();
      
      const insights = await aiService.generateVisitorInsights(visitors, staff, stats);
      
      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        insights
      });
    } catch (error) {
      console.error("AI insights error:", error);
      res.status(500).json({ error: "Failed to generate AI insights" });
    }
  });

  // AI predictive analytics endpoint
  app.get("/api/ai/analytics", async (req, res) => {
    try {
      const stats = await storage.getVisitorStats();
      const currentTrends = {
        currentVisitors: stats.currentVisitors,
        todayCheckins: stats.todayCheckins,
        staffOnSite: stats.staffOnSite,
        avgVisitDuration: stats.avgVisitDuration
      };
      
      const analytics = await aiService.generatePredictiveAnalytics({}, currentTrends);
      
      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        analytics
      });
    } catch (error) {
      console.error("AI analytics error:", error);
      res.status(500).json({ error: "Failed to generate AI analytics" });
    }
  });

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
  app.get("/api/ai/success-metrics", async (req, res) => {
    try {
      const stats = await storage.getVisitorStats();
      
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
  app.post("/api/ai/security-alert", async (req, res) => {
    try {
      const { pattern } = req.body;
      
      if (!pattern) {
        return res.status(400).json({ error: "Security pattern description required" });
      }

      const visitors = await storage.getCurrentVisitors();
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
  app.get("/api/ai/visitor-sentiment", async (req, res) => {
    try {
      const visitors = await storage.getCurrentVisitors();
      const stats = await storage.getVisitorStats();
      
      const avgDurationMinutes = parseInt(stats.avgVisitDuration.replace(' mins', '')) || 0;
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
  app.get("/api/ai/compliance", async (req, res) => {
    try {
      const visitors = await storage.getCurrentVisitors();
      const staff = await storage.getAllStaff();
      
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
  app.post("/api/biostar/test-connection", async (req, res) => {
    try {
      const settings = await storage.getCompanySettings();
      if (!settings?.biostarEnabled) {
        console.log("Biostar integration not enabled in settings");
        return res.status(400).json({ error: "Biostar integration is not enabled" });
      }

      console.log("Testing Biostar connection with settings:", {
        serverUrl: settings.biostarServerUrl,
        username: settings.biostarUsername ? "[SET]" : "[NOT SET]",
        apiKey: settings.biostarApiKey ? "[SET]" : "[NOT SET]"
      });

      // Test connection to Biostar API
      const connectionResult = await testBiostarConnection(settings);
      
      console.log("Biostar connection result:", connectionResult);
      
      res.json({
        success: connectionResult.success,
        message: connectionResult.message,
        serverInfo: connectionResult.serverInfo
      });
    } catch (error) {
      console.error("Biostar connection test failed:", error);
      res.status(500).json({ error: "Connection test failed: " + (error as Error).message });
    }
  });

  app.post("/api/biostar/sync-devices", async (req, res) => {
    try {
      console.log('🔄 Starting Biostar device sync...');
      
      const settings = await storage.getCompanySettings();
      if (!settings?.biostarEnabled) {
        console.log('❌ Biostar integration not enabled');
        return res.status(400).json({ error: "Biostar integration is not enabled" });
      }

      // Sync devices from Biostar
      console.log('📡 Syncing devices with Biostar...');
      const syncResult = await syncBiostarDevices(settings);
      
      console.log(`✅ Found ${syncResult.devices.length} devices:`, syncResult.devices);
      
      // Update settings with discovered devices
      await storage.updateCompanySettings({
        biometricDevices: syncResult.devices,
        readerSettings: JSON.stringify(syncResult.deviceSettings)
      });

      res.json({
        success: true,
        devices: syncResult.devices,
        message: `Found ${syncResult.devices.length} devices`
      });
    } catch (error) {
      console.error("❌ Biostar device sync failed:", error);
      res.status(500).json({ error: "Device sync failed: " + (error as Error).message });
    }
  });

  app.get("/api/biostar/staff-status", async (req, res) => {
    try {
      const settings = await storage.getCompanySettings();
      if (!settings?.biostarEnabled) {
        return res.status(400).json({ error: "Biostar integration is not enabled" });
      }

      // Get staff attendance status from Biostar
      const staffStatus = await getBiostarStaffStatus(settings);
      res.json(staffStatus);
    } catch (error) {
      console.error("Failed to get Biostar staff status:", error);
      res.status(500).json({ error: "Failed to get staff status" });
    }
  });

  // Initialize automatic reports
  setupAutomaticReports();

  const httpServer = createServer(app);
  return httpServer;
}
