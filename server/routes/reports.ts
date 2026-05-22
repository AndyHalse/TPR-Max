import type { Express } from 'express';
import { logger } from '../utils/logger';
import { requireAuth } from '../auth';
import { databaseService } from '../databaseService';
import { simpleDatabaseService } from '../simpleDatabaseService';
import { customerDbService, CustomerDatabaseService } from '../customerDatabase';
import { EmailService, emailService } from '../emailService';
import * as isolatedSchema from '../isolatedSchema';
import { eq, sql, desc } from 'drizzle-orm';
import { db } from '../db';

export function registerReportRoutes(app: Express): void {

  // ===== TEST DATA ENDPOINTS =====

  // Reports endpoints
  // Generate test data for load testing
  // Clear duplicate visitors endpoint
  app.delete("/api/test-data/visitors/duplicates", requireAuth, async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ error: 'Not found' });
    }
    try {
      if (!['admin', 'hr_admin'].includes(req.user?.role || '')) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      logger.info(`🧹 Removing duplicate visitors for customer: ${context.customerId}`);
      
      const allVisitors = await databaseService.getAllVisitors(context);
      const uniqueVisitors = new Map();
      const duplicatesToRemove = [];

      logger.info(`🔍 Checking ${allVisitors.length} visitors for duplicates...`);
      
      for (const visitor of allVisitors) {
        if (!visitor.firstName || !visitor.lastName) {
          logger.info(`⚠️ Skipping visitor with missing name data: ${visitor.id}`);
          continue;
        }
        
        const nameKey = `${visitor.firstName.toLowerCase()}_${visitor.lastName.toLowerCase()}_${(visitor.company || '').toLowerCase()}`;
        logger.info(`🔍 Processing visitor: ${visitor.firstName} ${visitor.lastName} (${visitor.company || 'no company'}) - Key: "${nameKey}"`);
        
        if (uniqueVisitors.has(nameKey)) {
          const existing = uniqueVisitors.get(nameKey);
          logger.info(`🔍 Found duplicate! Existing: ${existing.checkedInAt}, Current: ${visitor.checkedInAt}`);
          
          if (new Date(visitor.checkedInAt) > new Date(existing.checkedInAt)) {
            duplicatesToRemove.push(existing.id);
            uniqueVisitors.set(nameKey, visitor);
            logger.info(`📋 Marking older duplicate for removal: ${existing.firstName} ${existing.lastName} (${existing.id})`);
          } else {
            duplicatesToRemove.push(visitor.id);
            logger.info(`📋 Marking newer duplicate for removal: ${visitor.firstName} ${visitor.lastName} (${visitor.id})`);
          }
        } else {
          uniqueVisitors.set(nameKey, visitor);
          logger.info(`✅ Added unique visitor: ${visitor.firstName} ${visitor.lastName}`);
        }
      }
      
      logger.info(`🔍 Found ${duplicatesToRemove.length} duplicates to remove`);

      let removedCount = 0;
      for (const visitorId of duplicatesToRemove) {
        try {
          await databaseService.deleteVisitor(context, visitorId);
          removedCount++;
          logger.info(`🗑️ Deleted duplicate visitor: ${visitorId}`);
        } catch (error) {
          logger.error(`❌ Failed to delete visitor ${visitorId}:`, error);
        }
      }

      logger.info(`✅ Duplicate cleanup complete: ${removedCount} duplicates removed, ${uniqueVisitors.size} unique visitors remaining`);

      res.json({ 
        success: true,
        message: `Removed ${removedCount} duplicate visitors`,
        duplicatesRemoved: removedCount,
        uniqueVisitorsRemaining: uniqueVisitors.size
      });
    } catch (error) {
      logger.error("Error removing duplicate visitors:", error);
      res.status(500).json({ error: "Failed to remove duplicate visitors" });
    }
  });

  app.post("/api/test-data/visitors", requireAuth, async (req, res) => {
    try {
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      logger.info(`🧪 Generating test visitors for customer: ${context.customerId}`);
      
      let staff = await databaseService.getAllStaff(context);
      
      if (staff.length === 0) {
        logger.info('No staff found, creating test staff first for customer:', context.customerId);
        const testStaff = [
          { firstName: 'Reception', lastName: 'Team', email: 'reception@company.com', department: 'Reception', phoneNumber: '01234 567890', employeeId: 'REC001' },
          { firstName: 'John', lastName: 'Manager', email: 'john.manager@company.com', department: 'Operations', phoneNumber: '01234 567891', employeeId: 'MGR001' },
          { firstName: 'Sarah', lastName: 'Director', email: 'sarah.director@company.com', department: 'Management', phoneNumber: '01234 567892', employeeId: 'DIR001' }
        ];
        
        for (const staffMember of testStaff) {
          await databaseService.createStaff(context, { ...staffMember, customerId: context.customerId });
        }
        
        staff = await databaseService.getAllStaff(context);
        logger.info(`Created ${staff.length} test staff members for customer ${context.customerId}`);
      }

      const existingVisitors = await databaseService.getAllVisitors(context);
      logger.info(`Found ${existingVisitors.length} existing visitors for customer ${context.customerId}`);
      
      const targetCount = 30;
      const toGenerate = targetCount;
      logger.info(`Will generate ${toGenerate} fresh test visitors for customer ${context.customerId}`);

      if (toGenerate > 0) {
        const testVisitorNames = [
          { firstName: 'John', lastName: 'Smith', company: 'Tech Solutions Ltd' },
          { firstName: 'Sarah', lastName: 'Johnson', company: 'Digital Dynamics' },
          { firstName: 'Michael', lastName: 'Brown', company: 'Innovation Hub' },
          { firstName: 'Emily', lastName: 'Davis', company: 'Future Systems' },
          { firstName: 'David', lastName: 'Wilson', company: 'Smart Solutions' },
          { firstName: 'Lisa', lastName: 'Taylor', company: 'Data Corp' },
          { firstName: 'James', lastName: 'Anderson', company: 'Cloud Services' },
          { firstName: 'Jennifer', lastName: 'Thomas', company: 'Tech Innovations' },
          { firstName: 'Robert', lastName: 'Jackson', company: 'Digital Solutions' },
          { firstName: 'Maria', lastName: 'White', company: 'Advanced Systems' },
          { firstName: 'Christopher', lastName: 'Harris', company: 'Modern Tech' },
          { firstName: 'Jessica', lastName: 'Martin', company: 'IT Consultancy' },
          { firstName: 'Matthew', lastName: 'Thompson', company: 'Software House' },
          { firstName: 'Ashley', lastName: 'Garcia', company: 'Tech Partners' },
          { firstName: 'Daniel', lastName: 'Martinez', company: 'Innovation Labs' },
          { firstName: 'Amanda', lastName: 'Robinson', company: 'Digital Agency' },
          { firstName: 'Joshua', lastName: 'Clark', company: 'Future Tech' },
          { firstName: 'Michelle', lastName: 'Rodriguez', company: 'Smart Corp' },
          { firstName: 'Andrew', lastName: 'Lewis', company: 'Tech Ventures' },
          { firstName: 'Stephanie', lastName: 'Lee', company: 'Data Solutions' },
          { firstName: 'Kenneth', lastName: 'Walker', company: 'Cloud Systems' },
          { firstName: 'Nicole', lastName: 'Hall', company: 'Digital Works' },
          { firstName: 'Ryan', lastName: 'Allen', company: 'Innovation Group' },
          { firstName: 'Rachel', lastName: 'Young', company: 'Tech Services' },
          { firstName: 'Brandon', lastName: 'Hernandez', company: 'Modern Solutions' },
          { firstName: 'Samantha', lastName: 'King', company: 'Advanced Tech' },
          { firstName: 'Justin', lastName: 'Wright', company: 'Software Solutions' },
          { firstName: 'Lauren', lastName: 'Lopez', company: 'Digital Innovations' },
          { firstName: 'Kevin', lastName: 'Hill', company: 'Tech Experts' },
          { firstName: 'Megan', lastName: 'Scott', company: 'Smart Technologies' }
        ];

        const departments = ['Engineering', 'Marketing', 'Sales', 'Operations', 'HR', 'Finance'];
        const purposes = ['Meeting', 'Interview', 'Consultation', 'Training', 'Presentation', 'Site Visit'];
        
        let generated = 0;
        for (let i = 0; i < Math.min(toGenerate, testVisitorNames.length); i++) {
          const visitor = testVisitorNames[i];
          const randomStaff = staff[Math.floor(Math.random() * staff.length)];
          const randomDepartment = departments[Math.floor(Math.random() * departments.length)];
          const randomPurpose = purposes[Math.floor(Math.random() * purposes.length)];
          
          const lastVisitDate = new Date();
          lastVisitDate.setDate(lastVisitDate.getDate() - Math.floor(Math.random() * 30));
          lastVisitDate.setHours(9 + Math.floor(Math.random() * 8));
          
          const newVisitor = {
            firstName: visitor.firstName,
            lastName: visitor.lastName,
            company: visitor.company,
            email: `${visitor.firstName.toLowerCase()}.${visitor.lastName.toLowerCase()}@${visitor.company.toLowerCase().replace(/\s+/g, '')}.com`,
            hostName: `${randomStaff.firstName} ${randomStaff.lastName}`,
            hostId: randomStaff.id,
            department: randomDepartment,
            purpose: randomPurpose,
            reason: randomPurpose,
            checkedInAt: lastVisitDate,
            checkedOutAt: new Date(lastVisitDate.getTime() + (2 + Math.random() * 6) * 60 * 60 * 1000),
            isCheckedIn: false,
            badgeNumber: `V${String(1000 + i).padStart(4, '0')}`,
            accessLevel: 'Visitor',
            status: 'inactive',
            customerId: context.customerId
          };

          await databaseService.createVisitor(context, newVisitor);
          generated++;
        }

        logger.info(`✅ Added ${generated} test visitors (not checked in) for customer ${context.customerId}`);
      } else {
        logger.info(`Skipping generation - already have ${existingVisitors.length} visitors, target is ${targetCount}`);
      }

      const allVisitors = await databaseService.getAllVisitors(context);
      const actualGenerated = toGenerate > 0 ? toGenerate : 0;
      res.json({ 
        success: true, 
        message: `Added ${actualGenerated} test visitors to Previous Visitors list (not checked in). Total visitors: ${allVisitors.length}`,
        visitors: allVisitors,
        existingCount: existingVisitors.length,
        targetCount: targetCount,
        generated: actualGenerated,
        customerId: context.customerId
      });
    } catch (error) {
      logger.error("Error generating test visitors:", error);
      res.status(500).json({ error: "Failed to generate test visitors" });
    }
  });

  // ===== REPORTS ENDPOINTS =====

  app.get("/api/reports", requireAuth, async (req, res) => {
    try {
      if (!req.user?.username) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const context = simpleDatabaseService.createCustomerContext(req.user.username, req.customerId);
      
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const customerReports = await custDb.select().from(isolatedSchema.reports);
      res.json(customerReports);
    } catch (error) {
      logger.error("Error fetching reports:", error);
      res.status(500).json({ error: "Failed to fetch reports" });
    }
  });

  app.post("/api/reports/generate", requireAuth, async (req, res) => {
    try {
      if (!req.user?.username) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const context = simpleDatabaseService.createCustomerContext(req.user.username, req.customerId);
      
      const { reportType, dateFrom, dateTo } = req.body;
      
      if (!reportType || !dateFrom || !dateTo) {
        return res.status(400).json({ error: "Report type and date range are required" });
      }

      const fromDate = new Date(dateFrom);
      const toDate = new Date(dateTo);
      
      let totalVisitors = "0";
      let avgDuration = "N/A";
      let snapshotData: string | null = null;

      if (['daily', 'weekly', 'monthly'].includes(reportType)) {
        const allVisitors = await databaseService.getAllVisitors(context);
        const visitorsInRange = allVisitors.filter(v => 
          v.checkedInAt >= fromDate && v.checkedInAt <= toDate
        );
        const checkedOutVisitors = visitorsInRange.filter(v => v.checkedOutAt);
        const totalDur = checkedOutVisitors.reduce((sum, visitor) => {
          if (visitor.checkedOutAt) {
            return sum + (visitor.checkedOutAt.getTime() - visitor.checkedInAt.getTime());
          }
          return sum;
        }, 0);
        const avgMs = checkedOutVisitors.length > 0 ? totalDur / checkedOutVisitors.length : 0;
        totalVisitors = visitorsInRange.length.toString();
        avgDuration = `${(avgMs / (1000 * 60 * 60)).toFixed(1)}h`;
      } else if (reportType === 'staff_attendance') {
        const allStaff = await databaseService.getAllStaff(context);
        totalVisitors = allStaff.length.toString();
        const checkedIn = allStaff.filter(s => s.isCheckedIn).length;
        avgDuration = `${checkedIn} on-site`;
      } else if (reportType === 'contractor_activity') {
        const companies = await databaseService.getAllContractorCompanies(context);
        const workers = await databaseService.getAllContractorWorkers(context);
        totalVisitors = `${companies.length} companies, ${workers.length} workers`;
        const checkedIn = workers.filter(w => w.isCheckedIn).length;
        avgDuration = `${checkedIn} on-site`;
      } else if (reportType === 'contractor_compliance') {
        const workers = await databaseService.getAllContractorWorkers(context);
        const compliant = workers.filter(w => w.inductionCompleted && w.rightToWork === 'valid').length;
        totalVisitors = `${workers.length} workers`;
        avgDuration = `${Math.round((compliant / Math.max(workers.length, 1)) * 100)}% compliant`;
      } else if (reportType === 'site_headcount') {
        const checkedInStaff = await databaseService.getCheckedInStaff(context);
        const currentVisitors = await databaseService.getCurrentVisitors(context);
        const checkedInContractors = await databaseService.getCheckedInContractors(context);
        const total = checkedInStaff.length + currentVisitors.length + checkedInContractors.length;
        totalVisitors = `${total} on-site`;
        avgDuration = `${checkedInStaff.length}S / ${currentVisitors.length}V / ${checkedInContractors.length}C`;
      } else if (reportType === 'evacuation_readiness') {
        const allStaff = await databaseService.getAllStaff(context);
        const fireMarshals = allStaff.filter(s => s.isFireMarshal);
        const checkedInStaff = await databaseService.getCheckedInStaff(context);
        const currentVisitors = await databaseService.getCurrentVisitors(context);
        const checkedInContractors = await databaseService.getCheckedInContractors(context);
        const total = checkedInStaff.length + currentVisitors.length + checkedInContractors.length;
        totalVisitors = `${total} on-site`;
        avgDuration = `${fireMarshals.length} fire marshals`;
      } else if (reportType === 'compliance_gap') {
        const companies = await databaseService.getAllContractorCompanies(context);
        const GAP_DOCS = ['publicLiability', 'employersLiability', 'healthSafety', 'cisRegistration'] as const;
        const withGaps = companies.filter(c => {
          const ds = c.documentsStatus;
          if (!ds) return true;
          return GAP_DOCS.some(k => ds[k] === 'missing' || ds[k] === 'expired');
        });
        totalVisitors = `${companies.length} contractors`;
        avgDuration = `${withGaps.length} with gaps`;
        snapshotData = JSON.stringify({ type: 'compliance_gap', companies });
      }
      
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [report] = await custDb.insert(isolatedSchema.reports)
        .values({
          reportType,
          dateFrom: fromDate,
          dateTo: toDate,
          totalVisitors,
          avgDuration,
          emailSent: false,
          emailSentAt: null,
          ...(snapshotData ? { data: snapshotData } : {}),
        })
        .returning();
      
      res.json(report);
    } catch (error) {
      logger.error("Error generating report:", error);
      res.status(500).json({ error: "Failed to generate report" });
    }
  });

  app.post("/api/reports/:id/email", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { recipients } = req.body;
      
      if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
        return res.status(400).json({ error: "Valid recipients are required" });
      }
      
      if (!req.user?.username) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const context = simpleDatabaseService.createCustomerContext(req.user.username, req.customerId);
      
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const customerReports = await custDb.select().from(isolatedSchema.reports);
      const report = customerReports.find(r => r.id === id);
      
      const settings = await simpleDatabaseService.getCompanySettings(context);
      
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }
      
      if (!settings) {
        return res.status(500).json({ error: "Company settings not found" });
      }
      
      const allStaff = await databaseService.getAllStaff(context);
      const allVisitors = await databaseService.getAllVisitors(context);
      
      let reportData: any = {};

      if (['daily', 'weekly', 'monthly'].includes(report.reportType)) {
        const visitorsInRange = allVisitors.filter(v => 
          v.checkedInAt >= report.dateFrom && v.checkedInAt <= report.dateTo
        );
        const enrichedVisitors = visitorsInRange.map(visitor => {
          const hostStaff = allStaff.find(s => s.id === visitor.hostStaffId);
          return { ...visitor, name: `${visitor.firstName} ${visitor.lastName}`.trim(), hostName: hostStaff ? `${hostStaff.firstName} ${hostStaff.lastName}` : 'N/A' };
        });
        reportData = { type: 'visitor_log', visitors: enrichedVisitors, checkedOutVisitors: enrichedVisitors.filter(v => v.checkedOutAt), staff: allStaff };
      } else if (report.reportType === 'staff_attendance') {
        reportData = { type: 'staff_attendance', staff: allStaff, checkedInStaff: allStaff.filter(s => s.isCheckedIn), departments: [...new Set(allStaff.map(s => s.department).filter(Boolean))] };
      } else if (report.reportType === 'contractor_activity') {
        const companies = await databaseService.getAllContractorCompanies(context);
        const workers = await databaseService.getAllContractorWorkers(context);
        reportData = { type: 'contractor_activity', companies, workers, checkedInWorkers: workers.filter(w => w.isCheckedIn) };
      } else if (report.reportType === 'contractor_compliance') {
        const companies = await databaseService.getAllContractorCompanies(context);
        const workers = await databaseService.getAllContractorWorkers(context);
        reportData = { type: 'contractor_compliance', companies, workers };
      } else if (report.reportType === 'site_headcount') {
        const checkedInStaff = await databaseService.getCheckedInStaff(context);
        const currentVisitors = await databaseService.getCurrentVisitors(context);
        const checkedInContractors = await databaseService.getCheckedInContractors(context);
        const enrichedVis = currentVisitors.map(v => { const host = allStaff.find(s => s.id === v.hostStaffId); return { ...v, hostName: host ? `${host.firstName} ${host.lastName}` : '-' }; });
        reportData = { type: 'site_headcount', staff: checkedInStaff, visitors: enrichedVis, contractors: checkedInContractors };
      } else if (report.reportType === 'evacuation_readiness') {
        const checkedInStaff = await databaseService.getCheckedInStaff(context);
        const currentVisitors = await databaseService.getCurrentVisitors(context);
        const checkedInContractors = await databaseService.getCheckedInContractors(context);
        const fireMarshals = allStaff.filter(s => s.isFireMarshal);
        reportData = { type: 'evacuation_readiness', allStaff, fireMarshals, checkedInStaff, visitors: currentVisitors, contractors: checkedInContractors };
      } else if (report.reportType === 'compliance_gap') {
        if (report.data) {
          reportData = JSON.parse(report.data);
        } else {
          const companies = await databaseService.getAllContractorCompanies(context);
          reportData = { type: 'compliance_gap', companies };
        }
      } else {
        reportData = { type: 'visitor_log', visitors: allVisitors, checkedOutVisitors: allVisitors.filter(v => v.checkedOutAt), staff: allStaff };
      }
      
      const emailSvc = new EmailService(req.customerId);
      const emailSent = await emailSvc.sendReport(report, settings, recipients, reportData);
      
      if (emailSent) {
        await custDb.update(isolatedSchema.reports)
          .set({ emailSent: true, emailSentAt: new Date() })
          .where(eq(isolatedSchema.reports.id, id));
      }
      
      res.json({ success: emailSent });
    } catch (error) {
      logger.error("Error sending report email:", error);
      res.status(500).json({ error: "Failed to send report email" });
    }
  });

  // Add route for viewing reports
  app.get("/api/reports/:id/view", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      
      if (!req.user?.username) {
        return res.status(401).send("<h1>Unauthorized</h1><p>Please log in to view this report.</p>");
      }
      const context = simpleDatabaseService.createCustomerContext(req.user.username, req.customerId);
      
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const customerReports = await custDb.select().from(isolatedSchema.reports);
      const report = customerReports.find(r => r.id === id);
      
      const settings = await simpleDatabaseService.getCompanySettings(context);
      
      if (!report) {
        return res.status(404).send("<h1>Report Not Found</h1><p>The requested report could not be found.</p>");
      }
      
      const allStaff = await databaseService.getAllStaff(context);
      const allVisitors = await databaseService.getAllVisitors(context);
      
      let reportData: any = {};

      if (['daily', 'weekly', 'monthly'].includes(report.reportType)) {
        const visitorsInRange = allVisitors.filter(v => 
          v.checkedInAt >= report.dateFrom && v.checkedInAt <= report.dateTo
        );
        const enrichedVisitors = visitorsInRange.map(visitor => {
          const hostStaff = allStaff.find(s => s.id === visitor.hostStaffId);
          return {
            ...visitor,
            name: `${visitor.firstName} ${visitor.lastName}`.trim(),
            hostName: hostStaff ? `${hostStaff.firstName} ${hostStaff.lastName}` : 'N/A'
          };
        });
        reportData = {
          type: 'visitor_log',
          visitors: enrichedVisitors,
          checkedOutVisitors: enrichedVisitors.filter(v => v.checkedOutAt),
          staff: allStaff,
        };
      } else if (report.reportType === 'staff_attendance') {
        reportData = {
          type: 'staff_attendance',
          staff: allStaff,
          checkedInStaff: allStaff.filter(s => s.isCheckedIn),
          departments: [...new Set(allStaff.map(s => s.department).filter(Boolean))],
        };
      } else if (report.reportType === 'contractor_activity') {
        const companies = await databaseService.getAllContractorCompanies(context);
        const workers = await databaseService.getAllContractorWorkers(context);
        reportData = {
          type: 'contractor_activity',
          companies,
          workers,
          checkedInWorkers: workers.filter(w => w.isCheckedIn),
        };
      } else if (report.reportType === 'contractor_compliance') {
        const companies = await databaseService.getAllContractorCompanies(context);
        const workers = await databaseService.getAllContractorWorkers(context);
        reportData = {
          type: 'contractor_compliance',
          companies,
          workers,
        };
      } else if (report.reportType === 'site_headcount') {
        const checkedInStaff = await databaseService.getCheckedInStaff(context);
        const currentVisitors = await databaseService.getCurrentVisitors(context);
        const checkedInContractors = await databaseService.getCheckedInContractors(context);
        const enrichedVisitors = currentVisitors.map(v => {
          const host = allStaff.find(s => s.id === v.hostStaffId);
          return { ...v, hostName: host ? `${host.firstName} ${host.lastName}` : '-' };
        });
        reportData = {
          type: 'site_headcount',
          staff: checkedInStaff,
          visitors: enrichedVisitors,
          contractors: checkedInContractors,
        };
      } else if (report.reportType === 'evacuation_readiness') {
        const checkedInStaff = await databaseService.getCheckedInStaff(context);
        const currentVisitors = await databaseService.getCurrentVisitors(context);
        const checkedInContractors = await databaseService.getCheckedInContractors(context);
        const fireMarshals = allStaff.filter(s => s.isFireMarshal);
        reportData = {
          type: 'evacuation_readiness',
          allStaff,
          fireMarshals,
          checkedInStaff,
          visitors: currentVisitors,
          contractors: checkedInContractors,
        };
      } else if (report.reportType === 'compliance_gap') {
        if (report.data) {
          reportData = JSON.parse(report.data);
        } else {
          const companies = await databaseService.getAllContractorCompanies(context);
          reportData = { type: 'compliance_gap', companies };
        }
      } else {
        const visitorsInRange = allVisitors.filter(v => 
          v.checkedInAt >= report.dateFrom && v.checkedInAt <= report.dateTo
        );
        reportData = {
          type: 'visitor_log',
          visitors: visitorsInRange,
          checkedOutVisitors: visitorsInRange.filter(v => v.checkedOutAt),
          staff: allStaff,
        };
      }
      
      const emailSvc = new EmailService(req.customerId);
      const html = (emailSvc as any).generateReportHTML(report, reportData, settings?.companyName || 'TPR Max');
      
      res.send(html);
    } catch (error) {
      logger.error("Error viewing report:", error);
      res.status(500).send("<h1>Error</h1><p>Failed to load report.</p>");
    }
  });

  // Delete a single report
  app.delete("/api/reports/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      if (!req.user?.username) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const context = simpleDatabaseService.createCustomerContext(req.user.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [deleted] = await custDb.delete(isolatedSchema.reports)
        .where(eq(isolatedSchema.reports.id, id))
        .returning();
      if (!deleted) {
        return res.status(404).json({ error: "Report not found" });
      }
      res.json({ success: true });
    } catch (error) {
      logger.error("Error deleting report:", error);
      res.status(500).json({ error: "Failed to delete report" });
    }
  });

  // Clear all reports for the current customer
  app.delete("/api/reports", requireAuth, async (req, res) => {
    try {
      if (!['admin', 'hr_admin'].includes(req.user?.role || '')) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      if (!req.user?.username) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const context = simpleDatabaseService.createCustomerContext(req.user.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      await custDb.delete(isolatedSchema.reports);
      res.json({ success: true });
    } catch (error) {
      logger.error("Error clearing reports:", error);
      res.status(500).json({ error: "Failed to clear reports" });
    }
  });

  app.post("/api/test-email", requireAuth, async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email address is required" });
      }
      
      const { simpleDatabaseService: sdsLocal } = await import("../simpleDatabaseService");
      const { CustomerDatabaseService: CDSLocal } = await import("../customerDatabase.js");
      const nodemailer = await import("nodemailer");
      
      const username = req.user!.username;
      const context = sdsLocal.createCustomerContext(username, req.customerId);
      const schemaName = CDSLocal.getInstance().generateSchemaName(req.customerId);
      const customerDb = await CDSLocal.getInstance().getCustomerDatabase(req.customerId);
      
      const rawResult = await customerDb.execute(sql`
        SELECT smtp_host, smtp_port, smtp_security, smtp_username, smtp_password,
               smtp_from_email, smtp_from_name, smtp_reply_to, smtp_auth_method, smtp_connection_timeout
        FROM ${sql.identifier(schemaName)}.company_settings LIMIT 1
      `);
      
      if (!rawResult.rows || rawResult.rows.length === 0) {
        return res.json({ success: false, error: "No SMTP settings found. Please configure your email settings first." });
      }
      
      const row = rawResult.rows[0] as any;
      const smtpHost = row.smtp_host || "";
      const smtpPort = parseInt(row.smtp_port || "587", 10);
      const smtpSecurity = row.smtp_security || "STARTTLS";
      const smtpUsername = row.smtp_username || "";
      const smtpPassword = row.smtp_password || "";
      const smtpFromEmail = row.smtp_from_email || smtpUsername;
      const smtpFromName = row.smtp_from_name || "TPR-Max";
      const smtpReplyTo = row.smtp_reply_to || smtpFromEmail;
      const connectionTimeout = parseInt(row.smtp_connection_timeout || "30", 10) * 1000;
      
      if (!smtpHost) {
        return res.json({ success: false, error: "SMTP host is not configured. Please enter your mail server address." });
      }
      if (!smtpUsername) {
        return res.json({ success: false, error: "SMTP username is not configured." });
      }
      if (!smtpPassword) {
        return res.json({ success: false, error: "SMTP password is not configured." });
      }
      
      const secure = smtpSecurity === "SSL/TLS" || smtpPort === 465;
      const requireTLS = smtpSecurity === "STARTTLS";
      
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure,
        requireTLS,
        auth: { user: smtpUsername, pass: smtpPassword },
        connectionTimeout,
        greetingTimeout: Math.min(connectionTimeout, 15000),
        socketTimeout: connectionTimeout,
        tls: { rejectUnauthorized: false },
      });
      
      try {
        await transporter.verify();
      } catch (verifyError: any) {
        const msg = verifyError?.message || String(verifyError);
        let friendly = "Connection failed";
        if (/auth|credential|user|pass|login|535|534|530/i.test(msg)) {
          friendly = "Authentication failed — check your username and password";
        } else if (/ECONNREFUSED|connect/i.test(msg)) {
          friendly = `Cannot connect to ${smtpHost}:${smtpPort} — check the host and port`;
        } else if (/ENOTFOUND|getaddrinfo/i.test(msg)) {
          friendly = `Host not found: ${smtpHost} — check the SMTP server address`;
        } else if (/timeout/i.test(msg)) {
          friendly = `Connection timed out to ${smtpHost}:${smtpPort}`;
        } else if (/certificate|TLS|SSL/i.test(msg)) {
          friendly = "TLS/SSL certificate error — try changing the security setting";
        }
        logger.error(`📧 SMTP verify failed for customer ${req.customerId}: ${msg}`);
        return res.json({ success: false, error: friendly });
      }
      
      try {
        await transporter.sendMail({
          from: `${smtpFromName} <${smtpFromEmail}>`,
          replyTo: smtpReplyTo || smtpFromEmail,
          to: email,
          subject: "TPR-Max — Test Email",
          text: "This is a test email from TPR-Max. Your email configuration is working correctly.",
          html: "<h2>Test Email</h2><p>Your TPR-Max email configuration is working correctly.</p>",
        });
      } catch (sendError: any) {
        const msg = sendError?.message || String(sendError);
        logger.error(`📧 SMTP send failed for customer ${req.customerId}: ${msg}`);
        return res.json({ success: false, error: `Connected OK but failed to send: ${msg}` });
      }
      
      await sdsLocal.updateCompanySettings(context, {
        smtpLastTested: new Date(),
        smtpTestEmailSent: true
      });
      
      logger.info(`📧 Test email sent successfully for customer: ${req.customerId} → ${email}`);
      res.json({ success: true });
    } catch (error: any) {
      logger.error("Error in test-email route:", error);
      res.status(500).json({ success: false, error: error?.message || "Unexpected server error" });
    }
  });

  // Send manual visitor report endpoint
  app.post("/api/reports/send", requireAuth, async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email address required" });
      }

      logger.info(`Sending visitor report to: ${email}`);

      const reportEmailContext = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const stats = await databaseService.getStats(reportEmailContext);
      const currentVisitors = await databaseService.getCurrentVisitors(reportEmailContext);
      const staff = await databaseService.getAllStaff(reportEmailContext);
      const context = reportEmailContext;
      
      const companySettings = await simpleDatabaseService.getCompanySettings(context);
      
      const reportData = {
        visitors: currentVisitors,
        staff,
        checkedOutVisitors: [],
        stats,
        reportDate: new Date().toLocaleDateString('en-GB'),
        reportTime: new Date().toLocaleTimeString('en-GB')
      };

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

      logger.info('Sending email with report data:', { totalVisitors: report.totalVisitors, currentVisitors: currentVisitors.length });

      const emailSent = await emailService.forCustomer(req.customerId).sendReport(
        report,
        companySettings!,
        [email],
        reportData
      );

      if (emailSent) {
        logger.info(`Report email sent successfully to ${email}`);
        res.json({ 
          success: true, 
          message: `Visitor report sent successfully to ${email}`,
          reportId: report.id
        });
      } else {
        logger.info(`Failed to send report email to ${email}`);
        res.status(500).json({ error: "Failed to send report email" });
      }
      
    } catch (error) {
      logger.error("Error sending report:", error);
      res.status(500).json({ error: "Failed to send visitor report" });
    }
  });

  // =====================================================
  // EMAIL OUTBOX ROUTES
  // =====================================================

  app.get("/api/email-log", requireAuth, async (req, res) => {
    try {
      if (!req.customerId) return res.status(401).json({ error: 'Not authenticated' });
      const customerDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(req.customerId);
      const settings = await customerDb.select().from(isolatedSchema.companySettings).limit(1);
      if (!settings[0]?.featureEmailOutbox) {
        return res.status(403).json({ error: 'Email Outbox feature is not enabled' });
      }
      const emails = await customerDb
        .select({
          id: isolatedSchema.emailLog.id,
          sentAt: isolatedSchema.emailLog.sentAt,
          recipientEmail: isolatedSchema.emailLog.recipientEmail,
          subject: isolatedSchema.emailLog.subject,
          emailType: isolatedSchema.emailLog.emailType,
          status: isolatedSchema.emailLog.status,
        })
        .from(isolatedSchema.emailLog)
        .orderBy(desc(isolatedSchema.emailLog.sentAt))
        .limit(200);
      res.json({ emails, total: emails.length });
    } catch (error: any) {
      logger.error('Error fetching email log:', error);
      res.status(500).json({ error: 'Failed to fetch email log', details: error.message });
    }
  });

  app.get("/api/email-log/:id", requireAuth, async (req, res) => {
    try {
      if (!req.customerId) return res.status(401).json({ error: 'Not authenticated' });
      const customerDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(req.customerId);
      const settings = await customerDb.select().from(isolatedSchema.companySettings).limit(1);
      if (!settings[0]?.featureEmailOutbox) {
        return res.status(403).json({ error: 'Email Outbox feature is not enabled' });
      }
      const rows = await customerDb
        .select()
        .from(isolatedSchema.emailLog)
        .where(eq(isolatedSchema.emailLog.id, req.params.id))
        .limit(1);
      if (!rows[0]) return res.status(404).json({ error: 'Email log entry not found' });
      res.json(rows[0]);
    } catch (error: any) {
      logger.error('Error fetching email log entry:', error);
      res.status(500).json({ error: 'Failed to fetch email log entry', details: error.message });
    }
  });

  app.delete("/api/email-log/clear", requireAuth, async (req, res) => {
    try {
      if (!req.customerId) return res.status(401).json({ error: 'Not authenticated' });
      const customerDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(req.customerId);
      const settings = await customerDb.select().from(isolatedSchema.companySettings).limit(1);
      if (!settings[0]?.featureEmailOutbox) {
        return res.status(403).json({ error: 'Email Outbox feature is not enabled' });
      }
      await customerDb.delete(isolatedSchema.emailLog);
      res.json({ deleted: true });
    } catch (error: any) {
      logger.error('Error clearing email log:', error);
      res.status(500).json({ error: 'Failed to clear email log', details: error.message });
    }
  });

  // ===== DIAGNOSTICS ENDPOINTS =====

  // Diagnostic report endpoint — returns sanitised system info for customer support
  app.get("/api/diagnostics/report", requireAuth, async (req, res) => {
    try {
      const { simpleDatabaseService: sds } = await import("../simpleDatabaseService");
      const username = req.user!.username;
      const context = sds.createCustomerContext(username, req.customerId);
      const settings = await sds.getCompanySettings(context);

      let dbOk = false;
      try {
        await sds.getCompanySettings(context);
        dbOk = true;
      } catch {}

      const emailConfigured = !!(
        (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) ||
        (settings?.smtpHost && settings?.smtpUsername && settings?.smtpPassword)
      );

      const uptimeSec = Math.floor(process.uptime());
      const uptimeStr = `${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m ${uptimeSec % 60}s`;

      const report = {
        generatedAt: new Date().toISOString(),
        appName: "TPR Max",
        version: "v2026.02.26",
        companyName: settings?.companyName ?? "Unknown",
        customerId: req.customerId,
        loggedInUser: req.user!.username,
        serverUptime: uptimeStr,
        nodeVersion: process.version,
        environment: process.env.NODE_ENV ?? "unknown",
        services: {
          database: dbOk,
          email: emailConfigured,
          authentication: true,
        },
        memoryMB: {
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        },
      };

      res.json(report);
    } catch (error) {
      logger.error("Diagnostics report failed:", error);
      res.status(500).json({ error: "Failed to generate diagnostics report" });
    }
  });

  // Diagnostic endpoint for debugging production environment issues
  app.get("/api/diagnostics/environment", async (req, res) => {
    try {
      const diagnostics: any = {
        environment: {
          NODE_ENV: process.env.NODE_ENV || 'not set (defaults to development)',
          has_DATABASE_URL: !!process.env.DATABASE_URL,
          DEV_AUTH_BYPASS: process.env.DEV_AUTH_BYPASS || 'not set',
        },
        session: {
          authenticated: !!req.user,
          userId: req.userId || 'not set',
          customerId: req.customerId || 'not set',
          companyName: req.user?.companyName || 'not set',
          username: req.user?.username || 'not set',
        },
        timestamp: new Date().toISOString()
      };

      if (req.customerId) {
        try {
          const bookingsCount = await db
            .select({ count: sql`count(*)` })
            .from(isolatedSchema.roomBookings);
          
          diagnostics.database = {
            customerId: req.customerId,
            roomBookingsCount: Number(bookingsCount[0]?.count || 0)
          };
        } catch (dbError: any) {
          diagnostics.database = {
            error: 'Failed to query database',
            message: dbError.message
          };
        }
      }

      res.json(diagnostics);
    } catch (error: any) {
      res.status(500).json({ 
        error: 'Diagnostics failed', 
        details: error.message 
      });
    }
  });

}
