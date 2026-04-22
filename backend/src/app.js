const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/posts');
const instagramRoutes = require('./routes/instagram');
const logRoutes = require('./routes/logs');
const settingsRoutes = require('./routes/settings');
const analyticsRoutes = require('./routes/analytics');
const youtubeRoutes = require('./routes/youtube');

const app = express();

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

app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/instagram', instagramRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/youtube', youtubeRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
