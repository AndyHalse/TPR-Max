import nodemailer from 'nodemailer';
import type { Report, CompanySettings } from '@shared/schema';

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
}

export const emailService = new EmailService();