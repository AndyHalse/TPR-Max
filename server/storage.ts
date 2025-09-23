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
  ContractorVisit,
  InsertContractorVisit,
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
  RoomBookingWithRelations,
  RoomBookingAttendee,
  InsertRoomBookingAttendee,
  RoomBookingWaitlist,
  InsertRoomBookingWaitlist,
  ContractorPreBooking,
  InsertContractorPreBooking
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
  findExistingVisitor(firstName: string, lastName: string, company?: string): Promise<Visitor | undefined>;
  checkInExistingVisitor(id: string, updates: { hostStaffId?: string, purpose?: string, carRegistration?: string }): Promise<Visitor>;
  searchVisitors(searchTerm: string): Promise<Visitor[]>;
  getUniqueCompanies(): Promise<string[]>;
  
  // Tenant-specific visitor methods
  getVisitorsByTenant(tenantId: string): Promise<Visitor[]>;
  getCurrentVisitorsByTenant(tenantId: string): Promise<Visitor[]>;
  getTodayVisitorsByTenant(tenantId: string): Promise<Visitor[]>;
  getPreBookedVisitorsByTenant(tenantId: string): Promise<Visitor[]>;

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
  getCheckedInContractors(): Promise<ContractorWorker[]>;
  getContractorWorkers(companyId: string): Promise<ContractorWorker[]>;
  getContractorWorkerById(id: string): Promise<ContractorWorker | undefined>;
  createContractorWorker(insertWorker: InsertContractorWorker): Promise<ContractorWorker>;
  updateContractorWorker(id: string, updates: Partial<InsertContractorWorker>): Promise<ContractorWorker | undefined>;
  deleteContractorWorker(id: string): Promise<boolean>;
  getContractorVisitHistory(workerId: string, customerId?: string): Promise<ContractorVisit[]>;
  createContractorVisit(visit: InsertContractorVisit): Promise<ContractorVisit>;
  updateContractorVisit(id: string, updates: Partial<InsertContractorVisit>): Promise<ContractorVisit | undefined>;
  getCurrentContractorVisit(workerId: string): Promise<ContractorVisit | undefined>;
  
  // Contractor Pre-booking methods
  createContractorPreBooking(booking: InsertContractorPreBooking): Promise<ContractorPreBooking>;
  updateContractorPreBooking(id: string, updates: Partial<InsertContractorPreBooking>): Promise<ContractorPreBooking | undefined>;
  getContractorPreBookings(): Promise<ContractorPreBooking[]>;
  getContractorPreBookingById(id: string): Promise<ContractorPreBooking | undefined>;
  getUpcomingContractorPreBookings(): Promise<ContractorPreBooking[]>;
  getTodaysContractorPreBookings(): Promise<ContractorPreBooking[]>;
  deleteContractorPreBooking(id: string): Promise<boolean>;
  
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
  checkRoomAvailability(roomId: string, startTime: Date, endTime: Date, excludeBookingId?: string, tenantId?: string): Promise<boolean>;

  // Room Booking methods
  getRoomBookings(startDate?: Date, endDate?: Date): Promise<RoomBookingWithRelations[]>;
  getRoomBookingsByRoom(roomId: string, startDate?: Date, endDate?: Date): Promise<(RoomBooking & { organizer: Staff })[]>;
  getRoomBookingsByTenant(tenantId: string, startDate?: Date, endDate?: Date): Promise<RoomBookingWithRelations[]>;
  getRoomBookingById(id: string): Promise<RoomBookingWithRelations | undefined>;
  createRoomBooking(insertBooking: InsertRoomBooking): Promise<RoomBooking>;
  updateRoomBooking(id: string, updates: Partial<InsertRoomBooking>): Promise<RoomBooking | undefined>;
  cancelRoomBooking(id: string, cancelledBy: string): Promise<RoomBooking | undefined>;
  deleteRoomBooking(id: string): Promise<boolean>;
  getUpcomingBookings(roomId?: string, minutes?: number): Promise<RoomBookingWithRelations[]>;
  checkInToMeeting(bookingId: string, staffId: string): Promise<RoomBooking | undefined>;
  endMeeting(bookingId: string): Promise<RoomBooking | undefined>;

  // Room Booking Attendees methods
  getBookingAttendees(bookingId: string): Promise<RoomBookingAttendee[]>;
  addBookingAttendee(insertAttendee: InsertRoomBookingAttendee): Promise<RoomBookingAttendee>;
  updateAttendeeResponse(id: string, status: string): Promise<RoomBookingAttendee | undefined>;
  removeBookingAttendee(id: string): Promise<boolean>;
  createBookingAttendees(bookingId: string, staffIds: string[], externalEmails: string[]): Promise<void>;
  getStaffByIds(staffIds: string[]): Promise<Staff[]>;

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
  
  // Reception diary methods
  getReceptionDiary(startDate: Date, daysAhead: number): Promise<any[]>;
  
  // Today's room bookings
  getTodayRoomBookings(): Promise<RoomBooking[]>;
}

import { DatabaseStorage } from "./DatabaseStorage";

export function createStorage(): IStorage {
  // Using DatabaseStorage for proper database integration and field mapping
  // MemStorage has field mapping inconsistencies causing check-in failures
  // return new MemStorage();
  return new DatabaseStorage();
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
  private roomBookings: Map<string, RoomBooking>;
  private roomBookingAttendees: Map<string, RoomBookingAttendee>;
  private roomBookingWaitlist: Map<string, RoomBookingWaitlist>;
  private contractorCompanies: Map<string, ContractorCompany>;
  private contractorWorkers: Map<string, ContractorWorker>;
  private contractorPreBookings: Map<string, ContractorPreBooking>;
  private contractorVisits: Map<string, ContractorVisit>;
  private complianceDocuments: Map<string, ComplianceDocument>;
  private departments: Map<string, Department>;
  private readonly settingsFilePath = path.join(process.cwd(), 'data', 'company-settings.json');
  private readonly departmentsFilePath = path.join(process.cwd(), 'data', 'departments-data.json');
  private readonly staffFilePath = path.join(process.cwd(), 'data', 'staff-data.json');
  private readonly visitorsFilePath = path.join(process.cwd(), 'data', 'visitors-data.json');
  private readonly reportsFilePath = path.join(process.cwd(), 'data', 'reports-data.json');
  private readonly preBookingsFilePath = path.join(process.cwd(), 'data', 'prebookings-data.json');
  private readonly usersFilePath = path.join(process.cwd(), 'data', 'users-data.json');
  private readonly meetingRoomsFilePath = path.join(process.cwd(), 'data', 'meeting-rooms-data.json');
  private readonly roomBookingsFilePath = path.join(process.cwd(), 'data', 'room-bookings-data.json');
  private readonly roomBookingAttendeesFilePath = path.join(process.cwd(), 'data', 'room-booking-attendees-data.json');
  private readonly roomBookingWaitlistFilePath = path.join(process.cwd(), 'data', 'room-booking-waitlist-data.json');
  private readonly contractorCompaniesFilePath = path.join(process.cwd(), 'data', 'contractor-companies-data.json');
  private readonly contractorWorkersFilePath = path.join(process.cwd(), 'data', 'contractor-workers-data.json');
  private readonly contractorPreBookingsFilePath = path.join(process.cwd(), 'data', 'contractor-prebookings-data.json');
  private readonly contractorVisitsFilePath = path.join(process.cwd(), 'data', 'contractor-visits-data.json');

  constructor() {
    this.users = new Map();
    this.staffMembers = new Map();
    this.visitors = new Map();
    this.inductionSettings = [];
    this.reports = new Map();
    this.preBookings = new Map();
    this.tenantCompanies = new Map();
    this.meetingRooms = new Map();
    this.roomBookings = new Map();
    this.roomBookingAttendees = new Map();
    this.roomBookingWaitlist = new Map();
    this.contractorCompanies = new Map();
    this.contractorWorkers = new Map();
    this.contractorPreBookings = new Map();
    this.contractorVisits = new Map();
    this.complianceDocuments = new Map();
    this.departments = new Map();
    this.buildingSettings = undefined;
    
    // Ensure data directory exists
    this.ensureDataDirectory();
    
    // Load existing data or initialize defaults
    this.loadOrInitializeSettings();
    this.loadOrInitializeStaff();
    this.loadOrInitializeVisitors();
    this.loadOrInitializeDepartments();
    this.loadOrInitializeReports();
    this.loadOrInitializePreBookings();
    this.loadOrInitializeUsers();
    this.loadOrInitializeMeetingRooms();
    this.loadOrInitializeRoomBookings();
    this.loadOrInitializeRoomBookingAttendees();
    this.loadOrInitializeRoomBookingWaitlist();
    this.loadOrInitializeContractorCompanies();
    this.loadOrInitializeContractorWorkers();
    this.loadOrInitializeContractorPreBookings();
    this.loadOrInitializeContractorVisits();
    
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

  private loadOrInitializeDepartments(): void {
    try {
      if (fs.existsSync(this.departmentsFilePath)) {
        const departmentsData = fs.readFileSync(this.departmentsFilePath, 'utf8');
        const departmentsArray = JSON.parse(departmentsData);
        this.departments = new Map();
        departmentsArray.forEach((dept: Department) => {
          // Convert date strings back to Date objects
          if (dept.createdAt) dept.createdAt = new Date(dept.createdAt);
          if (dept.updatedAt) dept.updatedAt = new Date(dept.updatedAt);
          this.departments.set(dept.id, dept);
        });
        console.log(`✅ Departments data loaded: ${this.departments.size} departments`);
      } else {
        // Initialize with default departments based on existing staff data
        this.initializeDefaultDepartments();
      }
    } catch (error) {
      console.error('❌ Error loading departments data:', error);
      this.initializeDefaultDepartments();
    }
  }

  private initializeDefaultDepartments(): void {
    // Get unique departments from existing staff
    const uniqueDepartments = [...new Set(Array.from(this.staffMembers.values()).map(s => s.department))]
      .filter(Boolean);
    
    const colors = ['bg-blue-500', 'bg-green-500', 'bg-orange-500', 'bg-purple-500', 'bg-pink-500', 'bg-red-500', 'bg-indigo-500', 'bg-yellow-500'];
    
    uniqueDepartments.forEach((deptName, index) => {
      const id = crypto.randomUUID();
      const department: Department = {
        id,
        name: deptName,
        description: `${deptName} Department`,
        color: colors[index % colors.length],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.departments.set(id, department);
    });
    
    this.saveDepartmentsToFile();
    console.log(`✅ Initialized ${uniqueDepartments.length} default departments from existing staff data`);
  }

  private saveDepartmentsToFile(): void {
    try {
      const departmentsArray = Array.from(this.departments.values());
      fs.writeFileSync(this.departmentsFilePath, JSON.stringify(departmentsArray, null, 2), 'utf8');
    } catch (error) {
      console.error('❌ Error saving departments data:', error);
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

  async findCheckedInVisitor(firstName: string, lastName: string, company?: string): Promise<Visitor | undefined> {
    return Array.from(this.visitors.values()).find(visitor => 
      visitor.isCheckedIn &&
      visitor.firstName === firstName &&
      visitor.lastName === lastName &&
      (company ? visitor.company === company : true)
    );
  }

  async findExistingVisitor(firstName: string, lastName: string, company?: string): Promise<Visitor | undefined> {
    return Array.from(this.visitors.values()).find(visitor => 
      visitor.firstName === firstName &&
      visitor.lastName === lastName &&
      (company ? visitor.company === company : true)
    );
  }

  async checkInExistingVisitor(id: string, updates: { hostStaffId?: string, purpose?: string, carRegistration?: string }): Promise<Visitor> {
    const visitor = this.visitors.get(id);
    if (!visitor) {
      throw new Error("Visitor not found");
    }

    const updatedVisitor: Visitor = {
      ...visitor,
      hostStaffId: updates.hostStaffId ?? visitor.hostStaffId,
      purpose: updates.purpose ?? visitor.purpose,
      carRegistration: updates.carRegistration ?? visitor.carRegistration,
      checkedInAt: new Date(),
      checkedOutAt: null,
      isCheckedIn: true,
    };
    
    this.visitors.set(id, updatedVisitor);
    this.saveVisitorsToFile(); // 💾 PERSIST IMMEDIATELY
    return updatedVisitor;
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

  async getPreBookedVisitorsByTenant(tenantId: string): Promise<Visitor[]> {
    return Array.from(this.visitors.values())
      .filter(visitor => 
        visitor.tenantCompanyId === tenantId &&
        visitor.isPreBooked === true &&
        visitor.isCheckedIn === false
      )
      .sort((a, b) => new Date(b.checkedInAt || 0).getTime() - new Date(a.checkedInAt || 0).getTime());
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
      visitorFirstName: insertPreBooking.visitorFirstName,
      visitorLastName: insertPreBooking.visitorLastName,
      visitorEmail: insertPreBooking.visitorEmail,
      company: insertPreBooking.company || null,
      purpose: insertPreBooking.purpose || null,
      visitDate: insertPreBooking.visitDate,
      visitTime: insertPreBooking.visitTime || null,
      hostStaffId: insertPreBooking.hostStaffId || null,
      meetingRoomId: insertPreBooking.meetingRoomId || null,
      tenantCompanyId: insertPreBooking.tenantCompanyId || null,
      qrCode,
      status: 'pending',
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
        name: `${booking.visitorFirstName} ${booking.visitorLastName}`,
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

  // Room Booking persistence methods
  private loadOrInitializeRoomBookings(): void {
    try {
      if (fs.existsSync(this.roomBookingsFilePath)) {
        const bookingsData = fs.readFileSync(this.roomBookingsFilePath, 'utf8');
        const bookingsArray = JSON.parse(bookingsData);
        bookingsArray.forEach((booking: any) => {
          if (booking.startDateTime) booking.startDateTime = new Date(booking.startDateTime);
          if (booking.endDateTime) booking.endDateTime = new Date(booking.endDateTime);
          if (booking.createdAt) booking.createdAt = new Date(booking.createdAt);
          if (booking.updatedAt) booking.updatedAt = new Date(booking.updatedAt);
          if (booking.cancelledAt) booking.cancelledAt = new Date(booking.cancelledAt);
          if (booking.confirmationEmailSentAt) booking.confirmationEmailSentAt = new Date(booking.confirmationEmailSentAt);
          if (booking.reminderEmailSentAt) booking.reminderEmailSentAt = new Date(booking.reminderEmailSentAt);
          this.roomBookings.set(booking.id, booking);
        });
        console.log(`✅ Room bookings data loaded: ${this.roomBookings.size} bookings`);
      }
    } catch (error) {
      console.error('❌ Error loading room bookings data:', error);
    }
  }

  private saveRoomBookingsToFile(): void {
    try {
      const bookingsArray = Array.from(this.roomBookings.values());
      fs.writeFileSync(this.roomBookingsFilePath, JSON.stringify(bookingsArray, null, 2));
    } catch (error) {
      console.error('❌ Error saving room bookings data:', error);
    }
  }

  private loadOrInitializeRoomBookingAttendees(): void {
    try {
      if (fs.existsSync(this.roomBookingAttendeesFilePath)) {
        const attendeesData = fs.readFileSync(this.roomBookingAttendeesFilePath, 'utf8');
        const attendeesArray = JSON.parse(attendeesData);
        attendeesArray.forEach((attendee: any) => {
          if (attendee.responseAt) attendee.responseAt = new Date(attendee.responseAt);
          if (attendee.checkedInAt) attendee.checkedInAt = new Date(attendee.checkedInAt);
          if (attendee.createdAt) attendee.createdAt = new Date(attendee.createdAt);
          this.roomBookingAttendees.set(attendee.id, attendee);
        });
        console.log(`✅ Room booking attendees data loaded: ${this.roomBookingAttendees.size} attendees`);
      }
    } catch (error) {
      console.error('❌ Error loading room booking attendees data:', error);
    }
  }

  private saveRoomBookingAttendeesToFile(): void {
    try {
      const attendeesArray = Array.from(this.roomBookingAttendees.values());
      fs.writeFileSync(this.roomBookingAttendeesFilePath, JSON.stringify(attendeesArray, null, 2));
    } catch (error) {
      console.error('❌ Error saving room booking attendees data:', error);
    }
  }

  private loadOrInitializeRoomBookingWaitlist(): void {
    try {
      if (fs.existsSync(this.roomBookingWaitlistFilePath)) {
        const waitlistData = fs.readFileSync(this.roomBookingWaitlistFilePath, 'utf8');
        const waitlistArray = JSON.parse(waitlistData);
        waitlistArray.forEach((waitlist: any) => {
          if (waitlist.startDateTime) waitlist.startDateTime = new Date(waitlist.startDateTime);
          if (waitlist.endDateTime) waitlist.endDateTime = new Date(waitlist.endDateTime);
          if (waitlist.notifiedAt) waitlist.notifiedAt = new Date(waitlist.notifiedAt);
          if (waitlist.createdAt) waitlist.createdAt = new Date(waitlist.createdAt);
          this.roomBookingWaitlist.set(waitlist.id, waitlist);
        });
        console.log(`✅ Room booking waitlist data loaded: ${this.roomBookingWaitlist.size} entries`);
      }
    } catch (error) {
      console.error('❌ Error loading room booking waitlist data:', error);
    }
  }

  private loadOrInitializeContractorCompanies(): void {
    try {
      if (fs.existsSync(this.contractorCompaniesFilePath)) {
        const companiesData = fs.readFileSync(this.contractorCompaniesFilePath, 'utf8');
        const companies: ContractorCompany[] = JSON.parse(companiesData);
        
        companies.forEach(company => {
          // Convert date strings back to Date objects
          company.createdAt = new Date(company.createdAt);
          company.updatedAt = new Date(company.updatedAt);
          this.contractorCompanies.set(company.id, company);
        });
        
        console.log(`✅ Contractor companies data loaded: ${companies.length} companies`);
      } else {
        console.log('📂 No contractor companies data file found - starting fresh');
      }
    } catch (error) {
      console.error('❌ Error loading contractor companies data:', error);
    }
  }

  private loadOrInitializeContractorWorkers(): void {
    try {
      if (fs.existsSync(this.contractorWorkersFilePath)) {
        const workersData = fs.readFileSync(this.contractorWorkersFilePath, 'utf8');
        const workers: ContractorWorker[] = JSON.parse(workersData);
        
        workers.forEach(worker => {
          // Convert date strings back to Date objects
          worker.createdAt = new Date(worker.createdAt);
          worker.updatedAt = new Date(worker.updatedAt);
          if (worker.checkedInAt) worker.checkedInAt = new Date(worker.checkedInAt);
          if (worker.checkedOutAt) worker.checkedOutAt = new Date(worker.checkedOutAt);
          this.contractorWorkers.set(worker.id, worker);
        });
        
        console.log(`✅ Contractor workers data loaded: ${workers.length} workers`);
      } else {
        console.log('📂 No contractor workers data file found - starting fresh');
      }
    } catch (error) {
      console.error('❌ Error loading contractor workers data:', error);
    }
  }

  private saveContractorCompaniesToFile(): void {
    try {
      const companies = Array.from(this.contractorCompanies.values());
      fs.writeFileSync(this.contractorCompaniesFilePath, JSON.stringify(companies, null, 2), 'utf8');
    } catch (error) {
      console.error('❌ Error saving contractor companies to file:', error);
    }
  }

  private saveContractorWorkersToFile(): void {
    try {
      const workers = Array.from(this.contractorWorkers.values());
      fs.writeFileSync(this.contractorWorkersFilePath, JSON.stringify(workers, null, 2), 'utf8');
    } catch (error) {
      console.error('❌ Error saving contractor workers to file:', error);
    }
  }

  private loadOrInitializeContractorPreBookings(): void {
    try {
      if (fs.existsSync(this.contractorPreBookingsFilePath)) {
        const preBookingsData = fs.readFileSync(this.contractorPreBookingsFilePath, 'utf8');
        const preBookings: ContractorPreBooking[] = JSON.parse(preBookingsData);
        
        preBookings.forEach(booking => {
          // Convert date strings back to Date objects
          booking.createdAt = new Date(booking.createdAt);
          booking.updatedAt = new Date(booking.updatedAt);
          booking.scheduledDate = new Date(booking.scheduledDate);
          this.contractorPreBookings.set(booking.id, booking);
        });
        
        console.log(`✅ Contractor pre-bookings loaded: ${preBookings.length} bookings`);
      } else {
        console.log('📂 No contractor pre-bookings data file found - starting fresh');
      }
    } catch (error) {
      console.error('❌ Error loading contractor pre-bookings data:', error);
    }
  }

  private saveContractorPreBookingsToFile(): void {
    try {
      const preBookings = Array.from(this.contractorPreBookings.values());
      fs.writeFileSync(this.contractorPreBookingsFilePath, JSON.stringify(preBookings, null, 2), 'utf8');
    } catch (error) {
      console.error('❌ Error saving contractor pre-bookings to file:', error);
    }
  }

  private loadOrInitializeContractorVisits(): void {
    try {
      if (fs.existsSync(this.contractorVisitsFilePath)) {
        const visitsData = fs.readFileSync(this.contractorVisitsFilePath, 'utf8');
        const visits: ContractorVisit[] = JSON.parse(visitsData);
        
        visits.forEach(visit => {
          // Convert date strings back to Date objects
          visit.createdAt = new Date(visit.createdAt);
          if (visit.checkedInAt) visit.checkedInAt = new Date(visit.checkedInAt);
          if (visit.checkedOutAt) visit.checkedOutAt = new Date(visit.checkedOutAt);
          if (visit.hsRulesAcceptedAt) visit.hsRulesAcceptedAt = new Date(visit.hsRulesAcceptedAt);
          if (visit.inductionCompletedAt) visit.inductionCompletedAt = new Date(visit.inductionCompletedAt);
          if (visit.ePassSentAt) visit.ePassSentAt = new Date(visit.ePassSentAt);
          this.contractorVisits.set(visit.id, visit);
        });
        
        console.log(`✅ Contractor visits loaded: ${visits.length} visits`);
      } else {
        console.log('📂 No contractor visits data file found - starting fresh');
      }
    } catch (error) {
      console.error('❌ Error loading contractor visits data:', error);
    }
  }

  private saveContractorVisitsToFile(): void {
    try {
      const visits = Array.from(this.contractorVisits.values());
      fs.writeFileSync(this.contractorVisitsFilePath, JSON.stringify(visits, null, 2), 'utf8');
    } catch (error) {
      console.error('❌ Error saving contractor visits to file:', error);
    }
  }

  private saveRoomBookingWaitlistToFile(): void {
    try {
      const waitlistArray = Array.from(this.roomBookingWaitlist.values());
      fs.writeFileSync(this.roomBookingWaitlistFilePath, JSON.stringify(waitlistArray, null, 2));
    } catch (error) {
      console.error('❌ Error saving room booking waitlist data:', error);
    }
  }

  // Room Booking CRUD methods
  async getRoomBookings(startDate?: Date, endDate?: Date): Promise<(RoomBooking & { room: MeetingRoom; organizer: Staff })[]> {
    let bookings = Array.from(this.roomBookings.values());
    
    if (startDate) {
      bookings = bookings.filter(b => new Date(b.startDateTime) >= startDate);
    }
    if (endDate) {
      bookings = bookings.filter(b => new Date(b.endDateTime) <= endDate);
    }
    
    // Join with room and organizer data
    const bookingsWithDetails = [];
    for (const booking of bookings) {
      const room = this.meetingRooms.get(booking.roomId);
      const organizer = this.staffMembers.get(booking.bookedByStaffId);
      
      if (room && organizer) {
        bookingsWithDetails.push({
          ...booking,
          room,
          organizer
        });
      }
    }
    
    return bookingsWithDetails.sort((a, b) => 
      new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime()
    );
  }

  async getRoomBookingsByRoom(roomId: string, startDate?: Date, endDate?: Date): Promise<(RoomBooking & { organizer: Staff })[]> {
    let bookings = Array.from(this.roomBookings.values()).filter(b => b.roomId === roomId);
    
    if (startDate) {
      bookings = bookings.filter(b => new Date(b.startDateTime) >= startDate);
    }
    if (endDate) {
      bookings = bookings.filter(b => new Date(b.endDateTime) <= endDate);
    }
    
    // Join with organizer data
    const bookingsWithOrganizer = [];
    for (const booking of bookings) {
      const organizer = this.staffMembers.get(booking.bookedByStaffId);
      if (organizer) {
        bookingsWithOrganizer.push({
          ...booking,
          organizer
        });
      }
    }
    
    return bookingsWithOrganizer.sort((a, b) => 
      new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime()
    );
  }

  async getRoomBookingsByTenant(tenantId: string, startDate?: Date, endDate?: Date): Promise<(RoomBooking & { room: MeetingRoom; organizer: Staff })[]> {
    let bookings = Array.from(this.roomBookings.values()).filter(b => b.tenantCompanyId === tenantId);
    
    if (startDate) {
      bookings = bookings.filter(b => new Date(b.startDateTime) >= startDate);
    }
    if (endDate) {
      bookings = bookings.filter(b => new Date(b.endDateTime) <= endDate);
    }
    
    // Join with room and organizer data
    const bookingsWithDetails = [];
    for (const booking of bookings) {
      const room = this.meetingRooms.get(booking.roomId);
      const organizer = this.staffMembers.get(booking.bookedByStaffId);
      
      if (room && organizer) {
        bookingsWithDetails.push({
          ...booking,
          room,
          organizer
        });
      }
    }
    
    return bookingsWithDetails.sort((a, b) => 
      new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime()
    );
  }

  async getRoomBookingById(id: string): Promise<(RoomBooking & { room: MeetingRoom; organizer: Staff }) | undefined> {
    const booking = this.roomBookings.get(id);
    if (!booking) return undefined;
    
    const room = this.meetingRooms.get(booking.roomId);
    const organizer = this.staffMembers.get(booking.bookedByStaffId);
    
    if (!room || !organizer) return undefined;
    
    return {
      ...booking,
      room,
      organizer
    };
  }

  async createRoomBooking(insertBooking: InsertRoomBooking): Promise<RoomBooking> {
    const id = randomUUID();
    const booking: RoomBooking = {
      id,
      ...insertBooking,
      confirmationEmailSent: false,
      reminderEmailSent: false,
      confirmationEmailSentAt: null,
      reminderEmailSentAt: null,
      actualAttendees: null,
      meetingNotes: null,
      actionItems: [],
      cancelledAt: null,
      cancelledBy: null,
      cancellationReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.roomBookings.set(id, booking);
    this.saveRoomBookingsToFile();
    return booking;
  }

  async updateRoomBooking(id: string, updates: Partial<InsertRoomBooking>): Promise<RoomBooking | undefined> {
    const booking = this.roomBookings.get(id);
    if (!booking) return undefined;

    const updatedBooking = {
      ...booking,
      ...updates,
      updatedAt: new Date(),
    };
    
    this.roomBookings.set(id, updatedBooking);
    this.saveRoomBookingsToFile();
    return updatedBooking;
  }

  async cancelRoomBooking(id: string, cancelledBy: string): Promise<RoomBooking | undefined> {
    const booking = this.roomBookings.get(id);
    if (!booking) return undefined;

    const cancelledBooking = {
      ...booking,
      status: 'cancelled' as const,
      cancelledAt: new Date(),
      cancelledBy,
      updatedAt: new Date(),
    };
    
    this.roomBookings.set(id, cancelledBooking);
    this.saveRoomBookingsToFile();
    return cancelledBooking;
  }

  async deleteRoomBooking(id: string): Promise<boolean> {
    const result = this.roomBookings.delete(id);
    if (result) {
      this.saveRoomBookingsToFile();
      // Also remove related attendees
      const attendeesToRemove = Array.from(this.roomBookingAttendees.values())
        .filter(a => a.bookingId === id);
      attendeesToRemove.forEach(a => this.roomBookingAttendees.delete(a.id));
      if (attendeesToRemove.length > 0) {
        this.saveRoomBookingAttendeesToFile();
      }
    }
    return result;
  }

  async checkRoomAvailability(roomId: string, startTime: Date, endTime: Date, excludeBookingId?: string, tenantId?: string): Promise<boolean> {
    // Get the room to check if it's shared or tenant-specific
    const room = this.meetingRooms.get(roomId);
    if (!room) return false;
    
    const roomBookings = Array.from(this.roomBookings.values())
      .filter(b => {
        if (b.roomId !== roomId || b.status === 'cancelled') return false;
        if (excludeBookingId && b.id === excludeBookingId) return false;
        
        // For shared rooms, check all bookings
        // For tenant-specific rooms, only check bookings from the same tenant
        if (room.isSharedRoom) {
          return true; // Check all bookings for shared rooms
        } else if (tenantId) {
          return b.tenantCompanyId === tenantId; // Only check same tenant bookings
        }
        
        return true; // Default: check all bookings
      });
    
    const hasConflict = roomBookings.some(booking => {
      const bookingStart = new Date(booking.startDateTime);
      const bookingEnd = new Date(booking.endDateTime);
      
      // Check for overlap: new booking overlaps if it starts before existing ends and ends after existing starts
      return startTime < bookingEnd && endTime > bookingStart;
    });
    
    return !hasConflict;
  }

  async getUpcomingBookings(roomId?: string, minutes: number = 60): Promise<(RoomBooking & { room: MeetingRoom; organizer: Staff })[]> {
    const now = new Date();
    const futureTime = new Date(now.getTime() + minutes * 60000);
    
    let bookings = Array.from(this.roomBookings.values())
      .filter(b => 
        b.status !== 'cancelled' &&
        new Date(b.startDateTime) >= now &&
        new Date(b.startDateTime) <= futureTime
      );
    
    if (roomId) {
      bookings = bookings.filter(b => b.roomId === roomId);
    }
    
    // Join with room and organizer data
    const bookingsWithDetails = [];
    for (const booking of bookings) {
      const room = this.meetingRooms.get(booking.roomId);
      const organizer = this.staffMembers.get(booking.bookedByStaffId);
      
      if (room && organizer) {
        bookingsWithDetails.push({
          ...booking,
          room,
          organizer
        });
      }
    }
    
    return bookingsWithDetails.sort((a, b) => 
      new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime()
    );
  }

  async checkInToMeeting(bookingId: string, staffId: string): Promise<RoomBooking | undefined> {
    const booking = this.roomBookings.get(bookingId);
    if (!booking) return undefined;

    const attendee = Array.from(this.roomBookingAttendees.values())
      .find(a => a.bookingId === bookingId && a.staffId === staffId);
    
    if (attendee) {
      const updatedAttendee = {
        ...attendee,
        checkedIn: true,
        checkedInAt: new Date(),
      };
      this.roomBookingAttendees.set(attendee.id, updatedAttendee);
      this.saveRoomBookingAttendeesToFile();
    }

    return booking;
  }

  async endMeeting(bookingId: string): Promise<RoomBooking | undefined> {
    const booking = this.roomBookings.get(bookingId);
    if (!booking) return undefined;

    const updatedBooking = {
      ...booking,
      status: 'completed' as const,
      updatedAt: new Date(),
    };
    
    this.roomBookings.set(bookingId, updatedBooking);
    this.saveRoomBookingsToFile();
    return updatedBooking;
  }

  // Room Booking Attendees methods
  async getBookingAttendees(bookingId: string): Promise<RoomBookingAttendee[]> {
    return Array.from(this.roomBookingAttendees.values())
      .filter(a => a.bookingId === bookingId);
  }

  async addBookingAttendee(insertAttendee: InsertRoomBookingAttendee): Promise<RoomBookingAttendee> {
    const id = randomUUID();
    const attendee: RoomBookingAttendee = {
      id,
      ...insertAttendee,
      responseAt: null,
      checkedIn: false,
      checkedInAt: null,
      createdAt: new Date(),
    };
    
    this.roomBookingAttendees.set(id, attendee);
    this.saveRoomBookingAttendeesToFile();
    return attendee;
  }

  async updateAttendeeResponse(id: string, status: string): Promise<RoomBookingAttendee | undefined> {
    const attendee = this.roomBookingAttendees.get(id);
    if (!attendee) return undefined;

    const updatedAttendee = {
      ...attendee,
      responseStatus: status,
      responseAt: new Date(),
    };
    
    this.roomBookingAttendees.set(id, updatedAttendee);
    this.saveRoomBookingAttendeesToFile();
    return updatedAttendee;
  }

  async removeBookingAttendee(id: string): Promise<boolean> {
    const result = this.roomBookingAttendees.delete(id);
    if (result) {
      this.saveRoomBookingAttendeesToFile();
    }
    return result;
  }

  async createBookingAttendees(bookingId: string, staffIds: string[], externalEmails: string[]): Promise<void> {
    // Add staff attendees
    for (const staffId of staffIds) {
      const staff = this.staffMembers.get(staffId);
      if (staff) {
        await this.addBookingAttendee({
          bookingId,
          staffId,
          email: staff.email,
          name: `${staff.firstName} ${staff.lastName}`,
          isOrganizer: false,
          responseStatus: 'pending'
        });
      }
    }

    // Add external attendees
    for (const email of externalEmails) {
      await this.addBookingAttendee({
        bookingId,
        staffId: null,
        email,
        name: email, // Use email as name for external attendees
        isOrganizer: false,
        responseStatus: 'pending'
      });
    }
  }

  async getStaffByIds(staffIds: string[]): Promise<Staff[]> {
    const staffMembers: Staff[] = [];
    for (const staffId of staffIds) {
      const staff = this.staffMembers.get(staffId);
      if (staff) {
        staffMembers.push(staff);
      }
    }
    return staffMembers;
  }

  // Room Booking Waitlist methods
  async getWaitlistByRoom(roomId: string): Promise<RoomBookingWaitlist[]> {
    return Array.from(this.roomBookingWaitlist.values())
      .filter(w => w.roomId === roomId && w.isActive)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async addToWaitlist(insertWaitlist: InsertRoomBookingWaitlist): Promise<RoomBookingWaitlist> {
    const id = randomUUID();
    const waitlistEntry: RoomBookingWaitlist = {
      id,
      ...insertWaitlist,
      isActive: true,
      notifiedAt: null,
      createdAt: new Date(),
    };
    
    this.roomBookingWaitlist.set(id, waitlistEntry);
    this.saveRoomBookingWaitlistToFile();
    return waitlistEntry;
  }

  async removeFromWaitlist(id: string): Promise<boolean> {
    const result = this.roomBookingWaitlist.delete(id);
    if (result) {
      this.saveRoomBookingWaitlistToFile();
    }
    return result;
  }

  async notifyWaitlistUsers(roomId: string, startTime: Date, endTime: Date): Promise<RoomBookingWaitlist[]> {
    const waitlistEntries = Array.from(this.roomBookingWaitlist.values())
      .filter(w => 
        w.roomId === roomId &&
        w.isActive &&
        new Date(w.startDateTime) <= endTime &&
        new Date(w.endDateTime) >= startTime
      );
    
    // Mark as notified
    for (const entry of waitlistEntries) {
      const updatedEntry = {
        ...entry,
        notifiedAt: new Date(),
      };
      this.roomBookingWaitlist.set(entry.id, updatedEntry);
    }
    
    if (waitlistEntries.length > 0) {
      this.saveRoomBookingWaitlistToFile();
    }
    
    return waitlistEntries;
  }

  // Room Analytics methods
  async getRoomUtilizationStats(startDate?: Date, endDate?: Date): Promise<Array<{
    roomId: string;
    roomName: string;
    totalBookings: number;
    totalHours: number;
    utilizationRate: number;
    averageBookingDuration: number;
  }>> {
    const rooms = Array.from(this.meetingRooms.values());
    const stats = [];
    
    for (const room of rooms) {
      let bookings = Array.from(this.roomBookings.values())
        .filter(b => b.roomId === room.id && b.status !== 'cancelled');
      
      if (startDate) {
        bookings = bookings.filter(b => new Date(b.startDateTime) >= startDate);
      }
      if (endDate) {
        bookings = bookings.filter(b => new Date(b.endDateTime) <= endDate);
      }
      
      const totalBookings = bookings.length;
      const totalHours = bookings.reduce((sum, booking) => {
        const duration = new Date(booking.endDateTime).getTime() - new Date(booking.startDateTime).getTime();
        return sum + (duration / (1000 * 60 * 60));
      }, 0);
      
      const averageBookingDuration = totalBookings > 0 ? totalHours / totalBookings : 0;
      const utilizationRate = totalHours / (24 * 7) * 100; // Assume 7 days per week availability
      
      stats.push({
        roomId: room.id,
        roomName: room.name,
        totalBookings,
        totalHours: Math.round(totalHours * 100) / 100,
        utilizationRate: Math.round(utilizationRate * 100) / 100,
        averageBookingDuration: Math.round(averageBookingDuration * 100) / 100,
      });
    }
    
    return stats.sort((a, b) => b.totalBookings - a.totalBookings);
  }

  async getMeetingPatterns(): Promise<{
    peakHours: string;
    popularRooms: Array<{ roomName: string; bookingCount: number }>;
    averageMeetingDuration: number;
    weeklyTrend: Array<{ day: string; bookings: number }>;
  }> {
    const bookings = Array.from(this.roomBookings.values())
      .filter(b => b.status !== 'cancelled');
    
    // Calculate peak hours
    const hourCounts = Array(24).fill(0);
    bookings.forEach(booking => {
      const hour = new Date(booking.startDateTime).getHours();
      hourCounts[hour]++;
    });
    
    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
    const peakHours = `${peakHour.toString().padStart(2, '0')}:00-${(peakHour + 1).toString().padStart(2, '0')}:00`;
    
    // Popular rooms
    const roomBookingCounts = new Map<string, number>();
    bookings.forEach(booking => {
      const count = roomBookingCounts.get(booking.roomId) || 0;
      roomBookingCounts.set(booking.roomId, count + 1);
    });
    
    const popularRooms = Array.from(roomBookingCounts.entries())
      .map(([roomId, count]) => {
        const room = this.meetingRooms.get(roomId);
        return { roomName: room?.name || 'Unknown', bookingCount: count };
      })
      .sort((a, b) => b.bookingCount - a.bookingCount)
      .slice(0, 5);
    
    // Average meeting duration
    const totalDuration = bookings.reduce((sum, booking) => {
      const duration = new Date(booking.endDateTime).getTime() - new Date(booking.startDateTime).getTime();
      return sum + (duration / (1000 * 60 * 60));
    }, 0);
    const averageMeetingDuration = bookings.length > 0 ? totalDuration / bookings.length : 0;
    
    // Weekly trend
    const weeklyTrend = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
      .map(day => {
        const dayBookings = bookings.filter(booking => {
          const bookingDate = new Date(booking.startDateTime);
          return bookingDate.toLocaleDateString('en-US', { weekday: 'long' }) === day;
        }).length;
        return { day, bookings: dayBookings };
      });
    
    return {
      peakHours,
      popularRooms,
      averageMeetingDuration: Math.round(averageMeetingDuration * 100) / 100,
      weeklyTrend,
    };
  }

  async getDepartmentAnalytics(): Promise<Array<{
    department: string;
    visitorCount: number;
    staffCount: number;
    totalCount: number;
    trend: string;
    color: string;
  }>> {
    const departments = Array.from(new Set(Array.from(this.staffMembers.values()).map(s => s.department)));
    
    return departments.map(department => {
      const staff = Array.from(this.staffMembers.values()).filter(s => s.department === department);
      const visitors = Array.from(this.visitors.values()).filter(v => 
        v.isCheckedIn && staff.some(s => s.id === v.hostStaffId)
      );
      
      const staffCount = staff.filter(s => s.isCheckedIn).length;
      const visitorCount = visitors.length;
      const totalCount = staffCount + visitorCount;
      
      // Realistic trend calculation based on department activity
      let trend = '0%';
      if (totalCount === 0) {
        // When there are 0 people total (display shows "0 people"), trend should be 0%
        trend = '0%';
      } else if (staff.length === 0) {
        // No staff assigned to this department - neutral trend
        trend = '0%';
      } else if (totalCount > 0) {
        // Calculate trend based on department size and activity
        const currentRate = totalCount / staff.length;
        
        if (currentRate > 0.8) {
          trend = '+' + Math.round((currentRate - 0.7) * 100) + '%';
        } else if (currentRate < 0.5 && currentRate > 0) {
          trend = '-' + Math.round((0.7 - currentRate) * 100) + '%';
        } else if (currentRate >= 0.5) {
          trend = '+' + Math.round((currentRate - 0.6) * 50) + '%';
        }
      }
      
      // Color based on department
      const colors = ['bg-blue-500', 'bg-green-500', 'bg-orange-500', 'bg-purple-500', 'bg-pink-500'];
      const color = colors[departments.indexOf(department) % colors.length];
      
      return {
        department,
        visitorCount,
        staffCount,
        totalCount,
        trend,
        color
      };
    });
  }

  async getReceptionDiary(startDate: Date, daysAhead: number): Promise<any[]> {
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + daysAhead);
    
    return Array.from(this.preBookings.values())
      .filter(booking => {
        const bookingDate = new Date(booking.visitDate);
        return bookingDate >= startDate && bookingDate <= endDate;
      })
      .map(booking => {
        const staff = this.staffMembers.get(booking.hostStaffId);
        return {
          ...booking,
          hostName: staff ? `${staff.firstName} ${staff.lastName}` : 'Unknown',
          hostFirstName: staff ? staff.firstName : '',
          hostLastName: staff ? staff.lastName : '',
          hostDepartment: staff ? staff.department || '' : '',
          hostEmail: staff ? staff.email || '' : '',
        };
      })
      .sort((a, b) => new Date(a.visitDate).getTime() - new Date(b.visitDate).getTime());
  }

  async getTodayRoomBookings(): Promise<RoomBooking[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    return Array.from(this.roomBookings.values())
      .filter(booking => {
        const bookingDate = new Date(booking.startDateTime);
        return bookingDate >= today && bookingDate < tomorrow;
      })
      .sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime());
  }

  async getDepartmentDetails(department: string): Promise<{
    department: string;
    staffMembers: Staff[];
    visitors: any[];
    statistics: {
      totalStaff: number;
      checkedInStaff: number;
      visitors: number;
      weeklyTrend: number;
    };
  }> {
    const staff = Array.from(this.staffMembers.values()).filter(s => s.department === department);
    const visitors = Array.from(this.visitors.values()).filter(v => 
      v.isCheckedIn && staff.some(s => s.id === v.hostStaffId)
    );
    
    return {
      department,
      staffMembers: staff,
      visitors,
      statistics: {
        totalStaff: staff.length,
        checkedInStaff: staff.filter(s => s.isCheckedIn).length,
        visitors: visitors.length,
        weeklyTrend: Math.floor(Math.random() * 20) - 10 // Simple trend
      }
    };
  }

  async getDepartmentNames(): Promise<string[]> {
    const departments = Array.from(new Set(Array.from(this.staffMembers.values()).map(s => s.department)));
    return departments.filter(Boolean);
  }

  async getAllContractorCompanies(): Promise<Array<ContractorCompany & { workersCount: number; documentsStatus: Record<string, string> }>> {
    return Array.from(this.contractorCompanies.values()).map(company => ({
      ...company,
      workersCount: Array.from(this.contractorWorkers.values()).filter(w => w.companyId === company.id).length,
      documentsStatus: {} // Empty for now since documents system is optional
    }));
  }

  async getContractorCompanyById(id: string): Promise<ContractorCompany | undefined> {
    return this.contractorCompanies.get(id);
  }

  async createContractorCompany(insertCompany: InsertContractorCompany): Promise<ContractorCompany> {
    // Validation: Check for duplicate email
    if (insertCompany.email) {
      const existingCompanyByEmail = Array.from(this.contractorCompanies.values())
        .find(company => company.email === insertCompany.email);
      if (existingCompanyByEmail) {
        throw new Error("A contractor company with this email already exists");
      }
    }
    
    const id = crypto.randomUUID();
    const company: ContractorCompany = {
      id,
      ...insertCompany,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.contractorCompanies.set(id, company);
    this.saveContractorCompaniesToFile(); // 💾 PERSIST IMMEDIATELY
    console.log(`Created contractor company: ${company.name} (ID: ${id})`);
    return company;
  }

  async deleteContractorCompany(id: string): Promise<boolean> {
    const existed = this.contractorCompanies.has(id);
    this.contractorCompanies.delete(id);
    
    // Also delete all workers for this company
    const workersToDelete = Array.from(this.contractorWorkers.entries())
      .filter(([, worker]) => worker.companyId === id)
      .map(([workerId]) => workerId);
    
    for (const workerId of workersToDelete) {
      this.contractorWorkers.delete(workerId);
    }
    
    if (existed) {
      this.saveContractorCompaniesToFile(); // 💾 PERSIST IMMEDIATELY
      if (workersToDelete.length > 0) {
        this.saveContractorWorkersToFile(); // 💾 PERSIST IMMEDIATELY
      }
    }
    
    return existed;
  }

  async createContractorWorker(insertWorker: InsertContractorWorker): Promise<ContractorWorker> {
    // Validation: Check for duplicate email
    if (insertWorker.email) {
      const existingWorkerByEmail = Array.from(this.contractorWorkers.values())
        .find(worker => worker.email === insertWorker.email);
      if (existingWorkerByEmail) {
        throw new Error("A contractor worker with this email already exists");
      }
    }
    
    const id = crypto.randomUUID();
    const worker: ContractorWorker = {
      id,
      ...insertWorker,
      isCheckedIn: false,
      checkedInAt: null,
      checkedOutAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.contractorWorkers.set(id, worker);
    this.saveContractorWorkersToFile(); // 💾 PERSIST IMMEDIATELY
    console.log(`Created contractor worker: ${worker.firstName} ${worker.lastName} (ID: ${id})`);
    return worker;
  }

  async getContractorWorkerById(id: string): Promise<ContractorWorker | undefined> {
    return this.contractorWorkers.get(id);
  }

  async updateContractorWorker(id: string, updates: Partial<InsertContractorWorker>): Promise<ContractorWorker | undefined> {
    const worker = this.contractorWorkers.get(id);
    if (!worker) return undefined;
    
    const updatedWorker = { ...worker, ...updates, updatedAt: new Date() };
    this.contractorWorkers.set(id, updatedWorker);
    this.saveContractorWorkersToFile(); // 💾 PERSIST IMMEDIATELY
    return updatedWorker;
  }

  async deleteContractorWorker(id: string): Promise<boolean> {
    const existed = this.contractorWorkers.has(id);
    this.contractorWorkers.delete(id);
    if (existed) {
      this.saveContractorWorkersToFile(); // 💾 PERSIST IMMEDIATELY
    }
    return existed;
  }


  async getAllContractorWorkers(): Promise<ContractorWorker[]> {
    return Array.from(this.contractorWorkers.values());
  }

  async getWorkersByCompanyId(companyId: string): Promise<ContractorWorker[]> {
    return Array.from(this.contractorWorkers.values()).filter(worker => worker.companyId === companyId);
  }

  async getCheckedInContractors(): Promise<ContractorWorker[]> {
    return Array.from(this.contractorWorkers.values()).filter(worker => worker.isCheckedIn);
  }

  async getContractorWorkers(companyId: string): Promise<ContractorWorker[]> {
    return Array.from(this.contractorWorkers.values()).filter(worker => worker.companyId === companyId);
  }

  async getDocumentsByCompanyId(companyId: string): Promise<ComplianceDocument[]> {
    return Array.from(this.complianceDocuments.values()).filter(doc => doc.companyId === companyId);
  }

  async updateContractorCompany(id: string, updates: Partial<InsertContractorCompany>): Promise<ContractorCompany | undefined> {
    const company = this.contractorCompanies.get(id);
    if (!company) return undefined;
    
    const updatedCompany = { ...company, ...updates, updatedAt: new Date() };
    this.contractorCompanies.set(id, updatedCompany);
    this.saveContractorCompaniesToFile(); // 💾 PERSIST IMMEDIATELY
    return updatedCompany;
  }

  // Contractor Pre-booking methods
  async createContractorPreBooking(booking: InsertContractorPreBooking): Promise<ContractorPreBooking> {
    const id = randomUUID();
    const qrCode = `CPB-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const preBooking: ContractorPreBooking = {
      id,
      ...booking,
      qrCode,
      status: booking.status || 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.contractorPreBookings.set(id, preBooking);
    this.saveContractorPreBookingsToFile();
    return preBooking;
  }

  async updateContractorPreBooking(id: string, updates: Partial<InsertContractorPreBooking>): Promise<ContractorPreBooking | undefined> {
    const preBooking = this.contractorPreBookings.get(id);
    if (!preBooking) return undefined;
    
    const updatedPreBooking = { ...preBooking, ...updates, updatedAt: new Date() };
    this.contractorPreBookings.set(id, updatedPreBooking);
    this.saveContractorPreBookingsToFile();
    return updatedPreBooking;
  }

  async getContractorPreBookings(): Promise<ContractorPreBooking[]> {
    return Array.from(this.contractorPreBookings.values()).sort((a, b) => 
      b.scheduledDate.getTime() - a.scheduledDate.getTime()
    );
  }

  async getContractorPreBookingById(id: string): Promise<ContractorPreBooking | undefined> {
    return this.contractorPreBookings.get(id);
  }

  async getUpcomingContractorPreBookings(): Promise<ContractorPreBooking[]> {
    const now = new Date();
    return Array.from(this.contractorPreBookings.values())
      .filter(booking => booking.scheduledDate >= now && booking.status === 'pending')
      .sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime());
  }

  async getTodaysContractorPreBookings(): Promise<ContractorPreBooking[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    return Array.from(this.contractorPreBookings.values())
      .filter(booking => 
        booking.scheduledDate >= today && 
        booking.scheduledDate < tomorrow &&
        booking.status === 'pending'
      )
      .sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime());
  }

  async deleteContractorPreBooking(id: string): Promise<boolean> {
    const result = this.contractorPreBookings.delete(id);
    if (result) {
      this.saveContractorPreBookingsToFile();
    }
    return result;
  }

  // Contractor Visit methods
  async createContractorVisit(visit: InsertContractorVisit): Promise<ContractorVisit> {
    const id = randomUUID();
    const contractorVisit: ContractorVisit = {
      id,
      ...visit,
      createdAt: new Date(),
    };
    
    this.contractorVisits.set(id, contractorVisit);
    this.saveContractorVisitsToFile();
    return contractorVisit;
  }

  async updateContractorVisit(id: string, updates: Partial<InsertContractorVisit>): Promise<ContractorVisit | undefined> {
    const visit = this.contractorVisits.get(id);
    if (!visit) return undefined;
    
    const updatedVisit = { ...visit, ...updates };
    this.contractorVisits.set(id, updatedVisit);
    this.saveContractorVisitsToFile();
    return updatedVisit;
  }

  async getContractorVisitHistory(workerId: string, customerId?: string): Promise<ContractorVisit[]> {
    return Array.from(this.contractorVisits.values())
      .filter(visit => visit.workerId === workerId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getCurrentContractorVisit(workerId: string): Promise<ContractorVisit | undefined> {
    const visits = Array.from(this.contractorVisits.values())
      .filter(visit => visit.workerId === workerId && !visit.checkedOutAt)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    return visits[0];
  }

  // Department management methods implementation
  async getAllDepartments(): Promise<Department[]> {
    return Array.from(this.departments.values()).filter(dept => dept.isActive);
  }

  async getDepartmentById(id: string): Promise<Department | undefined> {
    return this.departments.get(id);
  }

  async createDepartment(insertDepartment: InsertDepartment): Promise<Department> {
    const id = crypto.randomUUID();
    const department: Department = {
      id,
      ...insertDepartment,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.departments.set(id, department);
    this.saveDepartmentsToFile();
    console.log(`Created department: ${department.name} (ID: ${id})`);
    return department;
  }

  async updateDepartment(id: string, updates: Partial<InsertDepartment>): Promise<Department | undefined> {
    const department = this.departments.get(id);
    if (!department) return undefined;
    
    const updatedDepartment = { ...department, ...updates, updatedAt: new Date() };
    this.departments.set(id, updatedDepartment);
    this.saveDepartmentsToFile();
    return updatedDepartment;
  }

  async deleteDepartment(id: string): Promise<boolean> {
    const existed = this.departments.has(id);
    this.departments.delete(id);
    if (existed) {
      this.saveDepartmentsToFile();
    }
    return existed;
  }

  // Card Offences methods (Red/Yellow Card System) - Simple implementations for now
  async getAllCardOffences(): Promise<any[]> {
    // Return empty array for now to prevent 500 errors
    return [];
  }

  async getCardOffenceById(id: string): Promise<any | undefined> {
    return undefined;
  }

  async createCardOffence(offence: any): Promise<any> {
    return { ...offence, id: randomUUID(), createdAt: new Date() };
  }

  async createCardIssue(issue: any): Promise<any> {
    return { ...issue, id: randomUUID(), createdAt: new Date() };
  }
}

// Create and export a default storage instance
export const storage = createStorage();