import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertStaffSchema, insertVisitorSchema, insertCompanySettingsSchema } from "@shared/schema";
import { z } from "zod";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { emailService } from "./emailService";
import cron from "node-cron";

export async function registerRoutes(app: Express): Promise<Server> {
  // Stats endpoint
  app.get("/api/stats", async (req, res) => {
    try {
      const stats = await storage.getVisitorStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
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
          name: staff.name,
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
          settings.reportRecipients, 
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
  
  // Initialize automatic reports
  setupAutomaticReports();

  const httpServer = createServer(app);
  return httpServer;
}
