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
      require('dotenv').config({ path: p, override: true });
      return;
    }
  }
  require('dotenv').config();
})();

const requiredInProduction = (name) => {
  if (process.env.NODE_ENV === 'production' && !process.env[name]) {
    console.warn(`Warning: ${name} is not set in production`);
  }
};

requiredInProduction('MONGODB_URI');
requiredInProduction('JWT_SECRET');
requiredInProduction('ENCRYPTION_KEY');
requiredInProduction('REDIS_URL');

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
};
