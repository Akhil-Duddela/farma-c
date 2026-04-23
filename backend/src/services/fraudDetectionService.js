const crypto = require('crypto');
const { getRedis } = require('../config/redisClient');
const User = require('../models/User');
const Post = require('../models/Post');
const logger = require('../utils/logger');

const OTP_WINDOW_SEC = 3600;
const MAX_OTP_PER_HOUR = 6;
const POST_WINDOW_SEC = 3600;
const MAX_POSTS_PER_HOUR = 40;
const MAX_ACCOUNTS_PER_IP = 4;
const DUPLICATE_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const RISK_FLAG_THRESHOLD = 75;

/**
 * @param {import('express').Request} req
 * @returns {string}
 */
function clientIp(req) {
  if (!req) return '';
  const xf = req.headers['x-forwarded-for'];
  if (xf && typeof xf === 'string') {
    return xf.split(',')[0].trim() || req.ip || '';
  }
  return (req.ip || '').replace('::ffff:', '') || '';
}

/**
 * @param {import('express').Request} req
 * @returns {string}
 */
function deviceFingerprint(req) {
  if (!req) return '';
  const h = req.headers['x-device-fingerprint'] || req.headers['x-fc-device-id'];
  return (h && String(h).slice(0, 128)) || '';
}

function ipKey(ip) {
  if (!ip) return 'none';
  return crypto.createHash('sha256').update(String(ip)).digest('hex').slice(0, 32);
}

/**
 * Non-blocking: link user to IP in Redis for multi-account detection.
 * @param {import('mongoose').Types.ObjectId} userId
 * @param {string} ip
 */
async function recordAuthContext(userId, ip) {
  if (!ip) return;
  const key = `fc:fraud:ip:users:${ipKey(ip)}`;
  try {
    const r = getRedis();
    await r.sadd(key, String(userId));
    await r.expire(key, 30 * 24 * 3600);
    const n = await r.scard(key);
    if (n > MAX_ACCOUNTS_PER_IP) {
      const u = await User.findById(userId);
      if (u && !u.flagged) {
        u.riskScore = Math.min(100, (u.riskScore || 0) + 20);
        if (u.riskScore >= RISK_FLAG_THRESHOLD) {
          u.flagged = true;
        }
        u.lastActiveIp = ip;
        await u.save();
        logger.warn('Fraud: multiple users from IP bucket', { userId, ip: ipKey(ip), accounts: n });
      }
    }
  } catch (e) {
    logger.error('Fraud: recordAuthContext', { err: e.message });
  }
}

/**
 * @param {import('mongoose').Types.ObjectId} userId
 * @param {string} [ip]
 */
async function onLogin(userId, ip) {
  try {
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          lastActiveIp: ip || '',
        },
      }
    );
    await recordAuthContext(userId, ip);
  } catch (e) {
    logger.error('Fraud: onLogin', { err: e.message });
  }
}

/**
 * @param {import('mongoose').Types.ObjectId} userId
 * @param {import('express').Request} [req]
 */
async function onOtpRequested(userId, req) {
  const key = `fc:fraud:otp:uid:${userId}`;
  try {
    const r = getRedis();
    const n = await r.incr(key);
    if (n === 1) await r.expire(key, OTP_WINDOW_SEC);
    if (n > MAX_OTP_PER_HOUR) {
      const u = await User.findById(userId);
      if (u) {
        u.riskScore = Math.min(100, (u.riskScore || 0) + 15);
        if (u.riskScore >= 70) u.flagged = true;
        await u.save();
        logger.warn('Fraud: rapid OTP', { userId, count: n });
      }
    }
    if (req) {
      const ip = clientIp(req);
      if (ip) {
        await User.updateOne(
          { _id: userId },
          { $set: { lastActiveIp: ip, lastDeviceFingerprint: deviceFingerprint(req) } }
        );
        await recordAuthContext(userId, ip);
      }
    }
  } catch (e) {
    logger.error('Fraud: onOtpRequested', { err: e.message });
  }
}

/**
 * Rate-limit post creation per user.
 * @param {import('mongoose').Types.ObjectId} userId
 * @param {import('express').Request} [req]
 */
async function onPostAttempt(userId, req) {
  const key = `fc:fraud:post:uid:${userId}`;
  try {
    const r = getRedis();
    const n = await r.incr(key);
    if (n === 1) await r.expire(key, POST_WINDOW_SEC);
    if (n > MAX_POSTS_PER_HOUR) {
      const e = new Error('Posting rate limit — try again later');
      e.status = 429;
      e.code = 'FRAUD_RATE';
      throw e;
    }
    if (req) {
      const ip = clientIp(req);
      if (ip) {
        await User.updateOne(
          { _id: userId },
          { $set: { lastActiveIp: ip, lastDeviceFingerprint: deviceFingerprint(req) } }
        );
      }
    }
  } catch (e) {
    if (e.status) throw e;
    logger.error('Fraud: onPostAttempt', { err: e.message });
  }
}

/**
 * Detect duplicate or near-duplicate content for same user (spam).
 * @param {import('mongoose').Types.ObjectId} userId
 * @param {string} text
 * @param {string} [existingHash]
 */
/**
 * @param {import('mongoose').Types.ObjectId} userId
 * @param {string} text
 * @param {string} [existingHash]
 * @param {import('mongoose').Types.ObjectId} [excludePostId]
 * @returns {Promise<string>} content hash
 */
async function assertContentNotSpammy(userId, text, existingHash, excludePostId) {
  const t = (text && String(text).trim()) || '';
  const h =
    (existingHash && String(existingHash).trim()) || crypto.createHash('sha256').update(t).digest('hex');
  if (t.length < 8) {
    return h;
  }
  const since = new Date(Date.now() - DUPLICATE_LOOKBACK_MS);
  const q = {
    userId,
    contentHash: h,
    createdAt: { $gte: since },
  };
  if (excludePostId) {
    q._id = { $ne: excludePostId };
  }
  const dup = await Post.findOne(q)
    .select('_id')
    .lean();
  if (dup) {
    const u = await User.findById(userId);
    if (u) {
      u.riskScore = Math.min(100, (u.riskScore || 0) + 12);
      if (u.riskScore >= 85) u.flagged = true;
      await u.save();
    }
    const e = new Error('Duplicate content detected. Edit your caption or wait before re-posting.');
    e.status = 400;
    e.code = 'DUPLICATE_CONTENT';
    throw e;
  }
  return h;
}

/**
 * @param {import('mongoose').Document} user
 * @param {{ reverifyMessage?: string }} [opts]
 */
function assertUserMayPost(user, opts = {}) {
  if (!user) {
    const e = new Error('Unauthorized');
    e.status = 401;
    throw e;
  }
  if (user.role === 'admin') {
    return;
  }
  if (user.flagged) {
    const e = new Error(
      opts.reverifyMessage ||
        'Account restricted for security review. Contact support or complete re-verification.'
    );
    e.status = 403;
    e.code = 'FRAUD_RESTRICTION';
    throw e;
  }
}

module.exports = {
  clientIp,
  deviceFingerprint,
  onLogin,
  onOtpRequested,
  onPostAttempt,
  assertContentNotSpammy,
  assertUserMayPost,
  recordAuthContext,
  RISK_FLAG_THRESHOLD,
};
