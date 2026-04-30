/**
 * GPT-Image-1 Image Generator for Production-Quality Induction Videos
 * Uses Replit AI Integrations - no personal API key required, billed to Replit credits
 * Provides photorealistic, professional workplace safety images
 */

import OpenAI from "openai";
import type { IImageGenerator, ImageGenerationResult, Result } from '../interfaces/ai';
import { ResultUtils } from '../utils/result';
import { logger } from '../utils/logger';

// Using Replit's AI Integrations service - provides OpenAI-compatible API access without requiring your own API key
// Charges are billed to Replit credits, bypassing personal API billing limits
const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

export class DallE3ImageGenerator implements IImageGenerator {
  constructor(private companySettings?: any) {}

  async generate(
    slideType: string, 
    title: string, 
    description: string
  ): Promise<Result<ImageGenerationResult>> {
    try {
      const companyName = this.companySettings?.companyName || 'Modern Workplace';
      
      // Build contextual prompt using the actual scene title and description
      const finalPrompt = `Professional photorealistic workplace safety training image for "${title}". 
      
Scene description: ${description}

Visual requirements:
- Modern corporate environment at ${companyName}
- Diverse workforce (different ethnicities and genders)
- Proper safety equipment and signage relevant to the scene
- Clean, well-lit professional setting with bright LED lighting
- Contemporary workplace design (glass, steel, modern finishes)
- High-quality commercial photography style
- Sharp focus, natural lighting, 8K quality
- Authentic workplace scenario that matches the scene description

Style: Photorealistic corporate photography, professional composition, bright and clear, suitable for safety training materials.`;

      logger.info(`🎨 Generating GPT-Image-1 image for: ${title}`);
      
      // Generate image using gpt-image-1 via Replit AI Integrations
      // Note: gpt-image-1 does not support response_format parameter - always returns base64
      const response = await openai.images.generate({
        model: "gpt-image-1",
        prompt: finalPrompt,
        n: 1,
        size: "1024x1024", // Standard high-quality size for gpt-image-1
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('No image data returned from gpt-image-1');
      }

      // gpt-image-1 returns base64 data, not URL
      const imageBase64 = response.data[0].b64_json;
      
      if (!imageBase64) {
        throw new Error('No image data in gpt-image-1 response');
      }

      // Convert to data URL for use in the application
      const imageUrl = `data:image/png;base64,${imageBase64}`;

      logger.info(`✅ GPT-Image-1 image generated successfully for: ${title}`);

      return ResultUtils.success({
        url: imageUrl,
        meta: {
          model: "gpt-image-1",
          prompt: finalPrompt,
          fallback: false,
          quality: "high",
          size: "1024x1024"
        }
      });

    } catch (error: any) {
      logger.error('❌ GPT-Image-1 image generation failed:', error.message);
      
      // Provide detailed error context
      if (error.response?.status === 400) {
        logger.error('❌ Bad request - prompt may have content policy issues');
      } else if (error.response?.status === 429) {
        logger.error('❌ Rate limit exceeded - too many requests');
      } else if (error.response?.status === 500) {
        logger.error('❌ OpenAI service error');
      }
      
      return ResultUtils.error(error);
    }
  }
}
