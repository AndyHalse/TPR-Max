import fetch from 'node-fetch';
import https from 'https';

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
// Source: BioStar 2 Local API documentation + empirical observation.
// Single-door setups (like X-Pass 2) produce authentication events, not "entry/exit"
// events, so we treat any successful authentication as "on-site".
export const BIOSTAR_ENTRY_EVENT_CODES = new Set([
  '4864',   // 1:1 Auth. Success (card scan — most common on X-Pass / wiegand readers)
  '4096',   // 1:N Auth. Success (fingerprint identification)
  '4100',   // Card + Fingerprint Auth. Success
  '4098',   // Card Auth. Success (alternative code)
  '4104',   // Mobile Auth. Success
  '4352',   // Access Granted (zone entry)
  '16384',  // Legacy access-granted code (older BioStar versions)
  '1',      // Generic authentication success (some firmware variants)
  '2',      // Access granted (some firmware variants)
]);

// Event codes that indicate a user has exited the building.
// Only present when a separate exit reader is configured.
export const BIOSTAR_EXIT_EVENT_CODES = new Set([
  '4865',   // 1:1 Auth. Success (exit reader)
  '4097',   // 1:N Auth. Success (exit reader)
  '4353',   // Access Granted (zone exit)
  '16385',  // Legacy exit code
]);

// Map a raw BioStar 2 event row to our BiostarEventLog shape.
// BioStar 2 nests IDs: user_id.id, device_id.id, event_type_id.code
function mapBiostarEvent(raw: any): BiostarEventLog | null {
  // user_id can be { id, user_name } or a plain string/number
  const userId =
    raw?.user_id?.id ?? raw?.user_id ?? raw?.userId ?? '';
  const userName =
    raw?.user_id?.user_name ?? raw?.user_name ?? raw?.userName ?? undefined;

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
    console.log(`🔍 Biostar card raw data for "${raw?.name}":`, JSON.stringify(cards[0]));
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

    console.log(`🔐 Biostar: Attempting login to ${serverUrl}...`);

    try {
      const response = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          User: {
            login_id: config.username,
            password: config.password,
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
        console.error(`❌ Biostar login failed: ${response.status} - ${errorText}`);
        throw new Error(`Login failed: ${friendlyMessage}`);
      }

      // Extract session ID from response headers
      const sessionId = response.headers.get('bs-session-id');
      
      if (!sessionId) {
        console.error('❌ Biostar: No session ID in response headers');
        throw new Error('No session ID received from Biostar server');
      }

      this.sessionId = sessionId;
      this.sessionExpiry = new Date(Date.now() + this.SESSION_TIMEOUT_MS);

      console.log(`✅ Biostar: Login successful, session expires at ${this.sessionExpiry.toISOString()}`);
    } catch (error: any) {
      console.error(`❌ Biostar login error:`, error);
      
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
      console.log('🔄 Biostar: Session expired or invalid, re-authenticating...');
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

    const options: any = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'bs-session-id': this.sessionId!,
      },
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
        console.error(`❌ Biostar API error: ${response.status} - ${errorText}`);
        
        // Session might have expired
        if (response.status === 401) {
          console.log('🔄 Biostar: Session expired (401), re-authenticating...');
          this.sessionId = null;
          this.sessionExpiry = null;
          return this.makeAuthenticatedRequest(config, endpoint, method, body);
        }
        
        const friendlyMessage = parseBiostarError(errorText);
        throw new Error(`API request failed: ${friendlyMessage}`);
      }

      const data = await response.json();
      return data;
    } catch (error: any) {
      console.error(`❌ Biostar API request error:`, error);
      
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
      console.warn(`⚠️ Biostar: Could not fetch detail for user ${userId}: ${err.message}`);
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
      console.log(`📟 Biostar: Got ${rows.length} devices from /api/devices`);
      if (rows.length > 0) {
        console.log(`📟 Biostar: Device record keys:`, Object.keys(rows[0]).join(', '));
        const r0 = rows[0];
        console.log(`📟 Biostar: Sample device - group:`, JSON.stringify(r0?.device_group_id), `lan:`, JSON.stringify(r0?.lan), `type:`, JSON.stringify(r0?.device_type_id));
      }

      return rows.map((r: any) => {
        // BioStar 2 stores IP in `lan.ip_address`, group in `device_group_id.name`, type in `device_type_id.type_name`
        const ip = r?.lan?.ip_address ?? r?.lan?.ip ?? r?.ip_address ?? r?.ip ?? '';
        const group = r?.device_group_id?.name ?? r?.device_group?.name ?? r?.group_name ?? r?.device_group ?? '';
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
      console.warn(`⚠️ Biostar: GET /api/devices failed (${err.message}) — returning empty device list`);
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
      console.log(`🚪 Biostar: Got ${rows.length} doors from door status endpoint`);
      if (rows.length > 0) {
        console.log(`🚪 Biostar: Door record keys:`, Object.keys(rows[0]).join(', '));
      }
      return rows;
    } catch (err: any) {
      console.warn(`⚠️ Biostar: Door status endpoint failed: ${err.message}`);
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
        console.log(`👥 Biostar: Retrieved ${users.length} users via search (${withCards} with card/QR data)`);
        return users;
      }
    } catch {
      // Search endpoint not supported on this version — continue to strategy 2
    }

    // --- Strategy 2: GET list for IDs, then GET /api/users/{id} for full detail ---
    console.log('🔄 Biostar: Fetching user list then individual records for full card data...');
    try {
      const listResponse = await this.makeAuthenticatedRequest(
        config, `/api/users?limit=${limit}&offset=${offset}`
      );

      const listRows: any[] =
        listResponse?.UserCollection?.rows ??
        listResponse?.records ??
        listResponse?.rows ??
        [];

      console.log(`👥 Biostar: Found ${listRows.length} users in list, fetching full records...`);

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
            console.log(`🃏 Biostar: User "${mapped.name}" has card: ${mapped.barcodeNumber}`);
          }
          fullUsers.push(mapped);
        }
      }

      console.log(`👥 Biostar: Retrieved ${fullUsers.length} users with full detail (${fullUsers.filter(u => u.barcodeNumber).length} with card/QR data)`);
      return fullUsers;
    } catch (error: any) {
      console.error('❌ Failed to fetch Biostar users:', error);
      throw error;
    }
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

    console.log(`📋 Biostar: Querying events from ${startStr} to ${endStr}`);

    let rawRows: any[] = [];

    // Strategy 1: POST /api/events/search (preferred on BioStar 2 v2.8+)
    try {
      const body = {
        EventCollection: {
          start_datetime: startStr,
          end_datetime:   endStr,
          limit,
        },
      };
      const response = await this.makeAuthenticatedRequest(config, '/api/events/search', 'POST', body);
      rawRows =
        response?.EventCollection?.rows ??
        response?.records ??
        response?.rows ??
        (Array.isArray(response) ? response : []);
      console.log(`📋 Biostar: Retrieved ${rawRows.length} raw events (POST /api/events/search)`);
    } catch (err: any) {
      console.warn(`⚠️ Biostar POST /api/events/search failed (${err.message}), trying GET...`);

      // Strategy 2: GET /api/events with ISO datetime query params
      try {
        const endpoint = `/api/events?start_datetime=${encodeURIComponent(startStr)}&end_datetime=${encodeURIComponent(endStr)}&limit=${limit}`;
        const response = await this.makeAuthenticatedRequest(config, endpoint);
        rawRows =
          response?.EventCollection?.rows ??
          response?.records ??
          response?.rows ??
          (Array.isArray(response) ? response : []);
        console.log(`📋 Biostar: Retrieved ${rawRows.length} raw events (GET /api/events)`);
      } catch (err2: any) {
        console.error('❌ Biostar: Both event endpoints failed:', err2.message);
        throw new Error(`Event log unavailable: ${err2.message}`);
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
   * Determine which BioStar users are currently on-site.
   *
   * Primary strategy:
   * - Fetch today's authentication / access events via the event log API
   * - For each user, take their MOST RECENT event
   * - If it's an entry/auth event → on-site; if it's an exit event → off-site
   *
   * Fallback (when the event API returns 403/Permission Denied):
   * - Use each user's `last_access_time` field from the user record
   * - If last_access_time is within the last 24 hours → on-site
   * - This bypasses the BioStar 2 event log permission requirement entirely
   */
  async getCurrentOnSiteUsers(
    config: BiostarConfig
  ): Promise<{ userId: string; userName: string; lastAccessTime: string; eventCode: string }[]> {
    // --- Primary: event log API ---
    let events: BiostarEventLog[] = [];
    let eventsAvailable = false;
    try {
      events = await this.getEventLogs(config);
      eventsAvailable = true;
    } catch (err: any) {
      console.warn(`⚠️ Biostar: Event log API unavailable (${err.message}), falling back to last_access_time`);
    }

    if (eventsAvailable && events.length > 0) {
      // Log event codes for diagnostics
      const uniqueCodes = [...new Set(events.map(e => `${e.eventTypeCode}(${e.eventTypeDesc})`))];
      console.log(`📋 Biostar: Event codes seen today: ${uniqueCodes.slice(0, 10).join(', ')}`);

      // Build a map of userId → most-recent event
      const userLatest = new Map<string, BiostarEventLog>();
      for (const event of events) {
        const existing = userLatest.get(event.userId);
        if (!existing || new Date(event.eventTime) > new Date(existing.eventTime)) {
          userLatest.set(event.userId, event);
        }
      }

      const onSiteUsers: { userId: string; userName: string; lastAccessTime: string; eventCode: string }[] = [];
      const hasAnyExitEvent = events.some(e => BIOSTAR_EXIT_EVENT_CODES.has(e.eventTypeCode));

      for (const [userId, event] of userLatest) {
        if (userId === '0' || userId === '') continue; // skip system/unknown users

        const isEntry = BIOSTAR_ENTRY_EVENT_CODES.has(event.eventTypeCode);
        const isExit  = BIOSTAR_EXIT_EVENT_CODES.has(event.eventTypeCode);

        if (isEntry) {
          onSiteUsers.push({ userId, userName: event.userName ?? `User ${userId}`, lastAccessTime: event.eventTime, eventCode: event.eventTypeCode });
        } else if (!isExit && !hasAnyExitEvent) {
          // Unknown event code + no exit readers configured → treat any auth as on-site
          onSiteUsers.push({ userId, userName: event.userName ?? `User ${userId}`, lastAccessTime: event.eventTime, eventCode: event.eventTypeCode });
        }
      }

      console.log(`📊 Biostar: ${onSiteUsers.length} of ${userLatest.size} users on-site (via event log)`);
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
          });
        }
      }

      if (onSiteUsers.length > 0) {
        console.log(`📊 Biostar: ${onSiteUsers.length} of ${users.length} users on-site (via last_access_time fallback)`);
        return onSiteUsers;
      }
    } catch (fallbackErr: any) {
      // silently swallow — will try T&A next
    }

    // --- Fallback 2: Time & Attendance records ---
    // BioStar 2 T&A module records check-in/check-out per day and may be accessible
    // even when the Event Log REST endpoint is permission-denied.
    console.log('📊 Biostar: Trying Time & Attendance API for on-site detection...');
    try {
      const taUsers = await this.getTimeAttendanceOnSite(config);
      if (taUsers.length > 0 || true) { // always log what T&A returns
        console.log(`📊 Biostar: ${taUsers.length} users on-site (via Time & Attendance API)`);
        return taUsers;
      }
    } catch (taErr: any) {
      console.warn(`⚠️ Biostar: Time & Attendance API also unavailable: ${taErr.message}`);
    }

    console.log('📊 Biostar: All on-site detection methods exhausted — returning empty list');
    return [];
  }

  /**
   * Try to determine on-site users using the BioStar 2 Time & Attendance module.
   * T&A records show check-in/check-out per user per day.
   * If a user has checked in today but not checked out → they are on-site.
   */
  async getTimeAttendanceOnSite(config: BiostarConfig): Promise<{ userId: string; userName: string; lastAccessTime: string; eventCode: string }[]> {
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
      console.log(`📅 Biostar T&A: POST /api/time_attendance/search returned ${rows.length} records`);
      if (rows.length > 0) console.log(`📅 Biostar T&A: Sample record keys:`, Object.keys(rows[0]).join(', '));
    } catch (searchErr: any) {
      console.warn(`⚠️ Biostar T&A: POST search failed (${searchErr.message}), trying GET...`);
      try {
        const getResp = await this.makeAuthenticatedRequest(config, `/api/time_attendance?from_date=${startStr}&to_date=${endStr}`);
        rows = getResp?.TimeAttendanceCollection?.rows ?? getResp?.rows ?? [];
        console.log(`📅 Biostar T&A: GET /api/time_attendance returned ${rows.length} records`);
        if (rows.length > 0) console.log(`📅 Biostar T&A: Sample record keys:`, Object.keys(rows[0]).join(', '));
      } catch (getErr: any) {
        console.warn(`⚠️ Biostar T&A: GET also failed (${getErr.message})`);
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
        onSite.push({ userId: String(userId), userName, lastAccessTime: checkin, eventCode: 'ta_checkin' });
        console.log(`📅 Biostar T&A: "${userName}" checked in at ${checkin}, no checkout → ON SITE`);
      } else if (checkin && checkout) {
        console.log(`📅 Biostar T&A: "${userName}" checked in ${checkin}, checked out ${checkout} → OFF SITE`);
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
