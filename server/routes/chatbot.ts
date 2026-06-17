import type { Express } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../auth';
import { askHelpAssistant } from '../chatbotService';
import { logger } from '../utils/logger';
import { databaseService } from '../databaseService';
import { decryptData } from '../utils/encryption';

const chatbotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many help requests. Please wait a few minutes and try again.' },
  keyGenerator: (req) => {
    const customerId = (req as any).customerId || 'unknown';
    const userId = (req as any).user?.id || (req as any).user?.username || 'unknown';
    return `chatbot:${customerId}:${userId}`;
  },
});

const MAX_MESSAGE_LENGTH = 2000;
const MAX_MESSAGES = 10;

async function resolveAnthropicKey(customerId?: string): Promise<string | null> {
  if (customerId) {
    try {
      const apiKeys = await databaseService.getCustomerApiKeys({ customerId });
      const claudeRow = apiKeys.find((k: any) => k.serviceType === 'claude' && k.status === 'active');
      if (claudeRow?.encryptedKey) {
        const key = decryptData(
          claudeRow.encryptedKey,
          claudeRow.initializationVector,
          claudeRow.authTag || ''
        );
        if (key) return key;
      }
    } catch (err) {
      logger.warn('⚠️ chatbot: could not load customer Claude key, falling back to platform key', err);
    }
  }
  return process.env.ANTHROPIC_API_KEY || null;
}

export function registerChatbotRoutes(app: Express): void {
  app.post('/api/chatbot/ask', requireAuth, chatbotLimiter, async (req, res) => {
    try {
      const { messages, currentPage } = req.body;

      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'messages must be a non-empty array' });
      }

      if (messages.length > MAX_MESSAGES) {
        return res.status(400).json({ error: `messages array must not exceed ${MAX_MESSAGES} items` });
      }

      for (const msg of messages) {
        if (!msg || typeof msg !== 'object') {
          return res.status(400).json({ error: 'Each message must be an object with role and content' });
        }
        if (msg.role !== 'user' && msg.role !== 'assistant') {
          return res.status(400).json({ error: 'message role must be "user" or "assistant"' });
        }
        if (typeof msg.content !== 'string' || msg.content.trim().length === 0) {
          return res.status(400).json({ error: 'message content must be a non-empty string' });
        }
        if (msg.content.length > MAX_MESSAGE_LENGTH) {
          return res.status(400).json({ error: `message content must not exceed ${MAX_MESSAGE_LENGTH} characters` });
        }
      }

      const customerId = (req as any).customerId as string | undefined;
      const username = (req as any).user?.username || 'unknown';

      const apiKey = await resolveAnthropicKey(customerId);
      if (!apiKey) {
        logger.warn('⚠️ chatbot: no Claude API key available for customer', customerId);
        return res.status(503).json({ error: 'Help assistant requires a Claude API key. Please add one in Settings → AI.' });
      }

      logger.info(`💬 chatbot: request from ${username} (${customerId ?? 'unknown'}), page="${currentPage ?? 'unknown'}", turns=${messages.length}`);

      const { answer, success } = await askHelpAssistant({
        messages,
        currentPage: typeof currentPage === 'string' ? currentPage.slice(0, 100) : undefined,
        apiKey,
      });

      return res.json({ answer, success });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('❌ chatbot route error:', msg);
      return res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
    }
  });
}
