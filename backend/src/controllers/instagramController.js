const InstagramAccount = require('../models/InstagramAccount');
const tokenService = require('../services/tokenService');
const instagramService = require('../services/instagramService');
const instagramOAuthService = require('../services/instagramOAuthService');
const logService = require('../services/logService');
const config = require('../config');
const mongoose = require('mongoose');

const frontendBase = config.frontendUrl;

function redirectUrl(ok, errMessage) {
  if (ok) {
    return `${frontendBase}/dashboard?ig=connected`;
  }
  return `${frontendBase}/dashboard?ig=error&reason=${encodeURIComponent(errMessage || 'unknown')}`;
}

/**
 * GET /api/instagram/auth-url — returns Facebook Login URL (user must be logged in; state ties account).
 */
function authUrl(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const state = `uid:${req.user._id}`;
    const { url } = instagramOAuthService.getAuthUrl(state);
    res.json({ url });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Config error' });
  }
}

/**
 * Public: Facebook redirects here with ?code&state. No JWT — user from state=uid:...
 */
async function oauthCallback(req, res) {
  const { code, state, error, error_description: errDesc } = req.query;
  if (error) {
    return res.redirect(302, redirectUrl(false, String(errDesc || error)));
  }
  if (!code || !state) {
    return res.redirect(302, redirectUrl(false, 'Missing code or state'));
  }
  const s = String(state);
  if (!s.startsWith('uid:')) {
    return res.redirect(302, redirectUrl(false, 'Invalid state'));
  }
  const userId = s.replace(/^uid:/, '');
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.redirect(302, redirectUrl(false, 'Invalid state'));
  }
  try {
    await instagramOAuthService.exchangeCodeAndLinkAccount(userId, String(code));
    return res.redirect(302, redirectUrl(true));
  } catch (e) {
    return res.redirect(302, redirectUrl(false, e.message || 'OAuth failed'));
  }
}

/**
 * @deprecated API-first: prefer OAuth. Kept for automation / legacy.
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
        userId: req.user._id,
        igUserId,
        pageId: pageId || '',
        username: username || validation.username || '',
        isBusinessValidated: true,
        lastValidationError: '',
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
    const r = await InstagramAccount.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!r) return res.status(404).json({ error: 'Not found' });
    await logService.logEntry({ userId: req.user._id, step: 'instagram.disconnect', message: 'Account removed' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

module.exports = { linkAccount, listAccounts, setDefault, authUrl, oauthCallback, disconnect };
