import type { Express } from 'express';
import { logger } from '../utils/logger';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import {
  AuthService,
  requireAuth,
  isDevAuthBypass,
  getDevUser,
  isValidDevCredentials,
} from '../auth';
import { CustomerDatabaseService } from '../customerDatabase';
import * as isolatedSchema from '../isolatedSchema';
import { eq } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// generateLogoToken — scoped short-lived HMAC token for the public logo endpoint.
// Duplicated here from routes.ts so auth.ts is self-contained.
// ---------------------------------------------------------------------------
const LOGO_TOKEN_SECRET =
  process.env.SESSION_SECRET || process.env.DATABASE_URL || 'tpr-max-logo-token-secret';

function generateLogoToken(customerId: string): string {
  const expiry = Date.now() + 24 * 60 * 60 * 1000;
  const payload = `${customerId}:${expiry}`;
  const hmac = crypto
    .createHmac('sha256', LOGO_TOKEN_SECRET)
    .update(payload)
    .digest('hex')
    .substring(0, 16);
  return Buffer.from(`${payload}:${hmac}`).toString('base64url');
}

// ---------------------------------------------------------------------------

export function registerAuthRoutes(app: Express): void {
  // Authentication endpoints

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { companyName, username, password } = req.body;
      
      // Validate all 3 required fields
      if (!companyName || !username || !password) {
        return res.status(400).json({ 
          error: "Company name, username, and password are all required",
          missing: {
            companyName: !companyName,
            username: !username,
            password: !password
          }
        });
      }

      logger.info(`🔐 3-Field Auth attempt: Company="${companyName}", Username="${username}"`);

      // DEV AUTH BYPASS: Check for development authentication  
      if (isDevAuthBypass() && isValidDevCredentials(companyName, username, password)) {
        logger.info(`🚀 DEV BYPASS: Using centralized development authentication`);
        
        const devUser = getDevUser();
        const authResult = {
          user: {
            id: devUser.id,
            username: devUser.username,
            companyName: devUser.companyName,
            role: "admin"
          },
          customer: {
            id: devUser.customerId,
            companyName: devUser.companyName
          }
        };

        // Set session context for SaaS isolation
        req.session.regenerate((regenerateErr) => {
          if (regenerateErr) {
            logger.error("❌ Session regeneration error:", regenerateErr);
            return res.status(500).json({ error: "Failed to create secure session" });
          }
          
          req.session.userId = authResult.user.id;
          req.session.customerId = authResult.customer.id;
          req.session.companyName = authResult.customer.companyName;
          
          req.session.save(async (saveErr) => {
            if (saveErr) {
              logger.error("❌ Session save error:", saveErr);
              return res.status(500).json({ error: "Failed to establish session" });
            }
            
            logger.info(`✅ DEV BYPASS: Login successful for ${username} at ${companyName}`);
            
            // Fetch company settings for immediate branding
            let companySettings = null;
            try {
              const { simpleDatabaseService } = await import("../simpleDatabaseService");
              const context = simpleDatabaseService.createCustomerContext(authResult.user.username, authResult.customer.id);
              const settings = await simpleDatabaseService.getCompanySettings(context);
              if (settings) {
                const {
                  biostarPassword,
                  biostarApiKey,
                  biostarUsername,
                  biostarBaseUrl,
                  paxtonPassword,
                  paxtonClientId,
                  paxtonUsername,
                  paxtonClientSecret,
                  smtpPassword,
                  smtpHost,
                  smtpPort,
                  smtpUsername,
                  twilioAuthToken,
                  twilioAccountSid,
                  twilioPhoneNumber,
                  eightByXApiKey,
                  eightByXApiSecret,
                  clueApiKey,
                  clueApiSecret,
                  openaiApiKey,
                  geminiApiKey,
                  sendgridApiKey,
                  ...sanitizedSettings
                } = settings;
                companySettings = sanitizedSettings;
              }
            } catch (settingsError) {
              logger.error("⚠️ Failed to fetch settings during dev login:", settingsError);
            }
            
            const devLogoToken = generateLogoToken(authResult.customer.id);
            return res.json({ 
              success: true,
              message: "Login successful", 
              user: { 
                id: authResult.user.id,
                username: authResult.user.username,
                companyName: authResult.customer.companyName 
              },
              customer: {
                id: authResult.customer.id,
                companyName: authResult.customer.companyName
              },
              settings: companySettings,
              logoToken: devLogoToken
            });
          });
        });
        return;
      }

      // Use new 3-field authentication
      const authResult = await AuthService.authenticateUser(companyName, username, password);
      if (!authResult) {
        logger.info(`❌ 3-Field authentication failed: Company="${companyName}", Username="${username}"`);
        return res.status(401).json({ error: "Invalid company name, username, or password" });
      }

      const { user, customer } = authResult;

      // Block standard login when the company requires SSO-only
      try {
        const { simpleDatabaseService } = await import('../simpleDatabaseService');
        const context = simpleDatabaseService.createCustomerContext(username, customer.id);
        const settings = await simpleDatabaseService.getCompanySettings(context);
        if (settings?.ssoLoginMode === 'sso_only') {
          logger.warn(`⚠️ SSO-only login attempted via standard form: ${username} at ${customer.companyName}`);
          return res.status(403).json({
            error: 'This account requires Microsoft SSO. Use the "Sign in with Microsoft" button on the login page.',
            ssoRequired: true,
          });
        }
      } catch (settingsErr) {
        logger.warn('⚠️ Failed to check ssoLoginMode — proceeding with standard login:', settingsErr);
      }

      logger.info(`🔐 Login successful for user: ${username} (ID: ${user.id}) at company: ${customer.companyName} (ID: ${customer.id})`);

      // SECURITY FIX: Regenerate session ID to prevent session fixation attacks
      req.session.regenerate((regenerateErr) => {
        if (regenerateErr) {
          logger.error("❌ Session regeneration error:", regenerateErr);
          return res.status(500).json({ error: "Failed to create secure session" });
        }
        
        logger.info(`🔄 Session ID regenerated for security`);
        
        // Set complete session context for SaaS isolation AFTER regeneration
        req.session.userId = user.id;
        req.session.customerId = customer.id;
        req.session.companyName = customer.companyName;
        
        logger.info(`📝 Setting session context:`, {
          userId: user.id,
          customerId: customer.id,
          companyName: customer.companyName,
          username: username
        });
        
        // Explicitly save the session with verification
        req.session.save(async (saveErr) => {
          if (saveErr) {
            logger.error("❌ Session save error:", saveErr);
            return res.status(500).json({ error: "Failed to establish session" });
          }
          
          // Verify all session data was saved correctly
          const savedUserId = req.session.userId;
          const savedCustomerId = req.session.customerId;
          const savedCompanyName = req.session.companyName;
          
          logger.info(`✅ Session saved successfully:`, {
            userId: savedUserId,
            customerId: savedCustomerId,
            companyName: savedCompanyName,
            username: username
          });
          
          if (savedUserId !== user.id || savedCustomerId !== customer.id) {
            logger.error("❌ Session data mismatch after save!", { 
              expected: { userId: user.id, customerId: customer.id },
              actual: { userId: savedUserId, customerId: savedCustomerId }
            });
            return res.status(500).json({ error: "Session persistence failed" });
          }
          
          // Fetch company settings to include in login response for immediate branding
          let companySettings = null;
          try {
            const { simpleDatabaseService } = await import("../simpleDatabaseService");
            const context = simpleDatabaseService.createCustomerContext(username, customer.id);
            const settings = await simpleDatabaseService.getCompanySettings(context);
            if (settings) {
              const {
                biostarPassword,
                biostarApiKey,
                biostarUsername,
                biostarBaseUrl,
                paxtonPassword,
                paxtonClientId,
                paxtonUsername,
                paxtonClientSecret,
                smtpPassword,
                smtpHost,
                smtpPort,
                smtpUsername,
                twilioAuthToken,
                twilioAccountSid,
                twilioPhoneNumber,
                eightByXApiKey,
                eightByXApiSecret,
                clueApiKey,
                clueApiSecret,
                openaiApiKey,
                geminiApiKey,
                sendgridApiKey,
                ...sanitizedSettings
              } = settings;
              companySettings = sanitizedSettings;
            }
          } catch (settingsError) {
            logger.error("⚠️ Failed to fetch settings during login:", settingsError);
          }
          
          // Generate a scoped logo token for the public logo endpoint (no auth needed)
          const logoToken = generateLogoToken(customer.id);
          
          // Return successful login with complete user, customer context, settings, and logo token
          res.json({ 
            success: true, 
            user: { 
              id: user.id, 
              username: user.username,
              customerId: customer.id,
              role: user.role,
              allowedMenuItems: (user as any).allowedMenuItems ?? null,
              defaultLandingPage: (user as any).defaultLandingPage ?? null
            },
            customer: {
              id: customer.id,
              companyName: customer.companyName,
              slug: customer.slug
            },
            settings: companySettings,
            logoToken
          });
        });
      });
    } catch (error) {
      logger.error("❌ 3-Field login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    // Clear both old and new session cookies explicitly
    res.clearCookie('connect.sid', { 
      path: '/', 
      httpOnly: true 
    });
    res.clearCookie('visigate.session', { 
      path: '/', 
      httpOnly: true, 
      sameSite: 'lax' 
    });
    
    req.session.destroy((err) => {
      if (err) {
        logger.error("Session destroy error:", err);
        return res.status(500).json({ error: "Logout failed" });
      }
      logger.info(`🔓 User logged out and all session cookies cleared`);
      res.json({ success: true, cookiesCleared: true });
    });
  });

  // Emergency simple login page - bypass Vite
  // NOTE: __dirname here is server/routes/ so the HTML is one level up
  app.get("/emergency-login", (req, res) => {
    const filePath = path.join(__dirname, "../simple-login.html");
    const html = fs.readFileSync(filePath, 'utf8');
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  });

  // Session refresh endpoint to clear old cookies and force fresh session
  app.post("/api/auth/session-refresh", (req, res) => {
    // Clear both old and new session cookies
    res.clearCookie('connect.sid', { path: '/', httpOnly: true });
    res.clearCookie('visigate.session', { path: '/', httpOnly: true, sameSite: 'lax' });
    
    // Destroy current session
    req.session.destroy((err) => {
      if (err) {
        logger.error("Session refresh error:", err);
        return res.status(500).json({ error: "Session refresh failed" });
      }
      logger.info(`🔄 Session refreshed - old cookies cleared`);
      res.json({ success: true, sessionRefreshed: true });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    logger.info(`🔍 /api/auth/me called - session.userId: ${req.session?.userId}, customerId: ${req.session?.customerId}`);
    
    if (!req.session.userId || !req.session.customerId) {
      // If no session or customer context, suggest session refresh to clear old cookies
      return res.status(401).json({ 
        error: "Not authenticated",
        suggestion: "session_refresh_needed" 
      });
    }
    
    // DEV AUTH BYPASS: Return dev user data without database access
    if (isDevAuthBypass() && req.session.userId && req.session.customerId) {
      logger.info(`🚀 AUTH_ME_BYPASS: Returning dev user data for session verification`);
      const devUser = getDevUser();
      return res.json({
        id: devUser.id,
        username: devUser.username,
        customerId: devUser.customerId,
        role: 'admin' // Dev user is always admin
      });
    }
    
    try {
      logger.info(`🔍 Attempting to load user with ID: ${req.session.userId} from customer DB: ${req.session.customerId}`);
      
      // Load user from customer-specific database instead of shared storage
      const customerDbService = CustomerDatabaseService.getInstance();
      const customerDb = await customerDbService.getCustomerDatabase(req.session.customerId);
      
      const users = await customerDb
        .select()
        .from(isolatedSchema.users)
        .where(eq(isolatedSchema.users.id, req.session.userId))
        .limit(1);
      
      const user = users[0];
      
      logger.info(`🔍 User lookup result:`, user ? `Found user: ${user.username}` : 'User not found');
      
      if (!user) {
        return res.status(401).json({ error: "User not found in customer database" });
      }
      
      logger.info(`✅ User authenticated successfully: ${user.username} (ID: ${user.id}) from customer DB`);
      
      res.json({ 
        id: user.id, 
        username: user.username, 
        customerId: req.session.customerId,
        role: user.role,
        allowedMenuItems: user.allowedMenuItems ?? null,
        defaultLandingPage: user.defaultLandingPage ?? null,
        firstName: user.firstName ?? null,
        lastName: user.lastName ?? null
      });
    } catch (error) {
      logger.error('Error in /api/auth/me:', error);
      return res.status(401).json({ error: "Authentication failed" });
    }
  });

  // Update current user's profile (first name, last name)
  app.patch("/api/auth/profile", async (req, res) => {
    if (!req.session.userId || !req.session.customerId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { firstName, lastName } = req.body;

    if (typeof firstName !== "string" || typeof lastName !== "string") {
      return res.status(400).json({ error: "firstName and lastName are required strings" });
    }

    if (!firstName.trim() || !lastName.trim()) {
      return res.status(400).json({ error: "firstName and lastName must not be empty" });
    }

    try {
      const customerDbService = CustomerDatabaseService.getInstance();
      const customerDb = await customerDbService.getCustomerDatabase(req.session.customerId);

      await customerDb
        .update(isolatedSchema.users)
        .set({ firstName: firstName.trim(), lastName: lastName.trim() })
        .where(eq(isolatedSchema.users.id, req.session.userId));

      res.json({ success: true });
    } catch (error) {
      logger.error("Error updating user profile:", error);
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

}
