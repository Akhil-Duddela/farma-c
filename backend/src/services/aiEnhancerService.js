const axios = require('axios');
const config = require('../config');

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
 * @returns {ReturnType<typeof EMPTY>}
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

/**
 * Try to parse JSON from Ollama response string (may include extra text).
 * @param {string} text
 * @returns {object|null}
 */
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

/**
 * Last-resort: fill from loose key:value lines
 * @param {string} text
 */
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
 * @returns {Promise<ReturnType<typeof normalizeShape>>}
 */
async function enhanceContent(input) {
  const idea = String(input || '').trim();
  if (!idea) {
    const e = new Error('Input is required');
    e.status = 400;
    throw e;
  }
  if (idea.length > 8000) {
    const e = new Error('Input is too long (max 8000 characters)');
    e.status = 400;
    throw e;
  }

  const { baseUrl, model, timeoutMs } = config.ollama;
  const prompt = VIRAL_PROMPT.replace(/\{USER_INPUT\}/g, idea);

  const payload = {
    model,
    prompt,
    stream: false,
    format: 'json',
  };

  let res;
  try {
    res = await axios.post(`${baseUrl}/api/generate`, payload, {
      timeout: timeoutMs,
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true,
    });
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      const e = new Error(
        'Cannot reach Ollama. Start it locally (e.g. ollama serve) or set OLLAMA_BASE_URL to your Ollama host.'
      );
      e.status = 502;
      throw e;
    }
    if (err.code === 'ECONNABORTED' || err.message?.toLowerCase().includes('timeout')) {
      const e = new Error('Ollama request timed out. Try a shorter idea or increase OLLAMA_TIMEOUT_MS.');
      e.status = 504;
      throw e;
    }
    const e = new Error(err.message || 'Ollama request failed');
    e.status = 502;
    throw e;
  }

  if (res.status >= 400) {
    // Retry without format: some Ollama versions may reject format json
    try {
      const res2 = await axios.post(
        `${baseUrl}/api/generate`,
        { model, prompt, stream: false },
        { timeout: timeoutMs, headers: { 'Content-Type': 'application/json' }, validateStatus: () => true }
      );
      if (res2.status < 400) {
        return parseOllamaBody(res2.data);
      }
    } catch {
      // fall through
    }
    const msg = res.data && (res.data.error || res.data.message) ? String(res.data.error || res.data.message) : 'Ollama error';
    const e = new Error(`Ollama: ${msg}`);
    e.status = 502;
    throw e;
  }

  return parseOllamaBody(res.data);
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
  // fallback: not valid JSON but we have text
  return normalizeShape(fallbackFromText(text));
}

module.exports = { enhanceContent, tryParseJsonObject, normalizeShape };
