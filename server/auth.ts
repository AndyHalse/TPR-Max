import bcrypt from 'bcryptjs';
import type { Request, Response, NextFunction } from 'express';
import type { User } from '@shared/schema';
import { storage } from './storage';

// Extend session interface
declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

// Extend Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
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
   * Authenticate user with username and password
   */
  static async authenticateUser(username: string, password: string): Promise<User | null> {
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
      console.error('Authentication error:', error);
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
        console.log('Developer user "Andy" already exists - updating password');
        // Hash password before updating
        const hashedPassword = await this.hashPassword(andyPassword);
        await storage.updateUser(existingAndy.id, { password: hashedPassword });
        console.log('Developer user password updated successfully');
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
        console.log('Developer user "Emma" already exists - updating password');
        // Hash password before updating
        const hashedPassword = await this.hashPassword(emmaPassword);
        await storage.updateUser(existingEmma.id, { password: hashedPassword });
        console.log('Emma user password updated successfully');
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
        console.log('Test user "TestUser" already exists - updating password');
        // Hash password before updating
        const hashedPassword = await this.hashPassword(testPassword);
        await storage.updateUser(existingTestUser.id, { password: hashedPassword });
        console.log('Test user password updated successfully');
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