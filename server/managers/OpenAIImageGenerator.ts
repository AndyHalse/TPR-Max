/**
 * Image generators for production-quality induction slides.
 * Uses customer API keys stored in the database — NOT env vars.
 *
 * Chain (managed by ImageFallbackChain):
 *   1. Imagen 4 Fast      (Google / customer Gemini key)
 *   2. OpenAI DALL-E 3    (OpenAI / customer OpenAI key)
 *   3. Gemini Flash Image (Google / customer Gemini key)
 *   4. SVG fallback       (no API needed)
 */

import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import type { IImageGenerator, ImageGenerationResult, Result } from '../interfaces/ai';
import { ResultUtils } from '../utils/result';
import { logger } from '../utils/logger';

function buildImagenClient(geminiApiKey: string): GoogleGenAI {
  // GOOGLE_API_KEY is Replit's internal proxy token — the SDK prefers it over any
  // explicit key, but the proxy does NOT support image generation.
  // Temporarily remove it so the SDK uses the real customer key directly.
  const savedGoogleKey = process.env.GOOGLE_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  const client = new GoogleGenAI({ apiKey: geminiApiKey });
  if (savedGoogleKey !== undefined) process.env.GOOGLE_API_KEY = savedGoogleKey;
  return client;
}

/** Imagen 4 Fast — best photorealistic quality, uses customer Gemini key */
export class DallE3ImageGenerator implements IImageGenerator {
  constructor(private companySettings?: any, private geminiApiKey?: string) {}

  async generate(
    slideType: string,
    title: string,
    description: string
  ): Promise<Result<ImageGenerationResult>> {
    const apiKey = this.geminiApiKey || process.env.GEMINI_API_KEY || "";
    if (!apiKey) {
      return ResultUtils.error(new Error('No Gemini API key available for Imagen 4'));
    }

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

      logger.info(`🎨 [Imagen4] Generating image for: ${title}`);

      const ai = buildImagenClient(apiKey);
      const result = await ai.models.generateImages({
        model: "imagen-4.0-fast-generate-001",
        prompt,
        config: { numberOfImages: 1, outputMimeType: "image/jpeg" },
      });

      const imageBytes = result.generatedImages?.[0]?.image?.imageBytes;
      if (!imageBytes) throw new Error('No image bytes returned from Imagen 4');

      const base64 = Buffer.from(imageBytes).toString('base64');
      logger.info(`✅ [Imagen4] Success for: ${title}`);

      return ResultUtils.success({
        url: `data:image/jpeg;base64,${base64}`,
        meta: { model: "imagen-4.0-fast-generate-001", prompt, fallback: false, quality: "high" }
      });

    } catch (error: any) {
      logger.error(`❌ [Imagen4] Failed for "${title}":`, error.message);
      return ResultUtils.error(error);
    }
  }
}

/** OpenAI DALL-E 3 — photorealistic fallback, uses customer OpenAI key */
export class OpenAIDallE3Generator implements IImageGenerator {
  constructor(private apiKey: string, private companySettings?: any) {}

  async generate(
    slideType: string,
    title: string,
    description: string
  ): Promise<Result<ImageGenerationResult>> {
    try {
      const companyName = this.companySettings?.companyName || 'Modern Workplace';
      const prompt = `Professional photorealistic UK workplace safety training photograph showing: ${title}. ${description}. Diverse professional workforce, modern setting at ${companyName}, correct PPE, bright clean lighting, no text or logos in image.`;

      logger.info(`🎨 [DALL-E3] Generating image for: ${title}`);

      const openai = new OpenAI({ apiKey: this.apiKey });
      // Use URL response and fetch+convert — avoids SDK version differences with b64_json
      const response = await openai.images.generate({
        model: "dall-e-3",
        prompt,
        size: "1792x1024",
        quality: "standard",
        n: 1,
      } as any);

      const imageUrl = response.data?.[0]?.url;
      if (!imageUrl) throw new Error('No image URL returned from DALL-E 3');

      // Download and convert to base64 data URL so it can be embedded in HTML
      const fetchResp = await fetch(imageUrl);
      if (!fetchResp.ok) throw new Error(`Failed to fetch DALL-E image: ${fetchResp.status}`);
      const arrayBuf = await fetchResp.arrayBuffer();
      const b64 = Buffer.from(arrayBuf).toString('base64');

      logger.info(`✅ [DALL-E3] Success for: ${title}`);

      return ResultUtils.success({
        url: `data:image/png;base64,${b64}`,
        meta: { model: "dall-e-3", prompt, fallback: false, quality: "standard" }
      });

    } catch (error: any) {
      logger.error(`❌ [DALL-E3] Failed for "${title}":`, error.message);
      return ResultUtils.error(error);
    }
  }
}
