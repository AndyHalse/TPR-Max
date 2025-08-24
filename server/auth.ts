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
   * Initialize default developer user
   */
  static async initializeDeveloperUser(): Promise<void> {
    try {
      // Check if Andy user already exists
      const existingUser = await storage.getUserByUsername('Andy');
      
      // Hash the password
      const hashedPassword = await this.hashPassword('Kubo1966&&');
      
      if (existingUser) {
        // Update existing user password to ensure it's current
        console.log('Developer user "Andy" already exists - updating password');
        await storage.updateUser(existingUser.id, { password: 'Kubo1966&&' });
        console.log('Developer user password updated successfully');
        return;
      }

      // Create the developer user with raw password (storage will hash it)
      await storage.createUser({
        username: 'Andy',
        password: 'Kubo1966&&'
      });

      console.log('Developer user "Andy" created successfully with password: Kubo1966&&');
    } catch (error) {
      console.error('Failed to initialize developer user:', error);
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