const crypto = require('crypto');
const { getRedis } = require('../config/redisClient');
const { encrypt, decrypt } = require('../utils/encryption');
const logger = require('../utils/logger');

const STATE_TTL_SEC = 600;
const PICK_TTL_SEC = 900;
const KEY_STATE_IG = 'ig';
const KEY_STATE_YT = 'yt';
const KEY_PICK_IG = 'igpick';
const KEY_PICK_YT = 'ytpick';

/**
 * Opaque state for OAuth (Facebook / Google). Value = userId string.
 * @param {'ig'|'yt'} kind
 * @param {import('mongoose').Types.ObjectId|string} userId
 * @returns {Promise<string>} state to pass to provider
 */
async function createState(kind, userId) {
  const prefix = kind === 'yt' ? KEY_STATE_YT : KEY_STATE_IG;
  const state = crypto.randomBytes(32).toString('hex');
  const key = `oauth:st:${prefix}:${state}`;
  await getRedis().setex(key, STATE_TTL_SEC, String(userId));
  logger.info('OAuth state created', { kind, stateLen: state.length });
  return state;
}

/**
 * @param {'ig'|'yt'} kind
 * @param {string} state
 * @returns {Promise<string|null>} userId
 */
async function consumeState(kind, state) {
  const s = String(state || '').trim();
  if (!/^[a-f0-9]{64}$/i.test(s)) {
    logger.warn('OAuth state invalid format', { kind });
    return null;
  }
  const prefix = kind === 'yt' ? KEY_STATE_YT : KEY_STATE_IG;
  const key = `oauth:st:${prefix}:${s}`;
  const r = await getRedis().get(key);
  if (!r) {
    logger.warn('OAuth state missing or expired', { kind });
    return null;
  }
  await getRedis().del(key);
  logger.info('OAuth state consumed', { kind });
  return r;
}

/**
 * Store multiple Instagram page/IG options after OAuth; user must call select-account.
 * @returns {Promise<string>} pickKey
 */
async function storeIgPickOptions(userId, options) {
  const pickKey = crypto.randomBytes(24).toString('hex');
  const raw = JSON.stringify({
    v: 1,
    userId: String(userId),
    options: options.map((o) => ({
      pageId: o.pageId,
      igUserId: o.igUserId,
      username: o.username || '',
      pageToken: o.pageToken,
      profilePictureUrl: o.profilePictureUrl || '',
    })),
  });
  const blob = encrypt(raw);
  await getRedis().setex(`${KEY_PICK_IG}:${pickKey}`, PICK_TTL_SEC, blob);
  logger.info('Instagram multi-account pick stored', { userId: String(userId) });
  return pickKey;
}

/**
 * @param {string} pickKey
 * @param {string} userId
 * @returns {Promise<null|{ options: { pageId: string, igUserId: string, username: string, pageToken: string }[] }>}
 */
async function getIgPick(pickKey, userId) {
  const k = String(pickKey || '').trim();
  if (!/^[a-f0-9]+$/i.test(k) || k.length < 16) return null;
  const blob = await getRedis().get(`${KEY_PICK_IG}:${k}`);
  if (!blob) return null;
  let payload;
  try {
    const raw = decrypt(blob);
    payload = JSON.parse(raw);
  } catch (e) {
    logger.error('ig pick decrypt failed', { err: e.message });
    return null;
  }
  if (String(payload.userId) !== String(userId)) {
    return null;
  }
  return { options: payload.options, pickKey: k };
}

/**
 * @param {string} pickKey
 * @param {string} userId
 * @param {string} igUserId
 * @returns {Promise<null|{ pageId, igUserId, username, pageToken }>}
 */
async function consumeIgPick(pickKey, userId, igUserId) {
  const g = await getIgPick(pickKey, userId);
  if (!g) return null;
  const opt = g.options.find((o) => o.igUserId === String(igUserId));
  if (!opt) return null;
  await getRedis().del(`${KEY_PICK_IG}:${pickKey}`);
  return {
    pageId: opt.pageId,
    igUserId: opt.igUserId,
    username: opt.username,
    pageToken: opt.pageToken,
    profilePictureUrl: opt.profilePictureUrl || '',
  };
}

/**
 * @param {string} userId
 * @param {string} accessToken
 * @param {string} [refreshToken]
 * @param {{ channelId: string, title: string, thumb?: string }[]} channels
 */
async function storeYtPickOptions(userId, accessToken, refreshToken, channels) {
  const pickKey = crypto.randomBytes(24).toString('hex');
  const raw = JSON.stringify({
    v: 1,
    userId: String(userId),
    accessToken,
    refreshToken: refreshToken || '',
    channels,
  });
  const blob = encrypt(raw);
  await getRedis().setex(`${KEY_PICK_YT}:${pickKey}`, PICK_TTL_SEC, blob);
  logger.info('YouTube multi-channel pick stored', { userId: String(userId), n: channels.length });
  return pickKey;
}

async function getYtPick(pickKey, userId) {
  const k = String(pickKey || '').trim();
  if (!/^[a-f0-9]+$/i.test(k) || k.length < 16) return null;
  const blob = await getRedis().get(`${KEY_PICK_YT}:${k}`);
  if (!blob) return null;
  let payload;
  try {
    payload = JSON.parse(decrypt(blob));
  } catch (e) {
    return null;
  }
  if (String(payload.userId) !== String(userId)) return null;
  return { ...payload, pickKey: k };
}

async function consumeYtPick(pickKey, userId, channelId) {
  const g = await getYtPick(pickKey, userId);
  if (!g) return null;
  const ch = g.channels.find((c) => c.channelId === String(channelId));
  if (!ch) return null;
  await getRedis().del(`${KEY_PICK_YT}:${pickKey}`);
  return {
    accessToken: g.accessToken,
    refreshToken: g.refreshToken,
    channelId: ch.channelId,
    channelTitle: ch.title || ch.channelTitle || '',
    thumbnailUrl: ch.thumb || ch.thumbnailUrl || '',
  };
}

/**
 * Safe for browser: no tokens.
 * @param {string} pickKey
 * @param {string} userId
 * @returns {Promise<null|{ pickKey: string, accounts: { accountId: string, pageId: string, username: string, profilePicture: string }[] }>}
 */
async function getIgPickPublic(pickKey, userId) {
  const g = await getIgPick(pickKey, userId);
  if (!g) return null;
  return {
    pickKey: g.pickKey,
    accounts: (g.options || []).map((o) => ({
      accountId: String(o.igUserId),
      pageId: String(o.pageId),
      username: o.username || '',
      profilePicture: o.profilePictureUrl || '',
    })),
  };
}

/**
 * @param {string} pickKey
 * @param {string} userId
 * @returns {Promise<null|{ pickKey: string, channels: { channelId: string, title: string, thumb: string }[] }>}
 */
async function getYtPickPublic(pickKey, userId) {
  const p = await getYtPick(pickKey, userId);
  if (!p) return null;
  return {
    pickKey: p.pickKey,
    channels: (p.channels || []).map((c) => ({
      channelId: c.channelId,
      title: c.title || c.channelTitle || 'Channel',
      thumb: c.thumb || c.thumbnailUrl || '',
    })),
  };
}

module.exports = {
  createState,
  consumeState,
  storeIgPickOptions,
  getIgPick,
  consumeIgPick,
  storeYtPickOptions,
  getYtPick,
  consumeYtPick,
  getIgPickPublic,
  getYtPickPublic,
  KEY_STATE_IG,
  KEY_STATE_YT,
};
