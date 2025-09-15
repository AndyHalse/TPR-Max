import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import MemoryStore from "memorystore";
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

// CORS middleware
app.use((req, res, next) => {
  // Allow specific origin instead of wildcard when using credentials
  const origin = req.headers.origin;
  if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('replit.dev'))) {
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

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Enhanced session configuration with proper store and debugging
const MemoryStoreSession = MemoryStore(session);

app.use(session({
  secret: process.env.SESSION_SECRET || 'visigate-pro-dev-secret-key-2024',
  name: 'visigate.session', // Custom session name
  resave: false,
  saveUninitialized: false,
  store: new MemoryStoreSession({
    checkPeriod: 86400000, // prune expired entries every 24h
    max: 1000, // max number of sessions
    ttl: 24 * 60 * 60 * 1000, // 24 hours
    dispose: function(key: string, sess: any) {
      console.log('🗑️ Session disposed:', key.substring(0, 8) + '...', sess?.userId || 'no-user');
    }
  }),
  cookie: {
    secure: false, // Set to true in production with HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax', // Critical for cross-origin requests
    path: '/', // Ensure cookie is sent with all requests
    domain: undefined // Let the browser determine the domain
  },
  rolling: true // Reset expiration on every request
}));

// Session debugging middleware - BEFORE loadUser
app.use((req, res, next) => {
  const sessionId = req.sessionID;
  const userId = req.session?.userId;
  const hasSession = !!req.session;
  const cookieHeader = req.headers.cookie;
  
  // Log detailed session info for API routes
  if (req.path.startsWith('/api')) {
    console.log(`🔍 Session Debug [${req.method} ${req.path}]:`, {
      sessionId: sessionId ? sessionId.substring(0, 8) + '...' : 'NONE',
      userId: userId || 'NONE',
      hasSession,
      cookies: cookieHeader ? 'present' : 'MISSING',
      sessionCookie: cookieHeader?.includes('visigate.session') ? 'present' : 'MISSING',
      userAgent: req.headers['user-agent'] ? req.headers['user-agent'].substring(0, 50) + '...' : 'missing'
    });
    
    // Log full cookie details for auth routes
    if (req.path.includes('/auth/')) {
      console.log(`🍪 Cookie Debug [${req.path}]:`, {
        fullCookieHeader: cookieHeader,
        sessionObj: req.session ? 'exists' : 'MISSING',
        sessionKeys: req.session ? Object.keys(req.session) : 'none'
      });
    }
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
