const mongoose = require('mongoose');
const config = require('../config');
const youtubeTokenService = require('../services/youtubeTokenService');
const YouTubeAccount = require('../models/YouTubeAccount');
const logService = require('../services/logService');

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
 * Get browser OAuth URL (user opens in frontend). State is included in the Google URL
 * and echoed on redirect to /callback so the code exchange is tied to this user.
 */
function authUrl(req, res) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const state = `uid:${req.user._id}`;
    const url = youtubeTokenService.getAuthUrl(state);
    /** Must match an entry in Google Cloud → OAuth client → Authorized redirect URIs (exact) */
    const redirectUri = config.youtube.redirectUri;
    res.json({ url, state, redirectUri });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Config error' });
  }
}

const frontendBase =
  process.env.FRONTEND_URL ||
  (() => {
    const o = (config.corsOrigin || 'http://localhost:4200').split(',')[0];
    return o.trim() || 'http://localhost:4200';
  })();

/**
 * Google redirect after consent — must match YOUTUBE_REDIRECT_URI (e.g. .../api/youtube/callback).
 * Public: no JWT; user is identified by `state` (uid) from the auth URL.
 */
async function callback(req, res) {
  const { code, state, error, error_description: errorDescription } = req.query;
  const deny = (msg) => res.redirect(302, `${frontendBase}/dashboard?youtube=error&reason=${encodeURIComponent(msg)}`);
  if (error) {
    return deny(String(errorDescription || error));
  }
  if (!code || !state) {
    return res.status(400).json({ error: 'Missing code or state' });
  }
  const s = String(state);
  if (!s.startsWith('uid:')) {
    return res.status(400).json({ error: 'Invalid state' });
  }
  const userId = s.replace(/^uid:/, '');
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: 'Invalid state' });
  }
  try {
    await youtubeTokenService.exchangeCodeForAccount(userId, String(code));
    return res.redirect(302, `${frontendBase}/dashboard?youtube=connected`);
  } catch (e) {
    return deny(e.message || 'OAuth exchange failed');
  }
}

/**
 * Handle OAuth callback (simplified: pass code + user in body, or use session).
 * For production, use strict state + PKCE. Here: POST { code } as authenticated user.
 */
async function exchangeCode(req, res, next) {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'code is required' });
    const acc = await youtubeTokenService.exchangeCodeForAccount(req.user._id, code);
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

module.exports = { linkTokens, authUrl, callback, exchangeCode, list, setDefault };
