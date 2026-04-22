const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { requestIdMiddleware } = require('./middleware/requestId');
const { connectState } = require('./config/healthState');

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

const app = express();
app.set('trust proxy', 1);
app.use(requestIdMiddleware);
app.use(helmet());
app.use(
  cors({
    origin: config.corsOrigin.split(',').map((s) => s.trim()),
    credentials: true,
  })
);
app.use(express.json({ limit: '12mb' }));
app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.env === 'production' ? 300 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

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

app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/instagram', instagramRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/youtube', youtubeRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/automation', automationRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
