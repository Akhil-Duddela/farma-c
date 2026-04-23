const { randomUUID } = require('crypto');
const logger = require('../utils/logger');
const { runWithRequestContext } = require('../observability/requestContext');

/**
 * Adds req.id, per-request `req.log` (correlated JSON in prod), and X-Request-Id.
 * Also installs AsyncLocalStorage for middleware that run inside this stack (sync chain).
 */
function requestIdMiddleware(req, res, next) {
  const id = (req.get('X-Request-Id') || req.get('x-request-id') || '').trim() || randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  // Structured logs with requestId; prefer req.log in route handlers to avoid async context loss.
  req.log = logger.child({ requestId: id, method: req.method, path: req.path || '' });
  const start = Date.now();
  return runWithRequestContext({ requestId: id, method: req.method, path: req.path || '' }, () => {
    res.on('finish', () => {
      if (res.statusCode >= 500) {
        logger.error('HTTP response 5xx', {
          requestId: id,
          status: res.statusCode,
          method: req.method,
          path: req.path,
        });
      }
    });
    if (req.path === '/health' || req.path === '/health/ready' || req.path === '/metrics') {
      return next();
    }
    logger.debug('Request', { requestId: id, method: req.method, path: req.path });
    res.on('finish', () => {
      const ms = Date.now() - start;
      if (res.statusCode >= 400) {
        logger.info('Request finished', { requestId: id, status: res.statusCode, ms, path: req.path });
      }
    });
    return next();
  });
}

module.exports = { requestIdMiddleware };
