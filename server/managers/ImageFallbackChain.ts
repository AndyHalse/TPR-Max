/**
 * Image generation fallback chain for reliable image delivery
 * Priority: Imagen 4 Fast -> Gemini 2.5 Flash Image -> SVG Fallback
 *
 * IMPORTANT: Replit's AI Integration proxy (AI_INTEGRATIONS_*) does NOT support
 * image generation — only text models. Both generators here use GOOGLE_API_KEY
 * (real Google API key) directly, bypassing the proxy entirely.
 */

import { GoogleGenAI, Modality } from "@google/genai";
import type { IImageGenerator, ImageGenerationResult, Result } from '../interfaces/ai';
import { ResultUtils } from '../utils/result';
import { DallE3ImageGenerator } from './OpenAIImageGenerator';
import { logger } from '../utils/logger';

function buildGoogleAIClient(): GoogleGenAI {
  // GOOGLE_API_KEY is Replit's internal proxy token — the SDK prefers it over
  // GEMINI_API_KEY, but the proxy does NOT support image generation.
  // We must use GEMINI_API_KEY (the real AIza... Google API key) directly.
  const savedGoogleKey = process.env.GOOGLE_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  const apiKey = process.env.GEMINI_API_KEY || "";
  const client = new GoogleGenAI({ apiKey });
  if (savedGoogleKey !== undefined) process.env.GOOGLE_API_KEY = savedGoogleKey;
  return client;
}

export class GeminiImageGenerator implements IImageGenerator {
  async generate(
    slideType: string,
    title: string,
    description: string
  ): Promise<Result<ImageGenerationResult>> {
    try {
      const geminiPrompt = `Create a professional, photorealistic workplace safety training image.

Title: ${title}
Scene: ${description}

Requirements:
- Ultra-realistic photographic quality
- Modern corporate or industrial setting with authentic details
- Diverse workforce (varied ethnicities, genders, ages)
- Proper safety equipment aligned with UK HSE standards
- Clear safety signage and hazard markings where relevant
- Professional lighting with natural colour accuracy
- Sharp focus, excellent detail, training-appropriate composition
- Suitable for UK workplace health & safety induction materials`;

      logger.info(`🎨 Generating Gemini 2.5 Flash image for: ${title}`);

      const ai = buildGoogleAIClient();
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: [{ role: "user", parts: [{ text: geminiPrompt }] }],
        config: {
          responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
      });

      const parts = response.candidates?.[0]?.content?.parts || [];
      const imgPart = parts.find((p: any) => p.inlineData?.data);

      if (!imgPart?.inlineData?.data) {
        throw new Error('No image data returned from Gemini 2.5 Flash Image');
      }

      const mimeType = imgPart.inlineData.mimeType || "image/jpeg";
      const url = `data:${mimeType};base64,${imgPart.inlineData.data}`;

      logger.info(`✅ Gemini 2.5 Flash image generated successfully for: ${title}`);

      return ResultUtils.success({
        url,
        meta: {
          model: "gemini-2.5-flash-image",
          prompt: geminiPrompt,
          quality: "high",
          fallback: false
        }
      });

    } catch (error: any) {
      logger.error(`❌ Gemini image generation failed for "${title}":`, error.message);
      return ResultUtils.error(error);
    }
  }
}

export class FallbackSvgImageGenerator implements IImageGenerator {
  constructor(private companySettings?: any) {}

  async generate(
    slideType: string,
    title: string,
    description: string
  ): Promise<Result<ImageGenerationResult>> {
    try {
      const width = 1792;
      const height = 1024;

      const companyName = this.companySettings?.companyName || 'Professional Safety Training';
      const bgColor = this.companySettings?.backgroundColor || '#1a365d';
      const accentColor = this.companySettings?.accentColor || '#ed8936';
      const primaryColor = this.companySettings?.primaryColor || '#2563eb';
      const uniqueId = Date.now();

      const combinedText = `${slideType} ${title}`.toLowerCase();
      let theme = 'general';
      let titleText = 'Safety First';
      let subtitleText = 'Health & Safety Induction';
      let complianceText = 'UK HSE Compliant Training';

      if (combinedText.includes('ppe') || combinedText.includes('personal protective')) {
        theme = 'ppe';
        titleText = 'Personal Protective Equipment';
        subtitleText = 'PPE Requirements & Safety Standards';
        complianceText = 'Mandatory PPE Compliance - UK HSE Regulations';
      } else if (combinedText.includes('emergency') || combinedText.includes('evacuation')) {
        theme = 'emergency';
        titleText = 'Emergency Procedures';
        subtitleText = 'Evacuation & Emergency Response';
        complianceText = 'Emergency Response - UK Fire Safety Regulations';
      } else if (combinedText.includes('welcome') || combinedText.includes('introduction') || combinedText.includes('orientation')) {
        theme = 'welcome';
        titleText = 'Welcome & Safety Orientation';
        subtitleText = `Welcome to ${companyName}`;
        complianceText = 'Workplace Safety Induction - UK HSE Compliant';
      } else if (combinedText.includes('hazard')) {
        theme = 'hazard';
        titleText = 'Hazard Identification';
        subtitleText = 'Risk Assessment & Hazard Control';
        complianceText = 'HASAWA 1974 & Management Regulations 1999';
      } else if (combinedText.includes('legal') || combinedText.includes('framework') || combinedText.includes('responsibilities')) {
        theme = 'legal';
        titleText = 'Legal Framework';
        subtitleText = 'Health & Safety Legal Requirements';
        complianceText = 'UK Health & Safety Executive Guidelines';
      }

      const escapeXml = (text: string) => text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

      const companyNameEscaped = escapeXml(companyName);
      const titleEscaped = escapeXml(titleText);
      const subtitleEscaped = escapeXml(subtitleText);
      const complianceEscaped = escapeXml(complianceText);

      const safeSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg${uniqueId}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${bgColor};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${this.darkenColor(bgColor, 30)};stop-opacity:1" />
    </linearGradient>
    <linearGradient id="hdr${uniqueId}" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:${primaryColor};stop-opacity:0.95" />
      <stop offset="100%" style="stop-color:${accentColor};stop-opacity:0.95" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg${uniqueId})" />
  <rect x="0" y="0" width="100%" height="120" fill="url(#hdr${uniqueId})" />
  <text x="40" y="55" font-family="Arial, sans-serif" font-size="38" font-weight="bold" fill="white">${companyNameEscaped}</text>
  <text x="40" y="90" font-family="Arial, sans-serif" font-size="22" fill="white" opacity="0.9">Health &amp; Safety Training</text>
  <text x="896" y="200" font-family="Arial, sans-serif" font-size="56" font-weight="bold" text-anchor="middle" fill="white">${titleEscaped}</text>
  <text x="896" y="255" font-family="Arial, sans-serif" font-size="32" text-anchor="middle" fill="white" opacity="0.95">${subtitleEscaped}</text>
  <rect x="1350" y="820" width="400" height="160" rx="15" fill="white" opacity="0.98" stroke="${primaryColor}" stroke-width="3" />
  <rect x="1370" y="835" width="360" height="35" rx="8" fill="${accentColor}" />
  <text x="1550" y="865" font-family="Arial, sans-serif" font-size="24" font-weight="bold" text-anchor="middle" fill="white">UK HSE COMPLIANT</text>
  <text x="1550" y="910" font-family="Arial, sans-serif" font-size="16" font-weight="600" text-anchor="middle" fill="${primaryColor}">${complianceEscaped}</text>
  <text x="1550" y="950" font-family="Arial, sans-serif" font-size="13" text-anchor="middle" fill="${primaryColor}">Professional Training Program</text>
  <rect x="15" y="15" width="${width - 30}" height="${height - 30}" fill="none" stroke="white" stroke-width="3" opacity="0.25" rx="10" />
</svg>`;

      const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(safeSvg)}`;

      logger.info(`✅ Generated fallback SVG safety image for theme: ${theme}`);

      return ResultUtils.success({
        url: svgDataUrl,
        meta: {
          model: "svg-fallback",
          prompt: `${slideType}: ${title}`,
          fallback: true,
          theme
        }
      });

    } catch (error: any) {
      logger.error('❌ Fallback SVG generation failed:', error.message);
      return ResultUtils.error(error);
    }
  }

  private darkenColor(hex: string, percent: number): string {
    const num = parseInt(hex.replace("#", ""), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) - amt;
    const G = (num >> 8 & 0x00FF) - amt;
    const B = (num & 0x0000FF) - amt;
    return "#" + (0x1000000 +
      (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
      (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
      (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
  }
}

export { DallE3ImageGenerator };

/**
 * Chains Imagen 4 → Gemini 2.5 Flash Image → SVG fallback.
 * Implements IImageGenerator so it can be used as a drop-in everywhere.
 */
export class ImageFallbackChain implements IImageGenerator {
  private chain: IImageGenerator[];

  constructor(companySettings?: any) {
    this.chain = [
      new DallE3ImageGenerator(companySettings),   // Imagen 4 Fast
      new GeminiImageGenerator(),                   // Gemini 2.5 Flash Image
      new FallbackSvgImageGenerator(companySettings),
    ];
  }

  async generate(
    slideType: string,
    title: string,
    description: string
  ): Promise<Result<ImageGenerationResult>> {
    for (const generator of this.chain) {
      const result = await generator.generate(slideType, title, description);
      if (result.success) {
        const isFallback = (result.data as any)?.meta?.fallback === true;
        if (!isFallback || generator === this.chain[this.chain.length - 1]) {
          return result;
        }
        // SVG fallback — only use if it's the last in the chain (already handled above)
        return result;
      }
      logger.warn(`⚠️ Generator ${generator.constructor.name} failed, trying next…`);
    }
    return ResultUtils.error(new Error('All image generators failed'));
  }
}
