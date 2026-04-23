/**
 * Prometheus metrics. Safe to require even if the registry is not exposed.
 * All increments are wrapped so scrape failures or missing prom-client never crash the app.
 */
const client = require('prom-client');

const enabled = (process.env.METRICS_ENABLED || '1') !== '0';

let httpRequestDuration;
let httpRequestsTotal;
let queueJobsTotal;
let queueJobDuration;
let otpRequestsTotal;
let otpBlockedTotal;
let aiRequestsTotal;
let aiFallbackTotal;
let publishSuccessTotal;
let publishFailTotal;
let postsCreatedTotal;
let healthUpGauge;

function safe(fn) {
  try {
    fn();
  } catch (e) {
    /* never throw from metrics */
  }
}

if (enabled) {
  try {
    /** Empty prefix = names like http_requests_total. Override with e.g. fc_ to avoid collisions. */
    const rawPre = process.env.METRICS_PREFIX;
    const prefix = rawPre === undefined ? '' : String(rawPre).replace(/_+$/, '_');
    if ((process.env.METRICS_NO_DEFAULTS || '0') !== '1') {
      client.collectDefaultMetrics();
    }

    httpRequestDuration = new client.Histogram({
      name: `${prefix}http_request_duration_seconds`,
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.03, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    });

    httpRequestsTotal = new client.Counter({
      name: `${prefix}http_requests_total`,
      help: 'Total HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
    });

    queueJobsTotal = new client.Counter({
      name: `${prefix}queue_jobs_total`,
      help: 'Bull queue jobs by final status',
      labelNames: ['queue', 'status', 'name'],
    });

    queueJobDuration = new client.Histogram({
      name: `${prefix}queue_job_duration_seconds`,
      help: 'Bull job processing time (completed jobs)',
      labelNames: ['queue', 'name'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600, 1200],
    });

    otpRequestsTotal = new client.Counter({
      name: `${prefix}otp_requests_total`,
      help: 'Allowed OTP send attempts (after limit checks pass)',
    });

    otpBlockedTotal = new client.Counter({
      name: `${prefix}otp_blocked_total`,
      help: 'OTP requests blocked (rate or risk), increment reason label',
      labelNames: ['reason'],
    });

    aiRequestsTotal = new client.Counter({
      name: `${prefix}ai_requests_total`,
      help: 'AI enhance completions by source',
      labelNames: ['source'],
    });

    aiFallbackTotal = new client.Counter({
      name: `${prefix}ai_fallback_total`,
      help: 'AI paths that used degraded/static fallback',
      labelNames: ['source'],
    });

    publishSuccessTotal = new client.Counter({
      name: `${prefix}publish_success_total`,
      help: 'Platform publish job completed successfully',
      labelNames: ['platform'],
    });

    publishFailTotal = new client.Counter({
      name: `${prefix}publish_fail_total`,
      help: 'Platform publish job failed (after retries as applicable)',
      labelNames: ['platform'],
    });

    postsCreatedTotal = new client.Counter({
      name: `${prefix}posts_created_total`,
      help: 'Posts created via API',
    });

    healthUpGauge = new client.Gauge({
      name: `${prefix}health_status_ok`,
      help: '1 if /api/health would report status ok (all critical checks pass), else 0',
    });

  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[metrics] init failed (metrics disabled)', e && e.message ? e.message : e);
  }
}

/** Normalize Express path for low-cardinality labels (replace ObjectIds, UUIDs). */
function normalizeRoute(path) {
  if (!path || path === '') return 'unknown';
  return String(path)
    .replace(/[a-f0-9]{24}/gi, ':id')
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      ':id'
    )
    .replace(/\?.*$/, '');
}

function httpObserve(method, path, statusCode, durationSec) {
  if (!httpRequestDuration || !httpRequestsTotal) return;
  const route = normalizeRoute(path);
  const sc = String(statusCode || 0);
  const m = (method || 'GET').toUpperCase();
  safe(() => {
    httpRequestDuration.observe({ method: m, route, status_code: sc }, durationSec);
    httpRequestsTotal.inc({ method: m, route, status_code: sc });
  });
}

function incQueueJob({ queue, status, name, durationSec }) {
  if (!queueJobsTotal) return;
  const n = (name && String(name).slice(0, 64)) || 'default';
  safe(() => {
    queueJobsTotal.inc({ queue, status, name: n });
    if (status === 'completed' && durationSec != null && durationSec >= 0) {
      queueJobDuration.observe({ queue, name: n }, durationSec);
    }
  });
}

function incOtpRequest() {
  if (!otpRequestsTotal) return;
  safe(() => otpRequestsTotal.inc());
}

function incOtpBlocked(reason) {
  if (!otpBlockedTotal) return;
  const r = String(reason || 'unknown').slice(0, 32);
  safe(() => otpBlockedTotal.inc({ reason: r }));
}

function incAi({ source, fallback }) {
  if (!aiRequestsTotal) return;
  const s = (source && String(source).slice(0, 24)) || 'unknown';
  safe(() => {
    aiRequestsTotal.inc({ source: s });
    if (fallback) {
      if (aiFallbackTotal) {
        aiFallbackTotal.inc({ source: s });
      }
    }
  });
}

function incPublishOutcome(platform, ok) {
  const p = platform === 'youtube' ? 'youtube' : 'instagram';
  if (ok) {
    if (publishSuccessTotal) {
      safe(() => publishSuccessTotal.inc({ platform: p }));
    }
  } else if (publishFailTotal) {
    safe(() => publishFailTotal.inc({ platform: p }));
  }
}

function incPostsCreated() {
  if (!postsCreatedTotal) return;
  safe(() => postsCreatedTotal.inc());
}

function setHealthOk(value) {
  if (!healthUpGauge) return;
  safe(() => {
    healthUpGauge.set(value ? 1 : 0);
  });
}

function getRegister() {
  return client.register;
}

module.exports = {
  isEnabled: () => enabled && !!httpRequestDuration,
  getRegister,
  httpObserve,
  incQueueJob,
  incOtpRequest,
  incOtpBlocked,
  incAi,
  incPublishOutcome,
  incPostsCreated,
  /** alias fix */
  setHealthOk,
  normalizeRoute,
};
