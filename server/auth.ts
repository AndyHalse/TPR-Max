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
   */
  private static async lookupCustomerByCompanyName(companyName: string): Promise<Customer | null> {
    const managementDbUrl = process.env.DATABASE_URL;
    if (!managementDbUrl) {
      throw new Error("DATABASE_URL must be set for management database");
    }

    const managementPool = new Pool({ connectionString: managementDbUrl });
    const managementDb = drizzle({ client: managementPool, schema });

    try {
      // Case-insensitive search for company name
      const customers = await managementDb
        .select()
        .from(schema.customers)
        .where(sql`LOWER(${schema.customers.companyName}) = LOWER(${companyName})`)
        .limit(1);

      await managementPool.end();
      return customers[0] || null;
    } catch (error) {
      await managementPool.end();
      console.error(`Error looking up customer by company name: ${error}`);
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
   * Initialize developer users for testing multi-customer isolation
   * Only runs in development/test environments for security
   */
  static async initializeDeveloperUser(): Promise<void> {
    // Only initialize dev users in development/test environments
    if (process.env.NODE_ENV === 'production') {
      return;
    }
    
    try {
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
 * Middleware to check if user is authenticated
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

/**
 * Middleware to load user from session
 */
export async function loadUser(req: Request, res: Response, next: NextFunction) {
  if (req.session && req.session.userId) {
    try {
      const user = await storage.getUser(req.session.userId);
      if (user) {
        req.user = user;
      }
    } catch (error) {
      console.error('Failed to load user from session:', error);
    }
  }
  next();
}