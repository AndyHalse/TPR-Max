import nodemailer from 'nodemailer';
import type { RoomBooking, MeetingRoom, Staff, Visitor, CompanySettings } from '@shared/schema';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
  companyName?: string;
}

class EmailService {
  private transporter;

  // Helper function to convert HTML to plain text
  private generatePlainTextFromHtml(html: string): string {
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

  async sendEmail(options: EmailOptions & { attachments?: any[] }): Promise<boolean> {
    try {
      // Get company name from options if available
      const companyName = options.companyName || 'VisiGate Pro';
      
      // Use a simpler from format to avoid spam filters
      const fromAddress = process.env.SMTP_USER || 'noreply@visigate.pro';
      const domain = fromAddress.split('@')[1] || 'visigate.pro';
      
      const mailOptions = {
        from: `${companyName} <${fromAddress}>`, // Include company name
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || this.generatePlainTextFromHtml(options.html), // Always provide text version
        attachments: options.attachments || [],
        headers: {
          // Essential headers for deliverability
          'X-Mailer': 'VisiGate Pro Visitor Management System',
          'Message-ID': `<${Date.now()}.${Math.random().toString(36).substring(2)}@${domain}>`,
          'Date': new Date().toUTCString(),
          'X-Priority': '3',
          'Importance': 'normal',
          'List-Unsubscribe': `<mailto:${fromAddress}?subject=Unsubscribe>`,
          'X-Entity-Ref-ID': Math.random().toString(36).substring(2),
          'MIME-Version': '1.0',
          'Content-Type': 'multipart/alternative',
          'X-Auto-Response-Suppress': 'OOF, AutoReply',
          'Precedence': 'bulk',
          'X-SES-CONFIGURATION-SET': 'visigate-transactional'
        },
        replyTo: process.env.SMTP_REPLY_TO || process.env.SMTP_USER
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
                    <td>${visitor.firstName} ${visitor.lastName}</td>
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
- ${visitor.firstName} ${visitor.lastName} (${visitor.company || 'N/A'})
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

  // Generate iCal calendar file for meeting invitations
  private generateICalFile(booking: RoomBooking, room: MeetingRoom, organizer: Staff): string {
    const formatICalDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const startDate = new Date(booking.startDateTime);
    const endDate = new Date(booking.endDateTime);
    const now = new Date();

    // Generate unique UID for the event
    const uid = `${booking.id}@visigate-pro.com`;

    const icalContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//VisiGate Pro//Meeting Room Booking//EN',
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
  async sendBookingConfirmation(booking: RoomBooking, room: MeetingRoom, organizer: Staff, staffAttendees: Staff[] = [], externalAttendeeEmails: string[] = []): Promise<boolean> {
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
    const endTime = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/London'
    }).format(new Date(booking.endDateTime));

    const subject = `Meeting Room Confirmed: ${booking.title}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">📅 Meeting Room Confirmed</h1>
        </div>
        
        <div style="padding: 30px; background: #f8f9fa; border-left: 4px solid #667eea;">
          <h2 style="color: #333; margin-top: 0;">${booking.title}</h2>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #667eea; margin-top: 0;">📍 Meeting Details</h3>
            <p><strong>Room:</strong> ${room.name} (${room.location})</p>
            <p><strong>Date & Time:</strong> ${startTime} - ${endTime}</p>
            <p><strong>Expected Attendees:</strong> ${booking.expectedAttendees} people</p>
            <p><strong>Organizer:</strong> ${organizer.firstName} ${organizer.lastName}</p>
            
            ${booking.description ? `<p><strong>Description:</strong> ${booking.description}</p>` : ''}
            
            <div style="background: #e3f2fd; padding: 15px; border-radius: 6px; margin-top: 15px;">
              <h4 style="color: #1976d2; margin: 0 0 10px 0;">🏢 Room Facilities</h4>
              <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                ${room.hasProjector ? '<span style="background: #4caf50; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">📽️ Projector</span>' : ''}
                ${room.hasVideoConference ? '<span style="background: #2196f3; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">📹 Video Conference</span>' : ''}
                ${room.hasWhiteboard ? '<span style="background: #ff9800; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">📝 Whiteboard</span>' : ''}
                ${room.hasTV ? '<span style="background: #9c27b0; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">📺 TV</span>' : ''}
                ${room.hasAirCon ? '<span style="background: #00bcd4; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">❄️ Air Con</span>' : ''}
                <span style="background: #607d8b; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">👥 ${room.capacity} capacity</span>
              </div>
            </div>

            ${booking.requiresCatering ? `
              <div style="background: #fff3e0; padding: 15px; border-radius: 6px; margin-top: 15px; border-left: 4px solid #ff9800;">
                <h4 style="color: #f57c00; margin: 0 0 10px 0;">🍽️ Catering Required</h4>
                <p style="margin: 0;">${booking.cateringNotes || 'Standard refreshments requested'}</p>
              </div>
            ` : ''}

            ${booking.specialRequirements ? `
              <div style="background: #f3e5f5; padding: 15px; border-radius: 6px; margin-top: 15px; border-left: 4px solid #9c27b0;">
                <h4 style="color: #7b1fa2; margin: 0 0 10px 0;">📋 Special Requirements</h4>
                <p style="margin: 0;">${booking.specialRequirements}</p>
              </div>
            ` : ''}
          </div>

          <div style="text-align: center; margin-top: 30px;">
            <p style="color: #666; font-size: 14px;">
              📧 This confirmation was sent automatically by VisiGate Pro<br>
              Need to make changes? Contact your building administrator
            </p>
          </div>
        </div>
      </div>
    `;

    const text = `Meeting Room Confirmed: ${booking.title}\n\nRoom: ${room.name} (${room.location})\nDate & Time: ${startTime} - ${endTime}\nOrganizer: ${organizer.firstName} ${organizer.lastName}\nExpected Attendees: ${booking.expectedAttendees} people\n\n${booking.description ? `Description: ${booking.description}\n\n` : ''}📅 A calendar invitation is attached to this email. You can add this meeting to your Outlook, Mac Calendar, or any other calendar app.\n\nThis confirmation was sent automatically by VisiGate Pro.`;

    // Generate calendar file
    const icalContent = this.generateICalFile(booking, room, organizer);
    const calendarAttachment = {
      filename: `meeting-${booking.id}.ics`,
      content: icalContent,
      contentType: 'text/calendar; charset=utf-8; method=REQUEST'
    };

    // Gather all email addresses
    const allEmails = [
      organizer.email,
      ...staffAttendees.map(staff => staff.email),
      ...externalAttendeeEmails
    ].filter(Boolean);

    // Send to all attendees with calendar attachment
    let success = true;
    for (const email of allEmails) {
      const emailSuccess = await this.sendEmail({ 
        to: email, 
        subject, 
        html, 
        text, 
        attachments: [calendarAttachment] 
      });
      if (!emailSuccess) success = false;
    }

    return success;
  }

  // Generate iCal cancellation file for meeting cancellations
  private generateICalCancellation(booking: RoomBooking, room: MeetingRoom, organizer: Staff): string {
    const formatICalDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const startDate = new Date(booking.startDateTime);
    const endDate = new Date(booking.endDateTime);
    const now = new Date();

    // Use same UID as original event for proper cancellation
    const uid = `${booking.id}@visigate-pro.com`;

    const icalContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//VisiGate Pro//Meeting Room Booking//EN',
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
              📧 This cancellation notice was sent automatically by VisiGate Pro
            </p>
          </div>
        </div>
      </div>
    `;

    const text = `Meeting Room Cancelled: ${booking.title}\n\nThis meeting has been cancelled.\nRoom: ${room.name} (${room.location})\nOriginal Time: ${startTime}\nCancelled by: ${organizer.firstName} ${organizer.lastName}\n\n📅 A calendar cancellation is attached to remove this meeting from your calendar.\n\nThis cancellation notice was sent automatically by VisiGate Pro.`;

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
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb;">
        <div style="background: linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}dd 100%); color: white; padding: 30px; text-align: center;">
          ${logoBase64 ? `
            <div style="margin-bottom: 20px;">
              <img src="${logoBase64}" alt="${companySettings?.companyName || 'Company'} Logo" style="max-height: 60px; max-width: 200px;">
            </div>
          ` : ''}
          <h1 style="margin: 0; font-size: 24px;">🎯 You're Invited to Visit</h1>
          ${companySettings?.companyName ? `<p style="margin: 10px 0 0 0; opacity: 0.95;">${companySettings.companyName}</p>` : ''}
        </div>
        
        <div style="padding: 30px; background: #f8f9fa;">
          <h2 style="color: #333; margin-top: 0;">Welcome ${preBooking.visitorFirstName}!</h2>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: ${primaryColor}; margin-top: 0;">📍 Visit Details</h3>
            <p><strong>Date & Time:</strong> ${visitDateTime}</p>
            <p><strong>Purpose:</strong> ${preBooking.purpose || 'Business meeting'}</p>
            <p><strong>Your Host:</strong> ${hostStaff.firstName} ${hostStaff.lastName}</p>
            <p><strong>Host Email:</strong> ${hostStaff.email}</p>
            ${preBooking.company ? `<p><strong>Visiting Company:</strong> ${preBooking.company}</p>` : ''}
            
            ${meetingRoom ? `
              <div style="background: #f0f9ff; padding: 15px; border-radius: 6px; margin-top: 15px; border-left: 4px solid ${primaryColor};">
                <h4 style="color: #1e293b; margin: 0 0 10px 0;">🏢 Meeting Room</h4>
                <p style="margin: 5px 0;"><strong>Room:</strong> ${meetingRoom.name}</p>
                <p style="margin: 5px 0;"><strong>Location:</strong> ${meetingRoom.location}</p>
                <p style="margin: 5px 0;"><strong>Capacity:</strong> ${meetingRoom.capacity} people</p>
                
                <div style="margin-top: 10px;">
                  <strong>Facilities:</strong>
                  <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 5px;">
                    ${meetingRoom.hasProjector ? '<span style="background: #4caf50; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px;">📽️ Projector</span>' : ''}
                    ${meetingRoom.hasVideoConference ? '<span style="background: #2196f3; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px;">📹 Video Call</span>' : ''}
                    ${meetingRoom.hasWhiteboard ? '<span style="background: #ff9800; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px;">📝 Whiteboard</span>' : ''}
                    ${meetingRoom.hasTV ? '<span style="background: #9c27b0; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px;">📺 TV</span>' : ''}
                    ${meetingRoom.hasAirCon ? '<span style="background: #00bcd4; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px;">❄️ Air Con</span>' : ''}
                  </div>
                </div>
              </div>
            ` : ''}
            
            <div style="background: #fef3c7; padding: 15px; border-radius: 6px; margin-top: 15px;">
              <h4 style="color: #92400e; margin: 0 0 10px 0;">📋 Important Information</h4>
              <p style="margin: 5px 0;">• Please bring a valid photo ID for security</p>
              <p style="margin: 5px 0;">• Arrive 5-10 minutes early for check-in</p>
              <p style="margin: 5px 0;">• Your QR code: <strong>PRE-${preBooking.qrCode}</strong></p>
              <p style="margin: 5px 0;">• Show this email at reception for quick check-in</p>
              
              <div style="text-align: center; margin-top: 15px; padding: 20px; background: white; border-radius: 8px;">
                <img src="${qrCodeUrl}" alt="QR Code for Check-in" style="width: 200px; height: 200px;">
                <p style="margin-top: 10px; font-size: 12px; color: #666;">Scan this QR code at reception for express check-in</p>
              </div>
            </div>
          </div>

          <div style="text-align: center; margin-top: 30px;">
            <p style="color: #666; font-size: 14px;">
              📧 This invitation was sent automatically by VisiGate Pro<br>
              Questions? Contact your host: ${hostStaff.email}
            </p>
          </div>
        </div>
      </div>
    `;

    const text = `You're Invited to Visit\n\nHello ${preBooking.visitorFirstName},\n\nYou have been invited for a visit:\n\nDate & Time: ${visitDateTime}\nPurpose: ${preBooking.purpose || 'Business meeting'}\nYour Host: ${hostStaff.firstName} ${hostStaff.lastName}\nHost Email: ${hostStaff.email}\n\n${meetingRoom ? `Meeting Room: ${meetingRoom.name}\nLocation: ${meetingRoom.location}\nCapacity: ${meetingRoom.capacity} people\n\n` : ''}Important Information:\n• Please bring a valid photo ID for security\n• Arrive 5-10 minutes early for check-in\n• Your QR code: ${preBooking.qrCode}\n• Show this email at reception for quick check-in\n\nQuestions? Contact your host: ${hostStaff.email}\n\nThis invitation was sent automatically by VisiGate Pro.`;

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
    musterPoints: string[],
    companySettings: CompanySettings
  ): Promise<boolean> {
    const subject = '🚨 EMERGENCY EVACUATION - IMMEDIATE ACTION REQUIRED';
    const primaryColor = companySettings?.accentColor || '#dc2626';
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 3px solid ${primaryColor};">
        <div style="background: ${primaryColor}; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 28px;">🚨 EMERGENCY EVACUATION 🚨</h1>
        </div>
        
        <div style="padding: 20px; background: #fee2e2;">
          <h2 style="color: #991b1b; margin-top: 0;">Dear ${recipientName},</h2>
          
          <div style="background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid ${primaryColor};">
            <p style="font-size: 18px; font-weight: bold; color: #991b1b; margin: 0;">
              ${message}
            </p>
          </div>
          
          <div style="background: white; padding: 15px; border-radius: 8px; margin: 15px 0;">
            <h3 style="color: #991b1b; margin-top: 0;">📍 Muster Points:</h3>
            <ul style="font-size: 16px;">
              ${musterPoints.map(point => `<li><strong>${point}</strong></li>`).join('')}
            </ul>
          </div>
          
          <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 15px 0;">
            <h3 style="color: #92400e; margin-top: 0;">⚠️ Important Instructions:</h3>
            <ul style="margin: 0;">
              <li>Leave the building immediately via the nearest exit</li>
              <li>Do NOT use elevators</li>
              <li>Do NOT collect personal belongings</li>
              <li>Report to your designated muster point</li>
              <li>Remain at the muster point until given the all-clear</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin-top: 20px;">
            <p style="color: #666; font-size: 14px;">
              ${companySettings.companyName}<br>
              Emergency Contact: ${companySettings.phoneNumber || '999'}
            </p>
          </div>
        </div>
      </div>
    `;
    
    const text = `EMERGENCY EVACUATION - IMMEDIATE ACTION REQUIRED

Dear ${recipientName},

${message}

Muster Points:
${musterPoints.map(point => `- ${point}`).join('\n')}

Important Instructions:
- Leave the building immediately via the nearest exit
- Do NOT use elevators
- Do NOT collect personal belongings
- Report to your designated muster point
- Remain at the muster point until given the all-clear

${companySettings.companyName}
Emergency Contact: ${companySettings.phoneNumber || '999'}`;
    
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
          
          <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 15px 0;">
            <h3 style="color: #92400e; margin-top: 0;">📍 Active Muster Points:</h3>
            <ul style="margin: 10px 0;">
              ${evacuationData.musterPoints.map(point => `<li style="padding: 3px 0;">${point}</li>`).join('')}
            </ul>
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

Active Muster Points:
${evacuationData.musterPoints.map(point => `- ${point}`).join('\n')}

The Fire Marshal panel provides real-time updates and allows you to mark people as safe at specific muster points.

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

      // Try to fetch the logo from internal storage and convert to base64
      // The logoUrl is stored as /uploads/... but needs to be accessed as /objects/uploads/...
      const logoPath = settings.logoUrl.startsWith('/objects') 
        ? settings.logoUrl 
        : `/objects${settings.logoUrl}`;
      const logoUrl = `http://localhost:5000${logoPath}`;
      
      console.log('Fetching logo from:', logoUrl);
      
      const response = await fetch(logoUrl);
      if (!response.ok) {
        console.log('Failed to fetch logo:', response.status);
        return null;
      }

      // Convert to buffer then to base64
      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      const contentType = response.headers.get('content-type') || 'image/png';
      
      // Return as data URL for embedding in email
      return `data:${contentType};base64,${base64}`;
    } catch (error) {
      console.error('Error converting logo to base64:', error);
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
      const companyName = settings?.companyName || 'VisiGate Pro';
      const validUntil = visitor.expectedDepartureTime ? 
        new Date(visitor.expectedDepartureTime).toLocaleString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Europe/London'
        }) : 'End of day';
      
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(visitor.qrCode || visitor.id)}`;
      const baseUrl = ePassUrl ? ePassUrl.replace(/\/epass\/.*$/, '') : (process.env.PUBLIC_URL || 'https://visigate.pro');
      const passUrl = ePassUrl || `${baseUrl}/epass/${visitor.id}`;
      
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
                        
                        <!-- Action Buttons -->
                        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin: 25px 0;">
                          <tr>
                            <td align="center">
                              <a href="${passUrl}" class="mobile-button" 
                                 style="display: inline-block; padding: 14px 35px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25); text-align: center;">
                                📱 View Digital Pass
                              </a>
                              <p style="margin: 12px 0 0 0; color: ${variableTextColor}; font-size: 13px;">
                                Can't see the button? Open: <a href="${passUrl}" style="color: ${primaryColor}; word-break: break-all;">${passUrl}</a>
                              </p>
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
                                    <a href="${baseUrl}/api/visitors/${visitor.id}/accept-hs-rules?token=${visitor.hsRulesAcceptanceToken}" 
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
                          Powered by VisiGate Pro Visitor Management System
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

View your digital pass: ${passUrl}

Important:
- Please check out when leaving the building
- Keep this pass accessible on your phone
${settings?.geofencingEnabled ? '- Auto check-out enabled when you leave the premises' : ''}
${settings?.hsRulesEnabled && (settings?.hsRulesUrl || settings?.hsRulesContent) ? `\n- Health & Safety Rules: ${settings.hsRulesUrl || `${process.env.PUBLIC_URL || 'https://visigate.pro'}/hs-rules`}` : ''}

Powered by VisiGate Pro`;

      return await this.sendEmail({
        to: visitor.email || '',
        subject,
        html,
        text,
        companyName
      });
    } catch (error) {
      console.error('Failed to send e-Pass:', error);
      return false;
    }
  }

  // Send check-out reminder to visitor
  async sendCheckoutReminder(visitor: Visitor, settings: CompanySettings): Promise<boolean> {
    const companyName = settings?.companyName || 'VisiGate Pro';
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
    const companyName = settings?.companyName || 'VisiGate Pro';
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
    hostName?: string
  ): Promise<boolean> {
    try {
      const companyName = companySettings?.companyName || 'VisiGate Pro';
      
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
      
      // Debug logging for H&S acceptance URL
      const hsAcceptanceUrl = workerId ? `${process.env.APP_URL || 'http://localhost:5000'}/api/contractors/workers/${workerId}/accept-hs-rules` : passUrl;
      console.log(`🔗 DEBUG: Contractor H&S acceptance URL: ${hsAcceptanceUrl}`);
      console.log(`🔗 DEBUG: APP_URL env var: ${process.env.APP_URL}`);
      console.log(`🔗 DEBUG: workerId: ${workerId}`);
      
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
                        
                        <!-- Health & Safety Section -->
                        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                          <tr>
                            <td style="background: #fff3e0; border: 1px solid #ffcc02; border-radius: 10px; padding: 18px;">
                              <h3 style="margin: 0 0 12px 0; color: #e65100; font-size: 17px; font-weight: 600;">
                                ✓ Health & Safety Rules - Action Required
                              </h3>
                              <div style="background: white; padding: 15px; border-radius: 8px; margin: 12px 0;">
                                <p style="margin: 0 0 10px 0; color: ${textColor}; font-size: 14px; font-weight: 600;">
                                  # Health & Safety Rules and Regulations
                                </p>
                                <p style="margin: 0 0 8px 0; color: ${textColor}; font-size: 14px; font-weight: 600;">
                                  ## General Safety Rules
                                </p>
                                <p style="margin: 0 0 5px 0; color: ${variableTextColor}; font-size: 14px;">
                                  1. <strong>Personal Safety</strong>
                                </p>
                                <p style="margin: 0 0 3px 0; color: ${variableTextColor}; font-size: 14px;">
                                  - Report to reception upon arrival and departure
                                </p>
                                <p style="margin: 0 0 3px 0; color: ${variableTextColor}; font-size: 14px;">
                                  - Wear your visitor/contractor pass at all times
                                </p>
                                <p style="margin: 0 0 3px 0; color: ${variableTextColor}; font-size: 14px;">
                                  - Follow all posted safety signs and instructions
                                </p>
                                <p style="margin: 0 0 8px 0; color: ${variableTextColor}; font-size: 14px;">
                                  - Report any accidents or near misses immediately
                                </p>
                                <p style="margin: 0 0 5px 0; color: ${variableTextColor}; font-size: 14px;">
                                  2. <strong>Emergency Procedures</strong>
                                </p>
                                <p style="margin: 0 0 3px 0; color: ${variableTextColor}; font-size: 14px;">
                                  - Familiarize yourself with emergency exits
                                </p>
                              </div>
                              <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin: 15px 0;">
                                <tr>
                                  <td align="center">
                                    <a href="${hsAcceptanceUrl}" 
                                       style="display: inline-block; padding: 12px 30px; background: #d32f2f; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
                                      ✓ I Accept Health & Safety Rules
                                    </a>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                        
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
                                <span style="color: #9ca3af; font-size: 12px;">This email was sent automatically by VisiGate Pro</span>
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
This email was sent automatically by VisiGate Pro`;

      return await this.sendEmail({ 
        to: email, 
        subject, 
        html, 
        text,
        companyName
      });
    } catch (error) {
      console.error('Failed to send contractor e-pass:', error);
      return false;
    }
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