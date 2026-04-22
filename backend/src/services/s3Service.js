/**
 * S3 hardening (ops / IAM — not enforced in app code):
 * - Block public "ACL: public-read" on the bucket; use CloudFront or OAC for reads if possible.
 * - Grant this app only s3:PutObject / s3:GetObject on a prefix; never s3:DeleteBucket.
 * - Prefer private objects + time-limited presigned GET URLs for sensitive media; public base URL is for IG/YouTube fetches.
 */
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
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // Short video uploads

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
    { maxAttempts: 2, baseDelayMs: 1000, maxDelayMs: 20000 }
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

/**
 * User uploads: images (≤8MB) or short videos (≤100MB). Returns public https URL or s3:// fallback.
 * @param {string} [keyPrefix]
 */
async function uploadUserMedia(buffer, originalName = '', mimetype = 'application/octet-stream', keyPrefix = 'uploads') {
  if (!buffer || !buffer.length) {
    throw new Error('Empty file buffer');
  }
  const isVideo = mimetype.startsWith('video/');
  const isImage = mimetype.startsWith('image/');
  if (!isVideo && !isImage) {
    throw new Error('Only image or video uploads are allowed');
  }
  const max = isVideo ? MAX_VIDEO_BYTES : MAX_BYTES;
  if (buffer.length > max) {
    throw new Error(`File too large (max ${Math.round(max / (1024 * 1024))}MB for ${isVideo ? 'video' : 'image'})`);
  }
  let ext = 'bin';
  if (mimetype.includes('mp4') || mimetype === 'video/mp4') ext = 'mp4';
  else if (mimetype.includes('webm')) ext = 'webm';
  else if (mimetype.includes('quicktime') || mimetype === 'video/quicktime') ext = 'mov';
  else if (mimetype.includes('png')) ext = 'png';
  else if (mimetype.includes('webp')) ext = 'webp';
  else if (mimetype.includes('jpeg') || mimetype.includes('jpg')) ext = 'jpg';
  if (!config.aws.s3Bucket) {
    throw new Error('S3 is not configured');
  }
  const key = `${keyPrefix}/${uuidv4()}.${ext}`;
  await withRetry(
    async () => {
      await getClient().send(
        new PutObjectCommand({
          Bucket: config.aws.s3Bucket,
          Key: key,
          Body: buffer,
          ContentType: mimetype,
          CacheControl: 'public, max-age=31536000',
        })
      );
    },
    { maxAttempts: 2, baseDelayMs: 1000, maxDelayMs: 20000 }
  );
  if (config.aws.publicBaseUrl) {
    const base = config.aws.publicBaseUrl.replace(/\/$/, '');
    return `${base}/${key}`;
  }
  logger.warn('AWS_S3_PUBLIC_BASE_URL not set; social APIs need a public HTTPS URL to fetch media');
  return `s3://${config.aws.s3Bucket}/${key}`;
}

module.exports = { uploadBuffer, uploadUserMedia, deleteObjectKey, MAX_BYTES, MAX_VIDEO_BYTES };
