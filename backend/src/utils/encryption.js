const crypto = require('crypto');
const config = require('../config');

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function getKey() {
  const raw = Buffer.from(config.encryptionKey, 'hex');
  if (raw.length !== KEY_LENGTH) {
    throw new Error(
      'ENCRYPTION_KEY must be 64 hex characters (32 bytes) for AES-256-GCM'
    );
  }
  return raw;
}

/**
 * Encrypts a UTF-8 string. Output: iv:authTag:ciphertext (all hex).
 */
function encrypt(plainText) {
  if (!plainText) return '';
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getKey();
  const cipher = crypto.createCipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const enc = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('hex'), tag.toString('hex'), enc.toString('hex')].join(':');
}

/**
 * Decrypts output from encrypt().
 */
function decrypt(payload) {
  if (!payload) return '';
  const parts = payload.split(':');
  if (parts.length !== 3) return '';
  const [ivHex, tagHex, dataHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
