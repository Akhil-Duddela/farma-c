const crypto = require('crypto');
const config = require('../config');
const { getRedis } = require('../config/redisClient');
const User = require('../models/User');
const Post = require('../models/Post');
const logger = require('../utils/logger');

const OTP_10M = 10 * 60; // sec
const OTP_1H = 3600;
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
 * @param {import('ioredis').default} r
 * @param {string} subKey
 * @param {number} ttlSec
 * @returns {Promise<number>} new count
 */
async function bumpOtp(r, subKey, ttlSec) {
  const k = `fc:otp:win:${subKey}`;
  const n = await r.incr(k);
  if (n === 1) await r.expire(k, ttlSec);
  return n;
}

/**
 * Throttle by IP (registration attempts).
 * @param {import('express').Request} req
 */
async function assertRegisterIpNotAbusive(req) {
  const ip = clientIp(req);
  if (!ip) return;
  const sub = `reg:1h:ip:${ipKey(ip)}`;
  try {
    const r = getRedis();
    await r.ping();
    const n = await bumpOtp(r, sub, 3600);
    if (n > 20) {
      const e = new Error('Too many registration attempts. Try again later.');
      e.status = 429;
      e.code = 'OTP_RATE_LIMIT';
      e.details = [];
      throw e;
    }
  } catch (e) {
    if (e.status) throw e;
    if (e.message && /ECONNREFUSED|NOREPLY/i.test(e.message)) {
      const ex = new Error('Verification service temporarily unavailable.');
      ex.status = 503;
      ex.code = 'OTP_REDIS_UNAVAILABLE';
      ex.details = [];
      throw ex;
    }
    throw e;
  }
}

/**
 * @param {object} o
 * @param {import('mongoose').Document} o.user
 * @param {string} o.phone E.164
 * @param {import('express').Request} o.req
 */
async function assertOtpRequestAllowed({ user, phone, req }) {
  if (!user || !req) {
    const e = new Error('Bad request');
    e.status = 400;
    return Promise.reject(e);
  }
  const u = user;
  if (u.otpBlockedUntil && new Date(u.otpBlockedUntil) > new Date()) {
    const e = new Error('Too many attempts. Please try again later.');
    e.status = 429;
    e.code = 'OTP_COOLDOWN';
    e.details = [];
    e.retryAfterSec = Math.ceil((new Date(u.otpBlockedUntil) - Date.now()) / 1000);
    return Promise.reject(e);
  }
  const riskTh = (config.otp && config.otp.riskBlockThreshold) || 50;
  const hBlock = (config.otp && config.otp.blockHours) || 24;
  if (typeof u.riskScore === 'number' && u.riskScore > riskTh) {
    u.otpBlockedUntil = new Date(Date.now() + hBlock * 3600 * 1000);
    await u.save();
    const e = new Error('Too many attempts. Please try again later.');
    e.status = 429;
    e.code = 'OTP_COOLDOWN';
    e.details = [{ reason: 'risk_score', riskScore: u.riskScore }];
    e.retryAfterSec = hBlock * 3600;
    return Promise.reject(e);
  }

  const ip = clientIp(req);
  const ipH = ipKey(ip);
  const phH = phone ? ipKey(phone) : 'none';
  const uid = String(u._id);
  const m10 = (config.otp && config.otp.maxPer10Min) || 3;
  const m1h = (config.otp && config.otp.maxPerHour) || 5;
  const dims = [
    { k: `10m:ip:${ipH}`, t: OTP_10M, m: m10 },
    { k: `1h:ip:${ipH}`, t: OTP_1H, m: m1h },
    { k: `10m:uid:${uid}`, t: OTP_10M, m: m10 },
    { k: `1h:uid:${uid}`, t: OTP_1H, m: m1h },
    { k: `10m:ph:${phH}`, t: OTP_10M, m: m10 },
    { k: `1h:ph:${phH}`, t: OTP_1H, m: m1h },
  ];

  let r;
  try {
    r = getRedis();
    await r.ping();
  } catch (e) {
    logger.error('Fraud: Redis down for OTP', { err: e.message });
    const ex = new Error('SMS verification is temporarily unavailable. Please try again shortly.');
    ex.status = 503;
    ex.code = 'OTP_REDIS_UNAVAILABLE';
    ex.details = [];
    throw ex;
  }

  try {
    for (const d of dims) {
      const n = await bumpOtp(r, d.k, d.t);
      if (n > d.m) {
        u.riskScore = Math.min(100, (u.riskScore || 0) + 18);
        const h = (config.otp && config.otp.blockHours) || 24;
        u.otpBlockedUntil = new Date(Date.now() + h * 3600 * 1000);
        if (u.riskScore >= 70) u.flagged = true;
        await u.save();
        logger.warn('Fraud: OTP rate limit', { userId: uid, dim: d.k, n, max: d.m });
        const err = new Error('Too many attempts. Please try again later.');
        err.status = 429;
        err.code = 'OTP_RATE_LIMIT';
        err.details = [{ key: d.k, count: n }];
        throw err;
      }
    }
  } catch (e) {
    if (e.status) throw e;
    logger.error('Fraud: assertOtpRequestAllowed', { err: e.message });
    const ex = new Error('Could not complete security checks.');
    ex.status = 500;
    ex.code = 'OTP_CHECK_FAILED';
    throw ex;
  }
}

/**
 * After SMS/OTP is accepted as sent.
 * @param {import('mongoose').Types.ObjectId} userId
 * @param {import('express').Request} [req]
 */
async function onOtpRequested(userId, req) {
  try {
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
  assertOtpRequestAllowed,
  assertRegisterIpNotAbusive,
  onPostAttempt,
  assertContentNotSpammy,
  assertUserMayPost,
  recordAuthContext,
  RISK_FLAG_THRESHOLD,
};
