import type { Staff, InsertStaff, Visitor, InsertVisitor, User, InsertUser, CompanySettings, InsertCompanySettings, Report, PreBooking, InsertPreBooking } from "@shared/schema";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(insertUser: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined>;

  // Staff methods
  getAllStaff(): Promise<Staff[]>;
  getStaffById(id: string): Promise<Staff | undefined>;
  getStaffByEmail(email: string): Promise<Staff | undefined>;
  createStaff(insertStaff: InsertStaff): Promise<Staff>;
  updateStaff(id: string, updates: Partial<InsertStaff>): Promise<Staff | undefined>;
  deleteStaff(id: string): Promise<boolean>;
  
  // Staff authentication methods
  authenticateStaff(email: string, password: string): Promise<Staff | null>;
  updateStaffPassword(id: string, password: string): Promise<boolean>;
  
  // Staff check-in/out methods
  checkInStaff(id: string, manual?: boolean): Promise<Staff | undefined>;
  checkOutStaff(id: string): Promise<Staff | undefined>;
  getCheckedInStaff(): Promise<Staff[]>;
  
  // Time & Attendance methods
  getStaffTimeAndAttendance(dateFrom?: Date, dateTo?: Date): Promise<Array<{
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
  }>>;

  // Visitor methods
  getAllVisitors(): Promise<Visitor[]>;
  getCurrentVisitors(): Promise<Visitor[]>;
  getTodayVisitors(): Promise<Visitor[]>;
  getVisitorById(id: string): Promise<Visitor | undefined>;
  createVisitor(insertVisitor: InsertVisitor): Promise<Visitor>;
  createVisitorWithTimestamps(visitorData: InsertVisitor & {
    checkedInAt: Date;
    checkedOutAt?: Date;
    isCheckedIn: boolean;
  }): Promise<Visitor>;
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

import { DatabaseStorage } from "./DatabaseStorage";

export function createStorage(): IStorage {
  // Using SQL database storage for production-ready data persistence
  return new DatabaseStorage();
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private staffMembers: Map<string, Staff>;
  private visitors: Map<string, Visitor>;
  private companySettings: CompanySettings | undefined;
  private reports: Map<string, Report>;
  private preBookings: Map<string, PreBooking>;
  private readonly settingsFilePath = path.join(process.cwd(), 'data', 'company-settings.json');
  private readonly staffFilePath = path.join(process.cwd(), 'data', 'staff-data.json');
  private readonly visitorsFilePath = path.join(process.cwd(), 'data', 'visitors-data.json');
  private readonly reportsFilePath = path.join(process.cwd(), 'data', 'reports-data.json');
  private readonly preBookingsFilePath = path.join(process.cwd(), 'data', 'prebookings-data.json');
  private readonly usersFilePath = path.join(process.cwd(), 'data', 'users-data.json');

  constructor() {
    this.users = new Map();
    this.staffMembers = new Map();
    this.visitors = new Map();
    this.reports = new Map();
    this.preBookings = new Map();
    
    // Ensure data directory exists
    this.ensureDataDirectory();
    
    // Load existing data or initialize defaults
    this.loadOrInitializeSettings();
    this.loadOrInitializeStaff();
    this.loadOrInitializeVisitors();
    this.loadOrInitializeReports();
    this.loadOrInitializePreBookings();
    this.loadOrInitializeUsers();
    
    // Initialize sample data only if no existing data
    if (this.staffMembers.size === 0) {
      this.initializeSampleData();
    }
  }

  private ensureDataDirectory(): void {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  private loadOrInitializeSettings(): void {
    try {
      if (fs.existsSync(this.settingsFilePath)) {
        // Load existing settings from file
        const settingsData = fs.readFileSync(this.settingsFilePath, 'utf8');
        this.companySettings = JSON.parse(settingsData);
        
        // Convert date strings back to Date objects
        if (this.companySettings) {
          this.companySettings.updatedAt = new Date(this.companySettings.updatedAt);
          if (this.companySettings.lastReportSent) {
            this.companySettings.lastReportSent = new Date(this.companySettings.lastReportSent);
          }
        }
        
        console.log('✅ Company settings loaded from persistent storage');
      } else {
        // Initialize default company settings for first time
        this.initializeDefaultSettings();
        this.saveSettingsToFile();
        console.log('🆕 New company settings initialized and saved');
      }
    } catch (error) {
      console.error('❌ Error loading company settings, using defaults:', error);
      this.initializeDefaultSettings();
    }
  }

  private initializeDefaultSettings(): void {
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
      selectedPrinter: "PDF Printer",
      enableQrCodes: true,
      enable2dBarcodes: false,
      barcodeFormat: "QR_CODE",
      printQuality: "normal",
      // Suprema Biostar integration defaults
      biostarEnabled: false,
      biostarServerUrl: "",
      biostarApiKey: "",
      biostarUsername: "",
      biostarPassword: "",
      biostarDatabaseId: "1",
      biostarSyncInterval: "300",
      biometricDevices: [],
      readerSettings: "{}",
      updatedAt: new Date(),
    };
  }

  private saveSettingsToFile(): void {
    try {
      const settingsJson = JSON.stringify(this.companySettings, null, 2);
      fs.writeFileSync(this.settingsFilePath, settingsJson, 'utf8');
    } catch (error) {
      console.error('❌ Error saving company settings:', error);
    }
  }

  private loadOrInitializeStaff(): void {
    try {
      if (fs.existsSync(this.staffFilePath)) {
        const staffData = fs.readFileSync(this.staffFilePath, 'utf8');
        const staffArray = JSON.parse(staffData);
        this.staffMembers = new Map();
        staffArray.forEach((staff: Staff) => {
          // Convert date strings back to Date objects
          if (staff.checkedInAt) staff.checkedInAt = new Date(staff.checkedInAt);
          if (staff.checkedOutAt) staff.checkedOutAt = new Date(staff.checkedOutAt);
          if (staff.lastLoginAt) staff.lastLoginAt = new Date(staff.lastLoginAt);
          if (staff.createdAt) staff.createdAt = new Date(staff.createdAt);
          this.staffMembers.set(staff.id, staff);
        });
        console.log(`✅ Staff data loaded: ${this.staffMembers.size} members`);
      }
    } catch (error) {
      console.error('❌ Error loading staff data:', error);
    }
  }

  private saveStaffToFile(): void {
    try {
      const staffArray = Array.from(this.staffMembers.values());
      const staffJson = JSON.stringify(staffArray, null, 2);
      fs.writeFileSync(this.staffFilePath, staffJson, 'utf8');
    } catch (error) {
      console.error('❌ Error saving staff data:', error);
    }
  }

  private loadOrInitializeVisitors(): void {
    try {
      if (fs.existsSync(this.visitorsFilePath)) {
        const visitorsData = fs.readFileSync(this.visitorsFilePath, 'utf8');
        const visitorsArray = JSON.parse(visitorsData);
        this.visitors = new Map();
        visitorsArray.forEach((visitor: Visitor) => {
          // Convert date strings back to Date objects
          if (visitor.checkedInAt) visitor.checkedInAt = new Date(visitor.checkedInAt);
          if (visitor.checkedOutAt) visitor.checkedOutAt = new Date(visitor.checkedOutAt);
          this.visitors.set(visitor.id, visitor);
        });
        console.log(`✅ Visitor data loaded: ${this.visitors.size} visitors`);
      }
    } catch (error) {
      console.error('❌ Error loading visitor data:', error);
    }
  }

  private saveVisitorsToFile(): void {
    try {
      const visitorsArray = Array.from(this.visitors.values());
      const visitorsJson = JSON.stringify(visitorsArray, null, 2);
      fs.writeFileSync(this.visitorsFilePath, visitorsJson, 'utf8');
    } catch (error) {
      console.error('❌ Error saving visitor data:', error);
    }
  }

  private loadOrInitializeReports(): void {
    try {
      if (fs.existsSync(this.reportsFilePath)) {
        const reportsData = fs.readFileSync(this.reportsFilePath, 'utf8');
        const reportsArray = JSON.parse(reportsData);
        this.reports = new Map();
        reportsArray.forEach((report: Report) => {
          // Convert date strings back to Date objects
          if (report.generatedAt) report.generatedAt = new Date(report.generatedAt);
          this.reports.set(report.id, report);
        });
        console.log(`✅ Reports data loaded: ${this.reports.size} reports`);
      }
    } catch (error) {
      console.error('❌ Error loading reports data:', error);
    }
  }

  private saveReportsToFile(): void {
    try {
      const reportsArray = Array.from(this.reports.values());
      const reportsJson = JSON.stringify(reportsArray, null, 2);
      fs.writeFileSync(this.reportsFilePath, reportsJson, 'utf8');
    } catch (error) {
      console.error('❌ Error saving reports data:', error);
    }
  }

  private loadOrInitializePreBookings(): void {
    try {
      if (fs.existsSync(this.preBookingsFilePath)) {
        const preBookingsData = fs.readFileSync(this.preBookingsFilePath, 'utf8');
        const preBookingsArray = JSON.parse(preBookingsData);
        this.preBookings = new Map();
        preBookingsArray.forEach((preBooking: PreBooking) => {
          // Convert date strings back to Date objects
          if (preBooking.visitDate) preBooking.visitDate = new Date(preBooking.visitDate);
          if (preBooking.checkedInAt) preBooking.checkedInAt = new Date(preBooking.checkedInAt);
          if (preBooking.emailSentAt) preBooking.emailSentAt = new Date(preBooking.emailSentAt);
          if (preBooking.createdAt) preBooking.createdAt = new Date(preBooking.createdAt);
          this.preBookings.set(preBooking.id, preBooking);
        });
        console.log(`✅ PreBookings data loaded: ${this.preBookings.size} bookings`);
      }
    } catch (error) {
      console.error('❌ Error loading prebookings data:', error);
    }
  }

  private savePreBookingsToFile(): void {
    try {
      const preBookingsArray = Array.from(this.preBookings.values());
      const preBookingsJson = JSON.stringify(preBookingsArray, null, 2);
      fs.writeFileSync(this.preBookingsFilePath, preBookingsJson, 'utf8');
    } catch (error) {
      console.error('❌ Error saving prebookings data:', error);
    }
  }

  private loadOrInitializeUsers(): void {
    try {
      if (fs.existsSync(this.usersFilePath)) {
        const usersData = fs.readFileSync(this.usersFilePath, 'utf8');
        const usersArray = JSON.parse(usersData);
        this.users = new Map();
        usersArray.forEach((user: User) => {
          // Convert date strings back to Date objects
          if (user.createdAt) user.createdAt = new Date(user.createdAt);
          this.users.set(user.id, user);
        });
        console.log(`✅ Users data loaded: ${this.users.size} users`);
      }
    } catch (error) {
      console.error('❌ Error loading users data:', error);
    }
  }

  private saveUsersToFile(): void {
    try {
      const usersArray = Array.from(this.users.values());
      const usersJson = JSON.stringify(usersArray, null, 2);
      fs.writeFileSync(this.usersFilePath, usersJson, 'utf8');
    } catch (error) {
      console.error('❌ Error saving users data:', error);
    }
  }

  private initializeSampleData(): void {
    // Only initialize if no data exists to avoid overwriting real customer data
    console.log('🔄 Initializing sample data...');

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
        accessLevel: "staff",
        password: null,
        lastLoginAt: null,
        isCheckedIn: false,
        checkedInAt: null,
        checkedOutAt: null,
        manualCheckIn: false,
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
      });
    });

    // Add some sample pre-bookings
    const samplePreBookings = [
      {
        visitorName: "James Thompson",
        visitorEmail: "james.thompson@consultingfirm.com",
        company: "Strategic Consulting Ltd",
        purpose: "Quarterly Business Review",
        visitDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
        visitTime: "09:30",
        hostStaffId: staffArray[0]?.id,
        status: "pending" as const,
      },
      {
        visitorName: "Lisa Chen",
        visitorEmail: "l.chen@techsolutions.com", 
        company: "Tech Solutions Inc",
        purpose: "Software Demo",
        visitDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
        visitTime: "14:00",
        hostStaffId: staffArray[1]?.id,
        status: "confirmed" as const,
      },
      {
        visitorName: "Robert Wilson",
        visitorEmail: "rwilson@legalpartners.co.uk",
        company: "Wilson & Partners Legal",
        purpose: "Contract Review Meeting", 
        visitDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
        visitTime: "11:00",
        hostStaffId: staffArray[2]?.id,
        status: "pending" as const,
      },
    ];

    samplePreBookings.forEach((booking) => {
      const id = randomUUID();
      const qrCode = `PRE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      this.preBookings.set(id, {
        id,
        visitorName: booking.visitorName,
        visitorEmail: booking.visitorEmail,
        company: booking.company,
        purpose: booking.purpose,
        visitDate: booking.visitDate,
        visitTime: booking.visitTime,
        hostStaffId: booking.hostStaffId || staffArray[0]?.id || "",
        qrCode,
        status: booking.status,
        isCheckedIn: false,
        checkedInAt: null,
        createdAt: new Date(),
      });
    });

    // 💾 CRITICAL: Save all sample data to persistent storage
    this.saveStaffToFile();
    this.saveVisitorsToFile();
    this.savePreBookingsToFile();
    this.saveReportsToFile(); // Even if empty, create the file
    console.log('💾 Sample data saved to persistent storage');
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
      id,
      username: insertUser.username,
      password: insertUser.password,
      email: insertUser.email || null,
      role: insertUser.role || 'user',
      isActive: insertUser.isActive ?? true,
      createdAt: new Date(),
    };
    this.users.set(id, user);
    this.saveUsersToFile(); // 💾 PERSIST IMMEDIATELY
    return user;
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;

    const updatedUser: User = {
      ...user,
      ...updates,
    };
    this.users.set(id, updatedUser);
    this.saveUsersToFile(); // 💾 PERSIST IMMEDIATELY
    return updatedUser;
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
    // Validation: Check for required fields
    if (!insertStaff.firstName?.trim()) {
      throw new Error("First name is required");
    }
    if (!insertStaff.lastName?.trim()) {
      throw new Error("Last name is required");
    }
    if (!insertStaff.email?.trim()) {
      throw new Error("Email is required");
    }
    if (!insertStaff.employeeId?.trim()) {
      throw new Error("Employee ID is required");
    }
    if (!insertStaff.department?.trim()) {
      throw new Error("Department is required");
    }
    
    // Validation: Check for duplicate email
    const existingStaffByEmail = await this.getStaffByEmail(insertStaff.email);
    if (existingStaffByEmail) {
      throw new Error("A staff member with this email already exists");
    }
    
    // Validation: Check for duplicate employee ID
    const existingStaffByEmpId = Array.from(this.staffMembers.values()).find(
      staff => staff.employeeId.toLowerCase() === insertStaff.employeeId.toLowerCase()
    );
    if (existingStaffByEmpId) {
      throw new Error("A staff member with this employee ID already exists");
    }
    
    const id = randomUUID();
    
    // Hash password if provided
    let hashedPassword = null;
    if (insertStaff.password) {
      hashedPassword = await bcrypt.hash(insertStaff.password, 10);
    }
    
    const staff: Staff = {
      ...insertStaff,
      id,
      photoUrl: insertStaff.photoUrl || null,
      accessLevel: insertStaff.accessLevel || "staff",
      password: hashedPassword,
      lastLoginAt: null,
      isCheckedIn: insertStaff.isCheckedIn ?? false,
      checkedInAt: insertStaff.checkedInAt || null,
      checkedOutAt: insertStaff.checkedOutAt || null,
      manualCheckIn: insertStaff.manualCheckIn ?? false,
      isActive: insertStaff.isActive ?? true,
      userId: insertStaff.userId || null,
      createdAt: new Date(),
    };
    this.staffMembers.set(id, staff);
    this.saveStaffToFile(); // 💾 PERSIST IMMEDIATELY
    return staff;
  }

  async updateStaff(id: string, updates: Partial<InsertStaff>): Promise<Staff | undefined> {
    const staff = this.staffMembers.get(id);
    if (!staff) return undefined;

    // Validation: Check for duplicate email if email is being updated
    if (updates.email && updates.email !== staff.email) {
      const existingStaffByEmail = await this.getStaffByEmail(updates.email);
      if (existingStaffByEmail && existingStaffByEmail.id !== id) {
        throw new Error("A staff member with this email already exists");
      }
    }
    
    // Validation: Check for duplicate employee ID if employee ID is being updated
    if (updates.employeeId && updates.employeeId !== staff.employeeId) {
      const existingStaffByEmpId = Array.from(this.staffMembers.values()).find(
        s => s.employeeId.toLowerCase() === updates.employeeId!.toLowerCase() && s.id !== id
      );
      if (existingStaffByEmpId) {
        throw new Error("A staff member with this employee ID already exists");
      }
    }
    
    // Validation: Check required fields if they're being updated
    if (updates.firstName !== undefined && !updates.firstName?.trim()) {
      throw new Error("First name cannot be empty");
    }
    if (updates.lastName !== undefined && !updates.lastName?.trim()) {
      throw new Error("Last name cannot be empty");
    }
    if (updates.email !== undefined && !updates.email?.trim()) {
      throw new Error("Email cannot be empty");
    }
    if (updates.employeeId !== undefined && !updates.employeeId?.trim()) {
      throw new Error("Employee ID cannot be empty");
    }
    if (updates.department !== undefined && !updates.department?.trim()) {
      throw new Error("Department cannot be empty");
    }

    // Hash password if being updated
    let hashedPassword = staff.password;
    if (updates.password) {
      hashedPassword = await bcrypt.hash(updates.password, 10);
    }

    const updatedStaff = { 
      ...staff, 
      ...updates, 
      password: updates.password ? hashedPassword : staff.password 
    };
    this.staffMembers.set(id, updatedStaff);
    this.saveStaffToFile(); // 💾 PERSIST IMMEDIATELY
    return updatedStaff;
  }

  async deleteStaff(id: string): Promise<boolean> {
    const result = this.staffMembers.delete(id);
    if (result) {
      this.saveStaffToFile(); // 💾 PERSIST IMMEDIATELY
    }
    return result;
  }
  
  async authenticateStaff(email: string, password: string): Promise<Staff | null> {
    const staff = await this.getStaffByEmail(email);
    if (!staff || !staff.password) {
      return null;
    }
    
    const isValid = await bcrypt.compare(password, staff.password);
    if (!isValid) {
      return null;
    }
    
    // Update last login time
    staff.lastLoginAt = new Date();
    this.staffMembers.set(staff.id, staff);
    this.saveStaffToFile(); // 💾 PERSIST IMMEDIATELY
    
    return staff;
  }
  
  async updateStaffPassword(id: string, password: string): Promise<boolean> {
    const staff = this.staffMembers.get(id);
    if (!staff) return false;
    
    const hashedPassword = await bcrypt.hash(password, 10);
    staff.password = hashedPassword;
    this.staffMembers.set(id, staff);
    this.saveStaffToFile(); // 💾 PERSIST IMMEDIATELY
    return true;
  }

  async checkInStaff(id: string, manual: boolean = false): Promise<Staff | undefined> {
    const staff = this.staffMembers.get(id);
    if (!staff) return undefined;

    const updatedStaff = {
      ...staff,
      isCheckedIn: true,
      checkedInAt: new Date(),
      checkedOutAt: null,
      manualCheckIn: manual,
    };
    
    this.staffMembers.set(id, updatedStaff);
    this.saveStaffToFile(); // 💾 PERSIST IMMEDIATELY
    return updatedStaff;
  }

  async checkOutStaff(id: string): Promise<Staff | undefined> {
    const staff = this.staffMembers.get(id);
    if (!staff || !staff.isCheckedIn) return undefined;

    const updatedStaff = {
      ...staff,
      isCheckedIn: false,
      checkedOutAt: new Date(),
      manualCheckIn: false, // Reset manual flag on checkout
    };
    
    this.staffMembers.set(id, updatedStaff);
    this.saveStaffToFile(); // 💾 PERSIST IMMEDIATELY
    return updatedStaff;
  }

  async getCheckedInStaff(): Promise<Staff[]> {
    return Array.from(this.staffMembers.values())
      .filter(staff => staff.isCheckedIn && staff.isActive)
      .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
  }

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
    const fromDate = dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default to last 30 days
    const toDate = dateTo || new Date();
    
    return Array.from(this.staffMembers.values())
      .filter(staff => staff.isActive)
      .map(staff => {
        const sessions: Array<{
          checkInTime: Date;
          checkOutTime: Date | null;
          hoursWorked: number;
          isManual: boolean;
        }> = [];
        
        // For current session if checked in
        if (staff.isCheckedIn && staff.checkedInAt && staff.checkedInAt >= fromDate && staff.checkedInAt <= toDate) {
          const currentSession = {
            checkInTime: staff.checkedInAt,
            checkOutTime: null,
            hoursWorked: (Date.now() - staff.checkedInAt.getTime()) / (1000 * 60 * 60), // Hours since check-in
            isManual: staff.manualCheckIn || false,
          };
          sessions.push(currentSession);
        }
        
        // For completed sessions (this is simplified - in a real app you'd store session history)
        if (staff.checkedOutAt && staff.checkedInAt && 
            staff.checkedInAt >= fromDate && staff.checkedInAt <= toDate) {
          const completedSession = {
            checkInTime: staff.checkedInAt,
            checkOutTime: staff.checkedOutAt,
            hoursWorked: (staff.checkedOutAt.getTime() - staff.checkedInAt.getTime()) / (1000 * 60 * 60),
            isManual: staff.manualCheckIn || false,
          };
          sessions.push(completedSession);
        }
        
        const totalHours = sessions.reduce((sum, session) => sum + session.hoursWorked, 0);
        
        return {
          staffId: staff.id,
          staffName: `${staff.firstName} ${staff.lastName}`,
          department: staff.department,
          sessions,
          totalHours,
        };
      })
      .filter(record => record.sessions.length > 0) // Only return staff with time records
      .sort((a, b) => a.staffName.localeCompare(b.staffName));
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

  async getTodayVisitors(): Promise<Visitor[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return Array.from(this.visitors.values())
      .filter(visitor => {
        const checkedInAt = new Date(visitor.checkedInAt || 0);
        return checkedInAt >= today && checkedInAt < tomorrow;
      })
      .sort((a, b) => new Date(a.checkedInAt || 0).getTime() - new Date(b.checkedInAt || 0).getTime());
  }

  async getVisitorById(id: string): Promise<Visitor | undefined> {
    return this.visitors.get(id);
  }

  async createVisitor(insertVisitor: InsertVisitor): Promise<Visitor> {
    const id = randomUUID();
    const qrCode = `VIS-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const visitor: Visitor = {
      id,
      name: insertVisitor.name,
      company: insertVisitor.company ?? null,
      purpose: insertVisitor.purpose ?? null,
      carRegistration: insertVisitor.carRegistration ?? null,
      hostStaffId: insertVisitor.hostStaffId ?? null,
      qrCode,
      checkedInAt: new Date(),
      checkedOutAt: null,
      isCheckedIn: true,
    };
    
    this.visitors.set(id, visitor);
    this.saveVisitorsToFile(); // 💾 PERSIST IMMEDIATELY
    return visitor;
  }

  async createVisitorWithTimestamps(visitorData: InsertVisitor & {
    checkedInAt: Date;
    checkedOutAt?: Date;
    isCheckedIn: boolean;
  }): Promise<Visitor> {
    const id = randomUUID();
    const qrCode = `VIS-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const visitor: Visitor = {
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
    };
    
    this.visitors.set(id, visitor);
    this.saveVisitorsToFile(); // 💾 PERSIST IMMEDIATELY
    return visitor;
  }

  async updateVisitor(id: string, updates: Partial<InsertVisitor>): Promise<Visitor | undefined> {
    const visitor = this.visitors.get(id);
    if (!visitor) return undefined;

    const updatedVisitor = { ...visitor, ...updates };
    this.visitors.set(id, updatedVisitor);
    this.saveVisitorsToFile(); // 💾 PERSIST IMMEDIATELY
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
    this.saveVisitorsToFile(); // 💾 PERSIST IMMEDIATELY
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

    this.companySettings = { ...this.companySettings, ...updates, updatedAt: new Date() };
    
    // Save to file immediately for persistence
    this.saveSettingsToFile();
    
    console.log('💾 Company settings updated and saved to persistent storage');
    return this.companySettings;
  }

  // Report methods
  async getAllReports(): Promise<Report[]> {
    return Array.from(this.reports.values())
      .sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime());
  }

  async createReport(report: Omit<Report, 'id'>): Promise<Report> {
    const id = randomUUID();
    const newReport: Report = {
      ...report,
      id,
      generatedAt: new Date(),
    };
    
    this.reports.set(id, newReport);
    this.saveReportsToFile(); // 💾 PERSIST IMMEDIATELY
    return newReport;
  }

  async updateReport(id: string, updates: Partial<Report>): Promise<Report | undefined> {
    const report = this.reports.get(id);
    if (!report) return undefined;

    const updatedReport = { ...report, ...updates };
    this.reports.set(id, updatedReport);
    this.saveReportsToFile(); // 💾 PERSIST IMMEDIATELY
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
      id,
      visitorName: insertPreBooking.visitorName,
      visitorEmail: insertPreBooking.visitorEmail,
      company: insertPreBooking.company || null,
      purpose: insertPreBooking.purpose || null,
      hostStaffId: insertPreBooking.hostStaffId || null,
      visitDate: insertPreBooking.visitDate,
      qrCode,
      isCheckedIn: false,
      checkedInAt: null,
      visitorId: null,
      emailSent: false,
      emailSentAt: null,
      createdAt: new Date(),
    };
    
    this.preBookings.set(id, preBooking);
    this.savePreBookingsToFile(); // 💾 PERSIST IMMEDIATELY
    return preBooking;
  }

  async updatePreBooking(id: string, updates: Partial<PreBooking>): Promise<PreBooking | undefined> {
    const preBooking = this.preBookings.get(id);
    if (!preBooking) return undefined;

    const updatedPreBooking = { ...preBooking, ...updates };
    this.preBookings.set(id, updatedPreBooking);
    this.savePreBookingsToFile(); // 💾 PERSIST IMMEDIATELY
    return updatedPreBooking;
  }

  async deletePreBooking(id: string): Promise<boolean> {
    const result = this.preBookings.delete(id);
    if (result) {
      this.savePreBookingsToFile(); // 💾 PERSIST IMMEDIATELY
    }
    return result;
  }

  // Statistics methods
  async getVisitorStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const currentVisitors = Array.from(this.visitors.values()).filter(v => v.isCheckedIn).length;
    const todayCheckins = Array.from(this.visitors.values()).filter(v => 
      v.checkedInAt >= today
    ).length;
    const staffOnSite = Array.from(this.staffMembers.values()).filter(s => s.isActive && s.isCheckedIn).length;
    
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
    const staffOnSite = Array.from(this.staffMembers.values()).filter(s => s.isActive && s.isCheckedIn).length;

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
        company: visitor.company || undefined,
        checkedInAt: visitor.checkedInAt.toISOString(),
        location: 'Reception',
        accounted: Math.random() > 0.2
      }))
    ];
    
    return musterList;
  }
}

// Create and export a default storage instance
export const storage = createStorage();