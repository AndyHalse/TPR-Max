/**
 * DALL-E 3 Image Generator for Production-Quality Induction Videos
 * Provides photorealistic, professional workplace safety images
 */

import OpenAI from "openai";
import type { IImageGenerator, ImageGenerationResult, Result } from '../interfaces/ai';
import { ResultUtils } from '../utils/result';

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

      console.log(`🎨 Generating DALL-E 3 image for: ${title}`);
      
      // Generate image using DALL-E 3
      const response = await openai.images.generate({
        model: "dall-e-3",
        prompt: finalPrompt,
        n: 1,
        size: "1792x1024", // Wide format perfect for induction videos
        quality: "hd", // HD quality for professional output
        style: "natural" // Natural photographic style
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('No image data returned from DALL-E 3');
      }

      const imageUrl = response.data[0].url;
      
      if (!imageUrl) {
        throw new Error('No image URL in DALL-E 3 response');
      }

      console.log(`✅ DALL-E 3 image generated successfully for: ${title}`);

      return ResultUtils.success({
        url: imageUrl,
        meta: {
          model: "dall-e-3",
          prompt: finalPrompt,
          revisedPrompt: response.data[0].revised_prompt || finalPrompt,
          fallback: false,
          quality: "hd",
          size: "1792x1024"
        }
      });

    } catch (error: any) {
      console.error('❌ DALL-E 3 image generation failed:', error.message);
      
      // Provide detailed error context
      if (error.response?.status === 400) {
        console.error('❌ Bad request - prompt may have content policy issues');
      } else if (error.response?.status === 429) {
        console.error('❌ Rate limit exceeded - too many requests');
      } else if (error.response?.status === 500) {
        console.error('❌ OpenAI service error');
      }
      
      return ResultUtils.error(error);
    }
  }
}
