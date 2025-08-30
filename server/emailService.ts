import nodemailer from 'nodemailer';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

class EmailService {
  private transporter;

  constructor() {
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

  async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      const mailOptions = {
        from: process.env.SMTP_USER,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`Email sent successfully to ${options.to}`);
      return true;
    } catch (error) {
      console.error('Failed to send email:', error);
      return false;
    }
  }

  async sendReport(report: any, settings: any, recipients: string[], reportData: any): Promise<boolean> {
    try {
      const companyName = settings?.companyName || 'VisiGate Pro';
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
      console.error('Failed to send report email:', error);
      return false;
    }
  }

  async sendTestEmail(email: string): Promise<boolean> {
    try {
      const testEmailOptions = {
        to: email,
        subject: 'VisiGate Pro - Test Email',
        html: '<h2>Test Email Successful</h2><p>This is a test email from VisiGate Pro system. Your email configuration is working correctly.</p>',
        text: 'Test Email Successful\n\nThis is a test email from VisiGate Pro system. Your email configuration is working correctly.'
      };

      return await this.sendEmail(testEmailOptions);
    } catch (error) {
      console.error('Failed to send test email:', error);
      return false;
    }
  }

  public generateReportHTML(report: any, reportData: any, companyName: string): string {
    const { visitors, staff, checkedOutVisitors } = reportData;
    const fromDate = new Date(report.dateFrom).toLocaleDateString();
    const toDate = new Date(report.dateTo).toLocaleDateString();

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${report.reportType} Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
            .header { border-bottom: 2px solid #007bff; padding-bottom: 20px; margin-bottom: 20px; }
            .company-name { color: #007bff; font-size: 24px; font-weight: bold; }
            .report-title { color: #333; font-size: 20px; margin: 10px 0; }
            .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
            .stat-card { background: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #007bff; }
            .stat-number { font-size: 24px; font-weight: bold; color: #007bff; }
            .stat-label { color: #666; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background-color: #f8f9fa; font-weight: bold; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="company-name">${companyName}</div>
            <div class="report-title">${report.reportType} Report</div>
            <p>Period: ${fromDate} to ${toDate}</p>
            <p>Generated on: ${new Date(report.generatedAt).toLocaleDateString()} at ${new Date(report.generatedAt).toLocaleTimeString()}</p>
          </div>

          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-number">${visitors.length}</div>
              <div class="stat-label">Total Visitors</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${checkedOutVisitors.length}</div>
              <div class="stat-label">Completed Visits</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${report.avgDuration}</div>
              <div class="stat-label">Average Duration</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${staff.length}</div>
              <div class="stat-label">Total Staff</div>
            </div>
          </div>

          ${visitors.length > 0 ? `
          <h3>Visitor Details</h3>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Company</th>
                <th>Host</th>
                <th>Check-in Time</th>
                <th>Check-out Time</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              ${visitors.map(visitor => {
                const duration = visitor.checkedOutAt 
                  ? Math.round((new Date(visitor.checkedOutAt).getTime() - new Date(visitor.checkedInAt).getTime()) / (1000 * 60)) 
                  : null;
                return `
                  <tr>
                    <td>${visitor.name}</td>
                    <td>${visitor.company || 'N/A'}</td>
                    <td>${visitor.hostName || 'N/A'}</td>
                    <td>${new Date(visitor.checkedInAt).toLocaleString()}</td>
                    <td>${visitor.checkedOutAt ? new Date(visitor.checkedOutAt).toLocaleString() : 'Still on-site'}</td>
                    <td>${duration ? `${duration} min` : 'N/A'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          ` : '<p>No visitors during this period.</p>'}

          <div class="footer">
            <p>This report was automatically generated by ${companyName} VisiGate Pro system.</p>
            <p>For questions about this report, please contact the administrator.</p>
          </div>
        </body>
      </html>
    `;
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
- ${visitor.name} (${visitor.company || 'N/A'})
  Host: ${visitor.hostName || 'N/A'}
  Check-in: ${new Date(visitor.checkedInAt).toLocaleString()}
  Check-out: ${visitor.checkedOutAt ? new Date(visitor.checkedOutAt).toLocaleString() : 'Still on-site'}
  Duration: ${duration ? `${duration} min` : 'N/A'}
  `;
}).join('')}
` : 'No visitors during this period.'}

---
This report was automatically generated by ${companyName} VisiGate Pro system.
For questions about this report, please contact the administrator.
    `;
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
    console.error('Failed to send email:', error);
    return false;
  }
}