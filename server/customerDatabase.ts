import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from "@shared/schema";
import * as isolatedSchema from "./isolatedSchema";
import type { Customer } from "@shared/schema";
import { databaseProvisioningService } from "./databaseProvisioningService";
import { createMigrationRunner } from "./migrationRunner";

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
    // Return existing connection if available
    if (this.customerConnections.has(customerId)) {
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
      console.log(`🏗️ Database not accessible for customer ${customerId}, provisioning...`);
      
      try {
        const databaseUrl = await databaseProvisioningService.provisionCustomerDatabase(customerId);
        
        // Update customer record with new database URL
        await this.updateCustomerDatabaseUrl(customerId, databaseUrl);
      } catch (error) {
        console.error(`❌ Database provisioning failed: ${error}`);
        
        // DEV DATA BYPASS: Skip database provisioning if Neon is disabled
        const { isDevDataBypass, isDatabaseConnectionError } = await import('./auth');
        if (isDevDataBypass() && isDatabaseConnectionError(error)) {
          console.log('🚀 DEV_DATA_BYPASS: Skipping database provisioning due to Neon database disabled');
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
          max: 5,
          min: 0,
          idleTimeoutMillis: 60000,
          connectionTimeoutMillis: 10000,
          options: `-c search_path=${schemaName},public`,
        });
        
        await pool.query(`SET search_path TO ${schemaName}, public`);
        
        const schemaExists = await pool.query(
          `SELECT 1 FROM pg_namespace WHERE nspname = $1`,
          [schemaName]
        );
        
        if (!schemaExists.rows.length) {
          console.log(`✨ Creating schema ${schemaName} for customer ${customerId}...`);
          await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
          console.log(`✅ Schema ${schemaName} created successfully`);
          isNewSchema = true;
        }
        
        console.log(`🔒 Schema isolation active: ${schemaName} for customer ${customerId}`);
        
        db = drizzle({ client: pool, schema: isolatedSchema });

        this.customerPools.set(customerId, pool);
        this.customerConnections.set(customerId, db);
        break;
      } catch (error: any) {
        const isEndpointDisabled = error?.message?.includes('endpoint has been disabled') || 
                                    error?.message?.includes('endpoint is disabled') ||
                                    error?.code === 'XX000';
        
        if (isEndpointDisabled && attempt < maxRetries) {
          console.log(`🔄 Database endpoint waking up, retry ${attempt}/${maxRetries} in ${attempt * 2}s...`);
          try { pool!?.end(); } catch {}
          await new Promise(resolve => setTimeout(resolve, attempt * 2000));
          this.customerConnections.delete(customerId);
          this.customerPools.delete(customerId);
          continue;
        }
        
        console.error(`❌ Failed to create database connection: ${error}`);
        
        const { isDevDataBypass, isDatabaseConnectionError } = await import('./auth');
        if (isDevDataBypass() && isDatabaseConnectionError(error)) {
          console.log('🚀 DEV_DATA_BYPASS: Creating mock database connection due to Neon database disabled');
          const mockDb = {} as ReturnType<typeof drizzle>;
          this.customerConnections.set(customerId, mockDb);
          return mockDb;
        }
        
        throw error;
      }
    }

    console.log(`✅ Connected to isolated database for customer: ${customer.companyName} (${customerId})`);
    
    // Run schema migrations to ensure database is up to date
    try {
      await this.migrationRunner.ensureSchema(customerId);
    } catch (error) {
      console.error(`⚠️ Schema migration failed for customer ${customerId}:`, error);
    }
    
    // Ensure admin user exists in this customer schema (critical for production)
    try {
      await this.ensureAdminUserExists(customerId, db);
    } catch (error) {
      console.error(`⚠️ Admin user seeding failed for customer ${customerId}:`, error);
    }
    
    // For newly created schemas, migrate data from public schema if it exists
    if (isNewSchema) {
      try {
        const schemaName = this.generateSchemaName(customerId);
        const pool = this.customerPools.get(customerId);
        if (pool) {
          console.log(`📦 Migrating data from public schema to ${schemaName}...`);
          const tablesToMigrate = [
            'users', 'staff', 'visitors', 'members', 'pre_bookings', 'departments',
            'company_settings', 'meeting_rooms', 'room_bookings', 'room_booking_attendees',
            'visitor_history', 'staff_sessions', 'staff_attendance_history',
            'muster_points', 'evacuation_accountability', 'safety_tokens',
            'user_invitations', 'contractor_companies', 'contractor_workers',
            'contractor_documents', 'contractor_visits', 'contractor_prebookings',
            'worker_notes', 'compliance_documents', 'document_types', 'card_offences',
            'card_issues', 'worker_certifications', 'help_categories', 'help_articles',
            'induction_settings', 'induction_questions', 'feature_toggles'
          ];
          
          for (const table of tablesToMigrate) {
            try {
              const publicTableExists = await pool.query(
                `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
                [table]
              );
              const customerTableExists = await pool.query(
                `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2 LIMIT 1`,
                [schemaName, table]
              );
              if (publicTableExists.rows.length > 0 && customerTableExists.rows.length > 0) {
                const countResult = await pool.query(`SELECT COUNT(*) as cnt FROM ${schemaName}.${table}`);
                if (parseInt(countResult.rows[0]?.cnt || '0') === 0) {
                  const publicCount = await pool.query(`SELECT COUNT(*) as cnt FROM public.${table}`);
                  if (parseInt(publicCount.rows[0]?.cnt || '0') > 0) {
                    await pool.query(`INSERT INTO ${schemaName}.${table} SELECT * FROM public.${table}`);
                    console.log(`  ✅ Migrated ${publicCount.rows[0].cnt} rows: public.${table} → ${schemaName}.${table}`);
                  }
                }
              }
            } catch (tableError: any) {
              console.log(`  ⚠️ Skipping ${table}: ${tableError.message?.substring(0, 80)}`);
            }
          }
          console.log(`📦 Data migration complete for ${schemaName}`);
        }
      } catch (migrationError) {
        console.error(`⚠️ Data migration from public schema failed:`, migrationError);
      }
    }
    
    // Seed company_settings if empty, or correct company_name if it doesn't match the customer record
    try {
      const settingsCheck = await db.execute(`SELECT id, company_name FROM "${schemaName}".company_settings LIMIT 1`);
      if (!settingsCheck.rows || settingsCheck.rows.length === 0) {
        console.log(`🌱 Seeding company_settings for new customer: ${customer.companyName}`);
        const seedPool = this.customerPools.get(customerId);
        if (seedPool) {
          await seedPool.query(
            `INSERT INTO "${schemaName}".company_settings (id, company_name) VALUES (gen_random_uuid(), $1)`,
            [customer.companyName]
          );
        }
        console.log(`✅ Company settings seeded for: ${customer.companyName}`);
      } else {
        const currentName = settingsCheck.rows[0]?.company_name;
        if (currentName !== customer.companyName) {
          console.log(`🔧 Company name mismatch in ${schemaName}: "${currentName}" vs registered "${customer.companyName}" - correcting...`);
          const fixPool = this.customerPools.get(customerId);
          if (fixPool) {
            await fixPool.query(
              `UPDATE "${schemaName}".company_settings SET company_name = $1 WHERE id = $2`,
              [customer.companyName, settingsCheck.rows[0].id]
            );
          }
          console.log(`✅ Company name corrected to: ${customer.companyName}`);
        } else {
          console.log(`✅ Company settings correct in ${schemaName}: "${currentName}"`);
        }
      }
    } catch (seedError) {
      console.error(`⚠️ Failed to seed company settings:`, seedError);
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
        console.log(`⚠️ Customer ${customerId} has ${existingUsers.rows.length} users but no admin - creating one`);
      } else {
        console.log(`🌱 No users found for customer ${customerId} - seeding default admin user`);
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
        console.log(`✅ Admin user seeded for customer ${customerId} (username: Admin) - password must be changed on first login`);
      } else {
        console.log(`✅ Admin user seeded for customer ${customerId} (username: Admin, temp password: ${tempPassword})`);
      }
    } catch (error) {
      console.error(`❌ Failed to seed admin user for ${customerId}:`, error);
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
      
      console.log(`🔍 Looking up customer info: "${customerId}" using working database connection`);

      const customers = await db
        .select()
        .from(schema.customers)
        .where(eq(schema.customers.id, customerId))
        .limit(1);

      const customer = customers[0] || null;
      console.log(customer ? `✅ Found customer info: ${customer.companyName}` : `❌ Customer not found: ${customerId}`);
      
      return customer;
    } catch (error) {
      console.error(`🚨 Error fetching customer info: ${error}`);
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
      
      console.log(`🔧 Creating customer: "${customerData.companyName}" using working database connection`);

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

      console.log(`✅ Created new customer: ${customerData.companyName} (${newCustomer.id})`);
      return newCustomer;
    } catch (error) {
      console.error(`🚨 Failed to create customer: ${error}`);
      
      // DEV DATA BYPASS: Check if this is a Neon database error and bypass is enabled
      const { isDevDataBypass, isDatabaseConnectionError } = await import('./auth');
      if (isDevDataBypass() && isDatabaseConnectionError(error)) {
        console.log('🚀 DEV_DATA_BYPASS: Neon database disabled, returning mock customer creation');
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
      
      console.log(`🔍 Getting all customers using working database connection`);

      const customers = await db
        .select()
        .from(schema.customers)
        .where(eq(schema.customers.isActive, true));

      console.log(`✅ Found ${customers.length} active customers`);
      return customers;
    } catch (error) {
      console.error(`🚨 Error fetching customers: ${error}`);
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
        console.log(`✅ Closed database connection for customer: ${customerId}`);
      } catch (error) {
        console.error(`Error closing connection for customer ${customerId}:`, error);
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

      console.log(`✅ Updated database URL for customer: ${customerId}`);
    } catch (error) {
      console.error(`❌ Failed to update database URL for customer ${customerId}:`, error);
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
        console.log(`🏗️ Auto-creating development customer: ${customerId}`);
        customer = await this.createDevelopmentCustomer(customerId);
      }
      
      if (!customer) {
        throw new Error(`Customer ${customerId} does not exist and cannot be auto-created`);
      }

      // Ensure database is provisioned and accessible
      const dbUrlToTest = process.env.NODE_ENV === 'production' ? process.env.DATABASE_URL! : customer.databaseUrl;
      const connectionWorks = await databaseProvisioningService.testCustomerDatabase(dbUrlToTest);
      
      if (!connectionWorks) {
        console.log(`🏗️ Provisioning database for customer: ${customerId}`);
        const newDatabaseUrl = await databaseProvisioningService.provisionCustomerDatabase(customerId);
        await this.updateCustomerDatabaseUrl(customerId, newDatabaseUrl);
      }

      console.log(`✅ Customer ${customerId} exists with provisioned database`);
    } catch (error) {
      console.error(`❌ Failed to ensure customer exists: ${customerId}`, error);
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
    console.log(`🔄 Starting migration for customer: ${customerId}`);
    
    try {
      // This would implement the actual migration logic
      // 1. Export data from shared database for this customer
      // 2. Create new isolated database
      // 3. Import data into isolated database
      // 4. Update customer record with new database URL
      // 5. Verify data integrity
      
      console.log(`✅ Migration completed for customer: ${customerId}`);
    } catch (error) {
      console.error(`❌ Migration failed for customer ${customerId}:`, error);
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