import express, { type Request, Response, NextFunction } from "express";
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
    console.error('🔥 FATAL: DEV_AUTH_BYPASS or DEV_DATA_BYPASS must NOT be set in production. Refusing to start.');
    process.exit(1);
  }
}

// Ensure Puppeteer Chrome binary is available (used for PDF report generation)
async function ensureChromeBinary() {
  try {
    const { execSync } = await import('child_process');
    execSync('npx puppeteer browsers install chrome', { stdio: 'inherit', timeout: 120000 });
    console.log('✅ Puppeteer Chrome binary ready');
  } catch (e: any) {
    console.warn('⚠️ Could not install Puppeteer Chrome — PDF generation will fall back to HTML:', e.message);
  }
}
ensureChromeBinary();

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

// SECURITY: Rate limiting for authentication and sensitive routes
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs for auth
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for trusted internal calls
  skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1'
});

const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes  
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: {
    error: 'Too many requests, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1'
});

// Apply rate limiting
app.use('/api/auth', authRateLimit);
app.use('/api/onboarding', authRateLimit);
app.use('/api', generalRateLimit);

app.use(cookieParser());
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: false, limit: '200mb' }));

// SECURITY: Modern CSRF Protection using double-submit cookie pattern
function generateCSRFToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function createCSRFMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    console.log(`🔍 CSRF Check: ${req.method} ${req.originalUrl}, NODE_ENV: ${process.env.NODE_ENV}`);
    
    // Skip CSRF for Stripe webhooks (they use signature verification)
    if (req.originalUrl === '/api/stripe/webhook') {
      console.log(`✅ CSRF EXEMPTION: Stripe webhook`);
      return next();
    }
    
    // Emergency Fire Marshal read-only endpoints require valid emergency token OR Fire Marshal URL ID
    // But emergency activation requires normal authentication (admin only)
    // Also includes muster points management for Fire Marshals
    if (req.originalUrl.startsWith('/api/emergency/active') ||
        req.originalUrl.startsWith('/api/emergency/accountability') ||
        req.originalUrl.startsWith('/api/emergency/mark-safe') ||
        req.originalUrl.startsWith('/api/emergency/qr-mark-safe') ||
        req.originalUrl.startsWith('/api/muster-points')) {
      // Check for emergency token in Authorization header or query parameter
      const emergencyToken = req.headers['x-emergency-token'] as string || req.query.token as string;
      const fireMarshalId = req.headers['x-fire-marshal-id'] as string;
      
      console.log(`🔍 [MIDDLEWARE] Token extraction: emergencyToken=${req.headers['x-emergency-token'] ? 'YES' : 'NO'}, query=${req.query.token ? 'YES' : 'NO'}, fireMarshalId=${fireMarshalId ? 'YES' : 'NO'}`);
      
      // Allow if either emergency token OR Fire Marshal URL ID is present
      if (!emergencyToken && !fireMarshalId) {
        console.log(`❌ CSRF/AUTH FAILURE: Emergency endpoint requires valid token or Fire Marshal URL ID`);
        return res.status(401).json({ 
          error: 'Emergency access requires valid token or Fire Marshal URL ID',
          code: 'EMERGENCY_AUTH_REQUIRED'
        });
      }
      
      // Store token in request for validation in routes (if present)
      if (emergencyToken) {
        req.emergencyToken = emergencyToken;
        console.log(`✅ CSRF EXEMPTION: Emergency endpoint with emergency token: ${emergencyToken.substring(0, 20)}...`);
      } else if (fireMarshalId) {
        console.log(`✅ CSRF EXEMPTION: Emergency endpoint with Fire Marshal URL ID: ${fireMarshalId}`);
      }
      return next();
    }
    
    // complete-evacuation is handled by the core functionality exemption below.
    // It supports three auth methods (emergency token, fire marshal ID, admin session)
    // all checked directly in the route handler — session middleware runs after CSRF here.
    
    // Skip CSRF only for requests that originate outside the browser app
    // (kiosk devices, public self-service links, fire-marshal mobile URLs)
    if (req.originalUrl.startsWith('/api/kiosk') ||
        req.originalUrl.startsWith('/api/fire-marshal') ||
        req.originalUrl.startsWith('/api/induction/public') ||
        req.originalUrl.startsWith('/api/induction/kiosk') ||
        req.originalUrl.startsWith('/api/muster/safe')) {
      console.log(`✅ CSRF EXEMPTION: External/public endpoint`);
      return next();
    }
    
    // Skip CSRF for login/logout and platform-admin auth only
    if (req.originalUrl === '/api/auth/login' || 
        req.originalUrl === '/api/auth/logout' ||
        req.originalUrl.startsWith('/platform-admin/auth') ||
        (process.env.NODE_ENV !== 'production' && req.originalUrl.startsWith('/api/super-admin/'))) {
      console.log(`✅ CSRF EXEMPTION: Login/admin endpoint`);
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
    maxAge: 60 * 60 * 1000 // 1 hour
  });
  
  res.json({ csrfToken: token });
});

// Apply CSRF protection to all routes except safe methods and excluded paths
app.use(createCSRFMiddleware());

// PRODUCTION-READY session configuration with PostgreSQL store
const isProduction = process.env.NODE_ENV === 'production';

// Validate required session secret in production
if (isProduction && !process.env.SESSION_SECRET) {
  console.error('🔥 CRITICAL: SESSION_SECRET environment variable is required in production! Using a random ephemeral secret (sessions will not survive restarts).');
}

// Validate CORS origins are set in production
if (isProduction && !process.env.ALLOWED_ORIGINS) {
  console.warn('⚠️ WARNING: ALLOWED_ORIGINS not set in production. CORS will block all cross-origin requests. Set ALLOWED_ORIGINS to your domain(s).');
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
  
  console.log('🔒 Using PostgreSQL session store for production security');
} else {
  // Development fallback - but warn about production readiness
  const { default: MemoryStore } = await import('memorystore');
  const MemoryStoreSession = MemoryStore(session);
  sessionStore = new MemoryStoreSession({
    checkPeriod: 86400000,
    max: 1000,
    ttl: 24 * 60 * 60 * 1000
  });
  
  console.log('⚠️ Using MemoryStore - NOT suitable for production deployment');
}

app.use(session({
  secret: process.env.SESSION_SECRET || (isProduction ? crypto.randomBytes(32).toString('hex') : 'visigate-pro-dev-secret-key-2024'),
  name: 'visigate.session',
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
    
    console.log(`🔍 Session Debug [${req.method} ${req.path}]:`, {
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
    logger.info('Starting VisiGate Pro server', {
      environment: process.env.NODE_ENV || 'development',
      eventType: 'server_startup'
    });

    // Create HTTP server IMMEDIATELY so we can start listening fast
    const server = createHttpServer(app);

    // Start listening IMMEDIATELY - before heavy route registration
    const port = parseInt(process.env.PORT || '5000', 10);
    console.log('🌐 Starting server...');
    server.listen({
      port,
      host: "0.0.0.0",
      reusePort: true,
    }, () => {
      logger.info('VisiGate Pro server started successfully', {
        port: port,
        environment: process.env.NODE_ENV || 'development',
        eventType: 'server_ready',
        buildVersion: 'v2026.02.22.2'
      });
      console.log('[BUILD] VERSION: v2026.02.22.2 - public logo endpoint + locked settings cache + direct branding');
      log(`serving on port ${port}`);
    });

    // Register all routes AFTER server is already listening
    logger.info('Registering routes');
    await registerRoutes(app, server);
    logger.info('Routes registered successfully');

    app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
      console.error('🔥 Express error handler caught:', {
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
        res.status(status).json({ error: responseMessage });
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

        console.log('🌱 Seeding UK H&S compliance documents...');
        const { seedUKHSDocuments } = await import("./seed-uk-hs-documents");
        await seedUKHSDocuments();

        console.log('🌱 Seeding UK H&S document templates for all customers...');
        const { seedAllCustomerHSTemplates } = await import("./seed-isolated-hs-templates");
        await seedAllCustomerHSTemplates();

        console.log('🌱 Seeding help system data...');
        const { seedHelpData } = await import("./seedHelpData");
        await seedHelpData();

        console.log('✅ All seeding completed successfully');
      } catch (error) {
        console.error("Failed to seed data:", error);
      }
    })();
  } catch (error) {
    console.error('🔥 Failed to start server:', error);
    // Don't call process.exit() - let the deployment platform detect and restart
  }
})();
