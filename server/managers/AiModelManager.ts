/**
 * Centralized AI model management with fallback chains and retry logic
 */

import OpenAI from "openai";
import type { ModelConfig, AiModelOptions, Result, IAiChatClient } from '../interfaces/ai';
import { ResultUtils } from '../utils/result';
import { OpenAIErrorHandler } from '../utils/openaiErrorHandler';

// Support organization and project IDs to ensure correct billing context
const openaiConfig: any = {
  apiKey: process.env.OPENAI_API_KEY,
};

// For project-scoped API keys, only set project ID (organization is implicit)
if (process.env.OPENAI_PROJECT_ID) {
  openaiConfig.project = process.env.OPENAI_PROJECT_ID;
}

const openai = new OpenAI(openaiConfig);

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
      console.error('❌ Failed to parse JSON response:', error);
      console.error('Raw response:', result.data);
      return ResultUtils.error(`Invalid JSON response: ${error.message}`);
    }
  }

  async complete(prompt: string, options: AiModelOptions = {}): Promise<Result<string>> {
    const startModel = options.model || this.modelConfigs[0].name;
    const startIndex = this.modelConfigs.findIndex(config => config.name === startModel);
    const modelsToTry = startIndex >= 0 
      ? this.modelConfigs.slice(startIndex)
      : this.modelConfigs;

    let lastError: Error | null = null;

    for (const config of modelsToTry) {
      console.log(`🤖 Attempting to use ${config.name} for AI completion...`);
      
      const result = await this.tryModelWithRetry(config, prompt, options);
      
      if (ResultUtils.isSuccess(result)) {
        console.log(`✅ Successfully generated content using ${config.name}`);
        return result;
      }

      // Check if we should try a different model based on the error type
      const shouldTryDifferent = OpenAIErrorHandler.shouldTryDifferentModel(result.error);
      
      if (shouldTryDifferent) {
        console.log(`🔄 Model ${config.name} not available, trying next model...`);
      } else {
        console.log(`⚠️ Model ${config.name} failed: ${result.error?.message}`);
      }
      
      lastError = result.error || new Error(`Unknown error with ${config.name}`);
    }

    // Provide comprehensive error information when all models fail
    if (lastError) {
      const errorResult = OpenAIErrorHandler.handleError(lastError);
      console.log(`🚨 All AI models failed: ${errorResult.userMessage}`);
      
      if (!errorResult.isRecoverable) {
        console.log('💡 This error may require configuration changes or support assistance');
      }
      
      // Enhance the error with user-friendly information
      const enhancedError = new Error(errorResult.userMessage);
      (enhancedError as any).isRecoverable = errorResult.isRecoverable;
      (enhancedError as any).technicalMessage = errorResult.technicalMessage;
      
      return ResultUtils.error(enhancedError);
    }
    
    return ResultUtils.error(new Error('All AI models failed - no specific error available'));
  }

  private async tryModelWithRetry(
    config: ModelConfig, 
    prompt: string, 
    options: AiModelOptions
  ): Promise<Result<string>> {
    const maxAttempts = options.retryAttempts ?? config.retryAttempts;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`🚀 Making API call to ${config.name} (attempt ${attempt}/${maxAttempts})...`);
        
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
        
        console.error(`❌ Attempt ${attempt} failed for ${config.name}: ${errorResult.technicalMessage}`);
        
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
        
        console.log(`⏳ Retrying in ${delay}ms...`);
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