/**
 * server/app.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Exports createApp() — builds the fully-configured Express app + HTTP server
 * without starting to listen.  Called by:
 *   • server/index.ts  (production / development) — which then calls server.listen()
 *   • tests/           (test mode only)           — supertest calls it directly
 *
 * All middleware and route registration lives here so it is reusable.
 */

import express, { type Request, type Response, type NextFunction } from "express";
import helmet from "helmet";
import compression from "compression";
import session from "express-session";
import ConnectPgSimple from "connect-pg-simple";
import { Pool } from "pg";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import type { Server } from "http";
import { registerRoutes, createHttpServer } from "./routes";
import { loadUser } from "./auth";
import { logger, requestLoggingMiddleware } from "./utils/logger";

// ── Express type augmentation ─────────────────────────────────────────────────
declare global {
  namespace Express {
    interface Request {
      emergencyToken?: string;
    }
  }
}

// ── App-readiness flag ────────────────────────────────────────────────────────
// Starts FALSE only in production so the server can respond to health-checks
// immediately while routes are still registering.  In dev/test it starts TRUE.
let _appReady = process.env.NODE_ENV !== "production";

export function setAppReady(): void {
  _appReady = true;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function realClientIp(req: Request): string {
  const cf = req.headers["cf-connecting-ip"];
  if (cf && typeof cf === "string") return cf.trim();
  const xri = req.headers["x-real-ip"];
  if (xri && typeof xri === "string") return xri.trim();
  const xff = req.headers["x-forwarded-for"];
  if (xff) {
    const first = (Array.isArray(xff) ? xff[0] : xff).split(",")[0].trim();
    if (first) return first;
  }
  return req.ip ?? "0.0.0.0";
}

function generateCSRFToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function createCSRFMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // ── TEST MODE: skip CSRF entirely ─────────────────────────────────────────
    // Integration tests run without a browser; the CSRF double-submit pattern is
    // a browser security guarantee that does not apply to server-to-server calls.
    // The /api/__test__/session backdoor is only registered in test mode anyway.
    if (process.env.NODE_ENV === "test") return next();

    // Stripe webhooks use signature verification instead
    if (req.originalUrl === "/api/stripe/webhook") return next();

    // Emergency fire-marshal endpoints — authenticated by emergency token / fire-marshal URL ID
    if (
      req.originalUrl.startsWith("/api/emergency/active") ||
      req.originalUrl.startsWith("/api/emergency/accountability") ||
      req.originalUrl.startsWith("/api/emergency/mark-safe") ||
      req.originalUrl.startsWith("/api/emergency/unmark-safe") ||
      req.originalUrl.startsWith("/api/emergency/qr-mark-safe") ||
      req.originalUrl.startsWith("/api/emergency/sweep-zone") ||
      req.originalUrl.startsWith("/api/emergency/evacuation-note") ||
      req.originalUrl.startsWith("/api/emergency/evacuation-photo")
    ) {
      const emergencyToken =
        (req.headers["x-emergency-token"] as string) ||
        (req.query.token as string);
      const fireMarshalId = req.headers["x-fire-marshal-id"] as string;
      if (!emergencyToken && !fireMarshalId) {
        return res.status(401).json({
          error: "Emergency access requires valid token or Fire Marshal URL ID",
          code: "EMERGENCY_AUTH_REQUIRED",
        });
      }
      if (emergencyToken) req.emergencyToken = emergencyToken;
      return next();
    }

    if (req.originalUrl.startsWith("/api/emergency/complete-evacuation")) {
      const emergencyToken =
        (req.headers["x-emergency-token"] as string) ||
        (req.query.token as string);
      const fireMarshalId = req.headers["x-fire-marshal-id"] as string;
      if (emergencyToken) {
        req.emergencyToken = emergencyToken;
        return next();
      } else if (fireMarshalId) {
        return next();
      }
      // No fire-marshal credentials — fall through to standard CSRF check
    }

    // Public / kiosk / contractor-portal endpoints — no CSRF cookie available
    if (
      req.originalUrl === "/api/track" ||
      req.originalUrl.startsWith("/api/kiosk") ||
      req.originalUrl.startsWith("/api/fire-marshal") ||
      req.originalUrl.startsWith("/api/induction/public") ||
      req.originalUrl.startsWith("/api/induction/kiosk") ||
      req.originalUrl.startsWith("/api/muster/safe") ||
      req.originalUrl.startsWith("/api/ppm/work-order/public") ||
      req.originalUrl.startsWith("/api/nda/public") ||
      req.originalUrl.startsWith("/api/doc-request/") ||
      req.originalUrl.startsWith("/api/worker-doc-request/") ||
      req.originalUrl.startsWith("/api/contractor-portal/") ||
      req.originalUrl.startsWith("/api/audits/public/") ||
      req.originalUrl.startsWith("/api/induction/checkpoint/")
    ) {
      return next();
    }

    if (
      req.originalUrl.endsWith("/video-watched") ||
      req.originalUrl.endsWith("/submit-quiz")
    ) {
      return next();
    }

    if (
      req.originalUrl.startsWith("/api/visitors/") &&
      req.originalUrl.endsWith("/accept-hs-rules")
    ) {
      return next();
    }
    if (
      req.originalUrl.startsWith("/hs-contractor/") &&
      req.originalUrl.endsWith("/accept-rules")
    ) {
      return next();
    }

    // Login / logout / 2FA / platform-admin — no CSRF needed
    if (
      req.originalUrl === "/api/auth/login" ||
      req.originalUrl === "/api/auth/logout" ||
      req.originalUrl === "/api/auth/verify-2fa" ||
      req.originalUrl.startsWith("/platform-admin/") ||
      (process.env.NODE_ENV !== "production" &&
        req.originalUrl.startsWith("/api/super-admin/"))
    ) {
      return next();
    }

    // Safe HTTP methods
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

    // Double-submit cookie check
    const token = req.headers["x-csrf-token"] as string;
    const cookie = req.cookies?.["csrf-token"];
    if (!token || !cookie || token !== cookie) {
      return res
        .status(403)
        .json({ error: "CSRF token missing or invalid", code: "CSRF_INVALID" });
    }

    next();
  };
}

// ── createApp ─────────────────────────────────────────────────────────────────

export async function createApp(): Promise<{
  app: express.Express;
  server: Server;
}> {
  const app = express();

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            "'unsafe-eval'",
            "blob:",
            "https://replit.com",
          ],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "blob:",
            "https://fonts.googleapis.com",
          ],
          fontSrc: [
            "'self'",
            "blob:",
            "data:",
            "https://fonts.gstatic.com",
          ],
          imgSrc: ["'self'", "data:", "blob:", "https:"],
          connectSrc: ["'self'", "blob:", "https://api.stripe.com", "wss:"],
          mediaSrc: ["'self'", "blob:", "data:"],
          frameSrc: ["'self'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(compression({ level: 6, threshold: 1024 }));
  app.set("trust proxy", 1);

  // Readiness guard — returns a loading page until setAppReady() is called
  app.use((req, res, next) => {
    if (!_appReady) {
      return res
        .status(200)
        .send(
          '<!DOCTYPE html><html><head><title>TPR Max</title><meta http-equiv="refresh" content="3"></head><body><p>Starting up, please wait...</p></body></html>'
        );
    }
    next();
  });

  app.use(requestLoggingMiddleware);

  // CORS
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowedOrigins =
      process.env.NODE_ENV === "production"
        ? process.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim()) || []
        : [
            "http://localhost:5000",
            "https://localhost:5000",
            "http://127.0.0.1:5000",
            "https://127.0.0.1:5000",
          ];
    const isAllowed = allowedOrigins.some((allowedOrigin) => {
      if (!origin) return false;
      try {
        const originUrl = new URL(origin);
        const allowedUrl = allowedOrigin.includes("://")
          ? new URL(allowedOrigin)
          : new URL(`https://${allowedOrigin}`);
        return (
          originUrl.hostname === allowedUrl.hostname &&
          originUrl.port === allowedUrl.port
        );
      } catch {
        return origin === allowedOrigin;
      }
    });
    if (origin && isAllowed) res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization"
    );
    res.header("Access-Control-Allow-Credentials", "true");
    if (req.method === "OPTIONS") res.sendStatus(200);
    else next();
  });

  // Rate limiting
  const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    skipSuccessfulRequests: true,
    keyGenerator: realClientIp,
    validate: { keyGeneratorIpFallback: false },
    message: {
      error: "Too many authentication attempts, please try again later.",
      retryAfter: "15 minutes",
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      const ip = realClientIp(req);
      return ip === "127.0.0.1" || ip === "::1";
    },
  });

  const generalRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    keyGenerator: realClientIp,
    validate: { keyGeneratorIpFallback: false },
    message: {
      error: "Too many requests, please try again later.",
      retryAfter: "15 minutes",
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      const ip = realClientIp(req);
      return ip === "127.0.0.1" || ip === "::1";
    },
  });

  app.use("/api/auth", authRateLimit);
  app.use("/api/onboarding", authRateLimit);
  app.use("/api/contractor-portal/login", authRateLimit);
  app.use("/api/contractor-portal/accept-invite", authRateLimit);
  app.use("/api", generalRateLimit);

  app.use(cookieParser());
  app.use(express.json({ limit: "15mb" }));
  app.use(express.urlencoded({ extended: false, limit: "15mb" }));

  // CSRF token endpoint + middleware
  app.get("/api/csrf-token", (req, res) => {
    const token = generateCSRFToken();
    res.cookie("csrf-token", token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 8 * 60 * 60 * 1000,
    });
    res.json({ csrfToken: token });
  });
  app.use(createCSRFMiddleware());

  // Session store
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction && !process.env.SESSION_SECRET) {
    logger.error(
      "🔥 CRITICAL: SESSION_SECRET is required in production — using ephemeral secret (sessions will not survive restarts)"
    );
  }

  let sessionStore: any;
  if (isProduction || process.env.USE_PG_SESSIONS === "true") {
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
      tableName: "session",
      createTableIfMissing: true,
      schemaName: "public",
      pruneSessionInterval: 300,
    });
    logger.info("🔒 Using PostgreSQL session store");
  } else {
    const { default: MemoryStore } = await import("memorystore");
    const MemoryStoreSession = MemoryStore(session);
    sessionStore = new MemoryStoreSession({
      checkPeriod: 86400000,
      max: 1000,
      ttl: 24 * 60 * 60 * 1000,
    });
    logger.info("⚠️ Using MemoryStore — not suitable for production");
  }

  app.use(
    session({
      secret: (() => {
        if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
        if (isProduction) {
          logger.error(
            "🔥 FATAL: SESSION_SECRET not set in production — refusing to start"
          );
          process.exit(1);
        }
        return "tpr-dev-only-secret-do-not-use-in-production";
      })(),
      name: "tpr.session",
      resave: false,
      saveUninitialized: false,
      store: sessionStore,
      cookie: {
        secure: isProduction,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: "lax",
        path: "/",
        domain: undefined,
      },
      rolling: false,
    })
  );

  // Session debug logging (development only — never logs sensitive values)
  app.use((req, res, next) => {
    if (process.env.NODE_ENV === "development" && req.path.startsWith("/api")) {
      logger.info(`🔍 Session Debug [${req.method} ${req.path}]:`, {
        sessionExists: req.session ? "yes" : "no",
        hasUserId: !!(req.session as any)?.userId,
      });
    }
    next();
  });

  // Load authenticated user onto req.user / req.customerId
  app.use(loadUser);

  // Response timing logger
  app.use((req, res, next) => {
    const start = Date.now();
    const p = req.path;
    let capturedJson: Record<string, any> | undefined;
    const origJson = res.json.bind(res);
    res.json = function (body: any, ...args: any[]) {
      capturedJson = body;
      return origJson(body, ...args);
    };
    res.on("finish", () => {
      if (p.startsWith("/api")) {
        const duration = Date.now() - start;
        let line = `${req.method} ${p} ${res.statusCode} in ${duration}ms`;
        if (capturedJson) line += ` :: ${JSON.stringify(capturedJson)}`;
        if (line.length > 80) line = line.slice(0, 79) + "…";
        logger.debug(line);
      }
    });
    next();
  });

  // ── TEST-ONLY session injection backdoor ───────────────────────────────────
  // Allows integration tests to become any user without going through OTP/login.
  // MUST be unreachable in development and production — the NODE_ENV guard is
  // load-time, not request-time, so removing the guard makes it permanently live.
  if (process.env.NODE_ENV === "test") {
    /**
     * Inject an authenticated session in one atomic call so tests never rely on
     * the auto-save timing of secondary requests like /api/enterprise/active-site.
     *
     * Body: { userId: string; customerId: string; activeSiteId?: string }
     *
     * The session is saved with an explicit callback before 200 is returned,
     * guaranteeing that every subsequent request from the same supertest agent
     * will read the correct session fields.
     */
    app.post("/api/__test__/session", (req, res) => {
      const { userId, customerId, activeSiteId } = req.body as {
        userId: string;
        customerId: string;
        activeSiteId?: string;
      };
      if (!userId || !customerId) {
        return res
          .status(400)
          .json({ error: "userId and customerId are required" });
      }
      (req.session as any).userId = userId;
      (req.session as any).customerId = customerId;
      if (activeSiteId) (req.session as any).activeSiteId = activeSiteId;
      req.session.save((err) => {
        if (err) {
          logger.error("[__test__/session] session save failed:", err);
          return res.status(500).json({ error: "Session save failed" });
        }
        res.json({ ok: true, activeSiteId: activeSiteId ?? null });
      });
    });
  }

  // Register all API + WebSocket routes
  const server = createHttpServer(app);
  await registerRoutes(app, server);

  // Global error handler — must be registered AFTER all routes
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const errorId = "ERR-" + Math.random().toString(16).slice(2, 7).toUpperCase();
    logger.error("🔥 Express error handler caught:", {
      errorId,
      error: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method,
    });
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    const responseMessage =
      process.env.NODE_ENV === "production" ? "Internal Server Error" : message;
    if (!res.headersSent) res.status(status).json({ error: responseMessage, errorId });
  });

  return { app, server };
}
