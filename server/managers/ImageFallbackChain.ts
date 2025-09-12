/**
 * Image generation fallback chain for reliable image delivery
 */

import OpenAI from "openai";
import type { IImageGenerator, ImageGenerationResult, Result } from '../interfaces/ai';
import { ResultUtils } from '../utils/result';

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  organization: null,
  project: null
});

export class OpenAIImageGenerator implements IImageGenerator {
  async generate(
    slideType: string, 
    title: string, 
    description: string
  ): Promise<Result<ImageGenerationResult>> {
    try {
      const prompts = {
        ppe: "Professional workplace safety scene showing workers wearing complete PPE (hard hat, high-visibility vest, safety boots, safety glasses, work gloves) in a modern industrial setting. Clean, well-lit environment with safety signage visible. Photorealistic style with bright lighting showing proper safety compliance.",
        emergency: "Emergency evacuation scene in a modern workplace showing clearly marked emergency exits, fire alarm points, and assembly point signs. Workers calmly following evacuation procedures. Bright, clear lighting with visible safety equipment like fire extinguishers and first aid stations.",
        hazard: "Workplace hazard identification scene showing various safety hazards properly marked with warning signs, barriers, and safety equipment. Industrial setting with clear hazard markings, safety cones, warning tape, and protective equipment. Professional safety training environment.",
        site_rules: "Modern workplace showing safety rules and regulations prominently displayed on notice boards and digital screens. Professional office or industrial environment with visible safety policies, procedures, and compliance documentation. Clean, organized workspace demonstrating safety culture.",
        legal_framework: "Professional health and safety compliance scene showing safety documentation, legal frameworks, and regulatory compliance materials in a modern office setting. Safety certificates, compliance checklists, and regulatory documentation prominently displayed."
      };

      const dallePrompt = prompts[slideType as keyof typeof prompts] || prompts.ppe;

      const response = await openai.images.generate({
        model: "dall-e-3",
        prompt: dallePrompt,
        n: 1,
        size: "1792x1024",
        quality: "hd",
        style: "natural"
      });

      const url = response.data?.[0]?.url;
      if (!url) {
        throw new Error('No image URL returned from DALL-E');
      }

      return ResultUtils.success({
        url,
        meta: {
          model: "dall-e-3",
          prompt: dallePrompt,
          fallback: false
        }
      });

    } catch (error: any) {
      console.error('❌ OpenAI image generation failed:', error.message);
      return ResultUtils.error(error);
    }
  }
}

export class FallbackSvgImageGenerator implements IImageGenerator {
  async generate(
    slideType: string, 
    title: string, 
    description: string
  ): Promise<Result<ImageGenerationResult>> {
    try {
      const width = 1792;
      const height = 1024;
      
      // Determine the safety theme based on slideType
      let theme = 'general';
      let bgColor = '#1a365d'; // Professional blue
      let accentColor = '#ed8936'; // Safety orange
      let titleText = 'Safety First';
      
      if (slideType.toLowerCase().includes('ppe') || slideType.toLowerCase().includes('personal protective')) {
        theme = 'ppe';
        titleText = 'Personal Protective Equipment';
      } else if (slideType.toLowerCase().includes('emergency') || slideType.toLowerCase().includes('evacuation')) {
        theme = 'emergency';
        titleText = 'Emergency Procedures';
        bgColor = '#c53030'; // Emergency red
      } else if (slideType.toLowerCase().includes('welcome') || slideType.toLowerCase().includes('introduction')) {
        theme = 'welcome';
        titleText = 'Welcome & Safety Orientation';
      }

      // Escape text content for SVG safety
      const escapeXml = (text: string) => text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

      const titleEscaped = escapeXml(titleText);
      const uniqueId = Date.now(); // Unique ID for SVG elements
      
      const safeSvg = `<?xml version="1.0" encoding="UTF-8"?>
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
          <defs>
            <linearGradient id="bgGradient${uniqueId}" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:${bgColor};stop-opacity:1" />
              <stop offset="100%" style="stop-color:${this.darkenColor(bgColor, 20)};stop-opacity:1" />
            </linearGradient>
            <linearGradient id="accentGradient${uniqueId}" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style="stop-color:${accentColor};stop-opacity:1" />
              <stop offset="100%" style="stop-color:${this.lightenColor(accentColor, 20)};stop-opacity:1" />
            </linearGradient>
          </defs>
          
          <!-- Background -->
          <rect width="100%" height="100%" fill="url(#bgGradient${uniqueId})" />
          
          <!-- Company Branding Bar -->
          <rect x="0" y="0" width="100%" height="120" fill="url(#accentGradient${uniqueId})" opacity="0.9" />
          
          <!-- Company Name -->
          <text x="80" y="75" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="white">
            Professional Safety Training
          </text>
          
          <!-- Main Icon Circle -->
          <circle cx="${width/2}" cy="${height/2 - 50}" r="150" fill="white" opacity="0.9" stroke="${bgColor}" stroke-width="8" />
          
          <!-- Vector Icon -->
          ${this.getSafetyVectorIcon(theme, width/2, height/2 - 50, bgColor)}
          
          <!-- Title -->
          <text x="${width/2}" y="${height/2 + 120}" font-family="Arial, sans-serif" font-size="64" font-weight="bold" 
                text-anchor="middle" fill="white">${titleEscaped}</text>
          
          <!-- Professional Badge -->
          <rect x="${width - 300}" y="${height - 150}" width="250" height="100" rx="10" fill="white" opacity="0.9" stroke="${bgColor}" stroke-width="2" />
          <text x="${width - 175}" y="${height - 110}" font-family="Arial, sans-serif" font-size="24" font-weight="bold" 
                text-anchor="middle" fill="${bgColor}">Professional</text>
          <text x="${width - 175}" y="${height - 80}" font-family="Arial, sans-serif" font-size="24" font-weight="bold" 
                text-anchor="middle" fill="${bgColor}">Safety Training</text>
          
          <!-- Safety Pattern -->
          <pattern id="safetyStripes${uniqueId}" patternUnits="userSpaceOnUse" width="40" height="40">
            <rect width="40" height="40" fill="${accentColor}" opacity="0.1" />
            <rect x="0" y="0" width="20" height="20" fill="white" opacity="0.1" />
            <rect x="20" y="20" width="20" height="20" fill="white" opacity="0.1" />
          </pattern>
          <rect x="0" y="${height - 60}" width="100%" height="60" fill="url(#safetyStripes${uniqueId})" />
        </svg>`;

      // Convert to proper data URL that browsers can use
      const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(safeSvg)}`;
      
      console.log(`✅ Generated fallback safety image for theme: ${theme}`);
      
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
      console.error('❌ Fallback SVG generation failed:', error.message);
      return ResultUtils.error(error);
    }
  }

  private darkenColor(hex: string, percent: number): string {
    const num = parseInt(hex.replace("#", ""), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) - amt;
    const G = (num >> 8 & 0x00FF) - amt;
    const B = (num & 0x0000FF) - amt;
    return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 + 
                  (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 + 
                  (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
  }

  private lightenColor(hex: string, percent: number): string {
    const num = parseInt(hex.replace("#", ""), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return "#" + (0x1000000 + (R > 255 ? 255 : R) * 0x10000 + 
                  (G > 255 ? 255 : G) * 0x100 + 
                  (B > 255 ? 255 : B)).toString(16).slice(1);
  }

  private getSafetyVectorIcon(theme: string, centerX: number, centerY: number, color: string): string {
    switch (theme) {
      case 'ppe':
        return `
          <!-- Hard Hat Icon -->
          <path d="M ${centerX-60} ${centerY-20} Q ${centerX-60} ${centerY-60} ${centerX} ${centerY-60} Q ${centerX+60} ${centerY-60} ${centerX+60} ${centerY-20} 
                   L ${centerX+50} ${centerY+20} Q ${centerX+50} ${centerY+40} ${centerX} ${centerY+40} Q ${centerX-50} ${centerY+40} ${centerX-50} ${centerY+20} Z" 
                fill="${color}" stroke="white" stroke-width="3" />
          <rect x="${centerX-70}" y="${centerY+20}" width="140" height="20" rx="10" fill="${color}" stroke="white" stroke-width="2" />
        `;
      case 'emergency':
        return `
          <!-- Emergency Exit Icon -->
          <rect x="${centerX-80}" y="${centerY-60}" width="160" height="120" rx="10" fill="none" stroke="${color}" stroke-width="8" />
          <path d="M ${centerX-40} ${centerY-20} L ${centerX+20} ${centerY-20} L ${centerX+10} ${centerY-40} L ${centerX+40} ${centerY} L ${centerX+10} ${centerY+40} 
                   L ${centerX+20} ${centerY+20} L ${centerX-40} ${centerY+20} Z" fill="${color}" />
          <rect x="${centerX-60}" y="${centerY-10}" width="40" height="20" fill="${color}" />
        `;
      case 'welcome':
        return `
          <!-- Handshake Icon -->
          <path d="M ${centerX-60} ${centerY-30} Q ${centerX-80} ${centerY-50} ${centerX-60} ${centerY-70} Q ${centerX-40} ${centerY-50} ${centerX-20} ${centerY-30} 
                   Q ${centerX} ${centerY-50} ${centerX+20} ${centerY-30} Q ${centerX+40} ${centerY-50} ${centerX+60} ${centerY-70} Q ${centerX+80} ${centerY-50} ${centerX+60} ${centerY-30}
                   L ${centerX+40} ${centerY+10} Q ${centerX+20} ${centerY+30} ${centerX} ${centerY+10} Q ${centerX-20} ${centerY+30} ${centerX-40} ${centerY+10} Z" 
                fill="${color}" stroke="white" stroke-width="3" />
        `;
      default:
        return `
          <!-- Shield Icon -->
          <path d="M ${centerX} ${centerY-70} L ${centerX-50} ${centerY-50} L ${centerX-50} ${centerY+20} Q ${centerX-50} ${centerY+60} ${centerX} ${centerY+70} 
                   Q ${centerX+50} ${centerY+60} ${centerX+50} ${centerY+20} L ${centerX+50} ${centerY-50} Z" 
                fill="${color}" stroke="white" stroke-width="4" />
          <text x="${centerX}" y="${centerY+10}" font-family="Arial, sans-serif" font-size="36" font-weight="bold" 
                text-anchor="middle" fill="white">✓</text>
        `;
    }
  }
}

export class ImageFallbackChain implements IImageGenerator {
  private generators: IImageGenerator[] = [
    new OpenAIImageGenerator(),
    new FallbackSvgImageGenerator()
  ];

  async generate(
    slideType: string, 
    title: string, 
    description: string
  ): Promise<Result<ImageGenerationResult>> {
    for (let i = 0; i < this.generators.length; i++) {
      const generator = this.generators[i];
      console.log(`🖼️ Trying image generator ${i + 1}/${this.generators.length}...`);
      
      const result = await generator.generate(slideType, title, description);
      
      if (ResultUtils.isSuccess(result)) {
        console.log(`✅ Image generated successfully with generator ${i + 1}`);
        return result;
      }

      console.log(`⚠️ Generator ${i + 1} failed: ${result.error?.message}`);
    }

    return ResultUtils.error(new Error('All image generators failed'));
  }
}