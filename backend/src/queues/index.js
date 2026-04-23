const Queue = require('bull');
const config = require('../config');
const DeadLetterJob = require('../models/DeadLetterJob');
const logger = require('../utils/logger');

const SLOW_MS = Math.max(10000, parseInt(process.env.SLOW_JOB_LOG_MS || '120000', 10) || 120000);

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
    settings: {
      lockDuration: 120000,
      stalledInterval: 60000,
    },
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
  q.on('active', (job) => {
    if (job && !job._fcT0) {
      job._fcT0 = Date.now();
    }
  });
  q.on('completed', (job) => {
    if (!job) {
      return;
    }
    const t =
      (job.finishedOn && job.processedOn
        ? job.finishedOn - job.processedOn
        : job.finishedOn && job._fcT0
          ? job.finishedOn - job._fcT0
          : 0) || 0;
    if (t > SLOW_MS) {
      logger.warn('Queue job slow', { queue: name, id: String(job.id), name: job.name, durationMs: t });
    }
  });
  q.on('stalled', (job) => {
    const id = job && typeof job === 'object' && 'id' in job ? job.id : job;
    logger.error('Queue job stalled', { queue: name, id: id != null ? String(id) : 'unknown' });
  });
  q.on('failed', createDeadLetterHandler(name));
  queueCache.set(name, q);
  return q;
}

const QUEUE_IG = 'instagram-publish';
const QUEUE_YT = 'youtube-publish';
const QUEUE_AI = 'ai-generation';
const QUEUE_VID = 'video-generation';

function getInstagramQueue() {
  return getQueue(QUEUE_IG);
}

function getYoutubeQueue() {
  return getQueue(QUEUE_YT);
}

function getAIGenerationQueue() {
  return getQueue(QUEUE_AI);
}

function getVideoGenerationQueue() {
  return getQueue(QUEUE_VID);
}

module.exports = {
  getQueue,
  getInstagramQueue,
  getYoutubeQueue,
  getAIGenerationQueue,
  getVideoGenerationQueue,
  QUEUE_IG,
  QUEUE_YT,
  QUEUE_AI,
  QUEUE_VID,
};
