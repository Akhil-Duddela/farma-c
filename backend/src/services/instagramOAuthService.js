const axios = require('axios');
const config = require('../config');
const InstagramAccount = require('../models/InstagramAccount');
const tokenService = require('./tokenService');
const instagramService = require('./instagramService');
const logService = require('./logService');
const logger = require('../utils/logger');

const DIALOG = 'https://www.facebook.com';

const IG_SCOPES = ['instagram_basic', 'pages_show_list', 'instagram_content_publish'].join(',');

/**
 * @param {string} state e.g. uid:ObjectId
 */
function getAuthUrl(state) {
  if (!config.instagram.appId || !config.instagram.appSecret) {
    throw new Error('INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET are required for Instagram OAuth');
  }
  const redirectUri = config.instagram.redirectUri;
  if (!redirectUri) {
    throw new Error('INSTAGRAM_REDIRECT_URI must be set to your callback URL, e.g. https://api.example.com/api/instagram/callback');
  }
  const u = new URL(`${DIALOG}/${config.instagram.graphVersion}/dialog/oauth`);
  u.searchParams.set('client_id', config.instagram.appId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('state', state);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', IG_SCOPES);
  return { url: u.toString() };
}

/**
 * Exchange short-lived user code → long-lived user token → /me/accounts with Instagram Business
 * @param {import('mongoose').Types.ObjectId|string} userId
 * @param {string} code
 * @returns {Promise<import('mongoose').Document>}
 */
async function exchangeCodeAndLinkAccount(userId, code) {
  const redirectUri = config.instagram.redirectUri;
  if (!code || !redirectUri) {
    throw new Error('Invalid OAuth code or redirect configuration');
  }

  const { data: tokenEx, status: tokenStatus } = await axios
    .get(`https://graph.facebook.com/${config.instagram.graphVersion}/oauth/access_token`, {
      params: {
        client_id: config.instagram.appId,
        client_secret: config.instagram.appSecret,
        redirect_uri: redirectUri,
        code,
      },
      timeout: 30000,
      validateStatus: () => true,
    });
  if (tokenStatus >= 400 || tokenEx.error) {
    const msg = tokenEx.error?.message || tokenEx.error || 'Facebook code exchange failed';
    logger.warn('Facebook OAuth token error', { message: String(msg) });
    throw new Error(String(msg));
  }
  const shortUser = tokenEx.access_token;
  if (!shortUser) {
    throw new Error('Facebook did not return an access token');
  }

  const exchanged = await tokenService.exchangeLongLivedToken(shortUser);
  const longUser = exchanged.accessToken;
  const userExpires = new Date(Date.now() + (exchanged.expiresIn || 5184000) * 1000);

  const { data: body } = await axios.get(
    `https://graph.facebook.com/${config.instagram.graphVersion}/me/accounts`,
    {
      params: {
        fields: 'name,access_token,instagram_business_account{id,username}',
        access_token: longUser,
      },
      timeout: 30000,
    }
  );
  const pages = (body && body.data) || [];
  const withIg = pages.find(
    (p) => p.instagram_business_account && p.instagram_business_account.id
  );
  if (!withIg) {
    throw new Error(
      'No Facebook Page with a linked Instagram Business account. Link IG to a Page in Facebook settings, or grant pages_show_list.'
    );
  }

  const igNode = withIg.instagram_business_account;
  const igUserId = String(igNode.id);
  const pageId = String(withIg.id);
  const pageToken = withIg.access_token;
  if (!pageToken) {
    throw new Error('Facebook did not return a page access token');
  }

  const validation = await instagramService.validateBusinessAccount(igUserId, pageToken);
  if (!validation.ok) {
    throw new Error(validation.error || 'Account must be Instagram Business or Creator');
  }

  const noAccountsYet = (await InstagramAccount.countDocuments({ userId })) === 0;
  const doc = await InstagramAccount.findOneAndUpdate(
    { userId, igUserId },
    {
      $set: {
        pageId,
        username: validation.username || igNode.username || '',
        isBusinessValidated: true,
        lastValidationError: '',
      },
      $setOnInsert: {
        userId,
        igUserId,
        isDefault: noAccountsYet,
      },
    },
    { upsert: true, new: true }
  );
  const expiresAt = new Date(
    userExpires.getTime() > Date.now() ? userExpires : Date.now() + 50 * 24 * 3600 * 1000
  );
  await tokenService.saveEncryptedToken(doc, pageToken, expiresAt);

  await logService.logEntry({
    userId: doc.userId,
    step: 'instagram.oauth',
    message: `Connected @${doc.username}`,
  });

  return doc;
}

module.exports = { getAuthUrl, exchangeCodeAndLinkAccount, IG_SCOPES };
