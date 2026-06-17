import type { Express } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../auth';
import { askHelpAssistant } from '../chatbotService';
import { logger } from '../utils/logger';

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

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        logger.warn('⚠️ chatbot: ANTHROPIC_API_KEY not set — help assistant unavailable');
        return res.status(503).json({ error: 'Help assistant is not configured on this platform.' });
      }

      const customerId = (req as any).customerId || 'unknown';
      const username = (req as any).user?.username || 'unknown';
      logger.info(`💬 chatbot: request from ${username} (${customerId}), page="${currentPage ?? 'unknown'}", turns=${messages.length}`);

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
