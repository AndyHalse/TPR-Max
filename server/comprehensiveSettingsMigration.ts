import type { Migration } from './migrationRunner';
import { logger } from './utils/logger';

/**
 * COMPREHENSIVE SETTINGS COLUMN MIGRATION
 * 
 * This migration ensures ALL columns from isolatedSchema.ts companySettings
 * table exist in customer databases. This prevents any future 42703 errors.
 */

export const addAllMissingCompanySettingsColumnsMigration: Migration = {
  version: '20250917_100_add_all_missing_company_settings_columns',
  description: 'Add ALL missing company settings columns to prevent schema drift issues',
  async up(db: any) {
    logger.info('🔄 Ensuring ALL company_settings columns exist...');
    
    // Get existing columns
    const existingColumns = await db.execute(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'company_settings'
    `);
    
    const existingColumnNames = new Set(existingColumns.rows.map((row: any) => row.column_name));
    logger.info(`📋 Found ${existingColumnNames.size} existing columns`);
    
    // ALL columns that should exist based on isolatedSchema.ts
    const requiredColumns = [
      // Basic company info
      'company_name TEXT NOT NULL DEFAULT \'TechCorp Ltd\'',
      'logo_url TEXT',
      'address TEXT DEFAULT \'\'',
      'phone TEXT DEFAULT \'\'',
      'website TEXT DEFAULT \'\'',
      'email TEXT DEFAULT \'\'',
      
      // Email and report settings
      'email_reports_enabled BOOLEAN DEFAULT false',
      'report_frequency TEXT DEFAULT \'weekly\'',
      'report_recipients TEXT[] DEFAULT ARRAY[\'admin@company.com\']',
      'last_report_sent TIMESTAMP',
      
      // SMTP Configuration
      'smtp_host TEXT DEFAULT \'\'',
      'smtp_port TEXT DEFAULT \'587\'',
      'smtp_security TEXT DEFAULT \'STARTTLS\'',
      'smtp_username TEXT DEFAULT \'\'',
      'smtp_password TEXT DEFAULT \'\'',
      'smtp_from_email TEXT DEFAULT \'\'',
      'smtp_from_name TEXT DEFAULT \'\'',
      'smtp_reply_to TEXT DEFAULT \'\'',
      'smtp_auth_method TEXT DEFAULT \'LOGIN\'',
      'smtp_connection_timeout TEXT DEFAULT \'30\'',
      'smtp_test_email_sent BOOLEAN DEFAULT false',
      'smtp_last_tested TIMESTAMP',
      
      // Daily Reset Configuration
      'enable_daily_reset BOOLEAN DEFAULT true',
      'daily_reset_time TEXT DEFAULT \'00:00\'',
      'daily_reset_timezone TEXT DEFAULT \'Europe/London\'',
      'grace_period_minutes TEXT DEFAULT \'15\'',
      'enable_weekend_reset BOOLEAN DEFAULT false',
      'enable_holiday_reset BOOLEAN DEFAULT false',
      'notify_forgotten_checkouts BOOLEAN DEFAULT true',
      'last_daily_reset TIMESTAMP',
      'allow_manual_reset BOOLEAN DEFAULT true',
      'reset_log_retention_days TEXT DEFAULT \'90\'',
      'enable_24x7_operations BOOLEAN DEFAULT false',
      'alert_before_reset BOOLEAN DEFAULT true',
      'alert_minutes_before TEXT DEFAULT \'30\'',
      
      // Branding settings  
      'background_color TEXT DEFAULT \'#f8fafc\'',
      'foreground_color TEXT DEFAULT \'#1e293b\'',
      'variable_text_color TEXT DEFAULT \'#374151\'',
      'accent_color TEXT DEFAULT \'#3b82f6\'',
      'banner_url TEXT',
      'theme TEXT DEFAULT \'light\'',
      
      // Printer settings
      'selected_printer TEXT DEFAULT \'PDF Printer\'',
      'enable_qr_codes BOOLEAN DEFAULT true',
      'enable_2d_barcodes BOOLEAN DEFAULT false',
      'barcode_format TEXT DEFAULT \'QR_CODE\'',
      'print_quality TEXT DEFAULT \'normal\'',
      
      // ID Card printer settings
      'id_card_printer TEXT DEFAULT \'\'',
      'id_card_print_quality TEXT DEFAULT \'high\'',
      'id_card_paper_size TEXT DEFAULT \'cr80\'',
      'id_card_orientation TEXT DEFAULT \'landscape\'',
      'id_card_design TEXT DEFAULT \'[]\'',
      
      // Thermal Pass Designs
      'visitor_pass_design TEXT DEFAULT \'[]\'',
      'contractor_pass_design TEXT DEFAULT \'[]\'',
      
      // Thermal Printer Settings
      'thermal_selected_printer TEXT DEFAULT \'tec\'',
      'thermal_print_method TEXT DEFAULT \'direct\'',
      'thermal_print_quality TEXT DEFAULT \'reception\'',
      'thermal_printer_settings TEXT DEFAULT \'{}\'',
      
      // Suprema Biostar integration
      'biostar_enabled BOOLEAN DEFAULT false',
      'biostar_server_url TEXT DEFAULT \'\'',
      'biostar_api_key TEXT DEFAULT \'\'',
      'biostar_username TEXT DEFAULT \'\'',
      'biostar_password TEXT DEFAULT \'\'',
      'biostar_database_id TEXT DEFAULT \'1\'',
      'biostar_sync_interval TEXT DEFAULT \'300\'',
      
      // Biometric reader devices
      'biometric_devices TEXT[] DEFAULT ARRAY[]::TEXT[]',
      'reader_settings TEXT DEFAULT \'{}\'',
      
      // AI and Video Generation
      'openai_model TEXT DEFAULT \'gpt-5\'',
      'claude_model TEXT DEFAULT \'claude-3-5-sonnet\'',
      'openai_temperature TEXT DEFAULT \'0.7\'',
      'openai_max_tokens TEXT DEFAULT \'4000\'',
      'video_quality_preference TEXT DEFAULT \'high\'',
      'enable_advanced_video_features BOOLEAN DEFAULT true',
      'default_video_length TEXT DEFAULT \'15\'',
      'ai_instructions_prompt TEXT DEFAULT \'Create comprehensive, engaging safety induction content\'',
      
      // QR Code Reader Integration
      'qr_reader_enabled BOOLEAN DEFAULT false',
      'qr_reader_device TEXT DEFAULT \'auto\'',
      'qr_code_format TEXT DEFAULT \'visigate\'',
      'qr_reader_settings TEXT DEFAULT \'{}\'',
      
      // Suprema CLUe Cloud Platform
      'clue_enabled BOOLEAN DEFAULT false',
      'clue_api_url TEXT DEFAULT \'https://api.suprema-clue.com\'',
      'clue_api_key TEXT DEFAULT \'\'',
      'clue_api_secret TEXT DEFAULT \'\'',
      'clue_organization_id TEXT DEFAULT \'\'',
      'clue_webhook_secret TEXT DEFAULT \'\'',
      'clue_dynamic_qr_enabled BOOLEAN DEFAULT true',
      'clue_qr_validity_minutes TEXT DEFAULT \'60\'',
      'clue_device_groups TEXT[] DEFAULT ARRAY[]::TEXT[]',
      'clue_sync_interval TEXT DEFAULT \'300\'',
      'clue_auto_register_visitors BOOLEAN DEFAULT true',
      'clue_auto_delete_expired BOOLEAN DEFAULT true',
      'clue_test_mode BOOLEAN DEFAULT false',
      'clue_last_sync TIMESTAMP',
      
      // E-Pass Configuration
      'e_pass_enabled BOOLEAN DEFAULT true',
      'e_pass_delivery_method TEXT DEFAULT \'both\'',
      'e_pass_email_template TEXT DEFAULT \'default\'',
      'e_pass_sms_template TEXT DEFAULT \'default\'',
      'e_pass_auto_checkout BOOLEAN DEFAULT true',
      'e_pass_checkout_reminder_minutes TEXT DEFAULT \'30\'',
      'e_pass_host_notification_enabled BOOLEAN DEFAULT true',
      'e_pass_host_notification_delay TEXT DEFAULT \'60\'',
      
      // Twilio SMS Configuration
      'twilio_enabled BOOLEAN DEFAULT false',
      'twilio_account_sid TEXT DEFAULT \'\'',
      'twilio_auth_token TEXT DEFAULT \'\'',
      'twilio_phone_number TEXT DEFAULT \'\'',
      'twilio_messaging_service_sid TEXT DEFAULT \'\'',
      
      // Geofencing Configuration
      'geofencing_enabled BOOLEAN DEFAULT false',
      'geofence_radius TEXT DEFAULT \'100\'',
      'geofence_lat TEXT DEFAULT \'\'',
      'geofence_lng TEXT DEFAULT \'\'',
      
      // BioStar X-Station 2 Integration
      'x_station_enabled BOOLEAN DEFAULT false',
      'x_station_devices TEXT[] DEFAULT ARRAY[]::TEXT[]',
      'x_station_checkout_mode TEXT DEFAULT \'qr\'',
      'x_station_api_endpoint TEXT DEFAULT \'\'',
      
      // Health & Safety Rules
      'hs_rules_enabled BOOLEAN DEFAULT true',
      'hs_rules_content TEXT DEFAULT \'\'',
      'hs_rules_url TEXT DEFAULT \'\'',
      'hs_rules_require_acceptance BOOLEAN DEFAULT false',
      
      // Feature Toggles
      'feature_multi_tenant BOOLEAN DEFAULT true',
      'feature_meeting_rooms BOOLEAN DEFAULT true',
      'feature_time_attendance BOOLEAN DEFAULT true',
      'feature_induction_settings BOOLEAN DEFAULT true',
      'feature_kiosk BOOLEAN DEFAULT true',
      'feature_ai_demo BOOLEAN DEFAULT false',
      
      // Timestamps
      'created_at TIMESTAMP DEFAULT NOW() NOT NULL',
      'updated_at TIMESTAMP DEFAULT NOW() NOT NULL'
    ];
    
    let addedCount = 0;
    
    // Add missing columns
    for (const columnDef of requiredColumns) {
      const columnName = columnDef.split(' ')[0];
      
      if (!existingColumnNames.has(columnName)) {
        try {
          logger.info(`🔄 Adding missing column: ${columnName}`);
          
          await db.execute(`
            ALTER TABLE company_settings ADD COLUMN ${columnDef}
          `);
          
          addedCount++;
          logger.info(`✅ Added ${columnName} column successfully`);
        } catch (error: any) {
          // Log error but continue with other columns
          logger.warn(`⚠️ Failed to add column ${columnName}: ${error.message}`);
        }
      }
    }
    
    logger.info(`✅ Added ${addedCount} missing columns to company_settings table`);
    
    if (addedCount === 0) {
      logger.info('ℹ️ All required columns already exist, no changes needed');
    }
  }
};

export const syncAllCompanySettingsColumnsMigration: Migration = {
  version: '20260628_101_sync_company_settings_all_columns',
  description: 'Ensure ALL current company_settings columns exist — covers columns added after 20250917_100',
  async up(db: any) {
    logger.info('🔄 [101] Syncing ALL company_settings columns...');

    const existingColumns = await db.execute(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'company_settings'
    `);
    const existing = new Set(existingColumns.rows.map((r: any) => r.column_name));

    const cols: Array<[string, string]> = [
      ['cdm_alerts_email', "TEXT DEFAULT ''"],
      ['nav_banner_color', 'TEXT'],
      ['nav_banner_invert', 'BOOLEAN DEFAULT false'],
      ['kiosk_notice_message', "TEXT DEFAULT 'All visitors must sign in before entering the building.'"],
      ['biostar_webhook_secret', 'TEXT'],
      ['site_address', 'TEXT'],
      ['induction_hazards', 'TEXT'],
      ['induction_ppe', 'TEXT'],
      ['assembly_point', 'TEXT'],
      ['first_aid_location', 'TEXT'],
      ['emergency_contact', 'TEXT'],
      ['induction_site_rules', 'TEXT'],
      ['induction_industry', 'TEXT'],
      ['induction_validity_period', "TEXT DEFAULT 'none'"],
      ['induction_expiry_reminder_days', "TEXT DEFAULT '30'"],
      ['nda_enabled', 'BOOLEAN DEFAULT false'],
      ['nda_content', "TEXT DEFAULT ''"],
      ['nda_require_signature', 'BOOLEAN DEFAULT false'],
      ['nda_applies_to', "TEXT DEFAULT 'visitors'"],
      ['phone_provider', "TEXT DEFAULT '8x8'"],
      ['voice_notifications_enabled', 'BOOLEAN DEFAULT false'],
      ['eight_by_x_api_key', "TEXT DEFAULT ''"],
      ['eight_by_x_api_secret', "TEXT DEFAULT ''"],
      ['eight_by_x_account_id', "TEXT DEFAULT ''"],
      ['eight_by_x_base_url', "TEXT DEFAULT 'https://vcc-eu.8x8.com/api/v1'"],
      ['default_voice_language', "TEXT DEFAULT 'en-GB'"],
      ['default_voice_profile', "TEXT DEFAULT 'en-GB-Standard-A'"],
      ['feature_email_outbox', 'BOOLEAN DEFAULT true'],
      ['feature_martyn_law', 'BOOLEAN DEFAULT true'],
      ['feature_incident_reports', 'BOOLEAN DEFAULT true'],
      ['feature_hs_incidents', 'BOOLEAN DEFAULT true'],
      ['feature_bbs', 'BOOLEAN DEFAULT false'],
      ['feature_fire_risk_assessment', 'BOOLEAN DEFAULT true'],
      ['feature_compliance_dashboard', 'BOOLEAN DEFAULT true'],
      ['compliance_cert_alert_hour', 'INTEGER DEFAULT 7'],
      ['ptw_alert_hour', 'INTEGER DEFAULT 7'],
      ['feature_hr_module', 'BOOLEAN DEFAULT false'],
      ['feature_template_library', 'BOOLEAN DEFAULT true'],
      ['feature_teams_integration', 'BOOLEAN DEFAULT false'],
      ['feature_calendar_integration', 'BOOLEAN DEFAULT false'],
      ['feature_dashboard', 'BOOLEAN DEFAULT true'],
      ['feature_visitors', 'BOOLEAN DEFAULT true'],
      ['feature_contractors', 'BOOLEAN DEFAULT true'],
      ['feature_staff', 'BOOLEAN DEFAULT true'],
      ['feature_muster_list', 'BOOLEAN DEFAULT true'],
      ['feature_reports', 'BOOLEAN DEFAULT true'],
      ['feature_settings_page', 'BOOLEAN DEFAULT true'],
      ['induction_allow_hazard_report', 'BOOLEAN DEFAULT true'],
      ['incident_manager_url_id', 'TEXT'],
      ['notify_on_document_deletion', 'BOOLEAN DEFAULT true'],
      ['notify_on_document_expiry', 'BOOLEAN DEFAULT true'],
      ['lone_worker_enabled', 'BOOLEAN DEFAULT false'],
      ['lone_worker_check_interval_mins', 'INTEGER DEFAULT 30'],
      ['lone_worker_grace_period_mins', 'INTEGER DEFAULT 10'],
      ['lone_worker_l1_name', "TEXT DEFAULT ''"],
      ['lone_worker_l1_email', "TEXT DEFAULT ''"],
      ['lone_worker_l2_name', "TEXT DEFAULT ''"],
      ['lone_worker_l2_email', "TEXT DEFAULT ''"],
      ['lone_worker_l2_delay_mins', 'INTEGER DEFAULT 15'],
      ['lone_worker_l3_delay_mins', 'INTEGER DEFAULT 30'],
      ['sso_login_mode', "TEXT DEFAULT 'standard'"],
      ['sso_auto_provision', 'BOOLEAN DEFAULT true'],
      ['sso_default_role', "TEXT DEFAULT 'user'"],
      ['sso_tenant_id', 'VARCHAR'],
      ['sso_client_id', 'VARCHAR'],
      ['sso_client_secret', 'VARCHAR'],
      ['sso_client_secret_iv', 'VARCHAR'],
      ['sso_client_secret_tag', 'VARCHAR'],
      ['sso_redirect_uri', 'VARCHAR'],
      ['onboarding_checklist_dismissed', 'BOOLEAN DEFAULT false'],
      ['quick_setup_dismissed', 'BOOLEAN DEFAULT false'],
      ['feature_contractor_portal', 'BOOLEAN DEFAULT false'],
    ];

    let added = 0;
    for (const [col, def] of cols) {
      if (!existing.has(col)) {
        try {
          await db.execute(`ALTER TABLE company_settings ADD COLUMN ${col} ${def}`);
          added++;
        } catch (err: any) {
          logger.warn(`⚠️ [101] add ${col}: ${err.message?.substring(0, 80)}`);
        }
      }
    }
    logger.info(`✅ [101] company_settings sync complete — ${added} columns added`);
  }
};

export const comprehensiveSettingsMigrations: Migration[] = [
  addAllMissingCompanySettingsColumnsMigration,
  syncAllCompanySettingsColumnsMigration,
];