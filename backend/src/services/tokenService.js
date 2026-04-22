const axios = require('axios');
const config = require('../config');
const InstagramAccount = require('../models/InstagramAccount');
const { encrypt, decrypt } = require('../utils/encryption');
const logService = require('./logService');

/**
 * Exchange short-lived token for long-lived (60 days) — Meta Graph API.
 */
async function exchangeLongLivedToken(shortLivedToken) {
  const url = `https://graph.facebook.com/${config.instagram.graphVersion}/oauth/access_token`;
  const { data } = await axios.get(url, {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: config.instagram.appId,
      client_secret: config.instagram.appSecret,
      fb_exchange_token: shortLivedToken,
    },
    timeout: 20000,
  });
  if (!data.access_token) {
    throw new Error('Long-lived token exchange failed');
  }
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in || 5184000,
  };
}

function saveEncryptedToken(doc, plainToken, expiresAt) {
  doc.accessTokenEnc = encrypt(plainToken);
  doc.tokenExpiresAt = expiresAt;
  doc.longLivedTokenObtainedAt = new Date();
  return doc.save();
}

function getPlainToken(accountDoc) {
  return decrypt(accountDoc.accessTokenEnc);
}

/**
 * Refresh long-lived token before expiry (Meta allows refresh if not expired).
 */
async function refreshIfNeeded(accountDoc) {
  if (!accountDoc.tokenExpiresAt) return accountDoc;
  const daysLeft = (accountDoc.tokenExpiresAt - Date.now()) / (86400 * 1000);
  if (daysLeft > 14) return accountDoc;

  const token = getPlainToken(accountDoc);
  const url = `https://graph.facebook.com/${config.instagram.graphVersion}/oauth/access_token`;
  const { data } = await axios.get(url, {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: config.instagram.appId,
      client_secret: config.instagram.appSecret,
      fb_exchange_token: token,
    },
    timeout: 20000,
  });
  if (!data.access_token) {
    await logService.logEntry({
      userId: accountDoc.userId,
      level: 'warn',
      step: 'instagram.token_refresh',
      message: 'Token refresh failed — user must reconnect',
    });
    return accountDoc;
  }
  const expiresAt = new Date(Date.now() + (data.expires_in || 5184000) * 1000);
  accountDoc.accessTokenEnc = encrypt(data.access_token);
  accountDoc.tokenExpiresAt = expiresAt;
  await accountDoc.save();
  return accountDoc;
}

module.exports = {
  exchangeLongLivedToken,
  saveEncryptedToken,
  getPlainToken,
  refreshIfNeeded,
};
