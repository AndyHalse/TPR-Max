import type { 
  Staff, 
  InsertStaff, 
  Visitor, 
  InsertVisitor, 
  User, 
  InsertUser, 
  CompanySettings, 
  InsertCompanySettings, 
  PrinterConfiguration,
  InsertPrinterConfiguration,
  Report, 
  PreBooking, 
  InsertPreBooking,
  ContractorCompany,
  InsertContractorCompany,
  ContractorWorker,
  InsertContractorWorker,
  ComplianceDocument,
  InsertComplianceDocument,
  DocumentType,
  InsertDocumentType,
  WorkerCompetency,
  InsertWorkerCompetency,
  Department,
  InsertDepartment,
  InductionSettings,
  InsertInductionSettings,
  NvqQualification,
  InsertNvqQualification,
  TenantCompany,
  InsertTenantCompany,
  BuildingSettings,
  InsertBuildingSettings,
  MeetingRoom,
  InsertMeetingRoom,
  RoomBooking,
  InsertRoomBooking,
  RoomBookingAttendee,
  InsertRoomBookingAttendee,
  RoomBookingWaitlist,
  InsertRoomBookingWaitlist
} from "@shared/schema";
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
  
  // Tenant-specific authentication
  authenticateTenantUser(username: string, password: string, tenantId?: string): Promise<User | null>;
  getUsersByTenant(tenantId: string): Promise<User[]>;

  // Staff methods
  getAllStaff(): Promise<Staff[]>;
  getStaffById(id: string): Promise<Staff | undefined>;
  getStaffByEmail(email: string): Promise<Staff | undefined>;
  createStaff(insertStaff: InsertStaff): Promise<Staff>;
  updateStaff(id: string, updates: Partial<InsertStaff>): Promise<Staff | undefined>;
  deleteStaff(id: string): Promise<boolean>;
  
  // Tenant-specific staff methods
  getStaffByTenant(tenantId: string): Promise<Staff[]>;
  getCheckedInStaffByTenant(tenantId: string): Promise<Staff[]>;
  
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
  deleteVisitor(id: string): Promise<boolean>;
  getVisitorByQrCode(qrCode: string): Promise<Visitor | undefined>;
  findCheckedInVisitor(firstName: string, lastName: string, company?: string): Promise<Visitor | undefined>;
  searchVisitors(searchTerm: string): Promise<Visitor[]>;
  getUniqueCompanies(): Promise<string[]>;
  
  // Tenant-specific visitor methods
  getVisitorsByTenant(tenantId: string): Promise<Visitor[]>;
  getCurrentVisitorsByTenant(tenantId: string): Promise<Visitor[]>;
  getTodayVisitorsByTenant(tenantId: string): Promise<Visitor[]>;

  // Company settings methods
  getCompanySettings(): Promise<CompanySettings | undefined>;
  updateCompanySettings(updates: Partial<InsertCompanySettings>): Promise<CompanySettings | undefined>;
  
  // Induction settings methods
  getInductionSettings(): Promise<InductionSettings[]>;
  getInductionSettingsByRole(roleType: string): Promise<InductionSettings | undefined>;
  updateInductionSettings(roleType: string, updates: Partial<InsertInductionSettings>): Promise<InductionSettings>;

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

  // Contractor Company methods
  getAllContractorCompanies(): Promise<Array<ContractorCompany & { workersCount: number; documentsStatus: Record<string, string> }>>;
  getContractorCompanyById(id: string): Promise<ContractorCompany | undefined>;
  createContractorCompany(insertCompany: InsertContractorCompany): Promise<ContractorCompany>;
  updateContractorCompany(id: string, updates: Partial<InsertContractorCompany>): Promise<ContractorCompany | undefined>;
  deleteContractorCompany(id: string): Promise<boolean>;
  
  // Contractor Worker methods
  getAllContractorWorkers(): Promise<ContractorWorker[]>;
  getWorkersByCompanyId(companyId: string): Promise<ContractorWorker[]>;
  getContractorWorkerById(id: string): Promise<ContractorWorker | undefined>;
  createContractorWorker(insertWorker: InsertContractorWorker): Promise<ContractorWorker>;
  updateContractorWorker(id: string, updates: Partial<InsertContractorWorker>): Promise<ContractorWorker | undefined>;
  deleteContractorWorker(id: string): Promise<boolean>;
  
  // Compliance Document methods
  getDocumentsByCompanyId(companyId: string): Promise<ComplianceDocument[]>;
  createComplianceDocument(insertDocument: InsertComplianceDocument): Promise<ComplianceDocument>;
  updateComplianceDocument(id: string, updates: Partial<InsertComplianceDocument>): Promise<ComplianceDocument | undefined>;
  deleteComplianceDocument(id: string): Promise<boolean>;
  
  // Document Type methods
  getAllDocumentTypes(): Promise<DocumentType[]>;
  createDocumentType(insertType: InsertDocumentType): Promise<DocumentType>;
  
  // Worker Competency methods
  getCompetenciesByWorkerId(workerId: string): Promise<WorkerCompetency[]>;
  createWorkerCompetency(insertCompetency: InsertWorkerCompetency): Promise<WorkerCompetency>;
  updateWorkerCompetency(id: string, updates: Partial<InsertWorkerCompetency>): Promise<WorkerCompetency | undefined>;
  deleteWorkerCompetency(id: string): Promise<boolean>;

  // Multi-Tenant methods
  getAllTenantCompanies(): Promise<TenantCompany[]>;
  getTenantCompanyById(id: string): Promise<TenantCompany | undefined>;
  getTenantCompanyBySlug(slug: string): Promise<TenantCompany | undefined>;
  createTenantCompany(insertTenant: InsertTenantCompany): Promise<TenantCompany>;
  updateTenantCompany(id: string, updates: Partial<InsertTenantCompany>): Promise<TenantCompany | undefined>;
  updateTenantStatus(id: string, isActive: boolean): Promise<TenantCompany>;
  deleteTenantCompany(id: string): Promise<boolean>;
  
  // Building Statistics for Super Admin
  getBuildingStats(): Promise<{
    totalTenants: number;
    activeTenants: number;
    totalStaff: number;
    totalVisitors: number;
    visitorsToday: number;
    staffOnSite: number;
  }>;

  // Building Settings methods
  getBuildingSettings(): Promise<BuildingSettings | undefined>;
  updateBuildingSettings(updates: Partial<InsertBuildingSettings>): Promise<BuildingSettings | undefined>;
  
  // Meeting Room methods
  getAllMeetingRooms(): Promise<MeetingRoom[]>;
  getMeetingRoomById(id: string): Promise<MeetingRoom | undefined>;
  createMeetingRoom(insertRoom: InsertMeetingRoom): Promise<MeetingRoom>;
  updateMeetingRoom(id: string, updates: Partial<InsertMeetingRoom>): Promise<MeetingRoom | undefined>;
  deleteMeetingRoom(id: string): Promise<boolean>;

  // NVQ Qualification methods
  getAllNvqQualifications(): Promise<NvqQualification[]>;
  getActiveNvqQualifications(): Promise<NvqQualification[]>;
  getNvqQualificationById(id: string): Promise<NvqQualification | undefined>;
  createNvqQualification(insertQualification: InsertNvqQualification): Promise<NvqQualification>;
  updateNvqQualification(id: string, updates: Partial<InsertNvqQualification>): Promise<NvqQualification | undefined>;
  deleteNvqQualification(id: string): Promise<boolean>;

  // Emergency muster methods
  getMusterList(): Promise<Array<{
    id: string;
    name: string;
    type: 'staff' | 'visitor' | 'contractor';
    department?: string;
    company?: string;
    checkedInAt: string;
    location: string;
    accounted: boolean;
  }>>;
  
  // Accounted status toggle methods
  toggleStaffAccountedStatus(id: string): Promise<boolean>;
  toggleVisitorAccountedStatus(id: string): Promise<boolean>;
  toggleContractorAccountedStatus(id: string): Promise<boolean>;
  
  // Fire Marshal emergency methods
  getFireMarshals(): Promise<Staff[]>;
  updateStaffEmergencyToken(staffId: string, token: string, expires: Date): Promise<boolean>;
  validateEmergencyToken(token: string): Promise<Staff | null>;
  getTotalOnSitePersonnel(): Promise<number>;

  // Department analytics methods
  getDepartmentAnalytics(): Promise<Array<{
    department: string;
    visitorCount: number;
    staffCount: number;
    totalCount: number;
    trend: string;
    color: string;
  }>>;
  getDepartmentDetails(department: string): Promise<{
    department: string;
    staff: Array<{
      id: string;
      name: string;
      checkedInAt: Date | null;
      isCheckedIn: boolean;
      accessLevel: string;
    }>;
    visitors: Array<{
      id: string;
      name: string;
      company: string | null;
      checkedInAt: Date;
      isCheckedIn: boolean;
      hostName: string;
    }>;
    totalCount: number;
  }>;

  // Department management methods
  getAllDepartments(): Promise<Department[]>;
  getDepartmentById(id: string): Promise<Department | undefined>;
  createDepartment(insertDepartment: InsertDepartment): Promise<Department>;
  updateDepartment(id: string, updates: Partial<InsertDepartment>): Promise<Department | undefined>;
  deleteDepartment(id: string): Promise<boolean>;
  getDepartmentNames(): Promise<string[]>;

  // Peak hours analytics methods
  getPeakHoursAnalytics(): Promise<{
    peakHours: string;
    weeklyTrend: string;
    hourlyData: Array<{
      hour: string;
      visitors: number;
      staff: number;
      contractors: number;
      total: number;
    }>;
  }>;

  // Printer Configuration methods
  getAllPrinterConfigurations(): Promise<PrinterConfiguration[]>;
  getPrinterConfiguration(printerName: string): Promise<PrinterConfiguration | undefined>;
  createPrinterConfiguration(insertPrinterConfiguration: InsertPrinterConfiguration): Promise<PrinterConfiguration>;
  updatePrinterConfiguration(id: string, updates: Partial<InsertPrinterConfiguration>): Promise<PrinterConfiguration | undefined>;
  deletePrinterConfiguration(id: string): Promise<boolean>;
  setDefaultPrinterConfiguration(id: string): Promise<PrinterConfiguration | undefined>;

  // Meeting Room methods
  getAllMeetingRooms(): Promise<MeetingRoom[]>;
  getMeetingRoomById(id: string): Promise<MeetingRoom | undefined>;
  getMeetingRoomsByTenant(tenantId: string): Promise<MeetingRoom[]>;
  getSharedMeetingRooms(): Promise<MeetingRoom[]>;
  createMeetingRoom(insertRoom: InsertMeetingRoom): Promise<MeetingRoom>;
  updateMeetingRoom(id: string, updates: Partial<InsertMeetingRoom>): Promise<MeetingRoom | undefined>;
  deleteMeetingRoom(id: string): Promise<boolean>;
  checkRoomAvailability(roomId: string, startTime: Date, endTime: Date, excludeBookingId?: string): Promise<boolean>;

  // Room Booking methods
  getRoomBookings(startDate?: Date, endDate?: Date): Promise<(RoomBooking & { room: MeetingRoom; organizer: Staff })[]>;
  getRoomBookingsByRoom(roomId: string, startDate?: Date, endDate?: Date): Promise<(RoomBooking & { organizer: Staff })[]>;
  getRoomBookingsByTenant(tenantId: string, startDate?: Date, endDate?: Date): Promise<(RoomBooking & { room: MeetingRoom; organizer: Staff })[]>;
  getRoomBookingById(id: string): Promise<(RoomBooking & { room: MeetingRoom; organizer: Staff }) | undefined>;
  createRoomBooking(insertBooking: InsertRoomBooking): Promise<RoomBooking>;
  updateRoomBooking(id: string, updates: Partial<InsertRoomBooking>): Promise<RoomBooking | undefined>;
  cancelRoomBooking(id: string, cancelledBy: string): Promise<RoomBooking | undefined>;
  deleteRoomBooking(id: string): Promise<boolean>;
  getUpcomingBookings(roomId?: string, minutes?: number): Promise<(RoomBooking & { room: MeetingRoom; organizer: Staff })[]>;
  checkInToMeeting(bookingId: string, staffId: string): Promise<RoomBooking | undefined>;
  endMeeting(bookingId: string): Promise<RoomBooking | undefined>;

  // Room Booking Attendees methods
  getBookingAttendees(bookingId: string): Promise<RoomBookingAttendee[]>;
  addBookingAttendee(insertAttendee: InsertRoomBookingAttendee): Promise<RoomBookingAttendee>;
  updateAttendeeResponse(id: string, status: string): Promise<RoomBookingAttendee | undefined>;
  removeBookingAttendee(id: string): Promise<boolean>;

  // Room Booking Waitlist methods
  getWaitlistByRoom(roomId: string): Promise<RoomBookingWaitlist[]>;
  addToWaitlist(insertWaitlist: InsertRoomBookingWaitlist): Promise<RoomBookingWaitlist>;
  removeFromWaitlist(id: string): Promise<boolean>;
  notifyWaitlistUsers(roomId: string, startTime: Date, endTime: Date): Promise<RoomBookingWaitlist[]>;

  // Meeting Room Analytics methods
  getRoomUtilizationStats(startDate?: Date, endDate?: Date): Promise<Array<{
    roomId: string;
    roomName: string;
    totalBookings: number;
    totalHours: number;
    utilizationRate: number;
    averageBookingDuration: number;
  }>>;
  getMeetingPatterns(): Promise<{
    peakHours: string;
    popularRooms: Array<{ roomName: string; bookingCount: number }>;
    averageMeetingDuration: number;
    weeklyTrend: Array<{ day: string; bookings: number }>;
  }>;
}

import { DatabaseStorage } from "./DatabaseStorage";

export function createStorage(): IStorage {
  // Using memory storage for development with sample data
  return new MemStorage();
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private staffMembers: Map<string, Staff>;
  private visitors: Map<string, Visitor>;
  private companySettings: CompanySettings | undefined;
  private inductionSettings: InductionSettings[];
  private reports: Map<string, Report>;
  private preBookings: Map<string, PreBooking>;
  private tenantCompanies: Map<string, TenantCompany>;
  private buildingSettings: BuildingSettings | undefined;
  private meetingRooms: Map<string, MeetingRoom>;
  private readonly settingsFilePath = path.join(process.cwd(), 'data', 'company-settings.json');
  private readonly staffFilePath = path.join(process.cwd(), 'data', 'staff-data.json');
  private readonly visitorsFilePath = path.join(process.cwd(), 'data', 'visitors-data.json');
  private readonly reportsFilePath = path.join(process.cwd(), 'data', 'reports-data.json');
  private readonly preBookingsFilePath = path.join(process.cwd(), 'data', 'prebookings-data.json');
  private readonly usersFilePath = path.join(process.cwd(), 'data', 'users-data.json');
  private readonly meetingRoomsFilePath = path.join(process.cwd(), 'data', 'meeting-rooms-data.json');

  constructor() {
    this.users = new Map();
    this.staffMembers = new Map();
    this.visitors = new Map();
    this.inductionSettings = [];
    this.reports = new Map();
    this.preBookings = new Map();
    this.tenantCompanies = new Map();
    this.meetingRooms = new Map();
    this.buildingSettings = undefined;
    
    // Ensure data directory exists
    this.ensureDataDirectory();
    
    // Load existing data or initialize defaults
    this.loadOrInitializeSettings();
    this.loadOrInitializeStaff();
    this.loadOrInitializeVisitors();
    this.loadOrInitializeReports();
    this.loadOrInitializePreBookings();
    this.loadOrInitializeUsers();
    this.loadOrInitializeMeetingRooms();
    
    // Initialize sample data only if no existing data
    if (this.staffMembers.size === 0) {
      this.initializeSampleData();
    }
    
    // Initialize sample meeting rooms if none exist
    if (this.meetingRooms.size === 0) {
      this.initializeSampleMeetingRooms();
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
      // AI and Video Generation defaults
      openaiModel: "gpt-5", // GPT-5 is now available and default
      openaiTemperature: "0.7",
      openaiMaxTokens: "4000",
      videoQualityPreference: "high",
      enableAdvancedVideoFeatures: true,
      defaultVideoLength: "15",
      aiInstructionsPrompt: "Create comprehensive, engaging safety induction content",
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
    // No mock data - zero fake data policy
    console.log('🔄 Database initialized - no sample data loaded');

    // 💾 Save data structures to files (no sample data)
    this.saveStaffToFile();
    this.saveVisitorsToFile();
    this.savePreBookingsToFile();
    this.saveReportsToFile(); // Even if empty, create the file
    console.log('💾 Data files initialized');
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
    
    // Hash the password before storing
    const hashedPassword = await bcrypt.hash(insertUser.password, 10);
    
    const user: User = {
      id,
      username: insertUser.username,
      password: hashedPassword,
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

    // Hash password if it's being updated
    const processedUpdates = { ...updates };
    if (updates.password) {
      processedUpdates.password = await bcrypt.hash(updates.password, 10);
    }

    const updatedUser: User = {
      ...user,
      ...processedUpdates,
    };
    
    this.users.set(id, updatedUser);
    this.saveUsersToFile(); // 💾 PERSIST IMMEDIATELY
    return updatedUser;
  }

  // Tenant-specific authentication methods
  async authenticateTenantUser(username: string, password: string, tenantId?: string): Promise<User | null> {
    try {
      let user = Array.from(this.users.values()).find(u => u.username === username && u.isActive);
      
      // If tenantId is provided, filter by tenant
      if (tenantId && user) {
        if (user.tenantCompanyId !== tenantId) {
          return null;
        }
      }

      if (!user || !user.password) {
        return null;
      }

      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return null;
      }

      // Update last login time
      await this.updateUser(user.id, { lastLoginAt: new Date() });

      return user;
    } catch (error) {
      console.error('Tenant user authentication error:', error);
      return null;
    }
  }

  async getUsersByTenant(tenantId: string): Promise<User[]> {
    return Array.from(this.users.values())
      .filter(user => user.tenantCompanyId === tenantId)
      .sort((a, b) => a.username.localeCompare(b.username));
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

  // Tenant-specific staff methods
  async getStaffByTenant(tenantId: string): Promise<Staff[]> {
    return Array.from(this.staffMembers.values())
      .filter(staff => staff.tenantCompanyId === tenantId)
      .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
  }

  async getCheckedInStaffByTenant(tenantId: string): Promise<Staff[]> {
    return Array.from(this.staffMembers.values())
      .filter(staff => staff.tenantCompanyId === tenantId && staff.isCheckedIn && staff.isActive)
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
      firstName: insertVisitor.firstName,
      lastName: insertVisitor.lastName,
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
      firstName: visitorData.firstName,
      lastName: visitorData.lastName,
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

  async deleteVisitor(id: string): Promise<boolean> {
    const result = this.visitors.delete(id);
    if (result) {
      this.saveVisitorsToFile(); // 💾 PERSIST IMMEDIATELY
    }
    return result;
  }

  async getVisitorByQrCode(qrCode: string): Promise<Visitor | undefined> {
    return Array.from(this.visitors.values()).find(visitor => visitor.qrCode === qrCode);
  }

  async getUniqueCompanies(): Promise<string[]> {
    const companies = new Set<string>();
    
    // Collect unique company names from visitors
    Array.from(this.visitors.values()).forEach(visitor => {
      if (visitor.company && visitor.company.trim()) {
        companies.add(visitor.company.trim());
      }
    });
    
    // Also collect from pre-bookings
    Array.from(this.preBookings.values()).forEach(booking => {
      if (booking.company && booking.company.trim()) {
        companies.add(booking.company.trim());
      }
    });
    
    return Array.from(companies).sort();
  }

  // Tenant-specific visitor methods
  async getVisitorsByTenant(tenantId: string): Promise<Visitor[]> {
    return Array.from(this.visitors.values())
      .filter(visitor => visitor.tenantCompanyId === tenantId)
      .sort((a, b) => b.checkedInAt.getTime() - a.checkedInAt.getTime());
  }

  async getCurrentVisitorsByTenant(tenantId: string): Promise<Visitor[]> {
    return Array.from(this.visitors.values())
      .filter(visitor => visitor.tenantCompanyId === tenantId && visitor.isCheckedIn)
      .sort((a, b) => b.checkedInAt.getTime() - a.checkedInAt.getTime());
  }

  async getTodayVisitorsByTenant(tenantId: string): Promise<Visitor[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return Array.from(this.visitors.values())
      .filter(visitor => {
        const checkedInAt = new Date(visitor.checkedInAt || 0);
        return visitor.tenantCompanyId === tenantId &&
               checkedInAt >= today && checkedInAt < tomorrow;
      })
      .sort((a, b) => new Date(a.checkedInAt || 0).getTime() - new Date(b.checkedInAt || 0).getTime());
  }

  // Company settings methods
  async getCompanySettings(): Promise<CompanySettings | undefined> {
    return this.companySettings;
  }

  async updateCompanySettings(updates: Partial<InsertCompanySettings>): Promise<CompanySettings | undefined> {
    // Implementation here - update the settings
    if (this.companySettings) {
      Object.assign(this.companySettings, updates);
    }
    return this.companySettings;
  }
  
  // Induction settings methods
  async getInductionSettings(): Promise<InductionSettings[]> {
    return this.inductionSettings;
  }

  async getInductionSettingsByRole(roleType: string): Promise<InductionSettings | undefined> {
    return this.inductionSettings.find(s => s.roleType === roleType);
  }

  async updateInductionSettings(roleType: string, updates: Partial<InsertInductionSettings>): Promise<InductionSettings> {
    const existingIndex = this.inductionSettings.findIndex(s => s.roleType === roleType);
    if (existingIndex !== -1) {
      Object.assign(this.inductionSettings[existingIndex], updates);
      return this.inductionSettings[existingIndex];
    } else {
      const newSetting: InductionSettings = {
        id: randomUUID(),
        roleType,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...updates
      } as InductionSettings;
      this.inductionSettings.push(newSetting);
      return newSetting;
    }
  }

  async updateCompanySettingsOld(updates: Partial<InsertCompanySettings>): Promise<CompanySettings | undefined> {
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
        name: `${visitor.firstName} ${visitor.lastName}`,
        timestamp: visitor.checkedInAt,
        details: visitor.company ? `from ${visitor.company}` : undefined
      });
      
      if (visitor.checkedOutAt) {
        activities.push({
          id: `checkout-${visitor.id}`,
          type: 'checkout' as const,
          name: `${visitor.firstName} ${visitor.lastName}`,
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

  // Accounted status toggle methods
  async toggleStaffAccountedStatus(id: string): Promise<boolean> {
    const staff = this.staffMembers.get(id);
    if (!staff) return false;
    
    staff.isAccountedFor = !staff.isAccountedFor;
    this.staffMembers.set(id, staff);
    return true;
  }

  async toggleVisitorAccountedStatus(id: string): Promise<boolean> {
    const visitor = this.visitors.get(id);
    if (!visitor) return false;
    
    visitor.isAccountedFor = !visitor.isAccountedFor;
    this.visitors.set(id, visitor);
    return true;
  }

  async toggleContractorAccountedStatus(id: string): Promise<boolean> {
    const worker = this.contractorWorkers.get(id);
    if (!worker) return false;
    
    worker.isAccountedFor = !worker.isAccountedFor;
    this.contractorWorkers.set(id, worker);
    return true;
  }

  // Get muster list for emergency situations
  async getMusterList(): Promise<Array<{
    id: string;
    name: string;
    type: 'staff' | 'visitor' | 'contractor';
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
        accounted: staff.isAccountedFor || false
      })),
      ...allVisitors.map(visitor => ({
        id: visitor.id,
        name: `${visitor.firstName} ${visitor.lastName}`,
        type: 'visitor' as const,
        company: visitor.company || undefined,
        checkedInAt: visitor.checkedInAt.toISOString(),
        location: 'Reception',
        accounted: visitor.isAccountedFor || false
      }))
    ];
    
    return musterList;
  }

  async searchVisitors(searchTerm: string): Promise<Visitor[]> {
    const visitors = Array.from(this.visitors.values());
    const normalizedTerm = searchTerm.toLowerCase();
    
    return visitors.filter(visitor => 
      visitor.firstName.toLowerCase().includes(normalizedTerm) ||
      visitor.lastName.toLowerCase().includes(normalizedTerm) ||
      visitor.company?.toLowerCase().includes(normalizedTerm) ||
      visitor.email?.toLowerCase().includes(normalizedTerm)
    );
  }

  // This method was moved up to avoid duplication
  // async getUniqueCompanies() is now above in the visitor methods section

  async getPeakHoursAnalytics(): Promise<{
    peakHours: string;
    weeklyTrend: string;
    hourlyData: Array<{
      hour: string;
      visitors: number;
      staff: number;
      contractors: number;
      total: number;
    }>;
  }> {
    try {
      const now = new Date();
      const thisWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
      
      // Initialize hourly data structure (0-23 hours)
      const hourlyData = Array.from({ length: 24 }, (_, i) => ({
        hour: `${i.toString().padStart(2, '0')}:00`,
        visitors: 0,
        staff: 0,
        contractors: 0,
        total: 0,
      }));

      // Get all visitors from this week
      const thisWeekVisitors = Array.from(this.visitors.values())
        .filter(visitor => visitor.checkedInAt >= thisWeekStart);

      // Process visitor check-ins
      thisWeekVisitors.forEach(visitor => {
        const hour = new Date(visitor.checkedInAt).getHours();
        hourlyData[hour].visitors++;
        hourlyData[hour].total++;
      });

      // For MemStorage, we simulate staff and contractor activity
      // In a real implementation, these would come from actual data
      thisWeekVisitors.forEach((visitor, index) => {
        const hour = new Date(visitor.checkedInAt).getHours();
        // Simulate some staff activity around visitor check-ins
        if (index % 3 === 0) {
          hourlyData[hour].staff++;
          hourlyData[hour].total++;
        }
        // Simulate some contractor activity
        if (index % 5 === 0) {
          hourlyData[hour].contractors++;
          hourlyData[hour].total++;
        }
      });

      // Find peak hours (highest total activity)
      const peakHourIndex = hourlyData.reduce((maxIndex, current, index) => 
        current.total > hourlyData[maxIndex].total ? index : maxIndex, 0
      );

      // Calculate peak period (usually 2-3 hours around peak)
      let peakStart = Math.max(0, peakHourIndex - 1);
      let peakEnd = Math.min(23, peakHourIndex + 1);
      
      // Extend peak period if adjacent hours have significant activity
      while (peakStart > 0 && hourlyData[peakStart - 1].total > hourlyData[peakHourIndex].total * 0.5) {
        peakStart--;
      }
      while (peakEnd < 23 && hourlyData[peakEnd + 1].total > hourlyData[peakHourIndex].total * 0.5) {
        peakEnd++;
      }

      const peakHours = peakStart === peakEnd 
        ? `${peakStart.toString().padStart(2, '0')}:00`
        : `${peakStart.toString().padStart(2, '0')}:00-${(peakEnd + 1).toString().padStart(2, '0')}:00`;

      // Calculate weekly trend (simplified for MemStorage)
      const thisWeekTotal = hourlyData.reduce((sum, hour) => sum + hour.total, 0);
      const simulatedTrendPercentage = Math.floor(Math.random() * 50) + 10; // Random 10-59%
      const weeklyTrend = `+${simulatedTrendPercentage}% this week`;

      return {
        peakHours,
        weeklyTrend,
        hourlyData,
      };

    } catch (error) {
      console.error('Error calculating peak hours analytics:', error);
      return {
        peakHours: "9AM-11AM",
        weeklyTrend: "+23% this week",
        hourlyData: [],
      };
    }
  }

  // Multi-Tenant methods implementation
  async getAllTenantCompanies(): Promise<TenantCompany[]> {
    return Array.from(this.tenantCompanies.values());
  }

  async getTenantCompanyById(id: string): Promise<TenantCompany | undefined> {
    return this.tenantCompanies.get(id);
  }

  async getTenantCompanyBySlug(slug: string): Promise<TenantCompany | undefined> {
    return Array.from(this.tenantCompanies.values()).find(tenant => tenant.slug === slug);
  }

  async createTenantCompany(insertTenant: InsertTenantCompany): Promise<TenantCompany> {
    const tenant: TenantCompany = {
      id: randomUUID(),
      ...insertTenant,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.tenantCompanies.set(tenant.id, tenant);
    return tenant;
  }

  async updateTenantCompany(id: string, updates: Partial<InsertTenantCompany>): Promise<TenantCompany | undefined> {
    const tenant = this.tenantCompanies.get(id);
    if (!tenant) return undefined;

    const updatedTenant = {
      ...tenant,
      ...updates,
      updatedAt: new Date(),
    };

    this.tenantCompanies.set(id, updatedTenant);
    return updatedTenant;
  }

  async updateTenantStatus(id: string, isActive: boolean): Promise<TenantCompany> {
    const tenant = this.tenantCompanies.get(id);
    if (!tenant) {
      throw new Error(`Tenant with id ${id} not found`);
    }

    const updatedTenant = {
      ...tenant,
      isActive,
      updatedAt: new Date(),
    };

    this.tenantCompanies.set(id, updatedTenant);
    return updatedTenant;
  }

  async deleteTenantCompany(id: string): Promise<boolean> {
    return this.tenantCompanies.delete(id);
  }

  async getBuildingStats(): Promise<{
    totalTenants: number;
    activeTenants: number;
    totalStaff: number;
    totalVisitors: number;
    visitorsToday: number;
    staffOnSite: number;
  }> {
    const allTenants = Array.from(this.tenantCompanies.values());
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayVisitors = Array.from(this.visitors.values()).filter(v => 
      v.checkedInAt >= today
    );

    const staffOnSite = Array.from(this.staffMembers.values()).filter(s => 
      s.isActive && s.isCheckedIn
    ).length;

    return {
      totalTenants: allTenants.length,
      activeTenants: allTenants.filter(t => t.isActive).length,
      totalStaff: this.staffMembers.size,
      totalVisitors: this.visitors.size,
      visitorsToday: todayVisitors.length,
      staffOnSite,
    };
  }

  async getBuildingSettings(): Promise<BuildingSettings | undefined> {
    return this.buildingSettings;
  }

  async updateBuildingSettings(updates: Partial<InsertBuildingSettings>): Promise<BuildingSettings | undefined> {
    if (!this.buildingSettings) {
      this.buildingSettings = {
        id: randomUUID(),
        buildingName: "Default Building",
        address: "",
        contactEmail: "",
        phone: "",
        buildingManagerName: "",
        buildingManagerEmail: "",
        maxTenants: 50,
        operatingHours: "9:00-17:00",
        emergencyContacts: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        ...updates,
      };
    } else {
      this.buildingSettings = {
        ...this.buildingSettings,
        ...updates,
        updatedAt: new Date(),
      };
    }

    return this.buildingSettings;
  }

  // Meeting Room persistence methods
  private loadOrInitializeMeetingRooms(): void {
    try {
      if (fs.existsSync(this.meetingRoomsFilePath)) {
        const meetingRoomsData = fs.readFileSync(this.meetingRoomsFilePath, 'utf8');
        const meetingRoomsArray = JSON.parse(meetingRoomsData);
        meetingRoomsArray.forEach((room: any) => {
          if (room.createdAt) room.createdAt = new Date(room.createdAt);
          if (room.updatedAt) room.updatedAt = new Date(room.updatedAt);
          this.meetingRooms.set(room.id, room);
        });
        console.log(`✅ Meeting rooms data loaded: ${this.meetingRooms.size} rooms`);
      }
    } catch (error) {
      console.error('❌ Error loading meeting rooms data:', error);
    }
  }

  private saveMeetingRoomsToFile(): void {
    try {
      const meetingRoomsArray = Array.from(this.meetingRooms.values());
      fs.writeFileSync(this.meetingRoomsFilePath, JSON.stringify(meetingRoomsArray, null, 2));
    } catch (error) {
      console.error('❌ Error saving meeting rooms data:', error);
    }
  }

  // Meeting Room methods
  async getAllMeetingRooms(): Promise<MeetingRoom[]> {
    return Array.from(this.meetingRooms.values())
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getMeetingRoomById(id: string): Promise<MeetingRoom | undefined> {
    return this.meetingRooms.get(id);
  }

  async createMeetingRoom(insertRoom: InsertMeetingRoom): Promise<MeetingRoom> {
    const id = randomUUID();
    const meetingRoom: MeetingRoom = {
      id,
      ...insertRoom,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.meetingRooms.set(id, meetingRoom);
    this.saveMeetingRoomsToFile(); // 💾 PERSIST IMMEDIATELY
    return meetingRoom;
  }

  async updateMeetingRoom(id: string, updates: Partial<InsertMeetingRoom>): Promise<MeetingRoom | undefined> {
    const meetingRoom = this.meetingRooms.get(id);
    if (!meetingRoom) return undefined;

    const updatedRoom = {
      ...meetingRoom,
      ...updates,
      updatedAt: new Date(),
    };
    
    this.meetingRooms.set(id, updatedRoom);
    this.saveMeetingRoomsToFile(); // 💾 PERSIST IMMEDIATELY
    return updatedRoom;
  }

  async deleteMeetingRoom(id: string): Promise<boolean> {
    const result = this.meetingRooms.delete(id);
    if (result) {
      this.saveMeetingRoomsToFile(); // 💾 PERSIST IMMEDIATELY
    }
    return result;
  }

  // Initialize sample meeting rooms with different configurations
  private initializeSampleMeetingRooms(): void {
    const sampleRooms: InsertMeetingRoom[] = [
      {
        name: "Executive Boardroom",
        description: "Premium boardroom with panoramic city views, perfect for high-level meetings and presentations.",
        location: "Floor 25, North Wing",
        capacity: 14,
        isSharedRoom: false,
        tenantCompanyId: null,
        hasProjector: true,
        hasVideoConference: true,
        hasWhiteboard: true,
        hasTV: true,
        hasAirCon: true,
        hasCatering: true,
        isActive: true,
      },
      {
        name: "Innovation Hub",
        description: "Modern collaborative space with interactive whiteboards and flexible seating arrangements.",
        location: "Floor 12, Creative Zone",
        capacity: 8,
        isSharedRoom: true,
        tenantCompanyId: null,
        hasProjector: false,
        hasVideoConference: true,
        hasWhiteboard: true,
        hasTV: true,
        hasAirCon: true,
        hasCatering: false,
        isActive: true,
      },
      {
        name: "Tech Conference Room",
        description: "Fully equipped technology center with dual screens and advanced video conferencing setup.",
        location: "Floor 8, Tech Hub",
        capacity: 12,
        isSharedRoom: true,
        tenantCompanyId: null,
        hasProjector: true,
        hasVideoConference: true,
        hasWhiteboard: false,
        hasTV: true,
        hasAirCon: true,
        hasCatering: true,
        isActive: true,
      },
      {
        name: "Quiet Study Room",
        description: "Intimate meeting space ideal for small team discussions and private consultations.",
        location: "Floor 5, East Wing",
        capacity: 4,
        isSharedRoom: true,
        tenantCompanyId: null,
        hasProjector: false,
        hasVideoConference: false,
        hasWhiteboard: true,
        hasTV: false,
        hasAirCon: true,
        hasCatering: false,
        isActive: true,
      },
      {
        name: "Training Center Alpha",
        description: "Large training facility with tiered seating and multiple presentation screens.",
        location: "Floor 3, Training Wing",
        capacity: 24,
        isSharedRoom: true,
        tenantCompanyId: null,
        hasProjector: true,
        hasVideoConference: true,
        hasWhiteboard: true,
        hasTV: true,
        hasAirCon: true,
        hasCatering: true,
        isActive: true,
      },
      {
        name: "Quick Meet Pod",
        description: "Compact meeting pod for quick discussions and phone calls with soundproofing.",
        location: "Floor 7, Open Office Area",
        capacity: 3,
        isSharedRoom: true,
        tenantCompanyId: null,
        hasProjector: false,
        hasVideoConference: true,
        hasWhiteboard: false,
        hasTV: false,
        hasAirCon: false,
        hasCatering: false,
        isActive: true,
      }
    ];

    sampleRooms.forEach(async (roomData) => {
      await this.createMeetingRoom(roomData);
    });

    console.log(`🏢 Initialized ${sampleRooms.length} sample meeting rooms`);
  }
}

// Create and export a default storage instance
export const storage = createStorage();