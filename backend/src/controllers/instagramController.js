const InstagramAccount = require('../models/InstagramAccount');
const tokenService = require('../services/tokenService');
const instagramService = require('../services/instagramService');
const instagramOAuthService = require('../services/instagramOAuthService');
const { createState, consumeState, getIgPickPublic } = require('../services/oauthStateService');
const { failQueuedJobsForAccount } = require('../services/accountDisconnectService');
const logService = require('../services/logService');
const config = require('../config');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

const frontendBase = config.frontendUrl;

function redirectUrl(ok, errCode) {
  if (ok) {
    return `${frontendBase}/dashboard?ig=connected`;
  }
  return `${frontendBase}/dashboard?ig=error&reason=${encodeURIComponent(errCode || 'unknown')}`;
}

function pickWithKeyUrl(pickKey) {
  return `${frontendBase}/dashboard?ig=choose&key=${encodeURIComponent(pickKey)}`;
}

/**
 * GET /api/instagram/auth-url
 */
async function authUrl(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const state = await createState('ig', req.user._id);
    const { url } = instagramOAuthService.getAuthUrl(state);
    res.json({ url });
  } catch (e) {
    logger.error('Instagram auth-url failed', { err: e.message });
    res.status(500).json({ error: e.message || 'Config error' });
  }
}

/**
 * GET /api/instagram/callback
 */
async function oauthCallback(req, res) {
  const { code, state, error, error_description: errDesc } = req.query;
  if (error) {
    const r = String(error) === 'access_denied' ? 'access_denied' : 'oauth_failed';
    logger.warn('Instagram OAuth error param', { error: String(error) });
    return res.redirect(302, redirectUrl(false, r));
  }
  if (!code || !state) {
    return res.redirect(302, redirectUrl(false, 'missing_params'));
  }
  const userId = await consumeState('ig', String(state));
  if (!userId) {
    logger.warn('Instagram OAuth invalid or expired state');
    return res.redirect(302, redirectUrl(false, 'invalid_state'));
  }
  if (!mongoose.Types.ObjectId.isValid(String(userId))) {
    return res.redirect(302, redirectUrl(false, 'invalid_state'));
  }
  try {
    const result = await instagramOAuthService.runOAuthCodeExchange(String(userId), String(code));
    if (result.type === 'choose') {
      logger.info('Instagram OAuth redirecting to account picker', { userId: String(userId) });
      return res.redirect(302, pickWithKeyUrl(result.pickKey));
    }
    return res.redirect(302, redirectUrl(true));
  } catch (e) {
    const codeReason = e.reasonCode || (e.message && e.message.startsWith('NO_') ? e.message : 'oauth_failed');
    logger.error('Instagram OAuth callback failed', { err: e.message, reasonCode: e.reasonCode });
    return res.redirect(302, redirectUrl(false, codeReason));
  }
}

/**
 * GET /api/instagram/oauth-pending?key= — which IG account to connect (no secrets).
 */
async function oauthPending(req, res) {
  try {
    const key = String(req.query.key || '');
    if (!key) {
      return res.status(400).json({ error: 'key is required' });
    }
    const d = await getIgPickPublic(key, String(req.user._id));
    if (!d) {
      return res.status(404).json({ error: 'Expired or not found' });
    }
    res.json(d);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error' });
  }
}

/**
 * POST /api/instagram/select-account
 * body: { "accountId": "...", "pickKey": "..." } — spec uses accountId; pickKey links Redis blob.
 */
async function selectAccount(req, res) {
  try {
    const accountId = String(req.body.accountId || req.body.igUserId || '').trim();
    const pickKey = String(req.body.pickKey || req.body.key || '').trim();
    if (!accountId || !pickKey) {
      return res.status(400).json({ error: 'accountId and pickKey are required' });
    }
    const doc = await instagramOAuthService.linkFromPick(String(req.user._id), pickKey, accountId);
    await logService.logEntry({
      userId: req.user._id,
      step: 'instagram.select',
      message: `Selected @${doc.username}`,
    });
    logger.info('Instagram account selected after OAuth', { userId: String(req.user._id), accountId });
    res.json({ ok: true, id: doc._id, username: doc.username, igUserId: doc.igUserId });
  } catch (e) {
    const s = e.reasonCode === 'invalid_selection' ? 400 : 500;
    logger.error('Instagram select-account failed', { err: e.message });
    res.status(s).json({ error: e.message || 'Failed' });
  }
}

/**
 * POST /api/instagram/refresh-tokens
 */
async function refreshTokens(req, res) {
  try {
    const accounts = await InstagramAccount.find({ userId: req.user._id });
    for (const a of accounts) {
      // eslint-disable-next-line no-await-in-loop
      await tokenService.refreshIfNeeded(a);
    }
    res.json({ ok: true, total: accounts.length });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Refresh failed' });
  }
}

/**
 * @deprecated
 */
async function linkAccount(req, res, next) {
  try {
    const { igUserId, pageId, username, accessToken, shortLivedToken } = req.body;
    let token = accessToken;
    let expiresAt = new Date(Date.now() + 60 * 24 * 3600 * 1000);

    if (shortLivedToken && !accessToken) {
      const exchanged = await tokenService.exchangeLongLivedToken(shortLivedToken);
      token = exchanged.accessToken;
      expiresAt = new Date(Date.now() + exchanged.expiresIn * 1000);
    }

    if (!token || !igUserId) {
      return res.status(400).json({ error: 'igUserId and accessToken (or shortLivedToken) required' });
    }

    const validation = await instagramService.validateBusinessAccount(igUserId, token);
    if (!validation.ok) {
      return res.status(400).json({
        error: validation.error || 'Account must be Instagram Business or Creator',
      });
    }

    const doc = await InstagramAccount.findOneAndUpdate(
      { userId: req.user._id, igUserId },
      {
        $set: {
          userId: req.user._id,
          igUserId,
          pageId: pageId || '',
          username: username || validation.username || '',
          isBusinessValidated: true,
          lastValidationError: '',
        },
      },
      { upsert: true, new: true }
    );

    await tokenService.saveEncryptedToken(doc, token, expiresAt);

    await logService.logEntry({
      userId: req.user._id,
      step: 'instagram.link',
      message: `Linked @${doc.username}`,
    });

    res.json({
      id: doc._id,
      igUserId: doc.igUserId,
      username: doc.username,
      tokenExpiresAt: doc.tokenExpiresAt,
    });
  } catch (e) {
    next(e);
  }
}

async function listAccounts(req, res, next) {
  try {
    const accounts = await InstagramAccount.find({ userId: req.user._id }).select(
      '-accessTokenEnc'
    );
    res.json(accounts);
  } catch (e) {
    next(e);
  }
}

async function setDefault(req, res, next) {
  try {
    await InstagramAccount.updateMany({ userId: req.user._id }, { $set: { isDefault: false } });
    const acc = await InstagramAccount.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: { isDefault: true } },
      { new: true }
    );
    if (!acc) return res.status(404).json({ error: 'Not found' });
    res.json(acc);
  } catch (e) {
    next(e);
  }
}

async function disconnect(req, res, next) {
  try {
    const r = await InstagramAccount.findOne({ _id: req.params.id, userId: req.user._id });
    if (!r) return res.status(404).json({ error: 'Not found' });
    const oid = r._id;
    await failQueuedJobsForAccount(req.user._id, 'instagram', oid);
    await InstagramAccount.findByIdAndDelete(oid);
    await logService.logEntry({ userId: req.user._id, step: 'instagram.disconnect', message: 'Account removed' });
    logger.info('Instagram disconnected', { userId: String(req.user._id) });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

module.exports = {
  linkAccount,
  listAccounts,
  setDefault,
  authUrl,
  oauthCallback,
  oauthPending,
  selectAccount,
  refreshTokens,
  disconnect,
};
