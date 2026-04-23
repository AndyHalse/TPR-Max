/**
 * Clean interfaces for AI services to enable dependency injection and testing
 */

export interface Result<T, E = Error> {
  success: boolean;
  data?: T;
  error?: E;
}

export interface AiModelOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  retryAttempts?: number;
  timeoutMs?: number;
  json?: boolean;
  claudeApiKey?: string;
}

export interface IAiChatClient {
  completeJson<T = any>(
    prompt: string, 
    schemaHints?: string, 
    options?: AiModelOptions
  ): Promise<Result<T>>;
  
  complete(
    prompt: string, 
    options?: AiModelOptions
  ): Promise<Result<string>>;
}

export interface ImageGenerationResult {
  url: string;
  meta?: {
    model?: string;
    prompt?: string;
    fallback?: boolean;
    theme?: string;
  };
}

export interface IImageGenerator {
  generate(
    slideType: string, 
    title: string, 
    description: string
  ): Promise<Result<ImageGenerationResult>>;
}

export interface Question {
  questionText: string;
  questionType: string;
  correctAnswer: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  explanation: string;
  category: string;
  roleType: string;
}

export interface IQuestionGenerator {
  generate(
    script: string, 
    scenes: any[], 
    roleType: string
  ): Promise<Result<Question[]>>;
}

export interface IAudioGenerator {
  generate(
    text: string,
    options?: {
      voice?: string;
      speed?: number;
      format?: string;
    }
  ): Promise<Result<string>>; // Returns audio data URL
}

// Model configuration for fallback chains
export interface ModelConfig {
  name: string;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  retryAttempts: number;
}

export interface AiServiceDependencies {
  chatClient: IAiChatClient;
  imageGenerator: IImageGenerator;
  questionGenerator: IQuestionGenerator;
  audioGenerator: IAudioGenerator;
}