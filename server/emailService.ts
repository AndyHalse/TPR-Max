import nodemailer from 'nodemailer';
import crypto from 'crypto';
import type { RoomBooking, MeetingRoom, Staff, Visitor, CompanySettings } from '@shared/schema';
import { CustomerDatabaseService } from './customerDatabase.js';
import { emailLog } from './isolatedSchema.js';
import { logger } from './utils/logger';
import { ObjectStorageService, ObjectNotFoundError } from './objectStorage.js';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
  companyName?: string;
  fromName?: string;
  replyTo?: string;
  bcc?: string;
}

class EmailService {
  private transporter;
  private customerId?: string;

  // Infer a human-readable email type from the subject line
  private static inferEmailType(subject: string): string {
    const s = subject.toLowerCase();
    if (s.includes('fire marshal')) return 'Fire Marshal Alert';
    if (s.includes('evacuat')) return 'Evacuation Alert';
    if (s.includes('induction')) return 'Induction Link';
    if (s.includes('h&s') || s.includes('health & safety') || s.includes('health and safety') || s.includes('compliance required') || s.includes('compliance:') || s.includes('h&s compliance')) return 'H&S Document';
    if (s.includes('booking') || s.includes('room')) return 'Room Booking';
    if (s.includes('invitation') || s.includes('invited')) return 'Visitor Invitation';
    if (s.includes('e-pass') || s.includes('epass') || s.includes('digital pass')) return 'E-Pass';
    if (s.includes('checkout') || s.includes('check-out')) return 'Checkout Reminder';
    if (s.includes('reminder')) return 'Meeting Reminder';
    if (s.includes('report')) return 'Report';
    if (s.includes('welcome')) return 'Welcome / Onboarding';
    if (s.includes('card')) return 'Card Notification';
    return 'System Email';
  }

  // Helper function to convert HTML to plain text
  private generatePlainTextFromHtml(html: string | undefined | null): string {
    // Handle null/undefined HTML content
    if (!html || typeof html !== 'string') {
      return '';
    }
    
    // Basic HTML to plain text conversion
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove style tags
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove script tags
      .replace(/<[^>]+>/g, ' ') // Remove HTML tags
      .replace(/\s+/g, ' ') // Multiple spaces to single
      .replace(/&nbsp;/g, ' ') // Non-breaking spaces
      .replace(/&amp;/g, '&') // Ampersands
      .replace(/&lt;/g, '<') // Less than
      .replace(/&gt;/g, '>') // Greater than
      .replace(/&quot;/g, '"') // Quotes
      .trim();
  }

  constructor(customerId?: string) {
    this.customerId = customerId;
    // Use SMTP configuration from environment variables
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  async sendEmail(options: EmailOptions & { attachments?: any[] }): Promise<boolean> {
    let success = false;
    try {
      // Get company name from options if available
      const companyName = options.companyName || 'TPR Max';
      
      // Use a simpler from format to avoid spam filters
      const fromAddress = process.env.SMTP_USER || 'noreply@visigate.pro';
      const domain = fromAddress.split('@')[1] || 'visigate.pro';
      
      const mailOptions: Record<string, any> = {
        from: `${options.fromName || companyName} <${fromAddress}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || this.generatePlainTextFromHtml(options.html),
        attachments: options.attachments || [],
        headers: {
          'X-Mailer': 'TPR Max Visitor Management System',
          'Message-ID': `<${Date.now()}.${Math.random().toString(36).substring(2)}@${domain}>`,
          'Date': new Date().toUTCString(),
          'X-Priority': '3',
          'Importance': 'normal',
          'List-Unsubscribe': `<mailto:${fromAddress}?subject=Unsubscribe>`,
          'X-Entity-Ref-ID': Math.random().toString(36).substring(2),
          'X-Auto-Response-Suppress': 'OOF, AutoReply',
          'Precedence': 'bulk',
        },
        replyTo: options.replyTo || process.env.SMTP_REPLY_TO || process.env.SMTP_USER,
        ...(options.bcc ? { bcc: options.bcc } : {}),
      };

      await this.transporter.sendMail(mailOptions);
      logger.info(`Email sent successfully to ${options.to}`);
      success = true;
    } catch (error) {
      logger.error('Failed to send email:', error);
      success = false;
    }

    // Fire-and-forget: log email to outbox (never blocks or throws)
    if (this.customerId) {
      const customerId = this.customerId;
      const subject = options.subject || '';
      const htmlBody = options.html || '';
      const textBody = options.text || '';
      const recipientEmail = options.to || '';
      const emailType = EmailService.inferEmailType(subject);
      const status = success ? 'sent' : 'failed';
      setImmediate(async () => {
        try {
          const customerDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(customerId);
          await customerDb.insert(emailLog).values({
            recipientEmail,
            subject,
            htmlBody,
            textBody,
            emailType,
            status,
          });
        } catch (logErr) {
          logger.error('[EmailLog] Failed to log email to outbox:', logErr);
        }
      });
    }

    return success;
  }

  async sendReport(report: any, settings: any, recipients: string[], reportData: any): Promise<boolean> {
    try {
      const companyName = settings?.companyName || 'TPR Max';
      const subject = `${report.reportType} Report - ${new Date(report.dateFrom).toLocaleDateString()} to ${new Date(report.dateTo).toLocaleDateString()}`;
      
      // Generate HTML content for the report
      const html = this.generateReportHTML(report, reportData, companyName);
      const text = this.generateReportText(report, reportData, companyName);
      
      // Send to all recipients
      let allSent = true;
      for (const recipient of recipients) {
        const sent = await this.sendEmail({
          to: recipient,
          subject,
          html,
          text
        });
        if (!sent) allSent = false;
      }
      
      return allSent;
    } catch (error) {
      logger.error('Failed to send report email:', error);
      return false;
    }
  }

  async sendGenericEmail(to: string, subject: string, text: string): Promise<boolean> {
    try {
      const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h2 style="color:#1e4f8c">${subject}</h2>
        <div style="white-space:pre-wrap;line-height:1.6;color:#333">${text.replace(/\n/g, '<br>')}</div>
        <hr style="margin-top:32px;border:none;border-top:1px solid #e5e7eb"/>
        <p style="font-size:12px;color:#9ca3af">This message was sent from TPR Max — Site Compliance Platform</p>
      </div>`;
      return await this.sendEmail({ to, subject, html, text });
    } catch (err) {
      logger.error('Failed to send generic email:', err);
      return false;
    }
  }

  async sendTestEmail(email: string): Promise<boolean> {
    try {
      const testEmailOptions = {
        to: email,
        subject: 'TPR Max - Test Email',
        html: '<h2>Test Email Successful</h2><p>This is a test email from TPR Max system. Your email configuration is working correctly.</p>',
        text: 'Test Email Successful\n\nThis is a test email from TPR Max system. Your email configuration is working correctly.'
      };

      return await this.sendEmail(testEmailOptions);
    } catch (error) {
      logger.error('Failed to send test email:', error);
      return false;
    }
  }

  /**
   * Send professional, mobile-responsive H&S document assignment email
   */
  async sendHSDocumentAssignment(options: {
    workerEmail: string;
    workerName: string;
    documentName: string;
    complianceCategory: string;
    companyName: string;
    acceptanceToken: string;
    dueDate?: Date;
    companySettings?: any;
  }): Promise<boolean> {
    try {
      const {
        workerEmail,
        workerName,
        documentName,
        complianceCategory,
        companyName,
        acceptanceToken,
        dueDate,
        companySettings
      } = options;

      // Get company branding
      const primaryColor = companySettings?.accentColor || '#ef4444'; // Red for H&S compliance
      const secondaryColor = companySettings?.backgroundColor || '#f8fafc';
      
      // Helper function to create absolute URLs for email clients
      const absolutizeUrl = (url: string | undefined | null): string | null => {
        if (!url) return null;
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        
        const host = (process.env.REPLIT_DOMAINS?.split(',')[0] || process.env.BASE_URL || process.env.PUBLIC_URL || 'https://www.tpr-max.com').trim();
        const base = host.startsWith('http') ? host : `https://${host}`;
        const cleanBase = base.replace(/\/$/, ''); // Remove trailing slash
        const cleanPath = url.replace(/^\//, ''); // Remove leading slash
        return `${cleanBase}/${cleanPath}`;
      };
      
      const logoUrl = absolutizeUrl(companySettings?.logoUrl);
      
      // Generate acceptance URL fresh at email time (like contractor H&S acceptance)
      const baseUrl = process.env.REPLIT_DOMAINS 
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` 
        : (process.env.PUBLIC_URL || process.env.BASE_URL || 'http://localhost:5000');
      const acceptanceUrl = `${baseUrl}/hs-document/${acceptanceToken}`;
      
      logger.info(`📧 H&S Email: Using logo URL: ${logoUrl || 'No logo configured'}, Primary color: ${primaryColor}`);
      logger.info(`📧 H&S Email: Generated fresh acceptance URL: ${acceptanceUrl}`);

      const subject = `🛡️ UK H&S Compliance Required: ${documentName}`;

      const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
          <title>UK Health & Safety Compliance Document</title>
          <!--[if mso]>
          <noscript>
            <xml>
              <o:OfficeDocumentSettings>
                <o:PixelsPerInch>96</o:PixelsPerInch>
              </o:OfficeDocumentSettings>
            </xml>
          </noscript>
          <![endif]-->
          <style>
            /* Mobile-first responsive design */
            @media only screen and (max-width: 600px) {
              .container { width: 100% !important; padding: 10px !important; }
              .header-logo { max-width: 120px !important; height: auto !important; }
              .main-content { padding: 20px 15px !important; }
              .cta-button { width: 100% !important; padding: 16px 20px !important; font-size: 16px !important; }
              .document-card { margin: 15px 0 !important; padding: 15px !important; }
              .footer-content { padding: 15px !important; }
              h1 { font-size: 22px !important; line-height: 28px !important; }
              h2 { font-size: 18px !important; line-height: 24px !important; }
            }
            
            /* High contrast for accessibility */
            .high-contrast { background: #1a1a1a; color: #ffffff; }
            .text-contrast { color: #333333; }
            
            /* Print styles */
            @media print {
              .no-print { display: none !important; }
            }
          </style>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f6f6f6; font-family: 'Arial', 'Helvetica', sans-serif; line-height: 1.6;">
          <div style="width: 100%; background-color: #f6f6f6; padding: 20px 0;">
            
            <!-- Email Container -->
            <div class="container" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); border-radius: 8px; overflow: hidden;">
              
              <!-- Header Section -->
              <div style="background: linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}dd 100%); color: white; padding: 30px 20px; text-align: center; position: relative;">
                ${logoUrl ? `
                  <img src="${logoUrl}" alt="${companyName} Logo" class="header-logo" style="max-width: 150px; height: auto; margin-bottom: 15px; border-radius: 4px;">
                ` : ''}
                
                <h1 style="margin: 0; font-size: 26px; font-weight: bold; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">
                  🛡️ UK Health & Safety Compliance
                </h1>
                
                <div style="background: rgba(255,255,255,0.15); padding: 8px 16px; border-radius: 20px; display: inline-block; margin-top: 10px;">
                  <span style="font-size: 14px; font-weight: 500;">
                    Action Required • ${complianceCategory.toUpperCase()}
                  </span>
                </div>
              </div>
              
              <!-- Main Content -->
              <div class="main-content" style="padding: 30px 25px;">
                
                <!-- Personal Greeting -->
                <div style="margin-bottom: 25px;">
                  <h2 style="color: #1f2937; margin: 0 0 8px 0; font-size: 20px;">
                    Hello ${workerName.split(' ')[0]},
                  </h2>
                  <p style="color: #6b7280; margin: 0; font-size: 16px;">
                    You have been assigned a critical UK Health & Safety compliance document that requires immediate attention.
                  </p>
                </div>
                
                <!-- Document Information Card -->
                <div class="document-card" style="background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border: 1px solid #fecaca; border-radius: 12px; padding: 25px; margin: 25px 0; position: relative;">
                  <div style="display: flex; align-items: center; margin-bottom: 15px;">
                    <div style="background: ${primaryColor}; color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 15px;">
                      📋
                    </div>
                    <div>
                      <h3 style="margin: 0; color: #991b1b; font-size: 18px; font-weight: bold;">
                        ${documentName}
                      </h3>
                      <p style="margin: 2px 0 0 0; color: #7f1d1d; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">
                        ${complianceCategory} • ${companyName}
                      </p>
                    </div>
                  </div>
                  
                  ${dueDate ? `
                    <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid #fca5a5; border-radius: 8px; padding: 12px; margin-top: 15px;">
                      <p style="margin: 0; color: #991b1b; font-weight: 600; font-size: 15px;">
                        ⏰ <strong>Due Date:</strong> ${new Date(dueDate).toLocaleDateString('en-GB', { 
                          weekday: 'long', 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}
                      </p>
                    </div>
                  ` : ''}
                </div>
                
                <!-- Critical Notice -->
                <div style="background: #fbbf24; color: #92400e; border: 2px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 25px 0; text-align: center;">
                  <p style="margin: 0; font-weight: bold; font-size: 15px;">
                    ⚠️ <strong>IMPORTANT:</strong> This document must be completed before you can commence work on site
                  </p>
                </div>
                
                <!-- Call to Action -->
                <div style="text-align: center; margin: 35px 0;">
                  <p style="color: #4b5563; margin-bottom: 20px; font-size: 16px;">
                    Click the button below to review and accept this compliance document:
                  </p>
                  
                  <a href="${acceptanceUrl}" 
                     class="cta-button"
                     style="background: linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}dd 100%); 
                            color: white; 
                            text-decoration: none; 
                            padding: 18px 36px; 
                            border-radius: 8px; 
                            display: inline-block; 
                            font-weight: bold; 
                            font-size: 16px; 
                            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); 
                            transition: all 0.3s ease;
                            border: 2px solid ${primaryColor};">
                    🛡️ Review & Accept Document
                  </a>
                  
                  <p style="color: #9ca3af; font-size: 12px; margin-top: 15px;">
                    Secure link expires in 7 days • Mobile & desktop friendly
                  </p>
                </div>
                
                <!-- Help Section -->
                <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin: 25px 0; border-left: 4px solid #6b7280;">
                  <h4 style="margin: 0 0 10px 0; color: #374151; font-size: 16px;">
                    📞 Need Help?
                  </h4>
                  <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                    If you have questions about this compliance document or experience technical issues, 
                    please contact your site supervisor or email 
                    <a href="mailto:${companySettings?.email || 'support@' + companyName.toLowerCase().replace(/\s+/g, '') + '.com'}" 
                       style="color: ${primaryColor}; text-decoration: none; font-weight: 500;">
                      ${companySettings?.email || 'support@' + companyName.toLowerCase().replace(/\s+/g, '') + '.com'}
                    </a>
                  </p>
                </div>
                
              </div>
              
              <!-- Footer -->
              <div class="footer-content" style="background: #f9fafb; border-top: 1px solid #e5e7eb; padding: 25px; text-align: center;">
                <div style="margin-bottom: 15px;">
                  <p style="margin: 0; color: #374151; font-weight: 600; font-size: 15px;">
                    ${companyName}
                  </p>
                  ${companySettings?.address ? `
                    <p style="margin: 5px 0; color: #6b7280; font-size: 13px;">
                      ${companySettings.address}
                    </p>
                  ` : ''}
                  ${companySettings?.phone ? `
                    <p style="margin: 5px 0; color: #6b7280; font-size: 13px;">
                      📞 ${companySettings.phone}
                    </p>
                  ` : ''}
                </div>
                
                <div style="border-top: 1px solid #d1d5db; padding-top: 15px; margin-top: 15px;">
                  <p style="margin: 0; color: #9ca3af; font-size: 12px; line-height: 1.4;">
                    This email was sent automatically by the TPR compliance system.<br>
                    You are receiving this because you have been assigned a UK H&S compliance document.<br>
                    For system support, visit our <a href="https://visigate.pro/support" style="color: ${primaryColor}; text-decoration: none;">help center</a>.
                  </p>
                </div>
              </div>
              
            </div>
            
            <!-- Email Client Spacing -->
            <div style="height: 20px;"></div>
            
          </div>
        </body>
        </html>
      `;

      // Generate accessible plain text version
      const text = `UK HEALTH & SAFETY COMPLIANCE DOCUMENT

Hello ${workerName},

You have been assigned a critical UK Health & Safety compliance document that requires immediate attention.

DOCUMENT DETAILS:
- Document: ${documentName}
- Category: ${complianceCategory}
- Company: ${companyName}
${dueDate ? `- Due Date: ${new Date(dueDate).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}` : ''}

IMPORTANT: This document must be completed before you can commence work on site.

To review and accept this compliance document, please visit:
${acceptanceUrl}

This secure link expires in 7 days and is mobile & desktop friendly.

NEED HELP?
If you have questions about this compliance document or experience technical issues, please contact your site supervisor or email ${companySettings?.email || 'support@' + companyName.toLowerCase().replace(/\s+/g, '') + '.com'}

${companyName}
${companySettings?.address || ''}
${companySettings?.phone ? 'Phone: ' + companySettings.phone : ''}

This email was sent automatically by the TPR compliance system.
You are receiving this because you have been assigned a UK H&S compliance document.
For system support, visit: https://visigate.pro/support`;

      return await this.sendEmail({
        to: workerEmail,
        subject,
        html,
        text,
        companyName
      });

    } catch (error) {
      logger.error('Failed to send H&S document assignment email:', error);
      return false;
    }
  }

  public generateReportHTML(report: any, reportData: any, companyName: string): string {
    const fromDate = new Date(report.dateFrom).toLocaleDateString('en-GB');
    const toDate = new Date(report.dateTo).toLocaleDateString('en-GB');
    const generatedAt = new Date(report.generatedAt);
    
    const reportTypeNames: Record<string, string> = {
      daily: 'Daily Visitor Log', weekly: 'Weekly Visitor Log', monthly: 'Monthly Visitor Log',
      staff_attendance: 'Staff Attendance Report', contractor_activity: 'Contractor Activity Report',
      contractor_compliance: 'Contractor Compliance Report', compliance_gap: 'Contractor Compliance Gap Report',
      site_headcount: 'Site Headcount / Roll Call', evacuation_readiness: 'Evacuation Readiness Report',
      health_safety: 'Health & Safety / BBS Report',
      fire_risk: 'Fire Risk Assessment Report',
      permit_to_work: 'Permit to Work Report',
      risk_assessments: 'Risk Assessment Register',
      ppm_compliance: 'PPM Compliance Report',
      audit_inspection: 'Audit & Inspection Report',
    };
    const reportTitle = reportTypeNames[report.reportType] || report.reportType;

    const baseStyles = `
      body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 30px; background: #fff; color: #1a1a2e; }
      .header { border-bottom: 3px solid #2460a9; padding-bottom: 15px; margin-bottom: 25px; }
      .company-name { color: #2460a9; font-size: 22px; font-weight: bold; }
      .report-title { color: #1a1a2e; font-size: 18px; margin: 8px 0 4px; }
      .report-meta { color: #666; font-size: 13px; }
      .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; margin: 20px 0; }
      .stat-card { background: #f0f7ff; padding: 15px; border-radius: 8px; border-left: 4px solid #2460a9; }
      .stat-card.green { border-left-color: #16a34a; background: #f0fdf4; }
      .stat-card.amber { border-left-color: #d97706; background: #fffbeb; }
      .stat-card.red { border-left-color: #dc2626; background: #fef2f2; }
      .stat-number { font-size: 28px; font-weight: bold; color: #2460a9; }
      .stat-card.green .stat-number { color: #16a34a; }
      .stat-card.amber .stat-number { color: #d97706; }
      .stat-card.red .stat-number { color: #dc2626; }
      .stat-label { color: #555; font-size: 13px; margin-top: 2px; }
      table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 13px; }
      th { background: #2460a9; color: #fff; padding: 10px 12px; text-align: left; font-weight: 600; }
      td { padding: 9px 12px; border-bottom: 1px solid #e5e7eb; }
      tr:nth-child(even) { background: #f9fafb; }
      .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; }
      .badge-green { background: #dcfce7; color: #166534; }
      .badge-red { background: #fee2e2; color: #991b1b; }
      .badge-amber { background: #fef3c7; color: #92400e; }
      .badge-blue { background: #dbeafe; color: #1e40af; }
      .badge-gray { background: #f3f4f6; color: #374151; }
      h3 { color: #1a1a2e; font-size: 16px; margin: 25px 0 10px; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; }
      .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #e5e7eb; color: #888; font-size: 11px; }
      @media print { body { padding: 15px; } .stat-card { break-inside: avoid; } table { page-break-inside: auto; } tr { page-break-inside: avoid; } }
    `;

    let bodyContent = '';

    if (reportData.type === 'visitor_log') {
      const visitors = reportData.visitors || [];
      const checkedOut = reportData.checkedOutVisitors || [];
      const totalDur = checkedOut.reduce((sum: number, v: any) => {
        if (v.checkedOutAt) return sum + (new Date(v.checkedOutAt).getTime() - new Date(v.checkedInAt).getTime());
        return sum;
      }, 0);
      const avgMin = checkedOut.length > 0 ? Math.round(totalDur / checkedOut.length / 60000) : 0;
      const stillOnSite = visitors.filter((v: any) => !v.checkedOutAt).length;

      bodyContent = `
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-number">${visitors.length}</div><div class="stat-label">Total Visitors</div></div>
          <div class="stat-card green"><div class="stat-number">${checkedOut.length}</div><div class="stat-label">Checked Out</div></div>
          <div class="stat-card amber"><div class="stat-number">${stillOnSite}</div><div class="stat-label">Still On-Site</div></div>
          <div class="stat-card"><div class="stat-number">${avgMin > 0 ? avgMin + ' min' : 'N/A'}</div><div class="stat-label">Avg Visit Duration</div></div>
        </div>
        ${visitors.length > 0 ? `<h3>Visitor Log</h3><table><thead><tr><th>Name</th><th>Company</th><th>Host</th><th>Purpose</th><th>Check-in</th><th>Check-out</th><th>Duration</th></tr></thead><tbody>
        ${visitors.map((v: any) => {
          const dur = v.checkedOutAt ? Math.round((new Date(v.checkedOutAt).getTime() - new Date(v.checkedInAt).getTime()) / 60000) : null;
          return `<tr><td>${v.firstName} ${v.lastName}</td><td>${v.company || '-'}</td><td>${v.hostName || '-'}</td><td>${v.purpose || '-'}</td><td>${new Date(v.checkedInAt).toLocaleString('en-GB')}</td><td>${v.checkedOutAt ? new Date(v.checkedOutAt).toLocaleString('en-GB') : '<span class="badge badge-amber">On-site</span>'}</td><td>${dur ? dur + ' min' : '-'}</td></tr>`;
        }).join('')}
        </tbody></table>` : '<p>No visitors recorded during this period.</p>'}`;

    } else if (reportData.type === 'staff_attendance') {
      const staff = reportData.staff || [];
      const checkedIn = reportData.checkedInStaff || [];
      const departments = reportData.departments || [];
      const deptCounts = departments.map((d: string) => ({
        name: d,
        total: staff.filter((s: any) => s.department === d).length,
        onSite: staff.filter((s: any) => s.department === d && s.isCheckedIn).length,
      }));

      bodyContent = `
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-number">${staff.length}</div><div class="stat-label">Total Staff</div></div>
          <div class="stat-card green"><div class="stat-number">${checkedIn.length}</div><div class="stat-label">Currently On-Site</div></div>
          <div class="stat-card amber"><div class="stat-number">${staff.length - checkedIn.length}</div><div class="stat-label">Off-Site</div></div>
          <div class="stat-card"><div class="stat-number">${departments.length}</div><div class="stat-label">Departments</div></div>
        </div>
        ${deptCounts.length > 0 ? `<h3>Attendance by Department</h3><table><thead><tr><th>Department</th><th>Total Staff</th><th>On-Site</th><th>Off-Site</th><th>Attendance %</th></tr></thead><tbody>
        ${deptCounts.map((d: any) => `<tr><td>${d.name}</td><td>${d.total}</td><td>${d.onSite}</td><td>${d.total - d.onSite}</td><td>${d.total > 0 ? Math.round((d.onSite / d.total) * 100) : 0}%</td></tr>`).join('')}
        </tbody></table>` : ''}
        <h3>Staff Details</h3><table><thead><tr><th>Name</th><th>Employee ID</th><th>Department</th><th>Status</th><th>Last Check-in</th><th>Fire Marshal</th></tr></thead><tbody>
        ${staff.map((s: any) => `<tr><td>${s.firstName} ${s.lastName}</td><td>${s.employeeId || '-'}</td><td>${s.department || '-'}</td><td>${s.isCheckedIn ? '<span class="badge badge-green">On-Site</span>' : '<span class="badge badge-gray">Off-Site</span>'}</td><td>${s.checkedInAt ? new Date(s.checkedInAt).toLocaleString('en-GB') : '-'}</td><td>${s.isFireMarshal ? '<span class="badge badge-red">Yes</span>' : '-'}</td></tr>`).join('')}
        </tbody></table>`;

    } else if (reportData.type === 'contractor_activity') {
      const companies = reportData.companies || [];
      const workers = reportData.workers || [];
      const checkedIn = reportData.checkedInWorkers || [];
      const approved = companies.filter((c: any) => c.status === 'approved').length;

      bodyContent = `
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-number">${companies.length}</div><div class="stat-label">Contractor Companies</div></div>
          <div class="stat-card green"><div class="stat-number">${approved}</div><div class="stat-label">Approved</div></div>
          <div class="stat-card"><div class="stat-number">${workers.length}</div><div class="stat-label">Total Workers</div></div>
          <div class="stat-card amber"><div class="stat-number">${checkedIn.length}</div><div class="stat-label">Workers On-Site</div></div>
        </div>
        <h3>Contractor Companies</h3><table><thead><tr><th>Company</th><th>Contact</th><th>Status</th><th>Workers</th><th>On-Site</th></tr></thead><tbody>
        ${companies.map((c: any) => {
          const companyWorkers = workers.filter((w: any) => w.companyId === c.id);
          const onSite = companyWorkers.filter((w: any) => w.isCheckedIn).length;
          return `<tr><td>${c.companyName || c.name}</td><td>${c.contactFirstName || ''} ${c.contactLastName || ''}</td><td>${c.status === 'approved' ? '<span class="badge badge-green">Approved</span>' : '<span class="badge badge-amber">' + (c.status || 'Pending') + '</span>'}</td><td>${companyWorkers.length}</td><td>${onSite}</td></tr>`;
        }).join('')}
        </tbody></table>
        <h3>Worker Details</h3><table><thead><tr><th>Name</th><th>Company</th><th>Job Title</th><th>Status</th><th>On-Site</th></tr></thead><tbody>
        ${workers.map((w: any) => {
          const company = companies.find((c: any) => c.id === w.companyId);
          return `<tr><td>${w.firstName} ${w.lastName}</td><td>${company?.companyName || company?.name || '-'}</td><td>${w.jobTitle || '-'}</td><td>${w.workerStatus === 'approved' ? '<span class="badge badge-green">Approved</span>' : '<span class="badge badge-amber">' + (w.workerStatus || 'Pending') + '</span>'}</td><td>${w.isCheckedIn ? '<span class="badge badge-green">Yes</span>' : '-'}</td></tr>`;
        }).join('')}
        </tbody></table>`;

    } else if (reportData.type === 'contractor_compliance') {
      const workers = reportData.workers || [];
      const companies = reportData.companies || [];
      const inducted = workers.filter((w: any) => w.inductionCompleted).length;
      const rtw = workers.filter((w: any) => w.rightToWork === 'valid').length;
      const fullyCompliant = workers.filter((w: any) => w.inductionCompleted && w.rightToWork === 'valid').length;
      const redCards = workers.filter((w: any) => w.hasActiveDisciplinaryCard && w.currentCardStatus === 'red').length;

      bodyContent = `
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-number">${workers.length}</div><div class="stat-label">Total Workers</div></div>
          <div class="stat-card green"><div class="stat-number">${fullyCompliant}</div><div class="stat-label">Fully Compliant</div></div>
          <div class="stat-card amber"><div class="stat-number">${workers.length - fullyCompliant}</div><div class="stat-label">Non-Compliant</div></div>
          <div class="stat-card red"><div class="stat-number">${redCards}</div><div class="stat-label">Red Cards (Banned)</div></div>
        </div>
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-number">${Math.round((inducted / Math.max(workers.length, 1)) * 100)}%</div><div class="stat-label">Induction Complete</div></div>
          <div class="stat-card"><div class="stat-number">${Math.round((rtw / Math.max(workers.length, 1)) * 100)}%</div><div class="stat-label">Right to Work Valid</div></div>
        </div>
        <h3>Compliance Details by Worker</h3><table><thead><tr><th>Name</th><th>Company</th><th>Induction</th><th>Right to Work</th><th>Card Status</th><th>Overall</th></tr></thead><tbody>
        ${workers.map((w: any) => {
          const company = companies.find((c: any) => c.id === w.companyId);
          const compliant = w.inductionCompleted && w.rightToWork === 'valid';
          const cardBadge = w.hasActiveDisciplinaryCard
            ? (w.currentCardStatus === 'red' ? '<span class="badge badge-red">Red</span>' : '<span class="badge badge-amber">Yellow</span>')
            : '<span class="badge badge-green">Clear</span>';
          return `<tr><td>${w.firstName} ${w.lastName}</td><td>${company?.companyName || company?.name || '-'}</td><td>${w.inductionCompleted ? '<span class="badge badge-green">Complete</span>' : '<span class="badge badge-red">Incomplete</span>'}</td><td>${w.rightToWork === 'valid' ? '<span class="badge badge-green">Valid</span>' : '<span class="badge badge-red">' + (w.rightToWork || 'Pending') + '</span>'}</td><td>${cardBadge}</td><td>${compliant ? '<span class="badge badge-green">Compliant</span>' : '<span class="badge badge-red">Non-Compliant</span>'}</td></tr>`;
        }).join('')}
        </tbody></table>`;

    } else if (reportData.type === 'site_headcount') {
      const staff = reportData.staff || [];
      const visitors = reportData.visitors || [];
      const contractors = reportData.contractors || [];
      const total = staff.length + visitors.length + contractors.length;

      bodyContent = `
        <div class="stats-grid">
          <div class="stat-card red"><div class="stat-number">${total}</div><div class="stat-label">Total On-Site</div></div>
          <div class="stat-card"><div class="stat-number">${staff.length}</div><div class="stat-label">Staff</div></div>
          <div class="stat-card"><div class="stat-number">${visitors.length}</div><div class="stat-label">Visitors</div></div>
          <div class="stat-card"><div class="stat-number">${contractors.length}</div><div class="stat-label">Contractors</div></div>
        </div>
        ${staff.length > 0 ? `<h3>Staff On-Site (${staff.length})</h3><table><thead><tr><th>Name</th><th>Department</th><th>Check-in Time</th></tr></thead><tbody>
        ${staff.map((s: any) => `<tr><td>${s.firstName} ${s.lastName}</td><td>${s.department || '-'}</td><td>${s.checkedInAt ? new Date(s.checkedInAt).toLocaleString('en-GB') : '-'}</td></tr>`).join('')}
        </tbody></table>` : '<p>No staff currently on-site.</p>'}
        ${visitors.length > 0 ? `<h3>Visitors On-Site (${visitors.length})</h3><table><thead><tr><th>Name</th><th>Company</th><th>Host</th><th>Check-in Time</th></tr></thead><tbody>
        ${visitors.map((v: any) => `<tr><td>${v.firstName} ${v.lastName}</td><td>${v.company || '-'}</td><td>${v.hostName || '-'}</td><td>${v.checkedInAt ? new Date(v.checkedInAt).toLocaleString('en-GB') : '-'}</td></tr>`).join('')}
        </tbody></table>` : '<p>No visitors currently on-site.</p>'}
        ${contractors.length > 0 ? `<h3>Contractors On-Site (${contractors.length})</h3><table><thead><tr><th>Name</th><th>Company</th><th>Check-in Time</th></tr></thead><tbody>
        ${contractors.map((c: any) => `<tr><td>${c.firstName} ${c.lastName}</td><td>${c.companyName || '-'}</td><td>${c.checkedInAt ? new Date(c.checkedInAt).toLocaleString('en-GB') : '-'}</td></tr>`).join('')}
        </tbody></table>` : '<p>No contractors currently on-site.</p>'}`;

    } else if (reportData.type === 'compliance_gap') {
      const companies: any[] = reportData.companies || [];
      const GAP_DOCS = ['publicLiability', 'employersLiability', 'healthSafety', 'cisRegistration'] as const;

      const withGaps = companies.filter(c => {
        const ds = c.documentsStatus;
        if (!ds) return true;
        return GAP_DOCS.some(k => ds[k] === 'missing' || ds[k] === 'expired');
      });
      const withWarnings = companies.filter(c => {
        const ds = c.documentsStatus;
        if (!ds) return false;
        const hasGap = GAP_DOCS.some(k => ds[k] === 'missing' || ds[k] === 'expired');
        if (hasGap) return false;
        return GAP_DOCS.some(k => ds[k] === 'expiring');
      });
      const fullyCompliant = companies.filter(c => {
        const ds = c.documentsStatus;
        if (!ds) return false;
        return GAP_DOCS.every(k => ds[k] === 'valid');
      });

      const docBadge = (status: string) => {
        if (status === 'missing') return `<span class="badge badge-red">Missing</span>`;
        if (status === 'expired') return `<span class="badge badge-red">Expired</span>`;
        if (status === 'expiring') return `<span class="badge badge-amber">Expiring</span>`;
        if (status === 'valid') return `<span class="badge badge-green">Valid</span>`;
        return `<span class="badge badge-gray">${status || 'Unknown'}</span>`;
      };

      const gapsTable = withGaps.length > 0 ? `
        <h3 style="color:#dc2626;">&#9888; Contractors with Compliance Gaps (${withGaps.length})</h3>
        <table>
          <thead><tr><th>Company</th><th>Status</th><th>Workers</th><th>Public Liability</th><th>Employers Liability</th><th>Health &amp; Safety</th><th>CIS Registration</th></tr></thead>
          <tbody>
          ${withGaps.map(c => {
            const ds = c.documentsStatus || {};
            const statusLabel = c.status === 'approved' ? '<span class="badge badge-green">Approved</span>' : c.status === 'suspended' ? '<span class="badge badge-red">Suspended</span>' : '<span class="badge badge-amber">Pending</span>';
            return `<tr><td><strong>${c.companyName || c.name || '-'}</strong></td><td>${statusLabel}</td><td>${c.workersCount ?? 0}</td><td>${docBadge(ds.publicLiability || 'missing')}</td><td>${docBadge(ds.employersLiability || 'missing')}</td><td>${docBadge(ds.healthSafety || 'missing')}</td><td>${docBadge(ds.cisRegistration || 'missing')}</td></tr>`;
          }).join('')}
          </tbody>
        </table>` : '<p style="color:#16a34a;font-weight:600;">&#10003; No contractors with compliance gaps.</p>';

      const warningsTable = withWarnings.length > 0 ? `
        <h3 style="color:#d97706;">&#9679; Contractors with Expiring Documents (${withWarnings.length})</h3>
        <table>
          <thead><tr><th>Company</th><th>Status</th><th>Workers</th><th>Public Liability</th><th>Employers Liability</th><th>Health &amp; Safety</th><th>CIS Registration</th></tr></thead>
          <tbody>
          ${withWarnings.map(c => {
            const ds = c.documentsStatus || {};
            const statusLabel = c.status === 'approved' ? '<span class="badge badge-green">Approved</span>' : c.status === 'suspended' ? '<span class="badge badge-red">Suspended</span>' : '<span class="badge badge-amber">Pending</span>';
            return `<tr><td><strong>${c.companyName || c.name || '-'}</strong></td><td>${statusLabel}</td><td>${c.workersCount ?? 0}</td><td>${docBadge(ds.publicLiability || 'missing')}</td><td>${docBadge(ds.employersLiability || 'missing')}</td><td>${docBadge(ds.healthSafety || 'missing')}</td><td>${docBadge(ds.cisRegistration || 'missing')}</td></tr>`;
          }).join('')}
          </tbody>
        </table>` : '';

      const compliantList = fullyCompliant.length > 0 ? `
        <h3>&#10003; Fully Compliant Contractors (${fullyCompliant.length})</h3>
        <table>
          <thead><tr><th>Company</th><th>Status</th><th>Workers</th></tr></thead>
          <tbody>
          ${fullyCompliant.map(c => {
            const statusLabel = c.status === 'approved' ? '<span class="badge badge-green">Approved</span>' : c.status === 'suspended' ? '<span class="badge badge-red">Suspended</span>' : '<span class="badge badge-amber">Pending</span>';
            return `<tr><td>${c.companyName || c.name || '-'}</td><td>${statusLabel}</td><td>${c.workersCount ?? 0}</td></tr>`;
          }).join('')}
          </tbody>
        </table>` : '';

      bodyContent = `
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-number">${companies.length}</div><div class="stat-label">Total Contractors</div></div>
          <div class="stat-card red"><div class="stat-number">${withGaps.length}</div><div class="stat-label">With Compliance Gaps</div></div>
          <div class="stat-card amber"><div class="stat-number">${withWarnings.length}</div><div class="stat-label">Documents Expiring Soon</div></div>
          <div class="stat-card green"><div class="stat-number">${fullyCompliant.length}</div><div class="stat-label">Fully Compliant</div></div>
        </div>
        <p style="font-size:12px;color:#555;margin-bottom:16px;">Gaps are defined as any mandatory document (Public Liability, Employers Liability, Health &amp; Safety, CIS Registration) with a status of <strong>Missing</strong> or <strong>Expired</strong>.</p>
        ${gapsTable}
        ${warningsTable}
        ${compliantList}`;

    } else if (reportData.type === 'evacuation_readiness') {
      const allStaff = reportData.allStaff || [];
      const fireMarshals = reportData.fireMarshals || [];
      const checkedInStaff = reportData.checkedInStaff || [];
      const visitors = reportData.visitors || [];
      const contractors = reportData.contractors || [];
      const totalOnSite = checkedInStaff.length + visitors.length + contractors.length;
      const fmOnSite = fireMarshals.filter((fm: any) => fm.isCheckedIn).length;

      bodyContent = `
        <div class="stats-grid">
          <div class="stat-card red"><div class="stat-number">${totalOnSite}</div><div class="stat-label">Total Personnel On-Site</div></div>
          <div class="stat-card"><div class="stat-number">${fireMarshals.length}</div><div class="stat-label">Designated Fire Marshals</div></div>
          <div class="stat-card ${fmOnSite > 0 ? 'green' : 'red'}"><div class="stat-number">${fmOnSite}</div><div class="stat-label">Fire Marshals On-Site</div></div>
          <div class="stat-card ${fmOnSite === 0 ? 'red' : 'green'}"><div class="stat-number">${fmOnSite > 0 ? 'READY' : 'AT RISK'}</div><div class="stat-label">Evacuation Status</div></div>
        </div>
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-number">${checkedInStaff.length}</div><div class="stat-label">Staff On-Site</div></div>
          <div class="stat-card"><div class="stat-number">${visitors.length}</div><div class="stat-label">Visitors On-Site</div></div>
          <div class="stat-card"><div class="stat-number">${contractors.length}</div><div class="stat-label">Contractors On-Site</div></div>
        </div>
        <h3>Fire Marshal Coverage</h3><table><thead><tr><th>Name</th><th>Department</th><th>Currently On-Site</th><th>Contact</th></tr></thead><tbody>
        ${fireMarshals.map((fm: any) => `<tr><td>${fm.firstName} ${fm.lastName}</td><td>${fm.department || '-'}</td><td>${fm.isCheckedIn ? '<span class="badge badge-green">On-Site</span>' : '<span class="badge badge-red">Off-Site</span>'}</td><td>${fm.email || '-'}</td></tr>`).join('')}
        ${fireMarshals.length === 0 ? '<tr><td colspan="4" style="text-align:center; color: #dc2626; font-weight: bold;">No Fire Marshals designated - URGENT ACTION REQUIRED</td></tr>' : ''}
        </tbody></table>`;

    } else if (reportData.type === 'health_safety') {
      const rows = reportData.rows || [];
      const ser = reportData.incidents > 0
        ? ((reportData.goodSpots + reportData.positives) / reportData.incidents).toFixed(1)
        : '—';
      bodyContent = `
        <div class="stats-grid">
          <div class="stat-card red"><div class="stat-number">${reportData.incidents}</div><div class="stat-label">Incidents</div></div>
          <div class="stat-card amber"><div class="stat-number">${reportData.nearMisses}</div><div class="stat-label">Near Misses</div></div>
          <div class="stat-card green"><div class="stat-number">${reportData.goodSpots + reportData.positives}</div><div class="stat-label">Good Spots &amp; Positive Actions</div></div>
          <div class="stat-card red"><div class="stat-number">${reportData.riddor}</div><div class="stat-label">RIDDOR-Reportable</div></div>
          <div class="stat-card"><div class="stat-number">${ser}</div><div class="stat-label">Safety Engagement Ratio</div></div>
          <div class="stat-card amber"><div class="stat-number">${reportData.open}</div><div class="stat-label">Unresolved</div></div>
        </div>
        ${rows.length ? `<h3>Records</h3><table><thead><tr><th>Date</th><th>Type</th><th>Title</th><th>Location</th><th>Reported By</th><th>RIDDOR</th><th>Status</th></tr></thead><tbody>
        ${rows.map((r: any) => `<tr>
          <td>${r.incidentDate ? new Date(r.incidentDate).toLocaleDateString('en-GB') : '-'}</td>
          <td>${(r.recordType || '').replace('_', ' ')}</td>
          <td>${r.title || '-'}</td>
          <td>${r.location || '-'}</td>
          <td>${r.reportedBy || '-'}</td>
          <td>${r.riddorCategory ? '<span class="badge badge-red">Yes</span>' : '-'}</td>
          <td>${r.resolved ? '<span class="badge badge-green">Resolved</span>' : '<span class="badge badge-amber">Open</span>'}</td>
        </tr>`).join('')}
        </tbody></table>` : '<p>No health &amp; safety records in this period.</p>'}`;

    } else if (reportData.type === 'fire_risk') {
      const rows = reportData.rows || [];
      bodyContent = `
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-number">${rows.length}</div><div class="stat-label">Assessments</div></div>
          <div class="stat-card red"><div class="stat-number">${reportData.overdue}</div><div class="stat-label">Review Overdue</div></div>
        </div>
        ${rows.length ? `<h3>Fire Risk Assessments</h3><table><thead><tr><th>Title</th><th>Assessor</th><th>Assessed</th><th>Next Review</th><th>Status</th></tr></thead><tbody>
        ${rows.map((r: any) => {
          const overdue = r.nextReviewDate && new Date(r.nextReviewDate) < new Date();
          return `<tr>
            <td>${r.title || '-'}</td>
            <td>${r.assessorName || '-'}${r.assessorCompany ? ' (' + r.assessorCompany + ')' : ''}</td>
            <td>${r.assessmentDate ? new Date(r.assessmentDate).toLocaleDateString('en-GB') : '-'}</td>
            <td>${r.nextReviewDate ? new Date(r.nextReviewDate).toLocaleDateString('en-GB') : '-'} ${overdue ? '<span class="badge badge-red">Overdue</span>' : ''}</td>
            <td>${r.status || '-'}</td>
          </tr>`;
        }).join('')}
        </tbody></table>` : '<p>No fire risk assessments in this period.</p>'}`;

    } else if (reportData.type === 'permit_to_work') {
      const rows = reportData.rows || [];
      bodyContent = `
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-number">${rows.length}</div><div class="stat-label">Permits</div></div>
          <div class="stat-card green"><div class="stat-number">${reportData.active}</div><div class="stat-label">Active / Authorised</div></div>
          <div class="stat-card"><div class="stat-number">${reportData.closed}</div><div class="stat-label">Closed</div></div>
        </div>
        ${rows.length ? `<h3>Permits</h3><table><thead><tr><th>Permit #</th><th>Type</th><th>Work</th><th>Location</th><th>Contractor</th><th>Valid Until</th><th>Status</th></tr></thead><tbody>
        ${rows.map((r: any) => `<tr>
          <td>${r.permitNumber || '-'}</td>
          <td>${r.permitType || '-'}</td>
          <td>${r.workDescription || '-'}</td>
          <td>${r.workLocation || '-'}</td>
          <td>${r.contractorCompanyName || '-'}</td>
          <td>${r.permitValidUntil ? new Date(r.permitValidUntil).toLocaleDateString('en-GB') : '-'}</td>
          <td>${r.status || '-'}</td>
        </tr>`).join('')}
        </tbody></table>` : '<p>No permits raised in this period.</p>'}`;

    } else if (reportData.type === 'risk_assessments') {
      const rows = reportData.rows || [];
      bodyContent = `
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-number">${rows.length}</div><div class="stat-label">Assessments</div></div>
          <div class="stat-card green"><div class="stat-number">${reportData.approved}</div><div class="stat-label">Approved</div></div>
          <div class="stat-card amber"><div class="stat-number">${reportData.dueReview}</div><div class="stat-label">Review Due</div></div>
        </div>
        ${rows.length ? `<h3>Risk Assessments</h3><table><thead><tr><th>Title</th><th>Type</th><th>Location</th><th>Prepared By</th><th>Assessed</th><th>Next Review</th><th>Status</th></tr></thead><tbody>
        ${rows.map((r: any) => {
          const overdue = r.nextReviewDate && new Date(r.nextReviewDate) < new Date();
          return `<tr>
            <td>${r.title || '-'}</td>
            <td>${r.raType || '-'}</td>
            <td>${r.location || '-'}</td>
            <td>${r.preparedBy || '-'}</td>
            <td>${r.assessmentDate ? new Date(r.assessmentDate).toLocaleDateString('en-GB') : '-'}</td>
            <td>${r.nextReviewDate ? new Date(r.nextReviewDate).toLocaleDateString('en-GB') : '-'} ${overdue ? '<span class="badge badge-red">Overdue</span>' : ''}</td>
            <td>${r.status || '-'}</td>
          </tr>`;
        }).join('')}
        </tbody></table>` : '<p>No risk assessments in this period.</p>'}`;

    } else if (reportData.type === 'ppm_compliance') {
      const rows = reportData.rows || [];
      bodyContent = `
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-number">${rows.length}</div><div class="stat-label">Work Orders Due</div></div>
          <div class="stat-card green"><div class="stat-number">${reportData.completed}</div><div class="stat-label">Completed</div></div>
          <div class="stat-card red"><div class="stat-number">${reportData.overdue}</div><div class="stat-label">Overdue</div></div>
          <div class="stat-card ${reportData.pct >= 90 ? 'green' : reportData.pct >= 70 ? 'amber' : 'red'}"><div class="stat-number">${reportData.pct}%</div><div class="stat-label">Completion Rate</div></div>
        </div>
        ${rows.length ? `<h3>Work Orders</h3><table><thead><tr><th>Title</th><th>Assigned To</th><th>Due</th><th>Completed</th><th>Status</th></tr></thead><tbody>
        ${rows.map((r: any) => {
          const overdue = r.status !== 'completed' && !r.completedDate && r.dueDate && new Date(r.dueDate) < new Date();
          return `<tr>
            <td>${r.title || '-'}</td>
            <td>${r.contractorCompanyName || r.assignedEmail || '-'}</td>
            <td>${r.dueDate ? new Date(r.dueDate).toLocaleDateString('en-GB') : '-'} ${overdue ? '<span class="badge badge-red">Overdue</span>' : ''}</td>
            <td>${r.completedDate ? new Date(r.completedDate).toLocaleDateString('en-GB') : '-'}</td>
            <td>${r.completedDate || r.status === 'completed' ? '<span class="badge badge-green">Completed</span>' : '<span class="badge badge-amber">' + (r.status || 'Open') + '</span>'}</td>
          </tr>`;
        }).join('')}
        </tbody></table>` : '<p>No PPM work orders due in this period.</p>'}`;

    } else if (reportData.type === 'audit_inspection') {
      const rows = reportData.rows || [];
      bodyContent = `
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-number">${rows.length}</div><div class="stat-label">Audits</div></div>
          <div class="stat-card green"><div class="stat-number">${reportData.passed}</div><div class="stat-label">Passed</div></div>
          <div class="stat-card"><div class="stat-number">${reportData.completed}</div><div class="stat-label">Completed</div></div>
        </div>
        ${rows.length ? `<h3>Audits &amp; Inspections</h3><table><thead><tr><th>Title</th><th>Template</th><th>Conducted By</th><th>Conducted</th><th>Score</th><th>Result</th></tr></thead><tbody>
        ${rows.map((r: any) => `<tr>
          <td>${r.title || '-'}</td>
          <td>${r.templateName || '-'}</td>
          <td>${r.conductedBy || '-'}</td>
          <td>${r.conductedAt ? new Date(r.conductedAt).toLocaleDateString('en-GB') : '-'}</td>
          <td>${r.overallScore != null ? r.overallScore + '%' : '-'}</td>
          <td>${r.passed === true ? '<span class="badge badge-green">Pass</span>' : r.passed === false ? '<span class="badge badge-red">Fail</span>' : '<span class="badge badge-gray">' + (r.status || '-') + '</span>'}</td>
        </tr>`).join('')}
        </tbody></table>` : '<p>No audits in this period.</p>'}`;
    }

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${reportTitle} - ${companyName}</title><style>${baseStyles}</style></head><body>
      <div class="header">
        <div class="company-name">${companyName}</div>
        <div class="report-title">${reportTitle}</div>
        <div class="report-meta">Period: ${fromDate} to ${toDate} &nbsp;|&nbsp; Generated: ${generatedAt.toLocaleDateString('en-GB')} at ${generatedAt.toLocaleTimeString('en-GB')}</div>
      </div>
      ${bodyContent}
      <div class="footer"><p>Report generated by ${companyName} TPR Max Visitor Management System.</p></div>
    </body></html>`;
  }

  private generateReportText(report: any, reportData: any, companyName: string): string {
    const { visitors, staff, checkedOutVisitors } = reportData;
    const fromDate = new Date(report.dateFrom).toLocaleDateString();
    const toDate = new Date(report.dateTo).toLocaleDateString();

    return `
${companyName}
${report.reportType} Report

Period: ${fromDate} to ${toDate}
Generated on: ${new Date(report.generatedAt).toLocaleDateString()} at ${new Date(report.generatedAt).toLocaleTimeString()}

SUMMARY:
- Total Visitors: ${visitors.length}
- Completed Visits: ${checkedOutVisitors.length}
- Average Duration: ${report.avgDuration}
- Total Staff: ${staff.length}

${visitors.length > 0 ? `
VISITOR DETAILS:
${visitors.map(visitor => {
  const duration = visitor.checkedOutAt 
    ? Math.round((new Date(visitor.checkedOutAt).getTime() - new Date(visitor.checkedInAt).getTime()) / (1000 * 60)) 
    : null;
  return `
- ${(visitor as any).firstName} ${(visitor as any).lastName} (${(visitor as any).company || 'N/A'})
  Host: ${(visitor as any).hostName || 'N/A'}
  Check-in: ${new Date((visitor as any).checkedInAt).toLocaleString()}
  Check-out: ${(visitor as any).checkedOutAt ? new Date((visitor as any).checkedOutAt).toLocaleString() : 'Still on-site'}
  Duration: ${duration ? `${duration} min` : 'N/A'}
  `;
}).join('')}
` : 'No visitors during this period.'}

---
This report was automatically generated by ${companyName} TPR system.
For questions about this report, please contact the administrator.
    `;
  }

  // Generate iCal calendar file for meeting invitations
  private generateICalFile(booking: RoomBooking, room: MeetingRoom, organizer: Staff): string {
    const formatICalDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const bookingStartTime = booking.startTime || booking.startDateTime;
    const bookingEndTime = booking.endTime || booking.endDateTime;
    
    const startDate = new Date(bookingStartTime);
    const endDate = new Date(bookingEndTime);
    const now = new Date();

    // Generate unique UID for the event
    const uid = `${booking.id}@visigate-pro.com`;

    const icalContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TPR//Meeting Room Booking//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${formatICalDate(now)}`,
      `DTSTART:${formatICalDate(startDate)}`,
      `DTEND:${formatICalDate(endDate)}`,
      `SUMMARY:${booking.title}`,
      `DESCRIPTION:${booking.description || 'Meeting room booking'}\\n\\nRoom: ${room.name}\\nLocation: ${room.location}\\nCapacity: ${room.capacity} people\\nExpected Attendees: ${booking.expectedAttendees}`,
      `LOCATION:${room.name}, ${room.location}`,
      `ORGANIZER;CN=${organizer.firstName} ${organizer.lastName}:mailto:${organizer.email}`,
      'STATUS:CONFIRMED',
      'TRANSP:OPAQUE',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    return icalContent;
  }

  // Meeting Room Booking Email Methods
  async sendBookingConfirmation(booking: RoomBooking, room: MeetingRoom, organizer: Staff, staffAttendees: Staff[] = [], externalAttendeeEmails: string[] = [], companySettings?: { companyName?: string; logoUrl?: string | null; address?: string | null; phone?: string | null; website?: string | null; email?: string | null }): Promise<boolean> {
    const formatDateTime = (date: Date) => {
      return new Intl.DateTimeFormat('en-GB', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/London'
      }).format(date);
    };

    const bookingStartTime = booking.startTime || booking.startDateTime;
    const bookingEndTime = booking.endTime || booking.endDateTime;
    
    const startTime = formatDateTime(new Date(bookingStartTime));
    const endTime = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/London'
    }).format(new Date(bookingEndTime));

    const companyName = companySettings?.companyName || 'TPR Max';
    const companyLogo = companySettings?.logoUrl || null;
    const companyAddress = companySettings?.address || null;
    const companyPhone = companySettings?.phone || null;
    const companyWebsite = companySettings?.website || null;
    const companyEmail = companySettings?.email || null;

    const subject = `Meeting Room Confirmed: ${booking.title}`;

    const meetingDate = new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Europe/London'
    }).format(new Date(bookingStartTime));

    const icalContent = this.generateICalFile(booking, room, organizer);
    const calendarAttachment = {
      filename: `meeting-${booking.id}.ics`,
      content: Buffer.from(icalContent, 'utf-8'),
      contentType: 'application/ics',
      contentDisposition: 'attachment' as const,
    };

    const allStaffNames = [
      `${organizer.firstName} ${organizer.lastName} (Organizer)`,
      ...staffAttendees.filter(a => a.id !== organizer.id).map(a => `${a.firstName} ${a.lastName}`)
    ];
    const allExternalNames = externalAttendeeEmails.filter(Boolean);

    const generateQrData = (identifier: string, type: 'staff' | 'external') => {
      const payload = `MTG:${booking.id}:${type}:${identifier}`;
      const secret = process.env.SESSION_SECRET || process.env.QR_SIGNING_SECRET || 'tpr-max-qr-signing-key';
      const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex').substring(0, 12);
      return `${payload}:${hmac}`;
    };

    const facilitiesList: string[] = [];
    if (room.hasProjector) facilitiesList.push('Projector');
    if (room.hasVideoConference) facilitiesList.push('Video Conference');
    if (room.hasWhiteboard) facilitiesList.push('Whiteboard');
    if (room.hasTV) facilitiesList.push('TV/Display');
    if (room.hasAirCon) facilitiesList.push('Air Conditioning');

    const generateBookingHtml = (recipientName: string, qrCodeData: string, isOrganizer: boolean) => {
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCodeData)}&format=png&margin=8`;
      
      const attendeeListHtml = allStaffNames.length > 0 || allExternalNames.length > 0 ? `
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 16px;">
              <tr>
                <td style="background: #f0f4ff; padding: 16px; border-radius: 6px;">
                  <p style="margin: 0 0 8px 0; font-weight: 600; color: #4338ca; font-size: 13px;">ATTENDEES</p>
                  ${allStaffNames.map(n => `<p style="margin: 2px 0; color: #333; font-size: 13px;">${n}</p>`).join('')}
                  ${allExternalNames.map(e => `<p style="margin: 2px 0; color: #555; font-size: 13px;">${e} (External)</p>`).join('')}
                </td>
              </tr>
            </table>` : '';

      const facilitiesHtml = facilitiesList.length > 0 ? `
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 16px;">
              <tr>
                <td style="background: #f0fdf4; padding: 16px; border-radius: 6px;">
                  <p style="margin: 0 0 8px 0; font-weight: 600; color: #166534; font-size: 13px;">ROOM FACILITIES</p>
                  <p style="margin: 0; color: #333; font-size: 13px;">${facilitiesList.join(' &bull; ')} &bull; Capacity: ${room.capacity}</p>
                </td>
              </tr>
            </table>` : '';

      const cateringHtml = booking.requiresCatering ? `
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 16px;">
              <tr>
                <td style="background: #fff7ed; padding: 16px; border-radius: 6px; border-left: 4px solid #f97316;">
                  <p style="margin: 0 0 4px 0; font-weight: 600; color: #c2410c; font-size: 13px;">CATERING REQUESTED</p>
                  <p style="margin: 0; color: #333; font-size: 13px;">${booking.cateringNotes || 'Standard refreshments'}</p>
                </td>
              </tr>
            </table>` : '';

      const specialReqHtml = booking.specialRequirements ? `
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 16px;">
              <tr>
                <td style="background: #fdf4ff; padding: 16px; border-radius: 6px; border-left: 4px solid #a855f7;">
                  <p style="margin: 0 0 4px 0; font-weight: 600; color: #7e22ce; font-size: 13px;">SPECIAL REQUIREMENTS</p>
                  <p style="margin: 0; color: #333; font-size: 13px;">${booking.specialRequirements}</p>
                </td>
              </tr>
            </table>` : '';

      const logoHtml = '';

      const footerContactParts: string[] = [];
      if (companyAddress) footerContactParts.push(companyAddress);
      if (companyPhone) footerContactParts.push(`Tel: ${companyPhone}`);
      if (companyEmail) footerContactParts.push(companyEmail);
      if (companyWebsite) footerContactParts.push(companyWebsite);
      const footerContactHtml = footerContactParts.length > 0 
        ? `<p style="margin: 6px 0 0 0; font-size: 11px; color: #9ca3af;">${footerContactParts.join(' | ')}</p>` 
        : '';

      return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          
          <!-- Company Header -->
          <tr>
            <td style="padding: 28px 30px; text-align: center; border-bottom: 3px solid #1a1a2e;">
              <p style="margin: 0; font-size: 18px; color: #1a1a2e; font-weight: 700; letter-spacing: 0.5px;">${companyName}</p>
              <p style="margin: 6px 0 0 0; font-size: 11px; color: #6b7280; letter-spacing: 1.5px; text-transform: uppercase;">Meeting Room Confirmation</p>
            </td>
          </tr>

          <!-- Meeting Title Bar -->
          <tr>
            <td style="background: #1a1a2e; padding: 14px 30px; text-align: center;">
              <h1 style="margin: 0; font-size: 20px; color: #ffffff; font-weight: 700;">${booking.title}</h1>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding: 28px 30px 0 30px;">
              <p style="margin: 0; font-size: 15px; color: #333;">Dear <strong>${recipientName}</strong>,</p>
              <p style="margin: 8px 0 0 0; font-size: 14px; color: #555; line-height: 1.5;">
                ${isOrganizer 
                  ? 'Your meeting room booking has been confirmed. Below are the full details for your reference.'
                  : 'You have been invited to the following meeting. Below are the full details for your reference.'}
              </p>
            </td>
          </tr>

          <!-- Meeting Details Card -->
          <tr>
            <td style="padding: 20px 30px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                <tr>
                  <td style="background: #1a1a2e; padding: 12px 20px;">
                    <p style="margin: 0; color: #ffffff; font-size: 13px; font-weight: 600; letter-spacing: 0.5px;">MEETING DETAILS</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="120" style="padding: 6px 0; font-size: 13px; color: #6b7280; font-weight: 600; vertical-align: top;">Date</td>
                        <td style="padding: 6px 0; font-size: 14px; color: #111827; font-weight: 500;">${meetingDate}</td>
                      </tr>
                      <tr>
                        <td width="120" style="padding: 6px 0; font-size: 13px; color: #6b7280; font-weight: 600; vertical-align: top;">Time</td>
                        <td style="padding: 6px 0; font-size: 14px; color: #111827; font-weight: 500;">${startTime.split(', ').pop() || startTime} &ndash; ${endTime}</td>
                      </tr>
                      <tr>
                        <td width="120" style="padding: 6px 0; font-size: 13px; color: #6b7280; font-weight: 600; vertical-align: top;">Room</td>
                        <td style="padding: 6px 0; font-size: 14px; color: #111827; font-weight: 500;">${room.name}</td>
                      </tr>
                      <tr>
                        <td width="120" style="padding: 6px 0; font-size: 13px; color: #6b7280; font-weight: 600; vertical-align: top;">Location</td>
                        <td style="padding: 6px 0; font-size: 14px; color: #111827;">${room.location}</td>
                      </tr>
                      <tr>
                        <td width="120" style="padding: 6px 0; font-size: 13px; color: #6b7280; font-weight: 600; vertical-align: top;">Organizer</td>
                        <td style="padding: 6px 0; font-size: 14px; color: #111827;">${organizer.firstName} ${organizer.lastName}</td>
                      </tr>
                      <tr>
                        <td width="120" style="padding: 6px 0; font-size: 13px; color: #6b7280; font-weight: 600; vertical-align: top;">Attendees</td>
                        <td style="padding: 6px 0; font-size: 14px; color: #111827;">${booking.expectedAttendees} people</td>
                      </tr>
                      ${booking.description ? `
                      <tr>
                        <td width="120" style="padding: 6px 0; font-size: 13px; color: #6b7280; font-weight: 600; vertical-align: top;">Description</td>
                        <td style="padding: 6px 0; font-size: 14px; color: #111827; line-height: 1.4;">${booking.description}</td>
                      </tr>` : ''}
                    </table>

                    ${attendeeListHtml}
                    ${facilitiesHtml}
                    ${cateringHtml}
                    ${specialReqHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- QR Code Section -->
          <tr>
            <td style="padding: 0 30px 20px 30px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 2px solid #1a1a2e; border-radius: 8px; overflow: hidden;">
                <tr>
                  <td style="background: #1a1a2e; padding: 12px 20px;">
                    <p style="margin: 0; color: #ffffff; font-size: 13px; font-weight: 600; letter-spacing: 0.5px;">YOUR ACCESS QR CODE</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 24px; text-align: center; background: #fafbff;">
                    <p style="margin: 0 0 16px 0; font-size: 13px; color: #555; line-height: 1.4;">
                      Present this QR code at the Suprema X-Station 2 reader<br>to gain building access for your meeting.
                    </p>
                    <table cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                      <tr>
                        <td style="padding: 12px; background: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px;">
                          <img src="${qrCodeUrl}" alt="Meeting Access QR Code" width="200" height="200" style="display: block;" />
                        </td>
                      </tr>
                    </table>
                    <p style="margin: 14px 0 0 0; font-size: 12px; color: #888;">
                      <strong>${recipientName}</strong><br>
                      Valid: ${meetingDate}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Calendar Note -->
          <tr>
            <td style="padding: 0 30px 20px 30px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background: #eff6ff; padding: 14px 16px; border-radius: 6px; border-left: 4px solid #3b82f6;">
                    <p style="margin: 0; font-size: 13px; color: #1e40af; line-height: 1.4;">
                      A calendar invitation (.ics) is attached to this email. Open it to add this meeting to your Outlook, Apple Calendar, or Google Calendar.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 30px; background: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0 0 4px 0; font-size: 12px; color: #6b7280;">
                Sent by ${companyName} via TPR Max Visitor Management
              </p>
              <p style="margin: 4px 0 0 0; font-size: 12px; color: #9ca3af;">
                Need to make changes? Contact your building administrator or meeting organizer.
              </p>
              ${footerContactHtml}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
    };

    const generatePlainText = (recipientName: string, qrData: string, isOrganizer: boolean) => {
      return [
        `MEETING ROOM CONFIRMATION`,
        `========================`,
        ``,
        `Dear ${recipientName},`,
        ``,
        isOrganizer 
          ? `Your meeting room booking has been confirmed.`
          : `You have been invited to the following meeting.`,
        ``,
        `MEETING DETAILS`,
        `---------------`,
        `Title: ${booking.title}`,
        `Date: ${meetingDate}`,
        `Time: ${startTime.split(', ').pop() || startTime} - ${endTime}`,
        `Room: ${room.name}`,
        `Location: ${room.location}`,
        `Organizer: ${organizer.firstName} ${organizer.lastName}`,
        `Attendees: ${booking.expectedAttendees} people`,
        booking.description ? `Description: ${booking.description}` : '',
        ``,
        allStaffNames.length > 0 ? `ATTENDEE LIST` : '',
        allStaffNames.length > 0 ? `-------------` : '',
        ...allStaffNames,
        ...allExternalNames.map(e => `${e} (External)`),
        ``,
        facilitiesList.length > 0 ? `ROOM FACILITIES: ${facilitiesList.join(', ')} | Capacity: ${room.capacity}` : '',
        booking.requiresCatering ? `CATERING: ${booking.cateringNotes || 'Standard refreshments'}` : '',
        booking.specialRequirements ? `SPECIAL REQUIREMENTS: ${booking.specialRequirements}` : '',
        ``,
        `ACCESS QR CODE`,
        `--------------`,
        `QR Code Data: ${qrData}`,
        `Present this QR code at the Suprema X-Station 2 reader for building access.`,
        `Valid for: ${meetingDate}`,
        ``,
        `A calendar invitation (.ics) is attached to this email.`,
        ``,
        `---`,
        `Sent by ${companyName} via TPR Max Visitor Management`,
        `Need changes? Contact your building administrator.`,
      ].filter(Boolean).join('\n');
    };

    let success = true;

    const organizerQr = generateQrData(organizer.id, 'staff');
    const organizerHtml = generateBookingHtml(`${organizer.firstName} ${organizer.lastName}`, organizerQr, true);
    const organizerText = generatePlainText(`${organizer.firstName} ${organizer.lastName}`, organizerQr, true);
    
    if (organizer.email) {
      const emailSuccess = await this.sendEmail({ 
        to: organizer.email, subject, html: organizerHtml, text: organizerText, 
        companyName,
        attachments: [calendarAttachment] 
      });
      if (!emailSuccess) success = false;
    }

    for (const attendee of staffAttendees) {
      if (!attendee.email || attendee.id === organizer.id) continue;
      const qrData = generateQrData(attendee.id, 'staff');
      const html = generateBookingHtml(`${attendee.firstName} ${attendee.lastName}`, qrData, false);
      const text = generatePlainText(`${attendee.firstName} ${attendee.lastName}`, qrData, false);
      const emailSuccess = await this.sendEmail({ to: attendee.email, subject, html, text, companyName, attachments: [calendarAttachment] });
      if (!emailSuccess) success = false;
    }

    for (const email of externalAttendeeEmails) {
      if (!email) continue;
      const externalId = email.replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
      const qrData = generateQrData(externalId, 'external');
      const html = generateBookingHtml(email, qrData, false);
      const text = generatePlainText(email, qrData, false);
      const emailSuccess = await this.sendEmail({ to: email, subject, html, text, companyName, attachments: [calendarAttachment] });
      if (!emailSuccess) success = false;
    }

    return success;
  }

  // Generate iCal cancellation file for meeting cancellations
  private generateICalCancellation(booking: RoomBooking, room: MeetingRoom, organizer: Staff): string {
    const formatICalDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const bookingStartTime = booking.startTime || booking.startDateTime;
    const bookingEndTime = booking.endTime || booking.endDateTime;
    
    const startDate = new Date(bookingStartTime);
    const endDate = new Date(bookingEndTime);
    const now = new Date();

    // Use same UID as original event for proper cancellation
    const uid = `${booking.id}@visigate-pro.com`;

    const icalContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TPR//Meeting Room Booking//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:CANCEL',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${formatICalDate(now)}`,
      `DTSTART:${formatICalDate(startDate)}`,
      `DTEND:${formatICalDate(endDate)}`,
      `SUMMARY:${booking.title}`,
      `DESCRIPTION:CANCELLED - ${booking.description || 'Meeting room booking'}`,
      `LOCATION:${room.name}, ${room.location}`,
      `ORGANIZER;CN=${organizer.firstName} ${organizer.lastName}:mailto:${organizer.email}`,
      'STATUS:CANCELLED',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    return icalContent;
  }

  async sendBookingCancellation(booking: RoomBooking, room: MeetingRoom, organizer: Staff, staffAttendees: Staff[] = [], externalAttendeeEmails: string[] = []): Promise<boolean> {
    const formatDateTime = (date: Date) => {
      return new Intl.DateTimeFormat('en-GB', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/London'
      }).format(date);
    };

    const startTime = formatDateTime(new Date(booking.startDateTime));
    const subject = `Meeting Room Cancelled: ${booking.title}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%); color: white; padding: 30px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">❌ Meeting Room Cancelled</h1>
        </div>
        
        <div style="padding: 30px; background: #f8f9fa; border-left: 4px solid #f44336;">
          <h2 style="color: #333; margin-top: 0;">${booking.title}</h2>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #ffebee;">
            <p style="color: #d32f2f; font-weight: bold; margin-top: 0;">This meeting has been cancelled</p>
            <p><strong>Room:</strong> ${room.name} (${room.location})</p>
            <p><strong>Original Time:</strong> ${startTime}</p>
            <p><strong>Cancelled by:</strong> ${organizer.firstName} ${organizer.lastName}</p>
          </div>

          <div style="text-align: center; margin-top: 30px;">
            <p style="color: #666; font-size: 14px;">
              📧 This cancellation notice was sent automatically by TPR
            </p>
          </div>
        </div>
      </div>
    `;

    const text = `Meeting Room Cancelled: ${booking.title}\n\nThis meeting has been cancelled.\nRoom: ${room.name} (${room.location})\nOriginal Time: ${startTime}\nCancelled by: ${organizer.firstName} ${organizer.lastName}\n\n📅 A calendar cancellation is attached to remove this meeting from your calendar.\n\nThis cancellation notice was sent automatically by TPR.`;

    // Generate calendar cancellation file
    const icalContent = this.generateICalCancellation(booking, room, organizer);
    const calendarCancellation = {
      filename: `meeting-cancelled-${booking.id}.ics`,
      content: icalContent,
      contentType: 'text/calendar; charset=utf-8; method=CANCEL'
    };

    // Gather all email addresses
    const allEmails = [
      organizer.email,
      ...staffAttendees.map(staff => staff.email),
      ...externalAttendeeEmails
    ].filter(Boolean);
    
    let success = true;
    for (const email of allEmails) {
      const emailSuccess = await this.sendEmail({ 
        to: email, 
        subject, 
        html, 
        text, 
        attachments: [calendarCancellation] 
      });
      if (!emailSuccess) success = false;
    }

    return success;
  }

  // Send visitor invitation with meeting room details
  async sendVisitorInvitation(preBooking: any, hostStaff: Staff, meetingRoom?: any, companySettings?: CompanySettings): Promise<boolean> {
    const formatDateTime = (date: Date) => {
      return new Intl.DateTimeFormat('en-GB', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/London'
      }).format(date);
    };

    const visitDateTime = formatDateTime(new Date(preBooking.visitDate));
    const subject = `You're Invited to Visit - ${preBooking.purpose || 'Business Meeting'}`;
    
    // Get company logo as base64 if available
    const logoBase64 = companySettings ? await this.getLogoForEmail(companySettings) : null;
    
    // Generate QR code URL - prepend PRE- to the QR code for pre-bookings
    const qrCodeData = `PRE-${preBooking.qrCode}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCodeData)}`;
    
    // Get company branding color or use default
    const primaryColor = companySettings?.accentColor || companySettings?.primaryColor || '#3b82f6';
    
    const companyName = companySettings?.companyName || 'TPR Max';
    const textColor = companySettings?.foregroundColor || '#1e293b';
    const variableTextColor = companySettings?.variableTextColor || '#374151';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
          <title>Visit Invitation - ${companyName}</title>
          <style>
            @media only screen and (max-width: 600px) {
              .mobile-padding { padding: 15px !important; }
              .qr-code { width: 150px !important; height: 150px !important; }
              h1 { font-size: 22px !important; }
              h2 { font-size: 18px !important; }
            }
          </style>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background: #f8fafc; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td align="center" style="padding: 0;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; max-width: 600px; border-collapse: collapse; background: white; margin: 0 auto;">

                  <!-- Header -->
                  <tr>
                    <td style="background: linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}ee 100%); padding: 25px 20px; text-align: center;">
                      ${logoBase64 ? `
                      <img src="${logoBase64}" alt="${companyName}" style="width: 80px; height: 80px; margin: 0 auto 15px; display: block; border-radius: 12px; background: white; padding: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                      ` : `
                      <table role="presentation" cellpadding="0" cellspacing="0" style="width: 80px; height: 80px; background: white; border-radius: 12px; margin: 0 auto 15px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        <tr><td align="center" valign="middle" style="font-size: 22px; font-weight: bold; color: ${primaryColor}; font-family: Arial, sans-serif;">${companyName.substring(0, 3).toUpperCase()}</td></tr>
                      </table>
                      `}
                      <h1 style="margin: 0; color: white; font-size: 26px; font-weight: 600; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">You're Invited to Visit</h1>
                      <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.95); font-size: 15px; font-weight: 500;">${companyName}</p>
                    </td>
                  </tr>

                  <!-- Welcome -->
                  <tr>
                    <td class="mobile-padding" style="padding: 25px 25px 0 25px;">
                      <h2 style="margin: 0 0 8px 0; color: ${textColor}; font-size: 22px; font-weight: 600;">Welcome, ${preBooking.visitorFirstName}!</h2>
                      <p style="margin: 0 0 20px 0; color: ${variableTextColor}; font-size: 15px; line-height: 1.5;">
                        You have been invited for a visit to <strong>${companyName}</strong>. Your host <strong>${hostStaff.firstName} ${hostStaff.lastName}</strong> is expecting you.
                      </p>
                    </td>
                  </tr>

                  <!-- QR Code -->
                  <tr>
                    <td class="mobile-padding" style="padding: 0 25px 20px 25px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                        <tr>
                          <td style="background: linear-gradient(to bottom, #ffffff, #fafafa); border: 2px solid ${primaryColor}20; border-radius: 12px; padding: 25px; text-align: center;">
                            <img src="${qrCodeUrl}" alt="Check-in QR Code" class="qr-code" style="width: 180px; height: 180px; margin: 0 auto 15px; display: block; border: 3px solid white; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border-radius: 8px;">
                            <p style="margin: 0 0 5px 0; color: ${textColor}; font-weight: 700; font-size: 17px;">Pass ID: PRE-${preBooking.qrCode}</p>
                            <p style="margin: 0; color: ${variableTextColor}; font-size: 13px;">Show this QR code at reception for express check-in</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <!-- Visit Details -->
                  <tr>
                    <td class="mobile-padding" style="padding: 0 25px 20px 25px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden;">
                        <tr>
                          <td style="background: ${primaryColor}10; padding: 12px 18px; border-bottom: 1px solid #e5e7eb;">
                            <p style="margin: 0; font-weight: 700; color: ${textColor}; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Visit Details</p>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 18px;">
                            <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                              <tr><td style="padding: 5px 0; color: ${variableTextColor}; font-size: 14px;"><strong style="color: ${textColor};">Date &amp; Time:</strong>&nbsp; ${visitDateTime}</td></tr>
                              <tr><td style="padding: 5px 0; color: ${variableTextColor}; font-size: 14px;"><strong style="color: ${textColor};">Purpose:</strong>&nbsp; ${preBooking.purpose || 'Business meeting'}</td></tr>
                              <tr><td style="padding: 5px 0; color: ${variableTextColor}; font-size: 14px;"><strong style="color: ${textColor};">Your Host:</strong>&nbsp; ${hostStaff.firstName} ${hostStaff.lastName}</td></tr>
                              <tr><td style="padding: 5px 0; color: ${variableTextColor}; font-size: 14px;"><strong style="color: ${textColor};">Host Email:</strong>&nbsp; ${hostStaff.email}</td></tr>
                              ${preBooking.company ? `<tr><td style="padding: 5px 0; color: ${variableTextColor}; font-size: 14px;"><strong style="color: ${textColor};">Your Company:</strong>&nbsp; ${preBooking.company}</td></tr>` : ''}
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  ${meetingRoom ? `
                  <!-- Meeting Room -->
                  <tr>
                    <td class="mobile-padding" style="padding: 0 25px 20px 25px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; border: 1px solid ${primaryColor}30; border-radius: 10px; overflow: hidden;">
                        <tr>
                          <td style="background: ${primaryColor}10; padding: 12px 18px; border-bottom: 1px solid ${primaryColor}20;">
                            <p style="margin: 0; font-weight: 700; color: ${textColor}; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Meeting Room</p>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 18px;">
                            <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                              <tr><td style="padding: 4px 0; color: ${variableTextColor}; font-size: 14px;"><strong style="color: ${textColor};">Room:</strong>&nbsp; ${meetingRoom.name}</td></tr>
                              <tr><td style="padding: 4px 0; color: ${variableTextColor}; font-size: 14px;"><strong style="color: ${textColor};">Location:</strong>&nbsp; ${meetingRoom.location}</td></tr>
                              <tr><td style="padding: 4px 0; color: ${variableTextColor}; font-size: 14px;"><strong style="color: ${textColor};">Capacity:</strong>&nbsp; ${meetingRoom.capacity} people</td></tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  ` : ''}

                  <!-- Arrival Tips -->
                  <tr>
                    <td class="mobile-padding" style="padding: 0 25px 20px 25px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden;">
                        <tr>
                          <td style="background: #f8fafc; padding: 12px 18px; border-bottom: 1px solid #e5e7eb;">
                            <p style="margin: 0; font-weight: 700; color: ${textColor}; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Before You Arrive</p>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 15px 18px;">
                            <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                              <tr><td style="padding: 4px 0; color: ${variableTextColor}; font-size: 14px;">&#x2713;&nbsp; Please bring a valid photo ID for security</td></tr>
                              <tr><td style="padding: 4px 0; color: ${variableTextColor}; font-size: 14px;">&#x2713;&nbsp; Arrive 5–10 minutes early for check-in</td></tr>
                              <tr><td style="padding: 4px 0; color: ${variableTextColor}; font-size: 14px;">&#x2713;&nbsp; Show the QR code above at reception for instant check-in</td></tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="padding: 20px 25px; text-align: center; border-top: 1px solid #e5e7eb; background: #f8fafc;">
                      <p style="margin: 0; color: #9ca3af; font-size: 13px; line-height: 1.5;">
                        This invitation was sent automatically by TPR<br>
                        Questions? Contact your host: <a href="mailto:${hostStaff.email}" style="color: ${primaryColor}; text-decoration: none;">${hostStaff.email}</a>
                      </p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;

    const text = `You're Invited to Visit\n\nHello ${preBooking.visitorFirstName},\n\nYou have been invited for a visit:\n\nDate & Time: ${visitDateTime}\nPurpose: ${preBooking.purpose || 'Business meeting'}\nYour Host: ${hostStaff.firstName} ${hostStaff.lastName}\nHost Email: ${hostStaff.email}\n\n${meetingRoom ? `Meeting Room: ${meetingRoom.name}\nLocation: ${meetingRoom.location}\nCapacity: ${meetingRoom.capacity} people\n\n` : ''}Important Information:\n• Please bring a valid photo ID for security\n• Arrive 5-10 minutes early for check-in\n• Your QR code: ${preBooking.qrCode}\n• Show this email at reception for quick check-in\n\nQuestions? Contact your host: ${hostStaff.email}\n\nThis invitation was sent automatically by TPR.`;

    return await this.sendEmail({
      to: preBooking.visitorEmail,
      subject,
      html,
      text
    });
  }

  // Send evacuation alert email
  async sendEvacuationAlert(
    toEmail: string,
    recipientName: string,
    message: string,
    companySettings: CompanySettings,
    safetyToken?: string, // Optional token for self-service mark-safe
    isDrill?: boolean // If true, send as drill notification
  ): Promise<boolean> {
    const drill = isDrill === true;
    const subject = drill
      ? '🔶 EVACUATION DRILL - Action Required (This is a Drill)'
      : '🚨 EMERGENCY EVACUATION - IMMEDIATE ACTION REQUIRED';
    const primaryColor = drill ? '#d97706' : (companySettings?.accentColor || '#dc2626');
    const bgColor = drill ? '#fef3c7' : '#fee2e2';
    const textColor = drill ? '#92400e' : '#991b1b';
    
    // Generate mark-safe URL if token is provided
    const baseUrl = process.env.REPLIT_DOMAINS 
      ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` 
      : 'http://localhost:5000';
    const markSafeUrl = safetyToken ? `${baseUrl}/mark-safe/${safetyToken}` : null;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 3px solid ${primaryColor};">
        ${drill ? `<div style="background:#92400e; color:white; padding:6px; text-align:center; font-size:12px; font-weight:bold; letter-spacing:1px;">THIS IS A SCHEDULED FIRE DRILL — NOT A REAL EMERGENCY</div>` : ''}
        <div style="background: ${primaryColor}; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 28px;">${drill ? '🔶 EVACUATION DRILL 🔶' : '🚨 EMERGENCY EVACUATION 🚨'}</h1>
        </div>
        
        <div style="padding: 20px; background: ${bgColor};">
          <h2 style="color: ${textColor}; margin-top: 0;">Dear ${recipientName},</h2>
          
          <div style="background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid ${primaryColor};">
            <p style="font-size: 18px; font-weight: bold; color: ${textColor}; margin: 0;">
              ${message}
            </p>
          </div>
          
          <div style="background: ${drill ? '#fef9c3' : '#fef3c7'}; padding: 15px; border-radius: 8px; margin: 15px 0;">
            <h3 style="color: #92400e; margin-top: 0;">⚠️ ${drill ? 'Drill' : 'Important'} Instructions:</h3>
            <ul style="margin: 0;">
              <li>${drill ? 'Participate as you would in a real emergency' : 'Leave the building immediately via the nearest exit'}</li>
              <li>Do NOT use elevators</li>
              <li>${drill ? 'No need to collect personal belongings' : 'Do NOT collect personal belongings'}</li>
              <li>Proceed to your designated muster point</li>
              <li>Remain at the muster point until${drill ? ' the drill is complete' : ' given the all-clear'}</li>
            </ul>
          </div>
          
          ${markSafeUrl ? `
          <div style="background: #dcfce7; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #16a34a;">
            <h3 style="color: #166534; margin-top: 0; text-align: center;">✅ Once You Are Safe</h3>
            <p style="text-align: center; margin: 10px 0; color: #166534;">
              When you have safely evacuated to a safe location, click the button below to mark yourself safe:
            </p>
            <div style="text-align: center; margin: 20px 0;">
              <a href="${markSafeUrl}" style="display: inline-block; background: #16a34a; color: white; text-decoration: none; padding: 15px 40px; font-size: 18px; font-weight: bold; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                ✅ MARK MYSELF SAFE
              </a>
            </div>
            <p style="text-align: center; font-size: 13px; color: #166534; margin: 5px 0;">
              This link is unique to you and valid for 24 hours
            </p>
          </div>
          ` : ''}
          
          <div style="text-align: center; margin-top: 20px;">
            <p style="color: #666; font-size: 14px;">
              ${companySettings?.companyName || 'Emergency Services'}<br>
              Emergency Contact: ${(companySettings as any)?.phoneNumber || companySettings?.phone || '999'}
            </p>
          </div>
        </div>
      </div>
    `;
    
    const text = `${drill ? 'EVACUATION DRILL - Action Required (This is a Drill)' : 'EMERGENCY EVACUATION - IMMEDIATE ACTION REQUIRED'}
${drill ? '\n*** THIS IS A SCHEDULED FIRE DRILL — NOT A REAL EMERGENCY ***\n' : ''}
Dear ${recipientName},

${message}

${drill ? 'Drill' : 'Important'} Instructions:
- ${drill ? 'Participate as you would in a real emergency' : 'Leave the building immediately via the nearest exit'}
- Do NOT use elevators
- ${drill ? 'Proceed to your designated muster point' : 'Do NOT collect personal belongings'}
- Proceed to a safe location away from the building
- Remain at ${drill ? 'the muster point until the drill is complete' : 'a safe distance until given the all-clear'}

${markSafeUrl ? `
ONCE YOU ARE SAFE:
When you have safely evacuated to a safe location, visit this link to mark yourself safe:
${markSafeUrl}

This link is unique to you and valid for 24 hours.
` : ''}
${companySettings?.companyName || 'Emergency Services'}
Emergency Contact: ${(companySettings as any)?.phoneNumber || companySettings?.phone || '999'}`;
    
    return await this.sendEmail({
      to: toEmail,
      subject,
      html,
      text
    });
  }

  // Send Fire Marshal alert with dynamic link to Fire Marshal panel
  async sendFireMarshalAlert(
    toEmail: string,
    marshalName: string,
    evacuationData: any,
    peopleOnSite: any[],
    companySettings: CompanySettings
  ): Promise<boolean> {
    const subject = '🚨 FIRE MARSHAL ALERT - Emergency Evacuation Active';
    const primaryColor = companySettings?.accentColor || '#dc2626';
    
    // Generate the dynamic link to Fire Marshal panel
    const baseUrl = process.env.PUBLIC_URL || 'http://localhost:5000';
    const fireMarshalPanelUrl = `${baseUrl}/fire-marshal-panel`;
    const fireMarshalMobileUrl = `${baseUrl}/fire-marshal-mobile`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 3px solid ${primaryColor};">
        <div style="background: ${primaryColor}; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">🚨 FIRE MARSHAL EVACUATION ALERT</h1>
        </div>
        
        <div style="padding: 20px;">
          <h2 style="color: #991b1b;">Fire Marshal: ${marshalName}</h2>
          
          <div style="background: #fee2e2; padding: 15px; border-radius: 8px; margin: 15px 0;">
            <h3 style="margin-top: 0;">⚡ IMMEDIATE ACTION REQUIRED</h3>
            <p style="font-size: 16px; margin: 10px 0;">
              <strong>An emergency evacuation is in progress!</strong>
            </p>
            <p>Click the button below to access the live Fire Marshal panel and mark people as safe:</p>
          </div>
          
          <div style="text-align: center; margin: 25px 0;">
            <a href="${fireMarshalPanelUrl}" style="display: inline-block; background: ${primaryColor}; color: white; text-decoration: none; padding: 15px 30px; font-size: 18px; font-weight: bold; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              📋 ACCESS FIRE MARSHAL PANEL
            </a>
          </div>
          
          <div style="text-align: center; margin: 20px 0;">
            <p style="color: #666; margin: 5px 0;">For mobile devices:</p>
            <a href="${fireMarshalMobileUrl}" style="display: inline-block; background: #059669; color: white; text-decoration: none; padding: 12px 25px; font-size: 16px; font-weight: bold; border-radius: 8px;">
              📱 MOBILE FIRE MARSHAL PANEL
            </a>
          </div>
          
          <div style="background: white; padding: 15px; border-radius: 8px; border: 1px solid #ddd; margin: 20px 0;">
            <h3 style="margin-top: 0;">📊 Current Evacuation Status:</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Total People on Site:</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; font-size: 18px; font-weight: bold;">${evacuationData.totalPeople}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Staff Members:</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${evacuationData.staff}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Visitors:</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${evacuationData.visitors}</td>
              </tr>
              <tr>
                <td style="padding: 8px;"><strong>Accounted For:</strong></td>
                <td style="padding: 8px; text-align: right; color: green; font-weight: bold;">${peopleOnSite.filter(p => p.isAccountedFor).length}</td>
              </tr>
              <tr>
                <td style="padding: 8px;"><strong>Unaccounted:</strong></td>
                <td style="padding: 8px; text-align: right; color: red; font-weight: bold;">${peopleOnSite.filter(p => !p.isAccountedFor).length}</td>
              </tr>
            </table>
          </div>
          
          <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #0ea5e9;">
            <h4 style="color: #075985; margin-top: 0;">🔄 Live Updates</h4>
            <p style="margin: 5px 0; color: #333;">
              The Fire Marshal panel provides real-time updates and allows multiple Fire Marshals to work simultaneously. 
              All changes are synchronized instantly across all devices.
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 30px;">
            <a href="${fireMarshalPanelUrl}" style="display: inline-block; background: #dc2626; color: white; text-decoration: none; padding: 12px 25px; font-size: 14px; font-weight: bold; border-radius: 6px;">
              OPEN FIRE MARSHAL PANEL NOW →
            </a>
          </div>
          
          <div style="text-align: center; margin-top: 20px; color: #666; font-size: 12px;">
            <p>Time: ${new Date(evacuationData.timestamp).toLocaleString()}</p>
            <p>This is an automated emergency notification from ${companySettings.companyName}</p>
          </div>
        </div>
      </div>
    `;
    
    const text = `FIRE MARSHAL EVACUATION ALERT

Fire Marshal: ${marshalName}

⚡ IMMEDIATE ACTION REQUIRED - An emergency evacuation is in progress!

ACCESS THE LIVE FIRE MARSHAL PANEL:
Desktop: ${fireMarshalPanelUrl}
Mobile: ${fireMarshalMobileUrl}

Current Evacuation Status:
- Total People on Site: ${evacuationData.totalPeople}
- Staff: ${evacuationData.staff}
- Visitors: ${evacuationData.visitors}
- Accounted For: ${peopleOnSite.filter(p => p.isAccountedFor).length}
- Unaccounted: ${peopleOnSite.filter(p => !p.isAccountedFor).length}
- Time: ${new Date(evacuationData.timestamp).toLocaleString()}

The Fire Marshal panel provides real-time updates and allows you to mark people as safe.

OPEN THE PANEL NOW: ${fireMarshalPanelUrl}

This is an automated emergency notification from ${companySettings.companyName}`;
    
    return await this.sendEmail({
      to: toEmail,
      subject,
      html,
      text
    });
  }

  // Helper function to get logo for email as base64 data URL
  async getLogoForEmail(settings: CompanySettings): Promise<string | null> {
    try {
      // If no logo URL is set, return null
      if (!settings?.logoUrl) {
        return null;
      }

      // Read the logo directly from object storage instead of making an HTTP
      // round-trip to the /objects/... route. That route requires an authenticated
      // staff session or bearer token (by design, to protect private uploads), so a
      // server-to-server fetch() with no credentials always failed with 401 and
      // silently fell back to the plain text-initials logo placeholder.
      const logoPath = settings.logoUrl.startsWith('/objects')
        ? settings.logoUrl
        : `/objects${settings.logoUrl}`;

      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(logoPath);
      const [buffer] = await objectFile.download();
      const [metadata] = await objectFile.getMetadata();
      const contentType = metadata.contentType || 'image/png';

      // Return as data URL for embedding in email
      return `data:${contentType};base64,${buffer.toString('base64')}`;
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        logger.info('Logo not found in object storage:', settings.logoUrl);
      } else {
        logger.error('Error converting logo to base64:', error);
      }
      return null;
    }
  }

  // Send Digital E-Pass to visitor
  async sendDigitalEPass(
    visitor: Visitor, 
    host: Staff | null, 
    settings: CompanySettings,
    ePassUrl?: string
  ): Promise<boolean> {
    try {
      if (settings && settings.ePassEnabled === false) {
        logger.info('E-pass send skipped: ePassEnabled is false for this customer');
        return false;
      }
      const companyName = settings?.companyName || 'TPR Max';
      const validUntil = visitor.expectedDepartureTime ? 
        new Date(visitor.expectedDepartureTime).toLocaleString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Europe/London'
        }) : 'End of day';
      
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(visitor.qrCode || visitor.id)}`;
      const baseUrl = ePassUrl ? ePassUrl.replace(/\/epass\/.*$/, '') : (process.env.PUBLIC_URL || 'https://visigate.pro');
      
      // Extract branding colors from settings
      const primaryColor = settings?.accentColor || '#3b82f6';
      const backgroundColor = settings?.backgroundColor || '#f8fafc';
      const textColor = settings?.foregroundColor || '#1e293b';
      const variableTextColor = settings?.variableTextColor || '#374151';
      // Get logo URL for email (will use fallback if not available)
      const logoDataUrl = await this.getLogoForEmail(settings);
      
      // Professional subject line without trigger words (reduces spam score)
      const subject = `Visitor Confirmation - ${visitor.firstName} ${visitor.lastName} at ${companyName}`;
      
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <title>Digital Visitor Pass - ${companyName}</title>
            <!--[if mso]>
            <noscript>
              <xml>
                <o:OfficeDocumentSettings>
                  <o:PixelsPerInch>96</o:PixelsPerInch>
                </o:OfficeDocumentSettings>
              </xml>
            </noscript>
            <![endif]-->
            <style>
              @media only screen and (max-width: 600px) {
                .mobile-padding { padding: 15px !important; }
                .mobile-text-center { text-align: center !important; }
                .mobile-full-width { width: 100% !important; }
                .mobile-button { width: 100% !important; display: block !important; padding: 16px !important; }
                h1 { font-size: 22px !important; }
                h2 { font-size: 18px !important; }
                .qr-container { padding: 20px !important; }
                .qr-code { width: 150px !important; height: 150px !important; }
              }
            </style>
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background: ${backgroundColor}; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
              <tr>
                <td align="center" style="padding: 0;">
                  <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; max-width: 600px; border-collapse: collapse; background: white; margin: 0 auto;">
                    <!-- Header with Company Branding -->
                    <tr>
                      <td style="background: linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}ee 100%); padding: 25px 20px; text-align: center;">
                        <!-- Company Logo -->
                        ${logoDataUrl ? `
                        <img src="${logoDataUrl}" alt="${companyName}" style="width: 80px; height: 80px; margin: 0 auto 15px; display: block; border-radius: 12px; background: white; padding: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        ` : `
                        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 80px; height: 80px; background: white; border-radius: 12px; margin: 0 auto 15px; display: inline-block; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                          <tr>
                            <td align="center" valign="middle" style="width: 80px; height: 80px; font-size: 28px; font-weight: bold; color: ${primaryColor}; letter-spacing: 1px; font-family: Arial, sans-serif;">
                              ${companyName.includes('ACS') || companyName === 'Andy Test Company' ? 'ACS' : companyName.substring(0, 3).toUpperCase()}
                            </td>
                          </tr>
                        </table>
                        `}
                        <h1 style="margin: 0; color: white; font-size: 26px; font-weight: 600; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                          Digital Visitor Pass
                        </h1>
                        ${!logoDataUrl ? `
                        <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.95); font-size: 15px; font-weight: 500;">
                          ${companyName}
                        </p>
                        ` : ''}
                      </td>
                    </tr>
                    
                    <!-- Main Content -->
                    <tr>
                      <td class="mobile-padding" style="padding: 25px;">
                        <!-- Welcome Message -->
                        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                          <tr>
                            <td>
                              <h2 style="margin: 0 0 8px 0; color: ${textColor}; font-size: 22px; font-weight: 600;">
                                Welcome, ${visitor.firstName} ${visitor.lastName}!
                              </h2>
                              <p style="margin: 0 0 20px 0; color: ${variableTextColor}; font-size: 15px; line-height: 1.5;">
                                Your digital pass has been created for your visit${visitor.company ? ` to ${companyName}` : ''}.
                                ${host ? `Your host <strong>${host.firstName} ${host.lastName}</strong> has been notified.` : ''}
                              </p>
                            </td>
                          </tr>
                        </table>
                        
                        <!-- QR Code Section -->
                        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                          <tr>
                            <td class="qr-container" style="background: linear-gradient(to bottom, #ffffff, #fafafa); border: 2px solid ${primaryColor}20; border-radius: 12px; padding: 25px; text-align: center;">
                              <img src="${qrCodeUrl}" alt="Visitor QR Code" class="qr-code" style="width: 180px; height: 180px; margin: 0 auto 15px; display: block; border: 3px solid white; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border-radius: 8px;">
                              <p style="margin: 0 0 5px 0; color: ${textColor}; font-weight: 700; font-size: 17px;">
                                Pass ID: ${visitor.qrCode || visitor.id.slice(0,8).toUpperCase()}
                              </p>
                              <p style="margin: 0; color: ${variableTextColor}; font-size: 13px;">
                                Show this QR code at exit scanners
                              </p>
                            </td>
                          </tr>
                        </table>
                        
                        <!-- Visit Details Card -->
                        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                          <tr>
                            <td style="background: white; border: 1px solid #e5e7eb; border-radius: 10px; padding: 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                              <h3 style="margin: 0 0 12px 0; color: ${textColor}; font-size: 17px; font-weight: 600; border-bottom: 2px solid ${primaryColor}20; padding-bottom: 8px;">
                                📋 Visit Details
                              </h3>
                              <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                                <tr>
                                  <td style="padding: 6px 0; color: ${variableTextColor}; font-size: 14px; width: 40%;">Visitor:</td>
                                  <td style="padding: 6px 0; color: ${textColor}; font-size: 14px; font-weight: 600;">${visitor.firstName} ${visitor.lastName}</td>
                                </tr>
                                ${visitor.company ? `
                                <tr>
                                  <td style="padding: 6px 0; color: ${variableTextColor}; font-size: 14px;">Company:</td>
                                  <td style="padding: 6px 0; color: ${textColor}; font-size: 14px; font-weight: 600;">${visitor.company}</td>
                                </tr>
                                ` : ''}
                                ${host ? `
                                <tr>
                                  <td style="padding: 6px 0; color: ${variableTextColor}; font-size: 14px;">Host:</td>
                                  <td style="padding: 6px 0; color: ${textColor}; font-size: 14px; font-weight: 600;">${host.firstName} ${host.lastName}</td>
                                </tr>
                                ` : ''}
                                <tr>
                                  <td style="padding: 6px 0; color: ${variableTextColor}; font-size: 14px;">Check-in:</td>
                                  <td style="padding: 6px 0; color: ${textColor}; font-size: 14px; font-weight: 600;">
                                    ${new Date(visitor.checkedInAt).toLocaleString('en-GB', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      day: 'numeric',
                                      month: 'short'
                                    })}
                                  </td>
                                </tr>
                                <tr>
                                  <td style="padding: 6px 0; color: ${variableTextColor}; font-size: 14px;">Valid Until:</td>
                                  <td style="padding: 6px 0; color: ${textColor}; font-size: 14px; font-weight: 600;">${validUntil}</td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                        
                        <!-- Health & Safety Rules Section -->
                        ${settings?.hsRulesEnabled && (settings?.hsRulesContent || settings?.hsRulesUrl) && !visitor.hsRulesAccepted ? `
                        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                          <tr>
                            <td style="background: linear-gradient(to right, #fee2e220, #fecaca40); border: 2px solid #ef4444; border-radius: 10px; padding: 20px;">
                              <h3 style="margin: 0 0 15px 0; color: #dc2626; font-size: 18px; font-weight: 700; text-align: center;">
                                🛡️ Health & Safety Rules - Action Required
                              </h3>
                              <div style="background: white; border-radius: 8px; padding: 15px; margin: 0 0 15px 0;">
                                ${settings.hsRulesContent ? `
                                <div style="color: ${textColor}; font-size: 14px; line-height: 1.8; max-height: 300px; overflow-y: auto;">
                                  ${settings.hsRulesContent.split('\n').map(line => `<p style="margin: 8px 0;">${line}</p>`).join('')}
                                </div>
                                ` : `
                                <p style="color: ${textColor}; font-size: 14px; text-align: center; margin: 10px 0;">
                                  Please review our complete Health & Safety Rules before entering the premises.
                                </p>
                                `}
                              </div>
                              <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                                <tr>
                                  <td align="center">
                                    <a href="${baseUrl}/api/visitors/${visitor.id}/accept-hs-rules?token=${visitor.hsRulesAcceptanceToken}&customerId=${encodeURIComponent(this.customerId || '')}" 
                                       class="mobile-button"
                                       style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3); text-align: center;">
                                      ✅ I Accept Health & Safety Rules
                                    </a>
                                    ${settings.hsRulesUrl ? `
                                    <p style="margin: 12px 0 0 0; color: ${variableTextColor}; font-size: 13px;">
                                      <a href="${settings.hsRulesUrl}" style="color: ${primaryColor};">📄 View Full H&S Document</a>
                                    </p>
                                    ` : ''}
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                        ` : ''}
                        
                        <!-- Important Information -->
                        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                          <tr>
                            <td style="background: linear-gradient(to right, #fef3c720, #fef3c740); border-left: 4px solid #f59e0b; border-radius: 6px; padding: 14px;">
                              <h4 style="margin: 0 0 8px 0; color: #92400e; font-size: 14px; font-weight: 600;">
                                ⚠️ Important Reminders
                              </h4>
                              <ul style="margin: 0; padding: 0 0 0 18px; color: #92400e; font-size: 13px; line-height: 1.7;">
                                <li>Check out when leaving the building</li>
                                <li>Keep this pass accessible on your phone</li>
                                <li>Contact reception for assistance</li>
                                ${settings?.geofencingEnabled ? '<li>✅ Auto check-out enabled via geofencing</li>' : ''}
                                ${visitor.hsRulesAccepted ? '<li>✅ Health & Safety Rules accepted</li>' : ''}
                              </ul>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                      <td style="background: ${backgroundColor}; padding: 18px; text-align: center; border-top: 1px solid #e5e7eb;">
                        <p style="margin: 0 0 4px 0; color: ${variableTextColor}; font-size: 11px;">
                          ${companyName} • ${settings?.address || ''} ${settings?.phone ? `• ${settings.phone}` : ''}
                        </p>
                        <p style="margin: 0; color: #9ca3af; font-size: 10px;">
                          Powered by TPR Visitor Management System
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `;
      
      const text = `Digital Visitor Pass - ${companyName}

Welcome ${visitor.firstName} ${visitor.lastName}!

Your digital pass has been created for your visit.
${host ? `Your host ${host.firstName} ${host.lastName} has been notified.` : ''}

PASS ID: ${visitor.qrCode || visitor.id.slice(0,8).toUpperCase()}

Visit Details:
- Check-in: ${new Date(visitor.checkedInAt).toLocaleString('en-GB')}
- Valid Until: ${validUntil}
${visitor.company ? `- Company: ${visitor.company}` : ''}
${host ? `- Host: ${host.firstName} ${host.lastName}` : ''}

Important:
- Please check out when leaving the building
- Keep this pass accessible on your phone
${settings?.geofencingEnabled ? '- Auto check-out enabled when you leave the premises' : ''}
${settings?.hsRulesEnabled && (settings?.hsRulesUrl || settings?.hsRulesContent) ? `\n- Health & Safety Rules: ${settings.hsRulesUrl || `${process.env.PUBLIC_URL || 'https://visigate.pro'}/hs-rules`}` : ''}

Powered by TPR`;

      return await this.sendEmail({
        to: visitor.email || '',
        subject,
        html,
        text,
        companyName
      });
    } catch (error) {
      logger.error('Failed to send e-Pass:', error);
      return false;
    }
  }

  // Send check-out reminder to visitor
  async sendCheckoutReminder(visitor: Visitor, settings: CompanySettings): Promise<boolean> {
    const companyName = settings?.companyName || 'TPR';
    const subject = `Reminder: Please check out - ${companyName}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%); color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 20px;">⏰ Check-out Reminder</h1>
        </div>
        
        <div style="padding: 20px; background: #fffbeb; border-left: 4px solid #f59e0b;">
          <h2 style="color: #333; margin-top: 0;">Hello ${visitor.firstName} ${visitor.lastName},</h2>
          <p>Your visit is coming to an end. Please remember to check out before leaving the building.</p>
          
          <div style="text-align: center; margin: 20px 0;">
            <a href="${process.env.PUBLIC_URL || 'https://visigate.pro'}/checkout/${visitor.id}" 
               style="display: inline-block; padding: 12px 24px; background: #f59e0b; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
              Check Out Now
            </a>
          </div>
          
          <p style="color: #666; font-size: 14px; margin-top: 20px;">
            You can also check out using the QR scanners at the exit.
          </p>
        </div>
      </div>
    `;
    
    const text = `Check-out Reminder\n\nHello ${visitor.firstName} ${visitor.lastName},\n\nYour visit is coming to an end. Please remember to check out before leaving the building.\n\nCheck out at: ${process.env.PUBLIC_URL || 'https://visigate.pro'}/checkout/${visitor.id}\n\nYou can also use the QR scanners at the exit.\n\nThank you for visiting ${companyName}.`;
    
    return await this.sendEmail({
      to: visitor.email || '',
      subject,
      html,
      text
    });
  }

  // Send notification to host about unchecked-out visitor
  async sendHostNotification(visitor: Visitor, host: Staff, settings: CompanySettings): Promise<boolean> {
    const companyName = settings?.companyName || 'TPR';
    const overdueMinutes = Math.round((Date.now() - new Date(visitor.expectedDepartureTime || visitor.checkedInAt).getTime()) / 60000);
    
    const subject = `Alert: Your visitor has not checked out - ${visitor.firstName} ${visitor.lastName}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 20px;">⚠️ Visitor Not Checked Out</h1>
        </div>
        
        <div style="padding: 20px; background: #fef2f2; border-left: 4px solid #ef4444;">
          <h2 style="color: #333; margin-top: 0;">Hello ${host.firstName},</h2>
          
          <p>Your visitor has not checked out and their expected departure time has passed.</p>
          
          <div style="background: white; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <h3 style="color: #ef4444; margin-top: 0;">Visitor Details</h3>
            <p><strong>Name:</strong> ${visitor.firstName} ${visitor.lastName}</p>
            <p><strong>Company:</strong> ${visitor.company || 'N/A'}</p>
            <p><strong>Check-in Time:</strong> ${new Date(visitor.checkedInAt).toLocaleString('en-GB')}</p>
            <p><strong>Expected Departure:</strong> ${visitor.expectedDepartureTime ? new Date(visitor.expectedDepartureTime).toLocaleString('en-GB') : 'Not specified'}</p>
            <p><strong>Overdue by:</strong> ${overdueMinutes} minutes</p>
          </div>
          
          <p style="color: #666; font-size: 14px;">
            Please check if your visitor is still on premises or if they forgot to check out.
          </p>
          
          <div style="text-align: center; margin-top: 20px;">
            <a href="${process.env.PUBLIC_URL || 'https://visigate.pro'}/visitors" 
               style="display: inline-block; padding: 10px 20px; background: #3b82f6; color: white; text-decoration: none; border-radius: 6px;">
              View Visitor Management
            </a>
          </div>
        </div>
      </div>
    `;
    
    const text = `Visitor Not Checked Out Alert\n\nHello ${host.firstName},\n\nYour visitor has not checked out:\n\nName: ${visitor.firstName} ${visitor.lastName}\nCompany: ${visitor.company || 'N/A'}\nCheck-in: ${new Date(visitor.checkedInAt).toLocaleString('en-GB')}\nOverdue by: ${overdueMinutes} minutes\n\nPlease check if they are still on premises or forgot to check out.\n\nView details at: ${process.env.PUBLIC_URL || 'https://visigate.pro'}/visitors`;
    
    return await this.sendEmail({
      to: host.email,
      subject,
      html,
      text
    });
  }

  async sendArrivalNotification(params: {
    hostEmail: string;
    hostFirstName: string;
    visitorName: string;
    visitorCompany: string;
    visitorType: 'visitor' | 'contractor';
    purpose?: string;
    checkedInAt: Date;
    companyName?: string;
  }): Promise<boolean> {
    try {
      const {
        hostEmail,
        hostFirstName,
        visitorName,
        visitorCompany,
        visitorType,
        purpose,
        checkedInAt,
        companyName = 'TPR Max'
      } = params;

      const isContractor = visitorType === 'contractor';
      const typeLabel = isContractor ? 'Contractor' : 'Visitor';
      const checkInTime = new Date(checkedInAt).toLocaleString('en-GB');
      const dashboardUrl = process.env.PUBLIC_URL || 'https://visigate.pro';

      const subject = isContractor 
        ? `Contractor arrival - ${visitorName}`
        : `Your visitor has arrived - ${visitorName}`;

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 20px;">✅ ${typeLabel} Arrival Notification</h1>
          </div>
          
          <div style="padding: 20px; background: #ecfdf5; border-left: 4px solid #10b981;">
            <h2 style="color: #333; margin-top: 0;">Hello ${hostFirstName},</h2>
            
            <p>A ${typeLabel.toLowerCase()} has just arrived on site and checked in.</p>
            
            <div style="background: white; padding: 15px; border-radius: 6px; margin: 15px 0;">
              <h3 style="color: #10b981; margin-top: 0;">${typeLabel} Details</h3>
              <p><strong>Name:</strong> ${visitorName}</p>
              <p><strong>Company:</strong> ${visitorCompany || 'N/A'}</p>
              ${purpose ? `<p><strong>Purpose:</strong> ${purpose}</p>` : ''}
              <p><strong>Check-in Time:</strong> ${checkInTime}</p>
              <p><strong>Type:</strong> ${typeLabel}</p>
            </div>
            
            <div style="text-align: center; margin-top: 20px;">
              <a href="${dashboardUrl}/dashboard" 
                 style="display: inline-block; padding: 10px 20px; background: #10b981; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
                View Dashboard
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px; margin-top: 20px;">
              This is an automated notification from ${companyName}.
            </p>
          </div>
        </div>
      `;

      const text = `${typeLabel} Arrival Notification\n\nHello ${hostFirstName},\n\nA ${typeLabel.toLowerCase()} has just arrived on site:\n\n${typeLabel} Details:\nName: ${visitorName}\nCompany: ${visitorCompany || 'N/A'}\n${purpose ? `Purpose: ${purpose}\n` : ''}Check-in Time: ${checkInTime}\nType: ${typeLabel}\n\nView details at: ${dashboardUrl}/dashboard\n\nThis is an automated notification from ${companyName}.`;

      return await this.sendEmail({
        to: hostEmail,
        subject,
        html,
        text,
        companyName
      });

    } catch (error) {
      logger.error('Failed to send arrival notification email:', error);
      return false;
    }
  }

  async sendMeetingReminder(booking: RoomBooking, room: MeetingRoom, organizer: Staff, staffAttendees: Staff[] = [], externalAttendeeEmails: string[] = []): Promise<boolean> {
    const subject = `Reminder: ${booking.title} starts in 15 minutes`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%); color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 20px;">⏰ Meeting Reminder</h1>
        </div>
        
        <div style="padding: 20px; background: #fff8e1; border-left: 4px solid #ff9800;">
          <h2 style="color: #333; margin-top: 0;">${booking.title}</h2>
          <p><strong>Starting in 15 minutes</strong> at ${room.name} (${room.location})</p>
          <p>Expected attendees: ${booking.expectedAttendees} people</p>
          
          ${booking.requiresCatering ? '<p style="color: #f57c00;">🍽️ <strong>Catering arranged</strong></p>' : ''}
          
          <div style="text-align: center; margin-top: 20px;">
            <p style="color: #666; font-size: 14px;">See you there! 👋</p>
          </div>
        </div>
      </div>
    `;

    const text = `Meeting Reminder: ${booking.title}\n\nStarting in 15 minutes at ${room.name} (${room.location})\nExpected attendees: ${booking.expectedAttendees} people\n\n${booking.requiresCatering ? 'Catering arranged\n\n' : ''}See you there!`;

    // Gather all email addresses
    const allEmails = [
      organizer.email,
      ...staffAttendees.map(staff => staff.email),
      ...externalAttendeeEmails
    ].filter(Boolean);
    
    let success = true;
    for (const email of allEmails) {
      const emailSuccess = await this.sendEmail({ to: email, subject, html, text });
      if (!emailSuccess) success = false;
    }

    return success;
  }

  async sendContractorEPass(
    email: string,
    name: string,
    company: string,
    qrCode: string,
    passUrl: string,
    companySettings: CompanySettings,
    workerId?: string,
    hostName?: string,
    customerId?: string,
    workerToken?: string
  ): Promise<boolean> {
    try {
      if (companySettings && companySettings.ePassEnabled === false) {
        logger.info('Contractor e-pass send skipped: ePassEnabled is false for this customer');
        return false;
      }
      const companyName = companySettings?.companyName || 'TPR';
      
      // Generate QR code image URL (same as visitor e-pass)
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrCode)}`;
      
      // Extract branding colors from settings (same as visitor e-pass)
      const primaryColor = companySettings?.accentColor || '#3b82f6';
      const backgroundColor = companySettings?.backgroundColor || '#f8fafc';
      const textColor = companySettings?.foregroundColor || '#1e293b';
      const variableTextColor = companySettings?.variableTextColor || '#374151';
      
      // Get logo URL for email (same as visitor e-pass)
      const logoDataUrl = await this.getLogoForEmail(companySettings);
      
      // Professional subject line
      const subject = `Contractor E-Pass - ${name} at ${companyName}`;
      
      // Generate base URL for H&S acceptance URL (environment variable logging disabled for security)
      const baseUrl = process.env.REPLIT_DOMAINS 
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` 
        : (process.env.PUBLIC_URL || 'http://localhost:5000');
      const hsAcceptanceUrl = workerId
        ? `${baseUrl}/hs-contractor/${workerId}/accept-rules?customerId=${encodeURIComponent(customerId || '')}${workerToken ? `&token=${encodeURIComponent(workerToken)}` : ''}`
        : passUrl;
      logger.info(`🔗 Generated contractor H&S acceptance URL for worker: ${workerId || 'unknown'}`);
      
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <title>Contractor E-Pass - ${companyName}</title>
            <!--[if mso]>
            <noscript>
              <xml>
                <o:OfficeDocumentSettings>
                  <o:PixelsPerInch>96</o:PixelsPerInch>
                </o:OfficeDocumentSettings>
              </xml>
            </noscript>
            <![endif]-->
            <style>
              @media only screen and (max-width: 600px) {
                .mobile-padding { padding: 15px !important; }
                .mobile-text-center { text-align: center !important; }
                .mobile-full-width { width: 100% !important; }
                .mobile-button { width: 100% !important; display: block !important; padding: 16px !important; }
                h1 { font-size: 22px !important; }
                h2 { font-size: 18px !important; }
                .qr-container { padding: 20px !important; }
                .qr-code { width: 150px !important; height: 150px !important; }
              }
            </style>
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background: ${backgroundColor}; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
              <tr>
                <td align="center" style="padding: 0;">
                  <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; max-width: 600px; border-collapse: collapse; background: white; margin: 0 auto;">
                    <!-- Header with Company Branding -->
                    <tr>
                      <td style="background: linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}ee 100%); padding: 25px 20px; text-align: center;">
                        <!-- Company Logo -->
                        ${logoDataUrl ? `
                        <img src="${logoDataUrl}" alt="${companyName}" style="width: 80px; height: 80px; margin: 0 auto 15px; display: block; border-radius: 12px; background: white; padding: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        ` : `
                        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 80px; height: 80px; background: white; border-radius: 12px; margin: 0 auto 15px; display: inline-block; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                          <tr>
                            <td align="center" valign="middle" style="width: 80px; height: 80px; font-size: 28px; font-weight: bold; color: ${primaryColor}; letter-spacing: 1px; font-family: Arial, sans-serif;">
                              ${companyName.includes('ACS') || companyName === 'Andy Test Company' ? 'ACS' : companyName.substring(0, 3).toUpperCase()}
                            </td>
                          </tr>
                        </table>
                        `}
                        <h1 style="margin: 0; color: white; font-size: 26px; font-weight: 600; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                          Contractor E-Pass
                        </h1>
                        ${!logoDataUrl ? `
                        <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.95); font-size: 15px; font-weight: 500;">
                          ${companyName}
                        </p>
                        ` : ''}
                      </td>
                    </tr>
                    
                    <!-- Main Content -->
                    <tr>
                      <td class="mobile-padding" style="padding: 25px;">
                        <!-- Welcome Message -->
                        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                          <tr>
                            <td>
                              <h2 style="margin: 0 0 8px 0; color: ${textColor}; font-size: 22px; font-weight: 600;">
                                Hello ${name},
                              </h2>
                              <p style="margin: 0 0 20px 0; color: ${variableTextColor}; font-size: 15px; line-height: 1.5;">
                                You have been successfully checked in as a contractor for <strong>${company}</strong>.
                              </p>
                            </td>
                          </tr>
                        </table>
                        
                        <!-- QR Code Section -->
                        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                          <tr>
                            <td class="qr-container" style="background: linear-gradient(to bottom, #ffffff, #fafafa); border: 2px solid ${primaryColor}20; border-radius: 12px; padding: 25px; text-align: center;">
                              <img src="${qrCodeUrl}" alt="Contractor QR Code" class="qr-code" style="width: 180px; height: 180px; margin: 0 auto 15px; display: block; border: 3px solid white; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border-radius: 8px;">
                              <p style="margin: 0 0 5px 0; color: ${textColor}; font-weight: 700; font-size: 17px;">
                                Pass ID: ${qrCode}
                              </p>
                              <p style="margin: 0; color: ${variableTextColor}; font-size: 13px;">
                                Show this QR code at exit scanners
                              </p>
                            </td>
                          </tr>
                        </table>
                        
                        <!-- Check-in Details Card -->
                        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                          <tr>
                            <td style="background: white; border: 1px solid #e5e7eb; border-radius: 10px; padding: 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                              <h3 style="margin: 0 0 12px 0; color: ${textColor}; font-size: 17px; font-weight: 600; border-bottom: 2px solid ${primaryColor}20; padding-bottom: 8px;">
                                🏗️ Contractor Details
                              </h3>
                              <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                                <tr>
                                  <td style="padding: 6px 0; color: ${variableTextColor}; font-size: 14px; width: 40%;">Name:</td>
                                  <td style="padding: 6px 0; color: ${textColor}; font-size: 14px; font-weight: 600;">${name}</td>
                                </tr>
                                <tr>
                                  <td style="padding: 6px 0; color: ${variableTextColor}; font-size: 14px;">Company:</td>
                                  <td style="padding: 6px 0; color: ${textColor}; font-size: 14px; font-weight: 600;">${company}</td>
                                </tr>
                                ${hostName ? `
                                <tr>
                                  <td style="padding: 6px 0; color: ${variableTextColor}; font-size: 14px;">Host:</td>
                                  <td style="padding: 6px 0; color: ${textColor}; font-size: 14px; font-weight: 600;">${hostName}</td>
                                </tr>
                                ` : ''}
                                <tr>
                                  <td style="padding: 6px 0; color: ${variableTextColor}; font-size: 14px;">Check-in:</td>
                                  <td style="padding: 6px 0; color: ${textColor}; font-size: 14px; font-weight: 600;">
                                    ${new Date().toLocaleString('en-GB', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      day: 'numeric',
                                      month: 'short'
                                    })}
                                  </td>
                                </tr>
                                <tr>
                                  <td style="padding: 6px 0; color: ${variableTextColor}; font-size: 14px;">Valid Until:</td>
                                  <td style="padding: 6px 0; color: ${textColor}; font-size: 14px; font-weight: 600;">End of day</td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                        
                        <!-- Action Buttons -->
                        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin: 25px 0;">
                          <tr>
                            <td align="center">
                              <a href="${passUrl}" class="mobile-button" 
                                 style="display: inline-block; padding: 14px 35px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25); text-align: center;">
                                📱 View Your Pass
                              </a>
                            </td>
                          </tr>
                        </table>
                        
                        <!-- Health & Safety Rules Section (exactly matching visitor e-pass) -->
                        ${workerId ? `
                        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                          <tr>
                            <td style="background: linear-gradient(to right, #fee2e220, #fecaca40); border: 2px solid #ef4444; border-radius: 10px; padding: 20px;">
                              <h3 style="margin: 0 0 15px 0; color: #dc2626; font-size: 18px; font-weight: 700; text-align: center;">
                                🛡️ Health & Safety Rules - Action Required
                              </h3>
                              <div style="background: white; border-radius: 8px; padding: 15px; margin: 0 0 15px 0;">
                                <div style="color: ${textColor}; font-size: 14px; line-height: 1.8; max-height: 300px; overflow-y: auto;">
                                  <p style="margin: 8px 0; font-weight: 600;"># Health & Safety Rules and Regulations</p>
                                  <p style="margin: 8px 0; font-weight: 600;">## General Safety Rules</p>
                                  <p style="margin: 8px 0;"><strong>1. Personal Safety</strong></p>
                                  <p style="margin: 4px 0 4px 16px;">- Report to reception upon arrival and departure</p>
                                  <p style="margin: 4px 0 4px 16px;">- Wear your visitor/contractor pass at all times</p>
                                  <p style="margin: 4px 0 4px 16px;">- Follow all posted safety signs and instructions</p>
                                  <p style="margin: 4px 0 4px 16px;">- Report any accidents or near misses immediately</p>
                                  <p style="margin: 8px 0;"><strong>2. Emergency Procedures</strong></p>
                                  <p style="margin: 4px 0 4px 16px;">- Familiarize yourself with emergency exits</p>
                                  <p style="margin: 4px 0 4px 16px;">- Only use approved ladders and platforms</p>
                                  <p style="margin: 4px 0 4px 16px;">- Ensure proper edge protection is in place</p>
                                  <p style="margin: 4px 0 4px 16px;">- Wear fall protection equipment when required</p>
                                  <p style="margin: 8px 0; font-weight: 600;">## "Electrical Safety"</p>
                                  <p style="margin: 4px 0 4px 16px;">- Do not use damaged electrical equipment</p>
                                  <p style="margin: 4px 0 4px 16px;">- Report exposed wires or damaged sockets</p>
                                  <p style="margin: 4px 0 4px 16px;">- Ensure trailing cables are secured</p>
                                  <p style="margin: 8px 0; font-weight: 600;">## "Working at Height"</p>
                                  <p style="margin: 4px 0 4px 16px;">- Only use approved ladders and platforms</p>
                                  <p style="margin: 4px 0 4px 16px;">- Ensure proper edge protection is in place</p>
                                  <p style="margin: 4px 0 4px 16px;">- Wear fall protection equipment when required</p>
                                </div>
                              </div>
                              <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                                <tr>
                                  <td align="center">
                                    <a href="${hsAcceptanceUrl}" 
                                       class="mobile-button"
                                       style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3); text-align: center;">
                                      ✅ I Accept Health & Safety Rules
                                    </a>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                        ` : ''}
                        
                        <!-- Important Reminders -->
                        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                          <tr>
                            <td style="background: #fff8e1; border: 1px solid #ffb300; border-radius: 10px; padding: 18px;">
                              <h3 style="margin: 0 0 12px 0; color: #f57c00; font-size: 16px; font-weight: 600;">
                                ⚠️ Important Reminders
                              </h3>
                              <ul style="margin: 0; padding-left: 20px; color: ${variableTextColor}; font-size: 14px; line-height: 1.6;">
                                <li>Check out when leaving the building</li>
                                <li>Keep this pass accessible on your phone</li>
                                <li>Contact reception for assistance</li>
                              </ul>
                            </td>
                          </tr>
                        </table>
                        
                        <!-- Footer -->
                        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin: 30px 0 0 0;">
                          <tr>
                            <td align="center" style="padding: 20px 0; border-top: 1px solid #e5e7eb;">
                              <p style="margin: 0; color: ${variableTextColor}; font-size: 13px; line-height: 1.4;">
                                ${companyName}<br>
                                Please show this e-pass at reception if requested<br>
                                <span style="color: #9ca3af; font-size: 12px;">This email was sent automatically by TPR</span>
                              </p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `;

      const text = `Contractor E-Pass - ${companyName}

Hello ${name},

You have been successfully checked in as a contractor for ${company}.

Your Check-in Details:
Name: ${name}
Company: ${company}
Pass ID: ${qrCode}
Check-in: ${new Date().toLocaleString('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  day: 'numeric',
  month: 'short'
})}

View your digital pass: ${passUrl}

Health & Safety Rules - Action Required:
You must accept our health & safety rules to complete your check-in.

Health & Safety Rules and Regulations:

General Safety Rules:
1. Personal Safety
   - Report to reception upon arrival and departure
   - Wear your visitor/contractor pass at all times
   - Follow all posted safety signs and instructions
   - Report any accidents or near misses immediately

2. Emergency Procedures
   - Familiarize yourself with emergency exits

Accept Health & Safety Rules: ${hsAcceptanceUrl}

Important Reminders:
- Check out when leaving the building
- Keep this pass accessible on your phone
- Contact reception for assistance

${companyName}
Please show this e-pass at reception if requested
This email was sent automatically by TPR`;

      return await this.sendEmail({ 
        to: email, 
        subject, 
        html, 
        text,
        companyName
      });
    } catch (error) {
      logger.error('Failed to send contractor e-pass:', error);
      return false;
    }
  }

  /**
   * Send user invitation email with secure access token
   */
  async sendUserInvitation(
    userEmail: string, 
    role: string, 
    token: string, 
    invitedBy: any, 
    companySettings: any,
    customerId?: string
  ): Promise<boolean> {
    try {
      const companyName = companySettings?.companyName || 'TPR';
      const inviterName = invitedBy?.username || 'Administrator';
      
      // Use company branding settings
      const primaryColor = companySettings?.primaryColor || '#3b82f6';
      const secondaryColor = companySettings?.secondaryColor || '#64748b';
      // Only use logo if it's a valid http/https URL (not local file path)
      const logoUrl = companySettings?.logoUrl && 
                      (companySettings.logoUrl.startsWith('http://') || companySettings.logoUrl.startsWith('https://')) 
                      ? companySettings.logoUrl 
                      : '';
      
      // Create secure invitation URL - use proper domain based on environment
      let baseUrl: string;
      if (process.env.NODE_ENV === 'production') {
        baseUrl = process.env.BASE_URL || 'https://www.tpr-max.com';
      } else {
        // In development, prefer an explicit BASE_URL override, then the Replit preview domain
        const devDomain = process.env.BASE_URL || process.env.REPLIT_DOMAINS || process.env.REPLIT_DEV_DOMAIN;
        baseUrl = devDomain ? (devDomain.startsWith('http') ? devDomain : `https://${devDomain}`) : 'http://localhost:5000';
      }
      
      const invitationUrl = customerId
        ? `${baseUrl}/invite/accept?token=${token}&customer=${customerId}`
        : `${baseUrl}/invite/accept?token=${token}`;
      
      // Log the invitation URL for verification
      logger.info(`📧 Invitation URL generated: ${invitationUrl}`);
      
      const subject = `You're invited to join ${companyName} on TPR`;
      
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%); padding: 0; border-radius: 12px; overflow: hidden;">
          <!-- Header -->
          <div style="background: white; padding: 32px; text-align: center;">
            ${logoUrl ? `
              <div style="margin: 0 auto 24px;">
                <img src="${logoUrl}" alt="${companyName} Logo" style="max-height: 80px; max-width: 200px; height: auto; width: auto;" />
              </div>
            ` : `
              <div style="background: linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%); color: white; width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 24px; display: flex; align-items: center; justify-content: center; font-size: 36px; font-weight: bold;">
                🚪
              </div>
            `}
            <h1 style="color: #1e293b; margin: 0 0 8px; font-size: 28px; font-weight: 700;">
              Welcome to ${companyName}
            </h1>
            <p style="color: #64748b; margin: 0; font-size: 16px;">
              You've been invited to join our visitor management system
            </p>
          </div>
          
          <!-- Content -->
          <div style="padding: 32px; color: white;">
            <div style="background: rgba(255, 255, 255, 0.1); padding: 24px; border-radius: 8px; margin-bottom: 24px;">
              <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600;">Invitation Details</h2>
              <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                <span style="font-weight: 500;">Role:</span>
                <span style="background: rgba(255, 255, 255, 0.2); padding: 4px 12px; border-radius: 16px; font-size: 14px; font-weight: 500;">
                  ${role === 'admin' ? 'Administrator' : 'Standard User'}
                </span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                <span style="font-weight: 500;">Invited by:</span>
                <span>${inviterName}</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="font-weight: 500;">Company:</span>
                <span>${companyName}</span>
              </div>
            </div>
            
            <div style="text-align: center; margin: 32px 0;">
              <a href="${invitationUrl}" 
                 style="display: inline-block; background: white; color: ${primaryColor}; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);">
                Accept Invitation
              </a>
            </div>
            
            <div style="background: rgba(255, 255, 255, 0.1); padding: 20px; border-radius: 8px; font-size: 14px;">
              <h3 style="margin: 0 0 12px; font-size: 16px; font-weight: 600;">What's next?</h3>
              <ul style="margin: 0; padding-left: 20px; line-height: 1.6;">
                <li>Click the invitation link above</li>
                <li>Create your secure password</li>
                <li>Access your dashboard based on your role</li>
                <li>Start managing visitors and staff</li>
              </ul>
            </div>
            
            <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid rgba(255, 255, 255, 0.2); font-size: 12px; color: rgba(255, 255, 255, 0.8); text-align: center;">
              <p style="margin: 0 0 8px;">This invitation expires in 7 days for security.</p>
              <p style="margin: 0;">If you didn't expect this invitation, please ignore this email.</p>
            </div>
          </div>
        </div>
      `;

      const text = `
You're invited to join ${companyName} on TPR

Invitation Details:
- Role: ${role === 'admin' ? 'Administrator' : 'Standard User'}
- Invited by: ${inviterName}
- Company: ${companyName}

To accept this invitation, visit: ${invitationUrl}

What's next?
1. Click the invitation link
2. Create your secure password  
3. Access your dashboard based on your role
4. Start managing visitors and staff

This invitation expires in 7 days for security.
If you didn't expect this invitation, please ignore this email.
      `;

      return await this.sendEmail({
        to: userEmail,
        subject,
        html,
        text,
        companyName
      });
    } catch (error) {
      logger.error('Failed to send user invitation email:', error);
      return false;
    }
  }

  /**
   * Send Yellow/Red Card Notification Email
   * Features football-style card visual with company branding
   */
  async sendCardIssueNotification(options: {
    workerEmail: string;
    workerName: string;
    cardType: 'yellow' | 'red';
    offenceName: string;
    offenceDescription: string;
    location?: string;
    witness?: string;
    issuedByName: string;
    issuedAt: Date;
    previousYellowCards: number;
    companyName: string;
    contractorCompanyName: string;
    contractorCompanyEmail?: string;
    companySettings?: any;
  }): Promise<{ workerEmailSent: boolean; contractorEmailSent: boolean }> {
    try {
      const {
        workerEmail,
        workerName,
        cardType,
        offenceName,
        offenceDescription,
        location,
        witness,
        issuedByName,
        issuedAt,
        previousYellowCards,
        companyName,
        contractorCompanyName,
        contractorCompanyEmail,
        companySettings
      } = options;

      // Get company branding
      const primaryColor = companySettings?.accentColor || '#3b82f6';
      const logoUrl = companySettings?.logoUrl || null;
      
      // Card colors
      const cardColor = cardType === 'red' ? '#dc2626' : '#eab308';
      const cardColorLight = cardType === 'red' ? '#fef2f2' : '#fefce8';
      const cardColorDark = cardType === 'red' ? '#991b1b' : '#a16207';
      const cardTitle = cardType === 'red' ? 'RED CARD' : 'YELLOW CARD';
      const cardIcon = cardType === 'red' ? '🔴' : '🟡';

      // Format date
      const formattedDate = issuedAt.toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
      const formattedTime = issuedAt.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit'
      });

      // Escalation warning
      const totalYellowCards = cardType === 'yellow' ? previousYellowCards + 1 : previousYellowCards;
      const escalationWarning = cardType === 'yellow' && totalYellowCards >= 1 
        ? `<div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 12px; margin-top: 16px;">
            <strong style="color: #92400e;">⚠️ Escalation Warning:</strong>
            <p style="margin: 8px 0 0 0; color: #78350f;">
              You now have ${totalYellowCards} yellow card${totalYellowCards > 1 ? 's' : ''} on record. 
              ${totalYellowCards >= 2 ? '<strong>Two yellow cards result in automatic escalation to a RED CARD, which carries a 3-year site ban.</strong>' : 'A second yellow card will result in automatic escalation to a RED card.'}
            </p>
          </div>` 
        : '';

      // Red card ban notice
      const redCardBan = cardType === 'red' 
        ? `<div style="background: #fef2f2; border: 2px solid #dc2626; border-radius: 8px; padding: 16px; margin-top: 16px;">
            <strong style="color: #991b1b; font-size: 16px;">🚫 SITE BAN NOTICE</strong>
            <p style="margin: 8px 0 0 0; color: #7f1d1d;">
              This RED CARD carries an automatic <strong>3-year ban</strong> from all sites managed by ${companyName}. 
              You are prohibited from entering any company premises until ${new Date(issuedAt.getTime() + 3 * 365 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.
            </p>
          </div>` 
        : '';

      // Helper function to create absolute URLs for email clients
      // Logo files stored as /uploads/uuid must be served via /objects/uploads/uuid
      const absolutizeUrl = (url: string | undefined | null): string | null => {
        if (!url) return null;
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        const host = (process.env.REPLIT_DOMAINS?.split(',')[0] || process.env.BASE_URL || process.env.PUBLIC_URL || 'localhost:5000').trim();
        const base = host.startsWith('http') ? host : `https://${host}`;
        const cleanBase = base.replace(/\/$/, '');
        // Map /uploads/... paths to /objects/uploads/... for object storage serving
        let normalizedPath = url;
        if (url.startsWith('/uploads/')) {
          normalizedPath = `/objects${url}`;
        } else if (url.startsWith('uploads/')) {
          normalizedPath = `/objects/${url}`;
        }
        const cleanPath = normalizedPath.replace(/^\//, '');
        return `${cleanBase}/${cleanPath}`;
      };

      const absoluteLogoUrl = absolutizeUrl(logoUrl);
      logger.info(`📧 Card issue email - Logo URL: ${logoUrl}, Absolute: ${absoluteLogoUrl}`);
      const logoHtml = absoluteLogoUrl 
        ? `<img src="${absoluteLogoUrl}" alt="${companyName}" style="max-height: 50px; max-width: 200px; object-fit: contain;" />`
        : `<span style="font-size: 24px; font-weight: 700; color: ${primaryColor};">${companyName}</span>`;

      const subject = `${cardIcon} ${cardTitle} Issued - ${offenceName} | ${companyName}`;

      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${cardTitle} Notification</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    
    <!-- Header with Company Logo -->
    <div style="background: white; border-radius: 12px 12px 0 0; padding: 24px; text-align: center; border-bottom: 3px solid ${primaryColor};">
      ${logoHtml}
    </div>

    <!-- Football-Style Card Visual -->
    <div style="background: ${cardColorLight}; padding: 32px; text-align: center;">
      <div style="
        display: inline-block;
        width: 120px;
        height: 160px;
        background: linear-gradient(135deg, ${cardColor} 0%, ${cardColorDark} 100%);
        border-radius: 12px;
        box-shadow: 0 8px 25px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.2);
        position: relative;
        transform: rotate(-5deg);
      ">
        <div style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: white;
          font-size: 14px;
          font-weight: 800;
          text-shadow: 0 2px 4px rgba(0,0,0,0.3);
          text-align: center;
        ">
          ${cardType.toUpperCase()}<br/>CARD
        </div>
      </div>
      <h1 style="color: ${cardColorDark}; margin: 24px 0 8px 0; font-size: 28px; font-weight: 800;">
        ${cardTitle} ISSUED
      </h1>
      <p style="color: ${cardColorDark}; margin: 0; font-size: 16px;">
        Health & Safety Violation Notice
      </p>
    </div>

    <!-- Main Content -->
    <div style="background: white; padding: 32px;">
      <p style="color: #374151; font-size: 16px; margin: 0 0 24px 0;">
        Dear <strong>${workerName}</strong>,
      </p>
      
      <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0;">
        This email confirms that a <strong style="color: ${cardColor};">${cardTitle}</strong> has been issued to you 
        for a health and safety violation at <strong>${companyName}</strong>.
      </p>

      <!-- Offence Details Card -->
      <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <h3 style="color: #111827; margin: 0 0 16px 0; font-size: 16px; border-bottom: 1px solid #e5e7eb; padding-bottom: 12px;">
          📋 Violation Details
        </h3>
        
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; width: 140px; vertical-align: top;">Offence Type:</td>
            <td style="padding: 8px 0; color: #111827; font-weight: 600;">${offenceName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; vertical-align: top;">Description:</td>
            <td style="padding: 8px 0; color: #111827;">${offenceDescription}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; vertical-align: top;">Date & Time:</td>
            <td style="padding: 8px 0; color: #111827;">${formattedDate} at ${formattedTime}</td>
          </tr>
          ${location ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280; vertical-align: top;">Location:</td>
            <td style="padding: 8px 0; color: #111827;">${location}</td>
          </tr>
          ` : ''}
          ${witness ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280; vertical-align: top;">Witness:</td>
            <td style="padding: 8px 0; color: #111827;">${witness}</td>
          </tr>
          ` : ''}
          <tr>
            <td style="padding: 8px 0; color: #6b7280; vertical-align: top;">Issued By:</td>
            <td style="padding: 8px 0; color: #111827;">${issuedByName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; vertical-align: top;">Your Employer:</td>
            <td style="padding: 8px 0; color: #111827;">${contractorCompanyName}</td>
          </tr>
        </table>
      </div>

      ${escalationWarning}
      ${redCardBan}

      <!-- What Happens Next -->
      <div style="background: #f0f9ff; border: 1px solid #0284c7; border-radius: 8px; padding: 16px; margin-top: 24px;">
        <h4 style="color: #0c4a6e; margin: 0 0 8px 0;">ℹ️ What Happens Next?</h4>
        <ul style="color: #075985; margin: 0; padding-left: 20px; line-height: 1.8;">
          <li>This ${cardType} card has been recorded on your worker profile</li>
          <li>Your employer (${contractorCompanyName}) has been notified</li>
          ${cardType === 'yellow' ? '<li>Please take immediate steps to correct this behavior</li>' : ''}
          ${cardType === 'red' ? '<li>Your site access has been revoked effective immediately</li>' : ''}
          <li>You may submit an appeal if you believe this was issued in error</li>
        </ul>
      </div>

      <!-- Appeal Information -->
      <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #e5e7eb;">
        <p style="color: #6b7280; font-size: 14px; margin: 0;">
          <strong>Right to Appeal:</strong> If you believe this card was issued unfairly, you have the right to appeal. 
          Please contact your site supervisor or the issuing authority within 7 days of receiving this notice.
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background: #1f2937; color: #9ca3af; padding: 24px; border-radius: 0 0 12px 12px; text-align: center;">
      <p style="margin: 0 0 8px 0; font-size: 14px;">
        ${companyName} - Health & Safety Management
      </p>
      <p style="margin: 0; font-size: 12px;">
        This is an automated notification from the TPR Max Visitor Management System.
      </p>
    </div>

  </div>
</body>
</html>
      `;

      const text = `
${cardTitle} ISSUED - HEALTH & SAFETY VIOLATION NOTICE

Dear ${workerName},

This email confirms that a ${cardTitle} has been issued to you for a health and safety violation at ${companyName}.

VIOLATION DETAILS
-----------------
Offence Type: ${offenceName}
Description: ${offenceDescription}
Date & Time: ${formattedDate} at ${formattedTime}
${location ? `Location: ${location}` : ''}
${witness ? `Witness: ${witness}` : ''}
Issued By: ${issuedByName}
Your Employer: ${contractorCompanyName}

${cardType === 'yellow' && totalYellowCards >= 1 ? `
ESCALATION WARNING
You now have ${totalYellowCards} yellow card(s) on record. ${totalYellowCards >= 2 ? 'Two yellow cards result in automatic escalation to a RED CARD, which carries a 3-year site ban.' : 'A second yellow card will result in automatic escalation to a RED card.'}
` : ''}

${cardType === 'red' ? `
SITE BAN NOTICE
This RED CARD carries an automatic 3-year ban from all sites managed by ${companyName}.
` : ''}

WHAT HAPPENS NEXT
- This ${cardType} card has been recorded on your worker profile
- Your employer (${contractorCompanyName}) has been notified
${cardType === 'yellow' ? '- Please take immediate steps to correct this behavior' : ''}
${cardType === 'red' ? '- Your site access has been revoked effective immediately' : ''}
- You may submit an appeal if you believe this was issued in error

RIGHT TO APPEAL
If you believe this card was issued unfairly, you have the right to appeal. Please contact your site supervisor or the issuing authority within 7 days.

---
${companyName} - Health & Safety Management
TPR Max Visitor Management System
      `;

      // Send email to worker
      let workerEmailSent = false;
      if (workerEmail) {
        workerEmailSent = await this.sendEmail({
          to: workerEmail,
          subject,
          html,
          text,
          companyName
        });
        logger.info(`📧 Card issue email to worker ${workerName} (${workerEmail}): ${workerEmailSent ? 'SENT' : 'FAILED'}`);
      }

      // Send CC to contractor company
      let contractorEmailSent = false;
      if (contractorCompanyEmail) {
        const contractorSubject = `${cardIcon} ${cardTitle} Issued to ${workerName} - ${offenceName} | ${companyName}`;
        const contractorHtml = html.replace(
          `Dear <strong>${workerName}</strong>,`,
          `Dear <strong>${contractorCompanyName}</strong>,<br/><br/>
          <em style="color: #6b7280;">This is a notification that one of your workers has received a health and safety card:</em>`
        );
        
        contractorEmailSent = await this.sendEmail({
          to: contractorCompanyEmail,
          subject: contractorSubject,
          html: contractorHtml,
          text: `NOTIFICATION: ${cardTitle} issued to ${workerName}\n\n${text}`,
          companyName
        });
        logger.info(`📧 Card issue email to contractor company (${contractorCompanyEmail}): ${contractorEmailSent ? 'SENT' : 'FAILED'}`);
      }

      return { workerEmailSent, contractorEmailSent };
    } catch (error) {
      logger.error('Failed to send card issue notification:', error);
      return { workerEmailSent: false, contractorEmailSent: false };
    }
  }

  async sendContractorPreBookingPass(
    email: string,
    workerName: string,
    companyName: string,
    qrCode: string,
    scheduledDate: Date,
    scheduledTime: string,
    duration: string,
    purpose: string,
    notes: string,
    companySettings: any
  ): Promise<boolean> {
    try {
      const siteName = companySettings?.companyName || 'TPR';
      const primaryColor = companySettings?.accentColor || '#3b82f6';
      const backgroundColor = companySettings?.backgroundColor || '#f8fafc';
      const textColor = companySettings?.foregroundColor || '#1e293b';
      const variableTextColor = companySettings?.variableTextColor || '#374151';
      const logoDataUrl = await this.getLogoForEmail(companySettings);
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrCode)}`;

      const formattedDate = new Date(scheduledDate).toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });

      const durationText = duration === '4' ? 'Half day (4 hours)' :
                           duration === '8' ? 'Full day (8 hours)' :
                           `${duration} hours`;

      const subject = `Contractor Pre-Booking Pass - ${workerName} at ${siteName}`;

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Contractor Pre-Booking Pass - ${siteName}</title>
            <style>
              @media only screen and (max-width: 600px) {
                .mobile-padding { padding: 15px !important; }
                .mobile-full-width { width: 100% !important; }
                h1 { font-size: 22px !important; }
                h2 { font-size: 18px !important; }
                .qr-code { width: 150px !important; height: 150px !important; }
              }
            </style>
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background: ${backgroundColor};">
            <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
              <tr>
                <td align="center" style="padding: 20px 0;">
                  <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; max-width: 600px; border-collapse: collapse; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
                    <!-- Header -->
                    <tr>
                      <td style="background: linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}dd 100%); padding: 30px 20px; text-align: center;">
                        ${logoDataUrl ? `
                        <img src="${logoDataUrl}" alt="${siteName}" style="width: 70px; height: 70px; margin: 0 auto 12px; display: block; border-radius: 12px; background: white; padding: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        ` : `
                        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 70px; height: 70px; background: white; border-radius: 12px; margin: 0 auto 12px; display: inline-block; overflow: hidden;">
                          <tr><td align="center" valign="middle" style="width: 70px; height: 70px; font-size: 24px; font-weight: bold; color: ${primaryColor};">
                            ${siteName.substring(0, 3).toUpperCase()}
                          </td></tr>
                        </table>
                        `}
                        <h1 style="margin: 0; color: white; font-size: 24px; font-weight: 700;">
                          📋 Pre-Booking Pass
                        </h1>
                        <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">
                          Contractor Site Visit Confirmation
                        </p>
                      </td>
                    </tr>

                    <!-- Welcome -->
                    <tr>
                      <td class="mobile-padding" style="padding: 25px 25px 15px;">
                        <h2 style="margin: 0 0 8px 0; color: ${textColor}; font-size: 20px;">
                          Hello ${workerName},
                        </h2>
                        <p style="margin: 0; color: ${variableTextColor}; font-size: 15px; line-height: 1.5;">
                          Your visit to <strong>${siteName}</strong> has been pre-booked. Please present this QR code upon arrival for fast check-in.
                        </p>
                      </td>
                    </tr>

                    <!-- QR Code -->
                    <tr>
                      <td class="mobile-padding" style="padding: 10px 25px;">
                        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                          <tr>
                            <td style="background: linear-gradient(to bottom, #ffffff, #f8fafc); border: 2px solid ${primaryColor}30; border-radius: 12px; padding: 25px; text-align: center;">
                              <img src="${qrCodeUrl}" alt="Pre-Booking QR Code" class="qr-code" style="width: 200px; height: 200px; margin: 0 auto 15px; display: block; border: 3px solid white; box-shadow: 0 4px 16px rgba(0,0,0,0.12); border-radius: 10px;">
                              <p style="margin: 0 0 4px 0; color: ${textColor}; font-weight: 700; font-size: 16px;">
                                Pass ID: ${qrCode}
                              </p>
                              <p style="margin: 0; color: ${variableTextColor}; font-size: 13px;">
                                Scan this QR code at the reception kiosk for instant check-in
                              </p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                    <!-- Visit Details -->
                    <tr>
                      <td class="mobile-padding" style="padding: 15px 25px;">
                        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden;">
                          <tr>
                            <td style="background: ${primaryColor}10; padding: 12px 18px; border-bottom: 1px solid #e5e7eb;">
                              <h3 style="margin: 0; color: ${textColor}; font-size: 16px; font-weight: 700;">
                                🏗️ Visit Details
                              </h3>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding: 15px 18px;">
                              <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                                <tr>
                                  <td style="padding: 8px 0; color: ${variableTextColor}; font-size: 14px; width: 35%;">👷 Name:</td>
                                  <td style="padding: 8px 0; color: ${textColor}; font-size: 14px; font-weight: 600;">${workerName}</td>
                                </tr>
                                <tr>
                                  <td style="padding: 8px 0; color: ${variableTextColor}; font-size: 14px;">🏢 Company:</td>
                                  <td style="padding: 8px 0; color: ${textColor}; font-size: 14px; font-weight: 600;">${companyName}</td>
                                </tr>
                                <tr>
                                  <td style="padding: 8px 0; color: ${variableTextColor}; font-size: 14px;">📅 Date:</td>
                                  <td style="padding: 8px 0; color: ${textColor}; font-size: 14px; font-weight: 600;">${formattedDate}</td>
                                </tr>
                                <tr>
                                  <td style="padding: 8px 0; color: ${variableTextColor}; font-size: 14px;">🕐 Time:</td>
                                  <td style="padding: 8px 0; color: ${textColor}; font-size: 14px; font-weight: 600;">${scheduledTime}</td>
                                </tr>
                                <tr>
                                  <td style="padding: 8px 0; color: ${variableTextColor}; font-size: 14px;">⏱️ Duration:</td>
                                  <td style="padding: 8px 0; color: ${textColor}; font-size: 14px; font-weight: 600;">${durationText}</td>
                                </tr>
                                <tr>
                                  <td style="padding: 8px 0; color: ${variableTextColor}; font-size: 14px;">📋 Purpose:</td>
                                  <td style="padding: 8px 0; color: ${textColor}; font-size: 14px; font-weight: 600;">${purpose}</td>
                                </tr>
                                ${notes ? `
                                <tr>
                                  <td style="padding: 8px 0; color: ${variableTextColor}; font-size: 14px;">📝 Notes:</td>
                                  <td style="padding: 8px 0; color: ${textColor}; font-size: 14px;">${notes}</td>
                                </tr>
                                ` : ''}
                              </table>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                    <!-- Important Notice -->
                    <tr>
                      <td class="mobile-padding" style="padding: 15px 25px;">
                        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                          <tr>
                            <td style="background: #fef3c7; border: 1px solid #f59e0b40; border-radius: 10px; padding: 15px;">
                              <p style="margin: 0 0 5px 0; font-weight: 700; color: #92400e; font-size: 14px;">⚠️ Important</p>
                              <ul style="margin: 0; padding-left: 20px; color: #92400e; font-size: 13px; line-height: 1.8;">
                                <li>Bring valid photo ID and any required PPE</li>
                                <li>Report to reception and scan your QR code</li>
                                <li>All visitors must sign out before leaving site</li>
                                <li>Follow all site Health & Safety regulations</li>
                              </ul>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                      <td style="background: #f1f5f9; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                        <p style="margin: 0 0 4px 0; color: #64748b; font-size: 13px;">
                          This pre-booking pass was sent by <strong>${siteName}</strong>
                        </p>
                        <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                          Powered by TPR Max Visitor Management
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `;

      const text = `Pre-Booking Pass - ${siteName}\n\nHello ${workerName},\n\nYour visit to ${siteName} has been pre-booked.\n\nVisit Details:\n- Company: ${companyName}\n- Date: ${formattedDate}\n- Time: ${scheduledTime}\n- Duration: ${durationText}\n- Purpose: ${purpose}\n- Pass ID: ${qrCode}\n${notes ? `- Notes: ${notes}\n` : ''}\nPlease present this pass upon arrival for fast check-in.\n\nImportant:\n- Bring valid photo ID and any required PPE\n- Report to reception and scan your QR code\n- Follow all site Health & Safety regulations`;

      return await this.sendEmail({ to: email, subject, html, text });
    } catch (error) {
      logger.error('Failed to send contractor pre-booking pass email:', error);
      return false;
    }
  }

  async sendStaffQrPass(
    email: string,
    staffName: string,
    department: string,
    employeeId: string,
    qrCode: string,
    companySettings: any
  ): Promise<boolean> {
    try {
      const siteName = companySettings?.companyName || 'TPR';
      const primaryColor = companySettings?.accentColor || '#3b82f6';
      const backgroundColor = companySettings?.backgroundColor || '#f8fafc';
      const textColor = companySettings?.foregroundColor || '#1e293b';
      const variableTextColor = companySettings?.variableTextColor || '#374151';
      const logoDataUrl = await this.getLogoForEmail(companySettings);
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrCode)}`;

      const subject = `Your Staff Check-In QR Pass - ${siteName}`;

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Staff QR Check-In Pass - ${siteName}</title>
            <style>
              @media only screen and (max-width: 600px) {
                .mobile-padding { padding: 15px !important; }
                .mobile-full-width { width: 100% !important; }
                h1 { font-size: 22px !important; }
                h2 { font-size: 18px !important; }
                .qr-code { width: 150px !important; height: 150px !important; }
              }
            </style>
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background: ${backgroundColor};">
            <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
              <tr>
                <td align="center" style="padding: 20px 0;">
                  <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; max-width: 600px; border-collapse: collapse; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
                    <!-- Header -->
                    <tr>
                      <td style="background: linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}dd 100%); padding: 30px 20px; text-align: center;">
                        ${logoDataUrl ? `
                        <img src="${logoDataUrl}" alt="${siteName}" style="width: 70px; height: 70px; margin: 0 auto 12px; display: block; border-radius: 12px; background: white; padding: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        ` : `
                        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 70px; height: 70px; background: white; border-radius: 12px; margin: 0 auto 12px; display: inline-block; overflow: hidden;">
                          <tr><td align="center" valign="middle" style="width: 70px; height: 70px; font-size: 24px; font-weight: bold; color: ${primaryColor};">
                            ${siteName.substring(0, 3).toUpperCase()}
                          </td></tr>
                        </table>
                        `}
                        <h1 style="margin: 0; color: white; font-size: 24px; font-weight: 700;">
                          &#127970; Staff Check-In Pass
                        </h1>
                        <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">
                          Your Personal QR Code for Quick Check-In
                        </p>
                      </td>
                    </tr>

                    <!-- Welcome -->
                    <tr>
                      <td class="mobile-padding" style="padding: 25px 25px 15px;">
                        <h2 style="margin: 0 0 8px 0; color: ${textColor}; font-size: 20px;">
                          Hello ${staffName},
                        </h2>
                        <p style="margin: 0; color: ${variableTextColor}; font-size: 15px; line-height: 1.5;">
                          Here is your personal QR code for checking in and out at <strong>${siteName}</strong>. Simply scan this code at the kiosk to instantly check in or check out.
                        </p>
                      </td>
                    </tr>

                    <!-- QR Code -->
                    <tr>
                      <td class="mobile-padding" style="padding: 10px 25px;">
                        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                          <tr>
                            <td style="background: linear-gradient(to bottom, #ffffff, #f8fafc); border: 2px solid ${primaryColor}30; border-radius: 12px; padding: 25px; text-align: center;">
                              <img src="${qrCodeUrl}" alt="Staff QR Code" class="qr-code" style="width: 200px; height: 200px; margin: 0 auto 15px; display: block; border: 3px solid white; box-shadow: 0 4px 16px rgba(0,0,0,0.12); border-radius: 10px;">
                              <p style="margin: 0 0 4px 0; color: ${textColor}; font-weight: 700; font-size: 16px;">
                                ${staffName}
                              </p>
                              <p style="margin: 0; color: ${variableTextColor}; font-size: 13px;">
                                ${department} | Employee ID: ${employeeId}
                              </p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                    <!-- Instructions -->
                    <tr>
                      <td class="mobile-padding" style="padding: 15px 25px;">
                        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden;">
                          <tr>
                            <td style="background: ${primaryColor}10; padding: 12px 18px; border-bottom: 1px solid #e5e7eb;">
                              <h3 style="margin: 0; color: ${textColor}; font-size: 16px; font-weight: 700;">
                                &#128241; How to Use
                              </h3>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding: 15px 18px;">
                              <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%;">
                                <tr>
                                  <td style="padding: 6px 0; color: ${variableTextColor}; font-size: 14px;">
                                    <strong>1.</strong> Go to the reception kiosk and tap "QR Scanner"
                                  </td>
                                </tr>
                                <tr>
                                  <td style="padding: 6px 0; color: ${variableTextColor}; font-size: 14px;">
                                    <strong>2.</strong> Scan this QR code from your phone or printed pass
                                  </td>
                                </tr>
                                <tr>
                                  <td style="padding: 6px 0; color: ${variableTextColor}; font-size: 14px;">
                                    <strong>3.</strong> You'll be automatically checked in or out
                                  </td>
                                </tr>
                                <tr>
                                  <td style="padding: 10px 0 0 0; color: ${variableTextColor}; font-size: 13px; font-style: italic;">
                                    &#128161; Tip: Save this email or screenshot the QR code for quick access
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                      <td style="padding: 20px 25px; background: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
                        <p style="margin: 0 0 4px 0; color: #6b7280; font-size: 12px;">
                          This QR code is personal to you. Do not share it with others.
                        </p>
                        <p style="margin: 0; color: #9ca3af; font-size: 11px;">
                          Sent by ${siteName} Visitor Management System
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `;

      const text = `Staff Check-In QR Pass\n\nHello ${staffName},\n\nHere is your personal QR code for checking in at ${siteName}.\n\nYour QR Code: ${qrCode}\n\nDepartment: ${department}\nEmployee ID: ${employeeId}\n\nHow to use:\n1. Go to the reception kiosk and tap "QR Scanner"\n2. Scan this QR code from your phone or printed pass\n3. You'll be automatically checked in or out\n\nThis QR code is personal to you. Do not share it with others.`;

      return await this.sendEmail({ to: email, subject, html, text });
    } catch (error) {
      logger.error('Error sending staff QR pass:', error);
      return false;
    }
  }

  async sendContractorWorkerQrPass(
    email: string,
    workerName: string,
    companyName: string,
    qrCode: string,
    companySettings: any
  ): Promise<boolean> {
    try {
      const siteName = companySettings?.companyName || 'TPR';
      const primaryColor = companySettings?.accentColor || '#3b82f6';
      const backgroundColor = companySettings?.backgroundColor || '#f8fafc';
      const textColor = companySettings?.foregroundColor || '#1e293b';
      const variableTextColor = companySettings?.variableTextColor || '#374151';
      const logoDataUrl = await this.getLogoForEmail(companySettings);
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrCode)}`;

      const subject = `Your Contractor Check-In QR Pass - ${siteName}`;
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Contractor QR Check-In Pass - ${siteName}</title>
            <style>
              @media only screen and (max-width: 600px) {
                .mobile-padding { padding: 15px !important; }
                h1 { font-size: 22px !important; }
                .qr-code { width: 150px !important; height: 150px !important; }
              }
            </style>
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background: ${backgroundColor};">
            <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
              <tr>
                <td align="center" style="padding: 20px 0;">
                  <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; max-width: 600px; border-collapse: collapse; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
                    <tr>
                      <td style="background: linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}dd 100%); padding: 30px 20px; text-align: center;">
                        ${logoDataUrl ? `<img src="${logoDataUrl}" alt="${siteName}" style="width: 70px; height: 70px; margin: 0 auto 12px; display: block; border-radius: 12px; background: white; padding: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">` : `<div style="width:70px;height:70px;background:white;border-radius:12px;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:bold;color:${primaryColor};">${siteName.substring(0,3).toUpperCase()}</div>`}
                        <h1 style="margin: 0; color: white; font-size: 24px; font-weight: 700;">&#128296; Contractor Check-In Pass</h1>
                        <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Your Personal QR Code for Quick Check-In</p>
                      </td>
                    </tr>
                    <tr>
                      <td class="mobile-padding" style="padding: 25px 25px 15px;">
                        <h2 style="margin: 0 0 8px 0; color: ${textColor}; font-size: 20px;">Hello ${workerName},</h2>
                        <p style="margin: 0; color: ${variableTextColor}; font-size: 15px; line-height: 1.5;">
                          Here is your personal QR code for checking in and out at <strong>${siteName}</strong> as a contractor for <strong>${companyName}</strong>. Simply scan this code at the kiosk to instantly check in or check out.
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td class="mobile-padding" style="padding: 10px 25px;">
                        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                          <tr>
                            <td style="background: linear-gradient(to bottom, #ffffff, #f8fafc); border: 2px solid ${primaryColor}30; border-radius: 12px; padding: 25px; text-align: center;">
                              <img src="${qrCodeUrl}" alt="Contractor QR Code" class="qr-code" style="width: 200px; height: 200px; margin: 0 auto 15px; display: block; border: 3px solid white; box-shadow: 0 4px 16px rgba(0,0,0,0.12); border-radius: 10px;">
                              <p style="margin: 0 0 4px 0; color: ${textColor}; font-weight: 700; font-size: 16px;">${workerName}</p>
                              <p style="margin: 0; color: ${variableTextColor}; font-size: 13px;">${companyName}</p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td class="mobile-padding" style="padding: 15px 25px 25px;">
                        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden;">
                          <tr>
                            <td style="background: ${primaryColor}10; padding: 12px 18px; border-bottom: 1px solid #e5e7eb;">
                              <h3 style="margin: 0; color: ${textColor}; font-size: 16px; font-weight: 700;">&#128241; How to Use</h3>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding: 15px 18px;">
                              <p style="margin: 0 0 8px 0; color: ${variableTextColor}; font-size: 14px;"><strong>1.</strong> Go to the reception kiosk and tap "QR Scanner"</p>
                              <p style="margin: 0 0 8px 0; color: ${variableTextColor}; font-size: 14px;"><strong>2.</strong> Scan this QR code from your phone or printed pass</p>
                              <p style="margin: 0; color: ${variableTextColor}; font-size: 14px;"><strong>3.</strong> You'll be automatically checked in or out</p>
                            </td>
                          </tr>
                        </table>
                        <p style="margin: 15px 0 0 0; color: #9ca3af; font-size: 12px; text-align: center;">This QR code is personal to you. Do not share it with others.</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `;

      const text = `Contractor Check-In QR Pass\n\nHello ${workerName},\n\nHere is your personal QR code for checking in at ${siteName} as a contractor for ${companyName}.\n\nYour QR Code: ${qrCode}\n\nHow to use:\n1. Go to the reception kiosk and tap "QR Scanner"\n2. Scan this QR code from your phone or printed pass\n3. You'll be automatically checked in or out\n\nThis QR code is personal to you. Do not share it with others.`;

      return await this.sendEmail({ to: email, subject, html, text });
    } catch (error) {
      logger.error('Error sending contractor worker QR pass:', error);
      return false;
    }
  }

  // ─── Lone Worker Protection Emails ───────────────────────────────────────

  async sendLoneWorkerWelfareCheck(opts: {
    to: string;
    workerName: string;
    confirmUrl: string;
    nextCheckMins: number;
    companyName: string;
    siteName: string;
  }): Promise<boolean> {
    const { to, workerName, confirmUrl, nextCheckMins, companyName, siteName } = opts;
    const subject = `Lone Worker Welfare Check — ${companyName}`;
    const html = `
      <!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
      <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 0;">
          <tr><td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);">
              <tr><td style="background:linear-gradient(135deg,#2563eb,#1d4ed8);padding:32px;text-align:center;">
                <h1 style="color:#ffffff;margin:0;font-size:24px;">🛡️ Lone Worker Check-In</h1>
                <p style="color:#bfdbfe;margin:8px 0 0;font-size:14px;">${siteName}</p>
              </td></tr>
              <tr><td style="padding:32px;">
                <p style="color:#374151;font-size:16px;margin:0 0 16px;">Hi <strong>${workerName}</strong>,</p>
                <p style="color:#374151;font-size:15px;margin:0 0 24px;">This is your scheduled lone worker welfare check from <strong>${companyName}</strong>. Please confirm you are safe by clicking the button below.</p>
                <div style="text-align:center;margin:32px 0;">
                  <a href="${confirmUrl}" style="background:#16a34a;color:#ffffff;text-decoration:none;padding:16px 40px;border-radius:8px;font-size:18px;font-weight:bold;display:inline-block;">✅ I'm OK — Confirm I'm Safe</a>
                </div>
                <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:16px;border-radius:4px;margin:0 0 24px;">
                  <p style="color:#92400e;margin:0;font-size:14px;"><strong>⚠️ Important:</strong> If you do not confirm within the grace period, your supervisor will be automatically alerted. Your next check-in will be in <strong>${nextCheckMins} minutes</strong> after confirmation.</p>
                </div>
                <p style="color:#6b7280;font-size:13px;margin:0;">If you are in danger or need assistance, please call emergency services (999) immediately and do not use this email link.</p>
              </td></tr>
              <tr><td style="background:#f9fafb;padding:20px;text-align:center;border-top:1px solid #e5e7eb;">
                <p style="color:#9ca3af;font-size:12px;margin:0;">Lone Worker Protection • ${companyName} • ${siteName}</p>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </body></html>
    `;
    const text = `Lone Worker Welfare Check — ${companyName}\n\nHi ${workerName},\n\nThis is your scheduled lone worker welfare check. Please confirm you are safe by visiting:\n${confirmUrl}\n\nYour next check-in will be in ${nextCheckMins} minutes after confirmation.\n\nIf you are in danger, call 999 immediately.`;
    return this.sendEmail({ to, subject, html, text, companyName });
  }

  async sendLoneWorkerEscalation(opts: {
    to: string;
    contactName: string;
    workerName: string;
    workerEmail: string;
    level: 1 | 2 | 3;
    minutesMissed: number;
    startedAt: Date;
    companyName: string;
    siteName: string;
  }): Promise<boolean> {
    const { to, contactName, workerName, workerEmail, level, minutesMissed, startedAt, companyName, siteName } = opts;
    const urgencyLabels = { 1: 'ALERT — Missed Check-In', 2: 'URGENT — Second Missed Check-In', 3: 'EMERGENCY — Lone Worker Uncontactable' };
    const urgencyColors = { 1: '#f59e0b', 2: '#ef4444', 3: '#7f1d1d' };
    const subject = `🚨 Lone Worker ${urgencyLabels[level]}: ${workerName} — ${companyName}`;
    const html = `
      <!DOCTYPE html><html><head><meta charset="utf-8"></head>
      <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 0;">
          <tr><td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);">
              <tr><td style="background:${urgencyColors[level]};padding:32px;text-align:center;">
                <h1 style="color:#ffffff;margin:0;font-size:24px;">🚨 Level ${level} Lone Worker Alert</h1>
                <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">${urgencyLabels[level]}</p>
              </td></tr>
              <tr><td style="padding:32px;">
                <p style="color:#374151;font-size:16px;margin:0 0 16px;">Hi <strong>${contactName}</strong>,</p>
                <p style="color:#374151;font-size:15px;margin:0 0 24px;"><strong>${workerName}</strong> has missed their lone worker welfare check-in at <strong>${siteName}</strong>.</p>
                <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;padding:20px;margin:0 0 24px;">
                  <tr><td style="padding:6px 0;"><strong style="color:#374151;">Worker:</strong> <span style="color:#6b7280;">${workerName}</span></td></tr>
                  <tr><td style="padding:6px 0;"><strong style="color:#374151;">Email:</strong> <span style="color:#6b7280;">${workerEmail}</span></td></tr>
                  <tr><td style="padding:6px 0;"><strong style="color:#374151;">Site:</strong> <span style="color:#6b7280;">${siteName}</span></td></tr>
                  <tr><td style="padding:6px 0;"><strong style="color:#374151;">Session started:</strong> <span style="color:#6b7280;">${startedAt.toLocaleString('en-GB')}</span></td></tr>
                  <tr><td style="padding:6px 0;"><strong style="color:#374151;">Minutes overdue:</strong> <span style="color:#ef4444;font-weight:bold;">${minutesMissed} min</span></td></tr>
                  <tr><td style="padding:6px 0;"><strong style="color:#374151;">Alert level:</strong> <span style="color:#ef4444;font-weight:bold;">Level ${level}</span></td></tr>
                </table>
                ${level === 3 ? `<div style="background:#fef2f2;border:2px solid #ef4444;border-radius:8px;padding:16px;margin-bottom:24px;"><p style="color:#991b1b;font-weight:bold;margin:0;">This is a Level 3 emergency alert. If you cannot reach ${workerName}, consider calling emergency services (999) and their emergency contact immediately.</p></div>` : ''}
                <p style="color:#6b7280;font-size:13px;">Please attempt to contact <strong>${workerName}</strong> immediately. You can end their lone worker session in the TPR-Max dashboard once contact is made.</p>
              </td></tr>
              <tr><td style="background:#f9fafb;padding:20px;text-align:center;border-top:1px solid #e5e7eb;">
                <p style="color:#9ca3af;font-size:12px;margin:0;">Lone Worker Protection • ${companyName} • Automated Alert</p>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </body></html>
    `;
    const text = `Level ${level} Lone Worker Alert: ${workerName}\n\n${workerName} has missed their welfare check at ${siteName}.\nEmail: ${workerEmail}\nSession started: ${startedAt.toLocaleString('en-GB')}\nMinutes overdue: ${minutesMissed}\n\nPlease contact them immediately.${level === 3 ? ' Consider calling emergency services (999).' : ''}`;
    return this.sendEmail({ to, subject, html, text, companyName });
  }

  forCustomer(customerId: string): EmailService {
    return new EmailService(customerId);
  }
}

export { EmailService };
export const emailService = new EmailService();
export const sendEmail = (options: EmailOptions) => emailService.sendEmail(options);

// Simple send email function for induction system
export async function sendInductionEmail(options: { to: string; subject: string; html: string; text: string }): Promise<boolean> {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text
    });

    return true;
  } catch (error) {
    logger.error('Failed to send email:', error);
    return false;
  }
}