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
  constructor(private companySettings?: any) {}

  async generate(
    slideType: string, 
    title: string, 
    description: string
  ): Promise<Result<ImageGenerationResult>> {
    try {
      const width = 1792;
      const height = 1024;
      
      // Use company branding colors and information
      const companyName = this.companySettings?.companyName || 'Professional Safety Training';
      const logoUrl = this.companySettings?.logoUrl;
      const bgColor = this.companySettings?.backgroundColor || '#1a365d';
      const accentColor = this.companySettings?.accentColor || '#ed8936';
      const primaryColor = this.companySettings?.primaryColor || '#2563eb';
      
      // Determine the safety theme and content based on slideType
      let theme = 'general';
      let titleText = 'Safety First';
      let subtitleText = 'Health & Safety Induction';
      let complianceText = 'UK HSE Compliant Training';
      
      if (slideType.toLowerCase().includes('ppe') || slideType.toLowerCase().includes('personal protective')) {
        theme = 'ppe';
        titleText = 'Personal Protective Equipment';
        subtitleText = 'PPE Requirements & Safety Standards';
        complianceText = 'Mandatory PPE Compliance - UK HSE Regulations';
      } else if (slideType.toLowerCase().includes('emergency') || slideType.toLowerCase().includes('evacuation')) {
        theme = 'emergency';
        titleText = 'Emergency Procedures';
        subtitleText = 'Evacuation & Emergency Response';
        complianceText = 'Emergency Response - UK Fire Safety Regulations';
      } else if (slideType.toLowerCase().includes('welcome') || slideType.toLowerCase().includes('introduction')) {
        theme = 'welcome';
        titleText = 'Welcome & Safety Orientation';
        subtitleText = `Welcome to ${companyName}`;
        complianceText = 'Workplace Safety Induction - UK HSE Compliant';
      } else if (slideType.toLowerCase().includes('hazard')) {
        theme = 'hazard';
        titleText = 'Hazard Identification';
        subtitleText = 'Risk Assessment & Hazard Control';
        complianceText = 'HASAWA 1974 & Management Regulations 1999';
      } else if (slideType.toLowerCase().includes('legal') || slideType.toLowerCase().includes('framework')) {
        theme = 'legal';
        titleText = 'Legal Framework';
        subtitleText = 'Health & Safety Legal Requirements';
        complianceText = 'UK Health & Safety Executive Guidelines';
      }

      // Escape text content for SVG safety
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
      const uniqueId = Date.now(); // Unique ID for SVG elements
      
      // Generate professional company-branded SVG
      const safeSvg = `<?xml version="1.0" encoding="UTF-8"?>
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${width} ${height}">
          <defs>
            <linearGradient id="bgGradient${uniqueId}" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:${bgColor};stop-opacity:1" />
              <stop offset="100%" style="stop-color:${this.darkenColor(bgColor, 30)};stop-opacity:1" />
            </linearGradient>
            <linearGradient id="headerGradient${uniqueId}" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style="stop-color:${primaryColor};stop-opacity:0.95" />
              <stop offset="100%" style="stop-color:${accentColor};stop-opacity:0.95" />
            </linearGradient>
            <linearGradient id="iconGradient${uniqueId}" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:${primaryColor};stop-opacity:1" />
              <stop offset="100%" style="stop-color:${this.darkenColor(primaryColor, 20)};stop-opacity:1" />
            </linearGradient>
          </defs>
          
          <!-- Professional Background with Gradient -->
          <rect width="100%" height="100%" fill="url(#bgGradient${uniqueId})" />
          
          <!-- Corporate Header Bar -->
          <rect x="0" y="0" width="100%" height="140" fill="url(#headerGradient${uniqueId})" />
          
          <!-- Company Logo Area (if logo available) -->
          ${logoUrl ? this.generateLogoPlaceholder(logoUrl, uniqueId) : ''}
          
          <!-- Company Name & Branding -->
          <text x="40" y="60" font-family="Arial, sans-serif" font-size="42" font-weight="bold" fill="white">
            ${companyNameEscaped}
          </text>
          <text x="40" y="100" font-family="Arial, sans-serif" font-size="28" fill="white" opacity="0.9">
            Health &amp; Safety Training
          </text>
          
          <!-- Professional Safety Icon Background -->
          <circle cx="${width/2}" cy="${height/2 - 30}" r="180" fill="white" opacity="0.95" stroke="${primaryColor}" stroke-width="6" />
          <circle cx="${width/2}" cy="${height/2 - 30}" r="160" fill="none" stroke="${accentColor}" stroke-width="3" opacity="0.7" />
          
          <!-- Safety Vector Icon -->
          ${this.getEnhancedSafetyIcon(theme, width/2, height/2 - 30, primaryColor, accentColor)}
          
          <!-- Main Title -->
          <text x="${width/2}" y="${height/2 + 180}" font-family="Arial, sans-serif" font-size="68" font-weight="bold" 
                text-anchor="middle" fill="white" stroke="${primaryColor}" stroke-width="1">${titleEscaped}</text>
          
          <!-- Subtitle -->
          <text x="${width/2}" y="${height/2 + 230}" font-family="Arial, sans-serif" font-size="36" 
                text-anchor="middle" fill="white" opacity="0.9">${subtitleEscaped}</text>
          
          <!-- UK HSE Compliance Badge -->
          <rect x="${width - 380}" y="${height - 180}" width="340" height="140" rx="15" fill="white" opacity="0.95" stroke="${primaryColor}" stroke-width="3" />
          <rect x="${width - 360}" y="${height - 160}" width="300" height="30" rx="8" fill="${accentColor}" />
          <text x="${width - 210}" y="${height - 140}" font-family="Arial, sans-serif" font-size="20" font-weight="bold" 
                text-anchor="middle" fill="white">UK HSE COMPLIANT</text>
          <text x="${width - 210}" y="${height - 105}" font-family="Arial, sans-serif" font-size="18" font-weight="600" 
                text-anchor="middle" fill="${primaryColor}">${complianceEscaped}</text>
          <text x="${width - 210}" y="${height - 75}" font-family="Arial, sans-serif" font-size="16" 
                text-anchor="middle" fill="${primaryColor}">Professional Safety Training</text>
          <text x="${width - 210}" y="${height - 55}" font-family="Arial, sans-serif" font-size="14" 
                text-anchor="middle" fill="${primaryColor}" opacity="0.8">Workplace Safety Regulations</text>
          
          <!-- Professional Safety Pattern -->
          <pattern id="safetyPattern${uniqueId}" patternUnits="userSpaceOnUse" width="60" height="60">
            <rect width="60" height="60" fill="${accentColor}" opacity="0.05" />
            <circle cx="30" cy="30" r="2" fill="${primaryColor}" opacity="0.15" />
            <rect x="10" y="10" width="40" height="2" fill="${primaryColor}" opacity="0.1" />
            <rect x="10" y="48" width="40" height="2" fill="${primaryColor}" opacity="0.1" />
          </pattern>
          <rect x="0" y="${height - 80}" width="100%" height="80" fill="url(#safetyPattern${uniqueId})" />
          
          <!-- Professional Border Frame -->
          <rect x="10" y="10" width="${width-20}" height="${height-20}" fill="none" stroke="white" stroke-width="3" opacity="0.3" rx="10" />
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

  private generateLogoPlaceholder(logoUrl: string, uniqueId: number): string {
    // Generate a placeholder for company logo - in a real implementation, 
    // you would fetch and embed the actual logo, but for now we create a branded placeholder
    return `
      <!-- Company Logo Placeholder -->
      <rect x="${1792 - 200}" y="20" width="160" height="80" rx="8" fill="white" opacity="0.9" stroke="#2563eb" stroke-width="2" />
      <text x="${1792 - 120}" y="50" font-family="Arial, sans-serif" font-size="14" font-weight="bold" 
            text-anchor="middle" fill="#2563eb">COMPANY</text>
      <text x="${1792 - 120}" y="70" font-family="Arial, sans-serif" font-size="14" font-weight="bold" 
            text-anchor="middle" fill="#2563eb">LOGO</text>
    `;
  }

  private getEnhancedSafetyIcon(theme: string, centerX: number, centerY: number, primaryColor: string, accentColor: string): string {
    switch (theme) {
      case 'ppe':
        return `
          <!-- Enhanced PPE Hard Hat Icon -->
          <ellipse cx="${centerX}" cy="${centerY - 20}" rx="80" ry="50" fill="${primaryColor}" stroke="white" stroke-width="4" />
          <rect x="${centerX - 90}" y="${centerY + 10}" width="180" height="25" rx="12" fill="${accentColor}" stroke="white" stroke-width="3" />
          <circle cx="${centerX - 40}" cy="${centerY - 20}" r="8" fill="white" />
          <circle cx="${centerX + 40}" cy="${centerY - 20}" r="8" fill="white" />
          <path d="M ${centerX - 60} ${centerY + 40} Q ${centerX} ${centerY + 60} ${centerX + 60} ${centerY + 40}" 
                stroke="${primaryColor}" stroke-width="6" fill="none" />
        `;
      case 'emergency':
        return `
          <!-- Enhanced Emergency Exit Icon -->
          <rect x="${centerX - 90}" y="${centerY - 70}" width="180" height="140" rx="15" fill="none" stroke="${primaryColor}" stroke-width="8" />
          <path d="M ${centerX - 60} ${centerY - 30} L ${centerX + 30} ${centerY - 30} L ${centerX + 15} ${centerY - 55} 
                   L ${centerX + 60} ${centerY} L ${centerX + 15} ${centerY + 55} L ${centerX + 30} ${centerY + 30} 
                   L ${centerX - 60} ${centerY + 30} Z" fill="${accentColor}" stroke="white" stroke-width="2" />
          <rect x="${centerX - 80}" y="${centerY - 15}" width="50" height="30" fill="${primaryColor}" />
          <text x="${centerX}" y="${centerY + 90}" font-family="Arial, sans-serif" font-size="20" font-weight="bold" 
                text-anchor="middle" fill="${primaryColor}">EXIT</text>
        `;
      case 'welcome':
        return `
          <!-- Enhanced Welcome Handshake Icon -->
          <ellipse cx="${centerX - 30}" cy="${centerY - 10}" rx="35" ry="25" fill="${primaryColor}" stroke="white" stroke-width="3" />
          <ellipse cx="${centerX + 30}" cy="${centerY - 10}" rx="35" ry="25" fill="${accentColor}" stroke="white" stroke-width="3" />
          <rect x="${centerX - 15}" y="${centerY - 35}" width="30" height="70" rx="15" fill="white" stroke="${primaryColor}" stroke-width="3" />
          <circle cx="${centerX}" cy="${centerY + 50}" r="25" fill="${primaryColor}" opacity="0.3" />
          <text x="${centerX}" y="${centerY + 90}" font-family="Arial, sans-serif" font-size="18" font-weight="bold" 
                text-anchor="middle" fill="${primaryColor}">WELCOME</text>
        `;
      case 'hazard':
        return `
          <!-- Enhanced Hazard Warning Icon -->
          <path d="M ${centerX} ${centerY - 80} L ${centerX - 70} ${centerY + 60} L ${centerX + 70} ${centerY + 60} Z" 
                fill="${accentColor}" stroke="${primaryColor}" stroke-width="6" />
          <circle cx="${centerX}" cy="${centerY - 10}" r="8" fill="${primaryColor}" />
          <rect x="${centerX - 4}" y="${centerY + 10}" width="8" height="30" fill="${primaryColor}" />
          <text x="${centerX}" y="${centerY + 90}" font-family="Arial, sans-serif" font-size="18" font-weight="bold" 
                text-anchor="middle" fill="${primaryColor}">HAZARD</text>
        `;
      case 'legal':
        return `
          <!-- Enhanced Legal Framework Icon -->
          <rect x="${centerX - 60}" y="${centerY - 70}" width="120" height="140" rx="10" fill="white" stroke="${primaryColor}" stroke-width="4" />
          <rect x="${centerX - 50}" y="${centerY - 60}" width="100" height="8" fill="${primaryColor}" />
          <rect x="${centerX - 50}" y="${centerY - 40}" width="80" height="6" fill="${accentColor}" />
          <rect x="${centerX - 50}" y="${centerY - 25}" width="90" height="6" fill="${accentColor}" />
          <rect x="${centerX - 50}" y="${centerY - 10}" width="70" height="6" fill="${accentColor}" />
          <rect x="${centerX - 50}" y="${centerY + 5}" width="85" height="6" fill="${accentColor}" />
          <circle cx="${centerX - 35}" cy="${centerY + 35}" r="15" fill="${primaryColor}" />
          <text x="${centerX - 35}" y="${centerY + 42}" font-family="Arial, sans-serif" font-size="16" font-weight="bold" 
                text-anchor="middle" fill="white">§</text>
        `;
      default:
        return `
          <!-- Enhanced Shield Icon -->
          <path d="M ${centerX} ${centerY - 80} L ${centerX - 70} ${centerY - 50} L ${centerX - 70} ${centerY + 30} 
                   Q ${centerX - 70} ${centerY + 80} ${centerX} ${centerY + 90} Q ${centerX + 70} ${centerY + 80} ${centerX + 70} ${centerY + 30} 
                   L ${centerX + 70} ${centerY - 50} Z" 
                fill="url(#iconGradient${Date.now()})" stroke="white" stroke-width="6" />
          <circle cx="${centerX}" cy="${centerY}" r="35" fill="white" />
          <path d="M ${centerX - 20} ${centerY - 5} L ${centerX - 8} ${centerY + 15} L ${centerX + 25} ${centerY - 15}" 
                stroke="${primaryColor}" stroke-width="8" stroke-linecap="round" fill="none" />
        `;
    }
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
  constructor(private companySettings?: any) {}

  private generators: IImageGenerator[] = [
    new OpenAIImageGenerator(),
    new FallbackSvgImageGenerator(this.companySettings)
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