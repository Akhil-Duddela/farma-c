require('dotenv').config();
/**
 * Sentry APM: must load before app (which loads express) when SENTRY_DSN is set.
 * Fails open if Sentry throws.
 */
require('./instrument');
const { assertProductionConfig } = require('./config/assertProductionConfig');
const app = require('./app');
const config = require('./config');
const { connectDatabase } = require('./config/database');
const logger = require('./utils/logger');

process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', { err: String(reason) });
});
process.on('uncaughtException', (err) => {
  logger.error('uncaughtException', { err: err.message, stack: err.stack });
  process.exit(1);
});
const postService = require('./services/postService');
const { getInstagramQueue, getYoutubeQueue, getAIGenerationQueue, getVideoGenerationQueue } = require('./queues');
const { processAIJob, processVideoJob } = require('./services/automationPipelineService');
const { executeInstagramJob } = require('./services/instagramPlatformService');
const { executeYoutubeJob } = require('./services/youtubePlatformService');
const { startDailyPostsCron } = require('./services/dailyPostsService');

function logProductionConfigWarnings() {
  if (config.env !== 'production') {
    return;
  }
  for (const name of ['MONGODB_URI', 'JWT_SECRET', 'ENCRYPTION_KEY', 'REDIS_URL']) {
    if (!process.env[name]) {
      logger.warn(`Environment ${name} is not set in production`, { service: 'config' });
    }
  }
  if (/localhost|127\.0\.0\.1/.test(config.frontendUrl || '')) {
    logger.warn('FRONTEND_URL / CORS may still point to localhost; set FRONTEND_URL for OAuth in production', {
      frontendUrl: config.frontendUrl,
    });
  }
}

async function start() {
  assertProductionConfig();
  logProductionConfigWarnings();
  await connectDatabase();

  try {
    const n = await postService.recoverMissedScheduledJobs();
    if (n) logger.info(`Startup: re-queued ${n} due scheduled posts`);
  } catch (err) {
    logger.warn('Startup recovery failed', { err: err.message });
  }

  if (process.env.RUN_QUEUE_IN_API === 'true') {
    const conc = parseInt(process.env.WORKER_CONCURRENCY || '3', 10);
    const igQ = getInstagramQueue();
    igQ.process('publish', conc, async (job) => {
      if (job.data.platform && job.data.platform !== 'instagram') return { skipped: true };
      return executeInstagramJob({ postId: job.data.postId });
    });
    const ytQ = getYoutubeQueue();
    ytQ.process('publish', Math.max(1, Math.floor(conc / 2)), async (job) => {
      if (job.data.platform && job.data.platform !== 'youtube') return { skipped: true };
      return executeYoutubeJob({ postId: job.data.postId });
    });
    const autoConc = Math.max(1, parseInt(process.env.AUTOMATION_WORKER_CONCURRENCY || '2', 10));
    getAIGenerationQueue().process('enhance', autoConc, processAIJob);
    getVideoGenerationQueue().process('render', 1, processVideoJob);
    logger.info('Bull processors attached to API (Instagram + YouTube + automation)');
  }

  startDailyPostsCron();

  app.listen(config.port, () => {
    logger.info(`Farm-C AI API listening on port ${config.port}`);
  });
}

start().catch((err) => {
  logger.error('Server failed to start', { err: err.message });
  process.exit(1);
});
