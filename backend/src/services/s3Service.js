const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const logger = require('../utils/logger');
const { withRetry } = require('../utils/retry');

let client;

function getClient() {
  if (!client) {
    client = new S3Client({
      region: config.aws.region,
      credentials:
        config.aws.accessKeyId && config.aws.secretAccessKey
          ? {
              accessKeyId: config.aws.accessKeyId,
              secretAccessKey: config.aws.secretAccessKey,
            }
          : undefined,
    });
  }
  return client;
}

const MAX_BYTES = 8 * 1024 * 1024; // Instagram photo limit ~8MB practical

/**
 * Upload buffer to S3 with public-read or signed URL pattern.
 * Returns public URL if AWS_S3_PUBLIC_BASE_URL is set, else s3:// style key for internal use.
 */
async function uploadBuffer(buffer, contentType, keyPrefix = 'media') {
  if (!buffer || !buffer.length) {
    throw new Error('Empty file buffer');
  }
  if (buffer.length > MAX_BYTES) {
    throw new Error(`File too large: ${buffer.length} bytes (max ${MAX_BYTES})`);
  }
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const key = `${keyPrefix}/${uuidv4()}.${ext}`;

  await withRetry(
    async () => {
      await getClient().send(
        new PutObjectCommand({
          Bucket: config.aws.s3Bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          CacheControl: 'public, max-age=31536000',
        })
      );
    },
    { maxAttempts: 3, baseDelayMs: 1000 }
  );

  if (config.aws.publicBaseUrl) {
    const base = config.aws.publicBaseUrl.replace(/\/$/, '');
    return `${base}/${key}`;
  }
  logger.warn('AWS_S3_PUBLIC_BASE_URL not set; Instagram needs a public HTTPS URL to fetch media');
  return `s3://${config.aws.s3Bucket}/${key}`;
}

async function deleteObjectKey(key) {
  if (!key || key.startsWith('http')) return;
  const clean = key.replace(/^s3:\/\/[^/]+\//, '');
  await getClient().send(
    new DeleteObjectCommand({ Bucket: config.aws.s3Bucket, Key: clean })
  );
}

module.exports = { uploadBuffer, deleteObjectKey, MAX_BYTES };
