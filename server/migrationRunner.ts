import { eq } from 'drizzle-orm';
import type { CustomerDatabaseService } from './customerDatabase';

/**
 * Lightweight Migration Framework for Isolated Customer Databases
 * 
 * Ensures all customer databases stay in sync with the latest schema
 * without requiring manual column-by-column fixes.
 */

export interface Migration {
  version: string;
  description: string;
  up: (db: any) => Promise<void>;
}

export class MigrationRunner {
  private migrations: Migration[] = [];
  
  constructor(private customerDbService: CustomerDatabaseService) {}
  
  registerMigration(migration: Migration) {
    this.migrations.push(migration);
    // Sort by version to ensure consistent execution order
    this.migrations.sort((a, b) => a.version.localeCompare(b.version));
  }
  
  async ensureSchema(customerId: string) {
    const db = await this.customerDbService.getCustomerDatabase(customerId);
    
    try {
      // Create schema_version table if it doesn't exist
      const schemaVersionExists = await db.execute(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'schema_version'
        )
      `);
      
      if (!schemaVersionExists.rows[0]?.exists) {
        await db.execute(`
          CREATE TABLE schema_version (
            version TEXT PRIMARY KEY,
            applied_at TIMESTAMP DEFAULT NOW(),
            description TEXT
          )
        `);
      }
      
      // Get applied migrations
      const appliedMigrations = await db.execute('SELECT version FROM schema_version');
      const appliedVersions = new Set(appliedMigrations.rows.map((row: any) => row.version));
      
      // Run pending migrations
      for (const migration of this.migrations) {
        if (!appliedVersions.has(migration.version)) {
          console.log(`🔄 Running migration ${migration.version}: ${migration.description}`);
          
          await db.execute('BEGIN');
          try {
            await migration.up(db);
            
            // Mark migration as applied
            await db.execute(`
              INSERT INTO schema_version (version, description) 
              VALUES ('${migration.version}', '${migration.description}')
            `);
            
            await db.execute('COMMIT');
            console.log(`✅ Migration ${migration.version} applied successfully`);
          } catch (error) {
            await db.execute('ROLLBACK');
            throw error;
          }
        }
      }
    } catch (error) {
      console.error(`❌ Migration error for customer ${customerId}:`, error);
      throw error;
    }
  }
}

// Migration to rebuild company_settings table with complete schema
const rebuildCompanySettingsMigration: Migration = {
  version: '20250917_001_rebuild_company_settings',
  description: 'Rebuild company_settings table to match current isolatedSchema.ts',
  async up(db: any) {
    // Create new company_settings table with complete schema
    await db.execute(`
      CREATE TABLE company_settings_new (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        company_name TEXT NOT NULL DEFAULT 'TechCorp Ltd',
        logo_url TEXT,
        address TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        website TEXT DEFAULT '',
        email TEXT DEFAULT '',
        email_reports_enabled BOOLEAN DEFAULT false,
        report_frequency TEXT DEFAULT 'weekly',
        report_recipients TEXT[] DEFAULT ARRAY['admin@company.com'],
        last_report_sent TIMESTAMP,
        smtp_host TEXT DEFAULT '',
        smtp_port TEXT DEFAULT '587',
        smtp_security TEXT DEFAULT 'STARTTLS',
        smtp_username TEXT DEFAULT '',
        smtp_password TEXT DEFAULT '',
        smtp_from_email TEXT DEFAULT '',
        smtp_from_name TEXT DEFAULT '',
        smtp_reply_to TEXT DEFAULT '',
        smtp_auth_method TEXT DEFAULT 'LOGIN',
        smtp_connection_timeout TEXT DEFAULT '30',
        smtp_test_email_sent BOOLEAN DEFAULT false,
        smtp_last_tested TIMESTAMP,
        enable_daily_reset BOOLEAN DEFAULT true,
        daily_reset_time TEXT DEFAULT '00:00',
        daily_reset_timezone TEXT DEFAULT 'Europe/London',
        grace_period_minutes TEXT DEFAULT '15',
        enable_weekend_reset BOOLEAN DEFAULT false,
        enable_holiday_reset BOOLEAN DEFAULT false,
        notify_forgotten_checkouts BOOLEAN DEFAULT true,
        last_daily_reset TIMESTAMP,
        allow_manual_reset BOOLEAN DEFAULT true,
        reset_log_retention_days TEXT DEFAULT '90',
        enable_24x7_operations BOOLEAN DEFAULT false,
        alert_before_reset BOOLEAN DEFAULT true,
        alert_minutes_before TEXT DEFAULT '30',
        background_color TEXT DEFAULT '#f8fafc',
        foreground_color TEXT DEFAULT '#1e293b',
        variable_text_color TEXT DEFAULT '#374151',
        accent_color TEXT DEFAULT '#3b82f6',
        banner_url TEXT,
        theme TEXT DEFAULT 'light',
        selected_printer TEXT DEFAULT 'PDF Printer',
        enable_qr_codes BOOLEAN DEFAULT true,
        enable_2d_barcodes BOOLEAN DEFAULT false,
        barcode_format TEXT DEFAULT 'QR_CODE',
        print_quality TEXT DEFAULT 'normal',
        id_card_printer TEXT DEFAULT '',
        id_card_print_quality TEXT DEFAULT 'high',
        id_card_paper_size TEXT DEFAULT 'cr80',
        id_card_orientation TEXT DEFAULT 'landscape',
        id_card_design TEXT DEFAULT '[]',
        visitor_pass_design TEXT DEFAULT '[]',
        contractor_pass_design TEXT DEFAULT '[]',
        thermal_selected_printer TEXT DEFAULT 'tec',
        thermal_print_method TEXT DEFAULT 'direct',
        thermal_print_quality TEXT DEFAULT 'reception',
        thermal_printer_settings TEXT DEFAULT '{}',
        biostar_enabled BOOLEAN DEFAULT false,
        biostar_server_url TEXT DEFAULT '',
        biostar_api_key TEXT DEFAULT '',
        biostar_username TEXT DEFAULT '',
        biostar_password TEXT DEFAULT '',
        biostar_database_id TEXT DEFAULT '1',
        biostar_sync_interval TEXT DEFAULT '300',
        biometric_devices TEXT[] DEFAULT ARRAY[]::TEXT[],
        reader_settings TEXT DEFAULT '{}',
        openai_model TEXT DEFAULT 'gpt-5',
        openai_temperature TEXT DEFAULT '0.7',
        openai_max_tokens TEXT DEFAULT '4000',
        video_quality_preference TEXT DEFAULT 'high',
        enable_advanced_video_features BOOLEAN DEFAULT true,
        default_video_length TEXT DEFAULT '15',
        ai_instructions_prompt TEXT DEFAULT 'Create comprehensive, engaging safety induction content',
        qr_reader_enabled BOOLEAN DEFAULT false,
        qr_reader_device TEXT DEFAULT 'auto',
        qr_code_format TEXT DEFAULT 'visigate',
        qr_reader_settings TEXT DEFAULT '{}',
        clue_enabled BOOLEAN DEFAULT false,
        clue_api_url TEXT DEFAULT 'https://api.suprema-clue.com',
        clue_api_key TEXT DEFAULT '',
        clue_api_secret TEXT DEFAULT '',
        clue_organization_id TEXT DEFAULT '',
        clue_webhook_secret TEXT DEFAULT '',
        clue_dynamic_qr_enabled BOOLEAN DEFAULT true,
        clue_qr_validity_minutes TEXT DEFAULT '60',
        clue_device_groups TEXT[] DEFAULT ARRAY[]::TEXT[],
        clue_sync_interval TEXT DEFAULT '300',
        clue_auto_register_visitors BOOLEAN DEFAULT true,
        clue_auto_delete_expired BOOLEAN DEFAULT true,
        clue_test_mode BOOLEAN DEFAULT false,
        clue_last_sync TIMESTAMP,
        e_pass_enabled BOOLEAN DEFAULT false,
        e_pass_delivery_method TEXT DEFAULT 'both',
        e_pass_email_template TEXT DEFAULT 'default',
        e_pass_sms_template TEXT DEFAULT 'default',
        e_pass_auto_checkout BOOLEAN DEFAULT true,
        e_pass_checkout_reminder_minutes TEXT DEFAULT '30',
        e_pass_host_notification_enabled BOOLEAN DEFAULT true,
        e_pass_host_notification_delay TEXT DEFAULT '60',
        twilio_enabled BOOLEAN DEFAULT false,
        twilio_account_sid TEXT DEFAULT '',
        twilio_auth_token TEXT DEFAULT '',
        twilio_phone_number TEXT DEFAULT '',
        twilio_messaging_service_sid TEXT DEFAULT '',
        geofencing_enabled BOOLEAN DEFAULT false,
        geofence_radius TEXT DEFAULT '100',
        geofence_lat TEXT DEFAULT '',
        geofence_lng TEXT DEFAULT '',
        x_station_enabled BOOLEAN DEFAULT false,
        x_station_devices TEXT[] DEFAULT ARRAY[]::TEXT[],
        x_station_checkout_mode TEXT DEFAULT 'qr',
        x_station_api_endpoint TEXT DEFAULT '',
        hs_rules_enabled BOOLEAN DEFAULT true,
        hs_rules_content TEXT DEFAULT '',
        hs_rules_url TEXT DEFAULT '',
        hs_rules_require_acceptance BOOLEAN DEFAULT false,
        feature_multi_tenant BOOLEAN DEFAULT true,
        feature_meeting_rooms BOOLEAN DEFAULT true,
        feature_time_attendance BOOLEAN DEFAULT true,
        feature_induction_settings BOOLEAN DEFAULT true,
        feature_kiosk BOOLEAN DEFAULT true,
        feature_ai_demo BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    
    // Get existing company name if possible, otherwise use default
    let existingCompanyName = 'TechCorp Ltd';
    
    try {
      const tableExists = await db.execute(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'company_settings'
        )
      `);
      
      if (tableExists.rows[0]?.exists) {
        const existingData = await db.execute(`
          SELECT company_name FROM company_settings LIMIT 1
        `);
        if (existingData.rows[0]?.company_name) {
          existingCompanyName = existingData.rows[0].company_name;
        }
      }
    } catch (error) {
      console.log('⚠️ Could not read existing company name, using default');
    }
    
    // Create fresh settings with complete schema (avoids column mapping issues)
    await db.execute(`
      INSERT INTO company_settings_new (company_name)
      VALUES ('${existingCompanyName}')
    `);
    
    console.log(`✅ Fresh company settings created with name: ${existingCompanyName}`);
    
    // Drop old table and rename new one
    await db.execute('DROP TABLE company_settings');
    await db.execute('ALTER TABLE company_settings_new RENAME TO company_settings');
    
    console.log('✅ Company settings table rebuilt with complete schema');
  }
};

// Create and configure global migration runner
export function createMigrationRunner(customerDbService: CustomerDatabaseService): MigrationRunner {
  const runner = new MigrationRunner(customerDbService);
  runner.registerMigration(rebuildCompanySettingsMigration);
  return runner;
}