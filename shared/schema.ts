import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const staff = pgTable("staff", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull().unique(),
  department: text("department").notNull(),
  employeeId: text("employee_id").notNull().unique(),
  photoUrl: text("photo_url"),
  accessLevel: text("access_level").notNull().default("staff"), // admin, supervisor, manager, staff, security, visitor, fire_marshal
  password: text("password"), // Only for admin and supervisor levels
  lastLoginAt: timestamp("last_login_at"),
  // Check-in/out tracking
  isCheckedIn: boolean("is_checked_in").default(false).notNull(),
  checkedInAt: timestamp("checked_in_at"),
  checkedOutAt: timestamp("checked_out_at"),
  checkoutType: text("checkout_type"), // user, manual-reset, auto-reset
  manualCheckIn: boolean("manual_check_in").default(false), // Track if check-in was manual due to lost card
  // Emergency muster tracking
  isAccountedFor: boolean("is_accounted_for").default(false).notNull(),
  // Fire Marshal emergency access
  isFireMarshal: boolean("is_fire_marshal").default(false).notNull(),
  emergencyToken: text("emergency_token"), // Secure token for emergency access without login
  emergencyTokenExpires: timestamp("emergency_token_expires"), // Token expiration
  userId: varchar("user_id").references(() => users.id), // Link to user account
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Staff sessions table for historical tracking of all check-ins/outs
export const staffSessions = pgTable("staff_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  staffId: varchar("staff_id").notNull().references(() => staff.id),
  checkInTime: timestamp("check_in_time").notNull(),
  checkOutTime: timestamp("check_out_time"),
  isManual: boolean("is_manual").default(false).notNull(),
  checkInMethod: text("check_in_method").default("card"), // card, manual, pin
  checkOutMethod: text("check_out_method"), // card, manual, pin
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const visitors = pgTable("visitors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phoneNumber: text("phone_number"),
  mobileNumber: text("mobile_number"),
  company: text("company"),
  jobTitle: text("job_title"),
  address: text("address"),
  purpose: text("purpose"),
  carRegistration: text("car_registration"),
  hostStaffId: varchar("host_staff_id").references(() => staff.id),
  checkedInAt: timestamp("checked_in_at").defaultNow().notNull(),
  checkedOutAt: timestamp("checked_out_at"),
  checkoutType: text("checkout_type"), // user, manual-reset, auto-reset
  isCheckedIn: boolean("is_checked_in").default(true).notNull(),
  // Emergency muster tracking
  isAccountedFor: boolean("is_accounted_for").default(false).notNull(),
  qrCode: text("qr_code").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Pre-bookings table for visitor appointments
export const preBookings = pgTable("pre_bookings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  visitorFirstName: text("visitor_first_name").notNull(),
  visitorLastName: text("visitor_last_name").notNull(),
  visitorEmail: text("visitor_email").notNull(),
  company: text("company"),
  purpose: text("purpose"),
  visitDate: timestamp("visit_date").notNull(),
  visitTime: text("visit_time"), // Store time as string for UI compatibility
  hostStaffId: varchar("host_staff_id").references(() => staff.id),
  qrCode: text("qr_code").notNull(),
  status: text("status").notNull().default("pending"), // pending, confirmed, cancelled
  isCheckedIn: boolean("is_checked_in").default(false).notNull(),
  checkedInAt: timestamp("checked_in_at"),
  visitorId: varchar("visitor_id").references(() => visitors.id), // Link to visitor when checked in
  emailSent: boolean("email_sent").default(false),
  emailSentAt: timestamp("email_sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertStaffSchema = createInsertSchema(staff).omit({
  id: true,
  createdAt: true,
});

export const insertVisitorSchema = createInsertSchema(visitors).omit({
  id: true,
  checkedInAt: true,
  checkedOutAt: true,
  qrCode: true,
});

export const insertStaffSessionSchema = createInsertSchema(staffSessions).omit({
  id: true,
  createdAt: true,
});

export type Staff = typeof staff.$inferSelect;
export type InsertStaff = z.infer<typeof insertStaffSchema>;
export type StaffSession = typeof staffSessions.$inferSelect;
export type InsertStaffSession = z.infer<typeof insertStaffSessionSchema>;
export type Visitor = typeof visitors.$inferSelect;
export type InsertVisitor = z.infer<typeof insertVisitorSchema>;

// Departments table for dynamic department management
export const departments = pgTable("departments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description"),
  color: text("color").notNull().default("bg-blue-500"), // CSS color class for UI
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email"),
  role: text("role").notNull().default("user"), // admin, user
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const companySettings = pgTable("company_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyName: text("company_name").notNull().default("TechCorp Ltd"),
  logoUrl: text("logo_url"),
  // Company contact information
  address: text("address").default(""),
  phone: text("phone").default(""),
  website: text("website").default(""),
  email: text("email").default(""),
  // Email and report settings
  emailReportsEnabled: boolean("email_reports_enabled").default(false),
  reportFrequency: text("report_frequency").default("weekly"), // daily, weekly, monthly
  reportRecipients: text("report_recipients").array().default(["admin@company.com"]),
  lastReportSent: timestamp("last_report_sent"),
  // SMTP Configuration (Industry Standard)
  smtpHost: text("smtp_host").default(""),
  smtpPort: text("smtp_port").default("587"), // 25, 587, 465, 2525
  smtpSecurity: text("smtp_security").default("STARTTLS"), // None, STARTTLS, SSL/TLS
  smtpUsername: text("smtp_username").default(""),
  smtpPassword: text("smtp_password").default(""),
  smtpFromEmail: text("smtp_from_email").default(""),
  smtpFromName: text("smtp_from_name").default(""),
  smtpReplyTo: text("smtp_reply_to").default(""),
  smtpAuthMethod: text("smtp_auth_method").default("LOGIN"), // LOGIN, PLAIN, CRAM-MD5
  smtpConnectionTimeout: text("smtp_connection_timeout").default("30"), // seconds
  smtpTestEmailSent: boolean("smtp_test_email_sent").default(false),
  smtpLastTested: timestamp("smtp_last_tested"),

  // Daily Reset / End of Day Configuration (Industry Standard)
  enableDailyReset: boolean("enable_daily_reset").default(true),
  dailyResetTime: text("daily_reset_time").default("00:00"), // HH:MM format
  dailyResetTimezone: text("daily_reset_timezone").default("Europe/London"),
  gracePeriodMinutes: text("grace_period_minutes").default("15"), // Minutes before auto-checkout
  enableWeekendReset: boolean("enable_weekend_reset").default(false),
  enableHolidayReset: boolean("enable_holiday_reset").default(false),
  notifyForgottenCheckouts: boolean("notify_forgotten_checkouts").default(true),
  lastDailyReset: timestamp("last_daily_reset"),
  allowManualReset: boolean("allow_manual_reset").default(true),
  resetLogRetentionDays: text("reset_log_retention_days").default("90"),
  enable24x7Operations: boolean("enable_24x7_operations").default(false),
  alertBeforeReset: boolean("alert_before_reset").default(true),
  alertMinutesBefore: text("alert_minutes_before").default("30"),
  // Branding settings
  backgroundColor: text("background_color").default("#f8fafc"),
  foregroundColor: text("foreground_color").default("#1e293b"),
  accentColor: text("accent_color").default("#3b82f6"),
  bannerUrl: text("banner_url"),
  theme: text("theme").default("light"), // light or dark
  // Printer settings
  selectedPrinter: text("selected_printer").default("PDF Printer"),
  enableQrCodes: boolean("enable_qr_codes").default(true),
  enable2dBarcodes: boolean("enable_2d_barcodes").default(false),
  barcodeFormat: text("barcode_format").default("QR_CODE"), // QR_CODE, DATA_MATRIX, PDF417
  printQuality: text("print_quality").default("normal"), // draft, normal, high
  // Suprema Biostar integration settings
  biostarEnabled: boolean("biostar_enabled").default(false),
  biostarServerUrl: text("biostar_server_url").default(""), // e.g., "https://your-biostar-server.com:8443"
  biostarApiKey: text("biostar_api_key").default(""),
  biostarUsername: text("biostar_username").default(""),
  biostarPassword: text("biostar_password").default(""),
  biostarDatabaseId: text("biostar_database_id").default("1"), // Default database ID
  biostarSyncInterval: text("biostar_sync_interval").default("300"), // Sync every 5 minutes (300 seconds)
  // Biometric reader device settings
  biometricDevices: text("biometric_devices").array().default([]), // Array of configured device IDs
  readerSettings: text("reader_settings").default("{}"), // JSON string for device-specific settings
  // AI and Video Generation Settings
  openaiModel: text("openai_model").default("gpt-5"), // gpt-4, gpt-5, gpt-6, gpt-7
  openaiTemperature: text("openai_temperature").default("0.7"), // 0.0-2.0 for creativity control
  openaiMaxTokens: text("openai_max_tokens").default("4000"), // Token limit per request
  videoQualityPreference: text("video_quality_preference").default("high"), // low, medium, high, ultra
  enableAdvancedVideoFeatures: boolean("enable_advanced_video_features").default(true),
  defaultVideoLength: text("default_video_length").default("15"), // minutes
  aiInstructionsPrompt: text("ai_instructions_prompt").default("Create comprehensive, engaging safety induction content"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// User invitations table for user management
export const userInvitations = pgTable("user_invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  role: text("role").notNull().default("user"), // admin, user
  invitedBy: varchar("invited_by").references(() => users.id),
  token: text("token").notNull().unique(),
  expires: timestamp("expires").notNull(),
  used: boolean("used").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const reports = pgTable("reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reportType: text("report_type").notNull(), // daily, weekly, monthly, manual
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  dateFrom: timestamp("date_from").notNull(),
  dateTo: timestamp("date_to").notNull(),
  totalVisitors: text("total_visitors").notNull(),
  avgDuration: text("avg_duration").notNull(),
  emailSent: boolean("email_sent").default(false),
  emailSentAt: timestamp("email_sent_at"),
});


export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertUserInvitationSchema = createInsertSchema(userInvitations).omit({
  id: true,
  token: true,
  used: true,
  createdAt: true,
});

export const insertCompanySettingsSchema = createInsertSchema(companySettings).omit({
  id: true,
  updatedAt: true,
});

export const insertReportSchema = createInsertSchema(reports).omit({
  id: true,
  generatedAt: true,
});

export const insertPreBookingSchema = createInsertSchema(preBookings).omit({
  id: true,
  qrCode: true,
  isCheckedIn: true,
  checkedInAt: true,
  visitorId: true,
  emailSent: true,
  emailSentAt: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertUserInvitation = z.infer<typeof insertUserInvitationSchema>;
export type User = typeof users.$inferSelect;
export type UserInvitation = typeof userInvitations.$inferSelect;
export type CompanySettings = typeof companySettings.$inferSelect;
export type InsertCompanySettings = z.infer<typeof insertCompanySettingsSchema>;
export type Report = typeof reports.$inferSelect;
export type InsertReport = z.infer<typeof insertReportSchema>;
export type PreBooking = typeof preBookings.$inferSelect;
export type InsertPreBooking = z.infer<typeof insertPreBookingSchema>;

// Contractor Companies table
export const contractorCompanies = pgTable("contractor_companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  address: text("address"),
  contactPerson: text("contact_person").notNull(),
  status: text("status").notNull().default("pending"), // pending, approved, suspended
  complianceScore: text("compliance_score").default("0"), // Stored as text for flexibility
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
  invitedBy: varchar("invited_by").references(() => users.id),
  onboardingCompleted: boolean("onboarding_completed").default(false),
  portalAccessEnabled: boolean("portal_access_enabled").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Contractor Documents table
export const contractorDocuments = pgTable("contractor_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractorId: varchar("contractor_id").notNull().references(() => contractorCompanies.id),
  documentType: text("document_type").notNull(), // public_liability, employers_liability, health_safety, cis_registration, etc.
  fileName: text("file_name"),
  fileUrl: text("file_url"),
  fileSize: text("file_size"),
  mimeType: text("mime_type"),
  expiryDate: timestamp("expiry_date"),
  status: text("status").notNull().default("pending"), // pending, valid, expired, expiring, rejected
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  uploadedBy: varchar("uploaded_by").references(() => users.id),
  notes: text("notes"),
});

// Document Approvals table
export const documentApprovals = pgTable("document_approvals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => complianceDocuments.id),
  contractorId: varchar("contractor_id").notNull().references(() => contractorCompanies.id),
  documentType: text("document_type").notNull(),
  approvalStatus: text("approval_status").notNull(), // approved, rejected, pending
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  comments: text("comments"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Contractor Workers table
export const contractorWorkers = pgTable("contractor_workers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => contractorCompanies.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  photoUrl: text("photo_url"),
  // Identity verification
  rightToWork: text("right_to_work_status").default("pending"), // valid, expired, pending, missing
  rightToWorkExpiry: timestamp("right_to_work_expiry"),
  // Competence cards
  cscsCard: text("cscs_card"),
  cscsExpiry: timestamp("cscs_expiry"),
  cscsStatus: text("cscs_status").default("missing"), // valid, expired, expiring, missing
  ipafCard: text("ipaf_card"),
  ipafExpiry: timestamp("ipaf_expiry"),
  ipafStatus: text("ipaf_status").default("missing"),
  // Training certificates
  asbestosAwareness: boolean("asbestos_awareness").default(false),
  asbestosExpiry: timestamp("asbestos_expiry"),
  manualHandling: boolean("manual_handling").default(false),
  manualHandlingExpiry: timestamp("manual_handling_expiry"),
  
  // Enhanced certifications for contractor safety compliance
  cibtCard: varchar("cibt_card"),
  cibtExpiry: timestamp("cibt_expiry"),
  cibtStatus: text("cibt_status").default("missing").notNull(), // valid, expired, missing
  cpcsCard: varchar("cpcs_card"),
  cpcsExpiry: timestamp("cpcs_expiry"),
  cpcsStatus: text("cpcs_status").default("missing").notNull(), // valid, expired, missing
  nvqQualificationId: varchar("nvq_qualification_id").references(() => nvqQualifications.id),
  nvqLevel: integer("nvq_level"), // NVQ Level 1-5
  nvqSubject: varchar("nvq_subject"),
  nvqExpiry: timestamp("nvq_expiry"),
  nvqStatus: text("nvq_status").default("missing").notNull(), // valid, expired, missing
  
  // Worker safety card status (individual worker level)
  currentCardStatus: text("current_card_status").default("clear").notNull(), // clear, yellow, red
  cardStatusUpdatedAt: timestamp("card_status_updated_at"),
  cardStatusUpdatedBy: varchar("card_status_updated_by").references(() => users.id),
  redCardBanUntil: timestamp("red_card_ban_until"), // When red card ban expires
  // Site-specific status
  isPreRegistered: boolean("is_pre_registered").default(false),
  inductionCompleted: boolean("induction_completed").default(false),
  inductionCompletedAt: timestamp("induction_completed_at"),
  isActive: boolean("is_active").default(true),
  // Check-in/out status
  isCheckedIn: boolean("is_checked_in").default(false),
  checkedInAt: timestamp("checked_in_at"),
  checkedOutAt: timestamp("checked_out_at"),
  checkoutType: text("checkout_type"), // user, manual-reset, auto-reset
  // Emergency muster tracking
  isAccountedFor: boolean("is_accounted_for").default(false).notNull(),
  // Convenience field for displaying company name
  companyName: text("company_name"),
  qrCode: text("qr_code"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Compliance Documents table
export const complianceDocuments = pgTable("compliance_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => contractorCompanies.id),
  documentType: text("document_type").notNull(), // public_liability, employers_liability, health_safety, cis_registration, rams, slavery_statement
  documentName: text("document_name").notNull(),
  documentUrl: text("document_url").notNull(),
  status: text("status").notNull().default("pending"), // valid, expired, expiring, pending_review, rejected
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  expiryDate: timestamp("expiry_date"),
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  version: text("version").default("1"), // For version control
  isActive: boolean("is_active").default(true),
});

// Document Types configuration
export const documentTypes = pgTable("document_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  code: text("code").notNull().unique(), // public_liability, employers_liability, etc.
  description: text("description"),
  isMandatory: boolean("is_mandatory").default(true),
  requiresExpiry: boolean("requires_expiry").default(true),
  alertDaysBefore: text("alert_days_before").default("14"), // Days before expiry to send alerts
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Worker Competencies table (for tracking specific skills/certifications)
export const workerCompetencies = pgTable("worker_competencies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workerId: varchar("worker_id").notNull().references(() => contractorWorkers.id),
  competencyType: text("competency_type").notNull(), // cscs, ipaf, pasma, asbestos, manual_handling, face_fit, etc.
  certificateNumber: text("certificate_number"),
  issuer: text("issuer"),
  issuedDate: timestamp("issued_date"),
  expiryDate: timestamp("expiry_date"),
  status: text("status").notNull().default("valid"), // valid, expired, expiring, suspended
  documentUrl: text("document_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// NVQ Qualifications table for managing contractor qualifications
export const nvqQualifications = pgTable("nvq_qualifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  level: integer("level").notNull(), // 1-5
  description: text("description"),
  industry: text("industry"), // Construction, Engineering, Manufacturing, etc.
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Create insert schemas
export const insertContractorCompanySchema = createInsertSchema(contractorCompanies).omit({
  id: true,
  lastUpdated: true,
  createdAt: true,
});

export const insertNvqQualificationSchema = createInsertSchema(nvqQualifications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertContractorWorkerSchema = createInsertSchema(contractorWorkers).omit({
  id: true,
  createdAt: true,
});

export const insertComplianceDocumentSchema = createInsertSchema(complianceDocuments).omit({
  id: true,
  uploadedAt: true,
});

export const insertContractorDocumentSchema = createInsertSchema(contractorDocuments).omit({
  id: true,
  uploadedAt: true,
});

export const insertDocumentApprovalSchema = createInsertSchema(documentApprovals).omit({
  id: true,
  createdAt: true,
});

export const insertDocumentTypeSchema = createInsertSchema(documentTypes).omit({
  id: true,
  createdAt: true,
});

export const insertWorkerCompetencySchema = createInsertSchema(workerCompetencies).omit({
  id: true,
  createdAt: true,
});

export const insertDepartmentSchema = createInsertSchema(departments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});


// Types
export type Department = typeof departments.$inferSelect;
export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;
export type ContractorCompany = typeof contractorCompanies.$inferSelect;
export type InsertContractorCompany = z.infer<typeof insertContractorCompanySchema>;
export type ContractorWorker = typeof contractorWorkers.$inferSelect;
export type InsertContractorWorker = z.infer<typeof insertContractorWorkerSchema>;
export type ComplianceDocument = typeof complianceDocuments.$inferSelect;
export type InsertComplianceDocument = z.infer<typeof insertComplianceDocumentSchema>;
export type ContractorDocument = typeof contractorDocuments.$inferSelect;
export type InsertContractorDocument = z.infer<typeof insertContractorDocumentSchema>;
export type DocumentApproval = typeof documentApprovals.$inferSelect;
export type InsertDocumentApproval = z.infer<typeof insertDocumentApprovalSchema>;
export type DocumentType = typeof documentTypes.$inferSelect;
export type InsertDocumentType = z.infer<typeof insertDocumentTypeSchema>;
export type WorkerCompetency = typeof workerCompetencies.$inferSelect;
export type InsertWorkerCompetency = z.infer<typeof insertWorkerCompetencySchema>;
export type NvqQualification = typeof nvqQualifications.$inferSelect;
export type InsertNvqQualification = z.infer<typeof insertNvqQualificationSchema>;
export type InductionToken = typeof inductionTokens.$inferSelect;
export type InsertInductionToken = z.infer<typeof insertInductionTokenSchema>;
export type InductionQuestion = typeof inductionQuestions.$inferSelect;
export type InsertInductionQuestion = z.infer<typeof insertInductionQuestionSchema>;
export type InductionAnswer = typeof inductionAnswers.$inferSelect;
export type InsertInductionAnswer = z.infer<typeof insertInductionAnswerSchema>;
export type InductionSettings = typeof inductionSettings.$inferSelect;
export type InsertInductionSettings = z.infer<typeof insertInductionSettingsSchema>;

// Red and Yellow Card System
export const cardOffences = pgTable("card_offences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  offenceName: text("offence_name").notNull(),
  offenceDescription: text("offence_description"),
  cardType: text("card_type").notNull(), // red, yellow
  isActive: boolean("is_active").default(true).notNull(),
  siteConfigurable: boolean("site_configurable").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const cardIssues = pgTable("card_issues", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workerId: varchar("worker_id").notNull().references(() => contractorWorkers.id),
  offenceId: varchar("offence_id").notNull().references(() => cardOffences.id),
  cardType: text("card_type").notNull(), // red, yellow
  issuedBy: varchar("issued_by").notNull().references(() => users.id),
  issuedAt: timestamp("issued_at").defaultNow().notNull(),
  description: text("description").notNull(),
  witness: text("witness"),
  location: text("location"),
  photos: text("photos").array().default([]),
  status: text("status").default("active").notNull(), // active, appealed, resolved
  banEndDate: timestamp("ban_end_date"), // For red cards (3 year ban)
  appealNotes: text("appeal_notes"),
  appealedAt: timestamp("appealed_at"),
  appealsCount: integer("appeals_count").default(0),
});

// Enhanced Worker Certifications (CIBT, CPCS, NVQ)
export const workerCertifications = pgTable("worker_certifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workerId: varchar("worker_id").notNull().references(() => contractorWorkers.id),
  certificationType: text("certification_type").notNull(), // CIBT, CPCS, NVQ, Other1, Other2
  certificationNumber: text("certification_number"),
  issuer: text("issuer"),
  issuedDate: timestamp("issued_date"),
  expiryDate: timestamp("expiry_date"),
  status: text("status").notNull().default("valid"), // valid, expired, expiring, suspended
  documentUrl: text("document_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// RAMs Certification System
export const ramsDocuments = pgTable("rams_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").references(() => contractorCompanies.id),
  departmentId: varchar("department_id").references(() => departments.id),
  ramsIdRef: text("rams_id_ref").notNull(),
  documentName: text("document_name").notNull(),
  documentUrl: text("document_url").notNull(),
  expiryDate: timestamp("expiry_date").notNull(),
  status: text("status").notNull().default("valid"), // valid, expired, expiring, pending_review
  uploadedBy: varchar("uploaded_by").references(() => users.id),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  alertDaysBefore: integer("alert_days_before").default(14),
  lastAlertSent: timestamp("last_alert_sent"),
  isActive: boolean("is_active").default(true).notNull(),
});

// CO2 Reporting System
export const co2Records = pgTable("co2_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").references(() => contractorCompanies.id),
  workerId: varchar("worker_id").references(() => contractorWorkers.id),
  recordType: text("record_type").notNull(), // transport, equipment, energy, materials
  recordDate: timestamp("record_date").notNull(),
  co2Amount: text("co2_amount").notNull(), // Stored as text for precision
  unit: text("unit").default("kg").notNull(), // kg, tonnes
  source: text("source"), // vehicle_type, equipment_type, etc.
  distance: text("distance"), // For transport records
  fuelType: text("fuel_type"), // diesel, petrol, electric, etc.
  description: text("description"),
  calculationMethod: text("calculation_method"),
  verified: boolean("verified").default(false),
  verifiedBy: varchar("verified_by").references(() => users.id),
  verifiedAt: timestamp("verified_at"),
  reportingPeriod: text("reporting_period"), // month-year, e.g. "2024-01"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Site Induction Video System
export const inductionTokens = pgTable("induction_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workerId: varchar("worker_id").notNull().references(() => contractorWorkers.id),
  token: text("token").notNull().unique(),
  status: text("status").notNull().default("pending"), // pending, in_progress, completed, expired
  emailSent: boolean("email_sent").default(false),
  emailSentAt: timestamp("email_sent_at"),
  videoWatched: boolean("video_watched").default(false),
  videoWatchedAt: timestamp("video_watched_at"),
  quizAttempts: integer("quiz_attempts").default(0),
  quizCompleted: boolean("quiz_completed").default(false),
  quizCompletedAt: timestamp("quiz_completed_at"),
  quizScore: integer("quiz_score").default(0),
  passThreshold: integer("pass_threshold").default(80), // UK H&S requirement: 80% pass rate
  expiresAt: timestamp("expires_at").notNull(),
  completedAt: timestamp("completed_at"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const inductionQuestions = pgTable("induction_questions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  questionText: text("question_text").notNull(),
  questionType: text("question_type").notNull().default("multiple_choice"), // multiple_choice, true_false
  correctAnswer: text("correct_answer").notNull(),
  optionA: text("option_a"),
  optionB: text("option_b"),
  optionC: text("option_c"),
  optionD: text("option_d"),
  explanation: text("explanation"),
  category: text("category").notNull(), // general_safety, ppe, emergency_procedures, hazard_identification, working_at_height, etc.
  roleType: text("role_type").notNull().default("contractor"), // visitor, staff, contractor
  videoId: varchar("video_id"), // Link to generated video for AI-generated questions
  isAiGenerated: boolean("is_ai_generated").default(false).notNull(), // Flag to identify AI-generated questions
  isActive: boolean("is_active").default(true).notNull(),
  orderIndex: integer("order_index").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Induction Settings table for managing videos and configurations per role
export const inductionSettings = pgTable("induction_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roleType: text("role_type").notNull(), // visitor, staff, contractor
  videoTitle: text("video_title").notNull(),
  videoUrl: text("video_url").notNull(),
  videoDescription: text("video_description"),
  videoDurationMinutes: integer("video_duration_minutes").default(15),
  videoFormat: text("video_format").default("interactive_slides").notNull(), // 'interactive_slides', 'full_video', 'hybrid_enhanced'
  modelType: text("model_type").default("gpt-5").notNull(), // 'gpt-4o', 'gpt-5', 'gpt-6', 'gpt-7'
  passPercentage: integer("pass_percentage").default(80), // Minimum percentage to pass
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const inductionAnswers = pgTable("induction_answers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tokenId: varchar("token_id").notNull().references(() => inductionTokens.id),
  questionId: varchar("question_id").notNull().references(() => inductionQuestions.id),
  attemptNumber: integer("attempt_number").notNull().default(1),
  selectedAnswer: text("selected_answer").notNull(),
  isCorrect: boolean("is_correct").notNull(),
  answeredAt: timestamp("answered_at").defaultNow().notNull(),
});

// Local Labour Reporting
export const localLabourRecords = pgTable("local_labour_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workerId: varchar("worker_id").notNull().references(() => contractorWorkers.id),
  companyId: varchar("company_id").notNull().references(() => contractorCompanies.id),
  postcode: text("postcode").notNull(),
  localRadius: integer("local_radius").default(20).notNull(), // Miles from site
  isLocal: boolean("is_local").default(false).notNull(),
  address: text("address"),
  travelDistance: text("travel_distance"),
  transportMethod: text("transport_method"), // car, public_transport, walking, cycling
  localHireDate: timestamp("local_hire_date"),
  skills: text("skills").array().default([]),
  apprenticeshipLevel: text("apprenticeship_level"), // level1, level2, level3, level4, graduate
  isApprentice: boolean("is_apprentice").default(false),
  trainingProvider: text("training_provider"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
  recordedBy: varchar("recorded_by").references(() => users.id),
});

// Enhanced Company/Department Details with RAMs
export const enhancedCompanyDetails = pgTable("enhanced_company_details", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").references(() => contractorCompanies.id),
  departmentId: varchar("department_id").references(() => departments.id),
  ramsIdRef: text("rams_id_ref"),
  ramsExpiryDate: timestamp("rams_expiry_date"),
  ramsDocumentUrl: text("rams_document_url"),
  ramsUploadedAt: timestamp("rams_uploaded_at"),
  ramsLastAlertSent: timestamp("rams_last_alert_sent"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Create insert schemas for new tables
export const insertCardOffenceSchema = createInsertSchema(cardOffences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCardIssueSchema = createInsertSchema(cardIssues).omit({
  id: true,
  issuedAt: true,
});

export const insertWorkerCertificationSchema = createInsertSchema(workerCertifications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRamsDocumentSchema = createInsertSchema(ramsDocuments).omit({
  id: true,
  uploadedAt: true,
});

export const insertCo2RecordSchema = createInsertSchema(co2Records).omit({
  id: true,
  createdAt: true,
});

export const insertLocalLabourRecordSchema = createInsertSchema(localLabourRecords).omit({
  id: true,
  recordedAt: true,
});

export const insertEnhancedCompanyDetailsSchema = createInsertSchema(enhancedCompanyDetails).omit({
  id: true,
  updatedAt: true,
});

export const insertInductionTokenSchema = createInsertSchema(inductionTokens).omit({
  id: true,
  createdAt: true,
});

export const insertInductionQuestionSchema = createInsertSchema(inductionQuestions).omit({
  id: true,
  createdAt: true,
});

export const insertInductionSettingsSchema = createInsertSchema(inductionSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertInductionAnswerSchema = createInsertSchema(inductionAnswers).omit({
  id: true,
  answeredAt: true,
});

// Types for new tables
export type CardOffence = typeof cardOffences.$inferSelect;
export type InsertCardOffence = z.infer<typeof insertCardOffenceSchema>;
export type CardIssue = typeof cardIssues.$inferSelect;
export type InsertCardIssue = z.infer<typeof insertCardIssueSchema>;
export type WorkerCertification = typeof workerCertifications.$inferSelect;
export type InsertWorkerCertification = z.infer<typeof insertWorkerCertificationSchema>;
export type RamsDocument = typeof ramsDocuments.$inferSelect;
export type InsertRamsDocument = z.infer<typeof insertRamsDocumentSchema>;
export type Co2Record = typeof co2Records.$inferSelect;
export type InsertCo2Record = z.infer<typeof insertCo2RecordSchema>;
export type LocalLabourRecord = typeof localLabourRecords.$inferSelect;
export type InsertLocalLabourRecord = z.infer<typeof insertLocalLabourRecordSchema>;
export type EnhancedCompanyDetails = typeof enhancedCompanyDetails.$inferSelect;
export type InsertEnhancedCompanyDetails = z.infer<typeof insertEnhancedCompanyDetailsSchema>;


// Contractor Visits Tracking - Similar to Visitor system
export const contractorVisits = pgTable("contractor_visits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workerId: varchar("worker_id").references(() => contractorWorkers.id).notNull(),
  companyId: varchar("company_id").references(() => contractorCompanies.id).notNull(),
  purpose: text("purpose"),
  checkedInAt: timestamp("checked_in_at").defaultNow().notNull(),
  checkedOutAt: timestamp("checked_out_at"),
  duration: text("duration"), // calculated field
  qrCode: text("qr_code").unique(),
  passUrl: text("pass_url"), // URL to generated pass
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Contractor Pre-bookings - Similar to Visitor pre-booking
export const contractorPreBookings = pgTable("contractor_prebookings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyName: text("company_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  contactPhone: text("contact_phone"),
  workerName: text("worker_name").notNull(),
  workerEmail: text("worker_email"),
  purpose: text("purpose").notNull(),
  scheduledDate: timestamp("scheduled_date").notNull(),
  scheduledTime: text("scheduled_time").notNull(), // HH:MM format
  duration: text("duration").default("4"), // hours
  status: text("status").default("pending"), // pending, confirmed, cancelled, completed
  qrCode: text("qr_code").unique().notNull(),
  notes: text("notes"),
  documentsRequired: text("documents_required").array().default([]),
  documentsUploaded: text("documents_uploaded").array().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Insert schemas for new tables
export const insertContractorVisitSchema = createInsertSchema(contractorVisits).omit({
  id: true,
  createdAt: true,
});

export const insertContractorPreBookingSchema = createInsertSchema(contractorPreBookings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  qrCode: true,
});

// Types for new tables
export type ContractorVisit = typeof contractorVisits.$inferSelect;
export type InsertContractorVisit = z.infer<typeof insertContractorVisitSchema>;
export type ContractorPreBooking = typeof contractorPreBookings.$inferSelect;
export type InsertContractorPreBooking = z.infer<typeof insertContractorPreBookingSchema>;
