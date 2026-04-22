const logger = require('../utils/logger');

function notFound(req, res) {
  res.status(404).json({ error: 'Not found', path: req.path });
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
  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}

module.exports = { notFound, errorHandler };
