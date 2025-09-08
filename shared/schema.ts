import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// CUSTOMER ISOLATION: Each customer gets their own database instance
// This table tracks customer metadata for onboarding and management
export const customers = pgTable("customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyName: text("company_name").notNull().unique(),
  slug: text("slug").notNull().unique(), // For subdomain routing: customer.visigate.app
  contactEmail: text("contact_email").notNull(),
  // Database connection for this customer
  databaseUrl: text("database_url").notNull(), // Each customer gets own PostgreSQL database
  // Status
  isActive: boolean("is_active").default(true).notNull(),
  // System limits  
  maxTenants: integer("max_tenants").default(10), // How many building tenants this customer can have
  maxUsersPerTenant: integer("max_users_per_tenant").default(50),
  maxVisitorsPerMonth: integer("max_visitors_per_month").default(1000),
  // Onboarding & Support
  onboardingCompleted: boolean("onboarding_completed").default(false),
  supportContactEmail: text("support_contact_email"),
  // Security & API
  apiKeyEnabled: boolean("api_key_enabled").default(false),
  apiKey: text("api_key"), // For customer integrations
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const staff = pgTable("staff", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // CUSTOMER ISOLATION: Each staff member belongs to a specific customer
  customerId: varchar("customer_id").notNull().references(() => customers.id),
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
  // CUSTOMER ISOLATION: Each staff session belongs to a specific customer
  customerId: varchar("customer_id").notNull().references(() => customers.id),
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
  customerId: varchar("customer_id").notNull().references(() => customers.id),
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
  // CUSTOMER ISOLATION: Each visitor belongs to a specific customer
  customerId: varchar("customer_id").notNull().references(() => customers.id),
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
  // CUSTOMER ISOLATION: Each visitor history belongs to a specific customer
  customerId: varchar("customer_id").notNull().references(() => customers.id),
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
  // CUSTOMER ISOLATION: Each attendance record belongs to a specific customer
  customerId: varchar("customer_id").notNull().references(() => customers.id),
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
  // CUSTOMER ISOLATION: Each pre-booking belongs to a specific customer
  customerId: varchar("customer_id").notNull().references(() => customers.id),
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

// Customer schema exports
export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
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

export const insertVisitorHistorySchema = createInsertSchema(visitorHistory).omit({
  id: true,
  createdAt: true,
});

export const insertStaffSessionSchema = createInsertSchema(staffSessions).omit({
  id: true,
  createdAt: true,
});

// Customer types
export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;

export type Staff = typeof staff.$inferSelect;
export type InsertStaff = z.infer<typeof insertStaffSchema>;
export type StaffSession = typeof staffSessions.$inferSelect;
export type InsertStaffSession = z.infer<typeof insertStaffSessionSchema>;
export type Visitor = typeof visitors.$inferSelect;
export type InsertVisitor = z.infer<typeof insertVisitorSchema>;
export type VisitorHistory = typeof visitorHistory.$inferSelect;
export type InsertVisitorHistory = z.infer<typeof insertVisitorHistorySchema>;

export const insertStaffAttendanceHistorySchema = createInsertSchema(staffAttendanceHistory).omit({
  id: true,
  createdAt: true,
  durationMinutes: true,
});

export type StaffAttendanceHistory = typeof staffAttendanceHistory.$inferSelect;
export type InsertStaffAttendanceHistory = z.infer<typeof insertStaffAttendanceHistorySchema>;

// Departments table for dynamic department management
export const departments = pgTable("departments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // CUSTOMER ISOLATION: Each department belongs to a specific customer
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  name: text("name").notNull().unique(),
  description: text("description"),
  color: text("color").notNull().default("bg-blue-500"), // CSS color class for UI
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // CUSTOMER ISOLATION: Each user belongs to a specific customer
  customerId: varchar("customer_id").notNull().references(() => customers.id),
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
  // CUSTOMER ISOLATION: Each tenant company belongs to a specific customer
  customerId: varchar("customer_id").notNull().references(() => customers.id),
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
  // CUSTOMER ISOLATION: Each building setting belongs to a specific customer
  customerId: varchar("customer_id").notNull().references(() => customers.id),
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

// Company Settings - Now with CUSTOMER ISOLATION for SaaS
export const companySettings = pgTable("company_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // CUSTOMER ISOLATION: CRITICAL - Each customer gets their own settings
  customerId: varchar("customer_id").notNull().references(() => customers.id),
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
  // ID Card printer settings
  idCardPrinter: text("id_card_printer").default(""),
  idCardPrintQuality: text("id_card_print_quality").default("high"), // draft, normal, high
  idCardPaperSize: text("id_card_paper_size").default("cr80"), // cr80 (standard card size), cr79, custom
  idCardOrientation: text("id_card_orientation").default("landscape"), // portrait, landscape
  idCardDesign: text("id_card_design").default("[]"), // JSON string storing card element positions and styles
  // Thermal Pass Designs for B-FV4D Printer (95mm x 65mm)
  visitorPassDesign: text("visitor_pass_design").default("[]"), // JSON string storing visitor thermal pass layout
  contractorPassDesign: text("contractor_pass_design").default("[]"), // JSON string storing contractor thermal pass layout
  // Thermal Printer Settings for Pass Designer
  thermalSelectedPrinter: text("thermal_selected_printer").default("tec"), // tec, zebra
  thermalPrintMethod: text("thermal_print_method").default("direct"), // direct, browser, windows
  thermalPrintQuality: text("thermal_print_quality").default("reception"), // reception, security, visitor
  thermalPrinterSettings: text("thermal_printer_settings").default("{}"), // JSON string storing printer configuration
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
  // QR Code Reader Integration Settings
  qrReaderEnabled: boolean("qr_reader_enabled").default(false),
  qrReaderDevice: text("qr_reader_device").default("auto"), // auto, hid, serial, usb
  qrCodeFormat: text("qr_code_format").default("visigate"), // visigate, uuid, custom
  qrReaderSettings: text("qr_reader_settings").default("{}"), // JSON string for device-specific settings
  
  // Suprema CLUe Cloud Platform Integration
  clueEnabled: boolean("clue_enabled").default(false),
  clueApiUrl: text("clue_api_url").default("https://api.suprema-clue.com"), // CLUe API endpoint
  clueApiKey: text("clue_api_key").default(""), // CLUe API key for authentication
  clueApiSecret: text("clue_api_secret").default(""), // CLUe API secret
  clueOrganizationId: text("clue_organization_id").default(""), // Organization ID in CLUe
  clueWebhookSecret: text("clue_webhook_secret").default(""), // Secret for webhook verification
  clueDynamicQrEnabled: boolean("clue_dynamic_qr_enabled").default(true), // Enable dynamic QR codes
  clueQrValidityMinutes: text("clue_qr_validity_minutes").default("60"), // QR code validity period
  clueDeviceGroups: text("clue_device_groups").array().default([]), // X-Station 2 device group IDs
  clueSyncInterval: text("clue_sync_interval").default("300"), // Sync every 5 minutes (300 seconds)
  clueAutoRegisterVisitors: boolean("clue_auto_register_visitors").default(true), // Auto-register visitors in CLUe
  clueAutoDeleteExpired: boolean("clue_auto_delete_expired").default(true), // Auto-delete expired QR codes
  clueTestMode: boolean("clue_test_mode").default(false), // Test mode for development
  clueLastSync: timestamp("clue_last_sync"), // Last successful sync timestamp
  
  // E-Pass Configuration Settings
  ePassEnabled: boolean("e_pass_enabled").default(false),
  ePassDeliveryMethod: text("e_pass_delivery_method").default("both"), // email, sms, both, choice
  ePassEmailTemplate: text("e_pass_email_template").default("default"), // default, custom
  ePassSmsTemplate: text("e_pass_sms_template").default("default"), // default, custom
  ePassAutoCheckout: boolean("e_pass_auto_checkout").default(true),
  ePassCheckoutReminderMinutes: text("e_pass_checkout_reminder_minutes").default("30"), // Minutes before expected departure
  ePassHostNotificationEnabled: boolean("e_pass_host_notification_enabled").default(true),
  ePassHostNotificationDelay: text("e_pass_host_notification_delay").default("60"), // Minutes after expected departure
  
  // Twilio SMS Configuration
  twilioEnabled: boolean("twilio_enabled").default(false),
  twilioAccountSid: text("twilio_account_sid").default(""),
  twilioAuthToken: text("twilio_auth_token").default(""),
  twilioPhoneNumber: text("twilio_phone_number").default(""),
  twilioMessagingServiceSid: text("twilio_messaging_service_sid").default(""),
  
  // Geofencing Configuration
  geofencingEnabled: boolean("geofencing_enabled").default(false),
  geofenceRadius: text("geofence_radius").default("100"), // meters
  geofenceLat: text("geofence_lat").default(""),
  geofenceLng: text("geofence_lng").default(""),
  
  // BioStar X-Station 2 Integration
  xStationEnabled: boolean("x_station_enabled").default(false),
  xStationDevices: text("x_station_devices").array().default([]), // Array of X-Station device IDs/IPs
  xStationCheckoutMode: text("x_station_checkout_mode").default("qr"), // qr, face, both
  xStationApiEndpoint: text("x_station_api_endpoint").default(""),
  
  // Health & Safety Rules
  hsRulesEnabled: boolean("hs_rules_enabled").default(true),
  hsRulesContent: text("hs_rules_content").default(""),
  hsRulesUrl: text("hs_rules_url").default(""), // External URL for H&S rules if not using internal content
  hsRulesRequireAcceptance: boolean("hs_rules_require_acceptance").default(false),
  
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Printer Configurations table for advanced printer properties
export const printerConfigurations = pgTable("printer_configurations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  printerName: text("printer_name").notNull(),
  printerType: text("printer_type").default("standard"), // standard, thermal, id_card, label
  // Paper and Media Settings
  paperSize: text("paper_size").default("A4"), // A4, A5, Letter, Legal, Custom, CR80, CR79
  orientation: text("orientation").default("portrait"), // portrait, landscape
  duplex: text("duplex").default("none"), // none, short_edge, long_edge
  paperSource: text("paper_source").default("auto"), // auto, tray1, tray2, manual, envelope
  // Quality Settings
  printQuality: text("print_quality").default("normal"), // draft, normal, high, photo
  colorMode: text("color_mode").default("color"), // color, grayscale, monochrome
  resolution: text("resolution").default("600dpi"), // 300dpi, 600dpi, 1200dpi, 2400dpi
  // Barcode and QR Code Settings
  barcodeFormat: text("barcode_format").default("QR_CODE"), // QR_CODE, DATA_MATRIX, PDF417, CODE128
  barcodeSize: text("barcode_size").default("medium"), // small, medium, large, xlarge
  barcodePosition: text("barcode_position").default("bottom_right"), // top_left, top_right, bottom_left, bottom_right, center
  // Thermal Printer Specific Settings
  thermalSpeed: text("thermal_speed").default("medium"), // slow, medium, fast
  thermalDensity: text("thermal_density").default("normal"), // light, normal, dark
  labelWidth: text("label_width").default("4"), // inches: 2, 3, 4, 6
  labelHeight: text("label_height").default("6"), // inches: 2, 3, 4, 6, 8
  // ID Card Printer Specific Settings
  cardType: text("card_type").default("pvc"), // pvc, pet, teslin, composite
  cardThickness: text("card_thickness").default("30mil"), // 10mil, 20mil, 30mil, 40mil
  printSides: text("print_sides").default("single"), // single, dual
  encodingOptions: text("encoding_options").array().default([]), // magnetic, smart_card, proximity, mifare
  // Advanced Settings
  margins: text("margins").default('{"top": 0, "right": 0, "bottom": 0, "left": 0}'), // JSON string for custom margins
  customSettings: text("custom_settings").default("{}"), // JSON string for printer-specific settings
  // Status and Configuration
  isDefault: boolean("is_default").default(false),
  isActive: boolean("is_active").default(true),
  lastUsed: timestamp("last_used"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
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

export const insertPrinterConfigurationSchema = createInsertSchema(printerConfigurations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastUsed: true,
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

export const insertEvacuationAccountabilitySchema = createInsertSchema(evacuationAccountability).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertUserInvitation = z.infer<typeof insertUserInvitationSchema>;
export type InsertEvacuationAccountability = z.infer<typeof insertEvacuationAccountabilitySchema>;
export type User = typeof users.$inferSelect;
export type SelectEvacuationAccountability = typeof evacuationAccountability.$inferSelect;
export type UserInvitation = typeof userInvitations.$inferSelect;
export type CompanySettings = typeof companySettings.$inferSelect;
export type InsertCompanySettings = z.infer<typeof insertCompanySettingsSchema>;
export type PrinterConfiguration = typeof printerConfigurations.$inferSelect;
export type InsertPrinterConfiguration = z.infer<typeof insertPrinterConfigurationSchema>;
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
  // H&S Rules acceptance tracking (same as visitors)
  hsRulesAccepted: boolean("hs_rules_accepted").default(false).notNull(),
  hsRulesAcceptedAt: timestamp("hs_rules_accepted_at"),
  hsRulesAcceptanceToken: text("hs_rules_acceptance_token"), // Token for verification
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


// AI Generated Images table for storing generated H&S safety images
export const aiGeneratedImages = pgTable("ai_generated_images", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slideType: text("slide_type").notNull(), // ppe, emergency, hazard, site_rules, legal_framework
  title: text("title").notNull(),
  description: text("description").notNull(),
  imageUrl: text("image_url").notNull(),
  dallePrompt: text("dalle_prompt").notNull(), // The prompt used to generate the image
  dalleRevision: text("dalle_revision").default("dall-e-3"), // DALL-E model version used
  imageSize: text("image_size").default("1024x1024"), // Generated image dimensions
  quality: text("quality").default("standard"), // standard or hd
  style: text("style").default("vivid"), // vivid or natural
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAiGeneratedImageSchema = createInsertSchema(aiGeneratedImages).omit({
  id: true,
  generatedAt: true,
  createdAt: true,
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
export type AiGeneratedImage = typeof aiGeneratedImages.$inferSelect;
export type InsertAiGeneratedImage = z.infer<typeof insertAiGeneratedImageSchema>;
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
  purpose: text("purpose").default("Work"),
  checkedInAt: timestamp("checked_in_at").defaultNow().notNull(),
  checkedOutAt: timestamp("checked_out_at"),
  duration: text("duration"), // calculated field
  hostStaffId: varchar("host_staff_id").references(() => staff.id),
  hostName: text("host_name"),
  hsRulesAccepted: boolean("hs_rules_accepted").default(false),
  hsRulesAcceptedAt: timestamp("hs_rules_accepted_at"),
  inductionCompleted: boolean("induction_completed").default(false),
  inductionCompletedAt: timestamp("induction_completed_at"),
  ePassSent: boolean("e_pass_sent").default(false),
  ePassSentAt: timestamp("e_pass_sent_at"),
  checkoutType: text("checkout_type"), // manual, auto, overnight
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

// Multi-Tenant Types and Schemas
export const insertTenantCompanySchema = createInsertSchema(tenantCompanies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBuildingSettingsSchema = createInsertSchema(buildingSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type TenantCompany = typeof tenantCompanies.$inferSelect;
export type InsertTenantCompany = z.infer<typeof insertTenantCompanySchema>;
export type BuildingSettings = typeof buildingSettings.$inferSelect;
export type InsertBuildingSettings = z.infer<typeof insertBuildingSettingsSchema>;

// Meeting Room Management System
export const meetingRooms = pgTable("meeting_rooms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  location: text("location").notNull(), // Floor, Wing, etc.
  capacity: integer("capacity").notNull(),
  
  // Multi-tenant support
  tenantCompanyId: varchar("tenant_company_id").references(() => tenantCompanies.id),
  isSharedRoom: boolean("is_shared_room").default(false).notNull(), // Available to all tenants
  
  // Equipment and amenities
  hasProjector: boolean("has_projector").default(false).notNull(),
  hasVideoConference: boolean("has_video_conference").default(false).notNull(),
  hasWhiteboard: boolean("has_whiteboard").default(false).notNull(),
  hasTV: boolean("has_tv").default(false).notNull(),
  hasAirCon: boolean("has_air_con").default(false).notNull(),
  hasCatering: boolean("has_catering").default(false).notNull(),
  
  // Availability
  isActive: boolean("is_active").default(true).notNull(),
  availableFrom: text("available_from").default("09:00").notNull(), // HH:MM format
  availableTo: text("available_to").default("18:00").notNull(), // HH:MM format
  
  // Booking rules
  maxBookingHours: integer("max_booking_hours").default(8).notNull(),
  advanceBookingDays: integer("advance_booking_days").default(30).notNull(),
  requiresApproval: boolean("requires_approval").default(false).notNull(),
  
  // Costs (optional for billing)
  hourlyRate: text("hourly_rate"), // Store as string to handle decimal places
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const roomBookings = pgTable("room_bookings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id").notNull().references(() => meetingRooms.id),
  
  // Booking details
  title: text("title").notNull(),
  description: text("description"),
  startDateTime: timestamp("start_date_time").notNull(),
  endDateTime: timestamp("end_date_time").notNull(),
  
  // Who booked it
  bookedByStaffId: varchar("booked_by_staff_id").notNull().references(() => staff.id),
  tenantCompanyId: varchar("tenant_company_id").references(() => tenantCompanies.id),
  
  // Attendees
  expectedAttendees: integer("expected_attendees").notNull(),
  attendeeEmails: text("attendee_emails").array().default([]),
  
  // Special requirements
  requiresCatering: boolean("requires_catering").default(false).notNull(),
  cateringNotes: text("catering_notes"),
  specialRequirements: text("special_requirements"),
  
  // Booking status and management
  status: text("status").default("confirmed").notNull(), // confirmed, pending, cancelled, completed
  isRecurring: boolean("is_recurring").default(false).notNull(),
  recurringPattern: text("recurring_pattern"), // weekly, daily, monthly
  recurringEndDate: timestamp("recurring_end_date"),
  parentBookingId: varchar("parent_booking_id"), // For recurring meetings
  
  // Check-in/out for room usage tracking
  actualStartTime: timestamp("actual_start_time"),
  actualEndTime: timestamp("actual_end_time"),
  checkedInByStaffId: varchar("checked_in_by_staff_id").references(() => staff.id),
  
  // Notifications
  reminderSent: boolean("reminder_sent").default(false).notNull(),
  confirmationSent: boolean("confirmation_sent").default(false).notNull(),
  
  // Admin approval workflow
  approvedBy: varchar("approved_by").references(() => staff.id),
  approvedAt: timestamp("approved_at"),
  rejectedReason: text("rejected_reason"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const roomBookingAttendees = pgTable("room_booking_attendees", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").notNull().references(() => roomBookings.id),
  staffId: varchar("staff_id").references(() => staff.id), // If attendee is staff
  email: text("email").notNull(), // For external attendees
  name: text("name").notNull(),
  isOrganizer: boolean("is_organizer").default(false).notNull(),
  responseStatus: text("response_status").default("pending").notNull(), // pending, accepted, declined
  responseAt: timestamp("response_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const roomBookingWaitlist = pgTable("room_booking_waitlist", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id").notNull().references(() => meetingRooms.id),
  staffId: varchar("staff_id").notNull().references(() => staff.id),
  
  // Desired booking details
  title: text("title").notNull(),
  startDateTime: timestamp("start_date_time").notNull(),
  endDateTime: timestamp("end_date_time").notNull(),
  expectedAttendees: integer("expected_attendees").notNull(),
  
  // Waitlist status
  isActive: boolean("is_active").default(true).notNull(),
  notifiedAt: timestamp("notified_at"), // When user was notified of availability
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Insert schemas for meeting rooms
export const insertMeetingRoomSchema = createInsertSchema(meetingRooms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRoomBookingSchema = createInsertSchema(roomBookings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  // Make datetime fields required and properly typed
  startDateTime: z.string().transform(str => new Date(str)),
  endDateTime: z.string().transform(str => new Date(str)),
});

export const insertRoomBookingAttendeeSchema = createInsertSchema(roomBookingAttendees).omit({
  id: true,
  createdAt: true,
});

export const insertRoomBookingWaitlistSchema = createInsertSchema(roomBookingWaitlist).omit({
  id: true,
  createdAt: true,
});

// Types for meeting rooms
export type MeetingRoom = typeof meetingRooms.$inferSelect;
export type InsertMeetingRoom = z.infer<typeof insertMeetingRoomSchema>;
export type RoomBooking = typeof roomBookings.$inferSelect;
export type InsertRoomBooking = z.infer<typeof insertRoomBookingSchema>;
export type RoomBookingAttendee = typeof roomBookingAttendees.$inferSelect;
export type InsertRoomBookingAttendee = z.infer<typeof insertRoomBookingAttendeeSchema>;
export type RoomBookingWaitlist = typeof roomBookingWaitlist.$inferSelect;
export type InsertRoomBookingWaitlist = z.infer<typeof insertRoomBookingWaitlistSchema>;

// ===========================
// WINDOWS SERVICE PRINT QUEUE
// ===========================

// Service instances registered for each customer location
export const printServiceInstances = pgTable("print_service_instances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  
  // Service identification
  serviceName: text("service_name").notNull(), // User-friendly name like "Reception Desk"
  machineId: text("machine_id").notNull(), // Windows machine identifier
  apiToken: text("api_token").notNull().unique(), // Authentication token for this service
  
  // Service configuration
  location: text("location"), // Physical location description
  supportedPrinters: text("supported_printers").array(), // ['tec', 'zebra']
  pollIntervalSeconds: integer("poll_interval_seconds").default(30).notNull(),
  
  // Status tracking
  isActive: boolean("is_active").default(true).notNull(),
  lastHeartbeat: timestamp("last_heartbeat"),
  serviceVersion: text("service_version"),
  
  // Connection info
  ipAddress: text("ip_address"),
  computerName: text("computer_name"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Print job queue for Windows services to poll
export const printQueue = pgTable("print_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  serviceInstanceId: varchar("service_instance_id").references(() => printServiceInstances.id),
  
  // Job details
  jobType: text("job_type").notNull(), // 'visitor_pass', 'contractor_pass', 'muster_list', 'test_print'
  printerType: text("printer_type").notNull(), // 'tec', 'zebra'
  priority: integer("priority").default(1).notNull(), // 1=normal, 2=high, 3=urgent
  
  // Pass data (JSON)
  visitorData: text("visitor_data"), // JSON string of visitor/contractor data
  passElements: text("pass_elements"), // JSON string of design elements
  printerSettings: text("printer_settings"), // JSON string of printer configuration
  
  // Job status
  status: text("status").default("pending").notNull(), // pending, processing, completed, failed, cancelled
  assignedAt: timestamp("assigned_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  
  // Error handling
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0).notNull(),
  maxRetries: integer("max_retries").default(3).notNull(),
  
  // Audit trail
  createdBy: varchar("created_by"), // User who initiated the print
  requestSource: text("request_source").default("web_app").notNull(), // 'web_app', 'api', 'kiosk'
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Print job history for audit and monitoring
export const printJobHistory = pgTable("print_job_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  printQueueId: varchar("print_queue_id").notNull().references(() => printQueue.id),
  serviceInstanceId: varchar("service_instance_id").references(() => printServiceInstances.id),
  
  // Performance metrics
  queueTimeMs: integer("queue_time_ms"), // Time from creation to assignment
  processingTimeMs: integer("processing_time_ms"), // Time from start to completion
  totalTimeMs: integer("total_time_ms"), // Total time from creation to completion
  
  // Technical details
  generatedCode: text("generated_code"), // The TPL/ZPL code that was generated
  codeLength: integer("code_length"), // Length of generated code
  printerResponse: text("printer_response"), // Any response from printer
  
  // Results
  wasSuccessful: boolean("was_successful").default(false).notNull(),
  finalStatus: text("final_status").notNull(), // completed, failed, cancelled
  errorDetails: text("error_details"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Insert schemas for print queue
export const insertPrintServiceInstanceSchema = createInsertSchema(printServiceInstances).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPrintQueueSchema = createInsertSchema(printQueue).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPrintJobHistorySchema = createInsertSchema(printJobHistory).omit({
  id: true,
  createdAt: true,
});

// Types for print queue
export type PrintServiceInstance = typeof printServiceInstances.$inferSelect;
export type InsertPrintServiceInstance = z.infer<typeof insertPrintServiceInstanceSchema>;
export type PrintQueue = typeof printQueue.$inferSelect;
export type InsertPrintQueue = z.infer<typeof insertPrintQueueSchema>;
export type PrintJobHistory = typeof printJobHistory.$inferSelect;
export type InsertPrintJobHistory = z.infer<typeof insertPrintJobHistorySchema>;
