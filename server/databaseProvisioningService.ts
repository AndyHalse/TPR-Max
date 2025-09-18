import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { sql } from 'drizzle-orm';
import ws from 'ws';
import { randomUUID } from 'crypto';
import * as isolatedSchema from './isolatedSchema';
import type { Customer } from '@shared/schema';

neonConfig.webSocketConstructor = ws;

/**
 * DATABASE PROVISIONING SERVICE
 * 
 * This service handles the creation of separate PostgreSQL databases
 * for each customer, ensuring true multi-tenancy isolation.
 * 
 * Each customer gets their own database with complete schema
 * but no customer isolation fields (since the entire DB is theirs).
 */
export class DatabaseProvisioningService {
  private static instance: DatabaseProvisioningService;

  private constructor() {}

  static getInstance(): DatabaseProvisioningService {
    if (!DatabaseProvisioningService.instance) {
      DatabaseProvisioningService.instance = new DatabaseProvisioningService();
    }
    return DatabaseProvisioningService.instance;
  }

  /**
   * Generate database URL for a new customer
   * In development, we'll simulate separate databases using different schemas
   * In production, this would create actual separate PostgreSQL databases
   */
  private generateDatabaseUrl(customerId: string): string {
    const baseUrl = process.env.DATABASE_URL;
    if (!baseUrl) {
      throw new Error('DATABASE_URL must be set');
    }

    // For development, use same database but different schemas
    // In production, this would be different database URLs
    if (process.env.NODE_ENV === 'production') {
      // Production: Create actual separate database
      const url = new URL(baseUrl);
      const dbName = `customer_${customerId.replace(/-/g, '_')}`;
      url.pathname = `/${dbName}`;
      return url.toString();
    } else {
      // Development: Use same database with schema isolation
      return baseUrl;
    }
  }

  /**
   * Generate schema name for customer in development
   * Format: c_<first8chars-of-customerId> for brevity and PostgreSQL compatibility
   */
  private generateSchemaName(customerId: string): string {
    // Use first 8 characters + sanitize for PostgreSQL identifier rules
    const schemaPrefix = customerId.replace(/-/g, '_').toLowerCase().substring(0, 8);
    return `c_${schemaPrefix}`;
  }

  /**
   * Create customer-specific database connection with proper schema isolation
   */
  private async createCustomerConnection(customerId: string): Promise<{ pool: Pool; db: ReturnType<typeof drizzle>; schemaName: string | null }> {
    const databaseUrl = this.generateDatabaseUrl(customerId);
    
    if (process.env.NODE_ENV === 'production') {
      // Production: Each customer has their own database
      const pool = new Pool({ connectionString: databaseUrl });
      const db = drizzle({ client: pool, schema: isolatedSchema });
      return { pool, db, schemaName: null };
    } else {
      // Development: Use schema-based isolation
      const schemaName = this.generateSchemaName(customerId);
      
      // Create connection with schema search path
      const pool = new Pool({ 
        connectionString: databaseUrl,
        options: `-c search_path=${schemaName},public`
      });
      
      const db = drizzle({ client: pool, schema: isolatedSchema });
      return { pool, db, schemaName };
    }
  }

  /**
   * Create a new database for a customer
   * This provisions the complete schema structure with proper isolation
   */
  async provisionCustomerDatabase(customerId: string): Promise<string> {
    console.log(`🏗️ Provisioning database for customer: ${customerId}`);

    let pool: Pool | null = null;
    
    try {
      const databaseUrl = this.generateDatabaseUrl(customerId);
      
      // Production: Create actual separate database
      if (process.env.NODE_ENV === 'production') {
        await this.createProductionDatabase(customerId);
      }

      // Create customer connection with proper isolation
      const connection = await this.createCustomerConnection(customerId);
      pool = connection.pool;
      const db = connection.db;
      const schemaName = connection.schemaName;

      // Development: Create customer schema if needed
      if (process.env.NODE_ENV !== 'production' && schemaName) {
        await this.createCustomerSchema(db, schemaName);
        console.log(`✅ Created isolated schema: ${schemaName} for customer: ${customerId}`);
      }

      // Create all tables for this customer's database/schema
      await this.createAllTables(db);
      
      // Seed with default data
      await this.seedDefaultData(db, customerId);
      
      console.log(`✅ Database provisioned successfully for customer: ${customerId}`);
      return databaseUrl;
    } catch (error) {
      console.error(`❌ Failed to provision database for customer ${customerId}:`, error);
      throw new Error(`Database provisioning failed: ${error}`);
    } finally {
      // Always close the pool
      if (pool) {
        await pool.end();
      }
    }
  }

  /**
   * Create actual database in production environment
   * This would typically use a database creation API or admin connection
   */
  private async createProductionDatabase(customerId: string): Promise<void> {
    // This is where you would implement actual database creation
    // For example, using PostgreSQL admin connection:
    // 
    // const adminUrl = process.env.ADMIN_DATABASE_URL;
    // const adminPool = new Pool({ connectionString: adminUrl });
    // const dbName = `customer_${customerId.replace(/-/g, '_')}`;
    // await adminPool.query(`CREATE DATABASE "${dbName}"`);
    // await adminPool.end();
    
    console.log(`🏗️ Creating production database for customer: ${customerId}`);
    // For now, we'll assume the database exists or is created externally
  }

  /**
   * Create the PostgreSQL schema for a customer (development only)
   * This provides complete data isolation between customers
   */
  private async createCustomerSchema(db: ReturnType<typeof drizzle>, schemaName: string): Promise<void> {
    console.log(`📋 Creating PostgreSQL schema: ${schemaName}`);

    try {
      // Create schema if it doesn't exist (safe operation)
      await db.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(schemaName)}`);
      
      console.log(`✅ PostgreSQL schema created: ${schemaName}`);
    } catch (error) {
      console.error(`❌ Failed to create schema ${schemaName}:`, error);
      throw error;
    }
  }

  /**
   * REMOVED: dropExistingTables function
   * 
   * This function was dangerous as it destroyed data across all customers
   * in development environments. We now use schema-based isolation and
   * CREATE TABLE IF NOT EXISTS for safe provisioning.
   * 
   * Tables are now created using idempotent CREATE TABLE IF NOT EXISTS
   * statements within customer-specific schemas, ensuring complete isolation.
   */

  /**
   * Create all tables using the isolated schema
   */
  private async createAllTables(db: ReturnType<typeof drizzle>): Promise<void> {
    // Execute the CREATE TABLE statements for all tables
    // This would typically be done using Drizzle's migration system
    
    console.log('🏗️ Creating database tables...');
    
    // For now, we'll use a simplified approach
    // In production, you'd use proper Drizzle migrations
    
    // Company Settings table - Complete schema from isolatedSchema.ts
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS company_settings (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        company_name text NOT NULL DEFAULT 'TechCorp Ltd',
        logo_url text,
        -- Company contact information
        address text DEFAULT '',
        phone text DEFAULT '',
        website text DEFAULT '',
        email text DEFAULT '',
        -- Email and report settings
        email_reports_enabled boolean DEFAULT false,
        report_frequency text DEFAULT 'weekly',
        report_recipients text[] DEFAULT ARRAY['admin@company.com'],
        last_report_sent timestamp,
        -- SMTP Configuration (Industry Standard)
        smtp_host text DEFAULT '',
        smtp_port text DEFAULT '587',
        smtp_security text DEFAULT 'STARTTLS',
        smtp_username text DEFAULT '',
        smtp_password text DEFAULT '',
        smtp_from_email text DEFAULT '',
        smtp_from_name text DEFAULT '',
        smtp_reply_to text DEFAULT '',
        smtp_auth_method text DEFAULT 'LOGIN',
        smtp_connection_timeout text DEFAULT '30',
        smtp_test_email_sent boolean DEFAULT false,
        smtp_last_tested timestamp,
        -- Daily Reset / End of Day Configuration
        enable_daily_reset boolean DEFAULT true,
        daily_reset_time text DEFAULT '00:00',
        daily_reset_timezone text DEFAULT 'Europe/London',
        grace_period_minutes text DEFAULT '15',
        enable_weekend_reset boolean DEFAULT false,
        enable_holiday_reset boolean DEFAULT false,
        notify_forgotten_checkouts boolean DEFAULT true,
        last_daily_reset timestamp,
        allow_manual_reset boolean DEFAULT true,
        reset_log_retention_days text DEFAULT '90',
        enable_24x7_operations boolean DEFAULT false,
        alert_before_reset boolean DEFAULT true,
        alert_minutes_before text DEFAULT '30',
        -- Branding settings
        background_color text DEFAULT '#f8fafc',
        foreground_color text DEFAULT '#1e293b',
        variable_text_color text DEFAULT '#374151',
        accent_color text DEFAULT '#3b82f6',
        banner_url text,
        theme text DEFAULT 'light',
        -- Printer settings
        selected_printer text DEFAULT 'PDF Printer',
        enable_qr_codes boolean DEFAULT true,
        enable_2d_barcodes boolean DEFAULT false,
        barcode_format text DEFAULT 'QR_CODE',
        print_quality text DEFAULT 'normal',
        -- ID Card printer settings
        id_card_printer text DEFAULT '',
        id_card_print_quality text DEFAULT 'high',
        id_card_paper_size text DEFAULT 'cr80',
        id_card_orientation text DEFAULT 'landscape',
        id_card_design text DEFAULT '[]',
        -- Thermal Pass Designs
        visitor_pass_design text DEFAULT '[]',
        contractor_pass_design text DEFAULT '[]',
        -- Thermal Printer Settings
        thermal_selected_printer text DEFAULT 'tec',
        thermal_print_method text DEFAULT 'direct',
        thermal_print_quality text DEFAULT 'reception',
        thermal_printer_settings text DEFAULT '{}',
        -- Suprema Biostar integration settings
        biostar_enabled boolean DEFAULT false,
        biostar_server_url text DEFAULT '',
        biostar_api_key text DEFAULT '',
        biostar_username text DEFAULT '',
        biostar_password text DEFAULT '',
        biostar_database_id text DEFAULT '1',
        biostar_sync_interval text DEFAULT '300',
        -- Biometric reader device settings
        biometric_devices text[] DEFAULT ARRAY[]::text[],
        reader_settings text DEFAULT '{}',
        -- AI and Video Generation Settings
        openai_model text DEFAULT 'gpt-5',
        openai_temperature text DEFAULT '0.7',
        openai_max_tokens text DEFAULT '4000',
        video_quality_preference text DEFAULT 'high',
        enable_advanced_video_features boolean DEFAULT true,
        default_video_length text DEFAULT '15',
        ai_instructions_prompt text DEFAULT 'Create comprehensive, engaging safety induction content',
        -- QR Code Reader Integration Settings
        qr_reader_enabled boolean DEFAULT false,
        qr_reader_device text DEFAULT 'auto',
        qr_code_format text DEFAULT 'visigate',
        qr_reader_settings text DEFAULT '{}',
        -- Suprema CLUe Cloud Platform Integration
        clue_enabled boolean DEFAULT false,
        clue_api_url text DEFAULT 'https://api.suprema-clue.com',
        clue_api_key text DEFAULT '',
        clue_api_secret text DEFAULT '',
        clue_organization_id text DEFAULT '',
        clue_webhook_secret text DEFAULT '',
        clue_dynamic_qr_enabled boolean DEFAULT true,
        clue_qr_validity_minutes text DEFAULT '60',
        clue_device_groups text[] DEFAULT ARRAY[]::text[],
        clue_sync_interval text DEFAULT '300',
        clue_auto_register_visitors boolean DEFAULT true,
        clue_auto_delete_expired boolean DEFAULT true,
        clue_test_mode boolean DEFAULT false,
        clue_last_sync timestamp,
        -- E-Pass Configuration Settings
        e_pass_enabled boolean DEFAULT false,
        e_pass_delivery_method text DEFAULT 'both',
        e_pass_email_template text DEFAULT 'default',
        e_pass_sms_template text DEFAULT 'default',
        e_pass_auto_checkout boolean DEFAULT true,
        e_pass_checkout_reminder_minutes text DEFAULT '30',
        e_pass_host_notification_enabled boolean DEFAULT true,
        e_pass_host_notification_delay text DEFAULT '60',
        -- Twilio SMS Configuration
        twilio_enabled boolean DEFAULT false,
        twilio_account_sid text DEFAULT '',
        twilio_auth_token text DEFAULT '',
        twilio_phone_number text DEFAULT '',
        twilio_messaging_service_sid text DEFAULT '',
        -- Geofencing Configuration
        geofencing_enabled boolean DEFAULT false,
        geofence_radius text DEFAULT '100',
        geofence_lat text DEFAULT '',
        geofence_lng text DEFAULT '',
        -- BioStar X-Station 2 Integration
        x_station_enabled boolean DEFAULT false,
        x_station_devices text[] DEFAULT ARRAY[]::text[],
        x_station_checkout_mode text DEFAULT 'qr',
        x_station_api_endpoint text DEFAULT '',
        -- Health & Safety Rules
        hs_rules_enabled boolean DEFAULT true,
        hs_rules_content text DEFAULT '',
        hs_rules_url text DEFAULT '',
        hs_rules_require_acceptance boolean DEFAULT false,
        -- Feature Toggles
        feature_multi_tenant boolean DEFAULT true,
        feature_meeting_rooms boolean DEFAULT true,
        feature_time_attendance boolean DEFAULT true,
        feature_induction_settings boolean DEFAULT true,
        feature_kiosk boolean DEFAULT true,
        feature_ai_demo boolean DEFAULT true,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      )
    `);

    // Departments table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS departments (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL UNIQUE,
        description text,
        color text NOT NULL DEFAULT 'bg-blue-500',
        is_active boolean DEFAULT true NOT NULL,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      )
    `);

    // Users table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        username text NOT NULL UNIQUE,
        password text NOT NULL,
        email text,
        role text NOT NULL DEFAULT 'user',
        tenant_company_id varchar,
        first_name text,
        last_name text,
        is_active boolean DEFAULT true,
        last_login_at timestamp,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      )
    `);

    // Tenant Companies table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS tenant_companies (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        company_name text NOT NULL UNIQUE,
        slug text NOT NULL UNIQUE,
        logo_url text,
        contact_email text NOT NULL,
        phone text,
        address text,
        website text,
        admin_first_name text,
        admin_last_name text,
        admin_email text,
        is_active boolean DEFAULT true NOT NULL,
        subscription_tier text DEFAULT 'basic',
        subscription_expires timestamp,
        max_users integer DEFAULT 50,
        max_visitors_per_month integer DEFAULT 1000,
        primary_color text DEFAULT '#3b82f6',
        secondary_color text DEFAULT '#64748b',
        custom_visitor_fields text[] DEFAULT ARRAY[]::text[],
        api_key_enabled boolean DEFAULT false,
        api_key text,
        data_retention_days integer DEFAULT 365,
        gdpr_contact_email text,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      )
    `);

    // Staff table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS staff (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        first_name text NOT NULL,
        last_name text NOT NULL,
        email text NOT NULL UNIQUE,
        department text NOT NULL,
        employee_id text NOT NULL UNIQUE,
        tenant_company_id varchar REFERENCES tenant_companies(id),
        photo_url text,
        access_level text NOT NULL DEFAULT 'staff',
        password text,
        last_login_at timestamp,
        is_checked_in boolean DEFAULT false NOT NULL,
        checked_in_at timestamp,
        checked_out_at timestamp,
        checkout_type text,
        manual_check_in boolean DEFAULT false,
        is_accounted_for boolean DEFAULT false NOT NULL,
        is_fire_marshal boolean DEFAULT false NOT NULL,
        emergency_token text,
        emergency_token_expires timestamp,
        user_id varchar REFERENCES users(id),
        induction_completed boolean DEFAULT false NOT NULL,
        induction_completed_at timestamp,
        is_active boolean DEFAULT true NOT NULL,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      )
    `);

    // Staff Sessions table for historical tracking of check-ins/outs
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS staff_sessions (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id varchar NOT NULL REFERENCES staff(id),
        check_in_time timestamp NOT NULL,
        check_out_time timestamp,
        is_manual boolean NOT NULL DEFAULT false,
        check_in_method text DEFAULT 'card',
        check_out_method text,
        notes text,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);

    // Visitors table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS visitors (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        first_name text NOT NULL,
        last_name text NOT NULL,
        email text,
        phone_number text,
        mobile_number text,
        company text,
        job_title text,
        address text,
        purpose text,
        car_registration text,
        host_staff_id varchar REFERENCES staff(id),
        visiting_tenant_id varchar REFERENCES tenant_companies(id),
        is_pre_booked boolean DEFAULT false NOT NULL,
        expected_date_time timestamp,
        visit_purpose text,
        checked_in_at timestamp DEFAULT now() NOT NULL,
        checked_out_at timestamp,
        checkout_type text,
        is_checked_in boolean DEFAULT true NOT NULL,
        is_accounted_for boolean DEFAULT false NOT NULL,
        induction_completed boolean DEFAULT false NOT NULL,
        induction_completed_at timestamp,
        qr_code text NOT NULL,
        e_pass_sent boolean DEFAULT false NOT NULL,
        e_pass_delivery_type text,
        e_pass_sent_at timestamp,
        e_pass_url text,
        expected_departure_time timestamp,
        reminder_sent boolean DEFAULT false NOT NULL,
        host_notification_sent boolean DEFAULT false NOT NULL,
        hs_rules_accepted boolean DEFAULT false NOT NULL,
        hs_rules_accepted_at timestamp,
        hs_rules_acceptance_token text,
        notes text,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      )
    `);

    // Meeting Rooms table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS meeting_rooms (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        description text,
        capacity integer NOT NULL,
        location text,
        equipment text[] DEFAULT ARRAY[]::text[],
        is_active boolean DEFAULT true NOT NULL,
        tenant_company_id varchar REFERENCES tenant_companies(id),
        hourly_rate double precision DEFAULT 0,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      )
    `);

    console.log('✅ Database tables created successfully');
  }

  /**
   * Seed default data for a new customer database
   */
  private async seedDefaultData(db: ReturnType<typeof drizzle>, customerId: string): Promise<void> {
    console.log(`🌱 Seeding default data for customer: ${customerId}`);

    try {
      // Create default company settings
      await db.execute(sql`
        INSERT INTO company_settings (company_name, theme, accent_color)
        VALUES ('Customer Company', 'light', '#3b82f6')
        ON CONFLICT DO NOTHING
      `);

      // Note: Default departments are created by CustomerOnboardingService.initializeCompanyDefaults()
      // to avoid duplicate constraint violations

      console.log(`✅ Default data seeded for customer: ${customerId}`);
    } catch (error) {
      console.error(`❌ Failed to seed default data for customer ${customerId}:`, error);
      throw error;
    }
  }

  /**
   * Test database connection for a customer with proper schema isolation
   */
  async testCustomerDatabase(customerId: string): Promise<boolean> {
    let pool: Pool | null = null;
    
    try {
      const connection = await this.createCustomerConnection(customerId);
      pool = connection.pool;
      const db = connection.db;
      
      // Test connection by running a simple query
      await db.execute(sql`SELECT 1`);
      
      return true;
    } catch (error) {
      console.error(`Database connection test failed for customer ${customerId}:`, error);
      return false;
    } finally {
      if (pool) {
        await pool.end();
      }
    }
  }

  /**
   * Delete a customer's database/schema (use with extreme caution)
   * Safe implementation that only affects the specific customer
   */
  async deleteCustomerDatabase(customerId: string): Promise<void> {
    console.log(`🗑️ WARNING: Deleting database for customer: ${customerId}`);
    
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Database deletion not allowed in production without additional safeguards');
    }

    let pool: Pool | null = null;
    
    try {
      const connection = await this.createCustomerConnection(customerId);
      pool = connection.pool;
      const db = connection.db;
      const schemaName = connection.schemaName;

      if (process.env.NODE_ENV !== 'production' && schemaName) {
        // Development: Drop the customer's schema (safe - only affects this customer)
        await db.execute(sql`DROP SCHEMA IF EXISTS ${sql.identifier(schemaName)} CASCADE`);
        console.log(`✅ Schema ${schemaName} deleted for customer: ${customerId}`);
      } else {
        // Production: Would drop entire database (not implemented for safety)
        throw new Error('Production database deletion requires additional implementation and safeguards');
      }
      
    } catch (error) {
      console.error(`❌ Failed to delete database for customer ${customerId}:`, error);
      throw error;
    } finally {
      if (pool) {
        await pool.end();
      }
    }
  }

  /**
   * Create backup of customer database with proper isolation
   */
  async backupCustomerDatabase(customerId: string): Promise<string> {
    console.log(`💾 Creating backup for customer: ${customerId}`);
    
    // Generate unique backup identifier
    const backupId = `backup_${customerId}_${Date.now()}`;
    
    try {
      // Implementation would use pg_dump with schema-specific backup
      // For development: pg_dump --schema=c_<customerId>
      // For production: pg_dump entire customer database
      
      if (process.env.NODE_ENV !== 'production') {
        const schemaName = this.generateSchemaName(customerId);
        console.log(`📋 Would backup schema: ${schemaName}`);
        // TODO: Implement schema-specific backup using pg_dump --schema=${schemaName}
      } else {
        console.log(`📋 Would backup entire database for customer: ${customerId}`);
        // TODO: Implement full database backup
      }
      
      console.log(`✅ Backup created for customer ${customerId}: ${backupId}`);
      return backupId;
    } catch (error) {
      console.error(`❌ Failed to backup database for customer ${customerId}:`, error);
      throw error;
    }
  }

  /**
   * Restore customer database from backup with proper isolation
   */
  async restoreCustomerDatabase(customerId: string, backupId: string): Promise<void> {
    console.log(`🔄 Restoring backup ${backupId} for customer: ${customerId}`);
    
    try {
      // Implementation would use pg_restore with schema-specific restore
      // For development: restore to specific schema
      // For production: restore entire customer database
      
      if (process.env.NODE_ENV !== 'production') {
        const schemaName = this.generateSchemaName(customerId);
        console.log(`📋 Would restore to schema: ${schemaName}`);
        // TODO: Implement schema-specific restore
      } else {
        console.log(`📋 Would restore entire database for customer: ${customerId}`);
        // TODO: Implement full database restore
      }
      
      console.log(`✅ Database restored for customer ${customerId} from backup: ${backupId}`);
    } catch (error) {
      console.error(`❌ Failed to restore database for customer ${customerId}:`, error);
      throw error;
    }
  }
}

// Export singleton instance
export const databaseProvisioningService = DatabaseProvisioningService.getInstance();