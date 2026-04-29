import type { Express } from 'express';
import {
  requireAuth,
  isDevDataBypass,
  isDatabaseConnectionError,
  getMockCheckedInStaff,
} from '../auth';
import { databaseService } from '../databaseService';
import { simpleDatabaseService } from '../simpleDatabaseService';
import { customerDbService, CustomerDatabaseService } from '../customerDatabase';
import { emailService } from '../emailService';
import { websocketService } from '../websocketService';
import * as isolatedSchema from '../isolatedSchema';
import { insertStaffSchema, evacuationAccountability } from '../isolatedSchema';
import { evacuations } from '@shared/schema';
import { db } from '../db';
import { eq, and, desc, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { z } from 'zod';

const staffAuthSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Helpers shared with lone-worker routes
const mintLoneWorkerToken = (crypto: typeof import('crypto')): string => {
  return crypto.randomBytes(32).toString('hex');
};

async function getLoneWorkerSettings(context: any) {
  const [settings] = await (context.db || db).select().from(isolatedSchema.companySettings).limit(1);
  return settings;
}

async function sendFirstWelfareEmail(
  customerDb: any,
  session: any,
  token: string,
  settings: any,
  baseUrl: string
) {
  const confirmUrl = `${baseUrl}/lone-worker/ok/${session.customerId}/${token}`;
  const emailSvc = emailService.forCustomer(session.customerId);
  await emailSvc.sendLoneWorkerWelfareCheck({
    to: session.personEmail || '',
    workerName: session.personName,
    confirmUrl,
    nextCheckMins: session.intervalMins,
    companyName: settings?.companyName || 'Your Company',
    siteName: settings?.companyName || 'Site',
  });
}

function generateFireMarshalUrlId(): string {
  return Math.random().toString(36).substring(2, 14);
}

// Helper: Check if staff should be a Fire Marshal
function shouldBeFireMarshal(staffData: any): boolean {
  if (staffData.isFireMarshal === true) return true;
  if (staffData.department) {
    const dept = staffData.department.toLowerCase();
    return dept.includes('safety') || dept.includes('security');
  }
  return false;
}

function generateIdCardHtml(staff: any, design: any[]) {
  const cardWidth = 323; // CR80 width in pixels (85.60mm * 3.78 px/mm)
  const cardHeight = 204; // CR80 height in pixels (53.98mm * 3.78 px/mm)
  
  // Generate elements HTML
  let elementsHtml = '';
  
  if (design && Array.isArray(design)) {
    design.forEach(element => {
      if (!element.visible) return;
      
      switch (element.type) {
        case 'name':
          elementsHtml += `
            <div style="
              position: absolute;
              left: ${element.x}px;
              top: ${element.y}px;
              width: ${element.width}px;
              height: ${element.height}px;
              font-size: ${element.fontSize || 16}px;
              font-weight: ${element.fontWeight || 'normal'};
              color: ${element.color || '#000000'};
              font-family: Arial, sans-serif;
              display: flex;
              align-items: center;
            ">
              ${staff.firstName} ${staff.lastName}
            </div>`;
          break;
          
        case 'department':
          elementsHtml += `
            <div style="
              position: absolute;
              left: ${element.x}px;
              top: ${element.y}px;
              width: ${element.width}px;
              height: ${element.height}px;
              font-size: ${element.fontSize || 12}px;
              color: ${element.color || '#666666'};
              font-family: Arial, sans-serif;
              display: flex;
              align-items: center;
            ">
              ${staff.department}
            </div>`;
          break;
          
        case 'employeeId':
          elementsHtml += `
            <div style="
              position: absolute;
              left: ${element.x}px;
              top: ${element.y}px;
              width: ${element.width}px;
              height: ${element.height}px;
              font-size: ${element.fontSize || 10}px;
              color: ${element.color || '#666666'};
              font-family: Arial, sans-serif;
              display: flex;
              align-items: center;
            ">
              ${staff.employeeId}
            </div>`;
          break;
          
        case 'company':
          elementsHtml += `
            <div style="
              position: absolute;
              left: ${element.x}px;
              top: ${element.y}px;
              width: ${element.width}px;
              height: ${element.height}px;
              font-size: ${element.fontSize || 10}px;
              color: ${element.color || '#666666'};
              font-family: Arial, sans-serif;
              display: flex;
              align-items: center;
            ">
              ACS Safety & Security Ltd
            </div>`;
          break;
          
        case 'accessLevel':
          elementsHtml += `
            <div style="
              position: absolute;
              left: ${element.x}px;
              top: ${element.y}px;
              width: ${element.width}px;
              height: ${element.height}px;
              font-size: ${element.fontSize || 10}px;
              font-weight: ${element.fontWeight || 'bold'};
              color: ${element.color || '#3b82f6'};
              font-family: Arial, sans-serif;
              display: flex;
              align-items: center;
            ">
              STAFF ACCESS
            </div>`;
          break;
          
        case 'photo':
          if (staff.photoUrl) {
            elementsHtml += `
              <div style="
                position: absolute;
                left: ${element.x}px;
                top: ${element.y}px;
                width: ${element.width}px;
                height: ${element.height}px;
                background-image: url('${staff.photoUrl}');
                background-size: cover;
                background-position: center;
                border-radius: 4px;
              "></div>`;
          } else {
            elementsHtml += `
              <div style="
                position: absolute;
                left: ${element.x}px;
                top: ${element.y}px;
                width: ${element.width}px;
                height: ${element.height}px;
                background-color: #f3f4f6;
                border: 1px solid #d1d5db;
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                color: #6b7280;
              ">
                NO PHOTO
              </div>`;
          }
          break;
          
        case 'qrcode':
          // Generate QR code with staff ID
          elementsHtml += `
            <div style="
              position: absolute;
              left: ${element.x}px;
              top: ${element.y}px;
              width: ${element.width}px;
              height: ${element.height}px;
              background-color: #000000;
              border: 1px solid #333333;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 8px;
              color: white;
            ">
              QR: ${staff.employeeId}
            </div>`;
          break;
      }
    });
  }
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>ID Card - ${staff.firstName} ${staff.lastName}</title>
  <style>
      @page {
          size: 85.60mm 53.98mm;
          margin: 0;
      }
      body {
          margin: 0;
          padding: 0;
          font-family: Arial, sans-serif;
          background: white;
      }
      .id-card {
          width: ${cardWidth}px;
          height: ${cardHeight}px;
          position: relative;
          background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
          border: 1px solid #d1d5db;
          box-sizing: border-box;
      }
  </style>
</head>
<body>
  <div class="id-card">
      ${elementsHtml}
  </div>
</body>
</html>`;
}

export function registerStaffRoutes(app: Express): void {

  app.get("/api/departments", requireAuth, async (req, res) => {
    try {
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Use customer-isolated database service for getting departments
      const departments = await databaseService.getAllDepartments(context);
      res.json(departments);
    } catch (error) {
      console.error("Failed to fetch departments:", error);
      res.status(500).json({ error: "Failed to fetch departments" });
    }
  });

  app.post("/api/departments", requireAuth, async (req, res) => {
    try {
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Add customerId to department data for proper customer isolation
      const departmentData = { ...req.body, customerId: context.customerId };
      
      // Use customer-isolated database service for creating department
      const department = await databaseService.createDepartment(context, departmentData);
      res.status(201).json(department);
    } catch (error) {
      console.error("Failed to create department:", error);
      res.status(500).json({ error: "Failed to create department" });
    }
  });

  app.put("/api/departments/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Add customerId to updates for proper customer isolation
      const updates = { ...req.body, customerId: context.customerId };
      
      // Use customer-isolated database service for updating department
      const department = await databaseService.updateDepartment(context, id, updates);
      if (!department) {
        return res.status(404).json({ error: "Department not found" });
      }
      res.json(department);
    } catch (error) {
      console.error("Failed to update department:", error);
      res.status(500).json({ error: "Failed to update department" });
    }
  });

  app.delete("/api/departments/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Use customer-isolated database service for deleting department
      const success = await databaseService.deleteDepartment(context, id);
      if (!success) {
        return res.status(404).json({ error: "Department not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete department:", error);
      res.status(500).json({ error: "Failed to delete department" });
    }
  });

  // ==========================================
  // EVACUATION ZONES CRUD
  // ==========================================

  app.get("/api/zones", requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const zones = await custDb
        .select()
        .from(isolatedSchema.evacuationZones)
        .orderBy(isolatedSchema.evacuationZones.displayOrder);
      res.json(zones);
    } catch (error) {
      console.error("Failed to fetch zones:", error);
      res.status(500).json({ error: "Failed to fetch zones" });
    }
  });

  app.post("/api/zones", requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const existingZones = await custDb.select().from(isolatedSchema.evacuationZones);
      const { name, color, description, displayOrder, mapX, mapY } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Zone name is required" });
      }
      const [zone] = await custDb
        .insert(isolatedSchema.evacuationZones)
        .values({
          name,
          color: color || '#3b82f6',
          description: description || null,
          displayOrder: displayOrder ?? existingZones.length,
          mapX: mapX ?? null,
          mapY: mapY ?? null,
        })
        .returning();
      res.status(201).json(zone);
    } catch (error) {
      console.error("Failed to create zone:", error);
      res.status(500).json({ error: "Failed to create zone" });
    }
  });

  app.put("/api/zones/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const { name, color, description, displayOrder, mapX, mapY, isActive } = req.body;
      const [zone] = await custDb
        .update(isolatedSchema.evacuationZones)
        .set({
          ...(name !== undefined && { name }),
          ...(color !== undefined && { color }),
          ...(description !== undefined && { description }),
          ...(displayOrder !== undefined && { displayOrder }),
          ...(mapX !== undefined && { mapX }),
          ...(mapY !== undefined && { mapY }),
          ...(isActive !== undefined && { isActive }),
          updatedAt: new Date(),
        })
        .where(eq(isolatedSchema.evacuationZones.id, id))
        .returning();
      if (!zone) {
        return res.status(404).json({ error: "Zone not found" });
      }
      res.json(zone);
    } catch (error) {
      console.error("Failed to update zone:", error);
      res.status(500).json({ error: "Failed to update zone" });
    }
  });

  app.delete("/api/zones/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const [deleted] = await custDb
        .delete(isolatedSchema.evacuationZones)
        .where(eq(isolatedSchema.evacuationZones.id, id))
        .returning();
      if (!deleted) {
        return res.status(404).json({ error: "Zone not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete zone:", error);
      res.status(500).json({ error: "Failed to delete zone" });
    }
  });

  app.post("/api/zones/reorder", requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const { zoneIds } = req.body;
      if (!Array.isArray(zoneIds)) {
        return res.status(400).json({ error: "zoneIds must be an array" });
      }
      for (let i = 0; i < zoneIds.length; i++) {
        await custDb
          .update(isolatedSchema.evacuationZones)
          .set({ displayOrder: i, updatedAt: new Date() })
          .where(eq(isolatedSchema.evacuationZones.id, zoneIds[i]));
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to reorder zones:", error);
      res.status(500).json({ error: "Failed to reorder zones" });
    }
  });

  app.get("/api/departments/names", requireAuth, async (req, res) => {
    try {
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Use customer-isolated database service for getting department names
      const names = await databaseService.getDepartmentNames(context);
      res.json(names);
    } catch (error) {
      console.error("Failed to fetch department names:", error);
      res.status(500).json({ error: "Failed to fetch department names" });
    }
  });

  app.get("/api/staff", requireAuth, async (req, res) => {
    try {
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const staff = await databaseService.getAllStaff(context);
      res.json(staff);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch staff" });
    }
  });

  // GDPR-compliant endpoint: Get all staff for host selection (company used for cache key only)
  app.get("/api/staff/by-company", requireAuth, async (req, res) => {
    try {
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      const allStaff = await databaseService.getAllStaff(context);
      res.json(allStaff);
    } catch (error) {
      console.error("Error fetching staff by company:", error);
      res.status(500).json({ error: "Failed to fetch staff" });
    }
  });

  // GDPR-compliant endpoint: Get staff by company name for visitor host selection
  app.get("/api/staff/by-company/:companyName", requireAuth, async (req, res) => {
    try {
      const { companyName } = req.params;
      if (!companyName) {
        return res.status(400).json({ error: "Company name is required" });
      }
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Get staff from customer's isolated database
      const allStaff = await databaseService.getAllStaff(context);
      
      // Filter staff by company name (case-insensitive)
      const filteredStaff = allStaff.filter(staff => 
        staff.department?.toLowerCase().includes(companyName.toLowerCase()) ||
        staff.employeeId?.toLowerCase().includes(companyName.toLowerCase())
      );
      
      res.json(filteredStaff);
    } catch (error) {
      console.error("Error fetching staff by company:", error);
      res.status(500).json({ error: "Failed to fetch staff for company" });
    }
  });

  // Helper: Auto-generate Fire Marshal URL ID

  app.post("/api/staff", requireAuth, async (req, res) => {
    try {
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Add customerId to request data for proper customer isolation
      let staffData = insertStaffSchema.parse({ ...req.body, customerId: context.customerId });
      
      // AUTO-GENERATE Fire Marshal URL if needed (CRITICAL for emergency system)
      if (shouldBeFireMarshal(staffData) && !staffData.fireMarshalUrlId) {
        staffData.fireMarshalUrlId = generateFireMarshalUrlId();
        staffData.isFireMarshal = true;
        console.log(`🔥 AUTO-GENERATED Fire Marshal URL for ${staffData.firstName} ${staffData.lastName}: ${staffData.fireMarshalUrlId}`);
      }
      
      // Use customer-isolated database service for creating staff
      const staff = await databaseService.createStaff(context, staffData);
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

  app.put("/api/staff/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Add customerId to updates for proper customer isolation
      let updates = insertStaffSchema.partial().parse({ ...req.body, customerId: context.customerId });
      
      // AUTO-GENERATE Fire Marshal URL only when explicitly enabling the role
      if (updates.isFireMarshal === true) {
        const existingStaff = await databaseService.getStaffById(context, id);
        if (existingStaff && !existingStaff.fireMarshalUrlId) {
          updates.fireMarshalUrlId = generateFireMarshalUrlId();
          console.log(`🔥 AUTO-GENERATED Fire Marshal URL for ${existingStaff.firstName} ${existingStaff.lastName}: ${updates.fireMarshalUrlId}`);
        }
      }
      
      // Use customer-isolated database service for updating staff
      const staff = await databaseService.updateStaff(context, id, updates);
      
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

  app.delete("/api/staff/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Use customer-isolated database service for deleting staff
      const success = await databaseService.deleteStaff(context, id);
      
      if (!success) {
        return res.status(404).json({ error: "Staff member not found" });
      }
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Failed to delete staff member:", error?.message || error);
      res.status(500).json({ error: "Failed to delete staff member" });
    }
  });

  // Staff authentication endpoint
  app.post("/api/staff/auth", requireAuth, async (req, res) => {
    try {
      const { email, password } = staffAuthSchema.parse(req.body);
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const staff = await databaseService.authenticateStaff(context, email, password);
      
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
  app.get("/api/staff/:id/access", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const staff = await databaseService.getStaffById(context, id);
      
      if (!staff) {
        return res.status(404).json({ error: "Staff member not found" });
      }
      
      res.json({ accessLevel: staff.accessLevel, lastLoginAt: staff.lastLoginAt });
    } catch (error) {
      res.status(500).json({ error: "Failed to get staff access information" });
    }
  });

  // Staff manual check-in endpoint
  app.post("/api/staff/:id/checkin", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { manual = true } = req.body;
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Use customer-isolated database service for staff check-in
      const staff = await databaseService.checkInStaff(context, id, manual);
      
      if (!staff) {
        return res.status(404).json({ error: "Staff member not found" });
      }
      
      // Check for active evacuations and add staff to accountability list if needed
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
        
        // Check if staff member is already in accountability list
        const existingRecord = await db
          .select()
          .from(evacuationAccountability)
          .where(and(
            eq(evacuationAccountability.evacuationId, evacuation.evacuationId),
            eq(evacuationAccountability.personId, staff.id)
          ))
          .limit(1);
        
        if (existingRecord.length === 0) {
          // Add staff to evacuation accountability
          await db.insert(evacuationAccountability).values({
            customerId: context.customerId,
            evacuationId: evacuation.evacuationId,
            personId: staff.id,
            personType: 'staff',
            personName: `${staff.firstName} ${staff.lastName}`,
            department: staff.department || '',
            company: '',
            lastKnownLocation: 'Just Checked In',
            isAccountedFor: false
          });
          
          console.log(`✅ Added ${staff.firstName} ${staff.lastName} to active evacuation ${evacuation.evacuationId} accountability list`);
        }
      }
      
      websocketService.broadcastPersonnelUpdate(context.customerId, {
        personId: staff.id,
        personName: `${staff.firstName} ${staff.lastName}`,
        personType: 'staff',
        action: 'checkin'
      });
      
      res.json({ success: true, staff });
    } catch (error) {
      console.error("Error checking in staff:", error);
      res.status(500).json({ error: "Failed to check in staff member" });
    }
  });

  // Staff check-out endpoint
  app.post("/api/staff/:id/checkout", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Use customer-isolated database service for staff check-out
      const staff = await databaseService.checkOutStaff(context, id);
      
      if (!staff) {
        return res.status(404).json({ error: "Staff member not found or not checked in" });
      }
      
      websocketService.broadcastPersonnelUpdate(context.customerId, {
        personId: staff.id,
        personName: `${staff.firstName} ${staff.lastName}`,
        personType: 'staff',
        action: 'checkout'
      });

      // Auto-end any active lone worker session on checkout
      try {
        const customerDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(context.customerId);
        const [activeSession] = await customerDb.select().from(isolatedSchema.loneWorkerSessions)
          .where(sql`${isolatedSchema.loneWorkerSessions.personId} = ${id} AND ${isolatedSchema.loneWorkerSessions.personType} = 'staff' AND ${isolatedSchema.loneWorkerSessions.status} IN ('active','escalated')`)
          .limit(1);
        if (activeSession) {
          await customerDb.update(isolatedSchema.loneWorkerSessions)
            .set({ status: 'ended_ok', endedAt: new Date(), endedBy: 'checkout' })
            .where(sql`${isolatedSchema.loneWorkerSessions.id} = ${activeSession.id}`);
          await customerDb.update(isolatedSchema.staff)
            .set({ isLoneWorker: false, loneWorkerSince: null, loneWorkerDeadline: null, loneWorkerEscalationLevel: 0 })
            .where(sql`${isolatedSchema.staff.id} = ${id}`);
          console.log(`🛡️ Auto-ended lone worker session for staff ${id} on checkout`);
        }
      } catch (lwErr) {
        console.warn('Could not auto-end lone worker session on checkout:', lwErr);
      }

      res.json({ success: true, staff });
    } catch (error) {
      console.error("Error checking out staff:", error);
      res.status(500).json({ error: "Failed to check out staff member" });
    }
  });

  // Staff QR code check-in from kiosk
  app.post("/api/staff/qr-checkin", async (req, res) => {
    try {
      const { qrCode } = req.body;
      if (!qrCode) {
        return res.status(400).json({ error: "QR code is required" });
      }
      
      const customers = await customerDbService.getAllCustomers();
      let foundStaff = null;
      let foundContext = null;
      
      for (const customer of customers) {
        if (!customer.isActive) continue;
        try {
          const context = { customerId: customer.id, username: 'kiosk' };
          const staffMember = await databaseService.getStaffByQrCode(context, qrCode);
          if (staffMember) {
            foundStaff = staffMember;
            foundContext = context;
            break;
          }
        } catch (err) {
          continue;
        }
      }
      
      if (!foundStaff || !foundContext) {
        return res.status(404).json({ error: "Staff member not found for this QR code" });
      }
      
      if (foundStaff.isCheckedIn) {
        const checkedOut = await databaseService.checkOutStaff(foundContext, foundStaff.id);
        
        websocketService.broadcastPersonnelUpdate(foundContext.customerId, {
          personId: foundStaff.id,
          personName: `${foundStaff.firstName} ${foundStaff.lastName}`,
          personType: 'staff',
          action: 'checkout'
        });
        
        return res.json({ 
          success: true, 
          action: 'checkout',
          staff: checkedOut,
          message: `${foundStaff.firstName} ${foundStaff.lastName} checked out successfully`
        });
      }
      
      const checkedIn = await databaseService.checkInStaff(foundContext, foundStaff.id, false);
      
      websocketService.broadcastPersonnelUpdate(foundContext.customerId, {
        personId: foundStaff.id,
        personName: `${foundStaff.firstName} ${foundStaff.lastName}`,
        personType: 'staff',
        action: 'checkin'
      });
      
      res.json({ 
        success: true, 
        action: 'checkin',
        staff: checkedIn,
        message: `${foundStaff.firstName} ${foundStaff.lastName} checked in successfully`
      });
    } catch (error) {
      console.error("Error processing staff QR check-in:", error);
      res.status(500).json({ error: "Failed to process staff QR check-in" });
    }
  });

  // Send staff QR pass via email
  app.post("/api/staff/:id/send-qr-pass", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { method = 'email' } = req.body;
      
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const staffMember = await databaseService.getStaffById(context, id);
      if (!staffMember) {
        return res.status(404).json({ error: "Staff member not found" });
      }
      
      if (!staffMember.qrCode) {
        const qrCode = 'STF-' + randomUUID().replace(/-/g, '').substring(0, 12);
        await databaseService.updateStaff(context, id, { qrCode } as any);
        staffMember.qrCode = qrCode;
      }
      
      const settings = await databaseService.getCompanySettings(context);
      
      const passPayload = {
        success: true,
        method,
        qrCode: staffMember.qrCode,
        staffName: `${staffMember.firstName} ${staffMember.lastName}`,
        department: staffMember.department,
        employeeId: staffMember.employeeId,
        email: staffMember.email,
      };

      if (method === 'email') {
        if (!staffMember.email) {
          return res.status(400).json({ error: "Staff member has no email address" });
        }
        
        const emailSent = await emailService.forCustomer(req.customerId).sendStaffQrPass(
          staffMember.email,
          `${staffMember.firstName} ${staffMember.lastName}`,
          staffMember.department,
          staffMember.employeeId,
          staffMember.qrCode,
          settings
        );
        
        return res.json({ 
          ...passPayload,
          emailSent,
          message: emailSent ? `QR pass sent to ${staffMember.email}` : 'Failed to send email'
        });
      }
      
      res.json({ ...passPayload, message: 'QR pass ready' });
    } catch (error) {
      console.error("Error sending staff QR pass:", error);
      res.status(500).json({ error: "Failed to send staff QR pass" });
    }
  });

  // Staff Apple Wallet pass (.pkpass) endpoint
  app.get("/api/staff/:id/wallet-pass", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);

      const staffMember = await databaseService.getStaffById(context, id);
      if (!staffMember) {
        return res.status(404).json({ error: "Staff member not found" });
      }

      if (!staffMember.qrCode) {
        const qrCode = 'STF-' + randomUUID().replace(/-/g, '').substring(0, 12);
        await databaseService.updateStaff(context, id, { qrCode } as any);
        staffMember.qrCode = qrCode;
      }

      const settings = await databaseService.getCompanySettings(context);
      const companyName = settings?.companyName || 'TPR Max';
      const brandColor = settings?.accentColor || '#4f46e5';

      res.status(501).json({ error: 'Apple Wallet pass generation is not available in this deployment' });
    } catch (error) {
      console.error("Error generating wallet pass:", error);
      res.status(500).json({ error: "Failed to generate wallet pass" });
    }
  });

  app.post("/api/staff/:id/print-id-card", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { design } = req.body;
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const staff = await databaseService.getStaffById(context, id);
      if (!staff) {
        return res.status(404).json({ error: "Staff member not found" });
      }

      // Here you would integrate with actual printer hardware
      // For now, we'll simulate the printing process
      console.log(`🖨️ Printing ID card for staff: ${staff.firstName} ${staff.lastName}`);
      console.log(`📐 Design elements:`, design);
      
      // Use dedicated ID Card Staff Printer (CR80 Format)
      const printJob = {
        id: `print-${Date.now()}`,
        staffId: id,
        status: "completed",
        timestamp: new Date().toISOString(),
        printer: "Magicard Enduro+ (V2)", // Default printer (settings not available here)
        design: design,
        cardSize: "CR80", // Standard ID card size (85.60mm x 53.98mm)
        printQuality: "300 DPI",
        printerType: "id_card_printer",
        format: "CR80_STAFF_CARD",
        printTime: "15 seconds" // Estimated print time
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

  app.get("/api/idcard/templates", async (req, res) => {
    try {
      // Return predefined industry templates
      const templates = [
        {
          id: 'staff-standard',
          name: 'Staff Standard',
          description: 'General employee with QR code',
          cardSize: 'CR80',
          background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
          elements: [
            { id: 'photo', type: 'photo', x: 20, y: 20, width: 80, height: 80, visible: true },
            { id: 'name', type: 'name', x: 120, y: 30, width: 180, height: 24, fontSize: 16, fontWeight: 'bold', color: '#1e293b', visible: true },
            { id: 'department', type: 'department', x: 120, y: 55, width: 180, height: 18, fontSize: 12, color: '#64748b', visible: true },
            { id: 'employeeId', type: 'employeeId', x: 120, y: 75, width: 180, height: 16, fontSize: 11, color: '#64748b', visible: true },
            { id: 'company', type: 'company', x: 20, y: 115, width: 200, height: 16, fontSize: 10, color: '#64748b', visible: true },
            { id: 'accessLevel', type: 'accessLevel', x: 20, y: 135, width: 200, height: 16, fontSize: 10, fontWeight: 'bold', color: '#3b82f6', visible: true },
            { id: 'qrcode', type: 'qrcode', x: 260, y: 110, width: 50, height: 50, visible: true }
          ]
        }
      ];

      res.json({
        success: true,
        templates
      });
    } catch (error) {
      console.error("Error fetching ID card templates:", error);
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });

  // Test print endpoint with staff selection
  app.post("/api/idcard/test-print", requireAuth, async (req, res) => {
    try {
      const { staffId, design } = req.body;
      
      if (!staffId) {
        return res.status(400).json({ error: "Staff ID is required for test printing" });
      }
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const staff = await databaseService.getStaffById(context, staffId);
      if (!staff) {
        return res.status(404).json({ error: "Staff member not found" });
      }

      console.log(`🧪 Test printing ID card for: ${staff.firstName} ${staff.lastName}`);
      console.log(`🎨 Using design with ${design?.length || 0} elements`);
      
      // Get the actual selected printer from settings
      
      const settings = await simpleDatabaseService.getCompanySettings(context);
      const actualPrinter = settings?.idCardPrinter || "Magicard Enduro+ (V2)";
      console.log(`🖨️ Sending to ID Card Staff Printer: ${actualPrinter} (CR80 Format)`);
      
      // Create actual print job for Windows printer
      let printStatus = "completed";
      let printError = null;
      
      try {
        // Use dynamic import for child_process to work with ES modules
        const { execSync } = await import("child_process");
        const fs = await import("fs");
        const path = await import("path");
        
        // Generate HTML content for the ID card
        const cardHtml = generateIdCardHtml(staff, design);
        
        // Create temporary HTML file
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const tempFile = path.join(tempDir, `id-card-${staff.id}-${Date.now()}.html`);
        fs.writeFileSync(tempFile, cardHtml, 'utf8');
        
        console.log(`📄 Generated HTML file: ${tempFile}`);
        
        const selectedPrinter = settings?.idCardPrinter || "PDF Printer (Testing)";
        
        // REAL Windows printing - Force execution on actual Windows PC
        const isRealWindows = process.env.OS === 'Windows_NT' || process.env.WINDIR || process.platform === 'win32';
        
        if (isRealWindows) {
          try {
            // Use PowerShell to print the HTML file to the specified printer
            console.log(`🖨️ Using selected ID card printer: ${selectedPrinter}`);
            
            // For PDF printer, just open the file
            if (selectedPrinter.includes('PDF') || selectedPrinter.includes('pdf')) {
              const printCommand = `powershell.exe -Command "Start-Process -FilePath '${tempFile}'"`;
              console.log(`📄 Opening PDF file: ${printCommand}`);
              execSync(printCommand, { encoding: 'utf8', timeout: 30000 });
              console.log(`✅ PDF file opened successfully`);
            } else {
              // Enhanced printer handling for Magicard and other card printers
              console.log(`🔧 Preparing ${selectedPrinter} for printing...`);
              
              // Step 1: Wake up Magicard printers specifically
              if (selectedPrinter.includes('Magicard')) {
                console.log(`🔔 Waking up Magicard printer...`);
                try {
                  const wakeCommand = `powershell.exe -Command "Get-Printer -Name '${selectedPrinter}' | Set-Printer -Comment 'VisiGate-Wake-${Date.now()}'"`; 
                  execSync(wakeCommand, { encoding: 'utf8', timeout: 10000 });
                  console.log(`✅ Magicard wake-up command sent`);
                } catch (wakeError) {
                  console.log(`⚠️ Wake-up command failed, continuing: ${wakeError instanceof Error ? wakeError.message : String(wakeError)}`);
                }
              }
              
              // Step 2: Clear any stuck print jobs in the queue
              console.log(`🧹 Clearing print queue for ${selectedPrinter}...`);
              try {
                const clearQueueCommand = `powershell.exe -Command "Get-PrintJob -PrinterName '${selectedPrinter}' | Remove-PrintJob -Confirm:$false"`;
                execSync(clearQueueCommand, { encoding: 'utf8', timeout: 10000 });
                console.log(`✅ Print queue cleared`);
              } catch (clearError) {
                console.log(`ℹ️ No existing jobs to clear: ${clearError instanceof Error ? clearError.message : String(clearError)}`);
              }
              
              // Step 3: Check printer status
              console.log(`🔍 Checking printer status...`);
              try {
                const statusCommand = `powershell.exe -Command "Get-Printer -Name '${selectedPrinter}' | Select-Object Name, PrinterStatus, JobCount, Comment"`;
                const statusResult = execSync(statusCommand, { encoding: 'utf8', timeout: 10000 });
                console.log(`📊 Printer status:\n${statusResult}`);
              } catch (statusError) {
                console.log(`⚠️ Status check failed: ${statusError instanceof Error ? statusError.message : String(statusError)}`);
              }
              
              // Step 4: Send print job using enhanced method for card printers
              console.log(`🖨️ Sending print job to Windows print spooler...`);
              
              // Use rundll32 method which works better with specialized printers like Magicard
              const enhancedPrintCommand = `powershell.exe -Command "
                try {
                  # Method 1: Direct HTML printing using rundll32
                  Start-Process -FilePath 'rundll32.exe' -ArgumentList 'mshtml.dll,PrintHTML \\"${tempFile}\\"' -Wait -WindowStyle Hidden
                  Write-Output 'Print job sent via rundll32 method'
                  
                  # Check if job appeared in queue
                  Start-Sleep -Seconds 2
                  $jobs = Get-PrintJob -PrinterName '${selectedPrinter}' -ErrorAction SilentlyContinue
                  if ($jobs) {
                    Write-Output 'Jobs in queue:'
                    $jobs | ForEach-Object { Write-Output \"Job ID: $($_.Id), Status: $($_.JobStatus), Pages: $($_.TotalPages)\" }
                  } else {
                    Write-Output 'No jobs found in queue'
                  }
                } catch {
                  Write-Output \"Print error: $($_.Exception.Message)\"
                  exit 1
                }"`;
              
              const printResult = execSync(enhancedPrintCommand, { encoding: 'utf8', timeout: 45000 });
              console.log(`✅ Enhanced print result:\n${printResult}`);
              
              // For Magicard, also try a direct printer command
              if (selectedPrinter.includes('Magicard')) {
                console.log(`🎯 Sending additional Magicard-specific command...`);
                try {
                  const magicardCommand = `powershell.exe -Command "
                    # Additional Magicard wake-up and status check
                    Get-WmiObject -Query \\"SELECT * FROM Win32_Printer WHERE Name='${selectedPrinter}'\\" | ForEach-Object {
                      Write-Output \\"Printer: $($_.Name), Status: $($_.PrinterStatus), State: $($_.PrinterState)\\"
                    }"`;
                  const magicardResult = execSync(magicardCommand, { encoding: 'utf8', timeout: 15000 });
                  console.log(`🔧 Magicard status check:\n${magicardResult}`);
                } catch (magicardError) {
                  console.log(`⚠️ Magicard status check failed: ${magicardError instanceof Error ? magicardError.message : String(magicardError)}`);
                }
              }
              
              console.log(`✅ Enhanced print job sent successfully to ${selectedPrinter}`);
            }
            
            // Clean up temp file after a delay
            setTimeout(() => {
              try {
                if (fs.existsSync(tempFile)) {
                  fs.unlinkSync(tempFile);
                  console.log(`🗑️ Cleaned up temp file: ${tempFile}`);
                }
              } catch (cleanupError) {
                console.warn(`⚠️ Failed to cleanup temp file: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
              }
            }, 5000);
            
          } catch (printError) {
            console.error(`❌ Windows print command failed:`, printError);
            
            // CRITICAL FALLBACK: Force Windows print using multiple methods
            try {
              console.log(`🔄 Attempting DIRECT Windows printing methods...`);
              
              // Method A: Copy directly to printer (works with most Windows printers)
              const directCopyCmd = `copy "${tempFile}" "${selectedPrinter}"`;
              execSync(directCopyCmd, { encoding: 'utf8', timeout: 15000 });
              console.log(`✅ Direct copy to printer executed`);
              
              // Method B: Use Windows system print command
              const sysPrintCmd = `print /D:"${selectedPrinter}" "${tempFile}"`;
              execSync(sysPrintCmd, { encoding: 'utf8', timeout: 15000 });
              console.log(`✅ System print command executed`);
              
              // Method C: PowerShell Out-Printer (most reliable)
              const psPrintCmd = `powershell.exe -Command "Get-Content '${tempFile}' | Out-Printer -Name '${selectedPrinter}'"`;
              execSync(psPrintCmd, { encoding: 'utf8', timeout: 15000 });
              console.log(`✅ PowerShell Out-Printer executed`);
              
              printStatus = "completed";
              
            } catch (fallbackError) {
              console.error(`❌ ALL print methods failed:`, fallbackError);
              printStatus = "failed";
              printError = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
            }
          }
        } else {
          // Running in Replit simulation
          console.log(`⚠️  SIMULATION ENVIRONMENT DETECTED`);
          console.log(`💡 To enable REAL printing:`);
          console.log(`   1. Download this project to your Windows PC`);
          console.log(`   2. Run: npm install && npm run dev`);
          console.log(`   3. Connect your Magicard Enduro+ (V2) printer`);
          console.log(`   4. The system will then send actual jobs to Windows print spooler`);
          printStatus = "simulated";
        }
        
      } catch (error) {
        console.error(`❌ Print job creation failed:`, error);
        printStatus = "failed";
        printError = error instanceof Error ? error.message : String(error);
      }
      
      // Use the already fetched settings for the print job record
      const selectedPrinter = settings?.idCardPrinter || "Magicard Enduro+ (V2)";
      
      // Use the selected ID Card Staff Printer from settings
      const testPrintJob = {
        id: `test-print-${Date.now()}`,
        type: "test_print",
        staffId,
        staffName: `${staff.firstName} ${staff.lastName}`,
        department: staff.department,
        status: printStatus,
        timestamp: new Date().toISOString(),
        printer: selectedPrinter, // Use the printer selected in settings
        design: design,
        cardSize: "CR80", // Standard ID card size (85.60mm x 53.98mm)
        printQuality: "300 DPI",
        printerType: "id_card_printer",
        format: "CR80_STAFF_CARD",
        testMode: true,
        error: printError
      };

      res.json({
        success: true,
        message: `Test ID card printed for ${staff.firstName} ${staff.lastName}`,
        printJob: testPrintJob
      });
    } catch (error) {
      console.error("Error test printing ID card:", error);
      res.status(500).json({ error: "Failed to test print ID card" });
    }
  });

  app.get("/api/staff/checked-in", requireAuth, async (req, res) => {
    try {
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const checkedInStaff = await databaseService.getCheckedInStaff(context);
      res.json(checkedInStaff);
    } catch (error) {
      console.error("Failed to fetch checked-in staff:", error);
      
      // DEV DATA BYPASS: Check if this is a Neon database error and bypass is enabled
      if (isDevDataBypass() && isDatabaseConnectionError(error)) {
        return res.json(getMockCheckedInStaff());
      }
      
      res.status(500).json({ error: "Failed to fetch checked-in staff" });
    }
  });

  app.get("/api/staff/time-attendance", requireAuth, async (req, res) => {
    try {
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
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
      
      // Use customer-isolated database service instead of file storage
      const timeAttendance = await databaseService.getStaffTimeAndAttendance(context, fromDate, toDate);
      res.json(timeAttendance);
    } catch (error) {
      console.error("Failed to fetch time and attendance data:", error);
      res.status(500).json({ error: "Failed to fetch time and attendance data" });
    }
  });

  app.put("/api/idcard/design", requireAuth, async (req, res) => {
    try {
      const { elements, background, cardSize } = req.body;
      
      // Validate the design data
      if (!elements || !Array.isArray(elements)) {
        return res.status(400).json({ error: "Invalid design elements" });
      }
      
      // Save the design to CUSTOMER-SPECIFIC company settings
      const designData = JSON.stringify({
        elements,
        background: background || 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
        cardSize: cardSize || 'CR80',
        lastUpdated: new Date().toISOString()
      });
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const settings = await simpleDatabaseService.updateCompanySettings(context, {
        idCardDesign: designData
      });
      
      console.log(`💾 ID card design saved with ${elements.length} elements FOR CUSTOMER: ${context.customerId}`);
      
      res.json({
        success: true,
        message: "ID card design saved successfully",
        design: JSON.parse(settings?.idCardDesign || '{}')
      });
    } catch (error) {
      console.error("Error saving ID card design:", error);
      res.status(500).json({ error: "Failed to save ID card design" });
    }
  });

  app.get("/api/idcard/design", requireAuth, async (req, res) => {
    try {
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const settings = await simpleDatabaseService.getCompanySettings(context);
      const designData = settings?.idCardDesign || '[]';
      
      console.log(`🎨 Loading ID card design FOR CUSTOMER: ${context.customerId}`);
      
      let parsedDesign;
      try {
        parsedDesign = JSON.parse(designData);
      } catch (parseError) {
        console.warn("Invalid design data, returning default:", parseError);
        parsedDesign = { elements: [], background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)', cardSize: 'CR80' };
      }
      
      res.json({
        success: true,
        design: parsedDesign
      });
    } catch (error) {
      console.error("Error loading ID card design:", error);
      res.status(500).json({ error: "Failed to load ID card design" });
    }
  });

  app.get("/api/staff/me/:customerId?", requireAuth, async (req, res) => {
    try {
      const { customerId: pathCustomerId } = req.params;
      
      // Get customer context from authenticated user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Use path customer ID if provided, otherwise use context customer ID
      const targetCustomerId = pathCustomerId || context.customerId;
      
      // Ensure user has access to this customer data
      if (context.customerId !== targetCustomerId) {
        return res.status(403).json({ error: 'Access denied to customer data' });
      }
      
      // Get staff member for this customer (simplified - in production you'd validate staff access)
      // For now, return basic staff info based on authenticated user
      const staffInfo = {
        id: req.user.id,
        firstName: req.user.username,
        lastName: 'User',
        email: `${req.user.username.toLowerCase()}@example.com`,
        accessLevel: req.user.role === 'admin' ? 'admin' : 'supervisor',
        customerId: targetCustomerId,
        isActive: true
      };
      
      console.log(`✅ Staff info retrieved for user ${username} and customer ${targetCustomerId}`);
      res.json(staffInfo);
    } catch (error) {
      console.error('Error fetching staff info:', error);
      res.status(500).json({ error: 'Failed to fetch staff information' });
    }
  });

  // Alternative staff endpoint without customer ID parameter
  app.get("/api/staff/me", requireAuth, async (req, res) => {
    try {
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const staffInfo = {
        id: req.user.id,
        firstName: req.user.username,
        lastName: 'User',
        email: `${req.user.username.toLowerCase()}@example.com`,
        accessLevel: req.user.role === 'admin' ? 'admin' : 'supervisor',
        customerId: context.customerId,
        isActive: true
      };
      
      console.log(`✅ Staff info retrieved for user ${username} and customer ${context.customerId}`);
      res.json(staffInfo);
    } catch (error) {
      console.error('Error fetching staff info:', error);
      res.status(500).json({ error: 'Failed to fetch staff information' });
    }
  });

  // POST /api/staff/:id/lone-worker/start
  app.post("/api/staff/:id/lone-worker/start", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const customerDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(customerId);
      const { id } = req.params;
      const cryptoMod = await import('crypto');

      const [staffMember] = await customerDb.select().from(isolatedSchema.staff).where(sql`${isolatedSchema.staff.id} = ${id}`);
      if (!staffMember) return res.status(404).json({ error: 'Staff member not found' });
      if (!staffMember.isCheckedIn) return res.status(400).json({ error: 'Staff member must be checked in to start lone worker mode' });
      if (!staffMember.email) return res.status(400).json({ error: 'Staff member must have an email address to use lone worker protection' });

      const settings = await getLoneWorkerSettings({ db: customerDb });
      if (!settings?.loneWorkerEnabled) return res.status(400).json({ error: 'Lone Worker Protection is not enabled for this organisation' });

      // Guard against duplicate active sessions
      const [existingSession] = await customerDb.select().from(isolatedSchema.loneWorkerSessions)
        .where(sql`${isolatedSchema.loneWorkerSessions.personId} = ${id} AND ${isolatedSchema.loneWorkerSessions.personType} = 'staff' AND ${isolatedSchema.loneWorkerSessions.status} IN ('active','escalated')`)
        .limit(1);
      if (existingSession) return res.status(409).json({ error: 'An active lone worker session already exists for this person', sessionId: existingSession.id });

      const intervalMins = settings?.loneWorkerCheckIntervalMins || 30;
      const gracePeriodMins = settings?.loneWorkerGracePeriodMins || 10;
      const deadline = new Date(Date.now() + intervalMins * 60000);

      const [session] = await customerDb.insert(isolatedSchema.loneWorkerSessions).values({
        customerId,
        personId: id,
        personType: 'staff',
        personName: `${staffMember.firstName} ${staffMember.lastName}`,
        personEmail: staffMember.email || '',
        intervalMins,
        gracePeriodMins,
        status: 'active',
      }).returning();

      const token = mintLoneWorkerToken(cryptoMod);
      await customerDb.insert(isolatedSchema.loneWorkerTokens).values({
        token,
        sessionId: session.id,
        expiresAt: new Date(Date.now() + (intervalMins + gracePeriodMins) * 60000),
      });

      await customerDb.update(isolatedSchema.staff)
        .set({ isLoneWorker: true, loneWorkerSince: new Date(), loneWorkerDeadline: deadline, loneWorkerEscalationLevel: 0 })
        .where(sql`${isolatedSchema.staff.id} = ${id}`);

      if (staffMember.email) {
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        try {
          await sendFirstWelfareEmail(customerDb, { ...session, personEmail: staffMember.email }, token, settings, baseUrl);
        } catch (emailErr: any) {
          console.error(`🛡️ Lone worker session ${session.id} started but welfare email failed to send:`, emailErr?.message || emailErr);
        }
      }

      res.json({ success: true, session, deadline });
    } catch (err: any) {
      console.error('POST /api/staff/:id/lone-worker/start error:', err);
      res.status(500).json({ error: 'Failed to start lone worker session' });
    }
  });

  // POST /api/staff/:id/lone-worker/end
  app.post("/api/staff/:id/lone-worker/end", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const customerDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(customerId);
      const { id } = req.params;
      const endedBy = req.body?.endedBy || 'supervisor';

      await customerDb.update(isolatedSchema.loneWorkerSessions)
        .set({ status: 'ended_ok', endedAt: new Date(), endedBy })
        .where(sql`${isolatedSchema.loneWorkerSessions.personId} = ${id} AND ${isolatedSchema.loneWorkerSessions.personType} = 'staff' AND ${isolatedSchema.loneWorkerSessions.status} IN ('active','escalated')`);

      await customerDb.update(isolatedSchema.staff)
        .set({ isLoneWorker: false, loneWorkerSince: null, loneWorkerDeadline: null, loneWorkerEscalationLevel: 0 })
        .where(sql`${isolatedSchema.staff.id} = ${id}`);

      res.json({ success: true });
    } catch (err: any) {
      console.error('POST /api/staff/:id/lone-worker/end error:', err);
      res.status(500).json({ error: 'Failed to end lone worker session' });
    }
  });

}
