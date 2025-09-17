/**
 * Centralized OpenAI error handling utility
 * Provides user-friendly error messages and appropriate fallback behavior
 */

export interface OpenAIError {
  code?: string;
  status?: number;
  type?: string;
  message: string;
}

export interface OpenAIErrorResult {
  isRecoverable: boolean;
  shouldRetry: boolean;
  userMessage: string;
  technicalMessage: string;
  retryDelay?: number;
}

export class OpenAIErrorHandler {
  /**
   * Parse and categorize OpenAI API errors
   */
  static handleError(error: any): OpenAIErrorResult {
    // Handle OpenAI SDK errors
    if (error?.status || error?.code || error?.type) {
      return this.handleOpenAIApiError(error);
    }
    
    // Handle network/timeout errors
    if (error?.code === 'ENOTFOUND' || error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT') {
      return {
        isRecoverable: true,
        shouldRetry: true,
        userMessage: 'AI service is temporarily unavailable. Please try again in a few moments.',
        technicalMessage: `Network error: ${error.message}`,
        retryDelay: 2000
      };
    }

    // Handle timeout errors from our custom timeout logic
    if (error?.message?.includes('timeout') || error?.message?.includes('Request timeout')) {
      return {
        isRecoverable: true,
        shouldRetry: true,
        userMessage: 'AI request timed out. Please try again.',
        technicalMessage: `Timeout error: ${error.message}`,
        retryDelay: 1000
      };
    }

    // Handle JSON parsing errors
    if (error?.message?.includes('JSON') || error?.message?.includes('parse')) {
      return {
        isRecoverable: true,
        shouldRetry: true,
        userMessage: 'AI service returned an invalid response. Please try again.',
        technicalMessage: `JSON parsing error: ${error.message}`,
        retryDelay: 1000
      };
    }

    // Generic error fallback
    return {
      isRecoverable: false,
      shouldRetry: false,
      userMessage: 'AI service is currently unavailable. Please try again later.',
      technicalMessage: `Unknown error: ${error.message || 'Unknown error occurred'}`,
    };
  }

  /**
   * Handle specific OpenAI API errors based on status codes and error types
   */
  private static handleOpenAIApiError(error: any): OpenAIErrorResult {
    const status = error.status || error.response?.status;
    const errorType = error.type || error.error?.type;
    const errorCode = error.code || error.error?.code;
    const errorMessage = error.message || error.error?.message || 'Unknown API error';

    switch (status) {
      case 401:
        return {
          isRecoverable: false,
          shouldRetry: false,
          userMessage: 'AI service configuration error. Please contact support.',
          technicalMessage: 'Invalid API key or authentication failed',
        };

      case 403:
        return {
          isRecoverable: false,
          shouldRetry: false,
          userMessage: 'AI service access denied. Please contact support.',
          technicalMessage: 'Forbidden access to API endpoint',
        };

      case 429:
        // Handle quota exceeded vs rate limiting
        if (errorType === 'insufficient_quota' || errorMessage.includes('quota')) {
          return {
            isRecoverable: false,
            shouldRetry: false,
            userMessage: 'AI service quota has been exceeded. Please try again later or contact support.',
            technicalMessage: 'OpenAI quota exceeded',
          };
        } else {
          // Rate limiting
          const retryAfter = this.extractRetryAfter(error);
          return {
            isRecoverable: true,
            shouldRetry: true,
            userMessage: 'AI service is busy. Please wait a moment and try again.',
            technicalMessage: 'Rate limited by OpenAI API',
            retryDelay: retryAfter || 3000
          };
        }

      case 500:
        return {
          isRecoverable: true,
          shouldRetry: true,
          userMessage: 'AI service encountered an internal error. Please try again.',
          technicalMessage: 'OpenAI server error',
          retryDelay: 2000
        };

      case 502:
      case 503:
        return {
          isRecoverable: true,
          shouldRetry: true,
          userMessage: 'AI service is temporarily unavailable. Please try again in a few moments.',
          technicalMessage: 'OpenAI service unavailable',
          retryDelay: 5000
        };

      case 504:
        return {
          isRecoverable: true,
          shouldRetry: true,
          userMessage: 'AI request timed out. Please try again.',
          technicalMessage: 'OpenAI gateway timeout',
          retryDelay: 3000
        };

      default:
        // Handle specific error types
        switch (errorType) {
          case 'invalid_request_error':
            return {
              isRecoverable: false,
              shouldRetry: false,
              userMessage: 'Invalid request to AI service. Please contact support.',
              technicalMessage: `Invalid request: ${errorMessage}`,
            };

          case 'context_length_exceeded':
            return {
              isRecoverable: false,
              shouldRetry: false,
              userMessage: 'Request is too large for AI service. Please reduce the content size.',
              technicalMessage: 'Context length exceeded',
            };

          case 'model_not_found':
            return {
              isRecoverable: true,
              shouldRetry: false,
              userMessage: 'AI model is currently unavailable. Trying alternative model.',
              technicalMessage: `Model not found: ${errorMessage}`,
            };

          default:
            return {
              isRecoverable: true,
              shouldRetry: true,
              userMessage: 'AI service encountered an error. Please try again.',
              technicalMessage: `OpenAI API error: ${errorMessage}`,
              retryDelay: 2000
            };
        }
    }
  }

  /**
   * Extract retry delay from rate limit headers
   */
  private static extractRetryAfter(error: any): number | undefined {
    const retryAfter = error.response?.headers?.['retry-after'] || 
                      error.headers?.['retry-after'];
    
    if (retryAfter) {
      const delay = parseInt(retryAfter, 10);
      return !isNaN(delay) ? delay * 1000 : undefined; // Convert to milliseconds
    }
    
    return undefined;
  }

  /**
   * Log OpenAI errors securely (without exposing API keys)
   */
  static logError(error: any, context: string) {
    const result = this.handleError(error);
    
    console.error(`❌ OpenAI Error in ${context}:`, {
      userMessage: result.userMessage,
      technicalMessage: result.technicalMessage,
      isRecoverable: result.isRecoverable,
      shouldRetry: result.shouldRetry,
      retryDelay: result.retryDelay,
      timestamp: new Date().toISOString()
    });

    // Log additional debugging info if available (but filter sensitive data)
    if (error?.status || error?.code) {
      console.error('Error details:', {
        status: error.status,
        code: error.code,
        type: error.type,
        // Never log the actual API key or sensitive data
        hasApiKey: !!process.env.OPENAI_API_KEY,
        model: error.model,
      });
    }
  }

  /**
   * Check if an error suggests we should try a different model
   */
  static shouldTryDifferentModel(error: any): boolean {
    const result = this.handleError(error);
    const errorMessage = error.message || '';
    const errorType = error.type || error.error?.type;
    
    return (
      errorType === 'model_not_found' ||
      result.technicalMessage.includes('model') ||
      errorMessage.includes('model') ||
      error.status === 404
    );
  }

  /**
   * Get user-friendly message for API quota issues
   */
  static getQuotaExceededMessage(serviceName: string = 'AI service'): string {
    return `${serviceName} has reached its usage limit. This feature is temporarily unavailable. Please try again later or contact support for assistance.`;
  }

  /**
   * Get user-friendly message for rate limiting
   */
  static getRateLimitMessage(retryAfter?: number): string {
    if (retryAfter && retryAfter < 60000) {
      return `AI service is busy. Please wait ${Math.ceil(retryAfter / 1000)} seconds and try again.`;
    }
    return 'AI service is busy. Please wait a moment and try again.';
  }
}