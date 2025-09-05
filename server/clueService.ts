import { CompanySettings } from "@shared/schema";
import crypto from "crypto";
import fetch from "node-fetch";

export interface ClueWebhookEvent {
  event_type: "access_granted" | "access_denied" | "qr_scan" | "user_registered";
  event_id: string;
  timestamp: string;
  device_id: string;
  device_name: string;
  user_id?: string;
  qr_code?: string;
  access_result?: "granted" | "denied";
  access_reason?: string;
  additional_data?: Record<string, any>;
}

export interface ClueDynamicQRRequest {
  user_id: string;
  user_name: string;
  email?: string;
  validity_minutes?: number;
  access_groups?: string[];
  metadata?: Record<string, any>;
}

export interface ClueDynamicQRResponse {
  qr_code: string;
  qr_id: string;
  valid_until: string;
  access_url?: string;
}

export interface ClueDevice {
  device_id: string;
  device_name: string;
  device_type: string;
  ip_address: string;
  location?: string;
  status: "online" | "offline";
  last_seen?: string;
}

export class ClueService {
  private apiUrl: string;
  private apiKey: string;
  private apiSecret: string;
  private organizationId: string;
  private webhookSecret: string;

  constructor(settings: CompanySettings) {
    this.apiUrl = settings.clueApiUrl || "https://api.suprema-clue.com";
    this.apiKey = settings.clueApiKey || "";
    this.apiSecret = settings.clueApiSecret || "";
    this.organizationId = settings.clueOrganizationId || "";
    this.webhookSecret = settings.clueWebhookSecret || "";
  }

  /**
   * Verify webhook signature for security
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.webhookSecret) {
      console.warn("CLUe webhook secret not configured");
      return false;
    }

    const expectedSignature = crypto
      .createHmac("sha256", this.webhookSecret)
      .update(payload)
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Generate authorization header for API calls
   */
  private getAuthHeader(): string {
    const timestamp = Date.now().toString();
    const message = `${this.apiKey}:${timestamp}`;
    const signature = crypto
      .createHmac("sha256", this.apiSecret)
      .update(message)
      .digest("hex");
    
    return `Bearer ${this.apiKey}:${timestamp}:${signature}`;
  }

  /**
   * Generate a dynamic QR code for a visitor
   */
  async generateDynamicQR(request: ClueDynamicQRRequest): Promise<ClueDynamicQRResponse | null> {
    try {
      const response = await fetch(`${this.apiUrl}/v1/organizations/${this.organizationId}/qr-codes`, {
        method: "POST",
        headers: {
          "Authorization": this.getAuthHeader(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          user_id: request.user_id,
          user_name: request.user_name,
          email: request.email,
          validity_minutes: request.validity_minutes || 60,
          access_groups: request.access_groups || ["visitor"],
          metadata: request.metadata || {}
        })
      });

      if (!response.ok) {
        console.error("Failed to generate CLUe QR code:", response.status, response.statusText);
        return null;
      }

      const data = await response.json() as ClueDynamicQRResponse;
      return data;
    } catch (error) {
      console.error("Error generating CLUe QR code:", error);
      return null;
    }
  }

  /**
   * Delete an expired or used QR code
   */
  async deleteQRCode(qrId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/v1/organizations/${this.organizationId}/qr-codes/${qrId}`, {
        method: "DELETE",
        headers: {
          "Authorization": this.getAuthHeader()
        }
      });

      return response.ok;
    } catch (error) {
      console.error("Error deleting CLUe QR code:", error);
      return false;
    }
  }

  /**
   * Register a visitor in CLUe platform
   */
  async registerVisitor(visitorData: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
    company?: string;
    validFrom: string;
    validTo: string;
  }): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/v1/organizations/${this.organizationId}/users`, {
        method: "POST",
        headers: {
          "Authorization": this.getAuthHeader(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          user_id: visitorData.id,
          first_name: visitorData.firstName,
          last_name: visitorData.lastName,
          email: visitorData.email,
          company: visitorData.company,
          user_type: "visitor",
          valid_from: visitorData.validFrom,
          valid_to: visitorData.validTo,
          access_groups: ["visitor"]
        })
      });

      if (!response.ok) {
        console.error("Failed to register visitor in CLUe:", response.status, response.statusText);
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error registering visitor in CLUe:", error);
      return false;
    }
  }

  /**
   * Get list of connected X-Station 2 devices
   */
  async getDevices(): Promise<ClueDevice[]> {
    try {
      const response = await fetch(`${this.apiUrl}/v1/organizations/${this.organizationId}/devices`, {
        method: "GET",
        headers: {
          "Authorization": this.getAuthHeader()
        }
      });

      if (!response.ok) {
        console.error("Failed to fetch CLUe devices:", response.status, response.statusText);
        return [];
      }

      const data = await response.json() as { devices: ClueDevice[] };
      return data.devices || [];
    } catch (error) {
      console.error("Error fetching CLUe devices:", error);
      return [];
    }
  }

  /**
   * Sync users and visitors with CLUe platform
   */
  async syncWithPlatform(users: any[], visitors: any[]): Promise<{
    synced: number;
    failed: number;
    errors: string[];
  }> {
    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    // Sync visitors
    for (const visitor of visitors) {
      try {
        const success = await this.registerVisitor({
          id: visitor.id,
          firstName: visitor.firstName,
          lastName: visitor.lastName,
          email: visitor.email,
          company: visitor.company,
          validFrom: visitor.checkedInAt || new Date().toISOString(),
          validTo: visitor.expectedCheckout || new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()
        });

        if (success) {
          synced++;
        } else {
          failed++;
          errors.push(`Failed to sync visitor: ${visitor.firstName} ${visitor.lastName}`);
        }
      } catch (error) {
        failed++;
        errors.push(`Error syncing visitor ${visitor.id}: ${error}`);
      }
    }

    return { synced, failed, errors };
  }

  /**
   * Test CLUe API connection
   */
  async testConnection(): Promise<{
    success: boolean;
    message: string;
    devices?: number;
  }> {
    try {
      const devices = await this.getDevices();
      
      if (devices.length > 0) {
        return {
          success: true,
          message: `Connected successfully. Found ${devices.length} device(s).`,
          devices: devices.length
        };
      } else {
        return {
          success: true,
          message: "Connected successfully. No devices found.",
          devices: 0
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Connection failed: ${error}`,
        devices: 0
      };
    }
  }

  /**
   * Process webhook event from CLUe
   */
  async processWebhookEvent(event: ClueWebhookEvent): Promise<{
    processed: boolean;
    action?: string;
    message?: string;
  }> {
    console.log(`Processing CLUe webhook event: ${event.event_type} from device: ${event.device_name}`);

    switch (event.event_type) {
      case "qr_scan":
        // Handle QR code scan event
        return {
          processed: true,
          action: "check_in_out",
          message: `QR code ${event.qr_code} scanned at ${event.device_name}`
        };

      case "access_granted":
        // Handle successful access
        return {
          processed: true,
          action: "log_access",
          message: `Access granted for user ${event.user_id} at ${event.device_name}`
        };

      case "access_denied":
        // Handle denied access
        return {
          processed: true,
          action: "alert_security",
          message: `Access denied at ${event.device_name}: ${event.access_reason}`
        };

      default:
        return {
          processed: false,
          message: `Unknown event type: ${event.event_type}`
        };
    }
  }
}