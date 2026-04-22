const crypto = require('crypto');
const OpenAI = require('openai');
const config = require('../config');
const ContentHistory = require('../models/ContentHistory');
const { withRetry } = require('../utils/retry');
const logService = require('./logService');

function getClient() {
  if (!config.openaiApiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  return new OpenAI({ apiKey: config.openaiApiKey });
}

function hashContent(text) {
  return crypto.createHash('sha256').update(text.trim().toLowerCase()).digest('hex');
}

/**
 * Generate caption + hashtags + reel script with deduplication attempts.
 */
async function generatePostBundle(userId, options = {}) {
  const topic = options.topic || 'desi poultry farming, organic feed, village life';
  const client = getClient();
  const maxDedupAttempts = 4;
  let lastCaption = '';

  for (let attempt = 1; attempt <= maxDedupAttempts; attempt += 1) {
    const system = `You are a social media expert for Indian farming niches (desi poultry).
Write engaging, realistic captions mixing Telugu and English naturally (code-switching).
Tone: warm, practical, trustworthy. Avoid exaggeration. No duplicate phrasing from typical AI spam.
Output strict JSON only with keys: caption (string), hashtags (array of 12-18 unique strings without #), reelScript (object with hook, body, cta strings).`;

    const userPrompt = `Topic focus: ${topic}.
${attempt > 1 ? `Variation ${attempt}: use different angle and vocabulary than generic farming posts.` : ''}
Include 2-3 Telugu phrases or words naturally in the caption.`;

    let text = '';
    await withRetry(
      async () => {
        const completion = await client.chat.completions.create({
          model: options.model || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.85,
          max_tokens: 1200,
          response_format: { type: 'json_object' },
        });
        text = completion.choices[0]?.message?.content?.trim() || '';
        if (!text) {
          throw new Error('Empty AI response');
        }
      },
      { maxAttempts: 3, baseDelayMs: 2000 }
    );

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      await logService.logEntry({
        userId,
        level: 'warn',
        step: 'ai.parse',
        message: 'Invalid JSON from model, retrying',
      });
      continue;
    }

    const caption = String(parsed.caption || '').trim();
    if (!caption || caption.length < 20) {
      await logService.logEntry({
        userId,
        level: 'warn',
        step: 'ai.quality',
        message: 'Low-quality caption rejected',
      });
      continue;
    }

    const hashtags = Array.isArray(parsed.hashtags)
      ? [...new Set(parsed.hashtags.map((h) => String(h).replace(/^#/, '').trim()).filter(Boolean))]
      : [];

    const contentHash = hashContent(caption);
    const dup = await ContentHistory.findOne({ userId, contentHash });
    if (dup) {
      lastCaption = caption;
      await logService.logEntry({
        userId,
        level: 'info',
        step: 'ai.dedup',
        message: 'Duplicate caption hash avoided',
        meta: { attempt },
      });
      continue;
    }

    try {
      await ContentHistory.create({
        userId,
        contentHash,
        snippet: caption.slice(0, 200),
      });
    } catch (e) {
      if (e.code === 11000) continue;
      throw e;
    }

    return {
      caption,
      hashtags,
      reelScript: {
        hook: String(parsed.reelScript?.hook || '').slice(0, 500),
        body: String(parsed.reelScript?.body || '').slice(0, 2000),
        cta: String(parsed.reelScript?.cta || '').slice(0, 300),
      },
      contentHash,
      generationMeta: { model: options.model || 'gpt-4o-mini', promptVersion: 'v1', improved: false },
    };
  }

  throw new Error(
    lastCaption
      ? 'Could not produce unique caption after retries'
      : 'AI content generation failed'
  );
}

/**
 * Improve caption iteratively (bonus).
 */
async function improveCaption(userId, caption, feedback = '') {
  const client = getClient();
  let text = '';
  await withRetry(
    async () => {
      const completion = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Improve the Instagram caption for Indian desi poultry farming. Keep Telugu+English mix. Return JSON { "caption": "..." } only.',
          },
          {
            role: 'user',
            content: `Original:\n${caption}\n\nFeedback: ${feedback || 'More engaging and concise.'}`,
          },
        ],
        response_format: { type: 'json_object' },
      });
      text = completion.choices[0]?.message?.content?.trim() || '';
      if (!text) throw new Error('Empty improvement response');
    },
    { maxAttempts: 3 }
  );
  const parsed = JSON.parse(text);
  const improved = String(parsed.caption || '').trim();
  await logService.logEntry({
    userId,
    step: 'ai.improve',
    message: 'Caption improved',
  });
  return {
    caption: improved,
    contentHash: hashContent(improved),
    generationMeta: { model: 'gpt-4o-mini', improved: true },
  };
}

module.exports = { generatePostBundle, improveCaption, hashContent };
