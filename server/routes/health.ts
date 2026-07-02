import type { Express } from 'express';
import rateLimit from 'express-rate-limit';
import { pool } from '../db';
import { objectStorageClient } from '../objectStorage';
import { getUptimeSeconds, getCronCount } from '../opsMonitoring';
import { logger } from '../utils/logger';

const PACKAGE_VERSION = (() => {
  try {
    return require('../../package.json').version as string;
  } catch {
    return 'unknown';
  }
})();

const healthRateLimit = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many health-check requests' },
});

async function checkDatabase(): Promise<boolean> {
  let client: any;
  try {
    client = await Promise.race([
      pool.connect(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('DB connect timeout')), 3000),
      ),
    ]);
    await (client as any).query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    try { (client as any)?.release(); } catch { }
  }
}

async function checkStorage(): Promise<boolean> {
  const publicPaths = process.env.PUBLIC_OBJECT_SEARCH_PATHS;
  if (!publicPaths) return false;
  try {
    const bucketName = publicPaths.split(':')[0].replace(/^\//, '').split('/')[0];
    if (!bucketName) return false;
    await Promise.race([
      objectStorageClient.bucket(bucketName).getMetadata(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Storage timeout')), 5000),
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}

function isEmailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER) ||
    !!(process.env.SENDGRID_API_KEY);
}

export function registerPublicHealthRoute(app: Express): void {
  app.get('/api/health', healthRateLimit, async (_req, res) => {
    const dbOk = await checkDatabase();
    const status = dbOk ? 'ok' : 'down';
    const body = {
      status,
      db: dbOk,
      uptimeSeconds: getUptimeSeconds(),
      version: PACKAGE_VERSION,
      timestamp: new Date().toISOString(),
    };
    res.status(dbOk ? 200 : 503).json(body);
  });
  logger.info('[Health] Public health route registered at GET /api/health');
}

export async function buildDeepHealthPayload() {
  const [dbOk, storageOk] = await Promise.all([checkDatabase(), checkStorage()]);
  const emailOk = isEmailConfigured();
  const cronCount = getCronCount();
  const status = dbOk ? (emailOk && storageOk ? 'ok' : 'degraded') : 'down';
  return {
    status,
    db: dbOk,
    email: emailOk,
    storage: storageOk,
    cronCount,
    uptimeSeconds: getUptimeSeconds(),
    version: PACKAGE_VERSION,
    timestamp: new Date().toISOString(),
  };
}
