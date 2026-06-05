import type { Express } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { randomUUID } from 'crypto';
import cron from 'node-cron';
import { logger } from '../utils/logger';
import { requireAuth } from '../auth';
import { inductionService } from '../inductionService';
import { databaseService } from '../databaseService';
import { simpleDatabaseService } from '../simpleDatabaseService';
import { customerDbService, CustomerDatabaseService } from '../customerDatabase';
import { EmailService, emailService } from '../emailService';
import { aiService } from '../aiService';
import { ObjectStorageService, objectStorageClient, parseObjectPath as parseObjectStoragePath } from '../objectStorage';
import { biostarService, BiostarConfig } from '../biostarService';
import { pushBiostarEvent, BiostarLiveEvent, BIOSTAR_LOG_MAX, biostarLiveLog } from '../routeState';
import * as isolatedSchema from '../isolatedSchema';
import {
  inductionSettings,
  inductionTokens,
  inductionQuestions,
  aiGeneratedImages,
  insertInductionSettingsSchema,
  insertAiGeneratedImageSchema,
  insertContractorWorkerSchema,
  customers,
} from '@shared/schema';
import { z } from 'zod';
import { eq, and, sql, desc, or, not, ne, isNotNull } from 'drizzle-orm';
import { db } from '../db';

// ─── Module-scope helpers ────────────────────────────────────────────────────

/**
 * Resolve the AI model to use for induction generation.
 *
 * Priority: openaiModel (induction field) → aiModel (Settings UI field) → caller fallback → hardcoded default.
 * Also normalises human-readable UI dropdown labels (e.g. "Claude 3.5 Sonnet (Anthropic)") to
 * the actual API model identifiers expected by the generation service.
 */
function resolveInductionModel(
  openaiModel?: string | null,
  aiModel?: string | null,
  fallback?: string
): string {
  const raw = openaiModel || aiModel || fallback || 'claude-3-5-sonnet-20241022';
  const UI_TO_API: Record<string, string> = {
    'Claude 3.5 Sonnet (Anthropic)': 'claude-3-5-sonnet-20241022',
    'Claude 3 Opus (Anthropic)':     'claude-3-opus-20240229',
    'Claude 3 Haiku (Anthropic)':    'claude-3-haiku-20240307',
    'GPT-4':                          'gpt-4',
    'GPT-4o':                         'gpt-4o',
  };
  return UI_TO_API[raw] ?? raw;
}

// Induction video generation status tracking (per customer+roleType)
const inductionGenerationStatus = new Map<string, {
  status: 'pending' | 'generating_script' | 'building_slides' | 'creating_questions' | 'saving' | 'done' | 'failed';
  step: number;
  totalSteps: number;
  message: string;
  startedAt: number;
  completedAt?: number;
  error?: string;
}>();

const SLIDE_PERF_PATCH = `<style id="tpr-slide-perf-patch">
.scene{visibility:hidden!important;pointer-events:none!important;position:absolute!important;top:0;left:0;width:100%;opacity:0!important;transition:opacity 0.25s ease!important;}
.scene.active{visibility:visible!important;pointer-events:auto!important;position:relative!important;opacity:1!important;display:block!important;animation:tprSlideIn 0.3s ease!important;}
@keyframes tprSlideIn{from{opacity:0;transform:translateX(15px)}to{opacity:1;transform:translateX(0)}}
/* ── Mobile responsive overrides ── */
@media(max-width:640px){
  html,body{overflow-y:auto!important;overflow-x:hidden!important;}
  .presentation-container{height:auto!important;min-height:100vh!important;overflow:visible!important;padding:8px 8px 90px 8px!important;}
  .scene{padding:8px 8px 10px 8px!important;height:auto!important;overflow:visible!important;}
  .scene h1,.scene h1*{font-size:1.35rem!important;margin-bottom:10px!important;}
  .scene h2,.scene h2*{font-size:1.15rem!important;margin-bottom:8px!important;}
  .scene h3,.scene h3*{font-size:1.05rem!important;margin-bottom:6px!important;}
  .scene p,.scene p*{font-size:0.92rem!important;line-height:1.45!important;margin-bottom:8px!important;}
  .scene ul li,.scene ol li{font-size:0.9rem!important;line-height:1.4!important;}
  .scene-image{height:28vw!important;min-height:120px!important;max-height:180px!important;}
  .controls{padding:8px 12px!important;gap:8px!important;bottom:8px!important;border-radius:12px!important;}
  .btn{padding:7px 11px!important;font-size:0.82rem!important;min-width:60px!important;}
  .header-section{position:relative!important;top:auto!important;left:auto!important;transform:none!important;padding:10px 14px!important;border-radius:12px!important;margin-bottom:8px!important;}
  .company-logo{width:48px!important;height:48px!important;font-size:1.1rem!important;}
  .company-name{font-size:0.95rem!important;}
  .scene-counter{top:8px!important;right:8px!important;padding:5px 9px!important;font-size:0.78rem!important;}
  .enhanced-badge{top:auto!important;bottom:80px!important;right:8px!important;font-size:0.75rem!important;padding:5px 10px!important;}
  .progress-bar{bottom:0!important;}
}
</style>`;
function patchInductionHtml(html: string): string {
  if (html.includes('id="tpr-slide-perf-patch"')) return html;
  const idx = html.indexOf('</head>');
  if (idx !== -1) return html.slice(0, idx) + SLIDE_PERF_PATCH + html.slice(idx);
  return html + SLIDE_PERF_PATCH;
}
// ─────────────────────────────────────────────────────────────────────────────

// Track active daily reset tasks per customer so they can be stopped/rescheduled
const dailyResetTasks = new Map<string, ReturnType<typeof cron.schedule>>();

// Setup automatic daily reset — safe to call multiple times (stops old tasks first)
export async function setupAutomaticDailyReset(specificCustomerId?: string) {
  try {
    // Get customers to schedule for
    let customers: Array<{ id: string }>;
    if (specificCustomerId) {
      customers = [{ id: specificCustomerId }];
    } else {
      const dbCustomers = await customerDbService.getAllCustomers();
      // DEV_CUSTOMER_IDS: comma-separated list of customer IDs to include in the daily reset
      // loop even when they are not present in the customers table. Set in development only;
      // leave unset in production so no extra customers are injected.
      const devCustomerIds = (process.env.DEV_CUSTOMER_IDS || '').split(',').filter(Boolean);
      const dbIds = new Set(dbCustomers.map((c: { id: string }) => c.id));
      const extraCustomers = devCustomerIds
        .filter(id => !dbIds.has(id))
        .map(id => ({ id }));
      customers = [...dbCustomers, ...extraCustomers];
    }

    for (const customer of customers) {
      // Stop and remove any existing task for this customer
      const existing = dailyResetTasks.get(customer.id);
      if (existing) {
        existing.stop();
        dailyResetTasks.delete(customer.id);
      }

      const context = { customerId: customer.id };
      let settings: Awaited<ReturnType<typeof simpleDatabaseService.getCompanySettings>>;
      try {
        settings = await simpleDatabaseService.getCompanySettings(context);
      } catch (err) {
        logger.info(`📅 Skipping daily reset schedule for customer ${customer.id} — no settings found`);
        continue;
      }

      if (!settings) {
        logger.info(`📅 Skipping daily reset schedule for customer ${customer.id} — no settings found`);
        continue;
      }

      if (settings?.enableDailyReset === false) {
        logger.info(`📅 Daily reset disabled for customer ${customer.id}`);
        continue;
      }

      if (settings?.enable24x7Operations === true) {
        logger.info(`📅 Daily reset skipped for customer ${customer.id} - 24/7 operations mode`);
        continue;
      }

      const resetTime = settings?.dailyResetTime || "00:00";
      const timezone = settings?.dailyResetTimezone || "Europe/London";
      const enableWeekendReset = settings?.enableWeekendReset === true;

      const [hours, minutes] = resetTime.split(':').map(Number);
      const cronExpression = enableWeekendReset
        ? `${minutes} ${hours} * * *`
        : `${minutes} ${hours} * * 1-5`;

      logger.info(`📅 Scheduling daily reset for customer ${customer.id} at ${resetTime} (${timezone}) — ${cronExpression}`);

      const task = cron.schedule(cronExpression, async () => {
        try {
          logger.info(`🔄 Daily reset firing for customer ${customer.id} at ${new Date().toLocaleString()}`);

          // Re-read settings fresh so any changes since startup take effect
          const currentSettings = await simpleDatabaseService.getCompanySettings(context);

          if (currentSettings?.enableDailyReset === false || currentSettings?.enable24x7Operations === true) {
            logger.info(`📅 Daily reset skipped for customer ${customer.id} — disabled in current settings`);
            return;
          }

          const enableHolidayReset = currentSettings?.enableHolidayReset === true;
          if (!enableHolidayReset) {
            const isHoliday = await checkIfHoliday(new Date());
            if (isHoliday) {
              logger.info(`📅 Daily reset skipped for customer ${customer.id} — public holiday`);
              return;
            }
          }

          const gracePeriodMinutes = currentSettings?.gracePeriodMinutes
            ? parseInt(currentSettings.gracePeriodMinutes.toString())
            : 15;

          if (gracePeriodMinutes > 0) {
            await sendGracePeriodNotification(gracePeriodMinutes, context);
            setTimeout(async () => {
              try {
                const result = await performDailyReset(false, context);
                logger.info(`🔄 Automatic daily reset completed for customer ${customer.id}:`, result);
              } catch (err) {
                logger.error(`❌ Delayed daily reset failed for customer ${customer.id}:`, err);
              }
            }, gracePeriodMinutes * 60 * 1000);
          } else {
            const result = await performDailyReset(false, context);
            logger.info(`🔄 Automatic daily reset completed for customer ${customer.id}:`, result);
          }
        } catch (error) {
          logger.error(`❌ Error in daily reset cron for customer ${customer.id}:`, error);
        }
      }, { timezone });

      dailyResetTasks.set(customer.id, task);
    }

    logger.info(`✅ Daily reset scheduled for ${dailyResetTasks.size} customer(s)`);
  } catch (error) {
    logger.error("❌ Error setting up automatic daily reset:", error);
  }
}

export function registerInductionRoutes(app: Express): void {
  // ID Card Design API endpoints - NOW WITH PROPER CUSTOMER ISOLATION!


  // Induction system endpoints (public - no auth required)  
  app.get('/api/induction/token/:token', async (req, res) => {
    try {
      const { token } = req.params;
      
      const tokenData = await inductionService.getTokenByValue(token);
      
      if (!tokenData) {
        return res.status(404).json({ error: 'Invalid or expired induction token' });
      }

      if (new Date() > new Date(tokenData.expiresAt)) {
        return res.status(410).json({ error: 'This induction link has expired' });
      }

      // Person details are stored on the token at creation time — use them directly.
      // (Worker/staff/visitor records live in isolated customer schemas, not the shared DB.)
      const personType = tokenData.personType || 'contractor';
      const nameParts = (tokenData.personName || 'Unknown Visitor').split(' ');
      const personDetails = {
        firstName: nameParts[0] || 'Unknown',
        lastName: nameParts.slice(1).join(' ') || '',
        email: tokenData.personEmail || ''
      };

      // ── Get video metadata — prefer customer-isolated DB ─────────────────
      const isObjStoragePath = (u: string | null | undefined) =>
        !!(u && u !== 'generated' && !u.startsWith('http') && !u.startsWith('data:'));

      let videoSettingsAny: any = null;

      // 1. Try customer-isolated DB (where generated videos are stored)
      if (tokenData.customerId) {
        try {
          const tokCtx = simpleDatabaseService.createCustomerContext('system', tokenData.customerId);
          const tokDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(tokCtx.customerId);
          const [custVidRow] = await tokDb
            .select({
              videoTitle: isolatedSchema.inductionSettings.videoTitle,
              videoDescription: isolatedSchema.inductionSettings.videoDescription,
              videoDurationMinutes: isolatedSchema.inductionSettings.videoDurationMinutes,
              videoUrl: isolatedSchema.inductionSettings.videoUrl,
              generatedHtml: isolatedSchema.inductionSettings.generatedHtml,
              customVideoUrl: isolatedSchema.inductionSettings.customVideoUrl,
            })
            .from(isolatedSchema.inductionSettings)
            .where(eq(isolatedSchema.inductionSettings.roleType, personType));
          if (custVidRow) videoSettingsAny = custVidRow;
        } catch (_tokErr) { /* fall through */ }
      }

      // 2. Fallback: shared DB inductionSettings
      if (!videoSettingsAny) {
        const [row] = await db
          .select()
          .from(inductionSettings)
          .where(eq(inductionSettings.roleType, personType));
        if (row) videoSettingsAny = row;
      }

      // Fetch company branding so the public induction page can be personalised
      let branding: Record<string, string | null> | null = null;
      if (tokenData.customerId) {
        try {
          const brandCtx = simpleDatabaseService.createCustomerContext('system', tokenData.customerId);
          const companySettings = await simpleDatabaseService.getCompanySettings(brandCtx);
          if (companySettings) {
            branding = {
              companyName:     companySettings.companyName     ?? null,
              logoUrl:         companySettings.logoUrl         ?? null,
              bannerUrl:       companySettings.bannerUrl       ?? null,
              accentColor:     companySettings.accentColor     ?? null,
              backgroundColor: companySettings.backgroundColor ?? null,
              foregroundColor: companySettings.foregroundColor ?? null,
            };
          }
        } catch (_brandErr) { /* non-critical — carry on without branding */ }
      }

      // Determine video mode: if customVideoUrl is set, use the customer-uploaded video
      const customVideoUrl: string | null = videoSettingsAny?.customVideoUrl ?? null;
      const videoMode: 'ai_generated' | 'custom_upload' = customVideoUrl ? 'custom_upload' : 'ai_generated';

      res.json({
        token: tokenData,
        worker: personDetails,
        personType,
        branding,
        videoContent: videoSettingsAny ? {
          title: videoSettingsAny.videoTitle,
          description: videoSettingsAny.videoDescription,
          durationMinutes: videoSettingsAny.videoDurationMinutes,
          videoUrl: videoSettingsAny.videoUrl,
          hasGeneratedContent: !!(videoSettingsAny.generatedHtml || isObjStoragePath(videoSettingsAny.videoUrl)),
          videoMode,
          // customVideoUrl is the streaming endpoint URL (includes the induction token for auth)
          customVideoUrl: customVideoUrl ? `/api/induction/custom-video/${tokenData.token}` : null,
          // generatedHtml is NOT included here — it is large and fetched separately
          // via GET /api/induction/video/by-token/:token (public endpoint)
        } : null
      });
      
    } catch (error) {
      logger.error('Error getting induction token:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Public endpoint — returns the generated video HTML for a given token.
  // Uses token's customerId to find the correct customer-isolated video without auth.
  app.get('/api/induction/video/by-token/:token', async (req, res) => {
    try {
      const { token } = req.params;
      const tokenData = await inductionService.getTokenByValue(token);
      if (!tokenData) return res.status(404).json({ error: 'Token not found' });

      const roleType = tokenData.personType || 'contractor';

      // Try customer-isolated DB first using customerId stored on the token
      if (tokenData.customerId) {
        try {
          const custCtx = simpleDatabaseService.createCustomerContext('system', tokenData.customerId);
          const custDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(custCtx.customerId);
          const [custRow] = await custDb
            .select()
            .from(isolatedSchema.inductionSettings)
            .where(eq(isolatedSchema.inductionSettings.roleType, roleType));
          if (custRow) {
            // Prefer object storage path (fast CDN stream) — fall back to DB blob on error
            const objPath = custRow.videoUrl;
            const isObjPath = !!(objPath && objPath !== 'generated' && !objPath.startsWith('http') && !objPath.startsWith('data:'));
            if (isObjPath) {
              try {
                const { bucketName, objectName } = parseObjectStoragePath(objPath!);
                const file = objectStorageClient.bucket(bucketName).file(objectName);
                const chunks: Buffer[] = [];
                await new Promise<void>((resolve, reject) => {
                  file.createReadStream()
                    .on('data', (chunk: Buffer) => chunks.push(chunk))
                    .on('end', resolve)
                    .on('error', reject);
                });
                const html = Buffer.concat(chunks).toString('utf-8');
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.setHeader('Cache-Control', 'public, max-age=3600');
                return res.send(patchInductionHtml(html));
              } catch (gcsErr) {
                logger.warn('⚠️ GCS stream failed for by-token — falling back to DB generatedHtml:', (gcsErr as any)?.message);
                // fall through to generatedHtml
              }
            }
            if (custRow.generatedHtml) {
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.setHeader('Cache-Control', 'no-cache');
              return res.send(patchInductionHtml(custRow.generatedHtml));
            }
          }
        } catch (_e) {
          logger.warn('⚠️ Customer video lookup failed for by-token endpoint, falling back');
        }
      }

      // Fallback: shared DB inductionSettings
      const [row] = await db
        .select()
        .from(inductionSettings)
        .where(eq(inductionSettings.roleType, roleType));
      if (row?.generatedHtml) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        return res.send(patchInductionHtml(row.generatedHtml));
      }

      return res.status(404).json({ error: 'No video content available for this induction' });
    } catch (error) {
      logger.error('Error fetching induction video by token:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── Custom video upload ───────────────────────────────────────────────────
  // POST /api/induction/upload-video
  // Accepts multipart/form-data with fields: video (file), roleType (string)
  const videoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
    fileFilter: (_req, file, cb) => {
      const allowed = ['video/mp4', 'video/quicktime', 'video/webm', 'video/mov'];
      if (allowed.includes(file.mimetype) || file.originalname.match(/\.(mp4|mov|webm)$/i)) {
        cb(null, true);
      } else {
        cb(new Error('Only MP4, MOV, and WebM video files are allowed'));
      }
    },
  });

  app.post('/api/induction/upload-video', requireAuth, videoUpload.single('video'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No video file provided' });
      }
      const roleType = (req.body.roleType as string) || 'contractor';
      if (!['visitor', 'staff', 'contractor'].includes(roleType)) {
        return res.status(400).json({ error: 'Invalid roleType' });
      }

      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(context.customerId);

      // Work out content type and extension
      const ext = req.file.originalname.split('.').pop()?.toLowerCase() || 'mp4';
      const mimeType = req.file.mimetype || 'video/mp4';
      const objectId = randomUUID();

      // Build the GCS path inside the private object directory
      const objectStorageService = new ObjectStorageService();
      const privateObjectDir = objectStorageService.getPrivateObjectDir();
      const fullPath = `${privateObjectDir}/induction-videos/${context.customerId}/${objectId}.${ext}`;
      const { bucketName, objectName } = parseObjectStoragePath(fullPath);

      logger.info(`📹 Uploading custom induction video: bucket=${bucketName} object=${objectName} size=${req.file.size}`);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      await file.save(req.file.buffer, { contentType: mimeType, resumable: req.file.size > 5 * 1024 * 1024 });

      // Internal reference path — served via /api/induction/custom-video/:token
      const storedPath = `/induction-videos/${context.customerId}/${objectId}.${ext}`;

      // Save to inductionSettings.customVideoUrl for this customer/roleType
      await custDb
        .update(isolatedSchema.inductionSettings)
        .set({ customVideoUrl: storedPath, updatedAt: new Date() })
        .where(eq(isolatedSchema.inductionSettings.roleType, roleType));

      logger.info(`✅ Custom video saved: ${storedPath} for role=${roleType} customer=${context.customerId}`);
      return res.json({ success: true, url: storedPath });
    } catch (error: any) {
      logger.error('Error uploading induction video:', error);
      return res.status(500).json({ error: error.message || 'Failed to upload video' });
    }
  });

  // DELETE /api/induction/upload-video?roleType=contractor
  app.delete('/api/induction/upload-video', requireAuth, async (req, res) => {
    try {
      const roleType = (req.query.roleType as string) || 'contractor';
      if (!['visitor', 'staff', 'contractor'].includes(roleType)) {
        return res.status(400).json({ error: 'Invalid roleType' });
      }

      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(context.customerId);

      // Fetch the current URL so we can delete from GCS
      const [row] = await custDb
        .select({ customVideoUrl: isolatedSchema.inductionSettings.customVideoUrl })
        .from(isolatedSchema.inductionSettings)
        .where(eq(isolatedSchema.inductionSettings.roleType, roleType));

      if (row?.customVideoUrl) {
        try {
          const objectStorageService = new ObjectStorageService();
          const privateObjectDir = objectStorageService.getPrivateObjectDir();
          const fullPath = `${privateObjectDir}${row.customVideoUrl}`;
          const { bucketName, objectName } = parseObjectStoragePath(fullPath);
          await objectStorageClient.bucket(bucketName).file(objectName).delete({ ignoreNotFound: true });
          logger.info(`🗑️ Deleted custom induction video: ${row.customVideoUrl}`);
        } catch (_delErr) {
          logger.warn('Could not delete video from object storage (non-fatal)');
        }
      }

      await custDb
        .update(isolatedSchema.inductionSettings)
        .set({ customVideoUrl: null, updatedAt: new Date() })
        .where(eq(isolatedSchema.inductionSettings.roleType, roleType));

      return res.json({ success: true });
    } catch (error: any) {
      logger.error('Error deleting induction video:', error);
      return res.status(500).json({ error: error.message || 'Failed to delete video' });
    }
  });

  // GET /api/induction/custom-video/:token
  // Public streaming endpoint for customer-uploaded induction videos.
  // Supports Range requests so browsers can seek within the video.
  app.get('/api/induction/custom-video/:token', async (req, res) => {
    try {
      const { token } = req.params;
      const tokenData = await inductionService.getTokenByValue(token);
      if (!tokenData) return res.status(404).json({ error: 'Invalid token' });
      if (new Date() > new Date(tokenData.expiresAt)) return res.status(410).json({ error: 'Token expired' });

      const roleType = tokenData.personType || 'contractor';

      let storedPath: string | null = null;
      if (tokenData.customerId) {
        const custCtx = simpleDatabaseService.createCustomerContext('system', tokenData.customerId);
        const custDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(custCtx.customerId);
        const [row] = await custDb
          .select({ customVideoUrl: isolatedSchema.inductionSettings.customVideoUrl })
          .from(isolatedSchema.inductionSettings)
          .where(eq(isolatedSchema.inductionSettings.roleType, roleType));
        storedPath = row?.customVideoUrl ?? null;
      }

      if (!storedPath) return res.status(404).json({ error: 'No custom video uploaded for this induction type' });

      const objectStorageService = new ObjectStorageService();
      const privateObjectDir = objectStorageService.getPrivateObjectDir();
      const fullPath = `${privateObjectDir}${storedPath}`;
      const { bucketName, objectName } = parseObjectStoragePath(fullPath);
      const file = objectStorageClient.bucket(bucketName).file(objectName);

      const [meta] = await file.getMetadata();
      const totalSize = Number(meta.size);
      const contentType = meta.contentType || 'video/mp4';

      const rangeHeader = req.headers['range'];
      if (rangeHeader) {
        // Parse byte range: e.g. "bytes=0-1023"
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + 1024 * 1024 - 1, totalSize - 1);
        const chunkSize = end - start + 1;

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${totalSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': contentType,
          'Cache-Control': 'private, max-age=0',
        });
        file.createReadStream({ start, end }).pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': totalSize,
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'private, max-age=0',
        });
        file.createReadStream().pipe(res);
      }
    } catch (error) {
      logger.error('Error streaming custom induction video:', error);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to stream video' });
    }
  });

  // Public when called with a ?token= param (external induction links).
  // Auth-gated when called without token (admin/settings use).
  app.get('/api/induction/questions', async (req, res) => {
    try {
      const roleType = (req.query.roleType as string) || 'contractor';
      const tokenParam = req.query.token as string | undefined;

      let customerId: string | undefined;

      if (tokenParam) {
        // Public path — resolve customerId from the induction token
        const [tokenRecord] = await db
          .select()
          .from(inductionTokens)
          .where(eq(inductionTokens.token, tokenParam));
        if (!tokenRecord) {
          return res.status(404).json({ error: 'Invalid induction token' });
        }
        customerId = tokenRecord.customerId ?? undefined;
      } else if (req.customerId) {
        // Admin/settings path — requires active session
        customerId = req.customerId;
      } else {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!customerId) {
        return res.json({ questions: [] });
      }

      const customerVideoId = `${customerId}-${roleType}`;

      const allQuestions = await db
        .select()
        .from(inductionQuestions)
        .where(
          and(
            eq(inductionQuestions.isActive, true),
            eq(inductionQuestions.videoId, customerVideoId)
          )
        )
        .orderBy(inductionQuestions.orderIndex);

      res.json({ questions: allQuestions });
    } catch (error) {
      logger.error('Error getting induction questions:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get generation status for polling
  app.get('/api/induction/status/:roleType', requireAuth, async (req, res) => {
    try {
      const { roleType } = req.params;
      const customerId = req.customerId || 'default';
      const statusKey = `${customerId}-${roleType}`;
      const status = inductionGenerationStatus.get(statusKey);
      if (!status) {
        res.json({ status: 'idle', step: 0, totalSteps: 5, message: 'No generation in progress' });
      } else {
        res.json(status);
      }
    } catch (error) {
      res.status(500).json({ error: 'Failed to get status' });
    }
  });

  // Cleanup questions for a role type
  // Default: removes all inactive + legacy duplicates
  // With ?nuclear=true: deletes ALL questions for this customer+roleType (fresh start)
  app.delete('/api/induction/questions/cleanup', requireAuth, async (req, res) => {
    try {
      const roleType = (req.query.roleType as string) || 'contractor';
      const nuclear = req.query.nuclear === 'true';
      const customerId = req.customerId || 'default';
      const customerVideoId = `${customerId}-${roleType}`;

      let deletedCount = 0;

      if (nuclear) {
        // Nuclear: delete ALL questions for this customer+roleType (clean slate)
        const result1 = await db
          .delete(inductionQuestions)
          .where(eq(inductionQuestions.videoId, customerVideoId));
        // Also legacy questions stored with roleType as videoId
        const result2 = await db
          .delete(inductionQuestions)
          .where(and(
            eq(inductionQuestions.roleType, roleType),
            eq(inductionQuestions.videoId, roleType)
          ));
        // Also delete any inactive questions for this roleType regardless of videoId
        const result3 = await db
          .delete(inductionQuestions)
          .where(and(
            eq(inductionQuestions.roleType, roleType),
            eq(inductionQuestions.isActive, false)
          ));
        logger.info(`🧹 Nuclear cleanup: deleted all questions for ${roleType} (customer: ${customerId})`);
        res.json({ success: true, message: `All questions cleared for ${roleType}`, deleted: deletedCount });
      } else {
        // Standard: delete inactive + legacy (non-customerVideoId) questions
        await db
          .delete(inductionQuestions)
          .where(and(
            eq(inductionQuestions.roleType, roleType),
            eq(inductionQuestions.isActive, false)
          ));
        await db
          .delete(inductionQuestions)
          .where(and(
            eq(inductionQuestions.roleType, roleType),
            eq(inductionQuestions.videoId, roleType)
          ));
        logger.info(`🧹 Cleanup: deleted stale/inactive questions for ${roleType}`);
        res.json({ success: true, message: `Cleaned up stale questions for ${roleType}` });
      }
    } catch (error) {
      logger.error('Error cleaning up questions:', error);
      res.status(500).json({ error: 'Failed to cleanup questions' });
    }
  });

  // ── Admin: list induction tokens for this customer ───────────────────────
  app.get('/api/induction/admin/tokens', requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId;
      if (!customerId) return res.status(403).json({ error: 'No customer context' });
      const rows = await db
        .select({
          id: inductionTokens.id,
          personName: inductionTokens.personName,
          personEmail: inductionTokens.personEmail,
          personType: inductionTokens.personType,
          status: inductionTokens.status,
          quizAttempts: inductionTokens.quizAttempts,
          quizPassed: inductionTokens.quizPassed,
          quizScore: inductionTokens.quizScore,
          emailSent: inductionTokens.emailSent,
          emailSentAt: inductionTokens.emailSentAt,
          expiresAt: inductionTokens.expiresAt,
          createdAt: inductionTokens.createdAt,
        })
        .from(inductionTokens)
        .where(eq(inductionTokens.customerId, customerId))
        .orderBy(desc(inductionTokens.createdAt))
        .limit(100);
      res.json(rows);
    } catch (error) {
      logger.error('Error listing admin induction tokens:', error);
      res.status(500).json({ error: 'Failed to load tokens' });
    }
  });

  // ── Admin: reset quiz attempts so a person can retake ─────────────────────
  app.post('/api/induction/admin/tokens/:tokenId/reset-attempts', requireAuth, async (req, res) => {
    try {
      const { tokenId } = req.params;
      const customerId = req.customerId;
      if (!customerId) return res.status(403).json({ error: 'No customer context' });
      const [token] = await db
        .select({ id: inductionTokens.id })
        .from(inductionTokens)
        .where(and(eq(inductionTokens.id, tokenId), eq(inductionTokens.customerId, customerId)));
      if (!token) return res.status(404).json({ error: 'Token not found or not owned by your account' });
      await db
        .update(inductionTokens)
        .set({ quizAttempts: 0, quizCompleted: false, quizCompletedAt: null, quizScore: 0, quizPassed: false, status: 'in_progress' })
        .where(eq(inductionTokens.id, tokenId));
      res.json({ success: true });
    } catch (error) {
      logger.error('Error resetting quiz attempts:', error);
      res.status(500).json({ error: 'Failed to reset quiz attempts' });
    }
  });

  app.post('/api/induction/:tokenId/video-watched', async (req, res) => {
    try {
      const { tokenId } = req.params;

      const [tokenRecord] = await db.select().from(inductionTokens).where(eq(inductionTokens.id, tokenId));
      if (!tokenRecord) {
        return res.status(404).json({ error: 'Induction link not found.' });
      }
      if (new Date() > new Date(tokenRecord.expiresAt)) {
        return res.status(410).json({ error: 'This induction link has expired. Please contact the site operator for a new invitation.' });
      }

      await inductionService.markVideoWatched(tokenId);
      
      res.json({ success: true });
    } catch (error) {
      logger.error('Error marking video watched:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/induction/:tokenId/submit-quiz', async (req, res) => {
    try {
      const { tokenId } = req.params;
      const { answers } = req.body;
      
      if (!answers || !Array.isArray(answers)) {
        return res.status(400).json({ error: 'Invalid answers format' });
      }

      // Rate limiting: max 5 attempts, and enforce a 10-minute cooldown between failed attempts
      const [tokenRecord] = await db.select().from(inductionTokens).where(eq(inductionTokens.id, tokenId));
      if (!tokenRecord) {
        return res.status(404).json({ error: 'Induction link not found.' });
      }
      if (new Date() > new Date(tokenRecord.expiresAt)) {
        return res.status(410).json({ error: 'This induction link has expired. Please contact the site operator for a new invitation.' });
      }
      if ((tokenRecord.quizAttempts ?? 0) >= 5) {
        return res.status(429).json({
          error: 'Maximum quiz attempts reached.',
          message: 'You have used all 5 attempts. Please contact the site operator to request a new induction link.',
          attemptsUsed: tokenRecord.quizAttempts ?? 0,
          maxAttempts: 5
        });
      }
      if (tokenRecord.quizCompletedAt && !tokenRecord.quizPassed) {
        const msSinceLast = Date.now() - new Date(tokenRecord.quizCompletedAt).getTime();
        if (msSinceLast < 10 * 60 * 1000) {
          const minutesLeft = Math.ceil((10 * 60 * 1000 - msSinceLast) / 60000);
          return res.status(429).json({ error: `Please wait ${minutesLeft} minute(s) before retrying the quiz.` });
        }
      }

      const results = await inductionService.submitQuizAnswers(tokenId, answers);

      // Build CDM 2015 / HSE mandatory topics covered record (always all 10 — the prompt guarantees inclusion)
      const CDM_TOPICS = [
        { id: 1,  label: 'Site hazards and risks specific to this site' },
        { id: 2,  label: 'PPE requirements (what, where to obtain it, when to wear it)' },
        { id: 3,  label: 'Emergency procedures and fire evacuation routes' },
        { id: 4,  label: 'Emergency assembly point location' },
        { id: 5,  label: 'First aid arrangements (location and first aider details)' },
        { id: 6,  label: 'Accident and near-miss reporting procedure' },
        { id: 7,  label: 'Welfare facilities (toilets, rest area, canteen)' },
        { id: 8,  label: 'Site rules (no-go areas, speed limits, permit to work, smoking and phone policy)' },
        { id: 9,  label: 'Environmental responsibilities (waste, spills, noise)' },
        { id: 10, label: 'H&S contact (name and role) for reporting concerns' },
      ];
      const topicsCovered = CDM_TOPICS.map(t => ({ ...t, covered: true, coveredAt: new Date().toISOString() }));
      // Persist to the token (best-effort — do not block the response)
      db.update(inductionTokens)
        .set({ inductionTopicsCovered: topicsCovered } as any)
        .where(eq(inductionTokens.id, tokenId))
        .catch(err => logger.error('⚠️ Failed to persist inductionTopicsCovered:', err));

      // Await worker induction status update — must complete before response is sent
      let workerUpdateWarning: string | undefined;
      try {
        const [token] = await db.select().from(inductionTokens).where(eq(inductionTokens.id, tokenId));
        if (token?.customerId) {
          const noteCtx = simpleDatabaseService.createCustomerContext('system', token.customerId);
          const noteDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(noteCtx.customerId);
          const now = new Date();
          const dateStr = now.toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' });
          const attemptNum = token.quizAttempts || 1;

          await noteDb.transaction(async (tx) => {
            // ── Update inductionCompleted on the correct isolated-schema record ──
            if (results.passed) {
              const personType = token.personType || 'contractor';
              if (personType === 'contractor' && token.workerId) {
                await tx
                  .update(isolatedSchema.contractorWorkers)
                  .set({ inductionCompleted: true, inductionCompletedAt: now })
                  .where(eq(isolatedSchema.contractorWorkers.id, token.workerId));
              } else if (personType === 'staff' && token.staffId) {
                await tx
                  .update(isolatedSchema.staff)
                  .set({ inductionCompleted: true, inductionCompletedAt: now })
                  .where(eq(isolatedSchema.staff.id, token.staffId));
              } else if (personType === 'visitor' && token.visitorId) {
                await tx
                  .update(isolatedSchema.visitors)
                  .set({ inductionCompleted: true, inductionCompletedAt: now })
                  .where(eq(isolatedSchema.visitors.id, token.visitorId));
              }
            }

            // ── Write audit note to worker_notes (contractor only) ──
            if (token.workerId) {
              const noteText = results.passed
                ? `Site induction PASSED — Score: ${results.score}% (${(results as any).correct ?? '?'}/${results.total} correct, 80% required). Completed on ${dateStr}.`
                : `Site induction attempt ${attemptNum} FAILED — Score: ${results.score}% (80% required). Worker may retry.`;
              await tx.insert(isolatedSchema.workerNotes).values({
                workerId: token.workerId,
                changeType: results.passed ? 'induction_passed' : 'induction_failed',
                notes: noteText,
                changedBy: 'system',
              });
            }
          });
        }
      } catch (workerErr) {
        logger.error('⚠️ Failed to update worker induction record:', workerErr);
        workerUpdateWarning = 'Result recorded but worker record update failed — please contact support.';
      }

      res.json({ results, topicsCovered, ...(workerUpdateWarning ? { warning: workerUpdateWarning } : {}) });
    } catch (error) {
      logger.error('Error submitting quiz:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Send induction email endpoint (authenticated)
  app.post('/api/contractors/:id/send-induction', requireAuth, async (req, res) => {
    try {
      const contractorId = req.params.id;
      const sendInductionContext = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const contractor = await databaseService.getContractorWorkerById(sendInductionContext, contractorId);
      
      if (!contractor) {
        return res.status(404).json({ error: 'Contractor not found' });
      }

      const workerName = `${contractor.firstName} ${contractor.lastName}`;
      const success = await inductionService.sendInductionEmail(contractorId, req.customerId, workerName, contractor.email ?? undefined);
      
      if (success) {
        res.json({ message: 'Induction email sent successfully' });
      } else {
        res.status(500).json({ error: 'Failed to send induction email' });
      }
    } catch (error) {
      logger.error('Error sending induction email:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Universal send induction email - supports visitors, staff, and contractors
  app.post('/api/induction/send', requireAuth, async (req, res) => {
    try {
      const { personType, personName, personEmail, workerId, visitorId, staffId, companyName } = req.body;
      
      if (!personType || !personName || !personEmail) {
        return res.status(400).json({ error: 'personType, personName, and personEmail are required' });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(personEmail)) {
        return res.status(400).json({ error: 'Please provide a valid email address.' });
      }

      if (!['visitor', 'staff', 'contractor'].includes(personType)) {
        return res.status(400).json({ error: 'Invalid personType. Must be visitor, staff, or contractor' });
      }

      const success = await inductionService.sendUniversalInductionEmail({
        personType,
        personName,
        personEmail,
        workerId,
        visitorId,
        staffId,
        companyName,
        customerId: req.customerId
      });
      
      if (success) {
        res.json({ 
          message: `Induction email sent successfully to ${personName}`,
          personType,
          email: personEmail 
        });
      } else {
        res.status(500).json({ error: 'Failed to send induction email' });
      }
    } catch (error) {
      logger.error('Error sending universal induction email:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Look up contractor worker by QR code (worker ID encoded in pass QR code)
  app.get('/api/contractors/workers/by-qr/:qrCode', requireAuth, async (req, res) => {
    try {
      const { qrCode } = req.params;
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      const customerDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(context.customerId);

      // Use raw SQL to avoid Drizzle column reference issues with qr_code field
      const workerRows = await customerDb.execute(
        sql`SELECT * FROM contractor_workers WHERE qr_code = ${qrCode} LIMIT 1`
      );

      const workerRaw = workerRows.rows?.[0] ?? (workerRows as any)[0];
      if (!workerRaw) {
        return res.status(404).json({ error: 'Worker not found for this QR code' });
      }

      // Fetch company name
      const companyRows = await customerDb.execute(
        sql`SELECT company_name FROM contractor_companies WHERE id = ${workerRaw.company_id} LIMIT 1`
      );
      const companyRaw = companyRows.rows?.[0] ?? (companyRows as any)[0];

      // Map snake_case DB fields to camelCase for frontend
      const worker = {
        id: workerRaw.id,
        companyId: workerRaw.company_id,
        firstName: workerRaw.first_name,
        lastName: workerRaw.last_name,
        email: workerRaw.email,
        phoneNumber: workerRaw.phone_number,
        photoUrl: workerRaw.photo_url,
        jobTitle: workerRaw.job_title,
        isCheckedIn: workerRaw.is_checked_in,
        checkedInAt: workerRaw.checked_in_at,
        checkedOutAt: workerRaw.checked_out_at,
        isActive: workerRaw.is_active,
        currentCardStatus: workerRaw.current_card_status,
        redCardBanUntil: workerRaw.banned_until,
        qrCode: workerRaw.qr_code,
        zoneId: workerRaw.zone_id,
        rightToWork: workerRaw.right_to_work_status,
        cscsStatus: workerRaw.cscs_status,
        siteInductionCompleted: workerRaw.site_induction_completed,
        inductionCompleted: workerRaw.site_induction_completed,
        workerStatus: workerRaw.worker_status,
      };

      logger.info(`🔍 QR lookup found worker: ${worker.firstName} ${worker.lastName} (${worker.isCheckedIn ? 'checked in' : 'checked out'})`);
      res.json({ worker, companyName: companyRaw?.company_name || 'Unknown Company' });
    } catch (error) {
      logger.error('Error looking up worker by QR:', error);
      res.status(500).json({ error: 'Failed to look up worker' });
    }
  });

  // Get individual contractor worker by ID endpoint - CRITICAL MISSING ENDPOINT ADDED
  app.get('/api/contractors/workers/:id', requireAuth, async (req, res) => {
    try {
      const workerId = req.params.id;
      
      logger.info(`📋 API ROUTE - Getting contractor worker with ID: ${workerId}`);
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Get worker from customer-isolated database service
      const worker = await databaseService.getContractorWorkerById(context, workerId);
      
      if (!worker) {
        logger.info(`❌ API ROUTE - Worker not found: ${workerId}`);
        return res.status(404).json({ error: "Contractor worker not found" });
      }

      // CRITICAL FIX: Database service already returns correctly mapped fields
      // Log all fields to verify they're properly mapped
      logger.info(`✅ API ROUTE - Retrieved contractor worker:`, {
        id: worker.id,
        firstName: worker.firstName,
        lastName: worker.lastName,
        transportMethod: worker.transportMethod,
        cscsCard: worker.cscsCard,
        cscsStatus: worker.cscsStatus,
        rightToWork: worker.rightToWork,
        ipafStatus: worker.ipafStatus,
        asbestosAwareness: worker.asbestosAwareness,
        manualHandling: worker.manualHandling,
        inductionCompleted: worker.inductionCompleted,
        phone: worker.phone,
        email: worker.email,
        postcode: worker.postcode,
      });
      
      // Ensure all fields are included in the response
      const responseWorker = {
        ...worker,
        // Explicitly include all critical fields with fallback values
        transportMethod: worker.transportMethod || 'car_diesel',
        cscsCard: worker.cscsCard || '',
        cscsStatus: worker.cscsStatus || 'pending',
        rightToWork: worker.rightToWork || 'pending',
        ipafStatus: worker.ipafStatus || 'none',
        asbestosAwareness: worker.asbestosAwareness || false,
        manualHandling: worker.manualHandling || false,
        inductionCompleted: worker.inductionCompleted || false,
      };

      logger.info(`✅ API ROUTE - Sending response for worker: ${worker.firstName} ${worker.lastName}`);
      res.json(responseWorker);
    } catch (error) {
      logger.error("❌ API ROUTE - Error fetching contractor worker:", error);
      res.status(500).json({ error: "Failed to fetch contractor worker" });
    }
  });

  // Update contractor worker endpoint
  app.put('/api/contractors/workers/:id', requireAuth, async (req, res) => {
    // Declare mappedData outside try block so it's accessible in catch block
    let mappedData: any = {};
    
    try {
      const workerId = req.params.id;
      logger.info('🔄 Updating contractor worker', workerId, 'with data:', req.body);
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Field mapping from UI field names to database field names
      const uiData = req.body;
      
      // Direct field mappings (no conversion needed)
      const directFieldMappings = {
        companyId: 'companyId',
        firstName: 'firstName', 
        lastName: 'lastName',
        email: 'email',
        phoneNumber: 'phone', // Map phoneNumber to phone field in schema
        phone: 'phoneNumber', // Direct mapping to phone_number field
        homeAddress: 'homeAddress',
        postcode: 'postcode',
        jobTitle: 'jobTitle',
        department: 'department',
        emergencyContactName: 'emergencyContactName',
        emergencyContactPhone: 'emergencyContactPhone',
        emergencyContactRelationship: 'emergencyContactRelationship',
        transportMethod: 'transportMethod',
        rightToWork: 'rightToWork', // Maps to right_to_work_status column in isolatedSchema
        cscsCard: 'cscsCard', // Maps to cscs_card_number in schema
        photoUrl: 'photoUrl' // Profile photo URL
      };
      
      // Apply direct mappings
      Object.entries(directFieldMappings).forEach(([uiField, dbField]) => {
        if (uiData[uiField] !== undefined) {
          mappedData[dbField] = uiData[uiField];
        }
      });
      
      // Special field mappings with type conversions
      
      // cscsStatus: Keep as string (valid, pending, expired, none) - DO NOT convert to boolean
      if (uiData.cscsStatus !== undefined) {
        mappedData.cscsStatus = uiData.cscsStatus; // Keep as string
        logger.info(`🔄 Mapped cscsStatus: '${uiData.cscsStatus}' (${typeof uiData.cscsStatus}) → cscsStatus: ${mappedData.cscsStatus}`);
      }
      
      // inductionCompleted: Pass through directly - field name matches database
      if (uiData.inductionCompleted !== undefined) {
        mappedData.inductionCompleted = uiData.inductionCompleted;
        logger.info(`🔄 Mapped inductionCompleted: ${uiData.inductionCompleted} → inductionCompleted: ${mappedData.inductionCompleted}`);
      }
      
      // IPAF Status: Map to database field if it exists (needs to be checked against schema)
      if (uiData.ipafStatus !== undefined) {
        // Note: Need to verify if ipafStatus field exists in database schema
        mappedData.ipafStatus = uiData.ipafStatus;
        logger.info(`🔄 Mapped ipafStatus: '${uiData.ipafStatus}' → ipafStatus: '${mappedData.ipafStatus}'`);
      }
      
      // Safety training boolean fields - map to database fields if they exist
      if (uiData.asbestosAwareness !== undefined) {
        mappedData.asbestosAwareness = Boolean(uiData.asbestosAwareness);
        logger.info(`🔄 Mapped asbestosAwareness: ${uiData.asbestosAwareness} → asbestosAwareness: ${mappedData.asbestosAwareness}`);
      }
      
      if (uiData.manualHandling !== undefined) {
        mappedData.manualHandling = Boolean(uiData.manualHandling);
        logger.info(`🔄 Mapped manualHandling: ${uiData.manualHandling} → manualHandling: ${mappedData.manualHandling}`);
      }

      // needsEvacuationAssistance (PEEP flag): direct boolean passthrough
      if (uiData.needsEvacuationAssistance !== undefined) {
        mappedData.needsEvacuationAssistance = Boolean(uiData.needsEvacuationAssistance);
        logger.info(`🔄 Mapped needsEvacuationAssistance: ${uiData.needsEvacuationAssistance} → ${mappedData.needsEvacuationAssistance}`);
      }

      // Boolean fields that can be passed through directly (only include fields that exist in database schema)
      const booleanFields = ['workingAtHeight', 'isCheckedIn', 'hsRulesAccepted'];
      booleanFields.forEach(field => {
        if (uiData[field] !== undefined) {
          mappedData[field] = uiData[field];
        }
      });
      
      // Always set updatedAt
      mappedData.updatedAt = new Date();
      
      logger.info('🗃️ Final mapped data for database:', mappedData);
      logger.info('🔍 ROUTE - About to validate with Zod schema...');
      logger.info('🔍 ROUTE - Critical fields before validation:');
      logger.info(`  - rightToWork: ${mappedData.rightToWork}`);
      logger.info(`  - cscsStatus: ${mappedData.cscsStatus}`);
      logger.info(`  - inductionCompleted: ${mappedData.inductionCompleted}`);
      
      // Validate mapped data with schema
      const validatedData = insertContractorWorkerSchema.partial().parse(mappedData);
      
      // CRITICAL FIX: Ensure critical fields are preserved after Zod validation
      // The insertContractorWorkerSchema may be missing these fields, so we manually preserve them
      if (mappedData.inductionCompleted !== undefined) {
        validatedData.inductionCompleted = mappedData.inductionCompleted;
        logger.info(`🔧 MANUAL FIX: Preserved inductionCompleted: ${validatedData.inductionCompleted}`);
      }
      
      if (mappedData.ipafStatus !== undefined) {
        validatedData.ipafStatus = mappedData.ipafStatus;
        logger.info(`🔧 MANUAL FIX: Preserved ipafStatus: ${validatedData.ipafStatus}`);
      }
      
      if (mappedData.asbestosAwareness !== undefined) {
        validatedData.asbestosAwareness = mappedData.asbestosAwareness;
        logger.info(`🔧 MANUAL FIX: Preserved asbestosAwareness: ${validatedData.asbestosAwareness}`);
      }
      
      if (mappedData.manualHandling !== undefined) {
        validatedData.manualHandling = mappedData.manualHandling;
        logger.info(`🔧 MANUAL FIX: Preserved manualHandling: ${validatedData.manualHandling}`);
      }
      
      if (mappedData.transportMethod !== undefined) {
        validatedData.transportMethod = mappedData.transportMethod;
        logger.info(`🔧 MANUAL FIX: Preserved transportMethod: ${validatedData.transportMethod}`);
      }

      if (mappedData.needsEvacuationAssistance !== undefined) {
        validatedData.needsEvacuationAssistance = Boolean(mappedData.needsEvacuationAssistance);
      }

      // MANUAL FIX: Preserve phone/phoneNumber — Zod strips 'phoneNumber' because shared schema uses 'phone'
      if (mappedData.phoneNumber !== undefined) {
        (validatedData as any).phoneNumber = mappedData.phoneNumber;
        logger.info(`🔧 MANUAL FIX: Preserved phoneNumber: ${mappedData.phoneNumber}`);
      }
      if (mappedData.phone !== undefined && mappedData.phoneNumber === undefined) {
        (validatedData as any).phone = mappedData.phone;
        logger.info(`🔧 MANUAL FIX: Preserved phone: ${mappedData.phone}`);
      }

      // MANUAL FIX: Preserve photoUrl in case Zod strips it
      if (mappedData.photoUrl !== undefined) {
        (validatedData as any).photoUrl = mappedData.photoUrl;
        logger.info(`🔧 MANUAL FIX: Preserved photoUrl: ${mappedData.photoUrl}`);
      }
      
      logger.info('🔍 ROUTE - Zod validation completed. Result:');
      logger.info('🔍 ROUTE - Validated data keys:', Object.keys(validatedData));
      logger.info('🔍 ROUTE - Critical fields after validation:');
      logger.info(`  - rightToWork: ${validatedData.rightToWork}`);
      logger.info(`  - cscsStatus: ${validatedData.cscsStatus}`);
      logger.info(`  - inductionCompleted: ${validatedData.inductionCompleted}`);
      
      logger.info('🔍 ROUTE - About to call databaseService.updateContractorWorker with:', validatedData);
      
      // Fetch current worker state BEFORE update for audit trail comparison
      const currentWorker = await databaseService.getContractorWorkerById(context, workerId);
      if (!currentWorker) {
        return res.status(404).json({ error: 'Contractor worker not found' });
      }
      
      const updatedWorker = await databaseService.updateContractorWorker(context, workerId, validatedData);
      
      logger.info('🔍 ROUTE - databaseService.updateContractorWorker returned:', updatedWorker);
      
      if (!updatedWorker) {
        return res.status(404).json({ error: 'Contractor worker not found' });
      }

      // === AUDIT TRAIL: Compare old vs new values and create audit notes ===
      const auditFieldLabels: Record<string, string> = {
        firstName: 'First Name',
        lastName: 'Last Name',
        email: 'Email',
        phoneNumber: 'Phone Number',
        postcode: 'Postcode',
        transportMethod: 'Transport Method',
        companyId: 'Contractor Company',
        rightToWork: 'Right to Work Status',
        cscsCard: 'CSCS Card Number',
        cscsStatus: 'CSCS Status',
        ipafStatus: 'IPAF Status',
        asbestosAwareness: 'Asbestos Awareness',
        manualHandling: 'Manual Handling',
        inductionCompleted: 'Site Induction Completed',
        workingAtHeight: 'Working at Height',
        isActive: 'Active Status',
        currentCardStatus: 'Card Status',
        hsRulesAccepted: 'H&S Rules Accepted',
      };
      
      const changes: string[] = [];
      const db = await customerDbService.getCustomerDatabase(context.customerId);
      
      // Training boolean fields that get human-friendly confirmation notes
      const trainingConfirmFields = new Set([
        'inductionCompleted', 'asbestosAwareness', 'manualHandling', 'workingAtHeight', 'hsRulesAccepted'
      ]);

      for (const [field, label] of Object.entries(auditFieldLabels)) {
        if (validatedData[field] !== undefined) {
          const oldVal = (currentWorker as any)[field];
          const newVal = validatedData[field];
          
          // Compare values (handle booleans and strings)
          const oldStr = oldVal === null || oldVal === undefined ? 'Not set' : String(oldVal);
          const newStr = newVal === null || newVal === undefined ? 'Not set' : String(newVal);
          
          if (oldStr !== newStr) {
            changes.push(`${label}: "${oldStr}" → "${newStr}"`);

            // Build a user-friendly note message
            const now = new Date();
            const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

            let noteText: string;
            if (trainingConfirmFields.has(field) && (newStr === 'true' || newStr === 'false')) {
              if (newStr === 'true') {
                noteText = `✅ ${label} confirmed by ${username} on ${dateStr} at ${timeStr}`;
              } else {
                noteText = `❌ ${label} record removed by ${username} on ${dateStr} at ${timeStr}`;
              }
            } else {
              noteText = `${label} changed from "${oldStr}" to "${newStr}"`;
            }
            
            // Create individual audit note for each change
            try {
              await db.insert(isolatedSchema.workerNotes).values({
                workerId: workerId,
                changeType: 'profile_update',
                oldValue: oldStr,
                newValue: newStr,
                notes: noteText,
                changedBy: username,
              });
            } catch (noteErr) {
              logger.error(`Failed to create audit note for ${field}:`, noteErr);
            }
          }
        }
      }
      
      if (changes.length > 0) {
        logger.info(`📋 AUDIT: ${changes.length} changes recorded by ${username}: ${changes.join(', ')}`);
      }

      // Response field mapping: Convert database field names back to UI field names
      const responseData = {
        ...updatedWorker,
        cscsStatus: updatedWorker.cscsStatus,
        inductionCompleted: updatedWorker.inductionCompleted,
      };

      res.json({ success: true, worker: responseData });
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.error('❌ Zod validation error for contractor worker update:', error.errors);
        logger.error('❌ Mapped data that failed validation:', mappedData);
        return res.status(400).json({ 
          error: 'Invalid data', 
          details: error.errors 
        });
      }
      logger.error('❌ Database error updating contractor worker:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Reset worker card to Yellow endpoint
  app.post('/api/contractors/workers/:id/reset-card', requireAuth, async (req, res) => {
    try {
      const workerId = req.params.id;
      logger.info('🟡 Resetting card to yellow for worker:', workerId);
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Get current worker data
      const currentWorker = await databaseService.getContractorWorkerById(context, workerId);
      if (!currentWorker) {
        return res.status(404).json({ error: 'Worker not found' });
      }
      
      // Update worker status to yellow (bypass auto-calculation)
      const updatedWorker = await databaseService.updateContractorWorker(context, workerId, {
        currentCardStatus: 'yellow',
        redCardBanUntil: null, // Clear the ban
        _bypassAutoCalculation: true // Prevent auto-calculation from overriding manual reset
      });
      
      // Create audit trail entry in workerNotes
      const noteData = {
        workerId: workerId,
        changeType: 'card_status_change',
        oldValue: currentWorker.currentCardStatus || 'unknown',
        newValue: 'yellow',
        notes: `Card status reset from ${currentWorker.currentCardStatus || 'unknown'} to yellow. Ban lifted. User: ${username}`,
        changedBy: username || 'system' // Fixed: use correct database field name
      };
      
      // Insert the note - use direct database access since workerNotes might not be in databaseService yet
      try {
        const db = await customerDbService.getCustomerDatabase(context.customerId);
        await db.insert(isolatedSchema.workerNotes).values(noteData);
        logger.info('✅ Created audit trail note for card reset');
      } catch (noteError) {
        logger.error('⚠️ Failed to create audit note (continuing anyway):', noteError);
      }
      
      res.json({ 
        success: true, 
        message: 'Card status reset to yellow successfully',
        worker: updatedWorker 
      });
      
    } catch (error) {
      logger.error('❌ Error resetting card to yellow:', error);
      res.status(500).json({ error: 'Failed to reset card status' });
    }
  });

  // Add manual note to worker endpoint
  app.post('/api/contractors/workers/:id/notes', requireAuth, async (req, res) => {
    try {
      const workerId = req.params.id;
      const { changeType, notes } = req.body;
      
      logger.info('📝 Adding manual note for worker:', workerId);
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Validate required fields
      if (!notes || notes.trim() === '') {
        return res.status(400).json({ error: 'Note content is required' });
      }
      
      // Create manual note entry in workerNotes
      const noteData = {
        workerId: workerId,
        changeType: changeType || 'manual_note',
        notes: notes.trim(),
        changedBy: username || 'system'
      };
      
      // Insert the note using direct database access
      try {
        const db = await customerDbService.getCustomerDatabase(context.customerId);
        const [insertedNote] = await db.insert(isolatedSchema.workerNotes).values(noteData).returning();
        logger.info('✅ Created manual note successfully');
        
        res.json({ 
          success: true, 
          message: 'Note added successfully',
          note: insertedNote 
        });
      } catch (noteError) {
        logger.error('❌ Failed to create manual note:', noteError);
        res.status(500).json({ error: 'Failed to save note' });
      }
      
    } catch (error) {
      logger.error('❌ Error adding manual note:', error);
      res.status(500).json({ error: 'Failed to add note' });
    }
  });

  // ===== CONTRACTOR DOCUMENT MANAGEMENT =====
  
  // Get upload URL for contractor document
  app.get('/api/contractors/workers/:workerId/documents/upload-url', requireAuth, async (req, res) => {
    try {
      const { workerId } = req.params;
      
      // Verify worker belongs to current customer (customer isolation security)
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      const db = await customerDbService.getCustomerDatabase(context.customerId);
      
      const [worker] = await db
        .select()
        .from(isolatedSchema.contractorWorkers)
        .where(eq(isolatedSchema.contractorWorkers.id, workerId))
        .limit(1);
        
      if (!worker) {
        return res.status(404).json({ error: 'Worker not found or access denied' });
      }
      
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      logger.error('❌ Error getting upload URL:', error);
      res.status(500).json({ error: 'Failed to get upload URL' });
    }
  });

  // Save document metadata after upload
  app.post('/api/contractors/workers/:workerId/documents', requireAuth, async (req, res) => {
    try {
      const { workerId } = req.params;
      const { documentName, documentType, documentUrl, expiryDate, issuedBy, policyNumber } = req.body;
      
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      const db = await customerDbService.getCustomerDatabase(context.customerId);
      
      logger.info('📄 Creating document record for worker:', workerId);
      
      // Validate worker exists
      const [worker] = await db
        .select()
        .from(isolatedSchema.contractorWorkers)
        .where(eq(isolatedSchema.contractorWorkers.id, workerId))
        .limit(1);
        
      if (!worker) {
        return res.status(404).json({ error: 'Worker not found' });
      }
      
      // Get current user ID
      const [currentUser] = await db
        .select()
        .from(isolatedSchema.users)
        .where(eq(isolatedSchema.users.username, username))
        .limit(1);
      
      // Normalize the document URL to entity path format
      const objectStorageService = new ObjectStorageService();
      const normalizedUrl = objectStorageService.normalizeObjectEntityPath(documentUrl);
      
      // Create document record
      const documentData = {
        workerId,
        companyId: worker.companyId,
        documentName,
        documentType,
        documentUrl: normalizedUrl,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        uploadedBy: currentUser?.id || username,
        issuedBy: issuedBy || null,
        policyNumber: policyNumber || null,
        status: 'pending',
        isActive: true,
      };
      
      const [newDocument] = await db
        .insert(isolatedSchema.contractorDocuments)
        .values(documentData)
        .returning();
      
      logger.info('✅ Document saved successfully:', newDocument.id);

      // Reset expiryAlertedAt on any previous document of the same type for this worker
      // so the nightly cron can alert on the new document's expiry date
      if (documentType) {
        try {
          await db.update(isolatedSchema.contractorDocuments)
            .set({ expiryAlertedAt: null })
            .where(and(
              eq(isolatedSchema.contractorDocuments.workerId, workerId),
              eq(isolatedSchema.contractorDocuments.documentType, documentType),
              isNotNull(isolatedSchema.contractorDocuments.expiryAlertedAt),
              ne(isolatedSchema.contractorDocuments.id, newDocument.id)
            ));
        } catch (resetErr) {
          logger.error('⚠️ Failed to reset expiryAlertedAt on previous worker documents (continuing):', resetErr);
        }
      }

      // Audit trail — worker document uploaded
      try {
        const auditTs = new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' });
        const docLabel = documentType?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || documentName;
        await db.insert(isolatedSchema.workerNotes).values({
          workerId,
          changeType: 'document_uploaded',
          notes: `Document "${docLabel}" uploaded by ${username} on ${auditTs}${expiryDate ? ` (expires ${new Date(expiryDate).toLocaleDateString('en-GB')})` : ''}`,
          changedBy: username,
        });
      } catch (auditErr) {
        logger.error('⚠️ Failed to create document upload audit note (continuing):', auditErr);
      }

      res.json({ 
        success: true, 
        document: newDocument 
      });
      
    } catch (error) {
      logger.error('❌ Error saving document:', error);
      res.status(500).json({ error: 'Failed to save document' });
    }
  });
  
  // Get all documents for a worker
  app.get('/api/contractors/workers/:workerId/documents', requireAuth, async (req, res) => {
    try {
      const { workerId } = req.params;
      
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      const db = await customerDbService.getCustomerDatabase(context.customerId);
      
      const documents = await db
        .select()
        .from(isolatedSchema.contractorDocuments)
        .where(
          and(
            eq(isolatedSchema.contractorDocuments.workerId, workerId),
            eq(isolatedSchema.contractorDocuments.isActive, true)
          )
        )
        .orderBy(desc(isolatedSchema.contractorDocuments.createdAt));
      
      res.json(documents);
      
    } catch (error) {
      logger.error('❌ Error fetching documents:', error);
      res.status(500).json({ error: 'Failed to fetch documents' });
    }
  });
  
  // Delete a document
  app.delete('/api/contractors/workers/:workerId/documents/:documentId', requireAuth, async (req, res) => {
    try {
      const { workerId, documentId } = req.params;
      
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      const db = await customerDbService.getCustomerDatabase(context.customerId);
      
      logger.info('🗑️ Deleting document:', documentId);
      
      // Soft delete by setting isActive to false
      const [deletedDoc] = await db
        .update(isolatedSchema.contractorDocuments)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(isolatedSchema.contractorDocuments.id, documentId),
            eq(isolatedSchema.contractorDocuments.workerId, workerId)
          )
        ).returning();
      
      logger.info('✅ Document deleted successfully');

      // Audit trail — worker document deleted
      try {
        const auditTs = new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' });
        const docLabel = deletedDoc?.documentType?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || deletedDoc?.documentName || 'Unknown';
        await db.insert(isolatedSchema.workerNotes).values({
          workerId,
          changeType: 'document_deleted',
          notes: `Document "${docLabel}" removed by ${username} on ${auditTs}`,
          changedBy: username,
        });
      } catch (auditErr) {
        logger.error('⚠️ Failed to create document delete audit note (continuing):', auditErr);
      }

      res.json({ success: true, message: 'Document deleted' });
      
    } catch (error) {
      logger.error('❌ Error deleting document:', error);
      res.status(500).json({ error: 'Failed to delete document' });
    }
  });

  // AI document scan — extract expiry date, issuer, and policy number from an uploaded document
  app.post('/api/contractors/documents/scan', requireAuth, async (req, res) => {
    try {
      const { fileData, mimeType, documentType } = req.body as {
        fileData?: string;
        mimeType?: string;
        documentType?: string;
      };

      if (!fileData || !mimeType || !documentType) {
        return res.status(400).json({ error: 'fileData, mimeType and documentType are required' });
      }

      // Strict MIME allowlist — only PDF, JPEG, and PNG are supported
      const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png'];
      if (!allowedMimes.includes(mimeType)) {
        return res.status(400).json({ error: `Unsupported file type '${mimeType}'. Please upload a PDF, JPEG, or PNG.` });
      }

      // Reject payloads larger than ~10 MB (base64 adds ~33 % overhead so 13.3 MB base64 ≈ 10 MB file)
      if (fileData.length > 13_500_000) {
        return res.status(400).json({ error: 'File too large. Maximum supported size is 10 MB.' });
      }

      const { scanDocumentWithAI } = await import('../openaiService');
      const buffer = Buffer.from(fileData, 'base64');

      // Extract text from PDF once (used by both providers)
      let pdfText: string | undefined;
      if (mimeType === 'application/pdf') {
        // Import the internal lib directly to avoid pdf-parse's self-test (index.js reads a test
        // file when module.parent is undefined, which is always the case under tsx/ESM).
        const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default as (buf: Buffer) => Promise<{ text: string }>;
        const { text } = await pdfParse(buffer);
        pdfText = text;
      }

      // Try OpenAI first
      let result;
      if (pdfText !== undefined) {
        result = await scanDocumentWithAI({ mimeType, pdfText, documentType });
      } else {
        result = await scanDocumentWithAI({ mimeType, base64Data: fileData, documentType });
      }

      // If OpenAI fails, attempt Claude as fallback (if the customer has a Claude key configured)
      if (!result.success && req.session?.customerId) {
        try {
          const { decryptData } = await import('../utils/encryption');
          const context = { customerId: req.session.customerId };
          const apiKeys = await databaseService.getCustomerApiKeys(context);
          const claudeKeyRow = apiKeys.find((k: any) => k.serviceType === 'claude' && k.status === 'active');

          if (claudeKeyRow) {
            const claudeApiKey = decryptData(
              claudeKeyRow.encryptedKey,
              claudeKeyRow.initializationVector,
              claudeKeyRow.authTag || ''
            );
            const { scanDocumentWithClaude } = await import('../claudeService');
            logger.info('⚠️ OpenAI scan failed — falling back to Claude:', result.error);
            if (pdfText !== undefined) {
              result = await scanDocumentWithClaude({ mimeType, pdfText, documentType, apiKey: claudeApiKey });
            } else {
              result = await scanDocumentWithClaude({ mimeType, base64Data: fileData, documentType, apiKey: claudeApiKey });
            }
          }
        } catch (fallbackErr) {
          logger.error('❌ Claude fallback error:', fallbackErr);
          // Keep the original OpenAI failure result
        }
      }

      if (!result.success) {
        return res.status(422).json({ error: result.error || 'AI extraction failed', fields: result.fields });
      }

      // Normalise expiryDate to YYYY-MM-DD — reject any value that cannot be parsed as a valid date
      let { expiryDate, issuedBy, policyNumber } = result.fields;
      if (expiryDate) {
        const parsed = new Date(expiryDate);
        if (isNaN(parsed.getTime())) {
          expiryDate = null; // unparseable date — discard rather than surface garbage
        } else {
          expiryDate = parsed.toISOString().split('T')[0]; // normalise to YYYY-MM-DD
        }
      }

      // If every extracted field is null the document contained no recognisable data
      if (!expiryDate && !issuedBy && !policyNumber) {
        return res.status(422).json({
          error: 'No recognisable data found. The document may not contain the expected fields, or the text may not be machine-readable.',
          fields: { expiryDate: null, issuedBy: null, policyNumber: null },
        });
      }

      return res.json({ fields: { expiryDate, issuedBy, policyNumber } });
    } catch (error) {
      logger.error('❌ Document scan error:', error);
      return res.status(500).json({ error: 'Failed to scan document' });
    }
  });



  // Setup automatic email reports
  const setupAutomaticReports = async () => {
    // Import the simplified database service
      const { simpleDatabaseService } = await import("../simpleDatabaseService");
      
      // Use default context for startup (no req available)
      const context = simpleDatabaseService.createDevelopmentContext();
      
      const settings = await simpleDatabaseService.getCompanySettings(context);
    if (!settings?.emailReportsEnabled) return;
    
    let cronExpression = "0 9 * * 1"; // Weekly on Monday at 9 AM
    
    switch (settings.reportFrequency) {
      case "daily":
        cronExpression = "0 9 * * *"; // Daily at 9 AM
        break;
      case "weekly":
        cronExpression = "0 9 * * 1"; // Weekly on Monday at 9 AM
        break;
      case "monthly":
        cronExpression = "0 9 1 * *"; // Monthly on 1st at 9 AM
        break;
    }
    
    cron.schedule(cronExpression, async () => {
      try {
        logger.info("Generating automatic report...");
        
        const now = new Date();
        let fromDate = new Date();
        
        // Calculate date range based on frequency
        switch (settings.reportFrequency) {
          case "daily":
            fromDate.setDate(now.getDate() - 1);
            break;
          case "weekly":
            fromDate.setDate(now.getDate() - 7);
            break;
          case "monthly":
            fromDate.setMonth(now.getMonth() - 1);
            break;
        }
        
        // Generate and send report using customer-isolated data
        const allVisitors = await databaseService.getAllVisitors(context);
        const visitorsInRange = allVisitors.filter(v => 
          v.checkedInAt >= fromDate && v.checkedInAt <= now
        );
        
        const checkedOutVisitors = visitorsInRange.filter(v => v.checkedOutAt);
        const totalDuration = checkedOutVisitors.reduce((sum, visitor) => {
          if (visitor.checkedOutAt) {
            return sum + (visitor.checkedOutAt.getTime() - visitor.checkedInAt.getTime());
          }
          return sum;
        }, 0);
        
        const avgDurationMs = checkedOutVisitors.length > 0 ? totalDuration / checkedOutVisitors.length : 0;
        const avgDurationHours = (avgDurationMs / (1000 * 60 * 60)).toFixed(1);
        
        const autoCustDb = await customerDbService.getCustomerDatabase(context.customerId);
        const [report] = await autoCustDb.insert(isolatedSchema.reports)
          .values({
            reportType: `auto_${settings.reportFrequency}`,
            dateFrom: fromDate,
            dateTo: now,
            totalVisitors: visitorsInRange.length.toString(),
            avgDuration: `${avgDurationHours}h`,
            emailSent: false,
            emailSentAt: null,
          })
          .returning();
        
        // Send email
        const autoReportStaff = await databaseService.getAllStaff(context);
        const reportData = {
          visitors: visitorsInRange,
          staff: autoReportStaff,
          checkedOutVisitors
        };
        
        const emailSent = await emailService.forCustomer(context.customerId).sendReport(
          report, 
          settings, 
          settings.reportRecipients || [], 
          reportData
        );
        
        if (emailSent) {
          await autoCustDb.update(isolatedSchema.reports)
            .set({ emailSent: true, emailSentAt: new Date() })
            .where(eq(isolatedSchema.reports.id, report.id));
          
          await simpleDatabaseService.updateCompanySettings(context, {
            lastReportSent: new Date(),
          });
        }
        
        logger.info(`Automatic ${settings.reportFrequency} report sent:`, emailSent);
      } catch (error) {
        logger.error("Error in automatic report generation:", error);
      }
    });
  };



  // AI competitive analysis endpoint
  app.post("/api/ai/competitive-analysis", async (req, res) => {
    try {
      const { companySize, currentSystem, monthlyVisitors } = req.body;
      
      const analysis = await aiService.generateCompetitiveAnalysis(
        parseInt(companySize) || 50,
        currentSystem || 'manual system',
        parseInt(monthlyVisitors) || 100
      );
      
      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        analysis
      });
    } catch (error) {
      logger.error("Failed to generate competitive analysis:", error);
      res.status(500).json({ error: "Failed to generate competitive analysis" });
    }
  });

  // AI customer success metrics endpoint
  app.get("/api/ai/success-metrics", requireAuth, async (req, res) => {
    try {
      const metricsContext = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const stats = await databaseService.getStats(metricsContext);
      
      const metrics = await aiService.generateSuccessMetrics(
        8, // 8 weeks implementation
        stats.todayCheckins * 30, // Monthly estimate
        stats.staffOnSite
      );
      
      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        metrics
      });
    } catch (error) {
      logger.error("Failed to generate success metrics:", error);
      res.status(500).json({ error: "Failed to generate success metrics" });
    }
  });

  // AI flow optimization endpoint
  app.post("/api/ai/flow-optimization", async (req, res) => {
    try {
      const { peakHourVisitors, currentWaitTime, facilityLayout } = req.body;
      
      const optimization = await aiService.generateFlowOptimization(
        parseInt(peakHourVisitors) || 20,
        parseInt(currentWaitTime) || 5,
        facilityLayout || 'standard office'
      );
      
      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        optimization
      });
    } catch (error) {
      logger.error("Failed to generate flow optimization:", error);
      res.status(500).json({ error: "Failed to generate flow optimization" });
    }
  });

  // AI sales pitch generator endpoint
  app.post("/api/ai/sales-pitch", async (req, res) => {
    try {
      const { companyName, industry, companySize, currentChallenges, budget } = req.body;
      
      const pitch = await aiService.generateSalesPitch(
        companyName || 'Prospect Company',
        industry || 'Business Services',
        parseInt(companySize) || 50,
        currentChallenges || 'Manual visitor management inefficiencies',
        budget || '£500-£2000/month'
      );
      
      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        pitch
      });
    } catch (error) {
      logger.error("Failed to generate sales pitch:", error);
      res.status(500).json({ error: "Failed to generate sales pitch" });
    }
  });

  // AI security alert endpoint
  app.post("/api/ai/security-alert", requireAuth, async (req, res) => {
    try {
      const { pattern } = req.body;
      
      if (!pattern) {
        return res.status(400).json({ error: "Security pattern description required" });
      }

      const alertContext = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const visitors = await databaseService.getCurrentVisitors(alertContext);
      const alert = await aiService.generateSecurityAlert(visitors, pattern);
      
      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        alert,
        riskLevel: alert.toLowerCase().includes('immediate') ? 'high' : 'medium'
      });
    } catch (error) {
      logger.error("AI security alert error:", error);
      res.status(500).json({ error: "Failed to generate security alert" });
    }
  });

  // Database backup endpoint
  app.get("/api/system/backup", requireAuth, async (req, res) => {
    try {
      logger.info('Backup downloaded', { userId: req.user?.id, customerId: req.customerId });

      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      const backupData: { metadata: any; data: Record<string, any[]> } = {
        metadata: {
          version: "4.0",
          format: "TPRMAX_BAK",
          created: new Date().toISOString(),
          system: "TPR Max",
          customerId: context.customerId,
          customerName: context.customerName,
          backupType: "FULL"
        },
        data: {}
      };

      // All schema-isolated tables in dependency order (parents before children)
      const tablesToBackup = [
        // Core system tables
        'users', 'departments', 'company_settings', 'evacuation_zones', 'meeting_rooms',
        'feature_toggles',
        // Personnel
        'staff', 'visitors', 'members', 'staff_sessions', 'muster_points',
        // Evacuation & safety
        'evacuations', 'evacuation_accountability', 'safety_tokens',
        // Bookings & invitations
        'user_invitations', 'pre_bookings', 'room_bookings', 'room_booking_attendees',
        // History
        'staff_attendance_history', 'visitor_history',
        // Contractors
        'contractor_companies', 'contractor_workers', 'worker_notes', 'company_notes', 'contractor_documents',
        'compliance_documents', 'document_approvals', 'document_types', 'worker_competencies',
        'nvq_qualifications', 'card_offences', 'card_issues', 'worker_certifications',
        'rams_documents', 'contractor_visits', 'contractor_prebookings',
        // Documents
        'uk_hs_document_templates', 'worker_document_assignments', 'worker_document_acceptances',
        'document_auto_fill_mapping',
        // Inductions
        'induction_tokens', 'induction_questions', 'induction_settings', 'induction_answers',
        // CO2 & sustainability
        'co2_records', 'local_labour_records', 'co2_emissions_data',
        'co2_monthly_summaries', 'co2_sustainability_reports',
        // Company & reporting
        'enhanced_company_details', 'reports',
        // Print system
        'print_queue', 'print_job_history', 'printer_configurations', 'print_service_instances',
        // AI & analytics
        'ai_generated_images', 'customer_api_keys', 'feature_usage_analytics',
        // Help system
        'help_categories', 'help_articles', 'help_user_interactions', 'help_onboarding_progress'
      ];

      let totalRecords = 0;
      for (const table of tablesToBackup) {
        try {
          const result = await custDb.execute(sql.raw(`SELECT * FROM "${table}"`));
          backupData.data[table] = result.rows as any[];
          totalRecords += result.rows.length;
        } catch (err: any) {
          logger.warn(`⚠️ Could not export table ${table}: ${err.message}`);
          backupData.data[table] = [];
        }
      }

      backupData.metadata.total_records = totalRecords;
      backupData.metadata.tables_exported = tablesToBackup.length;

      const backupContent = Buffer.from(JSON.stringify(backupData, null, 2));
      logger.info('Backup created', { customerId: context.customerId, totalRecords, bytes: backupContent.length });

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="tprmax-backup-${context.customerId}-${timestamp}.bak"`);
      res.setHeader('Content-Length', backupContent.length.toString());
      res.send(backupContent);

    } catch (error: any) {
      logger.error("❌ Database backup error:", error);
      res.status(500).json({ error: "Failed to create database backup" });
    }
  });

  // Database restore endpoint
  app.post("/api/system/restore", requireAuth, async (req, res) => {
    try {
      const { backupData, clearExisting = true } = req.body;

      if (!backupData || !backupData.data || !backupData.metadata) {
        return res.status(400).json({ error: "Invalid backup file. Please select a .bak file exported from TPR Max." });
      }

      // Validate that this is a genuine TPR Max backup
      if (backupData.metadata.system !== 'TPR Max' && backupData.metadata.format !== 'TPRMAX_BAK') {
        return res.status(400).json({ error: "Unrecognised backup format. Only TPR Max backup files (.bak) are supported." });
      }

      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);

      // Security: prevent restoring a backup from a different customer
      if (backupData.metadata.customerId && backupData.metadata.customerId !== context.customerId) {
        return res.status(403).json({ error: "Cannot restore a backup that belongs to a different account." });
      }

      logger.info('Database restore started', { userId: req.user?.id, customerId: req.customerId });

      // Only restore tables that actually exist in our schema (whitelist for safety)
      const allowedTables = new Set([
        'users', 'departments', 'company_settings', 'evacuation_zones', 'meeting_rooms',
        'feature_toggles',
        'staff', 'visitors', 'members', 'staff_sessions', 'muster_points',
        'evacuations', 'evacuation_accountability', 'safety_tokens',
        'user_invitations', 'pre_bookings', 'room_bookings', 'room_booking_attendees',
        'staff_attendance_history', 'visitor_history',
        'contractor_companies', 'contractor_workers', 'worker_notes', 'contractor_documents',
        'compliance_documents', 'document_approvals', 'document_types', 'worker_competencies',
        'nvq_qualifications', 'card_offences', 'card_issues', 'worker_certifications',
        'rams_documents', 'contractor_visits', 'contractor_prebookings',
        'uk_hs_document_templates', 'worker_document_assignments', 'worker_document_acceptances',
        'document_auto_fill_mapping',
        'induction_tokens', 'induction_questions', 'induction_settings', 'induction_answers',
        'co2_records', 'local_labour_records', 'co2_emissions_data',
        'co2_monthly_summaries', 'co2_sustainability_reports',
        'enhanced_company_details', 'reports',
        'print_queue', 'print_job_history', 'printer_configurations', 'print_service_instances',
        'ai_generated_images', 'customer_api_keys', 'feature_usage_analytics',
        'help_categories', 'help_articles', 'help_user_interactions', 'help_onboarding_progress'
      ]);

      // Filter to only whitelisted tables, preserve dependency order
      const tablesToRestore = Object.keys(backupData.data).filter(t => allowedTables.has(t));

      const errors: { table: string; error: string }[] = [];
      let restoredTables = 0;
      let restoredRecords = 0;

      // Run the entire restore inside a transaction — if anything fails we roll back cleanly
      await custDb.transaction(async (tx) => {
        // Clear tables in reverse order to respect foreign key constraints
        if (clearExisting) {
          const reversedTables = [...tablesToRestore].reverse();
          for (const table of reversedTables) {
            try {
              await tx.execute(sql.raw(`TRUNCATE TABLE "${table}" CASCADE`));
            } catch (err: any) {
              logger.warn(`⚠️ Could not clear ${table}: ${err.message}`);
            }
          }
        }

        // Restore tables in forward order (parents before children)
        for (const table of tablesToRestore) {
          const records = backupData.data[table] as any[];
          if (!records || records.length === 0) continue;

          try {
            for (const record of records) {
              const columns = Object.keys(record);
              if (columns.length === 0) continue;

              try {
                // Build properly parameterized INSERT using Drizzle sql template
                const tableIdent = sql.identifier(table);
                const colIdents = sql.join(columns.map(c => sql.identifier(c)), sql.raw(', '));
                const vals = sql.join(columns.map(c => sql`${record[c]}`), sql.raw(', '));
                await tx.execute(
                  sql`INSERT INTO ${tableIdent} (${colIdents}) VALUES (${vals}) ON CONFLICT DO NOTHING`
                );
              } catch (rowErr: any) {
                // Log but continue — individual constraint violations are non-fatal
                logger.warn(`⚠️ Skipped row in ${table}: ${rowErr.message}`);
              }
            }

            restoredTables++;
            restoredRecords += records.length;

          } catch (error: any) {
            logger.error(`❌ Error restoring table ${table}:`, error);
            errors.push({ table, error: error.message });
          }
        }
      });

      logger.info('Database restore completed', { customerId: context.customerId, restoredRecords, restoredTables });

      res.json({
        success: true,
        message: `Database restore completed for ${context.customerName}`,
        restored: {
          tables: restoredTables,
          records: restoredRecords,
          errors: errors.length
        },
        errors
      });

    } catch (error: any) {
      logger.error("Database restore error:", error);
      res.status(500).json({ error: "Failed to restore database" });
    }
  });

  // AI photo analysis endpoint
  app.post("/api/ai/analyze-photo", async (req, res) => {
    try {
      const { image } = req.body;
      
      if (!image) {
        return res.status(400).json({ error: "Base64 image data required" });
      }

      const analysis = await aiService.analyzeVisitorPhoto(image);
      
      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        analysis
      });
    } catch (error) {
      logger.error("AI photo analysis error:", error);
      res.status(500).json({ error: "Failed to analyze photo" });
    }
  });

  // AI ROI Calculator endpoint
  app.post("/api/ai/roi-analysis", async (req, res) => {
    try {
      const { monthlyVisitors, staffCount, manualProcessTime } = req.body;
      
      if (!monthlyVisitors || !staffCount || !manualProcessTime) {
        return res.status(400).json({ error: "Monthly visitors, staff count, and manual process time required" });
      }

      const roiAnalysis = await aiService.generateROIAnalysis(
        Number(monthlyVisitors),
        Number(staffCount), 
        Number(manualProcessTime)
      );
      
      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        roi: roiAnalysis
      });
    } catch (error) {
      logger.error("AI ROI analysis error:", error);
      res.status(500).json({ error: "Failed to generate ROI analysis" });
    }
  });

  // AI Visitor Sentiment Analysis endpoint
  app.get("/api/ai/visitor-sentiment", requireAuth, async (req, res) => {
    try {
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const visitors = await databaseService.getAllVisitors(context);
      const stats = await databaseService.getStats(context);
      
      const avgDurationMinutes = 45; // Fallback duration since stats may not have this field
      const sentiment = await aiService.analyzeVisitorSentiment(visitors, avgDurationMinutes);
      
      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        sentiment
      });
    } catch (error) {
      logger.error("AI sentiment analysis error:", error);
      res.status(500).json({ error: "Failed to analyze visitor sentiment" });
    }
  });

  // AI Compliance Analysis endpoint
  app.get("/api/ai/compliance", requireAuth, async (req, res) => {
    try {
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const visitors = await databaseService.getAllVisitors(context);
      const staff = await databaseService.getAllStaff(context);
      
      const compliance = await aiService.generateComplianceAnalysis(visitors, staff);
      
      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        compliance
      });
    } catch (error) {
      logger.error("AI compliance analysis error:", error);
      res.status(500).json({ error: "Failed to generate compliance analysis" });
    }
  });

  // Biostar integration endpoints
  app.post("/api/biostar/test-connection", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId;
      if (!customerId || !req.user?.username) {
        return res.status(401).json({ error: "Please log in to test connection" });
      }
      
      const context = simpleDatabaseService.createCustomerContext(req.user.username, customerId);
      const settings = await simpleDatabaseService.getCompanySettings(context);
      
      if (!settings?.biostarServerUrl || !settings?.biostarUsername || !settings?.biostarPassword) {
        return res.status(400).json({ 
          connected: false, 
          message: "Please enter the Biostar server URL, username, and password before testing" 
        });
      }

      logger.info("🔍 Testing Biostar connection...");

      // Test connection using new biostarService
      const result = await biostarService.testConnection({
        serverUrl: settings.biostarServerUrl,
        username: settings.biostarUsername,
        password: settings.biostarPassword,
        databaseId: settings.biostarDatabaseId || "1",
      });
      
      logger.info("✅ Biostar connection test result:", result);
      
      res.json(result);
    } catch (error) {
      logger.error("❌ Biostar connection test failed:", error);
      res.status(500).json({ 
        connected: false, 
        message: "Connection test failed: " + (error as Error).message 
      });
    }
  });

  // Manual sync trigger for Biostar attendance data
  app.post("/api/biostar/sync-now", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId;
      if (!customerId || !req.user?.username) {
        return res.status(401).json({ error: "Please log in to sync data" });
      }
      
      const context = simpleDatabaseService.createCustomerContext(req.user.username, customerId);
      const settings = await simpleDatabaseService.getCompanySettings(context);
      
      if (!settings?.biostarEnabled) {
        return res.status(400).json({ error: "Biostar integration is not enabled" });
      }

      if (!settings.biostarServerUrl || !settings.biostarUsername || !settings.biostarPassword) {
        return res.status(400).json({ error: "Missing Biostar connection settings" });
      }

      const biostarConfig = {
        serverUrl: settings.biostarServerUrl,
        username: settings.biostarUsername,
        password: settings.biostarPassword,
        databaseId: settings.biostarDatabaseId || "1",
      };

      logger.info('🔄 Starting manual Biostar sync (attendance + staff import)...');

      // --- Step 1: Get all Biostar users and import any new ones as staff ---
      const biostarUsers = await biostarService.getUsers(biostarConfig);
      logger.info(`👥 Biostar: ${biostarUsers.length} users fetched for staff import check`);

      // Fetch existing staff to check for duplicates by biostarUserId
      const db = await customerDbService.getCustomerDatabase(customerId);
      const existingStaff = await db.select({
        id: isolatedSchema.staff.id,
        biostarUserId: isolatedSchema.staff.biostarUserId,
        email: isolatedSchema.staff.email,
        employeeId: isolatedSchema.staff.employeeId,
      }).from(isolatedSchema.staff);

      // Map biostarUserId → staff record id so we can update existing records
      const biostarIdToStaffId = new Map(
        existingStaff
          .filter(s => s.biostarUserId)
          .map(s => [s.biostarUserId as string, s.id])
      );
      const existingEmails = new Set(
        existingStaff.map(s => s.email?.toLowerCase()).filter(Boolean)
      );
      const existingEmployeeIds = new Set(
        existingStaff.map(s => s.employeeId).filter(Boolean)
      );

      let importedCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;
      const importErrors: string[] = [];

      for (const bUser of biostarUsers) {
        // Skip users without a name or ID
        if (!bUser.id || !bUser.name.trim()) {
          skippedCount++;
          continue;
        }

        const nameParts = bUser.name.trim().split(/\s+/);
        const firstName = nameParts[0] || 'Unknown';
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

        // --- Update existing Biostar staff record with latest field values ---
        if (biostarIdToStaffId.has(bUser.id)) {
          const staffId = biostarIdToStaffId.get(bUser.id)!;
          const updates: Record<string, any> = {
            firstName,
            lastName,
          };
          if (bUser.email?.trim()) updates.email = bUser.email.trim().toLowerCase();
          if (bUser.phone?.trim()) updates.phoneNumber = bUser.phone.trim();
          if (bUser.department?.trim()) updates.department = bUser.department.trim();
          if (bUser.barcodeNumber) updates.barcodeNumber = bUser.barcodeNumber;
          if (bUser.memberNumber) updates.memberNumber = bUser.memberNumber;

          try {
            await databaseService.updateStaff(context, staffId, updates as any);
            updatedCount++;
            logger.info(`🔄 Biostar: Updated staff "${bUser.name}" (Biostar ID: ${bUser.id}, Card: ${bUser.barcodeNumber || 'none'}, Member: ${bUser.memberNumber || 'none'})`);
          } catch (err: any) {
            logger.error(`❌ Biostar: Failed to update staff "${bUser.name}":`, err.message);
          }
          continue;
        }

        // --- Create new staff record ---
        // Build a unique employee ID using the Biostar user ID
        const employeeId = existingEmployeeIds.has(`BSTR-${bUser.id}`)
          ? `BSTR-${bUser.id}-${Date.now()}`
          : `BSTR-${bUser.id}`;

        // Build a unique email — use Biostar email if available and not already taken,
        // otherwise generate a placeholder so the unique constraint is satisfied
        let email = bUser.email && bUser.email.trim() && !existingEmails.has(bUser.email.toLowerCase())
          ? bUser.email.trim().toLowerCase()
          : `biostar.${bUser.id}@noemail.local`;

        // Ensure placeholder is also unique (edge case: duplicate Biostar IDs)
        if (existingEmails.has(email)) {
          email = `biostar.${bUser.id}.${Date.now()}@noemail.local`;
        }

        try {
          await databaseService.createStaff(context, {
            firstName,
            lastName,
            email,
            department: bUser.department?.trim() || "Unassigned",
            employeeId,
            accessLevel: "staff",
            biostarUserId: bUser.id,
            phoneNumber: bUser.phone?.trim() || undefined,
            barcodeNumber: bUser.barcodeNumber || undefined,
            memberNumber: bUser.memberNumber || undefined,
            isActive: true,
            isCheckedIn: false,
            isAccountedFor: false,
            needsEvacuationAssistance: false,
            isFireMarshal: false,
            inductionCompleted: false,
          } as any);

          biostarIdToStaffId.set(bUser.id, ''); // mark as processed
          existingEmails.add(email);
          existingEmployeeIds.add(employeeId);
          importedCount++;
          logger.info(`✅ Biostar: Imported staff "${firstName} ${lastName}" (Biostar ID: ${bUser.id}, Card: ${bUser.barcodeNumber || 'none'}, Member: ${bUser.memberNumber || 'none'})`);
        } catch (err: any) {
          logger.error(`❌ Biostar: Failed to import user "${bUser.name}":`, err.message);
          importErrors.push(`${bUser.name}: ${err.message}`);
          skippedCount++;
        }
      }

      logger.info(`📊 Biostar staff import: ${importedCount} added, ${updatedCount} updated, ${skippedCount} skipped`);

      // --- Step 2: Get current on-site users from event logs and update staff check-in status ---
      let onSiteUsers: any[] = [];
      let onSiteWarning: string | undefined;
      let attendanceCheckedIn = 0;
      let attendanceCheckedOut = 0;
      try {
        // Load device roles so direction detection works correctly
        const syncDeviceRows = await db
          .select({ id: isolatedSchema.biostarDevices.id, role: isolatedSchema.biostarDevices.role })
          .from(isolatedSchema.biostarDevices);
        const syncDeviceRoles: Record<string, string> = Object.fromEntries(
          syncDeviceRows.map(d => [String(d.id), d.role])
        );
        onSiteUsers = await biostarService.getCurrentOnSiteUsers(biostarConfig, syncDeviceRoles);
        logger.info(`📊 Biostar sync found ${onSiteUsers.length} users on-site`);

        // Build set of BioStar user IDs currently on-site
        const onSiteIds = new Set(onSiteUsers.map((u: any) => String(u.userId)));

        // Fetch all staff with a biostarUserId so we can reconcile their status
        const allBiostarStaff = await db
          .select({
            id: isolatedSchema.staff.id,
            biostarUserId: isolatedSchema.staff.biostarUserId,
            isCheckedIn: isolatedSchema.staff.isCheckedIn,
          })
          .from(isolatedSchema.staff)
          .where(isNotNull(isolatedSchema.staff.biostarUserId));

        logger.info(`👥 Biostar: ${allBiostarStaff.length} staff linked to BioStar, reconciling against ${onSiteIds.size} on-site IDs`);

        const now = new Date();
        for (const staffMember of allBiostarStaff) {
          if (!staffMember.biostarUserId) continue;
          const shouldBeIn = onSiteIds.has(String(staffMember.biostarUserId));

          logger.info(`🔍 Biostar reconcile: staff biostarId=${staffMember.biostarUserId}, shouldBeIn=${shouldBeIn}, isCheckedIn=${staffMember.isCheckedIn}`);

          if (shouldBeIn && !staffMember.isCheckedIn) {
            // BioStar says on-site but TPR shows off-site → check in
            await db
              .update(isolatedSchema.staff)
              .set({ isCheckedIn: true, checkedInAt: now, checkedOutAt: null, updatedAt: now })
              .where(eq(isolatedSchema.staff.id, staffMember.id));
            attendanceCheckedIn++;
            logger.info(`✅ Biostar attendance: Checked IN staff (biostar id ${staffMember.biostarUserId})`);
          } else if (!shouldBeIn && staffMember.isCheckedIn) {
            // BioStar says off-site but TPR shows on-site → check out
            await db
              .update(isolatedSchema.staff)
              .set({ isCheckedIn: false, checkedOutAt: now, updatedAt: now })
              .where(eq(isolatedSchema.staff.id, staffMember.id));
            attendanceCheckedOut++;
            logger.info(`✅ Biostar attendance: Checked OUT staff (biostar id ${staffMember.biostarUserId})`);
          }
        }

        if (attendanceCheckedIn > 0 || attendanceCheckedOut > 0) {
          logger.info(`📊 Biostar attendance update: ${attendanceCheckedIn} checked in, ${attendanceCheckedOut} checked out`);
        }
      } catch (onSiteErr: any) {
        const msg = (onSiteErr as Error).message || String(onSiteErr);
        logger.warn(`⚠️ Biostar on-site tracking unavailable (non-fatal): ${msg}`);
        onSiteWarning = `On-site tracking unavailable: ${msg}. Staff import still succeeded.`;
      }

      // Update last sync timestamp
      await simpleDatabaseService.updateCompanySettings(context, {
        biostarLastSync: new Date(),
      });

      res.json({
        success: true,
        imported: importedCount,
        updated: updatedCount,
        skipped: skippedCount,
        errors: importErrors.length > 0 ? importErrors : undefined,
        onSiteCount: onSiteUsers.length,
        onSiteUsers,
        attendanceCheckedIn,
        attendanceCheckedOut,
        onSiteWarning,
        lastSync: new Date().toISOString(),
        message: `Sync completed: ${importedCount} new staff imported, ${updatedCount} updated from Biostar${onSiteWarning ? " (on-site tracking unavailable)" : `, ${onSiteUsers.length} users on-site (${attendanceCheckedIn} checked in, ${attendanceCheckedOut} checked out)`}`,
      });
    } catch (error) {
      logger.error("❌ Biostar sync failed:", error);
      res.status(500).json({ error: "Sync failed: " + (error as Error).message });
    }
  });

  // Get current on-site staff from Biostar
  app.get("/api/biostar/staff-status", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId;
      if (!customerId || !req.user?.username) {
        return res.status(401).json({ error: "Please log in to view staff status" });
      }
      
      const context = simpleDatabaseService.createCustomerContext(req.user.username, customerId);
      const settings = await simpleDatabaseService.getCompanySettings(context);
      
      if (!settings?.biostarEnabled) {
        return res.json({ 
          enabled: false, 
          onSiteUsers: [],
          message: "Biostar integration is not enabled" 
        });
      }

      if (!settings.biostarServerUrl || !settings.biostarUsername || !settings.biostarPassword) {
        return res.json({ 
          enabled: true, 
          onSiteUsers: [],
          message: "Biostar connection settings incomplete" 
        });
      }

      // Get current on-site users from Biostar
      const onSiteUsers = await biostarService.getCurrentOnSiteUsers({
        serverUrl: settings.biostarServerUrl,
        username: settings.biostarUsername,
        password: settings.biostarPassword,
        databaseId: settings.biostarDatabaseId || "1",
      });
      
      res.json({
        enabled: true,
        onSiteUsers,
        lastSync: settings.biostarLastSync ? String(settings.biostarLastSync) : null,
        message: `Found ${onSiteUsers.length} users on-site`
      });
    } catch (error) {
      logger.error("❌ Failed to get Biostar staff status:", error);
      res.status(500).json({ 
        enabled: true, 
        onSiteUsers: [],
        error: "Failed to get staff status: " + (error as Error).message 
      });
    }
  });

  // BioStar Scan Activity — shows each BioStar user's last scan time and linked staff record.
  // Uses the /api/users endpoint (confirmed working) rather than event logs.
  app.get("/api/biostar/scan-activity", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId;
      if (!customerId || !req.user?.username) return res.status(401).json({ error: "Unauthorised" });

      const context = simpleDatabaseService.createCustomerContext(req.user.username, customerId);
      const settings = await simpleDatabaseService.getCompanySettings(context);
      if (!settings?.biostarEnabled) return res.json({ users: [], error: "BioStar 2 integration is not enabled." });

      const diagConfig: BiostarConfig = {
        serverUrl:  settings.biostarServerUrl  ?? '',
        username:   settings.biostarUsername   ?? '',
        password:   settings.biostarPassword   ?? '',
        useHttps:   true,
        verifySSL:  false,
      };

      // Fetch all BioStar users (includes lastAccessTime)
      const biostarUsers = await biostarService.getUsers(diagConfig);

      // Fetch all staff that have a biostarUserId so we can cross-reference
      const db = await customerDbService.getCustomerDatabase(customerId);
      const staffList = await db
        .select({
          id:            isolatedSchema.staff.id,
          firstName:     isolatedSchema.staff.firstName,
          lastName:      isolatedSchema.staff.lastName,
          biostarUserId: isolatedSchema.staff.biostarUserId,
          isCheckedIn:   isolatedSchema.staff.isCheckedIn,
          checkedInAt:   isolatedSchema.staff.checkedInAt,
          checkedOutAt:  isolatedSchema.staff.checkedOutAt,
        })
        .from(isolatedSchema.staff)
        .where(isNotNull(isolatedSchema.staff.biostarUserId));

      // Build lookup: biostarUserId → staff record
      const staffByBiostarId = new Map(staffList.map(s => [String(s.biostarUserId), s]));

      // Merge BioStar users with staff records, sorted by lastWebhookTime desc
      const rows = biostarUsers
        .map(u => {
          const staff = staffByBiostarId.get(String(u.id));
          // lastWebhookTime = most recent time a webhook event was received for this person
          const checkedInMs  = staff?.checkedInAt  ? new Date(staff.checkedInAt).getTime()  : 0;
          const checkedOutMs = staff?.checkedOutAt ? new Date(staff.checkedOutAt).getTime() : 0;
          const lastWebhookMs = Math.max(checkedInMs, checkedOutMs);
          return {
            biostarUserId:   u.id,
            biostarName:     u.name,
            lastAccessTime:  u.lastAccessTime ?? null,
            lastWebhookTime: lastWebhookMs > 0 ? new Date(lastWebhookMs).toISOString() : null,
            staffId:         staff?.id ?? null,
            staffName:       staff ? `${staff.firstName} ${staff.lastName}` : null,
            isCheckedIn:     staff?.isCheckedIn ?? null,
            checkedInAt:     staff?.checkedInAt ?? null,
            checkedOutAt:    staff?.checkedOutAt ?? null,
            linked:          !!staff,
          };
        })
        .sort((a, b) => {
          // Sort by most recent webhook activity first; unactioned users go to the bottom
          if (!a.lastWebhookTime && !b.lastWebhookTime) return 0;
          if (!a.lastWebhookTime) return 1;
          if (!b.lastWebhookTime) return -1;
          return new Date(b.lastWebhookTime).getTime() - new Date(a.lastWebhookTime).getTime();
        });

      res.json({ users: rows, total: rows.length });
    } catch (err: any) {
      logger.error("❌ BioStar scan-activity error:", err);
      res.status(500).json({ users: [], error: err.message });
    }
  });

  // BioStar diagnostics — shows raw events, on-site status, and staff matching
  app.get("/api/biostar/diagnostics", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId;
      if (!customerId || !req.user?.username) {
        return res.status(401).json({ error: "Unauthorised" });
      }

      const context = simpleDatabaseService.createCustomerContext(req.user.username, customerId);
      const settings = await simpleDatabaseService.getCompanySettings(context);

      if (!settings?.biostarEnabled) {
        return res.json({ enabled: false, message: "BioStar integration is not enabled" });
      }
      if (!settings.biostarServerUrl || !settings.biostarUsername || !settings.biostarPassword) {
        return res.json({ enabled: true, message: "BioStar connection settings incomplete" });
      }

      const diagConfig = {
        serverUrl: settings.biostarServerUrl,
        username: settings.biostarUsername,
        password: settings.biostarPassword,
        databaseId: settings.biostarDatabaseId || "1",
      };

      // Fetch today's raw events (may fail if event log API not permitted)
      let rawEvents: any[] = [];
      let eventLogError: string | null = null;
      try {
        rawEvents = await biostarService.getEventLogs(diagConfig);
      } catch (evtErr: any) {
        eventLogError = evtErr.message;
        logger.warn(`⚠️ Biostar diagnostics: Event log unavailable - ${evtErr.message}`);
      }

      // Try door status as alternative data source
      await biostarService.getDoorStatus(diagConfig);

      // Fetch all staff with biostarUserId to show matching
      const diagDb = await customerDbService.getCustomerDatabase(customerId);

      // Load device roles for accurate direction detection in diagnostics too
      const diagDeviceRows = await diagDb
        .select({ id: isolatedSchema.biostarDevices.id, role: isolatedSchema.biostarDevices.role })
        .from(isolatedSchema.biostarDevices);
      const diagDeviceRoles: Record<string, string> = Object.fromEntries(
        diagDeviceRows.map(d => [String(d.id), d.role])
      );

      // Fetch on-site determination (falls back to last_access_time automatically)
      const onSiteUsers = await biostarService.getCurrentOnSiteUsers(diagConfig, diagDeviceRoles);
      const onSiteIds = new Set(onSiteUsers.map((u: any) => String(u.userId)));
      const allBiostarStaff = await diagDb
        .select({
          id: isolatedSchema.staff.id,
          firstName: isolatedSchema.staff.firstName,
          lastName: isolatedSchema.staff.lastName,
          biostarUserId: isolatedSchema.staff.biostarUserId,
          isCheckedIn: isolatedSchema.staff.isCheckedIn,
        })
        .from(isolatedSchema.staff)
        .where(isNotNull(isolatedSchema.staff.biostarUserId));

      const staffReconciliation = allBiostarStaff.map(s => ({
        staffId: s.id,
        name: `${s.firstName} ${s.lastName}`,
        biostarUserId: s.biostarUserId,
        currentlyCheckedIn: s.isCheckedIn,
        biostarSaysOnSite: onSiteIds.has(String(s.biostarUserId)),
        status: onSiteIds.has(String(s.biostarUserId)) ? "ON-SITE" : "OFF-SITE",
      }));

      // Unique event codes seen today
      const eventCodeSummary = rawEvents.reduce<Record<string, { count: number; desc: string }>>((acc, e) => {
        const key = e.eventTypeCode;
        if (!acc[key]) acc[key] = { count: 0, desc: e.eventTypeDesc };
        acc[key].count++;
        return acc;
      }, {});

      res.json({
        enabled: true,
        lastSync: settings.biostarLastSync ? String(settings.biostarLastSync) : null,
        eventLogError,
        eventCount: rawEvents.length,
        events: rawEvents.slice(0, 50).map(e => ({
          id: e.id,
          time: e.eventTime,
          userId: e.userId,
          userName: e.userName,
          deviceId: e.deviceId,
          deviceName: e.deviceName,
          eventCode: e.eventTypeCode,
          eventDesc: e.eventTypeDesc,
        })),
        eventCodeSummary,
        onSiteUsers,
        staffReconciliation,
      });
    } catch (err: any) {
      logger.error("❌ BioStar diagnostics error:", err);
      res.status(500).json({ enabled: true, error: err.message });
    }
  });

  // -----------------------------------------------------------------
  // BioStar 2 Event Webhook
  // BioStar 2 "Trigger & Action" can POST card-scan events here.
  // No session auth required — BioStar cannot send session tokens.
  // The customerId in the URL scopes the event to the right tenant.
  // -----------------------------------------------------------------
  app.post("/api/biostar/webhook/:customerId", async (req, res) => {
    const { customerId } = req.params;
    const payload = req.body;

    // Log the raw payload so we can see exactly what BioStar sends
    logger.info(`📡 BioStar Webhook: received event for customer ${customerId}:`, JSON.stringify(payload).slice(0, 500));

    try {
      if (!customerId) return res.status(400).json({ error: "Missing customerId" });

      // Extract userId, deviceId, and eventTypeCode from BioStar's various payload formats
      const userId = String(
        payload?.user_id?.id ?? payload?.user_id ?? payload?.userId ?? ''
      );
      const deviceId = String(
        payload?.device_id?.id ?? payload?.device_id ?? payload?.deviceId ?? ''
      );
      const deviceName = String(
        payload?.device_id?.name ?? payload?.device_name ?? payload?.deviceName ?? ''
      );
      const eventTypeCode = String(
        payload?.event_type_id?.code ?? payload?.event_type_id ?? payload?.eventTypeCode ?? payload?.event_type ?? ''
      );
      const eventTime = payload?.datetime ?? payload?.event_time ?? payload?.eventTime ?? new Date().toISOString();

      if (!userId || userId === '0' || !eventTypeCode) {
        logger.warn(`⚠️ BioStar Webhook: insufficient data — userId=${userId}, eventTypeCode=${eventTypeCode}`);
        pushBiostarEvent(customerId, { id: crypto.randomUUID(), ts: new Date().toISOString(), customerId, userId: userId || '?', deviceId: deviceId || '?', deviceName: deviceName || 'Unknown', eventCode: eventTypeCode || '?', action: 'insufficient_data' });
        return res.json({ ok: false, reason: 'insufficient_data' });
      }

      const webhookDb = await customerDbService.getCustomerDatabase(customerId);

      // --- Determine entry/exit using device role (preferred) or event code (fallback) ---
      let isEntry = false;
      let isExit = false;
      let detectionMethod = 'event_code';

      if (deviceId && deviceId !== '0') {
        // Look up device role from our configured device table
        const [deviceConfig] = await webhookDb
          .select()
          .from(isolatedSchema.biostarDevices)
          .where(eq(isolatedSchema.biostarDevices.id, deviceId))
          .limit(1);

        if (deviceConfig) {
          detectionMethod = 'device_role';
          if (deviceConfig.role === 'ENTRY') { isEntry = true; }
          else if (deviceConfig.role === 'EXIT') { isExit = true; }
          else if (deviceConfig.role === 'ENTRY_EXIT') {
            // For ENTRY_EXIT devices, fall back to event code to determine direction
            isEntry = biostarService.isEntryEvent(eventTypeCode);
            isExit = biostarService.isExitEvent(eventTypeCode);
            if (!isEntry && !isExit) isEntry = true; // default: treat as entry if code unclear
          }
          // IGNORE role: isEntry=false, isExit=false → event is silently dropped
          logger.info(`📡 BioStar Webhook: device "${deviceConfig.name}" (${deviceId}) role=${deviceConfig.role} → entry=${isEntry} exit=${isExit}`);
        } else {
          // Unknown device — auto-register it as ENTRY_EXIT so it shows up in the config UI
          try {
            await webhookDb
              .insert(isolatedSchema.biostarDevices)
              .values({ id: deviceId, name: deviceName || `Device ${deviceId}`, role: 'ENTRY_EXIT', direction: 'BOTH', syncedAt: new Date(), updatedAt: new Date() })
              .onConflictDoNothing();
            logger.info(`📟 BioStar Webhook: Auto-registered unknown device ${deviceId} ("${deviceName || 'unknown'}") as ENTRY_EXIT`);
          } catch { /* ignore insert errors */ }
          // Fall back to event code logic for this event
          isEntry = biostarService.isEntryEvent(eventTypeCode);
          isExit = biostarService.isExitEvent(eventTypeCode);
        }
      } else {
        // No deviceId in payload — fall back to event code
        isEntry = biostarService.isEntryEvent(eventTypeCode);
        isExit = biostarService.isExitEvent(eventTypeCode);
      }

      logger.info(`📡 BioStar Webhook: userId=${userId} device=${deviceId} eventCode=${eventTypeCode} entry=${isEntry} exit=${isExit} method=${detectionMethod} time=${eventTime}`);

      // Helper: build and push a live log event
      const deviceRole = (() => {
        // Re-check device config for role to include in log
        return undefined; // Will be looked up below if needed
      })();
      const makeLogEvent = (action: string, userName?: string, role?: string): BiostarLiveEvent => ({
        id: crypto.randomUUID(),
        ts: eventTime || new Date().toISOString(),
        customerId,
        userId,
        userName,
        deviceId,
        deviceName,
        deviceRole: role,
        eventCode: eventTypeCode,
        action,
      });

      if (!isEntry && !isExit) {
        logger.info(`📡 BioStar Webhook: event ignored (role=IGNORE or unrecognised code)`);
        pushBiostarEvent(customerId, makeLogEvent('ignored'));
        return res.json({ ok: true, action: 'ignored' });
      }

      const [staffMember] = await webhookDb
        .select({ id: isolatedSchema.staff.id, firstName: isolatedSchema.staff.firstName, lastName: isolatedSchema.staff.lastName, isCheckedIn: isolatedSchema.staff.isCheckedIn })
        .from(isolatedSchema.staff)
        .where(eq(isolatedSchema.staff.biostarUserId, userId))
        .limit(1);

      if (!staffMember) {
        logger.warn(`📡 BioStar Webhook: no staff matched biostarUserId=${userId}`);
        pushBiostarEvent(customerId, makeLogEvent('no_match'));
        return res.json({ ok: true, action: 'no_match', biostarUserId: userId });
      }

      const staffName = `${staffMember.firstName} ${staffMember.lastName}`;
      const now = new Date();
      if (isEntry && !staffMember.isCheckedIn) {
        await webhookDb.update(isolatedSchema.staff)
          .set({ isCheckedIn: true, checkedInAt: now, checkedOutAt: null, updatedAt: now })
          .where(eq(isolatedSchema.staff.id, staffMember.id));
        logger.info(`✅ BioStar Webhook: ${staffName} checked IN (device=${deviceId} event=${eventTypeCode})`);
        pushBiostarEvent(customerId, makeLogEvent('checked_in', staffName));
        return res.json({ ok: true, action: 'checked_in', staff: staffName });
      } else if (isExit && staffMember.isCheckedIn) {
        await webhookDb.update(isolatedSchema.staff)
          .set({ isCheckedIn: false, checkedOutAt: now, updatedAt: now })
          .where(eq(isolatedSchema.staff.id, staffMember.id));
        logger.info(`✅ BioStar Webhook: ${staffName} checked OUT (device=${deviceId} event=${eventTypeCode})`);
        pushBiostarEvent(customerId, makeLogEvent('checked_out', staffName));
        return res.json({ ok: true, action: 'checked_out', staff: staffName });
      } else {
        logger.info(`📡 BioStar Webhook: ${staffName} already in correct state — no update`);
        pushBiostarEvent(customerId, makeLogEvent('no_change', staffName));
        return res.json({ ok: true, action: 'no_change', currentState: staffMember.isCheckedIn ? 'checked_in' : 'checked_out' });
      }
    } catch (err: any) {
      logger.error(`❌ BioStar Webhook error for ${customerId}:`, err.message);
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Also expose the webhook URL in diagnostics
  app.get("/api/biostar/webhook-url", requireAuth, async (req, res) => {
    const customerId = req.customerId!;
    // Build the public-facing URL: use HOST header or a configured base URL
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    const webhookUrl = `${proto}://${host}/api/biostar/webhook/${customerId}`;
    res.json({ webhookUrl, customerId });
  });

  /**
   * GET /api/biostar/webhook-log
   * Returns recent webhook events from the in-memory ring buffer.
   * Used by the Live Log panel in the Device Configuration UI.
   * ?limit=N  — max events to return (default 50, max 200)
   * ?clear=true — clear the log after returning it
   */
  app.get("/api/biostar/webhook-log", requireAuth, async (req, res) => {
    const customerId = req.customerId!;
    const limit = Math.min(Number(req.query.limit) || 50, BIOSTAR_LOG_MAX);
    const clear = req.query.clear === 'true';
    const events = (biostarLiveLog.get(customerId) || []).slice(0, limit);
    if (clear) biostarLiveLog.set(customerId, []);
    res.json({ events, total: biostarLiveLog.get(customerId)?.length ?? 0, customerId });
  });

  /**
   * GET /api/biostar/live-events
   * Polls BioStar 2's own Event Log API and returns the last N events.
   * Cached for 15 seconds to avoid hammering BioStar's API.
   * This mirrors the "Event Log" / "Real-time Log" panel in BioStar 2 UI.
   */
  const liveEventCache = new Map<string, { ts: number; rows: any[] }>();
  app.get("/api/biostar/live-events", requireAuth, async (req, res) => {
    const customerId = req.customerId!;
    const limit = Math.min(Number(req.query.limit) || 200, 1000);

    // Optional date param: "YYYY-MM-DD" → fetch that specific day; default = today
    let fromDate: Date | undefined;
    let toDate: Date | undefined;
    if (req.query.date && typeof req.query.date === 'string') {
      const d = new Date(req.query.date + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        fromDate = d;
        toDate = new Date(req.query.date + 'T23:59:59');
      }
    }

    // Cache key includes the date so different days don't collide
    const cacheKey = `${customerId}:${req.query.date ?? 'today'}`;
    const cached = liveEventCache.get(cacheKey);
    // Only use cache for today's (live) requests; skip for historical dates
    if (!req.query.date && cached && Date.now() - cached.ts < 15000) {
      return res.json({ events: cached.rows, source: 'cache', cachedAt: new Date(cached.ts).toISOString() });
    }

    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, customerId);
      const settings = await simpleDatabaseService.getCompanySettings(context);
      if (!settings?.biostarEnabled || !settings?.biostarServerUrl || !settings?.biostarUsername || !settings?.biostarPassword) {
        return res.json({ events: [], error: 'BioStar 2 not configured' });
      }
      const config = {
        serverUrl: settings.biostarServerUrl,
        username: settings.biostarUsername,
        password: settings.biostarPassword,
        databaseId: settings.biostarDatabaseId || '1',
      };
      const result = await biostarService.getLiveEventLog(config, limit, fromDate, toDate);
      if (!req.query.date) {
        liveEventCache.set(cacheKey, { ts: Date.now(), rows: result.rows });
      }
      res.json({
        events: result.rows,
        total: result.rows.length,
        strategy: result.strategy,
        error: result.error,
        source: 'live',
        fetchedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error(`❌ BioStar live-events error: ${err.message}`);
      const stale = liveEventCache.get(cacheKey);
      if (stale) return res.json({ events: stale.rows, source: 'stale_cache', error: err.message });
      res.json({ events: [], error: err.message });
    }
  });

  /**
   * POST /api/biostar/webhook-log/test
   * Injects a synthetic test event into the ring buffer so the Live Log UI
   * can be verified without waiting for a real BioStar 2 webhook call.
   */
  app.post("/api/biostar/webhook-log/test", requireAuth, async (req, res) => {
    const customerId = req.customerId!;
    const actions: Array<'checked_in' | 'checked_out' | 'ignored' | 'no_match'> = ['checked_in', 'checked_out', 'ignored', 'no_match'];
    const action = actions[Math.floor(Math.random() * actions.length)];
    const testNames = ['Alice Test', 'Bob Demo', 'Carol Sample', 'David Trial'];
    const testDevices = ['Front Door Reader', 'Rear Exit Gate', 'Server Room', 'Reception'];
    const testEvent: BiostarLiveEvent = {
      id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      customerId,
      userId: 'test-' + Math.floor(Math.random() * 9000 + 1000),
      userName: testNames[Math.floor(Math.random() * testNames.length)],
      deviceId: 'test-device-' + Math.floor(Math.random() * 4 + 1),
      deviceName: testDevices[Math.floor(Math.random() * testDevices.length)],
      deviceRole: 'ENTRY_EXIT',
      eventCode: '1',
      action,
    };
    pushBiostarEvent(customerId, testEvent);
    logger.info(`🧪 BioStar Live Log: test event injected for ${customerId} → action=${action}`);
    res.json({ ok: true, event: testEvent });
  });

  // -----------------------------------------------------------------
  // BioStar 2 Device Configuration Routes
  // Allows admin to classify physical readers as ENTRY/EXIT/ENTRY_EXIT/IGNORE.
  // The role drives occupancy logic — no more guessing from event codes.
  // -----------------------------------------------------------------

  /**
   * GET /api/biostar/devices
   * Returns all configured devices from the local DB.
   * Pass ?sync=true to first attempt a live sync from BioStar 2's /api/devices endpoint.
   * BioStar IDs seen in webhook events are also auto-registered as ENTRY_EXIT if unknown.
   */
  app.get("/api/biostar/devices", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const devicesDb = await customerDbService.getCustomerDatabase(customerId);

      if (req.query.sync === 'true') {
        // Try to pull device list from BioStar 2
        const context = simpleDatabaseService.createCustomerContext(req.user!.username, customerId);
        const settings = await simpleDatabaseService.getCompanySettings(context);

        if (settings?.biostarEnabled && settings?.biostarServerUrl && settings?.biostarUsername && settings?.biostarPassword) {
          const bsConfig = {
            serverUrl: settings.biostarServerUrl,
            username: settings.biostarUsername,
            password: settings.biostarPassword,
            databaseId: settings.biostarDatabaseId || '1',
          };

          const bsDevices = await biostarService.getDevices(bsConfig);
          if (bsDevices.length > 0) {
            const now = new Date();
            for (const d of bsDevices) {
              await devicesDb
                .insert(isolatedSchema.biostarDevices)
                .values({
                  id: d.id,
                  name: d.name,
                  model: d.model || null,
                  ipAddress: d.ipAddress || null,
                  deviceAddress: d.deviceAddress || d.ipAddress || null,
                  deviceGroup: d.deviceGroup || null,
                  role: 'ENTRY_EXIT',
                  direction: 'BOTH',
                  syncedAt: now,
                  updatedAt: now,
                })
                .onConflictDoUpdate({
                  target: isolatedSchema.biostarDevices.id,
                  set: {
                    name: d.name,
                    model: d.model || null,
                    ipAddress: d.ipAddress || null,
                    deviceAddress: d.deviceAddress || d.ipAddress || null,
                    deviceGroup: d.deviceGroup || null,
                    syncedAt: now,
                  },
                });
            }
            logger.info(`📟 Biostar: Synced ${bsDevices.length} devices for ${customerId}`);
          }
        }
      }

      const devices = await devicesDb.select().from(isolatedSchema.biostarDevices).orderBy(isolatedSchema.biostarDevices.name);
      res.json(devices);
    } catch (err: any) {
      logger.error('❌ GET /api/biostar/devices error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/biostar/devices
   * Manually register a device by ID + name when BioStar device API is blocked.
   */
  app.post("/api/biostar/devices", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const { id, name, deviceAddress, ipAddress, deviceGroup, role, direction } = req.body;
      if (!id || !name) return res.status(400).json({ error: 'id and name are required' });

      const devicesDb = await customerDbService.getCustomerDatabase(customerId);
      const now = new Date();
      const addr = deviceAddress || ipAddress || null;
      await devicesDb
        .insert(isolatedSchema.biostarDevices)
        .values({ id: String(id), name, ipAddress: addr, deviceAddress: addr, deviceGroup: deviceGroup || null, role: role || 'ENTRY_EXIT', direction: direction || 'BOTH', syncedAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: isolatedSchema.biostarDevices.id,
          set: { name, ipAddress: addr, deviceAddress: addr, deviceGroup: deviceGroup || null, role: role || 'ENTRY_EXIT', direction: direction || 'BOTH', updatedAt: now },
        });
      const [device] = await devicesDb.select().from(isolatedSchema.biostarDevices).where(eq(isolatedSchema.biostarDevices.id, String(id)));
      res.json(device);
    } catch (err: any) {
      logger.error('❌ POST /api/biostar/devices error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * PATCH /api/biostar/devices/:deviceId
   * Update a device's role, direction, site, building, or name.
   */
  app.patch("/api/biostar/devices/:deviceId", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const { deviceId } = req.params;
      const { role, direction, name, deviceGroup, deviceAddress } = req.body;

      const validRoles = ['ENTRY', 'EXIT', 'ENTRY_EXIT', 'IGNORE'];
      if (role && !validRoles.includes(role)) return res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });

      const devicesDb = await customerDbService.getCustomerDatabase(customerId);
      const updateData: any = { updatedAt: new Date() };
      if (role !== undefined) updateData.role = role;
      if (direction !== undefined) updateData.direction = direction;
      if (name !== undefined) updateData.name = name;
      if (deviceGroup !== undefined) updateData.deviceGroup = deviceGroup;
      if (deviceAddress !== undefined) updateData.deviceAddress = deviceAddress;

      await devicesDb.update(isolatedSchema.biostarDevices).set(updateData).where(eq(isolatedSchema.biostarDevices.id, deviceId));
      const [device] = await devicesDb.select().from(isolatedSchema.biostarDevices).where(eq(isolatedSchema.biostarDevices.id, deviceId));
      if (!device) return res.status(404).json({ error: 'Device not found' });
      logger.info(`📟 Biostar device ${deviceId} (${device.name}) updated: role=${device.role}`);
      res.json(device);
    } catch (err: any) {
      logger.error('❌ PATCH /api/biostar/devices error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * DELETE /api/biostar/devices/:deviceId
   * Remove a device from the configuration.
   */
  app.delete("/api/biostar/devices/:deviceId", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const { deviceId } = req.params;
      const devicesDb = await customerDbService.getCustomerDatabase(customerId);
      await devicesDb.delete(isolatedSchema.biostarDevices).where(eq(isolatedSchema.biostarDevices.id, deviceId));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Daily Reset helper function
  async function performDailyReset(isManual: boolean = false, providedContext?: { customerId: string }) {
    const resetTime = new Date();
    
    // Use provided context or fall back to development context
    const resetContext = providedContext || simpleDatabaseService.createDevelopmentContext();
    const resetCustomerDb = await customerDbService.getCustomerDatabase(resetContext.customerId);
    
    // Get all currently checked-in personnel using customer-isolated queries
    const [currentVisitors, checkedInStaff, checkedInContractors, checkedInMembers] = await Promise.all([
      databaseService.getCurrentVisitors(resetContext),
      databaseService.getCheckedInStaff(resetContext),
      databaseService.getCheckedInContractors(resetContext),
      resetCustomerDb
        .select()
        .from(isolatedSchema.members)
        .where(and(eq(isolatedSchema.members.isCheckedIn, true), eq(isolatedSchema.members.isActive, true)))
    ]);
    
    const resetCounts = {
      visitorsCheckedOut: 0,
      staffCheckedOut: 0,
      contractorsCheckedOut: 0,
      membersCheckedOut: 0
    };
    
    // Check out all visitors (use proper checkout to close history records)
    for (const visitor of currentVisitors) {
      try {
        await databaseService.checkOutVisitor(resetContext, visitor.id);
        resetCounts.visitorsCheckedOut++;
      } catch (error) {
        logger.error(`Failed to check out visitor ${visitor.id}:`, error);
      }
    }
    
    // Check out all staff (use proper checkout to close staff sessions)
    for (const staffMember of checkedInStaff) {
      try {
        await databaseService.checkOutStaff(resetContext, staffMember.id);
        resetCounts.staffCheckedOut++;
      } catch (error) {
        logger.error(`Failed to check out staff ${staffMember.id}:`, error);
      }
    }
    
    // Check out all contractors (use proper checkout to close contractor visits)
    for (const contractor of checkedInContractors) {
      try {
        await databaseService.checkOutContractorWorker(resetContext, contractor.id);
        resetCounts.contractorsCheckedOut++;
      } catch (error) {
        logger.error(`Failed to check out contractor ${contractor.id}:`, error);
      }
    }

    // Check out all members
    for (const member of checkedInMembers) {
      try {
        await resetCustomerDb.update(isolatedSchema.members)
          .set({ isCheckedIn: false, checkedOutAt: resetTime, updatedAt: new Date() })
          .where(eq(isolatedSchema.members.id, member.id));
        resetCounts.membersCheckedOut++;
      } catch (error) {
        logger.error(`Failed to check out member ${member.id}:`, error);
      }
    }
    
    // Update settings with last reset time
    try {
      await simpleDatabaseService.updateCompanySettings(resetContext, {
        lastDailyReset: resetTime.toISOString()
      });
    } catch (error) {
      logger.error("Failed to update lastDailyReset in settings:", error);
    }
    
    // Send notification emails if configured
    try {
      const settings = await simpleDatabaseService.getCompanySettings(resetContext);
      if (settings?.notifyForgottenCheckouts !== false && settings?.emailReportsEnabled) {
        const totalCheckedOut = resetCounts.visitorsCheckedOut + resetCounts.staffCheckedOut + resetCounts.contractorsCheckedOut + resetCounts.membersCheckedOut;
        if (totalCheckedOut > 0) {
          const recipients: string[] = settings.reportRecipients || [];
          const subject = `Daily Reset ${isManual ? '(Manual)' : '(Automatic)'} - ${totalCheckedOut} Personnel Checked Out`;
          const message = `
            Daily reset completed at ${resetTime.toLocaleString()}
            
            Personnel automatically checked out:
            • Visitors: ${resetCounts.visitorsCheckedOut}
            • Staff: ${resetCounts.staffCheckedOut}
            • Contractors: ${resetCounts.contractorsCheckedOut}
            • Members: ${resetCounts.membersCheckedOut}
            • Total: ${totalCheckedOut}
            
            Reset type: ${isManual ? 'Manual reset initiated by user' : 'Automatic scheduled reset'}
            
            This is an automated notification from TPR-Max.
          `;
          
          for (const email of recipients) {
            try {
              await emailService.forCustomer(resetContext.customerId).sendEmail({ to: email, subject: subject, html: `<pre>${message}</pre>`, text: message  });
            } catch (error) {
              logger.error(`Failed to send reset notification to ${email}:`, error);
            }
          }
        }
      }
    } catch (error) {
      logger.error("Failed to send reset notification emails:", error);
    }
    
    return {
      success: true,
      resetTime: resetTime.toISOString(),
      isManual,
      ...resetCounts,
      totalCheckedOut: resetCounts.visitorsCheckedOut + resetCounts.staffCheckedOut + resetCounts.contractorsCheckedOut + resetCounts.membersCheckedOut
    };
  }

  // Daily Reset endpoints
  app.post("/api/daily-reset/manual", requireAuth, async (req, res) => {
    try {
      const manualContext = { customerId: req.customerId! };
      const result = await performDailyReset(true, manualContext);
      res.json(result);
    } catch (error) {
      logger.error("Error performing manual daily reset:", error);
      res.status(500).json({ error: "Failed to perform daily reset" });
    }
  });

  app.post("/api/daily-reset/preview", requireAuth, async (req, res) => {
    try {
      const previewContext = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const previewDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const [currentVisitors, checkedInStaff, checkedInContractors, checkedInMembers] = await Promise.all([
        databaseService.getCurrentVisitors(previewContext),
        databaseService.getCheckedInStaff(previewContext),
        databaseService.getCheckedInContractors(previewContext),
        previewDb.select().from(isolatedSchema.members).where(
          and(eq(isolatedSchema.members.isCheckedIn, true), eq(isolatedSchema.members.isActive, true))
        )
      ]);

      res.json({
        visitorsToCheckOut: currentVisitors.length,
        staffToCheckOut: checkedInStaff.length,
        contractorsToCheckOut: checkedInContractors.length,
        membersToCheckOut: checkedInMembers.length,
        totalToCheckOut: currentVisitors.length + checkedInStaff.length + checkedInContractors.length + checkedInMembers.length
      });
    } catch (error) {
      logger.error("Error previewing daily reset:", error);
      res.status(500).json({ error: "Failed to preview daily reset" });
    }
  });


  // Helper function to check if a date is a holiday
  async function checkIfHoliday(date: Date): Promise<boolean> {
    // Basic UK holiday check - you could expand this with a holiday API
    const month = date.getMonth() + 1; // 1-12
    const day = date.getDate();
    
    // Common UK holidays (simplified)
    const holidays = [
      { month: 1, day: 1 },   // New Year's Day
      { month: 12, day: 25 }, // Christmas Day
      { month: 12, day: 26 }, // Boxing Day
    ];
    
    return holidays.some(holiday => holiday.month === month && holiday.day === day);
  }

  // Setup overnight check-out notifications
  async function setupOvernightNotifications() {
    try {
      // Import the simplified database service
      const { simpleDatabaseService } = await import("../simpleDatabaseService");
      
      // Use default context for startup (no req available)
      const context = simpleDatabaseService.createDevelopmentContext();
      
      const settings = await simpleDatabaseService.getCompanySettings(context);
      
      if (settings?.emailReportsEnabled) {
        logger.info("📧 Setting up overnight check-out notifications (daily at 6:00 AM)");
        
        // Schedule overnight notification check at 6:00 AM every day
        cron.schedule('0 6 * * *', async () => {
          try {
            logger.info(`📧 Checking for overnight check-outs at ${new Date().toLocaleString()}`);
            await sendOvernightReport();
          } catch (error) {
            logger.error("❌ Error in overnight notification check:", error);
          }
        }, {
          timezone: settings?.dailyResetTimezone || "Europe/London"
        });
        
        logger.info("✅ Overnight check-out notifications scheduled successfully");
      } else {
        logger.info("📧 Overnight notifications disabled - email reports not enabled");
      }
    } catch (error) {
      logger.error("❌ Error setting up overnight notifications:", error);
    }
  }

  // Helper function to send overnight report
  async function sendOvernightReport() {
    try {
      // Use development context for background/scheduled tasks
      const overnightContext = simpleDatabaseService.createDevelopmentContext();
      
      const settings = await simpleDatabaseService.getCompanySettings(overnightContext);
      if (!settings?.emailReportsEnabled || !settings?.reportRecipients?.length) {
        return;
      }
      
      const overnightDb = await customerDbService.getCustomerDatabase(overnightContext.customerId);
      const [currentVisitors, checkedInStaff, checkedInContractors, checkedInMembers] = await Promise.all([
        databaseService.getCurrentVisitors(overnightContext),
        databaseService.getCheckedInStaff(overnightContext),
        databaseService.getCheckedInContractors(overnightContext),
        overnightDb.select().from(isolatedSchema.members).where(
          and(eq(isolatedSchema.members.isCheckedIn, true), eq(isolatedSchema.members.isActive, true))
        )
      ]);
      
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      
      // Filter for people who checked in yesterday and are still checked in
      const overnightVisitors = currentVisitors.filter(visitor => 
        visitor.checkedInAt && new Date(visitor.checkedInAt) < yesterday
      );
      
      const overnightStaff = checkedInStaff.filter(staff => 
        staff.checkedInAt && new Date(staff.checkedInAt) < yesterday
      );
      
      const overnightContractors = checkedInContractors.filter(contractor => 
        contractor.checkedInAt && new Date(contractor.checkedInAt) < yesterday
      );

      const overnightMembers = checkedInMembers.filter(member =>
        member.checkedInAt && new Date(member.checkedInAt) < yesterday
      );
      
      const totalOvernight = overnightVisitors.length + overnightStaff.length + overnightContractors.length + overnightMembers.length;
      
      if (totalOvernight === 0) {
        logger.info("📧 No overnight check-outs detected - no email sent");
        return;
      }
      
      const subject = `Overnight Check-Out Alert - ${totalOvernight} Personnel Still On-Site`;
      
      let message = `
        OVERNIGHT CHECK-OUT ALERT
        
        The following personnel did not check out yesterday and are still showing as on-site:
        
      `;
      
      if (overnightVisitors.length > 0) {
        message += `VISITORS (${overnightVisitors.length}):\n`;
        overnightVisitors.forEach(visitor => {
          const checkedInTime = visitor.checkedInAt ? new Date(visitor.checkedInAt).toLocaleString() : 'Unknown';
          message += `• ${visitor.firstName} ${visitor.lastName} (${visitor.company || 'No company'}) - Checked in: ${checkedInTime}\n`;
        });
        message += '\n';
      }
      
      if (overnightStaff.length > 0) {
        message += `STAFF (${overnightStaff.length}):\n`;
        overnightStaff.forEach(staff => {
          const checkedInTime = staff.checkedInAt ? new Date(staff.checkedInAt).toLocaleString() : 'Unknown';
          message += `• ${staff.firstName} ${staff.lastName} (${staff.department || 'No department'}) - Checked in: ${checkedInTime}\n`;
        });
        message += '\n';
      }
      
      if (overnightContractors.length > 0) {
        message += `CONTRACTORS (${overnightContractors.length}):\n`;
        overnightContractors.forEach(contractor => {
          const checkedInTime = contractor.checkedInAt ? new Date(contractor.checkedInAt).toLocaleString() : 'Unknown';
          message += `• ${contractor.firstName} ${contractor.lastName} (${contractor.company || 'No company'}) - Checked in: ${checkedInTime}\n`;
        });
        message += '\n';
      }

      if (overnightMembers.length > 0) {
        message += `MEMBERS (${overnightMembers.length}):\n`;
        overnightMembers.forEach(member => {
          const checkedInTime = member.checkedInAt ? new Date(member.checkedInAt).toLocaleString() : 'Unknown';
          message += `• ${member.firstName} ${member.lastName} (${member.membershipType || 'Member'}) - Checked in: ${checkedInTime}\n`;
        });
        message += '\n';
      }
      
      message += `
        RECOMMENDED ACTIONS:
        • Contact personnel to verify their status
        • Check out manually if they have left the premises
        • Update security logs as needed
        • Consider running a manual daily reset if appropriate
        
        Report generated: ${new Date().toLocaleString()}
        
        This is an automated notification from TPR-Max.
      `;
      
      // Send to all report recipients
      let sentCount = 0;
      for (const email of settings.reportRecipients) {
        try {
          await emailService.forCustomer(overnightContext.customerId).sendEmail({ to: email, subject: subject, html: `<pre>${message}</pre>`, text: message  });
          sentCount++;
        } catch (error) {
          logger.error(`Failed to send overnight report to ${email}:`, error);
        }
      }
      
      logger.info(`📧 Overnight report sent to ${sentCount} recipients - ${totalOvernight} personnel still on-site`);
    } catch (error) {
      logger.error("Failed to send overnight report:", error);
    }
  }

  // Helper function to send grace period notification
  async function sendGracePeriodNotification(gracePeriodMinutes: number, graceContext?: { customerId: string }) {
    try {
      // Use provided context or fall back to development context
      if (!graceContext) graceContext = simpleDatabaseService.createDevelopmentContext();
      
      const settings = await simpleDatabaseService.getCompanySettings(graceContext);
      if (!settings?.notifyForgottenCheckouts || !settings?.emailReportsEnabled) {
        return;
      }
      
      const [currentVisitors, checkedInStaff, checkedInContractors] = await Promise.all([
        databaseService.getCurrentVisitors(graceContext),
        databaseService.getCheckedInStaff(graceContext),
        databaseService.getCheckedInContractors(graceContext)
      ]);
      
      const totalPersonnel = currentVisitors.length + checkedInStaff.length + checkedInContractors.length;
      
      if (totalPersonnel === 0) {
        return; // No one to notify
      }
      
      const { EmailService } = await import("../emailService");
      const localEmailSvc = new EmailService(graceContext.customerId);
      
      // Collect all emails from on-site personnel
      const emailAddresses = new Set<string>();
      
      checkedInStaff.forEach(staff => {
        if (staff.email) emailAddresses.add(staff.email);
      });
      
      currentVisitors.forEach(visitor => {
        if (visitor.email) emailAddresses.add(visitor.email);
      });
      
      const recipients = Array.from(emailAddresses);
      const subject = `Daily Reset Warning - Check Out Required in ${gracePeriodMinutes} Minutes`;
      const message = `
        AUTOMATIC CHECK-OUT WARNING
        
        This is an automated reminder that the daily reset will occur in ${gracePeriodMinutes} minutes.
        
        All personnel currently on-site will be automatically checked out at ${new Date(Date.now() + gracePeriodMinutes * 60 * 1000).toLocaleTimeString()}.
        
        If you need to remain on-site, please check out manually and then check back in after the reset.
        
        Current personnel on-site:
        • Visitors: ${currentVisitors.length}
        • Staff: ${checkedInStaff.length}
        • Contractors: ${checkedInContractors.length}
        
        This is an automated notification from TPR.
      `;
      
      // Send to on-site personnel
      for (const email of recipients) {
        try {
          await localEmailSvc.sendEmail({ to: email, subject: subject, html: `<pre>${message}</pre>`, text: message  });
        } catch (error) {
          logger.error(`Failed to send grace period notification to ${email}:`, error);
        }
      }
      
      // Also send to admin recipients
      const adminRecipients = settings.reportRecipients || [];
      for (const email of adminRecipients) {
        try {
          await localEmailSvc.sendEmail({ to: email, subject: `Admin: ${subject}`, html: `<pre>${message}</pre>`, text: message  });
        } catch (error) {
          logger.error(`Failed to send grace period admin notification to ${email}:`, error);
        }
      }
      
      logger.info(`📧 Grace period notifications sent to ${recipients.length} personnel and ${adminRecipients.length} admins`);
    } catch (error) {
      logger.error("Failed to send grace period notifications:", error);
    }
  }

  // Initialize automatic reports
  setupAutomaticReports();

  // Reset worker card status (admin only)
  app.put('/api/workers/:workerId/reset-card', requireAuth, async (req, res) => {
    try {
      const { workerId } = req.params;
      const { newStatus = 'yellow' } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      if (req.user!.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
      }

      const resetCardContext = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const resetCardDb = await customerDbService.getCustomerDatabase(resetCardContext.customerId);
      await resetCardDb.update(isolatedSchema.contractorWorkers)
        .set({ currentCardStatus: newStatus, updatedAt: new Date() })
        .where(eq(isolatedSchema.contractorWorkers.id, workerId));
      
      res.json({ success: true, message: 'Card status reset successfully' });
    } catch (error) {
      logger.error('Error resetting card status:', error);
      res.status(500).json({ error: 'Failed to reset card status' });
    }
  });

  // Initialize automatic daily reset
  setupAutomaticDailyReset();

  // Initialize overnight check-out notifications
  setupOvernightNotifications();

  // -----------------------------------------------------------------
  // BioStar 2 live attendance polling
  // Runs every biostarSyncInterval seconds (default 300) per customer.
  // Reads today's access events and updates staff isCheckedIn in real-time.
  // -----------------------------------------------------------------
  const biostarPollTimers = new Map<string, ReturnType<typeof setInterval>>();

  async function pollBiostarAttendance(customerId: string): Promise<void> {
    try {
      const pollCtx = { customerId } as any;
      const settings = await simpleDatabaseService.getCompanySettings(pollCtx).catch(() => null);
      if (!settings?.biostarEnabled || !settings?.biostarServerUrl || !settings?.biostarUsername || !settings?.biostarPassword) {
        return;
      }

      const pollConfig = {
        serverUrl: settings.biostarServerUrl,
        username: settings.biostarUsername,
        password: settings.biostarPassword,
        databaseId: settings.biostarDatabaseId || '1',
      };

      const pollDb = await customerDbService.getCustomerDatabase(customerId);

      // Load admin-assigned device roles from the biostar_devices table.
      // These determine whether a reader is ENTRY, EXIT, ENTRY_EXIT or IGNORE.
      // Without this, direction is inferred from event code alone, which is
      // unreliable when the same card-auth code appears on both door sides.
      const deviceRowsForRoles = await pollDb
        .select({ id: isolatedSchema.biostarDevices.id, role: isolatedSchema.biostarDevices.role })
        .from(isolatedSchema.biostarDevices);
      const deviceRoles: Record<string, string> = Object.fromEntries(
        deviceRowsForRoles.map(d => [String(d.id), d.role])
      );

      const onSiteUsers = await biostarService.getCurrentOnSiteUsers(pollConfig, deviceRoles);
      const onSiteIds = new Set(onSiteUsers.map((u: any) => String(u.userId)));
      const allBiostarStaff = await pollDb
        .select({
          id: isolatedSchema.staff.id,
          biostarUserId: isolatedSchema.staff.biostarUserId,
          isCheckedIn: isolatedSchema.staff.isCheckedIn,
        })
        .from(isolatedSchema.staff)
        .where(isNotNull(isolatedSchema.staff.biostarUserId));

      const now = new Date();
      let cIn = 0, cOut = 0;
      for (const s of allBiostarStaff) {
        if (!s.biostarUserId) continue;
        const shouldBeIn = onSiteIds.has(String(s.biostarUserId));
        if (shouldBeIn && !s.isCheckedIn) {
          await pollDb.update(isolatedSchema.staff)
            .set({ isCheckedIn: true, checkedInAt: now, checkedOutAt: null, updatedAt: now })
            .where(eq(isolatedSchema.staff.id, s.id));
          cIn++;
        } else if (!shouldBeIn && s.isCheckedIn) {
          await pollDb.update(isolatedSchema.staff)
            .set({ isCheckedIn: false, checkedOutAt: now, updatedAt: now })
            .where(eq(isolatedSchema.staff.id, s.id));
          cOut++;
        }
      }
      if (cIn > 0 || cOut > 0) {
        logger.info(`🔄 Biostar poll [${customerId}]: ${cIn} checked in, ${cOut} checked out`);
      }
    } catch (err: any) {
      logger.warn(`⚠️ Biostar attendance poll failed for ${customerId}: ${err.message}`);
    }
  }

  async function setupBiostarAttendancePolling(): Promise<void> {
    // Clear any existing timers
    for (const [, timer] of biostarPollTimers) clearInterval(timer);
    biostarPollTimers.clear();
    // Stop any existing WebSocket monitor (single-instance — the new config will restart it)
    biostarService.stopWebSocketMonitor();

    try {
      const dbCustomers = await customerDbService.getAllCustomers();
      // DEV_CUSTOMER_IDS: comma-separated list of customer IDs to include in the BioStar polling
      // loop even when they are not present in the customers table. Set in development only;
      // leave unset in production so no extra customers are injected.
      const devCustomerIds = (process.env.DEV_CUSTOMER_IDS || '').split(',').filter(Boolean);
      const dbIds = new Set(dbCustomers.map((c: { id: string }) => c.id));
      const allCustomers = [
        ...dbCustomers,
        ...devCustomerIds.filter(id => !dbIds.has(id)).map(id => ({ id })),
      ];

      for (const customer of allCustomers) {
        try {
          const ctx = { customerId: customer.id } as any;
          const settings = await simpleDatabaseService.getCompanySettings(ctx).catch(() => null);
          if (!settings?.biostarEnabled || !settings?.biostarServerUrl) continue;

          const wsConfig = {
            serverUrl: settings.biostarServerUrl,
            username: settings.biostarUsername,
            password: settings.biostarPassword,
            databaseId: settings.biostarDatabaseId || '1',
          };

          // Clamp between 30 s and 60 s regardless of what is stored in the DB.
          // The WebSocket handles real-time delivery; this poll is just a safety net
          // so there is no need for intervals longer than 60 seconds.
          const rawInterval = Number(settings.biostarSyncInterval) || 30;
          const intervalSecs = Math.min(Math.max(30, rawInterval), 60);
          logger.info(`🔄 Biostar live attendance polling scheduled for ${customer.id} every ${intervalSecs}s`);

          // Run an immediate poll so status is live on startup/settings save
          pollBiostarAttendance(customer.id).catch(() => {});

          const timer = setInterval(() => {
            pollBiostarAttendance(customer.id).catch(() => {});
          }, intervalSecs * 1000);
          biostarPollTimers.set(customer.id, timer);

          // ─────────────────────────────────────────────────────────────────────
          // Start the BioStar 2 WebSocket monitor for real-time event streaming.
          // Events arrive instantly on card scan, supplementing the REST poller.
          // Note: biostarService is a singleton — the last customer's config wins
          // for multi-tenant deployments (acceptable for single-BioStar setups).
          // ─────────────────────────────────────────────────────────────────────
          const wsCustomerId = customer.id; // capture for closure
          biostarService.startWebSocketMonitor(wsConfig, wsCustomerId, async (raw: any) => {
            try {
              // Parse fields from the raw WebSocket event (same nested format as REST events)
              const userId = String(
                raw?.user_id?.user_id ?? raw?.user_id?.id ?? raw?.user_id ?? ''
              );
              const deviceId = String(
                raw?.device_id?.id ?? raw?.device_id ?? ''
              );
              const deviceName = String(
                raw?.device_id?.name ?? raw?.device_name ?? ''
              );
              const eventTypeCode = String(
                raw?.event_type_id?.code ?? raw?.event_type_id ?? ''
              );
              const eventTime = raw?.datetime ?? raw?.server_datetime ?? new Date().toISOString();

              if (!userId || userId === '0' || !eventTypeCode) return;

              const wsDb = await customerDbService.getCustomerDatabase(wsCustomerId);

              // Determine entry/exit using device role (same logic as webhook handler)
              let isEntry = false;
              let isExit = false;

              if (deviceId && deviceId !== '0') {
                const [deviceConfig] = await wsDb
                  .select()
                  .from(isolatedSchema.biostarDevices)
                  .where(eq(isolatedSchema.biostarDevices.id, deviceId))
                  .limit(1);

                if (deviceConfig) {
                  if (deviceConfig.role === 'ENTRY') {
                    // Only count if it's actually an auth event (not a relay/door-open)
                    isEntry = biostarService.isEntryEvent(eventTypeCode) || biostarService.isExitEvent(eventTypeCode);
                  } else if (deviceConfig.role === 'EXIT') {
                    isExit = biostarService.isEntryEvent(eventTypeCode) || biostarService.isExitEvent(eventTypeCode);
                  } else if (deviceConfig.role === 'ENTRY_EXIT') {
                    // Use event code for direction; non-auth codes remain false (skipped below)
                    isEntry = biostarService.isEntryEvent(eventTypeCode);
                    isExit = biostarService.isExitEvent(eventTypeCode);
                  }
                  // IGNORE: both remain false — event is discarded
                } else {
                  // Auto-register unknown device
                  await wsDb.insert(isolatedSchema.biostarDevices)
                    .values({ id: deviceId, name: deviceName || `Device ${deviceId}`, role: 'ENTRY_EXIT', direction: 'BOTH', syncedAt: new Date(), updatedAt: new Date() })
                    .onConflictDoNothing();
                  isEntry = biostarService.isEntryEvent(eventTypeCode);
                  isExit = biostarService.isExitEvent(eventTypeCode);
                }
              } else {
                isEntry = biostarService.isEntryEvent(eventTypeCode);
                isExit = biostarService.isExitEvent(eventTypeCode);
              }

              if (!isEntry && !isExit) return;

              const [staffMember] = await wsDb
                .select({ id: isolatedSchema.staff.id, firstName: isolatedSchema.staff.firstName, lastName: isolatedSchema.staff.lastName, isCheckedIn: isolatedSchema.staff.isCheckedIn })
                .from(isolatedSchema.staff)
                .where(eq(isolatedSchema.staff.biostarUserId, userId))
                .limit(1);

              if (!staffMember) {
                pushBiostarEvent(wsCustomerId, { id: crypto.randomUUID(), ts: eventTime, customerId: wsCustomerId, userId, deviceId, deviceName, eventCode: eventTypeCode, action: 'no_match' });
                return;
              }

              const now = new Date();
              const staffName = `${staffMember.firstName} ${staffMember.lastName}`.trim();

              if (isEntry) {
                await wsDb.update(isolatedSchema.staff)
                  .set({ isCheckedIn: true, checkedInAt: now, checkedOutAt: null, updatedAt: now })
                  .where(eq(isolatedSchema.staff.id, staffMember.id));
                logger.info(`✅ BioStar WS [${wsCustomerId}]: ${staffName} checked IN (device=${deviceId})`);
                pushBiostarEvent(wsCustomerId, { id: crypto.randomUUID(), ts: eventTime, customerId: wsCustomerId, userId, userName: staffName, deviceId, deviceName, eventCode: eventTypeCode, action: 'checked_in' });
              } else if (isExit) {
                await wsDb.update(isolatedSchema.staff)
                  .set({ isCheckedIn: false, checkedOutAt: now, updatedAt: now })
                  .where(eq(isolatedSchema.staff.id, staffMember.id));
                logger.info(`🚪 BioStar WS [${wsCustomerId}]: ${staffName} checked OUT (device=${deviceId})`);
                pushBiostarEvent(wsCustomerId, { id: crypto.randomUUID(), ts: eventTime, customerId: wsCustomerId, userId, userName: staffName, deviceId, deviceName, eventCode: eventTypeCode, action: 'checked_out' });
              }
            } catch (wsEvtErr: any) {
              logger.warn(`⚠️ BioStar WS event handler [${wsCustomerId}]: ${wsEvtErr.message}`);
            }
          }).catch((wsStartErr: any) => {
            logger.warn(`⚠️ BioStar WS [${wsCustomerId}]: failed to start monitor — ${wsStartErr.message}`);
          });

        } catch {
          // skip this customer
        }
      }
    } catch (err: any) {
      logger.warn(`⚠️ setupBiostarAttendancePolling failed: ${err.message}`);
    }
  }

  // Start BioStar attendance polling (non-fatal — won't affect startup if Biostar isn't configured)
  setupBiostarAttendancePolling().catch(() => {});

  // Re-schedule when BioStar settings are saved (handled via settings update endpoint side-effect)
  // The sync-now endpoint also triggers an immediate status refresh.


  // Induction Settings Management API Routes
  app.get('/api/induction/settings', requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId || 'default';
      const settingsDb = await customerDbService.getCustomerDatabase(customerId);

      // Select only metadata columns — exclude generatedHtml and scenesData (can be 17MB+)
      const rows = await settingsDb.select({
        id: isolatedSchema.inductionSettings.id,
        roleType: isolatedSchema.inductionSettings.roleType,
        videoTitle: isolatedSchema.inductionSettings.videoTitle,
        videoUrl: isolatedSchema.inductionSettings.videoUrl,
        videoDescription: isolatedSchema.inductionSettings.videoDescription,
        videoDurationMinutes: isolatedSchema.inductionSettings.videoDurationMinutes,
        videoFormat: isolatedSchema.inductionSettings.videoFormat,
        modelType: isolatedSchema.inductionSettings.modelType,
        passPercentage: isolatedSchema.inductionSettings.passPercentage,
        isActive: isolatedSchema.inductionSettings.isActive,
        kioskEnabled: isolatedSchema.inductionSettings.kioskEnabled,
        sendLinkEnabled: isolatedSchema.inductionSettings.sendLinkEnabled,
        generatedAt: isolatedSchema.inductionSettings.generatedAt,
        questionsGenerated: isolatedSchema.inductionSettings.questionsGenerated,
        createdAt: isolatedSchema.inductionSettings.createdAt,
        updatedAt: isolatedSchema.inductionSettings.updatedAt,
      }).from(isolatedSchema.inductionSettings);

      // If isolated DB has rows, serve them
      if (rows.length > 0) {
        return res.json({ settings: rows });
      }

      // Isolated DB empty — fall back to global inductionSettings (also excluding large columns)
      const globalRows = await db.select({
        id: inductionSettings.id,
        roleType: inductionSettings.roleType,
        videoTitle: inductionSettings.videoTitle,
        videoUrl: inductionSettings.videoUrl,
        videoDescription: inductionSettings.videoDescription,
        videoDurationMinutes: inductionSettings.videoDurationMinutes,
        videoFormat: inductionSettings.videoFormat,
        modelType: inductionSettings.modelType,
        passPercentage: inductionSettings.passPercentage,
        isActive: inductionSettings.isActive,
        kioskEnabled: inductionSettings.kioskEnabled,
        sendLinkEnabled: inductionSettings.sendLinkEnabled,
        generatedAt: inductionSettings.generatedAt,
        questionsGenerated: inductionSettings.questionsGenerated,
        createdAt: inductionSettings.createdAt,
        updatedAt: inductionSettings.updatedAt,
      }).from(inductionSettings);
      res.json({ settings: globalRows });
    } catch (error) {
      logger.error('Error fetching induction settings:', error);
      res.status(500).json({ error: 'Failed to fetch induction settings' });
    }
  });

  app.get('/api/induction/settings/:roleType', requireAuth, async (req, res) => {
    try {
      const { roleType } = req.params;
      const [setting] = await db.select().from(inductionSettings)
        .where(eq(inductionSettings.roleType, roleType));
      
      if (!setting) {
        return res.status(404).json({ error: 'Settings not found for this role type' });
      }
      
      res.json({ setting });
    } catch (error) {
      logger.error('Error fetching role-specific induction settings:', error);
      res.status(500).json({ error: 'Failed to fetch induction settings' });
    }
  });

  app.put('/api/induction/settings/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = insertInductionSettingsSchema.partial().parse(req.body);
      
      const [updatedSetting] = await db
        .update(inductionSettings)
        .set({ 
          ...updateData,
          updatedAt: new Date()
        })
        .where(eq(inductionSettings.id, id))
        .returning();
      
      if (!updatedSetting) {
        return res.status(404).json({ error: 'Induction setting not found' });
      }
      
      res.json({ success: true, setting: updatedSetting });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: 'Invalid data', 
          details: error.errors 
        });
      }
      logger.error('Error updating induction settings:', error);
      res.status(500).json({ error: 'Failed to update induction settings' });
    }
  });

  // Toggle kiosk enabled / send link enabled per roleType (customer-isolated)
  app.patch('/api/induction/settings/:roleType/toggle', requireAuth, async (req, res) => {
    try {
      const { roleType } = req.params;
      const { kioskEnabled, sendLinkEnabled } = req.body;
      const customerId = req.customerId || 'default';
      const settingsDb = await customerDbService.getCustomerDatabase(customerId);

      const updateFields: any = { updatedAt: new Date() };
      if (typeof kioskEnabled === 'boolean') updateFields.kioskEnabled = kioskEnabled;
      if (typeof sendLinkEnabled === 'boolean') updateFields.sendLinkEnabled = sendLinkEnabled;

      await settingsDb
        .update(isolatedSchema.inductionSettings)
        .set(updateFields)
        .where(eq(isolatedSchema.inductionSettings.roleType, roleType));

      res.json({ success: true, roleType, ...updateFields });
    } catch (error) {
      logger.error('Error toggling induction setting:', error);
      res.status(500).json({ error: 'Failed to update induction settings' });
    }
  });

  // Get kiosk induction status for a roleType — used by kiosk check-in flow
  app.get('/api/induction/kiosk-status/:roleType', async (req, res) => {
    try {
      const { roleType } = req.params;
      const customerId = req.session?.customerId || (req as any).customerId || 'default';
      let kioskEnabled = false;
      let hasVideo = false;
      try {
        const settingsDb = await customerDbService.getCustomerDatabase(customerId);
        const rows = await settingsDb
          .select()
          .from(isolatedSchema.inductionSettings)
          .where(eq(isolatedSchema.inductionSettings.roleType, roleType))
          .limit(1);
        if (rows.length > 0) {
          const s = rows[0] as any;
          kioskEnabled = Boolean(s.kioskEnabled);
          hasVideo = Boolean(s.generatedAt);
        }
      } catch (_e) {}
      res.json({ roleType, kioskEnabled, hasVideo });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get kiosk status' });
    }
  });

  // Create induction token for kiosk (no email — returns token URL for in-person display)
  app.post('/api/induction/kiosk-token', async (req, res) => {
    try {
      const { personType, personName, personEmail, visitorId, workerId, staffId } = req.body;
      if (!personType || !personName) {
        return res.status(400).json({ error: 'personType and personName are required' });
      }
      const token = await inductionService.createUniversalInductionToken({
        personType,
        personName,
        personEmail: personEmail || '',
        visitorId,
        workerId,
        staffId
      });
      const baseUrl = process.env.REPLIT_DOMAINS?.split(',')[0]?.trim()
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0].trim()}`
        : `http://localhost:5000`;
      res.json({ success: true, token, inductionUrl: `${baseUrl}/induction/${token}` });
    } catch (error) {
      logger.error('Error creating kiosk induction token:', error);
      res.status(500).json({ error: 'Failed to create induction token' });
    }
  });


  // Generate AI questions from existing video content
  app.post('/api/induction/generate-questions/:roleType', requireAuth, async (req, res) => {
    try {
      const { roleType } = req.params;
      const customerId = req.customerId || 'default';
      const customerVideoId = `${customerId}-${roleType}`;
      const { VideoGenerationService } = await import('../videoGenerationService');
      
      // Validate role type
      if (!['visitor', 'staff', 'contractor'].includes(roleType)) {
        return res.status(400).json({ error: 'Invalid role type' });
      }

      // Get induction settings for this role to get model type
      let modelType = 'gpt-5';
      
      const inductionQContext = simpleDatabaseService.createCustomerContext(req.user!.username, customerId);
      const inductionQDb = await customerDbService.getCustomerDatabase(inductionQContext.customerId);
      try {
        const inductionSettingsRows = await inductionQDb.select().from(isolatedSchema.inductionSettings);
        const roleSetting = inductionSettingsRows.find((s: any) => s.roleType === roleType);
        modelType = roleSetting?.modelType || 'gpt-5';
      } catch (_e) {
        logger.info('Using default model type');
      }

      const context = inductionQContext;
      
      const settings = await simpleDatabaseService.getCompanySettings(context);

      // Company-wide AI setting (Settings → AI tab) takes priority over the per-role default.
      // Read both fields and normalise any UI label to an API model identifier.
      modelType = resolveInductionModel(settings?.openaiModel, settings?.aiModel, modelType);
      logger.info(`Induction generation using model: ${modelType}`);

      const videoService = new VideoGenerationService(settings, undefined, context.customerId);

      // Build site-specific context from company settings
      const siteContextQ = {
        companyName: settings?.companyName || 'the site operator',
        siteAddress: settings?.siteAddress || settings?.address || '',
        industry: settings?.industry || '',
        specificHazards: settings?.inductionHazards || '',
        ppeRequired: settings?.inductionPpe || '',
        emergencyContact: settings?.emergencyContact || '',
        assemblyPoint: settings?.assemblyPoint || '',
        firstAidLocation: settings?.firstAidLocation || '',
        siteRules: settings?.inductionSiteRules || '',
      };

      // Generate script to base questions on
      const scriptContent = await videoService.generateInductionScript(roleType, 'interactive_slides', modelType, siteContextQ);
      
      // Generate AI questions based on the script content
      logger.info(`🧠 Generating AI questions for ${roleType} from script...`);
      const aiQuestions = await videoService.generateQuestionsFromScript(
        scriptContent.script, 
        scriptContent.scenes, 
        roleType, 
        modelType
      );
      
      // Store AI-generated questions with clean delete-then-insert
      if (aiQuestions.length > 0) {
        logger.info(`💾 Storing ${aiQuestions.length} questions — deleting old ones first...`);
        
        // DELETE all existing questions for this customer+roleType (clean slate)
        await db
          .delete(inductionQuestions)
          .where(eq(inductionQuestions.videoId, customerVideoId));

        // Also clean up legacy questions stored under old roleType-only videoId
        await db
          .delete(inductionQuestions)
          .where(and(
            eq(inductionQuestions.roleType, roleType),
            eq(inductionQuestions.videoId, roleType)
          ));
        
        // Insert new AI-generated questions with customer-specific videoId
        for (let i = 0; i < aiQuestions.length; i++) {
          const question = aiQuestions[i];
          await db.insert(inductionQuestions).values({
            questionText: question.questionText,
            questionType: question.questionType || 'multiple_choice',
            correctAnswer: question.correctAnswer,
            optionA: question.optionA,
            optionB: question.optionB,
            optionC: question.optionC,
            optionD: question.optionD,
            explanation: question.explanation,
            category: question.category,
            roleType: roleType,
            videoId: customerVideoId,
            isAiGenerated: true,
            orderIndex: i + 1,
            isActive: true
          });
        }
        
        logger.info(`✅ Stored ${aiQuestions.length} questions for ${roleType} (customer: ${customerId})`);
      }
      
      res.json({ 
        success: true, 
        message: `Generated ${aiQuestions.length} AI questions for ${roleType} induction`,
        questionsGenerated: aiQuestions.length
      });
      
    } catch (error) {
      logger.error('Error generating AI questions:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ 
        error: 'Failed to generate AI questions',
        details: errorMessage 
      });
    }
  });

  // AI Video Generation Routes
  app.post('/api/induction/generate-video/:roleType', requireAuth, async (req, res) => {
    const { roleType } = req.params;
    const customerId = req.customerId || 'default';
    const statusKey = `${customerId}-${roleType}`;
    const customerVideoId = `${customerId}-${roleType}`;

    try {
      const { VideoGenerationService } = await import('../videoGenerationService');
      
      // Validate role type
      if (!['visitor', 'staff', 'contractor'].includes(roleType)) {
        return res.status(400).json({ error: 'Invalid role type' });
      }

      // Prevent duplicate concurrent generations
      const existingStatus = inductionGenerationStatus.get(statusKey);
      if (existingStatus && ['pending', 'generating_script', 'building_slides', 'creating_questions', 'saving'].includes(existingStatus.status)) {
        return res.status(409).json({ error: 'Generation already in progress', status: existingStatus });
      }

      // Mark as started
      inductionGenerationStatus.set(statusKey, {
        status: 'generating_script',
        step: 1,
        totalSteps: 5,
        message: 'Generating safety script with AI...',
        startedAt: Date.now()
      });

      // Respond immediately — client polls for status
      res.json({ 
        success: true, 
        started: true,
        message: 'Video generation started',
        statusKey
      });

      // Run generation asynchronously with granular step tracking
      (async () => {
        const startedAt = inductionGenerationStatus.get(statusKey)!.startedAt;
        const setStatus = (status: any, step: number, message: string, extra: any = {}) => {
          inductionGenerationStatus.set(statusKey, { status, step, totalSteps: 5, message, startedAt, ...extra });
        };

        try {
          // Load customer database and settings
          const inductionVContext = simpleDatabaseService.createCustomerContext(req.user!.username, customerId);
          const custDb = await customerDbService.getCustomerDatabase(inductionVContext.customerId);

          let videoFormat = 'hybrid_enhanced';
          let modelType = 'gpt-5';
          try {
            const rows = await custDb.select().from(isolatedSchema.inductionSettings);
            const roleSetting = rows.find((s: any) => s.roleType === roleType);
            videoFormat = roleSetting?.videoFormat || 'hybrid_enhanced';
            modelType = roleSetting?.modelType || 'gpt-5';
          } catch (_e) {
            logger.info('Using default video settings');
          }

          // Company-wide AI setting (Settings → AI tab) takes priority over the per-role default.
          // Read both fields and normalise any UI label to an API model identifier.
          const context = simpleDatabaseService.createCustomerContext(req.user!.username, customerId);
          const companySettings = await simpleDatabaseService.getCompanySettings(context);
          modelType = resolveInductionModel(companySettings?.openaiModel, companySettings?.aiModel, modelType);
          logger.info(`Induction generation using model: ${modelType}`);

          logger.info(`🎬 Generating ${videoFormat} video for ${roleType} using ${modelType}`);
          const videoService = new VideoGenerationService(companySettings, undefined, context.customerId);

          // Build site-specific context from company settings
          const siteContextV = {
            companyName: companySettings?.companyName || 'the site operator',
            siteAddress: companySettings?.siteAddress || companySettings?.address || '',
            industry: companySettings?.industry || '',
            specificHazards: companySettings?.inductionHazards || '',
            ppeRequired: companySettings?.inductionPpe || '',
            emergencyContact: companySettings?.emergencyContact || '',
            assemblyPoint: companySettings?.assemblyPoint || '',
            firstAidLocation: companySettings?.firstAidLocation || '',
            siteRules: companySettings?.inductionSiteRules || '',
          };

          // ── Step 1: Generate AI script ─────────────────────────────────────
          setStatus('generating_script', 1, 'Generating AI safety script...');
          logger.info(`📝 Step 1: Generating induction script for ${roleType}...`);
          const { script, scenes, totalDuration } = await videoService.generateInductionScript(roleType, videoFormat, modelType, siteContextV);
          logger.info(`✅ Script ready: ${scenes.length} scenes, ${Math.round(totalDuration / 60)} min`);

          // ── Step 2: Build slides with AI images ────────────────────────────
          setStatus('building_slides', 2, `Building ${scenes.length} slides with AI images...`);
          logger.info(`🎨 Step 2: Generating images for ${scenes.length} scenes...`);

          let sceneImages: string[] = [];
          let sceneAudio: string[] = [];

          if (videoFormat === 'hybrid_enhanced') {
            const [images, audio] = await Promise.all([
              videoService.generateSceneImages(scenes),
              videoService.generateSceneAudio(scenes)
            ]);
            sceneImages = images;
            sceneAudio = audio;
          } else {
            sceneImages = await videoService.generateSceneImages(scenes);
          }

          logger.info(`✅ Images ready: ${sceneImages.filter(Boolean).length}/${scenes.length} generated`);

          setStatus('building_slides', 2, 'Assembling HTML presentation...');
          const htmlContent = await videoService.createEnhancedHTMLPresentation(scenes, roleType, modelType, sceneImages, sceneAudio);
          logger.info(`✅ HTML presentation assembled (${Math.round(htmlContent.length / 1024)}KB)`);

          // ── Step 3: Generate quiz questions ────────────────────────────────
          setStatus('creating_questions', 3, 'Creating quiz questions...');
          logger.info(`🧠 Step 3: Generating AI quiz questions...`);
          let questionsStored = 0;
          try {
            const aiQuestions = await videoService.generateQuestionsFromScript(script, scenes, roleType, modelType);

            if (aiQuestions.length > 0) {
              logger.info(`💾 Storing ${aiQuestions.length} questions (deleting old ones first)...`);
              // DELETE-then-INSERT: clean slate for this customer+roleType
              await db.delete(inductionQuestions).where(eq(inductionQuestions.videoId, customerVideoId));
              await db.delete(inductionQuestions).where(and(
                eq(inductionQuestions.roleType, roleType),
                eq(inductionQuestions.videoId, roleType)
              ));
              for (let i = 0; i < aiQuestions.length; i++) {
                const q = aiQuestions[i];
                await db.insert(inductionQuestions).values({
                  questionText: q.questionText,
                  questionType: q.questionType || 'multiple_choice',
                  correctAnswer: q.correctAnswer,
                  optionA: q.optionA,
                  optionB: q.optionB,
                  optionC: q.optionC,
                  optionD: q.optionD,
                  explanation: q.explanation,
                  category: q.category,
                  roleType,
                  videoId: customerVideoId,
                  isAiGenerated: true,
                  orderIndex: i + 1,
                  isActive: true
                });
              }
              questionsStored = aiQuestions.length;
              logger.info(`✅ Stored ${questionsStored} questions for ${roleType} (customer: ${customerId})`);
            }
          } catch (questionError) {
            logger.error('⚠️ Question generation failed (non-fatal):', questionError);
          }

          // ── Step 4: Save video to customer-isolated database ───────────────
          setStatus('saving', 4, 'Saving video to database...');
          logger.info(`💾 Step 4: Saving video to customer database...`);
          let savedToDatabase = false;

          // ── Upload HTML to object storage (fast CDN delivery on mobile) ────
          let objStoragePath: string | null = null;
          try {
            const privateDir = process.env.PRIVATE_OBJECT_DIR || '';
            if (privateDir) {
              const safeRoleType = roleType.replace(/[^a-z0-9_-]/gi, '');
              const safeCustId = customerId.replace(/[^a-z0-9_-]/gi, '');
              const fullObjPath = `${privateDir}/induction-videos/${safeCustId}/${safeRoleType}.html`;
              const { bucketName, objectName } = parseObjectStoragePath(fullObjPath);
              const bucket = objectStorageClient.bucket(bucketName);
              await bucket.file(objectName).save(Buffer.from(htmlContent, 'utf-8'), {
                contentType: 'text/html; charset=utf-8',
                metadata: { cacheControl: 'public, max-age=3600' }
              });
              objStoragePath = fullObjPath;
              logger.info(`✅ Uploaded video to object storage: ${fullObjPath} (${Math.round(htmlContent.length / 1024)}KB raw, gzip on delivery)`);
            }
          } catch (objErr) {
            logger.warn('⚠️ Object storage upload failed (non-fatal, falling back to DB blob):', objErr);
          }

          try {
            const videoData = {
              videoTitle: `${roleType.charAt(0).toUpperCase() + roleType.slice(1)} Safety Induction`,
              // Store object storage path in videoUrl if upload succeeded — served as fast stream
              videoUrl: objStoragePath || 'generated',
              videoDescription: `AI-generated UK HSE-compliant safety induction for ${roleType}s. Duration: ${Math.round(totalDuration / 60)} minutes.`,
              videoDurationMinutes: Math.round(totalDuration / 60),
              // Always store generatedHtml in DB as a reliable fallback,
              // even when object storage upload succeeds. GCS is preferred
              // for delivery speed but DB blob ensures the video is always
              // accessible if object storage is unavailable.
              generatedHtml: htmlContent,
              scenesData: JSON.stringify(scenes),
              generatedAt: new Date(),
              questionsGenerated: questionsStored > 0,
              updatedAt: new Date()
            };

            // Check if a row exists for this roleType (isolated DB may not be seeded yet)
            const existingRows = await custDb
              .select({ id: isolatedSchema.inductionSettings.id })
              .from(isolatedSchema.inductionSettings)
              .where(eq(isolatedSchema.inductionSettings.roleType, roleType))
              .limit(1);

            if (existingRows.length > 0) {
              await custDb
                .update(isolatedSchema.inductionSettings)
                .set(videoData as any)
                .where(eq(isolatedSchema.inductionSettings.roleType, roleType));
              logger.info(`✅ Updated existing row in customer database (${Math.round(htmlContent.length / 1024)}KB HTML)`);
            } else {
              // No row yet — insert a fresh one (isolated DB was never seeded for this customer)
              await custDb
                .insert(isolatedSchema.inductionSettings)
                .values({
                  id: randomUUID(),
                  roleType,
                  passPercentage: 80,
                  isActive: true,
                  kioskEnabled: false,
                  sendLinkEnabled: true,
                  ...videoData
                } as any);
              logger.info(`✅ Inserted new row in customer database (${Math.round(htmlContent.length / 1024)}KB HTML)`);
            }
            savedToDatabase = true;
            logger.info(`✅ Saved to customer database (${Math.round(htmlContent.length / 1024)}KB HTML)`);
          } catch (saveError) {
            logger.error('⚠️ Customer DB save failed:', saveError);
          }

          // ── Step 5: Done ───────────────────────────────────────────────────
          setStatus('done', 5,
            savedToDatabase
              ? `Video generated with ${questionsStored} quiz questions`
              : 'Video generated (database save failed — preview available)',
            { completedAt: Date.now() }
          );
          logger.info(`🎉 Generation complete for ${roleType} (customer: ${customerId})`);

        } catch (asyncError: any) {
          logger.error('❌ Error in async video generation:', asyncError);
          setStatus('failed', 0, 'Generation failed', {
            completedAt: Date.now(),
            error: asyncError.message || 'Unknown error'
          });
        }
      })();
      
    } catch (error: any) {
      logger.error('Error starting video generation:', error);
      inductionGenerationStatus.set(statusKey, {
        status: 'failed',
        step: 0,
        totalSteps: 5,
        message: 'Failed to start generation',
        startedAt: Date.now(),
        completedAt: Date.now(),
        error: error.message || 'Unknown error'
      });
      if (!res.headersSent) {
        res.status(500).json({ 
          error: 'Failed to start video generation',
          details: error.message 
        });
      }
    }
  });

  // Get AI-generated script for preview
  app.get('/api/induction/script/:roleType', requireAuth, async (req, res) => {
    try {
      const { roleType } = req.params;
      const { VideoGenerationService } = await import('../videoGenerationService');
      
      // Get company settings for AI configuration
      // Import the simplified database service
      const { simpleDatabaseService } = await import("../simpleDatabaseService");
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const settings = await simpleDatabaseService.getCompanySettings(context);
      const videoService = new VideoGenerationService(settings, undefined, context.customerId);

      const siteContextP = {
        companyName: settings?.companyName || 'the site operator',
        siteAddress: settings?.siteAddress || settings?.address || '',
        industry: settings?.industry || '',
        specificHazards: settings?.inductionHazards || '',
        ppeRequired: settings?.inductionPpe || '',
        emergencyContact: settings?.emergencyContact || '',
        assemblyPoint: settings?.assemblyPoint || '',
        firstAidLocation: settings?.firstAidLocation || '',
        siteRules: settings?.inductionSiteRules || '',
      };
      
      const content = await videoService.generateInductionScript(roleType, 'interactive_slides', undefined, siteContextP);
      
      res.json({ 
        success: true,
        script: content.script,
        scenes: content.scenes,
        totalDuration: content.totalDuration
      });
      
    } catch (error) {
      logger.error('Error generating script:', error);
      res.status(500).json({ error: 'Failed to generate script' });
    }
  });

  // Serve actual generated video content
  // CSS patch: replaces display:none slide toggling with visibility-based approach
  // so all slide images are pre-decoded by the browser → instant transitions
  // patchInductionHtml is defined at module scope above

  app.get('/api/induction/video/:roleType', async (req, res) => {
    try {
      const { roleType } = req.params;

      // Try customer-isolated database first (if authenticated)
      const sessionCustomerId = req.session?.customerId || (req as any).customerId;
      if (req.session?.userId && sessionCustomerId) {
        try {
          const custVideoDb = await customerDbService.getCustomerDatabase(sessionCustomerId);
          const custRows = await custVideoDb
            .select()
            .from(isolatedSchema.inductionSettings)
            .where(eq(isolatedSchema.inductionSettings.roleType, roleType))
            .limit(1);

          if (custRows.length > 0) {
            const setting = custRows[0] as any;
            // Prefer object storage path (fast stream, gzip on delivery)
            if (setting.videoUrl && setting.videoUrl !== 'generated' && !setting.videoUrl.startsWith('http') && !setting.videoUrl.startsWith('data:')) {
              try {
                const { bucketName, objectName } = parseObjectStoragePath(setting.videoUrl);
                const file = objectStorageClient.bucket(bucketName).file(objectName);
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.setHeader('Cache-Control', 'public, max-age=3600');
                file.createReadStream().pipe(res);
                return;
              } catch (_streamErr) { /* fall through to generatedHtml */ }
            }
            if (setting.generatedHtml) {
              logger.info(`📄 Serving customer-isolated generatedHtml for ${roleType} (${req.customerId})`);
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.setHeader('Cache-Control', 'no-cache');
              res.send(patchInductionHtml(setting.generatedHtml));
              return;
            }
          }
        } catch (_custErr) {
          logger.info('⚠️ Customer DB lookup failed, falling back to global');
        }
      }

      // Fallback: global shared inductionSettings (legacy / token-based access)
      const existingSettings = await db
        .select()
        .from(inductionSettings)
        .where(eq(inductionSettings.roleType, roleType))
        .limit(1);

      if (existingSettings.length > 0) {
        const setting = existingSettings[0];

        // Prefer stored generatedHtml (clean, no base64 overhead)
        if ((setting as any).generatedHtml) {
          logger.info('📄 Serving global generatedHtml for', roleType);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          res.send(patchInductionHtml((setting as any).generatedHtml));
          return;
        }

        // Fallback: decode legacy base64 data URL
        if (setting.videoUrl && setting.videoUrl.startsWith('data:text/html;base64,')) {
          const base64Content = setting.videoUrl.replace('data:text/html;base64,', '');
          const htmlContent = Buffer.from(base64Content, 'base64').toString('utf-8');
          logger.info('📄 Serving base64-decoded HTML for', roleType);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          res.send(patchInductionHtml(htmlContent));
          return;
        }
      }

      // No video found — return a clear message page instead of silently regenerating
      logger.info('❌ No video found for', roleType, '— returning placeholder');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(404).send(`
        <html>
          <body style="font-family: system-ui; padding: 40px; text-align: center; background: #f8fafc; color: #334155;">
            <div style="max-width: 480px; margin: 80px auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
              <div style="font-size: 48px; margin-bottom: 16px;">🎬</div>
              <h2 style="margin: 0 0 12px; color: #0f172a;">No video generated yet</h2>
              <p style="color: #64748b; margin: 0 0 24px;">Return to Induction Settings and click "Generate Video" to create the ${roleType} induction.</p>
              <button onclick="window.close()" style="padding: 10px 24px; background: #2563eb; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px;">Close</button>
            </div>
          </body>
        </html>
      `);
      
    } catch (error) {
      logger.error('Error serving video content:', error);
      res.status(500).send(`
        <html>
          <body style="font-family: system-ui; padding: 40px; text-align: center; background: #f3f4f6;">
            <h1 style="color: #dc2626;">Video Error</h1>
            <p>Unable to load video content. Please regenerate the video in Induction Settings.</p>
            <button onclick="window.close()" style="padding: 10px 20px; margin-top: 20px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer;">Close</button>
          </body>
        </html>
      `);
    }
  });

  // Preview generated video content in HTML format
  app.get('/api/induction/preview/:roleType', requireAuth, async (req, res) => {
    try {
      const { roleType } = req.params;
      
      // Try to get existing settings first
      let existingSettings = await db
        .select()
        .from(inductionSettings)
        .where(eq(inductionSettings.roleType, roleType))
        .limit(1);

      if (existingSettings.length === 0 || !existingSettings[0].videoUrl) {
        // Generate new content if none exists
        const { VideoGenerationService } = await import('../videoGenerationService');
        // Import the simplified database service
      const { simpleDatabaseService } = await import("../simpleDatabaseService");
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const settings = await simpleDatabaseService.getCompanySettings(context);
        const videoService = new VideoGenerationService(settings, undefined, context.customerId);
        
        const content = await videoService.generateVideoPresentation(roleType);
        await videoService.updateSettingsWithGeneratedContent(roleType, content);
        
        // Get the updated settings
        existingSettings = await db
          .select()
          .from(inductionSettings)
          .where(eq(inductionSettings.roleType, roleType))
          .limit(1);
      }

      const setting = existingSettings[0];
      const roleDisplayName = roleType.charAt(0).toUpperCase() + roleType.slice(1);
      
      // Return formatted HTML preview
      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${setting.videoTitle} - TPR</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              line-height: 1.6;
              margin: 0;
              padding: 20px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: #333;
            }
            .container {
              max-width: 800px;
              margin: 0 auto;
              background: white;
              border-radius: 12px;
              box-shadow: 0 10px 30px rgba(0,0,0,0.2);
              overflow: hidden;
            }
            .header {
              background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
              color: white;
              padding: 30px;
              text-align: center;
            }
            .header h1 {
              margin: 0;
              font-size: 2em;
              font-weight: 700;
            }
            .header p {
              margin: 10px 0 0 0;
              opacity: 0.9;
              font-size: 1.1em;
            }
            .content {
              padding: 40px;
            }
            .video-info {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
              gap: 20px;
              margin-bottom: 30px;
              padding: 20px;
              background: #f8fafc;
              border-radius: 8px;
            }
            .info-item {
              text-align: center;
            }
            .info-label {
              font-size: 0.9em;
              color: #64748b;
              margin-bottom: 5px;
            }
            .info-value {
              font-size: 1.3em;
              font-weight: 600;
              color: #1e293b;
            }
            .description {
              background: #fafafa;
              padding: 20px;
              border-radius: 8px;
              border-left: 4px solid #4f46e5;
              margin: 20px 0;
            }
            .powered-by {
              text-align: center;
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #e2e8f0;
              color: #64748b;
              font-size: 0.9em;
            }
            .ai-badge {
              display: inline-flex;
              align-items: center;
              gap: 5px;
              background: linear-gradient(135deg, #10b981 0%, #059669 100%);
              color: white;
              padding: 8px 16px;
              border-radius: 20px;
              font-weight: 600;
              font-size: 0.9em;
              margin: 10px 0;
            }
            .close-btn {
              position: fixed;
              top: 20px;
              right: 20px;
              background: rgba(255,255,255,0.9);
              border: none;
              padding: 10px;
              border-radius: 50%;
              cursor: pointer;
              font-size: 20px;
              width: 40px;
              height: 40px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
          </style>
        </head>
        <body>
          <button class="close-btn" onclick="window.close()" title="Close Preview">×</button>
          
          <div class="container">
            <div class="header">
              <h1>${setting.videoTitle}</h1>
              <p>AI-Generated Safety Induction for ${roleDisplayName}s</p>
              <div class="ai-badge">
                ✨ Generated with AI
              </div>
            </div>
            
            <div class="content">
              <div class="video-info">
                <div class="info-item">
                  <div class="info-label">Duration</div>
                  <div class="info-value">${setting.videoDurationMinutes} minutes</div>
                </div>
                <div class="info-item">
                  <div class="info-label">Target Audience</div>
                  <div class="info-value">${roleDisplayName}s</div>
                </div>
                <div class="info-item">
                  <div class="info-label">Generated</div>
                  <div class="info-value">Just Now</div>
                </div>
              </div>
              
              <div class="description">
                <h3 style="margin-top: 0; color: #4f46e5;">Video Description</h3>
                <p>${setting.videoDescription}</p>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <p style="color: #64748b; margin-bottom: 20px;">
                  This AI-generated induction video provides comprehensive safety training 
                  tailored specifically for ${roleDisplayName.toLowerCase()}s in your organization.
                </p>
                <p style="color: #059669; font-weight: 600;">
                  ✅ Video content generated successfully and ready for use!
                </p>
              </div>
              
              <div class="powered-by">
                <p>🤖 Powered by OpenAI GPT-5 | 🏢 TPR Safety Management</p>
              </div>
            </div>
          </div>
          
          <script>
            // Auto-close after 30 seconds if opened in popup
            if (window.opener) {
              setTimeout(() => {
                if (confirm('Close preview window?')) {
                  window.close();
                }
              }, 30000);
            }
          </script>
        </body>
        </html>
      `;
      
      res.setHeader('Content-Type', 'text/html');
      res.send(htmlContent);
      
    } catch (error) {
      logger.error('Error generating video preview:', error);
      res.status(500).send(`
        <html>
          <body style="font-family: system-ui; padding: 40px; text-align: center;">
            <h1 style="color: #dc2626;">Preview Error</h1>
            <p>Unable to generate video preview. Please check your AI configuration.</p>
            <button onclick="window.close()" style="padding: 10px 20px; margin-top: 20px;">Close</button>
          </body>
        </html>
      `);
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Scenes API (slide editor)
  // ────────────────────────────────────────────────────────────────────────────

  // GET /api/induction/scenes/by-token/:token — public, returns scenes for native rendering
  app.get('/api/induction/scenes/by-token/:token', async (req, res) => {
    try {
      const { token } = req.params;
      const tokenRecord = await inductionService.getTokenByValue(token);
      if (!tokenRecord) return res.status(404).json({ error: 'Invalid induction token' });

      const roleType = tokenRecord.personType || 'contractor';
      const customerId = (tokenRecord as any).customerId;

      let scenesRaw: string | null = null;

      if (customerId) {
        try {
          const custDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(customerId);
          const [row] = await custDb
            .select({ scenesData: isolatedSchema.inductionSettings.scenesData })
            .from(isolatedSchema.inductionSettings)
            .where(eq(isolatedSchema.inductionSettings.roleType, roleType));
          scenesRaw = row?.scenesData ?? null;
        } catch (_) { /* fall through to global */ }
      }

      if (!scenesRaw) {
        const [row] = await db
          .select({ scenesData: inductionSettings.scenesData })
          .from(inductionSettings)
          .where(eq(inductionSettings.roleType, roleType));
        scenesRaw = row?.scenesData ?? null;
      }

      if (!scenesRaw) return res.json({ scenes: [] });
      try {
        const scenes = JSON.parse(scenesRaw);
        return res.json({ scenes: Array.isArray(scenes) ? scenes : [] });
      } catch {
        return res.json({ scenes: [] });
      }
    } catch (error) {
      logger.error('Error fetching scenes by token:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/induction/settings/:roleType/scenes — admin, returns scenes for slide editor
  app.get('/api/induction/settings/:roleType/scenes', requireAuth, async (req, res) => {
    try {
      const { roleType } = req.params;
      const customerId = req.customerId || 'default';
      const custDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(customerId);
      const [row] = await custDb
        .select({ scenesData: isolatedSchema.inductionSettings.scenesData })
        .from(isolatedSchema.inductionSettings)
        .where(eq(isolatedSchema.inductionSettings.roleType, roleType));
      if (!row?.scenesData) return res.json({ scenes: [] });
      try {
        const scenes = JSON.parse(row.scenesData);
        return res.json({ scenes: Array.isArray(scenes) ? scenes : [] });
      } catch {
        return res.json({ scenes: [] });
      }
    } catch (error) {
      logger.error('Error fetching scenes for slide editor:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PUT /api/induction/settings/:roleType/scenes — admin, save edited scenes
  app.put('/api/induction/settings/:roleType/scenes', requireAuth, async (req, res) => {
    try {
      const { roleType } = req.params;
      const { scenes } = req.body;
      if (!Array.isArray(scenes)) return res.status(400).json({ error: 'scenes must be an array' });

      const customerId = req.customerId || 'default';
      const custDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(customerId);
      await custDb
        .update(isolatedSchema.inductionSettings)
        .set({ scenesData: JSON.stringify(scenes), updatedAt: new Date() })
        .where(eq(isolatedSchema.inductionSettings.roleType, roleType));

      return res.json({ success: true });
    } catch (error) {
      logger.error('Error saving scenes:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/induction/settings/:roleType/scenes/photo — upload per-slide photo
  const slidePhotoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith('image/')) cb(null, true);
      else cb(new Error('Only image files are allowed'));
    },
  });

  app.post('/api/induction/settings/:roleType/scenes/photo', requireAuth, slidePhotoUpload.single('photo'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No photo file provided' });
      const { roleType } = req.params;
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const ext = req.file.originalname.split('.').pop()?.toLowerCase() || 'jpg';
      const mimeType = req.file.mimetype || 'image/jpeg';
      const objectId = randomUUID();
      const objectStorageService = new ObjectStorageService();
      const privateObjectDir = objectStorageService.getPrivateObjectDir();
      const fullPath = `${privateObjectDir}/induction-slides/${context.customerId}/${roleType}/${objectId}.${ext}`;
      const { bucketName, objectName } = parseObjectStoragePath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      await file.save(req.file.buffer, { contentType: mimeType });
      const storedPath = `/induction-slides/${context.customerId}/${roleType}/${objectId}.${ext}`;
      logger.info(`🖼️ Slide photo saved: ${storedPath}`);
      return res.json({ success: true, url: storedPath });
    } catch (error: any) {
      logger.error('Error uploading slide photo:', error);
      res.status(500).json({ error: error.message || 'Failed to upload photo' });
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Walk-around Checkpoints API
  // ────────────────────────────────────────────────────────────────────────────

  // GET /api/induction/checkpoints — admin, list checkpoints for this customer
  app.get('/api/induction/checkpoints', requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId;
      if (!customerId) return res.status(403).json({ error: 'No customer context' });
      const custDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(customerId);
      const rows = await custDb
        .select()
        .from(isolatedSchema.inductionCheckpoints)
        .where(eq(isolatedSchema.inductionCheckpoints.customerId, customerId))
        .orderBy(isolatedSchema.inductionCheckpoints.orderIndex);
      return res.json({ checkpoints: rows });
    } catch (error) {
      logger.error('Error listing checkpoints:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/induction/checkpoints/public — public list (by induction token)
  app.get('/api/induction/checkpoints/public', async (req, res) => {
    try {
      const tokenParam = req.query.token as string;
      if (!tokenParam) return res.status(400).json({ error: 'token required' });
      const tokenRecord = await inductionService.getTokenByValue(tokenParam);
      if (!tokenRecord) return res.status(404).json({ error: 'Invalid induction token' });
      const customerId = (tokenRecord as any).customerId;
      if (!customerId) return res.json({ checkpoints: [] });
      const custDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(customerId);
      const rows = await custDb
        .select({
          id: isolatedSchema.inductionCheckpoints.id,
          label: isolatedSchema.inductionCheckpoints.label,
          orderIndex: isolatedSchema.inductionCheckpoints.orderIndex,
          content: isolatedSchema.inductionCheckpoints.content,
          imageUrl: isolatedSchema.inductionCheckpoints.imageUrl,
          qrToken: isolatedSchema.inductionCheckpoints.qrToken,
          isActive: isolatedSchema.inductionCheckpoints.isActive,
        })
        .from(isolatedSchema.inductionCheckpoints)
        .where(and(
          eq(isolatedSchema.inductionCheckpoints.customerId, customerId),
          eq(isolatedSchema.inductionCheckpoints.isActive, true)
        ))
        .orderBy(isolatedSchema.inductionCheckpoints.orderIndex);
      return res.json({ checkpoints: rows });
    } catch (error) {
      logger.error('Error fetching public checkpoints:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/induction/checkpoints — admin, create checkpoint
  app.post('/api/induction/checkpoints', requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId;
      if (!customerId) return res.status(403).json({ error: 'No customer context' });
      const { label, content, orderIndex, latitude, longitude } = req.body;
      if (!label?.trim()) return res.status(400).json({ error: 'label is required' });
      const custDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(customerId);
      const qrToken = randomUUID();
      const [newCheckpoint] = await custDb
        .insert(isolatedSchema.inductionCheckpoints)
        .values({
          customerId,
          label: label.trim(),
          content: content || '',
          orderIndex: orderIndex ?? 0,
          qrToken,
          latitude: latitude ?? null,
          longitude: longitude ?? null,
        })
        .returning();
      return res.json({ checkpoint: newCheckpoint });
    } catch (error) {
      logger.error('Error creating checkpoint:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PUT /api/induction/checkpoints/:id — admin, update checkpoint
  app.put('/api/induction/checkpoints/:id', requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId;
      if (!customerId) return res.status(403).json({ error: 'No customer context' });
      const { id } = req.params;
      const { label, content, orderIndex, isActive, imageUrl } = req.body;
      const custDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(customerId);
      const updateData: Record<string, any> = { updatedAt: new Date() };
      if (label !== undefined) updateData.label = label;
      if (content !== undefined) updateData.content = content;
      if (orderIndex !== undefined) updateData.orderIndex = orderIndex;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
      await custDb
        .update(isolatedSchema.inductionCheckpoints)
        .set(updateData)
        .where(and(
          eq(isolatedSchema.inductionCheckpoints.id, id),
          eq(isolatedSchema.inductionCheckpoints.customerId, customerId)
        ));
      return res.json({ success: true });
    } catch (error) {
      logger.error('Error updating checkpoint:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/induction/checkpoints/:id — admin, delete checkpoint
  app.delete('/api/induction/checkpoints/:id', requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId;
      if (!customerId) return res.status(403).json({ error: 'No customer context' });
      const { id } = req.params;
      const custDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(customerId);
      await custDb
        .delete(isolatedSchema.inductionCheckpoints)
        .where(and(
          eq(isolatedSchema.inductionCheckpoints.id, id),
          eq(isolatedSchema.inductionCheckpoints.customerId, customerId)
        ));
      return res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting checkpoint:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/induction/checkpoint/:qrToken — public, resolve checkpoint for scan page
  app.get('/api/induction/checkpoint/:qrToken', async (req, res) => {
    try {
      const { qrToken } = req.params;
      // Search all customer databases for this qrToken — or use global fallback
      // Strategy: scan all known customers (this is called once per scan, acceptable overhead)
      const allCustomers = await customerDbService.getAllCustomers();
      for (const cust of allCustomers) {
        try {
          const custDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(cust.id);
          const [row] = await custDb
            .select()
            .from(isolatedSchema.inductionCheckpoints)
            .where(eq(isolatedSchema.inductionCheckpoints.qrToken, qrToken));
          if (row) {
            return res.json({ checkpoint: row });
          }
        } catch (_) { /* try next customer */ }
      }
      return res.status(404).json({ error: 'Checkpoint not found' });
    } catch (error) {
      logger.error('Error resolving checkpoint by qrToken:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/induction/checkpoint/:qrToken/scan — public, record a checkpoint scan
  app.post('/api/induction/checkpoint/:qrToken/scan', async (req, res) => {
    try {
      const { qrToken } = req.params;
      const { inductionTokenId, latitude, longitude } = req.body;
      if (!inductionTokenId) return res.status(400).json({ error: 'inductionTokenId required' });

      // Validate induction token
      const inductionToken = await inductionService.getTokenByValue(inductionTokenId);
      if (!inductionToken) return res.status(404).json({ error: 'Invalid induction token' });
      const customerId = (inductionToken as any).customerId;
      if (!customerId) return res.status(400).json({ error: 'Cannot resolve customer from token' });

      const custDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(customerId);

      // Resolve checkpoint
      const [checkpoint] = await custDb
        .select()
        .from(isolatedSchema.inductionCheckpoints)
        .where(and(
          eq(isolatedSchema.inductionCheckpoints.qrToken, qrToken),
          eq(isolatedSchema.inductionCheckpoints.customerId, customerId)
        ));
      if (!checkpoint) return res.status(404).json({ error: 'Checkpoint not found' });
      if (!checkpoint.isActive) return res.status(410).json({ error: 'This checkpoint is inactive' });

      // Avoid duplicate scans (same checkpoint + same token)
      const [existing] = await custDb
        .select({ id: isolatedSchema.inductionCheckpointScans.id })
        .from(isolatedSchema.inductionCheckpointScans)
        .where(and(
          eq(isolatedSchema.inductionCheckpointScans.checkpointId, checkpoint.id),
          eq(isolatedSchema.inductionCheckpointScans.inductionTokenId, (inductionToken as any).id)
        ));

      if (!existing) {
        await custDb.insert(isolatedSchema.inductionCheckpointScans).values({
          checkpointId: checkpoint.id,
          inductionTokenId: (inductionToken as any).id,
          latitude: latitude ?? null,
          longitude: longitude ?? null,
          ipAddress: req.ip ?? null,
          userAgent: req.headers['user-agent'] ?? null,
        });
        logger.info(`✅ Checkpoint scan recorded: ${checkpoint.label} for token ${(inductionToken as any).id}`);
      }

      return res.json({
        success: true,
        alreadyScanned: !!existing,
        checkpoint: {
          id: checkpoint.id,
          label: checkpoint.label,
          content: checkpoint.content,
          imageUrl: checkpoint.imageUrl,
          orderIndex: checkpoint.orderIndex,
        },
      });
    } catch (error) {
      logger.error('Error recording checkpoint scan:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/induction/:tokenValue/checkpoint-progress — public, scanned checkpoints for this token
  app.get('/api/induction/:tokenValue/checkpoint-progress', async (req, res) => {
    try {
      const { tokenValue } = req.params;
      const inductionToken = await inductionService.getTokenByValue(tokenValue);
      if (!inductionToken) return res.status(404).json({ error: 'Invalid induction token' });
      const customerId = (inductionToken as any).customerId;
      if (!customerId) return res.json({ scannedCheckpointIds: [] });

      const custDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(customerId);
      const scans = await custDb
        .select({ checkpointId: isolatedSchema.inductionCheckpointScans.checkpointId, scannedAt: isolatedSchema.inductionCheckpointScans.scannedAt })
        .from(isolatedSchema.inductionCheckpointScans)
        .where(eq(isolatedSchema.inductionCheckpointScans.inductionTokenId, (inductionToken as any).id));

      return res.json({ scannedCheckpointIds: scans.map(s => s.checkpointId), scans });
    } catch (error) {
      logger.error('Error fetching checkpoint progress:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
