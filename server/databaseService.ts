import { eq, and, desc, asc, gte, lt, gt, sql } from "drizzle-orm";
import { customerDbService, type CustomerContext } from "./customerDatabase";
import type {
  Staff,
  InsertStaff,
  Visitor,
  InsertVisitor,
  User,
  InsertUser,
  CompanySettings,
  InsertCompanySettings,
  Department,
  InsertDepartment,
  TenantCompany,
  InsertTenantCompany,
  PreBooking,
  InsertPreBooking,
} from "@shared/schema";
import * as schema from "@shared/schema";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

/**
 * CUSTOMER-ISOLATED DATABASE SERVICE
 * 
 * This service replaces the shared MemStorage system with proper customer database isolation.
 * Every operation is scoped to a specific customer, ensuring complete data separation.
 * 
 * Each method requires CustomerContext to enforce customer isolation.
 */
export class DatabaseService {
  
  /**
   * COMPANY SETTINGS METHODS - Customer Isolated
   */
  async getCompanySettings(context: CustomerContext): Promise<CompanySettings | undefined> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const settings = await db
      .select()
      .from(schema.companySettings)
      .where(eq(schema.companySettings.customerId, context.customerId))
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
      // Update existing settings
      const updated = await db
        .update(schema.companySettings)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(
          eq(schema.companySettings.customerId, context.customerId),
          eq(schema.companySettings.id, existing.id)
        ))
        .returning();
      
      return updated[0];
    } else {
      // Create new settings for this customer
      const created = await db
        .insert(schema.companySettings)
        .values({
          customerId: context.customerId,
          ...updates,
        })
        .returning();
      
      return created[0];
    }
  }

  /**
   * STAFF METHODS - Customer & Tenant Isolated
   */
  async getAllStaff(context: CustomerContext): Promise<Staff[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    if (context.tenantId) {
      return await db
        .select()
        .from(schema.staff)
        .where(
          and(
            eq(schema.staff.customerId, context.customerId),
            eq(schema.staff.tenantCompanyId, context.tenantId)
          )
        );
    } else {
      return await db
        .select()
        .from(schema.staff)
        .where(eq(schema.staff.customerId, context.customerId));
    }
  }

  async getStaffById(context: CustomerContext, id: string): Promise<Staff | undefined> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const staff = await db
      .select()
      .from(schema.staff)
      .where(and(
        eq(schema.staff.customerId, context.customerId),
        eq(schema.staff.id, id)
      ))
      .limit(1);
    
    return staff[0];
  }

  async createStaff(context: CustomerContext, insertStaff: InsertStaff): Promise<Staff> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    // Hash password if provided
    let hashedPassword = null;
    if (insertStaff.password) {
      hashedPassword = await bcrypt.hash(insertStaff.password, 10);
    }
    
    const created = await db
      .insert(schema.staff)
      .values({
        ...insertStaff,
        customerId: context.customerId,
        password: hashedPassword,
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
    
    const updated = await db
      .update(schema.staff)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(
        eq(schema.staff.customerId, context.customerId),
        eq(schema.staff.id, id)
      ))
      .returning();
    
    return updated[0];
  }

  async deleteStaff(context: CustomerContext, id: string): Promise<boolean> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const deleted = await db
      .delete(schema.staff)
      .where(and(
        eq(schema.staff.customerId, context.customerId),
        eq(schema.staff.id, id)
      ))
      .returning();
    
    return deleted.length > 0;
  }

  async checkInStaff(context: CustomerContext, id: string, manual: boolean = false): Promise<Staff | undefined> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const updated = await db
      .update(schema.staff)
      .set({ 
        isCheckedIn: true,
        checkedInAt: new Date(),
        manualCheckIn: manual,
        updatedAt: new Date()
      })
      .where(and(
        eq(schema.staff.customerId, context.customerId),
        eq(schema.staff.id, id)
      ))
      .returning();
    
    return updated[0];
  }

  async checkOutStaff(context: CustomerContext, id: string): Promise<Staff | undefined> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const updated = await db
      .update(schema.staff)
      .set({ 
        isCheckedIn: false,
        checkedOutAt: new Date(),
        updatedAt: new Date()
      })
      .where(and(
        eq(schema.staff.customerId, context.customerId),
        eq(schema.staff.id, id)
      ))
      .returning();
    
    return updated[0];
  }

  /**
   * VISITOR METHODS - Customer & Tenant Isolated
   */
  async getAllVisitors(context: CustomerContext): Promise<Visitor[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    return await db
      .select()
      .from(schema.visitors)
      .where(eq(schema.visitors.customerId, context.customerId))
      .orderBy(desc(schema.visitors.checkedInAt));
  }

  async getTodaysVisitors(context: CustomerContext): Promise<Visitor[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return await db
      .select()
      .from(schema.visitors)
      .where(and(
        eq(schema.visitors.customerId, context.customerId),
        gte(schema.visitors.checkedInAt, today),
        lt(schema.visitors.checkedInAt, tomorrow)
      ))
      .orderBy(desc(schema.visitors.checkedInAt));
  }

  async getCurrentVisitors(context: CustomerContext): Promise<Visitor[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    return await db
      .select()
      .from(schema.visitors)
      .where(and(
        eq(schema.visitors.customerId, context.customerId),
        eq(schema.visitors.isCheckedIn, true)
      ))
      .orderBy(desc(schema.visitors.checkedInAt));
  }

  async createVisitor(context: CustomerContext, insertVisitor: InsertVisitor): Promise<Visitor> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const qrCode = `VIS-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const created = await db
      .insert(schema.visitors)
      .values({
        ...insertVisitor,
        customerId: context.customerId,
        qrCode,
      })
      .returning();
    
    return created[0];
  }

  async updateVisitor(
    context: CustomerContext, 
    id: string, 
    updates: Partial<InsertVisitor>
  ): Promise<Visitor | undefined> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const updated = await db
      .update(schema.visitors)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(
        eq(schema.visitors.customerId, context.customerId),
        eq(schema.visitors.id, id)
      ))
      .returning();
    
    return updated[0];
  }

  async checkOutVisitor(context: CustomerContext, id: string): Promise<Visitor | undefined> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const updated = await db
      .update(schema.visitors)
      .set({ 
        isCheckedIn: false, 
        checkedOutAt: new Date(),
        checkoutType: 'user',
        updatedAt: new Date()
      })
      .where(and(
        eq(schema.visitors.customerId, context.customerId),
        eq(schema.visitors.id, id)
      ))
      .returning();
    
    return updated[0];
  }

  /**
   * DEPARTMENT METHODS - Customer Isolated
   */
  async getAllDepartments(context: CustomerContext): Promise<Department[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    return await db
      .select()
      .from(schema.departments)
      .where(and(
        eq(schema.departments.customerId, context.customerId),
        eq(schema.departments.isActive, true)
      ));
  }

  async getDepartmentNames(context: CustomerContext): Promise<string[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const departments = await db
      .select({ name: schema.departments.name })
      .from(schema.departments)
      .where(and(
        eq(schema.departments.customerId, context.customerId),
        eq(schema.departments.isActive, true)
      ));
      
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
      .from(schema.staff)
      .where(and(
        eq(schema.staff.customerId, context.customerId),
        eq(schema.staff.isActive, true)
      ));
    
    return staff.map(staffMember => {
      const sessions: Array<{
        checkInTime: Date;
        checkOutTime: Date | null;
        hoursWorked: number;
        isManual: boolean;
      }> = [];
      
      // For current session if checked in
      if (staffMember.isCheckedIn && staffMember.checkedInAt && 
          staffMember.checkedInAt >= fromDate && staffMember.checkedInAt <= toDate) {
        const currentSession = {
          checkInTime: staffMember.checkedInAt,
          checkOutTime: null,
          hoursWorked: (Date.now() - staffMember.checkedInAt.getTime()) / (1000 * 60 * 60), // Hours since check-in
          isManual: staffMember.manualCheckIn || false,
        };
        sessions.push(currentSession);
      }
      
      // For completed sessions - if we have both check-in and check-out times
      if (staffMember.checkedOutAt && staffMember.checkedInAt && 
          staffMember.checkedInAt >= fromDate && staffMember.checkedInAt <= toDate &&
          !staffMember.isCheckedIn) { // Only show completed sessions when not currently checked in
        const completedSession = {
          checkInTime: staffMember.checkedInAt,
          checkOutTime: staffMember.checkedOutAt,
          hoursWorked: (staffMember.checkedOutAt.getTime() - staffMember.checkedInAt.getTime()) / (1000 * 60 * 60),
          isManual: staffMember.manualCheckIn || false,
        };
        sessions.push(completedSession);
      }
      
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
      .insert(schema.departments)
      .values({
        ...insertDepartment,
        customerId: context.customerId,
      })
      .returning();
    
    return created[0];
  }

  /**
   * USER METHODS - Customer Isolated
   */
  async getUserByUsername(context: CustomerContext, username: string): Promise<User | undefined> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const users = await db
      .select()
      .from(schema.users)
      .where(and(
        eq(schema.users.customerId, context.customerId),
        eq(schema.users.username, username)
      ))
      .limit(1);
    
    return users[0];
  }

  async createUser(context: CustomerContext, insertUser: InsertUser): Promise<User> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    // Hash password
    const hashedPassword = await bcrypt.hash(insertUser.password, 10);
    
    const created = await db
      .insert(schema.users)
      .values({
        ...insertUser,
        customerId: context.customerId,
        password: hashedPassword,
      })
      .returning();
    
    return created[0];
  }

  /**
   * STAFF HELPER METHODS - Customer Isolated
   */
  async getCheckedInStaff(context: CustomerContext): Promise<Staff[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    return await db
      .select()
      .from(schema.staff)
      .where(and(
        eq(schema.staff.customerId, context.customerId),
        eq(schema.staff.isCheckedIn, true)
      ))
      .orderBy(desc(schema.staff.checkedInAt));
  }

  /**
   * ANALYTICS METHODS - Customer Isolated  
   */
  async getDepartmentAnalytics(context: CustomerContext): Promise<any[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    // Get department analytics with visitor counts
    const results = await db
      .select({
        department: schema.staff.department,
        visitorCount: sql<number>`COUNT(DISTINCT ${schema.visitors.id})`,
        staffCount: sql<number>`COUNT(DISTINCT ${schema.staff.id})`
      })
      .from(schema.staff)
      .leftJoin(schema.visitors, and(
        eq(schema.visitors.customerId, context.customerId),
        eq(schema.visitors.hostStaffId, schema.staff.id)
      ))
      .where(eq(schema.staff.customerId, context.customerId))
      .groupBy(schema.staff.department)
      .orderBy(sql`COUNT(DISTINCT ${schema.visitors.id}) DESC`);

    return results;
  }

  /**
   * STATISTICS METHODS - Customer Isolated
   */
  async getStats(context: CustomerContext): Promise<{
    currentVisitors: number;
    todayCheckins: number;
    staffOnSite: number;
    totalStaff: number;
  }> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    // Get current visitors count
    const currentVisitorsResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.visitors)
      .where(and(
        eq(schema.visitors.customerId, context.customerId),
        eq(schema.visitors.isCheckedIn, true)
      ));
    
    // Get today's check-ins
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const todayCheckinsResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.visitors)
      .where(and(
        eq(schema.visitors.customerId, context.customerId),
        gte(schema.visitors.checkedInAt, today),
        lt(schema.visitors.checkedInAt, tomorrow)
      ));
    
    // Get staff on site
    const staffOnSiteResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.staff)
      .where(and(
        eq(schema.staff.customerId, context.customerId),
        eq(schema.staff.isCheckedIn, true)
      ));
    
    // Get total staff
    const totalStaffResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.staff)
      .where(and(
        eq(schema.staff.customerId, context.customerId),
        eq(schema.staff.isActive, true)
      ));
    
    return {
      currentVisitors: parseInt(String(currentVisitorsResult[0]?.count)) || 0,
      todayCheckins: parseInt(String(todayCheckinsResult[0]?.count)) || 0,
      staffOnSite: parseInt(String(staffOnSiteResult[0]?.count)) || 0,
      totalStaff: parseInt(String(totalStaffResult[0]?.count)) || 0,
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
    
    const hourlyData = await db
      .select({
        hour: sql<number>`EXTRACT(HOUR FROM ${schema.visitors.checkedInAt})`,
        count: sql<number>`COUNT(*)`
      })
      .from(schema.visitors)
      .where(and(
        eq(schema.visitors.customerId, context.customerId),
        gte(schema.visitors.checkedInAt, today),
        lt(schema.visitors.checkedInAt, tomorrow)
      ))
      .groupBy(sql`EXTRACT(HOUR FROM ${schema.visitors.checkedInAt})`)
      .orderBy(sql`EXTRACT(HOUR FROM ${schema.visitors.checkedInAt})`);

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
    
    const [user] = await db
      .select()
      .from(schema.users)
      .where(and(
        eq(schema.users.customerId, context.customerId),
        eq(schema.users.id, userId)
      ));
    
    return user || undefined;
  }

  async authenticateTenantUser(context: CustomerContext, username: string, password: string, tenantId?: string): Promise<User | null> {
    try {
      const user = await this.getUserByUsername(context, username);
      if (!user) {
        return null;
      }

      // Verify tenant access if specified
      if (tenantId && user.tenantCompanyId !== tenantId) {
        return null;
      }

      const isValid = await this.verifyPassword(password, user.password);
      if (!isValid) {
        return null;
      }

      return user;
    } catch (error) {
      console.error('Tenant authentication error:', error);
      return null;
    }
  }

  async authenticateStaff(context: CustomerContext, email: string, password: string): Promise<Staff | null> {
    try {
      const db = await customerDbService.getCustomerDatabase(context.customerId);
      
      const [staff] = await db
        .select()
        .from(schema.staff)
        .where(and(
          eq(schema.staff.customerId, context.customerId),
          eq(schema.staff.email, email)
        ));
      
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
      .from(schema.staff)
      .where(and(
        eq(schema.staff.customerId, context.customerId),
        eq(schema.staff.emergencyToken, token),
        gt(schema.staff.emergencyTokenExpires, new Date())
      ));
    
    return staff || null;
  }

  async toggleStaffAccountedStatus(context: CustomerContext, id: string): Promise<boolean> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const [staff] = await db
      .select()
      .from(schema.staff)
      .where(and(
        eq(schema.staff.customerId, context.customerId),
        eq(schema.staff.id, id)
      ));
    
    if (!staff) return false;
    
    await db
      .update(schema.staff)
      .set({ isAccountedFor: !staff.isAccountedFor })
      .where(and(
        eq(schema.staff.customerId, context.customerId),
        eq(schema.staff.id, id)
      ));
    
    return true;
  }

  async toggleVisitorAccountedStatus(context: CustomerContext, id: string): Promise<boolean> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const [visitor] = await db
      .select()
      .from(schema.visitors)
      .where(and(
        eq(schema.visitors.customerId, context.customerId),
        eq(schema.visitors.id, id)
      ));
    
    if (!visitor) return false;
    
    await db
      .update(schema.visitors)
      .set({ isAccountedFor: !visitor.isAccountedFor })
      .where(and(
        eq(schema.visitors.customerId, context.customerId),
        eq(schema.visitors.id, id)
      ));
    
    return true;
  }

  async toggleContractorAccountedStatus(context: CustomerContext, id: string): Promise<boolean> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const [worker] = await db
      .select()
      .from(schema.contractorWorkers)
      .where(eq(schema.contractorWorkers.id, id));
    
    if (!worker) return false;
    
    await db
      .update(schema.contractorWorkers)
      .set({ isAccountedFor: !worker.isAccountedFor })
      .where(eq(schema.contractorWorkers.id, id));
    
    return true;
  }

  async getCurrentVisitors(context: CustomerContext): Promise<Visitor[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    return await db
      .select()
      .from(schema.visitors)
      .where(and(
        eq(schema.visitors.customerId, context.customerId),
        eq(schema.visitors.isCheckedIn, true)
      ))
      .orderBy(desc(schema.visitors.checkedInAt));
  }

  async getCheckedInStaff(context: CustomerContext): Promise<Staff[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    return await db
      .select()
      .from(schema.staff)
      .where(and(
        eq(schema.staff.customerId, context.customerId),
        eq(schema.staff.isCheckedIn, true),
        eq(schema.staff.isActive, true)
      ))
      .orderBy(asc(schema.staff.firstName), asc(schema.staff.lastName));
  }

  async getCheckedInContractors(context: CustomerContext): Promise<any[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    return await db
      .select()
      .from(schema.contractorWorkers)
      .where(eq(schema.contractorWorkers.isCheckedIn, true))
      .orderBy(asc(schema.contractorWorkers.firstName), asc(schema.contractorWorkers.lastName));
  }

  async getAllContractorCompanies(context: CustomerContext): Promise<any[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    // Get all contractor companies
    const companies = await db
      .select()
      .from(schema.contractorCompanies)
      .where(eq(schema.contractorCompanies.customerId, context.customerId));
    
    // For each company, count workers and get document status
    const companiesWithCounts = await Promise.all(
      companies.map(async (company) => {
        const workersCount = await db
          .select({ count: sql<number>`count(*)` })
          .from(schema.contractorWorkers)
          .where(eq(schema.contractorWorkers.companyId, company.id));
        
        return {
          ...company,
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
      .from(schema.visitors)
      .where(and(
        eq(schema.visitors.customerId, context.customerId),
        eq(schema.visitors.id, id)
      ));
    
    return visitor || undefined;
  }

  async getVisitorByQrCode(context: CustomerContext, qrCode: string): Promise<Visitor | undefined> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const [visitor] = await db
      .select()
      .from(schema.visitors)
      .where(and(
        eq(schema.visitors.customerId, context.customerId),
        eq(schema.visitors.qrCode, qrCode)
      ));
    
    return visitor || undefined;
  }

  async checkOutVisitor(context: CustomerContext, id: string): Promise<Visitor | undefined> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    const [visitor] = await db
      .update(schema.visitors)
      .set({ 
        isCheckedIn: false,
        checkedOutAt: new Date()
      })
      .where(and(
        eq(schema.visitors.customerId, context.customerId),
        eq(schema.visitors.id, id)
      ))
      .returning();
    
    return visitor || undefined;
  }

  async getAllReports(context: CustomerContext): Promise<any[]> {
    const db = await customerDbService.getCustomerDatabase(context.customerId);
    
    return await db
      .select()
      .from(schema.reports)
      .where(eq(schema.reports.customerId, context.customerId))
      .orderBy(desc(schema.reports.createdAt));
  }

  /**
   * DEVELOPMENT HELPER: Create temporary customer context for current development setup
   */
  createDevelopmentContext(): CustomerContext {
    return {
      customerId: 'dev-customer-001',
      // No tenant specified - gets all data for this customer
    };
  }
}

// Export singleton instance
export const databaseService = new DatabaseService();