import { eq } from 'drizzle-orm';
import type { CustomerDatabaseService } from './customerDatabase';
import { bootstrapSchemaMigration } from './bootstrapSchemaMigration';
import { contractorMigrations } from './contractorMigrations';
import { cleanupMigrations } from './cleanupMigrations';
import { settingsColumnMigrations } from './settingsColumnMigration';
import { comprehensiveSettingsMigrations } from './comprehensiveSettingsMigration';
import { staffSessionsMigrations } from './staffSessionsMigration';
import { missingTablesMigrations } from './missingTablesMigration';
import { logger } from './utils/logger';

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
      const currentSchemaResult = await db.execute(`SELECT current_schema()`);
      const currentSchema = currentSchemaResult.rows[0]?.current_schema || 'public';
      logger.info(`📋 Running migrations for customer ${customerId} in schema: ${currentSchema}`);

      const schemaVersionExists = await db.execute(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'schema_version'
          AND table_schema = '${currentSchema}'
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
        logger.info(`✅ Created schema_version table in schema: ${currentSchema}`);
      }
      
      const appliedMigrations = await db.execute(`
        SELECT version FROM schema_version
      `);
      const appliedVersions = new Set(appliedMigrations.rows.map((row: any) => row.version));
      
      // Run pending migrations
      for (const migration of this.migrations) {
        if (!appliedVersions.has(migration.version)) {
          logger.info(`🔄 Running migration ${migration.version}: ${migration.description}`);
          
          await db.execute('BEGIN');
          try {
            await migration.up(db);
            
            // Mark migration as applied (idempotent) — escape single quotes in description
            const safeVersion = migration.version.replace(/'/g, "''");
            const safeDescription = migration.description.replace(/'/g, "''");
            await db.execute(`
              INSERT INTO schema_version (version, description) 
              VALUES ('${safeVersion}', '${safeDescription}')
              ON CONFLICT (version) DO NOTHING
            `);
            
            await db.execute('COMMIT');
            logger.info(`✅ Migration ${migration.version} applied successfully`);
          } catch (error) {
            await db.execute('ROLLBACK');
            throw error;
          }
        }
      }
    } catch (error) {
      logger.error(`❌ Migration error for customer ${customerId}:`, error);
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
      logger.info(`🔄 Running migrations for ${customers.length} customers...`);

      for (const customer of customers) {
        if (customer.isActive) {
          logger.info(`\n🔄 Running migrations for customer: ${customer.companyName} (${customer.id})`);
          try {
            await this.ensureSchema(customer.id);
            logger.info(`✅ Migrations completed for customer: ${customer.companyName}`);
          } catch (error) {
            logger.error(`❌ Migration failed for customer ${customer.companyName}:`, error);
            // Continue with other customers
          }
        }
      }

      logger.info(`\n✅ Migration process completed for all customers`);
    } catch (error) {
      logger.error(`❌ Failed to run migrations for all customers:`, error);
      throw error;
    }
  }
}

/**
 * Create and configure migration runner with all migrations
 */
export function createMigrationRunner(customerDbService: CustomerDatabaseService): MigrationRunner {
  const runner = new MigrationRunner(customerDbService);
  
  // Register all migrations in order - bootstrap MUST run first for new schemas
  const addMartynLawIncidentFeatureTogglesMigration = {
    version: '20260319_026_add_martyn_law_incident_feature_toggles',
    description: 'Add feature_martyn_law and feature_incident_reports columns to company_settings',
    async up(db: any) {
      try {
        await db.execute(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS feature_martyn_law BOOLEAN DEFAULT true`);
        logger.info('✅ [026] Added feature_martyn_law to company_settings');
      } catch (err: any) {
        logger.info(`⚠️ [026] feature_martyn_law: ${err.message?.substring(0, 80)}`);
      }
      try {
        await db.execute(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS feature_incident_reports BOOLEAN DEFAULT true`);
        logger.info('✅ [026] Added feature_incident_reports to company_settings');
      } catch (err: any) {
        logger.info(`⚠️ [026] feature_incident_reports: ${err.message?.substring(0, 80)}`);
      }
    }
  };

  const backfillMartynLawIncidentTogglesMigration = {
    version: '20260319_027_backfill_martyn_law_incident_toggles',
    description: 'Backfill NULL values for feature_martyn_law and feature_incident_reports to TRUE',
    async up(db: any) {
      try {
        await db.execute(`UPDATE company_settings SET feature_martyn_law = true WHERE feature_martyn_law IS NULL`);
        logger.info('✅ [027] Backfilled feature_martyn_law NULL → true');
      } catch (err: any) {
        logger.info(`⚠️ [027] feature_martyn_law backfill: ${err.message?.substring(0, 80)}`);
      }
      try {
        await db.execute(`UPDATE company_settings SET feature_incident_reports = true WHERE feature_incident_reports IS NULL`);
        logger.info('✅ [027] Backfilled feature_incident_reports NULL → true');
      } catch (err: any) {
        logger.info(`⚠️ [027] feature_incident_reports backfill: ${err.message?.substring(0, 80)}`);
      }
    }
  };

  const addZoneSweepsMigration = {
    version: '20260320_029_add_zone_sweeps',
    description: 'Create zone_sweeps table for fire marshal physical zone sweep tracking',
    async up(db: any) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS zone_sweeps (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          evacuation_id TEXT NOT NULL,
          zone_id TEXT NOT NULL,
          zone_name TEXT NOT NULL,
          swept_by_name TEXT NOT NULL,
          swept_by_type TEXT NOT NULL DEFAULT 'staff',
          swept_at TIMESTAMP DEFAULT NOW() NOT NULL,
          has_unaccounted_at_time BOOLEAN NOT NULL DEFAULT FALSE,
          override_reason TEXT
        )
      `);
      logger.info('✅ [029] Created zone_sweeps table');
    }
  };

  const ensureIncidentReportsTableMigration = {
    version: '20260319_028_ensure_incident_reports_table',
    description: 'Ensure incident_reports table exists (fixes silent failure in migration 025)',
    async up(db: any) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS incident_reports (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          evacuation_id TEXT NOT NULL,
          customer_id TEXT NOT NULL,
          is_drill BOOLEAN NOT NULL DEFAULT FALSE,
          activated_by TEXT,
          started_at TIMESTAMP,
          completed_at TIMESTAMP,
          duration_seconds INTEGER,
          total_on_site INTEGER NOT NULL DEFAULT 0,
          accounted_for INTEGER NOT NULL DEFAULT 0,
          unaccounted INTEGER NOT NULL DEFAULT 0,
          completion_pct INTEGER NOT NULL DEFAULT 0,
          generated_at TIMESTAMP DEFAULT NOW(),
          report_url TEXT
        )
      `);
      logger.info(`✅ [028] incident_reports table ensured`);
    }
  };

  const addIncidentManagerUrlIdMigration = {
    version: '20260320_030_add_incident_manager_url_id',
    description: 'Add incident_manager_url_id column to company_settings for permanent senior manager monitor URL',
    async up(db: any) {
      try {
        await db.execute(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS incident_manager_url_id TEXT`);
        logger.info('✅ [030] Added incident_manager_url_id to company_settings');
      } catch (err: any) {
        logger.info(`⚠️ [030] incident_manager_url_id: ${err.message?.substring(0, 80)}`);
      }
    }
  };

  const addStaffPhoneNumberMigration = {
    version: '20260322_031_add_staff_phone_number',
    description: 'Add phone_number column to staff table for bulk import and staff profiles',
    async up(db: any) {
      try {
        await db.execute(`ALTER TABLE staff ADD COLUMN IF NOT EXISTS phone_number TEXT`);
        logger.info('✅ [031] Added phone_number to staff table');
      } catch (err: any) {
        logger.info(`⚠️ [031] staff.phone_number: ${err.message?.substring(0, 80)}`);
      }
    }
  };

  const allMigrations = [
    bootstrapSchemaMigration,
    rebuildCompanySettingsMigration,
    ...contractorMigrations,
    ...cleanupMigrations,
    ...settingsColumnMigrations,
    ...comprehensiveSettingsMigrations,
    addMissingCompanySettingsColumnsMigration,
    ...staffSessionsMigrations,
    ...missingTablesMigrations,
    evacuationZonesMigration,
    reportsMigration,
    evacuationsTableMigration,
    printSystemMigration,
    helpSystemMigration,
    featureTogglesMigration,
    staffAttendanceHistoryMigration,
    repairZoneIdColumnsMigration,
    comprehensiveColumnRepairMigration,
    paxtonAndZoneColumnsMigration,
    companySettingsPaxtonApiMigration,
    missingAnalyticsHelpTablesMigration,
    rebuildIsolatedReportsMigration,
    addEmailLogMigration,
    addNavBannerColorMigration,
    fixCardOffencesCustomerIdMigration,
    addVisitorPhotoUrlMigration,
    addStaffMissingColumnsMigration,
    addVisitorsMissingColumnsMigration,
    addContractorWorkerQrCodesMigration,
    generateStaffQrCodesMigration,
    enableEPassByDefaultMigration,
    addPeepFlagMigration,
    addDrillModeToEvacuationsMigration,
    addMartynLawMigration,
    addIncidentReportsMigration,
    addMartynLawIncidentFeatureTogglesMigration,
    backfillMartynLawIncidentTogglesMigration,
    ensureIncidentReportsTableMigration,
    addZoneSweepsMigration,
    addIncidentManagerUrlIdMigration,
    addStaffPhoneNumberMigration,
    addUserMenuPermissionsMigration,
    addLoneWorkerMigration,
    addBiostarStaffFieldsMigration,
    addBiostarDevicesMigration,
    addBiostarDeviceGroupAddressMigration,
    addComplianceAlertPreferencesMigration,
    addContractorDocumentExpiryAlertedAtMigration,
    addCdmAlertsEmailMigration,
    addClaudeModelMigration,
    addPpmDocScannedAtMigration,
    backfillPpmDocScannedAtMigration,
    addReportsDataColumnMigration,
    addHelpDeskMigration,
    addAiKeyColumnsMigration,
    addInductionSettingsColumnsMigration,
  ];

  allMigrations.forEach(migration => {
    runner.registerMigration(migration);
  });

  logger.info(`📋 Registered ${allMigrations.length} migrations`);
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
        WHERE table_name = 'company_settings' AND table_schema = current_schema()
      )
    `);
    
    let needsRebuild = true;
    let existingCompanyName = 'TechCorp Ltd';
    
    if (tableExists.rows[0]?.exists) {
      // Check if table has all required columns
      const columns = await db.execute(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'company_settings' AND table_schema = current_schema()
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
        logger.info('✅ Company settings table already has correct schema');
        needsRebuild = false;
      } else {
        // Get existing company name before rebuilding (uses current_schema via search_path)
        try {
          const schemaForQuery = await db.execute(`SELECT current_schema()`);
          const currentMigrationSchema = schemaForQuery.rows[0]?.current_schema || 'public';
          const existingData = await db.execute(`
            SELECT company_name FROM "${currentMigrationSchema}".company_settings LIMIT 1
          `);
          if (existingData.rows[0]?.company_name) {
            existingCompanyName = existingData.rows[0].company_name;
          }
        } catch (error) {
          logger.info('⚠️ Could not read existing company name, using default');
        }
      }
    }
    
    if (needsRebuild) {
      logger.info('🔄 Rebuilding company_settings table with complete schema');
      
      // Use transaction for atomic table swap
      await db.execute('BEGIN');
      
      try {
        // Create new table with complete schema (only if it doesn't exist)
        const newTableExists = await db.execute(`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_name = 'company_settings_new' AND table_schema = current_schema()
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
              claude_model TEXT DEFAULT 'claude-3-5-sonnet',
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
              e_pass_enabled BOOLEAN DEFAULT true,
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
        
        logger.info(`✅ Fresh company settings created with name: ${existingCompanyName}`);
        
        // Atomic table swap: drop old table if exists, then rename new one
        const oldTableExists = await db.execute(`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_name = 'company_settings' AND table_schema = current_schema()
          )
        `);
        
        if (oldTableExists.rows[0]?.exists) {
          await db.execute('DROP TABLE company_settings');
        }
        
        await db.execute('ALTER TABLE company_settings_new RENAME TO company_settings');
        
        await db.execute('COMMIT');
        logger.info('✅ Company settings table rebuilt with complete schema');
        
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

    logger.info('🔄 Adding missing columns to company_settings table...');

    // Check current columns
    const currentColumns = await db.execute(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'company_settings' AND table_schema = current_schema()
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
      { name: 'e_pass_enabled', definition: 'BOOLEAN DEFAULT true' },
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
          logger.info(`✅ Added column: ${column.name}`);
          addedCount++;
        } catch (error) {
          logger.info(`⚠️ Failed to add column ${column.name}: ${error}`);
        }
      }
    }

    logger.info(`✅ Added ${addedCount} missing columns to company_settings table`);
  }
};

// Migration to add evacuation zones system
const evacuationZonesMigration: Migration = {
  version: '20260220_001_add_evacuation_zones',
  description: 'Add evacuation zones table and zone_id columns to staff, visitors, members, contractor_workers',
  async up(db: any) {
    // Create evacuation_zones table
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS evacuation_zones (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL,
          description TEXT DEFAULT '',
          color TEXT DEFAULT '#3B82F6',
          sort_order INTEGER DEFAULT 0,
          is_active BOOLEAN DEFAULT true,
          map_x REAL DEFAULT 50,
          map_y REAL DEFAULT 50,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      logger.info('✅ Created evacuation_zones table');
    } catch (error: any) {
      if (!error.message?.includes('already exists')) {
        logger.info(`⚠️ evacuation_zones table: ${error.message?.substring(0, 80)}`);
      }
    }

    // Add zone_id to staff, visitors, members, contractor_workers
    const tables = ['staff', 'visitors', 'members', 'contractor_workers'];
    for (const table of tables) {
      try {
        const colExists = await db.execute(`
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = '${table}' AND column_name = 'zone_id' AND table_schema = current_schema()
        `);
        if (!colExists.rows || colExists.rows.length === 0) {
          await db.execute(`ALTER TABLE ${table} ADD COLUMN zone_id VARCHAR(255) DEFAULT NULL`);
          logger.info(`✅ Added zone_id to ${table}`);
        }
      } catch (error: any) {
        logger.info(`⚠️ zone_id on ${table}: ${error.message?.substring(0, 80)}`);
      }
    }

    // Add zone columns to company_settings
    const settingsCols = [
      { name: 'zones_enabled', def: 'BOOLEAN DEFAULT false' },
      { name: 'daily_reset_timezone', def: "TEXT DEFAULT 'Europe/London'" },
      { name: 'zone_map_url', def: 'TEXT DEFAULT NULL' },
    ];
    for (const col of settingsCols) {
      try {
        const colExists = await db.execute(`
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'company_settings' AND column_name = '${col.name}' AND table_schema = current_schema()
        `);
        if (!colExists.rows || colExists.rows.length === 0) {
          await db.execute(`ALTER TABLE company_settings ADD COLUMN ${col.name} ${col.def}`);
          logger.info(`✅ Added ${col.name} to company_settings`);
        }
      } catch (error: any) {
        logger.info(`⚠️ ${col.name} on company_settings: ${error.message?.substring(0, 80)}`);
      }
    }
  }
};

// Migration to add reports table
const reportsMigration: Migration = {
  version: '20260220_002_add_reports_table',
  description: 'Add reports table for report generation and storage',
  async up(db: any) {
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS reports (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'general',
          description TEXT DEFAULT '',
          parameters JSONB DEFAULT '{}',
          data JSONB DEFAULT '{}',
          status TEXT DEFAULT 'completed',
          generated_by TEXT DEFAULT 'system',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      logger.info('✅ Created reports table');
    } catch (error: any) {
      if (!error.message?.includes('already exists')) {
        logger.info(`⚠️ reports table: ${error.message?.substring(0, 80)}`);
      }
    }
  }
};

// Migration to add evacuations table
const evacuationsTableMigration: Migration = {
  version: '20260220_003_add_evacuations_table',
  description: 'Add evacuations table for tracking evacuation events',
  async up(db: any) {
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS evacuations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          status TEXT DEFAULT 'active',
          started_at TIMESTAMP DEFAULT NOW(),
          ended_at TIMESTAMP,
          started_by TEXT DEFAULT 'system',
          ended_by TEXT,
          zone_ids JSONB DEFAULT '[]',
          total_personnel INTEGER DEFAULT 0,
          accounted_for INTEGER DEFAULT 0,
          notes TEXT DEFAULT '',
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      logger.info('✅ Created evacuations table');
    } catch (error: any) {
      if (!error.message?.includes('already exists')) {
        logger.info(`⚠️ evacuations table: ${error.message?.substring(0, 80)}`);
      }
    }
  }
};

// Migration to add print system tables
const printSystemMigration: Migration = {
  version: '20260220_004_add_print_system_tables',
  description: 'Add print system tables: print_queue, print_job_history, printer_configurations, print_service_instances',
  async up(db: any) {
    const tables = [
      {
        name: 'print_queue',
        sql: `CREATE TABLE IF NOT EXISTS print_queue (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          document_type TEXT NOT NULL DEFAULT 'visitor_pass',
          document_id TEXT,
          printer_id TEXT,
          status TEXT DEFAULT 'pending',
          priority INTEGER DEFAULT 0,
          data JSONB DEFAULT '{}',
          error_message TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )`
      },
      {
        name: 'print_job_history',
        sql: `CREATE TABLE IF NOT EXISTS print_job_history (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          document_type TEXT NOT NULL DEFAULT 'visitor_pass',
          document_id TEXT,
          printer_id TEXT,
          status TEXT DEFAULT 'completed',
          data JSONB DEFAULT '{}',
          error_message TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )`
      },
      {
        name: 'printer_configurations',
        sql: `CREATE TABLE IF NOT EXISTS printer_configurations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL,
          type TEXT DEFAULT 'thermal',
          connection_type TEXT DEFAULT 'usb',
          address TEXT DEFAULT '',
          port INTEGER DEFAULT 9100,
          is_default BOOLEAN DEFAULT false,
          is_active BOOLEAN DEFAULT true,
          settings JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )`
      },
      {
        name: 'print_service_instances',
        sql: `CREATE TABLE IF NOT EXISTS print_service_instances (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL,
          status TEXT DEFAULT 'offline',
          last_heartbeat TIMESTAMP,
          capabilities JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT NOW()
        )`
      }
    ];

    for (const table of tables) {
      try {
        await db.execute(table.sql);
        logger.info(`✅ Created ${table.name} table`);
      } catch (error: any) {
        if (!error.message?.includes('already exists')) {
          logger.info(`⚠️ ${table.name}: ${error.message?.substring(0, 80)}`);
        }
      }
    }
  }
};

// Migration to add help system tables
const helpSystemMigration: Migration = {
  version: '20260220_005_add_help_system_tables',
  description: 'Add help system tables: help_categories, help_articles',
  async up(db: any) {
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS help_categories (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL,
          description TEXT DEFAULT '',
          icon TEXT DEFAULT 'help-circle',
          sort_order INTEGER DEFAULT 0,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      logger.info('✅ Created help_categories table');
    } catch (error: any) {
      if (!error.message?.includes('already exists')) {
        logger.info(`⚠️ help_categories: ${error.message?.substring(0, 80)}`);
      }
    }

    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS help_articles (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          category_id UUID,
          title TEXT NOT NULL,
          content TEXT DEFAULT '',
          tags TEXT[] DEFAULT '{}',
          is_featured BOOLEAN DEFAULT false,
          is_active BOOLEAN DEFAULT true,
          view_count INTEGER DEFAULT 0,
          contextual_routes TEXT[] DEFAULT '{}',
          sort_order INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      logger.info('✅ Created help_articles table');
    } catch (error: any) {
      if (!error.message?.includes('already exists')) {
        logger.info(`⚠️ help_articles: ${error.message?.substring(0, 80)}`);
      }
    }
  }
};

// Migration to add feature_toggles table
const featureTogglesMigration: Migration = {
  version: '20260220_006_add_feature_toggles_table',
  description: 'Add feature_toggles table for per-customer feature management',
  async up(db: any) {
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS feature_toggles (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          feature_key TEXT NOT NULL UNIQUE,
          is_enabled BOOLEAN DEFAULT false,
          description TEXT DEFAULT '',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      logger.info('✅ Created feature_toggles table');
    } catch (error: any) {
      if (!error.message?.includes('already exists')) {
        logger.info(`⚠️ feature_toggles: ${error.message?.substring(0, 80)}`);
      }
    }
  }
};

// Migration to add staff_attendance_history table
const staffAttendanceHistoryMigration: Migration = {
  version: '20260220_007_add_staff_attendance_history',
  description: 'Add staff_attendance_history table for time and attendance tracking',
  async up(db: any) {
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS staff_attendance_history (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          staff_id UUID,
          date DATE NOT NULL DEFAULT CURRENT_DATE,
          check_in_time TIMESTAMP,
          check_out_time TIMESTAMP,
          total_hours REAL DEFAULT 0,
          status TEXT DEFAULT 'present',
          notes TEXT DEFAULT '',
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      logger.info('✅ Created staff_attendance_history table');
    } catch (error: any) {
      if (!error.message?.includes('already exists')) {
        logger.info(`⚠️ staff_attendance_history: ${error.message?.substring(0, 80)}`);
      }
    }
  }
};

// Repair migration: ensure zone_id columns exist on all tables (fixes cross-schema detection bug)
const repairZoneIdColumnsMigration: Migration = {
  version: '20260220_008_repair_zone_id_columns',
  description: 'Repair missing zone_id columns that were skipped due to cross-schema detection bug',
  async up(db: any) {
    const tables = ['staff', 'visitors', 'members', 'contractor_workers'];
    for (const table of tables) {
      try {
        const colExists = await db.execute(`
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = '${table}' AND column_name = 'zone_id' AND table_schema = current_schema()
        `);
        if (!colExists.rows || colExists.rows.length === 0) {
          await db.execute(`ALTER TABLE ${table} ADD COLUMN zone_id VARCHAR(255) DEFAULT NULL`);
          logger.info(`✅ [REPAIR] Added zone_id to ${table}`);
        }
      } catch (error: any) {
        logger.info(`⚠️ [REPAIR] zone_id on ${table}: ${error.message?.substring(0, 80)}`);
      }
    }
  }
};

const comprehensiveColumnRepairMigration: Migration = {
  version: '20260220_009_comprehensive_column_repair',
  description: 'Ensure ALL tables have ALL expected columns from isolatedSchema.ts',
  async up(db: any) {
    logger.info('🔧 [COLUMN REPAIR] Checking all tables for missing columns...');

    const tableColumns: Record<string, { name: string; def: string }[]> = {
      members: [
        { name: 'company_id', def: "VARCHAR NOT NULL DEFAULT ''" },
        { name: 'first_name', def: 'TEXT NOT NULL' },
        { name: 'last_name', def: 'TEXT NOT NULL' },
        { name: 'email', def: 'TEXT' },
        { name: 'phone_number', def: 'TEXT' },
        { name: 'mobile_number', def: 'TEXT' },
        { name: 'home_address', def: 'TEXT' },
        { name: 'postcode', def: 'TEXT' },
        { name: 'date_of_birth', def: 'TIMESTAMP' },
        { name: 'national_insurance_number', def: 'TEXT' },
        { name: 'photo_url', def: 'TEXT' },
        { name: 'job_title', def: 'TEXT' },
        { name: 'department', def: 'TEXT' },
        { name: 'membership_type', def: "TEXT DEFAULT 'full'" },
        { name: 'membership_id', def: 'TEXT' },
        { name: 'membership_number', def: 'TEXT' },
        { name: 'join_date', def: 'TEXT' },
        { name: 'expiry_date', def: 'TEXT' },
        { name: 'membership_status', def: "TEXT DEFAULT 'active'" },
        { name: 'notes', def: 'TEXT' },
        { name: 'is_checked_in', def: 'BOOLEAN NOT NULL DEFAULT false' },
        { name: 'checked_in_at', def: 'TIMESTAMP' },
        { name: 'checked_out_at', def: 'TIMESTAMP' },
        { name: 'checkout_type', def: 'TEXT' },
        { name: 'zone_id', def: 'VARCHAR(255)' },
        { name: 'is_accounted_for', def: 'BOOLEAN NOT NULL DEFAULT false' },
        { name: 'qr_code', def: 'TEXT' },
        { name: 'is_active', def: 'BOOLEAN NOT NULL DEFAULT true' },
        { name: 'skills_and_certifications', def: "TEXT[] DEFAULT ARRAY[]::TEXT[]" },
        { name: 'emergency_contact_name', def: 'TEXT' },
        { name: 'emergency_contact_phone', def: 'TEXT' },
        { name: 'emergency_contact_relationship', def: 'TEXT' },
        { name: 'last_visit_date', def: 'TIMESTAMP' },
        { name: 'visit_count', def: 'INTEGER DEFAULT 0' },
        { name: 'right_to_work_status', def: "TEXT DEFAULT 'pending'" },
        { name: 'right_to_work_document_type', def: 'TEXT' },
        { name: 'right_to_work_document_number', def: 'TEXT' },
        { name: 'right_to_work_expiry_date', def: 'TIMESTAMP' },
        { name: 'right_to_work_verified_by', def: 'VARCHAR' },
        { name: 'right_to_work_verified_at', def: 'TIMESTAMP' },
        { name: 'right_to_work_document_url', def: 'TEXT' },
        { name: 'working_pattern', def: "TEXT DEFAULT 'full_time'" },
        { name: 'hourly_rate', def: 'TEXT' },
        { name: 'start_date', def: 'TIMESTAMP' },
        { name: 'expected_end_date', def: 'TIMESTAMP' },
        { name: 'has_occupational_health_clearance', def: 'BOOLEAN DEFAULT false' },
        { name: 'occupational_health_expiry_date', def: 'TIMESTAMP' },
        { name: 'medical_restrictions', def: 'TEXT' },
        { name: 'site_induction_required', def: 'BOOLEAN DEFAULT true' },
        { name: 'site_induction_completed', def: 'BOOLEAN DEFAULT false' },
        { name: 'site_induction_date', def: 'TIMESTAMP' },
        { name: 'created_at', def: 'TIMESTAMP DEFAULT NOW()' },
        { name: 'updated_at', def: 'TIMESTAMP DEFAULT NOW()' },
      ],
      staff: [
        { name: 'photo_url', def: 'TEXT' },
        { name: 'access_level', def: "TEXT NOT NULL DEFAULT 'staff'" },
        { name: 'password', def: 'TEXT' },
        { name: 'last_login_at', def: 'TIMESTAMP' },
        { name: 'is_checked_in', def: 'BOOLEAN NOT NULL DEFAULT false' },
        { name: 'checked_in_at', def: 'TIMESTAMP' },
        { name: 'checked_out_at', def: 'TIMESTAMP' },
        { name: 'checkout_type', def: 'TEXT' },
        { name: 'zone_id', def: 'VARCHAR(255)' },
        { name: 'manual_check_in', def: 'BOOLEAN DEFAULT false' },
        { name: 'is_accounted_for', def: 'BOOLEAN NOT NULL DEFAULT false' },
        { name: 'is_fire_marshal', def: 'BOOLEAN NOT NULL DEFAULT false' },
        { name: 'fire_marshal_url_id', def: 'TEXT' },
        { name: 'emergency_token', def: 'TEXT' },
        { name: 'emergency_token_expires', def: 'TIMESTAMP' },
        { name: 'user_id', def: 'VARCHAR' },
        { name: 'qr_code', def: 'TEXT' },
        { name: 'induction_completed', def: 'BOOLEAN NOT NULL DEFAULT false' },
        { name: 'induction_completed_at', def: 'TIMESTAMP' },
        { name: 'is_active', def: 'BOOLEAN NOT NULL DEFAULT true' },
        { name: 'created_at', def: 'TIMESTAMP DEFAULT NOW()' },
        { name: 'updated_at', def: 'TIMESTAMP DEFAULT NOW()' },
      ],
      visitors: [
        { name: 'mobile_number', def: 'TEXT' },
        { name: 'job_title', def: 'TEXT' },
        { name: 'address', def: 'TEXT' },
        { name: 'car_registration', def: 'TEXT' },
        { name: 'is_pre_booked', def: 'BOOLEAN NOT NULL DEFAULT false' },
        { name: 'expected_date_time', def: 'TIMESTAMP' },
        { name: 'visit_purpose', def: 'TEXT' },
        { name: 'checkout_type', def: 'TEXT' },
        { name: 'zone_id', def: 'VARCHAR(255)' },
        { name: 'is_accounted_for', def: 'BOOLEAN NOT NULL DEFAULT false' },
        { name: 'induction_completed', def: 'BOOLEAN NOT NULL DEFAULT false' },
        { name: 'induction_completed_at', def: 'TIMESTAMP' },
        { name: 'e_pass_sent', def: 'BOOLEAN NOT NULL DEFAULT false' },
        { name: 'e_pass_delivery_type', def: 'TEXT' },
        { name: 'e_pass_sent_at', def: 'TIMESTAMP' },
        { name: 'e_pass_url', def: 'TEXT' },
        { name: 'expected_departure_time', def: 'TIMESTAMP' },
        { name: 'reminder_sent', def: 'BOOLEAN NOT NULL DEFAULT false' },
        { name: 'host_notification_sent', def: 'BOOLEAN NOT NULL DEFAULT false' },
        { name: 'hs_rules_accepted', def: 'BOOLEAN NOT NULL DEFAULT false' },
        { name: 'hs_rules_accepted_at', def: 'TIMESTAMP' },
        { name: 'hs_rules_acceptance_token', def: 'TEXT' },
        { name: 'notes', def: 'TEXT' },
      ],
      contractor_workers: [
        { name: 'photo_url', def: 'TEXT' },
        { name: 'zone_id', def: 'VARCHAR(255)' },
        { name: 'is_accounted_for', def: 'BOOLEAN NOT NULL DEFAULT false' },
        { name: 'postcode', def: 'TEXT' },
        { name: 'vehicle_type', def: 'TEXT' },
      ],
    };

    let totalAdded = 0;

    for (const [table, columns] of Object.entries(tableColumns)) {
      try {
        const tableExists = await db.execute(`
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = '${table}' AND table_schema = current_schema()
        `);
        if (!tableExists.rows || tableExists.rows.length === 0) {
          logger.info(`⚠️ [COLUMN REPAIR] Table ${table} does not exist, skipping`);
          continue;
        }

        const existingCols = await db.execute(`
          SELECT column_name FROM information_schema.columns 
          WHERE table_name = '${table}' AND table_schema = current_schema()
        `);
        const existingSet = new Set(existingCols.rows.map((r: any) => r.column_name));

        for (const col of columns) {
          if (!existingSet.has(col.name)) {
            try {
              await db.execute(`ALTER TABLE ${table} ADD COLUMN ${col.name} ${col.def}`);
              logger.info(`✅ [COLUMN REPAIR] Added ${col.name} to ${table}`);
              totalAdded++;
            } catch (err: any) {
              if (!err.message?.includes('already exists')) {
                logger.info(`⚠️ [COLUMN REPAIR] Failed to add ${col.name} to ${table}: ${err.message?.substring(0, 80)}`);
              }
            }
          }
        }
      } catch (error: any) {
        logger.info(`⚠️ [COLUMN REPAIR] Error processing table ${table}: ${error.message?.substring(0, 80)}`);
      }
    }

    logger.info(`✅ [COLUMN REPAIR] Complete - added ${totalAdded} missing columns`);
  }
};

const paxtonAndZoneColumnsMigration: Migration = {
  version: '20260225_010_paxton_zones_columns',
  description: 'Add Paxton/API columns to company_settings; paxton_user_id to staff; missing columns to evacuation_zones',
  async up(db: any) {
    logger.info('🔧 [PAXTON/ZONES] Adding missing Paxton, API, and zone columns...');

    const staffColumns = [
      { name: 'biostar_user_id', def: 'TEXT' },
      { name: 'paxton_user_id', def: 'TEXT' },
    ];

    const zoneColumns = [
      { name: 'color', def: "TEXT NOT NULL DEFAULT '#3b82f6'" },
      { name: 'description', def: 'TEXT' },
      { name: 'display_order', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'map_x', def: 'DOUBLE PRECISION' },
      { name: 'map_y', def: 'DOUBLE PRECISION' },
    ];

    const companySettingsColumns = [
      // Zones
      { name: 'zones_enabled', def: 'BOOLEAN DEFAULT false' },
      { name: 'zone_map_url', def: 'TEXT' },
      // Paxton Net2
      { name: 'paxton_enabled', def: 'BOOLEAN DEFAULT false' },
      { name: 'paxton_server_url', def: "TEXT DEFAULT ''" },
      { name: 'paxton_port', def: "TEXT DEFAULT '8080'" },
      { name: 'paxton_client_id', def: "TEXT DEFAULT ''" },
      { name: 'paxton_username', def: "TEXT DEFAULT ''" },
      { name: 'paxton_password', def: "TEXT DEFAULT ''" },
      { name: 'paxton_sync_users', def: 'BOOLEAN DEFAULT true' },
      { name: 'paxton_sync_events', def: 'BOOLEAN DEFAULT true' },
      { name: 'paxton_sync_interval', def: "TEXT DEFAULT '300'" },
      { name: 'paxton_default_access_level', def: "TEXT DEFAULT ''" },
      { name: 'paxton_visitor_access_level', def: "TEXT DEFAULT ''" },
      { name: 'paxton_contractor_access_level', def: "TEXT DEFAULT ''" },
      { name: 'paxton_auto_grant_access', def: 'BOOLEAN DEFAULT false' },
      { name: 'paxton_auto_revoke_on_checkout', def: 'BOOLEAN DEFAULT true' },
      { name: 'paxton_last_sync', def: 'TIMESTAMP' },
      { name: 'paxton_webhook_secret', def: "TEXT DEFAULT ''" },
      // API & Webhooks
      { name: 'api_webhooks_enabled', def: 'BOOLEAN DEFAULT false' },
      { name: 'api_key', def: "TEXT DEFAULT ''" },
      { name: 'api_webhook_url', def: "TEXT DEFAULT ''" },
      { name: 'api_webhook_secret', def: "TEXT DEFAULT ''" },
      { name: 'api_webhook_events', def: "TEXT[] DEFAULT ARRAY[]::TEXT[]" },
      { name: 'api_rate_limit', def: "TEXT DEFAULT '100'" },
      { name: 'api_last_activity', def: 'TIMESTAMP' },
    ];

    const tables: Record<string, { name: string; def: string }[]> = {
      staff: staffColumns,
      evacuation_zones: zoneColumns,
      company_settings: companySettingsColumns,
    };

    let totalAdded = 0;

    for (const [table, columns] of Object.entries(tables)) {
      try {
        const tableExists = await db.execute(`
          SELECT 1 FROM information_schema.tables
          WHERE table_name = '${table}' AND table_schema = current_schema()
        `);
        if (!tableExists.rows || tableExists.rows.length === 0) {
          logger.info(`⚠️ [PAXTON/ZONES] Table ${table} does not exist, skipping`);
          continue;
        }

        const existingCols = await db.execute(`
          SELECT column_name FROM information_schema.columns
          WHERE table_name = '${table}' AND table_schema = current_schema()
        `);
        const existingSet = new Set(existingCols.rows.map((r: any) => r.column_name));

        for (const col of columns) {
          if (!existingSet.has(col.name)) {
            try {
              await db.execute(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col.name} ${col.def}`);
              logger.info(`✅ [PAXTON/ZONES] Added ${col.name} to ${table}`);
              totalAdded++;
            } catch (err: any) {
              if (!err.message?.includes('already exists')) {
                logger.info(`⚠️ [PAXTON/ZONES] Failed to add ${col.name} to ${table}: ${err.message?.substring(0, 80)}`);
              }
            }
          }
        }
      } catch (error: any) {
        logger.info(`⚠️ [PAXTON/ZONES] Error processing table ${table}: ${error.message?.substring(0, 80)}`);
      }
    }

    logger.info(`✅ [PAXTON/ZONES] Complete - added ${totalAdded} missing columns`);
  }
};

const companySettingsPaxtonApiMigration: Migration = {
  version: '20260225_011_company_settings_paxton_api',
  description: 'Add Paxton Net2 and API/Webhook columns to company_settings table',
  async up(db: any) {
    logger.info('🔧 [PAXTON/API] Adding Paxton and API columns to company_settings...');

    const columns = [
      // Zones
      { name: 'zones_enabled', def: 'BOOLEAN DEFAULT false' },
      { name: 'zone_map_url', def: 'TEXT' },
      // Paxton Net2
      { name: 'paxton_enabled', def: 'BOOLEAN DEFAULT false' },
      { name: 'paxton_server_url', def: "TEXT DEFAULT ''" },
      { name: 'paxton_port', def: "TEXT DEFAULT '8080'" },
      { name: 'paxton_client_id', def: "TEXT DEFAULT ''" },
      { name: 'paxton_username', def: "TEXT DEFAULT ''" },
      { name: 'paxton_password', def: "TEXT DEFAULT ''" },
      { name: 'paxton_sync_users', def: 'BOOLEAN DEFAULT true' },
      { name: 'paxton_sync_events', def: 'BOOLEAN DEFAULT true' },
      { name: 'paxton_sync_interval', def: "TEXT DEFAULT '300'" },
      { name: 'paxton_default_access_level', def: "TEXT DEFAULT ''" },
      { name: 'paxton_visitor_access_level', def: "TEXT DEFAULT ''" },
      { name: 'paxton_contractor_access_level', def: "TEXT DEFAULT ''" },
      { name: 'paxton_auto_grant_access', def: 'BOOLEAN DEFAULT false' },
      { name: 'paxton_auto_revoke_on_checkout', def: 'BOOLEAN DEFAULT true' },
      { name: 'paxton_last_sync', def: 'TIMESTAMP' },
      { name: 'paxton_webhook_secret', def: "TEXT DEFAULT ''" },
      // API & Webhooks
      { name: 'api_webhooks_enabled', def: 'BOOLEAN DEFAULT false' },
      { name: 'api_key', def: "TEXT DEFAULT ''" },
      { name: 'api_webhook_url', def: "TEXT DEFAULT ''" },
      { name: 'api_webhook_secret', def: "TEXT DEFAULT ''" },
      { name: 'api_webhook_events', def: "TEXT[] DEFAULT ARRAY[]::TEXT[]" },
      { name: 'api_rate_limit', def: "TEXT DEFAULT '100'" },
      { name: 'api_last_activity', def: 'TIMESTAMP' },
      // TEC Thermal Printer
      { name: 'thermal_zebra_settings', def: "TEXT DEFAULT '{}'" },
      { name: 'tec_printer_name', def: "TEXT DEFAULT 'TEC B-FV4D Desktop Printer'" },
      { name: 'tec_printer_model', def: "TEXT DEFAULT 'B-FV4D'" },
      { name: 'tec_printer_ip', def: "TEXT DEFAULT ''" },
      { name: 'tec_printer_port', def: "TEXT DEFAULT '9100'" },
      { name: 'tec_label_width', def: "TEXT DEFAULT '85'" },
      { name: 'tec_label_height', def: "TEXT DEFAULT '65'" },
      // Zebra Printer
      { name: 'zebra_printer_ip', def: "TEXT DEFAULT ''" },
      { name: 'zebra_printer_port', def: "TEXT DEFAULT '9100'" },
      { name: 'zebra_printer_model', def: "TEXT DEFAULT 'GK420d'" },
      // BioStar last sync (missing from earlier migration)
      { name: 'biostar_last_sync', def: 'TIMESTAMP' },
      // Phone & Voice Notifications
      { name: 'phone_provider', def: "TEXT DEFAULT '8x8'" },
      { name: 'voice_notifications_enabled', def: 'BOOLEAN DEFAULT false' },
      { name: 'eight_by_x_api_key', def: "TEXT DEFAULT ''" },
      { name: 'eight_by_x_api_secret', def: "TEXT DEFAULT ''" },
      { name: 'eight_by_x_account_id', def: "TEXT DEFAULT ''" },
      { name: 'eight_by_x_base_url', def: "TEXT DEFAULT 'https://vcc-eu.8x8.com/api/v1'" },
      { name: 'default_voice_language', def: "TEXT DEFAULT 'en-GB'" },
      { name: 'default_voice_profile', def: "TEXT DEFAULT 'en-GB-Standard-A'" },
      // Feature flags (missing from earlier migrations)
      { name: 'feature_contractor_page', def: 'BOOLEAN DEFAULT false' },
      { name: 'feature_members', def: 'BOOLEAN DEFAULT false' },
    ];

    try {
      const tableExists = await db.execute(`
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'company_settings' AND table_schema = current_schema()
      `);
      if (!tableExists.rows || tableExists.rows.length === 0) {
        logger.info('⚠️ [PAXTON/API] company_settings table does not exist, skipping');
        return;
      }

      const existingCols = await db.execute(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'company_settings' AND table_schema = current_schema()
      `);
      const existingSet = new Set(existingCols.rows.map((r: any) => r.column_name));

      let added = 0;
      for (const col of columns) {
        if (!existingSet.has(col.name)) {
          try {
            await db.execute(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS ${col.name} ${col.def}`);
            logger.info(`✅ [PAXTON/API] Added ${col.name} to company_settings`);
            added++;
          } catch (err: any) {
            if (!err.message?.includes('already exists')) {
              logger.info(`⚠️ [PAXTON/API] Failed to add ${col.name}: ${err.message?.substring(0, 80)}`);
            }
          }
        }
      }
      logger.info(`✅ [PAXTON/API] Complete - added ${added} columns to company_settings`);
    } catch (error: any) {
      logger.info(`⚠️ [PAXTON/API] Error: ${error.message?.substring(0, 80)}`);
    }
  }
};

// Migration 012: Add missing tables that exist in bootstrap but not in migrations for existing schemas
export const missingAnalyticsHelpTablesMigration: Migration = {
  version: '20260225_012_missing_analytics_help_tables',
  description: 'Add customer_api_keys, feature_usage_analytics, help_user_interactions, help_onboarding_progress tables',
  async up(db: any) {
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS customer_api_keys (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          key_name TEXT NOT NULL,
          service TEXT NOT NULL,
          key_type TEXT NOT NULL,
          encrypted_api_key TEXT NOT NULL,
          encryption_iv TEXT NOT NULL,
          key_fingerprint TEXT NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT true,
          is_test_key BOOLEAN NOT NULL DEFAULT false,
          expires_at TIMESTAMP,
          last_used TIMESTAMP,
          usage_count INTEGER NOT NULL DEFAULT 0,
          last_request_ip TEXT,
          created_by VARCHAR,
          rotated_from VARCHAR,
          rotation_reason TEXT,
          permissions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
          allowed_ips TEXT[] DEFAULT ARRAY[]::TEXT[],
          rate_limit INTEGER DEFAULT 1000,
          description TEXT,
          tags TEXT[] DEFAULT ARRAY[]::TEXT[],
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      logger.info('✅ [012] customer_api_keys table ensured');
    } catch (err: any) {
      logger.info(`⚠️ [012] customer_api_keys: ${err.message?.substring(0, 80)}`);
    }

    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS feature_usage_analytics (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          date TIMESTAMP NOT NULL,
          period TEXT NOT NULL DEFAULT 'daily',
          feature TEXT NOT NULL,
          feature_category TEXT NOT NULL,
          sub_feature TEXT,
          usage_count INTEGER NOT NULL DEFAULT 0,
          unique_users INTEGER NOT NULL DEFAULT 0,
          session_count INTEGER NOT NULL DEFAULT 0,
          total_duration_minutes INTEGER DEFAULT 0,
          primary_user_id VARCHAR,
          user_roles TEXT[] DEFAULT ARRAY[]::TEXT[],
          tenant_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
          successful_operations INTEGER DEFAULT 0,
          failed_operations INTEGER DEFAULT 0,
          error_rate TEXT DEFAULT '0.00',
          average_response_time_ms INTEGER DEFAULT 0,
          slowest_response_time_ms INTEGER DEFAULT 0,
          fastest_response_time_ms INTEGER DEFAULT 0,
          business_value TEXT,
          conversion_impact TEXT,
          retention_impact TEXT,
          previous_period_usage INTEGER DEFAULT 0,
          usage_growth TEXT DEFAULT '0.00',
          industry_benchmark TEXT,
          feature_flags TEXT[] DEFAULT ARRAY[]::TEXT[],
          configuration TEXT,
          first_used TIMESTAMP,
          last_used TIMESTAMP,
          peak_usage_hour INTEGER,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      logger.info('✅ [012] feature_usage_analytics table ensured');
    } catch (err: any) {
      logger.info(`⚠️ [012] feature_usage_analytics: ${err.message?.substring(0, 80)}`);
    }

    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS help_user_interactions (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id VARCHAR,
          article_id VARCHAR NOT NULL,
          interaction_type TEXT NOT NULL,
          session_id TEXT,
          time_spent INTEGER,
          page_context TEXT,
          search_query TEXT,
          feedback_rating INTEGER,
          feedback_comments TEXT,
          is_completed BOOLEAN DEFAULT false,
          completed_steps TEXT[] DEFAULT ARRAY[]::TEXT[],
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      logger.info('✅ [012] help_user_interactions table ensured');
    } catch (err: any) {
      logger.info(`⚠️ [012] help_user_interactions: ${err.message?.substring(0, 80)}`);
    }

    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS help_onboarding_progress (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id VARCHAR NOT NULL,
          current_step INTEGER DEFAULT 1,
          completed_steps TEXT[] DEFAULT ARRAY[]::TEXT[],
          skipped_steps TEXT[] DEFAULT ARRAY[]::TEXT[],
          total_steps INTEGER DEFAULT 10,
          is_completed BOOLEAN DEFAULT false,
          completed_at TIMESTAMP,
          time_spent INTEGER DEFAULT 0,
          last_active_at TIMESTAMP DEFAULT NOW(),
          feature_onboarding_completed TEXT[] DEFAULT ARRAY[]::TEXT[],
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      logger.info('✅ [012] help_onboarding_progress table ensured');
    } catch (err: any) {
      logger.info(`⚠️ [012] help_onboarding_progress: ${err.message?.substring(0, 80)}`);
    }
  }
};

// Migration 014: Add email_log table and feature_email_outbox toggle to company_settings
const addEmailLogMigration: Migration = {
  version: '20260226_014_add_email_log_table',
  description: 'Add email_log table for outbox feature and feature_email_outbox toggle to company_settings',
  async up(db: any) {
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS email_log (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          sent_at TIMESTAMP NOT NULL DEFAULT NOW(),
          recipient_email TEXT NOT NULL,
          subject TEXT NOT NULL,
          html_body TEXT NOT NULL DEFAULT '',
          text_body TEXT NOT NULL DEFAULT '',
          email_type TEXT NOT NULL DEFAULT 'System Email',
          status TEXT NOT NULL DEFAULT 'sent'
        )
      `);
      logger.info('✅ [014] Created email_log table');
    } catch (err: any) {
      if (!err.message?.includes('already exists')) {
        logger.info(`⚠️ [014] email_log: ${err.message?.substring(0, 80)}`);
      }
    }

    try {
      await db.execute(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS feature_email_outbox BOOLEAN DEFAULT false`);
      logger.info('✅ [014] Added feature_email_outbox to company_settings');
    } catch (err: any) {
      if (!err.message?.includes('already exists')) {
        logger.info(`⚠️ [014] feature_email_outbox column: ${err.message?.substring(0, 80)}`);
      }
    }
  }
};

// Migration 015: Add nav_banner_color and nav_banner_invert columns to company_settings
const addNavBannerColorMigration: Migration = {
  version: '20260226_015_add_nav_banner_color',
  description: 'Add nav_banner_color and nav_banner_invert columns to company_settings for banner colour customisation',
  async up(db: any) {
    try {
      await db.execute(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS nav_banner_color TEXT`);
      logger.info('✅ [015] Added nav_banner_color to company_settings');
    } catch (err: any) {
      if (!err.message?.includes('already exists')) {
        logger.info(`⚠️ [015] nav_banner_color: ${err.message?.substring(0, 80)}`);
      }
    }
    try {
      await db.execute(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS nav_banner_invert BOOLEAN DEFAULT false`);
      logger.info('✅ [015] Added nav_banner_invert to company_settings');
    } catch (err: any) {
      if (!err.message?.includes('already exists')) {
        logger.info(`⚠️ [015] nav_banner_invert: ${err.message?.substring(0, 80)}`);
      }
    }
  }
};

// Migration 016: Fix card_offences customer_id NOT NULL constraint (legacy schemas had this column added as NOT NULL)
const fixCardOffencesCustomerIdMigration: Migration = {
  version: '20260226_016_fix_card_offences_customer_id',
  description: 'Remove NOT NULL constraint from customer_id in card_offences to allow standard seeding to work',
  async up(db: any) {
    try {
      await db.execute(`ALTER TABLE card_offences ALTER COLUMN customer_id DROP NOT NULL`);
      logger.info('✅ [016] Dropped NOT NULL from card_offences.customer_id');
    } catch (err: any) {
      // Column may not exist or constraint already gone — both are fine
      if (!err.message?.includes('does not exist') && !err.message?.includes('already')) {
        logger.info(`⚠️ [016] card_offences customer_id: ${err.message?.substring(0, 100)}`);
      }
    }
  }
};

// Migration 013: Rebuild reports table in isolated schemas with correct structure for proper customer isolation
export const rebuildIsolatedReportsMigration: Migration = {
  version: '20260225_013_rebuild_isolated_reports',
  description: 'Rebuild reports table in customer schemas with correct columns to replace global shared table',
  async up(db: any) {
    try {
      // Drop the old mismatched reports table (had name, type, description, parameters, data, status, generated_by)
      await db.execute(`DROP TABLE IF EXISTS reports CASCADE`);
      logger.info('✅ [013] Dropped old reports table');
    } catch (err: any) {
      logger.info(`⚠️ [013] Drop reports: ${err.message?.substring(0, 80)}`);
    }

    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS reports (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          report_type TEXT NOT NULL,
          generated_at TIMESTAMP NOT NULL DEFAULT NOW(),
          date_from TIMESTAMP NOT NULL,
          date_to TIMESTAMP NOT NULL,
          total_visitors TEXT NOT NULL DEFAULT '0',
          avg_duration TEXT NOT NULL DEFAULT 'N/A',
          email_sent BOOLEAN DEFAULT false,
          email_sent_at TIMESTAMP
        )
      `);
      logger.info('✅ [013] Recreated reports table with correct schema');
    } catch (err: any) {
      logger.info(`⚠️ [013] Create reports: ${err.message?.substring(0, 80)}`);
    }
  }
};

const addVisitorPhotoUrlMigration: Migration = {
  version: '20260303_017_visitor_photo_url',
  description: 'Add photo_url column to visitors table for profile photo uploads',
  async up(db: any) {
    try {
      await db.execute(`ALTER TABLE visitors ADD COLUMN IF NOT EXISTS photo_url TEXT`);
      logger.info('✅ [017] Added photo_url to visitors');
    } catch (err: any) {
      if (!err.message?.includes('already exists')) {
        logger.info(`⚠️ [017] visitors photo_url: ${err.message?.substring(0, 100)}`);
      }
    }
  }
};

const addStaffMissingColumnsMigration: Migration = {
  version: '20260303_018_staff_missing_columns',
  description: 'Add missing columns to staff and visitors tables (job_title, phone_number, etc.)',
  async up(db: any) {
    // ── staff table ─────────────────────────────────────────────────────────
    const staffColumns: Array<{ name: string; def: string }> = [
      { name: 'job_title',               def: 'TEXT' },
      { name: 'photo_url',               def: 'TEXT' },
      { name: 'password',                def: 'TEXT' },
      { name: 'last_login_at',           def: 'TIMESTAMP' },
      { name: 'zone_id',                 def: 'VARCHAR' },
      { name: 'manual_check_in',         def: 'BOOLEAN DEFAULT false' },
      { name: 'is_accounted_for',        def: 'BOOLEAN DEFAULT false NOT NULL' },
      { name: 'fire_marshal_url_id',     def: 'TEXT' },
      { name: 'emergency_token',         def: 'TEXT' },
      { name: 'emergency_token_expires', def: 'TIMESTAMP' },
      { name: 'user_id',                 def: 'VARCHAR' },
      { name: 'qr_code',                 def: 'TEXT' },
      { name: 'biostar_user_id',         def: 'TEXT' },
      { name: 'paxton_user_id',          def: 'TEXT' },
      { name: 'induction_completed',     def: 'BOOLEAN DEFAULT false NOT NULL' },
      { name: 'induction_completed_at',  def: 'TIMESTAMP' },
      { name: 'checkout_type',           def: 'TEXT' },
    ];

    for (const col of staffColumns) {
      try {
        await db.execute(`ALTER TABLE staff ADD COLUMN IF NOT EXISTS ${col.name} ${col.def}`);
      } catch (err: any) {
        if (!err.message?.includes('already exists')) {
          logger.info(`⚠️ [018] staff.${col.name}: ${err.message?.substring(0, 100)}`);
        }
      }
    }
    logger.info('✅ [018] staff columns done');

    logger.info('✅ [018] migration complete');
  }
};

const addContractorWorkerQrCodesMigration: Migration = {
  version: '20260311_021_contractor_worker_qr_codes',
  description: 'Add qr_code column to contractor_workers and generate CTR- codes for existing workers',
  async up(db: any) {
    try {
      await db.execute(`ALTER TABLE contractor_workers ADD COLUMN IF NOT EXISTS qr_code TEXT`);
      await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS contractor_workers_qr_code_unique
        ON contractor_workers(qr_code) WHERE qr_code IS NOT NULL
      `);
      await db.execute(`
        UPDATE contractor_workers
        SET qr_code = 'CTR-' || SUBSTR(REPLACE(GEN_RANDOM_UUID()::TEXT, '-', ''), 1, 12)
        WHERE qr_code IS NULL OR qr_code = ''
      `);
      logger.info('✅ [021] Contractor worker QR codes column added and populated');
    } catch (err: any) {
      logger.info(`⚠️ [021] contractor worker qr codes: ${err.message?.substring(0, 120)}`);
    }
  }
};

const generateStaffQrCodesMigration: Migration = {
  version: '20260311_020_generate_staff_qr_codes',
  description: 'Generate STF- QR codes for any staff records that are missing one',
  async up(db: any) {
    try {
      // For each staff row without a qr_code, generate a unique STF-{12hex} code
      // gen_random_uuid() is called per-row so each gets a unique value
      await db.execute(`
        UPDATE staff
        SET qr_code = 'STF-' || SUBSTR(REPLACE(GEN_RANDOM_UUID()::TEXT, '-', ''), 1, 12)
        WHERE qr_code IS NULL OR qr_code = ''
      `);
      logger.info('✅ [020] Staff QR codes generated for all NULL records');
    } catch (err: any) {
      logger.info(`⚠️ [020] generate staff qr codes: ${err.message?.substring(0, 120)}`);
    }
  }
};

const addVisitorsMissingColumnsMigration: Migration = {
  version: '20260303_019_visitors_missing_columns',
  description: 'Add phone_number and other missing columns to visitors table',
  async up(db: any) {
    // phone_number was omitted from the earlier comprehensive repair migration
    // Notes, job_title, address, car_registration also included defensively
    const columns: Array<{ name: string; def: string }> = [
      { name: 'phone_number',     def: 'TEXT' },
      { name: 'mobile_number',    def: 'TEXT' },
      { name: 'job_title',        def: 'TEXT' },
      { name: 'address',          def: 'TEXT' },
      { name: 'car_registration', def: 'TEXT' },
      { name: 'notes',            def: 'TEXT' },
      { name: 'photo_url',        def: 'TEXT' },
    ];

    for (const col of columns) {
      try {
        await db.execute(`ALTER TABLE visitors ADD COLUMN IF NOT EXISTS ${col.name} ${col.def}`);
      } catch (err: any) {
        if (!err.message?.includes('already exists')) {
          logger.info(`⚠️ [019] visitors.${col.name}: ${err.message?.substring(0, 100)}`);
        }
      }
    }
    logger.info('✅ [019] visitors missing columns migration complete');
  }
};

const enableEPassByDefaultMigration: Migration = {
  version: '20260317_021_enable_epass_by_default',
  description: 'Enable Digital E-Pass by default for all customers — digital-first deployment strategy',
  async up(db: any) {
    try {
      await db.execute(`
        UPDATE company_settings
        SET e_pass_enabled = true
        WHERE e_pass_enabled IS NULL OR e_pass_enabled = false
      `);
      logger.info('✅ [021] Digital E-Pass enabled by default for all customers');
    } catch (err: any) {
      logger.info(`⚠️ [021] enable e-pass by default: ${err.message?.substring(0, 120)}`);
    }
  }
};

const addPeepFlagMigration: Migration = {
  version: '20260319_022_add_peep_flag',
  description: 'Add PEEP (Personal Emergency Evacuation Plan) flag to staff, visitors, and contractor_workers tables',
  async up(db: any) {
    const tables = ['staff', 'visitors', 'contractor_workers'];
    for (const table of tables) {
      try {
        await db.execute(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS needs_evacuation_assistance BOOLEAN NOT NULL DEFAULT FALSE`);
        logger.info(`✅ [022] Added needs_evacuation_assistance to ${table}`);
      } catch (err: any) {
        logger.info(`⚠️ [022] ${table}.needs_evacuation_assistance: ${err.message?.substring(0, 120)}`);
      }
    }
  }
};
const addDrillModeToEvacuationsMigration: Migration = {
  version: '20260319_023_add_drill_mode_to_evacuations',
  description: 'Add is_drill column to evacuations table in the shared database',
  async up(db: any) {
    try {
      await db.execute(`ALTER TABLE evacuations ADD COLUMN IF NOT EXISTS is_drill BOOLEAN NOT NULL DEFAULT FALSE`);
      logger.info(`✅ [023] Added is_drill to evacuations table`);
    } catch (err: any) {
      logger.info(`⚠️ [023] evacuations.is_drill: ${err.message?.substring(0, 120)}`);
    }
  }
};

const addIncidentReportsMigration = {
  version: '20260319_025_add_incident_reports',
  description: 'Create incident_reports table to persist evacuation/drill report metadata per customer',
  async up(db: any) {
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS incident_reports (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          evacuation_id TEXT NOT NULL,
          customer_id TEXT NOT NULL,
          is_drill BOOLEAN NOT NULL DEFAULT FALSE,
          activated_by TEXT,
          started_at TIMESTAMP,
          completed_at TIMESTAMP,
          duration_seconds INTEGER,
          total_on_site INTEGER NOT NULL DEFAULT 0,
          accounted_for INTEGER NOT NULL DEFAULT 0,
          unaccounted INTEGER NOT NULL DEFAULT 0,
          completion_pct INTEGER NOT NULL DEFAULT 0,
          generated_at TIMESTAMP DEFAULT NOW(),
          report_url TEXT
        )
      `);
      logger.info(`✅ [025] Created incident_reports table`);
    } catch (err: any) {
      logger.info(`⚠️ [025] incident_reports: ${err.message?.substring(0, 120)}`);
    }
  }
};

const addLoneWorkerMigration: Migration = {
  version: '20260327_033_add_lone_worker_protection',
  description: 'Add Lone Worker Protection: sessions/tokens tables, lone worker fields on staff/contractor_workers, and config fields on company_settings',
  async up(db: any) {
    // 1. New tables
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS lone_worker_sessions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          customer_id TEXT NOT NULL,
          person_id TEXT NOT NULL,
          person_type TEXT NOT NULL,
          person_name TEXT NOT NULL,
          person_email TEXT,
          started_at TIMESTAMP NOT NULL DEFAULT NOW(),
          ended_at TIMESTAMP,
          interval_mins INTEGER NOT NULL DEFAULT 30,
          grace_period_mins INTEGER NOT NULL DEFAULT 10,
          status TEXT NOT NULL DEFAULT 'active',
          check_ins_completed INTEGER NOT NULL DEFAULT 0,
          escalations_fired INTEGER NOT NULL DEFAULT 0,
          ended_by TEXT
        )
      `);
      logger.info('✅ [033] Created lone_worker_sessions table');
    } catch (err: any) {
      logger.info(`⚠️ [033] lone_worker_sessions: ${err.message?.substring(0, 120)}`);
    }
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS lone_worker_tokens (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          token TEXT NOT NULL UNIQUE,
          session_id UUID NOT NULL REFERENCES lone_worker_sessions(id),
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMP NOT NULL,
          used_at TIMESTAMP
        )
      `);
      logger.info('✅ [033] Created lone_worker_tokens table');
    } catch (err: any) {
      logger.info(`⚠️ [033] lone_worker_tokens: ${err.message?.substring(0, 120)}`);
    }
    // 2. Staff lone worker columns
    const staffCols = [
      { name: 'is_lone_worker', def: 'BOOLEAN DEFAULT FALSE' },
      { name: 'lone_worker_since', def: 'TIMESTAMP' },
      { name: 'lone_worker_deadline', def: 'TIMESTAMP' },
      { name: 'lone_worker_escalation_level', def: 'INTEGER DEFAULT 0' },
    ];
    for (const col of staffCols) {
      try {
        await db.execute(`ALTER TABLE staff ADD COLUMN IF NOT EXISTS ${col.name} ${col.def}`);
        logger.info(`✅ [033] staff.${col.name}`);
      } catch (err: any) {
        logger.info(`⚠️ [033] staff.${col.name}: ${err.message?.substring(0, 80)}`);
      }
    }
    // 3. contractor_workers lone worker columns
    for (const col of staffCols) {
      try {
        await db.execute(`ALTER TABLE contractor_workers ADD COLUMN IF NOT EXISTS ${col.name} ${col.def}`);
        logger.info(`✅ [033] contractor_workers.${col.name}`);
      } catch (err: any) {
        logger.info(`⚠️ [033] contractor_workers.${col.name}: ${err.message?.substring(0, 80)}`);
      }
    }
    // 4. company_settings lone worker config columns
    const settingsCols = [
      { name: 'lone_worker_enabled', def: 'BOOLEAN DEFAULT FALSE' },
      { name: 'lone_worker_check_interval_mins', def: 'INTEGER DEFAULT 30' },
      { name: 'lone_worker_grace_period_mins', def: 'INTEGER DEFAULT 10' },
      { name: 'lone_worker_l1_name', def: 'TEXT DEFAULT \'\'' },
      { name: 'lone_worker_l1_email', def: 'TEXT DEFAULT \'\'' },
      { name: 'lone_worker_l2_name', def: 'TEXT DEFAULT \'\'' },
      { name: 'lone_worker_l2_email', def: 'TEXT DEFAULT \'\'' },
      { name: 'lone_worker_l2_delay_mins', def: 'INTEGER DEFAULT 15' },
      { name: 'lone_worker_l3_delay_mins', def: 'INTEGER DEFAULT 30' },
    ];
    for (const col of settingsCols) {
      try {
        await db.execute(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS ${col.name} ${col.def}`);
        logger.info(`✅ [033] company_settings.${col.name}`);
      } catch (err: any) {
        logger.info(`⚠️ [033] company_settings.${col.name}: ${err.message?.substring(0, 80)}`);
      }
    }
  }
};

const addUserMenuPermissionsMigration: Migration = {
  version: '20260324_032_add_user_menu_permissions',
  description: 'Add allowed_menu_items and default_landing_page to users table for role-based nav access',
  async up(db: any) {
    try {
      await db.execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_menu_items TEXT[]`);
      logger.info('✅ [032] Added allowed_menu_items to users table');
    } catch (err: any) {
      logger.info(`⚠️ [032] users.allowed_menu_items: ${err.message?.substring(0, 80)}`);
    }
    try {
      await db.execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS default_landing_page TEXT`);
      logger.info('✅ [032] Added default_landing_page to users table');
    } catch (err: any) {
      logger.info(`⚠️ [032] users.default_landing_page: ${err.message?.substring(0, 80)}`);
    }
  }
};

const addMartynLawMigration = {
  version: '20260319_024_add_martyn_law_config',
  description: "Create martyn_law_config table for UK Protect Duty (Martyn's Law) compliance",
  async up(db: any) {
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS martyn_law_config (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          customer_id TEXT NOT NULL UNIQUE,
          venue_type TEXT,
          venue_capacity INTEGER,
          is_in_scope BOOLEAN DEFAULT FALSE,
          scope_notes TEXT,
          supervisor_name TEXT,
          supervisor_role TEXT,
          supervisor_phone TEXT,
          supervisor_email TEXT,
          sia_provider_name TEXT,
          sia_license_number TEXT,
          sia_expiry_date TIMESTAMP,
          action_plan TEXT,
          evacuation_procedure TEXT,
          lockdown_procedure TEXT,
          communication_plan TEXT,
          checklist_items TEXT,
          evidence_log TEXT,
          last_reviewed_at TIMESTAMP,
          last_reviewed_by TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      logger.info(`✅ [024] Created martyn_law_config table`);
    } catch (err: any) {
      logger.info(`⚠️ [024] martyn_law_config: ${err.message?.substring(0, 120)}`);
    }
  }
};

const addBiostarStaffFieldsMigration: Migration = {
  version: '20260329_034_add_biostar_staff_fields',
  description: 'Add memberNumber and barcodeNumber fields to staff table for Biostar sync',
  async up(db: any) {
    const cols = [
      { name: 'member_number', def: 'TEXT' },
      { name: 'barcode_number', def: 'TEXT' },
    ];
    for (const col of cols) {
      try {
        await db.execute(`ALTER TABLE staff ADD COLUMN IF NOT EXISTS ${col.name} ${col.def}`);
        logger.info(`✅ [034] staff.${col.name}`);
      } catch (err: any) {
        logger.info(`⚠️ [034] staff.${col.name}: ${err.message?.substring(0, 80)}`);
      }
    }
  }
};

const addBiostarDevicesMigration: Migration = {
  version: '20260409_035_add_biostar_devices_table',
  description: 'Create biostar_devices table for device classification (ENTRY/EXIT/ENTRY_EXIT/IGNORE)',
  async up(db: any) {
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS biostar_devices (
          id VARCHAR PRIMARY KEY,
          name TEXT NOT NULL,
          model TEXT,
          ip_address TEXT,
          role TEXT NOT NULL DEFAULT 'ENTRY_EXIT',
          direction TEXT NOT NULL DEFAULT 'BOTH',
          site TEXT,
          building TEXT,
          synced_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      logger.info('✅ [035] biostar_devices table created');
    } catch (err: any) {
      logger.info(`⚠️ [035] biostar_devices: ${err.message?.substring(0, 80)}`);
    }
  }
};

const addBiostarDeviceGroupAddressMigration: Migration = {
  version: '20260409_036_biostar_devices_add_group_address',
  description: 'Add device_address and device_group columns to biostar_devices',
  async up(db: any) {
    const cols = [
      `ALTER TABLE biostar_devices ADD COLUMN IF NOT EXISTS device_address TEXT`,
      `ALTER TABLE biostar_devices ADD COLUMN IF NOT EXISTS device_group TEXT`,
    ];
    for (const colSql of cols) {
      try {
        await db.execute(colSql);
      } catch (err: any) {
        logger.info(`⚠️ [036] ${err.message?.substring(0, 80)}`);
      }
    }
    logger.info('✅ [036] biostar_devices device_address + device_group columns ensured');
  }
};

const addComplianceAlertPreferencesMigration: Migration = {
  version: '20260423_037_add_compliance_alert_preferences',
  description: 'Add notify_on_document_deletion and notify_on_document_expiry boolean columns to company_settings',
  async up(db: any) {
    const cols = [
      `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS notify_on_document_deletion BOOLEAN DEFAULT true`,
      `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS notify_on_document_expiry BOOLEAN DEFAULT true`,
    ];
    for (const colSql of cols) {
      try {
        await db.execute(colSql);
      } catch (err: any) {
        logger.info(`⚠️ [037] ${err.message?.substring(0, 80)}`);
      }
    }
    logger.info('✅ [037] company_settings compliance alert preference columns ensured');
  }
};

const addContractorDocumentExpiryAlertedAtMigration: Migration = {
  version: '20260423_038_contractor_documents_expiry_alerted_at',
  description: 'Add expiry_alerted_at column to contractor_documents for nightly expiry digest cron',
  async up(db: any) {
    try {
      await db.execute(`ALTER TABLE contractor_documents ADD COLUMN IF NOT EXISTS expiry_alerted_at TIMESTAMP`);
      logger.info('✅ [038] Added expiry_alerted_at to contractor_documents');
    } catch (err: any) {
      logger.info(`⚠️ [038] contractor_documents.expiry_alerted_at: ${err.message?.substring(0, 80)}`);
    }
  }
};

const addCdmAlertsEmailMigration: Migration = {
  version: '20260423_039_company_settings_cdm_alerts_email',
  description: 'Add cdm_alerts_email column to company_settings for configurable CDM F10 alert recipient',
  async up(db: any) {
    try {
      await db.execute(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS cdm_alerts_email TEXT DEFAULT ''`);
      logger.info('✅ [039] Added cdm_alerts_email to company_settings');
    } catch (err: any) {
      logger.info(`⚠️ [039] company_settings.cdm_alerts_email: ${err.message?.substring(0, 80)}`);
    }
  }
};

const addClaudeModelMigration: Migration = {
  version: '20260423_040_add_claude_model',
  description: 'Add claude_model column to company_settings for Anthropic Claude provider support',
  async up(db: any) {
    try {
      await db.execute(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS claude_model TEXT DEFAULT 'claude-3-5-sonnet'`);
      logger.info('✅ [040] company_settings claude_model column ensured');
    } catch (err: any) {
      logger.info(`⚠️ [040] claude_model: ${err.message?.substring(0, 80)}`);
    }
  }
};

const addPpmDocScannedAtMigration: Migration = {
  version: '20260423_041_add_ppm_doc_scanned_at',
  description: 'Add scanned_at column to ppm_work_order_documents to track AI scan completion',
  async up(db: any) {
    try {
      await db.execute(`ALTER TABLE ppm_work_order_documents ADD COLUMN IF NOT EXISTS scanned_at TIMESTAMP`);
      logger.info('✅ [041] ppm_work_order_documents scanned_at column ensured');
    } catch (err: any) {
      logger.info(`⚠️ [041] scanned_at column: ${err.message?.substring(0, 80)}`);
    }
  }
};

const backfillPpmDocScannedAtMigration: Migration = {
  version: '20260423_042_backfill_ppm_doc_scanned_at',
  description: 'Backfill scanned_at on pre-existing ppm_work_order_documents rows to prevent false Scan Pending indicators on legacy data',
  async up(db: any) {
    // Mark all pre-existing rows as already-scanned (using created_at as the proxy timestamp)
    // so legacy documents without metadata do not show a false "Scan pending" indicator.
    // Rows uploaded after migration 041 start with scanned_at = null (pending) and have it
    // stamped by the async scan on completion; this backfill does not touch those.
    try {
      await db.execute(`UPDATE ppm_work_order_documents SET scanned_at = COALESCE(created_at, NOW()) WHERE scanned_at IS NULL`);
      logger.info('✅ [042] ppm_work_order_documents legacy scanned_at backfill complete');
    } catch (err: any) {
      logger.info(`⚠️ [042] scanned_at backfill: ${err.message?.substring(0, 80)}`);
    }
  }
};

const addReportsDataColumnMigration: Migration = {
  version: '20260423_043_add_reports_data_column',
  description: 'Add data TEXT column to reports table to persist snapshot payloads (e.g. compliance_gap contractor list)',
  async up(db: any) {
    try {
      await db.execute(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS data TEXT`);
      logger.info('✅ [043] reports.data column ensured');
    } catch (err: any) {
      logger.info(`⚠️ [043] reports.data column: ${err.message?.substring(0, 80)}`);
    }
  }
};

const addHelpDeskMigration: Migration = {
  version: '20260424_044_add_help_desk',
  description: 'Add Help Desk module: feature_help_desk toggle on company_settings and help_desk_tickets table',
  async up(db: any) {
    try {
      await db.execute(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS feature_help_desk BOOLEAN DEFAULT false`);
      logger.info('✅ [044] feature_help_desk column ensured');
    } catch (err: any) {
      logger.info(`⚠️ [044] feature_help_desk column: ${err.message?.substring(0, 80)}`);
    }
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS help_desk_tickets (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          ticket_number TEXT,
          title TEXT NOT NULL,
          description TEXT,
          category TEXT,
          priority TEXT,
          status TEXT NOT NULL DEFAULT 'open',
          location TEXT,
          asset_id TEXT,
          reported_by_name TEXT,
          reported_by_email TEXT,
          assigned_to TEXT,
          resolution_notes TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          resolved_at TIMESTAMP
        )
      `);
      logger.info('✅ [044] help_desk_tickets table ensured');
    } catch (err: any) {
      logger.info(`⚠️ [044] help_desk_tickets table: ${err.message?.substring(0, 80)}`);
    }
  }
};

const addAiKeyColumnsMigration: Migration = {
  version: '20260424_045_add_ai_key_columns',
  description: 'Add missing columns to customer_api_keys for AI provider key management',
  async up(db: any) {
    const cols = [
      `ALTER TABLE customer_api_keys ADD COLUMN IF NOT EXISTS service_type TEXT`,
      `ALTER TABLE customer_api_keys ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'`,
      `ALTER TABLE customer_api_keys ADD COLUMN IF NOT EXISTS encrypted_key TEXT`,
      `ALTER TABLE customer_api_keys ADD COLUMN IF NOT EXISTS initialization_vector TEXT`,
      `ALTER TABLE customer_api_keys ADD COLUMN IF NOT EXISTS auth_tag TEXT`,
      `ALTER TABLE customer_api_keys ADD COLUMN IF NOT EXISTS last4 TEXT`,
      `ALTER TABLE customer_api_keys ADD COLUMN IF NOT EXISTS key_version INTEGER DEFAULT 1`,
      `ALTER TABLE customer_api_keys ADD COLUMN IF NOT EXISTS decrypt_audit_log TEXT DEFAULT '[]'`,
      `ALTER TABLE customer_api_keys ADD COLUMN IF NOT EXISTS key_description TEXT`,
      `ALTER TABLE customer_api_keys ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP`,
      // Drop NOT NULL constraints on legacy columns so new inserts (which omit them) don't fail
      `ALTER TABLE customer_api_keys ALTER COLUMN service DROP NOT NULL`,
      `ALTER TABLE customer_api_keys ALTER COLUMN key_type DROP NOT NULL`,
      `ALTER TABLE customer_api_keys ALTER COLUMN encrypted_api_key DROP NOT NULL`,
      `ALTER TABLE customer_api_keys ALTER COLUMN encryption_iv DROP NOT NULL`,
    ];
    for (const sql of cols) {
      try { await db.execute(sql); } catch (err: any) {
        logger.info(`⚠️ [045] customer_api_keys column: ${err.message?.substring(0, 80)}`);
      }
    }
    logger.info('✅ [045] customer_api_keys AI key columns ensured');
  }
};

const addInductionSettingsColumnsMigration: Migration = {
  version: '20260429_046_add_induction_settings_columns',
  description: 'Add site induction, AI/video, QR reader, and CLUe integration columns to company_settings',
  async up(db: any) {
    const cols = [
      `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS site_address TEXT`,
      `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS induction_hazards TEXT`,
      `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS induction_ppe TEXT`,
      `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS assembly_point TEXT`,
      `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS first_aid_location TEXT`,
      `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS emergency_contact TEXT`,
      `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS induction_site_rules TEXT`,
      `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS ai_instructions_prompt TEXT DEFAULT 'Create comprehensive, engaging safety induction content'`,
      `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS video_quality_preference TEXT DEFAULT 'high'`,
      `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS enable_advanced_video_features BOOLEAN DEFAULT true`,
      `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS default_video_length TEXT DEFAULT '15'`,
      `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS qr_reader_enabled BOOLEAN DEFAULT false`,
      `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS qr_reader_device TEXT DEFAULT 'auto'`,
      `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS qr_code_format TEXT DEFAULT 'visigate'`,
      `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS qr_reader_settings TEXT DEFAULT '{}'`,
      `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS clue_enabled BOOLEAN DEFAULT false`,
      `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS clue_api_url TEXT DEFAULT 'https://api.suprema-clue.com'`,
      `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS clue_api_key TEXT DEFAULT ''`,
      `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS clue_api_secret TEXT DEFAULT ''`,
      `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS clue_organization_id TEXT DEFAULT ''`,
      `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS clue_webhook_secret TEXT DEFAULT ''`,
      `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS clue_dynamic_qr_enabled BOOLEAN DEFAULT true`,
      `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS clue_qr_validity_minutes TEXT DEFAULT '60'`,
      `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS clue_device_groups TEXT[] DEFAULT ARRAY[]::TEXT[]`,
    ];
    for (const sql of cols) {
      try { await db.execute(sql); } catch (err: any) {
        logger.info(`⚠️ [046] company_settings column: ${err.message?.substring(0, 80)}`);
      }
    }
    logger.info('✅ [046] Induction/AI/QR/CLUe settings columns ensured');
  }
};
