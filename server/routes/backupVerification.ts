import cron from 'node-cron';
import { db, pool } from '../db';
import { opsBackupChecks } from '@shared/schema';
import { desc } from 'drizzle-orm';
import { customerDbService } from '../customerDatabase';
import { registerCronJob } from '../opsMonitoring';
import { logger } from '../utils/logger';
import nodemailer from 'nodemailer';

// 'contractors' is not a real table — contractor data lives in
// contractor_companies/contractor_workers/etc. Use contractor_companies as the
// representative core table (verified against a live customer schema).
const CORE_TABLES = ['users', 'visitors', 'contractor_companies', 'staff'];

interface SchemaStats {
  schema: string;
  tableCount: number;
  estimatedRows: number;
}

async function getSchemaStats(schemaName: string): Promise<SchemaStats | null> {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*)::int AS table_count,
        COALESCE(SUM(GREATEST(c.reltuples, 0)::bigint), 0) AS estimated_rows
      FROM information_schema.tables t
      JOIN pg_class c ON c.relname = t.table_name
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.table_schema
      WHERE t.table_schema = $1
        AND t.table_type = 'BASE TABLE'
        AND c.relkind = 'r'
    `, [schemaName]);
    const row = result.rows[0];
    return {
      schema: schemaName,
      tableCount: Number(row?.table_count ?? 0),
      // estimated_rows comes back as a bigint (string) from pg — Number() is
      // safe here since row-count estimates never approach MAX_SAFE_INTEGER.
      estimatedRows: Number(row?.estimated_rows ?? 0),
    };
  } catch (err: any) {
    logger.warn(`[BackupVerification] Failed to stat schema ${schemaName}:`, err?.message);
    return null;
  }
}

async function checkCoreTables(schemaName: string): Promise<string[]> {
  const missing: string[] = [];
  try {
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_name = ANY($2)
        AND table_type = 'BASE TABLE'
    `, [schemaName, CORE_TABLES]);
    const present = new Set(result.rows.map((r: any) => r.table_name as string));
    for (const t of CORE_TABLES) {
      if (!present.has(t)) missing.push(t);
    }
  } catch (err: any) {
    logger.warn(`[BackupVerification] Core table check failed for ${schemaName}:`, err?.message);
  }
  return missing;
}

async function sendBackupFailEmail(notes: string): Promise<void> {
  const to = process.env.OPS_ALERT_EMAIL || process.env.SMTP_USER;
  if (!to) {
    logger.warn('[BackupVerification] No ops alert email — set OPS_ALERT_EMAIL');
    return;
  }
  const from = process.env.SMTP_USER || 'noreply@tprmax.com';
  const subject = '[TPR Max] Backup verification FAILED';
  const text = `The daily backup verification job detected a problem.\n\n${notes}\n\nPlease investigate immediately.`;

  try {
    const sgKey = process.env.SENDGRID_API_KEY;
    if (sgKey) {
      const sgMail = (await import('@sendgrid/mail')).default;
      sgMail.setApiKey(sgKey);
      await sgMail.send({ to, from, subject, text });
      return;
    }
  } catch { }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transporter.sendMail({ from, to, subject, text });
  } catch (err: any) {
    logger.warn('[BackupVerification] Failed to send failure email:', err?.message);
  }
}

export async function runBackupVerification(): Promise<void> {
  const start = Date.now();
  logger.info('[BackupVerification] Starting daily backup verification');
  const issues: string[] = [];
  let totalTables = 0;
  let totalRows = 0;

  const [prevCheck] = await db
    .select()
    .from(opsBackupChecks)
    .orderBy(desc(opsBackupChecks.ranAt))
    .limit(1);

  const schemas: string[] = [];

  try {
    const nsResult = await pool.query(`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name NOT IN ('information_schema','pg_catalog','pg_toast','pg_temp_1','pg_toast_temp_1')
        AND schema_name NOT LIKE 'pg_%'
    `);
    schemas.push(...nsResult.rows.map((r: any) => r.schema_name as string));
  } catch (err: any) {
    issues.push(`Failed to enumerate schemas: ${err?.message}`);
  }

  for (const schema of schemas) {
    const stats = await getSchemaStats(schema);
    if (!stats) {
      issues.push(`Could not stat schema: ${schema}`);
      continue;
    }

    if (stats.tableCount === 0) {
      issues.push(`Schema ${schema} has 0 tables`);
      continue;
    }

    totalTables += stats.tableCount;
    totalRows += stats.estimatedRows;

    // Customer (tenant) schemas are named c_<8-char-uuid-prefix> — see
    // customerDatabase.ts generateSchemaName(). 'cust_'/'customer_' never matched
    // any real schema, so this check silently never ran for any tenant.
    const isCustomerSchema = /^c_[0-9a-f]{8}$/.test(schema);
    if (isCustomerSchema) {
      const missing = await checkCoreTables(schema);
      if (missing.length > 0) {
        issues.push(`Schema ${schema} missing core tables: ${missing.join(', ')}`);
      }
    }
  }

  if (prevCheck && prevCheck.totalRows > 100) {
    const drop = (prevCheck.totalRows - totalRows) / prevCheck.totalRows;
    if (drop > 0.20) {
      issues.push(
        `Row count dropped by ${Math.round(drop * 100)}% since last check ` +
        `(was ${prevCheck.totalRows}, now ${totalRows}) — possible data loss`,
      );
    }
  }

  const status: 'pass' | 'fail' = issues.length === 0 ? 'pass' : 'fail';
  const durationMs = Date.now() - start;
  const notes = issues.length > 0 ? issues.join('\n') : null;

  await db.insert(opsBackupChecks).values({
    status,
    tablesChecked: totalTables,
    totalRows,
    durationMs,
    notes,
  });

  if (status === 'fail') {
    logger.error('[BackupVerification] FAILED:', notes);
    await sendBackupFailEmail(notes ?? 'Unknown failure');
  } else {
    logger.info(`[BackupVerification] PASSED — ${totalTables} tables, ~${totalRows} rows, ${durationMs}ms`);
  }
}

export function startBackupVerificationCron(): void {
  cron.schedule('30 3 * * *', () => {
    runBackupVerification().catch(err =>
      logger.error('[BackupVerification] Unhandled error:', err?.message),
    );
  }, { timezone: 'Europe/London' });
  registerCronJob('backup-verification-03:30');
  logger.info('[BackupVerification] Cron started (03:30 Europe/London)');
}
