import rateLimit from 'express-rate-limit';

// ── BioStar 2 Live Event Log ────────────────────────────────────────────────
// In-memory ring buffer: stores the last 200 webhook events per customer.
// Events are visible via GET /api/biostar/webhook-log for the Live Log UI.
const BIOSTAR_LOG_MAX = 200;

// In-memory cache: PPM access_token → { customerId, expiresAt }
// Avoids full cross-tenant scans on every public contractor request.
// Entries are evicted on token rotation (write operations) and on expiry.
const ppmTokenCache = new Map<string, { customerId: string; expiresAt: Date }>();
function ppmTokenCacheGet(token: string): string | null {
  const entry = ppmTokenCache.get(token);
  if (!entry) return null;
  if (new Date() > entry.expiresAt) { ppmTokenCache.delete(token); return null; }
  return entry.customerId;
}
function ppmTokenCacheSet(token: string, customerId: string, expiresAt: Date) {
  ppmTokenCache.set(token, { customerId, expiresAt });
}
function ppmTokenCacheEvict(token: string) {
  ppmTokenCache.delete(token);
}

// Rate limiter for PPM public contractor endpoints.
// Unknown/abusive tokens hit the slow cross-tenant scan, so limiting here
// prevents scan-based denial-of-service from a single IP.
// Configure via env vars: PPM_RATE_LIMIT (default 60) and PPM_RATE_WINDOW_MS (default 60000).
// NOTE: express-rate-limit's default store is in-memory per process. For multi-process /
// multi-server deployments, swap the store for a shared Redis store without changing routes.
const ppmPublicRateLimit = rateLimit({
  windowMs: parseInt(process.env.PPM_RATE_WINDOW_MS ?? "60000", 10),
  max: parseInt(process.env.PPM_RATE_LIMIT ?? "60", 10),
  standardHeaders: true,  // sends Retry-After and RateLimit-* headers
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});

interface BiostarLiveEvent {
  id: string;                   // UUID
  ts: string;                   // ISO datetime
  customerId: string;
  userId: string;
  userName?: string;
  deviceId: string;
  deviceName: string;
  deviceRole?: string;          // ENTRY | EXIT | ENTRY_EXIT | IGNORE
  eventCode: string;
  action: string;               // checked_in | checked_out | ignored | no_match | no_change
  rawPayload?: any;
}
const biostarLiveLog = new Map<string, BiostarLiveEvent[]>();

function pushBiostarEvent(customerId: string, event: BiostarLiveEvent) {
  if (!biostarLiveLog.has(customerId)) biostarLiveLog.set(customerId, []);
  const log = biostarLiveLog.get(customerId)!;
  log.unshift(event); // newest first
  if (log.length > BIOSTAR_LOG_MAX) log.splice(BIOSTAR_LOG_MAX);
}
// ────────────────────────────────────────────────────────────────────────────

export {
  BIOSTAR_LOG_MAX,
  BiostarLiveEvent,
  ppmTokenCache,
  ppmTokenCacheGet,
  ppmTokenCacheSet,
  ppmTokenCacheEvict,
  ppmPublicRateLimit,
  biostarLiveLog,
  pushBiostarEvent,
};
