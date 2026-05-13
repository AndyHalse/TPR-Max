import fetch from 'node-fetch';
import {
  VoiceNotificationLog,
  InsertVoiceNotificationLog,
  Staff,
  Visitor,
  insertVoiceNotificationLogSchema
} from '@shared/schema';
import { DatabaseStorage } from './DatabaseStorage';
import { logger } from './utils/logger';

/**
 * 8x8 Voice Notification Service
 * 
 * Integrates with 8x8 Connect Voice Messaging API to send automated voice calls
 * to staff members when visitors arrive. Uses 8x8's native text-to-speech
 * instead of OpenAI for cost-effectiveness.
 */

// 8x8 API Configuration
interface EightByEightConfig {
  apiBaseUrl: string;
  subAccountId: string;
  bearerToken: string;
  defaultSourceNumber: string;
}

// 8x8 Voice Call Request
interface VoiceCallRequest {
  validUntil: string;
  callflow: CallflowAction[];
}

interface CallflowAction {
  action: 'makeCall' | 'say' | 'hangup';
  params?: {
    source?: string;
    destination?: string;
    text?: string;
    language?: string;
    voiceProfile?: string;
    repetition?: number;
    speed?: number;
  };
}

// 8x8 API Response
interface EightByEightResponse {
  callflowId: string;
  callId: string;
  status: string;
  message?: string;
  error?: string;
}

// Voice notification types
export interface VoiceNotificationRequest {
  staffId: string;
  visitorId?: string;
  notificationType: 'visitor_arrival' | 'emergency_alert' | 'system_notification' | 'test_call';
  messageText?: string; // Custom message, otherwise generated
  voiceLanguage?: string; // Override staff preference
  voiceProfile?: string; // Override staff preference
  urgentRetry?: boolean; // For emergency notifications
}

export class VoiceNotificationService {
  private config: EightByEightConfig;
  private storage: DatabaseStorage;

  constructor(storage: DatabaseStorage) {
    this.storage = storage;
    
    // Initialize 8x8 configuration from environment variables
    this.config = {
      apiBaseUrl: process.env.EIGHTBYEIGHT_API_BASE_URL || 'https://voice.wavecell.com/api/v1',
      subAccountId: process.env.EIGHTBYEIGHT_SUB_ACCOUNT_ID || '',
      bearerToken: process.env.EIGHTBYEIGHT_BEARER_TOKEN || '',
      defaultSourceNumber: process.env.EIGHTBYEIGHT_SOURCE_NUMBER || '442000000000', // UK number format
    };

    // Validate configuration
    if (!this.config.subAccountId || !this.config.bearerToken) {
      logger.warn('8x8 Voice API not configured. Voice notifications will be disabled.');
    }
  }

  /**
   * Send voice notification for visitor arrival
   */
  async sendVisitorArrivalNotification(
    staff: Staff,
    visitor: Visitor,
    customMessage?: string,
    context?: CustomerContext
  ): Promise<VoiceNotificationLog | null> {
    try {
      // Check if staff has voice notifications enabled and phone number
      if (!staff.voiceNotificationsEnabled || !staff.phoneNumber) {
        logger.info(`Voice notifications disabled or no phone number for staff ${staff.id}`);
        return null;
      }

      // Generate message text
      const messageText = customMessage || this.generateVisitorArrivalMessage(staff, visitor);
      
      // Create notification request
      const request: VoiceNotificationRequest = {
        staffId: staff.id,
        visitorId: visitor.id,
        notificationType: 'visitor_arrival',
        messageText,
        voiceLanguage: staff.voiceLanguage || 'en-GB',
        voiceProfile: staff.voiceProfile || 'en-GB-Standard-A',
      };

      return await this.sendVoiceNotification(request, staff, context);
    } catch (error) {
      logger.error('Error sending visitor arrival voice notification:', error);
      return null;
    }
  }

  /**
   * Send emergency voice notification
   */
  async sendEmergencyNotification(
    staff: Staff,
    emergencyMessage: string,
    context?: CustomerContext
  ): Promise<VoiceNotificationLog | null> {
    try {
      if (!staff.phoneNumber) {
        logger.info(`No phone number for emergency notification to staff ${staff.id}`);
        return null;
      }

      const request: VoiceNotificationRequest = {
        staffId: staff.id,
        notificationType: 'emergency_alert',
        messageText: emergencyMessage,
        voiceLanguage: staff.voiceLanguage || 'en-GB',
        voiceProfile: staff.voiceProfile || 'en-GB-Standard-A',
        urgentRetry: true,
      };

      return await this.sendVoiceNotification(request, staff, context);
    } catch (error) {
      logger.error('Error sending emergency voice notification:', error);
      return null;
    }
  }

  /**
   * Test voice notification (for settings testing)
   */
  async sendTestNotification(
    context: CustomerContext,
    staff: Staff,
    testMessage?: string
  ): Promise<VoiceNotificationLog | null> {
    try {
      if (!staff.phoneNumber) {
        throw new Error('No phone number configured for voice notifications');
      }

      const message = testMessage || `Hello ${staff.firstName}, this is a test call from TPR. Your voice notifications are working correctly.`;

      const request: VoiceNotificationRequest = {
        staffId: staff.id,
        notificationType: 'system_notification',
        messageText: message,
        voiceLanguage: staff.voiceLanguage || 'en-GB',
        voiceProfile: staff.voiceProfile || 'en-GB-Standard-A',
      };

      return await this.sendVoiceNotification(request, staff, context);
    } catch (error) {
      logger.error('Error sending test voice notification:', error);
      throw error;
    }
  }

  /**
   * Core method to send voice notification via 8x8 API
   */
  private async sendVoiceNotification(
    request: VoiceNotificationRequest,
    staff: Staff,
    context?: CustomerContext
  ): Promise<VoiceNotificationLog> {
    // Create initial log entry
    const logData: InsertVoiceNotificationLog = {
      customerId: staff.customerId,
      staffId: request.staffId,
      visitorId: request.visitorId,
      notificationType: request.notificationType,
      messageText: request.messageText!,
      voiceLanguage: request.voiceLanguage!,
      voiceProfile: request.voiceProfile!,
      recipientPhoneNumber: staff.phoneNumber!,
      sourcePhoneNumber: this.config.defaultSourceNumber,
      status: 'pending',
      deliveryAttempts: 1,
      maxRetries: request.urgentRetry ? 5 : 3,
      retryCount: 0,
      triggeredBy: 'system_event',
    };

    // Validate and insert log
    const validatedData = insertVoiceNotificationLogSchema.parse(logData);
    const logId = await this.storage.createVoiceNotificationLog(validatedData);
    
    try {
      // Check if 8x8 is configured
      if (!this.config.subAccountId || !this.config.bearerToken) {
        throw new Error('8x8 Voice API not configured');
      }

      // Prepare 8x8 voice call request
      const voiceCallRequest: VoiceCallRequest = {
        validUntil: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes from now
        callflow: [
          {
            action: 'makeCall',
            params: {
              source: this.config.defaultSourceNumber,
              destination: this.formatPhoneNumber(staff.phoneNumber!),
            },
          },
          {
            action: 'say',
            params: {
              text: request.messageText!,
              language: request.voiceLanguage!,
              voiceProfile: request.voiceProfile!,
              repetition: 1,
              speed: 1,
            },
          },
          {
            action: 'hangup',
          },
        ],
      };

      // Make API call to 8x8
      const response = await this.makeEightByEightAPICall(voiceCallRequest);

      // Update log with success
      const updatedLog = await this.storage.updateVoiceNotificationLog(logId, {
        status: 'sent',
        eightByEightCallId: response.callId,
        eightByEightCallflowId: response.callflowId,
        lastAttemptAt: new Date(),
      });

      logger.info(`Voice notification sent successfully. Call ID: ${response.callId}`);
      return updatedLog;

    } catch (error) {
      // Update log with error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      await this.storage.updateVoiceNotificationLog(logId, {
        status: 'failed',
        errorMessage,
        failedAt: new Date(),
        lastAttemptAt: new Date(),
      });

      logger.error('8x8 API call failed:', errorMessage);
      throw error;
    }
  }

  /**
   * Make HTTP request to 8x8 Voice API
   */
  private async makeEightByEightAPICall(request: VoiceCallRequest): Promise<EightByEightResponse> {
    const url = `${this.config.apiBaseUrl}/subaccounts/${this.config.subAccountId}/callflows`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.bearerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`8x8 API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as EightByEightResponse;
    
    if (data.error) {
      throw new Error(`8x8 API error: ${data.error}`);
    }

    return data;
  }

  /**
   * Generate visitor arrival message
   */
  private generateVisitorArrivalMessage(staff: Staff, visitor: Visitor): string {
    const visitorName = `${visitor.firstName} ${visitor.lastName}`.trim();
    const companyText = visitor.company ? ` from ${visitor.company}` : '';
    const purposeText = visitor.purpose ? ` regarding ${visitor.purpose}` : '';

    return `Hello ${staff.firstName}, you have a visitor. ${visitorName}${companyText} has arrived${purposeText}. Please check your TPR dashboard for more details.`;
  }

  /**
   * Format phone number for international calling
   */
  private formatPhoneNumber(phoneNumber: string): string {
    // Remove all non-digit characters
    let cleaned = phoneNumber.replace(/\D/g, '');
    
    // Handle UK numbers
    if (cleaned.startsWith('0')) {
      cleaned = '44' + cleaned.substring(1); // Convert UK local to international
    } else if (!cleaned.startsWith('44') && cleaned.length === 10) {
      cleaned = '44' + cleaned; // Assume UK number missing country code
    }
    
    return cleaned;
  }

  /**
   * Get voice notification statistics
   */
  async getNotificationStats(customerId: string, startDate?: Date, endDate?: Date) {
    return await this.storage.getVoiceNotificationStats(customerId, startDate, endDate);
  }

  /**
   * Get recent voice notifications for a staff member
   */
  async getStaffNotifications(staffId: string, limit: number = 10) {
    return await this.storage.getVoiceNotificationsByStaff(staffId, limit);
  }

  /**
   * Retry failed voice notifications
   */
  async retryFailedNotifications(maxRetries: number = 5): Promise<number> {
    const failedNotifications = await this.storage.getFailedVoiceNotifications(maxRetries);
    let retriedCount = 0;

    for (const notification of failedNotifications) {
      try {
        // Get staff details
        const staff = await this.storage.getStaffById(notification.staffId);
        if (!staff) continue;

        // Retry the notification
        const request: VoiceNotificationRequest = {
          staffId: notification.staffId,
          visitorId: notification.visitorId || undefined,
          notificationType: notification.notificationType as any,
          messageText: notification.messageText,
          voiceLanguage: notification.voiceLanguage,
          voiceProfile: notification.voiceProfile,
        };

        await this.sendVoiceNotification(request, staff);
        retriedCount++;

      } catch (error) {
        logger.error(`Failed to retry voice notification ${notification.id}:`, error);
      }
    }

    return retriedCount;
  }
}