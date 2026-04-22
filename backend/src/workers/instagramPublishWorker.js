/**
 * Instagram-only publish worker. Horizontally scalable; does not depend on YouTube.
 */
require('dotenv').config();
const { connectDatabase } = require('../config/database');
const { getInstagramQueue } = require('../queues');
const { executeInstagramJob } = require('../services/instagramPlatformService');
const logger = require('../utils/logger');
const config = require('../config');

async function main() {
  await connectDatabase();
  const queue = getInstagramQueue();
  const concurrency = parseInt(process.env.WORKER_CONCURRENCY || '5', 10);

  queue.process('publish', concurrency, async (job) => {
    const { postId, platform } = job.data;
    if (platform && platform !== 'instagram') {
      return { skipped: true };
    }
    logger.info('Instagram job', { postId, jobId: job.id, attempt: job.attemptsMade });
    return executeInstagramJob({ postId });
  });

  queue.on('completed', (job) => {
    logger.info('Instagram job completed', { jobId: job.id });
  });
  queue.on('failed', (job, err) => {
    logger.error('Instagram job failed', { jobId: job?.id, err: err.message, attempts: job?.attemptsMade });
  });
  logger.info(`Instagram publish worker (concurrency=${concurrency}, maxAttempts=${config.jobMaxAttempts})`);
}

main().catch((err) => {
  logger.error('Instagram worker fatal', { err: err.message });
  process.exit(1);
});
