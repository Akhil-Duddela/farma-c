const logger = require('../utils/logger');

function notFound(req, res) {
  const b = { error: 'Not found', path: req.path };
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
  if (status >= 500) {
    if (isProd) {
      logger.error('Unhandled error', { err: message, requestId: req.id });
    } else {
      logger.error('Unhandled error', { err: message, stack: err.stack });
    }
  }
  const publicMessage = isProd && status >= 500 ? 'The server could not complete this request.' : message;
  const body = {
    error: publicMessage,
  };
  if (req.id) {
    body.requestId = req.id;
  }
  if (Array.isArray(err.errors) && err.errors.length) {
    body.errors = err.errors;
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
