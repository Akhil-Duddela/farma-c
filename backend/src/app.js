const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const config = require('./config');
let Sentry = null;
try {
  if ((process.env.SENTRY_DSN || '').trim()) {
    Sentry = require('@sentry/node');
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error('[app] @sentry/node load failed', e && e.message);
}
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { requestIdMiddleware } = require('./middleware/requestId');
const { metricsHttpMiddleware } = require('./middleware/metricsHttpMiddleware');
const { requireHttps } = require('./middleware/requireHttps');
const metricsRoutes = require('./routes/metrics');
const { connectState } = require('./config/healthState');

const healthApiRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/posts');
const instagramRoutes = require('./routes/instagram');
const logRoutes = require('./routes/logs');
const settingsRoutes = require('./routes/settings');
const analyticsRoutes = require('./routes/analytics');
const youtubeRoutes = require('./routes/youtube');
const uploadRoutes = require('./routes/upload');
const aiRoutes = require('./routes/aiRoutes');
const automationRoutes = require('./routes/automationRoutes');
const accountsRoutes = require('./routes/accounts');
const profileRoutes = require('./routes/profile');
const adminRoutes = require('./routes/admin');
const userPlatformRoutes = require('./routes/users');
const notificationRoutes = require('./routes/notifications');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(requestIdMiddleware);
app.use(requireHttps);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }
      if (config.corsOrigins.length === 0) {
        return callback(null, false);
      }
      if (config.corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '12mb' }));
app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));

const oneMinute = 60 * 1000;
const fifteen = 15 * 60 * 1000;
const isProd = config.env === 'production';
const keyFromUser = (req) => (req.user?._id ? `u:${String(req.user._id)}` : `ip:${req.ip}`);

const limiterAI = rateLimit({
  windowMs: oneMinute,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyFromUser,
});
const limiterPosts = rateLimit({
  windowMs: oneMinute,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyFromUser,
});
const limiterDefault = rateLimit({
  windowMs: fifteen,
  max: isProd ? 300 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyFromUser,
});

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'farm-c-ai-backend', env: config.env });
});

app.get('/health/ready', (req, res) => {
  if (connectState.mongoose === 1) {
    return res.json({ ok: true, ready: true, db: 'connected' });
  }
  return res.status(503).json({
    ok: false,
    ready: false,
    db: connectState.mongoose === 2 ? 'connecting' : 'disconnected',
  });
});

/**
 * Prometheus metrics (set METRICS_BEARER in production; scrape from private network or VPN).
 * Not under /api so standard Prometheus k8s annotations work.
 */
app.use('/metrics', limiterDefault, metricsRoutes);

/** Unauthenticated: ops / load balancers (Render, UptimeRobot) */
app.use('/api/health', limiterDefault, healthApiRoutes);

app.use('/api/ai', limiterAI, aiRoutes);
app.use('/api/users', limiterDefault, userPlatformRoutes);
app.use('/api/notifications', limiterDefault, notificationRoutes);
app.use('/api/posts', limiterPosts, postRoutes);
app.use('/api/auth', limiterDefault, authRoutes);
app.use('/api/accounts', limiterDefault, accountsRoutes);
app.use('/api/profile', limiterDefault, profileRoutes);
app.use('/api/instagram', limiterDefault, instagramRoutes);
app.use('/api/logs', limiterDefault, logRoutes);
app.use('/api/settings', limiterDefault, settingsRoutes);
app.use('/api/analytics', limiterDefault, analyticsRoutes);
app.use('/api/youtube', limiterDefault, youtubeRoutes);
app.use('/api/upload', limiterDefault, uploadRoutes);
app.use('/api/automation', limiterDefault, automationRoutes);
app.use('/api/admin', limiterDefault, adminRoutes);

app.use(notFound);
if (Sentry && typeof Sentry.setupExpressErrorHandler === 'function') {
  try {
    Sentry.setupExpressErrorHandler(app);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[app] Sentry setupExpressErrorHandler failed', e && e.message);
  }
}
app.use(errorHandler);

module.exports = app;
