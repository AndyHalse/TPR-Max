/**
 * AES-256-GCM Encryption utilities for API key storage
 * Provides secure encryption/decryption of sensitive data with proper IV and authTag handling
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // For AES-256-GCM, this is always 16
const TAG_LENGTH = 16; // Authentication tag length
const KEY_LENGTH = 32; // AES-256 requires 32-byte keys

/**
 * Get encryption key from environment variable with secure failure
 * REMOVED hardcoded fallback for security
 */
function getEncryptionKey(): Buffer {
  const keyString = process.env.ENCRYPTION_KEY;
  
  if (!keyString) {
    throw new Error('ENCRYPTION_KEY environment variable is required for secure API key storage');
  }
  
  if (keyString.length === KEY_LENGTH) {
    return Buffer.from(keyString, 'utf8');
  }
  
  // If key is not exactly 32 bytes, derive it using SHA-256
  return crypto.createHash('sha256').update(keyString, 'utf8').digest();
}

/**
 * Encrypt sensitive data using AES-256-GCM with proper IV and authTag handling
 * @param plaintext - The data to encrypt
 * @returns Object containing encrypted data, IV, and authentication tag
 */
export function encryptData(plaintext: string): {
  encryptedData: string;
  iv: string;
  authTag: string;
} {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // FIXED: Use createCipheriv with proper IV handling for AES-256-GCM
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Get the authentication tag AFTER final() for GCM
    const authTag = cipher.getAuthTag();
    
    return {
      encryptedData: encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt data using AES-256-GCM with proper IV and authTag handling
 * @param encryptedData - The encrypted data in hex format
 * @param iv - The initialization vector in hex format
 * @param authTag - The authentication tag in hex format
 * @returns The decrypted plaintext
 */
export function decryptData(encryptedData: string, iv: string, authTag: string): string {
  try {
    const key = getEncryptionKey();
    const ivBuffer = Buffer.from(iv, 'hex');
    const authTagBuffer = Buffer.from(authTag, 'hex');
    
    // FIXED: Use createDecipheriv with proper IV and authTagLength for AES-256-GCM
    const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer, {
      authTagLength: TAG_LENGTH
    });
    
    // Set the authentication tag BEFORE calling update/final for GCM
    decipher.setAuthTag(authTagBuffer);
    
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt data - data may be corrupted or tampered with');
  }
}

/**
 * Generate SHA-256 fingerprint of an API key for duplicate detection
 * @param apiKey - The API key to fingerprint
 * @returns SHA-256 hash in hex format
 */
export function generateKeyFingerprint(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Get the last N characters of an API key for display purposes
 * @param apiKey - The API key
 * @param length - Number of characters to show (default 4)
 * @returns Last N characters
 */
export function getKeyLast4(apiKey: string, length: number = 4): string {
  if (apiKey.length <= length) {
    return apiKey;
  }
  return apiKey.slice(-length);
}

/**
 * Validate API key format
 * @param apiKey - The API key to validate
 * @param serviceType - The service type ('openai' or 'gemini')
 * @returns Boolean indicating if format is valid
 */
export function validateApiKeyFormat(apiKey: string, serviceType: 'openai' | 'gemini' | 'claude'): boolean {
  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }
  
  const trimmedKey = apiKey.trim();
  
  if (serviceType === 'openai') {
    // OpenAI keys start with sk- and are typically 48+ characters
    return trimmedKey.startsWith('sk-') && trimmedKey.length >= 20;
  } else if (serviceType === 'gemini') {
    // Gemini keys are typically 39 characters alphanumeric with dashes/underscores
    return trimmedKey.length >= 20 && /^[A-Za-z0-9_-]+$/.test(trimmedKey);
  } else if (serviceType === 'claude') {
    // Anthropic Claude keys start with sk-ant-
    return trimmedKey.startsWith('sk-ant-') && trimmedKey.length >= 20;
  }
  
  return false;
}

/**
 * Generate a secure audit log entry
 * @param action - The action performed (encrypt, decrypt, test, etc.)
 * @param userId - The user performing the action
 * @param serviceType - The service type
 * @returns Audit log entry string
 */
export function generateAuditLogEntry(
  action: string, 
  userId: string, 
  serviceType: string
): string {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    action,
    userId,
    serviceType,
    userAgent: 'server', // Could be enhanced to capture actual user agent
  };
  
  return JSON.stringify(entry);
}