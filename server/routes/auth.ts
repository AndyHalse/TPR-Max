import type { Express } from 'express';
import { logger } from '../utils/logger';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import {
  AuthService,
  requireAuth,
  isDevAuthBypass,
  getDevUser,
  isValidDevCredentials,
  signSessionToken,
  verifySessionToken,
} from '../auth';
import { CustomerDatabaseService } from '../customerDatabase';
import * as isolatedSchema from '../isolatedSchema';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import * as sharedSchema from '@shared/schema';

// ---------------------------------------------------------------------------
// generateLogoToken — scoped short-lived HMAC token for the public logo endpoint.
// Duplicated here from routes.ts so auth.ts is self-contained.
// ---------------------------------------------------------------------------
const LOGO_TOKEN_SECRET = process.env.LOGO_TOKEN_SECRET;
if (!LOGO_TOKEN_SECRET) throw new Error('LOGO_TOKEN_SECRET environment variable is required');

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

  // ── Pending customer OTP store ──────────────────────────────────────────
  // TODO: shared store for multi-instance deployments (currently in-memory per instance)
  interface PendingCustomerOtp {
    userId: string;
    customerId: string;
    companyName: string;
    slug?: string;
    username: string;
    email: string;
    otp: string;
    expiresAt: Date;
    lastSentAt: Date; // for resend cooldown
  }
  const pendingCustomerOtps = new Map<string, PendingCustomerOtp>();
  // Reverse-lookup: userId → active pendingToken (for resend cooldown)
  const otpByUserId = new Map<string, string>();
  // Prune expired entries every 5 minutes
  setInterval(() => {
    const now = new Date();
    for (const [key, val] of pendingCustomerOtps.entries()) {
      if (val.expiresAt < now) {
        pendingCustomerOtps.delete(key);
        otpByUserId.delete(val.userId);
      }
    }
  }, 5 * 60 * 1000);

  function generateCustomerOtp(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  function maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return email;
    const masked = local[0] + '*'.repeat(Math.max(local.length - 1, 3));
    return `${masked}@${domain}`;
  }

  // ── Shared session creation helper (used by direct login and 2FA verify) ─
  async function createCustomerSession(
    req: any,
    res: any,
    user: any,
    customer: any,
    username: string
  ): Promise<void> {
    return new Promise((resolve) => {
      req.session.regenerate((regenerateErr: any) => {
        if (regenerateErr) {
          logger.error('❌ Session regeneration error:', regenerateErr);
          res.status(500).json({ error: 'Failed to create secure session' });
          return resolve();
        }

        logger.info(`🔄 Session ID regenerated for security`);

        req.session.userId = user.id;
        req.session.customerId = customer.id;
        req.session.companyName = customer.companyName;

        logger.info(`📝 Setting session context:`, {
          userId: user.id,
          customerId: customer.id,
          companyName: customer.companyName,
          username,
        });

        req.session.save(async (saveErr: any) => {
          if (saveErr) {
            logger.error('❌ Session save error:', saveErr);
            res.status(500).json({ error: 'Failed to establish session' });
            return resolve();
          }

          const savedUserId = req.session.userId;
          const savedCustomerId = req.session.customerId;
          const savedCompanyName = req.session.companyName;

          logger.info(`✅ Session saved successfully:`, {
            userId: savedUserId,
            customerId: savedCustomerId,
            companyName: savedCompanyName,
            username,
          });

          if (savedUserId !== user.id || savedCustomerId !== customer.id) {
            logger.error('❌ Session data mismatch after save!', {
              expected: { userId: user.id, customerId: customer.id },
              actual: { userId: savedUserId, customerId: savedCustomerId },
            });
            res.status(500).json({ error: 'Session persistence failed' });
            return resolve();
          }

          // Fetch company settings to include in login response for immediate branding
          let companySettings = null;
          try {
            const { simpleDatabaseService } = await import('../simpleDatabaseService');
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
            logger.error('⚠️ Failed to fetch settings during login:', settingsError);
          }

          const logoToken = generateLogoToken(customer.id);
          const sessionToken = signSessionToken(user.id, customer.id);

          res.json({
            success: true,
            user: {
              id: user.id,
              username: user.username,
              customerId: customer.id,
              role: user.role,
              allowedMenuItems: user.allowedMenuItems ?? null,
              defaultLandingPage: user.defaultLandingPage ?? null,
              navStyle: (user as any).navStyle ?? 'sidebar',
            },
            customer: {
              id: customer.id,
              companyName: customer.companyName,
              slug: customer.slug,
            },
            settings: companySettings,
            logoToken,
            sessionToken,
          });

          resolve();
        });
      });
    });
  }

  // ── Authentication endpoints ────────────────────────────────────────────

  // Brute-force protection — two complementary limiters:
  //
  // 1. Per-account limiter (no IP in key): blocks distributed / rotating-IP attacks
  //    against a single account. 10 FAILED attempts / 15 min per company+username,
  //    regardless of how many IPs the attacker uses.
  //    skipSuccessfulRequests=true so legitimate logins never count toward the cap.
  //
  // 2. Per-IP-per-account limiter: defence-in-depth if multiple accounts are targeted
  //    from the same source, and gives finer-grained blocking alongside the global
  //    authRateLimit (100/15min per IP) applied in index.ts.
  //
  // TODO: use a shared store (Redis / DB) if running multiple server instances.
  const accountLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
      const body = req.body as Record<string, string> | undefined;
      return `acct|${(body?.companyName ?? '').toLowerCase()}:${(body?.username ?? '').toLowerCase()}`;
    },
    message: { error: 'Too many login attempts for this account. Please try again in 15 minutes.' },
  });

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
      const ip = req.ip ?? 'unknown';
      const body = req.body as Record<string, string> | undefined;
      const user = `${(body?.companyName ?? '').toLowerCase()}:${(body?.username ?? '').toLowerCase()}`;
      return `${ip}|${user}`;
    },
    message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  });

  app.post('/api/auth/login', accountLoginLimiter, loginLimiter, async (req, res) => {
    try {
      const { companyName, username, password } = req.body;

      // Validate all 3 required fields
      if (!companyName || !username || !password) {
        return res.status(400).json({
          error: 'Company name, username, and password are all required',
          missing: {
            companyName: !companyName,
            username: !username,
            password: !password,
          },
        });
      }

      logger.info(`🔐 3-Field Auth attempt: Company="${companyName}", Username="${username}"`);

      // DEV AUTH BYPASS: Check for development authentication — skips 2FA
      if (isDevAuthBypass() && isValidDevCredentials(companyName, username, password)) {
        logger.info(`🚀 DEV BYPASS: Using centralized development authentication`);

        const devUser = getDevUser();
        const authResult = {
          user: {
            id: devUser.id,
            username: devUser.username,
            companyName: devUser.companyName,
            role: 'admin',
          },
          customer: {
            id: devUser.customerId,
            companyName: devUser.companyName,
          },
        };

        req.session.regenerate((regenerateErr) => {
          if (regenerateErr) {
            logger.error('❌ Session regeneration error:', regenerateErr);
            return res.status(500).json({ error: 'Failed to create secure session' });
          }

          req.session.userId = authResult.user.id;
          req.session.customerId = authResult.customer.id;
          req.session.companyName = authResult.customer.companyName;

          req.session.save(async (saveErr) => {
            if (saveErr) {
              logger.error('❌ Session save error:', saveErr);
              return res.status(500).json({ error: 'Failed to establish session' });
            }

            logger.info(`✅ DEV BYPASS: Login successful for ${username} at ${companyName}`);

            let companySettings = null;
            try {
              const { simpleDatabaseService } = await import('../simpleDatabaseService');
              const context = simpleDatabaseService.createCustomerContext(
                authResult.user.username,
                authResult.customer.id
              );
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
              logger.error('⚠️ Failed to fetch settings during dev login:', settingsError);
            }

            const devLogoToken = generateLogoToken(authResult.customer.id);
            const devSessionToken = signSessionToken(authResult.user.id, authResult.customer.id);
            return res.json({
              success: true,
              message: 'Login successful',
              user: {
                id: authResult.user.id,
                username: authResult.user.username,
                companyName: authResult.customer.companyName,
              },
              customer: {
                id: authResult.customer.id,
                companyName: authResult.customer.companyName,
              },
              settings: companySettings,
              logoToken: devLogoToken,
              sessionToken: devSessionToken,
            });
          });
        });
        return;
      }

      // Use 3-field authentication
      const authResult = await AuthService.authenticateUser(companyName, username, password);
      if (!authResult) {
        logger.info(
          `❌ 3-Field authentication failed: Company="${companyName}", Username="${username}"`
        );
        return res.status(401).json({ error: 'Invalid company name, username, or password' });
      }

      const { user, customer } = authResult;

      // Block standard login when the company requires SSO-only
      try {
        const { simpleDatabaseService } = await import('../simpleDatabaseService');
        const context = simpleDatabaseService.createCustomerContext(username, customer.id);
        const settings = await simpleDatabaseService.getCompanySettings(context);
        if (settings?.ssoLoginMode === 'sso_only') {
          logger.warn(
            `⚠️ SSO-only login attempted via standard form: ${username} at ${customer.companyName}`
          );
          return res.status(403).json({
            error: 'This account requires Microsoft SSO. Use the "Sign in with Microsoft" button on the login page.',
            ssoRequired: true,
          });
        }
      } catch (settingsErr) {
        logger.warn('⚠️ Failed to check ssoLoginMode — proceeding with standard login:', settingsErr);
      }

      logger.info(
        `🔐 Login successful for user: ${username} (ID: ${user.id}) at company: ${customer.companyName} (ID: ${customer.id})`
      );

      // 2FA: Check if user has an email address
      const userEmail = (user as any).email;
      if (!userEmail) {
        return res.status(403).json({
          error: 'LOGIN_NO_EMAIL',
          message: 'Your account does not have an email address and cannot be used to log in. Please contact your administrator.',
        });
      }

      // ── OTP resend cooldown (60 s) ──────────────────────────────────────
      // If the user already has a non-expired pending OTP that was sent less
      // than 60 seconds ago, reuse it rather than sending another email.
      const userId = (user as any).id as string;
      const existingTokenKey = otpByUserId.get(userId);
      if (existingTokenKey) {
        const existingPending = pendingCustomerOtps.get(existingTokenKey);
        if (existingPending && existingPending.expiresAt > new Date() &&
            Date.now() - existingPending.lastSentAt.getTime() < 60_000) {
          return res.json({
            requires2fa: true,
            pendingToken: existingTokenKey,
            maskedEmail: maskEmail(existingPending.email),
          });
        }
      }

      // Generate OTP and send verification email
      const pendingToken = crypto.randomUUID();
      const otp = generateCustomerOtp();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      const lastSentAt = new Date();

      pendingCustomerOtps.set(pendingToken, {
        userId,
        customerId: customer.id,
        companyName: customer.companyName,
        slug: (customer as any).slug,
        username: (user as any).username,
        email: userEmail,
        otp,
        expiresAt,
        lastSentAt,
      });
      otpByUserId.set(userId, pendingToken);

      try {
        const { emailService } = await import('../emailService');
        await emailService.sendEmail({
          to: userEmail,
          subject: 'Your TPR Max verification code',
          html: `
            <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;">
              <h2 style="color:#2460A9;">TPR Max — Verification Code</h2>
              <p>Hello ${(user as any).username},</p>
              <p>Your login verification code is:</p>
              <div style="font-size:36px;font-weight:700;letter-spacing:10px;text-align:center;
                          padding:20px;background:#f3f4f6;border-radius:10px;margin:20px 0;">
                ${otp}
              </div>
              <p>This code expires in <strong>10 minutes</strong>.</p>
              <p>If you did not attempt to log in to TPR Max, please contact your administrator immediately.</p>
            </div>
          `,
          text: `Your TPR Max verification code is: ${otp}. It expires in 10 minutes. If you did not request this, contact your administrator.`,
          companyName: customer.companyName,
        });
        logger.info(`2FA OTP sent to ${maskEmail(userEmail)} for user ${username}`);
      } catch (emailErr) {
        logger.error('Failed to send 2FA OTP email:', emailErr);
        pendingCustomerOtps.delete(pendingToken);
        otpByUserId.delete(userId);
        return res.status(500).json({
          error: 'Failed to send verification code. Please try again.',
        });
      }

      return res.json({
        requires2fa: true,
        pendingToken,
        maskedEmail: maskEmail(userEmail),
      });

    } catch (error) {
      logger.error('❌ 3-Field login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // ── 2FA verification endpoint ───────────────────────────────────────────
  const twoFaLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many verification attempts. Try again in 15 minutes.' },
  });

  app.post('/api/auth/verify-2fa', twoFaLimiter, async (req, res) => {
    try {
      const { pendingToken, otp } = req.body;

      if (!pendingToken || !otp) {
        return res.status(400).json({ error: 'Verification code and token are required' });
      }

      const pending = pendingCustomerOtps.get(pendingToken);

      if (!pending) {
        return res.status(401).json({
          error: 'Invalid or expired verification session. Please log in again.',
        });
      }

      if (new Date() > pending.expiresAt) {
        pendingCustomerOtps.delete(pendingToken);
        otpByUserId.delete(pending.userId);
        return res.status(401).json({
          error: 'Verification code has expired. Please log in again.',
        });
      }

      const submittedOtp = Buffer.from(otp.trim().padEnd(6, ' '));
      const expectedOtp  = Buffer.from(pending.otp.padEnd(6, ' '));
      if (submittedOtp.length !== expectedOtp.length || !crypto.timingSafeEqual(submittedOtp, expectedOtp)) {
        return res.status(401).json({
          error: 'Incorrect verification code. Please check your email and try again.',
        });
      }

      // Valid — consume the token
      pendingCustomerOtps.delete(pendingToken);
      otpByUserId.delete(pending.userId);

      // Reconstruct user and customer objects for session creation
      const user = {
        id: pending.userId,
        username: pending.username,
        email: pending.email,
        role: undefined as any,
        allowedMenuItems: null as any,
        defaultLandingPage: null as any,
      };
      const customer = {
        id: pending.customerId,
        companyName: pending.companyName,
        slug: pending.slug,
      };

      await createCustomerSession(req, res, user, customer, pending.username);
    } catch (error) {
      logger.error('2FA verification error:', error);
      res.status(500).json({ error: 'Verification failed' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('connect.sid', {
      path: '/',
      httpOnly: true,
    });
    res.clearCookie('visigate.session', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    });

    req.session.destroy((err) => {
      if (err) {
        logger.error('Session destroy error:', err);
        return res.status(500).json({ error: 'Logout failed' });
      }
      logger.info(`🔓 User logged out and all session cookies cleared`);
      res.json({ success: true, cookiesCleared: true });
    });
  });

  // Emergency simple login page - bypass Vite
  app.get('/emergency-login', (req, res) => {
    const filePath = path.join(__dirname, '../simple-login.html');
    const html = fs.readFileSync(filePath, 'utf8');
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  });

  // Session refresh endpoint to clear old cookies and force fresh session
  app.post('/api/auth/session-refresh', (req, res) => {
    res.clearCookie('connect.sid', { path: '/', httpOnly: true });
    res.clearCookie('visigate.session', { path: '/', httpOnly: true, sameSite: 'lax' });

    req.session.destroy((err) => {
      if (err) {
        logger.error('Session refresh error:', err);
        return res.status(500).json({ error: 'Session refresh failed' });
      }
      logger.info(`🔄 Session refreshed - old cookies cleared`);
      res.json({ success: true, sessionRefreshed: true });
    });
  });

  app.get('/api/auth/me', async (req, res) => {
    // ── Bearer token path (per-tab session isolation) ─────────────────────
    // When a per-tab JWT is present, validate it and use its payload directly.
    // This ensures that page refreshes in window 1 still see customer A even
    // if window 2 has since regenerated the shared session cookie for customer B.
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const { userId, customerId } = verifySessionToken(token);

        // DEV bypass: if dev mode and token matches dev user, short-circuit
        if (isDevAuthBypass()) {
          const devUser = getDevUser();
          if (userId === devUser.id && customerId === devUser.customerId) {
            logger.info(`🚀 AUTH_ME_BYPASS (Bearer): Returning dev user data`);
            return res.json({
              id: devUser.id,
              username: devUser.username,
              customerId: devUser.customerId,
              role: 'admin',
              sessionToken: signSessionToken(devUser.id, devUser.customerId),
            });
          }
        }

        const customerDbService = CustomerDatabaseService.getInstance();
        const customerDb = await customerDbService.getCustomerDatabase(customerId);
        const users = await customerDb
          .select()
          .from(isolatedSchema.users)
          .where(eq(isolatedSchema.users.id, userId))
          .limit(1);
        const user = users[0];
        if (!user) {
          return res.status(401).json({ error: 'User not found' });
        }
        logger.info(`✅ /api/auth/me authenticated via Bearer token: ${user.username}`);
        return res.json({
          id: user.id,
          username: user.username,
          customerId,
          role: user.role,
          allowedMenuItems: user.allowedMenuItems ?? null,
          defaultLandingPage: user.defaultLandingPage ?? null,
          navStyle: (user as any).navStyle ?? 'sidebar',
          firstName: user.firstName ?? null,
          lastName: user.lastName ?? null,
          sessionToken: signSessionToken(user.id, customerId),
        });
      } catch (err) {
        logger.info('🚨 /api/auth/me: Invalid Bearer token:', err);
        return res.status(401).json({ error: 'Session token invalid or expired' });
      }
    }

    // ── Session cookie fallback ────────────────────────────────────────────
    logger.info(
      `🔍 /api/auth/me called - session.userId: ${req.session?.userId}, customerId: ${req.session?.customerId}`
    );

    if (!req.session.userId || !req.session.customerId) {
      return res.status(401).json({
        error: 'Not authenticated',
        suggestion: 'session_refresh_needed',
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
        role: 'admin',
        sessionToken: signSessionToken(devUser.id, devUser.customerId),
      });
    }

    try {
      logger.info(
        `🔍 Attempting to load user with ID: ${req.session.userId} from customer DB: ${req.session.customerId}`
      );

      const customerDbService = CustomerDatabaseService.getInstance();
      const customerDb = await customerDbService.getCustomerDatabase(req.session.customerId);

      const users = await customerDb
        .select()
        .from(isolatedSchema.users)
        .where(eq(isolatedSchema.users.id, req.session.userId))
        .limit(1);

      const user = users[0];

      logger.info(
        `🔍 User lookup result:`,
        user ? `Found user: ${user.username}` : 'User not found'
      );

      if (!user) {
        return res.status(401).json({ error: 'User not found in customer database' });
      }

      logger.info(
        `✅ User authenticated successfully: ${user.username} (ID: ${user.id}) from customer DB`
      );

      res.json({
        id: user.id,
        username: user.username,
        customerId: req.session.customerId,
        role: user.role,
        allowedMenuItems: user.allowedMenuItems ?? null,
        defaultLandingPage: user.defaultLandingPage ?? null,
        navStyle: (user as any).navStyle ?? 'sidebar',
        firstName: user.firstName ?? null,
        lastName: user.lastName ?? null,
        sessionToken: signSessionToken(user.id, req.session.customerId),
      });
    } catch (error) {
      logger.error('Error in /api/auth/me:', error);
      return res.status(401).json({ error: 'Authentication failed' });
    }
  });

  // Update current user's profile (first name, last name)
  app.patch('/api/auth/profile', requireAuth, async (req, res) => {
    const customerId = req.customerId;
    const userId = (req as any).userId;
    if (!userId || !customerId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { firstName, lastName } = req.body;

    if (typeof firstName !== 'string' || typeof lastName !== 'string') {
      return res.status(400).json({ error: 'firstName and lastName are required strings' });
    }

    if (!firstName.trim() || !lastName.trim()) {
      return res.status(400).json({ error: 'firstName and lastName must not be empty' });
    }

    try {
      const customerDbService = CustomerDatabaseService.getInstance();
      const customerDb = await customerDbService.getCustomerDatabase(customerId);

      await customerDb
        .update(isolatedSchema.users)
        .set({ firstName: firstName.trim(), lastName: lastName.trim() })
        .where(eq(isolatedSchema.users.id, userId));

      res.json({ success: true });
    } catch (error) {
      logger.error('Error updating user profile:', error);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  });
}
