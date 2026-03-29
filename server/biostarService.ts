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
  photoUrl?: string;
  userGroupId?: string;
  startDateTime?: string;
  expireDateTime?: string;
}

export interface BiostarEventLog {
  id: string;
  deviceId: string;
  userId: string;
  eventTypeCode: string; // e.g., "4864" for access granted
  eventTime: string; // ISO timestamp
  userName?: string;
  deviceName?: string;
}

export interface BiostarConnectionStatus {
  connected: boolean;
  message: string;
  serverVersion?: string;
  databaseId?: string;
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
          login_id: config.username,
          password: config.password,
        }),
        // @ts-ignore - AbortSignal.timeout is available in Node 18+
        signal: AbortSignal.timeout(15000), // 15 second timeout
        // Accept self-signed certificates common on on-premise Biostar servers
        agent: loginUrl.startsWith('https') ? httpsAgent : undefined,
      } as any);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Biostar login failed: ${response.status} - ${errorText}`);
        throw new Error(`Login failed: ${response.statusText}`);
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
        
        throw new Error(`API request failed: ${response.statusText}`);
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
   * Get list of users from Biostar
   */
  async getUsers(config: BiostarConfig, limit: number = 1000, offset: number = 0): Promise<BiostarUser[]> {
    try {
      const endpoint = `/api/users?limit=${limit}&offset=${offset}`;
      const response = await this.makeAuthenticatedRequest(config, endpoint);
      
      return response.records || [];
    } catch (error: any) {
      console.error('❌ Failed to fetch Biostar users:', error);
      throw error;
    }
  }

  /**
   * Get recent event logs (access events)
   * This is the key method for determining who is currently on-site
   */
  async getEventLogs(
    config: BiostarConfig,
    startTime?: Date,
    endTime?: Date,
    limit: number = 1000
  ): Promise<BiostarEventLog[]> {
    try {
      // Default to last 24 hours if no time range specified
      const defaultStartTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const start = startTime || defaultStartTime;
      const end = endTime || new Date();

      // Format timestamps for Biostar API (Unix timestamp in seconds)
      const startTimestamp = Math.floor(start.getTime() / 1000);
      const endTimestamp = Math.floor(end.getTime() / 1000);

      const endpoint = `/api/events?start_datetime=${startTimestamp}&end_datetime=${endTimestamp}&limit=${limit}`;
      const response = await this.makeAuthenticatedRequest(config, endpoint);
      
      return response.records || [];
    } catch (error: any) {
      console.error('❌ Failed to fetch Biostar event logs:', error);
      throw error;
    }
  }

  /**
   * Get current on-site users based on recent access events
   * Analyzes event logs to determine who checked in but hasn't checked out
   */
  async getCurrentOnSiteUsers(config: BiostarConfig): Promise<{ userId: string; userName: string; lastAccessTime: string }[]> {
    try {
      // Get events from today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const events = await this.getEventLogs(config, today);
      
      // Group events by user and find their latest event
      const userEvents = new Map<string, { userName: string; lastAccessTime: string; isEntry: boolean }>();
      
      for (const event of events) {
        // Event type codes (typical Biostar 2 codes):
        // 4864 = Access Granted (Entry)
        // 4865 = Access Granted (Exit)
        // Customize these based on your Biostar configuration
        const isEntry = event.eventTypeCode === '4864' || event.eventTypeCode === '16384';
        const isExit = event.eventTypeCode === '4865' || event.eventTypeCode === '16385';
        
        if (isEntry || isExit) {
          const existingEvent = userEvents.get(event.userId);
          
          if (!existingEvent || new Date(event.eventTime) > new Date(existingEvent.lastAccessTime)) {
            userEvents.set(event.userId, {
              userName: event.userName || `User ${event.userId}`,
              lastAccessTime: event.eventTime,
              isEntry,
            });
          }
        }
      }
      
      // Filter to only users who are currently on-site (last event was entry)
      const onSiteUsers = [];
      for (const [userId, eventData] of userEvents.entries()) {
        if (eventData.isEntry) {
          onSiteUsers.push({
            userId,
            userName: eventData.userName,
            lastAccessTime: eventData.lastAccessTime,
          });
        }
      }
      
      console.log(`📊 Biostar: Found ${onSiteUsers.length} users currently on-site`);
      return onSiteUsers;
    } catch (error: any) {
      console.error('❌ Failed to get current on-site users:', error);
      throw error;
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
