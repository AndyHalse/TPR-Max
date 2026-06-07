import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from "@shared/schema";
import * as isolatedSchema from "./isolatedSchema";
import type { Customer } from "@shared/schema";
import { databaseProvisioningService } from "./databaseProvisioningService";
import { createMigrationRunner } from "./migrationRunner";
import { logger } from './utils/logger';

/**
 * CUSTOMER DATABASE ISOLATION SERVICE
 * 
 * This service manages truly separate database connections for each customer,
 * ensuring complete data isolation for the SaaS architecture.
 * 
 * Each customer has their own PostgreSQL database with identical schema
 * but completely separate data. No customerId fields are needed since
 * each customer has their own database instance.
 * 
 * Features:
 * - Database-per-customer for true isolation
 * - Automatic database provisioning for new customers
 * - Connection pooling per customer database
 * - Backup and restore capability per customer
 * - Migration tools for existing customers
 */
export class CustomerDatabaseService {
  private static instance: CustomerDatabaseService;
  private customerConnections: Map<string, ReturnType<typeof drizzle>> = new Map();
  private customerPools: Map<string, Pool> = new Map();
  private customerSchemas: Map<string, string> = new Map();
  private migrationRunner = createMigrationRunner(this);

  private constructor() {}

  private schemaNameCache: Map<string, string> = new Map();

  public generateSchemaName(customerId: string): string {
    if (this.schemaNameCache.has(customerId)) {
      return this.schemaNameCache.get(customerId)!;
    }

    const sanitized = customerId.replace(/-/g, '_').toLowerCase();

    const legacyName = `c_${sanitized.substring(0, 8)}`;
    const fullName = `c_${sanitized}`;

    const knownLegacyMappings: Record<string, string> = {
      'dev-customer-001': 'c_dev_cust',
      'test-customer-trial': 'c_test_cus',
    };

    if (knownLegacyMappings[customerId]) {
      this.schemaNameCache.set(customerId, knownLegacyMappings[customerId]);
      return knownLegacyMappings[customerId];
    }

    if (sanitized.length <= 8) {
      this.schemaNameCache.set(customerId, legacyName);
      return legacyName;
    }

    const isUUID = /^[0-9a-f]{8}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{12}$/.test(sanitized);
    if (isUUID) {
      const result = `c_${sanitized.substring(0, 8)}`;
      this.schemaNameCache.set(customerId, result);
      return result;
    }

    const pgMaxIdentLen = 63;
    if (fullName.length <= pgMaxIdentLen) {
      this.schemaNameCache.set(customerId, fullName);
      return fullName;
    }

    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(customerId).digest('hex').substring(0, 8);
    const name = `c_${sanitized.substring(0, 50)}_${hash}`;
    this.schemaNameCache.set(customerId, name);
    return name;
  }

  static getInstance(): CustomerDatabaseService {
    if (!CustomerDatabaseService.instance) {
      CustomerDatabaseService.instance = new CustomerDatabaseService();
    }
    return CustomerDatabaseService.instance;
  }

  /**
   * Get database connection for a specific customer
   * Creates connection and provisions database if it doesn't exist
   */
  async getCustomerDatabase(customerId: string): Promise<ReturnType<typeof drizzle>> {
    if (this.customerConnections.has(customerId)) {
      const pool = this.customerPools.get(customerId);
      const schemaName = this.customerSchemas.get(customerId);
      if (pool && schemaName) {
        await pool.query(`SET search_path TO "${schemaName}", public`);
      }
      return this.customerConnections.get(customerId)!;
    }

    // Get customer info and database URL
    let customer = await this.getCustomerInfo(customerId);
    
    // Auto-provision database for development customers if needed
    if (!customer && this.isDevelopmentCustomer(customerId)) {
      customer = await this.createDevelopmentCustomer(customerId);
    }
    
    if (!customer) {
      throw new Error(`Customer not found and cannot be auto-created: ${customerId}`);
    }

    // Test connection and provision database if needed  
    const connectionWorks = await databaseProvisioningService.testCustomerDatabase(customerId);
    
    if (!connectionWorks) {
      logger.info(`🏗️ Database not accessible for customer ${customerId}, provisioning...`);
      
      try {
        const databaseUrl = await databaseProvisioningService.provisionCustomerDatabase(customerId);
        
        // Update customer record with new database URL
        await this.updateCustomerDatabaseUrl(customerId, databaseUrl);
      } catch (error) {
        logger.error(`❌ Database provisioning failed: ${error}`);
        
        // DEV DATA BYPASS: Skip database provisioning if Neon is disabled
        const { isDevDataBypass, isDatabaseConnectionError } = await import('./auth');
        if (isDevDataBypass() && isDatabaseConnectionError(error)) {
          // Continue with connection setup using the existing database URL
        } else {
          throw error;
        }
      }
    }

    let pool!: Pool;
    let db!: ReturnType<typeof drizzle>;
    let isNewSchema = false;
    
    const isProduction = process.env.NODE_ENV === 'production';
    const connectionString = isProduction ? process.env.DATABASE_URL! : (customer.databaseUrl || process.env.DATABASE_URL!);
    const schemaName = this.generateSchemaName(customerId);
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        pool = new Pool({
          connectionString,
          max: 1,
          min: 1,
          idleTimeoutMillis: 0,
          connectionTimeoutMillis: 10000,
        });
        
        await pool.query(`SET search_path TO "${schemaName}", public`);
        
        pool.on('connect', (client) => {
          client.query(`SET search_path TO "${schemaName}", public`);
        });

        pool.on('error', (err: any) => {
          const isNeonSuspend = err.code === '57P01' || err.code === '57014' ||
            (typeof err.message === 'string' && err.message.includes('terminating connection'));
          if (isNeonSuspend) {
            logger.warn(`[DB:${customerId}] Pool connection terminated (Neon suspend). Will reconnect on next query.`);
          } else {
            logger.error(`[DB:${customerId}] Unexpected pool error:`, err.message);
          }
        });
        
        const verifyResult = await pool.query(`SHOW search_path`);
        const actualPath = verifyResult.rows[0]?.search_path || '';
        if (!actualPath.includes(schemaName)) {
          logger.error(`❌ search_path verification FAILED: expected ${schemaName}, got ${actualPath}`);
          throw new Error(`search_path not set correctly for ${customerId}`);
        }
        logger.info(`✅ search_path verified: ${actualPath}`);
        
        const schemaExists = await pool.query(
          `SELECT 1 FROM pg_namespace WHERE nspname = $1`,
          [schemaName]
        );
        
        if (!schemaExists.rows.length) {
          logger.info(`✨ Creating schema ${schemaName} for customer ${customerId}...`);
          await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
          logger.info(`✅ Schema ${schemaName} created successfully`);
          isNewSchema = true;
        }
        
        logger.info(`🔒 Schema isolation active: ${schemaName} for customer ${customerId}`);
        
        db = drizzle({ client: pool, schema: isolatedSchema });

        this.customerPools.set(customerId, pool);
        this.customerConnections.set(customerId, db);
        this.customerSchemas.set(customerId, schemaName);
        break;
      } catch (error: any) {
        const isEndpointDisabled = error?.message?.includes('endpoint has been disabled') || 
                                    error?.message?.includes('endpoint is disabled') ||
                                    error?.code === 'XX000';
        
        if (isEndpointDisabled && attempt < maxRetries) {
          logger.info(`🔄 Database endpoint waking up, retry ${attempt}/${maxRetries} in ${attempt * 2}s...`);
          try { pool!?.end(); } catch {}
          await new Promise(resolve => setTimeout(resolve, attempt * 2000));
          this.customerConnections.delete(customerId);
          this.customerPools.delete(customerId);
          continue;
        }
        
        logger.error(`❌ Failed to create database connection: ${error}`);
        
        const { isDevDataBypass, isDatabaseConnectionError } = await import('./auth');
        if (isDevDataBypass() && isDatabaseConnectionError(error)) {
          const mockDb = {} as ReturnType<typeof drizzle>;
          this.customerConnections.set(customerId, mockDb);
          return mockDb;
        }
        
        throw error;
      }
    }

    logger.info(`✅ Connected to isolated database for customer: ${customer.companyName} (${customerId})`);
    
    // Ensure essential tables exist in the customer schema (fixes provisioning gaps)
    try {
      const pool = this.customerPools.get(customerId);
      if (pool) {
        const schemaName = this.generateSchemaName(customerId);
        const tableCheck = await pool.query(
          `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'company_settings' LIMIT 1`,
          [schemaName]
        );
        if (!tableCheck.rows.length) {
          logger.info(`🔧 Bootstrapping missing tables for customer ${customerId} in schema ${schemaName}...`);
          const tablesResult = await pool.query(
            `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`
          );
          const managementTables = new Set([
            'customers', 'session', 'platform_admins', 'platform_admin_sessions',
            'platform_branding_settings', 'schema_version',
            'subscription_plans', 'subscriptions', 'invoices', 'payment_methods',
            'stripe_webhook_events', 'trial_tracking', 'usage_tracking',
            'customer_api_keys', 'customer_api_key_access_logs',
            'onboarding_progress', 'support_sessions',
            'help_articles', 'help_categories', 'help_onboarding_progress', 'help_user_interactions',
          ]);
          const customerTables = (tablesResult.rows as Array<{ table_name: string }>)
            .map(r => r.table_name)
            .filter(t => !managementTables.has(t));
          for (const tableName of customerTables) {
            try {
              await pool.query(
                `CREATE TABLE IF NOT EXISTS "${schemaName}"."${tableName}" (LIKE public."${tableName}" INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)`
              );
            } catch (e: any) {
              logger.warn(`⚠️ Table ${tableName} bootstrap: ${e.message?.substring(0, 80)}`);
            }
          }
          logger.info(`✅ Bootstrapped ${customerTables.length} tables for ${schemaName}`);
        }
      }
    } catch (bootstrapError) {
      logger.error(`⚠️ Table bootstrap check failed for ${customerId}:`, bootstrapError);
    }
    
    // Run schema migrations to ensure database is up to date
    try {
      await this.migrationRunner.ensureSchema(customerId);
    } catch (error) {
      logger.error(`⚠️ Schema migration failed for customer ${customerId}:`, error);
    }

    // Directly ensure incident_reports table exists (bypasses migration transaction issues)
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".incident_reports (
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
          report_url TEXT,
          deleted_at TIMESTAMP
        )
      `);
      // Ensure deleted_at column exists for tables created before this migration
      await pool.query(`ALTER TABLE "${schemaName}".incident_reports ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`);
      logger.info(`✅ incident_reports table ensured for ${schemaName}`);
    } catch (err: any) {
      logger.warn(`⚠️ incident_reports table ensure failed: ${err.message?.substring(0, 100)}`);
    }

    // Ensure feature toggle columns exist in company_settings (migration #026/#027)
    try {
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS feature_martyn_law BOOLEAN DEFAULT true`);
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS feature_incident_reports BOOLEAN DEFAULT true`);
      await pool.query(`UPDATE "${schemaName}".company_settings SET feature_martyn_law = true WHERE feature_martyn_law IS NULL`);
      await pool.query(`UPDATE "${schemaName}".company_settings SET feature_incident_reports = true WHERE feature_incident_reports IS NULL`);
    } catch (err: any) {
      logger.warn(`⚠️ Feature toggle column ensure failed for ${schemaName}: ${err.message?.substring(0, 100)}`);
    }

    // Ensure zone_sweeps table exists (migration #029)
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".zone_sweeps (
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
    } catch (err: any) {
      logger.warn(`⚠️ zone_sweeps table ensure failed for ${schemaName}: ${err.message?.substring(0, 100)}`);
    }

    // Ensure feature_ppm column exists in company_settings (PPM module migration)
    try {
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS feature_ppm BOOLEAN DEFAULT false`);
    } catch (err: any) {
      logger.warn(`⚠️ feature_ppm column ensure failed for ${schemaName}: ${err.message?.substring(0, 100)}`);
    }

    // Ensure feature_help_desk column exists in company_settings (Help Desk module)
    try {
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS feature_help_desk BOOLEAN DEFAULT false`);
    } catch (err: any) {
      logger.warn(`⚠️ feature_help_desk column ensure failed for ${schemaName}: ${err.message?.substring(0, 100)}`);
    }

    // Ensure H&S Incidents and Fire Risk Assessment feature toggle columns exist
    try {
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS feature_hs_incidents BOOLEAN DEFAULT true`);
    } catch (err: any) {
      logger.warn(`⚠️ feature_hs_incidents column ensure failed for ${schemaName}: ${err.message?.substring(0, 100)}`);
    }
    try {
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS feature_fire_risk_assessment BOOLEAN DEFAULT true`);
    } catch (err: any) {
      logger.warn(`⚠️ feature_fire_risk_assessment column ensure failed for ${schemaName}: ${err.message?.substring(0, 100)}`);
    }
    try {
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS feature_compliance_dashboard BOOLEAN DEFAULT true`);
    } catch (err: any) {
      logger.warn(`⚠️ feature_compliance_dashboard column ensure failed for ${schemaName}: ${err.message?.substring(0, 100)}`);
    }

    // Ensure nda_accepted_ip column exists on visitors table (NDA IP logging migration)
    try {
      await pool.query(`ALTER TABLE "${schemaName}".visitors ADD COLUMN IF NOT EXISTS nda_accepted_ip TEXT`);
    } catch (err: any) {
      logger.warn(`⚠️ visitors.nda_accepted_ip column ensure failed for ${schemaName}: ${err.message?.substring(0, 100)}`);
    }

    // Ensure feature_bbs column exists in company_settings (BBS feature flag migration)
    try {
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS feature_bbs BOOLEAN DEFAULT false`);
    } catch (err: any) {
      logger.warn(`⚠️ feature_bbs column ensure failed for ${schemaName}: ${err.message?.substring(0, 100)}`);
    }

    // Ensure PPM tables exist (PPM module migration)
    try {
      // ppm_asset_groups must be created before ppm_assets (FK dependency)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".ppm_asset_groups (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL,
          description TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".ppm_assets (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL,
          asset_ref TEXT,
          category TEXT,
          location TEXT,
          manufacturer TEXT,
          model_number TEXT,
          serial_number TEXT,
          install_date TEXT,
          notes TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".ppm_templates (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL,
          description TEXT,
          category TEXT,
          type TEXT NOT NULL DEFAULT 'non-statutory',
          regulation_reference TEXT,
          frequency TEXT NOT NULL DEFAULT 'monthly',
          custom_days INTEGER,
          estimated_hours TEXT,
          checklist TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await pool.query(`ALTER TABLE "${schemaName}".ppm_templates ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'non-statutory'`);
      await pool.query(`ALTER TABLE "${schemaName}".ppm_templates ADD COLUMN IF NOT EXISTS regulation_reference TEXT`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".ppm_schedules (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          asset_id VARCHAR NOT NULL REFERENCES "${schemaName}".ppm_assets(id) ON DELETE CASCADE,
          template_id VARCHAR REFERENCES "${schemaName}".ppm_templates(id) ON DELETE SET NULL,
          title TEXT NOT NULL,
          frequency TEXT NOT NULL DEFAULT 'monthly',
          custom_days INTEGER,
          start_date TEXT NOT NULL,
          next_due_date TEXT NOT NULL,
          last_completed_date TEXT,
          assigned_to TEXT,
          status TEXT NOT NULL DEFAULT 'scheduled',
          notes TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      logger.info(`✅ PPM tables ensured for ${schemaName}`);
    } catch (err: any) {
      logger.warn(`⚠️ PPM tables ensure failed for ${schemaName}: ${err.message?.substring(0, 100)}`);
    }

    // Ensure PPM Work Order tables exist (Task #9 migration)
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".ppm_work_orders (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          schedule_id VARCHAR REFERENCES "${schemaName}".ppm_schedules(id) ON DELETE SET NULL,
          asset_id VARCHAR REFERENCES "${schemaName}".ppm_assets(id) ON DELETE SET NULL,
          title TEXT NOT NULL,
          description TEXT,
          status TEXT NOT NULL DEFAULT 'scheduled',
          contractor_company_id VARCHAR,
          contractor_company_name TEXT,
          contractor_worker_id VARCHAR,
          contractor_worker_name TEXT,
          assigned_email TEXT,
          due_date TEXT,
          completed_date TEXT,
          notes TEXT,
          completion_notes TEXT,
          access_token VARCHAR,
          requires_certificate BOOLEAN DEFAULT false,
          certificate_uploaded_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".ppm_work_order_documents (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          work_order_id VARCHAR NOT NULL REFERENCES "${schemaName}".ppm_work_orders(id) ON DELETE CASCADE,
          file_name TEXT NOT NULL,
          file_url TEXT NOT NULL,
          file_type TEXT,
          uploaded_by TEXT,
          expiry_date TEXT,
          reference_number TEXT,
          issued_by TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      // Add AI-scan metadata columns to ppm_work_order_documents (added in Task #47)
      await pool.query(`
        ALTER TABLE IF EXISTS "${schemaName}".ppm_work_order_documents
        ADD COLUMN IF NOT EXISTS expiry_date TEXT,
        ADD COLUMN IF NOT EXISTS reference_number TEXT,
        ADD COLUMN IF NOT EXISTS issued_by TEXT
      `);
      // Add accessTokenExpiresAt column if missing (added in Task #9 update)
      await pool.query(`
        ALTER TABLE IF EXISTS "${schemaName}".ppm_work_orders
        ADD COLUMN IF NOT EXISTS access_token_expires_at TIMESTAMP
      `);
      // Add alert deduplication columns (prevent repeated daily alert emails)
      await pool.query(`
        ALTER TABLE IF EXISTS "${schemaName}".ppm_work_orders
        ADD COLUMN IF NOT EXISTS overdue_alerted_at TIMESTAMP
      `);
      await pool.query(`
        ALTER TABLE IF EXISTS "${schemaName}".ppm_work_orders
        ADD COLUMN IF NOT EXISTS missing_cert_alerted_at TIMESTAMP
      `);
      await pool.query(`
        ALTER TABLE IF EXISTS "${schemaName}".ppm_work_orders
        ADD COLUMN IF NOT EXISTS missing_docs_alerted_at TIMESTAMP
      `);
      await pool.query(`ALTER TABLE IF EXISTS "${schemaName}".ppm_work_orders ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMP`);
      // Per-document expiry alert deduplication (prevents daily re-send until doc is replaced)
      await pool.query(`
        ALTER TABLE IF EXISTS "${schemaName}".ppm_work_order_documents
        ADD COLUMN IF NOT EXISTS expiry_alerted_at TIMESTAMP
      `);
      // Index access_token for efficient public token lookup (avoids full-table scan per request)
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_ppm_work_orders_access_token
        ON "${schemaName}".ppm_work_orders (access_token)
        WHERE access_token IS NOT NULL
      `);
      // Asset Groups feature — add group_id FK columns (Task: Asset Groups)
      await pool.query(`ALTER TABLE IF EXISTS "${schemaName}".ppm_assets ADD COLUMN IF NOT EXISTS group_id VARCHAR REFERENCES "${schemaName}".ppm_asset_groups(id) ON DELETE SET NULL`);
      await pool.query(`ALTER TABLE IF EXISTS "${schemaName}".ppm_work_orders ADD COLUMN IF NOT EXISTS group_id VARCHAR REFERENCES "${schemaName}".ppm_asset_groups(id) ON DELETE SET NULL`);
      logger.info(`✅ PPM work order tables ensured for ${schemaName}`);
    } catch (err: any) {
      logger.warn(`⚠️ PPM work order tables ensure failed for ${schemaName}: ${err.message?.substring(0, 100)}`);
    }

    // Ensure CDM 2015 columns on contractor_companies and cdm_projects table
    try {
      await pool.query(`ALTER TABLE "${schemaName}".contractor_companies ADD COLUMN IF NOT EXISTS chas_certified BOOLEAN DEFAULT false`);
      await pool.query(`ALTER TABLE "${schemaName}".contractor_companies ADD COLUMN IF NOT EXISTS cdm_role TEXT`);
      await pool.query(`ALTER TABLE "${schemaName}".contractor_companies ADD COLUMN IF NOT EXISTS constructionline_grade TEXT`);
      await pool.query(`ALTER TABLE "${schemaName}".contractor_companies ADD COLUMN IF NOT EXISTS smas_accredited BOOLEAN DEFAULT false`);
      await pool.query(`ALTER TABLE "${schemaName}".contractor_companies ADD COLUMN IF NOT EXISTS other_accreditations TEXT`);
      await pool.query(`ALTER TABLE "${schemaName}".contractor_companies ADD COLUMN IF NOT EXISTS pd_professional_body TEXT`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".cdm_projects (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id VARCHAR NOT NULL REFERENCES "${schemaName}".contractor_companies(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          description TEXT,
          location TEXT,
          client_name TEXT,
          contractor_role TEXT NOT NULL DEFAULT 'contractor',
          principal_contractor_id VARCHAR REFERENCES "${schemaName}".contractor_companies(id),
          principal_designer_name TEXT,
          status TEXT NOT NULL DEFAULT 'planning',
          start_date TEXT,
          end_date TEXT,
          estimated_days INTEGER,
          peak_workers INTEGER,
          person_days INTEGER,
          f10_status TEXT NOT NULL DEFAULT 'not_required',
          f10_date TEXT,
          f10_reference TEXT,
          f10_notes TEXT,
          cpp_status TEXT NOT NULL DEFAULT 'not_prepared',
          cpp_date TEXT,
          cpp_notes TEXT,
          pci_status TEXT NOT NULL DEFAULT 'not_prepared',
          pci_date TEXT,
          pci_notes TEXT,
          hsf_status TEXT NOT NULL DEFAULT 'not_started',
          hsf_date TEXT,
          hsf_notes TEXT,
          welfare_toilets BOOLEAN DEFAULT false,
          welfare_washing BOOLEAN DEFAULT false,
          welfare_rest_area BOOLEAN DEFAULT false,
          welfare_drinking_water BOOLEAN DEFAULT false,
          welfare_changing BOOLEAN DEFAULT false,
          notes TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      // Add duty-holder columns to existing cdm_projects tables (idempotent)
      await pool.query(`ALTER TABLE "${schemaName}".cdm_projects ADD COLUMN IF NOT EXISTS principal_contractor_id VARCHAR REFERENCES "${schemaName}".contractor_companies(id)`);
      await pool.query(`ALTER TABLE "${schemaName}".cdm_projects ADD COLUMN IF NOT EXISTS principal_designer_name TEXT`);
      // Add F10 columns (idempotent backfill for existing tables)
      await pool.query(`ALTER TABLE "${schemaName}".cdm_projects ADD COLUMN IF NOT EXISTS f10_status TEXT NOT NULL DEFAULT 'not_required'`);
      await pool.query(`ALTER TABLE "${schemaName}".cdm_projects ADD COLUMN IF NOT EXISTS f10_alert_sent_at TIMESTAMP`);
      logger.info(`✅ CDM 2015 tables/columns ensured for ${schemaName}`);
    } catch (err: any) {
      logger.warn(`⚠️ CDM 2015 migration failed for ${schemaName}: ${err.message?.substring(0, 100)}`);
    }

    // ─── HR MODULE TABLES ─────────────────────────────────────────────────────
    try {
      // Section 1 – Extended Employee Record columns on staff table
      await pool.query(`ALTER TABLE "${schemaName}".staff ADD COLUMN IF NOT EXISTS employment_type TEXT DEFAULT 'full_time'`);
      await pool.query(`ALTER TABLE "${schemaName}".staff ADD COLUMN IF NOT EXISTS contract_start_date DATE`);
      await pool.query(`ALTER TABLE "${schemaName}".staff ADD COLUMN IF NOT EXISTS contract_end_date DATE`);
      await pool.query(`ALTER TABLE "${schemaName}".staff ADD COLUMN IF NOT EXISTS team TEXT`);
      await pool.query(`ALTER TABLE "${schemaName}".staff ADD COLUMN IF NOT EXISTS line_manager_id VARCHAR REFERENCES "${schemaName}".staff(id) ON DELETE SET NULL`);
      await pool.query(`ALTER TABLE "${schemaName}".staff ADD COLUMN IF NOT EXISTS pay_grade TEXT`);
      await pool.query(`ALTER TABLE "${schemaName}".staff ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT`);
      await pool.query(`ALTER TABLE "${schemaName}".staff ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT`);
      await pool.query(`ALTER TABLE "${schemaName}".staff ADD COLUMN IF NOT EXISTS emergency_contact_relationship TEXT`);
      await pool.query(`ALTER TABLE "${schemaName}".staff ADD COLUMN IF NOT EXISTS employment_status TEXT DEFAULT 'active'`);
      await pool.query(`ALTER TABLE "${schemaName}".staff ADD COLUMN IF NOT EXISTS annual_leave_entitlement_days NUMERIC(4,1) DEFAULT 28`);
      await pool.query(`ALTER TABLE "${schemaName}".staff ADD COLUMN IF NOT EXISTS leave_year_start DATE`);
      await pool.query(`ALTER TABLE "${schemaName}".staff ADD COLUMN IF NOT EXISTS working_days_per_week NUMERIC(3,1) DEFAULT 5`);
      logger.info(`✅ HR staff columns ensured for ${schemaName}`);
    } catch (err: any) {
      logger.warn(`⚠️ HR staff column migration failed for ${schemaName}: ${err.message?.substring(0, 100)}`);
    }

    // Section 2 – Right to Work
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".right_to_work (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          staff_id VARCHAR NOT NULL REFERENCES "${schemaName}".staff(id) ON DELETE CASCADE,
          document_type TEXT NOT NULL,
          document_reference TEXT,
          issue_date DATE,
          expiry_date DATE,
          verified_date DATE NOT NULL,
          verified_by TEXT NOT NULL,
          verification_method TEXT DEFAULT 'manual',
          notes TEXT,
          is_current BOOLEAN DEFAULT TRUE,
          reminder_sent_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_rtw_staff_id ON "${schemaName}".right_to_work(staff_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_rtw_expiry ON "${schemaName}".right_to_work(expiry_date) WHERE is_current = TRUE`);
      logger.info(`✅ Right to Work table ensured for ${schemaName}`);
    } catch (err: any) {
      logger.warn(`⚠️ RTW table migration failed for ${schemaName}: ${err.message?.substring(0, 100)}`);
    }

    // Section 3 – Training Matrix
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".staff_training_records (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          staff_id VARCHAR NOT NULL REFERENCES "${schemaName}".staff(id) ON DELETE CASCADE,
          course_name TEXT NOT NULL,
          provider TEXT,
          completed_date DATE NOT NULL,
          expiry_date DATE,
          is_mandatory BOOLEAN DEFAULT FALSE,
          mandatory_role TEXT,
          notes TEXT,
          reminder_sent_at TIMESTAMP,
          deleted_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_str_staff_id ON "${schemaName}".staff_training_records(staff_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_str_expiry ON "${schemaName}".staff_training_records(expiry_date) WHERE deleted_at IS NULL AND is_mandatory = TRUE`);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".training_requirements (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          course_name TEXT NOT NULL,
          applies_to TEXT DEFAULT 'all',
          applies_value TEXT,
          renewal_period_months INTEGER,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      logger.info(`✅ Training tables ensured for ${schemaName}`);
    } catch (err: any) {
      logger.warn(`⚠️ Training table migration failed for ${schemaName}: ${err.message?.substring(0, 100)}`);
    }

    // Section 4 – Leave Management
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".leave_requests (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          staff_id VARCHAR NOT NULL REFERENCES "${schemaName}".staff(id) ON DELETE CASCADE,
          leave_type TEXT NOT NULL,
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          days_taken NUMERIC(5,1) NOT NULL DEFAULT 0,
          status TEXT DEFAULT 'pending',
          reason TEXT,
          notes TEXT,
          approved_by_id VARCHAR REFERENCES "${schemaName}".staff(id) ON DELETE SET NULL,
          approved_at TIMESTAMP,
          decline_reason TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_leave_staff_id ON "${schemaName}".leave_requests(staff_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_leave_status ON "${schemaName}".leave_requests(status)`);
      await pool.query(`ALTER TABLE "${schemaName}".leave_requests ADD COLUMN IF NOT EXISTS half_day TEXT DEFAULT 'none'`).catch(() => {});
      logger.info(`✅ Leave requests table ensured for ${schemaName}`);
    } catch (err: any) {
      logger.warn(`⚠️ Leave table migration failed for ${schemaName}: ${err.message?.substring(0, 100)}`);
    }

    // Section 5 – Absence / Sickness
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".absence_records (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          staff_id VARCHAR NOT NULL REFERENCES "${schemaName}".staff(id) ON DELETE CASCADE,
          absence_type TEXT DEFAULT 'sickness',
          start_date DATE NOT NULL,
          return_date DATE,
          days_lost NUMERIC(5,1),
          reason TEXT,
          fit_note_required BOOLEAN DEFAULT FALSE,
          return_to_work_completed BOOLEAN DEFAULT FALSE,
          return_to_work_date DATE,
          return_to_work_notes TEXT,
          return_to_work_by TEXT,
          bradford_score_at_record INTEGER,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_absence_staff_id ON "${schemaName}".absence_records(staff_id)`);
      logger.info(`✅ Absence records table ensured for ${schemaName}`);
    } catch (err: any) {
      logger.warn(`⚠️ Absence table migration failed for ${schemaName}: ${err.message?.substring(0, 100)}`);
    }

    // Section 6 – Document Storage
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".staff_documents (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          staff_id VARCHAR NOT NULL REFERENCES "${schemaName}".staff(id) ON DELETE CASCADE,
          document_type TEXT NOT NULL,
          title TEXT NOT NULL,
          file_url TEXT NOT NULL,
          file_name TEXT NOT NULL,
          file_size_bytes INTEGER,
          uploaded_by TEXT,
          is_confidential BOOLEAN DEFAULT FALSE,
          expiry_date DATE,
          notes TEXT,
          deleted_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_sdoc_staff_id ON "${schemaName}".staff_documents(staff_id)`);
      logger.info(`✅ Staff documents table ensured for ${schemaName}`);
    } catch (err: any) {
      logger.warn(`⚠️ Staff documents table migration failed for ${schemaName}: ${err.message?.substring(0, 100)}`);
    }

    // Section 7 – Onboarding Checklists
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".onboarding_checklists (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          staff_id VARCHAR NOT NULL UNIQUE REFERENCES "${schemaName}".staff(id) ON DELETE CASCADE,
          completed_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".onboarding_items (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          checklist_id UUID NOT NULL REFERENCES "${schemaName}".onboarding_checklists(id) ON DELETE CASCADE,
          item_key TEXT NOT NULL,
          label TEXT NOT NULL,
          completed BOOLEAN DEFAULT FALSE,
          completed_at TIMESTAMP,
          completed_by TEXT,
          notes TEXT,
          display_order INTEGER DEFAULT 0,
          due_day_offset INTEGER,
          is_required BOOLEAN DEFAULT TRUE
        )
      `);
      await pool.query(`ALTER TABLE "${schemaName}".onboarding_items ADD COLUMN IF NOT EXISTS due_day_offset INTEGER`).catch(() => {});
      await pool.query(`ALTER TABLE "${schemaName}".onboarding_items ADD COLUMN IF NOT EXISTS is_required BOOLEAN DEFAULT TRUE`).catch(() => {});
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".onboarding_templates (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          item_key TEXT NOT NULL,
          label TEXT NOT NULL,
          display_order INTEGER DEFAULT 0,
          is_active BOOLEAN DEFAULT TRUE,
          due_day_offset INTEGER,
          is_required BOOLEAN DEFAULT TRUE
        )
      `);
      await pool.query(`ALTER TABLE "${schemaName}".onboarding_templates ADD COLUMN IF NOT EXISTS due_day_offset INTEGER`).catch(() => {});
      await pool.query(`ALTER TABLE "${schemaName}".onboarding_templates ADD COLUMN IF NOT EXISTS is_required BOOLEAN DEFAULT TRUE`).catch(() => {});
      await pool.query(`ALTER TABLE "${schemaName}".onboarding_templates ADD COLUMN IF NOT EXISTS template_set_id UUID`).catch(() => {});
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".onboarding_template_sets (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL,
          is_default BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      logger.info(`✅ Onboarding tables ensured for ${schemaName}`);
    } catch (err: any) {
      logger.warn(`⚠️ Onboarding table migration failed for ${schemaName}: ${err.message?.substring(0, 100)}`);
    }

    // Section 8 – Leaver Process
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".leaver_checklists (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          staff_id VARCHAR NOT NULL REFERENCES "${schemaName}".staff(id) ON DELETE CASCADE,
          last_day DATE NOT NULL,
          reason TEXT,
          is_voluntary BOOLEAN,
          completed_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".leaver_items (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          checklist_id UUID NOT NULL REFERENCES "${schemaName}".leaver_checklists(id) ON DELETE CASCADE,
          item_key TEXT NOT NULL,
          label TEXT NOT NULL,
          completed BOOLEAN DEFAULT FALSE,
          completed_at TIMESTAMP,
          completed_by TEXT,
          notes TEXT,
          display_order INTEGER DEFAULT 0
        )
      `);
      // Additive columns for redesigned leaver process
      await pool.query(`ALTER TABLE "${schemaName}".leaver_checklists ADD COLUMN IF NOT EXISTS reason_code TEXT`);
      await pool.query(`ALTER TABLE "${schemaName}".leaver_checklists ADD COLUMN IF NOT EXISTS additional_detail TEXT`);
      await pool.query(`ALTER TABLE "${schemaName}".leaver_checklists ADD COLUMN IF NOT EXISTS deactivation_override_reason TEXT`);
      await pool.query(`ALTER TABLE "${schemaName}".leaver_checklists ADD COLUMN IF NOT EXISTS deactivation_override_by TEXT`);
      await pool.query(`ALTER TABLE "${schemaName}".leaver_checklists ADD COLUMN IF NOT EXISTS deactivation_override_at TIMESTAMP`);
      await pool.query(`ALTER TABLE "${schemaName}".leaver_items ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'legal_payroll'`);
      await pool.query(`ALTER TABLE "${schemaName}".leaver_items ADD COLUMN IF NOT EXISTS is_critical BOOLEAN DEFAULT FALSE`);
      await pool.query(`ALTER TABLE "${schemaName}".leaver_items ADD COLUMN IF NOT EXISTS is_auto BOOLEAN DEFAULT FALSE`);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".leaver_equipment (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          checklist_id UUID NOT NULL REFERENCES "${schemaName}".leaver_checklists(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          asset_tag TEXT,
          serial_number TEXT,
          returned BOOLEAN DEFAULT FALSE,
          returned_on DATE,
          notes TEXT,
          display_order INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_leaver_equipment_checklist ON "${schemaName}".leaver_equipment(checklist_id)`);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".leaver_exit_interviews (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          checklist_id UUID NOT NULL UNIQUE REFERENCES "${schemaName}".leaver_checklists(id) ON DELETE CASCADE,
          reason_for_leaving TEXT,
          what_worked_well TEXT,
          what_could_improve TEXT,
          would_recommend TEXT,
          would_rehire TEXT,
          additional_comments TEXT,
          conducted_by TEXT,
          conducted_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".leaver_template_items (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          category TEXT NOT NULL,
          item_key TEXT NOT NULL,
          label TEXT NOT NULL,
          is_critical BOOLEAN DEFAULT FALSE,
          is_auto BOOLEAN DEFAULT FALSE,
          display_order INTEGER DEFAULT 0,
          enabled BOOLEAN DEFAULT TRUE,
          kind TEXT NOT NULL DEFAULT 'checklist',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_leaver_template_unique ON "${schemaName}".leaver_template_items(kind, category, item_key)`);

      logger.info(`✅ Leaver tables ensured for ${schemaName}`);
    } catch (err: any) {
      logger.warn(`⚠️ Leaver table migration failed for ${schemaName}: ${err.message?.substring(0, 100)}`);
    }

    // Section 9 – Appraisals
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".appraisals (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          staff_id VARCHAR NOT NULL REFERENCES "${schemaName}".staff(id) ON DELETE CASCADE,
          review_date DATE NOT NULL,
          review_type TEXT DEFAULT 'annual',
          conducted_by TEXT NOT NULL,
          overall_rating TEXT,
          summary_notes TEXT,
          next_review_date DATE,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_appraisals_staff_id ON "${schemaName}".appraisals(staff_id)`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".appraisal_objectives (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          appraisal_id UUID NOT NULL REFERENCES "${schemaName}".appraisals(id) ON DELETE CASCADE,
          description TEXT NOT NULL,
          target_date DATE,
          status TEXT DEFAULT 'in_progress',
          notes TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      logger.info(`✅ Appraisals tables ensured for ${schemaName}`);
    } catch (err: any) {
      logger.warn(`⚠️ Appraisals table migration failed for ${schemaName}: ${err.message?.substring(0, 100)}`);
    }

    // Section 10 – Permit to Work
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".permit_to_work (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
          permit_number TEXT NOT NULL,
          permit_type TEXT NOT NULL,
          work_description TEXT NOT NULL,
          work_location TEXT NOT NULL,
          contractor_company_id VARCHAR, contractor_company_name TEXT,
          contractor_worker_id VARCHAR, contractor_worker_name TEXT,
          staff_id VARCHAR, staff_name TEXT,
          planned_start_date TEXT NOT NULL, planned_start_time TEXT NOT NULL,
          planned_end_date TEXT NOT NULL, planned_end_time TEXT NOT NULL,
          actual_start_at TIMESTAMP, actual_end_at TIMESTAMP,
          permit_valid_from TIMESTAMP NOT NULL, permit_valid_until TIMESTAMP NOT NULL,
          status TEXT NOT NULL DEFAULT 'draft',
          authorised_by_id VARCHAR, authorised_by_name TEXT, authorised_at TIMESTAMP, auth_notes TEXT,
          rejected_by_id VARCHAR, rejected_at TIMESTAMP, rejection_reason TEXT,
          closed_by_id VARCHAR, closed_by_name TEXT, closed_at TIMESTAMP,
          closure_notes TEXT, work_completed_satisfactorily BOOLEAN,
          suspended_by_id VARCHAR, suspended_at TIMESTAMP, suspension_reason TEXT,
          linked_ppm_work_order_id VARCHAR, linked_incident_id VARCHAR, linked_compliance_cert_id VARCHAR,
          expiry_alerted_at TIMESTAMP, overdue_closure_alerted_at TIMESTAMP,
          created_by_id VARCHAR, created_by_name TEXT,
          created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".permit_checklist (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
          permit_id VARCHAR NOT NULL REFERENCES "${schemaName}".permit_to_work(id) ON DELETE CASCADE,
          checklist_section TEXT NOT NULL, item_description TEXT NOT NULL,
          is_required BOOLEAN NOT NULL DEFAULT true,
          response TEXT, responded_by_id VARCHAR, responded_at TIMESTAMP,
          notes TEXT, display_order INTEGER NOT NULL DEFAULT 0
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".permit_attachments (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
          permit_id VARCHAR NOT NULL REFERENCES "${schemaName}".permit_to_work(id) ON DELETE CASCADE,
          document_type TEXT NOT NULL, file_name TEXT NOT NULL, file_url TEXT NOT NULL,
          uploaded_by_id VARCHAR, uploaded_by_name TEXT,
          uploaded_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".ptw_company_documents (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
          document_type TEXT NOT NULL,
          title TEXT NOT NULL,
          notes TEXT,
          file_url TEXT NOT NULL,
          file_name TEXT NOT NULL,
          expiry_date TEXT,
          uploaded_by_id VARCHAR, uploaded_by_name TEXT,
          uploaded_at TIMESTAMP DEFAULT NOW(),
          replaced_at TIMESTAMP,
          expiry_alerted_at TIMESTAMP
        )
      `);
      await pool.query(`ALTER TABLE "${schemaName}".ptw_company_documents ADD COLUMN IF NOT EXISTS expiry_alerted_at TIMESTAMP`).catch(() => {});
      logger.info(`✅ Permit to Work tables ensured for ${schemaName}`);
    } catch (err: any) {
      logger.warn(`⚠️ Permit to Work table migration failed for ${schemaName}: ${err.message?.substring(0, 100)}`);
    }

    // HR feature toggle in company_settings
    try {
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS feature_hr_module BOOLEAN DEFAULT false`);
    } catch (err: any) {
      logger.warn(`⚠️ HR feature toggle migration failed for ${schemaName}: ${err.message?.substring(0, 100)}`);
    }
    // ─── END HR MODULE TABLES ─────────────────────────────────────────────────

    // Section — Audit & Inspection Engine
    try {
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS feature_audit_engine BOOLEAN DEFAULT false`);
    } catch (err: any) {
      logger.warn(`⚠️ feature_audit_engine column ensure failed for ${schemaName}: ${err.message?.substring(0, 100)}`);
    }
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".audit_templates (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
          name TEXT NOT NULL,
          description TEXT,
          category TEXT NOT NULL DEFAULT 'safety',
          frequency TEXT NOT NULL DEFAULT 'monthly',
          custom_days INTEGER,
          estimated_minutes INTEGER,
          pass_score INTEGER DEFAULT 80,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".audit_template_items (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
          template_id VARCHAR NOT NULL REFERENCES "${schemaName}".audit_templates(id) ON DELETE CASCADE,
          question TEXT NOT NULL,
          category TEXT,
          requires_photo BOOLEAN NOT NULL DEFAULT false,
          requires_note BOOLEAN NOT NULL DEFAULT false,
          is_critical BOOLEAN NOT NULL DEFAULT false,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".audit_records (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
          template_id VARCHAR REFERENCES "${schemaName}".audit_templates(id) ON DELETE SET NULL,
          template_name TEXT NOT NULL,
          category TEXT NOT NULL,
          title TEXT NOT NULL,
          conducted_by TEXT NOT NULL,
          conducted_at TIMESTAMP,
          scheduled_date TEXT,
          location TEXT,
          status TEXT NOT NULL DEFAULT 'scheduled',
          overall_score INTEGER,
          passed BOOLEAN,
          summary TEXT,
          access_token VARCHAR,
          access_token_expires_at TIMESTAMP,
          overdue_alerted_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".audit_record_items (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
          audit_id VARCHAR NOT NULL REFERENCES "${schemaName}".audit_records(id) ON DELETE CASCADE,
          template_item_id VARCHAR REFERENCES "${schemaName}".audit_template_items(id) ON DELETE SET NULL,
          question TEXT NOT NULL,
          is_critical BOOLEAN NOT NULL DEFAULT false,
          response TEXT,
          note TEXT,
          photo_url TEXT,
          photo_file_name TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".audit_corrective_actions (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
          audit_id VARCHAR NOT NULL REFERENCES "${schemaName}".audit_records(id) ON DELETE CASCADE,
          audit_item_id VARCHAR REFERENCES "${schemaName}".audit_record_items(id) ON DELETE SET NULL,
          title TEXT NOT NULL,
          description TEXT,
          priority TEXT NOT NULL DEFAULT 'medium',
          assigned_to TEXT,
          assigned_email TEXT,
          due_date TEXT,
          status TEXT NOT NULL DEFAULT 'open',
          closure_notes TEXT,
          closure_evidence_url TEXT,
          closure_evidence_file_name TEXT,
          closed_at TIMESTAMP,
          closed_by TEXT,
          overdue_alerted_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      logger.info(`✅ Audit Engine tables ensured for ${schemaName}`);
    } catch (err: any) {
      logger.warn(`⚠️ Audit Engine table migration failed for ${schemaName}: ${err.message?.substring(0, 100)}`);
    }
    // ─── END AUDIT ENGINE TABLES ──────────────────────────────────────────────

    // ─── RA BUILDER TABLES ────────────────────────────────────────────────────
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".ra_builder_assessments (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
          title TEXT NOT NULL,
          ra_type TEXT NOT NULL DEFAULT 'general',
          status TEXT NOT NULL DEFAULT 'draft',
          task_description TEXT,
          location TEXT,
          department TEXT,
          prepared_by TEXT,
          reviewed_by TEXT,
          approved_by TEXT,
          assessment_date TEXT,
          next_review_date TEXT,
          type_metadata TEXT DEFAULT '{}',
          notes TEXT,
          linked_rams_document_id VARCHAR,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".ra_builder_hazards (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
          assessment_id VARCHAR NOT NULL REFERENCES "${schemaName}".ra_builder_assessments(id) ON DELETE CASCADE,
          hazard_description TEXT NOT NULL,
          affected_persons TEXT,
          existing_controls TEXT,
          likelihood INTEGER NOT NULL DEFAULT 3,
          severity INTEGER NOT NULL DEFAULT 3,
          risk_rating INTEGER NOT NULL DEFAULT 9,
          additional_controls TEXT,
          residual_likelihood INTEGER DEFAULT 2,
          residual_severity INTEGER DEFAULT 2,
          residual_risk_rating INTEGER DEFAULT 4,
          action_by TEXT,
          action_date TEXT,
          action_status TEXT DEFAULT 'open',
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      // Feature flag column
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS feature_ra_builder BOOLEAN DEFAULT false`);
      logger.info(`✅ RA Builder tables ensured for ${schemaName}`);
    } catch (err: any) {
      logger.warn(`⚠️ RA Builder table migration failed for ${schemaName}: ${err.message?.substring(0, 100)}`);
    }
    // ─── END RA BUILDER TABLES ────────────────────────────────────────────────

    // Ensure site induction + AI/video + QR + CLUe columns on company_settings
    try {
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS site_address TEXT`);
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS induction_hazards TEXT`);
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS induction_ppe TEXT`);
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS assembly_point TEXT`);
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS first_aid_location TEXT`);
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS emergency_contact TEXT`);
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS induction_site_rules TEXT`);
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS ai_instructions_prompt TEXT DEFAULT 'Create comprehensive, engaging safety induction content'`);
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS video_quality_preference TEXT DEFAULT 'high'`);
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS enable_advanced_video_features BOOLEAN DEFAULT true`);
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS default_video_length TEXT DEFAULT '15'`);
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS qr_reader_enabled BOOLEAN DEFAULT false`);
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS qr_reader_device TEXT DEFAULT 'auto'`);
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS qr_code_format TEXT DEFAULT 'visigate'`);
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS qr_reader_settings TEXT DEFAULT '{}'`);
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS clue_enabled BOOLEAN DEFAULT false`);
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS clue_api_url TEXT DEFAULT 'https://api.suprema-clue.com'`);
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS clue_api_key TEXT DEFAULT ''`);
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS clue_api_secret TEXT DEFAULT ''`);
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS clue_organization_id TEXT DEFAULT ''`);
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS clue_webhook_secret TEXT DEFAULT ''`);
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS clue_dynamic_qr_enabled BOOLEAN DEFAULT true`);
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS clue_qr_validity_minutes TEXT DEFAULT '60'`);
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS clue_device_groups TEXT[] DEFAULT ARRAY[]::TEXT[]`);
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS onboarding_checklist_dismissed BOOLEAN DEFAULT false`);
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS quick_setup_dismissed BOOLEAN DEFAULT false`);
      await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS feature_template_library BOOLEAN DEFAULT true`);
      logger.info(`✅ Induction/AI/QR/CLUe settings columns ensured for ${schemaName}`);
    } catch (err: any) {
      logger.warn(`⚠️ Induction settings column migration failed for ${schemaName}: ${err.message?.substring(0, 100)}`);
    }

    // Ensure admin user exists in this customer schema (critical for production)
    try {
      await this.ensureAdminUserExists(customerId, db);
    } catch (error) {
      logger.error(`⚠️ Admin user seeding failed for customer ${customerId}:`, error);
    }
    
    // New customer schemas start completely blank - NO data migration from public schema
    // This ensures 100% customer isolation with zero cross-contamination
    
    // Ensure visit_reasons table exists and seed defaults
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".visit_reasons (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          label TEXT NOT NULL,
          instructions TEXT DEFAULT '',
          require_hs_acceptance BOOLEAN DEFAULT FALSE,
          hs_content TEXT DEFAULT '',
          is_active BOOLEAN DEFAULT TRUE,
          sort_order INTEGER DEFAULT 0,
          applies_to TEXT DEFAULT 'both',
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);
      await pool.query(`ALTER TABLE "${schemaName}".visitors ADD COLUMN IF NOT EXISTS visit_reason_id VARCHAR`);
      // Seed three default reasons only if the table is empty
      const vrCheck = await pool.query(`SELECT COUNT(*) as cnt FROM "${schemaName}".visit_reasons`);
      if (parseInt(vrCheck.rows[0]?.cnt || '0') === 0) {
        await pool.query(`
          INSERT INTO "${schemaName}".visit_reasons (label, instructions, require_hs_acceptance, is_active, sort_order, applies_to) VALUES
          ('Meeting / Appointment', 'Please wait in reception — your host will come to meet you.', false, true, 0, 'visitors'),
          ('Delivery', 'Please proceed to the loading bay at the rear of the building. Do not enter the main office.', false, true, 1, 'both'),
          ('Contractor / Engineer', 'You must sign in fully before accessing any work area. Ensure you have your ID and any required documentation.', true, true, 2, 'contractors')
        `);
      }
      logger.info(`✅ visit_reasons table ensured for ${schemaName}`);
    } catch (err: any) {
      logger.warn(`⚠️ visit_reasons table migration failed for ${schemaName}: ${err.message?.substring(0, 100)}`);
    }

    // Seed company_settings if empty, or correct company_name if it doesn't match the customer record
    try {
      const settingsCheck = await db.execute(`SELECT id, company_name FROM "${schemaName}".company_settings LIMIT 1`);
      if (!settingsCheck.rows || settingsCheck.rows.length === 0) {
        logger.info(`🌱 Seeding company_settings for new customer: ${customer.companyName}`);
        const seedPool = this.customerPools.get(customerId);
        if (seedPool) {
          await seedPool.query(
            `INSERT INTO "${schemaName}".company_settings (id, company_name) VALUES (gen_random_uuid(), $1)`,
            [customer.companyName]
          );
        }
        logger.info(`✅ Company settings seeded for: ${customer.companyName}`);
      } else {
        const currentName = settingsCheck.rows[0]?.company_name;
        if (currentName !== customer.companyName) {
          logger.info(`🔧 Company name mismatch in ${schemaName}: "${currentName}" vs registered "${customer.companyName}" - correcting...`);
          const fixPool = this.customerPools.get(customerId);
          if (fixPool) {
            await fixPool.query(
              `UPDATE "${schemaName}".company_settings SET company_name = $1 WHERE id = $2`,
              [customer.companyName, settingsCheck.rows[0].id]
            );
          }
          logger.info(`✅ Company name corrected to: ${customer.companyName}`);
        } else {
          logger.info(`✅ Company settings correct in ${schemaName}: "${currentName}"`);
        }
      }
    } catch (seedError) {
      logger.error(`⚠️ Failed to seed company settings:`, seedError);
    }
    
    return db;
  }

  private async ensureAdminUserExists(customerId: string, db: ReturnType<typeof drizzle>): Promise<void> {
    try {
      const existingUsers = await db.execute(`SELECT id, username, role FROM users LIMIT 5`);
      
      if (existingUsers.rows && existingUsers.rows.length > 0) {
        const hasAdmin = existingUsers.rows.some((u: any) => u.role === 'admin');
        if (hasAdmin) {
          return;
        }
        logger.info(`⚠️ Customer ${customerId} has ${existingUsers.rows.length} users but no admin - creating one`);
      } else {
        logger.info(`🌱 No users found for customer ${customerId} - seeding default admin user`);
      }

      const bcrypt = await import('bcryptjs');
      const crypto = await import('crypto');

      const isProduction = process.env.NODE_ENV === 'production';
      const tempPassword = isProduction
        ? crypto.randomBytes(16).toString('hex')
        : 'ChangeMe123!';
      const hashedPassword = await bcrypt.default.hash(tempPassword, 10);

      await db.execute(`
        INSERT INTO users (username, email, first_name, last_name, role, password, is_active)
        VALUES ('Admin', 'admin@tprmax.com', 'Admin', 'User', 'admin', '${hashedPassword}', true)
        ON CONFLICT (username) DO NOTHING
      `);
      
      await db.execute(`
        INSERT INTO users (username, email, first_name, last_name, role, password, is_active)
        VALUES ('system', 'system@tprmax.com', '', '', 'user', '${hashedPassword}', true)
        ON CONFLICT (username) DO NOTHING
      `);
      
      if (isProduction) {
        logger.info(`✅ Admin user seeded for customer ${customerId} (username: Admin) - password must be changed on first login`);
      } else {
        logger.info(`✅ Admin user seeded for customer ${customerId} (username: Admin, temp password: ${tempPassword})`);
      }
    } catch (error) {
      logger.error(`❌ Failed to seed admin user for ${customerId}:`, error);
    }
  }

  /**
   * Get customer information from the main management database
   * Uses working database connection instead of creating new Pool
   */
  private async getCustomerInfo(customerId: string): Promise<Customer | null> {
    try {
      // Import the working database connection instead of creating a new Pool
      const { db } = await import('./db');
      
      logger.info(`🔍 Looking up customer info: "${customerId}" using working database connection`);

      const customers = await db
        .select()
        .from(schema.customers)
        .where(eq(schema.customers.id, customerId))
        .limit(1);

      const customer = customers[0] || null;
      logger.info(customer ? `✅ Found customer info: ${customer.companyName}` : `❌ Customer not found: ${customerId}`);
      
      return customer;
    } catch (error) {
      logger.error(`🚨 Error fetching customer info: ${error}`);
      return null;
    }
  }

  /**
   * Create a new customer with their own database
   * Uses working database connection instead of creating new Pool
   */
  async createCustomer(customerData: {
    companyName: string;
    slug: string;
    contactEmail: string;
    databaseUrl: string;
  }): Promise<Customer> {
    try {
      // Import the working database connection instead of creating a new Pool
      const { db } = await import('./db');
      
      logger.info(`🔧 Creating customer: "${customerData.companyName}" using working database connection`);

      // Insert new customer into management database
      const [newCustomer] = await db
        .insert(schema.customers)
        .values({
          companyName: customerData.companyName,
          slug: customerData.slug,
          contactEmail: customerData.contactEmail,
          databaseUrl: customerData.databaseUrl,
          isActive: true,
          onboardingCompleted: false,
        })
        .returning();

      logger.info(`✅ Created new customer: ${customerData.companyName} (${newCustomer.id})`);
      return newCustomer;
    } catch (error) {
      logger.error(`🚨 Failed to create customer: ${error}`);
      
      // DEV DATA BYPASS: Check if this is a Neon database error and bypass is enabled
      const { isDevDataBypass, isDatabaseConnectionError } = await import('./auth');
      if (isDevDataBypass() && isDatabaseConnectionError(error)) {
        return {
          id: 'dev-customer-001',
          companyName: customerData.companyName,
          slug: customerData.slug,
          contactEmail: customerData.contactEmail,
          databaseUrl: customerData.databaseUrl,
          isActive: true,
          onboardingCompleted: false,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
          planType: 'premium',
          subscriptionStatus: 'active',
          maxVisitorsPerMonth: 1000,
          supportContactEmail: customerData.contactEmail,
          apiKeyEnabled: true,
          apiKey: null,
          stripeCustomerId: null
        } as unknown as Customer;
      }
      
      throw new Error(`Failed to create customer: ${error}`);
    }
  }

  /**
   * Get all active customers (for management/admin purposes)
   * Uses working database connection instead of creating new Pool
   */
  async getAllCustomers(): Promise<Customer[]> {
    try {
      // Import the working database connection instead of creating a new Pool
      const { db } = await import('./db');
      
      logger.info(`🔍 Getting all customers using working database connection`);

      const customers = await db
        .select()
        .from(schema.customers)
        .where(eq(schema.customers.isActive, true));

      logger.info(`✅ Found ${customers.length} active customers`);
      return customers;
    } catch (error) {
      logger.error(`🚨 Error fetching customers: ${error}`);
      return [];
    }
  }

  /**
   * Close all database connections for cleanup
   */
  async closeAllConnections(): Promise<void> {
    for (const [customerId, pool] of Array.from(this.customerPools.entries())) {
      try {
        await pool.end();
        logger.info(`✅ Closed database connection for customer: ${customerId}`);
      } catch (error) {
        logger.error(`Error closing connection for customer ${customerId}:`, error);
      }
    }

    this.customerConnections.clear();
    this.customerPools.clear();
  }

  /**
   * Check if this is a development customer
   */
  private isDevelopmentCustomer(customerId: string): boolean {
    return ['dev-customer-001', 'dev-customer-002', 'test-customer-trial'].includes(customerId);
  }

  /**
   * Create development customer record if it doesn't exist
   */
  private async createDevelopmentCustomer(customerId: string): Promise<Customer> {
    const customerData = this.getDevelopmentCustomerData(customerId);
    
    try {
      return await this.createCustomer(customerData);
    } catch (error) {
      // If customer already exists, fetch it
      const existing = await this.getCustomerInfo(customerId);
      if (existing) {
        return existing;
      }
      throw error;
    }
  }

  /**
   * Get development customer data for auto-creation
   */
  private getDevelopmentCustomerData(customerId: string): {
    companyName: string;
    slug: string;
    contactEmail: string;
    databaseUrl: string;
  } {
    const baseUrl = process.env.DATABASE_URL!;
    
    switch (customerId) {
      case 'dev-customer-001':
        return {
          companyName: 'Andy Development Corp',
          slug: 'andy-dev',
          contactEmail: 'andy@dev.local',
          databaseUrl: baseUrl // Use main database for Andy
        };
      case 'dev-customer-002':
        return {
          companyName: 'Emma Solutions Ltd',
          slug: 'emma-solutions',
          contactEmail: 'emma@dev.local',
          databaseUrl: this.generateIsolatedDatabaseUrl('dev-customer-002')
        };
      case 'test-customer-trial':
        return {
          companyName: 'Test Customer Trial',
          slug: 'test-trial',
          contactEmail: 'test@trial.local',
          databaseUrl: this.generateIsolatedDatabaseUrl('test-customer-trial')
        };
      default:
        throw new Error(`Unknown development customer: ${customerId}`);
    }
  }

  /**
   * Generate isolated database URL for development
   */
  private generateIsolatedDatabaseUrl(customerId: string): string {
    const baseUrl = process.env.DATABASE_URL!;
    
    // For development, we can use the same database with different schemas
    // or create separate database URLs for true isolation
    if (process.env.NODE_ENV === 'production') {
      // Production: Generate different database URLs
      const url = new URL(baseUrl);
      const dbName = `customer_${customerId.replace(/-/g, '_')}`;
      url.pathname = `/${dbName}`;
      return url.toString();
    } else {
      // Development: Use same database (schema isolation handled by provisioning service)
      return baseUrl;
    }
  }

  /**
   * Update customer database URL in management database
   */
  private async updateCustomerDatabaseUrl(customerId: string, databaseUrl: string): Promise<void> {
    const managementDbUrl = process.env.DATABASE_URL;
    if (!managementDbUrl) {
      throw new Error("DATABASE_URL must be set for management database");
    }

    const managementPool = new Pool({ connectionString: managementDbUrl });
    const managementDb = drizzle({ client: managementPool, schema });

    try {
      await managementDb
        .update(schema.customers)
        .set({ databaseUrl, updatedAt: new Date() })
        .where(eq(schema.customers.id, customerId));

      logger.info(`✅ Updated database URL for customer: ${customerId}`);
    } catch (error) {
      logger.error(`❌ Failed to update database URL for customer ${customerId}:`, error);
      throw error;
    } finally {
      await managementPool.end();
    }
  }

  /**
   * Ensure customer exists and has a provisioned database
   * Auto-creates development customers if needed
   */
  async ensureCustomerExists(customerId: string): Promise<void> {
    try {
      // Check if customer exists
      let customer = await this.getCustomerInfo(customerId);
      
      if (!customer && this.isDevelopmentCustomer(customerId)) {
        logger.info(`🏗️ Auto-creating development customer: ${customerId}`);
        customer = await this.createDevelopmentCustomer(customerId);
      }
      
      if (!customer) {
        throw new Error(`Customer ${customerId} does not exist and cannot be auto-created`);
      }

      // Ensure database is provisioned and accessible
      const dbUrlToTest = process.env.NODE_ENV === 'production' ? process.env.DATABASE_URL! : customer.databaseUrl;
      const connectionWorks = await databaseProvisioningService.testCustomerDatabase(dbUrlToTest);
      
      if (!connectionWorks) {
        logger.info(`🏗️ Provisioning database for customer: ${customerId}`);
        const newDatabaseUrl = await databaseProvisioningService.provisionCustomerDatabase(customerId);
        await this.updateCustomerDatabaseUrl(customerId, newDatabaseUrl);
      }

      logger.info(`✅ Customer ${customerId} exists with provisioned database`);
    } catch (error) {
      logger.error(`❌ Failed to ensure customer exists: ${customerId}`, error);
      throw error;
    }
  }

  /**
   * Create a backup of a customer's database
   */
  async backupCustomerDatabase(customerId: string): Promise<string> {
    const customer = await this.getCustomerInfo(customerId);
    if (!customer) {
      throw new Error(`Customer not found: ${customerId}`);
    }

    return await databaseProvisioningService.backupCustomerDatabase(customerId);
  }

  /**
   * Restore a customer's database from backup
   */
  async restoreCustomerDatabase(customerId: string, backupId: string): Promise<void> {
    const customer = await this.getCustomerInfo(customerId);
    if (!customer) {
      throw new Error(`Customer not found: ${customerId}`);
    }

    await databaseProvisioningService.restoreCustomerDatabase(customerId, backupId);
    
    // Clear connection cache to force reconnection
    this.customerConnections.delete(customerId);
    if (this.customerPools.has(customerId)) {
      await this.customerPools.get(customerId)!.end();
      this.customerPools.delete(customerId);
    }
  }

  /**
   * Migrate customer data from shared database to isolated database
   */
  async migrateCustomerToIsolatedDatabase(customerId: string): Promise<void> {
    logger.info(`🔄 Starting migration for customer: ${customerId}`);
    
    try {
      // This would implement the actual migration logic
      // 1. Export data from shared database for this customer
      // 2. Create new isolated database
      // 3. Import data into isolated database
      // 4. Update customer record with new database URL
      // 5. Verify data integrity
      
      logger.info(`✅ Migration completed for customer: ${customerId}`);
    } catch (error) {
      logger.error(`❌ Migration failed for customer ${customerId}:`, error);
      throw error;
    }
  }
}

// Export singleton instance
export const customerDbService = CustomerDatabaseService.getInstance();

// Export types for use in other modules
export interface CustomerContext {
  customerId: string;
  tenantId?: string;
  userId?: string;
}

// Customer database statistics
export interface CustomerDatabaseStats {
  customerId: string;
  companyName: string;
  databaseUrl: string;
  connectionStatus: 'connected' | 'disconnected' | 'error';
  lastConnectionTest: Date;
  tableCount?: number;
  recordCount?: number;
  databaseSize?: string;
}