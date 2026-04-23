const mongoose = require('mongoose');
const config = require('../config');
const youtubeTokenService = require('../services/youtubeTokenService');
const YouTubeAccount = require('../models/YouTubeAccount');
const logService = require('../services/logService');
const { createState, consumeState, getYtPickPublic } = require('../services/oauthStateService');
const { failQueuedJobsForAccount } = require('../services/accountDisconnectService');
const logger = require('../utils/logger');

/**
 * @returns {Promise<{ id: string, channelId: string, channelTitle: string, tokenExpiresAt: Date }>}
 */
async function linkTokens(req, res, next) {
  try {
    const { accessToken, refreshToken, channelId, channelTitle } = req.body;
    const acc = await youtubeTokenService.createOrUpdateAccountFromTokens({
      userId: req.user._id,
      accessToken,
      refreshToken,
      channelId,
      channelTitle,
    });
    await logService.logEntry({ userId: req.user._id, step: 'youtube.link', message: `Channel ${acc.channelId}` });
    res.json({
      id: acc._id,
      channelId: acc.channelId,
      channelTitle: acc.channelTitle,
      tokenExpiresAt: acc.tokenExpiresAt,
    });
  } catch (e) {
    next(e);
  }
}

/**
 * Get browser OAuth URL
 */
async function authUrl(req, res) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const state = await createState('yt', req.user._id);
    const url = youtubeTokenService.getAuthUrl(state);
    const redirectUri = config.youtube.redirectUri;
    res.json({ url, redirectUri });
  } catch (e) {
    logger.error('YouTube auth-url failed', { err: e.message });
    res.status(500).json({ error: e.message || 'Config error' });
  }
}

const frontendBase = config.frontendUrl;

function oauthResultUrl(ok, errCode) {
  if (ok) {
    return `${frontendBase}/dashboard?yt=connected`;
  }
  return `${frontendBase}/dashboard?yt=error&reason=${encodeURIComponent(errCode || 'unknown')}`;
}

function pickWithKeyUrl(pickKey) {
  return `${frontendBase}/dashboard?yt=choose&key=${encodeURIComponent(pickKey)}`;
}

/**
 * Public callback
 */
async function callback(req, res) {
  const { code, state, error, error_description: errorDescription } = req.query;
  if (error) {
    const r = String(error) === 'access_denied' ? 'access_denied' : 'oauth_failed';
    logger.warn('YouTube OAuth error param', { error: String(error) });
    return res.redirect(302, oauthResultUrl(false, r));
  }
  if (!code || !state) {
    return res.redirect(302, oauthResultUrl(false, 'missing_params'));
  }
  const userId = await consumeState('yt', String(state));
  if (!userId) {
    logger.warn('YouTube OAuth invalid or expired state');
    return res.redirect(302, oauthResultUrl(false, 'invalid_state'));
  }
  if (!mongoose.Types.ObjectId.isValid(String(userId))) {
    return res.redirect(302, oauthResultUrl(false, 'invalid_state'));
  }
  try {
    const r = await youtubeTokenService.exchangeCodeForAccount(String(userId), String(code));
    if (r.type === 'choose') {
      return res.redirect(302, pickWithKeyUrl(r.pickKey));
    }
    return res.redirect(302, oauthResultUrl(true));
  } catch (e) {
    const c = e.reasonCode || (e.message && e.message.includes('No YouTube') ? 'no_youtube_channel' : 'oauth_failed');
    logger.error('YouTube OAuth callback failed', { err: e.message, reason: c });
    return res.redirect(302, oauthResultUrl(false, c));
  }
}

/**
 * GET /api/youtube/oauth-pending?key=
 */
async function oauthPending(req, res) {
  try {
    const key = String(req.query.key || '');
    if (!key) {
      return res.status(400).json({ error: 'key is required' });
    }
    const d = await getYtPickPublic(key, String(req.user._id));
    if (!d) {
      return res.status(404).json({ error: 'Expired or not found' });
    }
    res.json(d);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error' });
  }
}

/**
 * POST /api/youtube/select-channel
 * body: { pickKey, channelId: "..." }
 */
async function selectChannel(req, res) {
  try {
    const pickKey = String(req.body.pickKey || req.body.key || '').trim();
    const channelId = String(req.body.channelId || req.body.channel_id || '').trim();
    if (!pickKey || !channelId) {
      return res.status(400).json({ error: 'pickKey and channelId are required' });
    }
    const doc = await youtubeTokenService.selectChannelFromPick(String(req.user._id), pickKey, channelId);
    await logService.logEntry({ userId: req.user._id, step: 'youtube.select', message: `Channel ${doc.channelId}` });
    res.json({ ok: true, id: doc._id, channelId: doc.channelId, channelTitle: doc.channelTitle });
  } catch (e) {
    const s = e.reasonCode === 'invalid_selection' ? 400 : 500;
    logger.error('YouTube select-channel failed', { err: e.message });
    res.status(s).json({ error: e.message || 'Failed' });
  }
}

/**
 * POST /api/youtube/refresh-tokens
 */
async function refreshAll(req, res) {
  try {
    const accounts = await YouTubeAccount.find({ userId: req.user._id });
    for (const a of accounts) {
      // eslint-disable-next-line no-await-in-loop
      await youtubeTokenService.ensureFreshTokens(a);
    }
    res.json({ ok: true, total: accounts.length });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Refresh failed' });
  }
}

async function exchangeCode(req, res, next) {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'code is required' });
    const r = await youtubeTokenService.exchangeCodeForAccount(req.user._id, code);
    if (r.type === 'choose') {
      return res.status(409).json({ error: 'Channel selection required', needPick: true, pickKey: r.pickKey });
    }
    const acc = r.doc;
    res.json({ id: acc._id, channelId: acc.channelId, channelTitle: acc.channelTitle });
  } catch (e) {
    next(e);
  }
}

async function list(req, res, next) {
  try {
    const acc = await YouTubeAccount.find({ userId: req.user._id }).select(
      '-accessTokenEnc -refreshTokenEnc'
    );
    res.json(acc);
  } catch (e) {
    next(e);
  }
}

async function setDefault(req, res, next) {
  try {
    await YouTubeAccount.updateMany({ userId: req.user._id }, { $set: { isDefault: false } });
    const acc = await YouTubeAccount.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: { isDefault: true } },
      { new: true }
    ).select('-accessTokenEnc -refreshTokenEnc');
    if (!acc) return res.status(404).json({ error: 'Not found' });
    res.json(acc);
  } catch (e) {
    next(e);
  }
}

async function removeAccount(req, res, next) {
  try {
    const r = await YouTubeAccount.findOne({ _id: req.params.id, userId: req.user._id });
    if (!r) return res.status(404).json({ error: 'Not found' });
    const oid = r._id;
    await failQueuedJobsForAccount(req.user._id, 'youtube', oid);
    await YouTubeAccount.findByIdAndDelete(oid);
    await logService.logEntry({ userId: req.user._id, step: 'youtube.disconnect', message: 'Account removed' });
    logger.info('YouTube disconnected', { userId: String(req.user._id) });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

module.exports = { linkTokens, authUrl, callback, oauthPending, selectChannel, refreshAll, exchangeCode, list, setDefault, removeAccount };
