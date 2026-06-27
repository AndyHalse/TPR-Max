import path from "path";
import { execFileSync } from "child_process";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { setupVite, serveStatic, log } from "./vite";
import { AuthService } from "./auth";
import { logger } from "./utils/logger";
import { createApp, setAppReady } from "./app";

// Regenerate shared/version.ts on every server start so the version string is
// always current for this process (and Vite HMR picks it up for the client).
try {
  execFileSync("node", ["scripts/gen-version.mjs"], { stdio: "inherit" });
} catch {
  // Non-fatal — version.ts already exists with a prior stamp; continue normally.
}
import { APP_VERSION } from "../shared/version";

// SAFETY: Fail-fast if dev bypass env vars are set in production
if (process.env.NODE_ENV === "production") {
  if (
    process.env.DEV_AUTH_BYPASS === "true" ||
    process.env.DEV_DATA_BYPASS === "true"
  ) {
    logger.error(
      "🔥 FATAL: DEV_AUTH_BYPASS or DEV_DATA_BYPASS must NOT be set in production. Refusing to start."
    );
    process.exit(1);
  }
}

// Ensure Puppeteer Chrome binary is available (used for PDF report generation)
async function ensureChromeBinary() {
  try {
    const { execSync } = await import("child_process");
    execSync("npx puppeteer browsers install chrome", {
      stdio: "inherit",
      timeout: 120000,
    });
    logger.info("✅ Puppeteer Chrome binary ready");
  } catch (e: any) {
    logger.warn(
      "⚠️ Could not install Puppeteer Chrome — PDF generation will fall back to HTML:",
      e.message
    );
  }
}
// Run on every startup (dev and production) so the Replit deployment image
// always has the Chrome binary available for PDF report generation.
ensureChromeBinary();

// Global error handlers to prevent crashes
process.on("uncaughtException", (error: any) => {
  logger.error("Uncaught Exception - Critical application error", {
    error: error.message,
    stack: error.stack,
    critical: true,
    eventType: "uncaught_exception",
  });
  const isDbConnectionKilled =
    error.code === "57P01" ||
    error.code === "57014" ||
    (typeof error.message === "string" &&
      error.message.includes("terminating connection"));
  if (isDbConnectionKilled) {
    logger.error(
      "Database connection terminated by server — continuing, pool will reconnect",
      { code: error.code }
    );
    return;
  }
});

process.on("unhandledRejection", (reason, _promise) => {
  logger.error("Unhandled Promise Rejection", {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
    critical: false,
    eventType: "unhandled_rejection",
  });
});

// ── Startup DB migrations (idempotent — run every boot) ───────────────────────
async function runStartupMigrations(): Promise<void> {
  const migrations: Array<{ label: string; stmt: string }> = [
    {
      label: "evacuations.site_id",
      stmt: "ALTER TABLE evacuations ADD COLUMN IF NOT EXISTS site_id VARCHAR",
    },
    {
      label: "customers.platform_disabled_features",
      stmt: "ALTER TABLE customers ADD COLUMN IF NOT EXISTS platform_disabled_features TEXT[] NOT NULL DEFAULT '{}'",
    },
    {
      label: "bug_reports diagnostic columns",
      stmt: `ALTER TABLE bug_reports
               ADD COLUMN IF NOT EXISTS error_id    TEXT,
               ADD COLUMN IF NOT EXISTS breadcrumbs TEXT,
               ADD COLUMN IF NOT EXISTS app_version TEXT`,
    },
    {
      label: "platform_admin_audit table",
      stmt: `CREATE TABLE IF NOT EXISTS platform_admin_audit (
               id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
               admin_id TEXT NOT NULL,
               admin_username TEXT NOT NULL,
               action TEXT NOT NULL,
               target_type TEXT NOT NULL,
               target_id TEXT,
               target_label TEXT,
               details JSONB,
               created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
             )`,
    },
    {
      label: "customers soft-delete columns",
      stmt: `ALTER TABLE customers
               ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
               ADD COLUMN IF NOT EXISTS deleted_by TEXT`,
    },
    {
      label: "enterprise_groups table",
      stmt: `CREATE TABLE IF NOT EXISTS enterprise_groups (
               id          VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
               name        TEXT    NOT NULL,
               slug        TEXT    NOT NULL UNIQUE,
               contact_email TEXT,
               is_active   BOOLEAN NOT NULL DEFAULT TRUE,
               created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
               updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
             )`,
    },
    {
      label: "customers enterprise columns",
      stmt: `ALTER TABLE customers
               ADD COLUMN IF NOT EXISTS is_enterprise      BOOLEAN NOT NULL DEFAULT FALSE,
               ADD COLUMN IF NOT EXISTS enterprise_group_id VARCHAR REFERENCES enterprise_groups(id),
               ADD COLUMN IF NOT EXISTS enterprise_role     TEXT`,
    },
    {
      label: "customers site_management_style column",
      stmt: `ALTER TABLE customers
               ADD COLUMN IF NOT EXISTS site_management_style TEXT NOT NULL DEFAULT 'central'`,
    },
    {
      label: "site_login_names table",
      stmt: `CREATE TABLE IF NOT EXISTS site_login_names (
               id          VARCHAR     PRIMARY KEY DEFAULT gen_random_uuid(),
               customer_id VARCHAR     NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
               site_id     TEXT        NOT NULL,
               login_name  TEXT        NOT NULL,
               created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
               CONSTRAINT site_login_names_login_name_unique UNIQUE (login_name)
             )`,
    },
  ];

  for (const { label, stmt } of migrations) {
    try {
      await db.execute(sql.raw(stmt));
      logger.info(`✅ Migration: ${label}`);
    } catch (e: any) {
      logger.info(`⚠️ Migration (${label}): ${e.message?.substring(0, 100)}`);
    }
  }

  // Promote oldest platform admin to super_admin if none exists yet
  try {
    await db.execute(sql`
      UPDATE platform_admins
      SET role = 'super_admin'
      WHERE id = (SELECT id FROM platform_admins ORDER BY created_at ASC LIMIT 1)
        AND NOT EXISTS (SELECT 1 FROM platform_admins WHERE role = 'super_admin')
    `);
  } catch (e: any) {
    logger.info(`⚠️ super_admin promotion: ${e.message?.substring(0, 80)}`);
  }
}

// ── Main server startup ───────────────────────────────────────────────────────
(async () => {
  try {
    logger.info("Starting TPR server", {
      environment: process.env.NODE_ENV || "development",
      eventType: "server_startup",
    });

    // Run idempotent schema migrations before routes register
    await runStartupMigrations();

    // Build the configured Express app + HTTP server (middleware + routes)
    const { app, server } = await createApp();

    // Start listening immediately
    const port = parseInt(process.env.PORT || "5000", 10);
    logger.info("🌐 Starting server...");
    server.listen(
      { port, host: "0.0.0.0", reusePort: true },
      () => {
        logger.info("TPR server started successfully", {
          port,
          environment: process.env.NODE_ENV || "development",
          eventType: "server_ready",
          buildVersion: APP_VERSION,
        });
        logger.info(`[BUILD] VERSION: ${APP_VERSION}`);
        log(`serving on port ${port}`);
      }
    );

    // Brand video: serve with relaxed CSP before Vite middleware
    app.get("/tpr-brand-video.html", (req, res) => {
      const videoFile = path.resolve(
        import.meta.dirname,
        "../client/public/tpr-brand-video.html"
      );
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader(
        "Content-Security-Policy",
        [
          "default-src 'self' blob: data: https:",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data: https:",
          "style-src 'self' 'unsafe-inline' blob: data: https:",
          "img-src 'self' data: blob: https:",
          "font-src 'self' blob: data: https:",
          "connect-src 'self' blob: data: https: wss:",
          "worker-src blob:",
          "frame-src 'self'",
          "media-src 'self' blob: data: https:",
        ].join("; ")
      );
      res.sendFile(videoFile);
    });

    // Static file serving MUST come after route registration
    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      app.use((req, res, next) => {
        if (
          req.path.endsWith(".html") ||
          req.path === "/" ||
          !req.path.includes(".")
        ) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
        }
        next();
      });
      serveStatic(app);
    }

    // Mark app as fully ready — the temporary loading handler will now pass through
    setAppReady();
    logger.info("Application fully initialized and ready");

    // Run seeding in background (non-blocking)
    (async () => {
      try {
        logger.info("Initializing developer user");
        await AuthService.initializeDeveloperUser();

        logger.info("Seeding induction questions");
        const { seedInductionQuestions } = await import(
          "./seedInductionQuestions"
        );
        await seedInductionQuestions();

        const { seedInductionSettings } = await import(
          "./seedInductionSettings"
        );
        await seedInductionSettings();

        const { seedRoleSpecificQuestions } = await import(
          "./seedRoleSpecificQuestions"
        );
        await seedRoleSpecificQuestions();

        logger.info("🌱 Seeding UK H&S compliance documents...");
        const { seedUKHSDocuments } = await import("./seed-uk-hs-documents");
        await seedUKHSDocuments();

        logger.info("🌱 Seeding UK H&S document templates for all customers...");
        const { seedAllCustomerHSTemplates } = await import(
          "./seed-isolated-hs-templates"
        );
        await seedAllCustomerHSTemplates();

        logger.info("🌱 Seeding help system data...");
        const { seedHelpData } = await import("./seedHelpData");
        await seedHelpData();

        logger.info("✅ All seeding completed successfully");
      } catch (error) {
        logger.error("Failed to seed data:", error);
      }
    })();
  } catch (error) {
    logger.error("🔥 Failed to start server:", error);
    // Don't call process.exit() — let the deployment platform detect and restart
  }
})();
