import nodemailer from 'nodemailer';
import type { Report, CompanySettings, PreBooking, Staff, User } from '@shared/schema';

export class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private settings: CompanySettings | null = null;

  constructor(companySettings?: CompanySettings) {
    if (companySettings) {
      this.updateSettings(companySettings);
    }
  }

  updateSettings(companySettings: CompanySettings) {
    this.settings = companySettings;
    
    // Only create transporter if we have complete SMTP configuration
    if (companySettings.smtpHost && companySettings.smtpUsername && companySettings.smtpPassword && companySettings.smtpFromEmail) {
      const smtpConfig = {
        host: companySettings.smtpHost,
        port: parseInt(companySettings.smtpPort || '587'),
        secure: companySettings.smtpSecurity === 'SSL/TLS',
        auth: {
          user: companySettings.smtpUsername,
          pass: companySettings.smtpPassword
        },
        tls: {
          rejectUnauthorized: false
        }
      };

      this.transporter = nodemailer.createTransporter(smtpConfig);
    } else {
      this.transporter = null;
    }
  }

  async verifyConnection(): Promise<boolean> {
    try {
      if (!this.transporter) {
        return false;
      }
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error('Email service connection failed:', error);
      return false;
    }
  }

  private getFromAddress(): string {
    if (!this.settings?.smtpFromEmail) {
      throw new Error('SMTP configuration not available');
    }
    const fromName = this.settings.smtpFromName || this.settings.companyName || 'VisiGate Pro';
    return `"${fromName}" <${this.settings.smtpFromEmail}>`;
  }

  async sendReport(
    report: Report, 
    companySettings: CompanySettings,
    recipients: string[],
    reportData: any
  ): Promise<boolean> {
    try {
      if (!this.transporter) {
        console.error('Email service not configured');
        return false;
      }

      const subject = `${companySettings.companyName} - ${report.reportType.toUpperCase()} Visitor Report`;
      
      const html = this.generateReportHTML(report, companySettings, reportData);

      const mailOptions = {
        from: this.getFromAddress(),
        to: recipients.join(', '),
        replyTo: this.settings?.smtpReplyTo || this.settings?.smtpFromEmail,
        subject,
        html,
        attachments: []
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('Report email sent:', info.messageId);
      return true;
    } catch (error) {
      console.error('Failed to send report email:', error);
      return false;
    }
  }

  private generateReportHTML(
    report: Report, 
    companySettings: CompanySettings, 
    reportData: any
  ): string {
    const { visitors, staff, checkedOutVisitors } = reportData;
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${companySettings.companyName} - Visitor Report</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); color: white; padding: 30px 40px; }
        .header h1 { margin: 0; font-size: 28px; }
        .header p { margin: 10px 0 0 0; opacity: 0.9; }
        .content { padding: 40px; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 30px 0; }
        .stat-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; text-align: center; }
        .stat-number { font-size: 32px; font-weight: bold; color: #1e40af; margin-bottom: 5px; }
        .stat-label { color: #64748b; font-size: 14px; }
        .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .table th, .table td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
        .table th { background: #f8fafc; font-weight: 600; color: #475569; }
        .footer { background: #f8fafc; padding: 20px 40px; border-top: 1px solid #e2e8f0; text-align: center; color: #64748b; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${companySettings.companyName}</h1>
          <p>Visitor Management Report - ${report.reportType.toUpperCase()}</p>
          <p>Generated on ${new Date(report.generatedAt).toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}</p>
        </div>
        
        <div class="content">
          <h2>Report Summary</h2>
          <p><strong>Report Period:</strong> ${new Date(report.dateFrom).toLocaleDateString()} - ${new Date(report.dateTo).toLocaleDateString()}</p>
          
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-number">${report.totalVisitors}</div>
              <div class="stat-label">Total Visitors</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${visitors.filter((v: any) => v.isCheckedIn).length}</div>
              <div class="stat-label">Currently On-Site</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${staff.length}</div>
              <div class="stat-label">Active Staff</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${report.avgDuration}</div>
              <div class="stat-label">Avg. Visit Duration</div>
            </div>
          </div>

          <h3>Recent Visitors</h3>
          <table class="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Company</th>
                <th>Check-in Time</th>
                <th>Check-out Time</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              ${visitors.slice(0, 10).map((visitor: any) => `
                <tr>
                  <td>${visitor.name}</td>
                  <td>${visitor.company || 'N/A'}</td>
                  <td>${new Date(visitor.checkedInAt).toLocaleString()}</td>
                  <td>${visitor.checkedOutAt ? new Date(visitor.checkedOutAt).toLocaleString() : 'Still on-site'}</td>
                  <td>${visitor.checkedOutAt ? this.calculateDuration(visitor.checkedInAt, visitor.checkedOutAt) : 'In progress'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          ${visitors.length > 10 ? `<p><em>Showing latest 10 visitors. Total: ${visitors.length}</em></p>` : ''}
        </div>
        
        <div class="footer">
          <p>Generated by VisiGate Pro Visitor Management System</p>
          <p>This is an automated report. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
    `;
  }

  private calculateDuration(checkedIn: string, checkedOut: string): string {
    const start = new Date(checkedIn);
    const end = new Date(checkedOut);
    const diffMs = end.getTime() - start.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  async sendTestEmail(recipient: string): Promise<boolean> {
    try {
      if (!this.transporter) {
        console.error('Email service not configured');
        return false;
      }

      const mailOptions = {
        from: this.getFromAddress(),
        to: recipient,
        replyTo: this.settings?.smtpReplyTo || this.settings?.smtpFromEmail,
        subject: 'VisiGate Pro - Test Email Configuration',
        html: `
          <h2>Email Configuration Test</h2>
          <p>This is a test email to verify your VisiGate Pro email configuration is working correctly.</p>
          <p>If you received this email, your email settings are configured properly!</p>
          <hr>
          <p><small>Sent from ${this.settings?.companyName || 'VisiGate Pro'} Visitor Management System</small></p>
        `
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('Test email sent:', info.messageId);
      return true;
    } catch (error) {
      console.error('Failed to send test email:', error);
      return false;
    }
  }

  async sendPreBookingEmail(
    preBooking: PreBooking,
    hostStaff: Staff,
    companySettings: CompanySettings,
    qrCodeUrl: string
  ): Promise<boolean> {
    try {
      if (!this.transporter) {
        console.error('Email service not configured');
        return false;
      }

      const visitDate = new Date(preBooking.visitDate).toLocaleDateString('en-GB', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const visitorHtml = this.generatePreBookingVisitorEmail(preBooking, hostStaff, companySettings, qrCodeUrl, visitDate);
      const hostHtml = this.generatePreBookingHostEmail(preBooking, hostStaff, companySettings, visitDate);

      // Send to visitor
      const visitorMailOptions = {
        from: this.getFromAddress(),
        to: preBooking.visitorEmail,
        replyTo: this.settings?.smtpReplyTo || this.settings?.smtpFromEmail,
        subject: `${companySettings.companyName} - Visit Confirmation for ${visitDate.split(',')[0]}`,
        html: visitorHtml,
      };

      // Send to host using their actual email from staff table
      const hostMailOptions = {
        from: this.getFromAddress(),
        to: hostStaff.email, // Use actual staff email instead of placeholder
        replyTo: this.settings?.smtpReplyTo || this.settings?.smtpFromEmail,
        subject: `${companySettings.companyName} - Visitor Pre-booking Notification`,
        html: hostHtml,
      };

      const [visitorResult, hostResult] = await Promise.all([
        this.transporter.sendMail(visitorMailOptions),
        this.transporter.sendMail(hostMailOptions)
      ]);

      console.log('Pre-booking emails sent:', visitorResult.messageId, hostResult.messageId);
      return true;
    } catch (error) {
      console.error('Failed to send pre-booking emails:', error);
      return false;
    }
  }

  private generatePreBookingVisitorEmail(
    preBooking: PreBooking,
    hostStaff: Staff,
    companySettings: CompanySettings,
    qrCodeUrl: string,
    visitDate: string
  ): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${companySettings.companyName} - Visit Confirmation</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; }
        .content { padding: 30px; }
        .qr-section { text-align: center; background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .qr-code { background: white; padding: 15px; border-radius: 8px; display: inline-block; }
        .visit-details { background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .safety-section { background: #fef2f2; border-left: 4px solid #ef4444; padding: 20px; margin: 20px 0; }
        .footer { background: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 14px; }
        .safety-title { color: #dc2626; font-weight: bold; margin-bottom: 10px; }
        .safety-list { margin: 10px 0; padding-left: 20px; }
        .safety-list li { margin: 5px 0; }
        .important { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin: 15px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Visit Confirmation</h1>
          <p>${companySettings.companyName}</p>
        </div>
        
        <div class="content">
          <h2>Dear ${preBooking.visitorName},</h2>
          <p>Your visit to <strong>${companySettings.companyName}</strong> has been confirmed. Please find your visit details and QR code below.</p>
          
          <div class="visit-details">
            <h3>Visit Details</h3>
            <p><strong>Visitor:</strong> ${preBooking.visitorName}</p>
            <p><strong>Company:</strong> ${preBooking.company || 'N/A'}</p>
            <p><strong>Date & Time:</strong> ${visitDate}</p>
            <p><strong>Host:</strong> ${hostStaff.firstName} ${hostStaff.lastName} (${hostStaff.department})</p>
            <p><strong>Purpose:</strong> ${preBooking.purpose || 'General visit'}</p>
          </div>
          
          <div class="qr-section">
            <h3>Your Visit QR Code</h3>
            <p>Please scan this QR code at reception upon arrival:</p>
            <div class="qr-code">
              <img src="${qrCodeUrl}" alt="Visit QR Code" style="width: 150px; height: 150px;" />
            </div>
            <p><strong>Booking Reference:</strong> ${preBooking.qrCode}</p>
          </div>
          
          <div class="important">
            <p><strong>⚠️ Important:</strong> Please arrive 10 minutes early to allow time for the check-in process and security briefing.</p>
          </div>
          
          <div class="safety-section">
            <div class="safety-title">🛡️ UK Health & Safety Requirements</div>
            <p>As per UK Health and Safety at Work etc. Act 1974 and associated regulations, all visitors must comply with the following:</p>
            
            <div class="safety-list">
              <h4>Before Your Visit:</h4>
              <ul>
                <li>Ensure you are fit and well on the day of your visit</li>
                <li>Inform us of any medical conditions that may affect your safety</li>
                <li>Wear appropriate clothing and footwear (no open-toe shoes in work areas)</li>
                <li>Bring valid photo identification</li>
              </ul>
              
              <h4>During Your Visit:</h4>
              <ul>
                <li>Follow all safety instructions provided by your host</li>
                <li>Wear provided Personal Protective Equipment (PPE) where required</li>
                <li>Do not enter restricted or marked hazardous areas</li>
                <li>Report any accidents, near misses, or safety concerns immediately</li>
                <li>Remain with your host at all times unless otherwise instructed</li>
                <li>Follow emergency evacuation procedures if alarms sound</li>
              </ul>
              
              <h4>Prohibited Items:</h4>
              <ul>
                <li>Alcohol and illegal substances</li>
                <li>Weapons or sharp objects</li>
                <li>Photography/recording devices (without prior approval)</li>
                <li>Any items deemed hazardous by security</li>
              </ul>
            </div>
            
            <p><strong>Emergency Contact:</strong> In case of emergency, dial 999 or contact site security immediately.</p>
            <p><strong>First Aid:</strong> Trained first aiders are available on-site. Report any injuries immediately to your host.</p>
          </div>
          
          <div class="important">
            <p><strong>Note:</strong> By attending this visit, you acknowledge that you have read and understood these health and safety requirements and agree to comply with all site safety rules and procedures.</p>
          </div>
          
          <p>If you need to reschedule or cancel your visit, please contact us as soon as possible.</p>
          <p>We look forward to welcoming you to ${companySettings.companyName}.</p>
        </div>
        
        <div class="footer">
          <p>Generated by VisiGate Pro Visitor Management System</p>
          <p>This is an automated email. Please do not reply directly to this email.</p>
        </div>
      </div>
    </body>
    </html>
    `;
  }

  private generatePreBookingHostEmail(
    preBooking: PreBooking,
    hostStaff: Staff,
    companySettings: CompanySettings,
    visitDate: string
  ): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${companySettings.companyName} - Visitor Pre-booking Notification</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; }
        .content { padding: 30px; }
        .visit-details { background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .footer { background: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Visitor Pre-booking Notification</h1>
          <p>${companySettings.companyName}</p>
        </div>
        
        <div class="content">
          <h2>Dear ${hostStaff.firstName} ${hostStaff.lastName},</h2>
          <p>A visitor has been pre-booked and you have been assigned as their host. Please find the details below:</p>
          
          <div class="visit-details">
            <h3>Visitor Information</h3>
            <p><strong>Name:</strong> ${preBooking.visitorName}</p>
            <p><strong>Email:</strong> ${preBooking.visitorEmail}</p>
            <p><strong>Company:</strong> ${preBooking.company || 'N/A'}</p>
            <p><strong>Visit Date:</strong> ${visitDate}</p>
            <p><strong>Purpose:</strong> ${preBooking.purpose || 'General visit'}</p>
            <p><strong>Booking Reference:</strong> ${preBooking.qrCode}</p>
          </div>
          
          <p><strong>Action Required:</strong></p>
          <ul>
            <li>Please be available at the scheduled time to meet your visitor</li>
            <li>Ensure any necessary preparations are made for the visit</li>
            <li>Conduct a safety briefing appropriate to the areas being visited</li>
            <li>Escort the visitor at all times during their visit</li>
          </ul>
          
          <p>The visitor will check in using their QR code at reception. You will be notified when they arrive.</p>
        </div>
        
        <div class="footer">
          <p>Generated by VisiGate Pro Visitor Management System</p>
          <p>This is an automated email. Please do not reply directly to this email.</p>
        </div>
      </div>
    </body>
    </html>
    `;
  }

  async sendCardIssueNotification(
    contractorEmail: string,
    workerName: string,
    cardType: 'red' | 'yellow',
    offenceName: string,
    description: string,
    companySettings: CompanySettings,
    banUntilDate?: string
  ): Promise<boolean> {
    try {
      if (!this.transporter) {
        console.error('Email service not configured');
        return false;
      }

      const subject = `${companySettings.companyName} - ${cardType.toUpperCase()} CARD ISSUED - ${workerName}`;
      
      const html = this.generateCardIssueHTML(
        workerName,
        cardType,
        offenceName,
        description,
        companySettings,
        banUntilDate
      );

      const mailOptions = {
        from: this.getFromAddress(),
        to: contractorEmail,
        replyTo: this.settings?.smtpReplyTo || this.settings?.smtpFromEmail,
        subject,
        html,
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('Card issue notification email sent:', info.messageId);
      return true;
    } catch (error) {
      console.error('Failed to send card issue notification email:', error);
      return false;
    }
  }

  async sendUserInvitation(
    email: string,
    role: string,
    token: string,
    invitedBy: User,
    companySettings: CompanySettings
  ): Promise<boolean> {
    try {
      if (!this.transporter) {
        console.error('Email service not configured');
        return false;
      }

      const inviteUrl = `${process.env.BASE_URL || 'https://localhost:5000'}/invite/accept?token=${token}`;
      
      const html = this.generateInvitationHTML(email, role, inviteUrl, invitedBy, companySettings);
      
      const mailOptions = {
        from: this.getFromAddress(),
        to: email,
        replyTo: this.settings?.smtpReplyTo || this.settings?.smtpFromEmail,
        subject: `${companySettings.companyName} - You're Invited to Join VisiGate Pro`,
        html,
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('User invitation email sent:', info.messageId);
      return true;
    } catch (error) {
      console.error('Failed to send user invitation email:', error);
      return false;
    }
  }

  private generateCardIssueHTML(
    workerName: string,
    cardType: 'red' | 'yellow',
    offenceName: string,
    description: string,
    companySettings: CompanySettings,
    banUntilDate?: string
  ): string {
    const isRedCard = cardType === 'red';
    const cardColor = isRedCard ? '#dc2626' : '#eab308';
    const cardBgColor = isRedCard ? '#fef2f2' : '#fefce8';
    const urgencyLabel = isRedCard ? 'URGENT - IMMEDIATE ACTION REQUIRED' : 'WARNING - CORRECTIVE ACTION REQUIRED';
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${companySettings.companyName} - ${cardType.toUpperCase()} Card Notification</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 700px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: ${cardColor}; color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; text-transform: uppercase; }
        .header p { margin: 10px 0 0 0; opacity: 0.9; font-weight: bold; }
        .urgency-banner { background: ${cardBgColor}; border-left: 6px solid ${cardColor}; padding: 20px; margin: 0; }
        .urgency-text { color: ${cardColor}; font-weight: bold; font-size: 16px; margin: 0; }
        .content { padding: 40px; }
        .card-details { background: ${cardBgColor}; border: 2px solid ${cardColor}; border-radius: 8px; padding: 25px; margin: 25px 0; }
        .card-title { color: ${cardColor}; font-size: 20px; font-weight: bold; margin-bottom: 15px; text-transform: uppercase; }
        .detail-row { margin: 10px 0; }
        .detail-label { font-weight: bold; color: #374151; }
        .detail-value { color: #6b7280; }
        .consequences-section { background: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; padding: 25px; margin: 25px 0; }
        .consequences-title { color: #dc2626; font-size: 18px; font-weight: bold; margin-bottom: 15px; }
        .consequences-list { margin: 15px 0; padding-left: 20px; }
        .consequences-list li { margin: 8px 0; color: #374151; }
        .action-required { background: #fff3cd; border: 1px solid #ffd93d; border-radius: 8px; padding: 20px; margin: 25px 0; }
        .action-title { color: #b45309; font-weight: bold; margin-bottom: 10px; }
        .footer { background: #f8fafc; padding: 25px; text-align: center; color: #64748b; font-size: 14px; border-top: 1px solid #e2e8f0; }
        .important-note { background: #e0e7ff; border: 1px solid #a5b4fc; border-radius: 8px; padding: 20px; margin: 25px 0; }
        .contact-info { background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${cardType} Card Issued</h1>
          <p>Safety Violation Notice</p>
        </div>

        <div class="urgency-banner">
          <p class="urgency-text">⚠️ ${urgencyLabel}</p>
        </div>
        
        <div class="content">
          <h2>Safety Card Notification</h2>
          <p>This notification is to inform you that a <strong>${cardType.toUpperCase()} CARD</strong> has been issued to one of your workers in accordance with Siemens Energy's contractor safety management system.</p>
          
          <div class="card-details">
            <div class="card-title">🛡️ ${cardType} Card Details</div>
            <div class="detail-row">
              <span class="detail-label">Worker Name:</span>
              <span class="detail-value">${workerName}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Violation Type:</span>
              <span class="detail-value">${offenceName}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Description:</span>
              <span class="detail-value">${description}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Date Issued:</span>
              <span class="detail-value">${new Date().toLocaleDateString('en-GB', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}</span>
            </div>
            ${banUntilDate ? `
            <div class="detail-row">
              <span class="detail-label">Ban Duration:</span>
              <span class="detail-value" style="color: #dc2626; font-weight: bold;">Until ${new Date(banUntilDate).toLocaleDateString('en-GB', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}</span>
            </div>
            ` : ''}
          </div>

          <div class="consequences-section">
            <div class="consequences-title">📋 ${isRedCard ? 'RED CARD' : 'YELLOW CARD'} - What This Means</div>
            
            ${isRedCard ? `
            <p><strong>RED CARD = IMMEDIATE 3-YEAR SITE BAN</strong></p>
            <ul class="consequences-list">
              <li><strong>Immediate Action:</strong> The worker must leave site immediately and is banned from returning</li>
              <li><strong>Ban Duration:</strong> 3 years from date of issue (until ${banUntilDate ? new Date(banUntilDate).toLocaleDateString('en-GB') : 'specified date'})</li>
              <li><strong>No Access:</strong> Worker cannot be booked or scheduled for any work on site during ban period</li>
              <li><strong>Serious Violation:</strong> Red cards are issued for major safety breaches that pose significant risk</li>
              <li><strong>Review Process:</strong> Manual review required after ban period for potential reinstatement</li>
            </ul>
            ` : `
            <p><strong>YELLOW CARD = FORMAL WARNING</strong></p>
            <ul class="consequences-list">
              <li><strong>Formal Warning:</strong> Worker receives official warning for safety violation</li>
              <li><strong>Continued Access:</strong> Worker may continue working but must address violation immediately</li>
              <li><strong>Progressive System:</strong> 3 yellow cards automatically result in a red card and 3-year ban</li>
              <li><strong>Improvement Required:</strong> Worker must demonstrate corrective action and improved safety behavior</li>
              <li><strong>Monitoring:</strong> Enhanced supervision and monitoring will be applied</li>
            </ul>
            `}
          </div>

          <div class="action-required">
            <div class="action-title">🚨 IMMEDIATE ACTION REQUIRED</div>
            <p><strong>As the contractor, you must:</strong></p>
            <ul>
              ${isRedCard ? `
              <li>Remove the worker from site immediately</li>
              <li>Do not schedule this worker for any site work during the ban period</li>
              <li>Conduct internal investigation and disciplinary action</li>
              <li>Review and strengthen your safety procedures</li>
              <li>Provide additional safety training to remaining workers</li>
              ` : `
              <li>Discuss this violation with the worker immediately</li>
              <li>Conduct additional safety training with the worker</li>
              <li>Implement corrective measures to prevent recurrence</li>
              <li>Provide enhanced supervision for this worker</li>
              <li>Review and strengthen safety procedures if needed</li>
              `}
            </ul>
          </div>

          <div class="important-note">
            <p><strong>📞 Contact Required:</strong> Please contact ${companySettings.companyName} safety management within 24 hours to discuss this incident and your corrective action plan.</p>
          </div>

          <div class="contact-info">
            <h3>UK Health & Safety Regulations</h3>
            <p>This action is taken in accordance with:</p>
            <ul>
              <li>Health and Safety at Work etc. Act 1974</li>
              <li>Management of Health and Safety at Work Regulations 1999</li>
              <li>Construction (Design and Management) Regulations 2015</li>
              <li>Siemens Energy contractor safety management procedures</li>
            </ul>
            <p><strong>Legal Requirement:</strong> Contractors must ensure all workers comply with health and safety requirements and take immediate action when violations occur.</p>
          </div>

          <p><strong>This is a serious matter that requires your immediate attention and action.</strong></p>
        </div>
        
        <div class="footer">
          <p><strong>Generated by VisiGate Pro Contractor Safety Management System</strong></p>
          <p>This is an automated safety notification. For urgent matters, contact site safety management immediately.</p>
          <p>© ${new Date().getFullYear()} ${companySettings.companyName} - All rights reserved</p>
        </div>
      </div>
    </body>
    </html>
    `;
  }

  private generateInvitationHTML(
    email: string,
    role: string,
    inviteUrl: string,
    invitedBy: User,
    companySettings: CompanySettings
  ): string {
    const roleDisplay = role === 'admin' ? 'Administrator' : 'Standard User';
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${companySettings.companyName} - VisiGate Pro Invitation</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; }
        .content { padding: 40px; }
        .invite-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 30px; margin: 20px 0; text-align: center; }
        .cta-button { display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
        .cta-button:hover { background: linear-gradient(135deg, #2563eb 0%, #5855f1 100%); }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
        .info-item { text-align: center; padding: 15px; background: #f8fafc; border-radius: 6px; }
        .info-label { font-size: 12px; color: #64748b; text-transform: uppercase; margin-bottom: 5px; }
        .info-value { font-weight: bold; color: #1e293b; }
        .footer { background: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Welcome to VisiGate Pro!</h1>
          <p>You've been invited to join ${companySettings.companyName}</p>
        </div>
        
        <div class="content">
          <div class="invite-card">
            <h2 style="color: #1e293b; margin-bottom: 20px;">Your Invitation Details</h2>
            
            <div class="info-grid">
              <div class="info-item">
                <div class="info-label">Email Address</div>
                <div class="info-value">${email}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Access Level</div>
                <div class="info-value">${roleDisplay}</div>
              </div>
            </div>
            
            <p style="color: #64748b; margin: 20px 0;">
              ${invitedBy.username} has invited you to join the ${companySettings.companyName} VisiGate Pro system.
              Click the button below to create your account and get started.
            </p>
            
            <a href="${inviteUrl}" class="cta-button">Accept Invitation & Create Account</a>
            
            <p style="color: #64748b; font-size: 14px; margin-top: 20px;">
              This invitation will expire in 7 days for security purposes.
            </p>
          </div>
          
          <div style="background: #e0f2fe; border: 1px solid #0284c7; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h3 style="color: #0369a1; margin: 0 0 10px 0;">What you'll get access to:</h3>
            <ul style="color: #075985; margin: 0; padding-left: 20px;">
              <li>Modern visitor management system</li>
              <li>Real-time visitor tracking and reports</li>
              <li>Staff check-in/out capabilities</li>
              <li>Advanced analytics and insights</li>
              ${role === 'admin' ? '<li><strong>Full administrative access</strong></li>' : '<li>Standard user permissions</li>'}
            </ul>
          </div>
        </div>
        
        <div class="footer">
          <p><strong>VisiGate Pro Visitor Management System</strong></p>
          <p>If you didn't expect this invitation, please contact ${companySettings.companyName} directly.</p>
          <p><small>This is an automated email. Please do not reply directly to this email.</small></p>
        </div>
      </div>
    </body>
    </html>
    `;
  }

  // Send urgent visitor notification to Reception
  async sendVisitorEmergencyNotification(
    visitor: any,
    hostStaff: any,
    companySettings: any,
    receptionEmail: string,
    urgencyReason: string = "Emergency Contact Required"
  ): Promise<boolean> {
    try {
      if (!this.transporter) {
        console.error('Email service not configured');
        return false;
      }

      const subject = `🚨 URGENT: ${urgencyReason} - Visitor ${visitor.firstName} ${visitor.lastName}`;
      
      const visitDuration = Math.floor((Date.now() - new Date(visitor.checkedInAt).getTime()) / (1000 * 60));
      const durationText = visitDuration >= 60 
        ? `${Math.floor(visitDuration / 60)}h ${visitDuration % 60}m`
        : `${visitDuration}m`;

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Urgent Visitor Notification</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #fef2f2; }
            .container { max-width: 700px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); border: 3px solid #dc2626; }
            .header { background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; padding: 25px; text-align: center; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { padding: 30px; }
            .urgent-box { background: #fef2f2; border: 2px solid #fca5a5; border-radius: 8px; padding: 25px; margin: 20px 0; }
            .visitor-details { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0; }
            .contact-section { background: #ddd6fe; border: 1px solid #c4b5fd; border-radius: 8px; padding: 20px; margin: 20px 0; }
            .company-footer { background: #f3f4f6; border-top: 1px solid #d1d5db; padding: 20px; margin-top: 30px; text-align: center; color: #6b7280; font-size: 14px; }
            .detail-row { display: flex; justify-content: space-between; margin: 8px 0; }
            .detail-label { font-weight: bold; color: #374151; }
            .detail-value { color: #6b7280; }
            .timestamp { background: #f3f4f6; padding: 15px; border-radius: 6px; font-size: 14px; color: #6b7280; margin-top: 25px; text-align: center; }
            .contact-urgent { color: #dc2626; font-weight: bold; font-size: 16px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🚨 URGENT VISITOR NOTIFICATION</h1>
              <p style="margin: 5px 0 0 0; font-size: 18px;">${urgencyReason}</p>
            </div>
            
            <div class="content">
              <div class="urgent-box">
                <h2 style="color: #dc2626; margin-top: 0;">Reception - Immediate Attention Required</h2>
                <p style="font-size: 16px; line-height: 1.6; color: #374151;">
                  This is an <strong>urgent notification</strong> regarding a visitor currently on our premises. 
                  Please contact this visitor immediately or provide assistance as required.
                </p>
              </div>

              <div class="visitor-details">
                <h3 style="color: #1f2937; margin-top: 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">👤 Visitor Information</h3>
                <div class="detail-row">
                  <span class="detail-label">Full Name:</span>
                  <span class="detail-value">${visitor.firstName} ${visitor.lastName}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Company:</span>
                  <span class="detail-value">${visitor.company || 'Not specified'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Visit Purpose:</span>
                  <span class="detail-value">${visitor.purpose || 'Not specified'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Checked In:</span>
                  <span class="detail-value">${new Date(visitor.checkedInAt).toLocaleString('en-GB')}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Duration on Site:</span>
                  <span class="detail-value">${durationText}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Host Staff:</span>
                  <span class="detail-value">${hostStaff?.firstName} ${hostStaff?.lastName} (${hostStaff?.department})</span>
                </div>
              </div>

              <div class="contact-section">
                <h3 style="color: #5b21b6; margin-top: 0; border-bottom: 2px solid #c4b5fd; padding-bottom: 10px;">📞 Emergency Contact Details</h3>
                ${visitor.mobileNumber || visitor.phoneNumber ? `
                  <div class="detail-row">
                    <span class="detail-label">${visitor.mobileNumber ? 'Mobile Number:' : 'Phone Number:'}</span>
                    <span class="contact-urgent">${visitor.mobileNumber || visitor.phoneNumber}</span>
                  </div>
                  ${visitor.mobileNumber && visitor.phoneNumber ? `
                    <div class="detail-row">
                      <span class="detail-label">Alternative Phone:</span>
                      <span class="detail-value">${visitor.phoneNumber}</span>
                    </div>
                  ` : ''}
                ` : `
                  <div class="detail-row">
                    <span class="detail-label">Phone Number:</span>
                    <span class="detail-value" style="color: #dc2626;">⚠️ Not provided</span>
                  </div>
                `}
                ${visitor.email ? `
                  <div class="detail-row">
                    <span class="detail-label">Email Address:</span>
                    <span class="contact-urgent">${visitor.email}</span>
                  </div>
                ` : `
                  <div class="detail-row">
                    <span class="detail-label">Email Address:</span>
                    <span class="detail-value" style="color: #dc2626;">⚠️ Not provided</span>
                  </div>
                `}
              </div>

              <div style="background: #e0f2fe; border: 1px solid #0284c7; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <h3 style="color: #0369a1; margin: 0 0 15px 0;">📍 Immediate Actions Required:</h3>
                <ul style="color: #075985; margin: 0; padding-left: 20px; line-height: 1.6;">
                  <li><strong>Contact the visitor immediately</strong> using the phone numbers above</li>
                  <li>If unable to reach visitor, locate them on premises via their host: ${hostStaff?.firstName} ${hostStaff?.lastName}</li>
                  <li>Provide immediate assistance or emergency support as required</li>
                  <li>Follow all company emergency procedures if this is a safety-related incident</li>
                  <li>Document any actions taken and report back to the requesting party</li>
                </ul>
              </div>

              <div class="timestamp">
                <strong>🕒 Notification Sent:</strong> ${new Date().toLocaleString('en-GB')}<br>
                <strong>📍 Visitor Location:</strong> ${hostStaff?.department} Department with ${hostStaff?.firstName} ${hostStaff?.lastName}
              </div>
            </div>

            <div class="company-footer">
              <strong>${companySettings.companyName}</strong><br>
              ${companySettings.address}<br>
              📞 ${companySettings.phone} | ✉️ ${companySettings.email}<br>
              🌐 ${companySettings.website || ''}<br><br>
              <em>VisiGate Pro Visitor Management System - Automated Emergency Notification</em>
            </div>
          </div>
        </body>
        </html>
      `;

      const mailOptions = {
        from: this.getFromAddress(),
        to: receptionEmail,
        cc: companySettings.email !== receptionEmail ? companySettings.email : undefined,
        replyTo: this.settings?.smtpReplyTo || this.settings?.smtpFromEmail,
        subject: subject,
        html: html,
        priority: 'high',
        importance: 'high'
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('Visitor emergency notification sent:', info.messageId);
      return true;
    } catch (error) {
      console.error('Failed to send visitor emergency notification:', error);
      return false;
    }
  }

  // Send emergency alert to all on-site personnel
  async sendEmergencyAlert(to: string, subject: string, message: string): Promise<boolean> {
    try {
      if (!this.transporter) {
        console.error('Email service not configured');
        return false;
      }

      const alertSubject = `🚨 EMERGENCY ALERT - ${subject}`;
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Emergency Alert</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #fee2e2; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); border: 3px solid #dc2626; }
            .header { background: #dc2626; color: white; padding: 20px; text-align: center; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { padding: 30px; }
            .alert-box { background: #fef2f2; border: 2px solid #fca5a5; border-radius: 8px; padding: 20px; margin: 20px 0; }
            .timestamp { background: #f3f4f6; padding: 10px; border-radius: 6px; font-size: 14px; color: #6b7280; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🚨 EMERGENCY ALERT</h1>
              <p>${subject}</p>
            </div>
            
            <div class="content">
              <div class="alert-box">
                <h2 style="color: #dc2626; margin-top: 0;">Emergency Message:</h2>
                <p style="font-size: 16px; line-height: 1.6;">${message}</p>
              </div>
              
              <p><strong>⚠️ Immediate Action Required:</strong></p>
              <ul>
                <li>Follow all emergency procedures immediately</li>
                <li>Proceed to designated assembly points</li>
                <li>Await further instructions from emergency personnel</li>
                <li>Do not use elevators unless instructed</li>
              </ul>
              
              <div class="timestamp">
                <strong>Alert Sent:</strong> ${new Date().toLocaleString()}
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      const mailOptions = {
        from: this.getFromAddress(),
        to: to,
        replyTo: this.settings?.smtpReplyTo || this.settings?.smtpFromEmail,
        subject: alertSubject,
        html: html,
        priority: 'high'
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('Emergency alert sent:', info.messageId);
      return true;
    } catch (error) {
      console.error('Failed to send emergency alert:', error);
      return false;
    }
  }
}