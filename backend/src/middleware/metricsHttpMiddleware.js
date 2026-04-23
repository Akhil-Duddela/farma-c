const { httpObserve, normalizeRoute } = require('../observability/metrics');

/**
 * Records HTTP duration and count for Prometheus (low-cardinality route label).
 */
function metricsHttpMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const sec = Number(process.hrtime.bigint() - start) / 1e9;
    const path =
      req.route && req.baseUrl != null
        ? req.baseUrl + (req.route.path != null ? req.route.path : '')
        : normalizeRoute(req.path || '/');
    httpObserve(req.method, path, res.statusCode, sec);
  });
  next();
}

module.exports = { metricsHttpMiddleware };
