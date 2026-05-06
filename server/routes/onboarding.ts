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
      const colW2 = (CW - 20) / 2;
      const fCW   = (CW - 16) / 3;

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
        pg.drawText(a(title), { x: M, y: H - 42, size: 17, font: bold, color: white });
      };

      const pageFooter = (pg: any, num: number) => {
        rule(pg, M, 34, CW);
        pg.drawText('TPR Max by ACS Safety & Security Ltd  |  www.acsltd.eu  |  info@acsltd.eu', { x: M, y: 20, size: 7, font, color: muted });
        pg.drawText(`PAGE ${num}`, { x: W - M - bold.widthOfTextAtSize(`PAGE ${num}`, 7), y: 20, size: 7, font: bold, color: muted });
      };

      const featureCard3 = (pg: any, startY: number, items: [string, string][]) => {
        items.forEach(([title, desc], i) => {
          const fx = M + i * (fCW + 8);
          fillBox(pg, fx, startY - 90, fCW, 90, light, border);
          fillBox(pg, fx, startY - 90 + 62, fCW, 28, navyMid);
          wrap(a(title), fCW - 16, 7.5, bold).slice(0, 2).forEach((l, li) =>
            pg.drawText(l, { x: fx + 8, y: startY - 90 + 83 - li * 11, size: 7.5, font: bold, color: white }));
          wrap(desc, fCW - 16, 8, font).slice(0, 3).forEach((l, li) =>
            pg.drawText(l, { x: fx + 8, y: startY - 35 - li * 12, size: 8, font, color: dark }));
        });
      };

      // ─────────────────────────────────────────────
      // PAGE 1 — COVER
      // ─────────────────────────────────────────────
      const pg1 = pdfDoc.addPage([W, H]);
      fillBox(pg1, 0, 0, W, H, navyDark);
      fillBox(pg1, 0, H - 5, W, 5, accent);

      pg1.drawText('SAVE LIVES', { x: M, y: H - 148, size: 68, font: bold, color: white });
      drawWrap(pg1, 'Know exactly who is on site when it matters most', M, H - 195, CW * 0.72, 15, font, rgb(0.72, 0.80, 0.92));

      rule(pg1, M, H - 228, CW * 0.35, navyMid);

      pg1.drawText('PRESENTED TO', { x: M, y: H - 268, size: 7.5, font: bold, color: accentSub });
      pg1.drawText('Stakeholders', { x: M, y: H - 286, size: 13, font, color: white });
      pg1.drawText('PRESENTED BY', { x: M, y: H - 318, size: 7.5, font: bold, color: accentSub });
      pg1.drawText('Andy Halse', { x: M, y: H - 336, size: 13, font, color: white });

      rule(pg1, M, 128, CW, navyMid);
      pg1.drawText('ACS SAFETY & SECURITY LTD', { x: M, y: 106, size: 9, font: bold, color: accentSub });
      pg1.drawText('ONE PLATFORM', { x: M, y: 78, size: 30, font: bold, color: white });
      pg1.drawText('tpr-max.com  |  www.acsltd.eu  |  info@acsltd.eu', { x: M, y: 54, size: 8.5, font, color: navyMuted });
      fillBox(pg1, 0, 0, W, 5, accent);

      // ─────────────────────────────────────────────
      // PAGE 2 — ONE PLATFORM overview
      // ─────────────────────────────────────────────
      const pg2 = pdfDoc.addPage([W, H]);
      pageHeader(pg2, 'ONE PLATFORM');

      let y2 = H - 82;
      pg2.drawText('17 integrated modules that replace every disconnected system on your site.', { x: M, y: y2, size: 9.5, font, color: muted });
      y2 -= 20;
      rule(pg2, M, y2, CW);
      y2 -= 20;

      const body2a = 'TPR Max is a transformative solution designed to streamline safety management and compliance across various sectors. By replacing multiple outdated systems, it provides 17 integrated modules that ensure everything you need is available in one platform. From digital check-in to real-time emergency muster capabilities, TPR Max simplifies processes and enhances efficiency. Users benefit from immediate access to essential information without the hassle of juggling between different applications. With its user-friendly interface, organisations can seamlessly transition to this system and begin experiencing its advantages from day one.';
      const body2b = 'The implementation of TPR Max empowers organisations to improve their operational effectiveness while maintaining safety and compliance. Every module is designed with practical functionality in mind, addressing crucial aspects such as contractor management, visitor tracking, and incident reporting. This centralised approach allows for better coordination among team members, ensuring that everyone is informed and accountable. As a result, TPR Max not only enhances productivity but also fosters a culture of safety that is essential for today\'s diverse environments. Experience the power of a single platform that truly brings everything together.';

      let col1Y = y2, col2Y = y2;
      for (const l of wrap(body2a, colW2, 9, font)) { pg2.drawText(l, { x: M,           y: col1Y, size: 9, font, color: dark }); col1Y -= 13.5; }
      for (const l of wrap(body2b, colW2, 9, font)) { pg2.drawText(l, { x: M+colW2+20, y: col2Y, size: 9, font, color: dark }); col2Y -= 13.5; }

      const modStart = Math.min(col1Y, col2Y) - 28;
      rule(pg2, M, modStart + 14, CW);
      pg2.drawText('17 INTEGRATED MODULES — ALL INCLUDED', { x: M, y: modStart, size: 8.5, font: bold, color: accent });
      const modList = ['Dashboard','Reception','Meeting Rooms','People','ID Cards','Contractors','Compliance','Emergency','Time Track','CO2 Reporting','Reports','RAMS','PPM','CDM 2015','Lone Worker','Martyn\'s Law','Help Desk'];
      const mCols = 6, mW = CW / mCols;
      modList.forEach((m, i) => {
        const mc = i % mCols, mr = Math.floor(i / mCols);
        pg2.drawText(a(m), { x: M + mc * mW, y: modStart - 18 - mr * 16, size: 8, font, color: dark });
      });

      pageFooter(pg2, 2);

      // ─────────────────────────────────────────────
      // PAGE 3 — EMERGENCY MUSTERING
      // ─────────────────────────────────────────────
      const pg3 = pdfDoc.addPage([W, H]);
      pageHeader(pg3, 'EMERGENCY MUSTERING');

      let y3 = H - 76;
      pg3.drawText('Streamlined evacuation procedures for every situation and site.', { x: M, y: y3, size: 9.5, font, color: muted });
      y3 -= 18; rule(pg3, M, y3, CW); y3 -= 28;

      featureCard3(pg3, y3, [
        ['ONE-CLICK EVACUATION',  'Instantly account for everyone on site during emergencies with a single action.'],
        ['LIVE HEAD COUNTS',      'Real-time updates at multiple muster points so Fire Marshals always know who is missing.'],
        ['MARTYN\'S LAW MODULE',  'Comprehensive lockdown procedures and a full incident tracker built in as standard.'],
      ]);
      y3 -= 110;
      rule(pg3, M, y3, CW, border); y3 -= 20;

      drawWrap(pg3, 'Effective emergency mustering is crucial in any scenario. TPR Max provides a one-click evacuation feature, ensuring that every visitor, contractor, and staff member is accounted for in real-time. With live head counts at multiple muster points, Fire Marshals can access critical information without needing to log in, using a static URL on any phone. This system allows people off-site to mark themselves safe through email notifications. The Martyn\'s Law module incorporates lockdown procedures and a comprehensive incident tracker, helping organisations comply with evolving safety regulations. By enabling quick access to vital data and real-time updates, TPR Max enhances emergency response capabilities and ensures the safety of everyone on site.', M, y3, CW, 9.5, font, dark, 14);

      pageFooter(pg3, 3);

      // ─────────────────────────────────────────────
      // PAGE 4 — CONTRACTOR COMPLIANCE
      // ─────────────────────────────────────────────
      const pg4 = pdfDoc.addPage([W, H]);
      pageHeader(pg4, 'CONTRACTOR COMPLIANCE');

      let y4 = H - 76;
      pg4.drawText('Removing legal and insurance risks with robust tracking and management.', { x: M, y: y4, size: 9.5, font, color: muted });
      y4 -= 18; rule(pg4, M, y4, CW); y4 -= 28;

      featureCard3(pg4, y4, [
        ['COMPREHENSIVE PROFILES',  'Detailed contractor and worker records always accessible and up-to-date.'],
        ['INDUCTION MANAGEMENT',    'Inductions must be completed before any contractor can check in on-site.'],
        ['COMPLIANCE TRACKING',     'Track certificates, qualifications, and insurance expiry dates automatically.'],
      ]);
      y4 -= 110;
      rule(pg4, M, y4, CW, border); y4 -= 20;

      drawWrap(pg4, 'Managing contractors effectively is essential for mitigating legal and insurance risks on site. TPR Max simplifies this process by offering comprehensive profiles for each contractor, ensuring that all worker records are readily accessible and up-to-date. Induction management is crucial, as TPR Max mandates that inductions must be completed before any contractor can check in on-site, guaranteeing compliance at all levels. The software\'s robust compliance tracking features enable users to keep track of all essential documentation, such as certificates, qualifications, and insurance expiry dates, reducing the risks associated with contractor management. With TPR Max, every interaction is logged, providing auditable proof of compliance that enhances transparency and accountability across all contractor activities.', M, y4, CW, 9.5, font, dark, 14);

      pageFooter(pg4, 4);

      // ─────────────────────────────────────────────
      // PAGE 5 — VISITOR & STAFF MANAGEMENT
      // ─────────────────────────────────────────────
      const pg5 = pdfDoc.addPage([W, H]);
      pageHeader(pg5, 'VISITOR & STAFF MANAGEMENT');

      let y5 = H - 76;
      pg5.drawText('Comprehensive solutions for check-in, attendance, ID cards, and more.', { x: M, y: y5, size: 9.5, font, color: muted });
      y5 -= 18; rule(pg5, M, y5, CW); y5 -= 28;

      const sections5: [string, string][] = [
        ['Check-in Solutions',      'TPR Max simplifies visitor check-in with photo capture and digital signatures, offering a smooth experience that integrates seamlessly with pre-registration and email invitations. Kiosk Mode enables self-service sign-in on a tablet, reducing reception workload while maintaining a complete, timestamped audit trail for every visit.'],
        ['Attendance Tracking',     'Track staff attendance effortlessly with real-time data, daily reports, and seamless integration with BioStar 2 access control, ensuring accurate timekeeping and payroll processing. The Time & Attendance module automatically generates reports and exports data in payroll-ready formats.'],
        ['ID Cards & Passes',       'Generate QR-coded visitor, contractor, and staff passes instantly on check-in. Compatible with TEC, Toshiba, and Zebra thermal printers. Passes can be printed, emailed, or displayed on-screen, and include photo, host details, and expiry time for full traceability.'],
        ['Pre-Booking & Invitations','Hosts can pre-register expected visitors and send personalised email invitations with QR codes that fast-track check-in. Reception staff see a live diary of expected arrivals, reducing queues and ensuring a professional, brand-consistent welcome experience.'],
      ];
      sections5.forEach(([title, body], i) => {
        const sx = M + (i % 2) * (colW2 + 20);
        const sy = y5 - Math.floor(i / 2) * 210;
        pg5.drawText(a(title), { x: sx, y: sy, size: 11, font: bold, color: dark });
        rule(pg5, sx, sy - 9, colW2, accent);
        drawWrap(pg5, body, sx, sy - 24, colW2, 8.8, font, muted, 13);
      });

      pageFooter(pg5, 5);

      // ─────────────────────────────────────────────
      // PAGE 6 — SECURITY & DATA TRUST
      // ─────────────────────────────────────────────
      const pg6 = pdfDoc.addPage([W, H]);
      pageHeader(pg6, 'SECURITY & DATA TRUST');

      let y6 = H - 80;
      const body6a = 'TPR Max prioritises your data\'s privacy and security, ensuring that each customer has their own isolated database, meaning your information never coexists with another client\'s. With a design that is GDPR compliant, TPR Max features robust security measures including CSRF protection, bcrypt passwords, and encrypted sessions. The platform\'s role-based access guarantees that only authorised personnel can view sensitive data, significantly reducing the risk of unauthorised access. Full audit trails provide visibility into every interaction, ensuring accountability and transparency. This strong privacy infrastructure allows organisations to focus on their core operations without the added stress of data security issues.';
      const body6b = 'Furthermore, TPR Max is ISO 27001 aligned, reflecting our commitment to maintaining the highest standards of information security management. Users benefit from built-in data export capabilities and the right-to-be-forgotten feature, empowering clients to manage their data effortlessly. By prioritising compliance and security, TPR Max fosters trust among users, which is essential in today\'s data-driven environment. The platform\'s meticulous attention to protecting user information not only complies with global regulations but also enhances overall operational efficiency, safeguarding your organisation\'s reputation and integrity.';

      let c1y6 = y6, c2y6 = y6;
      for (const l of wrap(body6a, colW2, 9, font)) { pg6.drawText(l, { x: M,           y: c1y6, size: 9, font, color: dark }); c1y6 -= 13.5; }
      for (const l of wrap(body6b, colW2, 9, font)) { pg6.drawText(l, { x: M+colW2+20, y: c2y6, size: 9, font, color: dark }); c2y6 -= 13.5; }

      const secY = Math.min(c1y6, c2y6) - 28;
      rule(pg6, M, secY + 14, CW);
      pg6.drawText('SECURITY FEATURES AT A GLANCE', { x: M, y: secY, size: 8.5, font: bold, color: accent });
      const secFeats: [string, string][] = [
        ['Isolated Databases',  'Each tenant has a dedicated schema — zero data co-mingling between clients.'],
        ['GDPR Compliant',      'Right-to-be-forgotten, data exports, and full privacy controls built in.'],
        ['Encrypted Sessions',  'bcrypt passwords, CSRF protection, and secure session management throughout.'],
        ['Role-Based Access',   'Granular permissions ensure every staff member sees only what they need.'],
        ['Full Audit Trails',   'Every action is logged with timestamp, user identity, and IP address.'],
        ['ISO 27001 Aligned',   'Built to the highest international information security management standards.'],
      ];
      const sfCW = (CW - 8) / 3;
      secFeats.forEach(([t, d], i) => {
        const sc = i % 3, sr = Math.floor(i / 3);
        const sx = M + sc * (sfCW + 4), sy = secY - 20 - sr * 58;
        fillBox(pg6, sx, sy - 44, sfCW, 48, light, border);
        pg6.drawText(a(t), { x: sx + 8, y: sy - 14, size: 8.5, font: bold, color: dark });
        wrap(d, sfCW - 16, 7.5, font).slice(0, 3).forEach((l, li) =>
          pg6.drawText(l, { x: sx + 8, y: sy - 27 - li * 11, size: 7.5, font, color: muted }));
      });

      pageFooter(pg6, 6);

      // ─────────────────────────────────────────────
      // PAGE 7 — SECTORS
      // ─────────────────────────────────────────────
      const pg7 = pdfDoc.addPage([W, H]);
      pageHeader(pg7, 'BUILT FOR SITES WHERE SAFETY IS NOT OPTIONAL');

      let y7 = H - 76;
      pg7.drawText('8 sectors that rely on TPR Max every day.', { x: M, y: y7, size: 9.5, font, color: muted });
      y7 -= 18; rule(pg7, M, y7, CW); y7 -= 28;

      featureCard3(pg7, y7, [
        ['MANUFACTURING & INDUSTRIAL', 'High contractor footfall, strict H&S obligations, and regular compliance audits.'],
        ['CONSTRUCTION SITES',         'Rotating workforce, RAMS requirements, and site induction compliance tracking.'],
        ['HEALTHCARE',                 'Contractor vetting, detailed visitor records, and infection control sign-off management.'],
      ]);
      y7 -= 110;
      rule(pg7, M, y7, CW, border); y7 -= 18;

      drawWrap(pg7, 'TPR Max is relevant to any organisation that has contractors, visitors, or temporary workers on site and needs to demonstrate it managed them properly.', M, y7, CW, 10, bold, dark, 15);
      y7 -= 48;

      const moreSectors: [string, string][] = [
        ['Facilities Management',     'Multiple sites, multiple contractors, one place to manage them all.'],
        ['Logistics & Warehousing',   'Shift-based staff, delivery contractors, emergency procedures.'],
        ['Education',                 'Safeguarding-compliant visitor management and contractor DBS tracking.'],
        ['Local Government',          'Audit trails, compliance evidence, and public duty obligations.'],
        ['Serviced Offices',          'Multi-tenant management for shared buildings and co-working spaces.'],
      ];
      moreSectors.forEach(([t, d]) => {
        const bw = bold.widthOfTextAtSize(a(t) + ':  ', 9);
        pg7.drawText(a(t) + ':', { x: M, y: y7, size: 9, font: bold, color: accent });
        pg7.drawText(a(d), { x: M + bw, y: y7, size: 9, font, color: dark });
        y7 -= 17;
      });

      pageFooter(pg7, 7);

      // ─────────────────────────────────────────────
      // PAGE 8 — PRICING & CTA
      // ─────────────────────────────────────────────
      const pg8 = pdfDoc.addPage([W, H]);
      pageHeader(pg8, 'PRICING');

      let y8 = H - 76;
      pg8.drawText('Simple per-site monthly pricing. No setup fees. No long-term contracts. All prices exclude VAT.', { x: M, y: y8, size: 9, font, color: muted });
      y8 -= 18; rule(pg8, M, y8, CW); y8 -= 18;

      const pCW8 = (CW - 16) / 3;
      const pH8  = 320;
      const tiers: { name: string; price: string; desc: string; features: string[]; popular?: boolean; inv?: boolean }[] = [
        {
          name: 'TPR Basic', price: '\u00a349',
          desc: 'For offices and smaller sites needing visitor management and fire evacuation.',
          features: ['Visitor sign-in, passes & pre-booking','Staff directory & check-in','Emergency evacuation & muster roll-call','Kiosk Mode (self-service check-in)','Email Outbox - all system emails','Basic reporting & audit logs'],
        },
        {
          name: 'TPR Pro', price: '\u00a389', popular: true,
          desc: 'For organisations managing contractors, inductions, and compliance.',
          features: ['All Basic features, plus:','Contractor sign-in & compliance','RAMS management','AI Safety inductions','Incident Reports & PDF export','Time & Attendance tracking','Full analytics & audit logs'],
        },
        {
          name: 'TPR Max', price: '\u00a3195', inv: true,
          desc: 'Enterprise platform for complex sites requiring CDM, PPM, and multi-site control.',
          features: ['All Pro features, plus:','PPM Annual Planner & asset registry','Martyn\'s Law / Protect Duty','CDM 2015 project management','Help Desk & reactive maintenance','Lone Worker Protection system','Portfolio dashboard (multi-site)'],
        },
      ];

      tiers.forEach((tier, i) => {
        const tx = M + i * (pCW8 + 8);
        const ty = y8;
        const bg  = tier.inv ? navyDark : light;
        const bd  = tier.popular ? accent : (tier.inv ? navyMid : border);
        fillBox(pg8, tx, ty - pH8, pCW8, pH8, bg, bd, tier.popular ? 1.5 : 0.75);
        if (tier.popular) {
          fillBox(pg8, tx, ty, pCW8, 16, accent);
          pg8.drawText('MOST POPULAR', { x: tx + pCW8 / 2 - bold.widthOfTextAtSize('MOST POPULAR', 7) / 2, y: ty + 5, size: 7, font: bold, color: white });
        }
        const tCol  = tier.inv ? white : (tier.popular ? accent : dark);
        const mCol  = tier.inv ? navyMuted : muted;
        const fCol  = tier.inv ? rgb(0.75, 0.82, 0.92) : dark;

        pg8.drawText(a(tier.name),  { x: tx + 10, y: ty - 22,  size: 12, font: bold, color: tCol });
        pg8.drawText(tier.price,    { x: tx + 10, y: ty - 60,  size: 32, font: bold, color: tCol });
        pg8.drawText('/site/month', { x: tx + 10, y: ty - 76,  size: 7.5, font, color: mCol });
        wrap(tier.desc, pCW8 - 20, 7.5, font).slice(0, 3).forEach((l, li) =>
          pg8.drawText(l, { x: tx + 10, y: ty - 92 - li * 11, size: 7.5, font, color: mCol }));
        pg8.drawRectangle({ x: tx + 10, y: ty - 124, width: pCW8 - 20, height: 0.5, color: bd });

        tier.features.forEach((f, fi) => {
          const isHeader = fi === 0 && f.endsWith(':');
          const label = isHeader ? a(f) : '+ ' + a(f);
          const lCol  = isHeader ? mCol : fCol;
          wrap(label, pCW8 - 22, 7.5, font).slice(0, 2).forEach((l, li) =>
            pg8.drawText(l, { x: tx + 10, y: ty - 138 - fi * 24 - li * 11, size: 7.5, font, color: lCol }));
        });
      });

      y8 -= pH8 + 24;

      // CTA block
      fillBox(pg8, M, y8 - 64, CW, 68, light, border);
      pg8.drawText('FREE FOR 14 DAYS. NO CARD REQUIRED.', {
        x: M + CW / 2 - bold.widthOfTextAtSize('FREE FOR 14 DAYS. NO CARD REQUIRED.', 13) / 2,
        y: y8 - 20, size: 13, font: bold, color: dark,
      });
      pg8.drawText('tpr-max.com   |   www.acsltd.eu   |   info@acsltd.eu', {
        x: M + CW / 2 - font.widthOfTextAtSize('tpr-max.com   |   www.acsltd.eu   |   info@acsltd.eu', 9.5) / 2,
        y: y8 - 38, size: 9.5, font, color: accent,
      });
      pg8.drawText('+44 1344 771569   |   ACS Safety & Security Ltd   |   Registered in England & Wales', {
        x: M + CW / 2 - font.widthOfTextAtSize('+44 1344 771569   |   ACS Safety & Security Ltd   |   Registered in England & Wales', 7.5) / 2,
        y: y8 - 54, size: 7.5, font, color: muted,
      });

      rule(pg8, M, 34, CW);
      pg8.drawText('(c) 2026 ACS Safety & Security Ltd. All prices exclude VAT. E&OE.', { x: M, y: 20, size: 7, font, color: muted });

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
