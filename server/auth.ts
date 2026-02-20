import bcrypt from 'bcryptjs';
import type { Request, Response, NextFunction } from 'express';
import type { User, Customer } from '@shared/schema';
import { storage } from './storage';
import { CustomerDatabaseService } from './customerDatabase';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, sql } from 'drizzle-orm';
import * as schema from '@shared/schema';
import * as isolatedSchema from './isolatedSchema';

// Dev Auth Bypass - centralized development authentication
export function isDevAuthBypass(): boolean {
  // SECURITY: Force disable in production environment
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  
  // Only enable in development with explicit flag
  return process.env.NODE_ENV === 'development' && process.env.DEV_AUTH_BYPASS === 'true';
}

// Dev Data Bypass - centralized development data bypass
export function isDevDataBypass(): boolean {
  // SECURITY: Force disable in production environment
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  
  // Only enable in development with explicit flag
  return process.env.NODE_ENV === 'development' && process.env.DEV_DATA_BYPASS === 'true';
}

// Check if an error is related to database connectivity issues
export function isDatabaseConnectionError(error: any): boolean {
  const errorMessage = error?.message || error?.toString() || '';
  return errorMessage.includes('connection') ||
         errorMessage.includes('Failed to create customer') ||
         errorMessage.includes('Error fetching customer info') ||
         errorMessage.includes('database');
}

export function getDevUser() {
  // SECURITY: Force disable in production environment
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Development user access disabled in production');
  }
  
  if (!isDevAuthBypass()) {
    throw new Error('Development user access disabled');
  }
  
  return {
    id: 'dev-user-andy',
    username: 'Andy',
    customerId: 'dev-customer-001',
    companyName: 'Development Customer'
  };
}

export function isValidDevCredentials(company: string, username: string, password: string): boolean {
  // SECURITY: Force disable in production environment
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  
  // Only allow in development with explicit bypass enabled
  if (!isDevAuthBypass()) {
    return false;
  }
  
  return company === 'Development Customer' && 
         username === 'Andy' && 
         password === 'Kubo1966&&';
}

// Mock Data Generation Functions for Development Bypass
export function getMockDepartmentAnalytics() {
  console.log('🚀 DEV_DATA_BYPASS: Returning mock department analytics');
  return [
    { department: 'Engineering', count: 12, checkedIn: 8 },
    { department: 'Operations', count: 15, checkedIn: 11 },
    { department: 'Safety', count: 6, checkedIn: 4 },
    { department: 'Management', count: 8, checkedIn: 6 },
    { department: 'Contractors', count: 22, checkedIn: 18 }
  ];
}

export function getMockPeakHoursAnalytics() {
  console.log('🚀 DEV_DATA_BYPASS: Returning mock peak hours analytics');
  return [
    { hour: '08:00', checkIns: 15, checkOuts: 2 },
    { hour: '09:00', checkIns: 23, checkOuts: 1 },
    { hour: '10:00', checkIns: 8, checkOuts: 3 },
    { hour: '11:00', checkIns: 5, checkOuts: 1 },
    { hour: '12:00', checkIns: 3, checkOuts: 8 },
    { hour: '13:00', checkIns: 7, checkOuts: 2 },
    { hour: '14:00', checkIns: 4, checkOuts: 1 },
    { hour: '15:00', checkIns: 2, checkOuts: 3 },
    { hour: '16:00', checkIns: 1, checkOuts: 12 },
    { hour: '17:00', checkIns: 0, checkOuts: 18 }
  ];
}

export function getMockCheckedInStaff() {
  console.log('🚀 DEV_DATA_BYPASS: Returning mock checked-in staff');
  return [
    {
      id: 'staff-001',
      firstName: 'John',
      lastName: 'Smith',
      department: 'Engineering',
      isCheckedIn: true,
      checkedInAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      email: 'john.smith@company.com'
    },
    {
      id: 'staff-002',
      firstName: 'Sarah',
      lastName: 'Johnson',
      department: 'Operations',
      isCheckedIn: true,
      checkedInAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
      email: 'sarah.johnson@company.com'
    },
    {
      id: 'staff-003',
      firstName: 'Mike',
      lastName: 'Wilson',
      department: 'Safety',
      isCheckedIn: true,
      checkedInAt: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
      email: 'mike.wilson@company.com'
    }
  ];
}

export function getMockCheckedInContractors() {
  console.log('🚀 DEV_DATA_BYPASS: Returning mock checked-in contractors');
  return [
    {
      id: 'contractor-001',
      firstName: 'David',
      lastName: 'Brown',
      companyName: 'ABC Construction',
      cscsStatus: 'CLEAR - COMPLIANT',
      isCheckedIn: true,
      checkedInAt: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
      department: 'Contractors',
      inductionCompleted: true,
      transportMethod: 'car'
    },
    {
      id: 'contractor-002',
      firstName: 'Lisa',
      lastName: 'Garcia',
      companyName: 'XYZ Engineering',
      cscsStatus: 'CLEAR - COMPLIANT',
      isCheckedIn: true,
      checkedInAt: new Date(Date.now() - 1.5 * 60 * 60 * 1000), // 1.5 hours ago
      department: 'Contractors',
      inductionCompleted: true,
      transportMethod: 'public_transport'
    },
    {
      id: 'contractor-003',
      firstName: 'Robert',
      lastName: 'Chen',
      companyName: 'Tech Solutions Ltd',
      cscsStatus: 'CLEAR - COMPLIANT',
      isCheckedIn: true,
      checkedInAt: new Date(Date.now() - 45 * 60 * 1000), // 45 minutes ago
      department: 'Contractors',
      inductionCompleted: true,
      transportMethod: 'bicycle'
    }
  ];
}

export function getMockCurrentVisitors() {
  console.log('🚀 DEV_DATA_BYPASS: Returning mock current visitors');
  return [
    {
      id: 'visitor-001',
      firstName: 'Emma',
      lastName: 'Thompson',
      company: 'Client Corp',
      hostName: 'John Smith',
      purpose: 'Business Meeting',
      isCheckedIn: true,
      checkedInAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
      expectedCheckOut: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
      badgeNumber: 'V001'
    },
    {
      id: 'visitor-002',
      firstName: 'James',
      lastName: 'Wilson',
      company: 'Supplier Inc',
      hostName: 'Sarah Johnson',
      purpose: 'Site Inspection',
      isCheckedIn: true,
      checkedInAt: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
      expectedCheckOut: new Date(Date.now() + 3 * 60 * 60 * 1000), // 3 hours from now
      badgeNumber: 'V002'
    }
  ];
}

export function getMockRecentActivity() {
  console.log('🚀 DEV_DATA_BYPASS: Returning mock recent activity');
  return [
    {
      id: 'activity-001',
      type: 'checkin',
      name: 'Robert Chen',
      timestamp: new Date(Date.now() - 45 * 60 * 1000),
      description: 'Contractor check-in: Tech Solutions Ltd'
    },
    {
      id: 'activity-002',
      type: 'checkin',
      name: 'Emma Thompson',
      timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000),
      description: 'Visitor check-in: Client Corp'
    },
    {
      id: 'activity-003',
      type: 'checkout',
      name: 'Mark Davis',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
      description: 'Staff check-out: Engineering'
    },
    {
      id: 'activity-004',
      type: 'staff_added',
      name: 'System',
      timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000),
      description: 'New staff member added: Alice Cooper'
    }
  ];
}

export function getMockCompanyStats() {
  console.log('🚀 DEV_DATA_BYPASS: Returning mock company stats');
  return {
    currentVisitors: 2,
    todayCheckIns: 15,
    staffOnSite: 18,
    averageVisitDuration: 145, // minutes
    totalStaff: 42,
    totalDepartments: 5
  };
}

export function getMockCompanySettings() {
  console.log('🚀 DEV_DATA_BYPASS: Returning mock company settings');
  return {
    id: 'settings-001',
    companyName: 'Development Corporation',
    maxVisitors: 50,
    workingHours: '08:00-17:00',
    emergencyContact: '+44 123 456 7890',
    allowedFileTypes: ['pdf', 'jpg', 'png'],
    autoCheckoutHours: 24,
    requireInduction: true,
    enableBadgePrinting: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date()
  };
}

export function getMockTodaysVisitors() {
  console.log('🚀 DEV_DATA_BYPASS: Returning mock today\'s visitors');
  return [
    {
      id: 'visitor-001',
      firstName: 'Emma',
      lastName: 'Thompson',
      company: 'Client Corp',
      hostName: 'John Smith',
      purpose: 'Business Meeting',
      isCheckedIn: true,
      checkedInAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
      expectedCheckOut: new Date(Date.now() + 2 * 60 * 60 * 1000),
      badgeNumber: 'V001',
      createdAt: new Date()
    },
    {
      id: 'visitor-002',
      firstName: 'James',
      lastName: 'Wilson',
      company: 'Supplier Inc',
      hostName: 'Sarah Johnson',
      purpose: 'Site Inspection',
      isCheckedIn: true,
      checkedInAt: new Date(Date.now() - 30 * 60 * 1000),
      expectedCheckOut: new Date(Date.now() + 3 * 60 * 60 * 1000),
      badgeNumber: 'V002',
      createdAt: new Date()
    },
    {
      id: 'visitor-003',
      firstName: 'Michael',
      lastName: 'Davis',
      company: 'Tech Partners',
      hostName: 'Mike Wilson',
      purpose: 'Delivery',
      isCheckedIn: false,
      checkedInAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
      checkedOutAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      badgeNumber: 'V003',
      createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000)
    }
  ];
}

export function getMockRoomBookings() {
  console.log('🚀 DEV_DATA_BYPASS: Returning mock room bookings for today');
  return [
    {
      id: 'booking-001',
      roomName: 'Conference Room A',
      title: 'Team Meeting',
      startTime: new Date(Date.now() + 1 * 60 * 60 * 1000), // 1 hour from now
      endTime: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
      organizer: 'John Smith',
      attendees: 8,
      status: 'confirmed',
      createdAt: new Date()
    },
    {
      id: 'booking-002',
      roomName: 'Meeting Room B',
      title: 'Client Presentation',
      startTime: new Date(Date.now() + 3 * 60 * 60 * 1000), // 3 hours from now
      endTime: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours from now
      organizer: 'Sarah Johnson',
      attendees: 4,
      status: 'confirmed',
      createdAt: new Date()
    }
  ];
}

export function getMockReceptionDiary() {
  console.log('🚀 DEV_DATA_BYPASS: Returning mock reception diary');
  return {
    visitors: [],
    contractors: [],
  };
}

// Extend session interface
declare module 'express-session' {
  interface SessionData {
    userId?: string;
    customerId?: string;
    companyName?: string;
    // Platform admin session
    platformAdminId?: string;
    platformAdminUsername?: string;
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
      
      // DEV BYPASS CHECK FIRST!
      if (isDevAuthBypass() && isValidDevCredentials(companyName, username, password)) {
        console.log('🚀 DEV AUTH BYPASS: Using development authentication');
        const devUser = getDevUser();
        return {
          user: {
            id: devUser.id,
            username: devUser.username,
            password: '', // Never return actual password
            customerId: devUser.customerId
          },
          customer: {
            id: devUser.customerId,
            companyName: devUser.companyName,
            createdAt: new Date()
          }
        };
      }
      
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
      
      // DEV DATA BYPASS: Check if this is a Neon database error and bypass is enabled
      if (isDevDataBypass() && isDatabaseConnectionError(error)) {
        console.log('🚀 DEV_DATA_BYPASS: Neon database disabled, returning mock customer for company lookup');
        // Return a mock customer for any company name in dev mode
        return {
          id: 'dev-customer-001',
          companyName: companyName,
          createdAt: new Date('2024-01-01')
        };
      }
      
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
      
      // DEV DATA BYPASS: Check if this is a Neon database error and bypass is enabled
      if (isDevDataBypass() && isDatabaseConnectionError(error)) {
        console.log('🚀 DEV_DATA_BYPASS: Neon database disabled, returning mock user authentication');
        return {
          id: 'dev-user-001',
          username: username,
          password: '', // Never return actual password
          customerId: 'dev-customer-001',
          email: 'dev@example.com',
          firstName: 'Dev',
          lastName: 'User',
          accessLevel: 'admin',
          isActive: true,
          createdAt: new Date('2024-01-01')
        } as User;
      }
      
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
          contactEmail: 'admin@devcustomer.com',
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
          contactEmail: 'admin@customer2.com',
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
          contactEmail: 'admin@testtrial.com',
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
  
  // Set customerId on request for route handlers to access
  req.customerId = req.session.customerId;
  
  // Log successful authentication with tenant context
  console.log('✅ SECURITY: requireAuth passed - tenant context verified:', {
    userId: req.session.userId,
    customerId: req.session.customerId,
    sessionId: req.sessionID
  });
  
  next();
}

/**
 * Middleware to allow EITHER session auth OR Fire Marshal URL ID auth
 * Used for endpoints that Fire Marshals need to access without session
 */
export async function requireAuthOrFireMarshal(req: Request, res: Response, next: NextFunction) {
  // First, try session-based auth
  if (req.session && req.session.userId && req.session.customerId) {
    req.customerId = req.session.customerId;
    console.log('✅ DUAL_AUTH: Session auth successful:', {
      userId: req.session.userId,
      customerId: req.session.customerId
    });
    return next();
  }
  
  // If no session, try Fire Marshal URL ID auth
  const fireMarshalId = req.headers['x-fire-marshal-id'] as string;
  if (fireMarshalId) {
    try {
      // Import databaseService dynamically to avoid circular deps
      const { databaseService } = await import('./databaseService.js');
      
      // Find Fire Marshal across all customer databases
      const result = await databaseService.findFireMarshalByUrlId(fireMarshalId);
      
      if (result) {
        req.customerId = result.customerId;
        console.log('✅ DUAL_AUTH: Fire Marshal URL ID auth successful:', {
          fireMarshalId,
          customerId: result.customerId,
          marshalName: result.marshal.firstName + ' ' + result.marshal.lastName
        });
        return next();
      }
    } catch (error) {
      console.error('❌ DUAL_AUTH: Fire Marshal auth error:', error);
    }
  }
  
  // Neither auth method worked
  console.log('🚨 DUAL_AUTH: Authentication failed - no valid session or Fire Marshal URL ID');
  return res.status(403).json({ error: 'Authentication required' });
}

/**
 * Middleware to load user from session using customer-specific database
 */
export async function loadUser(req: Request, res: Response, next: NextFunction) {
  if (req.session && req.session.userId && req.session.customerId) {
    // DEV AUTH BYPASS: Skip database loading in dev mode
    if (isDevAuthBypass() && req.session.userId === 'dev-user-andy' && req.session.customerId === 'dev-customer-001') {
      console.log('🚀 LOADUSER_BYPASS: Skipping database user loading in dev mode');
      const devUser = getDevUser();
      req.user = {
        id: devUser.id,
        username: devUser.username,
        role: 'admin'
      } as any;
      req.customerId = devUser.customerId;
      next();
      return;
    }

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

/**
 * Platform Admin Authentication Service
 * For authenticating platform administrators (not customer users)
 */
export class PlatformAdminAuthService {
  /**
   * Authenticate platform admin credentials
   */
  static async authenticatePlatformAdmin(username: string, password: string): Promise<any | null> {
    try {
      // Get management database connection
      const { db } = await import('./db');
      
      console.log(`🔐 Platform Admin authentication attempt: ${username}`);
      
      // Look up admin by username in platformAdmins table
      const admins = await db
        .select()
        .from(schema.platformAdmins)
        .where(eq(schema.platformAdmins.username, username))
        .limit(1);
      
      const admin = admins[0];
      
      if (!admin) {
        console.log(`❌ Platform admin not found: ${username}`);
        return null;
      }
      
      if (!admin.isActive) {
        console.log(`❌ Platform admin account inactive: ${username}`);
        return null;
      }
      
      // Verify password
      const isPasswordValid = await bcrypt.compare(password, admin.password);
      
      if (!isPasswordValid) {
        console.log(`❌ Invalid password for platform admin: ${username}`);
        return null;
      }
      
      console.log(`✅ Platform admin authenticated successfully: ${username} (ID: ${admin.id})`);
      
      // Update last login timestamp
      await db
        .update(schema.platformAdmins)
        .set({ lastLoginAt: sql`NOW()` })
        .where(eq(schema.platformAdmins.id, admin.id));
      
      return admin;
    } catch (error) {
      console.error('❌ Platform admin authentication error:', error);
      return null;
    }
  }
}

/**
 * Middleware to check if platform admin is authenticated
 */
export function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session || !req.session.platformAdminId) {
    console.log('🚨 SECURITY: requirePlatformAdmin failed - no platform admin session');
    return res.status(401).json({ error: 'Platform admin authentication required' });
  }
  
  console.log('✅ SECURITY: requirePlatformAdmin passed:', {
    platformAdminId: req.session.platformAdminId,
    sessionId: req.sessionID
  });
  
  next();
}