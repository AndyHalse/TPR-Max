/**
 * Centralized AI model management with fallback chains and retry logic
 */

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { ModelConfig, AiModelOptions, Result, IAiChatClient } from '../interfaces/ai';
import { ResultUtils } from '../utils/result';
import { OpenAIErrorHandler } from '../utils/openaiErrorHandler';
import { logger } from '../utils/logger';

// Using Replit's AI Integrations service — same key/base-URL as videoGenerationService.ts
const openaiConfig: any = {
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
};

const openai = new OpenAI(openaiConfig);

// Default Anthropic client using env var (if set)
const anthropicConfig: any = {};
if (process.env.ANTHROPIC_API_KEY) {
  anthropicConfig.apiKey = process.env.ANTHROPIC_API_KEY;
}
const defaultAnthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic(anthropicConfig)
  : null;

// Claude model names for routing detection
const CLAUDE_MODELS = ['claude-3-5-sonnet', 'claude-3-opus', 'claude-3-haiku', 'claude-3-sonnet', 'claude-2'];

// OpenAI configured - detailed logging disabled for security

export class AiModelManager implements IAiChatClient {
  private readonly modelConfigs: ModelConfig[] = [
    {
      name: "gpt-5",
      maxTokens: 4000,
      temperature: 0.7,
      timeoutMs: 30000,
      retryAttempts: 2
    },
    {
      name: "gpt-4o",
      maxTokens: 3500,
      temperature: 0.7,
      timeoutMs: 25000,
      retryAttempts: 2
    },
    {
      name: "gpt-4-turbo",
      maxTokens: 3000,
      temperature: 0.7,
      timeoutMs: 20000,
      retryAttempts: 1
    },
    {
      name: "gpt-4",
      maxTokens: 2500,
      temperature: 0.7,
      timeoutMs: 15000,
      retryAttempts: 1
    }
  ];

  private readonly claudeModelConfigs: ModelConfig[] = [
    {
      name: "claude-3-5-sonnet",
      maxTokens: 4000,
      temperature: 0.7,
      timeoutMs: 30000,
      retryAttempts: 2
    },
    {
      name: "claude-3-opus",
      maxTokens: 4000,
      temperature: 0.7,
      timeoutMs: 60000,
      retryAttempts: 2
    },
    {
      name: "claude-3-haiku",
      maxTokens: 4000,
      temperature: 0.7,
      timeoutMs: 20000,
      retryAttempts: 2
    }
  ];

  private isClaudeModel(modelName: string): boolean {
    return modelName.startsWith('claude-');
  }

  async completeJson<T = any>(
    prompt: string, 
    schemaHints?: string, 
    options?: AiModelOptions
  ): Promise<Result<T>> {
    const enhancedPrompt = schemaHints 
      ? `${prompt}\n\nPlease respond with valid JSON only. Expected format: ${schemaHints}`
      : `${prompt}\n\nPlease respond with valid JSON only.`;

    const result = await this.complete(enhancedPrompt, {
      ...options,
      json: true, // Force JSON mode for better parsing
    });

    if (!ResultUtils.isSuccess(result)) {
      return result as Result<T>;
    }

    try {
      const parsed = JSON.parse(result.data);
      return ResultUtils.success(parsed);
    } catch (error: any) {
      logger.error('❌ Failed to parse JSON response:', error);
      logger.error('Raw response:', result.data);
      return ResultUtils.error(`Invalid JSON response: ${error.message}`);
    }
  }

  async complete(prompt: string, options: AiModelOptions = {}): Promise<Result<string>> {
    const startModel = options.model || this.modelConfigs[0].name;

    // Route to Claude if the selected model is a Claude model
    if (this.isClaudeModel(startModel)) {
      return this.callClaude(prompt, startModel, options);
    }

    const startIndex = this.modelConfigs.findIndex(config => config.name === startModel);
    const modelsToTry = startIndex >= 0 
      ? this.modelConfigs.slice(startIndex)
      : this.modelConfigs;

    let lastError: Error | null = null;

    for (const config of modelsToTry) {
      logger.info(`🤖 Attempting to use ${config.name} for AI completion...`);
      
      const result = await this.tryModelWithRetry(config, prompt, options);
      
      if (ResultUtils.isSuccess(result)) {
        logger.info(`✅ Successfully generated content using ${config.name}`);
        return result;
      }

      // Check if we should try a different model based on the error type
      const shouldTryDifferent = OpenAIErrorHandler.shouldTryDifferentModel(result.error);
      
      if (shouldTryDifferent) {
        logger.info(`🔄 Model ${config.name} not available, trying next model...`);
      } else {
        logger.info(`⚠️ Model ${config.name} failed: ${result.error?.message}`);
      }
      
      lastError = result.error || new Error(`Unknown error with ${config.name}`);
    }

    // Provide comprehensive error information when all models fail
    if (lastError) {
      const errorResult = OpenAIErrorHandler.handleError(lastError);
      logger.info(`🚨 All AI models failed: ${errorResult.userMessage}`);
      
      if (!errorResult.isRecoverable) {
        logger.info('💡 This error may require configuration changes or support assistance');
      }
      
      // Enhance the error with user-friendly information
      const enhancedError = new Error(errorResult.userMessage);
      (enhancedError as any).isRecoverable = errorResult.isRecoverable;
      (enhancedError as any).technicalMessage = errorResult.technicalMessage;
      
      return ResultUtils.error(enhancedError);
    }
    
    return ResultUtils.error(new Error('All AI models failed - no specific error available'));
  }

  /**
   * Call Claude/Anthropic API with retry logic.
   * Uses options.claudeApiKey if provided, otherwise falls back to ANTHROPIC_API_KEY env var.
   */
  async callClaude(prompt: string, modelName: string, options: AiModelOptions = {}): Promise<Result<string>> {
    const apiKey = options.claudeApiKey || process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return ResultUtils.error(new Error(
        'No Anthropic API key available. Add a Claude API key in AI Settings or set ANTHROPIC_API_KEY environment variable.'
      ));
    }

    const anthropic = options.claudeApiKey
      ? new Anthropic({ apiKey })
      : (defaultAnthropic || new Anthropic({ apiKey }));

    const claudeConfig = this.claudeModelConfigs.find(c => modelName.startsWith(c.name))
      || this.claudeModelConfigs[0];

    const maxTokens = options.maxTokens ?? claudeConfig.maxTokens;
    const temperature = options.temperature ?? claudeConfig.temperature;
    const maxAttempts = options.retryAttempts ?? claudeConfig.retryAttempts;
    const timeoutMs = options.timeoutMs ?? claudeConfig.timeoutMs;

    // Map the model name to the full Anthropic model ID
    const anthropicModelId = this.mapClaudeModelId(modelName);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        logger.info(`🤖 Attempting Claude ${anthropicModelId} (attempt ${attempt}/${maxAttempts})...`);

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout')), timeoutMs);
        });

        const messageParams: Anthropic.MessageCreateParamsNonStreaming = {
          model: anthropicModelId,
          max_tokens: maxTokens,
          messages: [{ role: "user", content: prompt }],
        };

        // Claude doesn't support JSON mode natively but we enforce via prompt
        // Temperature must be 0-1 for Claude
        if (temperature !== undefined && temperature <= 1) {
          messageParams.temperature = temperature;
        }

        const apiCall = anthropic.messages.create(messageParams);
        const response = await Promise.race([apiCall, timeoutPromise]);

        const content = response.content[0];
        if (!content || content.type !== 'text') {
          throw new Error('No text content in Claude response');
        }

        logger.info(`✅ Successfully generated content using Claude ${anthropicModelId}`);
        return ResultUtils.success(content.text);

      } catch (error: any) {
        logger.error(`❌ Claude attempt ${attempt} failed: ${error.message}`);

        if (attempt === maxAttempts) {
          const msg = error.status === 401
            ? 'Claude API key is invalid or expired. Please update it in AI Settings.'
            : error.status === 429
            ? 'Claude rate limit reached. Please try again later.'
            : `Claude API error: ${error.message}`;

          return ResultUtils.error(new Error(msg));
        }

        const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        logger.info(`⏳ Retrying Claude in ${backoffDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }

    return ResultUtils.error(new Error(`All ${maxAttempts} Claude attempts failed`));
  }

  private mapClaudeModelId(modelName: string): string {
    // Map short names to full Anthropic model IDs
    const modelMap: Record<string, string> = {
      'claude-3-5-sonnet': 'claude-3-5-sonnet-20241022',
      'claude-3-opus': 'claude-3-opus-20240229',
      'claude-3-haiku': 'claude-3-haiku-20240307',
      'claude-3-sonnet': 'claude-3-sonnet-20240229',
    };

    for (const [key, value] of Object.entries(modelMap)) {
      if (modelName.startsWith(key)) return value;
    }

    // Return as-is if already a full model ID or unknown
    return modelName;
  }

  private async tryModelWithRetry(
    config: ModelConfig, 
    prompt: string, 
    options: AiModelOptions
  ): Promise<Result<string>> {
    const maxAttempts = options.retryAttempts ?? config.retryAttempts;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        logger.info(`🚀 Making API call to ${config.name} (attempt ${attempt}/${maxAttempts})...`);
        
        const requestOptions = this.buildRequestOptions(config, options);
        const timeoutMs = options.timeoutMs ?? config.timeoutMs;
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout')), timeoutMs);
        });

        const apiCall = openai.chat.completions.create({
          model: config.name,
          messages: [{ role: "user", content: prompt }],
          ...requestOptions
        });

        const response = await Promise.race([apiCall, timeoutPromise]);
        const content = response.choices[0]?.message?.content;

        if (!content) {
          throw new Error('No content in response');
        }

        return ResultUtils.success(content);

      } catch (error: any) {
        const errorResult = OpenAIErrorHandler.handleError(error);
        
        logger.error(`❌ Attempt ${attempt} failed for ${config.name}: ${errorResult.technicalMessage}`);
        
        // Log the error with context but don't expose sensitive info
        if (attempt === 1) {
          OpenAIErrorHandler.logError(error, `AiModelManager.${config.name}`);
        }
        
        if (attempt === maxAttempts) {
          // Return enhanced error information for final failure
          const enhancedError = new Error(errorResult.userMessage);
          (enhancedError as any).isRecoverable = errorResult.isRecoverable;
          (enhancedError as any).shouldRetry = errorResult.shouldRetry;
          (enhancedError as any).technicalMessage = errorResult.technicalMessage;
          
          return ResultUtils.error(enhancedError);
        }

        // Use error-specific delay or exponential backoff
        const errorDelay = errorResult.retryDelay;
        const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        const delay = errorDelay || backoffDelay;
        
        logger.info(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return ResultUtils.error(new Error(`All ${maxAttempts} attempts failed`));
  }

  private buildRequestOptions(config: ModelConfig, options: AiModelOptions) {
    const maxTokens = options.maxTokens ?? config.maxTokens;
    const temperature = options.temperature ?? config.temperature;

    // GPT-5+ models only support the default temperature (1); setting any other value causes an API error
    const isNewGenModel = config.name === 'gpt-5' || config.name.includes('gpt-6') || config.name.includes('gpt-7') || config.name.startsWith('o');
    
    const requestOptions: any = {};

    // Only include temperature for models that support it
    if (!isNewGenModel) {
      requestOptions.temperature = temperature;
    }

    // All chat.completions use max_tokens (max_completion_tokens is for Responses API only)
    requestOptions.max_tokens = maxTokens;

    // Add JSON response format if requested
    if (options.json) {
      requestOptions.response_format = { type: "json_object" };
    }

    return requestOptions;
  }
}
