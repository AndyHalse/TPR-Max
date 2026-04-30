import https from 'https';
import { logger } from './utils/logger';

interface PaxtonConfig {
  serverUrl: string;
  port: string;
  clientId: string;
  username: string;
  password: string;
}

interface PaxtonToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  obtainedAt: number;
}

interface PaxtonUser {
  id: number;
  firstName: string;
  lastName: string;
  departmentId?: number;
  accessLevelId?: number;
  cardNumber?: number;
  active?: boolean;
}

interface PaxtonDoor {
  id: number;
  name: string;
  state?: string;
  address?: string;
}

interface PaxtonEvent {
  id: number;
  dateTime: string;
  eventType: string;
  userId?: number;
  doorId?: number;
  userName?: string;
  doorName?: string;
}

interface PaxtonAccessLevel {
  id: number;
  name: string;
  description?: string;
}

interface PaxtonDepartment {
  id: number;
  name: string;
}

class PaxtonService {
  private tokens: Map<string, PaxtonToken> = new Map();

  private getBaseUrl(config: PaxtonConfig): string {
    const url = config.serverUrl.replace(/\/+$/, '');
    const port = config.port || '8080';
    if (url.includes(':' + port) || url.match(/:\d+$/)) {
      return url;
    }
    return `${url}:${port}`;
  }

  private async makeRequest(config: PaxtonConfig, method: string, path: string, body?: any): Promise<any> {
    const baseUrl = this.getBaseUrl(config);
    const fullUrl = `${baseUrl}${path}`;
    const url = new URL(fullUrl);

    return new Promise((resolve, reject) => {
      const options: https.RequestOptions = {
        hostname: url.hostname,
        port: url.port || 8080,
        path: url.pathname + url.search,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        rejectUnauthorized: process.env.PAXTON_ALLOW_SELF_SIGNED === 'true' ? false : true,
        timeout: 15000,
      };

      const token = this.tokens.get(config.serverUrl);
      if (token && !path.includes('/authorization/')) {
        options.headers!['Authorization'] = `Bearer ${token.access_token}`;
      }

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            if (res.statusCode === 401) {
              reject(new Error('Authentication failed - check credentials'));
              return;
            }
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(`Paxton API error ${res.statusCode}: ${data}`));
              return;
            }
            const parsed = data ? JSON.parse(data) : {};
            resolve(parsed);
          } catch (e) {
            resolve(data);
          }
        });
      });

      req.on('error', (err) => {
        reject(new Error(`Connection failed: ${err.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Connection timed out - check server URL and port'));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  async authenticate(config: PaxtonConfig): Promise<boolean> {
    try {
      const existingToken = this.tokens.get(config.serverUrl);
      if (existingToken) {
        const elapsed = (Date.now() - existingToken.obtainedAt) / 1000;
        if (elapsed < existingToken.expires_in - 60) {
          return true;
        }
      }

      const tokenResponse = await this.makeRequest(config, 'POST', '/api/v1/authorization/tokens', {
        username: config.username,
        password: config.password,
        grant_type: 'password',
        client_id: config.clientId,
      });

      if (tokenResponse.access_token) {
        this.tokens.set(config.serverUrl, {
          ...tokenResponse,
          obtainedAt: Date.now(),
        });
        logger.info(`Paxton Net2: Authenticated successfully to ${config.serverUrl}`);
        return true;
      }

      return false;
    } catch (error: any) {
      logger.error(`Paxton Net2 auth failed:`, error.message);
      throw error;
    }
  }

  async testConnection(config: PaxtonConfig): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      await this.authenticate(config);
      const doors = await this.getDoors(config);
      const users = await this.getUsers(config);

      return {
        success: true,
        message: `Connected successfully. Found ${doors.length} doors and ${users.length} users.`,
        details: {
          doorCount: doors.length,
          userCount: users.length,
          serverUrl: this.getBaseUrl(config),
        }
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to connect to Paxton Net2 server',
      };
    }
  }

  async getUsers(config: PaxtonConfig): Promise<PaxtonUser[]> {
    await this.authenticate(config);
    const response = await this.makeRequest(config, 'GET', '/api/v1/users');
    return Array.isArray(response) ? response : response.data || [];
  }

  async getUser(config: PaxtonConfig, userId: number): Promise<PaxtonUser | null> {
    try {
      await this.authenticate(config);
      return await this.makeRequest(config, 'GET', `/api/v1/users/${userId}`);
    } catch {
      return null;
    }
  }

  async createUser(config: PaxtonConfig, user: { firstName: string; lastName: string; departmentId?: number; accessLevelId?: number }): Promise<PaxtonUser | null> {
    try {
      await this.authenticate(config);
      return await this.makeRequest(config, 'POST', '/api/v1/users', user);
    } catch (error: any) {
      logger.error(`Paxton: Failed to create user:`, error.message);
      return null;
    }
  }

  async updateUser(config: PaxtonConfig, userId: number, updates: Partial<PaxtonUser>): Promise<boolean> {
    try {
      await this.authenticate(config);
      await this.makeRequest(config, 'PUT', `/api/v1/users/${userId}`, updates);
      return true;
    } catch (error: any) {
      logger.error(`Paxton: Failed to update user ${userId}:`, error.message);
      return false;
    }
  }

  async deleteUser(config: PaxtonConfig, userId: number): Promise<boolean> {
    try {
      await this.authenticate(config);
      await this.makeRequest(config, 'DELETE', `/api/v1/users/${userId}`);
      return true;
    } catch (error: any) {
      logger.error(`Paxton: Failed to delete user ${userId}:`, error.message);
      return false;
    }
  }

  async getDoors(config: PaxtonConfig): Promise<PaxtonDoor[]> {
    await this.authenticate(config);
    const response = await this.makeRequest(config, 'GET', '/api/v1/doors');
    return Array.isArray(response) ? response : response.data || [];
  }

  async openDoor(config: PaxtonConfig, doorId: number, duration: number = 5): Promise<boolean> {
    try {
      await this.authenticate(config);
      await this.makeRequest(config, 'POST', '/api/v1/commands/opendoor', {
        doorId,
        openDuration: duration,
      });
      logger.info(`Paxton: Door ${doorId} opened for ${duration}s`);
      return true;
    } catch (error: any) {
      logger.error(`Paxton: Failed to open door ${doorId}:`, error.message);
      return false;
    }
  }

  async getEvents(config: PaxtonConfig, params?: { from?: string; to?: string; doorId?: number }): Promise<PaxtonEvent[]> {
    await this.authenticate(config);
    let path = '/api/v1/events';
    const queryParts: string[] = [];
    if (params?.from) queryParts.push(`from=${encodeURIComponent(params.from)}`);
    if (params?.to) queryParts.push(`to=${encodeURIComponent(params.to)}`);
    if (params?.doorId) queryParts.push(`doorId=${params.doorId}`);
    if (queryParts.length > 0) path += '?' + queryParts.join('&');

    const response = await this.makeRequest(config, 'GET', path);
    return Array.isArray(response) ? response : response.data || [];
  }

  async getAccessLevels(config: PaxtonConfig): Promise<PaxtonAccessLevel[]> {
    await this.authenticate(config);
    const response = await this.makeRequest(config, 'GET', '/api/v1/accesslevels');
    return Array.isArray(response) ? response : response.data || [];
  }

  async getDepartments(config: PaxtonConfig): Promise<PaxtonDepartment[]> {
    await this.authenticate(config);
    const response = await this.makeRequest(config, 'GET', '/api/v1/departments');
    return Array.isArray(response) ? response : response.data || [];
  }

  async grantAccess(config: PaxtonConfig, userId: number, accessLevelId: number): Promise<boolean> {
    try {
      await this.authenticate(config);
      await this.makeRequest(config, 'PUT', `/api/v1/users/${userId}`, {
        accessLevelId,
      });
      return true;
    } catch (error: any) {
      logger.error(`Paxton: Failed to grant access to user ${userId}:`, error.message);
      return false;
    }
  }

  async revokeAccess(config: PaxtonConfig, userId: number): Promise<boolean> {
    try {
      await this.authenticate(config);
      await this.makeRequest(config, 'PUT', `/api/v1/users/${userId}`, {
        accessLevelId: 0,
      });
      return true;
    } catch (error: any) {
      logger.error(`Paxton: Failed to revoke access for user ${userId}:`, error.message);
      return false;
    }
  }

  async syncStaffToNet2(config: PaxtonConfig, staffList: { id: string; firstName: string; lastName: string; department?: string; isCheckedIn?: boolean }[], defaultAccessLevel?: string): Promise<{ synced: number; created: number; errors: number }> {
    const result = { synced: 0, created: 0, errors: 0 };

    try {
      await this.authenticate(config);
      const existingUsers = await this.getUsers(config);
      const existingMap = new Map(
        existingUsers.map(u => [`${u.firstName?.toLowerCase()}_${u.lastName?.toLowerCase()}`, u])
      );

      for (const staff of staffList) {
        try {
          const key = `${staff.firstName.toLowerCase()}_${staff.lastName.toLowerCase()}`;
          const existing = existingMap.get(key);

          if (existing) {
            result.synced++;
          } else {
            const newUser = await this.createUser(config, {
              firstName: staff.firstName,
              lastName: staff.lastName,
              accessLevelId: defaultAccessLevel ? parseInt(defaultAccessLevel) : undefined,
            });
            if (newUser) {
              result.created++;
            } else {
              result.errors++;
            }
          }
        } catch {
          result.errors++;
        }
      }
    } catch (error: any) {
      logger.error(`Paxton sync error:`, error.message);
    }

    return result;
  }

  handleWebhookEvent(event: any, webhookSecret?: string): { valid: boolean; eventType?: string; data?: any } {
    if (webhookSecret && event.secret !== webhookSecret) {
      return { valid: false };
    }

    return {
      valid: true,
      eventType: event.eventType || event.type,
      data: event,
    };
  }
}

export const paxtonService = new PaxtonService();
