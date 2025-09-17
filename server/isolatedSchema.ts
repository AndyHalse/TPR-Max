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
  
  // Feature Toggles - Allow customers to disable unused features for simplified UI
  featureMultiTenant: boolean("feature_multi_tenant").default(true),
  featureMeetingRooms: boolean("feature_meeting_rooms").default(true),
  featureTimeAttendance: boolean("feature_time_attendance").default(true),
  featureInductionSettings: boolean("feature_induction_settings").default(true),
  featureKiosk: boolean("feature_kiosk").default(true),
  featureAiDemo: boolean("feature_ai_demo").default(true),
  
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

// CONTRACTOR MANAGEMENT SYSTEM
// Core contractor tables

// Contractor Companies
export const contractorCompanies = pgTable("contractor_companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyName: text("company_name").notNull().unique(),
  companyNumber: text("company_number"),
  vatNumber: text("vat_number"),
  registrationNumber: text("registration_number"),
  contactEmail: text("contact_email").notNull(),
  contactPhone: text("contact_phone"),
  address: text("address"),
  postcode: text("postcode"),
  website: text("website"),
  primaryContactName: text("primary_contact_name"),
  primaryContactEmail: text("primary_contact_email"),
  primaryContactPhone: text("primary_contact_phone"),
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: text("emergency_contact_phone"),
  // Insurance details
  publicLiabilityInsurer: text("public_liability_insurer"),
  publicLiabilityAmount: text("public_liability_amount"),
  publicLiabilityExpiryDate: timestamp("public_liability_expiry_date"),
  publicLiabilityPolicyNumber: text("public_liability_policy_number"),
  employersLiabilityInsurer: text("employers_liability_insurer"),
  employersLiabilityAmount: text("employers_liability_amount"),
  employersLiabilityExpiryDate: timestamp("employers_liability_expiry_date"),
  employersLiabilityPolicyNumber: text("employers_liability_policy_number"),
  professionalIndemnityInsurer: text("professional_indemnity_insurer"),
  professionalIndemnityAmount: text("professional_indemnity_amount"),
  professionalIndemnityExpiryDate: timestamp("professional_indemnity_expiry_date"),
  professionalIndemnityPolicyNumber: text("professional_indemnity_policy_number"),
  // Status and approval
  status: text("status").notNull().default("pending"), // pending, approved, suspended, rejected
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  suspendedReason: text("suspended_reason"),
  // Health & Safety
  hasHealthSafetyPolicy: boolean("has_health_safety_policy").default(false),
  healthSafetyPolicyUrl: text("health_safety_policy_url"),
  healthSafetyPolicyExpiryDate: timestamp("health_safety_policy_expiry_date"),
  // CHAS/SafeContractor certifications
  chasCertified: boolean("chas_certified").default(false),
  chasCertificateNumber: text("chas_certificate_number"),
  chasExpiryDate: timestamp("chas_expiry_date"),
  safeContractorCertified: boolean("safe_contractor_certified").default(false),
  safeContractorNumber: text("safe_contractor_number"),
  safeContractorExpiryDate: timestamp("safe_contractor_expiry_date"),
  // Risk assessment
  riskRating: text("risk_rating").default("medium"), // low, medium, high
  riskNotes: text("risk_notes"),
  lastAuditDate: timestamp("last_audit_date"),
  nextAuditDue: timestamp("next_audit_due"),
  auditFrequencyMonths: integer("audit_frequency_months").default(12),
  // AI and automation
  aiComplianceScore: integer("ai_compliance_score").default(0), // 0-100 AI-calculated compliance score
  lastAiReview: timestamp("last_ai_review"),
  autoComplianceChecks: boolean("auto_compliance_checks").default(true),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Contractor Workers
export const contractorWorkers = pgTable("contractor_workers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => contractorCompanies.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phoneNumber: text("phone_number"),
  mobileNumber: text("mobile_number"),
  homeAddress: text("home_address"),
  postcode: text("postcode"),
  dateOfBirth: timestamp("date_of_birth"),
  nationalInsuranceNumber: text("national_insurance_number"),
  // Worker photo and identification
  photoUrl: text("photo_url"),
  // Job and skills information
  jobTitle: text("job_title"),
  department: text("department"),
  skillsAndCertifications: text("skills_and_certifications").array().default([]),
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: text("emergency_contact_phone"),
  emergencyContactRelationship: text("emergency_contact_relationship"),
  // Check-in/out tracking
  isCheckedIn: boolean("is_checked_in").default(false).notNull(),
  checkedInAt: timestamp("checked_in_at"),
  checkedOutAt: timestamp("checked_out_at"),
  checkoutType: text("checkout_type"), // user, manual-reset, auto-reset
  lastVisitDate: timestamp("last_visit_date"),
  visitCount: integer("visit_count").default(0),
  // Emergency muster tracking
  isAccountedFor: boolean("is_accounted_for").default(false).notNull(),
  // Right to work verification
  rightToWorkStatus: text("right_to_work_status").default("pending"), // pending, verified, expired, invalid
  rightToWorkDocumentType: text("right_to_work_document_type"), // passport, driving_licence, birth_certificate_ni, etc.
  rightToWorkDocumentNumber: text("right_to_work_document_number"),
  rightToWorkExpiryDate: timestamp("right_to_work_expiry_date"),
  rightToWorkVerifiedBy: varchar("right_to_work_verified_by").references(() => users.id),
  rightToWorkVerifiedAt: timestamp("right_to_work_verified_at"),
  rightToWorkDocumentUrl: text("right_to_work_document_url"),
  // Working pattern and rates
  workingPattern: text("working_pattern").default("full_time"), // full_time, part_time, contract, temporary
  hourlyRate: text("hourly_rate"),
  startDate: timestamp("start_date"),
  expectedEndDate: timestamp("expected_end_date"),
  // Medical and fitness
  hasOccupationalHealthClearance: boolean("has_occupational_health_clearance").default(false),
  occupationalHealthExpiryDate: timestamp("occupational_health_expiry_date"),
  medicalRestrictions: text("medical_restrictions"),
  // Induction and training status
  siteInductionRequired: boolean("site_induction_required").default(true),
  siteInductionCompleted: boolean("site_induction_completed").default(false),
  siteInductionCompletedAt: timestamp("site_induction_completed_at"),
  siteInductionExpiryDate: timestamp("site_induction_expiry_date"),
  toolboxTalkCompleted: boolean("toolbox_talk_completed").default(false),
  toolboxTalkCompletedAt: timestamp("toolbox_talk_completed_at"),
  // Competency and qualifications tracking
  hasCSCS: boolean("has_cscs").default(false),
  cscsCardNumber: text("cscs_card_number"),
  cscsExpiryDate: timestamp("cscs_expiry_date"),
  cscsCardType: text("cscs_card_type"), // Green, Blue, Gold, etc.
  // Status and approval
  workerStatus: text("worker_status").notNull().default("pending"), // pending, approved, suspended, rejected, banned
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  suspendedReason: text("suspended_reason"),
  bannedUntil: timestamp("banned_until"),
  // AI risk assessment
  aiRiskScore: integer("ai_risk_score").default(0), // 0-100 AI-calculated risk score
  riskFactors: text("risk_factors").array().default([]), // Array of identified risk factors
  lastRiskAssessment: timestamp("last_risk_assessment"),
  // Document compliance status
  documentsComplete: boolean("documents_complete").default(false),
  documentsLastChecked: timestamp("documents_last_checked"),
  complianceScore: integer("compliance_score").default(0), // 0-100 compliance score
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Contractor Documents - Stores uploaded documents for contractors
export const contractorDocuments = pgTable("contractor_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").references(() => contractorCompanies.id),
  workerId: varchar("worker_id").references(() => contractorWorkers.id),
  documentName: text("document_name").notNull(),
  documentType: text("document_type").notNull(), // public_liability, employers_liability, health_safety_policy, right_to_work, etc.
  documentUrl: text("document_url").notNull(),
  expiryDate: timestamp("expiry_date"),
  uploadedBy: varchar("uploaded_by").notNull().references(() => users.id),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  status: text("status").default("pending").notNull(), // pending, approved, rejected, expired
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  rejectedReason: text("rejected_reason"),
  aiAnalysisResult: text("ai_analysis_result"), // JSON string of AI document analysis
  aiConfidenceScore: integer("ai_confidence_score").default(0), // 0-100 AI confidence in document validity
  issuedBy: text("issued_by"), // Insurance company, certification body, etc.
  policyNumber: text("policy_number"),
  coverageAmount: text("coverage_amount"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Compliance Documents - Pre-defined required documents
export const complianceDocuments = pgTable("compliance_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentName: text("document_name").notNull(),
  documentType: text("document_type").notNull(), // insurance, certification, training, health_safety
  isRequired: boolean("is_required").default(true),
  appliesToCompany: boolean("applies_to_company").default(false),
  appliesToWorker: boolean("applies_to_worker").default(false),
  description: text("description"),
  validityPeriodMonths: integer("validity_period_months").default(12),
  reminderDaysBefore: integer("reminder_days_before").default(30),
  documentCategory: text("document_category").notNull(), // legal, safety, training, identification
  priority: text("priority").default("medium"), // low, medium, high, critical
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Document Approvals - Track approval workflow
export const documentApprovals = pgTable("document_approvals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => contractorDocuments.id),
  reviewedBy: varchar("reviewed_by").notNull().references(() => users.id),
  reviewedAt: timestamp("reviewed_at").defaultNow().notNull(),
  status: text("status").notNull(), // approved, rejected, requires_changes
  comments: text("comments"),
  changesRequired: text("changes_required").array().default([]),
  followUpRequired: boolean("follow_up_required").default(false),
  followUpDate: timestamp("follow_up_date"),
  approvalLevel: text("approval_level").default("standard"), // standard, senior, director
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Document Types - Categories of documents required
export const documentTypes = pgTable("document_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  typeName: text("type_name").notNull().unique(),
  description: text("description"),
  category: text("category").notNull(), // insurance, certification, identification, training
  isCompanyLevel: boolean("is_company_level").default(false), // true for company docs, false for worker docs
  isRequired: boolean("is_required").default(true),
  hasExpiryDate: boolean("has_expiry_date").default(true),
  defaultValidityMonths: integer("default_validity_months").default(12),
  autoReminderEnabled: boolean("auto_reminder_enabled").default(true),
  reminderDaysBefore: integer("reminder_days_before").default(30),
  allowedFileTypes: text("allowed_file_types").array().default(["pdf", "jpg", "png"]),
  maxFileSizeMB: integer("max_file_size_mb").default(10),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Worker Competencies - Skills and qualifications tracking
export const workerCompetencies = pgTable("worker_competencies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workerId: varchar("worker_id").notNull().references(() => contractorWorkers.id),
  competencyType: text("competency_type").notNull(), // skill, qualification, certification
  competencyName: text("competency_name").notNull(),
  level: text("level"), // basic, intermediate, advanced, expert
  issuingBody: text("issuing_body"),
  certificationNumber: text("certification_number"),
  issueDate: timestamp("issue_date"),
  expiryDate: timestamp("expiry_date"),
  documentUrl: text("document_url"),
  verifiedBy: varchar("verified_by").references(() => users.id),
  verifiedAt: timestamp("verified_at"),
  status: text("status").default("active"), // active, expired, suspended, revoked
  continuousAssessmentRequired: boolean("continuous_assessment_required").default(false),
  lastAssessmentDate: timestamp("last_assessment_date"),
  nextAssessmentDue: timestamp("next_assessment_due"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// NVQ Qualifications - Specific table for NVQ tracking
export const nvqQualifications = pgTable("nvq_qualifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workerId: varchar("worker_id").notNull().references(() => contractorWorkers.id),
  nvqLevel: text("nvq_level").notNull(), // Level 1, Level 2, Level 3, etc.
  subjectArea: text("subject_area").notNull(), // Construction, Engineering, etc.
  qualificationTitle: text("qualification_title").notNull(),
  awardingBody: text("awarding_body").notNull(), // CITB, CPCS, etc.
  qualificationNumber: text("qualification_number"),
  startDate: timestamp("start_date"),
  completionDate: timestamp("completion_date"),
  expiryDate: timestamp("expiry_date"),
  status: text("status").default("active"), // active, in_progress, completed, expired, withdrawn
  portfolioUrl: text("portfolio_url"), // Link to portfolio documentation
  assessorName: text("assessor_name"),
  assessorContactDetails: text("assessor_contact_details"),
  certificateUrl: text("certificate_url"),
  verifiedBy: varchar("verified_by").references(() => users.id),
  verifiedAt: timestamp("verified_at"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

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

// CO2 Emissions Tracking - Worker level emissions data
export const co2EmissionsData = pgTable("co2_emissions_data", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workerId: varchar("worker_id").notNull().references(() => contractorWorkers.id),
  companyId: varchar("company_id").notNull().references(() => contractorCompanies.id),
  // Distance data
  workerPostcode: text("worker_postcode").notNull(),
  companyAddress: text("company_address").notNull(),
  distanceMiles: doublePrecision("distance_miles").notNull(), // One-way distance in miles  
  distanceKm: doublePrecision("distance_km").notNull(), // One-way distance in kilometers
  routeType: text("route_type").default("mixed"), // motorway, a-roads, mixed
  estimatedTravelTime: text("estimated_travel_time"), // e.g. "45 minutes"
  // Transport and emissions
  transportMethod: text("transport_method").notNull().default("car_diesel"), // car_petrol, car_diesel, electric, public_transport, motorcycle
  emissionFactor: text("emission_factor").notNull(), // kg CO2 per mile as decimal
  dailyCO2kg: text("daily_co2_kg").notNull(), // Daily round trip CO2 as decimal
  monthlyCO2kg: text("monthly_co2_kg").notNull(), // Monthly projection as decimal
  annualCO2kg: text("annual_co2_kg").notNull(), // Annual projection as decimal
  // Calculation metadata
  calculatedAt: timestamp("calculated_at").defaultNow().notNull(),
  calculatedBy: text("calculated_by").default("openai"), // openai, fallback, manual
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  // Working pattern (affects monthly calculations)
  workingDaysPerMonth: integer("working_days_per_month").default(22).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// CO2 Monthly Summaries - Aggregated data for reporting
export const co2MonthlySummaries = pgTable("co2_monthly_summaries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").references(() => contractorCompanies.id), // Null for overall summary
  // Time period
  year: integer("year").notNull(),
  month: integer("month").notNull(), // 1-12
  // Aggregated data
  totalWorkers: integer("total_workers").notNull(),
  totalMonthlyCO2kg: text("total_monthly_co2_kg").notNull(), // Total emissions as decimal
  averageCO2PerWorker: text("average_co2_per_worker").notNull(), // Average per worker as decimal
  // Transport method breakdown
  transportBreakdown: text("transport_breakdown"), // JSON: {"car_diesel": 15, "electric": 3, "public_transport": 2}
  // Distance analysis
  averageDistanceMiles: doublePrecision("average_distance_miles"),
  longestCommuteMiles: doublePrecision("longest_commute_miles"),
  shortestCommuteMiles: doublePrecision("shortest_commute_miles"),
  // Comparison metrics
  previousMonthCO2kg: text("previous_month_co2_kg"), // For % change calculation
  percentageChange: text("percentage_change"), // +/- percentage from previous month
  // Sustainability metrics
  carbonReductionTarget: text("carbon_reduction_target"), // Monthly target as decimal
  targetAchieved: boolean("target_achieved").default(false),
  sustainabilityScore: integer("sustainability_score").default(0), // 0-100 score
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// CO2 Sustainability Reports - AI-generated reports
export const co2SustainabilityReports = pgTable("co2_sustainability_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").references(() => contractorCompanies.id), // Null for overall report
  // Report metadata
  reportType: text("report_type").notNull().default("monthly"), // monthly, quarterly, annual, ad-hoc
  reportPeriod: text("report_period").notNull(), // e.g. "2024-09", "2024-Q3", "2024"
  reportTitle: text("report_title").notNull(),
  // Report content (AI generated)
  executiveSummary: text("executive_summary").notNull(),
  currentEmissionsStatus: text("current_emissions_status").notNull(),
  environmentalImpactAnalysis: text("environmental_impact_analysis").notNull(),
  reductionRecommendations: text("reduction_recommendations").notNull(),
  industryComparison: text("industry_comparison").notNull(),
  actionPlan: text("action_plan").notNull(),
  fullReportContent: text("full_report_content").notNull(), // Complete formatted report
  // Report statistics
  totalWorkersCovered: integer("total_workers_covered").notNull(),
  totalCO2Analyzed: text("total_co2_analyzed").notNull(), // Total CO2 in kg as decimal
  topRecommendation: text("top_recommendation"),
  potentialSavings: text("potential_savings"), // Potential CO2 savings in kg as decimal
  // Generation metadata
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  generatedBy: text("generated_by").default("openai"), // openai, manual
  aiModel: text("ai_model").default("gpt-4"),
  generationTimeMs: integer("generation_time_ms"),
  isPublished: boolean("is_published").default(false),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
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

// UK H&S Document System - Template based document management
export const ukHSDocumentTemplates = pgTable("uk_hs_document_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateName: text("template_name").notNull(),
  documentType: text("document_type").notNull(), // "right_to_work", "health_safety_training", "competency_certificate", etc.
  description: text("description"),
  isRequired: boolean("is_required").default(true),
  category: text("category").notNull(), // "legal_compliance", "safety_training", "competency", "identification"
  validityPeriodMonths: integer("validity_period_months").default(12),
  reminderDaysBefore: integer("reminder_days_before").default(30),
  allowedFileTypes: text("allowed_file_types").array().default(["pdf", "jpg", "png"]),
  maxFileSizeMB: integer("max_file_size_mb").default(10),
  autoFillEnabled: boolean("auto_fill_enabled").default(false),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Worker Document Assignments - Which documents each worker must provide
export const workerDocumentAssignments = pgTable("worker_document_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workerId: varchar("worker_id").notNull().references(() => contractorWorkers.id),
  templateId: varchar("template_id").notNull().references(() => ukHSDocumentTemplates.id),
  assignedBy: varchar("assigned_by").notNull().references(() => users.id),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  dueDate: timestamp("due_date").notNull(),
  status: text("status").default("pending"), // pending, submitted, approved, rejected, expired
  priority: text("priority").default("normal"), // low, normal, high, urgent
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Worker Document Acceptances - Track document submission and approval
export const workerDocumentAcceptances = pgTable("worker_document_acceptances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assignmentId: varchar("assignment_id").notNull().references(() => workerDocumentAssignments.id),
  workerId: varchar("worker_id").notNull().references(() => contractorWorkers.id),
  templateId: varchar("template_id").notNull().references(() => ukHSDocumentTemplates.id),
  documentUrl: text("document_url").notNull(),
  originalFileName: text("original_file_name").notNull(),
  fileSizeBytes: integer("file_size_bytes").notNull(),
  fileType: text("file_type").notNull(), // pdf, jpg, png, etc.
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  submittedBy: varchar("submitted_by").notNull().references(() => contractorWorkers.id),
  // Review and approval
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  status: text("status").default("pending"), // pending, approved, rejected, expired
  approvalComments: text("approval_comments"),
  rejectionReason: text("rejection_reason"),
  expiryDate: timestamp("expiry_date"),
  // Auto-fill and AI processing
  autoFillData: text("auto_fill_data"), // JSON string of extracted data
  aiAnalysisResult: text("ai_analysis_result"), // JSON string of AI document analysis
  aiConfidenceScore: integer("ai_confidence_score").default(0), // 0-100 AI confidence
  // Document metadata
  extractedText: text("extracted_text"), // OCR extracted text for search
  documentHash: text("document_hash"), // File hash for duplicate detection
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Document Auto-fill Mapping - Configure which fields to extract from documents
export const documentAutoFillMapping = pgTable("document_auto_fill_mapping", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull().references(() => ukHSDocumentTemplates.id),
  fieldName: text("field_name").notNull(), // "passport_number", "driving_licence_number", "expiry_date", etc.
  fieldType: text("field_type").notNull(), // "text", "date", "number", "email"
  extractionPattern: text("extraction_pattern"), // Regex pattern for extraction
  ocrRegion: text("ocr_region"), // JSON: {"x": 100, "y": 200, "width": 300, "height": 50}
  isRequired: boolean("is_required").default(false),
  validationRules: text("validation_rules"), // JSON: validation rules for the field
  targetWorkerField: text("target_worker_field"), // Field in contractorWorkers table to update
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// AI Generated Images - For storing AI-generated images for induction videos
export const aiGeneratedImages = pgTable("ai_generated_images", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  prompt: text("prompt").notNull(),
  imageUrl: text("image_url").notNull(),
  imageType: text("image_type").notNull(), // safety_icon, hazard_warning, equipment_illustration, etc.
  category: text("category").notNull(), // safety, equipment, procedures, environment
  tags: text("tags").array().default([]), // ["construction", "ppe", "hard_hat"]
  aiModel: text("ai_model").default("dall-e-3"), // dall-e-3, midjourney, stable-diffusion
  generationTime: integer("generation_time_ms"), // Time taken to generate in milliseconds
  usageCount: integer("usage_count").default(0), // How many times this image has been used
  isActive: boolean("is_active").default(true),
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

// Contractor insert schemas
export const insertContractorCompanySchema = createInsertSchema(contractorCompanies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertContractorWorkerSchema = createInsertSchema(contractorWorkers).omit({
  id: true,
  checkedInAt: true,
  checkedOutAt: true,
  lastVisitDate: true,
  visitCount: true,
  createdAt: true,
  updatedAt: true,
});

export const insertContractorDocumentSchema = createInsertSchema(contractorDocuments).omit({
  id: true,
  uploadedAt: true,
  createdAt: true,
  updatedAt: true,
});

export const insertComplianceDocumentSchema = createInsertSchema(complianceDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDocumentApprovalSchema = createInsertSchema(documentApprovals).omit({
  id: true,
  reviewedAt: true,
  createdAt: true,
});

export const insertDocumentTypeSchema = createInsertSchema(documentTypes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWorkerCompetencySchema = createInsertSchema(workerCompetencies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertNvqQualificationSchema = createInsertSchema(nvqQualifications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

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

export const insertInductionTokenSchema = createInsertSchema(inductionTokens).omit({
  id: true,
  token: true,
  createdAt: true,
});

export const insertInductionQuestionSchema = createInsertSchema(inductionQuestions).omit({
  id: true,
  createdAt: true,
});

export const insertInductionSettingSchema = createInsertSchema(inductionSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertInductionAnswerSchema = createInsertSchema(inductionAnswers).omit({
  id: true,
  answeredAt: true,
});

export const insertLocalLabourRecordSchema = createInsertSchema(localLabourRecords).omit({
  id: true,
  recordedAt: true,
});

export const insertCo2EmissionsDataSchema = createInsertSchema(co2EmissionsData).omit({
  id: true,
  calculatedAt: true,
  lastUpdated: true,
  createdAt: true,
});

export const insertCo2MonthlySummarySchema = createInsertSchema(co2MonthlySummaries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCo2SustainabilityReportSchema = createInsertSchema(co2SustainabilityReports).omit({
  id: true,
  generatedAt: true,
  createdAt: true,
});

export const insertEnhancedCompanyDetailsSchema = createInsertSchema(enhancedCompanyDetails).omit({
  id: true,
  updatedAt: true,
});

export const insertContractorVisitSchema = createInsertSchema(contractorVisits).omit({
  id: true,
  checkedInAt: true,
  qrCode: true,
  createdAt: true,
});

export const insertContractorPreBookingSchema = createInsertSchema(contractorPreBookings).omit({
  id: true,
  qrCode: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUkHSDocumentTemplateSchema = createInsertSchema(ukHSDocumentTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWorkerDocumentAssignmentSchema = createInsertSchema(workerDocumentAssignments).omit({
  id: true,
  assignedAt: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWorkerDocumentAcceptanceSchema = createInsertSchema(workerDocumentAcceptances).omit({
  id: true,
  submittedAt: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDocumentAutoFillMappingSchema = createInsertSchema(documentAutoFillMapping).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAiGeneratedImageSchema = createInsertSchema(aiGeneratedImages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMeetingRoomSchema = createInsertSchema(meetingRooms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRoomBookingSchema = createInsertSchema(roomBookings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
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
export type InsertMeetingRoom = z.infer<typeof insertMeetingRoomSchema>;
export type RoomBooking = typeof roomBookings.$inferSelect;
export type InsertRoomBooking = z.infer<typeof insertRoomBookingSchema>;

// Contractor types
export type ContractorCompany = typeof contractorCompanies.$inferSelect;
export type InsertContractorCompany = z.infer<typeof insertContractorCompanySchema>;
export type ContractorWorker = typeof contractorWorkers.$inferSelect;
export type InsertContractorWorker = z.infer<typeof insertContractorWorkerSchema>;
export type ContractorDocument = typeof contractorDocuments.$inferSelect;
export type InsertContractorDocument = z.infer<typeof insertContractorDocumentSchema>;
export type ComplianceDocument = typeof complianceDocuments.$inferSelect;
export type InsertComplianceDocument = z.infer<typeof insertComplianceDocumentSchema>;
export type DocumentApproval = typeof documentApprovals.$inferSelect;
export type InsertDocumentApproval = z.infer<typeof insertDocumentApprovalSchema>;
export type DocumentType = typeof documentTypes.$inferSelect;
export type InsertDocumentType = z.infer<typeof insertDocumentTypeSchema>;
export type WorkerCompetency = typeof workerCompetencies.$inferSelect;
export type InsertWorkerCompetency = z.infer<typeof insertWorkerCompetencySchema>;
export type NvqQualification = typeof nvqQualifications.$inferSelect;
export type InsertNvqQualification = z.infer<typeof insertNvqQualificationSchema>;
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
export type InductionToken = typeof inductionTokens.$inferSelect;
export type InsertInductionToken = z.infer<typeof insertInductionTokenSchema>;
export type InductionQuestion = typeof inductionQuestions.$inferSelect;
export type InsertInductionQuestion = z.infer<typeof insertInductionQuestionSchema>;
export type InductionSetting = typeof inductionSettings.$inferSelect;
export type InsertInductionSetting = z.infer<typeof insertInductionSettingSchema>;
export type InductionAnswer = typeof inductionAnswers.$inferSelect;
export type InsertInductionAnswer = z.infer<typeof insertInductionAnswerSchema>;
export type LocalLabourRecord = typeof localLabourRecords.$inferSelect;
export type InsertLocalLabourRecord = z.infer<typeof insertLocalLabourRecordSchema>;
export type Co2EmissionsData = typeof co2EmissionsData.$inferSelect;
export type InsertCo2EmissionsData = z.infer<typeof insertCo2EmissionsDataSchema>;
export type Co2MonthlySummary = typeof co2MonthlySummaries.$inferSelect;
export type InsertCo2MonthlySummary = z.infer<typeof insertCo2MonthlySummarySchema>;
export type Co2SustainabilityReport = typeof co2SustainabilityReports.$inferSelect;
export type InsertCo2SustainabilityReport = z.infer<typeof insertCo2SustainabilityReportSchema>;
export type EnhancedCompanyDetails = typeof enhancedCompanyDetails.$inferSelect;
export type InsertEnhancedCompanyDetails = z.infer<typeof insertEnhancedCompanyDetailsSchema>;
export type ContractorVisit = typeof contractorVisits.$inferSelect;
export type InsertContractorVisit = z.infer<typeof insertContractorVisitSchema>;
export type ContractorPreBooking = typeof contractorPreBookings.$inferSelect;
export type InsertContractorPreBooking = z.infer<typeof insertContractorPreBookingSchema>;
export type UkHSDocumentTemplate = typeof ukHSDocumentTemplates.$inferSelect;
export type InsertUkHSDocumentTemplate = z.infer<typeof insertUkHSDocumentTemplateSchema>;
export type WorkerDocumentAssignment = typeof workerDocumentAssignments.$inferSelect;
export type InsertWorkerDocumentAssignment = z.infer<typeof insertWorkerDocumentAssignmentSchema>;
export type WorkerDocumentAcceptance = typeof workerDocumentAcceptances.$inferSelect;
export type InsertWorkerDocumentAcceptance = z.infer<typeof insertWorkerDocumentAcceptanceSchema>;
export type DocumentAutoFillMapping = typeof documentAutoFillMapping.$inferSelect;
export type InsertDocumentAutoFillMapping = z.infer<typeof insertDocumentAutoFillMappingSchema>;
export type AiGeneratedImage = typeof aiGeneratedImages.$inferSelect;
export type InsertAiGeneratedImage = z.infer<typeof insertAiGeneratedImageSchema>;