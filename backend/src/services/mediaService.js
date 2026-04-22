const OpenAI = require('openai');
const sharp = require('sharp');
const config = require('../config');
const s3Service = require('./s3Service');
const { withRetry } = require('../utils/retry');
const logService = require('./logService');

function getClient() {
  if (!config.openaiApiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  return new OpenAI({ apiKey: config.openaiApiKey });
}

const DIMENSIONS = {
  '1:1': { width: 1080, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '4:5': { width: 1080, height: 1350 },
};

/**
 * Generate farm-style image via OpenAI Images API, resize to Instagram-safe JPEG.
 */
async function generateAndUploadFarmImage(userId, postId, prompt, aspectRatio = '1:1') {
  const client = getClient();
  const dim = DIMENSIONS[aspectRatio] || DIMENSIONS['1:1'];
  const fullPrompt = `${prompt}. Photorealistic Indian rural farm scene, desi poultry, natural light, no text overlay, no watermark.`;

  let imageBuffer;
  await withRetry(
    async () => {
      const size = aspectRatio === '9:16' ? '1024x1792' : '1024x1024';
      const res = await client.images.generate({
        model: 'dall-e-3',
        prompt: fullPrompt.slice(0, 3900),
        n: 1,
        size,
        quality: 'standard',
        response_format: 'b64_json',
      });
      const b64 = res.data[0]?.b64_json;
      if (!b64) {
        throw new Error('Image generation returned empty');
      }
      imageBuffer = Buffer.from(b64, 'base64');
    },
    { maxAttempts: 3, baseDelayMs: 3000 }
  );

  let processed;
  try {
    processed = await sharp(imageBuffer)
      .resize(dim.width, dim.height, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
  } catch (err) {
    await logService.logEntry({
      userId,
      postId,
      level: 'error',
      step: 'media.process',
      message: err.message,
    });
    throw new Error(`Image processing failed: ${err.message}`);
  }

  if (processed.length > s3Service.MAX_BYTES) {
    processed = await sharp(processed).jpeg({ quality: 75 }).toBuffer();
  }

  const url = await s3Service.uploadBuffer(processed, 'image/jpeg', `posts/${userId}`);
  if (url.startsWith('s3://')) {
    await logService.logEntry({
      userId,
      postId,
      level: 'warn',
      step: 'media.url',
      message: 'Configure AWS_S3_PUBLIC_BASE_URL for Instagram publishing',
    });
  }
  return url;
}

/**
 * Optional: placeholder for future video/reel assembly (FFmpeg in separate worker).
 */
async function enqueueReelConversion(/* post */) {
  throw new Error('Reel video conversion is not enabled in this build — use image carousel or external tool');
}

module.exports = { generateAndUploadFarmImage, enqueueReelConversion, DIMENSIONS };
