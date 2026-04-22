const Queue = require('bull');
const config = require('../config');
const DeadLetterJob = require('../models/DeadLetterJob');
const logger = require('../utils/logger');

const queueCache = new Map();

function createDeadLetterHandler(queueName) {
  return async (job, err) => {
    const max = job.opts.attempts || config.jobMaxAttempts;
    if (job.attemptsMade >= max) {
      try {
        await DeadLetterJob.create({
          queueName,
          jobId: String(job.id),
          name: job.name,
          data: job.data,
          failedReason: err?.message || String(err),
          attemptsMade: job.attemptsMade,
        });
      } catch (e) {
        logger.error('Dead letter persist failed', { err: e.message, queueName });
      }
    }
  };
}

/**
 * @param {string} name  Bull queue name
 */
function getQueue(name) {
  if (queueCache.has(name)) {
    return queueCache.get(name);
  }
  const q = new Queue(name, config.redisUrl, {
    defaultJobOptions: {
      attempts: config.jobMaxAttempts,
      backoff: { type: 'exponential', delay: config.jobBackoffMs },
      removeOnComplete: 200,
      removeOnFail: false,
    },
  });
  q.on('error', (err) => {
    logger.error(`Redis/Bull queue error [${name}]`, { err: err.message });
  });
  q.on('failed', createDeadLetterHandler(name));
  queueCache.set(name, q);
  return q;
}

const QUEUE_IG = 'instagram-publish';
const QUEUE_YT = 'youtube-publish';

function getInstagramQueue() {
  return getQueue(QUEUE_IG);
}

function getYoutubeQueue() {
  return getQueue(QUEUE_YT);
}

module.exports = { getQueue, getInstagramQueue, getYoutubeQueue, QUEUE_IG, QUEUE_YT };
