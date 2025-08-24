import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertStaffSchema, 
  insertVisitorSchema, 
  insertCompanySettingsSchema, 
  insertPreBookingSchema, 
  insertUserSchema, 
  insertUserInvitationSchema,
  insertContractorCompanySchema,
  insertContractorWorkerSchema,
  insertComplianceDocumentSchema
} from "@shared/schema";
import { z } from "zod";
import path from "path";
import express from "express";

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
  // Serve static files from public directory
  app.use('/sample-*.pdf', express.static(path.join(process.cwd(), 'public')));
  
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
      } else if (error instanceof Error) {
        res.status(400).json({ error: error.message });
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
      } else if (error instanceof Error) {
        res.status(400).json({ error: error.message });
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

  // Staff manual check-in endpoint
  app.post("/api/staff/:id/checkin", async (req, res) => {
    try {
      const { id } = req.params;
      const { manual = true } = req.body;
      const staff = await storage.checkInStaff(id, manual);
      
      if (!staff) {
        return res.status(404).json({ error: "Staff member not found" });
      }
      
      res.json({ success: true, staff });
    } catch (error) {
      res.status(500).json({ error: "Failed to check in staff member" });
    }
  });

  // Staff check-out endpoint
  app.post("/api/staff/:id/checkout", async (req, res) => {
    try {
      const { id } = req.params;
      const staff = await storage.checkOutStaff(id);
      
      if (!staff) {
        return res.status(404).json({ error: "Staff member not found or not checked in" });
      }
      
      res.json({ success: true, staff });
    } catch (error) {
      res.status(500).json({ error: "Failed to check out staff member" });
    }
  });

  // ID Card printing endpoint
  app.post("/api/staff/:id/print-id-card", async (req, res) => {
    try {
      const { id } = req.params;
      const { design } = req.body;
      
      const staff = await storage.getStaff(id);
      if (!staff) {
        return res.status(404).json({ error: "Staff member not found" });
      }

      // Here you would integrate with actual printer hardware
      // For now, we'll simulate the printing process
      console.log(`Printing ID card for staff: ${staff.firstName} ${staff.lastName}`);
      console.log(`Design elements:`, design);
      
      // Simulate print job
      const printJob = {
        id: `print-${Date.now()}`,
        staffId: id,
        status: "completed",
        timestamp: new Date().toISOString(),
        printer: "B-FV4 Desktop Printer", // This would come from settings
        design: design
      };

      res.json({
        success: true,
        message: `ID card printed for ${staff.firstName} ${staff.lastName}`,
        printJob
      });
    } catch (error) {
      console.error("Error printing ID card:", error);
      res.status(500).json({ error: "Failed to print ID card" });
    }
  });

  // Get checked-in staff endpoint
  app.get("/api/staff/checked-in", async (req, res) => {
    try {
      const checkedInStaff = await storage.getCheckedInStaff();
      res.json(checkedInStaff);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch checked-in staff" });
    }
  });

  // Time & Attendance report endpoint
  app.get("/api/staff/time-attendance", async (req, res) => {
    try {
      const { dateFrom, dateTo } = req.query;
      let fromDate = dateFrom ? new Date(dateFrom as string) : undefined;
      let toDate = dateTo ? new Date(dateTo as string) : undefined;
      
      // Fix: Set toDate to end of day (23:59:59.999) instead of start of day (00:00:00)
      if (toDate) {
        toDate.setHours(23, 59, 59, 999);
      }
      
      // Fix: Set fromDate to start of day for consistency
      if (fromDate) {
        fromDate.setHours(0, 0, 0, 0);
      }
      
      const timeAttendance = await storage.getStaffTimeAndAttendance(fromDate, toDate);
      res.json(timeAttendance);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch time and attendance data" });
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

  app.get("/api/visitors/today", async (req, res) => {
    try {
      const todayVisitors = await storage.getTodayVisitors();
      res.json(todayVisitors);
    } catch (error) {
      console.error("Error fetching today visitors:", error);
      res.status(500).json({ error: "Failed to fetch today visitors" });
    }
  });

  app.post("/api/visitors/checkin", async (req, res) => {
    try {
      const visitorData = insertVisitorSchema.parse(req.body);
      
      // Check if visitor with same name and company is already checked in
      const existingVisitor = await storage.findCheckedInVisitor(
        visitorData.firstName, 
        visitorData.lastName, 
        visitorData.company
      );
      
      if (existingVisitor) {
        return res.status(400).json({ 
          error: "Visitor already checked in", 
          details: `${visitorData.firstName} ${visitorData.lastName} from ${visitorData.company || 'this company'} is already on-site.`
        });
      }
      
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

  app.put("/api/visitors/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      // Validate the updates (optional, but recommended)
      const visitor = await storage.updateVisitor(id, updates);
      
      if (!visitor) {
        return res.status(404).json({ error: "Visitor not found" });
      }
      
      res.json(visitor);
    } catch (error) {
      res.status(500).json({ error: "Failed to update visitor" });
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
  // Generate test data for load testing
  // Clear duplicate visitors endpoint
  app.delete("/api/test-data/visitors/duplicates", async (req, res) => {
    try {
      const allVisitors = await storage.getAllVisitors();
      const uniqueVisitors = new Map();
      const duplicatesToRemove = [];

      // Find duplicates based on firstName + lastName combination
      for (const visitor of allVisitors) {
        const nameKey = `${visitor.firstName.toLowerCase()}_${visitor.lastName.toLowerCase()}`;
        if (uniqueVisitors.has(nameKey)) {
          // Keep the newest visitor, mark older ones for removal
          const existing = uniqueVisitors.get(nameKey);
          if (new Date(visitor.checkedInAt) > new Date(existing.checkedInAt)) {
            duplicatesToRemove.push(existing.id);
            uniqueVisitors.set(nameKey, visitor);
          } else {
            duplicatesToRemove.push(visitor.id);
          }
        } else {
          uniqueVisitors.set(nameKey, visitor);
        }
      }

      // Remove duplicates
      let removedCount = 0;
      for (const visitorId of duplicatesToRemove) {
        await storage.deleteVisitor(visitorId);
        removedCount++;
      }

      res.json({ 
        success: true,
        message: `Removed ${removedCount} duplicate visitors`,
        duplicatesRemoved: removedCount,
        uniqueVisitorsRemaining: uniqueVisitors.size
      });
    } catch (error) {
      console.error("Error removing duplicate visitors:", error);
      res.status(500).json({ error: "Failed to remove duplicate visitors" });
    }
  });

  app.post("/api/test-data/visitors", async (req, res) => {
    try {
      const staff = await storage.getAllStaff();
      if (staff.length === 0) {
        return res.status(400).json({ error: "No staff members found to assign as hosts" });
      }

      // Generate 30 unique previous visitors
      const testVisitors = [];
      const firstNames = ["James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda", "David", "Elizabeth", "William", "Barbara", "Richard", "Susan", "Joseph", "Jessica", "Thomas", "Sarah", "Christopher", "Karen", "Charles", "Nancy", "Daniel", "Lisa", "Matthew", "Betty", "Anthony", "Helen", "Mark", "Sandra", "Paul", "Dorothy", "Joshua", "Carol", "Andrew", "Ruth", "Kenneth", "Sharon", "Kevin", "Michelle", "Brian", "Laura", "George", "Emily", "Timothy", "Kimberly", "Ronald", "Deborah", "Jason", "Donna"];
      const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker", "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores", "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell", "Carter", "Roberts"];
      const companies = ["Tech Solutions Ltd", "Global Industries", "Innovation Corp", "Digital Services", "Engineering Solutions", "Consulting Group", "Marketing Agency", "Design Studio", "Software Systems", "Business Partners", "Strategic Advisors", "Creative Solutions", "Professional Services", "Development Group", "Management Consulting", "Technology Partners", "Data Analytics Co", "Cloud Computing Ltd", "Security Systems Inc", "Mobile Development", "AI Research Labs", "Blockchain Solutions", "Green Energy Corp", "Healthcare Tech", "Financial Services", "Education Solutions", "Retail Innovation", "Manufacturing Plus", "Transport Systems", "Media Production"];
      const purposes = ["Business Meeting", "Project Discussion", "Consultation", "Training Session", "Interview", "Site Visit", "Maintenance", "Delivery", "Inspection", "Client Meeting", "Partnership Meeting", "Product Demo", "Technical Support", "Contract Review", "Planning Session", "Audit", "Installation", "Conference", "Negotiation", "Workshop"];

      // Create unique name combinations to avoid duplicates
      const usedNames = new Set();
      const existingVisitors = await storage.getAllVisitors();
      
      // Add existing visitor names to avoid conflicts
      existingVisitors.forEach(visitor => {
        usedNames.add(`${visitor.firstName.toLowerCase()}_${visitor.lastName.toLowerCase()}`);
      });

      for (let i = 0; i < 30; i++) {
        let firstName, lastName, nameKey;
        let attempts = 0;
        
        // Generate unique name combination
        do {
          firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
          lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
          nameKey = `${firstName.toLowerCase()}_${lastName.toLowerCase()}`;
          attempts++;
          
          // Fallback: append number if we can't find unique combination
          if (attempts > 50) {
            firstName = firstNames[i % firstNames.length];
            lastName = lastNames[Math.floor(i / firstNames.length) % lastNames.length];
            nameKey = `${firstName.toLowerCase()}_${lastName.toLowerCase()}_${i}`;
            break;
          }
        } while (usedNames.has(nameKey));
        
        usedNames.add(nameKey);
        
        const randomCompany = companies[Math.floor(Math.random() * companies.length)];
        const randomPurpose = purposes[Math.floor(Math.random() * purposes.length)];
        const randomHost = staff[Math.floor(Math.random() * staff.length)];
        
        // Generate random check-in time in the past 90 days
        const daysAgo = Math.floor(Math.random() * 90) + 1;
        const checkInTime = new Date();
        checkInTime.setDate(checkInTime.getDate() - daysAgo);
        checkInTime.setHours(Math.floor(Math.random() * 10) + 8); // 8 AM to 6 PM
        checkInTime.setMinutes(Math.floor(Math.random() * 60));
        
        // Generate check-out time 1-8 hours later
        const checkOutTime = new Date(checkInTime);
        checkOutTime.setHours(checkInTime.getHours() + Math.floor(Math.random() * 8) + 1);

        const visitorData = {
          firstName: firstName,
          lastName: lastName,
          company: randomCompany,
          purpose: randomPurpose,
          hostStaffId: randomHost.id,
          carRegistration: Math.random() > 0.6 ? `${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${Math.floor(Math.random() * 10)}${Math.floor(Math.random() * 10)} ${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}` : null,
        };

        // Create the visitor with custom timestamps
        const visitor = await storage.createVisitorWithTimestamps({
          ...visitorData,
          checkedInAt: checkInTime,
          checkedOutAt: checkOutTime,
          isCheckedIn: false, // Mark as checked out (previous visitor)
        });
        
        testVisitors.push(visitor);
      }

      res.json({ 
        success: true, 
        message: `Created ${testVisitors.length} test visitors`,
        visitors: testVisitors 
      });
    } catch (error) {
      console.error("Error generating test visitors:", error);
      res.status(500).json({ error: "Failed to generate test visitors" });
    }
  });

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

  // NEW: Search visitors for quick rebooking
  app.get("/api/visitors/search", async (req, res) => {
    try {
      const { q } = req.query;
      if (!q || typeof q !== 'string') {
        return res.status(400).json({ message: "Search query required" });
      }
      
      const visitors = await (storage as any).searchVisitors(q);
      res.json(visitors);
    } catch (error) {
      console.error("Error searching visitors:", error);
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
      console.error("Error searching pre-bookings:", error);
      res.status(500).json({ message: "Failed to search pre-bookings" });
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

  // NEW: Manual check-in for pre-booked visitors (no QR code needed)
  app.post("/api/prebookings/manual-checkin", async (req, res) => {
    try {
      const { preBookingId } = req.body;
      
      if (!preBookingId) {
        return res.status(400).json({ error: "Pre-booking ID is required" });
      }

      // Find the pre-booking
      const preBooking = await storage.getPreBookingById(preBookingId);
      if (!preBooking) {
        return res.status(404).json({ error: "Pre-booking not found" });
      }

      if (preBooking.isCheckedIn) {
        return res.status(400).json({ error: "Visitor already checked in" });
      }

      // Check if visit date is valid (today or future)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const visitDate = new Date(preBooking.visitDate);
      visitDate.setHours(0, 0, 0, 0);
      
      if (visitDate < today) {
        return res.status(400).json({ error: "Cannot check in for past visits" });
      }

      // Create visitor record from pre-booking
      const visitor = await storage.createVisitor({
        name: preBooking.visitorName,
        company: preBooking.company,
        purpose: preBooking.purpose,
        carRegistration: null,
        hostStaffId: preBooking.hostStaffId,
      });

      // Update pre-booking to mark as checked in
      const updatedPreBooking = await storage.updatePreBooking(preBooking.id, {
        isCheckedIn: true,
        checkedInAt: new Date(),
        visitorId: visitor.id,
      });

      res.json({ 
        success: true,
        visitor, 
        preBooking: updatedPreBooking,
        message: "Visitor checked in manually successfully"
      });
    } catch (error) {
      console.error("Manual pre-booking check-in error:", error);
      res.status(500).json({ error: "Failed to manually check in visitor" });
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

  // User invitation endpoints
  app.post("/api/invitations", requireAuth, async (req, res) => {
    try {
      const validatedData = insertUserInvitationSchema.omit({ token: true, expires: true, createdAt: true, used: true }).parse(req.body);
      
      // Check if invitation already exists for this email
      const existingInvitation = await storage.getUserInvitationByEmail(validatedData.email);
      if (existingInvitation && !existingInvitation.used) {
        return res.status(400).json({ error: "An invitation already exists for this email address" });
      }

      // Check if user already exists
      const existingUser = await storage.getUserByUsername(validatedData.email);
      if (existingUser) {
        return res.status(400).json({ error: "A user already exists with this email address" });
      }

      // Get current user
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Create invitation with invitedBy field
      const invitation = await storage.createUserInvitation({
        ...validatedData,
        invitedBy: currentUser.id
      });

      // Get company settings and send email
      const companySettings = await storage.getCompanySettings();
      if (companySettings) {
        const emailSent = await emailService.sendUserInvitation(
          invitation.email,
          invitation.role,
          invitation.token,
          currentUser,
          companySettings
        );

        if (!emailSent) {
          console.warn("Failed to send invitation email, but invitation was created");
        }
      }

      res.json({ 
        success: true, 
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          createdAt: invitation.createdAt,
          expires: invitation.expires,
          used: invitation.used
        }
      });
    } catch (error) {
      console.error("Failed to create invitation:", error);
      res.status(500).json({ error: "Failed to create invitation" });
    }
  });

  app.get("/api/invitations", requireAuth, async (req, res) => {
    try {
      const invitations = await storage.getAllUserInvitations();
      res.json(invitations.map(inv => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        createdAt: inv.createdAt,
        expires: inv.expires,
        used: inv.used,
        invitedBy: inv.invitedBy
      })));
    } catch (error) {
      console.error("Failed to fetch invitations:", error);
      res.status(500).json({ error: "Failed to fetch invitations" });
    }
  });

  app.post("/api/invitations/accept", async (req, res) => {
    try {
      const { token, username, password } = req.body;
      
      if (!token || !username || !password) {
        return res.status(400).json({ error: "Token, username, and password are required" });
      }

      // Get invitation
      const invitation = await storage.getUserInvitationByToken(token);
      if (!invitation) {
        return res.status(404).json({ error: "Invalid or expired invitation token" });
      }

      if (invitation.used) {
        return res.status(400).json({ error: "This invitation has already been used" });
      }

      if (new Date() > invitation.expires) {
        return res.status(400).json({ error: "This invitation has expired" });
      }

      // Check if user already exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      // Create user
      const newUser = await storage.createUser({
        username,
        password,
        email: invitation.email
      });

      // Mark invitation as used
      await storage.markInvitationAsUsed(token);

      res.json({ 
        success: true, 
        user: { id: newUser.id, username: newUser.username, email: newUser.email }
      });
    } catch (error) {
      console.error("Failed to accept invitation:", error);
      res.status(500).json({ error: "Failed to accept invitation" });
    }
  });

  app.delete("/api/invitations/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const success = await storage.deleteUserInvitation(id);
      
      if (!success) {
        return res.status(404).json({ error: "Invitation not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete invitation:", error);
      res.status(500).json({ error: "Failed to delete invitation" });
    }
  });

  // Contractor Company endpoints
  app.get("/api/contractors", async (req, res) => {
    try {
      const contractors = await storage.getAllContractorCompanies();
      res.json(contractors);
    } catch (error) {
      console.error("Error fetching contractors:", error);
      res.status(500).json({ error: "Failed to fetch contractors" });
    }
  });

  app.get("/api/contractors/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const contractor = await storage.getContractorCompanyById(id);
      
      if (!contractor) {
        return res.status(404).json({ error: "Contractor not found" });
      }
      
      // Get additional details
      const workers = await storage.getWorkersByCompanyId(id);
      const documents = await storage.getDocumentsByCompanyId(id);
      
      res.json({ ...contractor, workers, documents });
    } catch (error) {
      console.error("Error fetching contractor:", error);
      res.status(500).json({ error: "Failed to fetch contractor" });
    }
  });

  app.post("/api/contractors", async (req, res) => {
    try {
      const contractorData = insertContractorCompanySchema.parse(req.body);
      const contractor = await storage.createContractorCompany(contractorData);
      res.json(contractor);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid contractor data", details: error.errors });
      } else {
        console.error("Error creating contractor:", error);
        res.status(500).json({ error: "Failed to create contractor" });
      }
    }
  });

  app.put("/api/contractors/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const contractor = await storage.updateContractorCompany(id, updates);
      
      if (!contractor) {
        return res.status(404).json({ error: "Contractor not found" });
      }
      
      res.json(contractor);
    } catch (error) {
      console.error("Error updating contractor:", error);
      res.status(500).json({ error: "Failed to update contractor" });
    }
  });

  app.delete("/api/contractors/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const success = await storage.deleteContractorCompany(id);
      
      if (!success) {
        return res.status(404).json({ error: "Contractor not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting contractor:", error);
      res.status(500).json({ error: "Failed to delete contractor" });
    }
  });

  // Contractor Worker endpoints
  app.get("/api/contractors/:companyId/workers", async (req, res) => {
    try {
      const { companyId } = req.params;
      const workers = await storage.getWorkersByCompanyId(companyId);
      res.json(workers);
    } catch (error) {
      console.error("Error fetching workers:", error);
      res.status(500).json({ error: "Failed to fetch workers" });
    }
  });

  app.post("/api/contractors/:companyId/workers", async (req, res) => {
    try {
      const { companyId } = req.params;
      const workerData = insertContractorWorkerSchema.parse({
        ...req.body,
        companyId
      });
      
      const worker = await storage.createContractorWorker(workerData);
      res.json(worker);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid worker data", details: error.errors });
      } else {
        console.error("Error creating worker:", error);
        res.status(500).json({ error: "Failed to create worker" });
      }
    }
  });

  app.put("/api/workers/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const worker = await storage.updateContractorWorker(id, updates);
      
      if (!worker) {
        return res.status(404).json({ error: "Worker not found" });
      }
      
      res.json(worker);
    } catch (error) {
      console.error("Error updating worker:", error);
      res.status(500).json({ error: "Failed to update worker" });
    }
  });

  app.delete("/api/workers/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const success = await storage.deleteContractorWorker(id);
      
      if (!success) {
        return res.status(404).json({ error: "Worker not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting worker:", error);
      res.status(500).json({ error: "Failed to delete worker" });
    }
  });

  // Compliance Document endpoints
  app.get("/api/contractors/:companyId/documents", async (req, res) => {
    try {
      const { companyId } = req.params;
      const documents = await storage.getDocumentsByCompanyId(companyId);
      res.json(documents);
    } catch (error) {
      console.error("Error fetching documents:", error);
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  app.post("/api/contractors/:companyId/documents", async (req, res) => {
    try {
      const { companyId } = req.params;
      const documentData = insertComplianceDocumentSchema.parse({
        ...req.body,
        companyId
      });
      
      const document = await storage.createComplianceDocument(documentData);
      res.json(document);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid document data", details: error.errors });
      } else {
        console.error("Error creating document:", error);
        res.status(500).json({ error: "Failed to create document" });
      }
    }
  });

  // Document approval endpoints
  app.get("/api/contractors/:contractorId/documents/:documentId/approvals", async (req, res) => {
    try {
      const { documentId } = req.params;
      const approvals = await storage.getDocumentApprovals(documentId);
      res.json(approvals);
    } catch (error) {
      console.error("Error fetching document approvals:", error);
      res.status(500).json({ error: "Failed to fetch document approvals" });
    }
  });

  // Approve or reject document
  app.post("/api/contractors/:contractorId/documents/:documentId/approve", async (req, res) => {
    try {
      const { contractorId, documentId } = req.params;
      const { approvalStatus, comments, rejectionReason } = req.body;
      // For now, use a default user ID until proper authentication is set up
      const userId = "andy-smith-001";

      // Get document to get document type
      const document = await storage.getComplianceDocumentById(documentId);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      // Create approval record
      const approval = await storage.createDocumentApproval({
        documentId,
        contractorId,
        documentType: document.documentType,
        approvalStatus,
        approvedBy: userId,
        approvedAt: approvalStatus === "approved" ? new Date() : null,
        comments,
        rejectionReason
      });

      // Update document status
      await storage.updateComplianceDocument(documentId, {
        status: approvalStatus === "approved" ? "valid" : approvalStatus === "rejected" ? "rejected" : "pending",
        reviewedBy: userId,
        reviewedAt: new Date(),
        reviewNotes: comments || rejectionReason
      });

      res.json(approval);
    } catch (error) {
      console.error("Error approving/rejecting document:", error);
      res.status(500).json({ error: "Failed to process document approval" });
    }
  });

  // Contractor Worker Check-in/Check-out endpoints
  app.post("/api/contractors/workers/:workerId/checkin", async (req, res) => {
    try {
      const { workerId } = req.params;
      
      // Get worker details first
      const worker = await storage.getContractorWorkerById(workerId);
      if (!worker) {
        return res.status(404).json({ error: "Worker not found" });
      }

      // Check if worker can check in (induction completed, valid status, etc.)
      if (!worker.isActive || !worker.inductionCompleted || worker.rightToWorkStatus !== 'valid') {
        return res.status(400).json({ 
          error: "Worker not cleared for check-in",
          details: "Worker must complete induction and have valid right to work status"
        });
      }

      // Check if worker is already checked in
      if (worker.isCheckedIn) {
        return res.status(400).json({ error: "Worker is already checked in" });
      }

      // Generate QR code
      const qrCode = `CONTRACTOR-${workerId}-${Date.now()}`;
      
      // Update worker status
      const updatedWorker = await storage.updateContractorWorker(workerId, {
        isCheckedIn: true,
        checkedInAt: new Date(),
        qrCode: qrCode
      });

      res.json({
        success: true,
        worker: updatedWorker,
        message: "Worker checked in successfully"
      });
    } catch (error) {
      console.error("Error checking in worker:", error);
      res.status(500).json({ error: "Failed to check in worker" });
    }
  });

  app.post("/api/contractors/workers/:workerId/checkout", async (req, res) => {
    try {
      const { workerId } = req.params;
      
      // Get worker details first
      const worker = await storage.getContractorWorkerById(workerId);
      if (!worker) {
        return res.status(404).json({ error: "Worker not found" });
      }

      // Check if worker is currently checked in
      if (!worker.isCheckedIn) {
        return res.status(400).json({ error: "Worker is not currently checked in" });
      }

      // Update worker status
      const updatedWorker = await storage.updateContractorWorker(workerId, {
        isCheckedIn: false,
        checkedOutAt: new Date(),
        qrCode: null
      });

      res.json({
        success: true,
        worker: updatedWorker,
        message: "Worker checked out successfully"
      });
    } catch (error) {
      console.error("Error checking out worker:", error);
      res.status(500).json({ error: "Failed to check out worker" });
    }
  });

  // Initialize automatic reports
  setupAutomaticReports();

  const httpServer = createServer(app);
  return httpServer;
}
