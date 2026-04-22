const { randomUUID } = require('crypto');
const logger = require('../utils/logger');

/**
 * Adds req.id, logs request start, and sets X-Request-Id on the response.
 */
function requestIdMiddleware(req, res, next) {
  const id = (req.get('X-Request-Id') || req.get('x-request-id') || '').trim() || randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  const start = Date.now();
  res.on('finish', () => {
    if (res.statusCode >= 500) {
      logger.error('HTTP response 5xx', { requestId: id, status: res.statusCode, method: req.method, path: req.path });
    }
  });
  if (req.path === '/health' || req.path === '/health/ready') {
    return next();
  }
  logger.debug('Request', { requestId: id, method: req.method, path: req.path });
  res.on('finish', () => {
    const ms = Date.now() - start;
    if (res.statusCode >= 400) {
      logger.info('Request finished', { requestId: id, status: res.statusCode, ms, path: req.path });
    }
  });
  next();
}

module.exports = { requestIdMiddleware };
