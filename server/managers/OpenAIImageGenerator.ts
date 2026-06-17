/**
 * Imagen 4 Image Generator for Production-Quality Induction Videos
 * Uses Google's Imagen 4 Fast model via the GOOGLE_API_KEY env var (real Google API key).
 * Replit's AI Integration proxy does NOT support image generation — this bypasses it entirely.
 */

import { GoogleGenAI } from "@google/genai";
import type { IImageGenerator, ImageGenerationResult, Result } from '../interfaces/ai';
import { ResultUtils } from '../utils/result';
import { logger } from '../utils/logger';

function buildImagenClient(): GoogleGenAI {
  // GOOGLE_API_KEY is Replit's internal proxy token — the SDK prefers it over
  // GEMINI_API_KEY, but the proxy does NOT support image generation.
  // Temporarily remove it so the SDK uses the real GEMINI_API_KEY (AIza...) directly.
  const savedGoogleKey = process.env.GOOGLE_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  const apiKey = process.env.GEMINI_API_KEY || "";
  const client = new GoogleGenAI({ apiKey });
  if (savedGoogleKey !== undefined) process.env.GOOGLE_API_KEY = savedGoogleKey;
  return client;
}

export class DallE3ImageGenerator implements IImageGenerator {
  constructor(private companySettings?: any) {}

  async generate(
    slideType: string,
    title: string,
    description: string
  ): Promise<Result<ImageGenerationResult>> {
    try {
      const companyName = this.companySettings?.companyName || 'Modern Workplace';

      const prompt = `Professional photorealistic workplace safety training image for "${title}".

Scene: ${description}

Requirements:
- Modern corporate or industrial environment at ${companyName}
- Diverse workforce (varied ethnicities and genders)
- Correct safety equipment and signage relevant to this scene
- Clean, well-lit professional setting with bright LED lighting
- High-quality commercial photography style, sharp focus
- Authentic workplace scenario matching the scene description
- Suitable for UK workplace safety induction training materials`;

      logger.info(`🎨 Generating Imagen 4 image for: ${title}`);

      const ai = buildImagenClient();
      const result = await ai.models.generateImages({
        model: "imagen-4.0-fast-generate-001",
        prompt,
        config: {
          numberOfImages: 1,
          outputMimeType: "image/jpeg",
        },
      });

      const imageBytes = result.generatedImages?.[0]?.image?.imageBytes;
      if (!imageBytes) {
        throw new Error('No image bytes returned from Imagen 4');
      }

      const base64 = Buffer.from(imageBytes).toString('base64');
      const imageUrl = `data:image/jpeg;base64,${base64}`;

      logger.info(`✅ Imagen 4 image generated successfully for: ${title}`);

      return ResultUtils.success({
        url: imageUrl,
        meta: {
          model: "imagen-4.0-fast-generate-001",
          prompt,
          fallback: false,
          quality: "high",
        }
      });

    } catch (error: any) {
      logger.error(`❌ Imagen 4 image generation failed for "${title}":`, error.message);
      return ResultUtils.error(error);
    }
  }
}
