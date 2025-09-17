import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/**
 * ISOLATED CUSTOMER SCHEMA
 * 
 * This schema is used for individual customer databases.
 * Since each customer has their own database, we don't need customerId fields.
 * This provides true isolation at the database level.
 */

// Staff table - no customerId needed since each customer has own DB
export const staff = pgTable("staff", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull().unique(),
  department: text("department").notNull(),
  employeeId: text("employee_id").notNull().unique(),
  // Multi-Tenant: Link staff to tenant company
  tenantCompanyId: varchar("tenant_company_id").references(() => tenantCompanies.id),
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
  // Induction tracking
  inductionCompleted: boolean("induction_completed").default(false).notNull(),
  inductionCompletedAt: timestamp("induction_completed_at"),
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

// Evacuation Accountability table for tracking people during emergency
export const evacuationAccountability = pgTable("evacuation_accountability", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  evacuationId: text("evacuation_id").notNull(),
  personId: text("person_id").notNull(),
  personType: text("person_type").notNull(), // 'staff' or 'visitor'
  personName: text("person_name").notNull(),
  department: text("department"),
  company: text("company"),
  lastKnownLocation: text("last_known_location"),
  isAccountedFor: boolean("is_accounted_for").default(false).notNull(),
  accountedBy: text("accounted_by"), // Fire Marshal who marked them safe
  accountedAt: timestamp("accounted_at"),
  musterPoint: text("muster_point"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
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
  // Multi-Tenant: Link visitor to the tenant company they're visiting
  visitingTenantId: varchar("visiting_tenant_id").references(() => tenantCompanies.id),
  // Pre-booking functionality
  isPreBooked: boolean("is_pre_booked").default(false).notNull(),
  expectedDateTime: timestamp("expected_date_time"),
  visitPurpose: text("visit_purpose"),
  checkedInAt: timestamp("checked_in_at").defaultNow().notNull(),
  checkedOutAt: timestamp("checked_out_at"),
  checkoutType: text("checkout_type"), // user, manual-reset, auto-reset
  isCheckedIn: boolean("is_checked_in").default(true).notNull(),
  // Emergency muster tracking
  isAccountedFor: boolean("is_accounted_for").default(false).notNull(),
  // Induction tracking
  inductionCompleted: boolean("induction_completed").default(false).notNull(),
  inductionCompletedAt: timestamp("induction_completed_at"),
  qrCode: text("qr_code").notNull(),
  // E-Pass tracking
  ePassSent: boolean("e_pass_sent").default(false).notNull(),
  ePassDeliveryType: text("e_pass_delivery_type"), // email, sms, both
  ePassSentAt: timestamp("e_pass_sent_at"),
  ePassUrl: text("e_pass_url"), // Unique URL for viewing the e-Pass
  expectedDepartureTime: timestamp("expected_departure_time"),
  reminderSent: boolean("reminder_sent").default(false).notNull(),
  hostNotificationSent: boolean("host_notification_sent").default(false).notNull(),
  // H&S Rules acceptance tracking
  hsRulesAccepted: boolean("hs_rules_accepted").default(false).notNull(),
  hsRulesAcceptedAt: timestamp("hs_rules_accepted_at"),
  hsRulesAcceptanceToken: text("hs_rules_acceptance_token"), // Token for verification
  // Notes field for additional visitor information
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Visitor history table for tracking all visits
export const visitorHistory = pgTable("visitor_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  visitorId: varchar("visitor_id").notNull().references(() => visitors.id),
  // Visit details
  checkInTime: timestamp("check_in_time").notNull(),
  checkOutTime: timestamp("check_out_time"),
  purpose: text("purpose"),
  hostStaffId: varchar("host_staff_id").references(() => staff.id),
  hostName: text("host_name"), // Store host name for historical reference
  // Tenant information
  visitingTenantId: varchar("visiting_tenant_id").references(() => tenantCompanies.id),
  tenantCompanyName: text("tenant_company_name"), // Store for history even if tenant is deleted
  // Compliance tracking
  inductionCompleted: boolean("induction_completed").default(false).notNull(),
  inductionCompletedAt: timestamp("induction_completed_at"),
  hsRulesAccepted: boolean("hs_rules_accepted").default(false).notNull(),
  hsRulesAcceptedAt: timestamp("hs_rules_accepted_at"),
  // E-Pass details
  ePassSent: boolean("e_pass_sent").default(false).notNull(),
  ePassSentAt: timestamp("e_pass_sent_at"),
  // Check-out details
  checkoutType: text("checkout_type"), // user, manual-reset, auto-reset, emergency
  // Visit notes
  notes: text("notes"),
  // QR code for this visit
  qrCode: text("qr_code"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Staff attendance history table for tracking all check-in/out events
export const staffAttendanceHistory = pgTable("staff_attendance_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  staffId: varchar("staff_id").notNull().references(() => staff.id),
  // Session details
  checkInTime: timestamp("check_in_time").notNull(),
  checkOutTime: timestamp("check_out_time"),
  // Work details
  department: text("department"),
  role: text("role"),
  // Session type
  sessionType: text("session_type").default('work').notNull(), // work, break, overtime
  isManualEntry: boolean("is_manual_entry").default(false).notNull(),
  // Check-out details
  checkoutType: text("checkout_type"), // user, manual-reset, auto-reset, emergency
  // Duration in minutes (calculated on checkout)
  durationMinutes: integer("duration_minutes"),
  // Notes for this session
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
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
  // Meeting room for the visit (optional)
  meetingRoomId: varchar("meeting_room_id").references(() => meetingRooms.id),
  // Multi-Tenant: Link pre-booking to tenant company
  tenantCompanyId: varchar("tenant_company_id").references(() => tenantCompanies.id),
  qrCode: text("qr_code").notNull(),
  status: text("status").notNull().default("pending"), // pending, confirmed, cancelled
  isCheckedIn: boolean("is_checked_in").default(false).notNull(),
  checkedInAt: timestamp("checked_in_at"),
  visitorId: varchar("visitor_id").references(() => visitors.id), // Link to visitor when checked in
  emailSent: boolean("email_sent").default(false),
  emailSentAt: timestamp("email_sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
  role: text("role").notNull().default("user"), // admin, user, tenant_admin, tenant_staff
  // Multi-Tenant: Link user to tenant company for tenant isolation
  tenantCompanyId: varchar("tenant_company_id").references(() => tenantCompanies.id),
  firstName: text("first_name"),
  lastName: text("last_name"),
  isActive: boolean("is_active").default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Multi-Tenant Serviced Office Management
// Tenant Companies - Each company renting space in the building
export const tenantCompanies = pgTable("tenant_companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyName: text("company_name").notNull().unique(),
  slug: text("slug").notNull().unique(), // For URL routing: acme.replit.app or /acme/login
  logoUrl: text("logo_url"),
  // Contact Information
  contactEmail: text("contact_email").notNull(),
  phone: text("phone"),
  address: text("address"),
  website: text("website"),
  // Tenant Admin Contact
  adminFirstName: text("admin_first_name"),
  adminLastName: text("admin_last_name"),
  adminEmail: text("admin_email"),
  // Subscription & Status
  isActive: boolean("is_active").default(true).notNull(),
  subscriptionTier: text("subscription_tier").default("basic"), // basic, premium, enterprise
  subscriptionExpires: timestamp("subscription_expires"),
  maxUsers: integer("max_users").default(50),
  maxVisitorsPerMonth: integer("max_visitors_per_month").default(1000),
  // Branding Settings
  primaryColor: text("primary_color").default("#3b82f6"),
  secondaryColor: text("secondary_color").default("#64748b"),
  // Custom Fields for Visitor Registration
  customVisitorFields: text("custom_visitor_fields").array().default([]), // JSON field names
  // API Access
  apiKeyEnabled: boolean("api_key_enabled").default(false),
  apiKey: text("api_key"), // For integrations
  // Data Privacy & GDPR
  dataRetentionDays: integer("data_retention_days").default(365),
  gdprContactEmail: text("gdpr_contact_email"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Building/Super Admin Settings (replaces single companySettings)
export const buildingSettings = pgTable("building_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  buildingName: text("building_name").notNull().default("Serviced Office Building"),
  buildingAddress: text("building_address"),
  managementCompany: text("management_company").notNull().default("Building Management Ltd"),
  logoUrl: text("logo_url"),
  // Super Admin Contact
  superAdminEmail: text("super_admin_email").notNull(),
  phone: text("phone"),
  website: text("website"),
  // Global Settings for All Tenants
  allowTenantSelfSignup: boolean("allow_tenant_self_signup").default(false),
  maxTenantsAllowed: integer("max_tenants_allowed").default(100),
  defaultVisitorRetention: integer("default_visitor_retention").default(90), // days
  // Emergency & Security
  emergencyPhone: text("emergency_phone"),
  securityCompany: text("security_company"),
  // Notifications
  notifyNewTenantSignup: boolean("notify_new_tenant_signup").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Company Settings - Now isolated per customer database
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
  foregroundColor: text("foreground_color").default("#1e293b"), // Fixed text: labels, headings
  variableTextColor: text("variable_text_color").default("#374151"), // Variable text: data values, content
  accentColor: text("accent_color").default("#3b82f6"),
  bannerUrl: text("banner_url"),
  theme: text("theme").default("light"), // light or dark
  // Printer settings
  selectedPrinter: text("selected_printer").default("PDF Printer"),
  enableQrCodes: boolean("enable_qr_codes").default(true),
  enable2dBarcodes: boolean("enable_2d_barcodes").default(false),
  barcodeFormat: text("barcode_format").default("QR_CODE"), // QR_CODE, DATA_MATRIX, PDF417
  printQuality: text("print_quality").default("normal"), // draft, normal, high
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Meeting Rooms for tenant companies
export const meetingRooms = pgTable("meeting_rooms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  capacity: integer("capacity").notNull(),
  location: text("location"),
  equipment: text("equipment").array().default([]), // ["projector", "whiteboard", "video_conference"]
  isActive: boolean("is_active").default(true).notNull(),
  tenantCompanyId: varchar("tenant_company_id").references(() => tenantCompanies.id), // null means available to all tenants
  hourlyRate: doublePrecision("hourly_rate").default(0), // Cost per hour
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Room Bookings
export const roomBookings = pgTable("room_bookings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  meetingRoomId: varchar("meeting_room_id").notNull().references(() => meetingRooms.id),
  bookedByStaffId: varchar("booked_by_staff_id").references(() => staff.id),
  tenantCompanyId: varchar("tenant_company_id").references(() => tenantCompanies.id),
  title: text("title").notNull(),
  description: text("description"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  isRecurring: boolean("is_recurring").default(false),
  recurrencePattern: text("recurrence_pattern"), // JSON string for recurring pattern
  status: text("status").default("confirmed"), // confirmed, cancelled, completed
  attendeeCount: integer("attendee_count").default(1),
  setupRequirements: text("setup_requirements").array().default([]),
  isPrivate: boolean("is_private").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Create insert schemas without customerId
export const insertStaffSchema = createInsertSchema(staff).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertVisitorSchema = createInsertSchema(visitors).omit({
  id: true,
  checkedInAt: true,
  checkedOutAt: true,
  qrCode: true,
  createdAt: true,
  updatedAt: true,
});

export const insertVisitorHistorySchema = createInsertSchema(visitorHistory).omit({
  id: true,
  createdAt: true,
});

export const insertStaffSessionSchema = createInsertSchema(staffSessions).omit({
  id: true,
  createdAt: true,
});

export const insertCompanySettingsSchema = createInsertSchema(companySettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDepartmentSchema = createInsertSchema(departments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTenantCompanySchema = createInsertSchema(tenantCompanies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPreBookingSchema = createInsertSchema(preBookings).omit({
  id: true,
  qrCode: true,
  createdAt: true,
});

export const insertStaffAttendanceHistorySchema = createInsertSchema(staffAttendanceHistory).omit({
  id: true,
  createdAt: true,
  durationMinutes: true,
});

// Types for isolated schema
export type Staff = typeof staff.$inferSelect;
export type InsertStaff = z.infer<typeof insertStaffSchema>;
export type StaffSession = typeof staffSessions.$inferSelect;
export type InsertStaffSession = z.infer<typeof insertStaffSessionSchema>;
export type Visitor = typeof visitors.$inferSelect;
export type InsertVisitor = z.infer<typeof insertVisitorSchema>;
export type VisitorHistory = typeof visitorHistory.$inferSelect;
export type InsertVisitorHistory = z.infer<typeof insertVisitorHistorySchema>;
export type StaffAttendanceHistory = typeof staffAttendanceHistory.$inferSelect;
export type InsertStaffAttendanceHistory = z.infer<typeof insertStaffAttendanceHistorySchema>;
export type Department = typeof departments.$inferSelect;
export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type CompanySettings = typeof companySettings.$inferSelect;
export type InsertCompanySettings = z.infer<typeof insertCompanySettingsSchema>;
export type TenantCompany = typeof tenantCompanies.$inferSelect;
export type InsertTenantCompany = z.infer<typeof insertTenantCompanySchema>;
export type PreBooking = typeof preBookings.$inferSelect;
export type InsertPreBooking = z.infer<typeof insertPreBookingSchema>;
export type BuildingSettings = typeof buildingSettings.$inferSelect;
export type MeetingRoom = typeof meetingRooms.$inferSelect;
export type RoomBooking = typeof roomBookings.$inferSelect;