const config = require('./index');
const logger = require('../utils/logger');

const REQUIRED_IN_PROD = [
  'MONGODB_URI',
  'JWT_SECRET',
  'ENCRYPTION_KEY',
  'REDIS_URL',
  'CORS_ORIGIN',
];

/**
 * Terminate the process if production security requirements are not met.
 * Call after dotenv and before listen().
 */
function assertProductionConfig() {
  if (config.env !== 'production') {
    return;
  }
  for (const name of REQUIRED_IN_PROD) {
    if (!process.env[name] || !String(process.env[name]).trim()) {
      logger.error(`FATAL: ${name} is required in production`, { service: 'startup' });
      process.exit(1);
    }
  }
  const raw = String(process.env.CORS_ORIGIN || '');
  if (raw.includes('*')) {
    logger.error('FATAL: CORS_ORIGIN must not use wildcard * in production', { service: 'startup' });
    process.exit(1);
  }
  for (const o of config.corsOrigins) {
    if (o === '*' || o.startsWith('http://*') || o.startsWith('https://*')) {
      logger.error('FATAL: CORS must list explicit https origins, not wildcards', { service: 'startup' });
      process.exit(1);
    }
  }
  const j = config.jwtSecret;
  if (!j || j === 'dev-only-change-me' || (typeof j === 'string' && j.length < 32)) {
    logger.error('FATAL: JWT_SECRET must be a strong value (at least 32 characters) in production', {
      service: 'startup',
    });
    process.exit(1);
  }
  const e = String(config.encryptionKey || '');
  if (e === '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' || e.length < 32) {
    logger.error('FATAL: set ENCRYPTION_KEY in production to a new random 64 hex characters (32 bytes), not the dev default', {
      service: 'startup',
    });
    process.exit(1);
  }
}

module.exports = { assertProductionConfig, REQUIRED_IN_PROD };
