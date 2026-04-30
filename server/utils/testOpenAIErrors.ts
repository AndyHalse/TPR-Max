/**
 * Test script for OpenAI error handling
 * This script tests various error scenarios to ensure proper handling
 */

import { OpenAIErrorHandler } from './openaiErrorHandler';
import { logger } from '../utils/logger';

// Mock error objects that simulate different OpenAI API errors
const mockErrors = {
  quotaExceeded: {
    status: 429,
    type: 'insufficient_quota',
    message: 'You exceeded your current quota, please check your plan and billing details.',
    error: {
      type: 'insufficient_quota',
      message: 'Quota exceeded'
    }
  },
  
  rateLimited: {
    status: 429,
    message: 'Rate limit exceeded',
    response: {
      headers: {
        'retry-after': '5'
      }
    }
  },
  
  invalidApiKey: {
    status: 401,
    type: 'invalid_request_error',
    message: 'Invalid API key provided',
    error: {
      type: 'invalid_request_error',
      message: 'Invalid API key'
    }
  },
  
  modelNotFound: {
    status: 404,
    type: 'model_not_found',
    message: 'The model `gpt-5` does not exist',
    model: 'gpt-5'
  },
  
  contextLengthExceeded: {
    type: 'context_length_exceeded',
    message: 'This model maximum context length is 4097 tokens',
    error: {
      type: 'context_length_exceeded'
    }
  },
  
  serviceUnavailable: {
    status: 503,
    message: 'Service temporarily unavailable'
  },
  
  networkError: {
    code: 'ENOTFOUND',
    message: 'getaddrinfo ENOTFOUND api.openai.com'
  },
  
  timeout: {
    message: 'Request timeout'
  },
  
  jsonParseError: {
    message: 'Unexpected token in JSON at position 0'
  }
};

/**
 * Test the error handler with various error scenarios
 */
export function testOpenAIErrorHandling() {
  logger.info('🧪 Testing OpenAI Error Handling...\n');

  Object.entries(mockErrors).forEach(([errorType, mockError]) => {
    logger.info(`\n📝 Testing ${errorType}:`);
    logger.info('Mock error:', JSON.stringify(mockError, null, 2));
    
    const result = OpenAIErrorHandler.handleError(mockError);
    logger.info('Handler result:', {
      userMessage: result.userMessage,
      technicalMessage: result.technicalMessage,
      isRecoverable: result.isRecoverable,
      shouldRetry: result.shouldRetry,
      retryDelay: result.retryDelay
    });
    
    // Test specific helper methods
    if (errorType === 'modelNotFound') {
      const shouldTryDifferent = OpenAIErrorHandler.shouldTryDifferentModel(mockError);
      logger.info('Should try different model:', shouldTryDifferent);
    }
    
    logger.info('---');
  });

  // Test quota exceeded message helper
  logger.info('\n📋 Testing helper methods:');
  logger.info('Quota exceeded message:', OpenAIErrorHandler.getQuotaExceededMessage('AI Content Generator'));
  logger.info('Rate limit message (5s):', OpenAIErrorHandler.getRateLimitMessage(5000));
  logger.info('Rate limit message (no delay):', OpenAIErrorHandler.getRateLimitMessage());

  logger.info('\n✅ Error handling tests completed!');
}

// Test the error scenarios if running this file directly
testOpenAIErrorHandling();