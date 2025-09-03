import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { eq } from 'drizzle-orm';
import ws from "ws";
import * as schema from "@shared/schema";
import type { Customer } from "@shared/schema";

neonConfig.webSocketConstructor = ws;

/**
 * CUSTOMER DATABASE ISOLATION SERVICE
 * 
 * This service manages separate database connections for each customer,
 * ensuring complete data isolation for the SaaS architecture.
 * 
 * Each customer has their own PostgreSQL database with identical schema
 * but completely separate data. This prevents any cross-customer data leakage.
 */
export class CustomerDatabaseService {
  private static instance: CustomerDatabaseService;
  private customerConnections: Map<string, ReturnType<typeof drizzle>> = new Map();
  private customerPools: Map<string, Pool> = new Map();

  private constructor() {}

  static getInstance(): CustomerDatabaseService {
    if (!CustomerDatabaseService.instance) {
      CustomerDatabaseService.instance = new CustomerDatabaseService();
    }
    return CustomerDatabaseService.instance;
  }

  /**
   * Get database connection for a specific customer
   * Creates connection if it doesn't exist
   */
  async getCustomerDatabase(customerId: string): Promise<ReturnType<typeof drizzle>> {
    // Return existing connection if available
    if (this.customerConnections.has(customerId)) {
      return this.customerConnections.get(customerId)!;
    }

    // Ensure customer exists (auto-create for dev customers)
    await this.ensureCustomerExists(customerId);

    // Get customer info from main management database
    const customer = await this.getCustomerInfo(customerId);
    if (!customer) {
      throw new Error(`Customer not found: ${customerId}`);
    }

    // Create new connection pool for this customer
    const pool = new Pool({ connectionString: customer.databaseUrl });
    const db = drizzle({ client: pool, schema });

    // Store connections for reuse
    this.customerPools.set(customerId, pool);
    this.customerConnections.set(customerId, db);

    console.log(`✅ Connected to database for customer: ${customer.companyName} (${customerId})`);
    return db;
  }

  /**
   * Get customer information from the main management database
   * This is the only shared database - it only stores customer metadata
   */
  private async getCustomerInfo(customerId: string): Promise<Customer | null> {
    // Use main management database URL for customer lookups
    const managementDbUrl = process.env.DATABASE_URL;
    if (!managementDbUrl) {
      throw new Error("DATABASE_URL must be set for management database");
    }

    const managementPool = new Pool({ connectionString: managementDbUrl });
    const managementDb = drizzle({ client: managementPool, schema });

    try {
      const customers = await managementDb
        .select()
        .from(schema.customers)
        .where(eq(schema.customers.id, customerId))
        .limit(1);

      await managementPool.end(); // Close management connection
      return customers[0] || null;
    } catch (error) {
      await managementPool.end();
      console.error(`Error fetching customer info: ${error}`);
      return null;
    }
  }

  /**
   * Create a new customer with their own database
   * This will be called during customer onboarding
   */
  async createCustomer(customerData: {
    companyName: string;
    slug: string;
    contactEmail: string;
    databaseUrl: string;
  }): Promise<Customer> {
    const managementDbUrl = process.env.DATABASE_URL;
    if (!managementDbUrl) {
      throw new Error("DATABASE_URL must be set for management database");
    }

    const managementPool = new Pool({ connectionString: managementDbUrl });
    const managementDb = drizzle({ client: managementPool, schema });

    try {
      // Insert new customer into management database
      const [newCustomer] = await managementDb
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

      await managementPool.end();

      console.log(`✅ Created new customer: ${customerData.companyName} (${newCustomer.id})`);
      return newCustomer;
    } catch (error) {
      await managementPool.end();
      throw new Error(`Failed to create customer: ${error}`);
    }
  }

  /**
   * Get all active customers (for management/admin purposes)
   */
  async getAllCustomers(): Promise<Customer[]> {
    const managementDbUrl = process.env.DATABASE_URL;
    if (!managementDbUrl) {
      throw new Error("DATABASE_URL must be set for management database");
    }

    const managementPool = new Pool({ connectionString: managementDbUrl });
    const managementDb = drizzle({ client: managementPool, schema });

    try {
      const customers = await managementDb
        .select()
        .from(schema.customers)
        .where(eq(schema.customers.isActive, true));

      await managementPool.end();
      return customers;
    } catch (error) {
      await managementPool.end();
      throw new Error(`Failed to fetch customers: ${error}`);
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
   * TEMPORARY: Get database for development customer
   * This allows the current app to work while we implement full customer onboarding
   */
  async getDevelopmentCustomerDatabase(): Promise<ReturnType<typeof drizzle>> {
    // Use the current DATABASE_URL as the development customer's database
    const devDbUrl = process.env.DATABASE_URL;
    if (!devDbUrl) {
      throw new Error("DATABASE_URL must be set");
    }

    // Create a temporary development customer ID
    const DEV_CUSTOMER_ID = 'dev-customer-001';
    
    // Check if development customer already has a connection
    if (this.customerConnections.has(DEV_CUSTOMER_ID)) {
      return this.customerConnections.get(DEV_CUSTOMER_ID)!;
    }

    // Create connection for development customer
    const pool = new Pool({ connectionString: devDbUrl });
    const db = drizzle({ client: pool, schema });

    this.customerPools.set(DEV_CUSTOMER_ID, pool);
    this.customerConnections.set(DEV_CUSTOMER_ID, db);

    console.log(`✅ Connected to development customer database: ${DEV_CUSTOMER_ID}`);
    return db;
  }

  /**
   * TEMPORARY: Auto-create missing development customers
   */
  async ensureCustomerExists(customerId: string): Promise<void> {
    try {
      // Check if customer exists
      const customer = await this.getCustomerInfo(customerId);
      if (customer) {
        return; // Customer already exists
      }

      // Auto-create missing development customers
      if (customerId === 'dev-customer-001') {
        await this.createCustomer({
          companyName: "VisiGate Demo (Andy)",
          slug: "visigate-demo-andy",
          contactEmail: "andy@visigate.pro",
          databaseUrl: process.env.DATABASE_URL!,
        });
        console.log(`✅ Auto-created customer: ${customerId}`);
      } else if (customerId === 'dev-customer-002') {
        await this.createCustomer({
          companyName: "VisiGate Demo (Emma)",
          slug: "visigate-demo-emma",
          contactEmail: "emma@visigate.pro",
          databaseUrl: process.env.DATABASE_URL!,
        });
        console.log(`✅ Auto-created customer: ${customerId}`);
      } else {
        throw new Error(`Unknown development customer: ${customerId}`);
      }
    } catch (error) {
      console.error(`Failed to ensure customer exists: ${customerId}`, error);
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