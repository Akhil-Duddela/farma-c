const axios = require('axios');
const config = require('../config');
const InstagramAccount = require('../models/InstagramAccount');
const tokenService = require('./tokenService');
const instagramService = require('./instagramService');
const logService = require('./logService');
const { storeIgPickOptions } = require('./oauthStateService');
const logger = require('../utils/logger');

const DIALOG = 'https://www.facebook.com';

const IG_SCOPES = [
  'instagram_basic',
  'pages_show_list',
  'instagram_content_publish',
  'business_management',
].join(',');

const REASONS = {
  no_business: 'no_business_account',
  no_channel: 'no_business_account',
  oauth: 'oauth_failed',
};

/**
 * @param {string} state
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

function oAuthError(message, reasonCode) {
  const e = new Error(message);
  e.reasonCode = reasonCode || REASONS.oauth;
  return e;
}

/**
 * @param {string} igUserId
 * @param {string} pageToken
 * @returns {Promise<string>}
 */
async function fetchProfilePicture(igUserId, pageToken) {
  try {
    const { data, status } = await axios.get(
      `https://graph.facebook.com/${config.instagram.graphVersion}/${igUserId}`,
      {
        params: { fields: 'profile_picture_url,username', access_token: pageToken },
        timeout: 15000,
        validateStatus: () => true,
      }
    );
    if (status < 400 && data.profile_picture_url) {
      return String(data.profile_picture_url);
    }
  } catch (e) {
    logger.warn('IG profile picture fetch failed', { message: e.message });
  }
  return '';
}

/**
 * Paginate /me/accounts
 * @param {string} longUser
 */
async function fetchAllPagesWithInstagram(longUser) {
  const fields = 'name,access_token,instagram_business_account{id,username}';
  const base = `https://graph.facebook.com/${config.instagram.graphVersion}/me/accounts`;
  const all = [];
  let url = null;
  const first = await axios.get(base, {
    params: { fields, access_token: longUser, limit: 100 },
    timeout: 30000,
  });
  all.push(...(first.data?.data || []));
  url = first.data?.paging?.next;
  let guard = 0;
  while (url && guard < 20) {
    // eslint-disable-next-line no-await-in-loop
    const { data } = await axios.get(url, { timeout: 30000 });
    all.push(...(data.data || []));
    url = data.paging?.next;
    // eslint-disable-next-line no-plusplus
    ++guard;
  }
  return all;
}

/**
 * @param {import('mongoose').Types.ObjectId|string} userId
 * @param {Date} userTokenExpires
 * @param {object} opt
 */
async function persistAccountFromPageOption(userId, userTokenExpires, opt) {
  const { pageId, igUserId, username, pageToken, profilePictureUrl } = opt;
  const validation = await instagramService.validateBusinessAccount(igUserId, pageToken);
  if (!validation.ok) {
    throw oAuthError(validation.error || 'Account must be Instagram Business or Creator', 'no_business_account');
  }

  const uname = validation.username || username || '';
  const noAccountsYet = (await InstagramAccount.countDocuments({ userId })) === 0;
  const doc = await InstagramAccount.findOneAndUpdate(
    { userId, igUserId: String(igUserId) },
    {
      $set: {
        pageId: String(pageId),
        username: uname,
        isBusinessValidated: true,
        lastValidationError: '',
        profilePictureUrl: profilePictureUrl || '',
      },
      $setOnInsert: {
        userId,
        igUserId: String(igUserId),
        isDefault: noAccountsYet,
      },
    },
    { upsert: true, new: true }
  );
  const expiresAt =
    userTokenExpires && userTokenExpires.getTime() > Date.now()
      ? userTokenExpires
      : new Date(Date.now() + 50 * 24 * 3600 * 1000);
  await tokenService.saveEncryptedToken(doc, pageToken, expiresAt);

  await logService.logEntry({
    userId: doc.userId,
    step: 'instagram.oauth',
    message: `Connected @${doc.username}`,
  });
  logger.info('Instagram OAuth linked', { userId: String(userId), igUserId: String(igUserId) });
  return doc;
}

/**
 * Full exchange: use after valid code + state.
 * @param {import('mongoose').Types.ObjectId|string} userId
 * @param {string} code
 * @returns {Promise<{ type: 'linked', doc: import('mongoose').Document } | { type: 'choose', pickKey: string }>}
 */
async function runOAuthCodeExchange(userId, code) {
  const redirectUri = config.instagram.redirectUri;
  if (!code || !redirectUri) {
    throw oAuthError('Invalid OAuth code or redirect configuration', REASONS.oauth);
  }

  const { data: tokenEx, status: tokenStatus } = await axios.get(
    `https://graph.facebook.com/${config.instagram.graphVersion}/oauth/access_token`,
    {
      params: {
        client_id: config.instagram.appId,
        client_secret: config.instagram.appSecret,
        redirect_uri: redirectUri,
        code,
      },
      timeout: 30000,
      validateStatus: () => true,
    }
  );
  if (tokenStatus >= 400 || tokenEx.error) {
    const msg = tokenEx.error?.message || tokenEx.error || 'Facebook code exchange failed';
    logger.warn('Facebook OAuth token error', { message: String(msg) });
    throw oAuthError(String(msg), REASONS.oauth);
  }
  const shortUser = tokenEx.access_token;
  if (!shortUser) {
    throw oAuthError('Facebook did not return an access token', REASONS.oauth);
  }

  const exchanged = await tokenService.exchangeLongLivedToken(shortUser);
  const longUser = exchanged.accessToken;
  const userExpires = new Date(Date.now() + (exchanged.expiresIn || 5184000) * 1000);

  const pages = await fetchAllPagesWithInstagram(longUser);
  const withIg = pages.filter((p) => p.instagram_business_account && p.instagram_business_account.id);

  if (withIg.length === 0) {
    throw oAuthError(
      'No Facebook Page with a linked Instagram Business account. Link Instagram to a Page, or use a Business / Creator account.',
      REASONS.no_business
    );
  }

  /** @type {Array<{ pageId, igUserId, username, pageToken, profilePictureUrl }>} */
  const options = [];
  for (const page of withIg) {
    const igNode = page.instagram_business_account;
    const igUserId = String(igNode.id);
    const pageId = String(page.id);
    const pageToken = page.access_token;
    if (!pageToken) continue;
    // eslint-disable-next-line no-await-in-loop
    const profilePictureUrl = await fetchProfilePicture(igNode.id, pageToken);
    // eslint-disable-next-line no-await-in-loop
    const validation = await instagramService.validateBusinessAccount(igUserId, pageToken);
    if (!validation.ok) {
      continue;
    }
    options.push({
      pageId,
      igUserId,
      username: validation.username || igNode.username || '',
      pageToken,
      profilePictureUrl,
    });
  }

  if (options.length === 0) {
    throw oAuthError(
      'No valid Instagram Business or Creator account was found. Switch to a Business account and link it to a Facebook Page.',
      REASONS.no_business
    );
  }

  if (options.length === 1) {
    const doc = await persistAccountFromPageOption(userId, userExpires, options[0]);
    return { type: 'linked', doc };
  }

  const pickKey = await storeIgPickOptions(userId, options);
  logger.info('Instagram OAuth requires account selection', { userId: String(userId), n: options.length });
  return { type: 'choose', pickKey };
}

/**
 * Complete multi-account pick (also safe for single re-link).
 * @param {import('mongoose').Types.ObjectId|string} userId
 * @param {string} pickKey
 * @param {string} igUserId
 */
async function linkFromPick(userId, pickKey, igUserId) {
  const { consumeIgPick } = require('./oauthStateService');
  const chosen = await consumeIgPick(pickKey, String(userId), String(igUserId));
  if (!chosen) {
    throw oAuthError('Invalid or expired selection. Start Instagram connect again.', 'invalid_selection');
  }
  let finalToken = chosen.pageToken;
  let userExpires = new Date(Date.now() + 50 * 24 * 3600 * 1000);
  try {
    const ex = await tokenService.exchangeLongLivedToken(chosen.pageToken);
    finalToken = ex.accessToken;
    userExpires = new Date(Date.now() + (ex.expiresIn || 5184000) * 1000);
  } catch (e) {
    logger.warn('IG page token long exchange skipped, using as-is', { m: e.message });
  }
  return persistAccountFromPageOption(userId, userExpires, { ...chosen, pageToken: finalToken });
}

/**
 * @deprecated wrapper — prefer runOAuthCodeExchange
 */
async function exchangeCodeAndLinkAccount(userId, code) {
  const r = await runOAuthCodeExchange(userId, code);
  if (r.type === 'choose') {
    const err = oAuthError('Multiple accounts — use account picker', 'account_pick_required');
    return Promise.reject(err);
  }
  return r.doc;
}

module.exports = {
  getAuthUrl,
  runOAuthCodeExchange,
  linkFromPick,
  exchangeCodeAndLinkAccount,
  persistAccountFromPageOption,
  IG_SCOPES,
  OAUTH_REASONS: REASONS,
};
