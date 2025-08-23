import { type Staff, type InsertStaff, type Visitor, type InsertVisitor, type User, type InsertUser, type CompanySettings, type InsertCompanySettings, type Report, type InsertReport, type PreBooking, type InsertPreBooking } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Staff methods
  getAllStaff(): Promise<Staff[]>;
  getStaffById(id: string): Promise<Staff | undefined>;
  createStaff(staff: InsertStaff): Promise<Staff>;
  updateStaff(id: string, updates: Partial<InsertStaff>): Promise<Staff | undefined>;
  deleteStaff(id: string): Promise<boolean>;
  
  // Visitor methods
  getAllVisitors(): Promise<Visitor[]>;
  getCurrentVisitors(): Promise<Visitor[]>;
  getVisitorById(id: string): Promise<Visitor | undefined>;
  getVisitorByQrCode(qrCode: string): Promise<Visitor | undefined>;
  createVisitor(visitor: InsertVisitor): Promise<Visitor>;
  checkOutVisitor(id: string): Promise<Visitor | undefined>;
  
  // Company Settings methods
  getCompanySettings(): Promise<CompanySettings | undefined>;
  updateCompanySettings(settings: Partial<InsertCompanySettings>): Promise<CompanySettings>;
  
  // Reports methods
  getAllReports(): Promise<Report[]>;
  createReport(report: InsertReport): Promise<Report>;
  updateReport(id: string, updates: Partial<InsertReport>): Promise<Report | undefined>;
  getReportsByDateRange(from: Date, to: Date): Promise<Report[]>;
  
  // Pre-booking methods
  getAllPreBookings(): Promise<PreBooking[]>;
  getPreBookingById(id: string): Promise<PreBooking | undefined>;
  getPreBookingByQrCode(qrCode: string): Promise<PreBooking | undefined>;
  createPreBooking(preBooking: InsertPreBooking): Promise<PreBooking>;
  updatePreBooking(id: string, updates: Partial<Omit<PreBooking, 'id' | 'createdAt'>>): Promise<PreBooking | undefined>;
  getUpcomingPreBookings(): Promise<PreBooking[]>;
  getPreBookingsByDate(date: Date): Promise<PreBooking[]>;
  
  // Stats methods
  getVisitorStats(): Promise<{
    currentVisitors: number;
    todayCheckins: number;
    staffOnSite: number;
    avgVisitDuration: string;
  }>;
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
      emailReportsEnabled: false,
      reportFrequency: "weekly",
      reportRecipients: ["admin@company.com"],
      lastReportSent: null,
      backgroundColor: "#f8fafc",
      foregroundColor: "#1e293b",
      accentColor: "#3b82f6",
      bannerUrl: null,
      updatedAt: new Date(),
    };

    const defaultStaff = [
      { name: "Sarah Wilson", department: "Engineering", employeeId: "ENG-001" },
      { name: "David Chen", department: "Marketing", employeeId: "MKT-002" },
      { name: "Lisa Park", department: "Operations", employeeId: "OPS-003" },
    ];

    defaultStaff.forEach(async (staff) => {
      await this.createStaff(staff);
    });
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getAllStaff(): Promise<Staff[]> {
    return Array.from(this.staffMembers.values()).filter(staff => staff.isActive);
  }

  async getStaffById(id: string): Promise<Staff | undefined> {
    return this.staffMembers.get(id);
  }

  async createStaff(insertStaff: InsertStaff): Promise<Staff> {
    const id = randomUUID();
    const staff: Staff = {
      ...insertStaff,
      id,
      isActive: true,
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
    const staff = this.staffMembers.get(id);
    if (!staff) return false;
    
    const updatedStaff = { ...staff, isActive: false };
    this.staffMembers.set(id, updatedStaff);
    return true;
  }

  async getAllVisitors(): Promise<Visitor[]> {
    return Array.from(this.visitors.values());
  }

  async getCurrentVisitors(): Promise<Visitor[]> {
    return Array.from(this.visitors.values()).filter(visitor => visitor.isCheckedIn);
  }

  async getVisitorById(id: string): Promise<Visitor | undefined> {
    return this.visitors.get(id);
  }

  async getVisitorByQrCode(qrCode: string): Promise<Visitor | undefined> {
    return Array.from(this.visitors.values()).find(visitor => visitor.qrCode === qrCode);
  }

  async createVisitor(insertVisitor: InsertVisitor): Promise<Visitor> {
    const id = randomUUID();
    const qrCode = `VIS-${id.substring(0, 8)}`;
    
    const visitor: Visitor = {
      ...insertVisitor,
      id,
      qrCode,
      checkedInAt: new Date(),
      checkedOutAt: null,
      isCheckedIn: true,
    };
    
    this.visitors.set(id, visitor);
    return visitor;
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

  async getVisitorStats(): Promise<{
    currentVisitors: number;
    todayCheckins: number;
    staffOnSite: number;
    avgVisitDuration: string;
  }> {
    const currentVisitors = await this.getCurrentVisitors();
    const allVisitors = await this.getAllVisitors();
    const activeStaff = await this.getAllStaff();
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayCheckins = allVisitors.filter(visitor => 
      visitor.checkedInAt >= today
    ).length;
    
    // Calculate average duration for checked-out visitors
    const checkedOutVisitors = allVisitors.filter(v => v.checkedOutAt);
    const totalDuration = checkedOutVisitors.reduce((sum, visitor) => {
      if (visitor.checkedOutAt) {
        return sum + (visitor.checkedOutAt.getTime() - visitor.checkedInAt.getTime());
      }
      return sum;
    }, 0);
    
    const avgDurationMs = checkedOutVisitors.length > 0 ? totalDuration / checkedOutVisitors.length : 0;
    const avgDurationHours = (avgDurationMs / (1000 * 60 * 60)).toFixed(1);
    
    return {
      currentVisitors: currentVisitors.length,
      todayCheckins,
      staffOnSite: activeStaff.length,
      avgVisitDuration: `${avgDurationHours}h`,
    };
  }

  async getCompanySettings(): Promise<CompanySettings | undefined> {
    return this.companySettings;
  }

  async updateCompanySettings(settings: Partial<InsertCompanySettings>): Promise<CompanySettings> {
    if (!this.companySettings) {
      this.companySettings = {
        id: randomUUID(),
        companyName: "TechCorp Ltd",
        logoUrl: null,
        emailReportsEnabled: false,
        reportFrequency: "weekly",
        reportRecipients: ["admin@company.com"],
        lastReportSent: null,
        updatedAt: new Date(),
        ...settings,
      };
    } else {
      this.companySettings = {
        ...this.companySettings,
        ...settings,
        updatedAt: new Date(),
      };
    }
    return this.companySettings;
  }

  async getAllReports(): Promise<Report[]> {
    return Array.from(this.reports.values()).sort(
      (a, b) => b.generatedAt.getTime() - a.generatedAt.getTime()
    );
  }

  async createReport(insertReport: InsertReport): Promise<Report> {
    const id = randomUUID();
    const report: Report = {
      ...insertReport,
      id,
      generatedAt: new Date(),
    };
    this.reports.set(id, report);
    return report;
  }

  async updateReport(id: string, updates: Partial<InsertReport>): Promise<Report | undefined> {
    const report = this.reports.get(id);
    if (!report) return undefined;
    
    const updatedReport = { ...report, ...updates };
    this.reports.set(id, updatedReport);
    return updatedReport;
  }

  async getReportsByDateRange(from: Date, to: Date): Promise<Report[]> {
    const allReports = await this.getAllReports();
    return allReports.filter(report => 
      report.generatedAt >= from && report.generatedAt <= to
    );
  }

  async getAllPreBookings(): Promise<PreBooking[]> {
    return Array.from(this.preBookings.values()).sort(
      (a, b) => a.visitDate.getTime() - b.visitDate.getTime()
    );
  }

  async getPreBookingById(id: string): Promise<PreBooking | undefined> {
    return this.preBookings.get(id);
  }

  async getPreBookingByQrCode(qrCode: string): Promise<PreBooking | undefined> {
    return Array.from(this.preBookings.values()).find(booking => booking.qrCode === qrCode);
  }

  async createPreBooking(insertPreBooking: InsertPreBooking): Promise<PreBooking> {
    const id = randomUUID();
    const qrCode = `PBK-${id.substring(0, 8)}`;
    
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

  async updatePreBooking(id: string, updates: Partial<Omit<PreBooking, 'id' | 'createdAt'>>): Promise<PreBooking | undefined> {
    const preBooking = this.preBookings.get(id);
    if (!preBooking) return undefined;
    
    const updatedPreBooking = { ...preBooking, ...updates };
    this.preBookings.set(id, updatedPreBooking);
    return updatedPreBooking;
  }

  async getUpcomingPreBookings(): Promise<PreBooking[]> {
    const now = new Date();
    const allBookings = await this.getAllPreBookings();
    return allBookings.filter(booking => 
      booking.visitDate >= now && !booking.isCheckedIn
    );
  }

  async getPreBookingsByDate(date: Date): Promise<PreBooking[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    const allBookings = await this.getAllPreBookings();
    return allBookings.filter(booking => 
      booking.visitDate >= startOfDay && booking.visitDate <= endOfDay
    );
  }
}

export const storage = new MemStorage();
