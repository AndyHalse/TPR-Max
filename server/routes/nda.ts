import { Express } from 'express';
import { eq } from 'drizzle-orm';
import * as isolatedSchema from '../isolatedSchema';
import { customerDbService } from '../customerDatabase';
import { logger } from '../utils/logger';

function decodeNdaToken(token: string): { customerId: string; rawToken: string } | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf-8');
    const sep = decoded.indexOf(':');
    if (sep === -1) return null;
    return { customerId: decoded.slice(0, sep), rawToken: decoded.slice(sep + 1) };
  } catch {
    return null;
  }
}

export function registerNdaRoutes(app: Express): void {
  // GET /api/nda/public/:token — no session auth; protected by secret token UUID
  app.get('/api/nda/public/:token', async (req, res) => {
    try {
      const parsed = decodeNdaToken(req.params.token);
      if (!parsed) return res.status(400).json({ error: 'Invalid token' });
      const { customerId, rawToken } = parsed;

      const customerDb = await customerDbService.getCustomerDatabase(customerId);

      // Look for visitor with this token
      const [visitor] = await customerDb
        .select()
        .from(isolatedSchema.visitors)
        .where(eq(isolatedSchema.visitors.ndaToken, rawToken))
        .limit(1);

      if (!visitor) {
        return res.status(404).json({ error: 'Invalid or expired signing link.' });
      }
      if (visitor.ndaTokenExpiresAt && visitor.ndaTokenExpiresAt < new Date()) {
        return res.status(410).json({ error: 'This NDA signing link has expired.' });
      }

      // Get NDA settings from the company_settings row in that tenant's schema
      const [settings] = await customerDb
        .select()
        .from(isolatedSchema.companySettings)
        .limit(1);

      return res.json({
        personName: `${visitor.firstName} ${visitor.lastName}`,
        personType: 'visitor',
        companyName: (settings as any)?.companyName || 'Your Host',
        ndaContent: (settings as any)?.ndaContent || '',
        requireSignature: !!(settings as any)?.ndaRequireSignature,
        alreadyAccepted: !!visitor.ndaAccepted,
        acceptedAt: visitor.ndaAcceptedAt ?? null,
      });
    } catch (err: any) {
      logger.error('NDA public GET error:', err);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // POST /api/nda/public/:token/accept — no session auth
  app.post('/api/nda/public/:token/accept', async (req, res) => {
    try {
      const parsed = decodeNdaToken(req.params.token);
      if (!parsed) return res.status(400).json({ error: 'Invalid token' });
      const { customerId, rawToken } = parsed;

      const customerDb = await customerDbService.getCustomerDatabase(customerId);

      const [visitor] = await customerDb
        .select()
        .from(isolatedSchema.visitors)
        .where(eq(isolatedSchema.visitors.ndaToken, rawToken))
        .limit(1);

      if (!visitor) {
        return res.status(404).json({ error: 'Invalid or expired signing link.' });
      }
      if (visitor.ndaTokenExpiresAt && visitor.ndaTokenExpiresAt < new Date()) {
        return res.status(410).json({ error: 'This NDA signing link has expired.' });
      }

      await customerDb
        .update(isolatedSchema.visitors)
        .set({ ndaAccepted: true, ndaAcceptedAt: new Date() })
        .where(eq(isolatedSchema.visitors.id, visitor.id));

      logger.info(`NDA accepted via email link for visitor ${visitor.id} (${visitor.firstName} ${visitor.lastName})`);
      return res.json({
        success: true,
        personName: `${visitor.firstName} ${visitor.lastName}`,
      });
    } catch (err: any) {
      logger.error('NDA public POST error:', err);
      return res.status(500).json({ error: 'Server error' });
    }
  });
}
