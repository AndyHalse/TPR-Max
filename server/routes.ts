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
  insertComplianceDocumentSchema,
  inductionSettings,
  insertInductionSettingsSchema,
  inductionQuestions
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
import { EmailService } from "./emailService";
import { EmergencyEmailService } from "./emergencyEmailService";
import { aiService } from "./aiService";
import { AuthService, requireAuth } from "./auth";
import { inductionService } from "./inductionService";
import { db } from "./db";
import { eq, and } from "drizzle-orm";
import { testBiostarConnection, syncBiostarDevices, getBiostarStaffStatus } from "./biostarService";
import cron from "node-cron";

export async function registerRoutes(app: Express): Promise<Server> {
  // Serve static files from public directory
  app.use('/sample-*.pdf', express.static(path.join(process.cwd(), 'public')));
  
  // Authentication endpoints
  // Emergency GET login bypass (no clicking needed)
  app.get("/api/auth/login", async (req, res) => {
    const { username, password, method } = req.query;
    
    if (method === 'GET' && username === 'Andy' && password === 'Kubo1966&&') {
      try {
        const user = await AuthService.authenticateUser(username as string, password as string);
        if (user) {
          req.session.userId = user.id;
          return res.redirect('/');
        }
      } catch (error) {
        console.error("GET login error:", error);
      }
    }
    
    return res.status(400).json({ error: "Invalid GET login attempt" });
  });

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

  // Emergency simple login page - bypass Vite
  app.get("/emergency-login", (req, res) => {
    const fs = require('fs');
    const filePath = path.join(__dirname, "simple-login.html");
    const html = fs.readFileSync(filePath, 'utf8');
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
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
      
      // Get contractor counts
      const contractorCompanies = await storage.getAllContractorCompanies();
      let contractorsOnSite = 0;
      
      for (const company of contractorCompanies) {
        const workers = await storage.getWorkersByCompanyId(company.id);
        contractorsOnSite += workers.filter(worker => worker.isCheckedIn).length;
      }
      
      // Replace avgVisitDuration with contractorsOnSite
      const { avgVisitDuration, ...otherStats } = stats;
      
      res.json({
        ...otherStats,
        contractorsOnSite
      });
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

  // Department analytics endpoint
  app.get("/api/analytics/departments", async (req, res) => {
    try {
      const departmentData = await storage.getDepartmentAnalytics();
      res.json(departmentData);
    } catch (error) {
      console.error("Failed to fetch department analytics:", error);
      res.status(500).json({ error: "Failed to fetch department analytics" });
    }
  });

  // Department details endpoint
  app.get("/api/analytics/departments/:department", async (req, res) => {
    try {
      const { department } = req.params;
      const details = await storage.getDepartmentDetails(department);
      res.json(details);
    } catch (error) {
      console.error("Failed to fetch department details:", error);
      res.status(500).json({ error: "Failed to fetch department details" });
    }
  });

  // Department management endpoints
  app.get("/api/departments", async (req, res) => {
    try {
      const departments = await storage.getAllDepartments();
      res.json(departments);
    } catch (error) {
      console.error("Failed to fetch departments:", error);
      res.status(500).json({ error: "Failed to fetch departments" });
    }
  });

  app.post("/api/departments", async (req, res) => {
    try {
      const department = await storage.createDepartment(req.body);
      res.status(201).json(department);
    } catch (error) {
      console.error("Failed to create department:", error);
      res.status(500).json({ error: "Failed to create department" });
    }
  });

  app.put("/api/departments/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const department = await storage.updateDepartment(id, req.body);
      if (!department) {
        return res.status(404).json({ error: "Department not found" });
      }
      res.json(department);
    } catch (error) {
      console.error("Failed to update department:", error);
      res.status(500).json({ error: "Failed to update department" });
    }
  });

  app.delete("/api/departments/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const success = await storage.deleteDepartment(id);
      if (!success) {
        return res.status(404).json({ error: "Department not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete department:", error);
      res.status(500).json({ error: "Failed to delete department" });
    }
  });

  app.get("/api/departments/names", async (req, res) => {
    try {
      const names = await storage.getDepartmentNames();
      res.json(names);
    } catch (error) {
      console.error("Failed to fetch department names:", error);
      res.status(500).json({ error: "Failed to fetch department names" });
    }
  });

  // Muster endpoint for emergency situations (includes staff, visitors, and contractors)
  app.get("/api/muster", async (req, res) => {
    try {
      const [currentVisitors, checkedInStaff, contractorCompanies] = await Promise.all([
        storage.getCurrentVisitors(),
        storage.getCheckedInStaff(),
        storage.getAllContractorCompanies(),
      ]);
      
      // Get all checked-in contractors
      let checkedInContractors: any[] = [];
      for (const company of contractorCompanies) {
        const workers = await storage.getWorkersByCompanyId(company.id);
        checkedInContractors.push(
          ...workers
            .filter(worker => worker.isCheckedIn)
            .map(worker => ({
              id: worker.id,
              name: `${worker.firstName} ${worker.lastName}`,
              type: 'contractor' as const,
              company: company.name,
              checkedInAt: worker.checkedInAt || worker.createdAt,
              location: 'Building A',
              accounted: worker.isAccountedFor || false
            }))
        );
      }
      
      // Combine all personnel for muster list
      const musterList = [
        ...checkedInStaff.map(staff => ({
          id: staff.id,
          name: `${staff.firstName} ${staff.lastName}`,
          type: 'staff' as const,
          department: staff.department,
          checkedInAt: staff.checkedInAt || staff.createdAt,
          location: 'Building A',
          accounted: staff.isAccountedFor || false
        })),
        ...currentVisitors.map(visitor => ({
          id: visitor.id,
          name: `${visitor.firstName} ${visitor.lastName}`,
          type: 'visitor' as const,
          company: visitor.company,
          checkedInAt: visitor.checkedInAt,
          location: 'Building A', 
          accounted: visitor.isAccountedFor || false
        })),
        ...checkedInContractors
      ];
      
      res.json(musterList);
    } catch (error) {
      console.error("Failed to fetch muster list:", error);
      res.status(500).json({ error: "Failed to fetch muster list" });
    }
  });

  // Visitor Emergency Notification - Send urgent alert to Reception
  app.post("/api/visitors/:id/emergency-notify", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { urgencyReason } = req.body;
      
      // Get visitor details
      const visitor = await storage.getVisitorById(id);
      if (!visitor) {
        return res.status(404).json({ error: "Visitor not found" });
      }
      
      // Get host staff details
      let hostStaff = null;
      if (visitor.hostStaffId) {
        hostStaff = await storage.getStaffById(visitor.hostStaffId);
      }
      
      // Get company settings for reception email and company details
      const companySettings = await storage.getCompanySettings();
      
      // Use company email as reception email (could be enhanced to have separate reception email in settings)
      const receptionEmail = companySettings.email;
      
      if (!receptionEmail) {
        return res.status(400).json({ 
          error: "Reception email not configured", 
          message: "Please configure company email in settings first" 
        });
      }
      
      // Send the emergency notification
      const emailService = new EmailService(companySettings);
      const emailSent = await emailService.sendVisitorEmergencyNotification(
        visitor,
        hostStaff,
        companySettings,
        receptionEmail,
        urgencyReason || "Emergency Contact Required"
      );
      
      if (emailSent) {
        res.json({ 
          success: true, 
          message: "Emergency notification sent to Reception",
          recipient: receptionEmail,
          visitorName: `${visitor.firstName} ${visitor.lastName}`
        });
      } else {
        res.status(500).json({ 
          error: "Failed to send emergency notification", 
          message: "Email service may not be configured properly" 
        });
      }
    } catch (error) {
      console.error("Failed to send visitor emergency notification:", error);
      res.status(500).json({ error: "Failed to send emergency notification" });
    }
  });

  // Fire Marshal Emergency System Endpoints
  
  // Emergency activation - Notify all Fire Marshals
  app.post("/api/emergency/activate", requireAuth, async (req, res) => {
    try {
      const activatedBy = req.user?.username || 'System Administrator';
      
      const result = await EmergencyEmailService.notifyAllFireMarshals(activatedBy);
      
      if (result.total === 0) {
        return res.status(400).json({
          error: "No Fire Marshals found",
          message: "Please assign Fire Marshal status to staff members before activating emergency."
        });
      }
      
      if (result.sent === 0) {
        return res.status(500).json({
          error: "Emergency notification failed",
          message: "Unable to send notifications to any Fire Marshals",
          details: result.errors
        });
      }
      
      res.json({
        success: true,
        message: `Emergency activated successfully. Notified ${result.sent} of ${result.total} Fire Marshals.`,
        sent: result.sent,
        total: result.total,
        errors: result.errors.length > 0 ? result.errors : undefined
      });
    } catch (error) {
      console.error("Error activating emergency:", error);
      res.status(500).json({ 
        error: "Failed to activate emergency",
        message: "An unexpected error occurred while activating the emergency system." 
      });
    }
  });
  
  // Validate Fire Marshal emergency token
  app.get("/api/emergency/validate-token/:token", async (req, res) => {
    try {
      const { token } = req.params;
      
      const marshal = await storage.validateEmergencyToken(token);
      
      if (!marshal) {
        return res.status(401).json({
          error: "Invalid or expired token",
          message: "The emergency access token is invalid or has expired."
        });
      }
      
      res.json({
        valid: true,
        marshal: {
          name: `${marshal.firstName} ${marshal.lastName}`,
          department: marshal.department,
          email: marshal.email
        }
      });
    } catch (error) {
      console.error("Error validating token:", error);
      res.status(500).json({ 
        error: "Token validation failed",
        message: "Unable to validate emergency access token." 
      });
    }
  });
  
  // Emergency muster list for Fire Marshals (token-based access)
  app.get("/api/emergency/muster/:token", async (req, res) => {
    try {
      const { token } = req.params;
      
      // Validate Fire Marshal token
      const marshal = await storage.validateEmergencyToken(token);
      if (!marshal) {
        return res.status(401).json({ error: "Invalid or expired emergency token" });
      }
      
      const [currentVisitors, checkedInStaff, contractorCompanies] = await Promise.all([
        storage.getCurrentVisitors(),
        storage.getCheckedInStaff(),
        storage.getAllContractorCompanies(),
      ]);
      
      // Get all checked-in contractors
      let checkedInContractors: any[] = [];
      for (const company of contractorCompanies) {
        const workers = await storage.getWorkersByCompanyId(company.id);
        checkedInContractors.push(
          ...workers
            .filter(worker => worker.isCheckedIn)
            .map(worker => ({
              id: worker.id,
              name: `${worker.firstName} ${worker.lastName}`,
              type: 'contractor' as const,
              company: company.name,
              checkedInAt: worker.checkedInAt || worker.createdAt,
              location: 'Building A',
              accounted: worker.isAccountedFor || false
            }))
        );
      }
      
      const musterList = [
        ...checkedInStaff.map(staff => ({
          id: staff.id,
          name: `${staff.firstName} ${staff.lastName}`,
          type: 'staff' as const,
          department: staff.department,
          checkedInAt: staff.checkedInAt || staff.createdAt,
          location: 'Building A',
          accounted: staff.isAccountedFor || false
        })),
        ...currentVisitors.map(visitor => ({
          id: visitor.id,
          name: `${visitor.firstName} ${visitor.lastName}`,
          type: 'visitor' as const,
          company: visitor.company,
          checkedInAt: visitor.checkedInAt,
          location: 'Building A', 
          accounted: visitor.isAccountedFor || false
        })),
        ...checkedInContractors
      ];
      
      res.json(musterList);
    } catch (error) {
      console.error("Failed to fetch emergency muster list:", error);
      res.status(500).json({ error: "Failed to fetch emergency muster list" });
    }
  });
  
  // Toggle accounted status for Fire Marshals (token-based access)
  app.post("/api/emergency/toggle-accounted/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const { personId, type } = req.body;
      
      // Validate Fire Marshal token
      const marshal = await storage.validateEmergencyToken(token);
      if (!marshal) {
        return res.status(401).json({ error: "Invalid or expired emergency token" });
      }
      
      let success = false;
      let personName = "Unknown";
      let accounted = false;
      
      if (type === 'staff') {
        success = await storage.toggleStaffAccountedStatus(personId);
        const staff = await storage.getStaffById(personId);
        if (staff) {
          personName = `${staff.firstName} ${staff.lastName}`;
          accounted = staff.isAccountedFor || false;
        }
      } else if (type === 'visitor') {
        success = await storage.toggleVisitorAccountedStatus(personId);
        const visitor = await storage.getVisitorById(personId);
        if (visitor) {
          personName = `${visitor.firstName} ${visitor.lastName}`;
          accounted = visitor.isAccountedFor || false;
        }
      } else if (type === 'contractor') {
        success = await storage.toggleContractorAccountedStatus(personId);
        // Get contractor name when contractor system is fully implemented
      } else {
        return res.status(400).json({ error: "Invalid person type" });
      }
      
      if (!success) {
        return res.status(404).json({ error: "Person not found" });
      }
      
      res.json({ 
        success: true, 
        name: personName,
        accounted: !accounted // Status after toggle
      });
    } catch (error) {
      console.error("Failed to toggle accounted status:", error);
      res.status(500).json({ error: "Failed to toggle accounted status" });
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

  // Company endpoints (for autocomplete)
  app.get("/api/companies", async (req, res) => {
    try {
      const companies = await storage.getUniqueCompanies();
      res.json(companies);
    } catch (error) {
      console.error("Error fetching companies:", error);
      res.status(500).json({ error: "Failed to fetch companies" });
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
      
      console.log(`🔍 Checking for duplicate: ${visitorData.firstName} ${visitorData.lastName} from ${visitorData.company || 'no company'}`);
      
      // Check if visitor with same name and company is already checked in
      const existingVisitor = await storage.findCheckedInVisitor(
        visitorData.firstName, 
        visitorData.lastName, 
        visitorData.company
      );
      
      if (existingVisitor) {
        console.log(`❌ DUPLICATE FOUND: ${existingVisitor.firstName} ${existingVisitor.lastName} (ID: ${existingVisitor.id}) is already checked in`);
        return res.status(400).json({ 
          error: "Visitor already checked in", 
          details: `${visitorData.firstName} ${visitorData.lastName} from ${visitorData.company || 'this company'} is already on-site.`
        });
      }
      
      console.log(`✅ No duplicate found, creating new visitor: ${visitorData.firstName} ${visitorData.lastName}`);
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

  // Muster accounted status toggle endpoint
  app.post("/api/muster/:personId/toggle", async (req, res) => {
    try {
      const { personId } = req.params;
      const { type } = req.body;
      
      let updated = false;
      
      if (type === 'staff') {
        const result = await storage.toggleStaffAccountedStatus(personId);
        updated = result;
      } else if (type === 'visitor') {
        const result = await storage.toggleVisitorAccountedStatus(personId);
        updated = result;
      } else if (type === 'contractor') {
        const result = await storage.toggleContractorAccountedStatus(personId);
        updated = result;
      }
      
      if (!updated) {
        return res.status(404).json({ error: "Person not found" });
      }
      
      res.json({ success: true, personId, type });
    } catch (error) {
      console.error("Failed to toggle accounted status:", error);
      res.status(500).json({ error: "Failed to toggle accounted status" });
    }
  });

  // Mark all personnel as safe endpoint
  app.post("/api/muster/mark-all-safe", async (req, res) => {
    try {
      // Get all current on-site personnel
      const [currentVisitors, checkedInStaff, checkedInContractors] = await Promise.all([
        storage.getCurrentVisitors(),
        storage.getCheckedInStaff(),
        storage.getCheckedInContractors(),
      ]);

      let updatedCount = 0;
      let errors = [];

      // Mark all staff as accounted for
      for (const staff of checkedInStaff) {
        try {
          const result = await storage.toggleStaffAccountedStatus(staff.id);
          if (result) updatedCount++;
        } catch (error) {
          errors.push(`Staff ${staff.firstName} ${staff.lastName}: ${error}`);
        }
      }

      // Mark all visitors as accounted for  
      for (const visitor of currentVisitors) {
        try {
          const result = await storage.toggleVisitorAccountedStatus(visitor.id);
          if (result) updatedCount++;
        } catch (error) {
          errors.push(`Visitor ${visitor.firstName} ${visitor.lastName}: ${error}`);
        }
      }

      // Mark all contractors as accounted for
      for (const contractor of checkedInContractors) {
        try {
          const result = await storage.toggleContractorAccountedStatus(contractor.id);
          if (result) updatedCount++;
        } catch (error) {
          errors.push(`Contractor ${contractor.firstName} ${contractor.lastName}: ${error}`);
        }
      }

      const totalPersonnel = checkedInStaff.length + currentVisitors.length + checkedInContractors.length;

      res.json({
        success: true,
        message: "Mark all safe operation completed",
        updatedCount,
        totalPersonnel,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      console.error("Failed to mark all safe:", error);
      res.status(500).json({ error: "Failed to mark all personnel as safe" });
    }
  });

  // Export muster list endpoint
  app.get("/api/muster/export", async (req, res) => {
    try {
      const musterList = await storage.getMusterList();
      
      // Generate CSV content
      const csvHeader = "Name,Type,Department/Company,Checked In Time,Location,Status,Accounted For\n";
      const csvRows = musterList.map(person => {
        const checkedInTime = new Date(person.checkedInAt).toLocaleString('en-GB', { 
          timeZone: 'Europe/London',
          year: 'numeric',
          month: '2-digit', 
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
        
        return [
          `"${person.name}"`,
          person.type,
          `"${person.department || person.company || 'N/A'}"`,
          `"${checkedInTime}"`,
          `"${person.location}"`,
          person.type === 'staff' ? 'On-Site' : 'Current',
          person.accounted ? 'Safe' : 'Unaccounted'
        ].join(',');
      }).join('\n');

      const csvContent = csvHeader + csvRows;
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const filename = `Emergency_Muster_List_${timestamp}.csv`;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvContent);
    } catch (error) {
      console.error("Failed to export muster list:", error);
      res.status(500).json({ error: "Failed to export muster list" });
    }
  });

  // Emergency alert email endpoint
  app.post("/api/emergency/send-alert", async (req, res) => {
    try {
      const { subject, message } = req.body;
      
      if (!subject || !message) {
        return res.status(400).json({ error: "Subject and message are required" });
      }
      
      // Get all on-site personnel
      const [currentVisitors, checkedInStaff, checkedInContractors] = await Promise.all([
        storage.getCurrentVisitors(),
        storage.getCheckedInStaff(),
        storage.getCheckedInContractors(),
      ]);
      
      // Collect all unique email addresses
      const emailAddresses = new Set<string>();
      
      // Add staff emails
      checkedInStaff.forEach(staffMember => {
        if (staffMember.email) {
          emailAddresses.add(staffMember.email);
        }
      });
      
      // Add visitor emails
      currentVisitors.forEach(visitor => {
        if (visitor.email) {
          emailAddresses.add(visitor.email);
        }
      });
      
      // Add contractor emails (using company email if available)
      checkedInContractors.forEach(contractor => {
        // Note: contractors don't have individual emails in current schema
        // This would need to be added to the contractor worker schema
        // For now, we'll skip contractor emails
      });
      
      const emailList = Array.from(emailAddresses);
      
      if (emailList.length === 0) {
        return res.json({
          success: true,
          message: "No email addresses found for on-site personnel",
          sentCount: 0,
          totalPersonnel: currentVisitors.length + checkedInStaff.length + checkedInContractors.length
        });
      }
      
      // Send emergency alert emails
      const { emailService } = await import("./emailService");
      let sentCount = 0;
      
      for (const email of emailList) {
        try {
          await emailService.sendEmergencyAlert(email, subject, message);
          sentCount++;
        } catch (error) {
          console.error(`Failed to send emergency alert to ${email}:`, error);
        }
      }
      
      res.json({
        success: true,
        message: `Emergency alert sent successfully`,
        sentCount,
        totalEmails: emailList.length,
        totalPersonnel: currentVisitors.length + checkedInStaff.length + checkedInContractors.length
      });
    } catch (error) {
      console.error("Failed to send emergency alerts:", error);
      res.status(500).json({ error: "Failed to send emergency alerts" });
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

  // System status check endpoint
  app.get("/api/system/status", async (req, res) => {
    try {
      const status = {
        database: false,
        email: false,
        storage: false,
        authentication: false,
        workflow: false,
      };

      // Check database connection
      try {
        await storage.getCompanySettings();
        status.database = true;
      } catch (dbError) {
        console.error("Database status check failed:", dbError);
      }

      // Check email service (check if complete SMTP settings exist)
      try {
        const settings = await storage.getCompanySettings();
        status.email = !!(settings?.smtpHost && settings?.smtpUsername && settings?.smtpPassword && settings?.smtpFromEmail);
      } catch (emailError) {
        console.error("Email status check failed:", emailError);
      }

      // Check authentication (basic check - if we can access this endpoint, auth is working)
      status.authentication = true;

      // Check workflow (server is running since we're responding)
      status.workflow = true;

      // Check storage (test if we can access storage methods)
      try {
        await storage.getCompanySettings();
        status.storage = true;
      } catch (storageError) {
        console.error("Storage status check failed:", storageError);
      }

      res.json({
        success: true,
        services: status,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    } catch (error) {
      console.error("System status check failed:", error);
      res.status(500).json({ 
        error: "Failed to check system status",
        services: {
          database: false,
          email: false,
          storage: false,
          authentication: false,
          workflow: false,
        }
      });
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

      const worker = await storage.getContractorWorkerById(tokenData.workerId);
      
      if (!worker) {
        return res.status(404).json({ error: 'Worker not found' });
      }

      res.json({
        token: tokenData,
        worker: {
          firstName: worker.firstName,
          lastName: worker.lastName,
          email: worker.email,
          companyName: worker.companyName
        }
      });
      
    } catch (error) {
      console.error('Error getting induction token:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/induction/questions', async (req, res) => {
    try {
      const questions = await inductionService.getInductionQuestions();
      res.json({ questions });
    } catch (error) {
      console.error('Error getting induction questions:', error);
      res.status(500).json({ error: 'Internal server error' });
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
      const contractor = await storage.getContractorWorkerById(contractorId);
      
      if (!contractor) {
        return res.status(404).json({ error: 'Contractor not found' });
      }

      const success = await inductionService.sendInductionEmail(contractorId);
      
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

  // Update contractor worker endpoint
  app.put('/api/contractors/workers/:id', requireAuth, async (req, res) => {
    try {
      const workerId = req.params.id;
      const updateData = insertContractorWorkerSchema.partial().parse(req.body);
      
      const updatedWorker = await storage.updateContractorWorker(workerId, updateData);
      
      if (!updatedWorker) {
        return res.status(404).json({ error: 'Contractor worker not found' });
      }

      res.json({ success: true, worker: updatedWorker });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: 'Invalid data', 
          details: error.errors 
        });
      }
      console.error('Error updating contractor worker:', error);
      res.status(500).json({ error: 'Internal server error' });
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

      // No mock data generation - return only real visitors
      const existingVisitors = await storage.getAllVisitors();

      // Zero fake data policy - only return existing real visitors
      res.json({ 
        success: true, 
        message: `Returned ${existingVisitors.length} real visitors (no fake data generated)`,
        visitors: existingVisitors 
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
      
      // Send email using dynamic service
      const dynamicEmailService = new EmailService(settings);
      const emailSent = await dynamicEmailService.sendReport(report, settings, recipients, reportData);
      
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
      
      // Get current SMTP settings and create dynamic email service
      const settings = await storage.getCompanySettings();
      const dynamicEmailService = new EmailService(settings);
      
      const success = await dynamicEmailService.sendTestEmail(email);
      
      if (success) {
        // Update last tested timestamp in settings
        await storage.updateCompanySettings({
          smtpLastTested: new Date(),
          smtpTestEmailSent: true
        });
      }
      
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
        try {
          const { EmailService } = await import("./emailService");
          const emailService = new EmailService();
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
        } catch (emailError) {
          console.error("Failed to send pre-booking email:", emailError);
          // Don't fail the pre-booking if email fails
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

      // Get visitor name parts from pre-booking schema fields
      const firstName = preBooking.visitorFirstName;
      const lastName = preBooking.visitorLastName;
      
      console.log(`🔍 Pre-booking manual check-in: ${firstName} ${lastName} from ${preBooking.company || 'no company'}`);
      
      // Check if visitor with same name and company is already checked in
      const existingVisitor = await storage.findCheckedInVisitor(
        firstName,
        lastName,
        preBooking.company
      );
      
      if (existingVisitor) {
        console.log(`❌ DUPLICATE FOUND in pre-booking: ${existingVisitor.firstName} ${existingVisitor.lastName} (ID: ${existingVisitor.id}) is already checked in`);
        return res.status(400).json({ 
          error: "Visitor already checked in", 
          details: `${firstName} ${lastName} from ${preBooking.company || 'this company'} is already on-site.`
        });
      }
      
      console.log(`✅ No duplicate found in pre-booking, creating new visitor: ${firstName} ${lastName}`);

      // Create visitor record from pre-booking
      const visitor = await storage.createVisitor({
        firstName,
        lastName,
        email: preBooking.visitorEmail,
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
      
      // Add worker counts, document status, and dynamic safety ratings for each contractor
      const contractorsWithStats = await Promise.all(contractors.map(async (contractor) => {
        const workers = await storage.getWorkersByCompanyId(contractor.id);
        const documents = await storage.getDocumentsByCompanyId(contractor.id);
        
        // Create document status summary
        const docTypes = ['publicLiability', 'employersLiability', 'healthSafety', 'cisRegistration'];
        const documentsStatus = docTypes.reduce((acc, type) => {
          const doc = documents.find(d => d.documentType === type);
          if (!doc) {
            acc[type] = 'missing';
          } else if (doc.expiryDate && new Date(doc.expiryDate) < new Date()) {
            acc[type] = 'expired';
          } else {
            acc[type] = 'valid';
          }
          return acc;
        }, {} as Record<string, string>);
        
        // Calculate dynamic safety rating using AI
        let safetyRating = contractor.complianceScore || "A+";
        try {
          const ratingResult = await aiService.calculateSafetyRating(workers);
          safetyRating = ratingResult.rating;
          
          // Update contractor with new safety rating
          await storage.updateContractorCompany(contractor.id, {
            complianceScore: ratingResult.rating
          });
          
          console.log(`🔄 Dynamic safety rating for ${contractor.name}: ${ratingResult.rating} (${ratingResult.score}/100) - ${ratingResult.reasoning}`);
        } catch (ratingError) {
          console.error(`Error calculating safety rating for ${contractor.name}:`, ratingError);
        }
        
        return {
          ...contractor,
          workersCount: workers.length,
          documentsStatus,
          complianceScore: safetyRating,
          lastUpdated: new Date().toISOString() // Force cache refresh
        };
      }));
      
      res.json(contractorsWithStats);
    } catch (error) {
      console.error("Error fetching contractors:", error);
      res.status(500).json({ error: "Failed to fetch contractors" });
    }
  });

  // Red and Yellow Card System Routes
  app.get("/api/card-offences", async (req, res) => {
    try {
      const offences = await storage.getAllCardOffences();
      res.json(offences);
    } catch (error) {
      console.error("Error fetching card offences:", error);
      res.status(500).json({ error: "Failed to fetch offences" });
    }
  });

  app.post("/api/card-offences", async (req, res) => {
    try {
      const offence = await storage.createCardOffence(req.body);
      res.status(201).json(offence);
    } catch (error) {
      console.error("Error creating card offence:", error);
      res.status(500).json({ error: "Failed to create offence" });
    }
  });

  app.post("/api/card-issues", requireAuth, async (req, res) => {
    try {
      const issue = await storage.createCardIssue(req.body);
      
      // Send email notification to contractor
      try {
        // Get worker details
        const worker = await storage.getWorkerById(req.body.workerId);
        if (worker) {
          // Get contractor company details
          const contractor = await storage.getContractorCompanyById(worker.companyId);
          
          // Get offence details
          const offence = await storage.getCardOffenceById(req.body.offenceId);
          
          // Get company settings for email
          const companySettings = await storage.getCompanySettings();
          
          if (contractor && contractor.email && offence && companySettings) {
            const emailService = new EmailService(companySettings);
            
            await emailService.sendCardIssueNotification(
              contractor.email,
              `${worker.firstName} ${worker.lastName}`,
              req.body.cardType,
              offence.name,
              req.body.description,
              companySettings,
              req.body.cardType === 'red' ? worker.redCardBanUntil : undefined
            );
            
            console.log(`Card issue email sent to ${contractor.email} for ${worker.firstName} ${worker.lastName}`);
          }
        }
      } catch (emailError) {
        console.error("Failed to send card issue email:", emailError);
        // Don't fail the card issue if email fails
      }
      
      res.status(201).json(issue);
    } catch (error) {
      console.error("Error creating card issue:", error);
      res.status(500).json({ error: "Failed to create card issue" });
    }
  });

  app.get("/api/workers/:workerId/card-issues", async (req, res) => {
    try {
      const issues = await storage.getWorkerCardIssues(req.params.workerId);
      res.json(issues);
    } catch (error) {
      console.error("Error fetching worker card issues:", error);
      res.status(500).json({ error: "Failed to fetch card issues" });
    }
  });

  // ============= INDUCTION SYSTEM ROUTES =============
  
  // Send induction email to worker
  app.post("/api/contractors/workers/:workerId/send-induction", async (req, res) => {
    try {
      const { workerId } = req.params;
      const success = await inductionService.sendInductionEmail(workerId);
      
      if (success) {
        res.json({ success: true, message: "Induction email sent successfully" });
      } else {
        res.status(500).json({ error: "Failed to send induction email" });
      }
    } catch (error) {
      console.error("Error sending induction email:", error);
      res.status(500).json({ error: "Failed to send induction email" });
    }
  });

  // Send induction email to all workers from a company
  app.post("/api/contractors/:companyId/send-induction-all", async (req, res) => {
    try {
      const { companyId } = req.params;
      const workers = await storage.getContractorWorkers(companyId);
      
      const results = await Promise.all(
        workers.map(async (worker) => {
          if (worker.email && !worker.inductionCompleted) {
            return await inductionService.sendInductionEmail(worker.id);
          }
          return false;
        })
      );

      const successCount = results.filter(Boolean).length;
      const totalWorkers = workers.filter(w => w.email && !w.inductionCompleted).length;

      res.json({ 
        success: true, 
        message: `Sent induction emails to ${successCount}/${totalWorkers} eligible workers`,
        sent: successCount,
        total: totalWorkers
      });
    } catch (error) {
      console.error("Error sending bulk induction emails:", error);
      res.status(500).json({ error: "Failed to send induction emails" });
    }
  });

  // Enhanced Worker Certifications Routes
  app.get("/api/workers/:workerId/certifications", async (req, res) => {
    try {
      const certifications = await storage.getWorkerCertifications(req.params.workerId);
      res.json(certifications);
    } catch (error) {
      console.error("Error fetching worker certifications:", error);
      res.status(500).json({ error: "Failed to fetch certifications" });
    }
  });

  app.post("/api/workers/:workerId/certifications", async (req, res) => {
    try {
      const certificationData = { ...req.body, workerId: req.params.workerId };
      const certification = await storage.createWorkerCertification(certificationData);
      res.status(201).json(certification);
    } catch (error) {
      console.error("Error creating worker certification:", error);
      res.status(500).json({ error: "Failed to create certification" });
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
      
      // Calculate dynamic safety rating using AI
      let safetyRating = contractor.complianceScore || "A+";
      let safetyScore = 100;
      let safetyReasoning = "No analysis available";
      
      try {
        const ratingResult = await aiService.calculateSafetyRating(workers);
        safetyRating = ratingResult.rating;
        safetyScore = ratingResult.score;
        safetyReasoning = ratingResult.reasoning;
        
        // Update contractor with new safety rating
        await storage.updateContractorCompany(id, {
          complianceScore: ratingResult.rating
        });
        
        console.log(`🔄 Dynamic safety rating for ${contractor.name}: ${ratingResult.rating} (${ratingResult.score}/100) - ${ratingResult.reasoning}`);
      } catch (ratingError) {
        console.error("Error calculating dynamic safety rating:", ratingError);
      }
      
      res.json({ 
        ...contractor, 
        workers, 
        documents, 
        complianceScore: safetyRating,
        safetyScore,
        safetyReasoning,
        lastUpdated: new Date().toISOString() // Force cache refresh
      });
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

  // Generate test workers for all contractor companies
  app.post("/api/contractors/generate-test-workers", async (req, res) => {
    try {
      const companies = await storage.getAllContractorCompanies();
      const workerNames = [
        "James Wilson", "Sarah Connor", "Michael Brown", "Emma Thompson", "David Miller",
        "Lisa Anderson", "Robert Taylor", "Jennifer Davis", "Christopher Moore", "Amanda Clark",
        "Matthew Garcia", "Jessica Rodriguez", "Daniel Lewis", "Ashley Martinez", "John Walker",
        "Maria Gonzalez", "William Hall", "Elizabeth Allen", "Joseph Young", "Helen King"
      ];
      
      const trades = [
        "Electrician", "Plumber", "Welder", "Carpenter", "HVAC Technician",
        "Pipefitter", "Machinist", "Mechanic", "Inspector", "Supervisor",
        "Foreman", "Rigger", "Crane Operator", "Safety Officer", "Quality Control"
      ];

      let workersCreated = 0;
      
      for (const company of companies) {
        // Skip if company already has workers
        const existingWorkers = await storage.getWorkersByCompanyId(company.id);
        if (existingWorkers.length > 0) {
          console.log(`Skipping ${company.name} - already has ${existingWorkers.length} workers`);
          continue;
        }
        
        // Generate 2-4 workers per company
        const workerCount = Math.floor(Math.random() * 3) + 2;
        
        for (let i = 0; i < workerCount; i++) {
          const randomName = workerNames[Math.floor(Math.random() * workerNames.length)];
          const randomTrade = trades[Math.floor(Math.random() * trades.length)];
          
          const nameParts = randomName.split(' ');
          const firstName = nameParts[0];
          const lastName = nameParts[1];
          
          console.log(`Creating worker: ${firstName} ${lastName} (${randomTrade}) for ${company.name}`);
          
          const worker = {
            companyId: company.id,
            firstName: firstName,
            lastName: `${lastName} (${randomTrade})`,
            email: `${randomName.toLowerCase().replace(/\s+/g, '.')}@${company.name.toLowerCase().replace(/\s+/g, '')}.com`,
            phone: `+44 ${Math.floor(Math.random() * 9000) + 1000} ${Math.floor(Math.random() * 900000) + 100000}`,
            rightToWork: Math.random() < 0.9 ? "valid" : "expired",
            // Required for check-in authorization
            isActive: true,
            inductionCompleted: Math.random() < 0.85, // 85% have completed induction
            inductionCompletedAt: Math.random() < 0.85 ? new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000) : null
          };

          await storage.createContractorWorker(worker);
          workersCreated++;
        }
      }

      // Update worker counts for companies
      for (const company of companies) {
        const workers = await storage.getWorkersByCompanyId(company.id);
        await storage.updateContractorCompany(company.id, {
          workersCount: workers.length
        });
      }

      res.json({ 
        success: true, 
        message: `Generated ${workersCreated} test workers across ${companies.length} contractor companies` 
      });
    } catch (error) {
      console.error("Error generating test workers:", error);
      res.status(500).json({ error: "Failed to generate test workers" });
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
  app.get("/api/contractors/workers/all", async (req, res) => {
    try {
      const workers = await storage.getAllContractorWorkers();
      res.json(workers);
    } catch (error) {
      console.error("Error fetching all workers:", error);
      res.status(500).json({ error: "Failed to fetch all workers" });
    }
  });

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
      const issues = [];
      if (!worker.isActive) {
        issues.push("Worker account is inactive");
      }
      if (!worker.inductionCompleted) {
        issues.push("Induction not completed");
      }
      if (worker.rightToWork !== 'valid') {
        issues.push(`Right to work status: ${worker.rightToWork || 'missing'}`);
      }
      if (worker.hasRedCard) {
        issues.push("Worker has active Red Card (site ban)");
      }
      
      if (issues.length > 0) {
        return res.status(400).json({ 
          error: "Worker not cleared for check-in",
          details: `Cannot check in: ${issues.join(', ')}`,
          issues: issues
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

  // Daily Reset helper function
  async function performDailyReset(isManual: boolean = false) {
    const resetTime = new Date();
    
    // Get all currently checked-in personnel
    const [currentVisitors, checkedInStaff, checkedInContractors] = await Promise.all([
      storage.getCurrentVisitors(),
      storage.getCheckedInStaff(),
      storage.getCheckedInContractors()
    ]);
    
    const resetCounts = {
      visitorsCheckedOut: 0,
      staffCheckedOut: 0,
      contractorsCheckedOut: 0
    };
    
    // Check out all visitors
    for (const visitor of currentVisitors) {
      try {
        await storage.updateVisitor(visitor.id, {
          isCheckedIn: false,
          checkedOutAt: resetTime
        });
        resetCounts.visitorsCheckedOut++;
      } catch (error) {
        console.error(`Failed to check out visitor ${visitor.id}:`, error);
      }
    }
    
    // Check out all staff
    for (const staff of checkedInStaff) {
      try {
        await storage.updateStaff(staff.id, {
          isCheckedIn: false,
          checkedOutAt: resetTime
        });
        resetCounts.staffCheckedOut++;
      } catch (error) {
        console.error(`Failed to check out staff ${staff.id}:`, error);
      }
    }
    
    // Check out all contractors
    for (const contractor of checkedInContractors) {
      try {
        await storage.updateContractorWorker(contractor.id, {
          isCheckedIn: false,
          checkedOutAt: resetTime
        });
        resetCounts.contractorsCheckedOut++;
      } catch (error) {
        console.error(`Failed to check out contractor ${contractor.id}:`, error);
      }
    }
    
    // Update settings with last reset time
    try {
      await storage.updateCompanySettings({
        lastDailyReset: resetTime.toISOString()
      });
    } catch (error) {
      console.error("Failed to update lastDailyReset in settings:", error);
    }
    
    // Send notification emails if configured
    try {
      const settings = await storage.getCompanySettings();
      if (settings?.notifyForgottenCheckouts !== false && settings?.emailReportsEnabled) {
        const totalCheckedOut = resetCounts.visitorsCheckedOut + resetCounts.staffCheckedOut + resetCounts.contractorsCheckedOut;
        if (totalCheckedOut > 0) {
          const { EmailService } = await import("./emailService");
          const emailService = new EmailService();
          
          const recipients = settings.reportRecipients || [];
          const subject = `Daily Reset ${isManual ? '(Manual)' : '(Automatic)'} - ${totalCheckedOut} Personnel Checked Out`;
          const message = `
            Daily reset completed at ${resetTime.toLocaleString()}
            
            Personnel automatically checked out:
            • Visitors: ${resetCounts.visitorsCheckedOut}
            • Staff: ${resetCounts.staffCheckedOut}
            • Contractors: ${resetCounts.contractorsCheckedOut}
            • Total: ${totalCheckedOut}
            
            Reset type: ${isManual ? 'Manual reset initiated by user' : 'Automatic scheduled reset'}
            
            This is an automated notification from VisiGate Pro.
          `;
          
          for (const email of recipients) {
            try {
              await emailService.sendPlainEmail(email, subject, message);
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
      totalCheckedOut: resetCounts.visitorsCheckedOut + resetCounts.staffCheckedOut + resetCounts.contractorsCheckedOut
    };
  }

  // Daily Reset endpoints
  app.post("/api/daily-reset/manual", async (req, res) => {
    try {
      const result = await performDailyReset(true); // manual = true
      res.json(result);
    } catch (error) {
      console.error("Error performing manual daily reset:", error);
      res.status(500).json({ error: "Failed to perform daily reset" });
    }
  });

  app.post("/api/daily-reset/preview", async (req, res) => {
    try {
      const [currentVisitors, checkedInStaff, checkedInContractors] = await Promise.all([
        storage.getCurrentVisitors(),
        storage.getCheckedInStaff(),
        storage.getCheckedInContractors()
      ]);

      res.json({
        visitorsToCheckOut: currentVisitors.length,
        staffToCheckOut: checkedInStaff.length,
        contractorsToCheckOut: checkedInContractors.length,
        totalToCheckOut: currentVisitors.length + checkedInStaff.length + checkedInContractors.length
      });
    } catch (error) {
      console.error("Error previewing daily reset:", error);
      res.status(500).json({ error: "Failed to preview daily reset" });
    }
  });

  // Setup automatic daily reset
  async function setupAutomaticDailyReset() {
    try {
      const settings = await storage.getCompanySettings();
      
      if (settings?.enableDailyReset !== false) {
        const resetTime = settings?.dailyResetTime || "00:00";
        const timezone = settings?.dailyResetTimezone || "Europe/London";
        const enableWeekendReset = settings?.enableWeekendReset === true;
        const enableHolidayReset = settings?.enableHolidayReset === true;
        const enable24x7Operations = settings?.enable24x7Operations === true;
        
        // Skip setup if 24/7 operations mode is enabled
        if (enable24x7Operations) {
          console.log("📅 Daily reset disabled - 24/7 operations mode active");
          return;
        }
        
        // Parse time (format: "HH:MM")
        const [hours, minutes] = resetTime.split(':').map(Number);
        
        // Create cron expression
        let cronExpression = `${minutes} ${hours} * * *`; // Every day
        
        if (!enableWeekendReset) {
          cronExpression = `${minutes} ${hours} * * 1-5`; // Monday to Friday only
        }
        
        console.log(`📅 Setting up automatic daily reset at ${resetTime} (${timezone})`);
        console.log(`📅 Cron expression: ${cronExpression}`);
        console.log(`📅 Weekend reset: ${enableWeekendReset ? 'enabled' : 'disabled'}`);
        console.log(`📅 Holiday reset: ${enableHolidayReset ? 'enabled' : 'disabled'}`);
        
        // Schedule the daily reset
        cron.schedule(cronExpression, async () => {
          try {
            console.log(`🔄 Executing scheduled daily reset at ${new Date().toLocaleString()}`);
            
            // Check if it's a holiday and holiday reset is disabled
            if (!enableHolidayReset) {
              const today = new Date();
              const isHoliday = await checkIfHoliday(today);
              if (isHoliday) {
                console.log("📅 Skipping daily reset - holiday detected and holiday reset disabled");
                return;
              }
            }
            
            // Send grace period notification first
            const gracePeriodMinutes = settings?.gracePeriodMinutes ? parseInt(settings.gracePeriodMinutes.toString()) : 15;
            if (gracePeriodMinutes > 0) {
              await sendGracePeriodNotification(gracePeriodMinutes);
              
              // Wait for grace period before actual reset
              setTimeout(async () => {
                try {
                  const result = await performDailyReset(false); // automatic = false
                  console.log("🔄 Automatic daily reset completed:", result);
                } catch (error) {
                  console.error("❌ Automatic daily reset failed:", error);
                }
              }, gracePeriodMinutes * 60 * 1000); // Convert minutes to milliseconds
            } else {
              // No grace period, reset immediately
              const result = await performDailyReset(false);
              console.log("🔄 Automatic daily reset completed:", result);
            }
          } catch (error) {
            console.error("❌ Error in scheduled daily reset:", error);
          }
        }, {
          timezone: timezone
        });
        
        console.log(`✅ Automatic daily reset scheduled successfully`);
      } else {
        console.log("📅 Daily reset disabled in settings");
      }
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
      const settings = await storage.getCompanySettings();
      
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
      const settings = await storage.getCompanySettings();
      if (!settings?.emailReportsEnabled || !settings?.reportRecipients?.length) {
        return;
      }
      
      const [currentVisitors, checkedInStaff, checkedInContractors] = await Promise.all([
        storage.getCurrentVisitors(),
        storage.getCheckedInStaff(),
        storage.getCheckedInContractors()
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
      
      const totalOvernight = overnightVisitors.length + overnightStaff.length + overnightContractors.length;
      
      if (totalOvernight === 0) {
        console.log("📧 No overnight check-outs detected - no email sent");
        return;
      }
      
      const { EmailService } = await import("./emailService");
      const emailService = new EmailService();
      
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
      
      message += `
        RECOMMENDED ACTIONS:
        • Contact personnel to verify their status
        • Check out manually if they have left the premises
        • Update security logs as needed
        • Consider running a manual daily reset if appropriate
        
        Report generated: ${new Date().toLocaleString()}
        
        This is an automated notification from VisiGate Pro.
      `;
      
      // Send to all report recipients
      let sentCount = 0;
      for (const email of settings.reportRecipients) {
        try {
          await emailService.sendPlainEmail(email, subject, message);
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
  async function sendGracePeriodNotification(gracePeriodMinutes: number) {
    try {
      const settings = await storage.getCompanySettings();
      if (!settings?.notifyForgottenCheckouts || !settings?.emailReportsEnabled) {
        return;
      }
      
      const [currentVisitors, checkedInStaff, checkedInContractors] = await Promise.all([
        storage.getCurrentVisitors(),
        storage.getCheckedInStaff(),
        storage.getCheckedInContractors()
      ]);
      
      const totalPersonnel = currentVisitors.length + checkedInStaff.length + checkedInContractors.length;
      
      if (totalPersonnel === 0) {
        return; // No one to notify
      }
      
      const { EmailService } = await import("./emailService");
      const emailService = new EmailService();
      
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

      await storage.resetWorkerCardStatus(workerId, newStatus, userId);
      
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

  // Induction Settings Management API Routes
  app.get('/api/induction/settings', requireAuth, async (req, res) => {
    try {
      const settings = await db.select().from(inductionSettings).orderBy(inductionSettings.roleType);
      res.json({ settings });
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

  // Get role-specific questions
  app.get('/api/induction/questions/:roleType', async (req, res) => {
    try {
      const { roleType } = req.params;
      const questions = await db
        .select()
        .from(inductionQuestions)
        .where(and(
          eq(inductionQuestions.roleType, roleType),
          eq(inductionQuestions.isActive, true)
        ))
        .orderBy(inductionQuestions.orderIndex);
      
      res.json({ questions });
    } catch (error) {
      console.error('Error fetching role-specific questions:', error);
      res.status(500).json({ error: 'Failed to fetch questions' });
    }
  });

  // AI Video Generation Routes
  app.post('/api/induction/generate-video/:roleType', requireAuth, async (req, res) => {
    try {
      const { roleType } = req.params;
      const { VideoGenerationService } = await import('./videoGenerationService');
      
      // Validate role type
      if (!['visitor', 'staff', 'contractor'].includes(roleType)) {
        return res.status(400).json({ error: 'Invalid role type' });
      }

      // Get company settings for AI configuration
      const settings = await storage.getCompanySettings();
      const videoService = new VideoGenerationService(settings);

      // Generate the video content
      const generatedContent = await videoService.generateVideoPresentation(roleType);
      
      // Update the settings with generated content
      await videoService.updateSettingsWithGeneratedContent(roleType, generatedContent);
      
      res.json({ 
        success: true, 
        message: 'AI-generated induction video created successfully',
        preview: {
          title: generatedContent.script.substring(0, 100) + '...',
          duration: Math.round(generatedContent.totalDuration / 60),
          scenes: generatedContent.scenes.length
        }
      });
      
    } catch (error) {
      console.error('Error generating AI video:', error);
      res.status(500).json({ error: 'Failed to generate AI induction video' });
    }
  });

  // Get AI-generated script for preview
  app.get('/api/induction/script/:roleType', requireAuth, async (req, res) => {
    try {
      const { roleType } = req.params;
      const { VideoGenerationService } = await import('./videoGenerationService');
      
      // Get company settings for AI configuration
      const settings = await storage.getCompanySettings();
      const videoService = new VideoGenerationService(settings);
      
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
        const settings = await storage.getCompanySettings();
        const videoService = new VideoGenerationService(settings);
        
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

  const httpServer = createServer(app);
  return httpServer;
}
