const { google } = require('googleapis');
const config = require('../config');
const { encrypt, decrypt } = require('../utils/encryption');
const YouTubeAccount = require('../models/YouTubeAccount');
const { storeYtPickOptions, consumeYtPick } = require('./oauthStateService');
const logger = require('../utils/logger');

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
 * @param {object} snippet
 */
function pickThumb(snippet) {
  const t = snippet?.thumbnails;
  if (!t) return '';
  return t.high?.url || t.medium?.url || t.default?.url || '';
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
  const needRefresh =
    !accountDoc.tokenExpiresAt || accountDoc.tokenExpiresAt.getTime() < Date.now() + 2 * 60 * 1000;
  if (needRefresh && accountDoc.refreshTokenEnc) {
    const { credentials } = await oauth2.refreshAccessToken();
    oauth2.setCredentials(credentials);
    logger.info('YouTube access token refreshed', { userId: String(accountDoc.userId), ch: accountDoc.channelId });
  }
  await persistRefreshedTokens(oauth2, accountDoc);
  return oauth2;
}

/**
 * @param {import('googleapis').youtube_v3.Schema$Channel} ch
 * @param {import('google-auth-library').Credentials} tokens
 * @param {import('mongoose').Types.ObjectId} userId
 */
async function saveChannelAccount(userId, ch, tokens) {
  const chId = ch.id;
  const chTitle = ch.snippet?.title || '';
  const thumb = pickThumb(ch.snippet);
  if (!chId) {
    throw new Error('YouTube API returned a channel without id');
  }
  const noChannelYet = (await YouTubeAccount.countDocuments({ userId })) === 0;
  const doc = await YouTubeAccount.findOneAndUpdate(
    { userId, channelId: chId },
    {
      $set: {
        channelTitle: chTitle,
        thumbnailUrl: thumb,
      },
      $setOnInsert: {
        userId,
        channelId: chId,
        isDefault: noChannelYet,
      },
    },
    { upsert: true, new: true }
  );
  doc.accessTokenEnc = encrypt(tokens.access_token);
  if (tokens.refresh_token) {
    doc.refreshTokenEnc = encrypt(tokens.refresh_token);
  }
  const exp = tokens.expiry_date;
  doc.tokenExpiresAt = exp ? new Date(exp) : new Date(Date.now() + 3600 * 1000);
  await doc.save();
  return doc;
}

async function createOrUpdateAccountFromTokens({ userId, accessToken, refreshToken, channelId, channelTitle }) {
  if (!accessToken) {
    throw new Error('accessToken required');
  }
  const o = getOAuth2Client();
  o.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
  const tokens = o.credentials;
  const youtube = google.youtube({ version: 'v3', auth: o });
  let chId = channelId;
  let chTitle = channelTitle || '';
  if (!chId) {
    const { data } = await youtube.channels.list({ part: 'snippet', mine: true, maxResults: 1 });
    const ch = data.items && data.items[0];
    if (!ch) {
      const e = new Error('No YouTube channel for this Google account');
      e.reasonCode = 'no_youtube_channel';
      throw e;
    }
    chId = ch.id;
    chTitle = ch.snippet?.title || '';
    return saveChannelAccount(userId, ch, { ...tokens, access_token: accessToken, refresh_token: refreshToken });
  }
  const { data } = await youtube.channels.list({ part: 'snippet', id: [chId] });
  const ch = data.items && data.items[0];
  if (!ch) {
    const e = new Error('YouTube channel not found');
    e.reasonCode = 'no_youtube_channel';
    throw e;
  }
  return saveChannelAccount(userId, ch, { ...tokens, access_token: accessToken, refresh_token: refreshToken });
}

/**
 * @param {import('google-auth-library').Credentials} tokens
 * @param {import('googleapis').youtube_v3.Youtube} youtube
 */
async function listMyChannelsWithThumb(youtube) {
  const all = [];
  let pageToken;
  do {
    // eslint-disable-next-line no-await-in-loop
    const { data } = await youtube.channels.list({
      part: 'snippet',
      mine: true,
      maxResults: 50,
      pageToken,
    });
    all.push(...(data.items || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return all;
}

/**
 * @param {string} userId
 * @param {string} code
 * @returns {Promise<
 *   { type: 'linked', doc: import('mongoose').Document }
 *   | { type: 'choose', pickKey: string }
 * >}
 */
async function exchangeCodeForAccount(userId, code) {
  const c = getOAuth2Client();
  const { tokens } = await c.getToken(code);
  c.setCredentials(tokens);
  const youtube = google.youtube({ version: 'v3', auth: c });
  const items = await listMyChannelsWithThumb(youtube);
  if (items.length === 0) {
    const e = new Error('No YouTube channel for this Google account');
    e.reasonCode = 'no_youtube_channel';
    throw e;
  }
  if (items.length === 1) {
    const doc = await saveChannelAccount(userId, items[0], tokens);
    logger.info('YouTube OAuth linked (single channel)', { userId: String(userId), ch: doc.channelId });
    return { type: 'linked', doc };
  }
  const channels = items.map((it) => ({
    channelId: it.id,
    title: it.snippet?.title || 'Channel',
    thumb: pickThumb(it.snippet),
  }));
  const pickKey = await storeYtPickOptions(
    String(userId),
    tokens.access_token,
    tokens.refresh_token || '',
    channels
  );
  logger.info('YouTube OAuth requires channel selection', { userId: String(userId), n: channels.length });
  return { type: 'choose', pickKey };
}

/**
 * @param {string} userId
 * @param {string} pickKey
 * @param {string} channelId
 */
async function selectChannelFromPick(userId, pickKey, channelId) {
  const g = await consumeYtPick(pickKey, String(userId), String(channelId));
  if (!g) {
    const e = new Error('Invalid or expired selection. Start YouTube connect again.');
    e.reasonCode = 'invalid_selection';
    e.status = 400;
    throw e;
  }
  const o = getOAuth2Client();
  o.setCredentials({
    access_token: g.accessToken,
    refresh_token: g.refreshToken || undefined,
  });
  const baseTokens = o.credentials;
  const youtube = google.youtube({ version: 'v3', auth: o });
  const { data } = await youtube.channels.list({ part: 'snippet', id: [String(channelId)] });
  const ch = data.items && data.items[0];
  if (!ch) {
    const e = new Error('YouTube channel not found');
    e.reasonCode = 'no_youtube_channel';
    throw e;
  }
  const doc = await saveChannelAccount(userId, ch, { ...baseTokens, access_token: g.accessToken, refresh_token: g.refreshToken });
  logger.info('YouTube OAuth linked from selection', { userId: String(userId), ch: doc.channelId });
  return doc;
}

/**
 * @param {string} [state] - Opaque value from our backend (tied to user in Redis)
 */
function getAuthUrl(state) {
  const c = getOAuth2Client();
  const params = {
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
    ],
    prompt: 'consent',
  };
  if (state) params.state = state;
  return c.generateAuthUrl(params);
}

module.exports = {
  getOAuth2Client,
  setCredentialsFromDoc,
  ensureFreshTokens,
  createOrUpdateAccountFromTokens,
  getAuthUrl,
  exchangeCodeForAccount,
  selectChannelFromPick,
};
