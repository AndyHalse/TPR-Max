import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { customerDbService } from '../customerDatabase';
import * as isolatedSchema from '../isolatedSchema';
import { eq } from 'drizzle-orm';

export interface PortalTokenPayload {
  portalUserId: string;
  contractorCompanyId: string;
  customerId: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

function portalSecret(): string {
  return `cportal::${process.env.SESSION_SECRET ?? 'dev-unsecured-fallback'}`;
}

function b64url(s: string): string {
  return Buffer.from(s).toString('base64url');
}

function fromb64url(s: string): string {
  return Buffer.from(s, 'base64url').toString('utf8');
}

export function generatePortalToken(
  payload: Omit<PortalTokenPayload, 'iat' | 'exp'>
): string {
  const now = Math.floor(Date.now() / 1000);
  const full: PortalTokenPayload = { ...payload, iat: now, exp: now + 8 * 3600 };
  const h = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64url(JSON.stringify(full));
  const sig = crypto
    .createHmac('sha256', portalSecret())
    .update(`${h}.${p}`)
    .digest('base64url');
  return `${h}.${p}.${sig}`;
}

export function verifyPortalToken(token: string): PortalTokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [h, p, sig] = parts;
    const expected = crypto
      .createHmac('sha256', portalSecret())
      .update(`${h}.${p}`)
      .digest('base64url');
    const eBuf = Buffer.from(expected, 'base64url');
    const sBuf = Buffer.from(sig, 'base64url');
    if (eBuf.length !== sBuf.length) return null;
    if (!crypto.timingSafeEqual(eBuf, sBuf)) return null;
    const payload = JSON.parse(fromb64url(p)) as PortalTokenPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function requireContractorPortalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : null;
  if (!token) {
    res.status(401).json({ error: 'Portal authentication required', code: 'PORTAL_AUTH_REQUIRED' });
    return;
  }
  const payload = verifyPortalToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired portal session. Please log in again.', code: 'PORTAL_TOKEN_INVALID' });
    return;
  }

  try {
    const db = await customerDbService.getCustomerDatabase(payload.customerId);
    const rows = await db
      .select({ isActive: isolatedSchema.contractorPortalUsers.isActive })
      .from(isolatedSchema.contractorPortalUsers)
      .where(eq(isolatedSchema.contractorPortalUsers.id, payload.portalUserId))
      .limit(1);
    const user = rows[0];
    if (!user || !user.isActive) {
      res.status(401).json({
        error: 'Your portal access has been removed. Please contact the site administrator.',
        code: 'PORTAL_ACCESS_REVOKED',
      });
      return;
    }
  } catch (err: any) {
    logger.error('[portal-auth] DB check failed:', err?.message);
    res.status(500).json({ error: 'Authentication check failed. Please try again.' });
    return;
  }

  (req as any).portalUser = payload;
  next();
}
