const { google } = require('googleapis');
const config = require('../config');
const { encrypt, decrypt } = require('../utils/encryption');
const YouTubeAccount = require('../models/YouTubeAccount');

/**
 * @returns {import('google-auth-library').OAuth2Client}
 */
function getOAuth2Client() {
  if (!config.youtube.clientId || !config.youtube.clientSecret) {
    throw new Error('YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET are required for YouTube');
  }
  return new google.auth.OAuth2(
    config.youtube.clientId,
    config.youtube.clientSecret,
    config.youtube.redirectUri
  );
}

/**
 * @param {import('mongoose').Document} doc
 */
function setCredentialsFromDoc(doc) {
  const c = getOAuth2Client();
  c.setCredentials({
    access_token: doc.accessTokenEnc ? decrypt(doc.accessTokenEnc) : undefined,
    refresh_token: doc.refreshTokenEnc ? decrypt(doc.refreshTokenEnc) : undefined,
  });
  return c;
}

async function persistRefreshedTokens(oauth2Client, doc) {
  const creds = oauth2Client.credentials;
  if (creds.access_token) {
    doc.accessTokenEnc = encrypt(creds.access_token);
  }
  if (creds.refresh_token) {
    doc.refreshTokenEnc = encrypt(creds.refresh_token);
  }
  if (creds.expiry_date) {
    doc.tokenExpiresAt = new Date(creds.expiry_date);
  }
  await doc.save();
}

/**
 * Ensure a valid access token, refreshing when close to expiry.
 * @param {import('mongoose').Document} accountDoc
 */
async function ensureFreshTokens(accountDoc) {
  if (!accountDoc.accessTokenEnc && !accountDoc.refreshTokenEnc) {
    throw new Error('YouTube account has no tokens; reconnect OAuth');
  }
  const oauth2 = setCredentialsFromDoc(accountDoc);
  if (!accountDoc.tokenExpiresAt || accountDoc.tokenExpiresAt.getTime() < Date.now() + 2 * 60 * 1000) {
    if (accountDoc.refreshTokenEnc) {
      const { credentials } = await oauth2.refreshAccessToken();
      oauth2.setCredentials(credentials);
    }
  }
  await persistRefreshedTokens(oauth2, accountDoc);
  return oauth2;
}

async function createOrUpdateAccountFromTokens({ userId, accessToken, refreshToken, channelId, channelTitle }) {
  if (!accessToken) {
    throw new Error('accessToken required');
  }
  const o = getOAuth2Client();
  o.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
  const youtube = google.youtube({ version: 'v3', auth: o });
  let chId = channelId;
  let chTitle = channelTitle || '';
  if (!chId) {
    const { data } = await youtube.channels.list({ part: 'snippet', mine: true });
    const ch = data.items && data.items[0];
    if (!ch) throw new Error('No YouTube channel for this user');
    chId = ch.id;
    chTitle = ch.snippet?.title || '';
  }
  const doc = await YouTubeAccount.findOneAndUpdate(
    { userId, channelId: chId },
    { userId, channelId: chId, channelTitle: chTitle },
    { upsert: true, new: true }
  );
  doc.accessTokenEnc = encrypt(accessToken);
  if (refreshToken) {
    doc.refreshTokenEnc = encrypt(refreshToken);
  }
  const exp = o.credentials.expiry_date;
  doc.tokenExpiresAt = exp ? new Date(exp) : new Date(Date.now() + 3600 * 1000);
  await doc.save();
  return doc;
}

function getAuthUrl() {
  const c = getOAuth2Client();
  return c.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
    ],
    prompt: 'consent',
  });
}

/**
 * @param {string} code
 * @param {import('mongoose').Types.ObjectId} userId
 */
async function exchangeCodeForAccount(userId, code) {
  const c = getOAuth2Client();
  const { tokens } = await c.getToken(code);
  c.setCredentials(tokens);
  return createOrUpdateAccountFromTokens({
    userId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
  });
}

module.exports = {
  getOAuth2Client,
  setCredentialsFromDoc,
  ensureFreshTokens,
  createOrUpdateAccountFromTokens,
  getAuthUrl,
  exchangeCodeForAccount,
};
