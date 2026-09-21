/**
 * Credential Encryption Utility
 * Encrypts/decrypts sensitive credentials at rest
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 16;

/**
 * Derives encryption key from master secret
 */
function getEncryptionKey(): Buffer {
  const masterSecret = process.env.INTEGRATION_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!masterSecret) {
    throw new Error('INTEGRATION_ENCRYPTION_KEY or JWT_SECRET must be set');
  }
  // Use a fixed salt for deterministic key derivation from master secret
  const salt = Buffer.from('prepvista-integration-salt', 'utf8').subarray(0, SALT_LENGTH);
  return scryptSync(masterSecret, salt, KEY_LENGTH);
}

/**
 * Encrypts a plaintext string
 * Returns base64 encoded: salt:iv:authTag:ciphertext
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) {
    throw new Error('Cannot encrypt empty value');
  }

  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Format: salt:iv:authTag:ciphertext (all base64)
  const salt = Buffer.from('prepvista-integration-salt', 'utf8').subarray(0, SALT_LENGTH);
  return [
    salt.toString('base64'),
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

/**
 * Decrypts a base64 encoded encrypted string
 */
export function decrypt(encrypted: string): string {
  if (!encrypted) {
    throw new Error('Cannot decrypt empty value');
  }

  const parts = encrypted.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted format');
  }

  const [, ivB64, authTagB64, ciphertextB64] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return plaintext.toString('utf8');
}

/**
 * Encrypts credential value for storage
 */
export function encryptCredential(value: string): string {
  return encrypt(value);
}

/**
 * Decrypts credential value for use
 */
export function decryptCredential(encrypted: string): string {
  return decrypt(encrypted);
}

/**
 * Rotates encryption - re-encrypts with current key
 * Used when master key rotation is needed
 */
export function rotateEncryption(encrypted: string): string {
  const plaintext = decrypt(encrypted);
  return encrypt(plaintext);
}

/**
 * Validates if a string is properly encrypted
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false;
  const parts = value.split(':');
  if (parts.length !== 4) return false;

  // Check if all parts are valid base64
  try {
    parts.forEach(p => Buffer.from(p, 'base64'));
    return true;
  } catch {
    return false;
  }
}