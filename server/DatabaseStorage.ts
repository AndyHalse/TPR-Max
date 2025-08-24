import { db } from "./db";
import { staff, staffSessions, visitors, users, companySettings, reports, preBookings, userInvitations } from "@shared/schema";
import type { 
  Staff, InsertStaff, StaffSession, InsertStaffSession, Visitor, InsertVisitor, User, InsertUser, 
  CompanySettings, InsertCompanySettings, Report, PreBooking, InsertPreBooking, UserInvitation, InsertUserInvitation
} from "@shared/schema";
import type { IStorage } from "./storage";
import { eq, and, gte, lte, desc, asc, like, ilike, or, isNull } from "drizzle-orm";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

export class DatabaseStorage implements IStorage {
  constructor() {
    // Sample data initialization removed to prevent overwriting user data
  }


  // User methods
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const hashedPassword = await bcrypt.hash(insertUser.password, 10);
    
    const [user] = await db
      .insert(users)
      .values({
        ...insertUser,
        id,
        password: hashedPassword,
      })
      .returning();
    
    return user;
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined> {
    // Hash password if updating
    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
    }

    const [updatedUser] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    
    return updatedUser || undefined;
  }

  // Staff methods
  async getAllStaff(): Promise<Staff[]> {
    const results = await db.select().from(staff).orderBy(asc(staff.firstName));
    return results;
  }

  async getStaffById(id: string): Promise<Staff | undefined> {
    const [staffMember] = await db.select().from(staff).where(eq(staff.id, id));
    return staffMember || undefined;
  }

  async getStaffByEmail(email: string): Promise<Staff | undefined> {
    const [staffMember] = await db.select().from(staff).where(eq(staff.email, email));
    return staffMember || undefined;
  }

  async createStaff(insertStaff: InsertStaff): Promise<Staff> {
    const id = randomUUID();
    
    // Hash password if provided
    let hashedPassword = undefined;
    if (insertStaff.password) {
      hashedPassword = await bcrypt.hash(insertStaff.password, 10);
    }

    const [newStaff] = await db
      .insert(staff)
      .values({
        ...insertStaff,
        id,
        password: hashedPassword,
      })
      .returning();
    
    return newStaff;
  }

  async updateStaff(id: string, updates: Partial<InsertStaff>): Promise<Staff | undefined> {
    // Hash password if updating
    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
    }

    const [updatedStaff] = await db
      .update(staff)
      .set(updates)
      .where(eq(staff.id, id))
      .returning();
    
    return updatedStaff || undefined;
  }

  async deleteStaff(id: string): Promise<boolean> {
    const result = await db.delete(staff).where(eq(staff.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Staff authentication methods
  async authenticateStaff(email: string, password: string): Promise<Staff | null> {
    const staffMember = await this.getStaffByEmail(email);
    if (!staffMember || !staffMember.password) {
      return null;
    }

    const isValid = await bcrypt.compare(password, staffMember.password);
    return isValid ? staffMember : null;
  }

  async updateStaffPassword(id: string, password: string): Promise<boolean> {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db
      .update(staff)
      .set({ password: hashedPassword })
      .where(eq(staff.id, id));
    
    return (result.rowCount || 0) > 0;
  }

  // Staff check-in/out methods
  async checkInStaff(id: string, manual: boolean = false): Promise<Staff | undefined> {
    const now = new Date();
    
    // Update staff status
    const [updatedStaff] = await db
      .update(staff)
      .set({
        isCheckedIn: true,
        checkedInAt: now,
        checkedOutAt: null, // Clear any old checkout time
        manualCheckIn: manual,
      })
      .where(eq(staff.id, id))
      .returning();
    
    // Create session record
    if (updatedStaff) {
      await db.insert(staffSessions).values({
        staffId: id,
        checkInTime: now,
        isManual: manual,
        checkInMethod: manual ? "manual" : "card",
      });
    }
    
    return updatedStaff || undefined;
  }

  async checkOutStaff(id: string): Promise<Staff | undefined> {
    const now = new Date();
    
    // Update staff status
    const [updatedStaff] = await db
      .update(staff)
      .set({
        isCheckedIn: false,
        checkedOutAt: now,
        manualCheckIn: false,
      })
      .where(eq(staff.id, id))
      .returning();
    
    // Update the most recent open session
    if (updatedStaff) {
      await db
        .update(staffSessions)
        .set({
          checkOutTime: now,
          checkOutMethod: "card", // Default to card, could be manual too
        })
        .where(and(
          eq(staffSessions.staffId, id),
          isNull(staffSessions.checkOutTime) // Only update sessions without checkout
        ));
    }
    
    return updatedStaff || undefined;
  }

  async getCheckedInStaff(): Promise<Staff[]> {
    const results = await db.select().from(staff).where(eq(staff.isCheckedIn, true));
    return results;
  }

  // Time & Attendance methods
  async getStaffTimeAndAttendance(dateFrom?: Date, dateTo?: Date): Promise<Array<{
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
    // Query all sessions within date range for all staff
    const allStaff = await this.getAllStaff();
    
    const result = [];
    
    for (const staffMember of allStaff) {
      // Build where conditions
      const whereConditions = [eq(staffSessions.staffId, staffMember.id)];
      
      // Apply date filters if provided
      if (dateFrom) {
        whereConditions.push(gte(staffSessions.checkInTime, dateFrom));
      }
      
      if (dateTo) {
        const endOfDay = new Date(dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        whereConditions.push(lte(staffSessions.checkInTime, endOfDay));
      }
      
      // Get all sessions for this staff member within date range
      const sessions = await db
        .select()
        .from(staffSessions)
        .where(and(...whereConditions))
        .orderBy(desc(staffSessions.checkInTime));
      
      // Calculate sessions with hours worked
      const processedSessions = sessions.map(session => {
        let hoursWorked = 0;
        
        if (session.checkOutTime) {
          // Session completed - calculate actual hours
          hoursWorked = (session.checkOutTime.getTime() - session.checkInTime.getTime()) / (1000 * 60 * 60);
        } else {
          // Session still active - calculate hours up to now
          hoursWorked = (new Date().getTime() - session.checkInTime.getTime()) / (1000 * 60 * 60);
        }
        
        return {
          checkInTime: session.checkInTime,
          checkOutTime: session.checkOutTime,
          hoursWorked: Math.max(0, hoursWorked), // Ensure no negative hours
          isManual: session.isManual,
        };
      });
      
      // Calculate total hours for this staff member
      const totalHours = processedSessions.reduce((sum, session) => sum + session.hoursWorked, 0);
      
      result.push({
        staffId: staffMember.id,
        staffName: `${staffMember.firstName} ${staffMember.lastName}`,
        department: staffMember.department,
        sessions: processedSessions,
        totalHours: totalHours,
      });
    }
    
    return result;
  }

  // Visitor methods with search functionality
  async getAllVisitors(): Promise<Visitor[]> {
    const results = await db.select().from(visitors).orderBy(desc(visitors.checkedInAt));
    return results;
  }

  async getCurrentVisitors(): Promise<Visitor[]> {
    const results = await db.select().from(visitors).where(eq(visitors.isCheckedIn, true));
    return results;
  }

  async getTodayVisitors(): Promise<Visitor[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const results = await db
      .select()
      .from(visitors)
      .where(gte(visitors.checkedInAt, today));
    
    return results;
  }

  async getVisitorById(id: string): Promise<Visitor | undefined> {
    const [visitor] = await db.select().from(visitors).where(eq(visitors.id, id));
    return visitor || undefined;
  }

  async createVisitor(insertVisitor: InsertVisitor): Promise<Visitor> {
    const id = randomUUID();
    const qrCode = `VIS_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    
    const [newVisitor] = await db
      .insert(visitors)
      .values({
        ...insertVisitor,
        id,
        qrCode,
      })
      .returning();
    
    return newVisitor;
  }

  async createVisitorWithTimestamps(visitorData: InsertVisitor & {
    checkedInAt: Date;
    checkedOutAt?: Date;
    isCheckedIn: boolean;
  }): Promise<Visitor> {
    const id = randomUUID();
    const qrCode = `VIS_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    
    const [visitor] = await db
      .insert(visitors)
      .values({
        id,
        name: visitorData.name,
        company: visitorData.company ?? null,
        purpose: visitorData.purpose ?? null,
        carRegistration: visitorData.carRegistration ?? null,
        hostStaffId: visitorData.hostStaffId ?? null,
        qrCode,
        checkedInAt: visitorData.checkedInAt,
        checkedOutAt: visitorData.checkedOutAt ?? null,
        isCheckedIn: visitorData.isCheckedIn,
      })
      .returning();
      
    return visitor;
  }

  async updateVisitor(id: string, updates: Partial<InsertVisitor>): Promise<Visitor | undefined> {
    const [updatedVisitor] = await db
      .update(visitors)
      .set(updates)
      .where(eq(visitors.id, id))
      .returning();
    
    return updatedVisitor || undefined;
  }

  async checkOutVisitor(id: string): Promise<Visitor | undefined> {
    const [updatedVisitor] = await db
      .update(visitors)
      .set({
        isCheckedIn: false,
        checkedOutAt: new Date(),
      })
      .where(eq(visitors.id, id))
      .returning();
    
    return updatedVisitor || undefined;
  }

  async getVisitorByQrCode(qrCode: string): Promise<Visitor | undefined> {
    const [visitor] = await db.select().from(visitors).where(eq(visitors.qrCode, qrCode));
    return visitor || undefined;
  }

  // NEW: Search visitors for quick rebooking
  async searchVisitors(searchTerm: string): Promise<Visitor[]> {
    const results = await db
      .select()
      .from(visitors)
      .where(
        or(
          ilike(visitors.name, `%${searchTerm}%`),
          ilike(visitors.company, `%${searchTerm}%`)
        )
      )
      .orderBy(desc(visitors.checkedInAt))
      .limit(10);
    
    return results;
  }

  // Company settings methods
  async getCompanySettings(): Promise<CompanySettings | undefined> {
    const [settings] = await db.select().from(companySettings).limit(1);
    return settings || undefined;
  }

  async updateCompanySettings(updates: Partial<InsertCompanySettings>): Promise<CompanySettings | undefined> {
    const existingSettings = await this.getCompanySettings();
    
    if (existingSettings) {
      const [updatedSettings] = await db
        .update(companySettings)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(companySettings.id, existingSettings.id))
        .returning();
      
      return updatedSettings || undefined;
    } else {
      const id = randomUUID();
      const [newSettings] = await db
        .insert(companySettings)
        .values({ ...updates, id })
        .returning();
      
      return newSettings;
    }
  }

  // Report methods
  async getAllReports(): Promise<Report[]> {
    const results = await db.select().from(reports).orderBy(desc(reports.generatedAt));
    return results;
  }

  async createReport(report: Omit<Report, 'id'>): Promise<Report> {
    const id = randomUUID();
    
    const [newReport] = await db
      .insert(reports)
      .values({ ...report, id })
      .returning();
    
    return newReport;
  }

  async updateReport(id: string, updates: Partial<Report>): Promise<Report | undefined> {
    const [updatedReport] = await db
      .update(reports)
      .set(updates)
      .where(eq(reports.id, id))
      .returning();
    
    return updatedReport || undefined;
  }

  // PreBooking methods with search
  async getAllPreBookings(): Promise<PreBooking[]> {
    const results = await db.select().from(preBookings).orderBy(desc(preBookings.visitDate));
    return results;
  }

  async getUpcomingPreBookings(): Promise<PreBooking[]> {
    const now = new Date();
    const results = await db
      .select()
      .from(preBookings)
      .where(gte(preBookings.visitDate, now))
      .orderBy(asc(preBookings.visitDate));
    
    return results;
  }

  async getPreBookingsByDate(date: Date): Promise<PreBooking[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    const results = await db
      .select()
      .from(preBookings)
      .where(
        and(
          gte(preBookings.visitDate, startOfDay),
          lte(preBookings.visitDate, endOfDay)
        )
      );
    
    return results;
  }

  async getPreBookingById(id: string): Promise<PreBooking | undefined> {
    const [preBooking] = await db.select().from(preBookings).where(eq(preBookings.id, id));
    return preBooking || undefined;
  }

  async getPreBookingByQrCode(qrCode: string): Promise<PreBooking | undefined> {
    const [preBooking] = await db.select().from(preBookings).where(eq(preBookings.qrCode, qrCode));
    return preBooking || undefined;
  }

  async createPreBooking(insertPreBooking: InsertPreBooking): Promise<PreBooking> {
    const id = randomUUID();
    const qrCode = `PRE_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    
    const [newPreBooking] = await db
      .insert(preBookings)
      .values({
        ...insertPreBooking,
        id,
        qrCode,
      })
      .returning();
    
    return newPreBooking;
  }

  async updatePreBooking(id: string, updates: Partial<PreBooking>): Promise<PreBooking | undefined> {
    const [updatedPreBooking] = await db
      .update(preBookings)
      .set(updates)
      .where(eq(preBookings.id, id))
      .returning();
    
    return updatedPreBooking || undefined;
  }

  async deletePreBooking(id: string): Promise<boolean> {
    const result = await db.delete(preBookings).where(eq(preBookings.id, id));
    return (result.rowCount || 0) > 0;
  }

  // NEW: Search pre-bookings for quick rebooking
  async searchPreBookings(searchTerm: string): Promise<PreBooking[]> {
    const results = await db
      .select()
      .from(preBookings)
      .where(
        or(
          ilike(preBookings.visitorName, `%${searchTerm}%`),
          ilike(preBookings.visitorEmail, `%${searchTerm}%`),
          ilike(preBookings.company, `%${searchTerm}%`)
        )
      )
      .orderBy(desc(preBookings.visitDate))
      .limit(10);
    
    return results;
  }

  // Statistics methods
  async getVisitorStats(): Promise<{
    currentVisitors: number;
    todayCheckins: number;
    staffOnSite: number;
    avgVisitDuration: string;
  }> {
    const [currentVisitors, todayVisitors, checkedInStaff] = await Promise.all([
      this.getCurrentVisitors(),
      this.getTodayVisitors(),
      this.getCheckedInStaff(),
    ]);

    // Calculate average visit duration
    const checkedOutToday = todayVisitors.filter(v => v.checkedOutAt);
    const totalDuration = checkedOutToday.reduce((sum, v) => {
      if (v.checkedOutAt) {
        return sum + (v.checkedOutAt.getTime() - v.checkedInAt.getTime());
      }
      return sum;
    }, 0);
    
    const avgDurationMs = checkedOutToday.length > 0 ? totalDuration / checkedOutToday.length : 0;
    const avgDurationHours = avgDurationMs / (1000 * 60 * 60);

    return {
      currentVisitors: currentVisitors.length,
      todayCheckins: todayVisitors.length,
      staffOnSite: checkedInStaff.length,
      avgVisitDuration: `${avgDurationHours.toFixed(1)}h`,
    };
  }

  async getRecentActivity(): Promise<Array<{
    id: string;
    type: "checkin" | "checkout" | "staff_added" | "prebooking";
    name: string;
    timestamp: Date;
    details?: string;
  }>> {
    // Get recent visitors and staff activity
    const recentVisitors = await db
      .select()
      .from(visitors)
      .orderBy(desc(visitors.checkedInAt))
      .limit(5);

    const recentStaffActivity = await db
      .select()
      .from(staff)
      .where(eq(staff.isCheckedIn, true))
      .orderBy(desc(staff.checkedInAt))
      .limit(5);

    const recentPreBookings = await db
      .select()
      .from(preBookings)
      .orderBy(desc(preBookings.createdAt))
      .limit(3);

    const activities: Array<{
      id: string;
      type: "checkin" | "checkout" | "staff_added" | "prebooking";
      name: string;
      timestamp: Date;
      details?: string;
    }> = [];

    recentVisitors.forEach(visitor => {
      activities.push({
        id: `visitor-${visitor.id}`,
        type: visitor.isCheckedIn ? "checkin" : "checkout",
        name: visitor.name,
        timestamp: visitor.checkedInAt,
        details: visitor.company || undefined,
      });
    });

    recentStaffActivity.forEach(staffMember => {
      if (staffMember.checkedInAt) {
        activities.push({
          id: `staff-${staffMember.id}`,
          type: "checkin",
          name: `${staffMember.firstName} ${staffMember.lastName}`,
          timestamp: staffMember.checkedInAt,
          details: staffMember.department,
        });
      }
    });

    recentPreBookings.forEach(booking => {
      activities.push({
        id: `prebooking-${booking.id}`,
        type: "prebooking",
        name: booking.visitorName,
        timestamp: booking.createdAt,
        details: `Visit scheduled for ${booking.visitDate.toLocaleDateString()}`,
      });
    });

    return activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 10);
  }

  // Missing methods from interface
  async getTodayStats(): Promise<{
    checkins: number;
    checkouts: number;
    currentVisitors: number;
    staffOnSite: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [todayVisitors, currentVisitors, checkedInStaff] = await Promise.all([
      this.getTodayVisitors(),
      this.getCurrentVisitors(), 
      this.getCheckedInStaff(),
    ]);

    const checkedOutToday = todayVisitors.filter(v => v.checkedOutAt);

    return {
      checkins: todayVisitors.length,
      checkouts: checkedOutToday.length,
      currentVisitors: currentVisitors.length,
      staffOnSite: checkedInStaff.length,
    };
  }

  async getMusterList(): Promise<Array<{
    id: string;
    name: string;
    type: 'staff' | 'visitor';
    department?: string;
    company?: string;
    checkedInAt: string;
    location: string;
    accounted: boolean;
  }>> {
    const [allStaff, allVisitors] = await Promise.all([
      this.getCheckedInStaff(),
      this.getCurrentVisitors(),
    ]);
    
    const musterList = [
      ...allStaff.map(staffMember => ({
        id: staffMember.id,
        name: `${staffMember.firstName} ${staffMember.lastName}`,
        type: 'staff' as const,
        department: staffMember.department,
        checkedInAt: (staffMember.checkedInAt || new Date()).toISOString(),
        location: 'Building A',
        accounted: Math.random() > 0.3 // Simulate some people not yet accounted for
      })),
      ...allVisitors.map(visitor => ({
        id: visitor.id,
        name: visitor.name,
        type: 'visitor' as const,
        company: visitor.company || undefined,
        checkedInAt: visitor.checkedInAt.toISOString(),
        location: 'Reception',
        accounted: Math.random() > 0.2
      }))
    ];
    
    return musterList;
  }

  // User invitation methods
  async createUserInvitation(insertInvitation: InsertUserInvitation): Promise<UserInvitation> {
    const token = randomUUID();
    const expires = new Date();
    expires.setDate(expires.getDate() + 7); // Expire in 7 days

    const [invitation] = await db
      .insert(userInvitations)
      .values({
        ...insertInvitation,
        token,
        expires,
      })
      .returning();

    return invitation;
  }

  async getUserInvitationByToken(token: string): Promise<UserInvitation | undefined> {
    const [invitation] = await db
      .select()
      .from(userInvitations)
      .where(eq(userInvitations.token, token));
    
    return invitation || undefined;
  }

  async getUserInvitationByEmail(email: string): Promise<UserInvitation | undefined> {
    const [invitation] = await db
      .select()
      .from(userInvitations)
      .where(and(
        eq(userInvitations.email, email),
        eq(userInvitations.used, false)
      ))
      .orderBy(desc(userInvitations.createdAt));
    
    return invitation || undefined;
  }

  async getAllUserInvitations(): Promise<UserInvitation[]> {
    const results = await db
      .select()
      .from(userInvitations)
      .orderBy(desc(userInvitations.createdAt));
    
    return results;
  }

  async markInvitationAsUsed(token: string): Promise<boolean> {
    const result = await db
      .update(userInvitations)
      .set({ used: true })
      .where(eq(userInvitations.token, token));
    
    return (result.rowCount || 0) > 0;
  }

  async deleteUserInvitation(id: string): Promise<boolean> {
    const result = await db
      .delete(userInvitations)
      .where(eq(userInvitations.id, id));
    
    return (result.rowCount || 0) > 0;
  }
}