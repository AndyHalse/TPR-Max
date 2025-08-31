import nodemailer from 'nodemailer';
import type { RoomBooking, MeetingRoom, Staff } from '@shared/schema';

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

  async sendEmail(options: EmailOptions & { attachments?: any[] }): Promise<boolean> {
    try {
      const mailOptions = {
        from: process.env.SMTP_USER,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        attachments: options.attachments || []
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
  async sendVisitorInvitation(preBooking: any, hostStaff: Staff, meetingRoom?: any): Promise<boolean> {
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
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">🎯 You're Invited to Visit</h1>
        </div>
        
        <div style="padding: 30px; background: #f8f9fa; border-left: 4px solid #10b981;">
          <h2 style="color: #333; margin-top: 0;">Welcome ${preBooking.visitorFirstName}!</h2>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #10b981; margin-top: 0;">📍 Visit Details</h3>
            <p><strong>Date & Time:</strong> ${visitDateTime}</p>
            <p><strong>Purpose:</strong> ${preBooking.purpose || 'Business meeting'}</p>
            <p><strong>Your Host:</strong> ${hostStaff.firstName} ${hostStaff.lastName}</p>
            <p><strong>Host Email:</strong> ${hostStaff.email}</p>
            ${preBooking.company ? `<p><strong>Visiting Company:</strong> ${preBooking.company}</p>` : ''}
            
            ${meetingRoom ? `
              <div style="background: #e6fffa; padding: 15px; border-radius: 6px; margin-top: 15px; border-left: 4px solid #10b981;">
                <h4 style="color: #047857; margin: 0 0 10px 0;">🏢 Meeting Room</h4>
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
            
            <div style="background: #fef3c7; padding: 15px; border-radius: 6px; margin-top: 15px; border-left: 4px solid #f59e0b;">
              <h4 style="color: #92400e; margin: 0 0 10px 0;">📋 Important Information</h4>
              <p style="margin: 5px 0;">• Please bring a valid photo ID for security</p>
              <p style="margin: 5px 0;">• Arrive 5-10 minutes early for check-in</p>
              <p style="margin: 5px 0;">• Your QR code: <strong>${preBooking.qrCode}</strong></p>
              <p style="margin: 5px 0;">• Show this email at reception for quick check-in</p>
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