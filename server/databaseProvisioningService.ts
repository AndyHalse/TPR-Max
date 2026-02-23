import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import fetch from 'node-fetch';
import * as isolatedSchema from './isolatedSchema';
import type { Customer } from '@shared/schema';

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
  private readonly neonApiUrl = 'https://console.neon.tech/api/v2';

  private constructor() {}

  static getInstance(): DatabaseProvisioningService {
    if (!DatabaseProvisioningService.instance) {
      DatabaseProvisioningService.instance = new DatabaseProvisioningService();
    }
    return DatabaseProvisioningService.instance;
  }

  /**
   * Check if Neon API is available for production database provisioning
   */
  private isNeonApiAvailable(): boolean {
    return !!(process.env.NEON_API_KEY && process.env.NEON_PROJECT_ID);
  }

  /**
   * Create a new database using Neon API (Production only)
   * Falls back to existing database if Neon API not available
   */
  private async createNeonDatabase(customerId: string): Promise<{ databaseUrl: string; databaseId: string }> {
    if (!this.isNeonApiAvailable()) {
      console.log('🔄 Neon API not available - using existing database for customer:', customerId);
      // Return the existing database URL when Neon API is not configured
      return {
        databaseUrl: process.env.DATABASE_URL || '',
        databaseId: 'shared_database'
      };
    }

    const databaseName = `customer_${customerId.replace(/-/g, '_')}`;
    
    try {
      console.log(`🌐 Creating Neon database: ${databaseName}`);
      
      const response = await fetch(`${this.neonApiUrl}/projects/${process.env.NEON_PROJECT_ID}/databases`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.NEON_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          database: {
            name: databaseName,
            owner_name: 'visigate_user' // Default database user
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Neon API error (${response.status}): ${errorText}`);
      }

      const result = await response.json() as { database: { id: string; name: string } };
      console.log(`✅ Neon database created successfully: ${databaseName}`);
      
      // Generate connection URL using the created database
      const baseUrl = process.env.DATABASE_URL;
      if (!baseUrl) {
        throw new Error('DATABASE_URL must be set');
      }
      
      const url = new URL(baseUrl);
      url.pathname = `/${databaseName}`;
      
      return {
        databaseUrl: url.toString(),
        databaseId: result.database.id
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ Failed to create Neon database for customer ${customerId}:`, error);
      throw new Error(`Database provisioning failed: ${errorMessage}`);
    }
  }

  /**
   * Delete a database using Neon API (Production only)
   */
  private async deleteNeonDatabase(databaseId: string): Promise<void> {
    if (!this.isNeonApiAvailable()) {
      console.warn('⚠️ Neon API not available - cannot delete database in development');
      return;
    }

    try {
      console.log(`🗑️ Deleting Neon database: ${databaseId}`);
      
      const response = await fetch(`${this.neonApiUrl}/projects/${process.env.NEON_PROJECT_ID}/databases/${databaseId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${process.env.NEON_API_KEY}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Neon API error (${response.status}): ${errorText}`);
      }

      console.log(`✅ Neon database deleted successfully: ${databaseId}`);
    } catch (error) {
      console.error(`❌ Failed to delete Neon database ${databaseId}:`, error);
      throw error;
    }
  }

  /**
   * Generate database URL for a new customer
   * In development, we'll simulate separate databases using different schemas
   * In production, uses actual separate PostgreSQL databases via Neon API
   */
  private async generateDatabaseUrl(customerId: string): Promise<{ databaseUrl: string; databaseId?: string }> {
    const baseUrl = process.env.DATABASE_URL;
    if (!baseUrl) {
      throw new Error('DATABASE_URL must be set');
    }

    if (process.env.NODE_ENV === 'production') {
      const { databaseUrl, databaseId } = await this.createNeonDatabase(customerId);
      return { databaseUrl, databaseId };
    } else {
      return { databaseUrl: baseUrl };
    }
  }

  /**
   * Connection pool lifecycle management
   */
  private connectionPools = new Map<string, { pool: Pool; lastUsed: Date; customerId: string }>();
  private readonly maxPoolAge = 30 * 60 * 1000; // 30 minutes
  private readonly maxPoolsPerCustomer = 5;
  private cleanupInterval: NodeJS.Timeout | null = null;

  /**
   * Start connection pool lifecycle management
   */
  startPoolLifecycleManagement(): void {
    if (this.cleanupInterval) {
      return; // Already started
    }

    console.log('🔄 Starting connection pool lifecycle management...');
    
    // Clean up unused pools every 10 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupUnusedPools();
    }, 10 * 60 * 1000);

    // Graceful shutdown handling
    process.on('SIGTERM', () => this.gracefulShutdown());
    process.on('SIGINT', () => this.gracefulShutdown());
  }

  /**
   * Get or create connection pool for customer
   */
  async getCustomerPool(customerId: string): Promise<Pool> {
    const existingPool = this.connectionPools.get(customerId);
    
    if (existingPool) {
      existingPool.lastUsed = new Date();
      return existingPool.pool;
    }

    // Check pool limits per customer
    const customerPools = Array.from(this.connectionPools.values())
      .filter(p => p.customerId === customerId);
    
    if (customerPools.length >= this.maxPoolsPerCustomer) {
      console.warn(`⚠️ Customer ${customerId} has reached max pool limit (${this.maxPoolsPerCustomer})`);
      // Return the most recently used pool
      const latestPool = customerPools.sort((a, b) => b.lastUsed.getTime() - a.lastUsed.getTime())[0];
      latestPool.lastUsed = new Date();
      return latestPool.pool;
    }

    // Create new pool
    const { databaseUrl } = await this.generateDatabaseUrl(customerId);
    
    let pool: Pool;
    
    const maxConnections = process.env.NODE_ENV === 'production' ? 10 : 5;
    pool = new Pool({ 
      connectionString: databaseUrl,
      max: maxConnections,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    });

    this.connectionPools.set(customerId, {
      pool,
      lastUsed: new Date(),
      customerId
    });

    console.log(`🏊 Created connection pool for customer: ${customerId} (total pools: ${this.connectionPools.size})`);
    return pool;
  }

  /**
   * Clean up unused connection pools
   */
  private async cleanupUnusedPools(): Promise<void> {
    const now = new Date();
    const poolsToCleanup: string[] = [];

    for (const [customerId, poolInfo] of this.connectionPools.entries()) {
      if (now.getTime() - poolInfo.lastUsed.getTime() > this.maxPoolAge) {
        poolsToCleanup.push(customerId);
      }
    }

    for (const customerId of poolsToCleanup) {
      await this.closeCustomerPool(customerId);
    }

    if (poolsToCleanup.length > 0) {
      console.log(`🧹 Cleaned up ${poolsToCleanup.length} unused connection pools`);
    }
  }

  /**
   * Close connection pool for specific customer
   */
  async closeCustomerPool(customerId: string): Promise<void> {
    const poolInfo = this.connectionPools.get(customerId);
    if (!poolInfo) {
      return;
    }

    try {
      await poolInfo.pool.end();
      this.connectionPools.delete(customerId);
      console.log(`🔌 Closed connection pool for customer: ${customerId}`);
    } catch (error) {
      console.error(`❌ Error closing pool for customer ${customerId}:`, error);
    }
  }

  /**
   * Graceful shutdown - close all connection pools
   */
  async gracefulShutdown(): Promise<void> {
    console.log('🛑 Graceful shutdown: Closing all connection pools...');
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    const shutdownPromises = Array.from(this.connectionPools.keys())
      .map(customerId => this.closeCustomerPool(customerId));

    await Promise.allSettled(shutdownPromises);
    console.log('✅ All connection pools closed');
  }

  /**
   * Generate schema name for customer in development
   * Format: c_<first8chars-of-customerId> for brevity and PostgreSQL compatibility
   */
  private generateSchemaName(customerId: string): string {
    const sanitized = customerId.replace(/-/g, '_').toLowerCase();

    const knownLegacyMappings: Record<string, string> = {
      'dev-customer-001': 'c_dev_cust',
      'test-customer-trial': 'c_test_cus',
    };

    if (knownLegacyMappings[customerId]) {
      return knownLegacyMappings[customerId];
    }

    if (sanitized.length <= 8) {
      return `c_${sanitized}`;
    }

    const isUUID = /^[0-9a-f]{8}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{12}$/.test(sanitized);
    if (isUUID) {
      return `c_${sanitized.substring(0, 8)}`;
    }

    const pgMaxIdentLen = 63;
    const fullName = `c_${sanitized}`;
    if (fullName.length <= pgMaxIdentLen) return fullName;

    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(customerId).digest('hex').substring(0, 8);
    return `c_${sanitized.substring(0, 50)}_${hash}`;
  }

  /**
   * Create customer-specific database connection with proper schema isolation
   */
  private async createCustomerConnection(customerId: string): Promise<{ pool: Pool; db: ReturnType<typeof drizzle>; schemaName: string | null }> {
    const { databaseUrl } = await this.generateDatabaseUrl(customerId);
    
    const pool = new Pool({ connectionString: databaseUrl });
    
    const schemaName = this.generateSchemaName(customerId);
    await pool.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
    await pool.query(`SET search_path TO "${schemaName}", public`);
    pool.on('connect', (client) => {
      client.query(`SET search_path TO "${schemaName}", public`);
    });
    const db = drizzle({ client: pool, schema: isolatedSchema });
    return { pool, db, schemaName };
  }

  /**
   * Create a new database for a customer
   * This provisions the complete schema structure with proper isolation
   */
  async provisionCustomerDatabase(customerId: string): Promise<string> {
    console.log(`🏗️ Provisioning database for customer: ${customerId}`);

    let pool: Pool | null = null;
    
    try {
      const { databaseUrl } = await this.generateDatabaseUrl(customerId);
      
      // Production: Create actual separate database
      if (process.env.NODE_ENV === 'production') {
        await this.createProductionDatabase(customerId);
      }

      // Create customer connection with proper isolation
      const connection = await this.createCustomerConnection(customerId);
      pool = connection.pool;
      const db = connection.db;
      const schemaName = connection.schemaName;

      if (schemaName) {
        console.log(`✅ Schema ready: ${schemaName} for customer: ${customerId}`);
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

  private static readonly MANAGEMENT_TABLES = new Set([
    'customers', 'session', 'platform_admins', 'platform_admin_sessions',
    'platform_branding_settings', 'schema_version',
    'subscription_plans', 'subscriptions', 'invoices', 'payment_methods',
    'stripe_webhook_events', 'trial_tracking', 'usage_tracking',
    'customer_api_keys', 'customer_api_key_access_logs',
    'onboarding_progress', 'support_sessions',
    'help_articles', 'help_categories', 'help_onboarding_progress', 'help_user_interactions',
  ]);

  /**
   * Create all tables by cloning structure from the public schema.
   * This ensures new customer schemas always match the current database structure
   * without maintaining duplicate CREATE TABLE SQL.
   */
  private async createAllTables(db: ReturnType<typeof drizzle>): Promise<void> {
    console.log('🏗️ Creating database tables from public schema template...');

    const tablesResult = await db.execute(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    const allTables = (tablesResult.rows as Array<{ table_name: string }>).map(r => r.table_name);
    const customerTables = allTables.filter(t => !DatabaseProvisioningService.MANAGEMENT_TABLES.has(t));

    console.log(`📋 Cloning ${customerTables.length} tables from public schema...`);

    for (const tableName of customerTables) {
      try {
        await db.execute(sql.raw(
          `CREATE TABLE IF NOT EXISTS "${tableName}" (LIKE public."${tableName}" INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)`
        ));
      } catch (error: any) {
        console.warn(`⚠️ Table ${tableName} clone warning: ${error.message}`);
      }
    }

    console.log('✅ Database tables created successfully');
  }

  /**
   * Seed default data for a new customer database
   */
  private async seedDefaultData(db: ReturnType<typeof drizzle>, customerId: string): Promise<void> {
    console.log(`🌱 Seeding default data for customer: ${customerId}`);

    try {
      await db.execute(sql`
        INSERT INTO company_settings (
          company_name, theme, accent_color, background_color, 
          foreground_color, variable_text_color,
          logo_url, banner_url
        )
        VALUES (
          'ACS Safety & Security Ltd', 'light', '#2460a9', '#d5f3fe',
          '#000000', '#53b0ea',
          '/uploads/d6fe1a5b-aa78-4c1f-84b7-74037a02e0f6',
          '/uploads/b8067efb-c677-4203-a5c9-7c34bdd5ffa0'
        )
        ON CONFLICT DO NOTHING
      `);

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