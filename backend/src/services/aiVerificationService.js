const axios = require('axios');
const sharp = require('sharp');
const { RekognitionClient, DetectFacesCommand } = require('@aws-sdk/client-rekognition');
const config = require('../config');
const logger = require('../utils/logger');

const MIN_DIM = 80;
const FACE_CONFIDENCE_MIN = 78;
const MAX_IMAGE_BYTES = 7 * 1024 * 1024;

/**
 * Download only HTTPS images; limit size
 * @param {string} imageUrl
 * @returns {Promise<Buffer>}
 */
async function downloadImageBuffer(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') {
    throw new Error('imageUrl is required');
  }
  if (!/^https:\/\//i.test(imageUrl.trim())) {
    throw new Error('Only HTTPS image URLs are allowed');
  }
  const { data, headers } = await axios.get(imageUrl.trim(), {
    responseType: 'arraybuffer',
    timeout: 30000,
    maxContentLength: MAX_IMAGE_BYTES,
    maxBodyLength: MAX_IMAGE_BYTES,
    headers: { Accept: 'image/*' },
  });
  const type = (headers['content-type'] || '').toLowerCase();
  if (type && !type.startsWith('image/') && !type.includes('application/octet-stream')) {
    throw new Error('URL did not return an image');
  }
  const buffer = Buffer.from(data);
  if (buffer.length < 24) {
    throw new Error('Image is too small');
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('Image exceeds maximum size');
  }
  return buffer;
}

/**
 * Blank / too-small / very flat (solid color) image detection
 * @param {Buffer} buffer
 * @returns {Promise<{ ok: boolean, reason?: string, stdev?: number, width?: number, height?: number }>}
 */
async function analyzeImageHeuristics(buffer) {
  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) {
    return { ok: false, reason: 'Invalid image' };
  }
  if (meta.width < MIN_DIM || meta.height < MIN_DIM) {
    return { ok: false, reason: `Image must be at least ${MIN_DIM}×${MIN_DIM} pixels` };
  }
  const channels = (await sharp(buffer).stats()).channels;
  const stdev0 = (channels[0] && channels[0].stdev) || 0;
  if (stdev0 < 2) {
    return { ok: false, reason: 'Image is blank, too dark, or lacks detail' };
  }
  if (stdev0 < 4 && meta.width * meta.height < 5000) {
    return { ok: false, reason: 'Image has very low variety (suspicious: icon or flat art)' };
  }
  return { ok: true, stdev: stdev0, width: meta.width, height: meta.height, format: meta.format };
}

/**
 * @param {Buffer} jpegPngOrOrig
 */
async function detectFacesRekognition(buffer) {
  const { aws } = config;
  if (!aws.accessKeyId || !aws.secretAccessKey) {
    return null;
  }
  const client = new RekognitionClient({
    region: aws.region,
    credentials: { accessKeyId: aws.accessKeyId, secretAccessKey: aws.secretAccessKey },
  });
  const normalized = await sharp(buffer).rotate().toFormat('jpeg', { quality: 92 }).toBuffer();
  const out = await client.send(
    new DetectFacesCommand({
      Image: { Bytes: normalized },
      Attributes: ['DEFAULT'],
    })
  );
  return out.FaceDetails || [];
}

/**
 * @param {string} imageUrl Public HTTPS URL (e.g. S3/CloudFront)
 * @returns {Promise<{
 *   valid: boolean | null,
 *   confidence: number,
 *   reason: string
 * }>}
 * `valid: null` = service unavailable, caller should set status pending
 */
async function verifyProfileImage(imageUrl) {
  if (!imageUrl) {
    return { valid: false, confidence: 0, reason: 'No image URL' };
  }
  let buffer;
  try {
    buffer = await downloadImageBuffer(String(imageUrl).trim());
  } catch (e) {
    logger.warn('aiVerification download failed', { err: e.message, url: String(imageUrl).slice(0, 80) });
    return { valid: false, confidence: 0, reason: e.message || 'Download failed' };
  }

  try {
    const heur = await analyzeImageHeuristics(buffer);
    if (!heur.ok) {
      return { valid: false, confidence: 0, reason: heur.reason || 'Image failed quality checks' };
    }

    let faces;
    try {
      faces = await detectFacesRekognition(buffer);
    } catch (e) {
      logger.error('Rekognition failed; falling back to manual review', { err: e.message });
      return {
        valid: null,
        confidence: 0,
        reason: 'AUTO_VERIFY_UNAVAILABLE',
      };
    }
    if (faces === null) {
      return {
        valid: null,
        confidence: 0,
        reason: 'AWS Rekognition is not configured',
      };
    }
    if (faces.length < 1) {
      return { valid: false, confidence: 0, reason: 'No clear human face in this image' };
    }
    const best = Math.max(...faces.map((f) => f.Confidence || 0));
    if (best < FACE_CONFIDENCE_MIN) {
      return { valid: false, confidence: Math.round((best / 100) * 1000) / 1000, reason: 'Face not clear enough' };
    }
    return {
      valid: true,
      confidence: Math.round((best / 100) * 1000) / 1000,
      reason: 'Human face detected',
    };
  } catch (e) {
    logger.error('aiVerification pipeline error', { err: e.message, stack: e.stack });
    return { valid: null, confidence: 0, reason: e.message || 'ANALYSIS_FAILED' };
  }
}

module.exports = { verifyProfileImage, downloadImageBuffer, analyzeImageHeuristics };
