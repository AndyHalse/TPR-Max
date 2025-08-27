import { db } from "./db";
import { 
  staff, staffSessions, visitors, users, companySettings, reports, preBookings, userInvitations,
  contractorCompanies, contractorWorkers, complianceDocuments, documentTypes, workerCompetencies,
  documentApprovals, departments, cardOffences, cardIssues, workerCertifications, ramsDocuments,
  co2Records, localLabourRecords, enhancedCompanyDetails, nvqQualifications
} from "@shared/schema";
import type { 
  Staff, InsertStaff, StaffSession, InsertStaffSession, Visitor, InsertVisitor, User, InsertUser, 
  CompanySettings, InsertCompanySettings, Report, PreBooking, InsertPreBooking, UserInvitation, InsertUserInvitation,
  ContractorCompany, InsertContractorCompany, ContractorWorker, InsertContractorWorker,
  ComplianceDocument, InsertComplianceDocument, DocumentType, InsertDocumentType,
  WorkerCompetency, InsertWorkerCompetency, DocumentApproval, InsertDocumentApproval,
  Department, InsertDepartment, CardOffence, InsertCardOffence, CardIssue, InsertCardIssue,
  WorkerCertification, InsertWorkerCertification, RamsDocument, InsertRamsDocument,
  Co2Record, InsertCo2Record, LocalLabourRecord, InsertLocalLabourRecord,
  EnhancedCompanyDetails, InsertEnhancedCompanyDetails, NvqQualification, InsertNvqQualification
} from "@shared/schema";
import type { IStorage } from "./storage";
import { eq, and, gte, lte, desc, asc, like, ilike, or, isNull, not, gt, count } from "drizzle-orm";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

export class DatabaseStorage implements IStorage {
  constructor() {
    // Initialize default offences data
    this.initializeDefaultOffences();
    // Initialize default NVQ qualifications
    this.initializeDefaultNvqQualifications();
  }

  private async initializeDefaultOffences() {
    try {
      // Check if offences already exist
      const existingOffences = await db.select().from(cardOffences);
      if (existingOffences.length > 0) {
        return; // Already initialized
      }

      // Red Card Offences from Siemens Energy requirements
      const redCardOffences = [
        { offenceName: "Unsafe work at height", offenceDescription: "Working at height without proper safety measures" },
        { offenceName: "Abuse of and putting the public at risk", offenceDescription: "Behavior that endangers public safety" },
        { offenceName: "Flagrant disregard for the safety method statement", offenceDescription: "Intentional violation of established safety procedures" },
        { offenceName: "Urinating and defecating in unauthorised locations", offenceDescription: "Using inappropriate areas for bodily functions" },
        { offenceName: "Drugs and alcohol abuse", offenceDescription: "Being under the influence of substances on site" },
        { offenceName: "Working within unsafe excavations and confined spaces", offenceDescription: "Entering hazardous work areas without authorization" },
        { offenceName: "Misuse of scaffolding or access equipment", offenceDescription: "Improper use of safety equipment" },
        { offenceName: "Unauthorised use of plant", offenceDescription: "Operating machinery without permission or qualification" },
        { offenceName: "Illegal discharges into drainage or water courses", offenceDescription: "Environmental contamination violations" },
        { offenceName: "Misuse of fire prevention equipment", offenceDescription: "Tampering with or misusing fire safety systems" },
        { offenceName: "Unauthorised work on asbestos-containing materials", offenceDescription: "Working with hazardous materials without proper training" },
        { offenceName: "Smoking in restricted areas", offenceDescription: "Smoking in prohibited zones" },
        { offenceName: "Operating plant while using a mobile phone", offenceDescription: "Distracted operation of machinery" }
      ];

      // Yellow Card Offences
      const yellowCardOffences = [
        { offenceName: "Not wearing hard hats", offenceDescription: "Failure to wear required head protection" },
        { offenceName: "Not wearing safety footwear", offenceDescription: "Improper or missing safety footwear" },
        { offenceName: "Incorrect use of PPE", offenceDescription: "Misuse of personal protective equipment" },
        { offenceName: "Misuse of lifting appliances and equipment", offenceDescription: "Improper use of lifting equipment" },
        { offenceName: "Misuse of tools and equipment", offenceDescription: "Incorrect handling of work tools" },
        { offenceName: "Use of mobile phones in unsafe areas", offenceDescription: "Mobile phone use in restricted zones" }
      ];

      // Insert Red Card offences
      for (const offence of redCardOffences) {
        await db.insert(cardOffences).values({
          id: randomUUID(),
          offenceName: offence.offenceName,
          offenceDescription: offence.offenceDescription,
          cardType: "red",
          isActive: true,
          siteConfigurable: true
        });
      }

      // Insert Yellow Card offences
      for (const offence of yellowCardOffences) {
        await db.insert(cardOffences).values({
          id: randomUUID(),
          offenceName: offence.offenceName,
          offenceDescription: offence.offenceDescription,
          cardType: "yellow",
          isActive: true,
          siteConfigurable: true
        });
      }

      console.log('✅ Default Red and Yellow Card offences initialized successfully');
    } catch (error) {
      console.error('Error initializing default offences:', error);
    }
  }

  private async initializeDefaultNvqQualifications() {
    try {
      // Check if qualifications already exist
      const existingQualifications = await db.select().from(nvqQualifications);
      if (existingQualifications.length > 0) {
        return; // Already initialized
      }

      // Common UK NVQ qualifications for contractors
      const defaultQualifications = [
        // Construction Industry
        { name: "Construction and the Built Environment", level: 2, industry: "Construction", description: "General construction skills and knowledge" },
        { name: "Construction and the Built Environment", level: 3, industry: "Construction", description: "Advanced construction skills and supervisory knowledge" },
        { name: "Bricklaying", level: 2, industry: "Construction", description: "Bricklaying skills and techniques" },
        { name: "Carpentry and Joinery", level: 2, industry: "Construction", description: "Carpentry and joinery skills" },
        { name: "Carpentry and Joinery", level: 3, industry: "Construction", description: "Advanced carpentry and joinery techniques" },
        { name: "Plumbing and Heating", level: 2, industry: "Construction", description: "Plumbing and heating installation and maintenance" },
        { name: "Plumbing and Heating", level: 3, industry: "Construction", description: "Advanced plumbing and heating systems" },
        { name: "Electrical Installation", level: 2, industry: "Electrical", description: "Electrical installation work" },
        { name: "Electrical Installation", level: 3, industry: "Electrical", description: "Advanced electrical installation and testing" },
        { name: "Painting and Decorating", level: 2, industry: "Construction", description: "Painting and decorating skills" },
        { name: "Roofing Occupations", level: 2, industry: "Construction", description: "Roofing installation and repair" },
        { name: "Wall and Floor Tiling", level: 2, industry: "Construction", description: "Tiling skills and techniques" },
        
        // Engineering and Manufacturing
        { name: "Engineering", level: 2, industry: "Engineering", description: "General engineering skills" },
        { name: "Engineering", level: 3, industry: "Engineering", description: "Advanced engineering and technical knowledge" },
        { name: "Mechanical Engineering", level: 2, industry: "Engineering", description: "Mechanical engineering skills" },
        { name: "Electrical and Electronic Engineering", level: 2, industry: "Engineering", description: "Electrical and electronic engineering" },
        { name: "Welding", level: 2, industry: "Engineering", description: "Welding skills and techniques" },
        { name: "Manufacturing Engineering", level: 2, industry: "Manufacturing", description: "Manufacturing processes and systems" },
        
        // Health and Safety
        { name: "Occupational Health and Safety Practice", level: 3, industry: "Health & Safety", description: "Health and safety management and practice" },
        { name: "Occupational Health and Safety Practice", level: 4, industry: "Health & Safety", description: "Advanced health and safety management" },
        { name: "Occupational Health and Safety Practice", level: 5, industry: "Health & Safety", description: "Strategic health and safety management" },
        
        // Plant Operations
        { name: "Plant Operations", level: 2, industry: "Construction", description: "Construction plant and machinery operations" },
        { name: "Crane Operations", level: 2, industry: "Construction", description: "Crane operation and safety" },
        
        // Specialist Areas
        { name: "Demolition", level: 2, industry: "Construction", description: "Demolition work and safety" },
        { name: "Scaffolding", level: 2, industry: "Construction", description: "Scaffolding erection and dismantling" },
        { name: "Steeplejack and Lightning Protection", level: 2, industry: "Construction", description: "Specialist height work" },
        { name: "Highway Maintenance", level: 2, industry: "Infrastructure", description: "Road and highway maintenance" },
      ];

      // Insert default qualifications
      for (const qualification of defaultQualifications) {
        await db.insert(nvqQualifications).values({
          id: randomUUID(),
          ...qualification,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      console.log(`✅ Seeded ${defaultQualifications.length} default NVQ qualifications`);
    } catch (error) {
      console.error("Failed to initialize NVQ qualifications:", error);
    }
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

  async getCheckedInContractors(): Promise<ContractorWorker[]> {
    // Get all checked-in contractors
    const checkedInContractors = await db.select()
      .from(contractorWorkers)
      .where(eq(contractorWorkers.isCheckedIn, true));

    return checkedInContractors;
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

  async findCheckedInVisitor(firstName: string, lastName: string, company?: string): Promise<Visitor | undefined> {
    console.log(`🔍 Database search for: ${firstName} ${lastName}, company: ${company || 'null'}`);
    
    // First check if someone with same name is currently checked in (prevent double check-ins)
    const checkedInConditions = [
      eq(visitors.firstName, firstName),
      eq(visitors.lastName, lastName),
      eq(visitors.isCheckedIn, true)
    ];
    
    if (company) {
      checkedInConditions.push(eq(visitors.company, company));
    }
    
    const [currentlyCheckedIn] = await db
      .select()
      .from(visitors)
      .where(and(...checkedInConditions))
      .limit(1);
    
    if (currentlyCheckedIn) {
      console.log(`❌ ALREADY CHECKED IN: ${currentlyCheckedIn.firstName} ${currentlyCheckedIn.lastName} (ID: ${currentlyCheckedIn.id})`);
      return currentlyCheckedIn;
    }
    
    console.log(`✅ No one with that name currently checked in`);
    return undefined;
  }


  async createVisitor(insertVisitor: InsertVisitor): Promise<Visitor> {
    // First check if there's an existing visitor with same name (checked out)
    // If so, check them in instead of creating a duplicate
    const existingVisitor = await this.findExistingVisitorToReuse(
      insertVisitor.firstName,
      insertVisitor.lastName,
      insertVisitor.company || undefined
    );
    
    if (existingVisitor) {
      console.log(`♻️ REUSING existing visitor: ${existingVisitor.firstName} ${existingVisitor.lastName} (ID: ${existingVisitor.id})`);
      
      // Update their details and check them in
      const [updatedVisitor] = await db
        .update(visitors)
        .set({
          company: insertVisitor.company,
          purpose: insertVisitor.purpose,
          carRegistration: insertVisitor.carRegistration,
          hostStaffId: insertVisitor.hostStaffId,
          checkedInAt: new Date(),
          checkedOutAt: null,
          checkoutType: null,
          isCheckedIn: true,
        })
        .where(eq(visitors.id, existingVisitor.id))
        .returning();
      
      return updatedVisitor;
    }
    
    console.log(`🆕 Creating new visitor: ${insertVisitor.firstName} ${insertVisitor.lastName}`);
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
  
  // Find existing checked-out visitor to reuse instead of creating duplicate
  async findExistingVisitorToReuse(firstName: string, lastName: string, company?: string): Promise<Visitor | undefined> {
    console.log(`🔍 Looking for existing visitor to reuse: ${firstName} ${lastName}`);
    
    // Look for exact match (name + company) that's checked out
    const exactConditions = [
      eq(visitors.firstName, firstName),
      eq(visitors.lastName, lastName),
      eq(visitors.isCheckedIn, false)
    ];
    
    if (company) {
      exactConditions.push(eq(visitors.company, company));
    }
    
    const [exactMatch] = await db
      .select()
      .from(visitors)
      .where(and(...exactConditions))
      .orderBy(desc(visitors.checkedInAt))  // Get most recent visit
      .limit(1);
    
    if (exactMatch) {
      console.log(`✅ Found exact match to reuse: ${exactMatch.firstName} ${exactMatch.lastName} (ID: ${exactMatch.id})`);
      return exactMatch;
    }
    
    // If no exact match, look for name-only match (ignore company)
    const [nameMatch] = await db
      .select()
      .from(visitors)
      .where(and(
        eq(visitors.firstName, firstName),
        eq(visitors.lastName, lastName),
        eq(visitors.isCheckedIn, false)
      ))
      .orderBy(desc(visitors.checkedInAt))  // Get most recent visit
      .limit(1);
    
    if (nameMatch) {
      console.log(`✅ Found name match to reuse: ${nameMatch.firstName} ${nameMatch.lastName} (ID: ${nameMatch.id})`);
    } else {
      console.log(`❌ No existing visitor found to reuse`);
    }
    
    return nameMatch;
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

  async deleteVisitor(id: string): Promise<boolean> {
    try {
      // Use a transaction to ensure both operations succeed
      return await db.transaction(async (tx) => {
        // First, update any pre-bookings that reference this visitor
        await tx
          .update(preBookings)
          .set({ visitorId: null })
          .where(eq(preBookings.visitorId, id));
        
        // Then delete the visitor
        const result = await tx.delete(visitors).where(eq(visitors.id, id));
        return result.rowCount > 0;
      });
    } catch (error) {
      console.error("Error deleting visitor:", error);
      return false;
    }
  }

  // NEW: Search visitors for quick rebooking
  async searchVisitors(searchTerm: string): Promise<Visitor[]> {
    const results = await db
      .select()
      .from(visitors)
      .where(
        or(
          ilike(visitors.firstName, `%${searchTerm}%`),
          ilike(visitors.lastName, `%${searchTerm}%`),
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
          ilike(preBookings.visitorFirstName, `%${searchTerm}%`),
          ilike(preBookings.visitorLastName, `%${searchTerm}%`),
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
        name: `${visitor.firstName} ${visitor.lastName}`,
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
        name: `${booking.visitorFirstName} ${booking.visitorLastName}`,
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

  // Accounted status toggle methods
  async toggleStaffAccountedStatus(id: string): Promise<boolean> {
    try {
      // First get current status - use full select to avoid issues
      const [currentStaff] = await db
        .select()
        .from(staff)
        .where(eq(staff.id, id))
        .limit(1);
        
      if (!currentStaff) {
        console.log('Staff member not found:', id);
        return false;
      }
      
      // Toggle the status - default to false if undefined
      const currentStatus = currentStaff.isAccountedFor || false;
      const newStatus = !currentStatus;
      console.log(`Toggling staff ${id} from ${currentStatus} to ${newStatus}`);
      
      await db
        .update(staff)
        .set({ 
          isAccountedFor: newStatus,
          updatedAt: new Date() 
        })
        .where(eq(staff.id, id));
        
      return true;
    } catch (error) {
      console.error("Error toggling staff accounted status:", error);
      return false;
    }
  }

  // Set staff accounted status directly (for bulk operations)
  async setStaffAccountedStatus(id: string, status: boolean): Promise<boolean> {
    try {
      const [currentStaff] = await db
        .select()
        .from(staff)
        .where(eq(staff.id, id))
        .limit(1);
        
      if (!currentStaff) {
        console.log('Staff member not found:', id);
        return false;
      }
      
      await db
        .update(staff)
        .set({ 
          isAccountedFor: status,
          updatedAt: new Date() 
        })
        .where(eq(staff.id, id));
        
      return true;
    } catch (error) {
      console.error("Error setting staff accounted status:", error);
      return false;
    }
  }

  async toggleVisitorAccountedStatus(id: string): Promise<boolean> {
    try {
      // First get current status
      const [currentVisitor] = await db
        .select({ isAccountedFor: visitors.isAccountedFor })
        .from(visitors)
        .where(eq(visitors.id, id));
        
      if (!currentVisitor) {
        console.log('Visitor not found:', id);
        return false;
      }
      
      // Toggle the status
      const newStatus = !currentVisitor.isAccountedFor;
      console.log(`Toggling visitor ${id} from ${currentVisitor.isAccountedFor} to ${newStatus}`);
      
      await db
        .update(visitors)
        .set({ 
          isAccountedFor: newStatus,
          updatedAt: new Date() 
        })
        .where(eq(visitors.id, id));
        
      return true;
    } catch (error) {
      console.error("Error toggling visitor accounted status:", error);
      return false;
    }
  }

  async toggleContractorAccountedStatus(id: string): Promise<boolean> {
    try {
      // First get current status
      const [currentContractor] = await db
        .select({ isAccountedFor: contractorWorkers.isAccountedFor })
        .from(contractorWorkers)
        .where(eq(contractorWorkers.id, id));
        
      if (!currentContractor) {
        console.log('Contractor not found:', id);
        return false;
      }
      
      // Toggle the status
      const newStatus = !currentContractor.isAccountedFor;
      console.log(`Toggling contractor ${id} from ${currentContractor.isAccountedFor} to ${newStatus}`);
      
      await db
        .update(contractorWorkers)
        .set({ 
          isAccountedFor: newStatus,
          updatedAt: new Date() 
        })
        .where(eq(contractorWorkers.id, id));
        
      return true;
    } catch (error) {
      console.error("Error toggling contractor accounted status:", error);
      return false;
    }
  }

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
    const [allStaff, allVisitors, allContractors] = await Promise.all([
      this.getCheckedInStaff(),
      this.getCurrentVisitors(),
      this.getCheckedInContractors(),
    ]);
    
    const musterList = [
      ...allStaff.map(staffMember => ({
        id: staffMember.id,
        name: `${staffMember.firstName} ${staffMember.lastName}`,
        type: 'staff' as const,
        department: staffMember.department,
        checkedInAt: (staffMember.checkedInAt || new Date()).toISOString(),
        location: 'Building A',
        accounted: staffMember.isAccountedFor || false
      })),
      ...allVisitors.map(visitor => ({
        id: visitor.id,
        name: `${visitor.firstName} ${visitor.lastName}`,
        type: 'visitor' as const,
        company: visitor.company || undefined,
        checkedInAt: visitor.checkedInAt.toISOString(),
        location: 'Reception',
        accounted: visitor.isAccountedFor || false
      })),
      ...allContractors.map(contractor => ({
        id: contractor.id,
        name: `${contractor.firstName} ${contractor.lastName}`,
        type: 'contractor' as const,
        company: contractor.companyName || undefined,
        checkedInAt: (contractor.checkedInAt || new Date()).toISOString(),
        location: 'Site',
        accounted: contractor.isAccountedFor || false
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

  // Contractor Company methods
  async getAllContractorCompanies(): Promise<Array<ContractorCompany & { workersCount: number; documentsStatus: Record<string, string> }>> {
    const companies = await db.select().from(contractorCompanies).orderBy(desc(contractorCompanies.createdAt));
    
    const enrichedCompanies = await Promise.all(companies.map(async (company) => {
      // Get workers count
      const workersCount = (await db.select().from(contractorWorkers).where(eq(contractorWorkers.companyId, company.id))).length;
      
      // Get document statuses
      const documents = await db.select().from(complianceDocuments).where(eq(complianceDocuments.companyId, company.id));
      const documentsStatus = {
        publicLiability: documents.find(d => d.documentType === 'public_liability')?.status || 'missing',
        employersLiability: documents.find(d => d.documentType === 'employers_liability')?.status || 'missing',
        healthSafety: documents.find(d => d.documentType === 'health_safety')?.status || 'missing',
        cisRegistration: documents.find(d => d.documentType === 'cis_registration')?.status || 'missing',
      };
      
      return {
        ...company,
        workersCount,
        documentsStatus
      };
    }));
    
    return enrichedCompanies;
  }

  async getContractorCompanyById(id: string): Promise<ContractorCompany | undefined> {
    const [company] = await db.select().from(contractorCompanies).where(eq(contractorCompanies.id, id));
    return company || undefined;
  }

  async createContractorCompany(insertCompany: InsertContractorCompany): Promise<ContractorCompany> {
    const id = randomUUID();
    
    const [newCompany] = await db
      .insert(contractorCompanies)
      .values({
        ...insertCompany,
        id,
      })
      .returning();
    
    return newCompany;
  }

  async updateContractorCompany(id: string, updates: Partial<InsertContractorCompany>): Promise<ContractorCompany | undefined> {
    const [updatedCompany] = await db
      .update(contractorCompanies)
      .set({ ...updates, lastUpdated: new Date() })
      .where(eq(contractorCompanies.id, id))
      .returning();
    
    return updatedCompany || undefined;
  }

  async deleteContractorCompany(id: string): Promise<boolean> {
    const result = await db
      .delete(contractorCompanies)
      .where(eq(contractorCompanies.id, id));
    
    return (result.rowCount || 0) > 0;
  }

  // Contractor Worker methods
  async getAllContractorWorkers(): Promise<ContractorWorker[]> {
    return await db.select().from(contractorWorkers);
  }

  async getWorkersByCompanyId(companyId: string): Promise<ContractorWorker[]> {
    return await db.select().from(contractorWorkers).where(eq(contractorWorkers.companyId, companyId));
  }

  async getContractorWorkerById(id: string): Promise<ContractorWorker | undefined> {
    const [worker] = await db.select().from(contractorWorkers).where(eq(contractorWorkers.id, id));
    return worker || undefined;
  }

  async createContractorWorker(insertWorker: InsertContractorWorker): Promise<ContractorWorker> {
    const id = randomUUID();
    
    const [newWorker] = await db
      .insert(contractorWorkers)
      .values({
        ...insertWorker,
        id,
      })
      .returning();
    
    return newWorker;
  }

  async updateContractorWorker(id: string, updates: Partial<InsertContractorWorker>): Promise<ContractorWorker | undefined> {
    const [updatedWorker] = await db
      .update(contractorWorkers)
      .set(updates)
      .where(eq(contractorWorkers.id, id))
      .returning();
    
    return updatedWorker || undefined;
  }

  async deleteContractorWorker(id: string): Promise<boolean> {
    const result = await db
      .delete(contractorWorkers)
      .where(eq(contractorWorkers.id, id));
    
    return (result.rowCount || 0) > 0;
  }

  // Compliance Document methods
  async getDocumentsByCompanyId(companyId: string): Promise<ComplianceDocument[]> {
    return await db.select().from(complianceDocuments).where(eq(complianceDocuments.companyId, companyId));
  }

  async createComplianceDocument(insertDocument: InsertComplianceDocument): Promise<ComplianceDocument> {
    const id = randomUUID();
    
    const [newDocument] = await db
      .insert(complianceDocuments)
      .values({
        ...insertDocument,
        id,
      })
      .returning();
    
    return newDocument;
  }

  async updateComplianceDocument(id: string, updates: Partial<InsertComplianceDocument>): Promise<ComplianceDocument | undefined> {
    const [updatedDocument] = await db
      .update(complianceDocuments)
      .set(updates)
      .where(eq(complianceDocuments.id, id))
      .returning();
    
    return updatedDocument || undefined;
  }

  async deleteComplianceDocument(id: string): Promise<boolean> {
    const result = await db
      .delete(complianceDocuments)
      .where(eq(complianceDocuments.id, id));
    
    return (result.rowCount || 0) > 0;
  }

  async getComplianceDocumentById(id: string): Promise<ComplianceDocument | undefined> {
    const [document] = await db.select().from(complianceDocuments).where(eq(complianceDocuments.id, id));
    return document || undefined;
  }

  // Document Approval methods
  async getDocumentApprovals(documentId: string): Promise<DocumentApproval[]> {
    return await db.select().from(documentApprovals)
      .where(eq(documentApprovals.documentId, documentId))
      .orderBy(desc(documentApprovals.createdAt));
  }

  async createDocumentApproval(insertApproval: InsertDocumentApproval): Promise<DocumentApproval> {
    const id = randomUUID();
    
    const [newApproval] = await db
      .insert(documentApprovals)
      .values({
        ...insertApproval,
        id,
      })
      .returning();
    
    return newApproval;
  }

  async getDocumentApprovalsByContractor(contractorId: string): Promise<DocumentApproval[]> {
    return await db.select().from(documentApprovals)
      .where(eq(documentApprovals.contractorId, contractorId))
      .orderBy(desc(documentApprovals.createdAt));
  }

  // Document Type methods
  async getAllDocumentTypes(): Promise<DocumentType[]> {
    return await db.select().from(documentTypes).where(eq(documentTypes.isActive, true));
  }

  async createDocumentType(insertType: InsertDocumentType): Promise<DocumentType> {
    const id = randomUUID();
    
    const [newType] = await db
      .insert(documentTypes)
      .values({
        ...insertType,
        id,
      })
      .returning();
    
    return newType;
  }

  // Worker Competency methods
  async getCompetenciesByWorkerId(workerId: string): Promise<WorkerCompetency[]> {
    return await db.select().from(workerCompetencies).where(eq(workerCompetencies.workerId, workerId));
  }

  async createWorkerCompetency(insertCompetency: InsertWorkerCompetency): Promise<WorkerCompetency> {
    const id = randomUUID();
    
    const [newCompetency] = await db
      .insert(workerCompetencies)
      .values({
        ...insertCompetency,
        id,
      })
      .returning();
    
    return newCompetency;
  }

  async updateWorkerCompetency(id: string, updates: Partial<InsertWorkerCompetency>): Promise<WorkerCompetency | undefined> {
    const [updatedCompetency] = await db
      .update(workerCompetencies)
      .set(updates)
      .where(eq(workerCompetencies.id, id))
      .returning();
    
    return updatedCompetency || undefined;
  }

  async deleteWorkerCompetency(id: string): Promise<boolean> {
    const result = await db
      .delete(workerCompetencies)
      .where(eq(workerCompetencies.id, id));
    
    return (result.rowCount || 0) > 0;
  }

  // NVQ Qualification methods
  async getAllNvqQualifications(): Promise<NvqQualification[]> {
    return await db.select().from(nvqQualifications).orderBy(asc(nvqQualifications.level), asc(nvqQualifications.name));
  }

  async getActiveNvqQualifications(): Promise<NvqQualification[]> {
    return await db.select()
      .from(nvqQualifications)
      .where(eq(nvqQualifications.isActive, true))
      .orderBy(asc(nvqQualifications.level), asc(nvqQualifications.name));
  }

  async getNvqQualificationById(id: string): Promise<NvqQualification | undefined> {
    const result = await db.select()
      .from(nvqQualifications)
      .where(eq(nvqQualifications.id, id));
    
    return result[0];
  }

  async createNvqQualification(insertQualification: InsertNvqQualification): Promise<NvqQualification> {
    const newQualification = {
      id: randomUUID(),
      ...insertQualification,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.insert(nvqQualifications).values(newQualification).returning();
    return result[0];
  }

  async updateNvqQualification(id: string, updates: Partial<InsertNvqQualification>): Promise<NvqQualification | undefined> {
    const result = await db
      .update(nvqQualifications)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(nvqQualifications.id, id))
      .returning();
    
    return result[0];
  }

  async deleteNvqQualification(id: string): Promise<boolean> {
    const result = await db
      .delete(nvqQualifications)
      .where(eq(nvqQualifications.id, id));
    
    return (result.rowCount || 0) > 0;
  }

  async getUniqueCompanies(): Promise<string[]> {
    try {
      const visitorList = await db.select({
        company: visitors.company
      }).from(visitors).where(and(
        not(eq(visitors.company, '')),
        not(isNull(visitors.company))
      ));
      
      const companies = new Set<string>();
      
      // Collect unique company names from visitors
      visitorList.forEach(visitor => {
        if (visitor.company && visitor.company.trim()) {
          companies.add(visitor.company.trim());
        }
      });
      
      // Convert to array and sort alphabetically
      return Array.from(companies).sort();
    } catch (error) {
      console.error("Error in DatabaseStorage.getUniqueCompanies:", error);
      return [];
    }
  }

  // Fire Marshal emergency methods
  async getFireMarshals(): Promise<Staff[]> {
    try {
      const fireMarshals = await db
        .select()
        .from(staff)
        .where(and(
          eq(staff.isFireMarshal, true),
          eq(staff.isActive, true)
        ))
        .orderBy(asc(staff.firstName));
      
      return fireMarshals;
    } catch (error) {
      console.error("Error fetching Fire Marshals:", error);
      return [];
    }
  }

  async updateStaffEmergencyToken(staffId: string, token: string, expires: Date): Promise<boolean> {
    try {
      const [updatedStaff] = await db
        .update(staff)
        .set({
          emergencyToken: token,
          emergencyTokenExpires: expires
        })
        .where(eq(staff.id, staffId))
        .returning();

      return !!updatedStaff;
    } catch (error) {
      console.error("Error updating emergency token:", error);
      return false;
    }
  }

  async validateEmergencyToken(token: string): Promise<Staff | null> {
    try {
      const [staffMember] = await db
        .select()
        .from(staff)
        .where(and(
          eq(staff.emergencyToken, token),
          gt(staff.emergencyTokenExpires, new Date()),
          eq(staff.isFireMarshal, true),
          eq(staff.isActive, true)
        ));

      return staffMember || null;
    } catch (error) {
      console.error("Error validating emergency token:", error);
      return null;
    }
  }

  async getTotalOnSitePersonnel(): Promise<number> {
    try {
      // Count staff currently on site
      const [staffCount] = await db
        .select({ count: count() })
        .from(staff)
        .where(and(
          eq(staff.isCheckedIn, true),
          eq(staff.isActive, true)
        ));

      // Count visitors currently on site
      const [visitorCount] = await db
        .select({ count: count() })
        .from(visitors)
        .where(eq(visitors.isCheckedIn, true));

      // Count contractors currently on site
      const [contractorCount] = await db
        .select({ count: count() })
        .from(contractorWorkers)
        .where(and(
          eq(contractorWorkers.isCheckedIn, true),
          eq(contractorWorkers.isActive, true)
        ));

      return (staffCount.count || 0) + (visitorCount.count || 0) + (contractorCount.count || 0);
    } catch (error) {
      console.error("Error getting total personnel count:", error);
      return 0;
    }
  }

  // Department analytics methods
  async getDepartmentAnalytics(): Promise<Array<{
    department: string;
    visitorCount: number;
    staffCount: number;
    totalCount: number;
    trend: string;
    color: string;
  }>> {
    try {
      // Get ALL departments from the departments table
      const allDepartments = await db.select().from(departments).where(eq(departments.isActive, true));
      
      // Get all staff grouped by department
      const allStaff = await db.select().from(staff);
      
      // Get current visitors with their host department info
      const currentVisitors = await db
        .select({
          visitor: visitors,
          hostStaff: staff,
        })
        .from(visitors)
        .leftJoin(staff, eq(visitors.hostStaffId, staff.id))
        .where(eq(visitors.isCheckedIn, true));

      // Initialize all departments with zero counts
      const departmentStats = new Map<string, {
        staffCount: number;
        visitorCount: number;
        totalStaff: number;
        color: string;
      }>();

      // Define department colors
      const departmentColors = {
        'Engineering': 'bg-blue-500',
        'Sales': 'bg-green-600', 
        'Marketing': 'bg-green-500',
        'HR': 'bg-orange-500',
        'Operations': 'bg-purple-500',
        'Finance': 'bg-yellow-500',
        'Security': 'bg-red-500',
        'Management': 'bg-pink-500',
        'IT': 'bg-cyan-500',
        'Quality': 'bg-emerald-500',
      };

      // Initialize all departments
      allDepartments.forEach(dept => {
        departmentStats.set(dept.name, {
          staffCount: 0,
          visitorCount: 0,
          totalStaff: 0,
          color: dept.color || departmentColors[dept.name] || 'bg-gray-500',
        });
      });

      // Count staff by department
      allStaff.forEach(staffMember => {
        const dept = staffMember.department;
        if (departmentStats.has(dept)) {
          const stats = departmentStats.get(dept)!;
          stats.totalStaff++;
          if (staffMember.isCheckedIn) {
            stats.staffCount++;
          }
        }
      });

      // Count visitors by host department
      currentVisitors.forEach(({ visitor, hostStaff }) => {
        if (hostStaff?.department && departmentStats.has(hostStaff.department)) {
          departmentStats.get(hostStaff.department)!.visitorCount++;
        }
      });

      // Calculate trends and build results
      const results = Array.from(departmentStats.entries()).map(([department, stats]) => {
        const totalCount = stats.visitorCount + stats.staffCount;
        // Simple trend calculation based on visitor/staff ratio
        const visitorRatio = totalCount > 0 ? (stats.visitorCount / totalCount) * 100 : 0;
        const trend = visitorRatio > 40 ? '+15%' : visitorRatio > 20 ? '+8%' : visitorRatio > 10 ? '+5%' : '+2%';
        
        return {
          department,
          visitorCount: stats.visitorCount,
          staffCount: stats.staffCount,
          totalCount,
          trend,
          color: stats.color,
        };
      });

      // Sort by total count descending, then by name
      return results.sort((a, b) => {
        if (b.totalCount !== a.totalCount) {
          return b.totalCount - a.totalCount;
        }
        return a.department.localeCompare(b.department);
      });
    } catch (error) {
      console.error('Error getting department analytics:', error);
      return [];
    }
  }

  async getDepartmentDetails(department: string): Promise<{
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
  }> {
    try {
      // Get all staff in the department
      const departmentStaff = await db
        .select()
        .from(staff)
        .where(eq(staff.department, department));

      // Get visitors hosted by staff in this department
      const departmentVisitors = await db
        .select({
          visitor: visitors,
          hostStaff: staff,
        })
        .from(visitors)
        .leftJoin(staff, eq(visitors.hostStaffId, staff.id))
        .where(
          and(
            eq(visitors.isCheckedIn, true),
            eq(staff.department, department)
          )
        );

      // Format staff data
      const staffData = departmentStaff.map(s => ({
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        checkedInAt: s.checkedInAt,
        isCheckedIn: s.isCheckedIn,
        accessLevel: s.accessLevel,
      }));

      // Format visitor data
      const visitorData = departmentVisitors.map(({ visitor, hostStaff }) => ({
        id: visitor.id,
        name: `${visitor.firstName} ${visitor.lastName}`,
        company: visitor.company,
        checkedInAt: visitor.checkedInAt,
        isCheckedIn: visitor.isCheckedIn,
        hostName: hostStaff ? `${hostStaff.firstName} ${hostStaff.lastName}` : 'Unknown',
      }));

      return {
        department,
        staff: staffData,
        visitors: visitorData,
        totalCount: staffData.filter(s => s.isCheckedIn).length + visitorData.length,
      };
    } catch (error) {
      console.error('Error getting department details:', error);
      return {
        department,
        staff: [],
        visitors: [],
        totalCount: 0,
      };
    }
  }

  // Department management methods
  async getAllDepartments(): Promise<Department[]> {
    try {
      const result = await db.select().from(departments).where(eq(departments.isActive, true)).orderBy(asc(departments.name));
      return result;
    } catch (error) {
      console.error('Error getting all departments:', error);
      return [];
    }
  }

  async getDepartmentById(id: string): Promise<Department | undefined> {
    try {
      const [department] = await db.select().from(departments).where(eq(departments.id, id));
      return department;
    } catch (error) {
      console.error('Error getting department by ID:', error);
      return undefined;
    }
  }

  async createDepartment(insertDepartment: InsertDepartment): Promise<Department> {
    try {
      const [department] = await db
        .insert(departments)
        .values({
          ...insertDepartment,
          id: randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      return department;
    } catch (error) {
      console.error('Error creating department:', error);
      throw error;
    }
  }

  async updateDepartment(id: string, updates: Partial<InsertDepartment>): Promise<Department | undefined> {
    try {
      const [department] = await db
        .update(departments)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(departments.id, id))
        .returning();
      return department;
    } catch (error) {
      console.error('Error updating department:', error);
      return undefined;
    }
  }

  async deleteDepartment(id: string): Promise<boolean> {
    try {
      // Soft delete by setting isActive to false
      const [department] = await db
        .update(departments)
        .set({
          isActive: false,
          updatedAt: new Date(),
        })
        .where(eq(departments.id, id))
        .returning();
      return !!department;
    } catch (error) {
      console.error('Error deleting department:', error);
      return false;
    }
  }

  async getDepartmentNames(): Promise<string[]> {
    try {
      const result = await db.select({ name: departments.name }).from(departments).where(eq(departments.isActive, true)).orderBy(asc(departments.name));
      return result.map(d => d.name);
    } catch (error) {
      console.error('Error getting department names:', error);
      return [];
    }
  }

  // Red and Yellow Card System Methods
  async getAllCardOffences(): Promise<CardOffence[]> {
    return await db.select().from(cardOffences).where(eq(cardOffences.isActive, true)).orderBy(asc(cardOffences.cardType), asc(cardOffences.offenceName));
  }

  async createCardOffence(data: InsertCardOffence): Promise<CardOffence> {
    const id = randomUUID();
    const [offence] = await db.insert(cardOffences).values({ ...data, id }).returning();
    return offence;
  }

  async updateCardOffence(id: string, updates: Partial<InsertCardOffence>): Promise<CardOffence | undefined> {
    const [updated] = await db
      .update(cardOffences)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(cardOffences.id, id))
      .returning();
    return updated;
  }

  async deleteCardOffence(id: string): Promise<boolean> {
    const [updated] = await db
      .update(cardOffences)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(cardOffences.id, id))
      .returning();
    return !!updated;
  }

  async createCardIssue(data: InsertCardIssue): Promise<CardIssue> {
    console.log("🔴 Creating card issue with data:", data);
    
    // Ensure required fields are present
    const cardIssueData = {
      ...data,
      id: randomUUID(),
      issuedAt: data.issuedAt || new Date(),
      photos: data.photos || [],
      status: data.status || "active"
    };
    
    console.log("🔴 Final card issue data:", cardIssueData);
    
    const [issue] = await db.insert(cardIssues).values(cardIssueData).returning();
    
    // Update worker's card status
    await this.updateWorkerCardStatus(data.workerId, data.cardType as "red" | "yellow", data.issuedBy);
    
    return issue;
  }

  // Update worker's current card status
  async updateWorkerCardStatus(workerId: string, cardType: "red" | "yellow", updatedBy: string): Promise<void> {
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

    await db
      .update(contractorWorkers)
      .set(updateData)
      .where(eq(contractorWorkers.id, workerId));
  }

  // Reset worker card status (for authorized users)
  async resetWorkerCardStatus(workerId: string, newStatus: "clear" | "yellow", updatedBy: string): Promise<void> {
    const updateData: any = {
      currentCardStatus: newStatus,
      cardStatusUpdatedAt: new Date(),
      cardStatusUpdatedBy: updatedBy,
    };

    // Clear red card ban if resetting to yellow or clear
    if (newStatus !== "red") {
      updateData.redCardBanUntil = null;
    }

    await db
      .update(contractorWorkers)
      .set(updateData)
      .where(eq(contractorWorkers.id, workerId));
  }

  async getWorkerCardIssues(workerId: string): Promise<CardIssue[]> {
    return await db.select().from(cardIssues).where(eq(cardIssues.workerId, workerId)).orderBy(desc(cardIssues.issuedAt));
  }

  async getActiveYellowCards(workerId: string, monthsBack: number = 6): Promise<CardIssue[]> {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsBack);
    
    return await db
      .select()
      .from(cardIssues)
      .where(
        and(
          eq(cardIssues.workerId, workerId),
          eq(cardIssues.cardType, "yellow"),
          eq(cardIssues.status, "active"),
          gte(cardIssues.issuedAt, cutoffDate)
        )
      )
      .orderBy(desc(cardIssues.issuedAt));
  }

  // Enhanced Worker Certifications
  async getWorkerCertifications(workerId: string): Promise<WorkerCertification[]> {
    return await db.select().from(workerCertifications).where(eq(workerCertifications.workerId, workerId)).orderBy(asc(workerCertifications.certificationType));
  }

  async createWorkerCertification(data: InsertWorkerCertification): Promise<WorkerCertification> {
    const id = randomUUID();
    const [certification] = await db.insert(workerCertifications).values({ ...data, id }).returning();
    return certification;
  }

  async updateWorkerCertification(id: string, updates: Partial<InsertWorkerCertification>): Promise<WorkerCertification | undefined> {
    const [updated] = await db
      .update(workerCertifications)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(workerCertifications.id, id))
      .returning();
    return updated;
  }

  async deleteWorkerCertification(id: string): Promise<boolean> {
    const result = await db.delete(workerCertifications).where(eq(workerCertifications.id, id));
    return (result.rowCount || 0) > 0;
  }

  async getExpiringCertifications(daysBefore: number = 30): Promise<WorkerCertification[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + daysBefore);
    
    return await db
      .select()
      .from(workerCertifications)
      .where(
        and(
          eq(workerCertifications.status, "valid"),
          lte(workerCertifications.expiryDate, cutoffDate)
        )
      )
      .orderBy(asc(workerCertifications.expiryDate));
  }

  // RAMs Document Management
  async getAllRamsDocuments(): Promise<RamsDocument[]> {
    return await db.select().from(ramsDocuments).where(eq(ramsDocuments.isActive, true)).orderBy(desc(ramsDocuments.uploadedAt));
  }

  async getRamsDocumentsByCompany(companyId: string): Promise<RamsDocument[]> {
    return await db.select().from(ramsDocuments).where(and(eq(ramsDocuments.companyId, companyId), eq(ramsDocuments.isActive, true))).orderBy(desc(ramsDocuments.uploadedAt));
  }

  async createRamsDocument(data: InsertRamsDocument): Promise<RamsDocument> {
    const id = randomUUID();
    const [document] = await db.insert(ramsDocuments).values({ ...data, id }).returning();
    return document;
  }

  async updateRamsDocument(id: string, updates: Partial<InsertRamsDocument>): Promise<RamsDocument | undefined> {
    const [updated] = await db
      .update(ramsDocuments)
      .set(updates)
      .where(eq(ramsDocuments.id, id))
      .returning();
    return updated;
  }

  async getExpiringRamsDocuments(daysBefore: number = 14): Promise<RamsDocument[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + daysBefore);
    
    return await db
      .select()
      .from(ramsDocuments)
      .where(
        and(
          eq(ramsDocuments.isActive, true),
          eq(ramsDocuments.status, "valid"),
          lte(ramsDocuments.expiryDate, cutoffDate)
        )
      )
      .orderBy(asc(ramsDocuments.expiryDate));
  }

  // CO2 Reporting
  async getAllCo2Records(): Promise<Co2Record[]> {
    return await db.select().from(co2Records).orderBy(desc(co2Records.recordDate));
  }

  async getCo2RecordsByCompany(companyId: string): Promise<Co2Record[]> {
    return await db.select().from(co2Records).where(eq(co2Records.companyId, companyId)).orderBy(desc(co2Records.recordDate));
  }

  async createCo2Record(data: InsertCo2Record): Promise<Co2Record> {
    const id = randomUUID();
    const [record] = await db.insert(co2Records).values({ ...data, id }).returning();
    return record;
  }

  async updateCo2Record(id: string, updates: Partial<InsertCo2Record>): Promise<Co2Record | undefined> {
    const [updated] = await db
      .update(co2Records)
      .set(updates)
      .where(eq(co2Records.id, id))
      .returning();
    return updated;
  }

  async getCo2RecordsByPeriod(reportingPeriod: string): Promise<Co2Record[]> {
    return await db.select().from(co2Records).where(eq(co2Records.reportingPeriod, reportingPeriod)).orderBy(desc(co2Records.recordDate));
  }

  // Local Labour Reporting
  async getAllLocalLabourRecords(): Promise<LocalLabourRecord[]> {
    return await db.select().from(localLabourRecords).orderBy(desc(localLabourRecords.recordedAt));
  }

  async getLocalLabourRecordsByCompany(companyId: string): Promise<LocalLabourRecord[]> {
    return await db.select().from(localLabourRecords).where(eq(localLabourRecords.companyId, companyId)).orderBy(desc(localLabourRecords.recordedAt));
  }

  async createLocalLabourRecord(data: InsertLocalLabourRecord): Promise<LocalLabourRecord> {
    const id = randomUUID();
    const [record] = await db.insert(localLabourRecords).values({ ...data, id }).returning();
    return record;
  }

  async updateLocalLabourRecord(id: string, updates: Partial<InsertLocalLabourRecord>): Promise<LocalLabourRecord | undefined> {
    const [updated] = await db
      .update(localLabourRecords)
      .set(updates)
      .where(eq(localLabourRecords.id, id))
      .returning();
    return updated;
  }

  async getLocalLabourStatistics(): Promise<{
    totalWorkers: number;
    localWorkers: number;
    localPercentage: number;
    apprentices: number;
  }> {
    const totalResult = await db.select({ count: count() }).from(localLabourRecords);
    const localResult = await db.select({ count: count() }).from(localLabourRecords).where(eq(localLabourRecords.isLocal, true));
    const apprenticeResult = await db.select({ count: count() }).from(localLabourRecords).where(eq(localLabourRecords.isApprentice, true));
    
    const total = totalResult[0]?.count || 0;
    const local = localResult[0]?.count || 0;
    const apprentices = apprenticeResult[0]?.count || 0;
    
    return {
      totalWorkers: total,
      localWorkers: local,
      localPercentage: total > 0 ? Math.round((local / total) * 100) : 0,
      apprentices
    };
  }

  // Enhanced Company Details
  async getEnhancedCompanyDetails(companyId?: string, departmentId?: string): Promise<EnhancedCompanyDetails | undefined> {
    const conditions = [];
    if (companyId) conditions.push(eq(enhancedCompanyDetails.companyId, companyId));
    if (departmentId) conditions.push(eq(enhancedCompanyDetails.departmentId, departmentId));
    
    const [details] = await db
      .select()
      .from(enhancedCompanyDetails)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    
    return details;
  }

  async upsertEnhancedCompanyDetails(data: InsertEnhancedCompanyDetails): Promise<EnhancedCompanyDetails> {
    const existing = await this.getEnhancedCompanyDetails(data.companyId || undefined, data.departmentId || undefined);
    
    if (existing) {
      const [updated] = await db
        .update(enhancedCompanyDetails)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(enhancedCompanyDetails.id, existing.id))
        .returning();
      return updated;
    } else {
      const id = randomUUID();
      const [created] = await db
        .insert(enhancedCompanyDetails)
        .values({ ...data, id })
        .returning();
      return created;
    }
  }

  // Induction Settings Methods
  async getInductionSettings(): Promise<InductionSettings[]> {
    return await db.select().from(inductionSettings).orderBy(inductionSettings.roleType);
  }

  async getInductionSettingsByRole(roleType: string): Promise<InductionSettings | undefined> {
    const [setting] = await db.select().from(inductionSettings).where(eq(inductionSettings.roleType, roleType));
    return setting;
  }

  async updateInductionSettings(roleType: string, updates: Partial<InsertInductionSettings>): Promise<InductionSettings> {
    const existing = await this.getInductionSettingsByRole(roleType);
    
    if (existing) {
      // Update existing induction setting
      const [updated] = await db
        .update(inductionSettings)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(inductionSettings.roleType, roleType))
        .returning();
      return updated;
    } else {
      // Create new induction setting
      const id = randomUUID();
      const [created] = await db
        .insert(inductionSettings)
        .values({
          id,
          roleType,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...updates
        } as InsertInductionSettings)
        .returning();
      return created;
    }
  }
}