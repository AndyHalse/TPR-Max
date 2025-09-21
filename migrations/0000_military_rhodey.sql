CREATE TABLE "ai_generated_images" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slide_type" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"image_url" text NOT NULL,
	"dalle_prompt" text NOT NULL,
	"dalle_revision" text DEFAULT 'dall-e-3',
	"image_size" text DEFAULT '1024x1024',
	"quality" text DEFAULT 'standard',
	"style" text DEFAULT 'vivid',
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "building_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"building_name" text DEFAULT 'Serviced Office Building' NOT NULL,
	"building_address" text,
	"management_company" text DEFAULT 'Building Management Ltd' NOT NULL,
	"logo_url" text,
	"super_admin_email" text NOT NULL,
	"phone" text,
	"website" text,
	"allow_tenant_self_signup" boolean DEFAULT false,
	"max_tenants_allowed" integer DEFAULT 100,
	"default_visitor_retention" integer DEFAULT 90,
	"emergency_phone" text,
	"security_company" text,
	"notify_new_tenant_signup" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_issues" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worker_id" varchar NOT NULL,
	"offence_id" varchar NOT NULL,
	"card_type" text NOT NULL,
	"issued_by" varchar NOT NULL,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	"description" text NOT NULL,
	"witness" text,
	"location" text,
	"photos" text[] DEFAULT '{}',
	"status" text DEFAULT 'active' NOT NULL,
	"ban_end_date" timestamp,
	"appeal_notes" text,
	"appealed_at" timestamp,
	"appeals_count" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "card_offences" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"offence_name" text NOT NULL,
	"offence_description" text,
	"card_type" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"site_configurable" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "co2_emissions_data" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"worker_id" varchar NOT NULL,
	"company_id" varchar NOT NULL,
	"worker_postcode" text NOT NULL,
	"company_address" text NOT NULL,
	"distance_miles" double precision NOT NULL,
	"distance_km" double precision NOT NULL,
	"route_type" text DEFAULT 'mixed',
	"estimated_travel_time" text,
	"transport_method" text DEFAULT 'car_diesel' NOT NULL,
	"emission_factor" text NOT NULL,
	"daily_co2_kg" text NOT NULL,
	"monthly_co2_kg" text NOT NULL,
	"annual_co2_kg" text NOT NULL,
	"calculated_at" timestamp DEFAULT now() NOT NULL,
	"calculated_by" text DEFAULT 'openai',
	"last_updated" timestamp DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"working_days_per_month" integer DEFAULT 22 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "co2_monthly_summaries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"company_id" varchar,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"total_workers" integer NOT NULL,
	"total_monthly_co2_kg" text NOT NULL,
	"average_co2_per_worker" text NOT NULL,
	"transport_breakdown" text,
	"average_distance_miles" double precision,
	"longest_commute_miles" double precision,
	"shortest_commute_miles" double precision,
	"previous_month_co2_kg" text,
	"percentage_change" text,
	"carbon_reduction_target" text,
	"target_achieved" boolean DEFAULT false,
	"sustainability_score" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "co2_records" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar,
	"worker_id" varchar,
	"record_type" text NOT NULL,
	"record_date" timestamp NOT NULL,
	"co2_amount" text NOT NULL,
	"unit" text DEFAULT 'kg' NOT NULL,
	"source" text,
	"distance" text,
	"fuel_type" text,
	"description" text,
	"calculation_method" text,
	"verified" boolean DEFAULT false,
	"verified_by" varchar,
	"verified_at" timestamp,
	"reporting_period" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "co2_sustainability_reports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"company_id" varchar,
	"report_type" text DEFAULT 'monthly' NOT NULL,
	"report_period" text NOT NULL,
	"report_title" text NOT NULL,
	"executive_summary" text NOT NULL,
	"current_emissions_status" text NOT NULL,
	"environmental_impact_analysis" text NOT NULL,
	"reduction_recommendations" text NOT NULL,
	"industry_comparison" text NOT NULL,
	"action_plan" text NOT NULL,
	"full_report_content" text NOT NULL,
	"total_workers_covered" integer NOT NULL,
	"total_co2_analyzed" text NOT NULL,
	"top_recommendation" text,
	"potential_savings" text,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"generated_by" text DEFAULT 'openai',
	"ai_model" text DEFAULT 'gpt-4',
	"generation_time_ms" integer,
	"is_published" boolean DEFAULT false,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"company_name" text DEFAULT 'TechCorp Ltd' NOT NULL,
	"logo_url" text,
	"address" text DEFAULT '',
	"phone" text DEFAULT '',
	"website" text DEFAULT '',
	"email" text DEFAULT '',
	"email_reports_enabled" boolean DEFAULT false,
	"report_frequency" text DEFAULT 'weekly',
	"report_recipients" text[] DEFAULT '{"admin@company.com"}',
	"last_report_sent" timestamp,
	"smtp_host" text DEFAULT '',
	"smtp_port" text DEFAULT '587',
	"smtp_security" text DEFAULT 'STARTTLS',
	"smtp_username" text DEFAULT '',
	"smtp_password" text DEFAULT '',
	"smtp_from_email" text DEFAULT '',
	"smtp_from_name" text DEFAULT '',
	"smtp_reply_to" text DEFAULT '',
	"smtp_auth_method" text DEFAULT 'LOGIN',
	"smtp_connection_timeout" text DEFAULT '30',
	"smtp_test_email_sent" boolean DEFAULT false,
	"smtp_last_tested" timestamp,
	"enable_daily_reset" boolean DEFAULT true,
	"daily_reset_time" text DEFAULT '00:00',
	"daily_reset_timezone" text DEFAULT 'Europe/London',
	"grace_period_minutes" text DEFAULT '15',
	"enable_weekend_reset" boolean DEFAULT false,
	"enable_holiday_reset" boolean DEFAULT false,
	"notify_forgotten_checkouts" boolean DEFAULT true,
	"last_daily_reset" timestamp,
	"allow_manual_reset" boolean DEFAULT true,
	"reset_log_retention_days" text DEFAULT '90',
	"enable_24x7_operations" boolean DEFAULT false,
	"alert_before_reset" boolean DEFAULT true,
	"alert_minutes_before" text DEFAULT '30',
	"background_color" text DEFAULT '#f8fafc',
	"foreground_color" text DEFAULT '#1e293b',
	"variable_text_color" text DEFAULT '#374151',
	"accent_color" text DEFAULT '#3b82f6',
	"banner_url" text,
	"theme" text DEFAULT 'light',
	"selected_printer" text DEFAULT 'PDF Printer',
	"enable_qr_codes" boolean DEFAULT true,
	"enable_2d_barcodes" boolean DEFAULT false,
	"barcode_format" text DEFAULT 'QR_CODE',
	"print_quality" text DEFAULT 'normal',
	"id_card_printer" text DEFAULT '',
	"id_card_print_quality" text DEFAULT 'high',
	"id_card_paper_size" text DEFAULT 'cr80',
	"id_card_orientation" text DEFAULT 'landscape',
	"id_card_design" text DEFAULT '[]',
	"visitor_pass_design" text DEFAULT '[]',
	"contractor_pass_design" text DEFAULT '[]',
	"thermal_selected_printer" text DEFAULT 'tec',
	"thermal_print_method" text DEFAULT 'direct',
	"thermal_print_quality" text DEFAULT 'reception',
	"thermal_printer_settings" text DEFAULT '{}',
	"biostar_enabled" boolean DEFAULT false,
	"biostar_server_url" text DEFAULT '',
	"biostar_api_key" text DEFAULT '',
	"biostar_username" text DEFAULT '',
	"biostar_password" text DEFAULT '',
	"biostar_database_id" text DEFAULT '1',
	"biostar_sync_interval" text DEFAULT '300',
	"biometric_devices" text[] DEFAULT '{}',
	"reader_settings" text DEFAULT '{}',
	"openai_model" text DEFAULT 'gpt-5',
	"openai_temperature" text DEFAULT '0.7',
	"openai_max_tokens" text DEFAULT '4000',
	"video_quality_preference" text DEFAULT 'high',
	"enable_advanced_video_features" boolean DEFAULT true,
	"default_video_length" text DEFAULT '15',
	"ai_instructions_prompt" text DEFAULT 'Create comprehensive, engaging safety induction content',
	"qr_reader_enabled" boolean DEFAULT false,
	"qr_reader_device" text DEFAULT 'auto',
	"qr_code_format" text DEFAULT 'visigate',
	"qr_reader_settings" text DEFAULT '{}',
	"clue_enabled" boolean DEFAULT false,
	"clue_api_url" text DEFAULT 'https://api.suprema-clue.com',
	"clue_api_key" text DEFAULT '',
	"clue_api_secret" text DEFAULT '',
	"clue_organization_id" text DEFAULT '',
	"clue_webhook_secret" text DEFAULT '',
	"clue_dynamic_qr_enabled" boolean DEFAULT true,
	"clue_qr_validity_minutes" text DEFAULT '60',
	"clue_device_groups" text[] DEFAULT '{}',
	"clue_sync_interval" text DEFAULT '300',
	"clue_auto_register_visitors" boolean DEFAULT true,
	"clue_auto_delete_expired" boolean DEFAULT true,
	"clue_test_mode" boolean DEFAULT false,
	"clue_last_sync" timestamp,
	"e_pass_enabled" boolean DEFAULT false,
	"e_pass_delivery_method" text DEFAULT 'both',
	"e_pass_email_template" text DEFAULT 'default',
	"e_pass_sms_template" text DEFAULT 'default',
	"e_pass_auto_checkout" boolean DEFAULT true,
	"e_pass_checkout_reminder_minutes" text DEFAULT '30',
	"e_pass_host_notification_enabled" boolean DEFAULT true,
	"e_pass_host_notification_delay" text DEFAULT '60',
	"twilio_enabled" boolean DEFAULT false,
	"twilio_account_sid" text DEFAULT '',
	"twilio_auth_token" text DEFAULT '',
	"twilio_phone_number" text DEFAULT '',
	"twilio_messaging_service_sid" text DEFAULT '',
	"geofencing_enabled" boolean DEFAULT false,
	"geofence_radius" text DEFAULT '100',
	"geofence_lat" text DEFAULT '',
	"geofence_lng" text DEFAULT '',
	"x_station_enabled" boolean DEFAULT false,
	"x_station_devices" text[] DEFAULT '{}',
	"x_station_checkout_mode" text DEFAULT 'qr',
	"x_station_api_endpoint" text DEFAULT '',
	"hs_rules_enabled" boolean DEFAULT true,
	"hs_rules_content" text DEFAULT '',
	"hs_rules_url" text DEFAULT '',
	"hs_rules_require_acceptance" boolean DEFAULT false,
	"feature_multi_tenant" boolean DEFAULT true,
	"feature_meeting_rooms" boolean DEFAULT true,
	"feature_time_attendance" boolean DEFAULT true,
	"feature_induction_settings" boolean DEFAULT true,
	"feature_kiosk" boolean DEFAULT true,
	"feature_ai_demo" boolean DEFAULT true,
	"subscription_tier" text DEFAULT 'trial',
	"subscription_status" text DEFAULT 'trialing',
	"plan_features" text[] DEFAULT '{}',
	"trial_ends_at" timestamp,
	"subscription_ends_at" timestamp,
	"billing_email" text,
	"billing_contact_name" text,
	"invoice_prefix" text DEFAULT 'INV',
	"next_invoice_number" integer DEFAULT 1,
	"tax_id" text,
	"billing_address" text,
	"billing_country" text DEFAULT 'GB',
	"preferred_currency" text DEFAULT 'GBP',
	"api_keys_configured" boolean DEFAULT false,
	"integrations_enabled" text[] DEFAULT '{}',
	"webhook_url" text,
	"webhook_secret" text,
	"api_rate_limit" integer DEFAULT 1000,
	"last_api_activity" timestamp,
	"current_month_visitors" integer DEFAULT 0,
	"current_month_api_calls" integer DEFAULT 0,
	"plan_limit_visitors" integer DEFAULT 1000,
	"plan_limit_staff" integer DEFAULT 50,
	"plan_limit_meeting_rooms" integer DEFAULT 10,
	"plan_limit_storage_gb" integer DEFAULT 10,
	"support_tier" text DEFAULT 'email',
	"customer_success_manager" text,
	"last_support_interaction" timestamp,
	"support_satisfaction_rating" integer,
	"health_score" integer DEFAULT 100,
	"risk_level" text DEFAULT 'low',
	"onboarding_status" text DEFAULT 'not_started',
	"onboarding_progress" integer DEFAULT 0,
	"activation_date" timestamp,
	"first_visitor_created" timestamp,
	"first_staff_member_added" timestamp,
	"time_to_value" text,
	"custom_branding_enabled" boolean DEFAULT false,
	"sso_enabled" boolean DEFAULT false,
	"audit_logs_enabled" boolean DEFAULT false,
	"data_export_enabled" boolean DEFAULT true,
	"custom_fields_enabled" boolean DEFAULT false,
	"advanced_reporting_enabled" boolean DEFAULT false,
	"data_processing_region" text DEFAULT 'EU',
	"compliance_frameworks" text[] DEFAULT '{}',
	"data_retention_period" integer DEFAULT 365,
	"encryption_level" text DEFAULT 'AES256',
	"last_security_audit" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_documents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"document_type" text NOT NULL,
	"document_name" text NOT NULL,
	"document_url" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"expiry_date" timestamp,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"review_notes" text,
	"version" text DEFAULT '1',
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "contractor_companies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"company_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"address" text,
	"postcode" text,
	"contact_first_name" text NOT NULL,
	"contact_last_name" text NOT NULL,
	"website" text,
	"description" text,
	"industry" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"compliance_score" text DEFAULT '0',
	"last_updated" timestamp DEFAULT now() NOT NULL,
	"invited_by" varchar,
	"onboarding_completed" boolean DEFAULT false,
	"portal_access_enabled" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contractor_documents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contractor_id" varchar NOT NULL,
	"document_type" text NOT NULL,
	"file_name" text,
	"file_url" text,
	"file_size" text,
	"mime_type" text,
	"expiry_date" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"uploaded_by" varchar,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "contractor_prebookings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" text NOT NULL,
	"contact_email" text NOT NULL,
	"contact_phone" text,
	"worker_name" text NOT NULL,
	"worker_email" text,
	"purpose" text NOT NULL,
	"scheduled_date" timestamp NOT NULL,
	"scheduled_time" text NOT NULL,
	"duration" text DEFAULT '4',
	"status" text DEFAULT 'pending',
	"qr_code" text NOT NULL,
	"notes" text,
	"documents_required" text[] DEFAULT '{}',
	"documents_uploaded" text[] DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "contractor_prebookings_qr_code_unique" UNIQUE("qr_code")
);
--> statement-breakpoint
CREATE TABLE "contractor_visits" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worker_id" varchar NOT NULL,
	"company_id" varchar NOT NULL,
	"purpose" text DEFAULT 'Work',
	"checked_in_at" timestamp DEFAULT now() NOT NULL,
	"checked_out_at" timestamp,
	"duration" text,
	"host_staff_id" varchar,
	"host_name" text,
	"hs_rules_accepted" boolean DEFAULT false,
	"hs_rules_accepted_at" timestamp,
	"induction_completed" boolean DEFAULT false,
	"induction_completed_at" timestamp,
	"e_pass_sent" boolean DEFAULT false,
	"e_pass_sent_at" timestamp,
	"checkout_type" text,
	"qr_code" text,
	"pass_url" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "contractor_visits_qr_code_unique" UNIQUE("qr_code")
);
--> statement-breakpoint
CREATE TABLE "contractor_workers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"photo_url" text,
	"right_to_work_status" text DEFAULT 'pending',
	"right_to_work_expiry" timestamp,
	"cscs_card" text,
	"cscs_expiry" timestamp,
	"cscs_status" boolean DEFAULT false,
	"ipaf_card" text,
	"ipaf_expiry" timestamp,
	"ipaf_status" text DEFAULT 'missing',
	"asbestos_awareness" boolean DEFAULT false,
	"asbestos_expiry" timestamp,
	"manual_handling" boolean DEFAULT false,
	"manual_handling_expiry" timestamp,
	"cibt_card" varchar,
	"cibt_expiry" timestamp,
	"cibt_status" text DEFAULT 'missing' NOT NULL,
	"cpcs_card" varchar,
	"cpcs_expiry" timestamp,
	"cpcs_status" text DEFAULT 'missing' NOT NULL,
	"nvq_qualification_id" varchar,
	"nvq_level" integer,
	"nvq_subject" varchar,
	"nvq_expiry" timestamp,
	"nvq_status" text DEFAULT 'missing' NOT NULL,
	"current_card_status" text DEFAULT 'clear' NOT NULL,
	"card_status_updated_at" timestamp,
	"card_status_updated_by" varchar,
	"red_card_ban_until" timestamp,
	"is_pre_registered" boolean DEFAULT false,
	"site_induction_completed" boolean DEFAULT false,
	"induction_completed_at" timestamp,
	"hs_rules_accepted" boolean DEFAULT false NOT NULL,
	"hs_rules_accepted_at" timestamp,
	"hs_rules_acceptance_token" text,
	"is_active" boolean DEFAULT true,
	"is_checked_in" boolean DEFAULT false,
	"checked_in_at" timestamp,
	"checked_out_at" timestamp,
	"checkout_type" text,
	"is_accounted_for" boolean DEFAULT false NOT NULL,
	"transport_method" text DEFAULT 'car_diesel',
	"postcode" text,
	"company_name" text,
	"qr_code" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_api_key_access_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"api_key_id" varchar NOT NULL,
	"request_method" text NOT NULL,
	"request_path" text NOT NULL,
	"request_headers" text,
	"user_agent" text,
	"ip_address" text NOT NULL,
	"country" text,
	"city" text,
	"response_status" integer NOT NULL,
	"response_time" integer,
	"bytes_transferred" integer,
	"rate_limit_hit" boolean DEFAULT false NOT NULL,
	"quota_used" integer,
	"quota_remaining" integer,
	"suspicious_activity" boolean DEFAULT false NOT NULL,
	"blocked_reason" text,
	"billable_operation" boolean DEFAULT true NOT NULL,
	"operation_cost" numeric(10, 4) DEFAULT '0.0000',
	"accessed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_api_keys" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"key_name" text NOT NULL,
	"key_description" text,
	"service_type" text DEFAULT 'api' NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"kms_key_id" text,
	"last4" text NOT NULL,
	"encrypted_key" text NOT NULL,
	"initialization_vector" text NOT NULL,
	"auth_tag" text NOT NULL,
	"key_fingerprint" text NOT NULL,
	"permissions" text[] DEFAULT '{"read"}' NOT NULL,
	"allowed_origins" text[] DEFAULT '{}',
	"ip_whitelist" text[] DEFAULT '{}',
	"rate_limit" integer DEFAULT 1000,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp,
	"last_used_at" timestamp,
	"usage_count" integer DEFAULT 0,
	"previous_key_id" varchar,
	"rotation_scheduled_for" timestamp,
	"decrypt_audit_log" text[] DEFAULT '{}',
	"created_by" varchar,
	"revoked_by" varchar,
	"revoked_at" timestamp,
	"revocation_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customer_api_keys_key_fingerprint_unique" UNIQUE("key_fingerprint")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" text NOT NULL,
	"slug" text NOT NULL,
	"contact_email" text NOT NULL,
	"database_url" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"max_tenants" integer DEFAULT 10,
	"max_users_per_tenant" integer DEFAULT 50,
	"max_visitors_per_month" integer DEFAULT 1000,
	"onboarding_completed" boolean DEFAULT false,
	"support_contact_email" text,
	"api_key_enabled" boolean DEFAULT false,
	"api_key" text,
	"stripe_customer_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customers_company_name_unique" UNIQUE("company_name"),
	CONSTRAINT "customers_slug_unique" UNIQUE("slug"),
	CONSTRAINT "customers_stripe_customer_id_unique" UNIQUE("stripe_customer_id")
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text DEFAULT 'bg-blue-500' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "departments_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "developer_access_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"developer_id" varchar NOT NULL,
	"developer_name" text NOT NULL,
	"developer_email" text NOT NULL,
	"customer_id" varchar NOT NULL,
	"customer_name" text NOT NULL,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"access_level" text NOT NULL,
	"ip_address" text NOT NULL,
	"user_agent" text,
	"session_duration" text,
	"tables_accessed" text[] DEFAULT '{}',
	"data_exported" boolean DEFAULT false,
	"export_details" text,
	"approved_by" text,
	"reviewed_at" timestamp,
	"session_start" timestamp DEFAULT now() NOT NULL,
	"session_end" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_approvals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" varchar NOT NULL,
	"contractor_id" varchar NOT NULL,
	"document_type" text NOT NULL,
	"approval_status" text NOT NULL,
	"approved_by" varchar,
	"approved_at" timestamp,
	"rejection_reason" text,
	"comments" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_auto_fill_mapping" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"document_template_id" varchar NOT NULL,
	"placeholder_name" text NOT NULL,
	"data_source" text NOT NULL,
	"source_field" text NOT NULL,
	"fallback_value" text,
	"transformation_type" text DEFAULT 'none',
	"transformation_config" text,
	"is_required" boolean DEFAULT false NOT NULL,
	"validation_pattern" text,
	"validation_message" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_types" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"is_mandatory" boolean DEFAULT true,
	"requires_expiry" boolean DEFAULT true,
	"alert_days_before" text DEFAULT '14',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "document_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "enhanced_company_details" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar,
	"department_id" varchar,
	"rams_id_ref" text,
	"rams_expiry_date" timestamp,
	"rams_document_url" text,
	"rams_uploaded_at" timestamp,
	"rams_last_alert_sent" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evacuation_accountability" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"evacuation_id" text NOT NULL,
	"person_id" text NOT NULL,
	"person_type" text NOT NULL,
	"person_name" text NOT NULL,
	"department" text,
	"company" text,
	"last_known_location" text,
	"is_accounted_for" boolean DEFAULT false NOT NULL,
	"accounted_by" text,
	"accounted_at" timestamp,
	"muster_point" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "help_articles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar,
	"category_id" varchar NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"summary" text,
	"content" text NOT NULL,
	"content_type" text DEFAULT 'markdown',
	"video_url" text,
	"target_pages" text[] DEFAULT '{}',
	"target_features" text[] DEFAULT '{}',
	"difficulty" text DEFAULT 'beginner',
	"estimated_read_time" integer DEFAULT 5,
	"search_keywords" text[] DEFAULT '{}',
	"tags" text[] DEFAULT '{}',
	"view_count" integer DEFAULT 0,
	"helpful_count" integer DEFAULT 0,
	"not_helpful_count" integer DEFAULT 0,
	"last_viewed_at" timestamp,
	"is_published" boolean DEFAULT true,
	"published_at" timestamp,
	"author_id" varchar,
	"sort_order" integer DEFAULT 0,
	"is_featured" boolean DEFAULT false,
	"is_quick_start" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "help_categories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar,
	"name" text NOT NULL,
	"description" text,
	"icon" text DEFAULT 'HelpCircle',
	"color" text DEFAULT 'blue',
	"sort_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "help_onboarding_progress" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"current_step" integer DEFAULT 1,
	"completed_steps" text[] DEFAULT '{}',
	"skipped_steps" text[] DEFAULT '{}',
	"total_steps" integer DEFAULT 10,
	"is_completed" boolean DEFAULT false,
	"completed_at" timestamp,
	"time_spent" integer DEFAULT 0,
	"last_active_at" timestamp DEFAULT now(),
	"feature_onboarding_completed" text[] DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "help_user_interactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"user_id" varchar,
	"article_id" varchar NOT NULL,
	"interaction_type" text NOT NULL,
	"session_id" text,
	"time_spent" integer,
	"page_context" text,
	"search_query" text,
	"feedback_rating" integer,
	"feedback_comments" text,
	"is_completed" boolean DEFAULT false,
	"completed_steps" text[] DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "induction_answers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" varchar NOT NULL,
	"question_id" varchar NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"selected_answer" text NOT NULL,
	"is_correct" boolean NOT NULL,
	"answered_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "induction_questions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_text" text NOT NULL,
	"question_type" text DEFAULT 'multiple_choice' NOT NULL,
	"correct_answer" text NOT NULL,
	"option_a" text,
	"option_b" text,
	"option_c" text,
	"option_d" text,
	"explanation" text,
	"category" text NOT NULL,
	"role_type" text DEFAULT 'contractor' NOT NULL,
	"video_id" varchar,
	"is_ai_generated" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"order_index" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "induction_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_type" text NOT NULL,
	"video_title" text NOT NULL,
	"video_url" text NOT NULL,
	"video_description" text,
	"video_duration_minutes" integer DEFAULT 15,
	"video_format" text DEFAULT 'interactive_slides' NOT NULL,
	"model_type" text DEFAULT 'gpt-5' NOT NULL,
	"pass_percentage" integer DEFAULT 80,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "induction_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worker_id" varchar NOT NULL,
	"token" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"email_sent" boolean DEFAULT false,
	"email_sent_at" timestamp,
	"video_watched" boolean DEFAULT false,
	"video_watched_at" timestamp,
	"quiz_attempts" integer DEFAULT 0,
	"quiz_completed" boolean DEFAULT false,
	"quiz_completed_at" timestamp,
	"quiz_score" integer DEFAULT 0,
	"pass_threshold" integer DEFAULT 80,
	"expires_at" timestamp NOT NULL,
	"completed_at" timestamp,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "induction_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"subscription_id" varchar,
	"invoice_number" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'GBP' NOT NULL,
	"tax" numeric(10, 2) DEFAULT '0.00',
	"tax_rate" numeric(5, 4) DEFAULT '0.0000',
	"status" text DEFAULT 'pending' NOT NULL,
	"due_date" timestamp NOT NULL,
	"paid_at" timestamp,
	"stripe_invoice_id" text,
	"stripe_charge_id" text,
	"line_items" text NOT NULL,
	"payment_method" text,
	"payment_method_last4" text,
	"refund_amount" numeric(10, 2) DEFAULT '0.00',
	"refund_reason" text,
	"refunded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number"),
	CONSTRAINT "invoices_stripe_invoice_id_unique" UNIQUE("stripe_invoice_id")
);
--> statement-breakpoint
CREATE TABLE "local_labour_records" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worker_id" varchar NOT NULL,
	"company_id" varchar NOT NULL,
	"postcode" text NOT NULL,
	"local_radius" integer DEFAULT 20 NOT NULL,
	"is_local" boolean DEFAULT false NOT NULL,
	"address" text,
	"travel_distance" text,
	"transport_method" text,
	"local_hire_date" timestamp,
	"skills" text[] DEFAULT '{}',
	"apprenticeship_level" text,
	"is_apprentice" boolean DEFAULT false,
	"training_provider" text,
	"recorded_at" timestamp DEFAULT now() NOT NULL,
	"recorded_by" varchar
);
--> statement-breakpoint
CREATE TABLE "meeting_rooms" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"location" text NOT NULL,
	"capacity" integer NOT NULL,
	"tenant_company_id" varchar,
	"is_shared_room" boolean DEFAULT false NOT NULL,
	"has_projector" boolean DEFAULT false NOT NULL,
	"has_video_conference" boolean DEFAULT false NOT NULL,
	"has_whiteboard" boolean DEFAULT false NOT NULL,
	"has_tv" boolean DEFAULT false NOT NULL,
	"has_air_con" boolean DEFAULT false NOT NULL,
	"has_catering" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"available_from" text DEFAULT '09:00' NOT NULL,
	"available_to" text DEFAULT '18:00' NOT NULL,
	"max_booking_hours" integer DEFAULT 8 NOT NULL,
	"advance_booking_days" integer DEFAULT 30 NOT NULL,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"hourly_rate" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nvq_qualifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"level" integer NOT NULL,
	"description" text,
	"industry" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "nvq_qualifications_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "onboarding_progress" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"current_step" integer DEFAULT 1 NOT NULL,
	"total_steps" integer DEFAULT 10 NOT NULL,
	"steps_completed" text[] DEFAULT '{}' NOT NULL,
	"current_step_name" text,
	"current_step_description" text,
	"is_completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp,
	"assigned_onboarding_specialist" text,
	"scheduled_call_at" timestamp,
	"onboarding_call_completed" boolean DEFAULT false,
	"experience_rating" integer,
	"experience_feedback" text,
	"stuck_on_step" integer,
	"support_tickets_created" integer DEFAULT 0,
	"expected_completion_date" timestamp,
	"actual_completion_date" timestamp,
	"onboarding_started" timestamp DEFAULT now() NOT NULL,
	"last_activity_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"type" text NOT NULL,
	"card_brand" text,
	"card_last4" text,
	"card_exp_month" integer,
	"card_exp_year" integer,
	"card_country" text,
	"bank_name" text,
	"bank_last4" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_expired" boolean DEFAULT false NOT NULL,
	"stripe_payment_method_id" text,
	"fingerprint" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_methods_stripe_payment_method_id_unique" UNIQUE("stripe_payment_method_id")
);
--> statement-breakpoint
CREATE TABLE "pre_bookings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"visitor_first_name" text NOT NULL,
	"visitor_last_name" text NOT NULL,
	"visitor_email" text NOT NULL,
	"company" text,
	"purpose" text,
	"visit_date" timestamp NOT NULL,
	"visit_time" text,
	"host_staff_id" varchar,
	"meeting_room_id" varchar,
	"tenant_company_id" varchar,
	"qr_code" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"is_checked_in" boolean DEFAULT false NOT NULL,
	"checked_in_at" timestamp,
	"visitor_id" varchar,
	"email_sent" boolean DEFAULT false,
	"email_sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "print_job_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"print_queue_id" varchar NOT NULL,
	"service_instance_id" varchar,
	"queue_time_ms" integer,
	"processing_time_ms" integer,
	"total_time_ms" integer,
	"generated_code" text,
	"code_length" integer,
	"printer_response" text,
	"was_successful" boolean DEFAULT false NOT NULL,
	"final_status" text NOT NULL,
	"error_details" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "print_queue" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"service_instance_id" varchar,
	"job_type" text NOT NULL,
	"printer_type" text NOT NULL,
	"priority" integer DEFAULT 1 NOT NULL,
	"visitor_data" text,
	"pass_elements" text,
	"printer_settings" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"assigned_at" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"error_message" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"created_by" varchar,
	"request_source" text DEFAULT 'web_app' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "print_service_instances" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"service_name" text NOT NULL,
	"machine_id" text NOT NULL,
	"api_token" text NOT NULL,
	"location" text,
	"supported_printers" text[],
	"poll_interval_seconds" integer DEFAULT 30 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_heartbeat" timestamp,
	"service_version" text,
	"ip_address" text,
	"computer_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "print_service_instances_api_token_unique" UNIQUE("api_token")
);
--> statement-breakpoint
CREATE TABLE "printer_configurations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"printer_name" text NOT NULL,
	"printer_type" text DEFAULT 'standard',
	"paper_size" text DEFAULT 'A4',
	"orientation" text DEFAULT 'portrait',
	"duplex" text DEFAULT 'none',
	"paper_source" text DEFAULT 'auto',
	"print_quality" text DEFAULT 'normal',
	"color_mode" text DEFAULT 'color',
	"resolution" text DEFAULT '600dpi',
	"barcode_format" text DEFAULT 'QR_CODE',
	"barcode_size" text DEFAULT 'medium',
	"barcode_position" text DEFAULT 'bottom_right',
	"thermal_speed" text DEFAULT 'medium',
	"thermal_density" text DEFAULT 'normal',
	"label_width" text DEFAULT '4',
	"label_height" text DEFAULT '6',
	"card_type" text DEFAULT 'pvc',
	"card_thickness" text DEFAULT '30mil',
	"print_sides" text DEFAULT 'single',
	"encoding_options" text[] DEFAULT '{}',
	"margins" text DEFAULT '{"top": 0, "right": 0, "bottom": 0, "left": 0}',
	"custom_settings" text DEFAULT '{}',
	"is_default" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"last_used" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rams_documents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar,
	"department_id" varchar,
	"rams_id_ref" text NOT NULL,
	"document_name" text NOT NULL,
	"document_url" text NOT NULL,
	"expiry_date" timestamp NOT NULL,
	"status" text DEFAULT 'valid' NOT NULL,
	"uploaded_by" varchar,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"review_notes" text,
	"alert_days_before" integer DEFAULT 14,
	"last_alert_sent" timestamp,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_type" text NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"date_from" timestamp NOT NULL,
	"date_to" timestamp NOT NULL,
	"total_visitors" text NOT NULL,
	"avg_duration" text NOT NULL,
	"email_sent" boolean DEFAULT false,
	"email_sent_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "room_booking_attendees" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" varchar NOT NULL,
	"staff_id" varchar,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"is_organizer" boolean DEFAULT false NOT NULL,
	"response_status" text DEFAULT 'pending' NOT NULL,
	"response_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_booking_waitlist" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" varchar NOT NULL,
	"staff_id" varchar NOT NULL,
	"title" text NOT NULL,
	"start_date_time" timestamp NOT NULL,
	"end_date_time" timestamp NOT NULL,
	"expected_attendees" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_bookings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" varchar NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"start_date_time" timestamp NOT NULL,
	"end_date_time" timestamp NOT NULL,
	"booked_by_staff_id" varchar NOT NULL,
	"tenant_company_id" varchar,
	"expected_attendees" integer NOT NULL,
	"attendee_emails" text[] DEFAULT '{}',
	"requires_catering" boolean DEFAULT false NOT NULL,
	"catering_notes" text,
	"special_requirements" text,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"is_recurring" boolean DEFAULT false NOT NULL,
	"recurring_pattern" text,
	"recurring_end_date" timestamp,
	"parent_booking_id" varchar,
	"actual_start_time" timestamp,
	"actual_end_time" timestamp,
	"checked_in_by_staff_id" varchar,
	"reminder_sent" boolean DEFAULT false NOT NULL,
	"confirmation_sent" boolean DEFAULT false NOT NULL,
	"approved_by" varchar,
	"approved_at" timestamp,
	"rejected_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"department" text NOT NULL,
	"employee_id" text NOT NULL,
	"tenant_company_id" varchar,
	"photo_url" text,
	"access_level" text DEFAULT 'staff' NOT NULL,
	"password" text,
	"last_login_at" timestamp,
	"is_checked_in" boolean DEFAULT false NOT NULL,
	"checked_in_at" timestamp,
	"checked_out_at" timestamp,
	"checkout_type" text,
	"manual_check_in" boolean DEFAULT false,
	"is_accounted_for" boolean DEFAULT false NOT NULL,
	"is_fire_marshal" boolean DEFAULT false NOT NULL,
	"emergency_token" text,
	"emergency_token_expires" timestamp,
	"user_id" varchar,
	"induction_completed" boolean DEFAULT false NOT NULL,
	"induction_completed_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "staff_email_unique" UNIQUE("email"),
	CONSTRAINT "staff_employee_id_unique" UNIQUE("employee_id")
);
--> statement-breakpoint
CREATE TABLE "staff_attendance_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"staff_id" varchar NOT NULL,
	"check_in_time" timestamp NOT NULL,
	"check_out_time" timestamp,
	"department" text,
	"role" text,
	"session_type" text DEFAULT 'work' NOT NULL,
	"is_manual_entry" boolean DEFAULT false NOT NULL,
	"checkout_type" text,
	"duration_minutes" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"staff_id" varchar NOT NULL,
	"check_in_time" timestamp NOT NULL,
	"check_out_time" timestamp,
	"is_manual" boolean DEFAULT false NOT NULL,
	"check_in_method" text DEFAULT 'card',
	"check_out_method" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_webhook_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"customer_id" varchar,
	"payload_hash" text NOT NULL,
	"raw_payload" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"processed_at" timestamp,
	"error_message" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"api_version" text,
	"livemode" boolean DEFAULT false NOT NULL,
	"webhook_endpoint" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_webhook_events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"monthly_price" numeric(10, 2) NOT NULL,
	"yearly_price" numeric(10, 2),
	"currency" text DEFAULT 'GBP' NOT NULL,
	"max_visitors_per_month" integer DEFAULT 1000 NOT NULL,
	"max_staff" integer DEFAULT 50 NOT NULL,
	"max_meeting_rooms" integer DEFAULT 10 NOT NULL,
	"max_tenants" integer DEFAULT 5 NOT NULL,
	"max_storage_gb" integer DEFAULT 10 NOT NULL,
	"features" text[] DEFAULT '{}' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_popular" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"trial_days" integer DEFAULT 14 NOT NULL,
	"stripe_product_id" text,
	"stripe_price_id_monthly" text,
	"stripe_price_id_yearly" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_name_unique" UNIQUE("name"),
	CONSTRAINT "subscription_plans_stripe_product_id_unique" UNIQUE("stripe_product_id"),
	CONSTRAINT "subscription_plans_stripe_price_id_monthly_unique" UNIQUE("stripe_price_id_monthly"),
	CONSTRAINT "subscription_plans_stripe_price_id_yearly_unique" UNIQUE("stripe_price_id_yearly")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"plan_id" varchar NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"current_period_start" timestamp NOT NULL,
	"current_period_end" timestamp NOT NULL,
	"billing_cycle" text DEFAULT 'monthly' NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"canceled_at" timestamp,
	"cancellation_reason" text,
	"trial_start" timestamp,
	"trial_end" timestamp,
	"trial_extensions" integer DEFAULT 0,
	"stripe_subscription_id" text,
	"stripe_customer_id" text,
	"metered_usage" boolean DEFAULT false,
	"last_usage_reset" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "support_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"support_user_id" varchar NOT NULL,
	"support_user_name" text NOT NULL,
	"support_user_email" text NOT NULL,
	"session_type" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"category" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"session_start" timestamp DEFAULT now() NOT NULL,
	"session_end" timestamp,
	"duration_minutes" integer,
	"customer_rating" integer,
	"customer_feedback" text,
	"issue_resolved" boolean DEFAULT false,
	"follow_up_required" boolean DEFAULT false,
	"follow_up_date" timestamp,
	"notes" text,
	"resolution" text,
	"zendesk_ticket_id" text,
	"slack_thread_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_companies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"company_name" text NOT NULL,
	"slug" text NOT NULL,
	"logo_url" text,
	"contact_email" text NOT NULL,
	"phone" text,
	"address" text,
	"website" text,
	"admin_first_name" text,
	"admin_last_name" text,
	"admin_email" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"subscription_tier" text DEFAULT 'basic',
	"subscription_expires" timestamp,
	"max_users" integer DEFAULT 50,
	"max_visitors_per_month" integer DEFAULT 1000,
	"primary_color" text DEFAULT '#3b82f6',
	"secondary_color" text DEFAULT '#64748b',
	"custom_visitor_fields" text[] DEFAULT '{}',
	"api_key_enabled" boolean DEFAULT false,
	"api_key" text,
	"data_retention_days" integer DEFAULT 365,
	"gdpr_contact_email" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_companies_company_name_unique" UNIQUE("company_name"),
	CONSTRAINT "tenant_companies_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "trial_tracking" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"subscription_id" varchar,
	"trial_start" timestamp NOT NULL,
	"trial_end" timestamp NOT NULL,
	"original_trial_days" integer DEFAULT 14 NOT NULL,
	"trial_extensions" integer DEFAULT 0 NOT NULL,
	"total_extension_days" integer DEFAULT 0 NOT NULL,
	"extension_reason" text,
	"visitors_created_during_trial" integer DEFAULT 0,
	"staff_created_during_trial" integer DEFAULT 0,
	"logins_during_trial" integer DEFAULT 0,
	"last_login_during_trial" timestamp,
	"features_used" text[] DEFAULT '{}',
	"integrations_connected" integer DEFAULT 0,
	"days_active" integer DEFAULT 0,
	"support_interactions" integer DEFAULT 0,
	"documents_uploaded" integer DEFAULT 0,
	"has_converted" boolean DEFAULT false,
	"conversion_date" timestamp,
	"converted_to_plan" varchar,
	"reminder_emails_sent" integer DEFAULT 0,
	"last_reminder_sent" timestamp,
	"trial_outcome" text,
	"cancellation_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uk_hs_document_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"document_code" text NOT NULL,
	"document_name" text NOT NULL,
	"document_description" text,
	"template_content" text NOT NULL,
	"auto_fill_fields" text[] DEFAULT '{}',
	"is_uk_hs_required" boolean DEFAULT true NOT NULL,
	"compliance_category" text NOT NULL,
	"legal_reference" text,
	"version" text DEFAULT '1.0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_tracking" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"period" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"visitors_count" integer DEFAULT 0 NOT NULL,
	"staff_count" integer DEFAULT 0 NOT NULL,
	"meeting_rooms_count" integer DEFAULT 0 NOT NULL,
	"tenants_count" integer DEFAULT 0 NOT NULL,
	"storage_used_mb" integer DEFAULT 0 NOT NULL,
	"api_requests_count" integer DEFAULT 0 NOT NULL,
	"emails_sent" integer DEFAULT 0 NOT NULL,
	"sms_sent" integer DEFAULT 0 NOT NULL,
	"reports_generated" integer DEFAULT 0 NOT NULL,
	"documents_processed" integer DEFAULT 0 NOT NULL,
	"biometric_scans" integer DEFAULT 0 NOT NULL,
	"is_over_limit" boolean DEFAULT false NOT NULL,
	"overage_charges" numeric(10, 2) DEFAULT '0.00',
	"last_calculated" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_invitations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"invited_by" varchar,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	"used" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"email" text,
	"role" text DEFAULT 'user' NOT NULL,
	"tenant_company_id" varchar,
	"first_name" text,
	"last_name" text,
	"is_active" boolean DEFAULT true,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "visitor_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"visitor_id" varchar NOT NULL,
	"check_in_time" timestamp NOT NULL,
	"check_out_time" timestamp,
	"purpose" text,
	"host_staff_id" varchar,
	"host_name" text,
	"visiting_tenant_id" varchar,
	"tenant_company_name" text,
	"induction_completed" boolean DEFAULT false NOT NULL,
	"induction_completed_at" timestamp,
	"hs_rules_accepted" boolean DEFAULT false NOT NULL,
	"hs_rules_accepted_at" timestamp,
	"e_pass_sent" boolean DEFAULT false NOT NULL,
	"e_pass_sent_at" timestamp,
	"checkout_type" text,
	"notes" text,
	"qr_code" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visitors" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone_number" text,
	"mobile_number" text,
	"company" text,
	"job_title" text,
	"address" text,
	"purpose" text,
	"car_registration" text,
	"host_staff_id" varchar,
	"visiting_tenant_id" varchar,
	"is_pre_booked" boolean DEFAULT false NOT NULL,
	"expected_date_time" timestamp,
	"visit_purpose" text,
	"checked_in_at" timestamp DEFAULT now() NOT NULL,
	"checked_out_at" timestamp,
	"checkout_type" text,
	"is_checked_in" boolean DEFAULT true NOT NULL,
	"is_accounted_for" boolean DEFAULT false NOT NULL,
	"induction_completed" boolean DEFAULT false NOT NULL,
	"induction_completed_at" timestamp,
	"qr_code" text NOT NULL,
	"e_pass_sent" boolean DEFAULT false NOT NULL,
	"e_pass_delivery_type" text,
	"e_pass_sent_at" timestamp,
	"e_pass_url" text,
	"expected_departure_time" timestamp,
	"reminder_sent" boolean DEFAULT false NOT NULL,
	"host_notification_sent" boolean DEFAULT false NOT NULL,
	"hs_rules_accepted" boolean DEFAULT false NOT NULL,
	"hs_rules_accepted_at" timestamp,
	"hs_rules_acceptance_token" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_certifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worker_id" varchar NOT NULL,
	"certification_type" text NOT NULL,
	"certification_number" text,
	"issuer" text,
	"issued_date" timestamp,
	"expiry_date" timestamp,
	"status" text DEFAULT 'valid' NOT NULL,
	"document_url" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_competencies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worker_id" varchar NOT NULL,
	"competency_type" text NOT NULL,
	"certificate_number" text,
	"issuer" text,
	"issued_date" timestamp,
	"expiry_date" timestamp,
	"status" text DEFAULT 'valid' NOT NULL,
	"document_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_document_acceptances" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"assignment_id" varchar NOT NULL,
	"worker_id" varchar NOT NULL,
	"document_template_id" varchar NOT NULL,
	"acceptance_method" text DEFAULT 'email_link' NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"acceptance_token" text NOT NULL,
	"digital_signature" text,
	"confirmation_text" text,
	"accepted_at" timestamp DEFAULT now() NOT NULL,
	"witness_name" text,
	"witness_email" text,
	"audit_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_document_assignments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"worker_id" varchar NOT NULL,
	"company_id" varchar NOT NULL,
	"document_template_id" varchar NOT NULL,
	"assigned_by" varchar NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"due_date" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"email_sent" boolean DEFAULT false NOT NULL,
	"email_sent_at" timestamp,
	"acceptance_token" text,
	"acceptance_url" text,
	"viewed_at" timestamp,
	"accepted_at" timestamp,
	"rejected_at" timestamp,
	"rejection_reason" text,
	"filled_document_content" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "worker_document_assignments_acceptance_token_unique" UNIQUE("acceptance_token")
);
--> statement-breakpoint
ALTER TABLE "building_settings" ADD CONSTRAINT "building_settings_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_issues" ADD CONSTRAINT "card_issues_worker_id_contractor_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."contractor_workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_issues" ADD CONSTRAINT "card_issues_offence_id_card_offences_id_fk" FOREIGN KEY ("offence_id") REFERENCES "public"."card_offences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_issues" ADD CONSTRAINT "card_issues_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_offences" ADD CONSTRAINT "card_offences_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "co2_emissions_data" ADD CONSTRAINT "co2_emissions_data_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "co2_emissions_data" ADD CONSTRAINT "co2_emissions_data_worker_id_contractor_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."contractor_workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "co2_emissions_data" ADD CONSTRAINT "co2_emissions_data_company_id_contractor_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."contractor_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "co2_monthly_summaries" ADD CONSTRAINT "co2_monthly_summaries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "co2_monthly_summaries" ADD CONSTRAINT "co2_monthly_summaries_company_id_contractor_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."contractor_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "co2_records" ADD CONSTRAINT "co2_records_company_id_contractor_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."contractor_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "co2_records" ADD CONSTRAINT "co2_records_worker_id_contractor_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."contractor_workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "co2_records" ADD CONSTRAINT "co2_records_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "co2_sustainability_reports" ADD CONSTRAINT "co2_sustainability_reports_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "co2_sustainability_reports" ADD CONSTRAINT "co2_sustainability_reports_company_id_contractor_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."contractor_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_documents" ADD CONSTRAINT "compliance_documents_company_id_contractor_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."contractor_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_companies" ADD CONSTRAINT "contractor_companies_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_companies" ADD CONSTRAINT "contractor_companies_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_documents" ADD CONSTRAINT "contractor_documents_contractor_id_contractor_companies_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractor_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_documents" ADD CONSTRAINT "contractor_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_visits" ADD CONSTRAINT "contractor_visits_worker_id_contractor_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."contractor_workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_visits" ADD CONSTRAINT "contractor_visits_company_id_contractor_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."contractor_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_visits" ADD CONSTRAINT "contractor_visits_host_staff_id_staff_id_fk" FOREIGN KEY ("host_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_workers" ADD CONSTRAINT "contractor_workers_company_id_contractor_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."contractor_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_workers" ADD CONSTRAINT "contractor_workers_nvq_qualification_id_nvq_qualifications_id_fk" FOREIGN KEY ("nvq_qualification_id") REFERENCES "public"."nvq_qualifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_workers" ADD CONSTRAINT "contractor_workers_card_status_updated_by_users_id_fk" FOREIGN KEY ("card_status_updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_api_key_access_logs" ADD CONSTRAINT "customer_api_key_access_logs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_api_key_access_logs" ADD CONSTRAINT "customer_api_key_access_logs_api_key_id_customer_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."customer_api_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_api_keys" ADD CONSTRAINT "customer_api_keys_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_api_keys" ADD CONSTRAINT "customer_api_keys_previous_key_id_customer_api_keys_id_fk" FOREIGN KEY ("previous_key_id") REFERENCES "public"."customer_api_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_access_logs" ADD CONSTRAINT "developer_access_logs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_approvals" ADD CONSTRAINT "document_approvals_document_id_compliance_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."compliance_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_approvals" ADD CONSTRAINT "document_approvals_contractor_id_contractor_companies_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractor_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_auto_fill_mapping" ADD CONSTRAINT "document_auto_fill_mapping_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_auto_fill_mapping" ADD CONSTRAINT "document_auto_fill_mapping_document_template_id_uk_hs_document_templates_id_fk" FOREIGN KEY ("document_template_id") REFERENCES "public"."uk_hs_document_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enhanced_company_details" ADD CONSTRAINT "enhanced_company_details_company_id_contractor_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."contractor_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enhanced_company_details" ADD CONSTRAINT "enhanced_company_details_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evacuation_accountability" ADD CONSTRAINT "evacuation_accountability_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_articles" ADD CONSTRAINT "help_articles_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_articles" ADD CONSTRAINT "help_articles_category_id_help_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."help_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_articles" ADD CONSTRAINT "help_articles_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_categories" ADD CONSTRAINT "help_categories_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_onboarding_progress" ADD CONSTRAINT "help_onboarding_progress_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_onboarding_progress" ADD CONSTRAINT "help_onboarding_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_user_interactions" ADD CONSTRAINT "help_user_interactions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_user_interactions" ADD CONSTRAINT "help_user_interactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_user_interactions" ADD CONSTRAINT "help_user_interactions_article_id_help_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."help_articles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "induction_answers" ADD CONSTRAINT "induction_answers_token_id_induction_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."induction_tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "induction_answers" ADD CONSTRAINT "induction_answers_question_id_induction_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."induction_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "induction_tokens" ADD CONSTRAINT "induction_tokens_worker_id_contractor_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."contractor_workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_labour_records" ADD CONSTRAINT "local_labour_records_worker_id_contractor_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."contractor_workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_labour_records" ADD CONSTRAINT "local_labour_records_company_id_contractor_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."contractor_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_labour_records" ADD CONSTRAINT "local_labour_records_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_rooms" ADD CONSTRAINT "meeting_rooms_tenant_company_id_tenant_companies_id_fk" FOREIGN KEY ("tenant_company_id") REFERENCES "public"."tenant_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pre_bookings" ADD CONSTRAINT "pre_bookings_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pre_bookings" ADD CONSTRAINT "pre_bookings_host_staff_id_staff_id_fk" FOREIGN KEY ("host_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pre_bookings" ADD CONSTRAINT "pre_bookings_meeting_room_id_meeting_rooms_id_fk" FOREIGN KEY ("meeting_room_id") REFERENCES "public"."meeting_rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pre_bookings" ADD CONSTRAINT "pre_bookings_tenant_company_id_tenant_companies_id_fk" FOREIGN KEY ("tenant_company_id") REFERENCES "public"."tenant_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pre_bookings" ADD CONSTRAINT "pre_bookings_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_job_history" ADD CONSTRAINT "print_job_history_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_job_history" ADD CONSTRAINT "print_job_history_print_queue_id_print_queue_id_fk" FOREIGN KEY ("print_queue_id") REFERENCES "public"."print_queue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_job_history" ADD CONSTRAINT "print_job_history_service_instance_id_print_service_instances_id_fk" FOREIGN KEY ("service_instance_id") REFERENCES "public"."print_service_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_queue" ADD CONSTRAINT "print_queue_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_queue" ADD CONSTRAINT "print_queue_service_instance_id_print_service_instances_id_fk" FOREIGN KEY ("service_instance_id") REFERENCES "public"."print_service_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_service_instances" ADD CONSTRAINT "print_service_instances_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rams_documents" ADD CONSTRAINT "rams_documents_company_id_contractor_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."contractor_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rams_documents" ADD CONSTRAINT "rams_documents_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rams_documents" ADD CONSTRAINT "rams_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rams_documents" ADD CONSTRAINT "rams_documents_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_booking_attendees" ADD CONSTRAINT "room_booking_attendees_booking_id_room_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."room_bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_booking_attendees" ADD CONSTRAINT "room_booking_attendees_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_booking_waitlist" ADD CONSTRAINT "room_booking_waitlist_room_id_meeting_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."meeting_rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_booking_waitlist" ADD CONSTRAINT "room_booking_waitlist_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_bookings" ADD CONSTRAINT "room_bookings_room_id_meeting_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."meeting_rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_bookings" ADD CONSTRAINT "room_bookings_booked_by_staff_id_staff_id_fk" FOREIGN KEY ("booked_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_bookings" ADD CONSTRAINT "room_bookings_tenant_company_id_tenant_companies_id_fk" FOREIGN KEY ("tenant_company_id") REFERENCES "public"."tenant_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_bookings" ADD CONSTRAINT "room_bookings_checked_in_by_staff_id_staff_id_fk" FOREIGN KEY ("checked_in_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_bookings" ADD CONSTRAINT "room_bookings_approved_by_staff_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_tenant_company_id_tenant_companies_id_fk" FOREIGN KEY ("tenant_company_id") REFERENCES "public"."tenant_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_attendance_history" ADD CONSTRAINT "staff_attendance_history_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_attendance_history" ADD CONSTRAINT "staff_attendance_history_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_webhook_events" ADD CONSTRAINT "stripe_webhook_events_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_companies" ADD CONSTRAINT "tenant_companies_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_tracking" ADD CONSTRAINT "trial_tracking_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_tracking" ADD CONSTRAINT "trial_tracking_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_tracking" ADD CONSTRAINT "trial_tracking_converted_to_plan_subscription_plans_id_fk" FOREIGN KEY ("converted_to_plan") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uk_hs_document_templates" ADD CONSTRAINT "uk_hs_document_templates_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_tracking" ADD CONSTRAINT "usage_tracking_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_company_id_tenant_companies_id_fk" FOREIGN KEY ("tenant_company_id") REFERENCES "public"."tenant_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_history" ADD CONSTRAINT "visitor_history_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_history" ADD CONSTRAINT "visitor_history_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_history" ADD CONSTRAINT "visitor_history_host_staff_id_staff_id_fk" FOREIGN KEY ("host_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_history" ADD CONSTRAINT "visitor_history_visiting_tenant_id_tenant_companies_id_fk" FOREIGN KEY ("visiting_tenant_id") REFERENCES "public"."tenant_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_host_staff_id_staff_id_fk" FOREIGN KEY ("host_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_visiting_tenant_id_tenant_companies_id_fk" FOREIGN KEY ("visiting_tenant_id") REFERENCES "public"."tenant_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_certifications" ADD CONSTRAINT "worker_certifications_worker_id_contractor_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."contractor_workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_competencies" ADD CONSTRAINT "worker_competencies_worker_id_contractor_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."contractor_workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_document_acceptances" ADD CONSTRAINT "worker_document_acceptances_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_document_acceptances" ADD CONSTRAINT "worker_document_acceptances_assignment_id_worker_document_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."worker_document_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_document_acceptances" ADD CONSTRAINT "worker_document_acceptances_worker_id_contractor_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."contractor_workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_document_acceptances" ADD CONSTRAINT "worker_document_acceptances_document_template_id_uk_hs_document_templates_id_fk" FOREIGN KEY ("document_template_id") REFERENCES "public"."uk_hs_document_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_document_assignments" ADD CONSTRAINT "worker_document_assignments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_document_assignments" ADD CONSTRAINT "worker_document_assignments_worker_id_contractor_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."contractor_workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_document_assignments" ADD CONSTRAINT "worker_document_assignments_company_id_contractor_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."contractor_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_document_assignments" ADD CONSTRAINT "worker_document_assignments_document_template_id_uk_hs_document_templates_id_fk" FOREIGN KEY ("document_template_id") REFERENCES "public"."uk_hs_document_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_document_assignments" ADD CONSTRAINT "worker_document_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_api_key_access_logs_customer_id_idx" ON "customer_api_key_access_logs" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_api_key_access_logs_api_key_id_idx" ON "customer_api_key_access_logs" USING btree ("api_key_id");--> statement-breakpoint
CREATE INDEX "customer_api_key_access_logs_accessed_at_idx" ON "customer_api_key_access_logs" USING btree ("accessed_at");--> statement-breakpoint
CREATE INDEX "customer_api_key_access_logs_ip_address_idx" ON "customer_api_key_access_logs" USING btree ("ip_address");--> statement-breakpoint
CREATE INDEX "customer_api_key_access_logs_suspicious_idx" ON "customer_api_key_access_logs" USING btree ("suspicious_activity");--> statement-breakpoint
CREATE INDEX "customer_api_key_access_logs_response_status_idx" ON "customer_api_key_access_logs" USING btree ("response_status");--> statement-breakpoint
CREATE INDEX "customer_api_keys_customer_id_idx" ON "customer_api_keys" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_api_keys_fingerprint_idx" ON "customer_api_keys" USING btree ("key_fingerprint");--> statement-breakpoint
CREATE INDEX "customer_api_keys_status_idx" ON "customer_api_keys" USING btree ("status");--> statement-breakpoint
CREATE INDEX "customer_api_keys_last_used_at_idx" ON "customer_api_keys" USING btree ("last_used_at");--> statement-breakpoint
CREATE INDEX "customers_company_name_idx" ON "customers" USING btree ("company_name");--> statement-breakpoint
CREATE INDEX "customers_slug_idx" ON "customers" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "customers_is_active_idx" ON "customers" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "stripe_webhook_events_event_id_idx" ON "stripe_webhook_events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "stripe_webhook_events_status_idx" ON "stripe_webhook_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "stripe_webhook_events_customer_id_idx" ON "stripe_webhook_events" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "stripe_webhook_events_created_at_idx" ON "stripe_webhook_events" USING btree ("created_at");