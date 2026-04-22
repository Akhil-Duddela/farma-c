const config = require('../config');
const logger = require('../utils/logger');

/**
 * In production, require HTTPS (or a trusted proxy with X-Forwarded-Proto: https).
 * Skips for localhost/127.0.0.1 to allow local development.
 * @type {import('express').RequestHandler}
 */
function requireHttps(req, res, next) {
  if (config.env !== 'production' || process.env.ALLOW_HTTP_IN_PRODUCTION === 'true') {
    return next();
  }
  const host = req.hostname || '';
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) {
    return next();
  }
  const secure =
    req.secure ||
    (req.get('X-Forwarded-Proto') || req.get('x-forwarded-proto') || '')
      .toLowerCase()
      .split(',')[0]
      .trim() === 'https';
  if (secure) {
    return next();
  }
  logger.warn('Rejected non-HTTPS request', { requestId: req.id, path: req.path, ip: req.ip });
  return res.status(403).json({ error: 'HTTPS is required' });
}

module.exports = { requireHttps };
