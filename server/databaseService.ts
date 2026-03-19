import { eq, and, desc, asc, gte, lte, lt, gt, sql, isNull, inArray } from "drizzle-orm";
import { customerDbService, type CustomerContext } from "./customerDatabase";
import type {
  Staff,
  InsertStaff,
  Visitor,
  InsertVisitor,
  VisitorHistory,
  InsertVisitorHistory,
  User,
  InsertUser,
  CompanySettings,
  InsertCompanySettings,
  Department,
  InsertDepartment,
  PreBooking,
  InsertPreBooking,
} from "./isolatedSchema";
import * as isolatedSchema from "./isolatedSchema";
import * as sharedSchema from "@shared/schema"; // Keep for management operations
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

/**
 * CUSTOMER-ISOLATED DATABASE SERVICE
 * 
 * This service provides database operations for customer-isolated databases.
 * Each customer has their own separate PostgreSQL database, eliminating the need
 * for customerId fields in queries.
 * 
 * Key Features:
 * - True database-level isolation per customer
 * - No customerId filters needed (each DB belongs to one customer)
 * - Complete data separation at the infrastructure level
 * 
 * Each method requires CustomerContext to route to the correct customer database.
 */
export class DatabaseService {
  
  /**
   * COMPANY SETTINGS METHODS - Customer Isolated
   */
  async getCompanySettings(context: CustomerContext): Promise<CompanySettings | undefined> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    // No customerId filter needed - each customer has their own database
    const settings = await db
      .select()
      .from(isolatedSchema.companySettings)
      .limit(1);
    
    return settings[0];
  }

  async updateCompanySettings(
    context: CustomerContext, 
    updates: Partial<InsertCompanySettings>
  ): Promise<CompanySettings | undefined> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    // First, try to get existing settings
    const existing = await this.getCompanySettings(context);
    
    if (existing) {
      // Update existing settings (no customerId filter needed)
      const updated = await db
        .update(isolatedSchema.companySettings)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(isolatedSchema.companySettings.id, existing.id))
        .returning();
      
      return updated[0];
    } else {
      // Create new settings (no customerId needed)
      const created = await db
        .insert(isolatedSchema.companySettings)
        .values(updates)
        .returning();
      
      return created[0];
    }
  }

  /**
   * STAFF METHODS - Customer Isolated
   */
  async getAllStaff(context: CustomerContext): Promise<Staff[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    return await db
      .select()
      .from(isolatedSchema.staff)
      .orderBy(asc(isolatedSchema.staff.lastName), asc(isolatedSchema.staff.firstName));
  }

  async getStaffById(context: CustomerContext, id: string): Promise<Staff | undefined> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const staff = await db
      .select()
      .from(isolatedSchema.staff)
      .where(eq(isolatedSchema.staff.id, id))
      .limit(1);
    
    return staff[0];
  }

  async getStaffByQrCode(context: CustomerContext, qrCode: string): Promise<Staff | undefined> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const staffResult = await db
      .select()
      .from(isolatedSchema.staff)
      .where(eq(isolatedSchema.staff.qrCode, qrCode))
      .limit(1);
    
    return staffResult[0];
  }

  async createStaff(context: CustomerContext, insertStaff: InsertStaff): Promise<Staff> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    // Hash password if provided
    let hashedPassword = null;
    if (insertStaff.password) {
      hashedPassword = await bcrypt.hash(insertStaff.password, 10);
    }
    
    // Auto-generate Fire Marshal URL ID if this is a Fire Marshal
    let fireMarshalUrlId = insertStaff.fireMarshalUrlId;
    if (insertStaff.isFireMarshal && !fireMarshalUrlId) {
      fireMarshalUrlId = randomUUID().replace(/-/g, '').substring(0, 12);
      console.log(`🔥 Generated Fire Marshal URL ID for new staff ${insertStaff.firstName} ${insertStaff.lastName}: ${fireMarshalUrlId}`);
    }

    // Auto-generate QR code for staff check-in
    const qrCode = insertStaff.qrCode || `STF-${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    
    const created = await db
      .insert(isolatedSchema.staff)
      .values({
        ...insertStaff,
        password: hashedPassword,
        fireMarshalUrlId,
        qrCode,
      })
      .returning();
    
    return created[0];
  }

  async updateStaff(
    context: CustomerContext, 
    id: string, 
    updates: Partial<InsertStaff>
  ): Promise<Staff | undefined> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    // ALWAYS check existing staff to see if they need a Fire Marshal URL ID
    const existingStaff = await db
      .select()
      .from(isolatedSchema.staff)
      .where(eq(isolatedSchema.staff.id, id))
      .limit(1);
    
    if (existingStaff[0]) {
      // Generate Fire Marshal URL ID if:
      // 1. Being newly designated as Fire Marshal (updates.isFireMarshal === true), OR
      // 2. Already is a Fire Marshal (existingStaff[0].isFireMarshal === true)
      // AND they don't have a URL ID yet
      const isOrWillBeFireMarshal = updates.isFireMarshal === true || existingStaff[0].isFireMarshal === true;
      const hasNoUrlId = !existingStaff[0].fireMarshalUrlId && !updates.fireMarshalUrlId;
      
      if (isOrWillBeFireMarshal && hasNoUrlId) {
        // Generate a unique, URL-safe ID (12 characters from UUID without dashes)
        updates.fireMarshalUrlId = randomUUID().replace(/-/g, '').substring(0, 12);
        console.log(`🔥 Generated Fire Marshal URL ID for ${existingStaff[0].firstName} ${existingStaff[0].lastName}: ${updates.fireMarshalUrlId}`);
      }
    }
    
    const updated = await db
      .update(isolatedSchema.staff)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(isolatedSchema.staff.id, id))
      .returning();
    
    return updated[0];
  }

  async deleteStaff(context: CustomerContext, id: string): Promise<boolean> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const safeDelete = async (fn: () => Promise<any>) => { try { await fn(); } catch (e: any) { if (!e?.message?.includes('does not exist')) throw e; } };

    await safeDelete(() => db.delete(isolatedSchema.staffSessions).where(eq(isolatedSchema.staffSessions.staffId, id)));
    await safeDelete(() => db.delete(isolatedSchema.staffAttendanceHistory).where(eq(isolatedSchema.staffAttendanceHistory.staffId, id)));
    await safeDelete(() => db.delete(isolatedSchema.roomBookingAttendees).where(eq(isolatedSchema.roomBookingAttendees.staffId, id)));
    await safeDelete(() => db.update(isolatedSchema.visitors).set({ hostStaffId: null }).where(eq(isolatedSchema.visitors.hostStaffId, id)));
    await safeDelete(() => db.update(isolatedSchema.visitorHistory).set({ hostStaffId: null }).where(eq(isolatedSchema.visitorHistory.hostStaffId, id)));
    await safeDelete(() => db.update(isolatedSchema.preBookings).set({ hostStaffId: null }).where(eq(isolatedSchema.preBookings.hostStaffId, id)));
    await safeDelete(() => db.update(isolatedSchema.contractorVisits).set({ hostStaffId: null }).where(eq(isolatedSchema.contractorVisits.hostStaffId, id)));
    await safeDelete(() => db.update(isolatedSchema.roomBookings).set({ bookedByStaffId: null }).where(eq(isolatedSchema.roomBookings.bookedByStaffId, id)));

    const deleted = await db
      .delete(isolatedSchema.staff)
      .where(eq(isolatedSchema.staff.id, id))
      .returning();
    
    return deleted.length > 0;
  }

  async checkInStaff(context: CustomerContext, id: string, manual: boolean = false): Promise<Staff | undefined> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    // Update staff record
    const updated = await db
      .update(isolatedSchema.staff)
      .set({ 
        isCheckedIn: true,
        checkedInAt: new Date(),
        manualCheckIn: manual,
        updatedAt: new Date()
      })
      .where(eq(isolatedSchema.staff.id, id))
      .returning();
    
    if (updated[0]) {
      // Create session record
      await db.insert(isolatedSchema.staffSessions).values({
        staffId: id,
        checkInTime: new Date(),
        isManual: manual,
        checkInMethod: manual ? 'manual' : 'card',
      });
    }
    
    return updated[0];
  }

  async checkOutStaff(context: CustomerContext, id: string): Promise<Staff | undefined> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    // Update staff record
    const updated = await db
      .update(isolatedSchema.staff)
      .set({ 
        isCheckedIn: false,
        checkedOutAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(isolatedSchema.staff.id, id))
      .returning();
    
    if (updated[0]) {
      // Find the most recent unclosed session record
      const openSession = await db
        .select()
        .from(isolatedSchema.staffSessions)
        .where(and(
          eq(isolatedSchema.staffSessions.staffId, id),
          isNull(isolatedSchema.staffSessions.checkOutTime)
        ))
        .orderBy(desc(isolatedSchema.staffSessions.checkInTime))
        .limit(1);
      
      if (openSession[0]) {
        // Update the session record
        const checkOutTime = new Date();
        await db
          .update(isolatedSchema.staffSessions)
          .set({
            checkOutTime: checkOutTime,
            checkOutMethod: 'card'
          })
          .where(eq(isolatedSchema.staffSessions.id, openSession[0].id));
      }
    }
    
    return updated[0];
  }

  async checkOutContractorWorker(context: CustomerContext, id: string): Promise<any> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const updated = await db
      .update(isolatedSchema.contractorWorkers)
      .set({ 
        isCheckedIn: false,
        checkedOutAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(isolatedSchema.contractorWorkers.id, id))
      .returning();
    
    return updated[0];
  }

  async checkInContractorWorker(context: CustomerContext, id: string): Promise<any> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const updated = await db
      .update(isolatedSchema.contractorWorkers)
      .set({ 
        isCheckedIn: true,
        checkedInAt: new Date(),
        checkedOutAt: null,
        updatedAt: new Date()
      })
      .where(eq(isolatedSchema.contractorWorkers.id, id))
      .returning();
    
    return updated[0];
  }

  async getContractorWorkerByQrCode(context: CustomerContext, qrCode: string): Promise<any | undefined> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const result = await db
      .select()
      .from(isolatedSchema.contractorWorkers)
      .where(eq(isolatedSchema.contractorWorkers.qrCode, qrCode))
      .limit(1);
    
    return result[0];
  }

  /**
   * FIRE MARSHAL METHODS - Cross-Customer Search
   * FIXED: Query PUBLIC staff table directly to get correct customer_id
   */
  async findFireMarshalByUrlId(urlId: string): Promise<{ marshal: Staff; customerId: string } | null> {
    const allCustomers = await customerDbService.getAllCustomers();
    
    for (const customer of allCustomers) {
      try {
        const customerDb = await customerDbService.getCustomerDatabase(customer.id);
        const marshals = await customerDb
          .select()
          .from(isolatedSchema.staff)
          .where(eq(isolatedSchema.staff.fireMarshalUrlId, urlId))
          .limit(1);
        
        if (marshals[0]) {
          console.log(`✅ Found Fire Marshal with URL ID ${urlId} in customer ${customer.companyName} (${customer.id})`);
          return {
            marshal: marshals[0],
            customerId: customer.id
          };
        }
      } catch (error) {
        console.log(`⚠️ Skipping customer ${customer.id} during Fire Marshal search: ${(error as Error).message?.substring(0, 60)}`);
      }
    }
    
    console.log(`❌ No Fire Marshal found with URL ID: ${urlId}`);
    return null;
  }

  /**
   * VISITOR METHODS - Customer Isolated
   */
  async getAllVisitors(context: CustomerContext): Promise<Visitor[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    return await db
      .select()
      .from(isolatedSchema.visitors)
      .orderBy(desc(isolatedSchema.visitors.checkedInAt));
  }

  /**
   * Get unique visitors (deduplicated by email or name+company)
   * Returns only the most recent record for each unique person
   */
  async getUniqueVisitors(context: CustomerContext): Promise<Visitor[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    // Get all visitors
    const allVisitors = await db
      .select()
      .from(isolatedSchema.visitors)
      .orderBy(desc(isolatedSchema.visitors.checkedInAt));
    
    // Deduplicate by name + company (different people can share email addresses)
    const uniqueVisitorsMap = new Map<string, Visitor>();
    
    for (const visitor of allVisitors) {
      const key = `${visitor.firstName?.toLowerCase().trim() || ''}_${visitor.lastName?.toLowerCase().trim() || ''}_${visitor.company?.toLowerCase().trim() || ''}`;
      
      if (!uniqueVisitorsMap.has(key)) {
        uniqueVisitorsMap.set(key, visitor);
      }
    }
    
    // Convert map back to array and return
    return Array.from(uniqueVisitorsMap.values());
  }

  async getTodaysVisitors(context: CustomerContext): Promise<Visitor[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return await db
      .select()
      .from(isolatedSchema.visitors)
      .where(and(
        gte(isolatedSchema.visitors.checkedInAt, today),
        lt(isolatedSchema.visitors.checkedInAt, tomorrow)
      ))
      .orderBy(desc(isolatedSchema.visitors.checkedInAt));
  }

  async getCurrentVisitors(context: CustomerContext): Promise<Visitor[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    return await db
      .select()
      .from(isolatedSchema.visitors)
      .where(eq(isolatedSchema.visitors.isCheckedIn, true))
      .orderBy(desc(isolatedSchema.visitors.checkedInAt));
  }

  async createVisitor(context: CustomerContext, insertVisitor: InsertVisitor): Promise<Visitor> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const qrCode = `VIS-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const created = await db
      .insert(isolatedSchema.visitors)
      .values({
        ...insertVisitor,
        qrCode,
      })
      .returning();
    
    const visitor = created[0];
    
    // Create visitor history record for new check-in
    if (visitor.isCheckedIn && visitor.checkedInAt) {
      await this.createVisitorHistory(context, {
        visitorId: visitor.id,
        checkInTime: visitor.checkedInAt,
        checkOutTime: null,
        purpose: visitor.purpose || '',
        hostStaffId: visitor.hostStaffId,

        inductionCompleted: visitor.inductionCompleted || false,
        inductionCompletedAt: visitor.inductionCompletedAt,
        hsRulesAccepted: visitor.hsRulesAccepted || false,
        hsRulesAcceptedAt: visitor.hsRulesAcceptedAt,
        ePassSent: visitor.ePassSent || false,
        ePassSentAt: visitor.ePassSentAt,
        checkoutType: null,
        notes: visitor.notes,
        qrCode: visitor.qrCode
      });
    }
    
    return visitor;
  }

  async updateVisitor(
    context: CustomerContext, 
    id: string, 
    updates: Partial<InsertVisitor>
  ): Promise<Visitor | undefined> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const updated = await db
      .update(isolatedSchema.visitors)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(isolatedSchema.visitors.id, id))
      .returning();
    
    return updated[0];
  }

  async checkOutVisitor(context: CustomerContext, id: string): Promise<Visitor | undefined> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    // Get visitor details before checkout for history
    const visitor = await this.getVisitorById(context, id);
    if (!visitor) return undefined;
    
    const checkOutTime = new Date();
    const updated = await db
      .update(isolatedSchema.visitors)
      .set({ 
        isCheckedIn: false, 
        checkedOutAt: checkOutTime,
        checkoutType: 'user',
        updatedAt: new Date()
      })
      .where(eq(isolatedSchema.visitors.id, id))
      .returning();
    
    // Update the existing visitor history record with checkout time
    if (updated[0] && visitor.checkedInAt) {
      // Find the open history record (one without checkout time)
      const openHistoryRecord = await db
        .select()
        .from(isolatedSchema.visitorHistory)
        .where(and(
          eq(isolatedSchema.visitorHistory.visitorId, id),
          isNull(isolatedSchema.visitorHistory.checkOutTime)
        ))
        .orderBy(desc(isolatedSchema.visitorHistory.checkInTime))
        .limit(1);
      
      if (openHistoryRecord.length > 0) {
        // Update existing history record with checkout time
        await db
          .update(isolatedSchema.visitorHistory)
          .set({
            checkOutTime: checkOutTime,
            checkoutType: 'user',
            inductionCompleted: visitor.inductionCompleted || false,
            inductionCompletedAt: visitor.inductionCompletedAt,
            hsRulesAccepted: visitor.hsRulesAccepted || false,
            hsRulesAcceptedAt: visitor.hsRulesAcceptedAt,
            notes: visitor.notes
          })
          .where(eq(isolatedSchema.visitorHistory.id, openHistoryRecord[0].id));
      } else {
        // If no open history record exists, create one (shouldn't normally happen)
        await this.createVisitorHistory(context, {
          visitorId: id,
          checkInTime: visitor.checkedInAt,
          checkOutTime: checkOutTime,
          purpose: visitor.purpose || '',
          hostStaffId: visitor.hostStaffId,
  
          inductionCompleted: visitor.inductionCompleted || false,
          inductionCompletedAt: visitor.inductionCompletedAt,
          hsRulesAccepted: visitor.hsRulesAccepted || false,
          hsRulesAcceptedAt: visitor.hsRulesAcceptedAt,
          ePassSent: visitor.ePassSent || false,
          ePassSentAt: visitor.ePassSentAt,
          checkoutType: 'user',
          notes: visitor.notes,
          qrCode: visitor.qrCode
        });
      }
    }
    
    return updated[0];
  }
  
  async createVisitorHistory(context: CustomerContext, historyData: Omit<InsertVisitorHistory, 'customerId'>): Promise<VisitorHistory> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    // Get host name if host ID is provided, and verify the staff member still exists
    // to avoid FK constraint violations if the staff has been deleted
    let hostName = undefined;
    let resolvedHostStaffId = historyData.hostStaffId || null;
    if (historyData.hostStaffId) {
      const host = await this.getStaffById(context, historyData.hostStaffId);
      if (host) {
        hostName = `${host.firstName} ${host.lastName}`;
      } else {
        // Staff member no longer exists - clear the FK to prevent constraint violation
        resolvedHostStaffId = null;
      }
    }
    
    const [history] = await db
      .insert(isolatedSchema.visitorHistory)
      .values({
        ...historyData,
        hostStaffId: resolvedHostStaffId,
        hostName,
      })
      .returning();
    
    return history;
  }
  
  async getVisitorHistory(context: CustomerContext, visitorId: string): Promise<VisitorHistory[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    return await db
      .select()
      .from(isolatedSchema.visitorHistory)
      .where(eq(isolatedSchema.visitorHistory.visitorId, visitorId))
      .orderBy(desc(isolatedSchema.visitorHistory.checkInTime));
  }
  
  async deleteVisitor(context: CustomerContext, id: string): Promise<boolean> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    try {
      const result = await db
        .delete(isolatedSchema.visitors)
        .where(eq(isolatedSchema.visitors.id, id))
        .returning();
      
      return result.length > 0;
    } catch (error) {
      console.error(`❌ Failed to delete visitor ${id}:`, error);
      return false;
    }
  }

  async findExistingVisitor(
    context: CustomerContext, 
    firstName: string, 
    lastName: string, 
    company?: string
  ): Promise<Visitor | undefined> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const whereConditions = [
      eq(isolatedSchema.visitors.firstName, firstName),
      eq(isolatedSchema.visitors.lastName, lastName)
    ];
    
    if (company) {
      whereConditions.push(eq(isolatedSchema.visitors.company, company));
    }
    
    const [visitor] = await db
      .select()
      .from(isolatedSchema.visitors)
      .where(and(...whereConditions))
      .orderBy(desc(isolatedSchema.visitors.checkedInAt))
      .limit(1);
    
    return visitor;
  }

  async checkInExistingVisitor(
    context: CustomerContext, 
    id: string, 
    updates: {
      hostStaffId?: string;
      purpose?: string;
      carRegistration?: string;
      hsRulesAcceptanceToken?: string;
    }
  ): Promise<Visitor | undefined> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const checkInTime = new Date();
    const updated = await db
      .update(isolatedSchema.visitors)
      .set({ 
        isCheckedIn: true,
        checkedInAt: checkInTime,
        checkedOutAt: null,
        hostStaffId: updates.hostStaffId,
        purpose: updates.purpose || '',
        carRegistration: updates.carRegistration,
        hsRulesAcceptanceToken: updates.hsRulesAcceptanceToken,
        updatedAt: new Date()
      })
      .where(eq(isolatedSchema.visitors.id, id))
      .returning();
    
    const visitor = updated[0];
    
    // Create visitor history record for returning visitor check-in
    if (visitor) {
      await this.createVisitorHistory(context, {
        visitorId: visitor.id,
        checkInTime: checkInTime,
        checkOutTime: null,
        purpose: visitor.purpose || '',
        hostStaffId: visitor.hostStaffId,

        inductionCompleted: visitor.inductionCompleted || false,
        inductionCompletedAt: visitor.inductionCompletedAt,
        hsRulesAccepted: visitor.hsRulesAccepted || false,
        hsRulesAcceptedAt: visitor.hsRulesAcceptedAt,
        ePassSent: visitor.ePassSent || false,
        ePassSentAt: visitor.ePassSentAt,
        checkoutType: null,
        notes: visitor.notes,
        qrCode: visitor.qrCode
      });
    }
    
    return visitor;
  }

  /**
   * DEPARTMENT METHODS - Customer Isolated
   */
  async getAllDepartments(context: CustomerContext): Promise<Department[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    // No customerId filter needed in isolated database - each customer has their own DB
    return await db
      .select()
      .from(isolatedSchema.departments)
      .where(eq(isolatedSchema.departments.isActive, true));
  }

  async getDepartmentNames(context: CustomerContext): Promise<string[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    // No customerId filter needed in isolated database - each customer has their own DB
    const departments = await db
      .select({ name: isolatedSchema.departments.name })
      .from(isolatedSchema.departments)
      .where(eq(isolatedSchema.departments.isActive, true));
      
    return departments.map(dept => dept.name);
  }

  /**
   * STAFF TIME & ATTENDANCE METHODS - Customer Isolated
   */
  async getStaffTimeAndAttendance(context: CustomerContext, dateFrom?: Date, dateTo?: Date): Promise<Array<{
    staffId: string;
    staffName: string;
    department: string;
    sessions: Array<{
      checkInTime: Date;
      checkOutTime: Date | null;
      hoursWorked: number;
      isManual: boolean;
    }>;
    totalHours: number;
  }>> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const fromDate = dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default to last 30 days
    const toDate = dateTo || new Date();
    
    // Get all staff for the customer
    const staff = await db
      .select()
      .from(isolatedSchema.staff)
      .where(eq(isolatedSchema.staff.isActive, true));
    
    // Get session history for the date range
    const sessionHistory = await db
      .select()
      .from(isolatedSchema.staffSessions)
      .where(and(
        gte(isolatedSchema.staffSessions.checkInTime, fromDate),
        lte(isolatedSchema.staffSessions.checkInTime, toDate)
      ))
      .orderBy(asc(isolatedSchema.staffSessions.checkInTime));
    
    // Group session records by staff ID
    const sessionsByStaff = new Map<string, typeof sessionHistory>();
    sessionHistory.forEach(record => {
      const staffRecords = sessionsByStaff.get(record.staffId) || [];
      staffRecords.push(record);
      sessionsByStaff.set(record.staffId, staffRecords);
    });
    
    return staff.map(staffMember => {
      const staffSessions = sessionsByStaff.get(staffMember.id) || [];
      
      const sessions: Array<{
        checkInTime: Date;
        checkOutTime: Date | null;
        hoursWorked: number;
        isManual: boolean;
      }> = staffSessions.map(record => {
        const hoursWorked = record.checkOutTime 
          ? (record.checkOutTime.getTime() - record.checkInTime.getTime()) / (1000 * 60 * 60)
          : (Date.now() - record.checkInTime.getTime()) / (1000 * 60 * 60);
        
        return {
          checkInTime: record.checkInTime,
          checkOutTime: record.checkOutTime,
          hoursWorked,
          isManual: record.isManual,
        };
      });
      
      const totalHours = sessions.reduce((sum, session) => sum + session.hoursWorked, 0);
      
      return {
        staffId: staffMember.id,
        staffName: `${staffMember.firstName} ${staffMember.lastName}`,
        department: staffMember.department,
        sessions,
        totalHours,
      };
    })
    .filter(record => record.sessions.length > 0) // Only return staff with time records
    .sort((a, b) => a.staffName.localeCompare(b.staffName));
  }

  async createDepartment(context: CustomerContext, insertDepartment: InsertDepartment): Promise<Department> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const created = await db
      .insert(isolatedSchema.departments)
      .values({
        ...insertDepartment,
      })
      .returning();
    
    return created[0];
  }

  async updateDepartment(context: CustomerContext, id: string, updates: Partial<InsertDepartment>): Promise<Department | undefined> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const updated = await db
      .update(isolatedSchema.departments)
      .set(updates)
      .where(eq(isolatedSchema.departments.id, id))
      .returning();
    
    return updated[0];
  }

  async deleteDepartment(context: CustomerContext, id: string): Promise<boolean> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const result = await db
      .delete(isolatedSchema.departments)
      .where(eq(isolatedSchema.departments.id, id))
      .returning();
    
    return result.length > 0;
  }

  /**
   * USER METHODS - Customer Isolated
   */
  async getUserByUsername(context: CustomerContext, username: string): Promise<User | undefined> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const users = await db
      .select()
      .from(isolatedSchema.users)
      .where(eq(isolatedSchema.users.username, username))
      .limit(1);
    
    return users[0];
  }

  async getUserByEmail(context: CustomerContext, email: string): Promise<User | undefined> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const users = await db
      .select()
      .from(isolatedSchema.users)
      .where(eq(isolatedSchema.users.email, email))
      .limit(1);
    
    return users[0];
  }

  async createUser(context: CustomerContext, insertUser: InsertUser): Promise<User> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    // Hash password
    const hashedPassword = await bcrypt.hash(insertUser.password, 10);
    
    const created = await db
      .insert(isolatedSchema.users)
      .values({
        ...insertUser,
        password: hashedPassword,
      })
      .returning();
    
    return created[0];
  }

  async getAllUsers(context: CustomerContext): Promise<User[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    return await db
      .select()
      .from(isolatedSchema.users)
      .orderBy(isolatedSchema.users.username);
  }

  async deleteUser(context: CustomerContext, userId: string): Promise<boolean> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const deleted = await db
      .delete(isolatedSchema.users)
      .where(eq(isolatedSchema.users.id, userId))
      .returning();
    
    return deleted.length > 0;
  }

  async updateUser(context: CustomerContext, userId: string, updateData: Partial<InsertUser>): Promise<User | undefined> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    // If password is provided, hash it
    const dataToUpdate: any = { ...updateData };
    if (updateData.password) {
      dataToUpdate.password = await bcrypt.hash(updateData.password, 10);
    }
    
    const updated = await db
      .update(isolatedSchema.users)
      .set(dataToUpdate)
      .where(eq(isolatedSchema.users.id, userId))
      .returning();
    
    return updated[0];
  }

  /**
   * USER INVITATION METHODS - Customer Isolated
   */
  async getPendingInvitations(context: CustomerContext) {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const now = new Date();
    return await db
      .select()
      .from(isolatedSchema.userInvitations)
      .where(
        and(
          eq(isolatedSchema.userInvitations.used, false),
          gte(isolatedSchema.userInvitations.expires, now)
        )
      )
      .orderBy(desc(isolatedSchema.userInvitations.createdAt));
  }

  async deleteInvitation(context: CustomerContext, invitationId: string): Promise<boolean> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const deleted = await db
      .delete(isolatedSchema.userInvitations)
      .where(eq(isolatedSchema.userInvitations.id, invitationId))
      .returning();
    
    return deleted.length > 0;
  }

  /**
   * STAFF HELPER METHODS - Customer Isolated
   */
  async getCheckedInStaff(context: CustomerContext): Promise<Staff[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    // No customerId filter needed - each customer has their own database
    return await db
      .select()
      .from(isolatedSchema.staff)
      .where(eq(isolatedSchema.staff.isCheckedIn, true))
      .orderBy(desc(isolatedSchema.staff.checkedInAt));
  }

  /**
   * ANALYTICS METHODS - Customer Isolated  
   */
  async getDepartmentAnalytics(context: CustomerContext): Promise<any[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    // Get department analytics with visitor counts
    // No customerId filters needed - each customer has their own database
    try {
      const results = await db
        .select({
          department: isolatedSchema.staff.department,
          visitorCount: sql<number>`COUNT(DISTINCT ${isolatedSchema.visitors.id})`,
          staffCount: sql<number>`COUNT(DISTINCT ${isolatedSchema.staff.id})`
        })
        .from(isolatedSchema.staff)
        .leftJoin(isolatedSchema.visitors, eq(isolatedSchema.visitors.hostStaffId, isolatedSchema.staff.id))
        .where(isolatedSchema.staff.department != null) // Filter out null departments
        .groupBy(isolatedSchema.staff.department)
        .orderBy(sql`COUNT(DISTINCT ${isolatedSchema.visitors.id}) DESC`);
      
      console.log(`📊 Department analytics fetched: ${results.length} departments`);
      return results;
    } catch (error) {
      console.error('❌ Department analytics error:', error);
      throw error;
    }
  }

  async getDepartmentDetails(context: CustomerContext, departmentName: string): Promise<{
    department: string;
    staff: any[];
    visitors: any[];
    totalHours: number;
    recentActivity: any[];
  }> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    // Get staff in department (no customerId filter needed)
    const staff = await db
      .select()
      .from(isolatedSchema.staff)
      .where(eq(isolatedSchema.staff.department, departmentName));
    
    // Get visitors hosted by staff in this department
    const visitors = await db
      .select({
        id: isolatedSchema.visitors.id,
        firstName: isolatedSchema.visitors.firstName,
        lastName: isolatedSchema.visitors.lastName,
        company: isolatedSchema.visitors.company,
        checkedInAt: isolatedSchema.visitors.checkedInAt,
        isCheckedIn: isolatedSchema.visitors.isCheckedIn,
        hostName: sql<string>`${isolatedSchema.staff.firstName} || ' ' || ${isolatedSchema.staff.lastName}`
      })
      .from(isolatedSchema.visitors)
      .innerJoin(isolatedSchema.staff, and(
        eq(isolatedSchema.visitors.hostStaffId, isolatedSchema.staff.id),
        eq(isolatedSchema.staff.department, departmentName)
      ))
      // No customerId filter needed - each customer has their own database
      .orderBy(desc(isolatedSchema.visitors.checkedInAt))
      .limit(10);
    
    // Calculate total hours worked by department today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const hoursData = await db
      .select({
        totalMinutes: sql<number>`SUM(EXTRACT(EPOCH FROM COALESCE(check_out_time, NOW()) - check_in_time) / 60)`
      })
      .from(isolatedSchema.staffSessions)
      .innerJoin(isolatedSchema.staff, eq(isolatedSchema.staffSessions.staffId, isolatedSchema.staff.id))
      .where(and(
        eq(isolatedSchema.staff.department, departmentName),
        gte(isolatedSchema.staffSessions.checkInTime, today)
      ));
    
    const totalHours = hoursData[0]?.totalMinutes ? hoursData[0].totalMinutes / 60 : 0;
    
    // Get recent activity (last 5 check-ins/outs)
    const recentActivity = await db
      .select({
        type: sql<string>`'staff'`,
        name: sql<string>`${isolatedSchema.staff.firstName} || ' ' || ${isolatedSchema.staff.lastName}`,
        action: sql<string>`CASE WHEN ${isolatedSchema.staffSessions.checkOutTime} IS NULL THEN 'Checked In' ELSE 'Checked Out' END`,
        time: sql<Date>`COALESCE(${isolatedSchema.staffSessions.checkOutTime}, ${isolatedSchema.staffSessions.checkInTime})`
      })
      .from(isolatedSchema.staffSessions)
      .innerJoin(isolatedSchema.staff, eq(isolatedSchema.staffSessions.staffId, isolatedSchema.staff.id))
      .where(eq(isolatedSchema.staff.department, departmentName))
      .orderBy(desc(sql`COALESCE(${isolatedSchema.staffSessions.checkOutTime}, ${isolatedSchema.staffSessions.checkInTime})`))
      .limit(5);
    
    // Count checked-in staff
    const checkedInStaff = staff.filter(s => s.isCheckedIn).length;
    const checkedInVisitors = visitors.filter(v => v.isCheckedIn).length;
    
    return {
      department: departmentName,
      staffMembers: staff,
      visitors,
      statistics: {
        checkedInStaff,
        visitors: checkedInVisitors,
        totalHours
      },
      recentActivity
    };
  }

  /**
   * STATISTICS METHODS - Customer Isolated
   */
  async getStats(context: CustomerContext): Promise<{
    currentVisitors: number;
    todayCheckins: number;
    staffOnSite: number;
    totalStaff: number;
    contractorsOnSite: number;
    totalPeople: number;
  }> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    // Get current visitors count
    const currentVisitorsResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(isolatedSchema.visitors)
      .where(eq(isolatedSchema.visitors.isCheckedIn, true));
    
    // Get today's check-ins
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const todayCheckinsResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(isolatedSchema.visitors)
      .where(and(
        gte(isolatedSchema.visitors.checkedInAt, today),
        lt(isolatedSchema.visitors.checkedInAt, tomorrow)
      ));
    
    // Get staff on site
    const staffOnSiteResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(isolatedSchema.staff)
      .where(eq(isolatedSchema.staff.isCheckedIn, true));
    
    // Get checked-in contractors count directly from contractor_workers table
    const contractorsOnSiteResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(isolatedSchema.contractorWorkers)
      .where(eq(isolatedSchema.contractorWorkers.isCheckedIn, true));
    
    // Get total staff
    const totalStaffResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(isolatedSchema.staff)
      .where(eq(isolatedSchema.staff.isActive, true));
    
    const currentVisitors = parseInt(String(currentVisitorsResult[0]?.count)) || 0;
    const staffOnSite = parseInt(String(staffOnSiteResult[0]?.count)) || 0;
    const contractorsOnSite = parseInt(String(contractorsOnSiteResult[0]?.count)) || 0;
    
    return {
      currentVisitors,
      todayCheckins: parseInt(String(todayCheckinsResult[0]?.count)) || 0,
      staffOnSite,
      totalStaff: parseInt(String(totalStaffResult[0]?.count)) || 0,
      contractorsOnSite,
      totalPeople: currentVisitors + staffOnSite + contractorsOnSite
    };
  }

  /**
   * Get peak hours analytics for visitor patterns - Customer Isolated
   */
  async getPeakHoursAnalytics(context: CustomerContext): Promise<any[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    // Get hourly visitor check-in patterns for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // No customerId filters needed - each customer has their own database
    const hourlyData = await db
      .select({
        hour: sql<number>`EXTRACT(HOUR FROM ${isolatedSchema.visitors.checkedInAt})`,
        count: sql<number>`COUNT(*)`
      })
      .from(isolatedSchema.visitors)
      .where(and(
        gte(isolatedSchema.visitors.checkedInAt, today),
        lt(isolatedSchema.visitors.checkedInAt, tomorrow)
      ))
      .groupBy(sql`EXTRACT(HOUR FROM ${isolatedSchema.visitors.checkedInAt})`)
      .orderBy(sql`EXTRACT(HOUR FROM ${isolatedSchema.visitors.checkedInAt})`);

    return hourlyData.map(item => ({
      hour: parseInt(String(item.hour)),
      count: parseInt(String(item.count))
    }));
  }

  /**
   * USER AUTHENTICATION METHODS - Customer Isolated
   */
  async getUser(context: CustomerContext, userId: string): Promise<User | undefined> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    // No customerId filter needed - each customer has their own database
    const [user] = await db
      .select()
      .from(isolatedSchema.users)
      .where(eq(isolatedSchema.users.id, userId));
    
    return user || undefined;
  }

  async authenticateUser(context: CustomerContext, username: string, password: string): Promise<User | null> {
    try {
      const user = await this.getUserByUsername(context, username);
      if (!user) {
        return null;
      }

      const isValid = await this.verifyPassword(password, user.password);
      if (!isValid) {
        return null;
      }

      return user;
    } catch (error) {
      console.error('Authentication error:', error);
      return null;
    }
  }

  async authenticateStaff(context: CustomerContext, email: string, password: string): Promise<Staff | null> {
    try {
      const db = await customerDbService.getCustomerDatabase(context.customerId);
      
      // No customerId filter needed - each customer has their own database
      const [staff] = await db
        .select()
        .from(isolatedSchema.staff)
        .where(eq(isolatedSchema.staff.email, email));
      
      if (!staff || !staff.password) {
        return null;
      }

      const isValid = await this.verifyPassword(password, staff.password);
      if (!isValid) {
        return null;
      }

      return staff;
    } catch (error) {
      console.error('Staff authentication error:', error);
      return null;
    }
  }

  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    const bcrypt = await import('bcryptjs');
    return bcrypt.compare(password, hash);
  }

  /**
   * EMERGENCY SYSTEM METHODS - Customer Isolated
   */
  async validateEmergencyToken(context: CustomerContext, token: string): Promise<Staff | null> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const [staff] = await db
      .select()
      .from(isolatedSchema.staff)
      .where(and(
        eq(isolatedSchema.staff.emergencyToken, token),
        gt(isolatedSchema.staff.emergencyTokenExpires, new Date())
      ));
    
    return staff || null;
  }

  async toggleStaffAccountedStatus(context: CustomerContext, id: string): Promise<boolean> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const [staff] = await db
      .select()
      .from(isolatedSchema.staff)
      .where(eq(isolatedSchema.staff.id, id));
    
    if (!staff) return false;
    
    await db
      .update(isolatedSchema.staff)
      .set({ isAccountedFor: !staff.isAccountedFor })
      .where(eq(isolatedSchema.staff.id, id));
    
    return true;
  }

  async toggleVisitorAccountedStatus(context: CustomerContext, id: string): Promise<boolean> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const [visitor] = await db
      .select()
      .from(isolatedSchema.visitors)
      .where(eq(isolatedSchema.visitors.id, id));
    
    if (!visitor) return false;
    
    await db
      .update(isolatedSchema.visitors)
      .set({ isAccountedFor: !visitor.isAccountedFor })
      .where(eq(isolatedSchema.visitors.id, id));
    
    return true;
  }

  async toggleContractorAccountedStatus(context: CustomerContext, id: string): Promise<boolean> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const [worker] = await db
      .select()
      .from(isolatedSchema.contractorWorkers)
      .where(eq(isolatedSchema.contractorWorkers.id, id));
    
    if (!worker) return false;
    
    await db
      .update(isolatedSchema.contractorWorkers)
      .set({ isAccountedFor: !worker.isAccountedFor })
      .where(eq(isolatedSchema.contractorWorkers.id, id));
    
    return true;
  }

  // Mark person as accounted for during evacuation - updates staff or visitor
  async markPersonAccountedFor(
    context: CustomerContext,
    personId: string,
    data: {
      isAccountedFor: boolean;
      accountedBy: string;
      accountedAt: Date;
      musterPoint: string;
    }
  ): Promise<boolean> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    // Try to update as staff first
    const [updatedStaff] = await db
      .update(isolatedSchema.staff)
      .set({
        isAccountedFor: data.isAccountedFor,
        // Note: staff table doesn't have accountedBy, accountedAt, musterPoint columns
        // These would need to be added to the schema if you want to track them
      })
      .where(eq(isolatedSchema.staff.id, personId))
      .returning();
    
    if (updatedStaff) return true;
    
    // Try to update as visitor
    const [updatedVisitor] = await db
      .update(isolatedSchema.visitors)
      .set({
        isAccountedFor: data.isAccountedFor,
        // Note: visitors table doesn't have accountedBy, accountedAt, musterPoint columns
        // These would need to be added to the schema if you want to track them
      })
      .where(eq(isolatedSchema.visitors.id, personId))
      .returning();
    
    return !!updatedVisitor;
  }

  // Duplicate functions removed - using original implementations

  async getCheckedInContractors(context: CustomerContext): Promise<any[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    try {
      const checkedInWorkers = await db
        .select({
          id: isolatedSchema.contractorWorkers.id,
          firstName: isolatedSchema.contractorWorkers.firstName,
          lastName: isolatedSchema.contractorWorkers.lastName,
          email: isolatedSchema.contractorWorkers.email,
          isCheckedIn: isolatedSchema.contractorWorkers.isCheckedIn,
          isAccountedFor: isolatedSchema.contractorWorkers.isAccountedFor,
          checkedInAt: isolatedSchema.contractorWorkers.checkedInAt,
          hsRulesAccepted: isolatedSchema.contractorWorkers.hsRulesAccepted,
          hsRulesAcceptedAt: isolatedSchema.contractorWorkers.hsRulesAcceptedAt,
          currentCardStatus: isolatedSchema.contractorWorkers.currentCardStatus,
          companyId: isolatedSchema.contractorWorkers.companyId,
          needsEvacuationAssistance: isolatedSchema.contractorWorkers.needsEvacuationAssistance,
          companyName: isolatedSchema.contractorCompanies.companyName,
          contactEmail: isolatedSchema.contractorCompanies.contactEmail,
          contactPhone: isolatedSchema.contractorCompanies.contactPhone,
        })
        .from(isolatedSchema.contractorWorkers)
        .leftJoin(
          isolatedSchema.contractorCompanies,
          eq(isolatedSchema.contractorWorkers.companyId, isolatedSchema.contractorCompanies.id)
        )
        .where(eq(isolatedSchema.contractorWorkers.isCheckedIn, true));

      console.log(`✅ CHECKED-IN CONTRACTORS: Found ${checkedInWorkers.length} workers currently checked in`);
      
      return checkedInWorkers.map(w => ({
        ...w,
        companyName: w.companyName || 'Unknown Company',
        company: w.companyName || 'Unknown Company',
      }));
    } catch (error) {
      console.error("❌ Error getting checked-in contractors:", error);
      return [];
    }
  }

  async createContractorCompany(context: CustomerContext, insertCompany: any): Promise<any> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const [newCompany] = await db
      .insert(isolatedSchema.contractorCompanies)
      .values({
        ...insertCompany,
        // No customerId needed - isolated database
      })
      .returning();
    
    return newCompany;
  }

  async getWorkersByCompanyId(context: CustomerContext, companyId: string): Promise<ContractorWorker[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    try {
      // First verify the company exists (no customer filter needed in isolated DB)
      const company = await db
        .select()
        .from(isolatedSchema.contractorCompanies)
        .where(eq(isolatedSchema.contractorCompanies.id, companyId));
      
      if (company.length === 0) {
        return []; // Company doesn't exist or doesn't belong to this customer
      }
      
      // Get raw worker data
      const workers = await db
        .select()
        .from(isolatedSchema.contractorWorkers)
        .where(eq(isolatedSchema.contractorWorkers.companyId, companyId))
        .orderBy(asc(isolatedSchema.contractorWorkers.firstName), asc(isolatedSchema.contractorWorkers.lastName));
      
      
      // Map each worker using the same logic as getContractorWorkerById
      const mappedWorkers = workers.map(worker => {
        
        // FIXED: Properly map database fields to frontend format with correct field names
        const mappedWorker = {
          id: worker.id,
          companyId: worker.companyId,
          firstName: worker.firstName,
          lastName: worker.lastName,
          email: worker.email,
          phoneNumber: worker.phoneNumber,
          mobileNumber: worker.mobileNumber,
          homeAddress: worker.homeAddress,
          postcode: worker.postcode,
          dateOfBirth: worker.dateOfBirth,
          nationalInsuranceNumber: worker.nationalInsuranceNumber,
          photoUrl: worker.photoUrl,
          jobTitle: worker.jobTitle,
          department: worker.department,
          skillsAndCertifications: worker.skillsAndCertifications || [],
          emergencyContactName: worker.emergencyContactName,
          emergencyContactPhone: worker.emergencyContactPhone,
          emergencyContactRelationship: worker.emergencyContactRelationship,
          isCheckedIn: worker.isCheckedIn || false,
          checkedInAt: worker.checkedInAt,
          checkedOutAt: worker.checkedOutAt,
          checkoutType: worker.checkoutType,
          lastVisitDate: worker.lastVisitDate,
          visitCount: worker.visitCount || 0,
          isAccountedFor: worker.isAccountedFor || false,
          rightToWork: worker.rightToWork || 'pending',
          rightToWorkDocumentType: worker.rightToWorkDocumentType,
          rightToWorkDocumentNumber: worker.rightToWorkDocumentNumber,
          rightToWorkExpiryDate: worker.rightToWorkExpiryDate,
          rightToWorkVerifiedBy: worker.rightToWorkVerifiedBy,
          rightToWorkVerifiedAt: worker.rightToWorkVerifiedAt,
          rightToWorkDocumentUrl: worker.rightToWorkDocumentUrl,
          workingPattern: worker.workingPattern || 'full_time',
          hourlyRate: worker.hourlyRate,
          startDate: worker.startDate,
          expectedEndDate: worker.expectedEndDate,
          hasOccupationalHealthClearance: worker.hasOccupationalHealthClearance || false,
          occupationalHealthExpiryDate: worker.occupationalHealthExpiryDate,
          medicalRestrictions: worker.medicalRestrictions,
          siteInductionRequired: worker.siteInductionRequired ?? true,
          siteInductionCompleted: worker.siteInductionCompleted || false,
          siteInductionCompletedAt: worker.siteInductionCompletedAt,
          siteInductionExpiryDate: worker.siteInductionExpiryDate,
          toolboxTalkCompleted: worker.toolboxTalkCompleted || false,
          toolboxTalkCompletedAt: worker.toolboxTalkCompletedAt,
          cscsCard: worker.cscsCard || '',
          cscsStatus: worker.cscsStatus || 'pending',
          ipafStatus: worker.ipafStatus || 'none',
          asbestosAwareness: worker.asbestosAwareness || false,
          manualHandling: worker.manualHandling || false,
          workingAtHeight: worker.workingAtHeight || false,
          transportMethod: worker.transportMethod || 'car_diesel',
          workerStatus: worker.workerStatus || 'pending',
          approvedBy: worker.approvedBy,
          approvedAt: worker.approvedAt,
          suspendedReason: worker.suspendedReason,
          bannedUntil: worker.bannedUntil,
          aiRiskScore: worker.aiRiskScore || 0,
          riskFactors: worker.riskFactors || [],
          lastRiskAssessment: worker.lastRiskAssessment,
          documentsComplete: worker.documentsComplete || false,
          documentsLastChecked: worker.documentsLastChecked,
          complianceScore: worker.complianceScore || 0,
          isActive: worker.isActive ?? true,
          createdAt: worker.createdAt || new Date(),
          updatedAt: worker.updatedAt || new Date(),
          // CRITICAL FIX: Calculate currentCardStatus if missing  
          currentCardStatus: worker.currentCardStatus || this.calculateWorkerCardStatus(worker),
          // CRITICAL FIX: Map frontend compatibility fields
          inductionCompleted: worker.siteInductionCompleted || false,
          phone: worker.phoneNumber,
          needsEvacuationAssistance: worker.needsEvacuationAssistance ?? false,
        } as ContractorWorker;
        
        
        return mappedWorker;
      });
      
      return mappedWorkers;
    } catch (error) {
      console.error('Error getting workers by company ID:', error);
      return [];
    }
  }

  async getContractorVisitHistory(context: CustomerContext, workerId: string): Promise<any[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    try {
      // Query contractor visits for this worker
      const visits = await db
        .select()
        .from(isolatedSchema.contractorVisits)
        .where(eq(isolatedSchema.contractorVisits.workerId, workerId))
        .orderBy(desc(isolatedSchema.contractorVisits.checkedInAt));
      
      console.log(`📋 Found ${visits.length} visit records for worker ${workerId}`);
      return visits;
    } catch (error) {
      console.error("Error querying contractor visits:", error);
      return [];
    }
  }

  async createContractorVisit(context: CustomerContext, visitData: any): Promise<any> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    try {
      const [newVisit] = await db
        .insert(isolatedSchema.contractorVisits)
        .values(visitData)
        .returning();
      
      console.log(`📋 Created visit record for worker ${visitData.workerId}`);
      return newVisit;
    } catch (error) {
      console.error("Error creating contractor visit:", error);
      throw error;
    }
  }

  async updateContractorVisit(context: CustomerContext, visitId: string, updates: any): Promise<any> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    try {
      const [updatedVisit] = await db
        .update(isolatedSchema.contractorVisits)
        .set(updates)
        .where(eq(isolatedSchema.contractorVisits.id, visitId))
        .returning();
      
      console.log(`📋 Updated visit record ${visitId}`);
      return updatedVisit;
    } catch (error) {
      console.error("Error updating contractor visit:", error);
      throw error;
    }
  }

  async getCurrentContractorVisit(context: CustomerContext, workerId: string): Promise<any> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    try {
      const [currentVisit] = await db
        .select()
        .from(isolatedSchema.contractorVisits)
        .where(and(
          eq(isolatedSchema.contractorVisits.workerId, workerId),
          isNull(isolatedSchema.contractorVisits.checkedOutAt)
        ))
        .orderBy(desc(isolatedSchema.contractorVisits.checkedInAt))
        .limit(1);
      
      return currentVisit || null;
    } catch (error) {
      console.error("Error getting current contractor visit:", error);
      return null;
    }
  }

  async createContractorWorker(context: CustomerContext, insertWorker: any): Promise<any> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    // Verify the company exists in this customer database
    const company = await db
      .select()
      .from(isolatedSchema.contractorCompanies)
      .where(eq(isolatedSchema.contractorCompanies.id, insertWorker.companyId));
    
    if (company.length === 0) {
      throw new Error('Company not found or access denied');
    }
    
    const [newWorker] = await db
      .insert(isolatedSchema.contractorWorkers)
      .values(insertWorker)
      .returning();
    
    return newWorker;
  }

  async updateContractorCompany(context: CustomerContext, companyId: string, updates: any): Promise<any> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const [updatedCompany] = await db
      .update(isolatedSchema.contractorCompanies)
      .set(updates)
      .where(eq(isolatedSchema.contractorCompanies.id, companyId))
      .returning();
    
    return updatedCompany;
  }

  async getAllContractorCompanies(context: CustomerContext): Promise<any[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    // Get all contractor companies
    const companies = await db
      .select()
      .from(isolatedSchema.contractorCompanies);
    
    // For each company, count workers and get document status
    const companiesWithCounts = await Promise.all(
      companies.map(async (company) => {
        const workersCount = await db
          .select({ count: sql<number>`count(*)` })
          .from(isolatedSchema.contractorWorkers)
          .where(eq(isolatedSchema.contractorWorkers.companyId, company.id));
        
        return {
          ...company,
          // Map database fields to frontend expected fields
          name: company.companyName, // Map companyName from DB to name for frontend
          email: company.contactEmail, // Map contactEmail from DB to email for frontend
          phone: company.contactPhone, // Map contactPhone from DB to phone for frontend
          workersCount: parseInt(String(workersCount[0]?.count)) || 0,
          documentsStatus: {} // Empty for now since documents system is optional
        };
      })
    );
    
    return companiesWithCounts;
  }

  async getVisitorById(context: CustomerContext, id: string): Promise<Visitor | undefined> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const [visitor] = await db
      .select()
      .from(isolatedSchema.visitors)
      .where(eq(isolatedSchema.visitors.id, id));
    
    return visitor || undefined;
  }

  async getVisitorByQrCode(context: CustomerContext, qrCode: string): Promise<Visitor | undefined> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const [visitor] = await db
      .select()
      .from(isolatedSchema.visitors)
      .where(eq(isolatedSchema.visitors.qrCode, qrCode));
    
    return visitor || undefined;
  }


  async getAllReports(context: CustomerContext): Promise<any[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    // TODO: Add customer isolation when reports schema is updated with customerId
    return await db
      .select()
      .from(isolatedSchema.reports);
  }

  // Card Offences Methods - Customer Isolated
  async getAllCardOffences(context: CustomerContext): Promise<any[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    // In isolated customer databases, no customerId filter needed
    return await db
      .select()
      .from(isolatedSchema.cardOffences)
      .orderBy(isolatedSchema.cardOffences.cardType, isolatedSchema.cardOffences.offenceName);
  }

  // Get all contractor workers for current customer 
  async getAllContractorWorkers(context: CustomerContext): Promise<ContractorWorker[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const companies = await db
      .select()
      .from(isolatedSchema.contractorCompanies);
    
    if (companies.length === 0) {
      return [];
    }
    
    const companyIds = companies.map(c => c.id);
    
    const workers = await db
      .select()
      .from(isolatedSchema.contractorWorkers)
      .where(inArray(isolatedSchema.contractorWorkers.companyId, companyIds))
      .orderBy(asc(isolatedSchema.contractorWorkers.firstName));

    return workers.map(worker => ({
      ...worker,
      currentCardStatus: worker.currentCardStatus || this.calculateWorkerCardStatus(worker),
      inductionCompleted: worker.siteInductionCompleted || false,
      phone: worker.phoneNumber,
      rightToWork: worker.rightToWork || 'pending',
      cscsCard: worker.cscsCard || '',
      cscsStatus: worker.cscsStatus || 'pending',
      ipafStatus: worker.ipafStatus || 'none',
      asbestosAwareness: worker.asbestosAwareness || false,
      manualHandling: worker.manualHandling || false,
      transportMethod: worker.transportMethod || 'car_diesel',
      isActive: worker.isActive ?? true,
    } as ContractorWorker));
  }

  // Card issues methods
  async createCardIssue(context: CustomerContext, data: InsertCardIssue): Promise<CardIssue> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    console.log("🔴 Creating customer card issue with data:", data);
    
    const cardIssueData = {
      id: randomUUID(),
      workerId: data.workerId,
      offenceId: data.offenceId,
      cardType: data.cardType,
      issuedBy: data.issuedBy,
      description: data.description,
      witness: data.witness || null,
      location: data.location || null,
      issuedAt: data.issuedAt || new Date(),
      photos: data.photos || [],
      status: data.status || "active"
    };
    
    console.log("🔴 Final customer card issue data:", cardIssueData);
    
    const [issue] = await db.insert(isolatedSchema.cardIssues).values(cardIssueData).returning();
    
    // Update worker's card status
    await this.updateWorkerCardStatus(context, data.workerId, data.cardType as "red" | "yellow", data.issuedBy);
    
    return issue;
  }

  // Update worker's current card status
  async updateWorkerCardStatus(context: CustomerContext, workerId: string, cardType: "red" | "yellow", updatedBy: string): Promise<void> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const updateData: any = {
      currentCardStatus: cardType,
      cardStatusUpdatedAt: new Date(),
      cardStatusUpdatedBy: updatedBy,
    };

    // If red card, set 3-year ban
    if (cardType === "red") {
      const banEndDate = new Date();
      banEndDate.setFullYear(banEndDate.getFullYear() + 3);
      updateData.redCardBanUntil = banEndDate;
    }

    console.log(`🔴 Updating worker ${workerId} card status to ${cardType}`);

    await db
      .update(isolatedSchema.contractorWorkers)
      .set(updateData)
      .where(eq(isolatedSchema.contractorWorkers.id, workerId));
      
    console.log(`✅ Worker card status updated successfully`);
  }

  async seedCustomerCardOffences(context: CustomerContext): Promise<void> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    try {
      // Check if offences already exist in this customer database
      const existingOffences = await db
        .select()
        .from(isolatedSchema.cardOffences)
        .limit(1);
      
      if (existingOffences.length > 0) {
        return; // Already seeded for this customer
      }

      // Red Card Offences — standard UK contractor safety violations
      const redCardOffences = [
        { offenceName: "Unsafe work at height", offenceDescription: "Working at height without proper safety measures, harness, or edge protection" },
        { offenceName: "Drugs and alcohol abuse", offenceDescription: "Being under the influence of substances on site — immediate ban" },
        { offenceName: "Flagrant disregard for the safety method statement", offenceDescription: "Intentional violation of established safety procedures" },
        { offenceName: "Working within unsafe excavations or confined spaces", offenceDescription: "Entering hazardous excavations or confined spaces without authorisation" },
        { offenceName: "Misuse of scaffolding or access equipment", offenceDescription: "Improper use of scaffolding, ladders, or access equipment in a dangerous manner" },
        { offenceName: "Unauthorised use of plant or machinery", offenceDescription: "Operating plant or machinery without permission or required qualification" },
        { offenceName: "Misuse of fire prevention equipment", offenceDescription: "Tampering with or misusing fire extinguishers, alarms or suppression systems" },
        { offenceName: "Unauthorised work on asbestos-containing materials", offenceDescription: "Working with asbestos without proper training, licence, or PPE" },
        { offenceName: "Operating plant while using a mobile phone", offenceDescription: "Using a mobile phone while operating plant, forklift, or moving machinery" },
        { offenceName: "Abuse of or putting the public at risk", offenceDescription: "Behaviour that endangers public safety or members of the public near the site" },
        { offenceName: "Illegal discharges into drainage or water courses", offenceDescription: "Environmental contamination — discharge of chemicals, fuel or waste into drains" },
        { offenceName: "Violence or threatening behaviour", offenceDescription: "Physical or verbal violence towards colleagues, visitors or the public" },
        { offenceName: "Theft on site", offenceDescription: "Theft of materials, tools, equipment or personal property on site" },
      ];

      // Yellow Card Offences
      const yellowCardOffences = [
        { offenceName: "Not wearing a hard hat", offenceDescription: "Failure to wear required head protection in a mandatory hat zone" },
        { offenceName: "Not wearing safety footwear", offenceDescription: "Improper or missing safety boots / steel toe-capped footwear" },
        { offenceName: "Incorrect use of PPE", offenceDescription: "Misuse, modification, or failure to wear required personal protective equipment" },
        { offenceName: "Not wearing high-visibility clothing", offenceDescription: "Failure to wear hi-vis vest or jacket in a mandatory zone" },
        { offenceName: "Misuse of lifting appliances or equipment", offenceDescription: "Improper use of lifting slings, chains, straps or hoists" },
        { offenceName: "Misuse of tools or equipment", offenceDescription: "Incorrect, unsafe, or unauthorised handling of work tools and equipment" },
        { offenceName: "Use of mobile phone in unsafe areas", offenceDescription: "Mobile phone use in restricted or hazardous areas where it is prohibited" },
        { offenceName: "Smoking in restricted areas", offenceDescription: "Smoking in prohibited zones — breaching site no-smoking policy" },
        { offenceName: "Poor housekeeping", offenceDescription: "Failure to maintain a tidy, safe working area — creating trip or fire hazards" },
        { offenceName: "Failure to report an accident or near-miss", offenceDescription: "Not reporting a workplace accident, injury, or near-miss incident" },
        { offenceName: "Unsafe manual handling", offenceDescription: "Incorrect manual handling technique causing risk of injury" },
        { offenceName: "Obstructing emergency exits or routes", offenceDescription: "Blocking fire exits, emergency escape routes or access for emergency services" },
      ];

      // Insert Red Card offences
      for (const offence of redCardOffences) {
        await db.insert(isolatedSchema.cardOffences).values({
          offenceName: offence.offenceName,
          offenceDescription: offence.offenceDescription,
          cardType: "red",
          isActive: true,
          siteConfigurable: true
        });
      }

      // Insert Yellow Card offences
      for (const offence of yellowCardOffences) {
        await db.insert(isolatedSchema.cardOffences).values({
          offenceName: offence.offenceName,
          offenceDescription: offence.offenceDescription,
          cardType: "yellow",
          isActive: true,
          siteConfigurable: true
        });
      }

      console.log(`✅ Seeded ${redCardOffences.length + yellowCardOffences.length} UK contractor offences for customer: ${context.customerId}`);
    } catch (error) {
      console.error(`Error seeding card offences for customer ${context.customerId}:`, error);
    }
  }

  // Contractor Worker Methods (TODO: Add customer isolation later)
  async getContractorWorkerById(context: CustomerContext, id: string): Promise<ContractorWorker | undefined> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    try {
      // FIXED: Use Drizzle ORM instead of raw SQL for better type safety and correct field mapping
      const workers = await db
        .select()
        .from(isolatedSchema.contractorWorkers)
        .where(eq(isolatedSchema.contractorWorkers.id, id))
        .limit(1);
      
      const worker = workers[0];
      
      if (!worker) {
        console.log(`🔍 DEBUG: No worker found with id: ${id}`);
        return undefined;
      }
      
      // Debug: Log what fields are actually returned
      console.log(`🔍 DEBUG: Worker found, mapping fields for frontend...`);
      console.log(`🔍 DEBUG: Key fields - postcode: "${worker.postcode}", transportMethod: "${worker.transportMethod}", cscsStatus: "${worker.cscsStatus}", inductionCompleted: ${worker.siteInductionCompleted}`);
      
      // FIXED: Properly map database fields to frontend format with correct field names
      const mappedWorker = {
        id: worker.id,
        companyId: worker.companyId,
        firstName: worker.firstName,
        lastName: worker.lastName,
        email: worker.email,
        phoneNumber: worker.phoneNumber,
        mobileNumber: worker.mobileNumber,
        homeAddress: worker.homeAddress,
        postcode: worker.postcode,
        dateOfBirth: worker.dateOfBirth,
        nationalInsuranceNumber: worker.nationalInsuranceNumber,
        photoUrl: worker.photoUrl,
        jobTitle: worker.jobTitle,
        department: worker.department,
        skillsAndCertifications: worker.skillsAndCertifications || [],
        emergencyContactName: worker.emergencyContactName,
        emergencyContactPhone: worker.emergencyContactPhone,
        emergencyContactRelationship: worker.emergencyContactRelationship,
        isCheckedIn: worker.isCheckedIn || false,
        checkedInAt: worker.checkedInAt,
        checkedOutAt: worker.checkedOutAt,
        checkoutType: worker.checkoutType,
        lastVisitDate: worker.lastVisitDate,
        visitCount: worker.visitCount || 0,
        isAccountedFor: worker.isAccountedFor || false,
        rightToWork: worker.rightToWork || 'pending', // FIXED: Correct field mapping
        rightToWorkDocumentType: worker.rightToWorkDocumentType,
        rightToWorkDocumentNumber: worker.rightToWorkDocumentNumber,
        rightToWorkExpiryDate: worker.rightToWorkExpiryDate,
        rightToWorkVerifiedBy: worker.rightToWorkVerifiedBy,
        rightToWorkVerifiedAt: worker.rightToWorkVerifiedAt,
        rightToWorkDocumentUrl: worker.rightToWorkDocumentUrl,
        workingPattern: worker.workingPattern || 'full_time',
        hourlyRate: worker.hourlyRate,
        startDate: worker.startDate,
        expectedEndDate: worker.expectedEndDate,
        hasOccupationalHealthClearance: worker.hasOccupationalHealthClearance || false,
        occupationalHealthExpiryDate: worker.occupationalHealthExpiryDate,
        medicalRestrictions: worker.medicalRestrictions,
        siteInductionRequired: worker.siteInductionRequired ?? true,
        siteInductionCompleted: worker.siteInductionCompleted || false,
        siteInductionCompletedAt: worker.siteInductionCompletedAt,
        siteInductionExpiryDate: worker.siteInductionExpiryDate,
        toolboxTalkCompleted: worker.toolboxTalkCompleted || false,
        toolboxTalkCompletedAt: worker.toolboxTalkCompletedAt,
        cscsCard: worker.cscsCard || '', // FIXED: Correct field mapping
        cscsStatus: worker.cscsStatus || 'pending', // FIXED: Correct field mapping - should be string not boolean
        ipafStatus: worker.ipafStatus || 'none',
        asbestosAwareness: worker.asbestosAwareness || false,
        manualHandling: worker.manualHandling || false,
        workingAtHeight: worker.workingAtHeight || false,
        transportMethod: worker.transportMethod || 'car_diesel', // FIXED: Correct field mapping
        workerStatus: worker.workerStatus || 'pending',
        approvedBy: worker.approvedBy,
        approvedAt: worker.approvedAt,
        suspendedReason: worker.suspendedReason,
        bannedUntil: worker.bannedUntil,
        aiRiskScore: worker.aiRiskScore || 0,
        riskFactors: worker.riskFactors || [],
        lastRiskAssessment: worker.lastRiskAssessment,
        documentsComplete: worker.documentsComplete || false,
        documentsLastChecked: worker.documentsLastChecked,
        complianceScore: worker.complianceScore || 0,
        isActive: worker.isActive ?? true,
        createdAt: worker.createdAt || new Date(),
        updatedAt: worker.updatedAt || new Date(),
        // FIXED: Add frontend compatibility mappings
        currentCardStatus: worker.currentCardStatus || this.calculateWorkerCardStatus(worker), // Calculate if missing
        inductionCompleted: worker.siteInductionCompleted || false, // Map DB field to frontend field
        phone: worker.phoneNumber, // Add phone alias for compatibility
        qrCode: worker.qrCode || null, // Include QR code so send-qr-pass doesn't regenerate it every time
        needsEvacuationAssistance: worker.needsEvacuationAssistance ?? false,
      } as ContractorWorker;
      
      console.log(`✅ DEBUG: Successfully mapped worker. Key fields - inductionCompleted: ${mappedWorker.inductionCompleted}, cscsStatus: ${mappedWorker.cscsStatus}, transportMethod: ${mappedWorker.transportMethod}`);
      
      return mappedWorker;
    } catch (error) {
      console.error('Error getting contractor worker:', error);
      return undefined;
    }
  }

  async updateContractorWorker(
    context: CustomerContext, 
    id: string, 
    updates: Partial<InsertContractorWorker>
  ): Promise<ContractorWorker | undefined> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    try {
      console.log(`🔍 DATABASE SERVICE - Received updates for worker ${id}:`, updates);
      console.log(`🔍 DATABASE SERVICE - Update keys:`, Object.keys(updates));
      console.log(`🔍 DATABASE SERVICE - Checking for critical fields:`);
      console.log(`  - rightToWork: ${updates.rightToWork} (schema field name)`);
      console.log(`  - cscsStatus: ${updates.cscsStatus} (schema field name)`);
      console.log(`  - inductionCompleted: ${updates.inductionCompleted}`);
      
      // FIXED: Only map frontend fields to database column names - NO DUPLICATES
      const updateData: any = {
        updatedAt: new Date()
      };
      
      // Explicitly map ONLY the frontend fields we need to database column names
      if (updates.transportMethod !== undefined) {
        updateData.transportMethod = updates.transportMethod;
      }
      if (updates.cscsCard !== undefined) {
        updateData.cscsCard = updates.cscsCard;
      }
      if (updates.cscsStatus !== undefined) {
        // FIXED: cscsStatus should be stored as string (pending, valid, expired), not boolean
        updateData.cscsStatus = typeof updates.cscsStatus === 'boolean' 
          ? (updates.cscsStatus ? 'valid' : 'pending') 
          : updates.cscsStatus;
      }
      if (updates.rightToWork !== undefined) {
        updateData.rightToWork = updates.rightToWork;
      }
      if (updates.inductionCompleted !== undefined) {
        const inductionVal = typeof updates.inductionCompleted === 'string' 
          ? (updates.inductionCompleted === 'true') 
          : Boolean(updates.inductionCompleted);
        updateData.siteInductionCompleted = inductionVal;
        if (inductionVal) {
          updateData.siteInductionCompletedAt = new Date();
        }
        console.log(`🔧 FIELD MAP: inductionCompleted → siteInductionCompleted = ${inductionVal}`);
      }
      if (updates.ipafStatus !== undefined) {
        updateData.ipafStatus = updates.ipafStatus;
      }
      if (updates.asbestosAwareness !== undefined) {
        updateData.asbestosAwareness = typeof updates.asbestosAwareness === 'string' 
          ? (updates.asbestosAwareness === 'true') 
          : Boolean(updates.asbestosAwareness);
      }
      if (updates.manualHandling !== undefined) {
        updateData.manualHandling = typeof updates.manualHandling === 'string' 
          ? (updates.manualHandling === 'true') 
          : Boolean(updates.manualHandling);
      }
      if (updates.workingAtHeight !== undefined) {
        updateData.workingAtHeight = typeof updates.workingAtHeight === 'string' 
          ? (updates.workingAtHeight === 'true') 
          : Boolean(updates.workingAtHeight);
      }
      
      // Add any other simple field mappings
      if (updates.firstName !== undefined) updateData.firstName = updates.firstName;
      if (updates.lastName !== undefined) updateData.lastName = updates.lastName;
      if (updates.email !== undefined) updateData.email = updates.email;
      if (updates.phoneNumber !== undefined) updateData.phoneNumber = updates.phoneNumber;
      if ((updates as any).phone !== undefined && updates.phoneNumber === undefined) updateData.phoneNumber = (updates as any).phone;
      if (updates.postcode !== undefined) updateData.postcode = updates.postcode;
      if ((updates as any).photoUrl !== undefined) updateData.photoUrl = (updates as any).photoUrl;
      if (updates.companyId !== undefined) {
        updateData.companyId = updates.companyId;
        console.log(`🔧 FIELD MAP: companyId = ${updates.companyId}`);
      }
      
      // CRITICAL: Add missing check-in and H&S acceptance field mappings
      if (updates.isCheckedIn !== undefined) {
        updateData.isCheckedIn = Boolean(updates.isCheckedIn);
      }
      if (updates.checkedInAt !== undefined) {
        updateData.checkedInAt = updates.checkedInAt;
      }
      if (updates.checkedOutAt !== undefined) {
        updateData.checkedOutAt = updates.checkedOutAt;
      }
      if (updates.hsRulesAccepted !== undefined) {
        updateData.hsRulesAccepted = Boolean(updates.hsRulesAccepted);
      }
      if (updates.hsRulesAcceptedAt !== undefined) {
        updateData.hsRulesAcceptedAt = updates.hsRulesAcceptedAt;
      }
      if (updates.needsEvacuationAssistance !== undefined) {
        updateData.needsEvacuationAssistance = Boolean(updates.needsEvacuationAssistance);
      }
      if ((updates as any).qrCode !== undefined) {
        (updateData as any).qrCode = (updates as any).qrCode;
      }
      
      // Handle special update flags
      const bypassAutoCalculation = (updates as any)._bypassAutoCalculation;
      if (bypassAutoCalculation) {
        console.log(`🔄 BYPASS: Skipping auto-calculation due to _bypassAutoCalculation flag`);
        // Add direct card status from updates if provided
        if (updates.currentCardStatus !== undefined) {
          updateData.currentCardStatus = updates.currentCardStatus;
        }
        if (updates.redCardBanUntil !== undefined) {
          updateData.bannedUntil = updates.redCardBanUntil;
        }
      }

      // AUTOMATIC CARD STATUS CALCULATION (skip if bypassing)
      if (!bypassAutoCalculation) {
        console.log(`🔍 AUTO-CALC: Starting automatic card status calculation for worker ${id}`);
        try {
        // Get current worker data to check all compliance fields
        console.log(`🔍 AUTO-CALC: Fetching current worker data for ${id}`);
        const currentWorker = await this.getContractorWorkerById(context, id);
        console.log(`🔍 AUTO-CALC: Current worker data:`, currentWorker ? 'FOUND' : 'NOT FOUND');
        
        if (currentWorker) {
          console.log(`🔍 AUTO-CALC: Worker compliance data:`, {
            siteInductionCompleted: currentWorker.siteInductionCompleted,
            rightToWork: currentWorker.rightToWork,
            cscsStatus: currentWorker.cscsStatus,
            bannedUntil: currentWorker.bannedUntil
          });
          
          // Merge current worker data with updates
          const mergedData = { ...currentWorker, ...updateData };
          console.log(`🔍 AUTO-CALC: Merged data for calculation:`, {
            siteInductionCompleted: mergedData.siteInductionCompleted,
            rightToWork: mergedData.rightToWork,
            cscsStatus: mergedData.cscsStatus,
            bannedUntil: mergedData.bannedUntil
          });
          
          // Calculate card status based on compliance
          const calculatedStatus = this.calculateWorkerCardStatus(mergedData);
          
          // Set the calculated status
          updateData.currentCardStatus = calculatedStatus;
          
          console.log(`✅ AUTO-CALCULATED: Worker ${id} card status = '${calculatedStatus}' based on compliance`);
        } else {
          console.log(`❌ AUTO-CALC: Could not fetch current worker data for ${id}`);
        }
      } catch (error) {
        console.error(`❌ AUTO-CALC: Error during automatic card status calculation:`, error);
      }
      } // End of auto-calculation bypass check
      
      // No need to remove undefined since we only add defined values
      
      console.log(`🔄 Updating contractor worker ${id} with data:`, updateData);
      console.log(`🔍 DATABASE SERVICE - About to send to SQL with keys:`, Object.keys(updateData));
      
      // If no actual updates provided, return existing record
      if (Object.keys(updates).length === 0) {
        return this.getContractorWorkerById(context, id);
      }
      
      console.log(`🔍 DATABASE SERVICE - Executing SQL UPDATE...`);
      
      const [updated] = await db
        .update(isolatedSchema.contractorWorkers)
        .set(updateData)
        .where(eq(isolatedSchema.contractorWorkers.id, id))
        .returning();
      
      console.log(`🔍 DATABASE SERVICE - SQL UPDATE completed. Result:`, updated);
      
      if (!updated) {
        console.error(`❌ DATABASE SERVICE - No record returned from SQL UPDATE for worker ${id}`);
        return undefined;
      }
      
      console.log(`✅ DATABASE SERVICE - Successfully updated worker. Result fields:`);
      console.log(`  - rightToWork: ${updated.rightToWork}`);
      console.log(`  - cscsStatus: ${updated.cscsStatus}`);
      console.log(`  - siteInductionCompleted (DB field): ${updated.siteInductionCompleted}`);
      
      // FIXED: Properly map database fields back to frontend format
      const mappedResult = {
        id: updated.id,
        companyId: updated.companyId,
        firstName: updated.firstName,
        lastName: updated.lastName,
        email: updated.email,
        phoneNumber: updated.phoneNumber,
        mobileNumber: updated.mobileNumber,
        homeAddress: updated.homeAddress,
        postcode: updated.postcode,
        dateOfBirth: updated.dateOfBirth,
        nationalInsuranceNumber: updated.nationalInsuranceNumber,
        photoUrl: updated.photoUrl,
        jobTitle: updated.jobTitle,
        department: updated.department,
        skillsAndCertifications: updated.skillsAndCertifications,
        emergencyContactName: updated.emergencyContactName,
        emergencyContactPhone: updated.emergencyContactPhone,
        emergencyContactRelationship: updated.emergencyContactRelationship,
        isCheckedIn: updated.isCheckedIn,
        checkedInAt: updated.checkedInAt,
        checkedOutAt: updated.checkedOutAt,
        checkoutType: updated.checkoutType,
        lastVisitDate: updated.lastVisitDate,
        visitCount: updated.visitCount,
        isAccountedFor: updated.isAccountedFor,
        rightToWork: updated.rightToWork,
        rightToWorkDocumentType: updated.rightToWorkDocumentType,
        rightToWorkDocumentNumber: updated.rightToWorkDocumentNumber,
        rightToWorkExpiryDate: updated.rightToWorkExpiryDate,
        rightToWorkVerifiedBy: updated.rightToWorkVerifiedBy,
        rightToWorkVerifiedAt: updated.rightToWorkVerifiedAt,
        rightToWorkDocumentUrl: updated.rightToWorkDocumentUrl,
        workingPattern: updated.workingPattern,
        hourlyRate: updated.hourlyRate,
        startDate: updated.startDate,
        expectedEndDate: updated.expectedEndDate,
        hasOccupationalHealthClearance: updated.hasOccupationalHealthClearance,
        occupationalHealthExpiryDate: updated.occupationalHealthExpiryDate,
        medicalRestrictions: updated.medicalRestrictions,
        siteInductionRequired: updated.siteInductionRequired,
        siteInductionCompleted: updated.siteInductionCompleted,
        siteInductionCompletedAt: updated.siteInductionCompletedAt,
        siteInductionExpiryDate: updated.siteInductionExpiryDate,
        toolboxTalkCompleted: updated.toolboxTalkCompleted,
        toolboxTalkCompletedAt: updated.toolboxTalkCompletedAt,
        cscsCard: updated.cscsCard,
        cscsStatus: updated.cscsStatus,
        ipafStatus: updated.ipafStatus,
        asbestosAwareness: updated.asbestosAwareness,
        manualHandling: updated.manualHandling,
        workingAtHeight: updated.workingAtHeight,
        transportMethod: updated.transportMethod,
        workerStatus: updated.workerStatus,
        approvedBy: updated.approvedBy,
        approvedAt: updated.approvedAt,
        suspendedReason: updated.suspendedReason,
        bannedUntil: updated.bannedUntil,
        aiRiskScore: updated.aiRiskScore,
        riskFactors: updated.riskFactors,
        lastRiskAssessment: updated.lastRiskAssessment,
        documentsComplete: updated.documentsComplete,
        documentsLastChecked: updated.documentsLastChecked,
        complianceScore: updated.complianceScore,
        isActive: updated.isActive,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
        // FIXED: Map key fields properly for frontend
        currentCardStatus: updated.currentCardStatus, // Include calculated card status
        inductionCompleted: updated.siteInductionCompleted, // Map DB field to frontend field
        phone: updated.phoneNumber, // Add phone alias for compatibility
      } as ContractorWorker;
      
      console.log(`✅ DATABASE SERVICE - Mapped result for UI:`);
      console.log(`  - inductionCompleted (UI field): ${mappedResult.inductionCompleted}`);
      console.log(`  - currentCardStatus (UI field): ${mappedResult.currentCardStatus}`);
      
      return mappedResult;
    } catch (error) {
      console.error(`❌ DATABASE SERVICE - CRITICAL ERROR updating contractor worker ${id}:`, error);
      console.error(`❌ DATABASE SERVICE - Error details:`, {
        message: error?.message,
        code: error?.code,
        detail: error?.detail,
        hint: error?.hint,
        constraint: error?.constraint
      });
      console.error(`❌ DATABASE SERVICE - Failed updateData:`, updates);
      throw error; // Re-throw to surface in route logs
    }
  }

  /**
   * WORKER CARD STATUS CALCULATION - Helper Method
   */
  private calculateWorkerCardStatus(workerData: any): 'red' | 'yellow' | 'clear' {
    // Check for red card conditions (banned/critical non-compliance)
    if (workerData.bannedUntil && new Date(workerData.bannedUntil) > new Date()) {
      return 'red'; // Currently banned
    }
    
    if (workerData.rightToWork === 'expired' || workerData.rightToWork === 'missing') {
      return 'red'; // Critical compliance failure
    }
    
    // Check for yellow card conditions (warnings/expiring)
    if (workerData.rightToWork === 'expiring' || 
        workerData.cscsStatus === 'expired' || 
        workerData.ipafStatus === 'expired') {
      return 'yellow'; // Warning - expiring credentials
    }
    
    // Check for missing induction (critical requirement)
    if (!workerData.siteInductionCompleted) {
      return 'yellow'; // Cannot check in without induction
    }
    
    // All compliance checks passed - worker is clear to work
    if (workerData.rightToWork === 'valid' && 
        workerData.siteInductionCompleted === true &&
        (workerData.cscsStatus === 'valid' || workerData.cscsStatus === 'pending')) {
      return 'clear'; // Green card - compliant and ready to check in
    }
    
    // Default to yellow if we can't determine status
    return 'yellow';
  }

  /**
   * CO2 EMISSIONS TRACKING METHODS - Customer Isolated
   */
  async storeCO2EmissionsData(customerId: string, data: Omit<InsertCO2EmissionsData, 'customerId'>): Promise<CO2EmissionsData> {
    const db = await customerDbService.getCustomerDatabase(customerId);
    
    const created = await db
      .insert(isolatedSchema.co2EmissionsData)
      .values(data)
      .returning();
    
    return created[0];
  }

  async getCO2EmissionsByCompany(customerId: string, companyId: string): Promise<CO2EmissionsData[]> {
    const db = await customerDbService.getCustomerDatabase(customerId);
    
    return await db
      .select()
      .from(isolatedSchema.co2EmissionsData)
      .where(and(
        eq(isolatedSchema.co2EmissionsData.companyId, companyId),
        eq(isolatedSchema.co2EmissionsData.isActive, true)
      ))
      .orderBy(desc(isolatedSchema.co2EmissionsData.calculatedAt));
  }

  async getCO2EmissionsByWorker(customerId: string, workerId: string): Promise<CO2EmissionsData[]> {
    const db = await customerDbService.getCustomerDatabase(customerId);
    
    return await db
      .select()
      .from(isolatedSchema.co2EmissionsData)
      .where(and(
        eq(isolatedSchema.co2EmissionsData.workerId, workerId),
        eq(isolatedSchema.co2EmissionsData.isActive, true)
      ))
      .orderBy(desc(isolatedSchema.co2EmissionsData.calculatedAt));
  }

  async getWorkersByCompany(context: CustomerContext, companyId: string): Promise<ContractorWorker[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    try {
      // Get raw worker data
      const workers = await db
        .select()
        .from(isolatedSchema.contractorWorkers)
        .where(eq(isolatedSchema.contractorWorkers.companyId, companyId))
        .orderBy(asc(isolatedSchema.contractorWorkers.firstName), asc(isolatedSchema.contractorWorkers.lastName));
      
      
      // Map each worker using the same logic as getContractorWorkerById
      const mappedWorkers = workers.map(worker => {
        
        // FIXED: Properly map database fields to frontend format with correct field names
        const mappedWorker = {
          id: worker.id,
          companyId: worker.companyId,
          firstName: worker.firstName,
          lastName: worker.lastName,
          email: worker.email,
          phoneNumber: worker.phoneNumber,
          mobileNumber: worker.mobileNumber,
          homeAddress: worker.homeAddress,
          postcode: worker.postcode,
          dateOfBirth: worker.dateOfBirth,
          nationalInsuranceNumber: worker.nationalInsuranceNumber,
          photoUrl: worker.photoUrl,
          jobTitle: worker.jobTitle,
          department: worker.department,
          skillsAndCertifications: worker.skillsAndCertifications || [],
          emergencyContactName: worker.emergencyContactName,
          emergencyContactPhone: worker.emergencyContactPhone,
          emergencyContactRelationship: worker.emergencyContactRelationship,
          isCheckedIn: worker.isCheckedIn || false,
          checkedInAt: worker.checkedInAt,
          checkedOutAt: worker.checkedOutAt,
          checkoutType: worker.checkoutType,
          lastVisitDate: worker.lastVisitDate,
          visitCount: worker.visitCount || 0,
          isAccountedFor: worker.isAccountedFor || false,
          rightToWork: worker.rightToWork || 'pending',
          rightToWorkDocumentType: worker.rightToWorkDocumentType,
          rightToWorkDocumentNumber: worker.rightToWorkDocumentNumber,
          rightToWorkExpiryDate: worker.rightToWorkExpiryDate,
          rightToWorkVerifiedBy: worker.rightToWorkVerifiedBy,
          rightToWorkVerifiedAt: worker.rightToWorkVerifiedAt,
          rightToWorkDocumentUrl: worker.rightToWorkDocumentUrl,
          workingPattern: worker.workingPattern || 'full_time',
          hourlyRate: worker.hourlyRate,
          startDate: worker.startDate,
          expectedEndDate: worker.expectedEndDate,
          hasOccupationalHealthClearance: worker.hasOccupationalHealthClearance || false,
          occupationalHealthExpiryDate: worker.occupationalHealthExpiryDate,
          medicalRestrictions: worker.medicalRestrictions,
          siteInductionRequired: worker.siteInductionRequired ?? true,
          siteInductionCompleted: worker.siteInductionCompleted || false,
          siteInductionCompletedAt: worker.siteInductionCompletedAt,
          siteInductionExpiryDate: worker.siteInductionExpiryDate,
          toolboxTalkCompleted: worker.toolboxTalkCompleted || false,
          toolboxTalkCompletedAt: worker.toolboxTalkCompletedAt,
          cscsCard: worker.cscsCard || '',
          cscsStatus: worker.cscsStatus || 'pending',
          ipafStatus: worker.ipafStatus || 'none',
          asbestosAwareness: worker.asbestosAwareness || false,
          manualHandling: worker.manualHandling || false,
          workingAtHeight: worker.workingAtHeight || false,
          transportMethod: worker.transportMethod || 'car_diesel',
          workerStatus: worker.workerStatus || 'pending',
          approvedBy: worker.approvedBy,
          approvedAt: worker.approvedAt,
          suspendedReason: worker.suspendedReason,
          bannedUntil: worker.bannedUntil,
          aiRiskScore: worker.aiRiskScore || 0,
          riskFactors: worker.riskFactors || [],
          lastRiskAssessment: worker.lastRiskAssessment,
          documentsComplete: worker.documentsComplete || false,
          documentsLastChecked: worker.documentsLastChecked,
          complianceScore: worker.complianceScore || 0,
          isActive: worker.isActive ?? true,
          createdAt: worker.createdAt || new Date(),
          updatedAt: worker.updatedAt || new Date(),
          // CRITICAL FIX: Calculate currentCardStatus if missing
          currentCardStatus: worker.currentCardStatus || this.calculateWorkerCardStatus(worker),
          // CRITICAL FIX: Map frontend compatibility fields
          inductionCompleted: worker.siteInductionCompleted || false,
          phone: worker.phoneNumber,
        } as ContractorWorker;
        
        
        return mappedWorker;
      });
      
      return mappedWorkers;
    } catch (error) {
      console.error('Error getting workers by company:', error);
      return [];
    }
  }

  async getContractorCompany(context: CustomerContext, companyId: string): Promise<ContractorCompany | undefined> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const companies = await db
      .select()
      .from(isolatedSchema.contractorCompanies)
      .where(eq(isolatedSchema.contractorCompanies.id, companyId))
      .limit(1);
    
    return companies[0];
  }

  async getMonthlySummary(
    customerId: string, 
    companyId: string, 
    year: number, 
    month: number
  ): Promise<CO2MonthlySummary | undefined> {
    const db = await customerDbService.getCustomerDatabase(customerId);
    
    const summaries = await db
      .select()
      .from(isolatedSchema.co2MonthlySummaries)
      .where(and(
        eq(isolatedSchema.co2MonthlySummaries.companyId, companyId),
        eq(isolatedSchema.co2MonthlySummaries.year, year),
        eq(isolatedSchema.co2MonthlySummaries.month, month)
      ))
      .limit(1);
    
    return summaries[0];
  }

  async upsertMonthlySummary(data: InsertCO2MonthlySummary): Promise<CO2MonthlySummary> {
    const db = await customerDbService.getCustomerDatabase(data.customerId);
    
    // Try to find existing summary
    const existing = data.companyId 
      ? await this.getMonthlySummary(data.customerId, data.companyId, data.year, data.month)
      : undefined;
    
    if (existing) {
      // Update existing
      const updated = await db
        .update(isolatedSchema.co2MonthlySummaries)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(isolatedSchema.co2MonthlySummaries.id, existing.id))
        .returning();
      
      return updated[0];
    } else {
      // Create new
      const created = await db
        .insert(isolatedSchema.co2MonthlySummaries)
        .values(data)
        .returning();
      
      return created[0];
    }
  }

  async storeSustainabilityReport(data: InsertCO2SustainabilityReport): Promise<CO2SustainabilityReport> {
    if (!data.customerId) {
      throw new Error('customerId is required to store sustainability report');
    }
    
    const db = await customerDbService.getCustomerDatabase(data.customerId);
    
    // Remove customerId from data as isolated schema doesn't have this column
    // (table is already isolated by being in customer's database)
    const { customerId, ...insertData } = data;
    
    const created = await db
      .insert(isolatedSchema.co2SustainabilityReports)
      .values(insertData)
      .returning();
    
    return created[0];
  }

  async getSustainabilityReports(
    customerId: string, 
    companyId?: string
  ): Promise<CO2SustainabilityReport[]> {
    const db = await customerDbService.getCustomerDatabase(customerId);
    
    const whereConditions: any[] = [];
    
    if (companyId) {
      whereConditions.push(eq(isolatedSchema.co2SustainabilityReports.companyId, companyId));
    }
    
    return await db
      .select()
      .from(isolatedSchema.co2SustainabilityReports)
      .where(and(...whereConditions))
      .orderBy(desc(isolatedSchema.co2SustainabilityReports.generatedAt));
  }

  /**
   * AI GENERATED IMAGES METHODS - Customer Isolated
   */
  async createAiGeneratedImage(
    context: CustomerContext, 
    imageData: Omit<any, 'id' | 'generatedAt' | 'createdAt'>
  ): Promise<any> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const [created] = await db
      .insert(isolatedSchema.aiGeneratedImages)
      .values(imageData)
      .returning();
    
    return created;
  }

  async getAiGeneratedImages(
    context: CustomerContext, 
    slideType?: string
  ): Promise<any[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    let query = db
      .select()
      .from(isolatedSchema.aiGeneratedImages)
      .where(eq(isolatedSchema.aiGeneratedImages.isActive, true));
    
    if (slideType) {
      query = query.where(and(
        eq(isolatedSchema.aiGeneratedImages.isActive, true),
        eq(isolatedSchema.aiGeneratedImages.slideType, slideType)
      ));
    }
    
    return await query.orderBy(isolatedSchema.aiGeneratedImages.generatedAt);
  }

  /**
   * WORKER DOCUMENT ASSIGNMENTS METHODS - Customer Isolated
   */
  async getWorkerDocumentAssignments(
    context: CustomerContext,
    workerId: string
  ): Promise<any[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    try {
      // Get all document assignments for this worker using customer-isolated database
      const assignments = await db
        .select({
          assignment: isolatedSchema.workerDocumentAssignments,
          template: isolatedSchema.ukHSDocumentTemplates
        })
        .from(isolatedSchema.workerDocumentAssignments)
        .innerJoin(
          isolatedSchema.ukHSDocumentTemplates, 
          eq(isolatedSchema.workerDocumentAssignments.documentTemplateId, isolatedSchema.ukHSDocumentTemplates.id)
        )
        .where(and(
          eq(isolatedSchema.workerDocumentAssignments.workerId, workerId),
          eq(isolatedSchema.workerDocumentAssignments.isActive, true)
        ))
        .orderBy(isolatedSchema.workerDocumentAssignments.assignedAt);
      
      console.log(`📋 Found ${assignments.length} document assignments for worker ${workerId}`);
      return assignments;
    } catch (error) {
      console.error('Error fetching worker document assignments:', error);
      return [];
    }
  }

  async getAiGeneratedImageById(
    context: CustomerContext, 
    id: string
  ): Promise<any | undefined> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const [image] = await db
      .select()
      .from(isolatedSchema.aiGeneratedImages)
      .where(and(
        eq(isolatedSchema.aiGeneratedImages.id, id),
        eq(isolatedSchema.aiGeneratedImages.isActive, true)
      ))
      .limit(1);
    
    return image;
  }

  async getAiGeneratedImageBySlideType(
    context: CustomerContext, 
    slideType: string
  ): Promise<any | undefined> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const [image] = await db
      .select()
      .from(isolatedSchema.aiGeneratedImages)
      .where(and(
        eq(isolatedSchema.aiGeneratedImages.slideType, slideType),
        eq(isolatedSchema.aiGeneratedImages.isActive, true)
      ))
      .orderBy(isolatedSchema.aiGeneratedImages.generatedAt)
      .limit(1);
    
    return image;
  }

  /**
   * INDUCTION SETTINGS METHODS - Customer Isolated
   */
  async getInductionSettings(context: CustomerContext): Promise<any[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    return await db
      .select()
      .from(isolatedSchema.inductionSettings)
      .orderBy(isolatedSchema.inductionSettings.roleType);
  }

  async getInductionSettingsByRole(
    context: CustomerContext, 
    roleType: string
  ): Promise<any | undefined> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const [setting] = await db
      .select()
      .from(isolatedSchema.inductionSettings)
      .where(eq(isolatedSchema.inductionSettings.roleType, roleType))
      .limit(1);
    
    return setting;
  }

  async getInductionQuestions(
    context: CustomerContext, 
    roleType: string
  ): Promise<any[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    return await db
      .select()
      .from(isolatedSchema.inductionQuestions)
      .where(eq(isolatedSchema.inductionQuestions.roleType, roleType))
      .orderBy(isolatedSchema.inductionQuestions.orderIndex);
  }

  /**
   * HELP SYSTEM METHODS - Customer Isolated
   */
  async getHelpCategories(context: CustomerContext): Promise<any[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    return await db
      .select()
      .from(isolatedSchema.helpCategories)
      .where(eq(isolatedSchema.helpCategories.isActive, true))
      .orderBy(isolatedSchema.helpCategories.sortOrder, isolatedSchema.helpCategories.name);
  }

  async getHelpArticlesFeatured(context: CustomerContext): Promise<any[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    return await db
      .select()
      .from(isolatedSchema.helpArticles)
      .where(and(
        eq(isolatedSchema.helpArticles.isPublished, true),
        eq(isolatedSchema.helpArticles.isFeatured, true)
      ))
      .orderBy(isolatedSchema.helpArticles.helpfulCount, isolatedSchema.helpArticles.viewCount)
      .limit(10);
  }

  async getHelpArticlesContextual(
    context: CustomerContext, 
    page: string
  ): Promise<any[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    return await db
      .select()
      .from(isolatedSchema.helpArticles)
      .where(and(
        eq(isolatedSchema.helpArticles.isPublished, true),
        sql`${page} = ANY(${isolatedSchema.helpArticles.targetPages})`
      ))
      .orderBy(isolatedSchema.helpArticles.sortOrder, isolatedSchema.helpArticles.helpfulCount)
      .limit(5);
  }

  async getHelpArticlesGeneral(context: CustomerContext): Promise<any[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    return await db
      .select()
      .from(isolatedSchema.helpArticles)
      .where(and(
        eq(isolatedSchema.helpArticles.isPublished, true),
        eq(isolatedSchema.helpArticles.isQuickStart, true)
      ))
      .orderBy(isolatedSchema.helpArticles.sortOrder, isolatedSchema.helpArticles.helpfulCount)
      .limit(5);
  }

  async searchHelpArticles(
    context: CustomerContext, 
    query: string
  ): Promise<any[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    if (!query || query.length < 3) {
      return [];
    }
    
    return await db
      .select()
      .from(isolatedSchema.helpArticles)
      .where(and(
        eq(isolatedSchema.helpArticles.isPublished, true),
        sql`(
          LOWER(${isolatedSchema.helpArticles.title}) LIKE LOWER(${'%' + query + '%'}) OR 
          LOWER(${isolatedSchema.helpArticles.content}) LIKE LOWER(${'%' + query + '%'}) OR 
          LOWER(${isolatedSchema.helpArticles.summary}) LIKE LOWER(${'%' + query + '%'}) OR 
          EXISTS (SELECT 1 FROM unnest(${isolatedSchema.helpArticles.searchKeywords}) AS keyword WHERE LOWER(keyword) LIKE LOWER(${'%' + query + '%'}))
        )`
      ))
      .orderBy(isolatedSchema.helpArticles.helpfulCount, isolatedSchema.helpArticles.viewCount)
      .limit(20);
  }

  async createHelpUserInteraction(
    context: CustomerContext, 
    interactionData: any
  ): Promise<any> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const [created] = await db
      .insert(isolatedSchema.helpUserInteractions)
      .values(interactionData)
      .returning();
    
    return created;
  }

  async updateHelpArticleViewCount(
    context: CustomerContext, 
    articleId: string
  ): Promise<void> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    await db
      .update(isolatedSchema.helpArticles)
      .set({ 
        viewCount: sql`${isolatedSchema.helpArticles.viewCount} + 1`,
        lastViewedAt: new Date()
      })
      .where(eq(isolatedSchema.helpArticles.id, articleId));
  }

  async updateHelpArticleHelpfulCount(
    context: CustomerContext, 
    articleId: string,
    isHelpful: boolean
  ): Promise<void> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const updateField = isHelpful 
      ? { helpfulCount: sql`${isolatedSchema.helpArticles.helpfulCount} + 1` }
      : { notHelpfulCount: sql`${isolatedSchema.helpArticles.notHelpfulCount} + 1` };
    
    await db
      .update(isolatedSchema.helpArticles)
      .set(updateField)
      .where(eq(isolatedSchema.helpArticles.id, articleId));
  }


  async getContractorWorkersByCompany(
    context: CustomerContext,
    companyId: string
  ): Promise<any[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    return await db
      .select()
      .from(isolatedSchema.contractorWorkers)
      .where(eq(isolatedSchema.contractorWorkers.companyId, companyId))
      .orderBy(isolatedSchema.contractorWorkers.firstName, isolatedSchema.contractorWorkers.lastName);
  }

  async getWorkerNotes(context: CustomerContext, workerId: string): Promise<any[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    return await db
      .select()
      .from(isolatedSchema.workerNotes)
      .where(eq(isolatedSchema.workerNotes.workerId, workerId))
      .orderBy(desc(isolatedSchema.workerNotes.changedAt));
  }

  /**
   * CUSTOMER API KEY MANAGEMENT METHODS - Customer Isolated
   */
  async getCustomerApiKeys(context: CustomerContext): Promise<any[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    // No customerId filter needed - each customer has their own database
    const apiKeys = await db
      .select()
      .from(sharedSchema.customerApiKeys)
      .where(eq(sharedSchema.customerApiKeys.status, 'active'))
      .orderBy(desc(sharedSchema.customerApiKeys.createdAt));
    
    return apiKeys;
  }

  async getApiKeyByFingerprint(context: CustomerContext, fingerprint: string): Promise<any | null> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const [apiKey] = await db
      .select()
      .from(sharedSchema.customerApiKeys)
      .where(eq(sharedSchema.customerApiKeys.keyFingerprint, fingerprint))
      .limit(1);
    
    return apiKey || null;
  }

  async upsertCustomerApiKey(context: CustomerContext, keyData: any): Promise<any> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    // Check if key with this service type already exists
    const [existingKey] = await db
      .select()
      .from(sharedSchema.customerApiKeys)
      .where(eq(sharedSchema.customerApiKeys.serviceType, keyData.serviceType))
      .limit(1);
    
    if (existingKey) {
      // Update existing key
      const [updated] = await db
        .update(sharedSchema.customerApiKeys)
        .set({
          ...keyData,
          keyVersion: (existingKey.keyVersion || 1) + 1,
          previousKeyId: existingKey.id,
          updatedAt: new Date(),
        })
        .where(eq(sharedSchema.customerApiKeys.id, existingKey.id))
        .returning();
      
      return updated;
    } else {
      // Insert new key
      const id = randomUUID();
      const [created] = await db
        .insert(sharedSchema.customerApiKeys)
        .values({
          id,
          customerId: context.customerId, // Add customerId for the shared schema
          ...keyData,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      
      return created;
    }
  }

  async updateApiKeyLastUsed(context: CustomerContext, serviceType: string): Promise<void> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    await db
      .update(sharedSchema.customerApiKeys)
      .set({
        lastUsedAt: new Date(),
        usageCount: sql`${sharedSchema.customerApiKeys.usageCount} + 1`,
      })
      .where(eq(sharedSchema.customerApiKeys.serviceType, serviceType));
  }

  async logApiKeyAccess(context: CustomerContext, logData: {
    serviceType: string;
    action: string;
    success: boolean;
    userId: string;
    ipAddress: string;
  }): Promise<void> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    // Find the API key ID for this service type
    const [apiKey] = await db
      .select()
      .from(sharedSchema.customerApiKeys)
      .where(eq(sharedSchema.customerApiKeys.serviceType, logData.serviceType))
      .limit(1);
    
    if (apiKey) {
      await db
        .insert(sharedSchema.customerApiKeyAccessLogs)
        .values({
          id: randomUUID(),
          customerId: context.customerId,
          apiKeyId: apiKey.id,
          requestMethod: 'POST',
          requestPath: '/api/settings/ai-keys/test',
          ipAddress: logData.ipAddress,
          responseStatus: logData.success ? 200 : 400,
          suspiciousActivity: false,
          billableOperation: false,
          operationCost: '0.0000',
          accessedAt: new Date(),
          createdAt: new Date(),
        });
    }
  }

  async revokeCustomerApiKey(context: CustomerContext, serviceType: string, revokeData: {
    revokedBy: string;
    revocationReason: string;
  }): Promise<boolean> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const result = await db
      .update(sharedSchema.customerApiKeys)
      .set({
        status: 'revoked',
        revokedBy: revokeData.revokedBy,
        revokedAt: new Date(),
        revocationReason: revokeData.revocationReason,
        updatedAt: new Date(),
      })
      .where(eq(sharedSchema.customerApiKeys.serviceType, serviceType))
      .returning();
    
    return result.length > 0;
  }

  /**
   * DEVELOPMENT HELPER: Create temporary customer context for current development setup
   */
  createDevelopmentContext(): CustomerContext {
    return {
      customerId: 'dev-customer-001',
    };
  }
}

// Export singleton instance
export const databaseService = new DatabaseService();