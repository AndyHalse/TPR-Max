import fetch from 'node-fetch';
import https from 'https';
import WebSocket from 'ws';
import { logger } from './utils/logger';

// Rate-limit repetitive Biostar error logs so one bad credential set can't
// flood the log stream. Each unique key (e.g. `login:<serverUrl>`) is allowed
// to emit at most one error per RATE_LIMIT_MS milliseconds.
const _errorLoggedAt = new Map<string, number>();
const RATE_LIMIT_MS = 10 * 60 * 1000; // 10 minutes
function rateLimitedWarn(key: string, msg: string): void {
  const last = _errorLoggedAt.get(key) ?? 0;
  if (Date.now() - last >= RATE_LIMIT_MS) {
    _errorLoggedAt.set(key, Date.now());
    logger.warn(msg);
  }
}

// HTTPS agent that accepts self-signed certificates (Biostar servers often use them)
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * Biostar 2 API Service
 * Handles authentication and communication with Biostar 2 Local API Server
 * 
 * Authentication Flow (Biostar 2 Local API):
 * 1. Login with credentials to get session ID from response headers
 * 2. Session ID (bs-session-id) is used for subsequent requests
 * 3. Session expires after timeout, re-authentication required
 */

export interface BiostarConfig {
  serverUrl: string; // e.g., "http://192.168.1.100:8795" or "https://biostar.company.com:8443"
  username: string; // Admin login ID
  password: string; // Admin password
  databaseId?: string; // Database ID (default: "1")
}

export interface BiostarUser {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  department?: string;
  barcodeNumber?: string;
  memberNumber?: string;
  photoUrl?: string;
  userGroupId?: string;
  startDateTime?: string;
  expireDateTime?: string;
  lastAccessTime?: string; // ISO timestamp of last card/fingerprint scan
}

export interface BiostarEventLog {
  id: string;
  deviceId: string;
  userId: string;
  eventTypeCode: string; // e.g., "4864" for 1:1 auth success
  eventTypeDesc: string; // human-readable description
  eventTime: string;     // ISO timestamp
  userName?: string;
  deviceName?: string;
}

// BioStar 2 event type codes that indicate a user has entered / is on-site.
//
// BioStar 2 Local API uses two event code ranges depending on version:
//
//   Old range (0x1xxx / 0x4xxx):  used by older BioStar 2 firmware and the legacy API
//   New range (0x5xxx):           used by BioStar 2 v2.7.10+ New Local API
//                                 0x5000 = Wiegand/card auth success
//                                 0x5100 = Card auth success
//                                 0x5200 = Fingerprint auth success
//                                 0x5300 = Face auth success
//                                 0x5400 = PIN auth success
//                                 0x5500 = Mobile auth success
//
// For single-door setups (X-Pass 2, BioStation, etc.) with no separate exit reader,
// ALL successful authentication events are treated as "entry / on-site".
// Direction is determined by the device role (ENTRY/EXIT) when that data is available.
export const BIOSTAR_ENTRY_EVENT_CODES = new Set([
  // ── New Local API range (v2.7.10+, 0x5xxx) ─────────────────────────────
  '20480',  // 0x5000 — Wiegand / card auth success
  '20736',  // 0x5100 — Card auth success (most common with X-Pass 2)
  '20992',  // 0x5200 — Fingerprint auth success
  '21248',  // 0x5300 — Face auth success
  '21504',  // 0x5400 — PIN auth success
  '21760',  // 0x5500 — Mobile auth success

  // ── Old Local API range (legacy firmware, 0x1xxx / 0x4xxx) ─────────────
  '4864',   // 0x1300 — Card 1:N auth success
  '4865',   // 0x1301 — Card 1:1 auth success (also seen on entry-only readers)
  '4866',   // 0x1302 — Card + PIN auth success
  '4867',   // 0x1303 — Card + Fingerprint auth success
  '4096',   // 0x1000 — Fingerprint 1:N auth success
  '4098',   // 0x1002 — Card auth success (alternative)
  '4100',   // 0x1004 — Card + Fingerprint auth success
  '4102',   // 0x1006 — Card + PIN + Fingerprint auth success
  '4104',   // 0x1008 — Mobile auth success
  '4352',   // 0x1100 — Access granted (zone entry)
  '16384',  // 0x4000 — Legacy access-granted (older BioStar versions)

  '1',      // Generic authentication success (some firmware variants)
  '2',      // Access granted (some firmware variants)
]);

// Event codes that specifically indicate an EXIT event.
// These are only meaningful when a SEPARATE exit reader is configured.
// If a device is marked as ENTRY in device roles, ignore these exit codes.
// Note: 4865 removed from exit-only — it's a valid entry code on entry-only readers.
export const BIOSTAR_EXIT_EVENT_CODES = new Set([
  // ── New Local API range (0x6xxx) ────────────────────────────────────────
  '24576',  // 0x6000 — Exit authentication success (Wiegand)
  '24832',  // 0x6100 — Exit card auth success
  '25088',  // 0x6200 — Exit fingerprint auth success
  '25344',  // 0x6300 — Exit face auth success

  // ── Old Local API range ─────────────────────────────────────────────────
  '4097',   // 0x1001 — 1:N Auth. Success on exit reader
  '4353',   // 0x1101 — Access granted (zone exit)
  '16385',  // 0x4001 — Legacy exit code
]);

// Map a raw BioStar 2 event row to our BiostarEventLog shape.
// BioStar 2 nests IDs: user_id.id (old API) or user_id.user_id (new API v2.7.10+)
function mapBiostarEvent(raw: any): BiostarEventLog | null {
  // New Local API (v2.7.10+): user_id = { user_id: "2", user_name: "John" }
  // Old Local API:             user_id = { id: "2",      user_name: "John" }
  // Webhook payload:           user_id = { id: "2" } or plain string
  const userId =
    raw?.user_id?.user_id ?? raw?.user_id?.id ?? raw?.userId ?? (typeof raw?.user_id === 'string' || typeof raw?.user_id === 'number' ? raw?.user_id : '') ?? '';
  const userName =
    raw?.user_id?.user_name ?? raw?.user_id?.name ?? raw?.user_name ?? raw?.userName ?? undefined;

  // device can be { id, name } or plain
  const deviceId =
    raw?.device_id?.id ?? raw?.device_id ?? raw?.deviceId ?? '';
  const deviceName =
    raw?.device_id?.name ?? raw?.device_name ?? raw?.deviceName ?? undefined;

  // event_type_id can be { code, desc } or a plain code string
  const eventTypeCode = String(
    raw?.event_type_id?.code ?? raw?.event_type_id ?? raw?.eventTypeCode ?? raw?.event_type ?? ''
  );
  const eventTypeDesc =
    raw?.event_type_id?.desc ?? raw?.event_type_id?.description ?? raw?.eventTypeDesc ?? '';

  // timestamp: "datetime" in BioStar 2 Local API; "event_time" / "eventTime" as fallbacks
  const eventTime =
    raw?.datetime ?? raw?.event_time ?? raw?.eventTime ?? raw?.time ?? '';

  if (!userId || !eventTime) return null;

  return {
    id: String(raw?.id ?? raw?.index ?? ''),
    deviceId: String(deviceId),
    userId: String(userId),
    eventTypeCode,
    eventTypeDesc,
    eventTime,
    userName: userName ? String(userName) : undefined,
    deviceName: deviceName ? String(deviceName) : undefined,
  };
}

export interface BiostarConnectionStatus {
  connected: boolean;
  message: string;
  serverVersion?: string;
  databaseId?: string;
}

export interface BiostarDeviceInfo {
  id: string;
  name: string;
  model: string;
  ipAddress: string;
  deviceAddress?: string;
  deviceGroup?: string;
  deviceType?: string;
  status?: string;
}

// Extract a human-readable error from a Biostar error response body
function parseBiostarError(errorText: string): string {
  try {
    const parsed = JSON.parse(errorText);
    // Biostar wraps errors in { "Response": { "code": "101", "message": "..." } }
    if (parsed?.Response?.message) return parsed.Response.message;
    if (parsed?.message) return parsed.message;
    if (parsed?.error) return parsed.error;
  } catch {
    // not JSON — return raw text trimmed
  }
  return errorText.trim() || 'Unknown error';
}

// Map a raw Biostar API user record to BiostarUser interface.
// Biostar 2 Local API wraps the user ID: { "user_id": { "id": "123" } }
function mapBiostarUser(raw: any): BiostarUser {
  const id = raw?.user_id?.id ?? raw?.id ?? String(raw?.user_id ?? '');

  // Extract barcode/card number from the cards array.
  // Biostar 2 stores the actual QR/barcode value in different fields depending on
  // the API version and card type. We try all known locations in order of preference.
  const cards: any[] = Array.isArray(raw?.cards) ? raw.cards : [];
  if (cards.length > 0) {
    logger.debug(`🔍 Biostar card raw data for "${raw?.name}":`, JSON.stringify(cards[0]));
  }
  // Biostar 2 card structure (confirmed via API inspection):
  //   { "id": "1", "card_id": "654654654", "display_card_id": "654654654", ... }
  // card_id is a FLAT STRING (the actual QR/barcode number), NOT a nested object.
  // id is an internal DB record ID, NOT the card number.
  const firstCard = cards.find(c =>
    (typeof c?.card_id === 'string' && c.card_id) ||
    c?.display_card_id ||
    c?.card_number ||
    c?.uid
  ) ?? cards[0];
  const barcodeNumber =
    (typeof firstCard?.card_id === 'string' ? firstCard.card_id : undefined)       // flat string card_id (Biostar 2 format)
    ?? firstCard?.display_card_id                                                    // display_card_id fallback
    ?? firstCard?.card_number                                                        // direct card_number field
    ?? firstCard?.uid                                                                // UID field
    ?? (firstCard?.card_id?.id ? String(firstCard.card_id.id) : undefined)          // nested object format (older API)
    ?? undefined;

  // Member number is stored in custom_field_1 by convention (configurable in Biostar)
  const memberNumber = raw?.custom_field_1 || raw?.member_number || undefined;

  return {
    id,
    name: raw?.name ?? '',
    email: raw?.email || undefined,
    phone: raw?.phone || raw?.mobile || undefined,
    department: raw?.user_group?.name || undefined,
    barcodeNumber: barcodeNumber || undefined,
    memberNumber: memberNumber ? String(memberNumber) : undefined,
    photoUrl: raw?.photo_url || raw?.photoUrl || undefined,
    userGroupId: raw?.user_group?.id ?? raw?.userGroupId ?? undefined,
    startDateTime: raw?.start_datetime ?? raw?.startDateTime ?? undefined,
    expireDateTime: raw?.expire_datetime ?? raw?.expireDateTime ?? undefined,
    lastAccessTime: raw?.last_access_time ?? raw?.lastAccessTime ?? undefined,
  };
}

class BiostarService {
  private sessionId: string | null = null;
  private sessionExpiry: Date | null = null;
  private sessionCookies: string | null = null; // cookies returned by BioStar login (for web-session endpoints)
  private readonly SESSION_TIMEOUT_MS = 25 * 60 * 1000; // 25 minutes (sessions typically expire after 30 mins)

  /**
   * Normalize server URL to ensure it has the correct format
   */
  private normalizeServerUrl(url: string): string {
    // Remove trailing slash
    url = url.replace(/\/$/, '');
    
    // If URL doesn't include protocol, add http
    if (!url.match(/^https?:\/\//)) {
      url = `http://${url}`;
    }
    
    // Add default port if not specified (8795 for Local API)
    if (!url.match(/:\d+$/) && !url.includes('localhost')) {
      url = `${url}:8795`;
    }
    
    return url;
  }

  /**
   * Check if current session is still valid
   */
  private isSessionValid(): boolean {
    if (!this.sessionId || !this.sessionExpiry) {
      return false;
    }
    return new Date() < this.sessionExpiry;
  }

  /**
   * Login to Biostar 2 API and obtain session ID
   * Uses Biostar 2 Local API authentication (POST /api/login)
   */
  async login(config: BiostarConfig): Promise<void> {
    const serverUrl = this.normalizeServerUrl(config.serverUrl);
    const loginUrl = `${serverUrl}/api/login`;

    logger.debug(`🔐 Biostar: Attempting login to ${serverUrl}...`);

    // BioStar 2 marks sessions as "web" or "api" based on the User-Agent used during login.
    // Web-only endpoints (events, T&A) return 403 "by":"web" for api-classified sessions.
    // Using a real Chrome User-Agent makes BioStar 2 treat this as a web-browser session.
    const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    try {
      const response = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': BROWSER_UA,
          'Origin': serverUrl,
          'Referer': `${serverUrl}/`,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          User: {
            login_id: config.username,
            password: config.password,
            // client_type: "web" creates a web-session that can access
            // monitoring endpoints which are otherwise restricted ("by":"web")
            client_type: 'web',
          },
        }),
        // @ts-ignore - AbortSignal.timeout is available in Node 18+
        signal: AbortSignal.timeout(15000), // 15 second timeout
        // Accept self-signed certificates common on on-premise Biostar servers
        agent: loginUrl.startsWith('https') ? httpsAgent : undefined,
      } as any);

      if (!response.ok) {
        const errorText = await response.text();
        const friendlyMessage = parseBiostarError(errorText);
        rateLimitedWarn(`login:${serverUrl}`, `⚠️ Biostar login failed: ${response.status} — ${friendlyMessage} (rate-limited: next log in 10 min)`);
        throw new Error(`Login failed: ${friendlyMessage}`);
      }

      // Extract session ID from response headers
      const sessionId = response.headers.get('bs-session-id');
      
      if (!sessionId) {
        rateLimitedWarn(`login:${serverUrl}`, '⚠️ Biostar: No session ID in response headers (rate-limited: next log in 10 min)');
        throw new Error('No session ID received from Biostar server');
      }

      this.sessionId = sessionId;
      this.sessionExpiry = new Date(Date.now() + this.SESSION_TIMEOUT_MS);

      // Capture Set-Cookie headers so we can replay them as a Cookie header
      // in subsequent requests. BioStar 2 web-only endpoints check for a
      // valid browser cookie session in addition to (or instead of) bs-session-id.
      const rawSetCookie = response.headers.get('set-cookie');
      if (rawSetCookie) {
        // Collapse multiple Set-Cookie headers into a single Cookie string
        this.sessionCookies = rawSetCookie.split(',')
          .map(c => c.split(';')[0].trim())
          .filter(Boolean)
          .join('; ');
        logger.debug(`🍪 Biostar: Stored session cookies (${this.sessionCookies.length} chars)`);
      } else {
        this.sessionCookies = null;
      }

      logger.debug(`✅ Biostar: Login successful, session expires at ${this.sessionExpiry.toISOString()}`);
    } catch (error: any) {
      rateLimitedWarn(`login:${serverUrl}`, `⚠️ Biostar login error (will not repeat for 10 min): ${(error as any)?.message ?? error}`);
      
      if (error.name === 'AbortError') {
        throw new Error('Connection timeout - Biostar server may be unreachable');
      }
      
      // Re-throw without double-wrapping if already a meaningful message
      if (error.message.startsWith('Login failed:') || error.message.startsWith('Connection timeout')) {
        throw error;
      }
      
      throw new Error(`Failed to connect to Biostar server: ${error.message}`);
    }
  }

  /**
   * Ensure we have a valid session, re-authenticate if needed
   */
  private async ensureAuthenticated(config: BiostarConfig): Promise<void> {
    if (!this.isSessionValid()) {
      logger.debug('🔄 Biostar: Session expired or invalid, re-authenticating...');
      await this.login(config);
    }
  }

  /**
   * Make authenticated API request to Biostar
   */
  private async makeAuthenticatedRequest(
    config: BiostarConfig,
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: any
  ): Promise<any> {
    await this.ensureAuthenticated(config);

    const serverUrl = this.normalizeServerUrl(config.serverUrl);
    const url = `${serverUrl}${endpoint}`;

    const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'bs-session-id': this.sessionId!,
      // Mimic BioStar 2's own AngularJS web client so the server doesn't
      // block us with the "by":"web" restriction on event/monitoring endpoints.
      'User-Agent': BROWSER_UA,
      'Origin': serverUrl,
      'Referer': `${serverUrl}/`,
      'X-Requested-With': 'XMLHttpRequest',
    };
    // Replay any cookies BioStar 2 set during login — web-session endpoints
    // require these in addition to (or instead of) the bs-session-id header.
    if (this.sessionCookies) {
      headers['Cookie'] = this.sessionCookies;
    }
    const options: any = {
      method,
      headers,
      // @ts-ignore
      signal: AbortSignal.timeout(30000), // 30 second timeout for API calls
      // Accept self-signed certificates common on on-premise Biostar servers
      agent: url.startsWith('https') ? httpsAgent : undefined,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`❌ Biostar API error: ${response.status} - ${errorText}`);
        
        // Session might have expired
        if (response.status === 401) {
          logger.debug('🔄 Biostar: Session expired (401), re-authenticating...');
          this.sessionId = null;
          this.sessionExpiry = null;
          this.sessionCookies = null;
          return this.makeAuthenticatedRequest(config, endpoint, method, body);
        }
        
        const friendlyMessage = parseBiostarError(errorText);
        throw new Error(`API request failed: ${friendlyMessage}`);
      }

      const data = await response.json();
      return data;
    } catch (error: any) {
      logger.error(`❌ Biostar API request error:`, error);
      
      if (error.name === 'AbortError') {
        throw new Error('Request timeout - Biostar server may be slow or unreachable');
      }
      
      throw error;
    }
  }

  /**
   * Test connection to Biostar server
   */
  async testConnection(config: BiostarConfig): Promise<BiostarConnectionStatus> {
    try {
      await this.login(config);
      
      return {
        connected: true,
        message: 'Successfully connected to Biostar 2 server',
        serverVersion: 'Biostar 2 Local API',
        databaseId: config.databaseId || '1',
      };
    } catch (error: any) {
      return {
        connected: false,
        message: error.message || 'Failed to connect to Biostar server',
      };
    }
  }

  /**
   * Fetch one user's full record from Biostar, including cards/credentials.
   * GET /api/users/{id} returns the complete user object with cards array.
   */
  private async getUserById(config: BiostarConfig, userId: string): Promise<any | null> {
    try {
      const response = await this.makeAuthenticatedRequest(config, `/api/users/${userId}`);
      // Response is typically { UserCollection: { rows: [fullUser] } } or just the user object
      const row =
        response?.UserCollection?.rows?.[0] ??
        response?.User ??
        (Array.isArray(response?.rows) ? response.rows[0] : null) ??
        (response?.user_id ? response : null);
      return row ?? null;
    } catch (err: any) {
      logger.warn(`⚠️ Biostar: Could not fetch detail for user ${userId}: ${err.message}`);
      return null;
    }
  }

  /**
   * Fetch the list of physical reader devices from BioStar 2.
   * BioStar 2 endpoint: GET /api/devices
   * May return 403 in some permission configurations — silently returns [] in that case.
   */
  async getDevices(config: BiostarConfig): Promise<BiostarDeviceInfo[]> {
    try {
      const response = await this.makeAuthenticatedRequest(config, '/api/devices');
      const rows: any[] = response?.DeviceCollection?.rows ?? response?.rows ?? (Array.isArray(response) ? response : []);
      logger.debug(`📟 Biostar: Got ${rows.length} devices from /api/devices`);
      if (rows.length > 0) {
        logger.debug(`📟 Biostar: Device record keys:`, Object.keys(rows[0]).join(', '));
        const r0 = rows[0];
        logger.debug(`📟 Biostar: Sample device - group:`, JSON.stringify(r0?.device_group_id), `lan:`, JSON.stringify(r0?.lan), `type:`, JSON.stringify(r0?.device_type_id));
      }

      return rows.map((r: any) => {
        // BioStar 2 stores IP in `lan.ip_address`, group in `device_group_id.name`, type in `device_type_id.type_name`
        // Fallback: extract IP from device name e.g. "BioEntryW 543231711 (192.168.1.247)"
        const nameIpMatch = (r?.name ?? '').match(/\((\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\)/);
        const ip = r?.lan?.ip_address ?? r?.lan?.ip ?? r?.ip_address ?? r?.ip ?? nameIpMatch?.[1] ?? '';
        const group = r?.device_group_id?.name ?? r?.device_group?.name ?? r?.group_name ?? (typeof r?.device_group === 'string' ? r.device_group : '');
        const model = r?.device_type_id?.type_name ?? r?.model_name ?? r?.device_type?.model_name ?? r?.model ?? '';
        return {
          id: String(r?.id ?? r?.device_id?.id ?? r?.device_id ?? ''),
          name: r?.name ?? r?.device_name ?? `Device ${r?.id ?? '?'}`,
          model,
          ipAddress: ip,
          deviceAddress: ip,
          deviceGroup: group,
          deviceType: r?.device_type_id?.type_name ?? r?.device_type?.type_name ?? r?.type_name ?? '',
          status: r?.status ?? '',
        };
      }).filter(d => d.id && d.id !== '0');
    } catch (err: any) {
      // 403 is expected when API permission is restricted — log but don't throw
      logger.warn(`⚠️ Biostar: GET /api/devices failed (${err.message}) — returning empty device list`);
      return [];
    }
  }

  /**
   * Try to get last access info from door status endpoint.
   * GET /api/door returns door state without needing Event Log permissions.
   */
  async getDoorStatus(config: BiostarConfig): Promise<any[]> {
    try {
      const response = await this.makeAuthenticatedRequest(config, '/api/door');
      const rows = response?.DoorCollection?.rows ?? response?.rows ?? (Array.isArray(response) ? response : []);
      logger.debug(`🚪 Biostar: Got ${rows.length} doors from door status endpoint`);
      if (rows.length > 0) {
        logger.debug(`🚪 Biostar: Door record keys:`, Object.keys(rows[0]).join(', '));
      }
      return rows;
    } catch (err: any) {
      logger.warn(`⚠️ Biostar: Door status endpoint failed: ${err.message}`);
      return [];
    }
  }

  /**
   * Get list of all users from Biostar with full credential data (cards).
   *
   * Strategy (most compatible across Biostar versions):
   * 1. POST /api/users/search with select_columns including "cards" — works on newer versions
   * 2. If that returns no rows or 400, fall back to GET /api/users (list) for IDs,
   *    then GET /api/users/{id} per-user to fetch full records with card data.
   */
  async getUsers(config: BiostarConfig, limit: number = 1000, offset: number = 0): Promise<BiostarUser[]> {
    // --- Strategy 1: POST /api/users/search with explicit columns ---
    try {
      const searchBody = {
        UserCollection: {
          conditions: [],
          select_columns: [
            "user_id", "name", "email", "phone", "user_group",
            "cards", "custom_field_1", "start_datetime", "expire_datetime",
            "last_access_time",
          ],
          limit,
          offset,
        },
      };

      const response = await this.makeAuthenticatedRequest(
        config, '/api/users/search', 'POST', searchBody
      );

      const rawRows: any[] =
        response?.UserCollection?.rows ??
        response?.records ??
        response?.rows ??
        [];

      if (rawRows.length > 0) {
        const users = rawRows.map(mapBiostarUser).filter(u => u.id && u.name);
        const withCards = users.filter(u => u.barcodeNumber).length;
        logger.debug(`👥 Biostar: Retrieved ${users.length} users via search (${withCards} with card/QR data)`);
        return users;
      }
    } catch {
      // Search endpoint not supported on this version — continue to strategy 2
    }

    // --- Strategy 2: GET list for IDs, then GET /api/users/{id} for full detail ---
    logger.debug('🔄 Biostar: Fetching user list then individual records for full card data...');
    try {
      const listResponse = await this.makeAuthenticatedRequest(
        config, `/api/users?limit=${limit}&offset=${offset}`
      );

      const listRows: any[] =
        listResponse?.UserCollection?.rows ??
        listResponse?.records ??
        listResponse?.rows ??
        [];

      logger.debug(`👥 Biostar: Found ${listRows.length} users in list, fetching full records...`);

      const fullUsers: BiostarUser[] = [];
      for (const listRow of listRows) {
        // Extract the numeric user ID from the list record
        const userId = listRow?.user_id?.id ?? listRow?.id ?? String(listRow?.user_id ?? '');
        if (!userId) continue;

        // Fetch the full individual record which includes cards
        const fullRecord = await this.getUserById(config, userId);
        // Merge list row + full record so we preserve any fields from either source
        // (e.g. last_access_time may be in list response but not individual response)
        const raw = fullRecord ? { ...listRow, ...fullRecord } : listRow;
        const mapped = mapBiostarUser(raw);
        if (mapped.id && mapped.name) {
          if (mapped.barcodeNumber) {
            logger.debug(`🃏 Biostar: User "${mapped.name}" has card: ${mapped.barcodeNumber}`);
          }
          fullUsers.push(mapped);
        }
      }

      logger.debug(`👥 Biostar: Retrieved ${fullUsers.length} users with full detail (${fullUsers.filter(u => u.barcodeNumber).length} with card/QR data)`);
      return fullUsers;
    } catch (error: any) {
      logger.error('❌ Failed to fetch Biostar users:', error);
      throw error;
    }
  }

  /**
   * getLiveEventLog — fetches the most recent N events from BioStar 2 for the Live Log panel.
   * Tries multiple body/endpoint strategies because BioStar 2 API versions differ:
   *   v2.6-: GET /api/events?limit=N
   *   v2.7+: POST /api/events/search with EventCollection body
   *   v2.8+: POST with conditions array
   * Returns raw rows so the caller can format them for display.
   */
  async getLiveEventLog(
    config: BiostarConfig,
    limit: number = 200,
    fromDate?: Date,
    toDate?: Date
  ): Promise<{ rows: any[]; strategy?: string; error?: string }> {
    const pad = (n: number) => String(n).padStart(2, '0');
    // BioStar 2 accepts both "YYYY-MM-DDTHH:mm:ss" and "YYYY-MM-DD HH:mm:ss"
    const fmtT = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    const fmtSp = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

    const now = toDate ?? new Date();
    // Default: start of today in server local time
    const todayStart = fromDate ?? (() => {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    })();

    const errors: string[] = [];

    // Helper to extract row array from any BioStar response shape
    const extractRows = (r: any): any[] =>
      r?.EventCollection?.rows ??
      r?.rows ??
      r?.records ??
      (Array.isArray(r) ? r : []);

    // BioStar 2 /api/events/search requires filter arrays for each dimension.
    // Omitting them causes HTTP 500 / code 1000 "Something wrong with server".
    // Use id:"-1" as the "all / no filter" wildcard for each array field.
    const ALL = [{ id: '-1' }]; // BioStar 2 wildcard: "all items"

    const strategies: Array<{ label: string; fn: () => Promise<any> }> = [
      // 1. Full filter-array body (BioStar 2 Local API standard format)
      //    Includes event_type_id, device_id, user_id, door_id arrays.
      {
        label: 'POST /api/events/search (filter arrays + T-format dates)',
        fn: () => this.makeAuthenticatedRequest(config, '/api/events/search', 'POST', {
          EventCollection: {
            start_datetime:  fmtT(todayStart),
            end_datetime:    fmtT(now),
            event_type_id:   ALL,
            device_id:       ALL,
            user_id:         ALL,
            door_id:         ALL,
            limit,
            offset: 0,
          },
        }),
      },
      // 2. Same with space-separated datetime (some versions need this)
      {
        label: 'POST /api/events/search (filter arrays + space datetime)',
        fn: () => this.makeAuthenticatedRequest(config, '/api/events/search', 'POST', {
          EventCollection: {
            start_datetime:  fmtSp(todayStart),
            end_datetime:    fmtSp(now),
            event_type_id:   ALL,
            device_id:       ALL,
            user_id:         ALL,
            door_id:         ALL,
            limit,
            offset: 0,
          },
        }),
      },
      // 3. Filter arrays without any date range (fetch most-recent N events)
      {
        label: 'POST /api/events/search (filter arrays, no dates)',
        fn: () => this.makeAuthenticatedRequest(config, '/api/events/search', 'POST', {
          EventCollection: {
            event_type_id: ALL,
            device_id:     ALL,
            user_id:       ALL,
            door_id:       ALL,
            limit,
            offset: 0,
          },
        }),
      },
      // 4. Minimal filter — just event_type_id array + dates (some BioStar builds)
      {
        label: 'POST /api/events/search (event_type_id array only + dates)',
        fn: () => this.makeAuthenticatedRequest(config, '/api/events/search', 'POST', {
          EventCollection: {
            start_datetime: fmtT(todayStart),
            end_datetime:   fmtT(now),
            event_type_id:  ALL,
            limit,
            offset: 0,
          },
        }),
      },
      // 5. No filter arrays, plain dates only (older BioStar 2 versions)
      {
        label: 'POST /api/events/search (plain dates, no arrays)',
        fn: () => this.makeAuthenticatedRequest(config, '/api/events/search', 'POST', {
          EventCollection: {
            start_datetime: fmtT(todayStart),
            end_datetime:   fmtT(now),
            limit,
            offset: 0,
          },
        }),
      },
      // 6. GET with date query params (v2.6/v2.7 style)
      {
        label: `GET /api/events?start_datetime=...&limit=${limit}`,
        fn: () => this.makeAuthenticatedRequest(
          config,
          `/api/events?start_datetime=${encodeURIComponent(fmtT(todayStart))}&end_datetime=${encodeURIComponent(fmtT(now))}&limit=${limit}`
        ),
      },
      // 7. GET with just limit (widest net)
      {
        label: `GET /api/events?limit=${limit}`,
        fn: () => this.makeAuthenticatedRequest(config, `/api/events?limit=${limit}`),
      },
    ];

    for (const strategy of strategies) {
      try {
        const response = await strategy.fn();
        const rows = extractRows(response);
        if (rows.length > 0) {
          logger.debug(`📋 BioStar Live Log: ✅ ${rows.length} events via "${strategy.label}"`);
          return { rows, strategy: strategy.label };
        }
        if (response?.EventCollection?.total === 0) {
          logger.debug(`📋 BioStar Live Log: 0 total events for period (confirmed by "${strategy.label}")`);
          return { rows: [], strategy: strategy.label };
        }
        logger.debug(`📋 BioStar Live Log: "${strategy.label}" returned 0 rows`);
      } catch (err: any) {
        const msg = err.message ?? String(err);
        errors.push(`${strategy.label}: ${msg}`);
        logger.warn(`⚠️ BioStar Live Log: "${strategy.label}" failed: ${msg}`);
      }
    }

    // All strategies failed — return empty with consolidated error
    const errSummary = errors.join(' | ');
    logger.error(`❌ BioStar Live Log: all strategies failed. Errors: ${errSummary}`);

    // Provide a specific, actionable error message based on what errors occurred
    const has500 = errors.some(e => e.includes('Something wrong with server') || e.includes('500'));
    const has403 = errors.some(e => e.includes('Permission') || e.includes('403'));

    let errorMsg: string;
    if (has500 && has403) {
      errorMsg =
        'BioStar 2 event log not accessible. POST /api/events/search returned server error 500 ' +
        '(this endpoint may be disabled or unlicensed on this installation). ' +
        'GET /api/events returned 403 Permission Denied — BioStar 2 restricts this endpoint to its web UI only. ' +
        'To resolve: (1) In BioStar 2 → Settings → Server → enable "Use Local API"; ' +
        '(2) Ensure the API account has "Event Log" or "Monitoring" operator role; ' +
        '(3) Check BioStar 2 version supports Local API event search (v2.6+).';
    } else if (has500) {
      errorMsg =
        'BioStar 2 event search returned a server error (code 1000 — Something wrong with server). ' +
        'This usually means the event log feature is not configured on this BioStar 2 installation. ' +
        'Check: (1) BioStar 2 → Settings → Server → Local API is enabled; ' +
        '(2) Event log database is connected; (3) BioStar 2 version is 2.6 or later.';
    } else if (has403) {
      errorMsg =
        'BioStar 2 event log returned 403 Permission Denied (restricted to web UI sessions). ' +
        'The API account may not have "Monitoring" operator privileges. ' +
        'In BioStar 2 → Operator → edit the API user → enable "Monitoring" or "Report" access.';
    } else {
      errorMsg = errors.length
        ? `BioStar 2 event API returned no data. Errors: ${errors.slice(0, 2).join(' | ')}`
        : 'No events returned by any BioStar 2 API strategy.';
    }

    return { rows: [], error: errorMsg };
  }

  /**
   * Get recent event logs (access events) from BioStar 2.
   *
   * BioStar 2 Local API returns events in:
   *   { EventCollection: { total: N, rows: [...] } }
   * Each row has nested objects: user_id.id, device_id.id, event_type_id.code, datetime
   */
  async getEventLogs(
    config: BiostarConfig,
    startTime?: Date,
    endTime?: Date,
    limit: number = 1000
  ): Promise<BiostarEventLog[]> {
    // Default: start of today (go back 30 hours to cover any timezone offset between
    // the Replit server and the BioStar appliance so we never miss same-day events)
    const defaultStart = new Date();
    defaultStart.setHours(0, 0, 0, 0);
    defaultStart.setTime(defaultStart.getTime() - 2 * 60 * 60 * 1000); // subtract 2h for TZ safety
    const start = startTime ?? defaultStart;
    const end = endTime ?? new Date();

    // BioStar 2 expects ISO datetime strings, NOT Unix timestamps.
    // Format: "YYYY-MM-DDTHH:mm:ss" (no milliseconds, no trailing Z)
    const fmtBiostar = (d: Date) => {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };
    const startStr = fmtBiostar(start);
    const endStr   = fmtBiostar(end);

    logger.debug(`📋 Biostar: Querying events from ${startStr} to ${endStr}`);

    let rawRows: any[] = [];

    // ─────────────────────────────────────────────────────────────────────────────
    // Strategy 0: POST /api/events/search with NEW "Query" format (BioStar 2 v2.7.10+)
    //
    // BioStar 2 v2.7.10 introduced a completely new Local API that replaces the old
    // EventCollection format.  The key differences:
    //   • Uses "Query" wrapper with a "conditions" array (not "EventCollection" with filter arrays)
    //   • Datetime values MUST be full UTC ISO-8601 with milliseconds + Z suffix
    //     e.g. "2024-01-15T08:00:00.000Z"  (NOT "2024-01-15T08:00:00")
    //   • operator 3 = BETWEEN
    //
    // Reference: https://support.supremainc.com/en/support/solutions/articles/24000072557
    // ─────────────────────────────────────────────────────────────────────────────
    try {
      const queryBody = {
        Query: {
          limit,
          conditions: [
            {
              column: 'datetime',
              operator: 3, // BETWEEN
              values: [start.toISOString(), end.toISOString()],
            },
          ],
          orders: [{ column: 'datetime', descending: true }],
        },
      };
      const resp0 = await this.makeAuthenticatedRequest(config, '/api/events/search', 'POST', queryBody);
      rawRows =
        resp0?.EventCollection?.rows ??
        resp0?.rows ??
        (Array.isArray(resp0) ? resp0 : []);
      logger.debug(`📋 Biostar: Retrieved ${rawRows.length} raw events (POST Query v2.7.10+ format)`);
    } catch (err0: any) {
      logger.warn(`⚠️ Biostar Strategy 0 (Query v2.7.10+ format) failed: ${err0.message}`);
    }

    // If Strategy 0 returned rows, map and return immediately
    if (rawRows.length > 0) {
      const events0: BiostarEventLog[] = [];
      for (const row of rawRows) {
        const mapped = mapBiostarEvent(row);
        if (mapped) events0.push(mapped);
      }
      return events0;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Legacy strategies (BioStar 2 older versions that use EventCollection format)
    // ─────────────────────────────────────────────────────────────────────────────

    // BioStar 2 /api/events/search requires filter arrays for each dimension.
    // Without them the server returns HTTP 500 / code 1000 "Something wrong with server".
    // id:"-1" is the BioStar 2 wildcard for "all items" (no filter).
    const ALL = [{ id: '-1' }];

    // Strategy 1: POST /api/events/search with required filter arrays
    try {
      const body = {
        EventCollection: {
          start_datetime: startStr,
          end_datetime:   endStr,
          event_type_id:  ALL,
          device_id:      ALL,
          user_id:        ALL,
          door_id:        ALL,
          limit,
          offset: 0,
        },
      };
      const response = await this.makeAuthenticatedRequest(config, '/api/events/search', 'POST', body);
      rawRows =
        response?.EventCollection?.rows ??
        response?.records ??
        response?.rows ??
        (Array.isArray(response) ? response : []);
      logger.debug(`📋 Biostar: Retrieved ${rawRows.length} raw events (POST /api/events/search)`);
    } catch (err: any) {
      logger.warn(`⚠️ Biostar POST /api/events/search (with filter arrays) failed: ${err.message}`);

      // Strategy 2: POST with space-separated datetime
      const triedStrategies: string[] = [`POST filter-arrays+T-format: ${err.message}`];
      let postSpaceOk = false;
      try {
        const fmtSp = (d: Date) => {
          const pad = (n: number) => String(n).padStart(2, '0');
          return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        };
        const response = await this.makeAuthenticatedRequest(config, '/api/events/search', 'POST', {
          EventCollection: { start_datetime: fmtSp(start), end_datetime: fmtSp(end), event_type_id: ALL, device_id: ALL, user_id: ALL, door_id: ALL, limit, offset: 0 },
        });
        rawRows = response?.EventCollection?.rows ?? response?.records ?? response?.rows ?? (Array.isArray(response) ? response : []);
        logger.debug(`📋 Biostar: Retrieved ${rawRows.length} raw events (POST space-datetime)`);
        postSpaceOk = true;
      } catch (e2: any) {
        triedStrategies.push(`POST filter-arrays+space-datetime: ${e2.message}`);
      }

      if (!postSpaceOk) {
        // Strategy 3: POST with no dates (just filter arrays + limit)
        let postNoDatesOk = false;
        try {
          const response = await this.makeAuthenticatedRequest(config, '/api/events/search', 'POST', {
            EventCollection: { event_type_id: ALL, device_id: ALL, user_id: ALL, door_id: ALL, limit, offset: 0 },
          });
          rawRows = response?.EventCollection?.rows ?? response?.records ?? response?.rows ?? (Array.isArray(response) ? response : []);
          logger.debug(`📋 Biostar: Retrieved ${rawRows.length} raw events (POST no-dates)`);
          postNoDatesOk = true;
        } catch (e3: any) {
          triedStrategies.push(`POST filter-arrays+no-dates: ${e3.message}`);
        }

        if (!postNoDatesOk) {
          // Strategy 4: GET /api/events with date params (Origin+Referer+X-Requested-With now included)
          let getDateOk = false;
          try {
            const endpoint = `/api/events?start_datetime=${encodeURIComponent(startStr)}&end_datetime=${encodeURIComponent(endStr)}&limit=${limit}`;
            const response = await this.makeAuthenticatedRequest(config, endpoint);
            rawRows = response?.EventCollection?.rows ?? response?.records ?? response?.rows ?? (Array.isArray(response) ? response : []);
            logger.debug(`📋 Biostar: Retrieved ${rawRows.length} raw events (GET /api/events?dates)`);
            getDateOk = true;
          } catch (e4: any) {
            triedStrategies.push(`GET /api/events?dates: ${e4.message}`);
          }

          if (!getDateOk) {
            // Strategy 5: GET /api/events with just limit
            try {
              const response = await this.makeAuthenticatedRequest(config, `/api/events?limit=${limit}`);
              rawRows = response?.EventCollection?.rows ?? response?.records ?? response?.rows ?? (Array.isArray(response) ? response : []);
              logger.debug(`📋 Biostar: Retrieved ${rawRows.length} raw events (GET /api/events?limit)`);
            } catch (e5: any) {
              triedStrategies.push(`GET /api/events?limit: ${e5.message}`);
              logger.error(`❌ Biostar: All event strategies failed: ${triedStrategies.join(' | ')}`);
              throw new Error(`Event log unavailable: ${triedStrategies.at(-1)}`);
            }
          }
        }
      }
    }

    // Map raw rows → typed BiostarEventLog objects
    const events: BiostarEventLog[] = [];
    for (const row of rawRows) {
      const mapped = mapBiostarEvent(row);
      if (mapped) events.push(mapped);
    }
    return events;
  }

  /**
   * Determine the on-site direction for a single event given its device role.
   *
   * @param eventTypeCode  BioStar event code (as string)
   * @param deviceRole     ENTRY | EXIT | ENTRY_EXIT | IGNORE (from biostarDevices table)
   * @returns 'ENTRY' | 'EXIT' | 'IGNORE' | null  (null = event is not an auth event at all)
   */
  static resolveEventDirection(
    eventTypeCode: string,
    deviceRole: string,
  ): 'ENTRY' | 'EXIT' | 'IGNORE' | null {
    const isKnownEntry = BIOSTAR_ENTRY_EVENT_CODES.has(eventTypeCode);
    const isKnownExit  = BIOSTAR_EXIT_EVENT_CODES.has(eventTypeCode);

    // If the event code is not any kind of auth event, skip it entirely.
    // This eliminates door-open, schedule, admin, and zone events from the
    // on-site calculation — they are NOT card/fingerprint/face scans.
    if (!isKnownEntry && !isKnownExit) return null;

    // Device role takes priority over event code for direction
    switch (deviceRole.toUpperCase()) {
      case 'ENTRY': return 'ENTRY';           // admin marked this reader as entry-only
      case 'EXIT':  return 'EXIT';            // admin marked this reader as exit-only
      case 'IGNORE': return 'IGNORE';         // admin told us to ignore this reader
      case 'ENTRY_EXIT':
      default:
        // Dual-purpose reader — use the event code to determine direction
        if (isKnownExit) return 'EXIT';
        return 'ENTRY';   // auth success on ENTRY_EXIT device → assume entry
    }
  }

  async getCurrentOnSiteUsers(
    config: BiostarConfig,
    // deviceRoles maps BioStar device ID → admin-assigned role (ENTRY/EXIT/ENTRY_EXIT/IGNORE).
    // Populated by pollBiostarAttendance from the biostar_devices table.
    // When omitted every device is treated as ENTRY_EXIT (code-based detection).
    deviceRoles: Record<string, string> = {},
  ): Promise<{ userId: string; userName: string; lastAccessTime: string; eventCode: string; deviceId: string }[]> {
    // --- Primary: event log API ---
    let events: BiostarEventLog[] = [];
    let eventsAvailable = false;
    try {
      events = await this.getEventLogs(config);
      eventsAvailable = true;
    } catch (err: any) {
      logger.warn(`⚠️ Biostar: Event log API unavailable (${err.message}), falling back to last_access_time`);
    }

    if (eventsAvailable && events.length > 0) {
      // Log ALL distinct event codes today so the admin can see what's happening
      const uniqueCodes = [...new Set(events.map(e => `${e.eventTypeCode}(${e.eventTypeDesc})`))];
      logger.debug(`📋 Biostar: Event codes seen today: ${uniqueCodes.slice(0, 10).join(', ')}`);

      // ── Step 1: Filter to ONLY authentication events ──────────────────────
      // BioStar generates many non-auth events (door-open relay, zone events,
      // schedule unlock, admin user-management events, etc.) that carry a
      // user_id but are NOT card / fingerprint / face scans.
      // We MUST discard them or every admin action inflates the on-site count.
      const authEvents = events.filter(e =>
        BIOSTAR_ENTRY_EVENT_CODES.has(e.eventTypeCode) ||
        BIOSTAR_EXIT_EVENT_CODES.has(e.eventTypeCode)
      );

      logger.debug(`📋 Biostar: ${authEvents.length} auth events (of ${events.length} total) after filtering`);

      // ── Step 2: Most-recent AUTH event per user ───────────────────────────
      const userLatest = new Map<string, BiostarEventLog>();
      for (const event of authEvents) {
        if (!event.userId || event.userId === '0') continue;
        const existing = userLatest.get(event.userId);
        if (!existing || new Date(event.eventTime) > new Date(existing.eventTime)) {
          userLatest.set(event.userId, event);
        }
      }

      logger.debug(`📋 Biostar: Distinct users with auth events today: ${userLatest.size} — IDs: ${[...userLatest.keys()].slice(0, 10).join(', ')}`);

      // ── Step 3: Determine direction via device role ───────────────────────
      // Device role (from biostar_devices table) takes precedence over event code.
      // ENTRY reader  → always a check-in
      // EXIT reader   → always a check-out
      // ENTRY_EXIT    → use event code (entry codes = in, exit codes = out)
      // IGNORE        → skip
      const onSiteUsers: { userId: string; userName: string; lastAccessTime: string; eventCode: string; deviceId: string }[] = [];

      for (const [userId, event] of userLatest) {
        const role = deviceRoles[String(event.deviceId)] ?? 'ENTRY_EXIT';
        const direction = BiostarService.resolveEventDirection(event.eventTypeCode, role);

        logger.debug(`🔎 Biostar direction: user=${userId}(${event.userName}) device=${event.deviceId} code=${event.eventTypeCode} role=${role} → ${direction ?? 'null(non-auth)'}`);

        if (direction === 'ENTRY') {
          onSiteUsers.push({
            userId,
            userName: event.userName ?? `User ${userId}`,
            lastAccessTime: event.eventTime,
            eventCode: event.eventTypeCode,
            deviceId: event.deviceId,
          });
        }
        // EXIT / IGNORE / null → user not on-site, don't push
      }

      logger.debug(`📊 Biostar: ${onSiteUsers.length} of ${userLatest.size} users on-site (via auth event log + device roles)`);
      return onSiteUsers;
    }

    // --- Fallback 1: last_access_time from user records ---
    // The event log API returned nothing (0 events or permission denied).
    // Use each user's last_access_time instead; if it's within the last 24 hours
    // the user is considered on-site (valid for single-door / X-Pass 2 setups).
    // NOTE: confirmed that BioStar 2 v2.x does NOT return last_access_time in user records,
    // so this fallback silently returns [] when that field is absent.
    try {
      const users = await this.getUsers(config);
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
      const onSiteUsers: { userId: string; userName: string; lastAccessTime: string; eventCode: string }[] = [];

      for (const user of users) {
        if (!user.id || user.id === '0') continue;
        if (!user.lastAccessTime) continue; // field absent in this BioStar version
        const lastAccess = new Date(user.lastAccessTime);
        const isOnSite = lastAccess > cutoff;
        if (isOnSite) {
          onSiteUsers.push({
            userId: user.id,
            userName: user.name,
            lastAccessTime: user.lastAccessTime,
            eventCode: 'last_access',
            deviceId: '',
          });
        }
      }

      if (onSiteUsers.length > 0) {
        logger.debug(`📊 Biostar: ${onSiteUsers.length} of ${users.length} users on-site (via last_access_time fallback)`);
        return onSiteUsers;
      }
    } catch (fallbackErr: any) {
      // silently swallow — will try T&A next
    }

    // --- Fallback 2: Time & Attendance records ---
    // BioStar 2 T&A module records check-in/check-out per day and may be accessible
    // even when the Event Log REST endpoint is permission-denied.
    logger.debug('📊 Biostar: Trying Time & Attendance API for on-site detection...');
    try {
      const taUsers = await this.getTimeAttendanceOnSite(config);
      if (taUsers.length > 0 || true) { // always log what T&A returns
        logger.debug(`📊 Biostar: ${taUsers.length} users on-site (via Time & Attendance API)`);
        return taUsers;
      }
    } catch (taErr: any) {
      logger.warn(`⚠️ Biostar: Time & Attendance API also unavailable: ${taErr.message}`);
    }

    logger.debug('📊 Biostar: All on-site detection methods exhausted — returning empty list');
    return [];
  }

  /**
   * Try to determine on-site users using the BioStar 2 Time & Attendance module.
   * T&A records show check-in/check-out per user per day.
   * If a user has checked in today but not checked out → they are on-site.
   */
  async getTimeAttendanceOnSite(config: BiostarConfig): Promise<{ userId: string; userName: string; lastAccessTime: string; eventCode: string; deviceId: string }[]> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const now = new Date();

    // Format as YYYY-MM-DDTHH:MM:SS for BioStar
    const startStr = todayStart.toISOString().slice(0, 19);
    const endStr = now.toISOString().slice(0, 19);

    // Try POST search first (more targeted)
    const searchBody = {
      TimeAttendanceCollection: {
        from: startStr,
        to: endStr,
        period_type: '0', // daily
      }
    };

    let rows: any[] = [];
    try {
      const searchResp = await this.makeAuthenticatedRequest(config, '/api/time_attendance/search', 'POST', searchBody);
      rows = searchResp?.TimeAttendanceCollection?.rows ?? searchResp?.rows ?? [];
      logger.debug(`📅 Biostar T&A: POST /api/time_attendance/search returned ${rows.length} records`);
      if (rows.length > 0) logger.debug(`📅 Biostar T&A: Sample record keys:`, Object.keys(rows[0]).join(', '));
    } catch (searchErr: any) {
      logger.warn(`⚠️ Biostar T&A: POST search failed (${searchErr.message}), trying GET...`);
      try {
        const getResp = await this.makeAuthenticatedRequest(config, `/api/time_attendance?from_date=${startStr}&to_date=${endStr}`);
        rows = getResp?.TimeAttendanceCollection?.rows ?? getResp?.rows ?? [];
        logger.debug(`📅 Biostar T&A: GET /api/time_attendance returned ${rows.length} records`);
        if (rows.length > 0) logger.debug(`📅 Biostar T&A: Sample record keys:`, Object.keys(rows[0]).join(', '));
      } catch (getErr: any) {
        logger.warn(`⚠️ Biostar T&A: GET also failed (${getErr.message})`);
        throw getErr;
      }
    }

    // Parse T&A rows: user with checkin_datetime but no checkout_datetime = on-site
    const onSite: { userId: string; userName: string; lastAccessTime: string; eventCode: string }[] = [];
    for (const row of rows) {
      const userId = row?.user_id?.id ?? row?.user_id ?? row?.id;
      const userName = row?.name ?? row?.user_name ?? `User ${userId}`;
      const checkin = row?.checkin_datetime ?? row?.check_in ?? row?.start_time;
      const checkout = row?.checkout_datetime ?? row?.check_out ?? row?.end_time;

      if (!userId || userId === '0' || userId === '1') continue; // skip system/admin
      if (checkin && !checkout) {
        // Checked in today, no check-out → on-site
        onSite.push({ userId: String(userId), userName, lastAccessTime: checkin, eventCode: 'ta_checkin', deviceId: '' });
        logger.debug(`📅 Biostar T&A: "${userName}" checked in at ${checkin}, no checkout → ON SITE`);
      } else if (checkin && checkout) {
        logger.debug(`📅 Biostar T&A: "${userName}" checked in ${checkin}, checked out ${checkout} → OFF SITE`);
      }
    }

    return onSite;
  }

  /**
   * Public helpers so the webhook route can check event codes without importing the Set directly.
   */
  isEntryEvent(eventTypeCode: string): boolean {
    return BIOSTAR_ENTRY_EVENT_CODES.has(eventTypeCode);
  }

  isExitEvent(eventTypeCode: string): boolean {
    return BIOSTAR_EXIT_EVENT_CODES.has(eventTypeCode);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // WebSocket Real-Time Event Monitor
  //
  // BioStar 2 streams access events over a persistent WebSocket connection.
  // This is Suprema's recommended approach for real-time monitoring vs REST polling.
  //
  // URL:  wss://<server>/wsapi/events/subscribe
  // Auth: bs-session-id header + Cookie from the REST login session
  // ─────────────────────────────────────────────────────────────────────────────

  private wsSocket: WebSocket | null = null;
  private wsReconnectTimer: NodeJS.Timeout | null = null;
  private wsPingTimer: NodeJS.Timeout | null = null;
  private wsOnEvent: ((raw: any) => void) | null = null;
  private wsConfig: BiostarConfig | null = null;
  private wsShouldRun = false;
  private wsCustomerId = '';
  // Alternate URL paths to try when the primary one returns 403
  private readonly WS_PATHS = ['/wsapi/events/subscribe', '/wsapi', '/api/events/subscribe'];
  private wsPathIndex = 0;
  private wsGot403 = false;

  /**
   * Start a persistent WebSocket connection to receive real-time BioStar 2 events.
   * Reconnects automatically on disconnect.
   * @param config     BioStar server credentials
   * @param customerId Tenant ID for logging
   * @param onEvent    Callback invoked with each raw event object
   */
  async startWebSocketMonitor(
    config: BiostarConfig,
    customerId: string,
    onEvent: (raw: any) => void,
  ): Promise<void> {
    this.stopWebSocketMonitor();
    this.wsConfig = config;
    this.wsOnEvent = onEvent;
    this.wsCustomerId = customerId;
    this.wsShouldRun = true;
    this.wsPathIndex = 0;   // Start with the first known path
    this.wsGot403 = false;
    await this.wsDoConnect();
  }

  /** Stop the WebSocket monitor and cancel any pending reconnect. */
  stopWebSocketMonitor(): void {
    this.wsShouldRun = false;
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
    if (this.wsPingTimer) {
      clearInterval(this.wsPingTimer);
      this.wsPingTimer = null;
    }
    if (this.wsSocket) {
      this.wsSocket.removeAllListeners();
      this.wsSocket.close();
      this.wsSocket = null;
    }
  }

  /** Returns true when the WebSocket is open and receiving events. */
  isWebSocketConnected(): boolean {
    return this.wsSocket?.readyState === WebSocket.OPEN;
  }

  private async wsDoConnect(): Promise<void> {
    if (!this.wsShouldRun || !this.wsConfig) return;

    try {
      await this.ensureAuthenticated(this.wsConfig);

      const serverUrl = this.normalizeServerUrl(this.wsConfig.serverUrl);
      // Convert https → wss, http → ws, keep the port
      const wsBase = serverUrl
        .replace(/^https:\/\//, 'wss://')
        .replace(/^http:\/\//, 'ws://');

      // BioStar 2 WebSocket endpoint — cycle through known paths until one works.
      // Known paths: /wsapi/events/subscribe, /wsapi, /api/events/subscribe
      const wsPath = this.WS_PATHS[this.wsPathIndex % this.WS_PATHS.length];
      const wsUrl = `${wsBase}${wsPath}`;

      // BioStar 2 requires the session to be sent BOTH as a custom header
      // AND as a browser-style Cookie.  Explicitly include bs-session-id in
      // the Cookie string even if it was not in the Set-Cookie response.
      const cookieHeader = [
        `bs-session-id=${this.sessionId!}`,
        ...(this.sessionCookies ? [this.sessionCookies] : []),
      ].join('; ');

      logger.debug(`🔌 BioStar WS [${this.wsCustomerId}]: connecting to ${wsUrl}`);

      this.wsSocket = new (WebSocket as any)(wsUrl, {
        headers: {
          'bs-session-id': this.sessionId!,
          'Cookie': cookieHeader,
          'Origin': serverUrl,
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        rejectUnauthorized: false,
      });

      this.wsSocket!.on('open', () => {
        logger.debug(
          `✅ BioStar WS [${this.wsCustomerId}]: connected — streaming real-time events`,
        );
        // BioStar 2 New Local API requires an event-filter subscription message
        // immediately after the WS handshake.  Without it the server stays silent.
        // Sending empty arrays means "subscribe to ALL events for all zones/doors/devices".
        // We try the documented v2.7.10+ format first; older firmware uses a different key.
        const subscribeMsg = JSON.stringify({
          // New Local API (v2.7.10+)
          filter: {
            zone_id:        { ids: [] },
            door_id:        { ids: [] },
            device_id:      { ids: [] },
            user_group_id:  { ids: [] },
            event_type_id:  { ids: [] },
          },
        });
        try {
          this.wsSocket!.send(subscribeMsg);
          logger.debug(`📤 BioStar WS [${this.wsCustomerId}]: subscription filter sent`);
        } catch (sendErr: any) {
          logger.warn(`⚠️ BioStar WS [${this.wsCustomerId}]: could not send subscription: ${sendErr.message}`);
        }

        // Also send the older event-subscribe format some BioStar versions use
        const legacySubscribeMsg = JSON.stringify({
          event: 'subscribe',
          filter: { zone_id: [], door_id: [], device_id: [], user_group_id: [], event_type_id: [] },
        });
        try {
          this.wsSocket!.send(legacySubscribeMsg);
        } catch { /* ignore — we already logged above if it fails */ }

        // Start a keepalive ping every 25 seconds so the server doesn't time out the connection.
        // BioStar closes idle WS connections after ~30 s of silence.
        if (this.wsPingTimer) clearInterval(this.wsPingTimer);
        this.wsPingTimer = setInterval(() => {
          if (this.wsSocket?.readyState === WebSocket.OPEN) {
            try {
              this.wsSocket.ping();
            } catch { /* ignore */ }
          } else {
            if (this.wsPingTimer) { clearInterval(this.wsPingTimer); this.wsPingTimer = null; }
          }
        }, 25_000);
      });

      let wsMessageCount = 0;
      this.wsSocket!.on('message', (data: any) => {
        try {
          const text = data.toString();
          wsMessageCount++;
          // Log first 5 messages verbatim so we can see what BioStar is actually sending
          if (wsMessageCount <= 5) {
            logger.debug(`📨 BioStar WS [${this.wsCustomerId}] msg#${wsMessageCount}:`, text.slice(0, 300));
          }
          const raw = JSON.parse(text);
          this.wsOnEvent?.(raw);
        } catch {
          // Non-JSON ping/keepalive frames — ignore
        }
      });

      this.wsSocket!.on('error', (err: any) => {
        const msg: string = err.message ?? String(err);
        if (msg.includes('403')) {
          // Try the next known path on the next reconnect
          this.wsGot403 = true;
          this.wsPathIndex = (this.wsPathIndex + 1) % this.WS_PATHS.length;
          logger.warn(
            `⚠️ BioStar WS [${this.wsCustomerId}]: 403 on ${wsPath} — will try ${this.WS_PATHS[this.wsPathIndex]} next`,
          );
        } else {
          logger.warn(`⚠️ BioStar WS [${this.wsCustomerId}]: ${msg}`);
        }
      });

      this.wsSocket!.on('close', (code: number) => {
        // If we got a 403 (known-wrong path), retry immediately with the next path.
        // For any other disconnection, wait 30 s to avoid rapid reconnect storms.
        const delayMs = this.wsGot403 ? 3_000 : 30_000;
        logger.debug(
          `🔌 BioStar WS [${this.wsCustomerId}]: disconnected (code=${code}) — reconnecting in ${delayMs / 1000} s`,
        );
        this.wsSocket = null;
        this.wsGot403 = false;   // reset for the next connection attempt
        if (this.wsShouldRun) {
          this.wsReconnectTimer = setTimeout(() => this.wsDoConnect(), delayMs);
        }
      });
    } catch (err: any) {
      logger.warn(
        `⚠️ BioStar WS [${this.wsCustomerId}]: connection failed (${err.message}) — retrying in 60 s`,
      );
      if (this.wsShouldRun) {
        this.wsReconnectTimer = setTimeout(() => this.wsDoConnect(), 60_000);
      }
    }
  }

  /**
   * Clear session (logout)
   */
  clearSession(): void {
    this.sessionId = null;
    this.sessionExpiry = null;
  }
}

// Export singleton instance
export const biostarService = new BiostarService();
