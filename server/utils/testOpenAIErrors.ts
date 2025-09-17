/**
 * Test script for OpenAI error handling
 * This script tests various error scenarios to ensure proper handling
 */

import { OpenAIErrorHandler } from './openaiErrorHandler';

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
  console.log('🧪 Testing OpenAI Error Handling...\n');

  Object.entries(mockErrors).forEach(([errorType, mockError]) => {
    console.log(`\n📝 Testing ${errorType}:`);
    console.log('Mock error:', JSON.stringify(mockError, null, 2));
    
    const result = OpenAIErrorHandler.handleError(mockError);
    console.log('Handler result:', {
      userMessage: result.userMessage,
      technicalMessage: result.technicalMessage,
      isRecoverable: result.isRecoverable,
      shouldRetry: result.shouldRetry,
      retryDelay: result.retryDelay
    });
    
    // Test specific helper methods
    if (errorType === 'modelNotFound') {
      const shouldTryDifferent = OpenAIErrorHandler.shouldTryDifferentModel(mockError);
      console.log('Should try different model:', shouldTryDifferent);
    }
    
    console.log('---');
  });

  // Test quota exceeded message helper
  console.log('\n📋 Testing helper methods:');
  console.log('Quota exceeded message:', OpenAIErrorHandler.getQuotaExceededMessage('AI Content Generator'));
  console.log('Rate limit message (5s):', OpenAIErrorHandler.getRateLimitMessage(5000));
  console.log('Rate limit message (no delay):', OpenAIErrorHandler.getRateLimitMessage());

  console.log('\n✅ Error handling tests completed!');
}

// Test the error scenarios if running this file directly
testOpenAIErrorHandling();