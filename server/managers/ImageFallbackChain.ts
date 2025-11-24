/**
 * Image generation fallback chain for reliable image delivery
 * Priority: DALL-E 3 (production quality) -> Gemini -> SVG Fallback
 */

import { GoogleGenAI, Modality } from "@google/genai";
import type { IImageGenerator, ImageGenerationResult, Result } from '../interfaces/ai';
import { ResultUtils } from '../utils/result';
import { DallE3ImageGenerator } from './OpenAIImageGenerator';

// DON'T DELETE THIS COMMENT
// Upgraded to Gemini 3.0-flash for enhanced induction video image generation
// - Gemini 3.0-flash provides superior image quality and faster processing
// - Used as primary image generator for production induction content

// This API key is from Gemini Developer API Key, not vertex AI API Key
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export class GeminiImageGenerator implements IImageGenerator {
  async generate(
    slideType: string, 
    title: string, 
    description: string
  ): Promise<Result<ImageGenerationResult>> {
    try {
      // Build contextual prompt optimized for Gemini 3.0-flash high-quality image generation
      const geminiPrompt = `Create a professional, photorealistic workplace safety training image.

Title: ${title}
Scene: ${description}

QUALITY REQUIREMENTS:
✓ Ultra-realistic photographic quality (4K resolution equivalent)
✓ Modern corporate/industrial setting with authentic details
✓ Diverse workforce representation (varied ethnicities, genders, ages)
✓ Proper safety equipment aligned with UK HSE standards
✓ Clear safety signage and hazard markings visible
✓ Professional lighting with natural color accuracy
✓ Sharp focus, excellent detail clarity
✓ Contemporary workplace design and modern equipment
✓ Training-appropriate composition and framing

SAFETY FOCUS:
- If safety scenario: highlight proper/improper practices
- Include relevant PPE, guardrails, emergency equipment
- Show realistic workplace hazards and controls
- UK HSE compliance visible in setup

Generate a clear, professional safety training image suitable for UK workplace induction.`;

      // Use Gemini 2.0-flash for superior induction video image quality (currently available)
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash-image-generation",
        contents: [{ role: "user", parts: [{ text: geminiPrompt }] }],
        config: {
          responseModalities: [Modality.TEXT, Modality.IMAGE],
        },
      });

      const candidates = response.candidates;
      if (!candidates || candidates.length === 0) {
        throw new Error('No candidates returned from Gemini');
      }

      const content = candidates[0].content;
      if (!content || !content.parts) {
        throw new Error('No content parts returned from Gemini');
      }

      // Look for image data in the response
      let imageData: string = "";
      for (const part of content.parts) {
        if (part.inlineData && part.inlineData.data) {
          imageData = part.inlineData.data;
          break;
        }
      }

      if (!imageData) {
        throw new Error('No image data returned from Gemini');
      }

      // Convert base64 to data URL
      const url = `data:image/jpeg;base64,${imageData}`;

      return ResultUtils.success({
        url,
        meta: {
          model: "gemini-2.0-flash-image-generation",
          prompt: geminiPrompt,
          quality: "ultra_high",
          fallback: false
        }
      });

    } catch (error: any) {
      console.error('❌ Gemini image generation failed:', error.message);
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
      const uniqueId = Date.now();
      
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
      
      // Generate professional company-branded SVG with DETAILED TOPIC-SPECIFIC CONTENT
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
            <linearGradient id="contentGradient${uniqueId}" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:${this.lightenColor(primaryColor, 20)};stop-opacity:0.15" />
              <stop offset="100%" style="stop-color:${accentColor};stop-opacity:0.1" />
            </linearGradient>
          </defs>
          
          <!-- Professional Background with Gradient -->
          <rect width="100%" height="100%" fill="url(#bgGradient${uniqueId})" />
          
          <!-- Corporate Header Bar -->
          <rect x="0" y="0" width="100%" height="120" fill="url(#headerGradient${uniqueId})" />
          
          <!-- Company Name & Branding -->
          <text x="40" y="55" font-family="Arial, sans-serif" font-size="38" font-weight="bold" fill="white">
            ${companyNameEscaped}
          </text>
          <text x="40" y="90" font-family="Arial, sans-serif" font-size="22" fill="white" opacity="0.9">
            Health &amp; Safety Training
          </text>
          
          <!-- DETAILED TOPIC-SPECIFIC CONTENT AREA -->
          ${this.generateTopicContent(theme, primaryColor, accentColor, width, height)}
          
          <!-- Main Title -->
          <text x="896" y="180" font-family="Arial, sans-serif" font-size="56" font-weight="bold" 
                text-anchor="middle" fill="white">${titleEscaped}</text>
          
          <!-- Subtitle -->
          <text x="896" y="230" font-family="Arial, sans-serif" font-size="32" 
                text-anchor="middle" fill="white" opacity="0.95">${subtitleEscaped}</text>
          
          <!-- UK HSE Compliance Badge -->
          <rect x="1350" y="820" width="400" height="160" rx="15" fill="white" opacity="0.98" stroke="${primaryColor}" stroke-width="3" />
          <rect x="1370" y="835" width="360" height="35" rx="8" fill="${accentColor}" />
          <text x="1550" y="865" font-family="Arial, sans-serif" font-size="24" font-weight="bold" 
                text-anchor="middle" fill="white">UK HSE COMPLIANT</text>
          <text x="1550" y="910" font-family="Arial, sans-serif" font-size="16" font-weight="600" 
                text-anchor="middle" fill="${primaryColor}">${complianceEscaped}</text>
          <text x="1550" y="950" font-family="Arial, sans-serif" font-size="13" 
                text-anchor="middle" fill="${primaryColor}">Professional Training Program</text>
          
          <!-- Professional Border -->
          <rect x="15" y="15" width="${width-30}" height="${height-30}" fill="none" stroke="white" stroke-width="3" opacity="0.25" rx="10" />
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

  private generateTopicContent(theme: string, primaryColor: string, accentColor: string, width: number, height: number): string {
    // Generate detailed, topic-specific content for each slide
    const contentX = 200;
    const contentY = 300;
    const contentWidth = 1100;
    const contentHeight = 450;
    
    switch (theme) {
      case 'ppe':
        // PPE equipment display
        return `
          <!-- PPE Display Area -->
          <rect x="${contentX}" y="${contentY}" width="${contentWidth}" height="${contentHeight}" fill="url(#contentGradient)" rx="15" stroke="${primaryColor}" stroke-width="2" opacity="0.8" />
          <!-- Hard Hat -->
          <ellipse cx="400" cy="400" rx="50" ry="35" fill="${primaryColor}" stroke="white" stroke-width="2" />
          <ellipse cx="400" cy="405" rx="55" ry="15" fill="white" opacity="0.3" />
          <!-- Safety Vest -->
          <rect x="550" y="350" width="80" height="100" fill="#ffcc00" stroke="${primaryColor}" stroke-width="2" rx="5" />
          <rect x="555" y="355" width="70" height="90" fill="none" stroke="${accentColor}" stroke-width="1" />
          <line x1="560" y1="355" x2="620" y2="445" stroke="${accentColor}" stroke-width="2" opacity="0.6" />
          <line x1="620" y1="355" x2="560" y2="445" stroke="${accentColor}" stroke-width="2" opacity="0.6" />
          <!-- Safety Goggles -->
          <circle cx="750" cy="380" r="20" fill="none" stroke="${primaryColor}" stroke-width="3" />
          <circle cx="800" cy="380" r="20" fill="none" stroke="${primaryColor}" stroke-width="3" />
          <line x1="770" y1="380" x2="780" y2="380" stroke="${primaryColor}" stroke-width="2" />
          <!-- Safety Boots -->
          <rect x="900" y="420" width="35" height="50" fill="${primaryColor}" stroke="white" stroke-width="2" rx="3" />
          <rect x="945" y="420" width="35" height="50" fill="${primaryColor}" stroke="white" stroke-width="2" rx="3" />
          <ellipse cx="917" cy="475" rx="25" ry="10" fill="white" opacity="0.4" />
          <ellipse cx="962" cy="475" rx="25" ry="10" fill="white" opacity="0.4" />
          <!-- Labels -->
          <text x="400" y="470" font-family="Arial, sans-serif" font-size="14" font-weight="bold" text-anchor="middle" fill="white">Hard Hat</text>
          <text x="590" y="470" font-family="Arial, sans-serif" font-size="14" font-weight="bold" text-anchor="middle" fill="white">Hi-Vis Vest</text>
          <text x="775" y="470" font-family="Arial, sans-serif" font-size="14" font-weight="bold" text-anchor="middle" fill="white">Safety Goggles</text>
          <text x="920" y="510" font-family="Arial, sans-serif" font-size="14" font-weight="bold" text-anchor="middle" fill="white">Safety Boots</text>
        `;
      case 'emergency':
        // Emergency evacuation visualization
        return `
          <!-- Building Layout -->
          <rect x="${contentX}" y="${contentY}" width="${contentWidth}" height="${contentHeight}" fill="url(#contentGradient)" rx="15" stroke="${primaryColor}" stroke-width="2" opacity="0.8" />
          <!-- Building Floor -->
          <rect x="250" y="350" width="900" height="250" fill="white" opacity="0.15" stroke="${accentColor}" stroke-width="2" />
          <!-- Office Rooms -->
          <rect x="270" y="370" width="150" height="120" fill="none" stroke="${primaryColor}" stroke-width="2" />
          <rect x="450" y="370" width="150" height="120" fill="none" stroke="${primaryColor}" stroke-width="2" />
          <rect x="630" y="370" width="150" height="120" fill="none" stroke="${primaryColor}" stroke-width="2" />
          <rect x="810" y="370" width="150" height="120" fill="none" stroke="${primaryColor}" stroke-width="2" />
          <!-- Fire Exit Door -->
          <rect x="1050" y="350" width="80" height="100" fill="${accentColor}" stroke="white" stroke-width="3" />
          <text x="1090" y="415" font-family="Arial, sans-serif" font-size="16" font-weight="bold" text-anchor="middle" fill="white">EXIT</text>
          <!-- Emergency Lighting -->
          <circle cx="340" cy="370" r="8" fill="#ffff00" opacity="0.8" />
          <circle cx="520" cy="370" r="8" fill="#ffff00" opacity="0.8" />
          <circle cx="700" cy="370" r="8" fill="#ffff00" opacity="0.8" />
          <circle cx="880" cy="370" r="8" fill="#ffff00" opacity="0.8" />
          <!-- Assembly Point -->
          <circle cx="400" cy="600" r="40" fill="none" stroke="white" stroke-width="2" stroke-dasharray="5,5" />
          <text x="400" y="610" font-family="Arial, sans-serif" font-size="14" font-weight="bold" text-anchor="middle" fill="white">Assembly</text>
          <text x="400" y="628" font-family="Arial, sans-serif" font-size="12" text-anchor="middle" fill="white">Point</text>
          <!-- Evacuation Route Arrow -->
          <path d="M 700 430 Q 800 480 900 530" stroke="white" stroke-width="4" fill="none" stroke-linecap="round" />
          <polygon points="900,530 890,510 915,520" fill="white" />
        `;
      case 'welcome':
        // Welcome/orientation overview
        return `
          <!-- Welcome Banner -->
          <rect x="${contentX}" y="${contentY}" width="${contentWidth}" height="${contentHeight}" fill="url(#contentGradient)" rx="15" stroke="${primaryColor}" stroke-width="2" opacity="0.8" />
          <!-- Handshake Icon -->
          <ellipse cx="400" cy="420" rx="40" ry="50" fill="${primaryColor}" opacity="0.8" />
          <ellipse cx="550" cy="420" rx="40" ry="50" fill="${accentColor}" opacity="0.8" />
          <rect x="470" y="390" width="40" height="60" fill="white" opacity="0.7" rx="5" />
          <!-- Welcome Text Boxes -->
          <rect x="700" y="340" width="400" height="70" fill="white" opacity="0.15" stroke="${accentColor}" stroke-width="2" rx="5" />
          <text x="720" y="365" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="white">✓ Site Orientation</text>
          <text x="720" y="400" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="white">✓ Team Introduction</text>
          <!-- Checklist -->
          <circle cx="720" cy="460" r="6" fill="${accentColor}" />
          <text x="740" y="465" font-family="Arial, sans-serif" font-size="14" fill="white">Review company policies</text>
          <circle cx="720" cy="495" r="6" fill="${accentColor}" />
          <text x="740" y="500" font-family="Arial, sans-serif" font-size="14" fill="white">Understand local procedures</text>
          <circle cx="720" cy="530" r="6" fill="${accentColor}" />
          <text x="740" y="535" font-family="Arial, sans-serif" font-size="14" fill="white">Meet your safety team</text>
        `;
      case 'hazard':
        // Hazard identification visualization
        return `
          <!-- Hazard Area -->
          <rect x="${contentX}" y="${contentY}" width="${contentWidth}" height="${contentHeight}" fill="url(#contentGradient)" rx="15" stroke="${primaryColor}" stroke-width="2" opacity="0.8" />
          <!-- Hazard Warning Triangle -->
          <path d="M 400 350 L 480 520 L 320 520 Z" fill="${accentColor}" stroke="white" stroke-width="3" opacity="0.9" />
          <text x="400" y="445" font-family="Arial, sans-serif" font-size="48" font-weight="bold" text-anchor="middle" fill="white">!</text>
          <!-- Hazard Examples -->
          <circle cx="600" cy="380" r="35" fill="none" stroke="${accentColor}" stroke-width="2" />
          <text x="600" y="385" font-family="Arial, sans-serif" font-size="20" text-anchor="middle" fill="white">⚡</text>
          <text x="600" y="430" font-family="Arial, sans-serif" font-size="12" text-anchor="middle" fill="white">Electrical</text>
          <circle cx="750" cy="380" r="35" fill="none" stroke="${accentColor}" stroke-width="2" />
          <text x="750" y="385" font-family="Arial, sans-serif" font-size="20" text-anchor="middle" fill="white">☠</text>
          <text x="750" y="430" font-family="Arial, sans-serif" font-size="12" text-anchor="middle" fill="white">Chemical</text>
          <circle cx="900" cy="380" r="35" fill="none" stroke="${accentColor}" stroke-width="2" />
          <text x="900" y="390" font-family="Arial, sans-serif" font-size="20" text-anchor="middle" fill="white">⚙</text>
          <text x="900" y="430" font-family="Arial, sans-serif" font-size="12" text-anchor="middle" fill="white">Machinery</text>
          <!-- Control Measures -->
          <rect x="570" y="480" width="300" height="60" fill="white" opacity="0.15" stroke="${primaryColor}" stroke-width="2" rx="5" />
          <text x="590" y="505" font-family="Arial, sans-serif" font-size="13" fill="white">CONTROL: Eliminate → Substitute</text>
          <text x="590" y="530" font-family="Arial, sans-serif" font-size="13" fill="white">→ Engineering → Administrative → PPE</text>
        `;
      case 'legal':
        // Legal framework/regulations
        return `
          <!-- Regulation Document -->
          <rect x="${contentX}" y="${contentY}" width="${contentWidth}" height="${contentHeight}" fill="url(#contentGradient)" rx="15" stroke="${primaryColor}" stroke-width="2" opacity="0.8" />
          <!-- Main Document -->
          <rect x="350" y="340" width="200" height="280" fill="white" opacity="0.2" stroke="${primaryColor}" stroke-width="2" rx="5" />
          <rect x="360" y="355" width="180" height="20" fill="${accentColor}" opacity="0.6" />
          <text x="450" y="370" font-family="Arial, sans-serif" font-size="14" font-weight="bold" text-anchor="middle" fill="white">HEALTH &amp;</text>
          <text x="450" y="388" font-family="Arial, sans-serif" font-size="14" font-weight="bold" text-anchor="middle" fill="white">SAFETY ACT 1974</text>
          <!-- Regulation Lines -->
          <line x1="365" y1="400" x2="525" y2="400" stroke="${primaryColor}" stroke-width="1" opacity="0.5" />
          <line x1="365" y1="415" x2="520" y2="415" stroke="${primaryColor}" stroke-width="1" opacity="0.5" />
          <line x1="365" y1="430" x2="525" y2="430" stroke="${primaryColor}" stroke-width="1" opacity="0.5" />
          <line x1="365" y1="445" x2="510" y2="445" stroke="${primaryColor}" stroke-width="1" opacity="0.5" />
          <!-- Regulations List -->
          <text x="650" y="370" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="white">Key Regulations:</text>
          <text x="650" y="400" font-family="Arial, sans-serif" font-size="12" fill="white">✓ HASAWA 1974</text>
          <text x="650" y="425" font-family="Arial, sans-serif" font-size="12" fill="white">✓ Management Regs 1999</text>
          <text x="650" y="450" font-family="Arial, sans-serif" font-size="12" fill="white">✓ CDM Regulations 2015</text>
          <text x="650" y="475" font-family="Arial, sans-serif" font-size="12" fill="white">✓ RIDDOR 2013</text>
          <text x="650" y="500" font-family="Arial, sans-serif" font-size="12" fill="white">✓ Fire Safety Regs 2005</text>
          <text x="650" y="525" font-family="Arial, sans-serif" font-size="12" fill="white">✓ COSHH Regulations</text>
          <!-- Compliance Badge -->
          <circle cx="950" cy="450" r="50" fill="${primaryColor}" opacity="0.7" stroke="white" stroke-width="2" />
          <text x="950" y="450" font-family="Arial, sans-serif" font-size="28" font-weight="bold" text-anchor="middle" fill="white">✓</text>
          <text x="950" y="520" font-family="Arial, sans-serif" font-size="13" text-anchor="middle" fill="white">Fully</text>
          <text x="950" y="538" font-family="Arial, sans-serif" font-size="13" text-anchor="middle" fill="white">Compliant</text>
        `;
      default:
        // General safety overview
        return `
          <!-- General Safety Overview -->
          <rect x="${contentX}" y="${contentY}" width="${contentWidth}" height="${contentHeight}" fill="url(#contentGradient)" rx="15" stroke="${primaryColor}" stroke-width="2" opacity="0.8" />
          <circle cx="500" cy="430" r="80" fill="${primaryColor}" opacity="0.6" stroke="white" stroke-width="2" />
          <text x="500" y="450" font-family="Arial, sans-serif" font-size="48" text-anchor="middle" fill="white">🛡</text>
          <text x="500" y="530" font-family="Arial, sans-serif" font-size="16" font-weight="bold" text-anchor="middle" fill="white">Safety First</text>
          <!-- Information Points -->
          <rect x="700" y="350" width="300" height="60" fill="white" opacity="0.15" stroke="${accentColor}" stroke-width="1" rx="5" />
          <text x="720" y="378" font-family="Arial, sans-serif" font-size="14" fill="white">✓ Mandatory induction</text>
          <text x="720" y="402" font-family="Arial, sans-serif" font-size="14" fill="white">✓ Completion required</text>
          <rect x="700" y="430" width="300" height="60" fill="white" opacity="0.15" stroke="${accentColor}" stroke-width="1" rx="5" />
          <text x="720" y="458" font-family="Arial, sans-serif" font-size="14" fill="white">✓ Ask questions anytime</text>
          <text x="720" y="482" font-family="Arial, sans-serif" font-size="14" fill="white">✓ Your safety matters</text>
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
    new DallE3ImageGenerator(this.companySettings), // PRODUCTION QUALITY - Try first
    new GeminiImageGenerator(),                       // Fallback to Gemini
    new FallbackSvgImageGenerator(this.companySettings) // Final fallback
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