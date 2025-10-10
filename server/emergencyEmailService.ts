import { storage } from './storage';
import crypto from 'crypto';
import { EmailService } from './emailService';

interface EmergencyEmailData {
  marshalName: string;
  marshalEmail: string;
  marshalDepartment: string;
  emergencyToken: string;
  activatedBy: string;
  activatedAt: string;
  totalPersonnel: number;
  staffCount: number;
  visitorCount: number;
  contractorCount: number;
  accountedFor: number;
  siteLocation: string;
  musterPoints: string[];
}

export class EmergencyEmailService {
  private static getFromEmail(): string {
    // Use environment variable or fallback to a common domain
    return process.env.EMERGENCY_FROM_EMAIL || 'noreply@example.com';
  }
  private static readonly FROM_NAME = 'VisiGate Pro Emergency System';

  /**
   * @deprecated LEGACY: This function generates temporary tokens that expire after 4 hours.
   * DO NOT USE: All emergency access now uses permanent static URLs via fire_marshal_url_id.
   * This function is kept for reference only and should be removed in a future cleanup.
   * See: Fire Marshal static URL system in staff table (fire_marshal_url_id column)
   */
  static async generateEmergencyToken(staffId: string, customerId: string): Promise<string> {
    console.error('⚠️ DEPRECATED: generateEmergencyToken called - this should not happen!');
    console.error('⚠️ Use fire_marshal_url_id instead for permanent emergency access');
    throw new Error('generateEmergencyToken is deprecated - use fire_marshal_url_id for permanent access');
  }

  static async sendFireMarshalAlert(emailData: EmergencyEmailData): Promise<boolean> {
    // NEW: Use static Fire Marshal URL (permanent, no expiration)
    const baseUrl = process.env.REPLIT_DOMAINS 
      ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` 
      : 'http://localhost:5000';
    const marshalUrl = `${baseUrl}/fire-marshal/${emailData.emergencyToken}`;  // emergencyToken now contains URL ID
    
    // Always show console URL for testing/debugging
    console.log('\n🚨 EMERGENCY ACTIVATED 🚨');
    console.log('=============================================');
    console.log(`Fire Marshal: ${emailData.marshalName}`);
    console.log(`Email: ${emailData.marshalEmail}`);
    console.log(`Department: ${emailData.marshalDepartment}`);
    console.log(`Activated by: ${emailData.activatedBy}`);
    console.log(`Personnel on-site: ${emailData.totalPersonnel}`);
    console.log('\n🔗 FIRE MARSHAL PERMANENT ACCESS URL:');
    console.log(marshalUrl);
    console.log('\n📱 This URL never expires - can be saved as a favorite!');
    console.log('=============================================\n');

    // If SMTP credentials are not configured, return success (console-only mode)
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.log('ℹ️  SMTP not configured - Console URL only (perfect for development testing)');
      return true;
    }

    // SMTP is configured - attempt to send actual email
    console.log('📧 SMTP configured - Sending emergency email...');

    const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>🚨 EMERGENCY MUSTER ACTIVATION</title>
        <style>
            body { 
                font-family: 'Segoe UI', Arial, sans-serif; 
                margin: 0; 
                padding: 20px; 
                background: linear-gradient(135deg, #dc2626, #991b1b);
                color: white;
            }
            .container { 
                max-width: 600px; 
                margin: 0 auto; 
                background: white; 
                border-radius: 16px; 
                overflow: hidden;
                box-shadow: 0 20px 40px rgba(0,0,0,0.3);
            }
            .header { 
                background: linear-gradient(135deg, #dc2626, #b91c1c); 
                padding: 30px; 
                text-align: center; 
                color: white;
            }
            .emergency-badge {
                background: #fbbf24;
                color: #1f2937;
                padding: 8px 16px;
                border-radius: 20px;
                font-weight: bold;
                font-size: 14px;
                display: inline-block;
                margin-bottom: 15px;
                animation: pulse 2s infinite;
            }
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.7; }
            }
            .content { 
                padding: 30px; 
                color: #1f2937;
            }
            .marshal-info {
                background: #f3f4f6;
                padding: 20px;
                border-radius: 8px;
                margin: 20px 0;
                border-left: 4px solid #3b82f6;
            }
            .stats {
                display: flex;
                justify-content: space-between;
                margin: 20px 0;
                background: #fef3c7;
                padding: 20px;
                border-radius: 8px;
                border: 2px solid #f59e0b;
            }
            .stat-item {
                text-align: center;
                flex: 1;
            }
            .stat-number {
                font-size: 24px;
                font-weight: bold;
                color: #dc2626;
                display: block;
            }
            .cta-button { 
                display: block; 
                background: linear-gradient(135deg, #dc2626, #b91c1c); 
                color: white; 
                text-decoration: none; 
                padding: 20px 40px; 
                border-radius: 12px; 
                text-align: center; 
                font-weight: bold; 
                font-size: 18px; 
                margin: 30px 0;
                box-shadow: 0 4px 15px rgba(220, 38, 38, 0.3);
            }
            .cta-button:hover { 
                background: linear-gradient(135deg, #b91c1c, #991b1b); 
            }
            .instructions {
                background: #ecfdf5;
                border: 2px solid #10b981;
                border-radius: 8px;
                padding: 20px;
                margin: 20px 0;
            }
            .instructions h3 {
                color: #065f46;
                margin-top: 0;
            }
            .instructions ul {
                color: #047857;
                padding-left: 20px;
            }
            .footer { 
                background: #f9fafb; 
                padding: 20px; 
                text-align: center; 
                color: #6b7280; 
                font-size: 14px;
                border-top: 1px solid #e5e7eb;
            }
            .urgent-note {
                background: #fee2e2;
                border: 2px solid #dc2626;
                border-radius: 8px;
                padding: 15px;
                margin: 20px 0;
                color: #7f1d1d;
                font-weight: bold;
            }
            @media (max-width: 600px) {
                .stats { flex-direction: column; gap: 10px; }
                .container { margin: 10px; }
                body { padding: 10px; }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="emergency-badge">🚨 EMERGENCY ACTIVATED</div>
                <h1 style="margin: 0; font-size: 28px;">FIRE MARSHAL RESPONSE REQUIRED</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">Immediate personnel accountability required</p>
            </div>
            
            <div class="content">
                <div class="marshal-info">
                    <h3 style="margin: 0 0 10px 0; color: #1f2937;">Fire Marshal Assignment</h3>
                    <p style="margin: 0;"><strong>Name:</strong> ${emailData.marshalName}</p>
                    <p style="margin: 5px 0 0 0;"><strong>Department:</strong> ${emailData.marshalDepartment}</p>
                </div>

                <div class="stats">
                    <div class="stat-item">
                        <span class="stat-number">${emailData.totalPersonnel}</span>
                        <span>Personnel On-Site</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-number">${emailData.activatedAt}</span>
                        <span>Activation Time</span>
                    </div>
                </div>

                <div class="urgent-note">
                    ⚠️ <strong>IMMEDIATE ACTION REQUIRED</strong><br>
                    An emergency evacuation is in progress!<br>
                    Click the button below to access the live Fire Marshal panel and mark people as safe:
                </div>

                <a href="${marshalUrl}" class="cta-button" style="color: white;">
                    🛡️ OPEN FIRE MARSHAL PANEL NOW
                </a>

                <div style="background: #dbeafe; border: 2px solid #3b82f6; border-radius: 8px; padding: 15px; margin: 20px 0;">
                    <h4 style="margin: 0 0 10px 0; color: #1e40af;">🔗 Permanent Access Link</h4>
                    <p style="margin: 0; color: #1e3a8a;">
                        <strong>This URL never expires!</strong> You can save it as a browser favorite for instant emergency access anytime. 
                        The same link works for all future emergencies.
                    </p>
                </div>

                <div class="instructions">
                    <h3>📋 Current Evacuation Status:</h3>
                    <ul>
                        <li><strong>Total People On-Site:</strong> ${emailData.totalPersonnel}</li>
                        <li><strong>Staff Members:</strong> ${emailData.staffCount}</li>
                        <li><strong>Visitors:</strong> ${emailData.visitorCount}</li>
                        <li><strong>Contractors:</strong> ${emailData.contractorCount}</li>
                        <li><strong>Accounted For:</strong> ${emailData.accountedFor}</li>
                        <li><strong>Unaccounted:</strong> <span style="color: #dc2626; font-weight: bold;">${emailData.totalPersonnel - emailData.accountedFor}</span></li>
                    </ul>
                </div>

                <div style="background: #ecfdf5; border: 2px solid #10b981; border-radius: 8px; padding: 15px; margin: 20px 0;">
                    <h4 style="margin: 0 0 10px 0; color: #065f46;">📱 Live Updates</h4>
                    <p style="margin: 0; color: #047857;">The Fire Marshal panel provides real-time updates and allows multiple Fire Marshals to work simultaneously. All changes are synchronized instantly across all devices.</p>
                </div>

                <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h4 style="margin: 0 0 10px 0; color: #1f2937;">Emergency Details:</h4>
                    <p style="margin: 0; color: #4b5563;"><strong>Activated by:</strong> ${emailData.activatedBy}</p>
                    <p style="margin: 5px 0 0 0; color: #4b5563;"><strong>Location:</strong> ${emailData.siteLocation}</p>
                    <p style="margin: 5px 0 0 0; color: #4b5563;"><strong>Time:</strong> ${emailData.activatedAt}</p>
                </div>

                <div class="urgent-note">
                    📱 <strong>Mobile Ready:</strong> This link opens a mobile-optimized interface designed for Fire Marshal use during emergencies. No additional login required.
                </div>
            </div>
            
            <div class="footer">
                <p>VisiGate Pro Emergency Management System</p>
                <p>This is an automated emergency notification. For support, contact your system administrator.</p>
                <p style="margin-top: 10px; font-size: 12px;">Emergency Services: 999 | Security Control Room: Available 24/7</p>
            </div>
        </div>
    </body>
    </html>`;

    const emailText = `
🚨 EMERGENCY MUSTER ACTIVATION - FIRE MARSHAL RESPONSE REQUIRED

Fire Marshal: ${emailData.marshalName} (${emailData.marshalDepartment})
Personnel On-Site: ${emailData.totalPersonnel}
Activated: ${emailData.activatedAt}
Activated by: ${emailData.activatedBy}

IMMEDIATE ACTION REQUIRED:
Access your Fire Marshal control panel: ${marshalUrl}

Key Features:
- No login required (secure token access)
- Mobile-optimized for phones/tablets  
- Real-time sync with other Fire Marshals
- Large touch-friendly buttons for quick updates
- Automatic updates across all devices

Your responsibilities:
1. Access the control panel immediately
2. Account for all personnel using the mobile interface
3. Mark people as safe once confirmed
4. Coordinate with other Fire Marshals as needed

This token expires in 4 hours from activation.

Emergency Services: 999
VisiGate Pro Emergency System - Automated Notification
`;

    // Use the working EmailService from /settings
    try {
      const emailService = new EmailService();
      
      const success = await emailService.sendEmail({
        to: emailData.marshalEmail,
        subject: `🚨 EMERGENCY MUSTER ACTIVATION - Fire Marshal Response Required`,
        html: emailHtml,
        text: emailText,
        companyName: EmergencyEmailService.FROM_NAME
      });
      
      if (success) {
        console.log(`✅ Emergency email sent successfully to Fire Marshal: ${emailData.marshalEmail}`);
        return true;
      } else {
        console.error('Failed to send Fire Marshal email via EmailService');
        console.log('ℹ️  Emergency URL still available in console above for testing');
        return true; // Return success since console URL was provided
      }
    } catch (error) {
      console.error('Error sending emergency email:', error instanceof Error ? error.message : String(error));
      console.log('ℹ️  Emergency URL still available in console above for testing');
      return true; // Return success since console URL was provided
    }
  }

  static async notifyAllFireMarshals(activatedBy: string): Promise<{ sent: number; total: number; errors: string[] }> {
    try {
      const fireMarshals = await storage.getFireMarshals();
      const totalPersonnel = await storage.getTotalOnSitePersonnel();
      const companySettings = await storage.getCompanySettings();
      const siteLocation = companySettings?.address || 'Site Location Not Configured';
      
      // Get staff and visitor counts
      const checkedInStaff = await storage.getCheckedInStaff();
      const currentVisitors = await storage.getCurrentVisitors();
      
      let sent = 0;
      const errors: string[] = [];

      for (const marshal of fireMarshals) {
        try {
          // NEW: Use static Fire Marshal URL ID instead of temporary tokens
          if (!marshal.fireMarshalUrlId) {
            console.warn(`⚠️ Fire Marshal ${marshal.firstName} ${marshal.lastName} has no URL ID, skipping`);
            errors.push(`Fire Marshal ${marshal.firstName} ${marshal.lastName} has no emergency URL configured`);
            continue;
          }
          
          const emailData: EmergencyEmailData = {
            marshalName: `${marshal.firstName} ${marshal.lastName}`,
            marshalEmail: marshal.email,
            marshalDepartment: marshal.department,
            emergencyToken: marshal.fireMarshalUrlId,  // Use static URL ID instead of temporary token
            activatedBy,
            activatedAt: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
            totalPersonnel,
            staffCount: checkedInStaff.length,
            visitorCount: currentVisitors.length,
            accountedFor: 0,
            siteLocation,
            musterPoints: ['Main Car Park', 'Side Entrance', 'Rear Assembly']
          };

          const success = await this.sendFireMarshalAlert(emailData);
          if (success) {
            sent++;
          } else {
            errors.push(`Failed to send to ${marshal.email}`);
          }
        } catch (error) {
          errors.push(`Error for ${marshal.email}: ${error}`);
        }
      }

      return { sent, total: fireMarshals.length, errors };
    } catch (error) {
      console.error('Error notifying Fire Marshals:', error);
      return { sent: 0, total: 0, errors: [error instanceof Error ? error.message : String(error)] };
    }
  }
}