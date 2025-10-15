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
      
      // Enhanced prompts for photorealistic workplace safety scenes
      const enhancedPrompts = {
        ppe: `Photorealistic corporate workplace scene at ${companyName} showing diverse workers wearing complete Personal Protective Equipment: hard hats in various colors, high-visibility safety vests (orange and yellow), steel-toe safety boots, safety glasses, and work gloves. Modern industrial facility with bright LED lighting, clean floors with yellow safety lines, visible safety signage on walls. Workers of different ethnicities and genders demonstrating proper PPE compliance. Professional photography style, sharp focus, natural lighting, 8K quality.`,
        
        emergency: `Professional emergency evacuation scene in modern ${companyName} facility showing clearly marked green emergency exit signs with running person pictograms, red fire alarm call points mounted on white walls, bright assembly point signs in car park area. Diverse group of workers calmly following evacuation procedures, fire extinguishers in red cabinets, first aid stations with green cross symbols. Clean, well-lit commercial building interior with reflective floor tiles. Photorealistic, corporate photography style, wide angle view.`,
        
        hazard: `Corporate workplace hazard identification training scene showing various properly marked safety hazards: yellow and black caution tape around wet floor area, orange traffic cones, hazard warning signs (electrical hazard, falling objects, chemical storage), safety barriers protecting machinery, confined space entry permits displayed. Modern industrial setting with proper lighting, safety equipment storage areas, PPE stations. Diverse safety officers conducting inspections. Professional photorealistic style, bright lighting, sharp details.`,
        
        site_rules: `Modern ${companyName} workplace showing comprehensive safety culture: large digital displays and notice boards with safety rules and procedures, health and safety policy posters on walls, compliance certificates in frames, safety achievement awards, worker safety suggestion boxes. Professional office and industrial environment blend, clean and organized workspace, diverse employees reading safety information. Contemporary corporate interior design, bright natural and artificial lighting, photorealistic quality, professional photography.`,
        
        legal_framework: `Professional health and safety compliance office at ${companyName} showing UK HSE legal framework materials: safety law books on shelves, framed HSE compliance certificates on walls, Health and Safety at Work Act 1974 documents, risk assessment templates on computer screens, safety audit checklists, regulatory compliance folders. Modern office with professional safety manager at desk, safety documentation organized neatly. Corporate photography style, natural window lighting, sharp focus, executive office aesthetic.`,
        
        welcome: `Welcoming modern ${companyName} reception area with professional safety focus: clean lobby with company branding, safety welcome display showing "Safety First" messaging, visitor sign-in kiosk with safety induction information, wall-mounted safety achievement displays, professional receptionist greeting diverse visitors. Contemporary corporate interior with glass, steel, and wood elements, natural light from windows, plants, comfortable seating. Photorealistic commercial photography, bright and inviting atmosphere.`,
        
        safe_work: `Professional workplace showing proper safe work practices at ${companyName}: workers following correct procedures with equipment, proper ergonomic workstation setup, tool shadow boards with organized equipment, housekeeping excellence with clean organized workspace, workers using proper lifting techniques with assistance equipment, safety champions demonstrating best practices. Modern industrial facility with excellent lighting, safety posters visible, diverse workforce. Photorealistic, professional workplace photography, bright and clear.`,
        
        health_wellbeing: `Modern ${companyName} workplace wellness area showing health and wellbeing initiatives: ergonomic workstations with adjustable desks and chairs, proper computer monitor positioning, workers taking breaks in designated rest area with comfortable seating, hydration station with water dispensers, healthy snack options, mental health awareness posters, first aid trained staff identifiable, defibrillator station clearly marked. Contemporary corporate office environment, natural lighting, plants, calming colors. Professional photography, bright and positive atmosphere.`
      };

      // Use enhanced prompt or custom description
      const finalPrompt = enhancedPrompts[slideType as keyof typeof enhancedPrompts] 
        || `Professional photorealistic workplace safety scene: ${description}. Modern corporate environment at ${companyName} with proper lighting, diverse workforce, clean and organized setting. High-quality commercial photography, sharp focus, bright lighting, professional composition.`;

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
