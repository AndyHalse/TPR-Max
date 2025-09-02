import { eq, and, desc, gte, lt, sql } from "drizzle-orm";
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
      currentVisitors: currentVisitorsResult[0]?.count || 0,
      todayCheckins: todayCheckinsResult[0]?.count || 0,
      staffOnSite: staffOnSiteResult[0]?.count || 0,
      totalStaff: totalStaffResult[0]?.count || 0,
    };
  }

  /**
   * DEVELOPMENT HELPER: Create temporary customer context for current development setup
   */
  static createDevelopmentContext(): CustomerContext {
    return {
      customerId: 'dev-customer-001',
      // No tenant specified - gets all data for this customer
    };
  }
}

// Export singleton instance
export const databaseService = new DatabaseService();