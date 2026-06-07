import type { Express } from 'express';
import { logger } from '../utils/logger';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { databaseService } from '../databaseService';
import { stripeService } from '../stripeService';
import { emailService } from '../emailService';
import { customerOnboardingService } from '../customerOnboardingService';
import {
  inductionQuestions,
  customerOnboardingRequestSchema,
  customerOnboardingResponseSchema,
  customerOnboardingErrorSchema,
  type CustomerOnboardingRequest,
  type CustomerOnboardingResponse,
  type CustomerOnboardingError,
} from '@shared/schema';
import * as sharedSchema from '@shared/schema';

export function registerOnboardingRoutes(app: Express): void {
  // Public Induction Preview Routes (no auth required) - DEV ONLY
  if (process.env.NODE_ENV === 'development') {
  app.get('/preview/induction/settings', async (req, res) => {
    try {
      // Use development customer context for public preview
      const context = databaseService.createDevelopmentContext();
      const settings = await databaseService.getInductionSettings(context);
      res.json({ settings });
    } catch (error) {
      logger.error('Error fetching induction settings for preview:', error);
      res.status(500).json({ error: 'Failed to fetch induction settings' });
    }
  });

  app.get('/preview/induction/settings/:roleType', async (req, res) => {
    try {
      const { roleType } = req.params;
      
      // Use development customer context for public preview
      const context = databaseService.createDevelopmentContext();
      const setting = await databaseService.getInductionSettingsByRole(context, roleType);
      
      if (!setting) {
        return res.status(404).json({ error: 'Induction settings not found for this role' });
      }
      
      res.json({ setting });
    } catch (error) {
      logger.error('Error fetching induction setting for preview:', error);
      res.status(500).json({ error: 'Failed to fetch induction setting' });
    }
  });

  // Serve induction preview HTML page — serves the REAL generatedHtml, not a hardcoded template
  app.get('/induction-preview/:roleType', async (req, res) => {
    try {
      const { roleType } = req.params;
      
      // Use the session's customer context if available (user is logged in), else fall back to dev
      const sessionCustomerId = (req.session as any)?.customerId;
      const context = sessionCustomerId
        ? { customerId: sessionCustomerId }
        : databaseService.createDevelopmentContext();
      
      // Look up the actual induction for this role
      const setting = await databaseService.getInductionSettingsByRole(context, roleType);
      const generatedHtml: string | null = (setting as any)?.generatedHtml ?? null;
      
      if (generatedHtml) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        return res.send(generatedHtml);
      }

      // Nothing generated yet — friendly placeholder
      const roleLabel = roleType.charAt(0).toUpperCase() + roleType.slice(1);
      return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${roleLabel} Induction Preview</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;
         background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);
         min-height:100vh;display:flex;align-items:center;justify-content:center;
         color:#fff;text-align:center;padding:20px}
    .card{background:rgba(255,255,255,0.15);backdrop-filter:blur(12px);
          border:1px solid rgba(255,255,255,0.25);border-radius:20px;
          padding:48px 40px;max-width:500px;width:100%}
    .icon{font-size:3.5rem;margin-bottom:20px}
    h1{font-size:2rem;font-weight:700;margin-bottom:12px}
    p{opacity:0.9;line-height:1.7;font-size:1.05rem}
    strong{font-weight:600}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🎬</div>
    <h1>${roleLabel} Induction</h1>
    <p>No induction has been generated for this role yet.<br><br>
       Go to <strong>Induction Settings</strong> and click
       <strong>Generate</strong> to create the ${roleLabel.toLowerCase()} induction.</p>
  </div>
</body>
</html>`);
    } catch (error) {
      logger.error('Error serving induction preview:', error);
      res.status(500).send('Failed to load induction preview.');
    }
  });

  app.get('/preview/induction/questions/:roleType', async (req, res) => {
    try {
      const { roleType } = req.params;
      
      // Use development customer context for public preview
      const context = databaseService.createDevelopmentContext();
      const questions = await databaseService.getInductionQuestions(context, roleType);
      
      res.json({ questions });
    } catch (error) {
      logger.error('Error fetching induction questions for preview:', error);
      res.status(500).json({ error: 'Failed to fetch induction questions' });
    }
  });
  } // end dev-only preview routes

  // Marketing contact endpoint (public, no auth required)
  const marketingContactSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    company: z.string().optional().default(''),
    phone: z.string().optional().default(''),
    email: z.string().email('Please enter a valid email address'),
  });

  app.post('/api/marketing/contact', async (req, res) => {
    try {
      const { name, company, phone, email } = marketingContactSchema.parse(req.body);
      
      const dateStr = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' });

      // Send notification email to sales team
      await emailService.sendEmail({
        to: process.env.SALES_EMAIL || 'info@acsltd.eu',
        subject: `New Demo Enquiry - TPR Max (${name})`,
        html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #2460A9; padding: 20px 24px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 22px;">New Demo Enquiry — TPR Max</h1>
          </div>
          <div style="border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px; padding: 24px;">
            <p style="color: #475569; margin-top: 0;">A new enquiry has been received from the TPR Max marketing page:</p>
            <table style="width: 100%; border-collapse: collapse;">
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 0; color: #64748b; font-size: 14px; width: 140px;"><strong>Name</strong></td>
                <td style="padding: 10px 0; color: #0f172a; font-size: 14px;">${name}</td>
              </tr>
              ${company ? `<tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 10px 0; color: #64748b; font-size: 14px;"><strong>Company</strong></td><td style="padding: 10px 0; color: #0f172a; font-size: 14px;">${company}</td></tr>` : ''}
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 0; color: #64748b; font-size: 14px;"><strong>Email</strong></td>
                <td style="padding: 10px 0; color: #0f172a; font-size: 14px;"><a href="mailto:${email}" style="color: #2460A9;">${email}</a></td>
              </tr>
              ${phone ? `<tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 10px 0; color: #64748b; font-size: 14px;"><strong>Phone</strong></td><td style="padding: 10px 0; color: #0f172a; font-size: 14px;">${phone}</td></tr>` : ''}
              <tr>
                <td style="padding: 10px 0; color: #64748b; font-size: 14px;"><strong>Received</strong></td>
                <td style="padding: 10px 0; color: #0f172a; font-size: 14px;">${dateStr}</td>
              </tr>
            </table>
            <div style="margin-top: 24px; padding: 16px; background: #f8fafc; border-radius: 6px; border-left: 4px solid #2460A9;">
              <p style="margin: 0; color: #475569; font-size: 14px;">Please follow up with this lead as soon as possible.</p>
            </div>
          </div>
        </div>
        `,
        text: `New Demo Enquiry - TPR Max\n\nName: ${name}\nCompany: ${company || 'Not provided'}\nEmail: ${email}\nPhone: ${phone || 'Not provided'}\nReceived: ${dateStr}\n\nPlease follow up as soon as possible.`
      });

      // Also send a confirmation email to the enquirer
      await emailService.sendEmail({
        to: email,
        subject: 'Your TPR Max Demo Enquiry — We\'ll Be in Touch',
        html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #2460A9; padding: 20px 24px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 22px;">Thank you, ${name}!</h1>
          </div>
          <div style="border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px; padding: 24px;">
            <p style="color: #475569;">We've received your enquiry about TPR Max and one of our team will be in touch shortly to arrange a personalised demo.</p>
            <p style="color: #475569;">In the meantime, if you have any questions you can reach us at:</p>
            <ul style="color: #475569;">
              <li><strong>Phone:</strong> +44 1344 771569</li>
              <li><strong>Email:</strong> <a href="mailto:info@acsltd.eu" style="color: #2460A9;">info@acsltd.eu</a></li>
            </ul>
            <p style="color: #64748b; font-size: 13px; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
              ACS Safety &amp; Security Ltd · Wittas House, Two Rivers, Station Lane, Witney, OX28 4BH
            </p>
          </div>
        </div>
        `,
        text: `Thank you ${name}!\n\nWe've received your TPR Max demo enquiry and will be in touch shortly.\n\nACS Safety & Security Ltd\nPhone: +44 1344 771569`
      });

      logger.info(`📧 Marketing enquiry submitted: ${name} <${email}> (${company})`);
      res.status(204).send();
    } catch (error) {
      logger.error('Error processing marketing contact:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: 'Please check your details and try again',
          details: error.errors 
        });
      }
      res.status(500).json({ error: 'Failed to process contact request' });
    }
  });

  // Marketing brochure PDF — 11-page version matching TPR-Max-Brochure-2026 reference
  app.get('/api/marketing/brochure-pdf', async (req, res) => {
    try {
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');

      // ── Colour palette ────────────────────────────────────────────────────
      const navyDark  = rgb(0.063, 0.082, 0.145);
      const navyMid   = rgb(0.118, 0.169, 0.278);
      const accent    = rgb(0.141, 0.376, 0.663);
      const white     = rgb(1, 1, 1);
      const dark      = rgb(0.08,  0.10,  0.18 );
      const muted     = rgb(0.38,  0.43,  0.52 );
      const light     = rgb(0.953, 0.965, 0.980);
      const border    = rgb(0.839, 0.863, 0.894);
      const accentSub = rgb(0.55,  0.65,  0.82 );
      const navyMuted = rgb(0.65,  0.72,  0.82 );

      const pdfDoc = await PDFDocument.create();
      const font   = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const bold   = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      const W = 595.28, H = 841.89, M = 50, CW = W - M * 2;

      // WinAnsi sanitiser — StandardFonts cannot encode chars > 0xFF
      const a = (s: string) => s
        .replace(/[\u2013\u2014]/g, '-')
        .replace(/\u2019/g, "'")
        .replace(/\u2022/g, '*')
        .replace(/\u00b7/g, '|')
        .replace(/[^\x00-\xff]/g, '');

      const wrap = (text: string, maxW: number, sz: number, f: any): string[] => {
        const words = a(text).split(' ');
        const lines: string[] = [];
        let cur = '';
        for (const w of words) {
          const test = cur ? `${cur} ${w}` : w;
          if (f.widthOfTextAtSize(test, sz) <= maxW) { cur = test; }
          else { if (cur) lines.push(cur); cur = w; }
        }
        if (cur) lines.push(cur);
        return lines;
      };

      const drawWrap = (pg: any, text: string, x: number, startY: number, maxW: number, sz: number, f: any, col: any, lh?: number): number => {
        let y = startY;
        const lineH = lh ?? sz * 1.5;
        for (const line of wrap(text, maxW, sz, f)) {
          pg.drawText(line, { x, y, size: sz, font: f, color: col });
          y -= lineH;
        }
        return y;
      };

      const rule = (pg: any, x: number, y: number, w: number, col = border) =>
        pg.drawRectangle({ x, y, width: w, height: 0.5, color: col });

      const fillBox = (pg: any, x: number, y: number, w: number, h: number, bg: any, bdCol?: any, bdW = 0.75) =>
        pg.drawRectangle({ x, y, width: w, height: h, color: bg, ...(bdCol ? { borderColor: bdCol, borderWidth: bdW } : {}) });

      const pageHeader = (pg: any, title: string) => {
        fillBox(pg, 0, H - 60, W, 60, navyDark);
        pg.drawText('ACS SAFETY & SECURITY LTD', { x: M, y: H - 22, size: 7.5, font: bold, color: accentSub });
        pg.drawText(a(title), { x: M, y: H - 44, size: 16, font: bold, color: white });
      };

      const pageFooter = (pg: any, num: number) => {
        rule(pg, M, 34, CW);
        pg.drawText('TPR Max  |  tpr-max.com  |  ACS Safety & Security Ltd  |  www.acsltd.eu', { x: M, y: 20, size: 7, font, color: muted });
        pg.drawText(`PAGE ${num}`, { x: W - M - bold.widthOfTextAtSize(`PAGE ${num}`, 7), y: 20, size: 7, font: bold, color: muted });
      };

      // ── Content-page layout constants (left body + right 2×2 grid) ────────
      const bodyW  = 218;
      const rColX  = M + bodyW + 22;
      const rColW  = CW - bodyW - 22;
      const rCardW = (rColW - 10) / 2;
      const rCardH = 130;
      const rRowGp = 18;

      // Draws subtitle + rule + left body paragraph + right 2×2 feature grid
      const featurePage = (
        pg: any,
        subtitle: string,
        bodyText: string,
        cards: [string, string][],
        pageNum: number,
      ) => {
        let y = H - 76;
        // Subtitle
        pg.drawText(a(subtitle), { x: M, y, size: 12, font: bold, color: dark });
        y -= 22;
        rule(pg, M, y, CW); y -= 22;
        const topY = y;

        // Left body
        drawWrap(pg, bodyText, M, topY, bodyW, 9, font, dark, 13.5);

        // Vertical divider between body and grid
        pg.drawRectangle({ x: M + bodyW + 11, y: topY - rCardH * 2 - rRowGp, width: 0.5, height: rCardH * 2 + rRowGp + 6, color: border });

        // Right 2×2 grid
        cards.forEach(([title, desc], i) => {
          const col = i % 2, row = Math.floor(i / 2);
          const cx = rColX + col * (rCardW + 10);
          const cy = topY - row * (rCardH + rRowGp);
          pg.drawText(a(title), { x: cx, y: cy, size: 8.5, font: bold, color: dark });
          rule(pg, cx, cy - 10, rCardW, border);
          drawWrap(pg, desc, cx, cy - 24, rCardW, 8.5, font, muted, 13);
        });

        // Horizontal divider between grid rows
        rule(pg, rColX, topY - rCardH - rRowGp / 2, rColW, border);

        pageFooter(pg, pageNum);
      };

      // ─────────────────────────────────────────────
      // PAGE 1 — COVER
      // ─────────────────────────────────────────────
      const pg1 = pdfDoc.addPage([W, H]);
      fillBox(pg1, 0, 0, W, H, navyDark);
      fillBox(pg1, 0, H - 5, W, 5, accent);

      pg1.drawText('SAVE',  { x: M, y: H - 118, size: 80, font: bold, color: white });
      pg1.drawText('LIVES', { x: M, y: H - 208, size: 80, font: bold, color: white });
      drawWrap(pg1, "Know exactly who's on site when it matters most", M, H - 248, CW * 0.7, 14, font, rgb(0.72, 0.80, 0.92), 20);

      rule(pg1, M, H - 296, CW * 0.32, navyMid);

      pg1.drawText('PRESENTED TO', { x: M, y: H - 328, size: 7.5, font: bold, color: accentSub });
      pg1.drawText('Stakeholders',  { x: M, y: H - 347, size: 13,  font,       color: white });
      pg1.drawText('PRESENTED BY',  { x: M, y: H - 378, size: 7.5, font: bold, color: accentSub });
      pg1.drawText('Andy Halse',    { x: M, y: H - 397, size: 13,  font,       color: white });

      rule(pg1, M, 152, CW, navyMid);
      pg1.drawText('ACS SAFETY & SECURITY LTD', { x: M, y: 130, size: 9,  font: bold, color: accentSub });
      pg1.drawText('ONE PLATFORM',              { x: M, y: 100, size: 32, font: bold, color: white });
      drawWrap(pg1, 'Fourteen modules. One dashboard. Nothing missed.', M, 75, CW, 10, font, navyMuted, 14);
      fillBox(pg1, 0, 0, W, 5, accent);

      // ─────────────────────────────────────────────
      // PAGE 2 — ONE PLATFORM overview
      // ─────────────────────────────────────────────
      const pg2 = pdfDoc.addPage([W, H]);
      pageHeader(pg2, 'ONE PLATFORM');
      featurePage(
        pg2,
        'Fourteen modules. One dashboard. Nothing missed.',
        "TPR Max brings everything under one roof. Sign in a visitor. Check a contractor's documents before they walk through the gate. Run an emergency evacuation and know who's on site in seconds. Schedule a maintenance job and track it through to completion. No jumping between systems. No gaps in the records. No 'I thought someone else was handling that.' The platform replaces the paper sign-in book, the shared spreadsheet, the laminated induction form, and the fire marshal clipboard. All of them. Every action is logged, timestamped, and auditable.",
        [
          ['VISITOR MANAGEMENT',    'Digital sign-in, photo capture, QR codes, pre-registration, and automatic host notification on arrival.'],
          ['CONTRACTOR COMPLIANCE', 'Inductions, RAMS sign-off, and document expiry tracking enforced before any contractor can check in.'],
          ['EMERGENCY MUSTERING',   'One-click evacuation with live head counts, fire marshal mobile access, and automatic incident reports.'],
          ['PPM & MAINTENANCE',     'Asset register, maintenance schedules, and mobile work orders - all in the same platform.'],
        ],
        2,
      );

      // ─────────────────────────────────────────────
      // PAGE 3 — EMERGENCY MUSTERING
      // ─────────────────────────────────────────────
      const pg3 = pdfDoc.addPage([W, H]);
      pageHeader(pg3, 'EMERGENCY MUSTERING');
      featurePage(
        pg3,
        "Know who's safe. Know who's missing. In real time.",
        "When the alarm goes off, you have one job: account for everyone on site. TPR Max gives you a single screen to do it. One click starts the evacuation. Fire marshals get a static URL they can open on any phone - no login, no fuss. People who left before the alarm can mark themselves safe by email. Each zone has its own muster point with live counts and a list of who's still unaccounted for. When it's over, the incident report is generated automatically.",
        [
          ['ONE-CLICK EVACUATION', 'Every visitor, contractor, and staff member is pulled into the live muster list instantly. No manual list required.'],
          ['FIRE MARSHAL ACCESS',  'A static URL means marshals check and update from their phone without logging in - even mid-emergency.'],
          ['SELF-MARK-SAFE',       "People who left before the alarm mark themselves safe via an email token. Off the missing list immediately."],
          ["MARTYN'S LAW MODULE",  'Terrorism preparedness checklist, lockdown procedures, and Run, Hide, Tell training tracker for venues in scope of the Protect Duty.'],
        ],
        3,
      );

      // ─────────────────────────────────────────────
      // PAGE 4 — CONTRACTOR COMPLIANCE
      // ─────────────────────────────────────────────
      const pg4 = pdfDoc.addPage([W, H]);
      pageHeader(pg4, 'CONTRACTOR COMPLIANCE');
      featurePage(
        pg4,
        "If their paperwork isn't right, they don't get in.",
        "If a contractor gets hurt on your site and they weren't properly inducted, or their insurance had lapsed, that's your problem. TPR Max makes sure it never gets to that point. Before anyone checks in, the system verifies their induction is complete, their documents are in date, and they've signed off the relevant RAMS. If anything's missing, access is blocked. Every step is logged - so the evidence trail is there when you need it.",
        [
          ['CONTRACTOR PROFILES',  'Every company, every worker. Documents stored centrally and flagged automatically before they expire.'],
          ['INDUCTION MANAGEMENT', 'Custom inductions per site. Contractors complete them before they arrive. No induction - no access.'],
          ['RAMS MANAGEMENT',      'Risk Assessment & Method Statement sign-off built into the check-in process. Proof of acceptance logged on every visit.'],
          ['COMPLIANCE TRACKING',  'Certificates, qualifications, insurance, CSCS cards. Expiry dates tracked automatically.'],
        ],
        4,
      );

      // ─────────────────────────────────────────────
      // PAGE 5 — LONE WORKER SAFETY
      // ─────────────────────────────────────────────
      const pg5 = pdfDoc.addPage([W, H]);
      pageHeader(pg5, 'LONE WORKER SAFETY');
      featurePage(
        pg5,
        "Know your people are safe, even when no one's watching.",
        "Some jobs mean working alone. A lone worker who can't be reached - or who hasn't checked in when expected - is a serious safety risk, and a legal one too. TPR Max handles this with a simple token-based check-in system. Workers confirm they're safe at set intervals. If they don't, the right people are notified straight away. No expensive devices. No separate app. Works through the same platform everything else does - nothing new to learn.",
        [
          ['TOKEN CHECK-IN',         "Workers confirm they're safe via a unique link - any phone, no app, no login required."],
          ['CONFIGURABLE INTERVALS', 'Set check-in frequency by role and risk level. High-risk tasks get shorter intervals.'],
          ['AUTOMATIC ALERTS',       "Missed a check-in? The right people are notified immediately. No manual monitoring required."],
          ['FULL AUDIT TRAIL',       'Every check-in and alert is logged. Duty of care evidence is already there if you need it.'],
        ],
        5,
      );

      // ─────────────────────────────────────────────
      // PAGE 6 — VISITOR & STAFF MANAGEMENT
      // ─────────────────────────────────────────────
      const pg6 = pdfDoc.addPage([W, H]);
      pageHeader(pg6, 'VISITOR & STAFF MANAGEMENT');
      featurePage(
        pg6,
        'Check-in, attendance, ID passes - all in one place.',
        "Visitor check-in goes digital: photo capture, digital signature, and automatic host notification. Pre-register guests and they get an email with a QR code - check-in takes seconds when they arrive. Staff attendance is tracked through check-in and check-out, with daily, weekly, and monthly reports as PDF or CSV. If you run Biostar 2 access control, TPR Max syncs with it bi-directionally - badge swipes feed straight into the attendance log.",
        [
          ['VISITOR CHECK-IN',  'Photo, signature, QR code pass. Pre-registration with email invitations. Host notified automatically on arrival.'],
          ['PASS PRINTING',     'Visitor and contractor passes print over your network to a thermal printer. No drivers needed - true SaaS printing.'],
          ['STAFF ATTENDANCE',  'Real-time tracking, detailed reports, CSV export. Bi-directional sync with Biostar 2.'],
          ['TIME & ATTENDANCE', 'Full session logs per staff member. Daily, weekly, and monthly summaries ready for payroll or audit.'],
        ],
        6,
      );

      // ─────────────────────────────────────────────
      // PAGE 7 — PLANNED MAINTENANCE
      // ─────────────────────────────────────────────
      const pg7 = pdfDoc.addPage([W, H]);
      pageHeader(pg7, 'PLANNED MAINTENANCE');
      featurePage(
        pg7,
        'Schedule it, track it, prove it was done.',
        "Reactive maintenance costs more than planned maintenance. Most organisations know that - but still manage their assets on a spreadsheet that nobody updates. TPR Max's PPM module gives you an asset register, maintenance schedules, and work order management in the same platform you use for everything else. Set up your assets, define how often they need servicing, and the system generates work orders automatically when they're due. Engineers complete jobs on mobile, and the compliance record builds itself as they go.",
        [
          ['ASSET REGISTER',        'Every piece of equipment, plant, and infrastructure in one place with full service history.'],
          ['MAINTENANCE SCHEDULES', 'Set frequency rules per asset. Work orders generated automatically when due - no manual chasing.'],
          ['MOBILE WORK ORDERS',    'Engineers complete jobs on any device. Digital sign-off logged against the asset record instantly.'],
          ['COMPLIANCE CHECKLISTS', 'Regulatory references and completion checklists built into every job type. Audit-ready from day one.'],
        ],
        7,
      );

      // ─────────────────────────────────────────────
      // PAGE 8 — BUILT-IN AI
      // ─────────────────────────────────────────────
      const pg8 = pdfDoc.addPage([W, H]);
      pageHeader(pg8, 'BUILT-IN AI');
      featurePage(
        pg8,
        'Your site data, turned into useful information.',
        "TPR Max has AI tools built in - not bolted on as an add-on. They use the data your site already generates to surface insights you'd otherwise have to dig for yourself. The ROI calculator gives you the financial case in your own numbers - useful when getting sign-off from finance or making the case to a board. Business insights flag anomalies and trends in your visitor and contractor data automatically. Flow optimisation shows where your check-in process creates bottlenecks.",
        [
          ['BUSINESS INSIGHTS',    "Pattern recognition across your site data. Flags anomalies and trends without you having to go looking."],
          ['ROI CALCULATOR',       "Shows the financial case for TPR Max in your own numbers - time saved, admin reduced, risk exposure cut."],
          ['FLOW OPTIMISATION',    'Analyses how people move through your site and identifies where the process slows down or breaks.'],
          ['COMPETITIVE ANALYSIS', 'Benchmarks your site safety processes against sector data - useful for board reporting and insurance reviews.'],
        ],
        8,
      );

      // ─────────────────────────────────────────────
      // PAGE 9 — SECURITY & DATA TRUST
      // ─────────────────────────────────────────────
      const pg9 = pdfDoc.addPage([W, H]);
      pageHeader(pg9, 'SECURITY & DATA TRUST');

      const colW9 = (CW - 20) / 2;
      let y9 = H - 80;
      const body9a = "Each customer on TPR Max gets their own isolated database. Your data doesn't sit in a shared table filtered by a customer ID - it's physically separate from everyone else's. That's a genuine enterprise architecture decision, not a marketing claim. GDPR compliance is built in from the ground up. Every customer gets a right-to-be-forgotten tool, full data export, and role-based access that controls exactly who can see what.";
      const body9b = "The platform is ISO 27001 aligned. Security includes CSRF protection, bcrypt password hashing, and encrypted sessions throughout. Full audit trails log every action - who did what, when, and from where. If you're audited, or an incident is investigated, the evidence is already there in a format you can hand over without scrambling. Your data never moves outside your isolated schema. No shared infrastructure, no bleed between customers.";

      let c1y9 = y9, c2y9 = y9;
      for (const l of wrap(body9a, colW9, 9, font)) { pg9.drawText(l, { x: M,             y: c1y9, size: 9, font, color: dark }); c1y9 -= 13.5; }
      for (const l of wrap(body9b, colW9, 9, font)) { pg9.drawText(l, { x: M + colW9 + 20, y: c2y9, size: 9, font, color: dark }); c2y9 -= 13.5; }

      // 4 summary pills
      const pillTopY = Math.min(c1y9, c2y9) - 30;
      rule(pg9, M, pillTopY + 14, CW);
      const pillW = (CW - 12) / 4;
      const pills: [string, string][] = [
        ['Isolated Database',  'Per-customer schema architecture.'],
        ['GDPR Compliant',     'Right to be forgotten, full data export.'],
        ['ISO 27001 Aligned',  'Information security management standards.'],
        ['Full Audit Trails',  'Every action logged, timestamped, searchable.'],
      ];
      pills.forEach(([t, d], i) => {
        const px = M + i * (pillW + 4);
        fillBox(pg9, px, pillTopY - 56, pillW, 60, light, border);
        pg9.drawText(a(t), { x: px + 8, y: pillTopY - 14, size: 8, font: bold, color: dark });
        rule(pg9, px + 8, pillTopY - 22, pillW - 16, border);
        drawWrap(pg9, d, px + 8, pillTopY - 36, pillW - 16, 7.5, font, muted, 11);
      });

      pageFooter(pg9, 9);

      // ─────────────────────────────────────────────
      // PAGE 10 — SECTORS
      // ─────────────────────────────────────────────
      const pg10 = pdfDoc.addPage([W, H]);
      pageHeader(pg10, 'BUILT FOR SITES WHERE SAFETY IS NOT OPTIONAL');

      let y10 = H - 76;
      pg10.drawText('8 sectors that rely on TPR Max every day', { x: M, y: y10, size: 10, font: bold, color: dark });
      y10 -= 20;
      rule(pg10, M, y10, CW); y10 -= 18;
      y10 = drawWrap(pg10, 'TPR Max is for any organisation that has contractors, visitors, or temporary workers on site - and needs to show it managed them properly. Manufacturing, construction, healthcare, education, logistics, local government - if a compliance failure or emergency would put you on the wrong side of a regulator, this is for you.', M, y10, CW, 9.5, font, dark, 14) - 22;

      const sCW = (CW - 20) / 2;
      const sectorRows: [string, string, string, string][] = [
        ['Manufacturing & Industrial', 'High contractor footfall, strict H&S obligations, regular audits.',               'Construction Sites',           'Rotating workforce, RAMS requirements, site induction compliance.'],
        ['Healthcare',                  'Contractor vetting, visitor records, infection control sign-off.',                'Facilities Management',        'Multiple sites, multiple contractors - one place to manage all of it.'],
        ['Logistics & Warehousing',     'Shift-based staff, delivery contractors, emergency procedures.',                  'Education',                    'Safeguarding-compliant visitor management, contractor DBS tracking.'],
        ['Local Government',            'Audit trails, compliance evidence, public duty obligations.',                     'Serviced Offices & Co-Working','Multi-tenant management for shared buildings.'],
      ];
      sectorRows.forEach(([t1, d1, t2, d2], row) => {
        const sy = y10 - row * 96;
        pg10.drawText(a(t1), { x: M,             y: sy, size: 10, font: bold, color: dark });
        rule(pg10, M, sy - 10, sCW, border);
        drawWrap(pg10, d1, M, sy - 24, sCW, 8.5, font, muted, 12);
        pg10.drawText(a(t2), { x: M + sCW + 20, y: sy, size: 10, font: bold, color: dark });
        rule(pg10, M + sCW + 20, sy - 10, sCW, border);
        drawWrap(pg10, d2, M + sCW + 20, sy - 24, sCW, 8.5, font, muted, 12);
      });

      pageFooter(pg10, 10);

      // ─────────────────────────────────────────────
      // PAGE 11 — CTA (dark cover, no pricing)
      // ─────────────────────────────────────────────
      const pg11 = pdfDoc.addPage([W, H]);
      fillBox(pg11, 0, 0, W, H, navyDark);
      fillBox(pg11, 0, H - 5, W, 5, accent);

      pg11.drawText('Free for 14 Days.',  { x: M, y: H - 210, size: 42, font: bold, color: white });
      pg11.drawText('No Card Required.',  { x: M, y: H - 264, size: 42, font: bold, color: white });
      pg11.drawText('Start your trial at tpr-max.com', { x: M, y: H - 310, size: 14, font, color: rgb(0.72, 0.80, 0.92) });

      rule(pg11, M, 230, CW, navyMid);
      const colW11 = CW / 3;
      ([
        ['tpr-max.com',   'Product & Trial'],
        ['www.acsltd.eu', 'Company'],
        ['info@acsltd.eu','Enquiries'],
      ] as [string, string][]).forEach(([url, label], i) => {
        const cx = M + i * colW11;
        pg11.drawText(a(url),   { x: cx, y: 206, size: 10, font: bold, color: white });
        pg11.drawText(a(label), { x: cx, y: 188, size: 8,  font,       color: navyMuted });
      });

      rule(pg11, M, 158, CW, navyMid);
      pg11.drawText('ACS SAFETY & SECURITY LTD', { x: M, y: 136, size: 10, font: bold, color: accentSub });
      fillBox(pg11, 0, 0, W, 5, accent);

      const pdfBytes = await pdfDoc.save();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="TPR-Max-Brochure.pdf"');
      res.setHeader('Content-Length', pdfBytes.length);
      res.send(Buffer.from(pdfBytes));
    } catch (error) {
      logger.error('Error generating marketing brochure PDF:', error);
      res.status(500).json({ error: 'PDF generation failed' });
    }
  });

  // ============================================
  // CUSTOMER ONBOARDING API ENDPOINTS
  // ============================================
  
  // Rate limiting for onboarding endpoint
  const onboardingAttempts = new Map<string, number>();
  const ONBOARDING_RATE_LIMIT = 3; // Max 3 attempts per hour per IP
  const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in milliseconds

  // Signup session storage (temporary, secure server-side only)
  const signupSessions = new Map<string, any>();
  const SIGNUP_SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  // One-time startup: purge all legacy-format induction questions (videoId = roleType)
  // These are the source of the "2112 questions" accumulation bug.
  // New questions are stored with videoId = customerId-roleType, so legacy rows are safe to delete.
  (async () => {
    try {
      const legacyVideoIds = ['visitor', 'staff', 'contractor'];
      let totalDeleted = 0;
      for (const vid of legacyVideoIds) {
        const result = await db
          .delete(inductionQuestions)
          .where(eq(inductionQuestions.videoId, vid));
        const count = (result as any).rowCount ?? (result as any).count ?? 0;
        if (count > 0) {
          totalDeleted += Number(count);
          logger.info(`🧹 Startup cleanup: removed ${count} legacy induction questions (videoId='${vid}')`);
        }
      }
      if (totalDeleted > 0) {
        logger.info(`✅ Legacy induction question cleanup complete — removed ${totalDeleted} stale rows`);
      }
    } catch (cleanupErr) {
      logger.warn('⚠️ Legacy induction question cleanup failed (non-fatal):', cleanupErr);
    }
  })();

  // Clean up expired signup sessions periodically
  setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of signupSessions.entries()) {
      if (now - session.createdAt > SIGNUP_SESSION_TIMEOUT) {
        signupSessions.delete(sessionId);
      }
    }
  }, 5 * 60 * 1000); // Clean every 5 minutes

  /**
   * Create secure signup session (no admin token required)
   * This replaces direct customer provisioning to fix security vulnerability
   */
  app.post('/api/onboarding/create-signup-session', async (req, res) => {
    try {
      // Rate limiting by IP address
      const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
      const currentTime = Date.now();
      const attemptKey = `${clientIp}_${Math.floor(currentTime / RATE_LIMIT_WINDOW)}`;
      
      const attempts = onboardingAttempts.get(attemptKey) || 0;
      if (attempts >= ONBOARDING_RATE_LIMIT) {
        logger.warn(`🚨 Rate limit exceeded for IP: ${clientIp}`);
        return res.status(429).json({
          success: false,
          error: 'Rate limit exceeded. Please try again later.',
          code: 'RATE_LIMIT_EXCEEDED'
        });
      }

      // Validate request body
      const signupData = customerOnboardingRequestSchema.parse(req.body);
      
      // Create secure session ID
      const sessionId = randomUUID();
      
      // Store signup data securely on server
      signupSessions.set(sessionId, {
        ...signupData,
        createdAt: Date.now(),
        ipAddress: clientIp
      });

      // Increment rate limit counter
      onboardingAttempts.set(attemptKey, attempts + 1);

      logger.info(`🔐 Secure signup session created for: ${signupData.companyName}`);
      
      res.status(201).json({
        success: true,
        sessionId,
        message: 'Signup session created successfully'
      });
      
    } catch (error) {
      logger.error('❌ Error creating signup session:', error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request data',
          details: error.errors
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to create signup session'
      });
    }
  });

  /**
   * Create Stripe checkout session (no admin token required, session-based auth)
   */
  app.post('/api/onboarding/create-checkout', async (req, res) => {
    try {
      const { sessionId, successUrl, cancelUrl } = req.body;
      
      if (!sessionId || !successUrl || !cancelUrl) {
        return res.status(400).json({
          success: false,
          error: 'sessionId, successUrl, and cancelUrl are required'
        });
      }

      // Verify session exists
      const signupSession = signupSessions.get(sessionId);
      if (!signupSession) {
        return res.status(404).json({
          success: false,
          error: 'Signup session not found or expired'
        });
      }

      // Check if Stripe is available
      if (!stripeService.isAvailable()) {
        logger.info('⚠️ Stripe not configured - creating development checkout URL');
        
        // For development without Stripe, simulate successful payment
        const devSuccessUrl = successUrl.replace('{CHECKOUT_SESSION_ID}', `dev_${sessionId}`);
        
        return res.json({
          success: true,
          checkoutUrl: devSuccessUrl,
          sessionId: `dev_${sessionId}`,
          message: 'Development mode - redirecting to success URL'
        });
      }

      // Create Stripe customer and checkout session
      const stripeCustomerResponse = await stripeService.createCustomer({
        email: signupSession.contactEmail,
        name: signupSession.companyName,
        companyName: signupSession.companyName,
        customerId: signupSession.customerId || 'temp-id',
        metadata: {
          signupSessionId: sessionId,
          companyName: signupSession.companyName,
          adminEmail: signupSession.adminEmail
        }
      });

      if (!stripeCustomerResponse.success || !stripeCustomerResponse.stripeCustomer) {
        return res.status(500).json({
          success: false,
          error: 'Failed to create Stripe customer'
        });
      }

      // Get Professional Plan (single plan) from database
      const managementDbUrl = process.env.DATABASE_URL;
      if (!managementDbUrl) {
        return res.status(500).json({
          success: false,
          error: 'Database configuration error'
        });
      }

      const { Pool } = await import('@neondatabase/serverless');
      const { drizzle } = await import('drizzle-orm/neon-serverless');
      const { eq } = await import('drizzle-orm');
      const sharedSchema = await import('@shared/schema');

      const managementPool = new Pool({ connectionString: managementDbUrl });
      const db = drizzle({ client: managementPool, schema: sharedSchema });

      try {
        const [plan] = await db
          .select()
          .from(sharedSchema.subscriptionPlans)
          .where(eq(sharedSchema.subscriptionPlans.name, 'professional'))
          .limit(1);

        if (!plan || !plan.stripePriceIdMonthly) {
          logger.error('⚠️ Professional Plan not found or missing Stripe price ID');
          return res.json({
            success: true,
            checkoutUrl: successUrl.replace('{CHECKOUT_SESSION_ID}', `dev_no_plan_${sessionId}`),
            sessionId: `dev_no_plan_${sessionId}`,
            message: 'Development mode - Professional Plan not configured'
          });
        }

        const checkoutSessionResponse = await stripeService.createCheckoutSession({
          customerId: stripeCustomerResponse.stripeCustomer.id,
          priceId: plan.stripePriceIdMonthly,
          billingCycle: 'monthly',
          successUrl,
          cancelUrl,
          metadata: {
            signupSessionId: sessionId,
            companyName: signupSession.companyName
          }
        });

        if (!checkoutSessionResponse.success) {
          return res.status(500).json({
            success: false,
            error: 'Failed to create checkout session'
          });
        }

        logger.info(`💳 Stripe checkout session created for: ${signupSession.companyName}`);
        
        res.json({
          success: true,
          checkoutUrl: checkoutSessionResponse.checkoutUrl,
          sessionId: checkoutSessionResponse.sessionId
        });

      } finally {
        await managementPool.end();
      }
      
    } catch (error) {
      logger.error('❌ Error creating checkout session:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create checkout session'
      });
    }
  });

  /**
   * Handle successful payment and provision customer
   * SECURITY FIX: Changed from GET to POST to prevent CSRF attacks
   */
  app.post('/api/onboarding/success', async (req, res) => {
    try {
      const { session_id } = req.body; // Changed from query to body for POST request
      
      if (!session_id) {
        return res.status(400).json({
          success: false,
          error: 'session_id is required'
        });
      }

      let signupSessionId: string;
      let signupSession: any;

      // Handle development mode
      if (typeof session_id === 'string' && session_id.startsWith('dev_')) {
        signupSessionId = session_id.replace('dev_', '');
        signupSession = signupSessions.get(signupSessionId);
        
        if (!signupSession) {
          return res.status(404).json({
            success: false,
            error: 'Signup session not found or expired'
          });
        }
      } else {
        // SECURITY FIX: Handle both development and production Stripe verification
        if (!stripeService.isAvailable()) {
          return res.status(500).json({
            success: false,
            error: 'Payment verification not available'
          });
        }

        // SECURITY FIX: Better error handling for payment verification
        try {
          const checkoutSession = await stripeService.getCheckoutSession(session_id as string);
          
          if (!checkoutSession) {
            logger.error(`❌ Failed to retrieve checkout session: ${session_id}`);
            return res.status(400).json({
              success: false,
              error: 'Invalid payment session'
            });
          }

          if (checkoutSession.payment_status !== 'paid') {
            logger.error(`❌ Payment not completed for session: ${session_id}, status: ${checkoutSession.payment_status}`);
            return res.status(400).json({
              success: false,
              error: 'Payment not completed'
            });
          }

          signupSessionId = checkoutSession.metadata?.signupSessionId ?? '';
          if (!signupSessionId) {
            logger.error(`❌ No signup session ID in checkout session metadata: ${session_id}`);
            return res.status(400).json({
              success: false,
              error: 'Invalid checkout session - missing signup reference'
            });
          }

          signupSession = signupSessions.get(signupSessionId);
          if (!signupSession) {
            logger.error(`❌ Signup session not found or expired: ${signupSessionId}`);
            return res.status(404).json({
              success: false,
              error: 'Signup session not found or expired'
            });
          }
        } catch (error) {
          logger.error(`❌ Error verifying payment session ${session_id}:`, error);
          return res.status(500).json({
            success: false,
            error: 'Payment verification failed'
          });
        }
      }

      // Now provision the customer
      const provisionResponse = await customerOnboardingService.provisionCustomer(signupSession);
      
      // Clean up signup session
      signupSessions.delete(signupSessionId);

      logger.info(`✅ Customer provisioned after payment: ${provisionResponse.customer.companyName}`);

      // SECURITY FIX: Establish proper authenticated session instead of URL credentials
      // Authenticate the newly created admin user and create secure session
      const { customer, credentials } = provisionResponse;
      const adminUsername = credentials.username;
      const adminPassword = signupSession.adminPassword; // Use original password from signup
      
      logger.info(`🔐 Creating authenticated session for admin: ${adminUsername} at ${customer.companyName}`);
      
      // Authenticate the admin user using the same method as login
      const authResult = await AuthService.authenticateUser(customer.companyName, adminUsername, adminPassword);
      if (!authResult) {
        logger.error(`❌ Failed to authenticate newly created admin user: ${adminUsername}`);
        throw new Error('Failed to authenticate newly created admin user');
      }

      const { user } = authResult;
      logger.info(`✅ Admin user authenticated successfully: ${adminUsername}`);

      // Create secure session (same pattern as /api/auth/login)
      req.session.regenerate((regenerateErr) => {
        if (regenerateErr) {
          logger.error("❌ Session regeneration error during onboarding:", regenerateErr);
          return res.status(500).json({ error: "Failed to create secure session" });
        }
        
        logger.info(`🔄 Session ID regenerated for security during onboarding`);
        
        // Set complete session context for SaaS isolation
        req.session.userId = user.id;
        req.session.customerId = customer.id;
        req.session.companyName = customer.companyName;
        
        logger.info(`📝 Setting onboarding session context:`, {
          userId: user.id,
          customerId: customer.id,
          companyName: customer.companyName,
          username: adminUsername
        });
        
        // Save session and redirect securely
        req.session.save((saveErr) => {
          if (saveErr) {
            logger.error("❌ Session save error during onboarding:", saveErr);
            return res.status(500).json({ error: "Failed to establish session" });
          }
          
          logger.info(`✅ Secure session established for onboarding - redirecting to welcome`);
          
          // Secure redirect to welcome page WITHOUT credentials in URL
          const welcomeUrl = process.env.NODE_ENV === 'production' 
            ? `https://${customer.slug}.tpr-max.com/welcome`
            : `/welcome`;

          res.redirect(welcomeUrl);
        });
      });
      
    } catch (error) {
      logger.error('❌ Error handling payment success:', error);
      
      // Redirect to error page
      const errorUrl = process.env.NODE_ENV === 'production'
        ? '/signup/error'
        : `/signup/error?error=${encodeURIComponent((error as any)?.message || 'Unknown error')}`;
        
      res.redirect(errorUrl);
    }
  });

  // Secured customer provisioning endpoint (auth required)
  app.post('/api/onboarding/provision-customer', async (req, res) => {
    try {
      // Security: Rate limiting by IP address
      const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
      const currentTime = Date.now();
      const attemptKey = `${clientIp}_${Math.floor(currentTime / RATE_LIMIT_WINDOW)}`;
      
      const attempts = onboardingAttempts.get(attemptKey) || 0;
      if (attempts >= ONBOARDING_RATE_LIMIT) {
        logger.warn(`🚨 Rate limit exceeded for IP: ${clientIp}`);
        return res.status(429).json({
          success: false,
          error: 'Rate limit exceeded. Please try again later.',
          code: 'RATE_LIMIT_EXCEEDED'
        } as any);
      }

      // Security: Basic authentication check
      const authHeader = req.headers.authorization;
      const adminToken = process.env.ADMIN_ONBOARDING_TOKEN || 'dev-admin-token';
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.warn(`🚨 Unauthorized onboarding attempt from IP: ${clientIp}`);
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTHENTICATION_REQUIRED'
        } as any);
      }

      const token = authHeader.split(' ')[1];
      if (token !== adminToken) {
        logger.warn(`🚨 Invalid token used for onboarding from IP: ${clientIp}`);
        return res.status(401).json({
          success: false,
          error: 'Invalid authentication token',
          code: 'INVALID_TOKEN'
        } as any);
      }

      // Increment rate limit counter
      onboardingAttempts.set(attemptKey, attempts + 1);

      logger.info(`🚀 AUTHENTICATED ONBOARDING - Customer onboarding request received from ${clientIp}`);
      
      // Validate request body with comprehensive schema
      const onboardingRequest = customerOnboardingRequestSchema.parse(req.body);
      
      // Security: Sanitize company name for logging (remove potential secrets)
      const safeCompanyName = onboardingRequest.companyName.replace(/[^\w\s-]/g, '').trim();
      logger.info(`📋 Validated onboarding request for: ${safeCompanyName}`);
      
      // Provision customer using comprehensive service
      const response = await customerOnboardingService.provisionCustomer(onboardingRequest);
      
      logger.info(`✅ Customer onboarding completed successfully: ${safeCompanyName}`);
      
      // Return success response (sanitize response to prevent credential leakage)
      const sanitizedResponse = {
        ...response,
        credentials: process.env.NODE_ENV === 'development' ? response.credentials : undefined
      };
      res.status(201).json(sanitizedResponse);
      
    } catch (error) {
      logger.error('❌ Customer onboarding failed:', error);
      
      // Handle validation errors
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request data',
          code: 'VALIDATION_ERROR',
          details: error.errors
        } as CustomerOnboardingError);
      }
      
      // Handle structured onboarding errors
      if (error && typeof error === 'object' && 'success' in error && error.success === false) {
        const onboardingError = error as CustomerOnboardingError;
        
        // Determine appropriate HTTP status based on error code
        let statusCode = 500;
        switch (onboardingError.code) {
          case 'COMPANY_EXISTS':
          case 'ADMIN_USER_EXISTS':
            statusCode = 409; // Conflict
            break;
          case 'VALIDATION_ERROR':
            statusCode = 400; // Bad Request
            break;
          case 'DATABASE_PROVISIONING_FAILED':
          case 'USER_CREATION_FAILED':
          case 'SETTINGS_INITIALIZATION_FAILED':
          case 'ROLLBACK_FAILED':
          case 'INTERNAL_ERROR':
          default:
            statusCode = 500; // Internal Server Error
            break;
        }
        
        return res.status(statusCode).json(onboardingError);
      }
      
      // Handle unexpected errors
      res.status(500).json({
        success: false,
        error: 'An unexpected error occurred during customer onboarding',
        code: 'INTERNAL_ERROR',
        details: process.env.NODE_ENV === 'development' ? error : undefined
      } as CustomerOnboardingError);
    }
  });

  // Development customer provisioning endpoint (development only)
  app.post('/api/onboarding/provision-dev-customer', async (req, res) => {
    // Only allow in development environment
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ error: 'Endpoint not available in production' });
    }
    
    try {
      const { customerId, companyName, adminUsername } = req.body;
      
      if (!customerId || !companyName || !adminUsername) {
        return res.status(400).json({ 
          error: 'customerId, companyName, and adminUsername are required for development customer creation' 
        });
      }

      // Set DEV_PROVISIONING_PASSWORD in your .env file for local development
      const devProvPassword = process.env.DEV_PROVISIONING_PASSWORD;
      if (!devProvPassword) {
        return res.status(500).json({ error: 'DEV_PROVISIONING_PASSWORD not set' });
      }
      
      logger.info(`🔧 Creating development customer: ${customerId} - ${companyName}`);
      
      // Create development customer request
      const devRequest: CustomerOnboardingRequest = {
        companyName,
        contactEmail: `dev+${customerId}@tpr-max.local`,
        adminUsername,
        adminEmail: `admin+${customerId}@tpr-max.local`,
        adminPassword: devProvPassword,
        adminFirstName: 'Admin',
        adminLastName: 'User',
        planType: 'trial',
        trialDays: 30,
        industry: 'Development Testing',
        employeeCount: 10,
        timezone: 'Europe/London',
        currency: 'GBP'
      };
      
      // Provision development customer
      const response = await customerOnboardingService.provisionCustomer(devRequest);
      
      logger.info(`✅ Development customer created successfully: ${response.customer.companyName}`);
      
      res.status(201).json({
        ...response,
        developmentInfo: {
          message: 'Development customer created',
          customerId: response.customerId,
          adminCredentials: {
            companyName: response.customer.companyName,
            username: adminUsername,
            password: devProvPassword // Only in development
          }
        }
      });
      
    } catch (error) {
      logger.error('❌ Development customer creation failed:', error);
      res.status(500).json({ 
        error: 'Failed to create development customer',
        details: process.env.NODE_ENV === 'development' ? error : undefined
      });
    }
  });

  // Company name availability checking endpoint (public, no auth required)
  app.post('/api/onboarding/check-availability', async (req, res) => {
    try {
      const { companyName } = req.body;
      
      if (!companyName || typeof companyName !== 'string') {
        return res.status(400).json({
          success: false,
          available: false,
          error: 'Company name is required'
        });
      }

      // Normalize company name for checking (case-insensitive, trim whitespace)
      const normalizedName = companyName.trim().toLowerCase();
      
      if (normalizedName.length < 2) {
        return res.status(400).json({
          success: false,
          available: false,
          error: 'Company name must be at least 2 characters'
        });
      }

      // Check against management database for existing companies
      const managementDbUrl = process.env.DATABASE_URL;
      if (!managementDbUrl) {
        logger.error('❌ DATABASE_URL not configured');
        return res.status(500).json({
          success: false,
          available: false,
          error: 'Database configuration error'
        });
      }

      const managementPool = new Pool({ connectionString: managementDbUrl });
      const managementDb = drizzle({ client: managementPool, schema: sharedSchema });

      try {
        // Check if company name already exists (case-insensitive)
        const existingCompany = await managementDb
          .select()
          .from(sharedSchema.customers)
          .where(sql`LOWER(${sharedSchema.customers.companyName}) = ${normalizedName}`)
          .limit(1);

        const isAvailable = existingCompany.length === 0;

        await managementPool.end();

        res.json({
          success: true,
          available: isAvailable,
          message: isAvailable 
            ? 'Company name is available' 
            : 'Company name is already taken'
        });

      } catch (dbError) {
        logger.error('❌ Database error checking company availability:', dbError);
        await managementPool.end();
        
        res.status(500).json({
          success: false,
          available: false,
          error: 'Database error checking availability'
        });
      }

    } catch (error) {
      logger.error('❌ Error checking company name availability:', error);
      res.status(500).json({
        success: false,
        available: false,
        error: 'Failed to check company name availability'
      });
    }
  });

  // Customer onboarding status check endpoint (public for status checks)
  app.get('/api/onboarding/status/:companySlug', async (req, res) => {
    try {
      const { companySlug } = req.params;
      
      if (!companySlug) {
        return res.status(400).json({ error: 'Company slug is required' });
      }
      
      logger.info(`🔍 Checking onboarding status for company slug: ${companySlug}`);
      
      // Look up customer by slug in management database
      const managementDbUrl = process.env.DATABASE_URL;
      if (!managementDbUrl) {
        return res.status(500).json({ error: 'Database configuration error' });
      }

      const managementPool = new Pool({ connectionString: managementDbUrl });
      const managementDb = drizzle({ client: managementPool, schema: sharedSchema });

      try {
        const customers = await managementDb
          .select({
            id: sharedSchema.customers.id,
            companyName: sharedSchema.customers.companyName,
            slug: sharedSchema.customers.slug,
            isActive: sharedSchema.customers.isActive,
            onboardingCompleted: sharedSchema.customers.onboardingCompleted,
            createdAt: sharedSchema.customers.createdAt
          })
          .from(sharedSchema.customers)
          .where(eq(sharedSchema.customers.slug, companySlug))
          .limit(1);

        if (customers.length === 0) {
          return res.status(404).json({ 
            error: 'Company not found',
            companySlug 
          });
        }

        const customer = customers[0];
        
        res.json({
          success: true,
          customer: {
            id: customer.id,
            companyName: customer.companyName,
            slug: customer.slug,
            isActive: customer.isActive,
            onboardingCompleted: customer.onboardingCompleted,
            createdAt: customer.createdAt
          },
          loginUrl: process.env.NODE_ENV === 'production' 
            ? `https://${customer.slug}.tpr-max.com/login`
            : `${process.env.FRONTEND_URL || 'http://localhost:5000'}/login`
        });
        
      } finally {
        await managementPool.end();
      }
      
    } catch (error) {
      logger.error('❌ Error checking onboarding status:', error);
      res.status(500).json({ 
        error: 'Failed to check onboarding status',
        details: process.env.NODE_ENV === 'development' ? error : undefined
      });
    }
  });

  // ── Public Blog Routes (no auth required) ────────────────────────────────

  // GET /api/blog — list all published posts, newest first
  app.get('/api/blog', async (_req, res) => {
    try {
      const posts = await db
        .select({
          id: sharedSchema.blogPosts.id,
          title: sharedSchema.blogPosts.title,
          slug: sharedSchema.blogPosts.slug,
          summary: sharedSchema.blogPosts.summary,
          author: sharedSchema.blogPosts.author,
          coverImageUrl: sharedSchema.blogPosts.coverImageUrl,
          tags: sharedSchema.blogPosts.tags,
          publishedAt: sharedSchema.blogPosts.publishedAt,
          createdAt: sharedSchema.blogPosts.createdAt,
        })
        .from(sharedSchema.blogPosts)
        .where(eq(sharedSchema.blogPosts.status, 'published'))
        .orderBy(sql`COALESCE(${sharedSchema.blogPosts.publishedAt}, ${sharedSchema.blogPosts.createdAt}) DESC`);

      res.json({ posts });
    } catch (error) {
      logger.error('Error fetching blog posts:', error);
      res.status(500).json({ error: 'Failed to load blog posts' });
    }
  });

  // GET /api/blog/:slug — single published post by slug
  app.get('/api/blog/:slug', async (req, res) => {
    try {
      const { slug } = req.params;
      const [post] = await db
        .select()
        .from(sharedSchema.blogPosts)
        .where(eq(sharedSchema.blogPosts.slug, slug))
        .limit(1);

      if (!post || post.status !== 'published') {
        return res.status(404).json({ error: 'Post not found' });
      }

      res.json({ post });
    } catch (error) {
      logger.error('Error fetching blog post:', error);
      res.status(500).json({ error: 'Failed to load blog post' });
    }
  });

}
