import crypto from 'crypto';

const LOGO_TOKEN_SECRET = process.env.LOGO_TOKEN_SECRET;
if (!LOGO_TOKEN_SECRET) throw new Error('LOGO_TOKEN_SECRET environment variable is required');

export function generateLogoToken(customerId: string): string {
  const expiry = Date.now() + 24 * 60 * 60 * 1000;
  const payload = `${customerId}:${expiry}`;
  const hmac = crypto
    .createHmac('sha256', LOGO_TOKEN_SECRET)
    .update(payload)
    .digest('hex')
    .substring(0, 16);
  return Buffer.from(`${payload}:${hmac}`).toString('base64url');
}

export function validateLogoToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString();
    const parts = decoded.split(':');
    if (parts.length !== 3) return null;
    const [customerId, expiryStr, providedHmac] = parts;
    const expiry = parseInt(expiryStr, 10);
    if (Date.now() > expiry) return null;
    const expectedHmac = crypto
      .createHmac('sha256', LOGO_TOKEN_SECRET)
      .update(`${customerId}:${expiryStr}`)
      .digest('hex')
      .substring(0, 16);
    if (providedHmac !== expectedHmac) return null;
    return customerId;
  } catch {
    return null;
  }
}
