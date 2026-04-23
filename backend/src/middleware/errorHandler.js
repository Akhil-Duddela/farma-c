const logger = require('../utils/logger');

function notFound(req, res) {
  const b = { error: 'Not found', code: 'NOT_FOUND', details: [], path: req.path };
  if (req.id) b.requestId = req.id;
  res.status(404).json(b);
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    next(err);
    return;
  }
  const status = err.status || err.statusCode || 500;
  const isProd = process.env.NODE_ENV === 'production';
  const message = err.message || 'Internal Server Error';
  if (status >= 400) {
    logger.warn('Request error', {
      err: message,
      code: err.code,
      userId: req.user && String(req.user._id),
      path: req.originalUrl || req.path,
      requestId: req.id,
    });
  }
  if (status >= 500) {
    if (isProd) {
      logger.error('Unhandled error', { err: message, requestId: req.id });
    } else {
      logger.error('Unhandled error', { err: message, stack: err.stack });
    }
  }
  const publicMessage = isProd && status >= 500 ? 'The server could not complete this request.' : message;
  const code =
    err.code && typeof err.code === 'string'
      ? err.code
      : status === 404
        ? 'NOT_FOUND'
        : status === 500
          ? 'INTERNAL_ERROR'
          : 'ERROR';
  const body = {
    error: publicMessage,
    code,
    details: Array.isArray(err.details) ? err.details : [],
  };
  if (req.id) {
    body.requestId = req.id;
  }
  if (err.retryAfterSec) {
    body.retryAfterSec = err.retryAfterSec;
  }
  if (Array.isArray(err.errors) && err.errors.length) {
    body.legacyErrors = err.errors;
  }
  if (isProd && status >= 500) {
    body.hint = 'If the problem continues, try again later or contact support with your request id.';
  } else if (status >= 500) {
    body.hint = 'If this continues, check server logs and service configuration.';
  }
  if (process.env.NODE_ENV !== 'production' && err.stack) {
    body.stack = err.stack;
  }
  res.status(status).json(body);
}

module.exports = { notFound, errorHandler };
