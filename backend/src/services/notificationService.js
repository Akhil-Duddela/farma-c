const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const config = require('../config');
const User = require('../models/User');
const logger = require('../utils/logger');

let _init = false;

function initIfNeeded() {
  if (_init) {
    return;
  }
  if (admin.apps.length) {
    _init = true;
    return;
  }
  let cred;
  if (config.fcm.serviceAccountJson) {
    try {
      const raw = config.fcm.serviceAccountJson.trim();
      const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
      cred = JSON.parse(json);
    } catch (e) {
      logger.warn('FCM: invalid FIREBASE_SERVICE_ACCOUNT_JSON', { err: e.message });
      return;
    }
  } else if (config.fcm.serviceAccountPath) {
    const p = path.resolve(config.fcm.serviceAccountPath);
    if (!fs.existsSync(p)) {
      logger.warn('FCM: service account file not found', { p });
      return;
    }
    cred = JSON.parse(fs.readFileSync(p, 'utf8'));
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // Application Default Credentials (e.g. GCE, Cloud Run)
    try {
      admin.initializeApp();
      _init = true;
      return;
    } catch (e) {
      logger.warn('FCM: init with GOOGLE_APPLICATION_CREDENTIALS failed', { err: e.message });
      return;
    }
  } else {
    return;
  }
  try {
    admin.initializeApp({ credential: admin.credential.cert(cred) });
    _init = true;
    logger.info('FCM: Firebase Admin initialized');
  } catch (e) {
    logger.error('FCM: Firebase Admin init failed', { err: e.message });
  }
}

/**
 * @param {string} userId
 * @param {string[]} invalid
 */
async function removeInvalidTokens(userId, invalid) {
  if (!userId || !Array.isArray(invalid) || invalid.length === 0) {
    return;
  }
  const uniq = [...new Set(invalid.map((t) => String(t).slice(0, 4096)))];
  try {
    await User.updateOne({ _id: userId }, { $pull: { fcmTokens: { $in: uniq } } });
  } catch (e) {
    logger.warn('FCM: removeInvalidTokens', { err: e.message, userId });
  }
}

const MAX_TOKENS = 20;

/**
 * @param {import('mongoose').Types.ObjectId} userId
 * @param {{ title: string, body: string, data?: Record<string, string> }} payload
 */
async function sendToUser(userId, payload) {
  initIfNeeded();
  if (!userId) {
    return;
  }
  if (!admin.apps.length) {
    return;
  }
  const u = await User.findById(userId).select('fcmTokens').lean();
  const tokens = (u && u.fcmTokens) || [];
  if (!tokens.length) {
    return;
  }
  const data = { ...(payload.data || {}) };
  Object.keys(data).forEach((k) => {
    if (data[k] != null) {
      data[k] = String(data[k]);
    }
  });
  const messaging = admin.messaging();
  const invalid = [];
  // sendMulticast is deprecated; use sendEachForMulticast
  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500);
    try {
      const res = await messaging.sendEachForMulticast({
        tokens: batch,
        notification: { title: payload.title, body: payload.body },
        data,
        android: { priority: 'high' },
        apns: { payload: { aps: { sound: 'default' } } },
      });
      res.responses.forEach((r, idx) => {
        if (!r.success) {
          const e = r.error;
          const code = e && e.errorInfo && e.errorInfo.code;
          if (code === 'messaging/invalid-registration-token' || code === 'messaging/registration-token-not-registered') {
            invalid.push(batch[idx]);
          } else if (e) {
            logger.warn('FCM send one failed', { err: e.message, code: String(e.code) });
          }
        }
      });
    } catch (e) {
      logger.error('FCM sendEachForMulticast', { err: e.message, userId: String(userId) });
    }
  }
  if (invalid.length) {
    await removeInvalidTokens(String(userId), invalid);
  }
}

/**
 * @param {import('mongoose').Document} post
 */
async function notifyPostTerminal(post) {
  if (!post || !post.userId) {
    return;
  }
  const st = String(post.status);
  if (!['posted', 'failed', 'partial'].includes(st)) {
    return;
  }
  const id = String(post._id);
  if (st === 'posted') {
    await sendToUser(post.userId, {
      title: 'Post published',
      body: 'Your post is live on the selected platforms.',
      data: { type: 'post_success', postId: id },
    });
  } else if (st === 'failed') {
    const reason = (post.failureReason || 'Publishing failed').slice(0, 200);
    await sendToUser(post.userId, {
      title: 'Post failed',
      body: reason,
      data: { type: 'post_failed', postId: id },
    });
  } else {
    await sendToUser(post.userId, {
      title: 'Post partially published',
      body: 'One or more platforms failed. Open the app for details.',
      data: { type: 'post_success', postId: id, partial: 'true' },
    });
  }
}

/**
 * @param {import('mongoose').Types.ObjectId} userId
 * @param {'instagram' | 'youtube'} platform
 * @param {string} [label]
 */
async function sendAccountConnected(userId, platform, label = '') {
  const name = platform === 'instagram' ? 'Instagram' : 'YouTube';
  const body = label
    ? `${name} connected: ${label}`.slice(0, 300)
    : `Your ${name} account is connected.`;
  const data = { type: 'account_connected', platform: String(platform) };
  if (label) {
    data.label = String(label).slice(0, 200);
  }
  await sendToUser(userId, {
    title: 'Account connected',
    body,
    data,
  });
}

/**
 * @param {import('mongoose').Types.ObjectId} userId
 * @param {'approved' | 'rejected' | 'auto_approved'} kind
 * @param {string} [detail]
 */
async function sendVerification(userId, kind, detail = '') {
  if (kind === 'approved' || kind === 'auto_approved') {
    await sendToUser(userId, {
      title: 'Verification update',
      body: detail || 'Your creator profile is verified. You are ready to go.',
      data: { type: 'verification_approved' },
    });
  } else if (kind === 'rejected') {
    await sendToUser(userId, {
      title: 'Verification update',
      body: detail || 'Your verification request was not approved. Check the app for more info.',
      data: { type: 'verification_rejected' },
    });
  }
}

module.exports = {
  initIfNeeded,
  sendToUser,
  notifyPostTerminal,
  sendAccountConnected,
  sendVerification,
  removeInvalidTokens,
  MAX_TOKENS,
};
