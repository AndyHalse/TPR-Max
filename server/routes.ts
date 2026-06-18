import type { Express } from "express";
import { createServer, type Server } from "http";
import { logger } from "./utils/logger";
import { storage } from "./storage";
import { databaseService } from "./databaseService";
import { simpleDatabaseService } from "./simpleDatabaseService";
import { customerDbService } from "./customerDatabase";
import { db } from "./db";
import { sql } from "drizzle-orm";
import path from "path";
import express from "express";
import { websocketService } from "./websocketService";
import { registerBillingRoutes } from "./billingRoutes";
import { registerSplitRoutes } from "./routes/index";
import { setupAutomaticDailyReset } from "./routes/induction";

export async function registerRoutes(app: Express, existingServer?: Server): Promise<Server> {
  // Apply shared-DB schema migrations (evacuations table is in the shared DB, not isolated)
  try {
    await db.execute(sql`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS attachments JSONB`);
    logger.info(`✅ [shared-migration] bug_reports.attachments column ensured`);
  } catch (e: any) {
    logger.info(`⚠️ [shared-migration] bug_reports.attachments: ${String(e?.message || e).substring(0, 120)}`);
  }
  try {
    await db.execute(sql`ALTER TABLE evacuations ADD COLUMN IF NOT EXISTS is_drill BOOLEAN NOT NULL DEFAULT FALSE`);
    logger.info(`✅ [shared-migration] evacuations.is_drill column ensured`);
  } catch (e: any) {
    logger.info(`⚠️ [shared-migration] evacuations.is_drill: ${String(e?.message || e).substring(0, 120)}`);
  }
  try {
    await db.execute(sql`ALTER TABLE evacuations ADD COLUMN IF NOT EXISTS report_pdf_url TEXT`);
    logger.info(`✅ [shared-migration] evacuations.report_pdf_url column ensured`);
  } catch (e: any) {
    logger.info(`⚠️ [shared-migration] evacuations.report_pdf_url: ${String(e?.message || e).substring(0, 120)}`);
  }
  try {
    await db.execute(sql`ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS customer_id VARCHAR NOT NULL DEFAULT ''`);
    logger.info(`✅ [shared-migration] user_invitations.customer_id column ensured`);
  } catch (e: any) {
    logger.info(`⚠️ [shared-migration] user_invitations.customer_id: ${String(e?.message || e).substring(0, 120)}`);
  }
  try {
    await db.execute(sql`ALTER TABLE ai_generated_images ADD COLUMN IF NOT EXISTS customer_id VARCHAR NOT NULL DEFAULT ''`);
    logger.info(`✅ [shared-migration] ai_generated_images.customer_id column ensured`);
  } catch (e: any) {
    logger.info(`⚠️ [shared-migration] ai_generated_images.customer_id: ${String(e?.message || e).substring(0, 120)}`);
  }
  try {
    await db.execute(sql`ALTER TABLE staff ADD COLUMN IF NOT EXISTS customer_id VARCHAR NOT NULL DEFAULT ''`);
    await db.execute(sql`ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_email_key`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS staff_customer_email_idx ON staff (customer_id, email)`);
    logger.info(`✅ [shared-migration] staff composite unique index (customer_id, email) ensured`);
  } catch (e: any) {
    logger.info(`⚠️ [shared-migration] staff composite unique index: ${String(e?.message || e).substring(0, 120)}`);
  }
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS contractor_document_requests (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        token VARCHAR(64) NOT NULL UNIQUE,
        customer_id VARCHAR NOT NULL,
        company_id VARCHAR NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        requested_by TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    logger.info(`✅ [shared-migration] contractor_document_requests table ensured`);
  } catch (e: any) {
    logger.info(`⚠️ [shared-migration] contractor_document_requests: ${String(e?.message || e).substring(0, 120)}`);
  }
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS contractor_worker_document_requests (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        token VARCHAR(64) NOT NULL UNIQUE,
        customer_id VARCHAR NOT NULL,
        worker_id VARCHAR NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        requested_by TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    logger.info(`✅ [shared-migration] contractor_worker_document_requests table ensured`);
  } catch (e: any) {
    logger.info(`⚠️ [shared-migration] contractor_worker_document_requests: ${String(e?.message || e).substring(0, 120)}`);
  }
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS page_views (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        path TEXT NOT NULL,
        referrer_host TEXT,
        visitor_hash TEXT NOT NULL,
        is_bot BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS page_views_created_at_idx ON page_views (created_at)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS page_views_path_idx ON page_views (path)`);
    logger.info(`✅ [shared-migration] page_views table ensured`);
  } catch (e: any) {
    logger.info(`⚠️ [shared-migration] page_views: ${String(e?.message || e).substring(0, 120)}`);
  }
  try {
    await db.execute(sql`CREATE SEQUENCE IF NOT EXISTS bug_report_seq`);
    await db.execute(sql`
      SELECT setval(
        'bug_report_seq',
        GREATEST(
          (SELECT COALESCE(MAX(NULLIF(regexp_replace(report_number, '[^0-9]', '', 'g'), '')::int), 0) FROM bug_reports),
          1
        ),
        true
      )
    `);
    logger.info(`✅ [shared-migration] bug_report_seq sequence ensured`);
  } catch (e: any) {
    logger.info(`⚠️ [shared-migration] bug_report_seq: ${String(e?.message || e).substring(0, 120)}`);
  }
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS bug_report_audit (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        bug_report_id VARCHAR NOT NULL REFERENCES bug_reports(id),
        changed_by TEXT,
        changes JSONB,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS bug_report_audit_report_id_idx ON bug_report_audit (bug_report_id)`);
    logger.info(`✅ [shared-migration] bug_report_audit table ensured`);
  } catch (e: any) {
    logger.info(`⚠️ [shared-migration] bug_report_audit: ${String(e?.message || e).substring(0, 120)}`);
  }

  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  // AWS Health Check endpoints (HIGHEST PRIORITY - before any other routes)
  const { healthCheckService } = await import("./healthChecks");
  app.get('/livez', healthCheckService.liveness.bind(healthCheckService));
  app.get('/readyz', healthCheckService.readiness.bind(healthCheckService));
  app.get('/healthz', healthCheckService.combined.bind(healthCheckService));

  // Register billing routes (includes Stripe webhook)
  registerBillingRoutes(app);

  // Create HTTP server and register all domain route modules
  const server = existingServer ?? createServer(app);
  await registerSplitRoutes(app, server, setupAutomaticDailyReset);

  // Serve static files from public directory
  app.use('/sample-*.pdf', express.static(path.join(process.cwd(), 'public')));

  // Initialize WebSocket server for real-time muster updates
  websocketService.initialize(server);

  return server;
}

export function createHttpServer(app: Express): Server {
  return createServer(app);
}
