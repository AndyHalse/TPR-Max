import type { Staff, InsertStaff, Visitor, InsertVisitor, User, InsertUser, CompanySettings, InsertCompanySettings, Report, PreBooking, InsertPreBooking } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(insertUser: InsertUser): Promise<User>;

  // Staff methods
  getAllStaff(): Promise<Staff[]>;
  getStaffById(id: string): Promise<Staff | undefined>;
  createStaff(insertStaff: InsertStaff): Promise<Staff>;
  updateStaff(id: string, updates: Partial<InsertStaff>): Promise<Staff | undefined>;
  deleteStaff(id: string): Promise<boolean>;

  // Visitor methods
  getAllVisitors(): Promise<Visitor[]>;
  getCurrentVisitors(): Promise<Visitor[]>;
  getVisitorById(id: string): Promise<Visitor | undefined>;
  createVisitor(insertVisitor: InsertVisitor): Promise<Visitor>;
  updateVisitor(id: string, updates: Partial<InsertVisitor>): Promise<Visitor | undefined>;
  checkOutVisitor(id: string): Promise<Visitor | undefined>;
  getVisitorByQrCode(qrCode: string): Promise<Visitor | undefined>;

  // Company settings methods
  getCompanySettings(): Promise<CompanySettings | undefined>;
  updateCompanySettings(updates: Partial<InsertCompanySettings>): Promise<CompanySettings | undefined>;

  // Report methods  
  getAllReports(): Promise<Report[]>;
  createReport(report: Omit<Report, 'id'>): Promise<Report>;
  updateReport(id: string, updates: Partial<Report>): Promise<Report | undefined>;

  // PreBooking methods
  getAllPreBookings(): Promise<PreBooking[]>;
  getUpcomingPreBookings(): Promise<PreBooking[]>;
  getPreBookingsByDate(date: Date): Promise<PreBooking[]>;
  getPreBookingById(id: string): Promise<PreBooking | undefined>;
  getPreBookingByQrCode(qrCode: string): Promise<PreBooking | undefined>;
  createPreBooking(insertPreBooking: InsertPreBooking): Promise<PreBooking>;
  updatePreBooking(id: string, updates: Partial<PreBooking>): Promise<PreBooking | undefined>;
  deletePreBooking(id: string): Promise<boolean>;

  // Statistics methods
  getVisitorStats(): Promise<{
    currentVisitors: number;
    todayCheckins: number;
    staffOnSite: number;
    avgVisitDuration: string;
  }>;
  getTodayStats(): Promise<{
    checkins: number;
    checkouts: number; 
    currentVisitors: number;
    staffOnSite: number;
  }>;
  getRecentActivity(): Promise<Array<{
    id: string;
    type: 'checkin' | 'checkout' | 'staff_added' | 'prebooking';
    name: string;
    timestamp: Date;
    details?: string;
  }>>;

  // Emergency muster methods
  getMusterList(): Promise<Array<{
    id: string;
    name: string;
    type: 'staff' | 'visitor';
    department?: string;
    company?: string;
    checkedInAt: string;
    location: string;
    accounted: boolean;
  }>>;
}

export function createStorage(): IStorage {
  return new MemStorage();
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private staffMembers: Map<string, Staff>;
  private visitors: Map<string, Visitor>;
  private companySettings: CompanySettings | undefined;
  private reports: Map<string, Report>;
  private preBookings: Map<string, PreBooking>;

  constructor() {
    this.users = new Map();
    this.staffMembers = new Map();
    this.visitors = new Map();
    this.reports = new Map();
    this.preBookings = new Map();
    
    // Initialize with some default data
    this.initializeDefaultData();
  }

  private initializeDefaultData() {
    // Initialize default company settings
    this.companySettings = {
      id: randomUUID(),
      companyName: "TechCorp Ltd",
      logoUrl: null,
      address: "123 Business Street, London, SW1A 1AA",
      phone: "+44 20 1234 5678",
      website: "https://www.techcorp.com",
      email: "info@techcorp.com",
      bannerUrl: null,
      backgroundColor: "#f8fafc",
      foregroundColor: "#1e293b",
      accentColor: "#3b82f6",
      theme: "light",
      emailReportsEnabled: true,
      reportFrequency: "weekly",
      reportRecipients: ["admin@techcorp.com"],
      lastReportSent: null,
      updatedAt: new Date(),
    };

    // Add some sample staff
    const sampleStaff = [
      { firstName: "Sarah", lastName: "Wilson", email: "sarah.wilson@techcorp.com", department: "Engineering", employeeId: "ENG001" },
      { firstName: "Michael", lastName: "Chen", email: "michael.chen@techcorp.com", department: "Sales", employeeId: "SAL001" },
      { firstName: "Emma", lastName: "Johnson", email: "emma.johnson@techcorp.com", department: "Marketing", employeeId: "MKT001" },
      { firstName: "David", lastName: "Rodriguez", email: "david.rodriguez@techcorp.com", department: "HR", employeeId: "HR001" },
      { firstName: "Lisa", lastName: "Thompson", email: "lisa.thompson@techcorp.com", department: "Operations", employeeId: "OPS001" },
    ];

    sampleStaff.forEach((staffData) => {
      const id = randomUUID();
      this.staffMembers.set(id, {
        id,
        firstName: staffData.firstName,
        lastName: staffData.lastName,
        email: staffData.email,
        department: staffData.department,
        employeeId: staffData.employeeId,
        photoUrl: null,
        userId: null,
        isActive: true,
        createdAt: new Date(),
      });
    });

    // Add some sample visitors for demonstration
    const sampleVisitors = [
      { 
        name: "John Anderson", 
        company: "ABC Corp", 
        purpose: "Business Meeting",
        checkedInAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        isCheckedIn: true 
      },
      { 
        name: "Maria Garcia", 
        company: "XYZ Ltd", 
        purpose: "Interview",
        checkedInAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
        isCheckedIn: true 
      },
    ];

    const staffArray = Array.from(this.staffMembers.values());
    sampleVisitors.forEach((visitor, index) => {
      const id = randomUUID();
      const qrCode = `VIS-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      this.visitors.set(id, {
        id,
        name: visitor.name,
        company: visitor.company,
        purpose: visitor.purpose,
        carRegistration: null,
        hostStaffId: staffArray[index % staffArray.length]?.id,
        qrCode,
        checkedInAt: visitor.checkedInAt,
        checkedOutAt: null,
        isCheckedIn: visitor.isCheckedIn,
        createdAt: visitor.checkedInAt,
      });
    });
  }

  // User methods
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = {
      ...insertUser,
      id,
      createdAt: new Date(),
    };
    this.users.set(id, user);
    return user;
  }

  // Staff methods
  async getAllStaff(): Promise<Staff[]> {
    return Array.from(this.staffMembers.values())
      .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
  }

  async getStaffById(id: string): Promise<Staff | undefined> {
    return this.staffMembers.get(id);
  }

  async getStaffByEmail(email: string): Promise<Staff | undefined> {
    return Array.from(this.staffMembers.values()).find(staff => staff.email === email);
  }

  async createStaff(insertStaff: InsertStaff): Promise<Staff> {
    const id = randomUUID();
    const staff: Staff = {
      ...insertStaff,
      id,
      photoUrl: insertStaff.photoUrl || null,
      isActive: insertStaff.isActive ?? true,
      userId: insertStaff.userId || null,
      createdAt: new Date(),
    };
    this.staffMembers.set(id, staff);
    return staff;
  }

  async updateStaff(id: string, updates: Partial<InsertStaff>): Promise<Staff | undefined> {
    const staff = this.staffMembers.get(id);
    if (!staff) return undefined;

    const updatedStaff = { ...staff, ...updates };
    this.staffMembers.set(id, updatedStaff);
    return updatedStaff;
  }

  async deleteStaff(id: string): Promise<boolean> {
    return this.staffMembers.delete(id);
  }

  // Visitor methods
  async getAllVisitors(): Promise<Visitor[]> {
    return Array.from(this.visitors.values());
  }

  async getCurrentVisitors(): Promise<Visitor[]> {
    const currentVisitors = Array.from(this.visitors.values()).filter(visitor => visitor.isCheckedIn);
    return currentVisitors
      .sort((a, b) => b.checkedInAt.getTime() - a.checkedInAt.getTime());
  }

  async getVisitorById(id: string): Promise<Visitor | undefined> {
    return this.visitors.get(id);
  }

  async createVisitor(insertVisitor: InsertVisitor): Promise<Visitor> {
    const id = randomUUID();
    const qrCode = `VIS-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const visitor: Visitor = {
      ...insertVisitor,
      id,
      qrCode,
      checkedInAt: new Date(),
      checkedOutAt: null,
      isCheckedIn: true,
      createdAt: new Date(),
    };
    
    this.visitors.set(id, visitor);
    return visitor;
  }

  async updateVisitor(id: string, updates: Partial<InsertVisitor>): Promise<Visitor | undefined> {
    const visitor = this.visitors.get(id);
    if (!visitor) return undefined;

    const updatedVisitor = { ...visitor, ...updates };
    this.visitors.set(id, updatedVisitor);
    return updatedVisitor;
  }

  async checkOutVisitor(id: string): Promise<Visitor | undefined> {
    const visitor = this.visitors.get(id);
    if (!visitor || !visitor.isCheckedIn) return undefined;

    const updatedVisitor = {
      ...visitor,
      checkedOutAt: new Date(),
      isCheckedIn: false,
    };
    
    this.visitors.set(id, updatedVisitor);
    return updatedVisitor;
  }

  async getVisitorByQrCode(qrCode: string): Promise<Visitor | undefined> {
    return Array.from(this.visitors.values()).find(visitor => visitor.qrCode === qrCode);
  }

  // Company settings methods
  async getCompanySettings(): Promise<CompanySettings | undefined> {
    return this.companySettings;
  }

  async updateCompanySettings(updates: Partial<InsertCompanySettings>): Promise<CompanySettings | undefined> {
    if (!this.companySettings) return undefined;

    this.companySettings = { ...this.companySettings, ...updates };
    return this.companySettings;
  }

  // Report methods
  async getAllReports(): Promise<Report[]> {
    return Array.from(this.reports.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async createReport(report: Omit<Report, 'id'>): Promise<Report> {
    const id = randomUUID();
    const newReport: Report = {
      ...report,
      id,
      createdAt: new Date(),
    };
    
    this.reports.set(id, newReport);
    return newReport;
  }

  async updateReport(id: string, updates: Partial<Report>): Promise<Report | undefined> {
    const report = this.reports.get(id);
    if (!report) return undefined;

    const updatedReport = { ...report, ...updates };
    this.reports.set(id, updatedReport);
    return updatedReport;
  }

  // PreBooking methods
  async getAllPreBookings(): Promise<PreBooking[]> {
    return Array.from(this.preBookings.values())
      .sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime());
  }

  async getUpcomingPreBookings(): Promise<PreBooking[]> {
    const now = new Date();
    return Array.from(this.preBookings.values())
      .filter(booking => new Date(booking.visitDate) >= now && !booking.isCheckedIn)
      .sort((a, b) => new Date(a.visitDate).getTime() - new Date(b.visitDate).getTime());
  }

  async getPreBookingsByDate(date: Date): Promise<PreBooking[]> {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    return Array.from(this.preBookings.values())
      .filter(booking => {
        const bookingDate = new Date(booking.visitDate);
        return bookingDate >= targetDate && bookingDate < nextDay;
      })
      .sort((a, b) => new Date(a.visitDate).getTime() - new Date(b.visitDate).getTime());
  }

  async getPreBookingById(id: string): Promise<PreBooking | undefined> {
    return this.preBookings.get(id);
  }

  async getPreBookingByQrCode(qrCode: string): Promise<PreBooking | undefined> {
    return Array.from(this.preBookings.values()).find(booking => booking.qrCode === qrCode);
  }

  async createPreBooking(insertPreBooking: InsertPreBooking): Promise<PreBooking> {
    const id = randomUUID();
    const qrCode = `PRE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const preBooking: PreBooking = {
      ...insertPreBooking,
      id,
      qrCode,
      isCheckedIn: false,
      checkedInAt: null,
      visitorId: null,
      emailSent: false,
      emailSentAt: null,
      createdAt: new Date(),
    };
    
    this.preBookings.set(id, preBooking);
    return preBooking;
  }

  async updatePreBooking(id: string, updates: Partial<PreBooking>): Promise<PreBooking | undefined> {
    const preBooking = this.preBookings.get(id);
    if (!preBooking) return undefined;

    const updatedPreBooking = { ...preBooking, ...updates };
    this.preBookings.set(id, updatedPreBooking);
    return updatedPreBooking;
  }

  async deletePreBooking(id: string): Promise<boolean> {
    return this.preBookings.delete(id);
  }

  // Statistics methods
  async getVisitorStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const currentVisitors = Array.from(this.visitors.values()).filter(v => v.isCheckedIn).length;
    const todayCheckins = Array.from(this.visitors.values()).filter(v => 
      v.checkedInAt >= today
    ).length;
    const staffOnSite = Array.from(this.staffMembers.values()).length;
    
    // Calculate average visit duration for checked out visitors
    const checkedOutVisitors = Array.from(this.visitors.values()).filter(v => v.checkedOutAt);
    const totalDuration = checkedOutVisitors.reduce((sum, visitor) => {
      if (visitor.checkedOutAt) {
        return sum + (visitor.checkedOutAt.getTime() - visitor.checkedInAt.getTime());
      }
      return sum;
    }, 0);
    
    const avgDurationMs = checkedOutVisitors.length > 0 ? totalDuration / checkedOutVisitors.length : 0;
    const avgDurationHours = (avgDurationMs / (1000 * 60 * 60)).toFixed(1);
    
    return {
      currentVisitors,
      todayCheckins,
      staffOnSite,
      avgVisitDuration: `${avgDurationHours}h`
    };
  }

  async getRecentActivity() {
    const activities = [];
    
    // Recent visitor check-ins (last 5)
    const recentVisitors = Array.from(this.visitors.values())
      .sort((a, b) => b.checkedInAt.getTime() - a.checkedInAt.getTime())
      .slice(0, 5);
      
    for (const visitor of recentVisitors) {
      activities.push({
        id: `checkin-${visitor.id}`,
        type: 'checkin' as const,
        name: visitor.name,
        timestamp: visitor.checkedInAt,
        details: visitor.company ? `from ${visitor.company}` : undefined
      });
      
      if (visitor.checkedOutAt) {
        activities.push({
          id: `checkout-${visitor.id}`,
          type: 'checkout' as const,
          name: visitor.name,
          timestamp: visitor.checkedOutAt,
          details: visitor.company ? `from ${visitor.company}` : undefined
        });
      }
    }
    
    // Recent staff additions (last 3)
    const recentStaff = Array.from(this.staffMembers.values())
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 3);
      
    for (const staff of recentStaff) {
      activities.push({
        id: `staff-${staff.id}`,
        type: 'staff_added' as const,
        name: `${staff.firstName} ${staff.lastName}`,
        timestamp: new Date(staff.createdAt || new Date()),
        details: `added to ${staff.department}`
      });
    }
    
    // Recent pre-bookings (last 3)
    const recentPreBookings = Array.from(this.preBookings.values())
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 3);
      
    for (const booking of recentPreBookings) {
      activities.push({
        id: `prebooking-${booking.id}`,
        type: 'prebooking' as const,
        name: booking.visitorName,
        timestamp: new Date(booking.createdAt || new Date()),
        details: `pre-booked for ${new Date(booking.visitDate).toLocaleDateString()}`
      });
    }
    
    // Sort all activities by timestamp and return latest 10
    return activities
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 10);
  }

  async getTodayStats(): Promise<{
    checkins: number;
    checkouts: number;
    currentVisitors: number;
    staffOnSite: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const visitors = Array.from(this.visitors.values());
    const todayVisitors = visitors.filter(visitor => 
      visitor.checkedInAt >= today
    );
    
    const checkins = todayVisitors.length;
    const checkouts = todayVisitors.filter(visitor => visitor.checkedOutAt).length;
    const currentVisitors = visitors.filter(visitor => visitor.isCheckedIn).length;
    const staffOnSite = this.staffMembers.size;

    return {
      checkins,
      checkouts,
      currentVisitors,
      staffOnSite,
    };
  }

  // Get muster list for emergency situations
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
    const allStaff = await this.getAllStaff();
    const allVisitors = await this.getCurrentVisitors();
    
    const musterList = [
      ...allStaff.map(staff => ({
        id: staff.id,
        name: `${staff.firstName} ${staff.lastName}`,
        type: 'staff' as const,
        department: staff.department,
        checkedInAt: new Date().toISOString(),
        location: 'Building A',
        accounted: Math.random() > 0.3 // Simulate some people not yet accounted for
      })),
      ...allVisitors.map(visitor => ({
        id: visitor.id,
        name: visitor.name,
        type: 'visitor' as const,
        company: visitor.company,
        checkedInAt: visitor.checkedInAt,
        location: 'Reception',
        accounted: Math.random() > 0.2
      }))
    ];
    
    return musterList;
  }
}

// Create and export a default storage instance
export const storage = createStorage();