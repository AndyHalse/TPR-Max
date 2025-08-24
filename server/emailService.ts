import nodemailer from 'nodemailer';
import type { Report, CompanySettings, PreBooking, Staff, User } from '@shared/schema';

// SMTP configuration for IONOS
const SMTP_CONFIG = {
  host: 'smtp.ionos.co.uk',
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: 'update@acsltd.eu',
    pass: 'OliveTree2025&&'
  },
  tls: {
    rejectUnauthorized: false
  }
};

export class EmailService {
  private transporter;

  constructor() {
    this.transporter = nodemailer.createTransport(SMTP_CONFIG);
  }

  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error('Email service connection failed:', error);
      return false;
    }
  }

  async sendReport(
    report: Report, 
    companySettings: CompanySettings,
    recipients: string[],
    reportData: any
  ): Promise<boolean> {
    try {
      const subject = `${companySettings.companyName} - ${report.reportType.toUpperCase()} Visitor Report`;
      
      const html = this.generateReportHTML(report, companySettings, reportData);

      const mailOptions = {
        from: `"${companySettings.companyName} VisiGate Pro" <update@acsltd.eu>`,
        to: recipients.join(', '),
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
      const mailOptions = {
        from: '"VisiGate Pro Test" <update@acsltd.eu>',
        to: recipient,
        subject: 'VisiGate Pro - Test Email Configuration',
        html: `
          <h2>Email Configuration Test</h2>
          <p>This is a test email to verify your VisiGate Pro email configuration is working correctly.</p>
          <p>If you received this email, your email settings are configured properly!</p>
          <hr>
          <p><small>Sent from VisiGate Pro Visitor Management System</small></p>
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
        from: `"${companySettings.companyName} VisiGate Pro" <update@acsltd.eu>`,
        to: preBooking.visitorEmail,
        subject: `${companySettings.companyName} - Visit Confirmation for ${visitDate.split(',')[0]}`,
        html: visitorHtml,
      };

      // Send to host
      const hostMailOptions = {
        from: `"${companySettings.companyName} VisiGate Pro" <update@acsltd.eu>`,
        to: `${hostStaff.employeeId}@${companySettings.companyName.toLowerCase().replace(/\s+/g, '')}.com`, // Placeholder email
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
            <p><strong>Host:</strong> ${hostStaff.name} (${hostStaff.department})</p>
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
          <h2>Dear ${hostStaff.name},</h2>
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

  async sendUserInvitation(
    email: string,
    role: string,
    token: string,
    invitedBy: User,
    companySettings: CompanySettings
  ): Promise<boolean> {
    try {
      const inviteUrl = `${process.env.BASE_URL || 'https://localhost:5000'}/invite/accept?token=${token}`;
      
      const html = this.generateInvitationHTML(email, role, inviteUrl, invitedBy, companySettings);
      
      const mailOptions = {
        from: `"${companySettings.companyName} VisiGate Pro" <update@acsltd.eu>`,
        to: email,
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

  // Send emergency alert to all on-site personnel
  async sendEmergencyAlert(to: string, subject: string, message: string): Promise<boolean> {
    try {
      const alertSubject = `🚨 EMERGENCY ALERT - ${subject}`;
      const html = `
        <div style="background-color: #dc2626; color: white; text-align: center; padding: 20px; margin-bottom: 20px;">
          <h1 style="margin: 0; font-size: 24px;">🚨 EMERGENCY ALERT 🚨</h1>
        </div>
        <div style="background-color: #fee2e2; border: 2px solid #dc2626; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h2 style="color: #dc2626; margin-top: 0;">${subject}</h2>
          <div style="font-size: 16px; line-height: 1.6; margin: 15px 0;">
            ${message.replace(/\n/g, '<br>')}
          </div>
          <hr style="border: 1px solid #dc2626; margin: 20px 0;">
          <p style="color: #7f1d1d; font-weight: bold;">
            <strong>Time:</strong> ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}
          </p>
          <p style="color: #7f1d1d; font-size: 14px;">
            This is an automated emergency alert from VisiGate Pro. Please follow your company's emergency procedures immediately.
          </p>
        </div>
      `;

      // Use the existing email sending method that should be somewhere in this class
      if (!this.transporter) {
        console.log('No email transporter configured, skipping emergency alert send');
        return false;
      }

      const mailOptions = {
        from: `"VisiGate Pro Emergency" <update@acsltd.eu>`,
        to: to,
        subject: alertSubject,
        html: html
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('Emergency alert sent successfully:', result.messageId);
      return true;
    } catch (error) {
      console.error("Failed to send emergency alert:", error);
      return false;
    }
  }
}

export const emailService = new EmailService();