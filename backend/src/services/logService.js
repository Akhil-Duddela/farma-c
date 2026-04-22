const ActivityLog = require('../models/ActivityLog');
const logger = require('../utils/logger');

async function logEntry({ userId, postId, level = 'info', step, message, meta = {} }) {
  try {
    await ActivityLog.create({
      userId,
      postId,
      level,
      step,
      message: String(message).slice(0, 8000),
      meta,
    });
  } catch (err) {
    logger.error('Failed to persist activity log', { err: err.message, step });
  }
  const logFn = level === 'error' ? logger.error : logger.info;
  logFn(`[${step}] ${message}`, { userId: userId?.toString(), postId: postId?.toString(), ...meta });
}

/**
 * Structured platform publish log (DB + winston) for multi-platform flow.
 * @param {{ postId: import('mongoose').Types.ObjectId, userId?: import('mongoose').Types.ObjectId, platform: string, status: string, error?: string, timestamp?: string }} param0
 */
async function logPlatform({ postId, userId, platform, status, error = '' }) {
  const timestamp = new Date().toISOString();
  return logEntry({
    userId,
    postId,
    level: error ? 'error' : 'info',
    step: `platform.${platform}`,
    message: error || status,
    meta: { postId: String(postId), platform, status, error: error || null, timestamp },
  });
}

module.exports = { logEntry, logPlatform };
