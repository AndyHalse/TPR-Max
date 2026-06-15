import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import compression from "compression";
import session from "express-session";
import ConnectPgSimple from "connect-pg-simple";
import { Pool } from "pg";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import { registerRoutes, createHttpServer } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { AuthService, loadUser } from "./auth";
import { healthCheckService } from "./healthChecks";
import { logger, requestLoggingMiddleware, securityLogger } from "./utils/logger";

// Extend Express Request type for emergency token
declare global {
  namespace Express {
    interface Request {
      emergencyToken?: string;
    }
  }
}

// SAFETY: Fail-fast if dev bypass env vars are set in production
if (process.env.NODE_ENV === 'production') {
  if (process.env.DEV_AUTH_BYPASS === 'true' || process.env.DEV_DATA_BYPASS === 'true') {
    logger.error('🔥 FATAL: DEV_AUTH_BYPASS or DEV_DATA_BYPASS must NOT be set in production. Refusing to start.');
    process.exit(1);
  }
}

// Ensure Puppeteer Chrome binary is available (used for PDF report generation)
async function ensureChromeBinary() {
  try {
    const { execSync } = await import('child_process');
    execSync('npx puppeteer browsers install chrome', { stdio: 'inherit', timeout: 120000 });
    logger.info('✅ Puppeteer Chrome binary ready');
  } catch (e: any) {
    logger.warn('⚠️ Could not install Puppeteer Chrome — PDF generation will fall back to HTML:', e.message);
  }
}
// Chrome must be pre-installed in the production Docker/server image.
// This install only runs in development — see docs/AWS_DEPLOYMENT.md for the
// one-time build-time command to bake Chrome into a production image.
if (process.env.NODE_ENV !== 'production') {
  ensureChromeBinary();
}

// Global error handlers to prevent crashes
process.on('uncaughtException', (error: any) => {
  logger.error('Uncaught Exception - Critical application error', {
    error: error.message,
    stack: error.stack,
    critical: true,
    eventType: 'uncaught_exception'
  });
  // For Neon/PostgreSQL connection termination errors (57P01 = admin shutdown),
  // log a warning but do NOT exit. Pool-level error handlers catch these first.
  // pg.Pool automatically reconnects on the next query.
  const isDbConnectionKilled = error.code === '57P01' || error.code === '57014' ||
    (typeof error.message === 'string' && error.message.includes('terminating connection'));
  if (isDbConnectionKilled) {
    logger.error('Database connection terminated by server — continuing, pool will reconnect', { code: error.code });
    return;
  }
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
    critical: false,
    eventType: 'unhandled_rejection'
  });
});

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'", "https://replit.com"],   // tighten further once Vite nonces are set up
      styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:    ["'self'", "https://fonts.gstatic.com"],
      imgSrc:     ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'", "https://api.stripe.com", "wss:"],
      frameSrc:   ["'none'"],
      objectSrc:  ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,   // prevents issues with embedded kiosk content
}));

// ── Gzip compression ── applied to all routes before anything else
// On 3G/4G, this alone cuts HTML payload by 60-70% (text compresses extremely well)
app.use(compression({ level: 6, threshold: 1024 }));

// Set trust proxy for proper session handling
app.set('trust proxy', 1);

// CRITICAL: Deployment readiness flag and health check handler
// Must be FIRST middleware - before session, CSRF, logging, etc.
// Responds with 200 to ALL requests while the app is loading routes/static files
let appReady = process.env.NODE_ENV !== 'production';
app.use((req, res, next) => {
  if (!appReady) {
    return res.status(200).send('<!DOCTYPE html><html><head><title>TPR Max</title><meta http-equiv="refresh" content="3"></head><body><p>Starting up, please wait...</p></body></html>');
  }
  next();
});

// Structured logging middleware - AWS CloudWatch ready
app.use(requestLoggingMiddleware);

// CORS middleware - PRODUCTION READY
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // Production CORS allowlist
  const allowedOrigins = process.env.NODE_ENV === 'production' 
    ? (process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || [])
    : ['http://localhost:5000', 'https://localhost:5000', 'http://127.0.0.1:5000', 'https://127.0.0.1:5000'];
  
  // SECURITY FIX: Exact origin matching to prevent subdomain attacks
  const isAllowed = allowedOrigins.some(allowedOrigin => {
    if (!origin) return false;
    
    // Parse origins to compare properly
    try {
      const originUrl = new URL(origin);
      const allowedUrl = allowedOrigin.includes('://') ? new URL(allowedOrigin) : new URL(`https://${allowedOrigin}`);
      
      // Exact host and port matching (protocol flexible for dev)
      return originUrl.hostname === allowedUrl.hostname && 
             originUrl.port === allowedUrl.port;
    } catch {
      // Fallback to exact string matching for invalid URLs
      return origin === allowedOrigin;
    }
  });
  
  if (origin && isAllowed) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Extract the real client IP regardless of how many proxy hops sit in front
// (Cloudflare → Replit LB → app = 2 hops).  Priority:
//   1. CF-Connecting-IP  — set by Cloudflare, always the real browser IP
//   2. X-Real-IP         — set by some reverse proxies
//   3. Leftmost X-Forwarded-For value — real client before any CDN appended theirs
//   4. req.ip fallback   — works correctly when there is no proxy at all
function realClientIp(req: import('express').Request): string {
  const cf = req.headers['cf-connecting-ip'];
  if (cf && typeof cf === 'string') return cf.trim();

  const xri = req.headers['x-real-ip'];
  if (xri && typeof xri === 'string') return xri.trim();

  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    const first = (Array.isArray(xff) ? xff[0] : xff).split(',')[0].trim();
    if (first) return first;
  }

  return req.ip ?? '0.0.0.0';
}

// SECURITY: Rate limiting for authentication and sensitive routes.
// max:100 over 15 min ≈ 1 attempt every 9 s — plenty for normal use yet
// still blocks automated brute-force tools which need thousands of tries.
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: realClientIp,
  // We handle IPv6 safely via CF-Connecting-IP / X-Forwarded-For — suppress the
  // library's built-in IPv6-fallback warning which fires on any custom keyGenerator.
  validate: { keyGeneratorIpFallback: false },
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const ip = realClientIp(req);
    return ip === '127.0.0.1' || ip === '::1';
  }
});

const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  keyGenerator: realClientIp,
  validate: { keyGeneratorIpFallback: false },
  message: {
    error: 'Too many requests, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const ip = realClientIp(req);
    return ip === '127.0.0.1' || ip === '::1';
  }
});

// Apply rate limiting
app.use('/api/auth', authRateLimit);
app.use('/api/onboarding', authRateLimit);
app.use('/api/contractor-portal/login', authRateLimit);
app.use('/api/contractor-portal/accept-invite', authRateLimit);
app.use('/api', generalRateLimit);

app.use(cookieParser());
// NOTE: Four endpoints currently accept base64-encoded file/image data directly in the
// JSON request body and will fail for payloads above 5 MB. These should be migrated to
// the existing Google Cloud Storage multipart upload flow:
//   POST /api/emergency/evacuation-photo  — photoData field (fire marshal photo)
//   POST /api/objects/upload              — data field (object-storage proxy)
//   POST /api/ai/analyze-photo            — image field (AI visitor photo analysis)
//   POST /api/ppm/work-orders/*/documents — data field (PPM document upload)
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false, limit: '5mb' }));

// SECURITY: Modern CSRF Protection using double-submit cookie pattern
function generateCSRFToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function createCSRFMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip CSRF for Stripe webhooks (they use signature verification)
    if (req.originalUrl === '/api/stripe/webhook') {
      return next();
    }
    
    // Emergency Fire Marshal endpoints require valid emergency token OR Fire Marshal URL ID
    // But emergency activation requires normal authentication (admin only)
    // Also includes muster points management for Fire Marshals
    if (req.originalUrl.startsWith('/api/emergency/active') ||
        req.originalUrl.startsWith('/api/emergency/accountability') ||
        req.originalUrl.startsWith('/api/emergency/mark-safe') ||
        req.originalUrl.startsWith('/api/emergency/unmark-safe') ||
        req.originalUrl.startsWith('/api/emergency/qr-mark-safe') ||
        req.originalUrl.startsWith('/api/emergency/sweep-zone') ||
        req.originalUrl.startsWith('/api/emergency/evacuation-note') ||
        req.originalUrl.startsWith('/api/emergency/evacuation-photo')) {
      // Check for emergency token in Authorization header or query parameter
      const emergencyToken = req.headers['x-emergency-token'] as string || req.query.token as string;
      const fireMarshalId = req.headers['x-fire-marshal-id'] as string;
      
      // Allow if either emergency token OR Fire Marshal URL ID is present
      if (!emergencyToken && !fireMarshalId) {
        logger.info(`❌ CSRF/AUTH FAILURE: Emergency endpoint requires valid token or Fire Marshal URL ID`);
        return res.status(401).json({ 
          error: 'Emergency access requires valid token or Fire Marshal URL ID',
          code: 'EMERGENCY_AUTH_REQUIRED'
        });
      }
      
      // Store token in request for validation in routes (if present)
      if (emergencyToken) {
        req.emergencyToken = emergencyToken;
      }
      return next();
    }
    
    // complete-evacuation supports fire marshal/emergency-token auth OR admin session auth.
    // Bypass CSRF only when fire marshal credentials are present; admin session falls through
    // to the normal CSRF check (which requires x-csrf-token from the browser).
    if (req.originalUrl.startsWith('/api/emergency/complete-evacuation')) {
      const emergencyToken = req.headers['x-emergency-token'] as string || req.query.token as string;
      const fireMarshalId = req.headers['x-fire-marshal-id'] as string;
      if (emergencyToken) {
        req.emergencyToken = emergencyToken;
        return next();
      } else if (fireMarshalId) {
        return next();
      }
      // No fire marshal credentials — fall through to standard CSRF validation (admin session)
    }
    
    // Skip CSRF only for requests that originate outside the browser app
    // (kiosk devices, public self-service links, fire-marshal mobile URLs)
    if (req.originalUrl.startsWith('/api/kiosk') ||
        req.originalUrl.startsWith('/api/fire-marshal') ||
        req.originalUrl.startsWith('/api/induction/public') ||
        req.originalUrl.startsWith('/api/induction/kiosk') ||
        req.originalUrl.startsWith('/api/muster/safe') ||
        req.originalUrl.startsWith('/api/ppm/work-order/public') ||
        req.originalUrl.startsWith('/api/nda/public') ||
        req.originalUrl.startsWith('/api/doc-request/') ||
        req.originalUrl.startsWith('/api/worker-doc-request/') ||
        req.originalUrl.startsWith('/api/contractor-portal/') ||
        // Public mobile pages — protected by secret token in URL, no admin session
        req.originalUrl.startsWith('/api/audits/public/') ||
        req.originalUrl.startsWith('/api/induction/checkpoint/')) {
      return next();
    }

    // Skip CSRF for public induction token endpoints — accessed by contractors/visitors
    // on mobile devices via emailed links; they have no CSRF cookie from the admin app.
    // These endpoints are protected by the secret tokenId (UUID) instead.
    if (req.originalUrl.endsWith('/video-watched') ||
        req.originalUrl.endsWith('/submit-quiz')) {
      return next();
    }
    
    // Skip CSRF for login/logout/2fa-verify and platform-admin auth only
    if (req.originalUrl === '/api/auth/login' || 
        req.originalUrl === '/api/auth/logout' ||
        req.originalUrl === '/api/auth/verify-2fa' ||
        req.originalUrl.startsWith('/platform-admin/auth') ||
        (process.env.NODE_ENV !== 'production' && req.originalUrl.startsWith('/api/super-admin/'))) {
      return next();
    }
    
    // Skip CSRF for GET, HEAD, OPTIONS requests (safe methods)
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }
    
    const token = req.headers['x-csrf-token'] as string;
    const cookie = req.cookies?.['csrf-token'];
    
    // Check if token matches cookie (double-submit pattern)
    if (!token || !cookie || token !== cookie) {
      return res.status(403).json({ 
        error: 'CSRF token missing or invalid',
        code: 'CSRF_INVALID'
      });
    }
    
    next();
  };
}

// CSRF token endpoint
app.get('/api/csrf-token', (req, res) => {
  const token = generateCSRFToken();
  
  res.cookie('csrf-token', token, {
    httpOnly: false, // Client needs to read this for header
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000 // 8 hours — covers a full working day
  });
  
  res.json({ csrfToken: token });
});

// Apply CSRF protection to all routes except safe methods and excluded paths
app.use(createCSRFMiddleware());

// PRODUCTION-READY session configuration with PostgreSQL store
const isProduction = process.env.NODE_ENV === 'production';

// Validate required session secret in production
if (isProduction && !process.env.SESSION_SECRET) {
  logger.error('🔥 CRITICAL: SESSION_SECRET environment variable is required in production! Using a random ephemeral secret (sessions will not survive restarts).');
}

// Validate CORS origins are set in production
if (isProduction && !process.env.ALLOWED_ORIGINS) {
  logger.warn('⚠️ WARNING: ALLOWED_ORIGINS not set in production. CORS will block all cross-origin requests. Set ALLOWED_ORIGINS to your domain(s).');
}

// Configure session store - PostgreSQL for production, development fallback
let sessionStore;
if (isProduction || process.env.USE_PG_SESSIONS === 'true') {
  const PostgreSqlStore = ConnectPgSimple(session);
  const sessionPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    min: 1,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
  
  sessionStore = new PostgreSqlStore({
    pool: sessionPool,
    tableName: 'session',
    createTableIfMissing: true,
    schemaName: 'public',
    pruneSessionInterval: 300,
  });
  
  logger.info('🔒 Using PostgreSQL session store for production security');
} else {
  // Development fallback - but warn about production readiness
  const { default: MemoryStore } = await import('memorystore');
  const MemoryStoreSession = MemoryStore(session);
  sessionStore = new MemoryStoreSession({
    checkPeriod: 86400000,
    max: 1000,
    ttl: 24 * 60 * 60 * 1000
  });
  
  logger.info('⚠️ Using MemoryStore - NOT suitable for production deployment');
}

app.use(session({
  secret: (() => {
    if (process.env.SESSION_SECRET) {
      return process.env.SESSION_SECRET;
    }
    if (isProduction) {
      logger.error('🔥 FATAL: SESSION_SECRET environment variable is not set. Refusing to start with an insecure session secret in production.');
      process.exit(1);
    }
    return 'tpr-dev-only-secret-do-not-use-in-production';
  })(),
  name: 'tpr.session',
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    secure: isProduction, // SECURITY: Always secure in production
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax', // lax allows same-site navigation; strict breaks sessions on external-link navigation
    path: '/',
    domain: undefined
  },
  rolling: false
}));

// SECURITY FIX: Minimal session debugging that never exposes sensitive data
app.use((req, res, next) => {
  // Only enable detailed debugging in development and never log sensitive data
  if (process.env.NODE_ENV === 'development' && req.path.startsWith('/api')) {
    const hasSession = !!req.session;
    const hasUserId = !!req.session?.userId;
    
    logger.info(`🔍 Session Debug [${req.method} ${req.path}]:`, {
      hasSession,
      hasUserId,
      // SECURITY: Never log actual session IDs, cookie values, or session data
      sessionExists: hasSession ? 'yes' : 'no'
    });
  }
  next();
});

// Load user middleware
app.use(loadUser);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    logger.info('Starting TPR server', {
      environment: process.env.NODE_ENV || 'development',
      eventType: 'server_startup'
    });

    // Create HTTP server IMMEDIATELY so we can start listening fast
    const server = createHttpServer(app);

    // Start listening IMMEDIATELY - before heavy route registration
    const port = parseInt(process.env.PORT || '5000', 10);
    logger.info('🌐 Starting server...');
    server.listen({
      port,
      host: "0.0.0.0",
      reusePort: true,
    }, () => {
      logger.info('TPR server started successfully', {
        port: port,
        environment: process.env.NODE_ENV || 'development',
        eventType: 'server_ready',
        buildVersion: 'v2026.02.22.2'
      });
      logger.info('[BUILD] VERSION: v2026.02.22.2 - public logo endpoint + locked settings cache + direct branding');
      log(`serving on port ${port}`);
    });

    // Ensure management DB has platform_disabled_features column before route registration
    try {
      const { db: mgmtDb } = await import('./db');
      const { sql: sqlTag } = await import('drizzle-orm');
      await mgmtDb.execute(sqlTag`ALTER TABLE customers ADD COLUMN IF NOT EXISTS platform_disabled_features TEXT[] NOT NULL DEFAULT '{}'`);
      logger.info('✅ Management DB: platform_disabled_features column ensured');
    } catch (e: any) {
      logger.info(`⚠️ Management DB column check: ${e.message?.substring(0, 80)}`);
    }

    // Ensure bug_reports has diagnostic tracing columns
    try {
      const { db: mgmtDb2 } = await import('./db');
      const { sql: sqlTag2 } = await import('drizzle-orm');
      await mgmtDb2.execute(sqlTag2`
        ALTER TABLE bug_reports
          ADD COLUMN IF NOT EXISTS error_id    TEXT,
          ADD COLUMN IF NOT EXISTS breadcrumbs TEXT,
          ADD COLUMN IF NOT EXISTS app_version TEXT
      `);
      logger.info('✅ Management DB: bug_reports diagnostic columns ensured');
    } catch (e: any) {
      logger.info(`⚠️ Management DB bug_reports column check: ${e.message?.substring(0, 80)}`);
    }

    // Register all routes AFTER server is already listening
    logger.info('Registering routes');
    await registerRoutes(app, server);
    logger.info('Routes registered successfully');

    app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
      const errorId = 'ERR-' + Math.random().toString(16).slice(2, 7).toUpperCase();
      logger.error('🔥 Express error handler caught:', {
        errorId,
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        body: req.body,
        params: req.params,
        query: req.query
      });
      
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      const responseMessage = process.env.NODE_ENV === 'production' ? 'Internal Server Error' : message;
      
      if (!res.headersSent) {
        res.status(status).json({ error: responseMessage, errorId });
      }
    });

    // Static file serving MUST come after route registration
    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      app.use((req, res, next) => {
        if (req.path.endsWith('.html') || req.path === '/' || !req.path.includes('.')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
        next();
      });
      serveStatic(app);
    }

    // Mark app as fully ready - the temporary loading handler will now pass through
    appReady = true;
    logger.info('Application fully initialized and ready');

    // Run seeding in background (non-blocking)
    (async () => {
      try {
        logger.info('Initializing developer user');
        await AuthService.initializeDeveloperUser();

        logger.info('Seeding induction questions');
        const { seedInductionQuestions } = await import("./seedInductionQuestions");
        await seedInductionQuestions();
        
        const { seedInductionSettings } = await import("./seedInductionSettings");
        await seedInductionSettings();
        
        const { seedRoleSpecificQuestions } = await import("./seedRoleSpecificQuestions");
        await seedRoleSpecificQuestions();

        logger.info('🌱 Seeding UK H&S compliance documents...');
        const { seedUKHSDocuments } = await import("./seed-uk-hs-documents");
        await seedUKHSDocuments();

        logger.info('🌱 Seeding UK H&S document templates for all customers...');
        const { seedAllCustomerHSTemplates } = await import("./seed-isolated-hs-templates");
        await seedAllCustomerHSTemplates();

        logger.info('🌱 Seeding help system data...');
        const { seedHelpData } = await import("./seedHelpData");
        await seedHelpData();

        logger.info('✅ All seeding completed successfully');
      } catch (error) {
        logger.error("Failed to seed data:", error);
      }
    })();
  } catch (error) {
    logger.error('🔥 Failed to start server:', error);
    // Don't call process.exit() - let the deployment platform detect and restart
  }
})();
