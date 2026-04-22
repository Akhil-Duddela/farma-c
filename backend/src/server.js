require('dotenv').config();
const app = require('./app');
const config = require('./config');
const { connectDatabase } = require('./config/database');
const logger = require('./utils/logger');
const postService = require('./services/postService');
const { getInstagramQueue, getYoutubeQueue } = require('./queues');
const { executeInstagramJob } = require('./services/instagramPlatformService');
const { executeYoutubeJob } = require('./services/youtubePlatformService');
const { startDailyPostsCron } = require('./services/dailyPostsService');

async function start() {
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
    logger.info('Bull processors attached to API (Instagram + YouTube)');
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
