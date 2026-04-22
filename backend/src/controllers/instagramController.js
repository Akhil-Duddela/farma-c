const InstagramAccount = require('../models/InstagramAccount');
const tokenService = require('../services/tokenService');
const instagramService = require('../services/instagramService');
const logService = require('../services/logService');

/**
 * Save linked account after OAuth (frontend exchanges code or sends long-lived token).
 * Production: implement full OAuth redirect; this endpoint accepts token for API-first setup.
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

module.exports = { linkAccount, listAccounts, setDefault };
