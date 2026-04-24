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
    await db.execute(sql`ALTER TABLE evacuations ADD COLUMN IF NOT EXISTS is_drill BOOLEAN NOT NULL DEFAULT FALSE`);
    console.log(`✅ [shared-migration] evacuations.is_drill column ensured`);
  } catch (e: any) {
    console.log(`⚠️ [shared-migration] evacuations.is_drill: ${String(e?.message || e).substring(0, 120)}`);
  }
  try {
    await db.execute(sql`ALTER TABLE evacuations ADD COLUMN IF NOT EXISTS report_pdf_url TEXT`);
    console.log(`✅ [shared-migration] evacuations.report_pdf_url column ensured`);
  } catch (e: any) {
    console.log(`⚠️ [shared-migration] evacuations.report_pdf_url: ${String(e?.message || e).substring(0, 120)}`);
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
