/**
 * Central configuration loaded from environment variables.
 * Never commit secrets; use .env locally and a secrets manager in production.
 * Loads: cwd/.env, then backend/.env, then repo-root/.env (so `cd backend && npm start` still finds ../.env).
 */
const path = require('path');
const fs = require('fs');
(function loadEnv() {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../../.env'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      // Do not override env already set by the host (e.g. Render: NODE_ENV, FRONTEND_URL, MONGODB_URI)
      require('dotenv').config({ path: p, override: false });
      return;
    }
  }
  require('dotenv').config({ override: false });
})();

/**
 * Where the SPA lives (for OAuth return redirects, emails, etc.).
 * In production, set FRONTEND_URL to your public UI (e.g. https://farma-c-ui.onrender.com).
 * If unset, the first CORS entry is used, or a non-localhost CORS host is preferred in production
 * (so a list like "http://localhost:4200,https://app.example.com" still works).
 */
function resolveFrontendUrl() {
  const explicit = (process.env.FRONTEND_URL || '').trim().replace(/\/$/, '');
  if (explicit) {
    return explicit;
  }
  const raw = process.env.CORS_ORIGIN || 'http://localhost:4200';
  const origins = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (process.env.NODE_ENV === 'production' && origins.length) {
    const isLocal = (o) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(o);
    const notLocal = origins.find((o) => !isLocal(o));
    if (notLocal) {
      return notLocal.replace(/\/$/, '');
    }
  }
  return (origins[0] || 'http://localhost:4200').replace(/\/$/, '');
}

const frontendUrl = resolveFrontendUrl();

/**
 * CORS allow-list. In production, wildcards are rejected (see assertProductionConfig).
 * @returns {string[]}
 */
function resolveCorsOrigins() {
  const raw = process.env.CORS_ORIGIN || 'http://localhost:4200';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const corsOrigins = resolveCorsOrigins();

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/farm_c_ai',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  encryptionKey: process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    s3Bucket: process.env.AWS_S3_BUCKET || 'farm-c-ai-media',
    publicBaseUrl: process.env.AWS_S3_PUBLIC_BASE_URL || '',
  },
  instagram: {
    appId: process.env.INSTAGRAM_APP_ID || '',
    appSecret: process.env.INSTAGRAM_APP_SECRET || '',
    graphVersion: process.env.INSTAGRAM_GRAPH_VERSION || 'v21.0',
    redirectUri: process.env.INSTAGRAM_REDIRECT_URI || 'http://localhost:4000/api/instagram/callback',
  },
  youtube: {
    clientId: process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:4000/api/youtube/callback',
  },
  defaultTimezone: process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata',
  maxBulkPosts: parseInt(process.env.MAX_BULK_POSTS || '30', 10),
  jobMaxAttempts: parseInt(process.env.JOB_MAX_ATTEMPTS || '3', 10),
  jobBackoffMs: parseInt(process.env.JOB_BACKOFF_MS || '2000', 10),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:4200',
  /** Parsed CORS origins (no wildcard) */
  corsOrigins,
  /** Public SPA origin — OAuth browser redirects use this */
  frontendUrl,
  ollama: {
    baseUrl: (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, ''),
    model: process.env.OLLAMA_MODEL || 'llama3',
    /** ms */
    timeoutMs: parseInt(process.env.OLLAMA_TIMEOUT_MS || '120000', 10),
  },
  /**
   * AI_PROVIDER: ollama | openai | auto
   * auto: try Ollama → OpenAI (if key) → static fallback
   */
  ai: {
    provider: (process.env.AI_PROVIDER || 'auto').toLowerCase(),
    openaiBaseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    openaiTimeoutMs: parseInt(process.env.OPENAI_TIMEOUT_MS || '120000', 10),
    maxRetries: Math.min(4, Math.max(1, parseInt(process.env.AI_MAX_RETRIES || '2', 10) || 2)),
  },
};
