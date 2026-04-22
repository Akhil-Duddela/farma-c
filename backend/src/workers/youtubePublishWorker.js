/**
 * YouTube Shorts upload worker. Independent of Instagram; uses YouTube Data API v3.
 */
require('dotenv').config();
const { connectDatabase } = require('../config/database');
const { getYoutubeQueue } = require('../queues');
const { executeYoutubeJob } = require('../services/youtubePlatformService');
const logger = require('../utils/logger');
const config = require('../config');

async function main() {
  await connectDatabase();
  const queue = getYoutubeQueue();
  const concurrency = parseInt(process.env.WORKER_CONCURRENCY || '2', 10);

  queue.process('publish', concurrency, async (job) => {
    const { postId, platform } = job.data;
    if (platform && platform !== 'youtube') {
      return { skipped: true };
    }
    logger.info('YouTube job', { postId, jobId: job.id, attempt: job.attemptsMade });
    return executeYoutubeJob({ postId });
  });

  queue.on('completed', (job) => {
    logger.info('YouTube job completed', { jobId: job.id });
  });
  queue.on('failed', (job, err) => {
    logger.error('YouTube job failed', { jobId: job?.id, err: err.message, attempts: job?.attemptsMade });
  });
  logger.info(`YouTube publish worker (concurrency=${concurrency}, maxAttempts=${config.jobMaxAttempts})`);
}

main().catch((err) => {
  logger.error('YouTube worker fatal', { err: err.message });
  process.exit(1);
});
