import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";
import { logger } from './utils/logger';

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  min: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Handle pool-level errors to prevent them from crashing the server.
// Neon auto-suspends idle compute and terminates connections with code 57P01.
// pg.Pool will automatically create new connections on next query.
pool.on('error', (err: any) => {
  const isNeonSuspend = err.code === '57P01' || err.code === '57014' ||
    (typeof err.message === 'string' && err.message.includes('terminating connection'));
  if (isNeonSuspend) {
    logger.warn('[DB] Pool connection terminated by server (Neon suspend). Will reconnect on next query.');
  } else {
    logger.error('[DB] Unexpected pool error:', err.message);
  }
});

export const db = drizzle({ client: pool, schema });
