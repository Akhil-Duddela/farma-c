const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const { withRetry } = require('../utils/retry');

const VIRAL_PROMPT = `You are an expert agricultural and social media content strategist for short-form video (Instagram Reels, YouTube Shorts). Turn the user's raw idea into authentic, high-engagement, shareable content. Keep tone warm, clear, and practical (farming, poultry, organic, desi when relevant).

User's raw idea:
{USER_INPUT}

You MUST output ONLY a single valid JSON object. No markdown, no code fences, no commentary before or after. Use double quotes for all keys and string values. Arrays must be JSON arrays.

The JSON must have exactly these keys:
- "title" (string): catchy, scroll-stopping title
- "description" (string): 2-3 sentence pack / summary
- "script" (string): full short video script with line breaks where natural
- "caption" (string): platform-ready caption, under 2200 characters
- "hashtags" (array of strings): 8-15 tags WITHOUT the # symbol
- "hooks" (array of strings): 3-5 powerful opening hook lines (first 3 seconds)
- "videoIdea" (string): one concise shot list or B-roll / visual idea

Return only the JSON object.`;

const EMPTY = () => ({
  title: '',
  description: '',
  script: '',
  caption: '',
  hashtags: [],
  hooks: [],
  videoIdea: '',
});

/**
 * @param {unknown} obj
 */
function normalizeShape(obj) {
  if (!obj || typeof obj !== 'object') {
    return EMPTY();
  }
  const o = obj;
  return {
    title: String(o.title ?? ''),
    description: String(o.description ?? ''),
    script: String(o.script ?? ''),
    caption: String(o.caption ?? ''),
    hashtags: Array.isArray(o.hashtags) ? o.hashtags.map((t) => String(t).replace(/^#/, '')).filter(Boolean) : [],
    hooks: Array.isArray(o.hooks)
      ? o.hooks.map((h) => String(h).trim()).filter(Boolean)
      : o.hooks
        ? [String(o.hooks)]
        : [],
    videoIdea: String(o.videoIdea ?? o.video_idea ?? ''),
  };
}

function tryParseJsonObject(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }
  const trimmed = text.trim();
  const candidates = [trimmed];
  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlock) {
    candidates.push(codeBlock[1].trim());
  }
  const brace = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (brace !== -1 && last > brace) {
    candidates.push(trimmed.slice(brace, last + 1));
  }
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // next
    }
  }
  return null;
}

function fallbackFromText(text) {
  const out = EMPTY();
  if (!text) {
    return out;
  }
  out.description = text.slice(0, 2000);
  out.caption = text.slice(0, 2200);
  return out;
}

/**
 * @param {string} input
 */
function fallbackAI(input) {
  const t = String(input);
  return {
    title: `🔥 ${t} - Must Know Tips!`,
    description: `Simple and practical ${t} tips for better poultry results. Every farmer should know this.`,
    script: `You won’t believe this…\n\nMost farmers are doing ${t} wrong.\n\nHere’s what you should do:\n1. Start with proper feed\n2. Maintain clean water\n3. Monitor daily health\n\nFollow these steps and see the difference!\n\nFollow for more farming tips!`,
    caption: `🔥 ${t} tips you must try!\n\nSave this and follow for more poultry hacks! 🐔🌱`,
    hashtags: ['poultry', 'farming', 'desifarming', 'chickenfarm', 'organicfarming', 'kisan', 'dairyfarming', 'cattle'],
    hooks: [
      "You won’t believe this...",
      'Most farmers are doing this wrong...',
      'This trick can change your farm!',
    ],
    videoIdea: 'Show chickens, feeding process, close-up shots of farm activities',
  };
}

/**
 * @param {string} raw
 * @returns {{ ok: true, value: string } | { ok: false }}
 */
function sanitizeIdea(raw) {
  if (raw == null || typeof raw !== 'string') {
    return { ok: false };
  }
  const value = String(raw)
    .replace(/\0/g, '')
    .replace(/<script[\s\S]*?>/gi, '')
    .trim();
  if (!value.length || value.length > 8000) {
    return { ok: false };
  }
  return { ok: true, value };
}

/**
 * @param {unknown} data
 */
function parseOllamaBody(data) {
  if (data && typeof data.response === 'object' && data.response !== null && !Array.isArray(data.response)) {
    return normalizeShape(data.response);
  }
  const text =
    typeof data?.response === 'string'
      ? data.response
      : typeof data === 'string'
        ? data
        : JSON.stringify(data);
  const parsed = tryParseJsonObject(text);
  if (parsed) {
    return normalizeShape(parsed);
  }
  return normalizeShape(fallbackFromText(text));
}

/**
 * @param {string} idea
 * @param {string} prompt
 */
async function ollamaGenerate(idea, prompt) {
  const { baseUrl, model, timeoutMs } = config.ollama;
  const payload = { model, prompt, stream: false, format: 'json' };
  const res = await axios.post(`${baseUrl}/api/generate`, payload, {
    timeout: timeoutMs,
    headers: { 'Content-Type': 'application/json' },
    validateStatus: () => true,
  });
  if (res.status >= 400) {
    const res2 = await axios
      .post(
        `${baseUrl}/api/generate`,
        { model, prompt, stream: false },
        { timeout: timeoutMs, headers: { 'Content-Type': 'application/json' }, validateStatus: () => true }
      )
      .catch(() => ({ status: 500, data: {} }));
    if (res2 && res2.status < 400) {
      return parseOllamaBody(res2.data);
    }
    throw new Error(
      (res.data && (res.data.error || res.data.message) ? String(res.data.error || res.data.message) : '') || 'Ollama error'
    );
  }
  return parseOllamaBody(res.data);
}

/**
 * @param {string} idea
 * @param {string} prompt
 * @param {{ requestId?: string }} ctx
 */
async function openaiGenerate(idea, prompt, ctx) {
  const key = config.openaiApiKey;
  if (!key) {
    throw new Error('OPENAI_API_KEY not set');
  }
  const { openaiBaseUrl, openaiModel, openaiTimeoutMs } = config.ai;
  const body = {
    model: openaiModel,
    messages: [
      { role: 'system', content: 'You output only a single valid JSON object; no other text.' },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.5,
  };
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
  };
  if (openaiBaseUrl.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = process.env.OPENROUTER_REFERER || 'https://farmc.ai';
    headers['X-Title'] = 'Farm-C AI';
  }
  const res = await axios.post(`${openaiBaseUrl}/chat/completions`, body, {
    timeout: openaiTimeoutMs,
    headers,
    validateStatus: () => true,
  });
  if (res.status >= 400) {
    const msg = res.data?.error?.message || res.data?.message || res.status;
    throw new Error(`OpenAI: ${msg}`);
  }
  const text = res.data?.choices?.[0]?.message?.content;
  if (!text || typeof text !== 'string') {
    throw new Error('OpenAI: empty content');
  }
  const parsed = tryParseJsonObject(text);
  if (parsed) {
    return normalizeShape(parsed);
  }
  return normalizeShape(fallbackFromText(text));
}

/**
 * @param {string} idea
 * @param {{ requestId?: string } | undefined} ctx
 */
function meta(ctx, source, degraded, extra) {
  return { source, degraded, requestId: ctx?.requestId || undefined, ...extra };
}

/**
 * @param {string} idea
 * @param {string} prompt
 * @param {object} ctx
 */
async function runOllamaWithRetry(idea, prompt, ctx) {
  return withRetry(
    () => ollamaGenerate(idea, prompt),
    { maxAttempts: config.ai.maxRetries, baseDelayMs: 2000, maxDelayMs: 20000 }
  );
}

/**
 * @param {string} idea
 * @param {string} prompt
 * @param {object} ctx
 */
async function runOpenAIWithRetry(idea, prompt, ctx) {
  return withRetry(() => openaiGenerate(idea, prompt, ctx), {
    maxAttempts: config.ai.maxRetries,
    baseDelayMs: 2000,
    maxDelayMs: 20000,
  });
}

/**
 * @param {string} idea
 * @param {string} prompt
 * @param {{ requestId?: string } | undefined} ctx
 * @returns {Promise<{ result: ReturnType<typeof normalizeShape>, meta: object }>}
 */
async function resolveByProvider(idea, prompt, ctx) {
  const p = (config.ai.provider || 'auto').toLowerCase();
  if (p === 'openai' && !config.openaiApiKey) {
    logger.warn('AI_PROVIDER=openai but OPENAI_API_KEY is missing; using static fallback', {
      requestId: ctx?.requestId,
    });
    return {
      result: normalizeShape(fallbackAI(idea)),
      meta: meta(ctx, 'fallback', true, { reason: 'openai_key_missing' }),
    };
  }
  if (p === 'openai' && config.openaiApiKey) {
    try {
      const r = await runOpenAIWithRetry(idea, prompt, ctx);
      return { result: r, meta: meta(ctx, 'openai', false) };
    } catch (e) {
      logger.warn('OpenAI path failed, using fallback', { err: e.message, requestId: ctx?.requestId });
      return {
        result: normalizeShape(fallbackAI(idea)),
        meta: meta(ctx, 'fallback', true, { reason: String(e.message) }),
      };
    }
  }
  if (p === 'ollama') {
    try {
      const r = await runOllamaWithRetry(idea, prompt, ctx);
      return { result: r, meta: meta(ctx, 'ollama', false) };
    } catch (e) {
      logger.warn('Ollama-only path failed, using fallback', { err: e.message, requestId: ctx?.requestId });
      return {
        result: normalizeShape(fallbackAI(idea)),
        meta: meta(ctx, 'fallback', true, { reason: String(e.message) }),
      };
    }
  }
  /** auto: ollama → openai → fallback */
  try {
    const r = await runOllamaWithRetry(idea, prompt, ctx);
    return { result: r, meta: meta(ctx, 'ollama', false) };
  } catch (e1) {
    logger.warn('Ollama failed, trying OpenAI if configured', { err: e1.message, requestId: ctx?.requestId });
  }
  if (config.openaiApiKey) {
    try {
      const r = await runOpenAIWithRetry(idea, prompt, ctx);
      return { result: r, meta: meta(ctx, 'openai', false) };
    } catch (e2) {
      logger.warn('OpenAI auto fallback failed, using static fallback', { err: e2.message, requestId: ctx?.requestId });
    }
  } else {
    logger.warn('No OPENAI_API_KEY; static fallback', { requestId: ctx?.requestId });
  }
  return {
    result: normalizeShape(fallbackAI(idea)),
    meta: meta(ctx, 'fallback', true, { reason: 'all_ai_providers_exhausted' }),
  };
}

/**
 * @param {string} input
 * @param {{ requestId?: string } | undefined} ctx
 * @returns {Promise<object & { _meta?: object }>}
 * Never throws after validation. Controller may validate and return 400 for bad input.
 */
async function enhanceContent(input, ctx) {
  const safe = sanitizeIdea(String(input));
  if (!safe.ok) {
    const e = new Error('Valid input (1-8000 chars) is required');
    e.status = 400;
    throw e;
  }
  const idea = safe.value;
  const prompt = VIRAL_PROMPT.replace(/\{USER_INPUT\}/g, idea);
  try {
    const { result, meta: m } = await resolveByProvider(idea, prompt, ctx || {});
    return { ...result, _meta: m };
  } catch (err) {
    logger.error('[aiEnhancer] unexpected failure, returning static fallback', {
      err: err.message,
      stack: err.stack,
      requestId: ctx?.requestId,
    });
    return {
      ...normalizeShape(fallbackAI(idea)),
      _meta: meta(ctx, 'fallback', true, { reason: err.message || 'unexpected' }),
    };
  }
}

module.exports = { enhanceContent, tryParseJsonObject, normalizeShape, fallbackAI, sanitizeIdea: (s) => sanitizeIdea(s) };