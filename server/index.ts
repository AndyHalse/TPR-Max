import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import ConnectPgSimple from "connect-pg-simple";
import { Pool } from "pg";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { AuthService, loadUser } from "./auth";

// Global error handlers to prevent crashes
process.on('uncaughtException', (error) => {
  console.error('🔥 Uncaught Exception:', error);
  console.error('Stack trace:', error.stack);
  // Don't exit the process in development to keep the server running
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  // Don't exit the process in development to keep the server running
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

const app = express();

// Set trust proxy for proper session handling
app.set('trust proxy', 1);

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
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// SECURITY: Modern CSRF Protection using double-submit cookie pattern
function generateCSRFToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function createCSRFMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip CSRF for Stripe webhooks (they use signature verification)
    if (req.path === '/api/stripe/webhook') {
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
  console.error('🔥 FATAL: SESSION_SECRET environment variable is required in production');
  process.exit(1);
}

// Configure session store - PostgreSQL for production, development fallback
let sessionStore;
if (isProduction || process.env.USE_PG_SESSIONS === 'true') {
  const PostgreSqlStore = ConnectPgSimple(session);
  const sessionPool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  
  sessionStore = new PostgreSqlStore({
    pool: sessionPool,
    tableName: 'session',
    createTableIfMissing: true,
    schemaName: 'public'
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
  secret: process.env.SESSION_SECRET || 'visigate-pro-dev-secret-key-2024',
  name: 'visigate.session',
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    secure: isProduction, // SECURITY: Always secure in production
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: isProduction ? 'strict' : 'lax', // Stricter in production
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
    console.log('🚀 Starting VisiGate Pro server...');
    
    // Initialize developer user
    console.log('👤 Initializing developer user...');
    await AuthService.initializeDeveloperUser();
    
    console.log('🛣️ Registering routes...');
    const server = await registerRoutes(app);

    // Seed induction questions on startup
    try {
      console.log('🌱 Seeding induction questions...');
      const { seedInductionQuestions } = await import("./seedInductionQuestions");
      await seedInductionQuestions();
      
      // Seed induction settings for videos
      const { seedInductionSettings } = await import("./seedInductionSettings");
      await seedInductionSettings();
      
      // Seed role-specific questions
      const { seedRoleSpecificQuestions } = await import("./seedRoleSpecificQuestions");
      await seedRoleSpecificQuestions();

      // Seed UK H&S compliance documents
      console.log('🌱 Seeding UK H&S compliance documents...');
      const { seedUKHSDocuments } = await import("./seed-uk-hs-documents");
      await seedUKHSDocuments();
    } catch (error) {
      console.error("Failed to seed induction data:", error);
    }

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

    // Don't expose detailed error messages in production
    const responseMessage = process.env.NODE_ENV === 'production' ? 'Internal Server Error' : message;
    
    if (!res.headersSent) {
      res.status(status).json({ error: responseMessage });
    }
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
    console.log('🌐 Starting server...');
    server.listen({
      port,
      host: "0.0.0.0",
      reusePort: true,
    }, () => {
      console.log('✅ ViliGate Pro server started successfully!');
      log(`serving on port ${port}`);
    });
  } catch (error) {
    console.error('🔥 Failed to start server:', error);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
})();
