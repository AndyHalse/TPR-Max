import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, doublePrecision, uuid, jsonb } from "drizzle-orm/pg-core";
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
  jobTitle: text("job_title"),
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
  zoneId: varchar("zone_id"),
  manualCheckIn: boolean("manual_check_in").default(false), // Track if check-in was manual due to lost card
  // Emergency muster tracking
  isAccountedFor: boolean("is_accounted_for").default(false).notNull(),
  needsEvacuationAssistance: boolean("needs_evacuation_assistance").default(false).notNull(),
  // Fire Marshal emergency access
  isFireMarshal: boolean("is_fire_marshal").default(false).notNull(),
  fireMarshalUrlId: text("fire_marshal_url_id"), // Permanent static URL ID for Fire Marshal emergency access
  emergencyToken: text("emergency_token"), // Secure token for emergency access without login
  emergencyTokenExpires: timestamp("emergency_token_expires"), // Token expiration
  userId: varchar("user_id").references(() => users.id), // Link to user account
  qrCode: text("qr_code").unique(),
  biostarUserId: text("biostar_user_id"),
  paxtonUserId: text("paxton_user_id"),
  phoneNumber: text("phone_number"),
  memberNumber: text("member_number"),
  barcodeNumber: text("barcode_number"),
  // Induction tracking
  inductionCompleted: boolean("induction_completed").default(false).notNull(),
  inductionCompletedAt: timestamp("induction_completed_at"),
  isActive: boolean("is_active").default(true).notNull(),
  // Lone Worker Protection
  isLoneWorker: boolean("is_lone_worker").default(false),
  loneWorkerSince: timestamp("lone_worker_since"),
  loneWorkerDeadline: timestamp("lone_worker_deadline"),
  loneWorkerEscalationLevel: integer("lone_worker_escalation_level").default(0),
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

// Muster Points table for emergency assembly locations
export const musterPoints = pgTable("muster_points", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

// Evacuation Accountability table for tracking people during emergency
export const evacuationAccountability = pgTable("evacuation_accountability", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: text("customer_id").notNull().default(""),
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
  statusOption: text("status_option"), // Selected status option text when using dropdown
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

// Muster Settings table — one row per customer for status dropdown configuration
export const musterSettings = pgTable("muster_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: text("customer_id").notNull().default(""),
  statusOptionsEnabled: boolean("status_options_enabled").default(false).notNull(),
  statusOptions: text("status_options").array().default(sql`ARRAY['Location unknown','Working remotely / offsite','Sent to another location']`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

// Safety Tokens table for email-based self mark-safe functionality
export const safetyTokens = pgTable("safety_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  token: text("token").notNull().unique(), // Unique URL-safe token
  evacuationId: text("evacuation_id").notNull(),
  personId: text("person_id").notNull(),
  personType: text("person_type").notNull(), // 'staff', 'visitor', or 'contractor'
  personName: text("person_name").notNull(),
  personEmail: text("person_email").notNull(),
  isUsed: boolean("is_used").default(false).notNull(),
  usedAt: timestamp("used_at"),
  musterPoint: text("muster_point"), // Where they marked safe from
  expiresAt: timestamp("expires_at").notNull(), // Token expiration (e.g., 24 hours)
  createdAt: timestamp("created_at").defaultNow().notNull()
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
  // Pre-booking functionality
  isPreBooked: boolean("is_pre_booked").default(false).notNull(),
  expectedDateTime: timestamp("expected_date_time"),
  visitPurpose: text("visit_purpose"),
  checkedInAt: timestamp("checked_in_at").defaultNow().notNull(),
  checkedOutAt: timestamp("checked_out_at"),
  checkoutType: text("checkout_type"), // user, manual-reset, auto-reset
  zoneId: varchar("zone_id"),
  isCheckedIn: boolean("is_checked_in").default(true).notNull(),
  // Emergency muster tracking
  isAccountedFor: boolean("is_accounted_for").default(false).notNull(),
  needsEvacuationAssistance: boolean("needs_evacuation_assistance").default(false).notNull(),
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
  photoUrl: text("photo_url"),
  // Visit reason tracking
  visitReasonId: varchar("visit_reason_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const members = pgTable("members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phoneNumber: text("phone_number"),
  photoUrl: text("photo_url"),
  membershipType: text("membership_type").default("full"),
  membershipId: text("membership_id"),
  membershipNumber: text("membership_number"),
  joinDate: text("join_date"),
  expiryDate: text("expiry_date"),
  membershipStatus: text("membership_status").default("active"),
  notes: text("notes"),
  isCheckedIn: boolean("is_checked_in").default(false).notNull(),
  checkedInAt: timestamp("checked_in_at"),
  checkedOutAt: timestamp("checked_out_at"),
  checkoutType: text("checkout_type"),
  zoneId: varchar("zone_id"),
  isAccountedFor: boolean("is_accounted_for").default(false).notNull(),
  qrCode: text("qr_code"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Visitor history table for tracking all visits
export const visitorHistory = pgTable("visitor_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  visitorId: varchar("visitor_id").notNull(),
  // Visit details
  checkInTime: timestamp("check_in_time").notNull(),
  checkOutTime: timestamp("check_out_time"),
  purpose: text("purpose"),
  hostStaffId: varchar("host_staff_id").references(() => staff.id),
  hostName: text("host_name"), // Store host name for historical reference
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
  hostName: text("host_name"),
  qrCode: text("qr_code").notNull(),
  status: text("status").notNull().default("pending"), // pending, confirmed, cancelled
  isCheckedIn: boolean("is_checked_in").default(false).notNull(),
  checkedInAt: timestamp("checked_in_at"),
  visitorId: varchar("visitor_id").references(() => visitors.id), // Link to visitor when checked in
  emailSent: boolean("email_sent").default(false),
  emailSentAt: timestamp("email_sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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
  password: text("password"),
  email: text("email"),
  role: text("role").notNull().default("user"), // admin, user, tenant_admin, tenant_staff
  firstName: text("first_name"),
  lastName: text("last_name"),
  isActive: boolean("is_active").default(true),
  lastLoginAt: timestamp("last_login_at"),
  allowedMenuItems: text("allowed_menu_items").array(),
  defaultLandingPage: text("default_landing_page"),
  azureObjectId: text("azure_object_id"),
  authProvider: text("auth_provider").default("local"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// User invitations table - for managing pending user invitations
export const userInvitations = pgTable("user_invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: text("customer_id").notNull().default(""),
  email: text("email").notNull(),
  role: text("role").notNull().default("user"), // admin, user
  invitedBy: varchar("invited_by").references(() => users.id),
  token: text("token").notNull().unique(),
  expires: timestamp("expires").notNull(),
  used: boolean("used").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Company Settings - Now isolated per customer database
export const companySettings = pgTable("company_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyName: text("company_name").notNull().default("ACS Safety & Security Ltd"),
  logoUrl: text("logo_url"),
  // Company contact information
  address: text("address").default(""),
  phone: text("phone").default(""),
  website: text("website").default(""),
  email: text("email").default(""),
  cdmAlertsEmail: text("cdm_alerts_email").default(""),
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
  navBannerColor: text("nav_banner_color"),
  navBannerInvert: boolean("nav_banner_invert").default(false),
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
  // Suprema Biostar integration settings
  biostarEnabled: boolean("biostar_enabled").default(false),
  biostarServerUrl: text("biostar_server_url").default(""), // e.g., "https://your-biostar-server.com:8443"
  biostarApiKey: text("biostar_api_key").default(""),
  biostarUsername: text("biostar_username").default(""),
  biostarPassword: text("biostar_password").default(""),
  biostarDatabaseId: text("biostar_database_id").default("1"), // Default database ID
  biostarSyncInterval: text("biostar_sync_interval").default("300"), // Sync every 5 minutes (300 seconds)
  biostarLastSync: timestamp("biostar_last_sync"), // Last successful sync timestamp
  // Biometric reader device settings
  biometricDevices: text("biometric_devices").array().default([]), // Array of configured device IDs
  readerSettings: text("reader_settings").default("{}"), // JSON string for device-specific settings
  // AI and Video Generation Settings
  openaiModel: text("openai_model").default("gpt-5"), // gpt-4, gpt-5, gpt-6, gpt-7, claude-3-5-sonnet, claude-3-opus, claude-3-haiku
  claudeModel: text("claude_model").default("claude-3-5-sonnet"), // claude-3-5-sonnet, claude-3-opus, claude-3-haiku
  openaiTemperature: text("openai_temperature").default("0.7"), // 0.0-2.0 for creativity control
  openaiMaxTokens: text("openai_max_tokens").default("4000"), // Token limit per request
  videoQualityPreference: text("video_quality_preference").default("high"), // low, medium, high, ultra
  enableAdvancedVideoFeatures: boolean("enable_advanced_video_features").default(true),
  defaultVideoLength: text("default_video_length").default("15"), // minutes
  aiInstructionsPrompt: text("ai_instructions_prompt").default("Create comprehensive, engaging safety induction content"),
  // Site Induction Content — injected into the AI prompt so generated content is site-specific
  siteAddress: text("site_address"),             // Physical address shown on induction (falls back to address)
  inductionHazards: text("induction_hazards"),   // Free-text list of site-specific hazards
  inductionPpe: text("induction_ppe"),            // Free-text PPE requirements for this site
  assemblyPoint: text("assembly_point"),          // Emergency assembly point description
  firstAidLocation: text("first_aid_location"),   // Where the first aid kit / first aider is
  emergencyContact: text("emergency_contact"),    // Combined name + number for the emergency contact
  inductionSiteRules: text("induction_site_rules"), // Additional site-specific rules
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
  ePassDeliveryMethod: text("e_pass_delivery_method").default("email"), // email, sms, both, choice
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

  // NDA (Non-Disclosure Agreement)
  ndaEnabled: boolean("nda_enabled").default(false),
  ndaContent: text("nda_content").default(""),
  ndaRequireSignature: boolean("nda_require_signature").default(false),
  ndaAppliesTo: text("nda_applies_to").default("visitors"), // visitors, contractors, both
  
  // Phone System & Voice Notifications Configuration
  phoneProvider: text("phone_provider").default("8x8"), // 8x8, twilio, ringcentral, vonage
  voiceNotificationsEnabled: boolean("voice_notifications_enabled").default(false),
  // 8x8 Voice API Configuration  
  eightByXApiKey: text("eight_by_x_api_key").default(""),
  eightByXApiSecret: text("eight_by_x_api_secret").default(""),
  eightByXAccountId: text("eight_by_x_account_id").default(""),
  eightByXBaseUrl: text("eight_by_x_base_url").default("https://vcc-eu.8x8.com/api/v1"),
  // Voice Settings
  defaultVoiceLanguage: text("default_voice_language").default("en-GB"), // en-GB, en-US, fr-FR, de-DE, es-ES, it-IT
  defaultVoiceProfile: text("default_voice_profile").default("en-GB-Standard-A"), // Voice profile for text-to-speech
  
  // Feature Toggles - Allow customers to disable unused features for simplified UI
  featureMeetingRooms: boolean("feature_meeting_rooms").default(false),
  featureTimeAttendance: boolean("feature_time_attendance").default(false),
  featureInductionSettings: boolean("feature_induction_settings").default(false),
  featureKiosk: boolean("feature_kiosk").default(false),
  featureAiDemo: boolean("feature_ai_demo").default(false),
  featureContractorPage: boolean("feature_contractor_page").default(false),
  featureMembers: boolean("feature_members").default(false),
  featureEmailOutbox: boolean("feature_email_outbox").default(true),
  featureMartynLaw: boolean("feature_martyn_law").default(true),
  featureIncidentReports: boolean("feature_incident_reports").default(true),
  featurePPM: boolean("feature_ppm").default(false),
  featureHelpDesk: boolean("feature_help_desk").default(false),
  featureHsIncidents: boolean("feature_hs_incidents").default(true),
  featureFireRiskAssessment: boolean("feature_fire_risk_assessment").default(true),
  featureComplianceCertificates: boolean("feature_compliance_certificates").default(false),
  featureComplianceDashboard: boolean("feature_compliance_dashboard").default(true),
  complianceCertAlertHour: integer("compliance_cert_alert_hour").default(7),
  featurePermitToWork: boolean("feature_permit_to_work").default(false),
  ptwAlertHour: integer("ptw_alert_hour").default(7),
  featureHrModule: boolean("feature_hr_module").default(true),
  featureAuditEngine: boolean("feature_audit_engine").default(false),
  featureRaBuilder: boolean("feature_ra_builder").default(false),
  // Core navigation feature toggles — default ON
  featureDashboard: boolean("feature_dashboard").default(true),
  featureVisitors: boolean("feature_visitors").default(true),
  featureContractors: boolean("feature_contractors").default(true),
  featureStaff: boolean("feature_staff").default(true),
  featureMusterList: boolean("feature_muster_list").default(true),
  featureReports: boolean("feature_reports").default(true),
  featureSettingsPage: boolean("feature_settings_page").default(true),
  
  // Zones configuration
  zonesEnabled: boolean("zones_enabled").default(false),
  zoneMapUrl: text("zone_map_url"),

  // Paxton Net2 Access Control Integration
  paxtonEnabled: boolean("paxton_enabled").default(false),
  paxtonServerUrl: text("paxton_server_url").default(""),
  paxtonPort: text("paxton_port").default("8080"),
  paxtonClientId: text("paxton_client_id").default(""),
  paxtonUsername: text("paxton_username").default(""),
  paxtonPassword: text("paxton_password").default(""),
  paxtonSyncUsers: boolean("paxton_sync_users").default(true),
  paxtonSyncEvents: boolean("paxton_sync_events").default(true),
  paxtonSyncInterval: text("paxton_sync_interval").default("300"),
  paxtonDefaultAccessLevel: text("paxton_default_access_level").default(""),
  paxtonVisitorAccessLevel: text("paxton_visitor_access_level").default(""),
  paxtonContractorAccessLevel: text("paxton_contractor_access_level").default(""),
  paxtonAutoGrantAccess: boolean("paxton_auto_grant_access").default(false),
  paxtonAutoRevokeOnCheckout: boolean("paxton_auto_revoke_on_checkout").default(true),
  paxtonLastSync: timestamp("paxton_last_sync"),
  paxtonWebhookSecret: text("paxton_webhook_secret").default(""),

  // API & Webhooks Configuration (Third-party integrations)
  apiWebhooksEnabled: boolean("api_webhooks_enabled").default(false),
  apiKey: text("api_key").default(""),
  apiWebhookUrl: text("api_webhook_url").default(""),
  apiWebhookSecret: text("api_webhook_secret").default(""),
  apiWebhookEvents: text("api_webhook_events").array().default([]),
  apiRateLimit: text("api_rate_limit").default("100"),
  apiLastActivity: timestamp("api_last_activity"),

  // Incident Manager Monitor - permanent read-only URL for senior management
  incidentManagerUrlId: text("incident_manager_url_id"),

  // Contractor Compliance Alert Preferences
  notifyOnDocumentDeletion: boolean("notify_on_document_deletion").default(true),
  notifyOnDocumentExpiry: boolean("notify_on_document_expiry").default(true),

  // Lone Worker Protection Configuration
  loneWorkerEnabled: boolean("lone_worker_enabled").default(false),
  loneWorkerCheckIntervalMins: integer("lone_worker_check_interval_mins").default(30),
  loneWorkerGracePeriodMins: integer("lone_worker_grace_period_mins").default(10),
  loneWorkerL1Name: text("lone_worker_l1_name").default(""),
  loneWorkerL1Email: text("lone_worker_l1_email").default(""),
  loneWorkerL2Name: text("lone_worker_l2_name").default(""),
  loneWorkerL2Email: text("lone_worker_l2_email").default(""),
  loneWorkerL2DelayMins: integer("lone_worker_l2_delay_mins").default(15),
  loneWorkerL3DelayMins: integer("lone_worker_l3_delay_mins").default(30),

  // Azure Entra ID SSO
  ssoLoginMode: text("sso_login_mode").default("standard"),
  ssoAutoProvision: boolean("sso_auto_provision").default(true),
  ssoDefaultRole: text("sso_default_role").default("user"),
  ssoTenantId: varchar("sso_tenant_id"),
  ssoClientId: varchar("sso_client_id"),
  ssoClientSecret: varchar("sso_client_secret"),
  ssoClientSecretIv: varchar("sso_client_secret_iv"),
  ssoClientSecretTag: varchar("sso_client_secret_tag"),
  ssoRedirectUri: varchar("sso_redirect_uri"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Evacuation Zones for emergency zone mapping
export const evacuationZones = pgTable("evacuation_zones", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  color: text("color").notNull().default("#3b82f6"),
  description: text("description"),
  displayOrder: integer("display_order").notNull().default(0),
  mapX: doublePrecision("map_x"),
  mapY: doublePrecision("map_y"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Zone Sweeps — records when a fire marshal physically clears a zone during an evacuation
export const zoneSweeps = pgTable("zone_sweeps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  evacuationId: text("evacuation_id").notNull(),
  zoneId: text("zone_id").notNull(),
  zoneName: text("zone_name").notNull(),
  sweptByName: text("swept_by_name").notNull(),
  sweptByType: text("swept_by_type").notNull().default("staff"),
  sweptAt: timestamp("swept_at").defaultNow().notNull(),
  hasUnaccountedAtTime: boolean("has_unaccounted_at_time").notNull().default(false),
  overrideReason: text("override_reason"),
});

// Evacuation Notes — quick text notes logged during an active evacuation (customer-isolated)
export const evacuationNotes = pgTable("evacuation_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  evacuationId: text("evacuation_id").notNull(),
  noteText: text("note_text").notNull(),
  addedBy: text("added_by").notNull(),
  addedByType: text("added_by_type").notNull().default("firemarshal"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Evacuation Photos — camera photos captured during an active evacuation (customer-isolated)
export const evacuationPhotos = pgTable("evacuation_photos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  evacuationId: text("evacuation_id").notNull(),
  photoData: text("photo_data").notNull(),
  caption: text("caption"),
  addedBy: text("added_by").notNull(),
  addedByType: text("added_by_type").notNull().default("firemarshal"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
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
  hourlyRate: doublePrecision("hourly_rate").default(0), // Cost per hour
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Room Bookings
export const roomBookings = pgTable("room_bookings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  meetingRoomId: varchar("meeting_room_id").notNull().references(() => meetingRooms.id),
  bookedByStaffId: varchar("booked_by_staff_id").references(() => staff.id),
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
  expectedAttendees: integer("expected_attendees").notNull().default(1),
  attendeeEmails: text("attendee_emails").array().default([]),
  requiresCatering: boolean("requires_catering").notNull().default(false),
  cateringNotes: text("catering_notes"),
  specialRequirements: text("special_requirements"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Room Booking Attendees
export const roomBookingAttendees = pgTable("room_booking_attendees", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").notNull().references(() => roomBookings.id, { onDelete: 'cascade' }),
  staffId: varchar("staff_id").references(() => staff.id),
  email: text("email").notNull(),
  name: text("name").notNull(),
  isOrganizer: boolean("is_organizer").default(false).notNull(),
  responseStatus: text("response_status").default("pending").notNull(),
  responseAt: timestamp("response_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
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
  contactFirstName: text("contact_first_name").notNull(),
  contactLastName: text("contact_last_name").notNull(),
  address: text("address"),
  postcode: text("postcode"),
  website: text("website"),
  description: text("description"), // Company description/services
  industry: text("industry"), // Construction, Engineering, Manufacturing, etc.
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
  // CDM 2015 — Construction Design & Management
  cdmRole: text("cdm_role"), // principal_contractor | principal_designer | contractor | designer | client
  constructionlineGrade: text("constructionline_grade"), // not_registered | registered | silver | gold | platinum
  smasAccredited: boolean("smas_accredited").default(false),
  otherAccreditations: text("other_accreditations"), // free-text for Acclaim, SSIP etc.
  pdProfessionalBody: text("pd_professional_body"), // e.g. RIBA, ARB, ICE, CIOB
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
  zoneId: varchar("zone_id"),
  lastVisitDate: timestamp("last_visit_date"),
  visitCount: integer("visit_count").default(0),
  // Emergency muster tracking
  isAccountedFor: boolean("is_accounted_for").default(false).notNull(),
  needsEvacuationAssistance: boolean("needs_evacuation_assistance").default(false).notNull(),
  // Right to work verification  
  rightToWork: text("right_to_work_status").default("pending"), // pending, verified, expired, invalid
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
  cscsCard: text("cscs_card_number"),
  cscsStatus: text("cscs_status").default("pending"), // pending, valid, expired
  // Note: Removed cscs_expiry as it doesn't exist in DB yet
  // IPAF certification for working at height
  ipafStatus: text("ipaf_status").default("none"), // none, 3a, 3b, 1+, expired
  // Note: Removed ipaf_expiry as it doesn't exist in DB yet
  // Training certificates
  asbestosAwareness: boolean("asbestos_awareness").default(false),
  manualHandling: boolean("manual_handling").default(false),
  workingAtHeight: boolean("working_at_height").default(false),
  // Note: Removed expiry dates as they don't exist in DB yet
  // Transport and emissions tracking
  transportMethod: text("transport_method").default("car_diesel"), // car_diesel, car_petrol, electric_car, public_transport, motorcycle
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
  // Health & Safety rules acceptance
  hsRulesAccepted: boolean("hs_rules_accepted").default(false),
  hsRulesAcceptedAt: timestamp("hs_rules_accepted_at"),
  hsRulesAcceptanceToken: text("hs_rules_acceptance_token"),
  // Card status (calculated field for UI)
  currentCardStatus: text("current_card_status").default("pending"), // clear, yellow, red, banned, pending
  isActive: boolean("is_active").default(true).notNull(),
  qrCode: text("qr_code").unique(),
  // Lone Worker Protection
  isLoneWorker: boolean("is_lone_worker").default(false),
  loneWorkerSince: timestamp("lone_worker_since"),
  loneWorkerDeadline: timestamp("lone_worker_deadline"),
  loneWorkerEscalationLevel: integer("lone_worker_escalation_level").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Worker Notes - Audit trail for worker changes
export const workerNotes = pgTable("worker_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workerId: varchar("worker_id").notNull().references(() => contractorWorkers.id),
  changeType: text("change_type").notNull(), // card_reset, certification_update, hs_acceptance, profile_update
  oldValue: text("old_value"),
  newValue: text("new_value"),
  notes: text("notes"),
  changedBy: text("changed_by").notNull(), // Username of person who made the change
  changedAt: timestamp("changed_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Company Notes - Audit trail for contractor company actions (creation, updates, document uploads)
export const companyNotes = pgTable("company_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => contractorCompanies.id),
  changeType: text("change_type").notNull(), // company_created, company_updated, document_uploaded, document_replaced, document_deleted
  notes: text("notes"),
  changedBy: text("changed_by").notNull(),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
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
  expiryAlertedAt: timestamp("expiry_alerted_at"), // Set when nightly expiry digest email sent; null = not yet alerted for this expiry. New uploads start null.
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
  workerId: varchar("worker_id").references(() => contractorWorkers.id), // nullable - not all recipients are contractor workers
  visitorId: varchar("visitor_id"), // For visitor induction links
  staffId: varchar("staff_id"), // For staff induction links
  personType: text("person_type").notNull().default("contractor"), // visitor, staff, contractor
  personName: text("person_name").notNull().default(""), // Name for email personalization
  personEmail: text("person_email").notNull().default(""), // Email address
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
  inductionTopicsCovered: jsonb("induction_topics_covered"), // CDM 2015 compliance record — array of {id, label, covered}
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
  kioskEnabled: boolean("kiosk_enabled").default(false).notNull(), // Show induction during kiosk check-in
  sendLinkEnabled: boolean("send_link_enabled").default(true).notNull(), // Allow sending induction links by email
  generatedHtml: text("generated_html"), // Saved HTML presentation content (customer-isolated)
  scenesData: text("scenes_data"), // JSON string of scenes array
  generatedAt: timestamp("generated_at"), // When video was last generated
  questionsGenerated: boolean("questions_generated").default(false), // Whether AI questions have been saved
  customVideoUrl: text("custom_video_url"),   // Object-storage path for customer-uploaded video (null = use AI-generated)
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
  hostStaffId: varchar("host_staff_id"),
  hostName: text("host_name"),
  documentsRequired: text("documents_required").array().default([]),
  documentsUploaded: text("documents_uploaded").array().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// UK H&S Document System - Template based document management
export const ukHSDocumentTemplates = pgTable("uk_hs_document_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentName: text("document_name").notNull(),
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
  customerId: text("customer_id").notNull().default(""),
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

// ==============================================
// CUSTOMER SAAS INFRASTRUCTURE TABLES (Per Customer Database)
// ==============================================

// Customer API Keys Management - Encrypted storage for customer API integrations
export const customerApiKeys = pgTable("customer_api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // API Key Details
  keyName: text("key_name").notNull(), // User-friendly name for the key
  service: text("service"), // Legacy: service name
  keyType: text("key_type"), // Legacy: key type
  // AI Provider key management (new columns added by migration 045)
  serviceType: text("service_type"), // "openai", "gemini", "claude"
  keyDescription: text("key_description"), // Optional description
  // Encrypted Storage - CRITICAL: Keys must be encrypted at rest
  encryptedApiKey: text("encrypted_api_key"), // Legacy encrypted storage
  encryptionIv: text("encryption_iv"), // Legacy IV
  encryptedKey: text("encrypted_key"), // AES-256-GCM encrypted key
  initializationVector: text("initialization_vector"), // GCM IV
  authTag: text("auth_tag"), // GCM authentication tag
  keyFingerprint: text("key_fingerprint").notNull(), // SHA-256 hash for deduplication
  last4: text("last4"), // Last 4 chars for display
  // Key Management
  keyVersion: integer("key_version").default(1), // For rotation tracking
  isActive: boolean("is_active").notNull().default(true), // Legacy active flag
  status: text("status").default("active"), // active, revoked
  expiresAt: timestamp("expires_at"), // Optional expiration date
  // Usage Tracking
  lastUsed: timestamp("last_used"), // Legacy
  lastUsedAt: timestamp("last_used_at"), // Preferred last-used timestamp
  usageCount: integer("usage_count").notNull().default(0),
  lastRequestIp: text("last_request_ip"),
  // Security & Audit
  createdBy: varchar("created_by"), // User who created/saved the key
  rotatedFrom: varchar("rotated_from"),
  rotationReason: text("rotation_reason"),
  decryptAuditLog: text("decrypt_audit_log"), // JSON array of audit entries
  // Key Permissions & Scope
  permissions: text("permissions").array().notNull().default([]),
  allowedIps: text("allowed_ips").array().default([]),
  rateLimit: integer("rate_limit").default(1000),
  // Metadata
  description: text("description"),
  tags: text("tags").array().default([]),
  isTestKey: boolean("is_test_key").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Feature Usage Analytics - Track customer feature adoption and usage patterns
export const featureUsageAnalytics = pgTable("feature_usage_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Time Period
  date: timestamp("date").notNull(), // Date of usage (daily aggregation)
  period: text("period").notNull().default("daily"), // "hourly", "daily", "weekly", "monthly"
  // Feature Identification
  feature: text("feature").notNull(), // Feature name/identifier
  featureCategory: text("feature_category").notNull(), // "core", "advanced", "integration", "reporting"
  subFeature: text("sub_feature"), // Specific sub-feature if applicable
  // Usage Metrics
  usageCount: integer("usage_count").notNull().default(0), // Number of times used
  uniqueUsers: integer("unique_users").notNull().default(0), // Number of unique users who used feature
  sessionCount: integer("session_count").notNull().default(0), // Number of sessions where feature was used
  totalDurationMinutes: integer("total_duration_minutes").default(0), // Total time spent using feature
  // User Context
  primaryUserId: varchar("primary_user_id").references(() => users.id), // Most active user for this feature
  userRoles: text("user_roles").array().default([]), // Roles of users who used this feature
  tenantIds: text("tenant_ids").array().default([]), // Tenant companies that used this feature
  // Success & Error Metrics
  successfulOperations: integer("successful_operations").default(0),
  failedOperations: integer("failed_operations").default(0),
  errorRate: text("error_rate").default("0.00"), // Percentage as decimal string
  // Performance Metrics
  averageResponseTimeMs: integer("average_response_time_ms").default(0),
  slowestResponseTimeMs: integer("slowest_response_time_ms").default(0),
  fastestResponseTimeMs: integer("fastest_response_time_ms").default(0),
  // Business Context
  businessValue: text("business_value"), // Estimated business impact
  conversionImpact: text("conversion_impact"), // Impact on trial-to-paid conversion
  retentionImpact: text("retention_impact"), // Impact on customer retention
  // Comparison Metrics
  previousPeriodUsage: integer("previous_period_usage").default(0),
  usageGrowth: text("usage_growth").default("0.00"), // Growth percentage as decimal
  industryBenchmark: text("industry_benchmark"), // Comparison to industry averages
  // Feature Flags & Configuration
  featureFlags: text("feature_flags").array().default([]), // Active feature flags during usage
  configuration: text("configuration"), // JSON of relevant feature configuration
  // Last Activity
  firstUsed: timestamp("first_used"), // First time this feature was used this period
  lastUsed: timestamp("last_used"), // Most recent usage in this period
  peakUsageHour: integer("peak_usage_hour"), // Hour of day with most usage (0-23)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Help System Tables - Customer Isolated
export const helpCategories = pgTable("help_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon").default("HelpCircle"), // Lucide icon name
  color: text("color").default("blue"), // UI color theme
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const helpArticles = pgTable("help_articles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  categoryId: varchar("category_id").notNull().references(() => helpCategories.id),
  title: text("title").notNull(),
  slug: text("slug").notNull(), // URL-friendly identifier
  summary: text("summary"), // Short description for search results
  content: text("content").notNull(), // Full article content (Markdown supported)
  contentType: text("content_type").default("markdown"), // markdown, html, video
  videoUrl: text("video_url"), // Optional embedded video
  // Targeting and visibility
  targetPages: text("target_pages").array().default([]), // Pages where this article is contextually relevant
  targetFeatures: text("target_features").array().default([]), // Features this article applies to
  difficulty: text("difficulty").default("beginner"), // beginner, intermediate, advanced
  estimatedReadTime: integer("estimated_read_time").default(5), // minutes
  // SEO and search
  searchKeywords: text("search_keywords").array().default([]), // Additional search terms
  tags: text("tags").array().default([]), // Categorization tags
  // Analytics and feedback
  viewCount: integer("view_count").default(0),
  helpfulCount: integer("helpful_count").default(0),
  notHelpfulCount: integer("not_helpful_count").default(0),
  lastViewedAt: timestamp("last_viewed_at"),
  // Publishing
  isPublished: boolean("is_published").default(true),
  publishedAt: timestamp("published_at"),
  authorId: varchar("author_id").references(() => users.id),
  // Ordering and priority
  sortOrder: integer("sort_order").default(0),
  isFeatured: boolean("is_featured").default(false), // Show in prominently
  isQuickStart: boolean("is_quick_start").default(false), // Part of onboarding
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const helpUserInteractions = pgTable("help_user_interactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id), // NULL for anonymous/guest interactions
  articleId: varchar("article_id").notNull().references(() => helpArticles.id),
  // Interaction type and details
  interactionType: text("interaction_type").notNull(), // view, helpful, not_helpful, search, complete
  sessionId: text("session_id"), // Group interactions by user session
  timeSpent: integer("time_spent"), // seconds spent viewing article
  // Contextual information
  pageContext: text("page_context"), // Which page they were on when accessing help
  searchQuery: text("search_query"), // What they searched for to find this article
  // Feedback
  feedbackRating: integer("feedback_rating"), // 1-5 rating
  feedbackComments: text("feedback_comments"), // Optional user feedback
  // Completion tracking (for tutorials/guides)
  isCompleted: boolean("is_completed").default(false),
  completedSteps: text("completed_steps").array().default([]), // For multi-step guides
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const helpOnboardingProgress = pgTable("help_onboarding_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  // Onboarding steps and progress
  currentStep: integer("current_step").default(1),
  completedSteps: text("completed_steps").array().default([]), // Array of completed step IDs
  skippedSteps: text("skipped_steps").array().default([]), // Steps user chose to skip
  totalSteps: integer("total_steps").default(10), // Total steps in onboarding
  isCompleted: boolean("is_completed").default(false),
  completedAt: timestamp("completed_at"),
  // Progress tracking
  timeSpent: integer("time_spent").default(0), // Total time in seconds
  lastActiveAt: timestamp("last_active_at").defaultNow(),
  // Feature-specific onboarding completion
  featureOnboardingCompleted: text("feature_onboarding_completed").array().default([]), // Features user has completed onboarding for
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Email Log table - customer isolated, records every outgoing system email
export const emailLog = pgTable("email_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  recipientEmail: text("recipient_email").notNull(),
  subject: text("subject").notNull(),
  htmlBody: text("html_body").notNull().default(""),
  textBody: text("text_body").notNull().default(""),
  emailType: text("email_type").notNull().default("System Email"),
  status: text("status").notNull().default("sent"),
});

// Reports table - customer isolated (no customerId needed, schema provides isolation)
export const reports = pgTable("reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reportType: text("report_type").notNull(),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  dateFrom: timestamp("date_from").notNull(),
  dateTo: timestamp("date_to").notNull(),
  totalVisitors: text("total_visitors").notNull().default("0"),
  avgDuration: text("avg_duration").notNull().default("N/A"),
  emailSent: boolean("email_sent").default(false),
  emailSentAt: timestamp("email_sent_at"),
  data: text("data"),
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

export const insertMemberSchema = createInsertSchema(members).omit({
  id: true,
  checkedInAt: true,
  checkedOutAt: true,
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

export const insertMusterPointSchema = createInsertSchema(musterPoints).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
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
  generatedAt: true,
  createdAt: true,
});

export const insertHelpCategorySchema = createInsertSchema(helpCategories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertHelpArticleSchema = createInsertSchema(helpArticles).omit({
  id: true,
  viewCount: true,
  helpfulCount: true,
  notHelpfulCount: true,
  lastViewedAt: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
});

export const insertHelpUserInteractionSchema = createInsertSchema(helpUserInteractions).omit({
  id: true,
  createdAt: true,
});

export const insertHelpOnboardingProgressSchema = createInsertSchema(helpOnboardingProgress).omit({
  id: true,
  lastActiveAt: true,
  createdAt: true,
  updatedAt: true,
});

// ==============================================
// CUSTOMER SAAS INFRASTRUCTURE - ZOD VALIDATION SCHEMAS
// ==============================================

// Customer API Keys Validation
export const insertCustomerApiKeySchema = createInsertSchema(customerApiKeys).omit({
  id: true,
  usageCount: true,
  createdAt: true,
  updatedAt: true,
});

// Feature Usage Analytics Validation
export const insertFeatureUsageAnalyticsSchema = createInsertSchema(featureUsageAnalytics).omit({
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

export const insertEvacuationZoneSchema = createInsertSchema(evacuationZones).omit({
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
export type Member = typeof members.$inferSelect;
export type InsertMember = z.infer<typeof insertMemberSchema>;
export type VisitorHistory = typeof visitorHistory.$inferSelect;
export type InsertVisitorHistory = z.infer<typeof insertVisitorHistorySchema>;
export type StaffAttendanceHistory = typeof staffAttendanceHistory.$inferSelect;
export type InsertStaffAttendanceHistory = z.infer<typeof insertStaffAttendanceHistorySchema>;
export type MusterPoint = typeof musterPoints.$inferSelect;
export type InsertMusterPoint = z.infer<typeof insertMusterPointSchema>;
export type Department = typeof departments.$inferSelect;
export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type CompanySettings = typeof companySettings.$inferSelect;
export type InsertCompanySettings = z.infer<typeof insertCompanySettingsSchema>;
export type PreBooking = typeof preBookings.$inferSelect;
export type InsertPreBooking = z.infer<typeof insertPreBookingSchema>;
export type MeetingRoom = typeof meetingRooms.$inferSelect;
export type InsertMeetingRoom = z.infer<typeof insertMeetingRoomSchema>;
export type RoomBooking = typeof roomBookings.$inferSelect;
export type InsertRoomBooking = z.infer<typeof insertRoomBookingSchema>;
export type EvacuationZone = typeof evacuationZones.$inferSelect;
export type InsertEvacuationZone = z.infer<typeof insertEvacuationZoneSchema>;

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

// Help system types
export type HelpCategory = typeof helpCategories.$inferSelect;
export type InsertHelpCategory = z.infer<typeof insertHelpCategorySchema>;
export type HelpArticle = typeof helpArticles.$inferSelect;
export type InsertHelpArticle = z.infer<typeof insertHelpArticleSchema>;
export type HelpUserInteraction = typeof helpUserInteractions.$inferSelect;
export type InsertHelpUserInteraction = z.infer<typeof insertHelpUserInteractionSchema>;
export type HelpOnboardingProgress = typeof helpOnboardingProgress.$inferSelect;
export type InsertHelpOnboardingProgress = z.infer<typeof insertHelpOnboardingProgressSchema>;

// ==============================================
// CUSTOMER SAAS INFRASTRUCTURE - TYPESCRIPT TYPES
// ==============================================

// Customer API Keys Types
export type CustomerApiKey = typeof customerApiKeys.$inferSelect;
export type InsertCustomerApiKey = z.infer<typeof insertCustomerApiKeySchema>;

// Feature Usage Analytics Types
export type FeatureUsageAnalytics = typeof featureUsageAnalytics.$inferSelect;
export type InsertFeatureUsageAnalytics = z.infer<typeof insertFeatureUsageAnalyticsSchema>;

// Email Log Types
export const insertEmailLogSchema = createInsertSchema(emailLog).omit({
  id: true,
  sentAt: true,
});
export type EmailLog = typeof emailLog.$inferSelect;
export type InsertEmailLog = z.infer<typeof insertEmailLogSchema>;

// ==============================================
// MARTYN'S LAW (UK PROTECT DUTY) COMPLIANCE
// ==============================================

export const martynLawConfig = pgTable("martyn_law_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: text("customer_id").notNull().unique(),
  // Venue details
  venueType: text("venue_type"),
  venueCapacity: integer("venue_capacity"),
  isInScope: boolean("is_in_scope").default(false),
  scopeNotes: text("scope_notes"),
  // Designated Security Supervisor
  supervisorName: text("supervisor_name"),
  supervisorRole: text("supervisor_role"),
  supervisorPhone: text("supervisor_phone"),
  supervisorEmail: text("supervisor_email"),
  // SIA / Security Provider
  siaProviderName: text("sia_provider_name"),
  siaLicenseNumber: text("sia_license_number"),
  siaExpiryDate: timestamp("sia_expiry_date"),
  // Terrorism Action Plan
  actionPlan: text("action_plan"),
  evacuationProcedure: text("evacuation_procedure"),
  lockdownProcedure: text("lockdown_procedure"),
  communicationPlan: text("communication_plan"),
  // Checklist (JSON array of {id, label, completed, completedAt, notes})
  checklistItems: text("checklist_items"),
  // Evidence log (JSON array of {id, type, description, date, conductedBy, documentUrl?, documentName?})
  evidenceLog: text("evidence_log"),
  // Audit trail (JSON array of {timestamp, action, userName})
  auditLog: text("audit_log"),
  // Staff IDs for supervisor & last reviewer
  supervisorStaffId: text("supervisor_staff_id"),
  lastReviewerStaffId: text("last_reviewer_staff_id"),
  // Metadata
  lastReviewedAt: timestamp("last_reviewed_at"),
  lastReviewedBy: text("last_reviewed_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type MartynLawConfig = typeof martynLawConfig.$inferSelect;

// =====================================================
// INCIDENT REPORTS (per-customer, isolated schema)
// =====================================================
export const incidentReports = pgTable("incident_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  evacuationId: text("evacuation_id").notNull(),
  customerId: text("customer_id").notNull(),
  isDrill: boolean("is_drill").notNull().default(false),
  activatedBy: text("activated_by"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  durationSeconds: integer("duration_seconds"),
  totalOnSite: integer("total_on_site").notNull().default(0),
  accountedFor: integer("accounted_for").notNull().default(0),
  unaccounted: integer("unaccounted").notNull().default(0),
  completionPct: integer("completion_pct").notNull().default(0),
  generatedAt: timestamp("generated_at").defaultNow(),
  reportUrl: text("report_url"),
  deletedAt: timestamp("deleted_at"),
});

export type IncidentReport = typeof incidentReports.$inferSelect;
export type InsertMartynLawConfig = typeof martynLawConfig.$inferInsert;

// =====================================================
// LONE WORKER PROTECTION TABLES
// =====================================================
export const loneWorkerSessions = pgTable("lone_worker_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: text("customer_id").notNull(),
  personId: text("person_id").notNull(),
  personType: text("person_type").notNull(), // "staff" | "contractor"
  personName: text("person_name").notNull(),
  personEmail: text("person_email"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
  intervalMins: integer("interval_mins").notNull().default(30),
  gracePeriodMins: integer("grace_period_mins").notNull().default(10),
  status: text("status").notNull().default("active"), // active, escalated, ended_ok
  checkInsCompleted: integer("check_ins_completed").notNull().default(0),
  escalationsFired: integer("escalations_fired").notNull().default(0),
  endedBy: text("ended_by"),
});

export const loneWorkerTokens = pgTable("lone_worker_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  token: text("token").notNull().unique(),
  sessionId: uuid("session_id").notNull().references(() => loneWorkerSessions.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
});

export type LoneWorkerSession = typeof loneWorkerSessions.$inferSelect;
export type LoneWorkerToken = typeof loneWorkerTokens.$inferSelect;

// =====================================================
// BIOSTAR 2 DEVICE CONFIGURATION
// Stores BioStar reader/device metadata + admin-assigned role.
// Role drives occupancy logic: ENTRY = check in, EXIT = check out.
// =====================================================
export const biostarDevices = pgTable("biostar_devices", {
  id: varchar("id").primaryKey(), // BioStar device ID (e.g. "1", "2")
  name: text("name").notNull(),
  model: text("model"),
  ipAddress: text("ip_address"),
  deviceAddress: text("device_address"), // Human-readable address from BioStar (may differ from ip_address)
  deviceGroup: text("device_group"),    // Group name from BioStar device groups
  // Admin-assigned classification
  role: text("role").notNull().default("ENTRY_EXIT"), // ENTRY | EXIT | ENTRY_EXIT | IGNORE
  direction: text("direction").notNull().default("BOTH"), // IN | OUT | BOTH
  // Sync metadata
  syncedAt: timestamp("synced_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertBiostarDeviceSchema = createInsertSchema(biostarDevices).omit({ syncedAt: true, updatedAt: true });
export type InsertBiostarDevice = z.infer<typeof insertBiostarDeviceSchema>;

// ── PPM (Planned Preventative Maintenance) ───────────────────────────────────

export const ppmAssetGroups = pgTable("ppm_asset_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),          // e.g. "HVAC System", "Access Control"
  description: text("description"),     // Optional notes about what the group covers
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPpmAssetGroupSchema = createInsertSchema(ppmAssetGroups).omit({ id: true, createdAt: true });
export type InsertPpmAssetGroup = z.infer<typeof insertPpmAssetGroupSchema>;
export type PpmAssetGroup = typeof ppmAssetGroups.$inferSelect;

export const ppmAssets = pgTable("ppm_assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  groupId: varchar("group_id").references(() => ppmAssetGroups.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  assetRef: text("asset_ref"),           // Internal reference / asset tag
  category: text("category"),            // e.g. HVAC, Fire, Electrical, Plumbing
  location: text("location"),            // e.g. Floor 2 / Room 201
  manufacturer: text("manufacturer"),
  modelNumber: text("model_number"),
  serialNumber: text("serial_number"),
  installDate: text("install_date"),     // ISO date string
  notes: text("notes"),
  status: text("status").notNull().default("active"), // active | decommissioned
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPpmAssetSchema = createInsertSchema(ppmAssets).omit({ id: true, createdAt: true });
export type InsertPpmAsset = z.infer<typeof insertPpmAssetSchema>;
export type PpmAsset = typeof ppmAssets.$inferSelect;

export const ppmTemplates = pgTable("ppm_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"),            // matches asset categories
  type: text("type").notNull().default("non-statutory"), // statutory | non-statutory
  regulationReference: text("regulation_reference"), // e.g. BS 5839, BS 7671, LOLER
  frequency: text("frequency").notNull().default("monthly"), // weekly | monthly | quarterly | annual | custom
  customDays: integer("custom_days"),    // only used when frequency = custom
  estimatedHours: text("estimated_hours"), // e.g. "2.5"
  checklist: text("checklist"),          // JSON array of checklist items stored as text
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPpmTemplateSchema = createInsertSchema(ppmTemplates).omit({ id: true, createdAt: true });
export type InsertPpmTemplate = z.infer<typeof insertPpmTemplateSchema>;
export type PpmTemplate = typeof ppmTemplates.$inferSelect;

export const ppmSchedules = pgTable("ppm_schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assetId: varchar("asset_id").notNull().references(() => ppmAssets.id, { onDelete: "cascade" }),
  templateId: varchar("template_id").references(() => ppmTemplates.id, { onDelete: "set null" }),
  title: text("title").notNull(),        // Copy of template name or custom title
  frequency: text("frequency").notNull().default("monthly"),
  customDays: integer("custom_days"),
  startDate: text("start_date").notNull(), // ISO date string
  nextDueDate: text("next_due_date").notNull(), // Calculated from startDate + frequency
  lastCompletedDate: text("last_completed_date"),
  assignedTo: text("assigned_to"),       // Contractor/engineer name or company
  status: text("status").notNull().default("scheduled"), // scheduled | overdue | completed | cancelled
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPpmScheduleSchema = createInsertSchema(ppmSchedules).omit({ id: true, createdAt: true });
export type InsertPpmSchedule = z.infer<typeof insertPpmScheduleSchema>;
export type PpmSchedule = typeof ppmSchedules.$inferSelect;

// ── PPM Work Orders ───────────────────────────────────────────────────────────

export const ppmWorkOrders = pgTable("ppm_work_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  scheduleId: varchar("schedule_id").references(() => ppmSchedules.id, { onDelete: "set null" }),
  assetId: varchar("asset_id").references(() => ppmAssets.id, { onDelete: "set null" }),
  groupId: varchar("group_id").references(() => ppmAssetGroups.id, { onDelete: "set null" }), // Group-level work order
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("scheduled"), // scheduled | in_progress | completed | overdue
  contractorCompanyId: varchar("contractor_company_id"),
  contractorCompanyName: text("contractor_company_name"),
  contractorWorkerId: varchar("contractor_worker_id"),
  contractorWorkerName: text("contractor_worker_name"),
  assignedEmail: text("assigned_email"),
  dueDate: text("due_date"),
  completedDate: text("completed_date"),
  notes: text("notes"),
  completionNotes: text("completion_notes"),
  accessToken: varchar("access_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"), // Token expiry — set on create/reassignment
  requiresCertificate: boolean("requires_certificate").default(false),
  certificateUploadedAt: timestamp("certificate_uploaded_at"),
  overdueAlertedAt: timestamp("overdue_alerted_at"),         // Set when overdue alert email sent; prevents daily re-send
  missingCertAlertedAt: timestamp("missing_cert_alerted_at"), // Set when missing-cert alert sent; prevents daily re-send
  missingDocsAlertedAt: timestamp("missing_docs_alerted_at"), // Set when overdue+no-documents alert sent; prevents daily re-send
  arrivedAt: timestamp("arrived_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPpmWorkOrderSchema = createInsertSchema(ppmWorkOrders).omit({ id: true, createdAt: true });
export type InsertPpmWorkOrder = z.infer<typeof insertPpmWorkOrderSchema>;
export type PpmWorkOrder = typeof ppmWorkOrders.$inferSelect;

export const ppmWorkOrderDocuments = pgTable("ppm_work_order_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workOrderId: varchar("work_order_id").notNull().references(() => ppmWorkOrders.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileType: text("file_type"),
  uploadedBy: text("uploaded_by"),
  expiryDate: text("expiry_date"),
  referenceNumber: text("reference_number"),
  issuedBy: text("issued_by"),
  expiryAlertedAt: timestamp("expiry_alerted_at"), // Set when expiry alert email sent; null = not yet alerted for this expiry window. New uploads start null so the next cron run will alert.
  scannedAt: timestamp("scanned_at"), // Set when AI metadata extraction completes (success or no-results). null = scan pending.
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPpmWorkOrderDocumentSchema = createInsertSchema(ppmWorkOrderDocuments).omit({ id: true, createdAt: true, scannedAt: true });
export type InsertPpmWorkOrderDocument = z.infer<typeof insertPpmWorkOrderDocumentSchema>;
export type PpmWorkOrderDocument = typeof ppmWorkOrderDocuments.$inferSelect;

// ── CDM 2015 — Construction Design & Management Projects ──────────────────────

export const cdmProjects = pgTable("cdm_projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => contractorCompanies.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  location: text("location"),
  clientName: text("client_name"),
  contractorRole: text("contractor_role").notNull().default("contractor"), // principal_contractor | principal_designer | contractor | designer
  // Duty holder references
  principalContractorId: varchar("principal_contractor_id").references(() => contractorCompanies.id),
  principalDesignerName: text("principal_designer_name"),
  status: text("status").notNull().default("planning"), // planning | active | complete | cancelled
  startDate: text("start_date"),
  endDate: text("end_date"),
  estimatedDays: integer("estimated_days"),
  peakWorkers: integer("peak_workers"),
  personDays: integer("person_days"),
  // Section 1 — F10 HSE Notification
  f10Status: text("f10_status").notNull().default("not_required"), // not_required | pending | submitted
  f10Date: text("f10_date"),        // date submitted
  f10Reference: text("f10_reference"),
  f10Notes: text("f10_notes"),
  // Section 2 — Construction Phase Plan (CPP)
  cppStatus: text("cpp_status").notNull().default("not_prepared"), // not_prepared | in_progress | approved
  cppDate: text("cpp_date"),
  cppNotes: text("cpp_notes"),
  // Section 3 — Pre-Construction Information (PCI)
  pciStatus: text("pci_status").notNull().default("not_prepared"), // not_prepared | prepared | distributed
  pciDate: text("pci_date"),
  pciNotes: text("pci_notes"),
  // Section 4 — Health & Safety File (HSF)
  hsfStatus: text("hsf_status").notNull().default("not_started"), // not_started | in_progress | complete | handed_over
  hsfDate: text("hsf_date"),
  hsfNotes: text("hsf_notes"),
  // Section 5 — Welfare Provisions (CDM Reg 25)
  welfareToilets: boolean("welfare_toilets").default(false),
  welfareWashing: boolean("welfare_washing").default(false),
  welfareRestArea: boolean("welfare_rest_area").default(false),
  welfareDrinkingWater: boolean("welfare_drinking_water").default(false),
  welfareChanging: boolean("welfare_changing").default(false),
  // General
  notes: text("notes"),
  f10AlertSentAt: timestamp("f10_alert_sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCdmProjectSchema = createInsertSchema(cdmProjects).omit({ id: true, createdAt: true });
export type InsertCdmProject = z.infer<typeof insertCdmProjectSchema>;
export type CdmProject = typeof cdmProjects.$inferSelect;

// ── Help Desk / Reactive Maintenance ─────────────────────────────────────────

export const helpDeskTickets = pgTable("help_desk_tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketNumber: text("ticket_number"),          // e.g. "HD-001", auto-generated on create
  title: text("title").notNull(),
  description: text("description"),
  category: text("category"),                   // maintenance | it | facilities | safety | other
  priority: text("priority"),                   // low | medium | high | urgent
  status: text("status").notNull().default("open"), // open | in_progress | pending | resolved | closed
  location: text("location"),
  assetId: text("asset_id"),
  reportedByName: text("reported_by_name"),
  reportedByEmail: text("reported_by_email"),
  assignedTo: text("assigned_to"),
  resolutionNotes: text("resolution_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

export const insertHelpDeskTicketSchema = createInsertSchema(helpDeskTickets).omit({ id: true, ticketNumber: true, createdAt: true, updatedAt: true });
export type InsertHelpDeskTicket = z.infer<typeof insertHelpDeskTicketSchema>;
export type HelpDeskTicket = typeof helpDeskTickets.$inferSelect;

// ── H&S Incident Reports (RIDDOR + Near Miss) ─────────────────────────────────

export const hsIncidents = pgTable("hs_incidents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  incidentDate: timestamp("incident_date").notNull(),
  location: text("location"),
  reportedBy: text("reported_by"),
  injuredPerson: text("injured_person"),
  injuredPersonType: text("injured_person_type"), // employee | contractor | visitor | member_of_public
  // Near miss fields
  isNearMiss: boolean("is_near_miss").default(false).notNull(),
  nearMissPotential: text("near_miss_potential"), // minor | serious | critical
  nearMissHazardType: text("near_miss_hazard_type"), // slip_trip_fall | struck_by_object | ...
  // RIDDOR fields
  riddorCategory: text("riddor_category"), // fatality | specified_injury | over_7_day | dangerous_occurrence | occupational_disease | not_riddor_reportable
  riddorReportingDeadline: timestamp("riddor_reporting_deadline"),
  riddorReportedAt: timestamp("riddor_reported_at"),
  riddorReference: text("riddor_reference"),
  riddorReminderSentAt: timestamp("riddor_reminder_sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertHsIncidentSchema = createInsertSchema(hsIncidents).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertHsIncident = z.infer<typeof insertHsIncidentSchema>;
export type HsIncident = typeof hsIncidents.$inferSelect;

// ── Fire Risk Assessments (RRO 2005) ─────────────────────────────────────────

export const fireRiskAssessments = pgTable("fire_risk_assessments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull().default("Fire Risk Assessment"),
  assessorName: text("assessor_name").notNull(),
  assessorCompany: text("assessor_company"),
  assessmentDate: text("assessment_date").notNull(), // YYYY-MM-DD
  nextReviewDate: text("next_review_date").notNull(), // YYYY-MM-DD
  documentUrl: text("document_url"),
  status: text("status").notNull().default("current"), // current | review_due | overdue | superseded
  findingsSummary: text("findings_summary"),
  reminderSentAt: timestamp("reminder_sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertFireRiskAssessmentSchema = createInsertSchema(fireRiskAssessments).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFireRiskAssessment = z.infer<typeof insertFireRiskAssessmentSchema>;
export type FireRiskAssessment = typeof fireRiskAssessments.$inferSelect;

// ── Compliance Certificate Register ───────────────────────────────────────────

export const complianceCertificateTypes = pgTable("compliance_certificate_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  certificateType: text("certificate_type").notNull(),
  displayName: text("display_name").notNull(),
  legalBasis: text("legal_basis"),
  frequency: text("frequency").notNull(),
  customDays: integer("custom_days"),
  isActive: boolean("is_active").default(true).notNull(),
  reminderDaysBefore: integer("reminder_days_before").default(30).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertComplianceCertificateTypeSchema = createInsertSchema(complianceCertificateTypes).omit({ id: true, createdAt: true });
export type InsertComplianceCertificateType = z.infer<typeof insertComplianceCertificateTypeSchema>;
export type ComplianceCertificateType = typeof complianceCertificateTypes.$inferSelect;

export const complianceCertificates = pgTable("compliance_certificates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  certificateTypeId: varchar("certificate_type_id").notNull().references(() => complianceCertificateTypes.id),
  certificateType: text("certificate_type").notNull(),
  issueDate: text("issue_date").notNull(),
  expiryDate: text("expiry_date"),
  nextDueDate: text("next_due_date"),
  referenceNumber: text("reference_number"),
  issuedBy: text("issued_by"),
  issuingCompany: text("issuing_company"),
  documentUrl: text("document_url"),
  fileName: text("file_name"),
  status: text("status").default("current").notNull(),
  linkedPpmWorkOrderId: varchar("linked_ppm_work_order_id"),
  uploadedBy: varchar("uploaded_by"),
  notes: text("notes"),
  isCurrent: boolean("is_current").default(true).notNull(),
  expiryAlertedAt: timestamp("expiry_alerted_at"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertComplianceCertificateSchema = createInsertSchema(complianceCertificates).omit({ id: true, createdAt: true });
export type InsertComplianceCertificate = z.infer<typeof insertComplianceCertificateSchema>;
export type ComplianceCertificate = typeof complianceCertificates.$inferSelect;

// ── Permit-to-Work ────────────────────────────────────────────────────────────

export const permitToWork = pgTable("permit_to_work", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  permitNumber: text("permit_number").notNull(),
  permitType: text("permit_type").notNull(),
  workDescription: text("work_description").notNull(),
  workLocation: text("work_location").notNull(),
  contractorCompanyId: varchar("contractor_company_id"),
  contractorCompanyName: text("contractor_company_name"),
  contractorWorkerId: varchar("contractor_worker_id"),
  contractorWorkerName: text("contractor_worker_name"),
  staffId: varchar("staff_id"),
  staffName: text("staff_name"),
  plannedStartDate: text("planned_start_date").notNull(),
  plannedStartTime: text("planned_start_time").notNull(),
  plannedEndDate: text("planned_end_date").notNull(),
  plannedEndTime: text("planned_end_time").notNull(),
  actualStartAt: timestamp("actual_start_at"),
  actualEndAt: timestamp("actual_end_at"),
  permitValidFrom: timestamp("permit_valid_from").notNull(),
  permitValidUntil: timestamp("permit_valid_until").notNull(),
  status: text("status").notNull().default("draft"),
  authorisedById: varchar("authorised_by_id"),
  authorisedByName: text("authorised_by_name"),
  authorisedAt: timestamp("authorised_at"),
  authNotes: text("auth_notes"),
  rejectedById: varchar("rejected_by_id"),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  closedById: varchar("closed_by_id"),
  closedByName: text("closed_by_name"),
  closedAt: timestamp("closed_at"),
  closureNotes: text("closure_notes"),
  workCompletedSatisfactorily: boolean("work_completed_satisfactorily"),
  suspendedById: varchar("suspended_by_id"),
  suspendedAt: timestamp("suspended_at"),
  suspensionReason: text("suspension_reason"),
  linkedPpmWorkOrderId: varchar("linked_ppm_work_order_id"),
  linkedIncidentId: varchar("linked_incident_id"),
  linkedComplianceCertId: varchar("linked_compliance_cert_id"),
  expiryAlertedAt: timestamp("expiry_alerted_at"),
  overdueClosureAlertedAt: timestamp("overdue_closure_alerted_at"),
  createdById: varchar("created_by_id"),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPermitToWorkSchema = createInsertSchema(permitToWork).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPermitToWork = z.infer<typeof insertPermitToWorkSchema>;
export type PermitToWork = typeof permitToWork.$inferSelect;

export const permitChecklist = pgTable("permit_checklist", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  permitId: varchar("permit_id").notNull().references(() => permitToWork.id),
  checklistSection: text("checklist_section").notNull(),
  itemDescription: text("item_description").notNull(),
  isRequired: boolean("is_required").default(true).notNull(),
  response: text("response"),
  respondedById: varchar("responded_by_id"),
  respondedAt: timestamp("responded_at"),
  notes: text("notes"),
  displayOrder: integer("display_order").default(0).notNull(),
});

export const insertPermitChecklistSchema = createInsertSchema(permitChecklist).omit({ id: true });
export type InsertPermitChecklist = z.infer<typeof insertPermitChecklistSchema>;
export type PermitChecklistItem = typeof permitChecklist.$inferSelect;

export const permitAttachments = pgTable("permit_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  permitId: varchar("permit_id").notNull().references(() => permitToWork.id),
  documentType: text("document_type").notNull(),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  uploadedById: varchar("uploaded_by_id"),
  uploadedByName: text("uploaded_by_name"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

export const insertPermitAttachmentSchema = createInsertSchema(permitAttachments).omit({ id: true, uploadedAt: true });
export type InsertPermitAttachment = z.infer<typeof insertPermitAttachmentSchema>;
export type PermitAttachment = typeof permitAttachments.$inferSelect;

export type BiostarDevice = typeof biostarDevices.$inferSelect;

// ─── Visit Reasons ────────────────────────────────────────────────────────────
export const visitReasons = pgTable("visit_reasons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  label: text("label").notNull(),
  instructions: text("instructions").default(""),
  requireHsAcceptance: boolean("require_hs_acceptance").default(false),
  hsContent: text("hs_content").default(""),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  appliesTo: text("applies_to").default("both"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertVisitReasonSchema = createInsertSchema(visitReasons).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVisitReason = z.infer<typeof insertVisitReasonSchema>;
export type VisitReason = typeof visitReasons.$inferSelect;

// ─── Audit & Inspection Engine ────────────────────────────────────────────────

export const auditTemplates = pgTable("audit_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull().default("safety"),
  frequency: text("frequency").notNull().default("monthly"),
  customDays: integer("custom_days"),
  estimatedMinutes: integer("estimated_minutes"),
  passScore: integer("pass_score").default(80),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAuditTemplateSchema = createInsertSchema(auditTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAuditTemplate = z.infer<typeof insertAuditTemplateSchema>;
export type AuditTemplate = typeof auditTemplates.$inferSelect;

export const auditTemplateItems = pgTable("audit_template_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull().references(() => auditTemplates.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  category: text("category"),
  requiresPhoto: boolean("requires_photo").default(false).notNull(),
  requiresNote: boolean("requires_note").default(false).notNull(),
  isCritical: boolean("is_critical").default(false).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAuditTemplateItemSchema = createInsertSchema(auditTemplateItems).omit({ id: true, createdAt: true });
export type InsertAuditTemplateItem = z.infer<typeof insertAuditTemplateItemSchema>;
export type AuditTemplateItem = typeof auditTemplateItems.$inferSelect;

export const auditRecords = pgTable("audit_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").references(() => auditTemplates.id, { onDelete: "set null" }),
  templateName: text("template_name").notNull(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  conductedBy: text("conducted_by").notNull(),
  conductedAt: timestamp("conducted_at"),
  scheduledDate: text("scheduled_date"),
  location: text("location"),
  status: text("status").notNull().default("scheduled"),
  overallScore: integer("overall_score"),
  passed: boolean("passed"),
  summary: text("summary"),
  accessToken: varchar("access_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  overdueAlertedAt: timestamp("overdue_alerted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAuditRecordSchema = createInsertSchema(auditRecords).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAuditRecord = z.infer<typeof insertAuditRecordSchema>;
export type AuditRecord = typeof auditRecords.$inferSelect;

export const auditRecordItems = pgTable("audit_record_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  auditId: varchar("audit_id").notNull().references(() => auditRecords.id, { onDelete: "cascade" }),
  templateItemId: varchar("template_item_id").references(() => auditTemplateItems.id, { onDelete: "set null" }),
  question: text("question").notNull(),
  isCritical: boolean("is_critical").default(false).notNull(),
  response: text("response"),
  note: text("note"),
  photoUrl: text("photo_url"),
  photoFileName: text("photo_file_name"),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAuditRecordItemSchema = createInsertSchema(auditRecordItems).omit({ id: true, createdAt: true });
export type InsertAuditRecordItem = z.infer<typeof insertAuditRecordItemSchema>;
export type AuditRecordItem = typeof auditRecordItems.$inferSelect;

export const auditCorrectiveActions = pgTable("audit_corrective_actions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  auditId: varchar("audit_id").notNull().references(() => auditRecords.id, { onDelete: "cascade" }),
  auditItemId: varchar("audit_item_id").references(() => auditRecordItems.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description"),
  priority: text("priority").notNull().default("medium"),
  assignedTo: text("assigned_to"),
  assignedEmail: text("assigned_email"),
  dueDate: text("due_date"),
  status: text("status").notNull().default("open"),
  closureNotes: text("closure_notes"),
  closureEvidenceUrl: text("closure_evidence_url"),
  closureEvidenceFileName: text("closure_evidence_file_name"),
  closedAt: timestamp("closed_at"),
  closedBy: text("closed_by"),
  overdueAlertedAt: timestamp("overdue_alerted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAuditCorrectiveActionSchema = createInsertSchema(auditCorrectiveActions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAuditCorrectiveAction = z.infer<typeof insertAuditCorrectiveActionSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Risk Assessment Builder
// ────────────────────────────────────────────────────────────────────────────

export const raBuilderAssessments = pgTable("ra_builder_assessments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  raType: text("ra_type").notNull().default("general"),
  status: text("status").notNull().default("draft"),
  taskDescription: text("task_description"),
  location: text("location"),
  department: text("department"),
  preparedBy: text("prepared_by"),
  reviewedBy: text("reviewed_by"),
  approvedBy: text("approved_by"),
  assessmentDate: text("assessment_date"),
  nextReviewDate: text("next_review_date"),
  typeMetadata: text("type_metadata").default("{}"),
  notes: text("notes"),
  linkedRamsDocumentId: varchar("linked_rams_document_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertRaBuilderAssessmentSchema = createInsertSchema(raBuilderAssessments).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRaBuilderAssessment = z.infer<typeof insertRaBuilderAssessmentSchema>;
export type RaBuilderAssessment = typeof raBuilderAssessments.$inferSelect;

export const raBuilderHazards = pgTable("ra_builder_hazards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assessmentId: varchar("assessment_id").notNull().references(() => raBuilderAssessments.id, { onDelete: "cascade" }),
  hazardDescription: text("hazard_description").notNull(),
  affectedPersons: text("affected_persons"),
  existingControls: text("existing_controls"),
  likelihood: integer("likelihood").notNull().default(3),
  severity: integer("severity").notNull().default(3),
  riskRating: integer("risk_rating").notNull().default(9),
  additionalControls: text("additional_controls"),
  residualLikelihood: integer("residual_likelihood").default(2),
  residualSeverity: integer("residual_severity").default(2),
  residualRiskRating: integer("residual_risk_rating").default(4),
  actionBy: text("action_by"),
  actionDate: text("action_date"),
  actionStatus: text("action_status").default("open"),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRaBuilderHazardSchema = createInsertSchema(raBuilderHazards).omit({ id: true, createdAt: true });
export type InsertRaBuilderHazard = z.infer<typeof insertRaBuilderHazardSchema>;
export type RaBuilderHazard = typeof raBuilderHazards.$inferSelect;
export type AuditCorrectiveAction = typeof auditCorrectiveActions.$inferSelect;