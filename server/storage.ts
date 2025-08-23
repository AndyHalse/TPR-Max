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
  checkoutVisitor(id: string): Promise<Visitor | undefined>;
  findVisitorByQRCode(qrCode: string): Promise<Visitor | undefined>;

  // Company settings methods
  getCompanySettings(): Promise<CompanySettings | undefined>;
  updateCompanySettings(updates: Partial<InsertCompanySettings>): Promise<CompanySettings | undefined>;

  // Report methods  
  getAllReports(): Promise<Report[]>;
  createReport(report: Omit<Report, 'id'>): Promise<Report>;

  // PreBooking methods
  getAllPreBookings(): Promise<PreBooking[]>;
  getPreBookingById(id: string): Promise<PreBooking | undefined>;
  createPreBooking(insertPreBooking: InsertPreBooking): Promise<PreBooking>;
  updatePreBooking(id: string, updates: Partial<InsertPreBooking>): Promise<PreBooking | undefined>;
  deletePreBooking(id: string): Promise<boolean>;
  findPreBookingByQRCode(qrCode: string): Promise<PreBooking | undefined>;

  // Statistics methods
  getTodayStats(): Promise<{
    checkins: number;
    checkouts: number; 
    currentVisitors: number;
    staffOnSite: number;
  }>;
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
      emailReportsEnabled: false,
      reportFrequency: "weekly",
      reportRecipients: ["admin@company.com"],
      lastReportSent: null,
      backgroundColor: "#f8fafc",
      foregroundColor: "#1e293b",
      accentColor: "#3b82f6",
      bannerUrl: null,
      theme: "light",
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

    // Soft delete by setting isActive to false
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

  async checkoutVisitor(id: string): Promise<Visitor | undefined> {
    const visitor = this.visitors.get(id);
    if (!visitor) return undefined;

    const updatedVisitor = {
      ...visitor,
      checkedOutAt: new Date(),
      isCheckedIn: false,
    };
    
    this.visitors.set(id, updatedVisitor);
    return updatedVisitor;
  }

  async findVisitorByQRCode(qrCode: string): Promise<Visitor | undefined> {
    return Array.from(this.visitors.values()).find(visitor => visitor.qrCode === qrCode);
  }

  async getCompanySettings(): Promise<CompanySettings | undefined> {
    return this.companySettings;
  }

  async updateCompanySettings(updates: Partial<InsertCompanySettings>): Promise<CompanySettings | undefined> {
    if (!this.companySettings) {
      // Create new settings if none exist
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
        theme: "light",
        updatedAt: new Date(),
        ...updates,
      };
    } else {
      this.companySettings = {
        ...this.companySettings,
        ...updates,
        updatedAt: new Date(),
      };
    }
    
    return this.companySettings;
  }

  async getAllReports(): Promise<Report[]> {
    return Array.from(this.reports.values());
  }

  async createReport(report: Omit<Report, 'id'>): Promise<Report> {
    const id = randomUUID();
    const newReport: Report = { ...report, id };
    this.reports.set(id, newReport);
    return newReport;
  }

  async getAllPreBookings(): Promise<PreBooking[]> {
    return Array.from(this.preBookings.values());
  }

  async getPreBookingById(id: string): Promise<PreBooking | undefined> {
    return this.preBookings.get(id);
  }

  async createPreBooking(insertPreBooking: InsertPreBooking): Promise<PreBooking> {
    const id = randomUUID();
    const qrCode = `PRE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const preBooking: PreBooking = {
      ...insertPreBooking,
      id,
      qrCode,
      status: "pending",
      createdAt: new Date(),
    };
    
    this.preBookings.set(id, preBooking);
    return preBooking;
  }

  async updatePreBooking(id: string, updates: Partial<InsertPreBooking>): Promise<PreBooking | undefined> {
    const preBooking = this.preBookings.get(id);
    if (!preBooking) return undefined;

    const updatedPreBooking = { ...preBooking, ...updates };
    this.preBookings.set(id, updatedPreBooking);
    return updatedPreBooking;
  }

  async deletePreBooking(id: string): Promise<boolean> {
    return this.preBookings.delete(id);
  }

  async findPreBookingByQRCode(qrCode: string): Promise<PreBooking | undefined> {
    return Array.from(this.preBookings.values()).find(booking => booking.qrCode === qrCode);
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
}
// Create and export a default storage instance
export const storage = createStorage();
