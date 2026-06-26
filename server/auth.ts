import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import type { User, Customer } from '@shared/schema';
import { storage } from './storage';
import { CustomerDatabaseService } from './customerDatabase';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, sql } from 'drizzle-orm';
import * as schema from '@shared/schema';
import * as isolatedSchema from './isolatedSchema';
import { logger } from './utils/logger';

// ---------------------------------------------------------------------------
// Per-tab session JWT helpers — used for multi-window customer isolation.
// Each browser tab stores this token in sessionStorage and sends it as
// Authorization: Bearer <token>. The middleware validates it before falling
// back to the session cookie, so two windows can hold different customers.
// ---------------------------------------------------------------------------

function b64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64urlDecode(str: string): Buffer {
  const padded = str + '==='.slice((str.length + 3) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

const JWT_HEADER = b64urlEncode(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
const SESSION_TOKEN_TTL = 24 * 60 * 60; // 24 hours in seconds

// ---------------------------------------------------------------------------
// Platform-admin Bearer token helpers.
// The platform admin login returns a signed token stored in localStorage.
// All /platform-admin/* requests send it as x-pa-token.
// This is independent of the session cookie and survives main-app logins
// that call req.session.regenerate(), which would otherwise destroy the
// platformAdminId stored in the shared session.
// ---------------------------------------------------------------------------
const PA_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

export function signPlatformAdminToken(adminId: string): string {
  const secret = process.env.SESSION_SECRET || 'dev-secret';
  const payload = b64urlEncode(Buffer.from(JSON.stringify({
    adminId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + PA_TOKEN_TTL,
  })));
  const sigInput = `${JWT_HEADER}.${payload}`;
  const sig = b64urlEncode(crypto.createHmac('sha256', secret).update(sigInput).digest());
  return `${sigInput}.${sig}`;
}

export function verifyPlatformAdminToken(token: string): { adminId: string } {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid PA token format');
  const [header, payload, sig] = parts;
  const secret = process.env.SESSION_SECRET || 'dev-secret';
  const expectedSig = b64urlEncode(
    crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest()
  );
  const sigBuf = Buffer.from(sig);
  const expectedSigBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedSigBuf.length || !crypto.timingSafeEqual(sigBuf, expectedSigBuf)) {
    throw new Error('Invalid PA token signature');
  }
  const data = JSON.parse(b64urlDecode(payload).toString());
  if (data.exp < Math.floor(Date.now() / 1000)) throw new Error('PA token expired');
  return { adminId: data.adminId };
}

export function signSessionToken(userId: string, customerId: string): string {
  const secret = process.env.SESSION_SECRET || 'dev-secret';
  const payload = b64urlEncode(Buffer.from(JSON.stringify({
    userId,
    customerId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + SESSION_TOKEN_TTL,
  })));
  const sigInput = `${JWT_HEADER}.${payload}`;
  const sig = b64urlEncode(crypto.createHmac('sha256', secret).update(sigInput).digest());
  return `${sigInput}.${sig}`;
}

export function verifySessionToken(token: string): { userId: string; customerId: string } {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token format');
  const [header, payload, sig] = parts;
  const secret = process.env.SESSION_SECRET || 'dev-secret';
  const expectedSig = b64urlEncode(
    crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest()
  );
  const sigBuf = Buffer.from(sig);
  const expectedSigBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedSigBuf.length || !crypto.timingSafeEqual(sigBuf, expectedSigBuf)) {
    throw new Error('Invalid token signature');
  }
  const data = JSON.parse(b64urlDecode(payload).toString());
  if (data.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired');
  return { userId: data.userId, customerId: data.customerId };
}

// Dev Auth Bypass - centralized development authentication
export function isDevAuthBypass(): boolean {
  // SECURITY: Force disable in production environment
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  
  // Only enable in development with explicit flag
  return process.env.NODE_ENV === 'development' && process.env.ALLOW_DEV_AUTH_BYPASS === 'true';
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
         password === process.env.DEV_ANDY_PASSWORD;
}

// Mock Data Generation Functions for Development Bypass
export function getMockDepartmentAnalytics() {
  return [
    { department: 'Engineering', count: 12, checkedIn: 8 },
    { department: 'Operations', count: 15, checkedIn: 11 },
    { department: 'Safety', count: 6, checkedIn: 4 },
    { department: 'Management', count: 8, checkedIn: 6 },
    { department: 'Contractors', count: 22, checkedIn: 18 }
  ];
}

export function getMockPeakHoursAnalytics() {
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
    // SSO / OIDC flow
    ssoCsrfToken?: string;
    ssoCodeVerifier?: string;
    // Enterprise multi-site: active site for this session tab.
    // Written by the site-switcher (prompt 05). Left unset until
    // the user explicitly picks a site for their enterprise account.
    activeSiteId?: string;
  }
}

// Extend Request interface to include user and customer context
declare global {
  namespace Express {
    interface Request {
      user?: User;
      customer?: Customer;
      customerId?: string;
      /** Populated lazily by getScopedDb() / resolveSiteContext() on first call. */
      siteContext?: import('./siteScope').SiteContext;
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
  static async authenticateUser(companyName: string, username: string, password: string): Promise<{ user: User; customer: Customer; autoActiveSiteId?: string } | null> {
    try {
      companyName = companyName.trim();
      username = username.trim();
      logger.info(`🔐 3-Field Auth attempt: Company="${companyName}", Username="${username}"`);
      
      // DEV BYPASS CHECK FIRST!
      if (isDevAuthBypass() && isValidDevCredentials(companyName, username, password)) {
        logger.info('🚀 DEV AUTH BYPASS: Using development authentication');
        const devUser = getDevUser();
        return {
          user: {
            id: devUser.id,
            username: devUser.username,
            password: '',
            customerId: devUser.customerId,
            role: 'admin',
            email: null,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            firstName: null,
            lastName: null,
            lastLoginAt: null,
          } as User,
          customer: {
            id: devUser.customerId,
            companyName: devUser.companyName,
            createdAt: new Date(),
            slug: '',
            contactEmail: '',
            databaseUrl: '',
            isActive: true,
            maxVisitorsPerMonth: null,
            onboardingCompleted: null,
            supportContactEmail: null,
            supportContactPhone: null,
            billingEmail: null,
            subscriptionPlan: null,
            subscriptionStatus: null,
            updatedAt: new Date(),
          } as Customer,
        };
      }
      
      // Step 1: Lookup customer by company name (case-insensitive)
      const customer = await this.lookupCustomerByCompanyName(companyName);
      if (customer) {
        logger.info(`✅ Found customer: ${customer.companyName} (ID: ${customer.id})`);

        // Step 2: Get customer's isolated database connection
        const customerDbService = CustomerDatabaseService.getInstance();
        const customerDb = await customerDbService.getCustomerDatabase(customer.id);

        // Step 3: Authenticate user in customer's database
        const user = await this.authenticateUserInCustomerDatabase(customerDb, username, password);
        if (!user) {
          logger.info(`❌ User authentication failed in customer database: "${username}"`);
          return null;
        }

        logger.info(`✅ User authenticated successfully: ${username} for ${customer.companyName}`);
        return { user, customer };
      }

      // Step 1b: Company name not found — try site login name lookup.
      // Allows users to type their site name (e.g. "CPI Books Suffolk") instead of
      // the parent company name, landing scoped to that site after login.
      logger.info(`❌ Company not found: "${companyName}" — trying site login name lookup`);
      try {
        const { db: mgmtDb } = await import('./db');
        const { siteLoginNames } = await import('@shared/schema');
        const { sql: sqlTag } = await import('drizzle-orm');
        const siteMatches = await mgmtDb
          .select()
          .from(siteLoginNames)
          .where(sqlTag`LOWER(${siteLoginNames.loginName}) = LOWER(${companyName})`)
          .limit(1);

        if (!siteMatches[0]) {
          logger.info(`❌ No site login name match for: "${companyName}"`);
          return null;
        }

        const { customerId, siteId } = siteMatches[0];
        logger.info(`[auth] Site login name matched: "${companyName}" → customer=${customerId} site=${siteId}`);

        // Load the parent customer
        const { customers } = await import('@shared/schema');
        const { eq } = await import('drizzle-orm');
        const custRows = await mgmtDb
          .select()
          .from(customers)
          .where(eq(customers.id, customerId))
          .limit(1);

        const siteCustomer = custRows[0];
        if (!siteCustomer || !siteCustomer.isActive) {
          logger.warn(`[auth] Site login: parent customer ${customerId} not found or inactive`);
          return null;
        }

        // Authenticate user in customer's isolated DB
        const customerDbService = CustomerDatabaseService.getInstance();
        const customerDb = await customerDbService.getCustomerDatabase(customerId);
        const user = await this.authenticateUserInCustomerDatabase(customerDb, username, password);
        if (!user) {
          logger.info(`[auth] Site login: user authentication failed for "${username}"`);
          return null;
        }

        // Security: verify user actually has access to the resolved site.
        // Fail-closed — if grants cannot be resolved, deny login.
        try {
          const { resolveEnterpriseGrants } = await import('./enterpriseRoles');
          const grants = await resolveEnterpriseGrants(user.id, customerId, user.role);
          const allowed =
            grants.allowedSiteIds === 'all' ||
            (Array.isArray(grants.allowedSiteIds) &&
              (grants.allowedSiteIds as string[]).includes(siteId));
          if (!allowed) {
            logger.warn(
              `[auth] Site login denied: user ${username} has no grant for site ${siteId} at customer ${customerId}`,
            );
            return null;
          }
        } catch (grantsErr) {
          logger.error(`[auth] Site login: failed to resolve enterprise grants — denying login:`, grantsErr);
          return null;
        }

        logger.info(`✅ Site login successful: ${username} at customer ${siteCustomer.companyName}, site=${siteId}`);
        return { user, customer: siteCustomer, autoActiveSiteId: siteId };
      } catch (siteLoginErr) {
        logger.error(`[auth] Site login name lookup error:`, siteLoginErr);
        return null;
      }
      
    } catch (error) {
      logger.error('🚨 3-Field authentication error:', error);
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
      logger.error('Legacy authentication error:', error);
      return null;
    }
  }

  /**
   * Lookup customer by company name (case-insensitive)
   * Uses existing working database connection instead of creating new Pool
   */
  public static async findCustomerByCompanyName(companyName: string): Promise<Customer | null> {
    return AuthService.lookupCustomerByCompanyName(companyName);
  }

  private static async lookupCustomerByCompanyName(companyName: string): Promise<Customer | null> {
    try {
      // Import the working database connection instead of creating a new Pool
      const { db } = await import('./db');
      
      logger.info(`🔍 Looking up customer: "${companyName}" using working database connection`);
      
      // Case-insensitive search for company name
      const customers = await db
        .select()
        .from(schema.customers)
        .where(sql`LOWER(${schema.customers.companyName}) = LOWER(${companyName})`)
        .limit(1);

      const customer = customers[0] || null;
      logger.info(customer ? `✅ Found customer: ${customer.companyName} (ID: ${customer.id})` : `❌ Customer not found: "${companyName}"`);
      
      return customer;
    } catch (error) {
      logger.error(`🚨 Error looking up customer by company name: ${error}`);
      
      // DEV DATA BYPASS: Check if this is a Neon database error and bypass is enabled
      if (isDevDataBypass() && isDatabaseConnectionError(error)) {
        return {
          id: 'dev-customer-001',
          companyName: companyName,
          createdAt: new Date('2024-01-01'),
          slug: '',
          contactEmail: '',
          databaseUrl: '',
          isActive: true,
          maxVisitorsPerMonth: null,
          onboardingCompleted: null,
          supportContactEmail: null,
          supportContactPhone: null,
          billingEmail: null,
          subscriptionPlan: null,
          subscriptionStatus: null,
          updatedAt: new Date(),
        } as Customer;
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

      logger.info(`🔍 Auth DB query: found ${users.length} users for "${username}"`);
      const user = users[0];
      if (!user) {
        logger.info(`❌ No user found in customer DB for: "${username}"`);
        return null;
      }

      if (user.isActive === false) {
        logger.info(`❌ Login rejected — account is inactive: "${username}"`);
        return null;
      }

      logger.info(`🔍 Verifying password for user: ${user.username}, hash starts with: ${user.password?.substring(0, 10)}`);
      const isValid = await this.verifyPassword(password, user.password);
      if (!isValid) {
        logger.info(`❌ Password mismatch for user: "${username}"`);
        return null;
      }

      return user as User;
    } catch (error) {
      logger.error('Error authenticating user in customer database:', error);
      
      // DEV DATA BYPASS: Check if this is a Neon database error and bypass is enabled
      if (isDevDataBypass() && isDatabaseConnectionError(error)) {
        return {
          id: 'dev-user-001',
          username: username,
          password: '',
          customerId: 'dev-customer-001',
          role: 'admin',
          email: 'dev@example.com',
          firstName: 'Dev',
          lastName: 'User',
          isActive: true,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date(),
          lastLoginAt: null,
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
      logger.info('🔧 Ensuring development customers exist...');

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
          logger.info(`✅ Created customer: ${customerData.companyName}`);
        } else {
          logger.info(`✅ Customer already exists: ${customerData.companyName}`);
        }
      }
    } catch (error) {
      logger.error('❌ Error ensuring customers exist:', error);
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
      
      logger.info('🔧 Initializing developer users...');
      const andyPassword = process.env.DEV_ANDY_PASSWORD;
      const emmaPassword = process.env.DEV_EMMA_PASSWORD;

      if (!andyPassword || !emmaPassword) {
        throw new Error(
          'DEV_ANDY_PASSWORD and DEV_EMMA_PASSWORD environment variables must be set in development'
        );
      }

      // Initialize Andy (Customer 001)
      const existingAndy = await storage.getUserByUsername('Andy');
      
      if (existingAndy) {
        logger.info('Developer user "Andy" already exists - updating credentials');
        // updateUser will handle password hashing automatically
        await storage.updateUser(existingAndy.id, { password: andyPassword });
        logger.info('Developer user credentials updated successfully');
      } else {
        await storage.createUser({
          username: 'Andy',
          password: andyPassword,
          customerId: 'dev-customer-001'
        } as any);
        logger.info('Developer user "Andy" created successfully');
      }

      // Initialize Emma (Customer 002) for testing customer isolation
      const existingEmma = await storage.getUserByUsername('Emma');
      
      if (existingEmma) {
        logger.info('Developer user "Emma" already exists - updating credentials');
        // updateUser will handle password hashing automatically
        await storage.updateUser(existingEmma.id, { password: emmaPassword });
        logger.info('Emma user credentials updated successfully');
      } else {
        await storage.createUser({
          username: 'Emma',
          password: emmaPassword,
          customerId: 'dev-customer-002'
        } as any);
        logger.info('✅ Developer user "Emma" created successfully for Customer 002 testing');
      }

      // Initialize TestUser for free onboarding testing — development only
      const testPassword = process.env.TEST_USER_PASSWORD;
      if (!testPassword && process.env.NODE_ENV !== 'production') {
        throw new Error('TEST_USER_PASSWORD environment variable is required in development');
      }
      if (process.env.NODE_ENV !== 'production' && testPassword) {
        const existingTestUser = await storage.getUserByUsername('TestUser');

        if (existingTestUser) {
          logger.info('Test user "TestUser" already exists - updating credentials');
          // updateUser will handle password hashing automatically
          await storage.updateUser(existingTestUser.id, { password: testPassword });
          logger.info('Test user credentials updated successfully');
        } else {
          await storage.createUser({
            username: 'TestUser',
            password: testPassword, // createUser should handle hashing
            customerId: 'test-customer-trial'
          } as any);
          logger.info('✅ Test user "TestUser" created successfully for free trial testing');
        }
      }
    } catch (error) {
      logger.error('Failed to initialize developer users:', error);
    }
  }
}

/**
 * Middleware to check if user is authenticated with proper tenant context
 * PRODUCTION SECURITY: Enforces BOTH userId AND customerId for complete SaaS isolation
 *
 * Checks Authorization: Bearer <token> first (per-tab JWT stored in sessionStorage),
 * which allows multiple windows to each hold a different customer context independently.
 * Falls back to session cookie for backward compatibility with existing open tabs.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // ── Bearer token path (per-tab session isolation) ────────────────────────
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const { userId, customerId } = verifySessionToken(token);
      // req.user + req.customerId + (req as any).userId were already set by
      // loadUser (which runs earlier in the middleware chain and is now
      // Bearer-aware). Just confirm the token is valid and move on — no
      // req.session mutation here so the shared session cookie is never dirtied.
      req.customerId = customerId;
      (req as any).userId = userId;
      if ((req as any).userIsInactive) {
        logger.info('🚨 SECURITY: requireAuth rejected inactive user (Bearer):', { userId, customerId });
        return res.status(401).json({ error: 'Your account has been deactivated. Please contact your administrator.' });
      }
      logger.info('✅ SECURITY: requireAuth passed via Bearer token:', { userId, customerId });
      return next();
    } catch (err) {
      logger.info('🚨 SECURITY: Invalid/expired Bearer token — rejecting:', err);
      return res.status(401).json({ error: 'Session token invalid or expired — please log in again' });
    }
  }

  // ── Session cookie fallback ───────────────────────────────────────────────
  if (!req.session || !req.session.userId || !req.session.customerId) {
    logger.info('🚨 SECURITY: requireAuth failed - missing tenant context:', {
      hasSession: !!req.session,
      hasUserId: !!(req.session && req.session.userId),
      hasCustomerId: !!(req.session && req.session.customerId),
      sessionId: req.session ? req.sessionID : 'none'
    });
    return res.status(401).json({ error: 'Authentication required - proper tenant context missing' });
  }

  if ((req as any).userIsInactive) {
    logger.info('🚨 SECURITY: requireAuth rejected inactive user (session):', {
      userId: req.session.userId,
      customerId: req.session.customerId,
    });
    return res.status(401).json({ error: 'Your account has been deactivated. Please contact your administrator.' });
  }
  
  // Set customerId on request for route handlers to access
  req.customerId = req.session.customerId;
  
  // Log successful authentication with tenant context
  logger.info('✅ SECURITY: requireAuth passed via session cookie:', {
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
    logger.info('✅ DUAL_AUTH: Session auth successful:', {
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
        logger.info('✅ DUAL_AUTH: Fire Marshal URL ID auth successful:', {
          fireMarshalId,
          customerId: result.customerId,
          marshalName: result.marshal.firstName + ' ' + result.marshal.lastName
        });
        return next();
      }
    } catch (error) {
      logger.error('❌ DUAL_AUTH: Fire Marshal auth error:', error);
    }
  }
  
  // Neither auth method worked
  logger.info('🚨 DUAL_AUTH: Authentication failed - no valid session or Fire Marshal URL ID');
  return res.status(403).json({ error: 'Authentication required' });
}

/**
 * Middleware to load user from session using customer-specific database
 */
export async function loadUser(req: Request, res: Response, next: NextFunction) {
  // ── Bearer token path (per-tab session isolation) ──────────────────────────
  // When a valid Bearer token is present, hydrate req.user from THAT token's
  // customer context — not from the shared session cookie. This ensures req.user
  // is always consistent with the per-tab authenticated identity, even when
  // another window has switched the cookie to a different customer.
  //
  // SECURITY: Never process Bearer tokens on platform-admin routes. Platform
  // admin auth is purely cookie/session based (requirePlatformAdmin checks
  // req.session.platformAdminId). If a stale customer Bearer token is somehow
  // present in the browser, we must not let it trigger an early return that
  // bypasses the session-cookie path and leaves req.session.platformAdminId
  // invisible to requirePlatformAdmin.
  const authHeader = req.headers['authorization'];
  const isPlatformAdminPath = req.originalUrl?.startsWith('/platform-admin/');
  if (!isPlatformAdminPath && authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const { userId, customerId } = verifySessionToken(token);
      req.customerId = customerId;
      (req as any).userId = userId;

      if (isDevAuthBypass() && userId === 'dev-user-andy' && customerId === 'dev-customer-001') {
        logger.info('🚀 LOADUSER_BYPASS: Skipping database user loading in dev mode (Bearer)');
        const devUser = getDevUser();
        req.user = { id: devUser.id, username: devUser.username, role: 'admin' } as any;
        return next();
      }

      try {
        const customerDbService = CustomerDatabaseService.getInstance();
        const customerDb = await customerDbService.getCustomerDatabase(customerId);
        const users = await customerDb
          .select()
          .from(isolatedSchema.users)
          .where(eq(isolatedSchema.users.id, userId))
          .limit(1);
        if (users[0]) {
          if (users[0].isActive === false) {
            (req as any).userIsInactive = true;
            logger.info(`🚨 LOADUSER: Bearer token user is inactive — blocking: ${userId}`);
          } else {
            req.user = users[0] as any;
          }
        }
      } catch (error) {
        logger.error('Failed to load user from Bearer token context:', error);
      }
      return next();
    } catch {
      // Invalid/expired token — fall through to session cookie path.
      // requireAuth will reject the request properly if auth is required.
    }
  }

  // ── Session cookie path ────────────────────────────────────────────────────
  if (req.session && req.session.userId && req.session.customerId) {
    // DEV AUTH BYPASS: Skip database loading in dev mode
    if (isDevAuthBypass() && req.session.userId === 'dev-user-andy' && req.session.customerId === 'dev-customer-001') {
      logger.info('🚀 LOADUSER_BYPASS: Skipping database user loading in dev mode');
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
        if (users[0].isActive === false) {
          (req as any).userIsInactive = true;
          logger.info(`🚨 LOADUSER: Session user is inactive — blocking: ${req.session.userId}`);
        } else {
          req.user = users[0] as any;
          req.customerId = req.session.customerId;
          (req as any).userId = req.session.userId;
        }
      }
    } catch (error) {
      logger.error('Failed to load user from customer-specific session:', error);
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
      
      logger.info(`🔐 Platform Admin authentication attempt: ${username}`);
      
      // Look up admin by username in platformAdmins table
      const admins = await db
        .select()
        .from(schema.platformAdmins)
        .where(eq(schema.platformAdmins.username, username))
        .limit(1);
      
      const admin = admins[0];
      
      if (!admin) {
        logger.info(`❌ Platform admin not found: ${username}`);
        return null;
      }
      
      if (!admin.isActive) {
        logger.info(`❌ Platform admin account inactive: ${username}`);
        return null;
      }
      
      // Verify password
      const isPasswordValid = await bcrypt.compare(password, admin.password);
      
      if (!isPasswordValid) {
        logger.info(`❌ Invalid password for platform admin: ${username}`);
        return null;
      }
      
      logger.info(`✅ Platform admin authenticated successfully: ${username} (ID: ${admin.id})`);
      
      // Update last login timestamp
      await db
        .update(schema.platformAdmins)
        .set({ lastLoginAt: sql`NOW()` })
        .where(eq(schema.platformAdmins.id, admin.id));
      
      return admin;
    } catch (error) {
      logger.error('❌ Platform admin authentication error:', error);
      return null;
    }
  }
}

/**
 * Middleware to check if platform admin is authenticated.
 *
 * Accepts EITHER:
 *  1. req.session.platformAdminId  (cookie session — legacy / same-browser as main app)
 *  2. x-pa-token header            (signed Bearer token stored in localStorage —
 *                                   survives main-app session.regenerate() calls)
 *
 * The token approach is preferred because it cannot be wiped by the main app's
 * login flow, which calls req.session.regenerate() and could clear platformAdminId
 * from the shared session cookie.
 */
export function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  // 1. Try the x-pa-token header first (token-based auth, immune to session conflicts)
  const paTokenHeader = req.headers['x-pa-token'] as string | undefined;
  if (paTokenHeader) {
    try {
      const { adminId } = verifyPlatformAdminToken(paTokenHeader);
      // Hydrate session field so downstream handlers that read req.session.platformAdminId still work
      if (req.session) req.session.platformAdminId = adminId;
      logger.info('✅ SECURITY: requirePlatformAdmin passed via x-pa-token:', { adminId });
      return next();
    } catch (tokenErr) {
      logger.info('🚨 SECURITY: requirePlatformAdmin x-pa-token invalid:', { error: (tokenErr as Error).message });
      // Fall through to session check
    }
  }

  // 2. Fall back to session cookie
  if (!req.session || !req.session.platformAdminId) {
    logger.info('🚨 SECURITY: requirePlatformAdmin failed - no platform admin session or token');
    return res.status(401).json({ error: 'Platform admin authentication required' });
  }
  
  logger.info('✅ SECURITY: requirePlatformAdmin passed via session:', {
    platformAdminId: req.session.platformAdminId,
    sessionId: req.sessionID
  });
  
  next();
}

export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session || !req.session.platformAdminId) {
    return res.status(401).json({ error: 'Platform admin authentication required' });
  }
  try {
    const { db } = await import('./db');
    const [admin] = await db
      .select({ role: schema.platformAdmins.role })
      .from(schema.platformAdmins)
      .where(eq(schema.platformAdmins.id, req.session.platformAdminId))
      .limit(1);
    if (!admin || admin.role !== 'super_admin') {
      logger.info('🚨 SECURITY: requireSuperAdmin blocked — role is not super_admin', {
        platformAdminId: req.session.platformAdminId,
        role: admin?.role,
      });
      return res.status(403).json({ error: 'Super admin access required for this action' });
    }
    next();
  } catch (err) {
    logger.error('requireSuperAdmin DB lookup failed:', err);
    return res.status(500).json({ error: 'Failed to verify admin role' });
  }
}