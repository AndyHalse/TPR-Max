/**
 * OpenAI Text-to-Speech Service for Professional Narration
 * Generates high-quality audio narration for induction videos
 */

import OpenAI from "openai";
import { Readable } from "stream";
import { Buffer } from "buffer";
import { logger } from '../utils/logger';

// Using Replit's AI Integrations service — same key/base-URL as videoGenerationService.ts
// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

export interface NarrationOptions {
  voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  speed?: number; // 0.25 to 4.0
  model?: 'tts-1' | 'tts-1-hd';
}

export interface NarrationResult {
  audioUrl: string; // Base64 data URL
  audioBuffer?: Buffer;
  duration?: number;
  text: string;
}

export class OpenAITTSService {
  
  /**
   * Generate professional narration audio from text
   * @param text - Text to convert to speech
   * @param options - Voice and generation options
   * @returns Audio data URL and metadata
   */
  async generateNarration(
    text: string, 
    options: NarrationOptions = {}
  ): Promise<NarrationResult> {
    try {
      const {
        voice = 'nova', // Professional female voice - clear and engaging
        speed = 1.0,
        model = 'tts-1-hd' // HD quality for production
      } = options;

      logger.info(`🎤 Generating professional narration with voice: ${voice}`);
      logger.info(`📝 Text length: ${text.length} characters`);

      // Generate speech using OpenAI TTS
      const mp3Response = await openai.audio.speech.create({
        model,
        voice,
        input: text,
        speed,
        response_format: "mp3"
      });

      // Convert response to buffer
      const buffer = Buffer.from(await mp3Response.arrayBuffer());
      
      // Convert to base64 data URL
      const base64Audio = buffer.toString('base64');
      const audioUrl = `data:audio/mpeg;base64,${base64Audio}`;

      // Estimate duration (rough estimate: 150 words per minute average speech)
      const wordCount = text.split(/\s+/).length;
      const estimatedDuration = Math.ceil((wordCount / 150) * 60); // seconds

      logger.info(`✅ Narration generated successfully`);
      logger.info(`⏱️ Estimated duration: ${estimatedDuration} seconds`);

      return {
        audioUrl,
        audioBuffer: buffer,
        duration: estimatedDuration,
        text
      };

    } catch (error: any) {
      logger.error('❌ OpenAI TTS generation failed:', error.message);
      
      if (error.response?.status === 400) {
        logger.error('❌ Bad request - text may be too long or contain invalid characters');
      } else if (error.response?.status === 429) {
        logger.error('❌ Rate limit exceeded');
      }
      
      throw error;
    }
  }

  /**
   * Generate narration for multiple scenes with optimal voice selection
   * @param scenes - Array of scenes with text content
   * @param roleType - Type of role (visitor, staff, contractor)
   * @returns Array of narration results
   */
  async generateSceneNarrations(
    scenes: Array<{ title: string; content: string; duration?: number }>,
    roleType: string = 'contractor'
  ): Promise<NarrationResult[]> {
    logger.info(`🎬 Generating narrations for ${scenes.length} scenes`);

    // Select optimal voice based on role type
    const voiceMap = {
      visitor: 'nova' as const,      // Welcoming, professional female voice
      staff: 'onyx' as const,        // Professional, authoritative male voice  
      contractor: 'fable' as const   // Clear, instructional British-style voice
    };

    const selectedVoice = voiceMap[roleType as keyof typeof voiceMap] || 'nova';
    
    const narrations: NarrationResult[] = [];

    for (const scene of scenes) {
      try {
        const narration = await this.generateNarration(scene.content, {
          voice: selectedVoice,
          speed: 1.0,
          model: 'tts-1-hd'
        });
        
        narrations.push(narration);
      } catch (error) {
        logger.error(`❌ Failed to generate narration for scene: ${scene.title}`);
        // Add placeholder for failed narration
        narrations.push({
          audioUrl: '',
          text: scene.content,
          duration: scene.duration || 0
        });
      }
    }

    logger.info(`✅ Generated ${narrations.length} scene narrations`);
    return narrations;
  }

  /**
   * Generate full script narration with chapter markers
   * @param fullScript - Complete induction script
   * @param roleType - Type of role
   * @returns Full narration result
   */
  async generateFullScriptNarration(
    fullScript: string,
    roleType: string = 'contractor'
  ): Promise<NarrationResult> {
    logger.info(`🎙️ Generating full script narration`);

    // Voice selection
    const voiceMap = {
      visitor: 'nova' as const,
      staff: 'onyx' as const,
      contractor: 'fable' as const
    };

    const selectedVoice = voiceMap[roleType as keyof typeof voiceMap] || 'nova';

    return this.generateNarration(fullScript, {
      voice: selectedVoice,
      speed: 0.95, // Slightly slower for better comprehension
      model: 'tts-1-hd'
    });
  }
}
