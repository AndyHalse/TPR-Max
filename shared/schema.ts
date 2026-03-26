import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, doublePrecision, numeric, index, check } from "drizzle-orm/pg-core";
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
  maxVisitorsPerMonth: integer("max_visitors_per_month").default(1000),
  // Onboarding & Support
  onboardingCompleted: boolean("onboarding_completed").default(false),
  supportContactEmail: text("support_contact_email"),
  // Security & API
  apiKeyEnabled: boolean("api_key_enabled").default(false),
  apiKey: text("api_key"), // For customer integrations
  // Stripe Integration
  stripeCustomerId: text("stripe_customer_id").unique(), // Stripe customer ID for billing
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  // Critical indexes for customer management
  companyNameIdx: index("customers_company_name_idx").on(table.companyName),
  slugIdx: index("customers_slug_idx").on(table.slug),
  isActiveIdx: index("customers_is_active_idx").on(table.isActive),
}));

// Stripe Webhook Events - Critical for billing idempotency and replay safety
export const stripeWebhookEvents = pgTable("stripe_webhook_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Stripe event identification  
  eventId: text("event_id").notNull().unique(), // Stripe event ID for deduplication
  eventType: text("event_type").notNull(), // invoice.payment_succeeded, customer.subscription.updated, etc.
  customerId: varchar("customer_id").references(() => customers.id), // NULL for non-customer events
  // Event payload and processing
  payloadHash: text("payload_hash").notNull(), // SHA-256 hash for integrity verification
  rawPayload: text("raw_payload").notNull(), // Full Stripe webhook payload as JSON
  // Processing status
  status: text("status").notNull().default("pending"), // pending, processed, failed, ignored
  processedAt: timestamp("processed_at"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0).notNull(),
  maxRetries: integer("max_retries").default(3).notNull(),
  // Stripe metadata
  apiVersion: text("api_version"), // Stripe API version
  livemode: boolean("livemode").default(false).notNull(),
  // Audit trail
  webhookEndpoint: text("webhook_endpoint"), // Which endpoint received this event
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  // Critical indexes for webhook processing performance
  eventIdIdx: index("stripe_webhook_events_event_id_idx").on(table.eventId),
  statusIdx: index("stripe_webhook_events_status_idx").on(table.status),
  customerIdIdx: index("stripe_webhook_events_customer_id_idx").on(table.customerId),
  createdAtIdx: index("stripe_webhook_events_created_at_idx").on(table.createdAt),
}));

// Customer API Keys - Enhanced for proper key management and security
export const customerApiKeys: any = pgTable("customer_api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  // Key identification and metadata
  keyName: text("key_name").notNull(), // User-friendly name like "Production API", "Mobile App"
  keyDescription: text("key_description"), // Optional description of key purpose
  serviceType: text("service_type").notNull().default("api"), // api, webhook, integration, mobile
  // Enhanced key management fields
  keyVersion: integer("key_version").notNull().default(1), // For key rotation tracking
  kmsKeyId: text("kms_key_id"), // AWS KMS or similar key management service ID
  last4: text("last4").notNull(), // Last 4 characters for display/identification (NOT for security)
  encryptedKey: text("encrypted_key").notNull(), // AES-256 encrypted actual API key
  initializationVector: text("initialization_vector").notNull(), // IV for AES encryption
  authTag: text("auth_tag").notNull(), // GCM authentication tag for encryption integrity
  keyFingerprint: text("key_fingerprint").notNull().unique(), // SHA-256 hash for duplicate detection
  // Security and access control
  permissions: text("permissions").array().notNull().default(["read"]), // ["read", "write", "admin", "billing"]
  allowedOrigins: text("allowed_origins").array().default([]), // CORS origins for browser keys
  ipWhitelist: text("ip_whitelist").array().default([]), // IP addresses allowed to use this key
  rateLimit: integer("rate_limit").default(1000), // Requests per hour limit
  // Status and lifecycle
  status: text("status").notNull().default("active"), // active, inactive, revoked, expired
  expiresAt: timestamp("expires_at"), // Optional expiration date
  lastUsedAt: timestamp("last_used_at"), // Track actual usage for security monitoring
  usageCount: integer("usage_count").default(0), // Total requests made with this key
  // Key rotation and security audit
  previousKeyId: varchar("previous_key_id").references(() => customerApiKeys.id), // For rotation tracking
  rotationScheduledFor: timestamp("rotation_scheduled_for"), // Automatic rotation date
  decryptAuditLog: text("decrypt_audit_log").array().default([]), // Audit log of decrypt operations
  // Admin tracking
  createdBy: varchar("created_by"), // User ID who created the key
  revokedBy: varchar("revoked_by"), // User ID who revoked the key
  revokedAt: timestamp("revoked_at"),
  revocationReason: text("revocation_reason"), // Why was the key revoked
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  // Critical indexes for API key lookups
  customerIdIdx: index("customer_api_keys_customer_id_idx").on(table.customerId),
  fingerprintIdx: index("customer_api_keys_fingerprint_idx").on(table.keyFingerprint),
  statusIdx: index("customer_api_keys_status_idx").on(table.status),
  lastUsedIdx: index("customer_api_keys_last_used_at_idx").on(table.lastUsedAt),
}));

// Customer API Key Access Logs - Security auditing for all API key usage
export const customerApiKeyAccessLogs = pgTable("customer_api_key_access_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  apiKeyId: varchar("api_key_id").notNull().references(() => customerApiKeys.id),
  // Request details
  requestMethod: text("request_method").notNull(), // GET, POST, PUT, DELETE
  requestPath: text("request_path").notNull(), // API endpoint accessed
  requestHeaders: text("request_headers"), // JSON of relevant headers
  userAgent: text("user_agent"),
  // Network and security info
  ipAddress: text("ip_address").notNull(),
  country: text("country"), // GeoIP country
  city: text("city"), // GeoIP city
  // Response details
  responseStatus: integer("response_status").notNull(), // HTTP status code
  responseTime: integer("response_time"), // Response time in milliseconds
  bytesTransferred: integer("bytes_transferred"), // Response size in bytes
  // Rate limiting and quotas
  rateLimitHit: boolean("rate_limit_hit").default(false).notNull(),
  quotaUsed: integer("quota_used"), // How much of monthly quota was used
  quotaRemaining: integer("quota_remaining"), // How much quota remains
  // Security flags
  suspiciousActivity: boolean("suspicious_activity").default(false).notNull(),
  blockedReason: text("blocked_reason"), // If request was blocked, why?
  // Billing and usage tracking
  billableOperation: boolean("billable_operation").default(true).notNull(),
  operationCost: numeric("operation_cost", { precision: 10, scale: 4 }).default("0.0000"), // Cost in credits/dollars
  // Timestamps
  accessedAt: timestamp("accessed_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Critical indexes for security monitoring and billing
  customerIdIdx: index("customer_api_key_access_logs_customer_id_idx").on(table.customerId),
  apiKeyIdIdx: index("customer_api_key_access_logs_api_key_id_idx").on(table.apiKeyId),
  accessedAtIdx: index("customer_api_key_access_logs_accessed_at_idx").on(table.accessedAt),
  ipAddressIdx: index("customer_api_key_access_logs_ip_address_idx").on(table.ipAddress),
  suspiciousIdx: index("customer_api_key_access_logs_suspicious_idx").on(table.suspiciousActivity),
  responseStatusIdx: index("customer_api_key_access_logs_response_status_idx").on(table.responseStatus),
}));

export const staff = pgTable("staff", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // CUSTOMER ISOLATION: Each staff member belongs to a specific customer
  customerId: varchar("customer_id").notNull().references(() => customers.id),
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
  fireMarshalUrlId: text("fire_marshal_url_id").unique(), // Unique permanent URL ID for Fire Marshal access (e.g., /fire-marshal/abc123xyz)
  emergencyToken: text("emergency_token"), // DEPRECATED: Legacy token system, use fireMarshalUrlId instead
  emergencyTokenExpires: timestamp("emergency_token_expires"), // DEPRECATED: Legacy token expiration
  userId: varchar("user_id").references(() => users.id), // Link to user account
  biostarUserId: text("biostar_user_id").unique(), // Biostar 2 user ID for access control sync
  qrCode: text("qr_code").unique(),
  // Induction tracking
  inductionCompleted: boolean("induction_completed").default(false).notNull(),
  inductionCompletedAt: timestamp("induction_completed_at"),
  // Voice notification settings
  phoneNumber: text("phone_number"),
  voiceNotificationsEnabled: boolean("voice_notifications_enabled").default(true).notNull(),
  emailNotificationsEnabled: boolean("email_notifications_enabled").default(true).notNull(),
  preferredNotificationMethod: text("preferred_notification_method").default("email"), // email, voice, both
  voiceLanguage: text("voice_language").default("en-GB"), // Language code for 8x8 TTS
  voiceProfile: text("voice_profile").default("en-GB-Standard-A"), // Voice profile for 8x8 TTS
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

// Voice Notification Logs - Track all voice notification attempts and results
export const voiceNotificationLogs = pgTable("voice_notification_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // CUSTOMER ISOLATION: Each voice notification belongs to a specific customer
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  // Notification details
  staffId: varchar("staff_id").notNull().references(() => staff.id),
  visitorId: varchar("visitor_id").references(() => visitors.id),
  notificationType: text("notification_type").notNull(), // visitor_arrival, emergency_alert, system_notification
  // Message content
  messageText: text("message_text").notNull(),
  voiceLanguage: text("voice_language").default("en-GB").notNull(),
  voiceProfile: text("voice_profile").default("en-GB-Standard-A").notNull(),
  // Phone call details
  recipientPhoneNumber: text("recipient_phone_number").notNull(),
  sourcePhoneNumber: text("source_phone_number"), // 8x8 source number used
  // 8x8 API Details
  eightByEightCallId: text("eight_by_eight_call_id"), // 8x8 call ID for tracking
  eightByEightCallflowId: text("eight_by_eight_callflow_id"), // Callflow ID from 8x8
  // Status and Results
  status: text("status").notNull().default("pending"), // pending, sent, delivered, failed, busy, no_answer
  deliveryAttempts: integer("delivery_attempts").default(1).notNull(),
  lastAttemptAt: timestamp("last_attempt_at").defaultNow().notNull(),
  deliveredAt: timestamp("delivered_at"),
  failedAt: timestamp("failed_at"),
  // Error handling
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  // Call duration and metrics
  callDurationSeconds: integer("call_duration_seconds"),
  audioPlayedSuccessfully: boolean("audio_played_successfully").default(false),
  // Retry logic
  maxRetries: integer("max_retries").default(3).notNull(),
  retryCount: integer("retry_count").default(0).notNull(),
  nextRetryAt: timestamp("next_retry_at"),
  // Billing and cost tracking
  estimatedCost: numeric("estimated_cost", { precision: 10, scale: 4 }).default("0.0000"),
  costCurrency: text("cost_currency").default("GBP"),
  // Audit and compliance
  triggeredBy: text("triggered_by"), // system_event, manual_trigger, emergency_protocol
  triggeredByUserId: varchar("triggered_by_user_id"), // Admin who manually triggered
  complianceFlags: text("compliance_flags").array().default([]), // GDPR compliance, call recording consent
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  // Critical indexes for voice notification performance and reporting
  customerIdIdx: index("voice_notification_logs_customer_id_idx").on(table.customerId),
  staffIdIdx: index("voice_notification_logs_staff_id_idx").on(table.staffId),
  statusIdx: index("voice_notification_logs_status_idx").on(table.status),
  createdAtIdx: index("voice_notification_logs_created_at_idx").on(table.createdAt),
  eightByEightCallIdIdx: index("voice_notification_logs_8x8_call_id_idx").on(table.eightByEightCallId),
  deliveryAttemptsIdx: index("voice_notification_logs_delivery_attempts_idx").on(table.deliveryAttempts),
}));

// Evacuations table for tracking emergency evacuations
export const evacuations = pgTable("evacuations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  evacuationId: text("evacuation_id").notNull().unique(),
  status: text("status").notNull().default("active"), // active, completed, cancelled
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  activatedBy: text("activated_by").notNull(),
  totalPeopleOnSite: integer("total_people_on_site").notNull(),
  totalAccountedFor: integer("total_accounted_for").default(0).notNull(),
  musterPoints: text("muster_points").array().notNull(),
  isDrill: boolean("is_drill").default(false).notNull(),
  notes: text("notes"),
  reportPdfUrl: text("report_pdf_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  customerIdIdx: index("evacuations_customer_id_idx").on(table.customerId),
  statusIdx: index("evacuations_status_idx").on(table.status),
  evacuationIdIdx: index("evacuations_evacuation_id_idx").on(table.evacuationId),
}));

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

// ==============================================
// PROFESSIONAL SAAS INFRASTRUCTURE TABLES
// ==============================================

// Subscription Plans - Define available SaaS plans
export const subscriptionPlans = pgTable("subscription_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(), // "Starter", "Professional", "Enterprise"
  displayName: text("display_name").notNull(), // "VisiGate Pro Starter"
  description: text("description"),
  // Pricing - Using numeric for proper financial calculations
  monthlyPrice: numeric("monthly_price", { precision: 10, scale: 2 }).notNull(), // Precise decimal handling for billing
  yearlyPrice: numeric("yearly_price", { precision: 10, scale: 2 }), // Optional yearly pricing
  currency: text("currency").notNull().default("GBP"),
  // Feature Limits
  maxVisitorsPerMonth: integer("max_visitors_per_month").notNull().default(1000),
  maxStaff: integer("max_staff").notNull().default(50),
  maxMeetingRooms: integer("max_meeting_rooms").notNull().default(10),
  maxStorageGb: integer("max_storage_gb").notNull().default(10),
  // Feature Flags - JSON array of enabled features
  features: text("features").array().notNull().default([]), // ["api_access", "advanced_reporting", "custom_branding"]
  // Plan Configuration
  isActive: boolean("is_active").notNull().default(true),
  isPopular: boolean("is_popular").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  // Trial Configuration
  trialDays: integer("trial_days").notNull().default(14),
  // Stripe Integration
  stripeProductId: text("stripe_product_id").unique(),
  stripePriceIdMonthly: text("stripe_price_id_monthly").unique(),
  stripePriceIdYearly: text("stripe_price_id_yearly").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Customer Subscriptions - Track customer subscription status
export const subscriptions = pgTable("subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  planId: varchar("plan_id").notNull().references(() => subscriptionPlans.id),
  // Subscription Status
  status: text("status").notNull().default("active"), // active, past_due, canceled, unpaid, trialing, incomplete
  // Billing Cycle
  currentPeriodStart: timestamp("current_period_start").notNull(),
  currentPeriodEnd: timestamp("current_period_end").notNull(),
  billingCycle: text("billing_cycle").notNull().default("monthly"), // monthly, yearly
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  canceledAt: timestamp("canceled_at"),
  cancellationReason: text("cancellation_reason"),
  // Trial Management
  trialStart: timestamp("trial_start"),
  trialEnd: timestamp("trial_end"),
  trialExtensions: integer("trial_extensions").default(0),
  // Payment Integration
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  stripeCustomerId: text("stripe_customer_id"),
  // Usage-based billing
  meteredUsage: boolean("metered_usage").default(false),
  lastUsageReset: timestamp("last_usage_reset"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Customer Invoices - Track billing and payment history
export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  subscriptionId: varchar("subscription_id").references(() => subscriptions.id),
  // Invoice Details
  invoiceNumber: text("invoice_number").notNull().unique(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(), // Total amount with proper decimal precision
  currency: text("currency").notNull().default("GBP"),
  tax: numeric("tax", { precision: 10, scale: 2 }).default("0.00"), // Tax amount with precision
  taxRate: numeric("tax_rate", { precision: 5, scale: 4 }).default("0.0000"), // Tax rate as decimal (e.g., 0.2000 for 20%)
  // Payment Status
  status: text("status").notNull().default("pending"), // pending, paid, failed, refunded, voided
  dueDate: timestamp("due_date").notNull(),
  paidAt: timestamp("paid_at"),
  // Stripe Integration
  stripeInvoiceId: text("stripe_invoice_id").unique(),
  stripeChargeId: text("stripe_charge_id"),
  // Invoice Line Items (JSON)
  lineItems: text("line_items").notNull(), // JSON array of billing items
  // Payment Details
  paymentMethod: text("payment_method"), // card, bank_transfer, etc.
  paymentMethodLast4: text("payment_method_last4"),
  // Refund tracking
  refundAmount: numeric("refund_amount", { precision: 10, scale: 2 }).default("0.00"),
  refundReason: text("refund_reason"),
  refundedAt: timestamp("refunded_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Customer Payment Methods - Store customer payment information
export const paymentMethods = pgTable("payment_methods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  // Payment Method Details
  type: text("type").notNull(), // card, bank_account, paypal
  cardBrand: text("card_brand"), // visa, mastercard, amex, etc.
  cardLast4: text("card_last4"),
  cardExpMonth: integer("card_exp_month"),
  cardExpYear: integer("card_exp_year"),
  cardCountry: text("card_country"),
  // Bank Details (for bank transfers)
  bankName: text("bank_name"),
  bankLast4: text("bank_last4"),
  // Status
  isDefault: boolean("is_default").notNull().default(false),
  isExpired: boolean("is_expired").notNull().default(false),
  // Stripe Integration
  stripePaymentMethodId: text("stripe_payment_method_id").unique(),
  // Security
  fingerprint: text("fingerprint"), // Stripe fingerprint for duplicate detection
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Usage Tracking - Monitor customer usage against plan limits
export const usageTracking = pgTable("usage_tracking", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  // Time Period
  period: text("period").notNull(), // "2024-09" for monthly tracking
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  // Usage Metrics
  visitorsCount: integer("visitors_count").notNull().default(0),
  staffCount: integer("staff_count").notNull().default(0),
  meetingRoomsCount: integer("meeting_rooms_count").notNull().default(0),
  tenantsCount: integer("tenants_count").notNull().default(0),
  storageUsedMb: integer("storage_used_mb").notNull().default(0),
  // API Usage
  apiRequestsCount: integer("api_requests_count").notNull().default(0),
  emailsSent: integer("emails_sent").notNull().default(0),
  smsSent: integer("sms_sent").notNull().default(0),
  // Advanced Features Usage
  reportsGenerated: integer("reports_generated").notNull().default(0),
  documentsProcessed: integer("documents_processed").notNull().default(0),
  biometricScans: integer("biometric_scans").notNull().default(0),
  // Overage Tracking
  isOverLimit: boolean("is_over_limit").notNull().default(false),
  overageCharges: numeric("overage_charges", { precision: 10, scale: 2 }).default("0.00"), // Additional charges for overages
  // Last Updated
  lastCalculated: timestamp("last_calculated").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Developer Access Logs - Track developer/support access to customer data
export const developerAccessLogs = pgTable("developer_access_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Developer/Support User
  developerId: varchar("developer_id").notNull(), // Internal staff user ID
  developerName: text("developer_name").notNull(),
  developerEmail: text("developer_email").notNull(),
  // Customer Accessed
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  customerName: text("customer_name").notNull(), // Store for audit trail
  // Access Details
  action: text("action").notNull(), // "database_access", "settings_view", "data_export", "debug_session"
  reason: text("reason").notNull(), // Required justification for access
  accessLevel: text("access_level").notNull(), // "read_only", "limited_write", "full_access"
  // Technical Details
  ipAddress: text("ip_address").notNull(),
  userAgent: text("user_agent"),
  sessionDuration: text("session_duration"), // Duration of access in minutes
  // Data Accessed
  tablesAccessed: text("tables_accessed").array().default([]), // List of database tables accessed
  dataExported: boolean("data_exported").default(false),
  exportDetails: text("export_details"), // What data was exported
  // Approval & Review
  approvedBy: text("approved_by"), // Manager who approved the access
  reviewedAt: timestamp("reviewed_at"),
  // Session Management
  sessionStart: timestamp("session_start").defaultNow().notNull(),
  sessionEnd: timestamp("session_end"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Support Sessions - Track customer support interactions
export const supportSessions = pgTable("support_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  // Support Staff
  supportUserId: varchar("support_user_id").notNull(), // Internal support staff ID
  supportUserName: text("support_user_name").notNull(),
  supportUserEmail: text("support_user_email").notNull(),
  // Session Details
  sessionType: text("session_type").notNull(), // "chat", "call", "screenshare", "email", "emergency"
  priority: text("priority").notNull().default("medium"), // "low", "medium", "high", "urgent"
  category: text("category").notNull(), // "technical", "billing", "onboarding", "feature_request"
  reason: text("reason").notNull(),
  // Session Management
  status: text("status").notNull().default("active"), // "active", "resolved", "escalated", "closed"
  sessionStart: timestamp("session_start").defaultNow().notNull(),
  sessionEnd: timestamp("session_end"),
  durationMinutes: integer("duration_minutes"),
  // Customer Satisfaction
  customerRating: integer("customer_rating"), // 1-5 rating
  customerFeedback: text("customer_feedback"),
  // Technical Details
  issueResolved: boolean("issue_resolved").default(false),
  followUpRequired: boolean("follow_up_required").default(false),
  followUpDate: timestamp("follow_up_date"),
  // Notes & Documentation
  notes: text("notes"), // Internal support notes
  resolution: text("resolution"), // How the issue was resolved
  // Integration Details
  zendeskTicketId: text("zendesk_ticket_id"), // If using Zendesk
  slackThreadId: text("slack_thread_id"), // If using Slack for internal coordination
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Customer Onboarding Progress - Track customer onboarding journey
export const onboardingProgress = pgTable("onboarding_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  // Progress Tracking
  currentStep: integer("current_step").notNull().default(1),
  totalSteps: integer("total_steps").notNull().default(10),
  stepsCompleted: text("steps_completed").array().notNull().default([]), // Array of completed step IDs
  // Step Details
  currentStepName: text("current_step_name"), // "Company Setup", "User Creation", "Integration Setup"
  currentStepDescription: text("current_step_description"),
  // Completion Status
  isCompleted: boolean("is_completed").notNull().default(false),
  completedAt: timestamp("completed_at"),
  // Onboarding Experience
  assignedOnboardingSpecialist: text("assigned_onboarding_specialist"),
  scheduledCallAt: timestamp("scheduled_call_at"),
  onboardingCallCompleted: boolean("onboarding_call_completed").default(false),
  // Customer Feedback
  experienceRating: integer("experience_rating"), // 1-5 rating of onboarding experience
  experienceFeedback: text("experience_feedback"),
  // Obstacles & Support
  stuckOnStep: integer("stuck_on_step"), // Step where customer is struggling
  supportTicketsCreated: integer("support_tickets_created").default(0),
  // Timeline Tracking
  expectedCompletionDate: timestamp("expected_completion_date"),
  actualCompletionDate: timestamp("actual_completion_date"),
  onboardingStarted: timestamp("onboarding_started").defaultNow().notNull(),
  lastActivityAt: timestamp("last_activity_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Trial Tracking - Monitor trial usage and conversion
export const trialTracking = pgTable("trial_tracking", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  subscriptionId: varchar("subscription_id").references(() => subscriptions.id),
  // Trial Period
  trialStart: timestamp("trial_start").notNull(),
  trialEnd: timestamp("trial_end").notNull(),
  originalTrialDays: integer("original_trial_days").notNull().default(14),
  // Extensions
  trialExtensions: integer("trial_extensions").notNull().default(0),
  totalExtensionDays: integer("total_extension_days").notNull().default(0),
  extensionReason: text("extension_reason"), // Reason for trial extension
  // Usage During Trial
  visitorsCreatedDuringTrial: integer("visitors_created_during_trial").default(0),
  staffCreatedDuringTrial: integer("staff_created_during_trial").default(0),
  loginsDuringTrial: integer("logins_during_trial").default(0),
  lastLoginDuringTrial: timestamp("last_login_during_trial"),
  // Feature Adoption
  featuresUsed: text("features_used").array().default([]), // Features customer explored during trial
  integrationsConnected: integer("integrations_connected").default(0),
  // Engagement Metrics
  daysActive: integer("days_active").default(0), // Number of days customer was active during trial
  supportInteractions: integer("support_interactions").default(0),
  documentsUploaded: integer("documents_uploaded").default(0),
  // Conversion Tracking
  hasConverted: boolean("has_converted").default(false),
  conversionDate: timestamp("conversion_date"),
  convertedToPlan: varchar("converted_to_plan").references(() => subscriptionPlans.id),
  // Communication
  reminderEmailsSent: integer("reminder_emails_sent").default(0),
  lastReminderSent: timestamp("last_reminder_sent"),
  // Trial Outcome
  trialOutcome: text("trial_outcome"), // "converted", "expired", "cancelled", "extended"
  cancellationReason: text("cancellation_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Customer schema exports
export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Customer Onboarding API Schemas
export const customerOnboardingRequestSchema = z.object({
  // Company Details
  companyName: z.string()
    .min(2, "Company name must be at least 2 characters")
    .max(100, "Company name must be less than 100 characters")
    .regex(/^[a-zA-Z0-9\s&.-]+$/, "Company name contains invalid characters"),
  contactEmail: z.string()
    .email("Valid email address required")
    .max(255, "Email address too long"),
  
  // Admin User Details
  adminUsername: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username must be less than 50 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, underscores, and hyphens"),
  adminEmail: z.string()
    .email("Valid admin email address required")
    .max(255, "Admin email address too long"),
  adminPassword: z.string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be less than 128 characters")
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "Password must contain at least one lowercase letter, one uppercase letter, and one number"),
  adminFirstName: z.string()
    .min(1, "First name is required")
    .max(50, "First name must be less than 50 characters"),
  adminLastName: z.string()
    .min(1, "Last name is required")
    .max(50, "Last name must be less than 50 characters"),
  
  // Subscription & Trial Configuration
  planType: z.enum(["trial", "enterprise"])
    .default("trial"),
  trialDays: z.number()
    .min(0, "Trial days cannot be negative")
    .max(90, "Trial days cannot exceed 90")
    .default(14),
  
  // Optional Company Configuration
  industry: z.string()
    .max(100, "Industry must be less than 100 characters")
    .optional(),
  employeeCount: z.number()
    .min(1, "Employee count must be at least 1")
    .max(10000, "Employee count cannot exceed 10,000")
    .optional(),
  address: z.string()
    .max(500, "Address must be less than 500 characters")
    .optional(),
  phone: z.string()
    .max(20, "Phone number must be less than 20 characters")
    .optional(),
  website: z.string()
    .url("Must be a valid website URL")
    .max(255, "Website URL must be less than 255 characters")
    .optional(),
  
  // System Configuration
  timezone: z.string()
    .max(50, "Timezone must be less than 50 characters")
    .default("Europe/London"),
  currency: z.string()
    .length(3, "Currency must be a 3-letter code")
    .regex(/^[A-Z]{3}$/, "Currency must be uppercase 3-letter code")
    .default("GBP"),
  
  // Billing Configuration
  billingCycle: z.enum(["monthly", "yearly"]).default("monthly").optional(),
  createSubscription: z.boolean().default(true).optional(),
});

export const customerOnboardingResponseSchema = z.object({
  success: z.boolean(),
  customerId: z.string(),
  customer: z.object({
    id: z.string(),
    companyName: z.string(),
    slug: z.string(),
    contactEmail: z.string(),
    isActive: z.boolean(),
    onboardingCompleted: z.boolean(),
    planType: z.string(),
    trialExpiresAt: z.date().optional(),
  }),
  adminUser: z.object({
    id: z.string(),
    username: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
    accessLevel: z.string(),
  }),
  loginUrl: z.string(),
  credentials: z.object({
    companyName: z.string(),
    username: z.string(),
    temporaryPassword: z.string().optional(), // Only included if password was auto-generated
  }),
  message: z.string(),
});

export const customerOnboardingErrorSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  code: z.enum([
    "VALIDATION_ERROR",
    "COMPANY_EXISTS", 
    "ADMIN_USER_EXISTS",
    "DATABASE_PROVISIONING_FAILED",
    "USER_CREATION_FAILED",
    "SETTINGS_INITIALIZATION_FAILED",
    "ROLLBACK_FAILED",
    "INTERNAL_ERROR"
  ]),
  details: z.any().optional(),
  partialState: z.object({
    customerCreated: z.boolean(),
    databaseProvisioned: z.boolean(),
    adminUserCreated: z.boolean(),
    settingsInitialized: z.boolean(),
  }).optional(),
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

// Customer Onboarding API Types
export type CustomerOnboardingRequest = z.infer<typeof customerOnboardingRequestSchema>;
export type CustomerOnboardingResponse = z.infer<typeof customerOnboardingResponseSchema>;
export type CustomerOnboardingError = z.infer<typeof customerOnboardingErrorSchema>;

export const insertStaffAttendanceHistorySchema = createInsertSchema(staffAttendanceHistory).omit({
  id: true,
  createdAt: true,
  durationMinutes: true,
});

export type StaffAttendanceHistory = typeof staffAttendanceHistory.$inferSelect;
export type InsertStaffAttendanceHistory = z.infer<typeof insertStaffAttendanceHistorySchema>;

// ==============================================
// NEW SaaS INFRASTRUCTURE ZOD SCHEMAS  
// ==============================================

// Stripe Webhook Event schemas
export const insertStripeWebhookEventSchema = createInsertSchema(stripeWebhookEvents).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertStripeWebhookEvent = z.infer<typeof insertStripeWebhookEventSchema>;
export type StripeWebhookEvent = typeof stripeWebhookEvents.$inferSelect;

// Customer API Key schemas with enhanced validation
export const insertCustomerApiKeySchema = createInsertSchema(customerApiKeys).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  keyFingerprint: true, // Generated server-side
  encryptedKey: true, // Generated server-side
  initializationVector: true, // Generated server-side
  usageCount: true, // Updated server-side
  lastUsedAt: true, // Updated server-side
}).extend({
  keyName: z.string().min(1).max(100, "Key name must be 1-100 characters"),
  keyDescription: z.string().max(500, "Description must be under 500 characters").optional(),
  serviceType: z.enum(["api", "webhook", "integration", "mobile"]).default("api"),
  permissions: z.array(z.enum(["read", "write", "admin", "billing"])).min(1, "At least one permission required"),
  allowedOrigins: z.array(z.string().url("Must be valid URL")).optional(),
  ipWhitelist: z.array(z.string().ip("Must be valid IP address")).optional(),
  rateLimit: z.number().min(1).max(100000, "Rate limit must be 1-100,000 requests").default(1000),
  status: z.enum(["active", "inactive", "revoked", "expired"]).default("active"),
  expiresAt: z.date().optional(),
});
export type InsertCustomerApiKey = z.infer<typeof insertCustomerApiKeySchema>;
export type CustomerApiKey = typeof customerApiKeys.$inferSelect;

// Customer API Key Access Log schemas
export const insertCustomerApiKeyAccessLogSchema = createInsertSchema(customerApiKeyAccessLogs).omit({
  id: true,
  createdAt: true,
  accessedAt: true, // Set server-side
}).extend({
  requestMethod: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"]),
  requestPath: z.string().min(1, "Request path is required"),
  responseStatus: z.number().min(100).max(599, "Must be valid HTTP status code"),
  responseTime: z.number().min(0, "Response time cannot be negative").optional(),
  bytesTransferred: z.number().min(0, "Bytes transferred cannot be negative").optional(),
  operationCost: z.string().refine((val) => {
    const num = parseFloat(val);
    return !isNaN(num) && num >= 0;
  }, "Must be a valid positive decimal number").optional(),
  ipAddress: z.string().ip("Must be valid IP address"),
  country: z.string().length(2, "Must be 2-letter country code").optional(),
  city: z.string().max(100, "City name too long").optional(),
});
export type InsertCustomerApiKeyAccessLog = z.infer<typeof insertCustomerApiKeyAccessLogSchema>;
export type CustomerApiKeyAccessLog = typeof customerApiKeyAccessLogs.$inferSelect;



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
  firstName: text("first_name"),
  lastName: text("last_name"),
  isActive: boolean("is_active").default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// REMOVED: Company Settings moved to isolatedSchema.ts for proper customer isolation
// Each customer now gets their own database with companySettings table (no customerId field needed)
// This prevents schema conflicts and ensures true multi-tenant isolation

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
  customerId: varchar("customer_id").notNull().references(() => customers.id),
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

// REMOVED: Company Settings schema moved to isolatedSchema.ts for proper customer isolation

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
  customerId: true,
  qrCode: true,
  isCheckedIn: true,
  checkedInAt: true,
  visitorId: true,
  emailSent: true,
  emailSentAt: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEvacuationsSchema = createInsertSchema(evacuations).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertEvacuationAccountabilitySchema = createInsertSchema(evacuationAccountability).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertUserInvitation = z.infer<typeof insertUserInvitationSchema>;
export type InsertEvacuations = z.infer<typeof insertEvacuationsSchema>;
export type InsertEvacuationAccountability = z.infer<typeof insertEvacuationAccountabilitySchema>;
export type User = typeof users.$inferSelect;
export type SelectEvacuations = typeof evacuations.$inferSelect;
export type SelectEvacuationAccountability = typeof evacuationAccountability.$inferSelect;
export type UserInvitation = typeof userInvitations.$inferSelect;
// REMOVED: CompanySettings types moved to isolatedSchema.ts for proper customer isolation
export type PrinterConfiguration = typeof printerConfigurations.$inferSelect;
export type InsertPrinterConfiguration = z.infer<typeof insertPrinterConfigurationSchema>;
export type Report = typeof reports.$inferSelect;
export type InsertReport = z.infer<typeof insertReportSchema>;
export type PreBooking = typeof preBookings.$inferSelect;
export type InsertPreBooking = z.infer<typeof insertPreBookingSchema>;

// Contractor Companies table
export const contractorCompanies = pgTable("contractor_companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // CUSTOMER ISOLATION: Each contractor company belongs to a specific customer
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  name: text("company_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  address: text("address"),
  postcode: text("postcode"), // Separate postcode for reporting
  // Split contact person into separate fields for consistency
  contactFirstName: text("contact_first_name").notNull(),
  contactLastName: text("contact_last_name").notNull(),
  website: text("website"), // Company website URL
  description: text("description"), // Company description
  industry: text("industry"), // Construction, Engineering, Manufacturing, etc.
  status: text("status").notNull().default("pending"), // pending, approved, suspended
  complianceScore: text("compliance_score").default("0"), // Stored as text for flexibility
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
  invitedBy: varchar("invited_by").references(() => users.id),
  onboardingCompleted: boolean("onboarding_completed").default(false),
  portalAccessEnabled: boolean("portal_access_enabled").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Help System Tables for comprehensive customer support
export const helpCategories = pgTable("help_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // CUSTOMER ISOLATION: Each help category can be global or customer-specific
  customerId: varchar("customer_id").references(() => customers.id), // NULL for global categories
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon").default("HelpCircle"), // Lucide icon name
  color: text("color").default("blue"), // UI color theme
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  // Ensure category names are unique within customer scope (including global)
  uniqueCustomerName: sql`unique(coalesce(customer_id, 'GLOBAL'), name)`,
}));

export const helpArticles = pgTable("help_articles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // CUSTOMER ISOLATION: Each help article can be global or customer-specific
  customerId: varchar("customer_id").references(() => customers.id), // NULL for global articles
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
}, (table) => ({
  // Ensure article slugs are unique within customer scope (including global)
  uniqueCustomerSlug: sql`unique(coalesce(customer_id, 'GLOBAL'), slug)`,
}));

export const helpUserInteractions = pgTable("help_user_interactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // CUSTOMER ISOLATION: Each interaction belongs to a specific customer
  customerId: varchar("customer_id").notNull().references(() => customers.id),
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
  // CUSTOMER ISOLATION: Each onboarding progress belongs to a specific customer
  customerId: varchar("customer_id").notNull().references(() => customers.id),
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
  cscsStatus: text("cscs_status").default("none"), // valid, expired, pending, none
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
  inductionCompleted: boolean("site_induction_completed").default(false),
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
  // Environmental data for CO2 calculations
  transportMethod: text("transport_method").default("car_diesel"), // car_diesel, car_petrol, electric_car, hybrid_car, motorcycle, public_transport, bicycle, walking, van_diesel, van_petrol
  postcode: text("postcode"), // Worker's home postcode for distance/CO2 calculations - REQUIRED for emissions tracking
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

// Worker Notes/Audit Trail table - for tracking all changes and card status updates
export const workerNotes = pgTable("worker_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workerId: varchar("worker_id").notNull().references(() => contractorWorkers.id),
  // Change tracking details
  changeType: text("change_type").notNull(), // card_status_change, profile_update, certification_update, hs_acceptance, manual_note
  fieldChanged: text("field_changed"), // specific field that changed (email, cscsStatus, etc.)
  oldValue: text("old_value"), // previous value
  newValue: text("new_value"), // new value
  // Note content
  title: text("title").notNull(), // summary of the change
  description: text("description"), // detailed description of the change
  // User tracking
  createdBy: varchar("created_by").notNull().references(() => users.id), // user who made the change
  createdByName: text("created_by_name").notNull(), // cached user name for performance
  // Metadata
  ipAddress: text("ip_address"), // IP address of the change
  userAgent: text("user_agent"), // browser/client info
  source: text("source").default("manual").notNull(), // manual, system, email_acceptance, api
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  workerIdIdx: index("worker_notes_worker_id_idx").on(table.workerId),
  changeTypeIdx: index("worker_notes_change_type_idx").on(table.changeType),
  createdAtIdx: index("worker_notes_created_at_idx").on(table.createdAt),
  createdByIdx: index("worker_notes_created_by_idx").on(table.createdBy),
}));

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

export const insertWorkerNoteSchema = createInsertSchema(workerNotes).omit({
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
export type WorkerNote = typeof workerNotes.$inferSelect;
export type InsertWorkerNote = z.infer<typeof insertWorkerNoteSchema>;
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
  // CUSTOMER ISOLATION: Each card offence belongs to a specific customer
  customerId: varchar("customer_id").notNull().references(() => customers.id),
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
  status: text("status").notNull().default("pending_review"), // pending_review, approved, rejected, expired, expiring
  uploadedBy: varchar("uploaded_by").references(() => users.id),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  alertDaysBefore: integer("alert_days_before").default(14),
  lastAlertSent: timestamp("last_alert_sent"),
  isActive: boolean("is_active").default(true).notNull(),
  // Versioning
  version: integer("version").default(1).notNull(),
  previousVersionId: varchar("previous_version_id"),
  // Approval workflow
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  // Site / job context
  jobDescription: text("job_description"),
  siteLocation: text("site_location"),
  workCategory: text("work_category"), // excavation, electrical, roofing, confined_space, working_at_height, general
  // Access control
  requiredBeforeAccess: boolean("required_before_access").default(true).notNull(),
});

// RAMS Worker Acknowledgements — workers digitally confirm they have read RAMS
export const ramsAcknowledgements = pgTable("rams_acknowledgements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ramsDocumentId: varchar("rams_document_id").references(() => ramsDocuments.id).notNull(),
  workerId: varchar("worker_id").references(() => contractorWorkers.id).notNull(),
  companyId: varchar("company_id").references(() => contractorCompanies.id),
  acknowledgedAt: timestamp("acknowledged_at").defaultNow().notNull(),
  method: text("method").notNull().default("digital"), // digital, qr_code, paper
  ipAddress: text("ip_address"),
  deviceInfo: text("device_info"),
  signatureData: text("signature_data"), // base64 signature if captured
});

// RAMS Audit Trail — full immutable log of all RAMS lifecycle events
export const ramsAuditLog = pgTable("rams_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ramsDocumentId: varchar("rams_document_id").references(() => ramsDocuments.id).notNull(),
  companyId: varchar("company_id").references(() => contractorCompanies.id),
  action: text("action").notNull(), // uploaded, approved, rejected, new_version, acknowledged, expired, reactivated
  performedBy: varchar("performed_by"),
  performedByName: text("performed_by_name"),
  performedAt: timestamp("performed_at").defaultNow().notNull(),
  notes: text("notes"),
  metadata: text("metadata"), // JSON string for extra data
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

// Site Induction Video System - Universal tokens for visitors, staff, and contractors
export const inductionTokens = pgTable("induction_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  personType: text("person_type").notNull().default("contractor"), // visitor, staff, contractor
  workerId: varchar("worker_id").references(() => contractorWorkers.id), // For contractors
  visitorId: varchar("visitor_id"), // For visitors (no FK constraint for flexibility)
  staffId: varchar("staff_id"), // For staff (no FK constraint for flexibility)
  customerId: varchar("customer_id"), // nullable — routes quiz results to correct isolated schema for notes
  personName: text("person_name").notNull(), // Name for email personalization
  personEmail: text("person_email").notNull(), // Email address for sending induction
  token: text("token").notNull().unique(),
  status: text("status").notNull().default("pending"), // pending, in_progress, completed, expired, failed
  emailSent: boolean("email_sent").default(false),
  emailSentAt: timestamp("email_sent_at"),
  videoWatched: boolean("video_watched").default(false),
  videoWatchedAt: timestamp("video_watched_at"),
  quizAttempts: integer("quiz_attempts").default(0),
  quizCompleted: boolean("quiz_completed").default(false),
  quizCompletedAt: timestamp("quiz_completed_at"),
  quizScore: integer("quiz_score").default(0),
  quizPassed: boolean("quiz_passed").default(false), // Did they meet the pass threshold?
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
  kioskEnabled: boolean("kiosk_enabled").default(false).notNull(), // Show induction during kiosk check-in
  sendLinkEnabled: boolean("send_link_enabled").default(true).notNull(), // Allow sending induction links by email
  generatedHtml: text("generated_html"), // Saved HTML presentation content
  scenesData: text("scenes_data"), // JSON string of scenes array with titles, content, images, audio
  generatedAt: timestamp("generated_at"), // When video was last generated
  questionsGenerated: boolean("questions_generated").default(false), // Whether AI questions have been saved
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
  customerId: varchar("customer_id").notNull().references(() => customers.id),
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
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  companyId: varchar("company_id").references(() => contractorCompanies.id), // Null for overall customer summary
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
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  companyId: varchar("company_id").references(() => contractorCompanies.id), // Null for overall customer report
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

// ==============================================
// PROFESSIONAL SAAS INFRASTRUCTURE - ZOD VALIDATION SCHEMAS
// ==============================================

// Subscription Plans Validation
export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Customer Subscriptions Validation
export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Customer Invoices Validation
export const insertInvoiceSchema = createInsertSchema(invoices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Customer Payment Methods Validation
export const insertPaymentMethodSchema = createInsertSchema(paymentMethods).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Usage Tracking Validation
export const insertUsageTrackingSchema = createInsertSchema(usageTracking).omit({
  id: true,
  lastCalculated: true,
  createdAt: true,
  updatedAt: true,
});

// Developer Access Logs Validation
export const insertDeveloperAccessLogSchema = createInsertSchema(developerAccessLogs).omit({
  id: true,
  sessionStart: true,
  createdAt: true,
});

// Support Sessions Validation
export const insertSupportSessionSchema = createInsertSchema(supportSessions).omit({
  id: true,
  sessionStart: true,
  createdAt: true,
  updatedAt: true,
});

// Customer Onboarding Progress Validation
export const insertOnboardingProgressSchema = createInsertSchema(onboardingProgress).omit({
  id: true,
  onboardingStarted: true,
  lastActivityAt: true,
  createdAt: true,
  updatedAt: true,
});

// Trial Tracking Validation
export const insertTrialTrackingSchema = createInsertSchema(trialTracking).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
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
export type InsertRamsDocument = z.infer<typeof insertRamsDocumentSchema>;
export type RamsDocument = typeof ramsDocuments.$inferSelect;

export const insertRamsAcknowledgementSchema = createInsertSchema(ramsAcknowledgements).omit({
  id: true,
  acknowledgedAt: true,
});
export type InsertRamsAcknowledgement = z.infer<typeof insertRamsAcknowledgementSchema>;
export type RamsAcknowledgement = typeof ramsAcknowledgements.$inferSelect;

export const insertRamsAuditLogSchema = createInsertSchema(ramsAuditLog).omit({
  id: true,
  performedAt: true,
});
export type InsertRamsAuditLog = z.infer<typeof insertRamsAuditLogSchema>;
export type RamsAuditLog = typeof ramsAuditLog.$inferSelect;

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

// ==============================================
// PROFESSIONAL SAAS INFRASTRUCTURE - TYPESCRIPT TYPES
// ==============================================

// Subscription Management Types
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;

// Billing & Payment Types
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type PaymentMethod = typeof paymentMethods.$inferSelect;
export type InsertPaymentMethod = z.infer<typeof insertPaymentMethodSchema>;

// Usage & Analytics Types
export type UsageTracking = typeof usageTracking.$inferSelect;
export type InsertUsageTracking = z.infer<typeof insertUsageTrackingSchema>;

// Developer Access & Support Types
export type DeveloperAccessLog = typeof developerAccessLogs.$inferSelect;
export type InsertDeveloperAccessLog = z.infer<typeof insertDeveloperAccessLogSchema>;
export type SupportSession = typeof supportSessions.$inferSelect;
export type InsertSupportSession = z.infer<typeof insertSupportSessionSchema>;

// Customer Onboarding Types
export type OnboardingProgress = typeof onboardingProgress.$inferSelect;
export type InsertOnboardingProgress = z.infer<typeof insertOnboardingProgressSchema>;
export type TrialTracking = typeof trialTracking.$inferSelect;
export type InsertTrialTracking = z.infer<typeof insertTrialTrackingSchema>;

// Types for new tables
export type CardOffence = typeof cardOffences.$inferSelect;
export type InsertCardOffence = z.infer<typeof insertCardOffenceSchema>;
export type CardIssue = typeof cardIssues.$inferSelect;
export type InsertCardIssue = z.infer<typeof insertCardIssueSchema>;
export type WorkerCertification = typeof workerCertifications.$inferSelect;
export type InsertWorkerCertification = z.infer<typeof insertWorkerCertificationSchema>;
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

// Meeting Room Management System
export const meetingRooms = pgTable("meeting_rooms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  location: text("location").notNull(), // Floor, Wing, etc.
  capacity: integer("capacity").notNull(),
  
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

// Room booking with related data for API responses
export type RoomBookingWithRelations = RoomBooking & {
  room: MeetingRoom;
  organizer: Staff;
};

// Transformed room booking interface for frontend API responses
export interface TransformedRoomBooking {
  id: string;
  title: string;
  description: string | null;
  date: string; // YYYY-MM-DD format
  startTime: string; // HH:MM format
  endTime: string; // HH:MM format
  roomName: string;
  organizer: string;
  attendees: string[];
  expectedAttendees: number;
  status: string;
  requiresCatering: boolean;
  cateringNotes: string | null;
  specialRequirements: string | null;
}

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

// Insert schemas for CO2 tracking
export const insertCO2EmissionsDataSchema = createInsertSchema(co2EmissionsData).omit({
  id: true,
  calculatedAt: true,
  lastUpdated: true,
  createdAt: true,
});

export const insertCO2MonthlySummarySchema = createInsertSchema(co2MonthlySummaries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCO2SustainabilityReportSchema = createInsertSchema(co2SustainabilityReports).omit({
  id: true,
  generatedAt: true,
  createdAt: true,
});

// Types for print queue
export type PrintServiceInstance = typeof printServiceInstances.$inferSelect;
export type InsertPrintServiceInstance = z.infer<typeof insertPrintServiceInstanceSchema>;
export type PrintQueue = typeof printQueue.$inferSelect;
export type InsertPrintQueue = z.infer<typeof insertPrintQueueSchema>;
export type PrintJobHistory = typeof printJobHistory.$inferSelect;
export type InsertPrintJobHistory = z.infer<typeof insertPrintJobHistorySchema>;

// Types for CO2 tracking
export type CO2EmissionsData = typeof co2EmissionsData.$inferSelect;
export type InsertCO2EmissionsData = z.infer<typeof insertCO2EmissionsDataSchema>;
export type CO2MonthlySummary = typeof co2MonthlySummaries.$inferSelect;
export type InsertCO2MonthlySummary = z.infer<typeof insertCO2MonthlySummarySchema>;
export type CO2SustainabilityReport = typeof co2SustainabilityReports.$inferSelect;
export type InsertCO2SustainabilityReport = z.infer<typeof insertCO2SustainabilityReportSchema>;

// Insert schemas for help system
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
  createdAt: true,
  updatedAt: true,
});

// Types for help system
export type HelpCategory = typeof helpCategories.$inferSelect;
export type InsertHelpCategory = z.infer<typeof insertHelpCategorySchema>;
export type HelpArticle = typeof helpArticles.$inferSelect;
export type InsertHelpArticle = z.infer<typeof insertHelpArticleSchema>;
export type HelpUserInteraction = typeof helpUserInteractions.$inferSelect;
export type InsertHelpUserInteraction = z.infer<typeof insertHelpUserInteractionSchema>;
export type HelpOnboardingProgress = typeof helpOnboardingProgress.$inferSelect;
export type InsertHelpOnboardingProgress = z.infer<typeof insertHelpOnboardingProgressSchema>;

// UK H&S Compliance Document System
// Templates for the 6 specific UK H&S documents
export const ukHSDocumentTemplates = pgTable("uk_hs_document_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // CUSTOMER ISOLATION: Each template belongs to a specific customer
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  
  // Document identification
  documentCode: text("document_code").notNull(), // right_to_work, ladder_safety, permit_to_work, contractor_agreement, risk_assessment, site_induction
  documentName: text("document_name").notNull(),
  documentDescription: text("document_description"),
  
  // Template content with auto-fill placeholders
  templateContent: text("template_content").notNull(), // HTML template with {{placeholder}} tags
  autoFillFields: text("auto_fill_fields").array().default([]), // Array of field names to auto-fill
  
  // UK H&S compliance requirements
  isUKHSRequired: boolean("is_uk_hs_required").default(true).notNull(),
  complianceCategory: text("compliance_category").notNull(), // immigration, safety_training, work_permit, contract, risk_management, induction
  legalReference: text("legal_reference"), // Reference to UK H&S legislation
  
  // Template metadata
  version: text("version").default("1.0").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Worker document assignments - which documents are assigned to which workers
export const workerDocumentAssignments = pgTable("worker_document_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // CUSTOMER ISOLATION: Each assignment belongs to a specific customer
  // No FK on customerId because isolated-schema IDs can't reference shared DB
  customerId: varchar("customer_id").notNull(),
  
  // Assignment details
  // No FK on workerId/companyId — these IDs live in isolated customer schemas, not shared DB
  workerId: varchar("worker_id").notNull(),
  companyId: varchar("company_id").notNull(),
  documentTemplateId: varchar("document_template_id").notNull().references(() => ukHSDocumentTemplates.id),
  
  // Assignment metadata
  // No FK on assignedBy — user IDs come from isolated customer schema
  assignedBy: varchar("assigned_by").notNull(),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  dueDate: timestamp("due_date"), // Optional deadline for acceptance
  
  // Status tracking
  status: text("status").default("pending").notNull(), // pending, sent, accepted, rejected, expired
  emailSent: boolean("email_sent").default(false).notNull(),
  emailSentAt: timestamp("email_sent_at"),
  
  // Worker access
  acceptanceToken: text("acceptance_token").unique(), // Unique token for worker access
  acceptanceUrl: text("acceptance_url"), // Full URL for worker to access document
  
  // Completion tracking
  viewedAt: timestamp("viewed_at"), // When worker first viewed the document
  acceptedAt: timestamp("accepted_at"), // When worker accepted the document
  rejectedAt: timestamp("rejected_at"), // When worker rejected the document
  rejectionReason: text("rejection_reason"),
  
  // Auto-filled document content
  filledDocumentContent: text("filled_document_content"), // Template filled with actual data
  
  notes: text("notes"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Worker document acceptances - historical tracking of all acceptances
export const workerDocumentAcceptances = pgTable("worker_document_acceptances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // CUSTOMER ISOLATION: Each acceptance belongs to a specific customer
  // No FK — isolated-schema customer IDs can't reference shared DB customers table
  customerId: varchar("customer_id").notNull(),
  
  // Reference to assignment
  assignmentId: varchar("assignment_id").notNull().references(() => workerDocumentAssignments.id),
  // No FK on workerId — workers live in isolated customer schemas, not shared DB
  workerId: varchar("worker_id").notNull(),
  documentTemplateId: varchar("document_template_id").notNull().references(() => ukHSDocumentTemplates.id),
  
  // Acceptance details
  acceptanceMethod: text("acceptance_method").default("email_link").notNull(), // email_link, manual_entry, system_generated
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  acceptanceToken: text("acceptance_token").notNull(), // Token used for verification
  
  // Digital signature/confirmation
  digitalSignature: text("digital_signature"), // Base64 encoded signature if applicable
  confirmationText: text("confirmation_text"), // Text the worker typed to confirm understanding
  
  // Timestamps
  acceptedAt: timestamp("accepted_at").defaultNow().notNull(),
  
  // Compliance audit trail
  witnessName: text("witness_name"), // Optional witness for critical documents
  witnessEmail: text("witness_email"),
  auditNotes: text("audit_notes"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Auto-fill data mapping - maps company/worker fields to document placeholders
export const documentAutoFillMapping = pgTable("document_auto_fill_mapping", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // CUSTOMER ISOLATION: Each mapping belongs to a specific customer
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  
  // Document and field identification
  documentTemplateId: varchar("document_template_id").notNull().references(() => ukHSDocumentTemplates.id),
  placeholderName: text("placeholder_name").notNull(), // {{company_name}}, {{worker_full_name}}, etc.
  
  // Data source configuration
  dataSource: text("data_source").notNull(), // company_settings, contractor_worker, contractor_company, system_generated
  sourceField: text("source_field").notNull(), // Field name in the source table
  fallbackValue: text("fallback_value"), // Default value if source field is empty
  
  // Field transformation
  transformationType: text("transformation_type").default("none"), // none, uppercase, lowercase, date_format, currency_format
  transformationConfig: text("transformation_config"), // JSON config for complex transformations
  
  // Validation rules
  isRequired: boolean("is_required").default(false).notNull(),
  validationPattern: text("validation_pattern"), // Regex pattern for validation
  validationMessage: text("validation_message"),
  
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// PLATFORM ADMINISTRATION
// Platform Admins - System administrators who manage customers
// This table is in the MANAGEMENT database (not customer-specific)
export const platformAdmins = pgTable("platform_admins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(), // Hashed password
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  role: text("role").notNull().default("admin"), // admin, super_admin, support
  isActive: boolean("is_active").default(true).notNull(),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  usernameIdx: index("platform_admins_username_idx").on(table.username),
  emailIdx: index("platform_admins_email_idx").on(table.email),
  isActiveIdx: index("platform_admins_is_active_idx").on(table.isActive),
}));

// Platform Branding Settings - White-label configuration
// Single row configuration for platform branding (colors, logo, etc.)
export const platformBrandingSettings = pgTable("platform_branding_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Branding colors
  primaryColor: text("primary_color").default("#2460A9").notNull(), // Main brand color
  secondaryColor: text("secondary_color").default("#1E3A8A").notNull(), // Accent color
  accentColor: text("accent_color").default("#3B82F6").notNull(), // Additional accent
  // Logo and assets
  logoUrl: text("logo_url"), // URL or path to uploaded logo
  faviconUrl: text("favicon_url"), // URL or path to favicon
  // Company information
  platformName: text("platform_name").default("TPR Max").notNull(),
  companyName: text("company_name").default("Your Company").notNull(),
  // Metadata
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: varchar("updated_by").references(() => platformAdmins.id),
});

// Insert schemas for UK H&S document system
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
  acceptedAt: true,
  createdAt: true,
});

export const insertDocumentAutoFillMappingSchema = createInsertSchema(documentAutoFillMapping).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Insert schema for voice notification logs
export const insertVoiceNotificationLogSchema = createInsertSchema(voiceNotificationLogs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  messageText: z.string().min(1, "Message text is required"),
  recipientPhoneNumber: z.string().min(1, "Recipient phone number is required"),
  notificationType: z.enum(["visitor_arrival", "emergency_alert", "system_notification"]),
  status: z.enum(["pending", "sent", "delivered", "failed", "busy", "no_answer"]).default("pending"),
});

// Types for voice notification system
export type VoiceNotificationLog = typeof voiceNotificationLogs.$inferSelect;
export type InsertVoiceNotificationLog = z.infer<typeof insertVoiceNotificationLogSchema>;

// Insert schema and types for platform admins
export const insertPlatformAdminSchema = createInsertSchema(platformAdmins).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastLoginAt: true,
}).extend({
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username must be less than 50 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, underscores, and hyphens"),
  email: z.string().email("Valid email address required"),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be less than 128 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  role: z.enum(["admin", "super_admin", "support"]).default("admin"),
});

export type PlatformAdmin = typeof platformAdmins.$inferSelect;
export type InsertPlatformAdmin = z.infer<typeof insertPlatformAdminSchema>;

// Platform branding settings schemas
export const insertPlatformBrandingSettingsSchema = createInsertSchema(platformBrandingSettings).omit({
  id: true,
  updatedAt: true,
});

export type PlatformBrandingSettings = typeof platformBrandingSettings.$inferSelect;
export type InsertPlatformBrandingSettings = z.infer<typeof insertPlatformBrandingSettingsSchema>;

// Platform admin login schema
export const platformAdminLoginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export type PlatformAdminLoginRequest = z.infer<typeof platformAdminLoginSchema>;

// Types for UK H&S document system
export type UkHSDocumentTemplate = typeof ukHSDocumentTemplates.$inferSelect;
export type InsertUkHSDocumentTemplate = z.infer<typeof insertUkHSDocumentTemplateSchema>;
export type WorkerDocumentAssignment = typeof workerDocumentAssignments.$inferSelect;
export type InsertWorkerDocumentAssignment = z.infer<typeof insertWorkerDocumentAssignmentSchema>;
export type WorkerDocumentAcceptance = typeof workerDocumentAcceptances.$inferSelect;
export type InsertWorkerDocumentAcceptance = z.infer<typeof insertWorkerDocumentAcceptanceSchema>;
export type DocumentAutoFillMapping = typeof documentAutoFillMapping.$inferSelect;
export type InsertDocumentAutoFillMapping = z.infer<typeof insertDocumentAutoFillMappingSchema>;

// SECURITY: Company Settings Types with Sanitization
// Re-export from isolatedSchema.ts for client access
export type { CompanySettings, InsertCompanySettings } from "../server/isolatedSchema";
