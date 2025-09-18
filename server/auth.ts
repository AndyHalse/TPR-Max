import bcrypt from 'bcryptjs';
import type { Request, Response, NextFunction } from 'express';
import type { User, Customer } from '@shared/schema';
import { storage } from './storage';
import { CustomerDatabaseService } from './customerDatabase';
import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { eq, sql } from 'drizzle-orm';
import * as schema from '@shared/schema';
import * as isolatedSchema from './isolatedSchema';

// Extend session interface
declare module 'express-session' {
  interface SessionData {
    userId?: string;
    customerId?: string;
    companyName?: string;
  }
}

// Extend Request interface to include user and customer context
declare global {
  namespace Express {
    interface Request {
      user?: User;
      customer?: Customer;
      customerId?: string;
    }
  }
}

export class AuthService {
  /**
   * Hash a password using bcrypt
   */
  static async hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    return bcrypt.hash(password, saltRounds);
  }

  /**
   * Verify a password against a hash
   */
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * 3-Field Authentication: Company Name + Username + Password
   * This provides proper SaaS customer isolation by routing to the correct customer database
   */
  static async authenticateUser(companyName: string, username: string, password: string): Promise<{ user: User; customer: Customer } | null> {
    try {
      console.log(`🔐 3-Field Auth attempt: Company="${companyName}", Username="${username}"`);
      
      // Step 1: Lookup customer by company name (case-insensitive)
      const customer = await this.lookupCustomerByCompanyName(companyName);
      if (!customer) {
        console.log(`❌ Company not found: "${companyName}"`);
        return null;
      }
      
      console.log(`✅ Found customer: ${customer.companyName} (ID: ${customer.id})`);
      
      // Step 2: Get customer's isolated database connection
      const customerDbService = CustomerDatabaseService.getInstance();
      const customerDb = await customerDbService.getCustomerDatabase(customer.id);
      
      // Step 3: Authenticate user in customer's database
      const user = await this.authenticateUserInCustomerDatabase(customerDb, username, password);
      if (!user) {
        console.log(`❌ User authentication failed in customer database: "${username}"`);
        return null;
      }
      
      console.log(`✅ User authenticated successfully: ${username} for ${customer.companyName}`);
      return { user, customer };
      
    } catch (error) {
      console.error('🚨 3-Field authentication error:', error);
      return null;
    }
  }

  /**
   * Legacy 2-field authentication (for backward compatibility during transition)
   * @deprecated Use authenticateUser(companyName, username, password) instead
   */
  static async authenticateUserLegacy(username: string, password: string): Promise<User | null> {
    try {
      const user = await storage.getUserByUsername(username);
      if (!user) {
        return null;
      }

      const isValid = await this.verifyPassword(password, user.password);
      if (!isValid) {
        return null;
      }

      return user;
    } catch (error) {
      console.error('Legacy authentication error:', error);
      return null;
    }
  }

  /**
   * Lookup customer by company name (case-insensitive)
   * Uses existing working database connection instead of creating new Pool
   */
  private static async lookupCustomerByCompanyName(companyName: string): Promise<Customer | null> {
    try {
      // Import the working database connection instead of creating a new Pool
      const { db } = await import('./db');
      
      console.log(`🔍 Looking up customer: "${companyName}" using working database connection`);
      
      // Case-insensitive search for company name
      const customers = await db
        .select()
        .from(schema.customers)
        .where(sql`LOWER(${schema.customers.companyName}) = LOWER(${companyName})`)
        .limit(1);

      const customer = customers[0] || null;
      console.log(customer ? `✅ Found customer: ${customer.companyName} (ID: ${customer.id})` : `❌ Customer not found: "${companyName}"`);
      
      return customer;
    } catch (error) {
      console.error(`🚨 Error looking up customer by company name: ${error}`);
      return null;
    }
  }

  /**
   * Authenticate user within a specific customer's database
   */
  private static async authenticateUserInCustomerDatabase(
    customerDb: ReturnType<typeof drizzle>, 
    username: string, 
    password: string
  ): Promise<User | null> {
    try {
      // Query the customer's isolated database for the user
      const users = await customerDb
        .select()
        .from(isolatedSchema.users)
        .where(eq(isolatedSchema.users.username, username))
        .limit(1);

      const user = users[0];
      if (!user) {
        return null;
      }

      const isValid = await this.verifyPassword(password, user.password);
      if (!isValid) {
        return null;
      }

      return user as User;
    } catch (error) {
      console.error('Error authenticating user in customer database:', error);
      return null;
    }
  }

  /**
   * Ensure development customers exist in the database
   */
  private static async ensureCustomersExist(): Promise<void> {
    try {
      const { db } = await import('./db');
      console.log('🔧 Ensuring development customers exist...');

      // Customer data for development
      const developmentCustomers = [
        {
          id: 'dev-customer-001',
          companyName: 'Development Customer',
          slug: 'development-customer',
          adminEmail: 'admin@devcustomer.com',
          subscriptionPlan: 'development' as any,
          subscriptionStatus: 'active' as any,
          databaseUrl: process.env.DATABASE_URL || '',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'dev-customer-002',
          companyName: 'Customer Two',
          slug: 'customer-two',
          adminEmail: 'admin@customer2.com',
          subscriptionPlan: 'development' as any,
          subscriptionStatus: 'active' as any,
          databaseUrl: process.env.DATABASE_URL || '',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'test-customer-trial',
          companyName: 'Test Trial Customer',
          slug: 'test-trial-customer',
          adminEmail: 'admin@testtrial.com',
          subscriptionPlan: 'trial' as any,
          subscriptionStatus: 'active' as any,
          databaseUrl: process.env.DATABASE_URL || '',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      for (const customerData of developmentCustomers) {
        // Check if customer exists
        const existing = await db
          .select()
          .from(schema.customers)
          .where(eq(schema.customers.id, customerData.id))
          .limit(1);

        if (!existing[0]) {
          // Create customer
          await db
            .insert(schema.customers)
            .values(customerData)
            .onConflictDoNothing();
          console.log(`✅ Created customer: ${customerData.companyName}`);
        } else {
          console.log(`✅ Customer already exists: ${customerData.companyName}`);
        }
      }
    } catch (error) {
      console.error('❌ Error ensuring customers exist:', error);
      throw error;
    }
  }

  /**
   * Initialize developer users and customers for testing multi-customer isolation
   * Only runs in development/test environments for security
   */
  static async initializeDeveloperUser(): Promise<void> {
    // Only initialize dev users in development/test environments
    if (process.env.NODE_ENV === 'production') {
      return;
    }
    
    try {
      // First ensure the customers exist
      await this.ensureCustomersExist();
      
      console.log('🔧 Initializing developer users...');
      // Get passwords from environment variables - no fallbacks in production
      const andyPassword = process.env.DEV_ANDY_PASSWORD || 'Kubo1966&&';
      const emmaPassword = process.env.DEV_EMMA_PASSWORD || 'Kubo1976&&';

      // Initialize Andy (Customer 001)
      const existingAndy = await storage.getUserByUsername('Andy');
      
      if (existingAndy) {
        console.log('Developer user "Andy" already exists - updating credentials');
        // updateUser will handle password hashing automatically
        await storage.updateUser(existingAndy.id, { password: andyPassword });
        console.log('Developer user credentials updated successfully');
      } else {
        await storage.createUser({
          username: 'Andy',
          password: andyPassword,
          customerId: 'dev-customer-001'
        } as any);
        console.log('Developer user "Andy" created successfully');
      }

      // Initialize Emma (Customer 002) for testing customer isolation
      const existingEmma = await storage.getUserByUsername('Emma');
      
      if (existingEmma) {
        console.log('Developer user "Emma" already exists - updating credentials');
        // updateUser will handle password hashing automatically
        await storage.updateUser(existingEmma.id, { password: emmaPassword });
        console.log('Emma user credentials updated successfully');
      } else {
        await storage.createUser({
          username: 'Emma',
          password: emmaPassword,
          customerId: 'dev-customer-002'
        } as any);
        console.log('✅ Developer user "Emma" created successfully for Customer 002 testing');
      }

      // Initialize TestUser for free onboarding testing without subscription
      const testPassword = process.env.TEST_USER_PASSWORD || 'TestUser2024!';
      const existingTestUser = await storage.getUserByUsername('TestUser');
      
      if (existingTestUser) {
        console.log('Test user "TestUser" already exists - updating credentials');
        // updateUser will handle password hashing automatically
        await storage.updateUser(existingTestUser.id, { password: testPassword });
        console.log('Test user credentials updated successfully');
      } else {
        await storage.createUser({
          username: 'TestUser',
          password: testPassword, // createUser should handle hashing
          customerId: 'test-customer-trial'
        } as any);
        console.log('✅ Test user "TestUser" created successfully for free trial testing');
      }
    } catch (error) {
      console.error('Failed to initialize developer users:', error);
    }
  }
}

/**
 * Middleware to check if user is authenticated with proper tenant context
 * PRODUCTION SECURITY: Enforces BOTH userId AND customerId for complete SaaS isolation
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session || !req.session.userId || !req.session.customerId) {
    console.log('🚨 SECURITY: requireAuth failed - missing tenant context:', {
      hasSession: !!req.session,
      hasUserId: !!(req.session && req.session.userId),
      hasCustomerId: !!(req.session && req.session.customerId),
      sessionId: req.session ? req.sessionID : 'none'
    });
    return res.status(401).json({ error: 'Authentication required - proper tenant context missing' });
  }
  
  // Log successful authentication with tenant context
  console.log('✅ SECURITY: requireAuth passed - tenant context verified:', {
    userId: req.session.userId,
    customerId: req.session.customerId,
    sessionId: req.sessionID
  });
  
  next();
}

/**
 * Middleware to load user from session using customer-specific database
 */
export async function loadUser(req: Request, res: Response, next: NextFunction) {
  if (req.session && req.session.userId && req.session.customerId) {
    try {
      // Use customer-specific database to load user
      const customerDbService = CustomerDatabaseService.getInstance();
      const customerDb = await customerDbService.getCustomerDatabase(req.session.customerId);
      
      const users = await customerDb
        .select()
        .from(isolatedSchema.users)
        .where(eq(isolatedSchema.users.id, req.session.userId))
        .limit(1);
      
      if (users[0]) {
        req.user = users[0] as any;
        req.customerId = req.session.customerId;
      }
    } catch (error) {
      console.error('Failed to load user from customer-specific session:', error);
    }
  }
  next();
}