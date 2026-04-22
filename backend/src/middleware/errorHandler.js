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
  const message = err.message || 'Internal Server Error';
  if (status >= 500) {
    logger.error('Unhandled error', { err: message, stack: err.stack });
  }
  const body = {
    error: message,
  };
  if (req.id) {
    body.requestId = req.id;
  }
  if (Array.isArray(err.errors) && err.errors.length) {
    body.errors = err.errors;
  }
  if (status >= 500) {
    body.hint = 'If this continues, check server logs and service configuration.';
  }
  if (process.env.NODE_ENV !== 'production') {
    body.stack = err.stack;
  }
  res.status(status).json(body);
}

module.exports = { notFound, errorHandler };
