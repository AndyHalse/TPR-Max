import type { Express } from 'express';
import { requireAuth } from '../auth';
import { storage } from '../storage';
import { databaseService } from '../databaseService';
import { simpleDatabaseService } from '../simpleDatabaseService';
import { customerDbService, CustomerDatabaseService } from '../customerDatabase';
import { emailService } from '../emailService';
import { insertCompanySettingsSchema } from '../isolatedSchema';
import * as isolatedSchema from '../isolatedSchema';
import { insertUserInvitationSchema } from '@shared/schema';
import { ObjectStorageService, ObjectNotFoundError, objectStorageClient } from '../objectStorage';
import { randomUUID } from 'crypto';
import crypto from 'crypto';
import { z } from 'zod';
import { eq } from 'drizzle-orm';

// ─── Logo token helpers ───────────────────────────────────────────────────────

const LOGO_TOKEN_SECRET = process.env.SESSION_SECRET || process.env.DATABASE_URL || 'tpr-max-logo-token-secret';

function generateLogoToken(customerId: string): string {
  const expiry = Date.now() + 24 * 60 * 60 * 1000;
  const payload = `${customerId}:${expiry}`;
  const hmac = crypto.createHmac('sha256', LOGO_TOKEN_SECRET).update(payload).digest('hex').substring(0, 16);
  return Buffer.from(`${payload}:${hmac}`).toString('base64url');
}

function validateLogoToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString();
    const parts = decoded.split(':');
    if (parts.length !== 3) return null;
    const [customerId, expiryStr, providedHmac] = parts;
    const expiry = parseInt(expiryStr, 10);
    if (Date.now() > expiry) return null;
    const expectedHmac = crypto.createHmac('sha256', LOGO_TOKEN_SECRET).update(`${customerId}:${expiryStr}`).digest('hex').substring(0, 16);
    if (providedHmac !== expectedHmac) return null;
    return customerId;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export function registerSettingsRoutes(
  app: Express,
  { setupAutomaticDailyReset }: { setupAutomaticDailyReset?: (customerId?: string) => Promise<void> } = {}
): void {

  app.get("/api/public-logo/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const customerId = validateLogoToken(token);
      if (!customerId) {
        return res.status(403).json({ error: "Invalid or expired logo token" });
      }
      
      const context = simpleDatabaseService.createCustomerContext('system', customerId);
      const settings = await simpleDatabaseService.getCompanySettings(context);
      
      if (!settings?.logoUrl) {
        console.log(`[LOGO] No logo URL in settings for customer ${customerId}`);
        return res.status(404).json({ error: "No logo configured" });
      }
      
      const rawLogoUrl = settings.logoUrl;
      const normalizedUrl = rawLogoUrl.replace(/^\/objects/, '').replace(/^\/+/, '/');
      console.log(`[LOGO] Public logo request for customer ${customerId}: raw=${rawLogoUrl}, normalized=${normalizedUrl}`);
      
      const objectStorageService = new ObjectStorageService();
      
      try {
        const objectPath = `/objects${normalizedUrl}`;
        const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
        return objectStorageService.downloadObject(objectFile, res, 86400);
      } catch (privateErr: any) {
        // Try public path
      }
      
      try {
        const fileName = normalizedUrl.replace(/^\/?(uploads\/)?/, '');
        const publicFile = await objectStorageService.searchPublicObject(fileName);
        if (publicFile) {
          return objectStorageService.downloadObject(publicFile, res, 86400);
        }
      } catch (publicErr: any) {
        // Try full path
      }
      
      try {
        const fullFileName = normalizedUrl.replace(/^\//, '');
        const publicFile2 = await objectStorageService.searchPublicObject(fullFileName);
        if (publicFile2) {
          return objectStorageService.downloadObject(publicFile2, res, 86400);
        }
      } catch (fullErr: any) {
        // All paths exhausted
      }
      
      console.log(`[LOGO] Public logo not found for customer ${customerId}`);
      return res.status(404).json({ error: "Logo file not found" });
    } catch (error) {
      console.error(`[LOGO] Error serving public logo:`, error);
      return res.status(500).json({ error: "Failed to serve logo" });
    }
  });

  // Dedicated company logo endpoint - serves logo image directly from object storage (auth version)
  app.get("/api/company-logo", requireAuth, async (req, res) => {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const settings = await simpleDatabaseService.getCompanySettings(context);
      
      if (!settings?.logoUrl) {
        console.log(`[LOGO] No logo URL in settings for customer ${req.customerId}`);
        return res.status(404).json({ error: "No logo configured" });
      }
      
      const rawLogoUrl = settings.logoUrl;
      const normalizedUrl = rawLogoUrl.replace(/^\/objects/, '').replace(/^\/+/, '/');
      console.log(`[LOGO] Serving logo for customer ${req.customerId}: raw=${rawLogoUrl}, normalized=${normalizedUrl}`);
      
      const objectStorageService = new ObjectStorageService();
      
      try {
        const objectPath = `/objects${normalizedUrl}`;
        console.log(`[LOGO] Trying private path: ${objectPath}`);
        const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
        console.log(`[LOGO] Found logo in private storage`);
        return objectStorageService.downloadObject(objectFile, res, 86400);
      } catch (privateErr: any) {
        console.log(`[LOGO] Private storage failed: ${privateErr?.message || 'unknown error'}`);
      }
      
      try {
        const fileName = normalizedUrl.replace(/^\/?(uploads\/)?/, '');
        console.log(`[LOGO] Trying public path: ${fileName}`);
        const publicFile = await objectStorageService.searchPublicObject(fileName);
        if (publicFile) {
          console.log(`[LOGO] Found logo in public storage`);
          return objectStorageService.downloadObject(publicFile, res, 86400);
        }
      } catch (publicErr: any) {
        console.log(`[LOGO] Public storage failed: ${publicErr?.message || 'unknown error'}`);
      }
      
      try {
        const fullFileName = normalizedUrl.replace(/^\//, '');
        console.log(`[LOGO] Trying full public path: ${fullFileName}`);
        const publicFile2 = await objectStorageService.searchPublicObject(fullFileName);
        if (publicFile2) {
          console.log(`[LOGO] Found logo in public storage (full path)`);
          return objectStorageService.downloadObject(publicFile2, res, 86400);
        }
      } catch (fullErr: any) {
        console.log(`[LOGO] Full public path failed: ${fullErr?.message || 'unknown error'}`);
      }
      
      console.log(`[LOGO] Logo not found in any storage path for customer ${req.customerId}`);
      return res.status(404).json({ error: "Logo file not found in storage" });
    } catch (error) {
      console.error(`[LOGO] Error serving logo:`, error);
      return res.status(500).json({ error: "Failed to serve logo" });
    }
  });

  // Company Settings endpoints
  app.get("/api/settings", requireAuth, async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      const settings = await simpleDatabaseService.getCompanySettings(context);
      
      console.log(`[SETTINGS-API] customer=${context.customerId} logo=${settings?.logoUrl || 'NONE'} bg=${settings?.backgroundColor || 'NONE'} accent=${settings?.accentColor || 'NONE'} company=${settings?.companyName || 'NONE'}`);
      
      if (settings) {
        const {
          biostarPassword,
          biostarApiKey,
          biostarUsername,
          biostarBaseUrl,
          paxtonPassword,
          paxtonClientId,
          paxtonUsername,
          paxtonClientSecret,
          smtpPassword,
          twilioAuthToken,
          twilioAccountSid,
          twilioPhoneNumber,
          eightByXApiKey,
          eightByXApiSecret,
          clueApiKey,
          clueApiSecret,
          openaiApiKey,
          geminiApiKey,
          sendgridApiKey,
          ...sanitizedSettings
        } = settings;
        
        // Return a flag so the UI can show "password saved" without exposing the value
        const responsePayload = {
          ...sanitizedSettings,
          smtpPasswordSet: !!(smtpPassword && smtpPassword.length > 0),
        };
        
        console.log(`[SETTINGS-API] Sending ${Object.keys(responsePayload).length} fields to client, logoUrl=${responsePayload.logoUrl || 'EMPTY'}`);
        res.json(responsePayload || {});
      } else {
        console.log(`[SETTINGS-API] No settings found - sending empty object`);
        res.json({});
      }
    } catch (error) {
      console.error('Settings fetch error:', error);
      res.status(500).json({ error: "Failed to fetch company settings" });
    }
  });

  // System status check endpoint
  app.get("/api/system/status", requireAuth, async (req, res) => {
    try {
      const status = {
        database: false,
        email: false,
        storage: false,
        authentication: false,
        workflow: false,
      };

      try {
        const username = req.user!.username;
        const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
        await simpleDatabaseService.getCompanySettings(context);
        status.database = true;
      } catch (dbError) {
        console.error("Database status check failed:", dbError);
      }

      try {
        const envSmtpConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
        if (envSmtpConfigured) {
          status.email = true;
        } else {
          const username = req.user!.username;
          const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
          const settings = await simpleDatabaseService.getCompanySettings(context);
          status.email = !!(settings?.smtpHost && settings?.smtpUsername && settings?.smtpPassword && settings?.smtpFromName);
        }
      } catch (emailError) {
        console.error("Email status check failed:", emailError);
      }

      status.authentication = true;
      status.workflow = true;

      try {
        const username = req.user!.username;
        const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
        await simpleDatabaseService.getCompanySettings(context);
        status.storage = true;
      } catch (storageError) {
        console.error("Storage status check failed:", storageError);
      }

      res.json({
        success: true,
        services: status,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: "v2026.02.26",
        appName: "TPR Max",
      });
    } catch (error) {
      console.error("System status check failed:", error);
      res.status(500).json({ 
        error: "Failed to check system status",
        services: {
          database: false,
          email: false,
          storage: false,
          authentication: false,
          workflow: false,
        }
      });
    }
  });

  // AI Settings API Endpoints for secure API key management
  app.get("/api/settings/ai-keys", requireAuth, async (req, res) => {
    try {
      if (!req.session?.customerId) {
        return res.status(401).json({ error: "Customer context not found in session" });
      }
      const context = { customerId: req.session.customerId };
      
      const { decryptData } = await import("../utils/encryption");
      
      const apiKeys = await databaseService.getCustomerApiKeys(context);
      
      const openaiKey = apiKeys.find(key => key.serviceType === 'openai');
      const geminiKey = apiKeys.find(key => key.serviceType === 'gemini');
      const claudeKey = apiKeys.find(key => key.serviceType === 'claude');
      
      const formatKeyStatus = (key: any) => {
        if (!key) {
          return {
            hasKey: false,
            last4: '',
            isActive: false,
            lastUsed: null,
            usageCount: 0,
            status: 'inactive'
          };
        }
        return {
          id: key.id,
          hasKey: true,
          last4: key.last4,
          isActive: key.status === 'active',
          lastUsed: key.lastUsedAt,
          usageCount: key.usageCount || 0,
          status: key.status
        };
      };

      res.json({
        openai: { serviceType: 'openai', ...formatKeyStatus(openaiKey) },
        gemini: { serviceType: 'gemini', ...formatKeyStatus(geminiKey) },
        claude: { serviceType: 'claude', ...formatKeyStatus(claudeKey) },
      });
    } catch (error) {
      console.error("Error fetching AI keys:", error);
      res.status(500).json({ error: "Failed to fetch API keys" });
    }
  });

  app.put("/api/settings/ai-keys", requireAuth, async (req, res) => {
    try {
      const { openaiKey, geminiKey, claudeKey } = req.body;
      
      if (!req.session?.customerId) {
        return res.status(401).json({ error: "Customer context not found in session" });
      }
      const context = { customerId: req.session.customerId };
      
      const { 
        encryptData, 
        generateKeyFingerprint, 
        getKeyLast4, 
        validateApiKeyFormat,
        generateAuditLogEntry 
      } = await import("../utils/encryption");
      
      const results = [];
      
      if (openaiKey && openaiKey.trim()) {
        if (!validateApiKeyFormat(openaiKey, 'openai')) {
          return res.status(400).json({ error: "Invalid OpenAI API key format" });
        }
        
        const encrypted = encryptData(openaiKey);
        const fingerprint = generateKeyFingerprint(openaiKey);
        const last4 = getKeyLast4(openaiKey);
        
        const existingByFingerprintOpenai = await databaseService.getApiKeyByFingerprint(context, fingerprint);
        if (existingByFingerprintOpenai) {
          if (existingByFingerprintOpenai.serviceType === 'openai') {
            results.push({ service: 'openai', success: true, id: existingByFingerprintOpenai.id });
          } else {
            return res.status(400).json({ error: "This key is already registered for a different service" });
          }
        } else {
          const keyData = {
            keyName: 'OpenAI API Key',
            keyDescription: 'OpenAI API key for GPT models and text generation',
            serviceType: 'openai',
            last4,
            encryptedKey: encrypted.encryptedData,
            initializationVector: encrypted.iv,
            authTag: encrypted.authTag,
            keyFingerprint: fingerprint,
            status: 'active',
            createdBy: req.user?.id,
            decryptAuditLog: JSON.stringify([generateAuditLogEntry('encrypt', req.user?.id, 'openai')])
          };
          const savedKey = await databaseService.upsertCustomerApiKey(context, keyData);
          results.push({ service: 'openai', success: true, id: savedKey.id });
        }
      }
      
      if (geminiKey && geminiKey.trim()) {
        if (!validateApiKeyFormat(geminiKey, 'gemini')) {
          return res.status(400).json({ error: "Invalid Gemini API key format" });
        }
        
        const encrypted = encryptData(geminiKey);
        const fingerprint = generateKeyFingerprint(geminiKey);
        const last4 = getKeyLast4(geminiKey);
        
        const existingByFingerprintGemini = await databaseService.getApiKeyByFingerprint(context, fingerprint);
        if (existingByFingerprintGemini) {
          if (existingByFingerprintGemini.serviceType === 'gemini') {
            results.push({ service: 'gemini', success: true, id: existingByFingerprintGemini.id });
          } else {
            return res.status(400).json({ error: "This key is already registered for a different service" });
          }
        } else {
          const keyData = {
            keyName: 'Gemini API Key',
            keyDescription: 'Google Gemini API key for text and image generation',
            serviceType: 'gemini',
            last4,
            encryptedKey: encrypted.encryptedData,
            initializationVector: encrypted.iv,
            authTag: encrypted.authTag,
            keyFingerprint: fingerprint,
            status: 'active',
            createdBy: req.user?.id,
            decryptAuditLog: JSON.stringify([generateAuditLogEntry('encrypt', req.user?.id, 'gemini')])
          };
          const savedKey = await databaseService.upsertCustomerApiKey(context, keyData);
          results.push({ service: 'gemini', success: true, id: savedKey.id });
        }
      }

      if (claudeKey && claudeKey.trim()) {
        if (!validateApiKeyFormat(claudeKey, 'claude')) {
          return res.status(400).json({ error: "Invalid Claude API key format. Claude keys begin with sk-ant-" });
        }

        const encrypted = encryptData(claudeKey);
        const fingerprint = generateKeyFingerprint(claudeKey);
        const last4 = getKeyLast4(claudeKey);

        const existingByFingerprintClaude = await databaseService.getApiKeyByFingerprint(context, fingerprint);
        if (existingByFingerprintClaude) {
          if (existingByFingerprintClaude.serviceType === 'claude') {
            results.push({ service: 'claude', success: true, id: existingByFingerprintClaude.id });
          } else {
            return res.status(400).json({ error: "This key is already registered for a different service" });
          }
        } else {
          const keyData = {
            keyName: 'Claude API Key',
            keyDescription: 'Anthropic Claude API key for document scanning and AI assistance',
            serviceType: 'claude',
            last4,
            encryptedKey: encrypted.encryptedData,
            initializationVector: encrypted.iv,
            authTag: encrypted.authTag,
            keyFingerprint: fingerprint,
            status: 'active',
            createdBy: req.user?.id,
            decryptAuditLog: JSON.stringify([generateAuditLogEntry('encrypt', req.user?.id, 'claude')])
          };
          const savedKey = await databaseService.upsertCustomerApiKey(context, keyData);
          results.push({ service: 'claude', success: true, id: savedKey.id });
        }
      }
      
      res.json({ 
        success: true, 
        message: "API keys saved successfully",
        results 
      });
    } catch (error) {
      console.error("Error saving AI keys:", error);
      res.status(500).json({ error: "Failed to save API keys" });
    }
  });

  app.post("/api/settings/ai-keys/test", requireAuth, async (req, res) => {
    try {
      const { serviceType, tempKey } = req.body;
      
      if (!serviceType || !['openai', 'gemini', 'claude'].includes(serviceType)) {
        return res.status(400).json({ error: "Invalid service type" });
      }
      
      if (!req.session?.customerId) {
        return res.status(401).json({ error: "Customer context not found in session" });
      }
      const context = { customerId: req.session.customerId };
      
      let testKey = tempKey;
      
      if (!testKey) {
        const { decryptData } = await import("../utils/encryption");
        const apiKeys = await databaseService.getCustomerApiKeys(context);
        const storedKey = apiKeys.find(key => key.serviceType === serviceType);
        
        if (!storedKey) {
          return res.status(400).json({ error: `No ${serviceType} key configured` });
        }
        
        try {
          testKey = decryptData(
            storedKey.encryptedKey,
            storedKey.initializationVector,
            storedKey.authTag || ''
          );
        } catch (decryptError) {
          return res.status(500).json({ error: "Failed to decrypt stored key" });
        }
      }
      
      let testResult: { success: boolean; message: string; model?: string };
      
      if (serviceType === 'openai') {
        try {
          const OpenAI = (await import("openai")).default;
          const openai = new OpenAI({ apiKey: testKey });
          const response = await openai.models.list();
          const models = response.data;
          testResult = {
            success: true,
            message: `OpenAI connection successful. ${models.length} models available.`,
            model: models[0]?.id || 'gpt-3.5-turbo'
          };
          if (!tempKey) {
            await databaseService.updateApiKeyLastUsed(context, serviceType);
          }
        } catch (error: any) {
          testResult = { success: false, message: `OpenAI connection failed: ${error.message}` };
        }
      } else if (serviceType === 'gemini') {
        try {
          const { GoogleGenAI } = await import("@google/genai");
          const genai = new GoogleGenAI({ apiKey: testKey });
          const models = await genai.models.list();
          const modelList = Array.from(models);
          testResult = {
            success: true,
            message: `Gemini connection successful. ${modelList.length} models available.`,
            model: modelList[0]?.name || 'gemini-pro'
          };
          if (!tempKey) {
            await databaseService.updateApiKeyLastUsed(context, serviceType);
          }
        } catch (error: any) {
          testResult = { success: false, message: `Gemini connection failed: ${error.message}` };
        }
      } else if (serviceType === 'claude') {
        try {
          const Anthropic = (await import("@anthropic-ai/sdk")).default;
          const anthropic = new Anthropic({ apiKey: testKey });
          await anthropic.messages.create({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 10,
            messages: [{ role: "user", content: "Say OK" }],
          });
          testResult = {
            success: true,
            message: "Claude connection successful. claude-3-5-sonnet is available.",
            model: "claude-3-5-sonnet-20241022",
          };
          if (!tempKey) {
            await databaseService.updateApiKeyLastUsed(context, serviceType);
          }
        } catch (error: any) {
          testResult = { success: false, message: `Claude connection failed: ${error.message}` };
        }
      }
      
      await databaseService.logApiKeyAccess(context, {
        serviceType,
        action: 'test',
        success: testResult!.success,
        userId: req.user?.id,
        ipAddress: req.ip || 'unknown'
      });
      
      res.json(testResult!);
    } catch (error) {
      console.error("Error testing AI key:", error);
      res.status(500).json({ error: "Failed to test API key" });
    }
  });

  app.delete("/api/settings/ai-keys/:serviceType", requireAuth, async (req, res) => {
    try {
      const { serviceType } = req.params;
      
      if (!['openai', 'gemini', 'claude'].includes(serviceType)) {
        return res.status(400).json({ error: "Invalid service type" });
      }
      
      if (!req.session?.customerId) {
        return res.status(401).json({ error: "Customer context not found in session" });
      }
      const context = { customerId: req.session.customerId };
      
      const success = await databaseService.revokeCustomerApiKey(context, serviceType, {
        revokedBy: req.user?.id,
        revocationReason: 'User requested revocation'
      });
      
      if (!success) {
        return res.status(404).json({ error: `No ${serviceType} key found to revoke` });
      }
      
      res.json({ 
        success: true, 
        message: `${serviceType} API key has been revoked successfully` 
      });
    } catch (error) {
      console.error("Error revoking AI key:", error);
      res.status(500).json({ error: "Failed to revoke API key" });
    }
  });

  app.put("/api/settings", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
      const updates = insertCompanySettingsSchema.partial().parse(req.body);
      
      // Never overwrite sensitive credential fields with empty strings — omit them if blank
      const sensitiveFields = ['smtpPassword', 'biostarPassword', 'paxtonPassword', 'paxtonClientSecret',
        'twilioAuthToken', 'eightByXApiSecret', 'clueApiKey', 'clueApiSecret',
        'openaiApiKey', 'geminiApiKey', 'sendgridApiKey'] as const;
      for (const field of sensitiveFields) {
        if (field in updates && (updates as any)[field] === '') {
          delete (updates as any)[field];
        }
      }
      
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const settings = await simpleDatabaseService.updateCompanySettings(context, updates);
      
      console.log(`💾 Updated company settings FOR CUSTOMER: ${context.customerId}`);

      const dailyResetFields = ['enableDailyReset', 'dailyResetTime', 'dailyResetTimezone', 'gracePeriodMinutes', 'enableWeekendReset', 'enable24x7Operations', 'enableHolidayReset'];
      if (dailyResetFields.some(f => f in updates) && setupAutomaticDailyReset) {
        console.log(`📅 Daily reset settings changed for customer ${context.customerId} — rescheduling`);
        setupAutomaticDailyReset(context.customerId).catch(err => 
          console.error('Failed to reschedule daily reset after settings change:', err)
        );
      }

      res.json(settings);
    } catch (error) {
      console.error('Settings update error:', error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid settings data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to update company settings" });
      }
    }
  });

  // Windows printer detection endpoint
  app.post("/api/objects/upload", requireAuth, async (req, res) => {
    try {
      console.log("[UPLOAD] POST /api/objects/upload received, body keys:", Object.keys(req.body || {}));
      const { data, mimeType } = req.body;
      if (!data || !mimeType) {
        return res.status(400).json({ error: "Missing data or mimeType" });
      }
      const buffer = Buffer.from(data, "base64");
      const objectStorageService = new ObjectStorageService();
      const privateObjectDir = objectStorageService.getPrivateObjectDir();
      const objectId = randomUUID();
      const fullPath = `${privateObjectDir}/uploads/${objectId}`;
      const parts = fullPath.slice(1).split("/");
      const bucketName = parts[0];
      const objectName = parts.slice(1).join("/");
      console.log(`[UPLOAD] Saving to bucket=${bucketName} object=${objectName} mimeType=${mimeType} size=${buffer.length}`);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      await file.save(buffer, { contentType: mimeType, resumable: false });
      const objectPath = `/objects/uploads/${objectId}`;
      console.log(`[UPLOAD] Success: objectPath=${objectPath}`);
      return res.json({ objectPath });
    } catch (error) {
      console.error("[UPLOAD] Error uploading file:", error);
      res.status(500).json({ error: "Failed to upload file", detail: String(error) });
    }
  });

  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      console.log(`[OBJECTS] Serving object: ${req.path}`);
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error(`[OBJECTS] Error accessing object ${req.path}:`, error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  app.get("/public-objects/:filePath(*)", async (req, res) => {
    const filePath = req.params.filePath;
    const objectStorageService = new ObjectStorageService();
    try {
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      objectStorageService.downloadObject(file, res);
    } catch (error) {
      console.error("Error searching for public object:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── User invitation endpoints ──────────────────────────────────────────────

  app.post("/api/invitations", requireAuth, async (req, res) => {
    try {
      const validatedData = insertUserInvitationSchema.omit({ token: true, expires: true, createdAt: true, used: true }).parse(req.body);
      
      const invContext = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const invCustomerDb = await customerDbService.getCustomerDatabase(invContext.customerId);
      
      const [existingInvitation] = await invCustomerDb.select().from(isolatedSchema.userInvitations)
        .where(eq(isolatedSchema.userInvitations.email, validatedData.email));
      if (existingInvitation && !existingInvitation.used) {
        return res.status(400).json({ error: "An invitation already exists for this email address" });
      }

      const existingUser = await databaseService.getUserByUsername(invContext, validatedData.email);
      if (existingUser) {
        return res.status(400).json({ error: "A user already exists with this email address" });
      }

      const currentUser = await databaseService.getUser(invContext, req.session.userId!);
      if (!currentUser) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const token = randomUUID();
      const expires = new Date();
      expires.setDate(expires.getDate() + 7);
      const [invitation] = await invCustomerDb.insert(isolatedSchema.userInvitations)
        .values({
          ...validatedData,
          token,
          expires,
          invitedBy: currentUser.id
        })
        .returning();

      const companySettings = await simpleDatabaseService.getCompanySettings(invContext);
      if (companySettings) {
        const emailSent = await emailService.forCustomer(invContext.customerId).sendUserInvitation(
          invitation.email,
          invitation.role,
          invitation.token,
          currentUser,
          companySettings,
          invContext.customerId
        );

        if (!emailSent) {
          console.warn("Failed to send invitation email, but invitation was created");
        }
      }

      res.json({ 
        success: true, 
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          createdAt: invitation.createdAt,
          expires: invitation.expires,
          used: invitation.used
        }
      });
    } catch (error) {
      console.error("Failed to create invitation:", error);
      res.status(500).json({ error: "Failed to create invitation" });
    }
  });

  app.get("/api/invitations", requireAuth, async (req, res) => {
    try {
      const invListContext = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const invListDb = await customerDbService.getCustomerDatabase(invListContext.customerId);
      const invitations = await invListDb.select().from(isolatedSchema.userInvitations);
      res.json(invitations.map(inv => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        createdAt: inv.createdAt,
        expires: inv.expires,
        used: inv.used,
        invitedBy: inv.invitedBy
      })));
    } catch (error) {
      console.error("Failed to fetch invitations:", error);
      res.status(500).json({ error: "Failed to fetch invitations" });
    }
  });

  app.post("/api/invitations/accept", async (req, res) => {
    try {
      const { token, username, password, customerId } = req.body;
      
      if (!token || !username || !password) {
        return res.status(400).json({ error: "Token, username, and password are required" });
      }

      if (!customerId) {
        return res.status(400).json({ error: "Invalid invitation link — missing customer context. Please use the original invitation email link." });
      }

      const acceptContext = { customerId };
      const acceptDb = await customerDbService.getCustomerDatabase(acceptContext.customerId);
      
      const [invitation] = await acceptDb.select().from(isolatedSchema.userInvitations)
        .where(eq(isolatedSchema.userInvitations.token, token));
      if (!invitation) {
        return res.status(404).json({ error: "Invalid or expired invitation token" });
      }

      if (invitation.used) {
        return res.status(400).json({ error: "This invitation has already been used" });
      }

      if (new Date() > invitation.expires) {
        return res.status(400).json({ error: "This invitation has expired" });
      }

      const existingUser = await databaseService.getUserByUsername(acceptContext, username);
      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      const bcrypt = await import('bcryptjs');
      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = await databaseService.createUser(acceptContext, {
        username,
        password: hashedPassword,
        email: invitation.email,
        role: invitation.role || 'user',
        customerId: acceptContext.customerId,
      });

      await acceptDb.update(isolatedSchema.userInvitations)
        .set({ used: true })
        .where(eq(isolatedSchema.userInvitations.token, token));

      res.json({ 
        success: true, 
        user: { id: newUser.id, username: newUser.username, email: newUser.email }
      });
    } catch (error) {
      console.error("Failed to accept invitation:", error);
      res.status(500).json({ error: "Failed to accept invitation" });
    }
  });

  app.delete("/api/invitations/:id", requireAuth, async (req, res) => {
    try {
      if (!req.session?.customerId) {
        return res.status(401).json({ error: "Missing customer context" });
      }
      const context = { customerId: req.session.customerId };
      const { id } = req.params;
      const success = await databaseService.deleteInvitation(context, id);
      if (!success) {
        return res.status(404).json({ error: "Invitation not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete invitation:", error);
      res.status(500).json({ error: "Failed to delete invitation" });
    }
  });

  // ── User management endpoints ──────────────────────────────────────────────

  app.get("/api/users", requireAuth, async (req, res) => {
    try {
      if (!req.session?.customerId) {
        return res.status(401).json({ error: "Missing customer context" });
      }
      const context = { customerId: req.session.customerId };

      const users = await databaseService.getAllUsers(context);
      
      const sessionUserId = req.session?.userId;
      const safeUsers = users.map(user => ({
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        allowedMenuItems: (user as any).allowedMenuItems ?? null,
        defaultLandingPage: (user as any).defaultLandingPage ?? null,
        status: 'active' as const,
        isCurrentUser: user.id === sessionUserId,
      }));

      const pendingInvitations = await databaseService.getPendingInvitations(context);
      const safePendingInvitations = pendingInvitations.map(inv => ({
        id: inv.id,
        username: inv.email.split('@')[0],
        email: inv.email,
        role: inv.role,
        firstName: '',
        lastName: '',
        status: 'pending' as const,
        invitedAt: inv.createdAt,
        invitationToken: inv.token,
        customerId: context.customerId,
      }));

      res.json([...safeUsers, ...safePendingInvitations]);
    } catch (error) {
      console.error("Failed to fetch users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.post("/api/users/manual", requireAuth, async (req, res) => {
    try {
      const { username, email, password, role, firstName, lastName } = req.body;
      
      if (!username || !email || !password || !role) {
        return res.status(400).json({ error: "Username, email, password, and role are required" });
      }

      if (!req.session?.customerId) {
        return res.status(401).json({ error: "Missing customer context" });
      }
      const context = { customerId: req.session.customerId };

      const existingUserByUsername = await databaseService.getUserByUsername(context, username);
      if (existingUserByUsername) {
        return res.status(400).json({ error: "A user with this username already exists" });
      }

      const existingUserByEmail = await databaseService.getUserByEmail(context, email);
      if (existingUserByEmail) {
        return res.status(400).json({ error: "A user with this email already exists" });
      }

      const bcrypt = await import('bcryptjs');
      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = await databaseService.createUser(context, {
        username,
        email,
        password: hashedPassword,
        role,
        firstName: firstName || "",
        lastName: lastName || "",
        customerId: context.customerId,
      });

      res.json({ 
        success: true, 
        user: { 
          id: newUser.id, 
          username: newUser.username, 
          email: newUser.email,
          role: newUser.role,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
        }
      });
    } catch (error) {
      console.error("Failed to create user manually:", error);
      res.status(500).json({ error: "Failed to create user account" });
    }
  });

  app.put("/api/users/:id", requireAuth, async (req, res) => {
    try {
      if (!req.session?.customerId) {
        return res.status(401).json({ error: "Missing customer context" });
      }
      const context = { customerId: req.session.customerId };
      
      const { id } = req.params;
      const { username, email, firstName, lastName, role, password, allowedMenuItems, defaultLandingPage } = req.body;
      
      const customerDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(req.session.customerId);
      const currentUsers = await customerDb
        .select()
        .from(isolatedSchema.users)
        .where(eq(isolatedSchema.users.id, req.session.userId))
        .limit(1);
      
      const currentUser = currentUsers[0];
      if (!currentUser) {
        return res.status(401).json({ error: "User not found" });
      }

      if (role && currentUser.role !== 'admin') {
        return res.status(403).json({ error: "Only administrators can change user roles" });
      }

      const updateData: any = {};
      if (username) updateData.username = username;
      if (email) updateData.email = email;
      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;
      if (role && currentUser.role === 'admin') updateData.role = role;
      if (password) updateData.password = password;
      if (currentUser.role === 'admin') {
        if (allowedMenuItems !== undefined) {
          updateData.allowedMenuItems = Array.isArray(allowedMenuItems) && allowedMenuItems.length > 0 ? allowedMenuItems : null;
        }
        if (defaultLandingPage !== undefined) {
          updateData.defaultLandingPage = defaultLandingPage || null;
        }
      }

      const updatedUser = await databaseService.updateUser(context, id, updateData);
      
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ 
        success: true, 
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          email: updatedUser.email,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          role: updatedUser.role,
          allowedMenuItems: (updatedUser as any).allowedMenuItems ?? null,
          defaultLandingPage: (updatedUser as any).defaultLandingPage ?? null
        }
      });
    } catch (error) {
      console.error("Failed to update user:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.delete("/api/users/:id", requireAuth, async (req, res) => {
    try {
      if (!req.session?.customerId) {
        return res.status(401).json({ error: "Missing customer context" });
      }
      const context = { customerId: req.session.customerId };
      const { id } = req.params;
      
      if (id === req.session.userId) {
        return res.status(400).json({ error: "You cannot delete your own account" });
      }

      const success = await databaseService.deleteUser(context, id);
      if (!success) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete user:", error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // ── Printer compliance / capabilities ─────────────────────────────────────

  // Get Zebra printer capabilities
}
