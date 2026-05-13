import type { Express, Request, Response } from 'express';
import crypto from 'crypto';
import { sql, eq } from 'drizzle-orm';
import { logger } from '../utils/logger';
import { requireAuth, AuthService } from '../auth';
import * as SsoService from '../ssoService';
import { CustomerDatabaseService } from '../customerDatabase';
import * as isolatedSchema from '../isolatedSchema';

async function getCustomerSettings(customerId: string): Promise<any | null> {
  try {
    const { simpleDatabaseService } = await import('../simpleDatabaseService');
    const context = simpleDatabaseService.createCustomerContext('sso-system', customerId);
    return await simpleDatabaseService.getCompanySettings(context);
  } catch (error) {
    logger.error('❌ SSO: Error loading company settings:', error);
    return null;
  }
}

export function registerSsoRoutes(app: Express): void {

  app.get('/api/auth/sso/check', async (req: Request, res: Response) => {
    try {
      const companyName = req.query.company as string;
      if (!companyName?.trim()) {
        return res.json({ ssoLoginMode: 'standard', ssoAvailable: false });
      }
      const customer = await AuthService.findCustomerByCompanyName(companyName);
      if (!customer) {
        return res.json({ ssoLoginMode: 'standard', ssoAvailable: false });
      }
      const settings = await getCustomerSettings(customer.id);
      const ssoLoginMode = settings?.ssoLoginMode || 'standard';
      const ssoAvailable = SsoService.isSsoConfigured();
      return res.json({ ssoLoginMode, ssoAvailable });
    } catch (error) {
      logger.error('❌ SSO check error:', error);
      return res.json({ ssoLoginMode: 'standard', ssoAvailable: false });
    }
  });

  app.get('/api/auth/sso/start', async (req: Request, res: Response) => {
    try {
      const companyName = req.query.company as string;
      if (!companyName?.trim()) {
        return res.status(400).json({ error: 'company parameter is required' });
      }
      const customer = await AuthService.findCustomerByCompanyName(companyName);
      if (!customer) {
        return res.status(404).json({ error: 'Company not found' });
      }
      const settings = await getCustomerSettings(customer.id);
      const ssoLoginMode = settings?.ssoLoginMode || 'standard';
      if (ssoLoginMode === 'standard') {
        return res.status(400).json({ error: 'SSO is not enabled for this company' });
      }
      if (!SsoService.isSsoConfigured()) {
        return res.status(500).json({ error: 'SSO is not configured on this server — contact ACS support' });
      }

      const csrfToken = crypto.randomBytes(32).toString('hex');
      const state = Buffer.from(JSON.stringify({ csrf: csrfToken, customerId: customer.id })).toString('base64url');

      req.session.ssoCsrfToken = csrfToken;
      req.session.save(async (err) => {
        if (err) {
          logger.error('❌ SSO: Session save error (csrf):', err);
          return res.status(500).json({ error: 'Session error' });
        }
        try {
          const { url, codeVerifier } = await SsoService.buildAuthUrl(state);
          req.session.ssoCodeVerifier = codeVerifier;
          req.session.save((err2) => {
            if (err2) {
              logger.error('❌ SSO: Session save error (codeVerifier):', err2);
              return res.status(500).json({ error: 'Session error' });
            }
            logger.info(`🔀 SSO: Redirecting to Microsoft — customer: ${customer.id}`);
            return res.redirect(url);
          });
        } catch (ssoError: any) {
          logger.error('❌ SSO buildAuthUrl error:', ssoError.message);
          return res.status(500).json({ error: ssoError.message });
        }
      });
    } catch (error: any) {
      logger.error('❌ SSO start error:', error);
      return res.status(500).json({ error: 'SSO start failed' });
    }
  });

  app.get('/api/auth/sso/callback', async (req: Request, res: Response) => {
    try {
      const { code, state, error: oauthError } = req.query;

      if (oauthError) {
        logger.warn(`⚠️ SSO: OAuth error from Microsoft: ${oauthError}`);
        return res.redirect('/login?error=sso_failed');
      }
      if (!code || !state) {
        return res.redirect('/login?error=sso_failed');
      }

      let decoded: { csrf: string; customerId: string };
      try {
        decoded = JSON.parse(Buffer.from(state as string, 'base64url').toString());
      } catch {
        return res.redirect('/login?error=sso_failed');
      }

      if (decoded.csrf !== req.session.ssoCsrfToken) {
        logger.warn('⚠️ SSO: CSRF state mismatch');
        return res.status(400).send('Invalid state — possible CSRF attack');
      }

      const { customerId } = decoded;
      const codeVerifier = req.session.ssoCodeVerifier;
      if (!codeVerifier) {
        logger.warn('⚠️ SSO: Missing PKCE code verifier in session');
        return res.redirect('/login?error=sso_failed');
      }

      const settings = await getCustomerSettings(customerId);
      const autoProvision = settings?.ssoAutoProvision ?? true;
      const defaultRole = settings?.ssoDefaultRole || 'user';

      const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
      const fullCallbackUrl = `${baseUrl}${req.originalUrl}`;

      const claims = await SsoService.handleCallback(fullCallbackUrl, state as string, codeVerifier);
      if (!claims) {
        return res.redirect('/login?error=sso_failed');
      }

      const customerDbService = CustomerDatabaseService.getInstance();
      const customerDb = await customerDbService.getCustomerDatabase(customerId);

      const user = await SsoService.findOrProvisionUser(customerDb, claims, autoProvision, defaultRole);
      if (!user) {
        return res.redirect('/login?error=sso_no_account');
      }

      const { db } = await import('../db');
      const schema = await import('@shared/schema');
      const customers = await db.select().from(schema.customers).where(eq(schema.customers.id, customerId)).limit(1);
      const customer = customers[0];
      if (!customer) {
        return res.redirect('/login?error=sso_failed');
      }

      try {
        await customerDb.update(isolatedSchema.users)
          .set({ lastLoginAt: new Date() })
          .where(eq(isolatedSchema.users.id, user.id));
      } catch (e) {
        logger.warn('⚠️ SSO: Failed to update lastLoginAt:', e);
      }

      req.session.regenerate((regenerateErr) => {
        if (regenerateErr) {
          logger.error('❌ SSO: Session regeneration error:', regenerateErr);
          return res.redirect('/login?error=sso_failed');
        }
        req.session.userId = user.id;
        req.session.customerId = customerId;
        req.session.companyName = customer.companyName;
        req.session.ssoCsrfToken = undefined;
        req.session.ssoCodeVerifier = undefined;
        req.session.save((saveErr) => {
          if (saveErr) {
            logger.error('❌ SSO: Session save error:', saveErr);
            return res.redirect('/login?error=sso_failed');
          }
          logger.info(`✅ SSO: Login successful — ${user.username} at ${customer.companyName}`);
          return res.redirect('/');
        });
      });
    } catch (error: any) {
      logger.error('❌ SSO callback error:', error);
      return res.redirect('/login?error=sso_failed');
    }
  });

  app.get('/api/auth/sso/status', requireAuth, (_req: Request, res: Response) => {
    const configured = SsoService.isSsoConfigured();
    if (configured) {
      return res.json({ configured: true });
    }
    return res.json({ configured: false, reason: SsoService.getMissingConfigReason() });
  });
}
