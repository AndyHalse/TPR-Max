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

  // Serve induction preview HTML page
  app.get('/induction-preview/:roleType', async (req, res) => {
    try {
      const { roleType } = req.params;
      
      // Use development customer context for public preview
      const context = databaseService.createDevelopmentContext();
      
      // Get settings for this role type
      const setting = await databaseService.getInductionSettingsByRole(context, roleType);
      
      if (!setting) {
        return res.status(404).send('Induction settings not found for this role');
      }

      // Get AI images for each slide type using customer-isolated database
      const slideTypes = ['legal_framework', 'ppe', 'emergency', 'hazard', 'site_rules'];
      const imagePromises = slideTypes.map(slideType => 
        databaseService.getAiGeneratedImageBySlideType(context, slideType)
      );

      const imageResults = await Promise.all(imagePromises);
      const images: Record<string, any> = {};
      slideTypes.forEach((slideType, index) => {
        images[slideType] = imageResults[index] || null;
      });

      // Generate HTML preview with AI images
      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${roleType.charAt(0).toUpperCase() + roleType.slice(1)} Induction</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            overflow-x: hidden;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            text-align: center;
        }
        .header {
            margin-bottom: 30px;
        }
        .title {
            font-size: 2.5rem;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .subtitle {
            font-size: 1.2rem;
            opacity: 0.9;
            margin-bottom: 20px;
        }
        .duration {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            background: rgba(255, 255, 255, 0.2);
            padding: 8px 16px;
            border-radius: 25px;
            font-size: 0.9rem;
        }
        .slide-preview {
            background: rgba(255, 255, 255, 0.15);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 40px;
            margin: 30px 0;
            border: 1px solid rgba(255, 255, 255, 0.2);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        }
        .slide-number {
            position: absolute;
            top: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.3);
            padding: 8px 12px;
            border-radius: 15px;
            font-size: 0.8rem;
        }
        .slide-title {
            font-size: 2rem;
            font-weight: bold;
            margin-bottom: 20px;
        }
        .slide-image {
            width: 100%;
            max-width: 600px;
            height: 400px;
            object-fit: cover;
            border-radius: 15px;
            margin: 20px 0;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
        }
        .slide-content {
            font-size: 1.1rem;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
        }
        .interactive-badge {
            display: inline-block;
            background: rgba(34, 197, 94, 0.2);
            color: #22c55e;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 0.8rem;
            margin: 10px 5px;
            border: 1px solid rgba(34, 197, 94, 0.3);
        }
        .loading {
            opacity: 0.6;
            text-align: center;
            font-style: italic;
        }
        .error-image {
            width: 100%;
            max-width: 600px;
            height: 400px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 15px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 20px auto;
            border: 2px dashed rgba(255, 255, 255, 0.3);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="title">${roleType.charAt(0).toUpperCase() + roleType.slice(1)} Induction</h1>
            <p class="subtitle">Comprehensive AI-generated safety induction covering all essential requirements for ${roleType}s. Duration: 21 minutes.</p>
            <div class="duration">
                <span>⏱️ 21 minutes</span>
                <span>📱 INTERACTIVE SLIDES</span>
            </div>
        </div>

        <!-- Welcome and Introduction Slide -->
        <div class="slide-preview" style="position: relative;">
            <div class="slide-number">1 / 7</div>
            <h2 class="slide-title">Welcome and Introduction</h2>
            ${images.legal_framework ? 
              `<img src="${images.legal_framework.imageUrl}" alt="Legal Framework" class="slide-image" />` :
              '<div class="error-image">🏢 Legal Framework Image Loading...</div>'
            }
            <div class="slide-content">
                <p>Welcome to Hexagon Business Centres Ltd. As a valued ${roleType}, your safety is our priority.</p>
                <div class="interactive-badge">Interactive Content</div>
            </div>
        </div>

        <!-- PPE Requirements Slide -->
        <div class="slide-preview" style="position: relative;">
            <div class="slide-number">2 / 7</div>
            <h2 class="slide-title">Personal Protective Equipment (PPE)</h2>
            ${images.ppe ? 
              `<img src="${images.ppe.imageUrl}" alt="PPE Requirements" class="slide-image" />` :
              '<div class="error-image">🦺 PPE Requirements Image Loading...</div>'
            }
            <div class="slide-content">
                <p>Essential PPE requirements for all ${roleType}s on site including hard hats, high-visibility clothing, and safety footwear.</p>
                <div class="interactive-badge">PPE Checklist</div>
                <div class="interactive-badge">Interactive Quiz</div>
            </div>
        </div>

        <!-- Emergency Procedures Slide -->
        <div class="slide-preview" style="position: relative;">
            <div class="slide-number">3 / 7</div>
            <h2 class="slide-title">Emergency Procedures</h2>
            ${images.emergency ? 
              `<img src="${images.emergency.imageUrl}" alt="Emergency Procedures" class="slide-image" />` :
              '<div class="error-image">🚨 Emergency Procedures Image Loading...</div>'
            }
            <div class="slide-content">
                <p>Critical emergency evacuation procedures, assembly points, and safety protocols.</p>
                <div class="interactive-badge">Emergency Drill</div>
                <div class="interactive-badge">Assembly Points</div>
            </div>
        </div>

        <!-- Hazard Identification Slide -->
        <div class="slide-preview" style="position: relative;">
            <div class="slide-number">4 / 7</div>
            <h2 class="slide-title">Hazard Identification</h2>
            ${images.hazard ? 
              `<img src="${images.hazard.imageUrl}" alt="Hazard Identification" class="slide-image" />` :
              '<div class="error-image">⚠️ Hazard Identification Image Loading...</div>'
            }
            <div class="slide-content">
                <p>Common workplace hazards and how to identify, assess, and report safety concerns.</p>
                <div class="interactive-badge">Hazard Spotting</div>
                <div class="interactive-badge">Reporting System</div>
            </div>
        </div>

        <!-- Site Rules and Regulations Slide -->
        <div class="slide-preview" style="position: relative;">
            <div class="slide-number">5 / 7</div>
            <h2 class="slide-title">Site Rules and Regulations</h2>
            ${images.site_rules ? 
              `<img src="${images.site_rules.imageUrl}" alt="Site Rules" class="slide-image" />` :
              '<div class="error-image">📋 Site Rules Image Loading...</div>'
            }
            <div class="slide-content">
                <p>Essential site rules, access control, and compliance requirements for ${roleType}s.</p>
                <div class="interactive-badge">Rules Quiz</div>
                <div class="interactive-badge">Compliance Check</div>
            </div>
        </div>

    </div>

    <script>
        // Auto-refresh images if they fail to load
        document.addEventListener('DOMContentLoaded', function() {
            const images = document.querySelectorAll('.slide-image');
            images.forEach(img => {
                img.onerror = function() {
                    // Retry loading the image after a delay
                    setTimeout(() => {
                        this.src = this.src + '?retry=' + Date.now();
                    }, 2000);
                };
            });
        });
    </script>
</body>
</html>`;

      res.send(html);
    } catch (error) {
      logger.error('Error serving induction preview:', error);
      res.status(500).send('Failed to load induction preview');
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

  // Marketing brochure PDF — generated via pdf-lib (pure Node.js, no Chrome required)
  app.get('/api/marketing/brochure-pdf', async (req, res) => {
    try {
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');

      const accent    = rgb(0.141, 0.376, 0.663);
      const white     = rgb(1, 1, 1);
      const dark      = rgb(0.059, 0.09, 0.161);
      const muted     = rgb(0.278, 0.341, 0.435);
      const light     = rgb(0.941, 0.961, 0.988);
      const border    = rgb(0.886, 0.91, 0.941);
      const green     = rgb(0.086, 0.647, 0.239);
      const navy      = rgb(0.059, 0.09, 0.161);
      const navyLine  = rgb(0.118, 0.161, 0.235);
      const lightMuted= rgb(0.58, 0.64, 0.74);

      const pdfDoc = await PDFDocument.create();
      const font   = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const bold   = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      const W = 595.28, H = 841.89, M = 40, CW = W - M * 2;

      // pdf-lib StandardFonts use WinAnsi encoding — strip unsupported Unicode to ASCII
      const toAscii = (s: string) => s
        .replace(/[\u2013\u2014]/g, '-')   // en/em dash
        .replace(/\u2019/g, "'")            // right single quote
        .replace(/\u2022/g, '*')            // bullet
        .replace(/\u00b7/g, '|')            // middle dot
        .replace(/[^\x00-\xff]/g, '');      // drop anything else outside Latin-1

      const wrap = (text: string, maxW: number, size: number, f: any): string[] => {
        text = toAscii(text);
        const words = text.split(' ');
        const lines: string[] = [];
        let cur = '';
        for (const w of words) {
          const test = cur ? `${cur} ${w}` : w;
          if (f.widthOfTextAtSize(test, size) <= maxW) { cur = test; }
          else { if (cur) lines.push(cur); cur = w; }
        }
        if (cur) lines.push(cur);
        return lines;
      };

      const card = (pg: any, x: number, y: number, w: number, h: number, bg: any, bd: any) =>
        pg.drawRectangle({ x, y, width: w, height: h, color: bg, borderColor: bd, borderWidth: 0.5 });

      // ── PAGE 1: Cover + Modules ──────────────────────────────────────────
      const p1 = pdfDoc.addPage([W, H]);

      // Header
      p1.drawRectangle({ x: 0, y: H - 82, width: W, height: 82, color: accent });
      p1.drawText('TPR Max', { x: M, y: H - 35, size: 26, font: bold, color: white });
      p1.drawText('Total Personnel Register', { x: M, y: H - 53, size: 10, font, color: rgb(0.8, 0.88, 0.96) });
      p1.drawText('ACS Safety & Security Ltd  |  info@acsltd.eu  |  +44 1344 771569', { x: M, y: H - 70, size: 8, font, color: rgb(0.65, 0.76, 0.88) });
      p1.drawText('Cloud-Native UK Site Management Platform', { x: W - M - 220, y: H - 46, size: 9, font, color: rgb(0.8, 0.88, 0.96) });
      p1.drawText('GDPR  |  99.9% Uptime  |  UK Built & Supported', { x: W - M - 210, y: H - 60, size: 8, font, color: rgb(0.65, 0.76, 0.88) });

      // Stats strip
      const sY = H - 114;
      const sW = CW / 4;
      [['17', 'Platform Modules'], ['99.9%', 'Platform Uptime'], ['UK', 'Built & Supported'], ['GDPR', 'Fully Compliant']].forEach(([v, l], i) => {
        const sx = M + i * sW;
        card(p1, sx, sY - 26, sW - 4, 30, light, border);
        p1.drawText(v, { x: sx + 6, y: sY - 7, size: 14, font: bold, color: accent });
        p1.drawText(l, { x: sx + 6, y: sY - 19, size: 7, font, color: muted });
      });

      // Section heading
      p1.drawText('17 Powerful Modules. One Platform.', { x: M, y: sY - 44, size: 13, font: bold, color: dark });
      p1.drawText('From visitor sign-in to CDM 2015 construction compliance — every tool built in from day one.', { x: M, y: sY - 57, size: 8, font, color: muted });
      p1.drawRectangle({ x: M, y: sY - 63, width: CW, height: 0.5, color: border });

      // Modules grid (3 cols)
      const modules = [
        ['Dashboard',    'Real-time site occupancy, KPIs & security alerts'],
        ['Reception',    'Visitor pre-booking, QR check-in, host notifications'],
        ['Meeting Rooms','Room booking with conflict detection & analytics'],
        ['People',       'Staff management, departments, Fire Marshal roles'],
        ['ID Cards',     'Thermal pass printing — TEC, Toshiba, Zebra'],
        ['Contractors',  'Worker & company compliance, red/yellow cards'],
        ['Compliance',   'AI-generated safety inductions with voice & video'],
        ['Emergency',    'Zone-based mustering, Fire Marshal static URLs'],
        ['Time Track',   'Automated T&A, payroll-ready exports'],
        ['CO2',          'Carbon footprint analysis & ESG sustainability reports'],
        ['Reports',      'Analytics, compliance dashboards & audit trails'],
        ['RAMS',         'Risk Assessment & Method Statement management'],
        ['PPM',          '12-month maintenance planner, statutory compliance'],
        ['CDM 2015',     'F10 notifications, duty-holder roles, project scoring'],
        ['Lone Worker',  'Welfare checks, escalation & real-time monitoring'],
        ["Martyn's Law", 'Protect Duty — threat assessments & drills'],
        ['Help Desk',    'Reactive maintenance ticketing & fault resolution'],
      ];
      const cols = 3, mCH = 50, mGap = 4;
      const mCW = (CW - (cols - 1) * mGap) / cols;
      const mStart = sY - 71;
      modules.forEach(([name, desc], idx) => {
        const col = idx % cols, row = Math.floor(idx / cols);
        const cx = M + col * (mCW + mGap);
        const cy = mStart - row * (mCH + mGap);
        card(p1, cx, cy - mCH + 4, mCW, mCH, light, border);
        p1.drawText(name, { x: cx + 6, y: cy - 12, size: 8.5, font: bold, color: accent });
        wrap(desc, mCW - 12, 7, font).slice(0, 3).forEach((line, li) =>
          p1.drawText(line, { x: cx + 6, y: cy - 23 - li * 9, size: 7, font, color: muted }));
      });

      // Page 1 footer
      p1.drawRectangle({ x: M, y: 26, width: CW, height: 0.5, color: border });
      p1.drawText('TPR Max by ACS Safety & Security Ltd  \u2014  Registered in England & Wales  \u2014  www.acsltd.eu', { x: M, y: 13, size: 7, font, color: lightMuted });

      // ── PAGE 2: Pricing + Why + CTA ──────────────────────────────────────
      const p2 = pdfDoc.addPage([W, H]);

      // Header
      p2.drawRectangle({ x: 0, y: H - 58, width: W, height: 58, color: accent });
      p2.drawText('Simple, Transparent Pricing', { x: M, y: H - 26, size: 17, font: bold, color: white });
      p2.drawText('Per site per month  \u00b7  No setup fees  \u00b7  No long-term contracts  \u00b7  Multi-site discounts available', { x: M, y: H - 44, size: 8.5, font, color: rgb(0.8, 0.88, 0.96) });
      p2.drawText('All prices exclude VAT', { x: M, y: H - 73, size: 8, font, color: muted });

      // Pricing cards
      const pCW = (CW - 16) / 3;
      const pH   = 315;
      const pTop = H - 88;

      // --- Basic ---
      const bX = M;
      card(p2, bX, pTop - pH, pCW, pH, light, border);
      p2.drawText('TPR Basic', { x: bX + 10, y: pTop - 20, size: 11, font: bold, color: dark });
      p2.drawText('\u00a349', { x: bX + 10, y: pTop - 50, size: 28, font: bold, color: dark });
      p2.drawText('/site/month', { x: bX + 10, y: pTop - 64, size: 7.5, font, color: muted });
      p2.drawText('For offices & smaller sites', { x: bX + 10, y: pTop - 77, size: 7.5, font, color: muted });
      p2.drawRectangle({ x: bX + 10, y: pTop - 87, width: pCW - 20, height: 0.5, color: border });
      ['Visitor sign-in, passes & pre-booking', 'Staff directory & check-in', 'Emergency evacuation & muster roll-call', 'Kiosk Mode (self-service check-in)', 'Email Outbox \u2014 all system emails', 'Basic reporting'].forEach((f, i) => {
        p2.drawText('+', { x: bX + 10, y: pTop - 102 - i * 30, size: 9, font: bold, color: green });
        wrap(f, pCW - 34, 7.5, font).slice(0, 2).forEach((l, li) =>
          p2.drawText(l, { x: bX + 24, y: pTop - 102 - i * 30 - li * 9, size: 7.5, font, color: dark }));
      });

      // --- Pro ---
      const rX = M + pCW + 8;
      p2.drawRectangle({ x: rX - 2, y: pTop - pH - 2, width: pCW + 4, height: pH + 14, color: accent });
      card(p2, rX, pTop - pH, pCW, pH, white, accent);
      p2.drawText('MOST POPULAR', { x: rX + 18, y: pTop + 4, size: 6.5, font: bold, color: white });
      p2.drawText('TPR Pro', { x: rX + 10, y: pTop - 20, size: 11, font: bold, color: accent });
      p2.drawText('\u00a389', { x: rX + 10, y: pTop - 50, size: 28, font: bold, color: accent });
      p2.drawText('/site/month', { x: rX + 10, y: pTop - 64, size: 7.5, font, color: muted });
      p2.drawText('All Basic features, plus:', { x: rX + 10, y: pTop - 77, size: 7.5, font: bold, color: muted });
      p2.drawRectangle({ x: rX + 10, y: pTop - 87, width: pCW - 20, height: 0.5, color: border });
      ['Contractor sign-in, passes & compliance', 'RAMS management', 'AI Safety inductions', 'Incident Reports & PDF export', 'Time & Attendance tracking', 'Members module', 'Full analytics & audit logs'].forEach((f, i) => {
        p2.drawText('+', { x: rX + 10, y: pTop - 102 - i * 28, size: 9, font: bold, color: green });
        wrap(f, pCW - 34, 7.5, font).slice(0, 2).forEach((l, li) =>
          p2.drawText(l, { x: rX + 24, y: pTop - 102 - i * 28 - li * 9, size: 7.5, font, color: dark }));
      });

      // --- Max ---
      const mX = M + (pCW + 8) * 2;
      card(p2, mX, pTop - pH, pCW, pH, navy, navyLine);
      p2.drawText('TPR Max', { x: mX + 10, y: pTop - 20, size: 11, font: bold, color: white });
      p2.drawText('\u00a3195', { x: mX + 10, y: pTop - 50, size: 28, font: bold, color: white });
      p2.drawText('/site/month', { x: mX + 10, y: pTop - 64, size: 7.5, font, color: lightMuted });
      p2.drawText('All Pro features, plus:', { x: mX + 10, y: pTop - 77, size: 7.5, font: bold, color: lightMuted });
      p2.drawRectangle({ x: mX + 10, y: pTop - 87, width: pCW - 20, height: 0.5, color: navyLine });
      ['PPM Annual Planner & asset registry', "Martyn's Law / Protect Duty module", 'CDM 2015 project management', 'Help Desk & reactive maintenance', 'Suprema/BioStar 2 integration', 'Lone Worker Protection system', 'Portfolio dashboard (multi-site)'].forEach((f, i) => {
        p2.drawText('+', { x: mX + 10, y: pTop - 102 - i * 28, size: 9, font: bold, color: rgb(0.298, 0.867, 0.302) });
        wrap(f, pCW - 34, 7.5, font).slice(0, 2).forEach((l, li) =>
          p2.drawText(l, { x: mX + 24, y: pTop - 102 - i * 28 - li * 9, size: 7.5, font, color: rgb(0.78, 0.82, 0.88) }));
      });

      // Why section
      const wY = pTop - pH - 18;
      p2.drawRectangle({ x: M, y: wY, width: CW, height: 0.5, color: border });
      p2.drawText('Why UK Organisations Choose TPR Max', { x: M, y: wY - 15, size: 12, font: bold, color: dark });
      const wCW = (CW - 8) / 2;
      [
        ['Cloud-Native & Always On',  'No on-premise servers. 99.9% uptime on modern cloud infrastructure.'],
        ['GDPR Compliant & Secure',   'End-to-end encryption, role-based access, full tenant data isolation.'],
        ['No App Download Required',  'Fire Marshals, contractors & visitors use browser links on any device.'],
        ['UK Regulations Built-In',   'CDM 2015, RAMS, fire safety, GDPR — UK compliance is first-class.'],
        ['BioStar 2 Integration',     'Native integration with Suprema BioStar 2 — sync from door readers.'],
        ['True Multi-Tenant',         'Fully isolated data, branding & configuration per client tenant.'],
      ].forEach(([title, desc], i) => {
        const wc = i % 2, wr = Math.floor(i / 2);
        const wx = M + wc * (wCW + 8), wy = wY - 30 - wr * 46;
        card(p2, wx, wy - 36, wCW, 40, light, border);
        p2.drawText(title, { x: wx + 8, y: wy - 12, size: 8.5, font: bold, color: dark });
        wrap(desc, wCW - 16, 7.5, font).slice(0, 2).forEach((l, li) =>
          p2.drawText(l, { x: wx + 8, y: wy - 24 - li * 9, size: 7.5, font, color: muted }));
      });

      // CTA
      const cY = wY - 30 - 3 * 46 - 10;
      p2.drawRectangle({ x: M, y: cY - 50, width: CW, height: 54, color: light, borderColor: accent, borderWidth: 1 });
      p2.drawText('Book a Free Demo', { x: M + CW / 2 - 58, y: cY - 16, size: 14, font: bold, color: accent });
      wrap('Contact us to arrange a personalised walkthrough tailored to your industry and requirements.', CW - 40, 8, font).forEach((l, li) =>
        p2.drawText(l, { x: M + 20, y: cY - 30 - li * 10, size: 8, font, color: muted }));
      p2.drawText('info@acsltd.eu  |  +44 1344 771569  |  www.acsltd.eu', { x: M + CW / 2 - 118, y: cY - 42, size: 9, font: bold, color: dark });

      // Page 2 footer
      p2.drawRectangle({ x: M, y: 26, width: CW, height: 0.5, color: border });
      p2.drawText('\u00a9 2026 ACS Safety & Security Ltd. Registered in England & Wales. All prices exclude VAT. E&OE.', { x: M, y: 13, size: 7, font, color: lightMuted });

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
            ? `https://${customer.slug}.visigatepro.app/welcome`
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
        contactEmail: `dev+${customerId}@visigatepro.local`,
        adminUsername,
        adminEmail: `admin+${customerId}@visigatepro.local`,
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
            ? `https://${customer.slug}.visigatepro.app/login`
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

}
