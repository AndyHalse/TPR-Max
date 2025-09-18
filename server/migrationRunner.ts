import { eq } from 'drizzle-orm';
import type { CustomerDatabaseService } from './customerDatabase';
import { contractorMigrations } from './contractorMigrations';
import { cleanupMigrations } from './cleanupMigrations';
import { settingsColumnMigrations } from './settingsColumnMigration';
import { comprehensiveSettingsMigrations } from './comprehensiveSettingsMigration';
import { staffSessionsMigrations } from './staffSessionsMigration';

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
            
            // Mark migration as applied (idempotent)
            await db.execute(`
              INSERT INTO schema_version (version, description) 
              VALUES ('${migration.version}', '${migration.description}')
              ON CONFLICT (version) DO NOTHING
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

  /**
   * Get all registered migrations for debugging
   */
  getMigrations(): Migration[] {
    return this.migrations;
  }

  /**
   * Run migrations for all active customers
   */
  async runMigrationsForAllCustomers(): Promise<void> {
    try {
      const customers = await this.customerDbService.getAllCustomers();
      console.log(`🔄 Running migrations for ${customers.length} customers...`);

      for (const customer of customers) {
        if (customer.isActive) {
          console.log(`\n🔄 Running migrations for customer: ${customer.companyName} (${customer.id})`);
          try {
            await this.ensureSchema(customer.id);
            console.log(`✅ Migrations completed for customer: ${customer.companyName}`);
          } catch (error) {
            console.error(`❌ Migration failed for customer ${customer.companyName}:`, error);
            // Continue with other customers
          }
        }
      }

      console.log(`\n✅ Migration process completed for all customers`);
    } catch (error) {
      console.error(`❌ Failed to run migrations for all customers:`, error);
      throw error;
    }
  }
}

/**
 * Create and configure migration runner with all migrations
 */
export function createMigrationRunner(customerDbService: CustomerDatabaseService): MigrationRunner {
  const runner = new MigrationRunner(customerDbService);
  
  // Register all migrations in order
  const allMigrations = [
    rebuildCompanySettingsMigration,
    ...contractorMigrations,
    ...cleanupMigrations,
    ...settingsColumnMigrations,
    ...comprehensiveSettingsMigrations,
    addMissingCompanySettingsColumnsMigration,
    ...staffSessionsMigrations,
  ];

  allMigrations.forEach(migration => {
    runner.registerMigration(migration);
  });

  console.log(`📋 Registered ${allMigrations.length} migrations`);
  return runner;
}

// Migration to rebuild company_settings table with complete schema
const rebuildCompanySettingsMigration: Migration = {
  version: '20250917_001_rebuild_company_settings',
  description: 'Rebuild company_settings table to match current isolatedSchema.ts',
  async up(db: any) {
    // Add pgcrypto extension for UUID generation
    try {
      await db.execute(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    } catch (error: any) {
      // PostgreSQL error code 23505 = duplicate key constraint violation
      // This means the extension already exists, which is fine
      if (error?.code === '23505' && error?.detail?.includes('pgcrypto')) {
        // Extension already exists, continue silently
      } else {
        // Re-throw other errors
        throw error;
      }
    }
    
    // Check if table already has correct schema to make migration idempotent
    const tableExists = await db.execute(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'company_settings'
      )
    `);
    
    let needsRebuild = true;
    let existingCompanyName = 'TechCorp Ltd';
    
    if (tableExists.rows[0]?.exists) {
      // Check if table has all required columns
      const columns = await db.execute(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'company_settings'
      `);
      
      const existingColumns = new Set(columns.rows.map((row: any) => row.column_name));
      const requiredColumns = [
        'feature_multi_tenant', 'feature_meeting_rooms', 'feature_time_attendance',
        'feature_induction_settings', 'feature_kiosk', 'feature_ai_demo',
        'clue_enabled', 'e_pass_enabled', 'twilio_enabled', 'smtp_host',
        'smtp_port', 'smtp_username', 'smtp_password', 'smtp_from_email'
      ];
      
      // If table has all key feature columns, assume it's up to date
      const hasAllFeatures = requiredColumns.every(col => existingColumns.has(col));
      
      if (hasAllFeatures) {
        console.log('✅ Company settings table already has correct schema');
        needsRebuild = false;
      } else {
        // Get existing company name before rebuilding
        try {
          const existingData = await db.execute(`
            SELECT company_name FROM company_settings LIMIT 1
          `);
          if (existingData.rows[0]?.company_name) {
            existingCompanyName = existingData.rows[0].company_name;
          }
        } catch (error) {
          console.log('⚠️ Could not read existing company name, using default');
        }
      }
    }
    
    if (needsRebuild) {
      console.log('🔄 Rebuilding company_settings table with complete schema');
      
      // Use transaction for atomic table swap
      await db.execute('BEGIN');
      
      try {
        // Create new table with complete schema (only if it doesn't exist)
        const newTableExists = await db.execute(`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_name = 'company_settings_new'
          )
        `);
        
        if (!newTableExists.rows[0]?.exists) {
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
        }
        
        // Create fresh settings with complete schema (avoiding SQL injection)
        await db.execute({
          text: `INSERT INTO company_settings_new (company_name) VALUES ($1)`,
          values: [existingCompanyName]
        });
        
        console.log(`✅ Fresh company settings created with name: ${existingCompanyName}`);
        
        // Atomic table swap: drop old table if exists, then rename new one
        const oldTableExists = await db.execute(`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_name = 'company_settings'
          )
        `);
        
        if (oldTableExists.rows[0]?.exists) {
          await db.execute('DROP TABLE company_settings');
        }
        
        await db.execute('ALTER TABLE company_settings_new RENAME TO company_settings');
        
        await db.execute('COMMIT');
        console.log('✅ Company settings table rebuilt with complete schema');
        
      } catch (error) {
        await db.execute('ROLLBACK');
        throw error;
      }
    }
  }
};

// Migration to add missing SMTP and other columns to company_settings table
const addMissingCompanySettingsColumnsMigration: Migration = {
  version: '20250917_014_add_missing_company_settings_columns',
  description: 'Add missing SMTP and other columns to company_settings table',
  async up(db: any) {
    // Add pgcrypto extension for UUID generation (with error handling)
    try {
      await db.execute(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    } catch (error: any) {
      // PostgreSQL error code 23505 = duplicate key constraint violation
      // This means the extension already exists, which is fine
      if (error?.code === '23505' && error?.detail?.includes('pgcrypto')) {
        // Extension already exists, continue silently
      } else {
        // Re-throw other errors
        throw error;
      }
    }

    console.log('🔄 Adding missing columns to company_settings table...');

    // Check current columns
    const currentColumns = await db.execute(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'company_settings'
    `);
    
    const existingColumns = new Set(currentColumns.rows.map((row: any) => row.column_name));

    // Define all the missing columns that need to be added
    const columnsToAdd = [
      // SMTP columns
      { name: 'smtp_host', definition: 'TEXT DEFAULT \'\'' },
      { name: 'smtp_port', definition: 'TEXT DEFAULT \'587\'' },
      { name: 'smtp_security', definition: 'TEXT DEFAULT \'STARTTLS\'' },
      { name: 'smtp_username', definition: 'TEXT DEFAULT \'\'' },
      { name: 'smtp_password', definition: 'TEXT DEFAULT \'\'' },
      { name: 'smtp_from_email', definition: 'TEXT DEFAULT \'\'' },
      { name: 'smtp_from_name', definition: 'TEXT DEFAULT \'\'' },
      { name: 'smtp_reply_to', definition: 'TEXT DEFAULT \'\'' },
      { name: 'smtp_auth_method', definition: 'TEXT DEFAULT \'LOGIN\'' },
      { name: 'smtp_connection_timeout', definition: 'TEXT DEFAULT \'30\'' },
      { name: 'smtp_test_email_sent', definition: 'BOOLEAN DEFAULT false' },
      { name: 'smtp_last_tested', definition: 'TIMESTAMP' },
      
      // Daily reset columns
      { name: 'grace_period_minutes', definition: 'TEXT DEFAULT \'15\'' },
      { name: 'enable_weekend_reset', definition: 'BOOLEAN DEFAULT false' },
      { name: 'enable_holiday_reset', definition: 'BOOLEAN DEFAULT false' },
      { name: 'notify_forgotten_checkouts', definition: 'BOOLEAN DEFAULT true' },
      { name: 'last_daily_reset', definition: 'TIMESTAMP' },
      { name: 'allow_manual_reset', definition: 'BOOLEAN DEFAULT true' },
      { name: 'reset_log_retention_days', definition: 'TEXT DEFAULT \'90\'' },
      { name: 'enable_24x7_operations', definition: 'BOOLEAN DEFAULT false' },
      { name: 'alert_before_reset', definition: 'BOOLEAN DEFAULT true' },
      { name: 'alert_minutes_before', definition: 'TEXT DEFAULT \'30\'' },
      
      // Printing columns
      { name: 'enable_2d_barcodes', definition: 'BOOLEAN DEFAULT false' },
      { name: 'barcode_format', definition: 'TEXT DEFAULT \'QR_CODE\'' },
      { name: 'print_quality', definition: 'TEXT DEFAULT \'normal\'' },
      
      // Feature flags
      { name: 'feature_multi_tenant', definition: 'BOOLEAN DEFAULT true' },
      { name: 'feature_meeting_rooms', definition: 'BOOLEAN DEFAULT true' },
      { name: 'feature_time_attendance', definition: 'BOOLEAN DEFAULT true' },
      { name: 'feature_induction_settings', definition: 'BOOLEAN DEFAULT true' },
      { name: 'feature_kiosk', definition: 'BOOLEAN DEFAULT true' },
      { name: 'feature_ai_demo', definition: 'BOOLEAN DEFAULT true' },
      
      // Integration flags
      { name: 'clue_enabled', definition: 'BOOLEAN DEFAULT false' },
      { name: 'e_pass_enabled', definition: 'BOOLEAN DEFAULT false' },
      { name: 'twilio_enabled', definition: 'BOOLEAN DEFAULT false' },
      
      // Additional printing columns
      { name: 'id_card_printer', definition: 'TEXT DEFAULT \'\'\'' }
    ];

    let addedCount = 0;

    // Add each missing column
    for (const column of columnsToAdd) {
      if (!existingColumns.has(column.name)) {
        try {
          await db.execute(`ALTER TABLE company_settings ADD COLUMN ${column.name} ${column.definition}`);
          console.log(`✅ Added column: ${column.name}`);
          addedCount++;
        } catch (error) {
          console.log(`⚠️ Failed to add column ${column.name}: ${error}`);
        }
      }
    }

    console.log(`✅ Added ${addedCount} missing columns to company_settings table`);
  }
};

// Export the existing migration runner creation function (no duplicate needed)