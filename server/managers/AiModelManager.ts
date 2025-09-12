/**
 * Centralized AI model management with fallback chains and retry logic
 */

import OpenAI from "openai";
import type { ModelConfig, AiModelOptions, Result, IAiChatClient } from '../interfaces/ai';
import { ResultUtils } from '../utils/result';

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  organization: null,  // Use default organization for the API key
  project: null        // Use default project for the API key
});

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

      console.log(`⚠️ Model ${config.name} failed: ${result.error?.message}`);
      lastError = result.error || new Error(`Unknown error with ${config.name}`);
    }

    console.log(`🚨 All AI models failed, last error: ${lastError?.message}`);
    return ResultUtils.error(lastError || new Error('All AI models failed'));
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
        console.error(`❌ Attempt ${attempt} failed for ${config.name}:`, error.message);
        
        if (attempt === maxAttempts) {
          return ResultUtils.error(error as Error);
        }

        // Exponential backoff before retry
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return ResultUtils.error(new Error(`All ${maxAttempts} attempts failed`));
  }

  private buildRequestOptions(config: ModelConfig, options: AiModelOptions) {
    const maxTokens = options.maxTokens ?? config.maxTokens;
    const temperature = options.temperature ?? config.temperature;

    // Handle different parameter names across models
    const requestOptions: any = {
      temperature,
    };

    // All chat.completions use max_tokens (max_completion_tokens is for Responses API only)
    requestOptions.max_tokens = maxTokens;

    // Add JSON response format if requested
    if (options.json) {
      requestOptions.response_format = { type: "json_object" };
    }

    return requestOptions;
  }
}