/**
 * One-time: import linked social accounts from .env into Mongo for the app user.
 *
 * Optional variables (add to .env — do not commit):
 *   LINK_SYNC_USER_EMAIL   — which user to attach accounts to (default: first user in DB)
 *   — Instagram (Business/Creator) —
 *   LINK_IG_USER_ID         — Instagram Business/Creator user id (numeric string)
 *   LINK_IG_ACCESS_TOKEN    — long-lived user access token for that account
 *   — YouTube —
 *   LINK_YT_ACCESS_TOKEN    — OAuth2 access token (or leave empty if only refresh is set and API can refresh)
 *   LINK_YT_REFRESH_TOKEN   — OAuth2 refresh token (recommended)
 *   LINK_YT_CHANNEL_ID      — optional; if omitted, resolved via YouTube API
 *   LINK_YT_CHANNEL_TITLE   — optional
 *
 * App-level keys (INSTAGRAM_APP_*, YOUTUBE_CLIENT_*) are already in .env; this script only
 * adds *your* user/channel tokens, which .env does not create by default.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { connectDatabase } = require('../src/config/database');
const config = require('../src/config');
const User = require('../src/models/User');
const InstagramAccount = require('../src/models/InstagramAccount');
const instagramService = require('../src/services/instagramService');
const tokenService = require('../src/services/tokenService');
const { getOAuth2Client, createOrUpdateAccountFromTokens } = require('../src/services/youtubeTokenService');

function printHint() {
  // eslint-disable-next-line no-console
  console.log(`
importLinkedFromEnv: no LINK_IG_* / LINK_YT_* user tokens set (or only partial set).

In .env, the Meta/Google *app* id and client secret are your developer registration.
To publish as *your* page/channel, you must add user tokens, for example:
  LINK_IG_USER_ID=...          (from Graph API: Instagram-Scoped User ID for your BI account)
  LINK_IG_ACCESS_TOKEN=...     (long-lived user token with instagram_* permissions)
  LINK_YT_ACCESS_TOKEN=...     and/or
  LINK_YT_REFRESH_TOKEN=...    (from YouTube OAuth with upload scope; access_type=offline)
Then run: node backend/scripts/importLinkedFromEnv.js
`.trim());
}

async function importInstagram(userId) {
  const igUserId = (process.env.LINK_IG_USER_ID || '').trim();
  const accessToken = (process.env.LINK_IG_ACCESS_TOKEN || '').trim();
  if (!igUserId && !accessToken) return null;
  if (!igUserId || !accessToken) {
    throw new Error('Instagram: set both LINK_IG_USER_ID and LINK_IG_ACCESS_TOKEN, or neither');
  }
  const validation = await instagramService.validateBusinessAccount(igUserId, accessToken);
  if (!validation.ok) {
    throw new Error(validation.error || 'Instagram account not valid (Business/Creator required)');
  }
  const username = (process.env.LINK_IG_USERNAME || validation.username || '').trim();
  const expiresAt = new Date(
    process.env.LINK_IG_TOKEN_EXPIRES_AT
      ? Date.parse(process.env.LINK_IG_TOKEN_EXPIRES_AT)
      : Date.now() + 60 * 24 * 3600 * 1000
  );
  const doc = await InstagramAccount.findOneAndUpdate(
    { userId, igUserId },
    {
      userId,
      igUserId,
      pageId: (process.env.LINK_IG_PAGE_ID || '').trim() || undefined,
      username: username || undefined,
      isBusinessValidated: true,
      lastValidationError: '',
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await tokenService.saveEncryptedToken(doc, accessToken, expiresAt);
  // eslint-disable-next-line no-console
  console.log('importLinkedFromEnv: Instagram saved', { id: String(doc._id), username: doc.username });
  return doc;
}

async function importYouTube(userId) {
  const at = (process.env.LINK_YT_ACCESS_TOKEN || '').trim();
  const rt = (process.env.LINK_YT_REFRESH_TOKEN || '').trim();
  if (!at && !rt) return null;
  const chId = (process.env.LINK_YT_CHANNEL_ID || '').trim() || undefined;
  const chTitle = (process.env.LINK_YT_CHANNEL_TITLE || '').trim() || undefined;
  let accessToken = at;
  if (!accessToken && rt) {
    const o = getOAuth2Client();
    o.setCredentials({ refresh_token: rt });
    const { credentials } = await o.refreshAccessToken();
    if (!credentials?.access_token) {
      throw new Error('YouTube: LINK_YT_REFRESH_TOKEN set but Google did not return an access token');
    }
    accessToken = credentials.access_token;
  }
  if (!accessToken) {
    throw new Error('YouTube: set LINK_YT_ACCESS_TOKEN and/or LINK_YT_REFRESH_TOKEN');
  }
  const acc = await createOrUpdateAccountFromTokens({
    userId,
    accessToken,
    refreshToken: rt || undefined,
    channelId: chId,
    channelTitle: chTitle,
  });
  // eslint-disable-next-line no-console
  console.log('importLinkedFromEnv: YouTube saved', { id: String(acc._id), channelId: acc.channelId });
  return acc;
}

async function main() {
  if (!config.instagram.appId) {
    // eslint-disable-next-line no-console
    console.warn('Warning: INSTAGRAM_APP_ID is empty');
  }
  if (!config.youtube.clientId) {
    // eslint-disable-next-line no-console
    console.warn('Warning: YOUTUBE_CLIENT_ID is empty');
  }
  const email = (process.env.LINK_SYNC_USER_EMAIL || '').trim();
  await connectDatabase();
  let user;
  if (email) {
    user = await User.findOne({ email: email.toLowerCase() });
    if (!user) throw new Error(`No user with email ${email}`);
  } else {
    user = await User.findOne().sort({ createdAt: 1 });
    if (!user) throw new Error('No users in database (register an account first)');
  }

  const hasIg = !!(process.env.LINK_IG_USER_ID && process.env.LINK_IG_ACCESS_TOKEN);
  const hasYt = !!(
    (process.env.LINK_YT_ACCESS_TOKEN && process.env.LINK_YT_ACCESS_TOKEN.trim()) ||
    (process.env.LINK_YT_REFRESH_TOKEN && process.env.LINK_YT_REFRESH_TOKEN.trim())
  );

  if (!hasIg && !hasYt) {
    printHint();
    process.exit(0);
  }
  if (hasIg) await importInstagram(user._id);
  if (hasYt) await importYouTube(user._id);
  process.exit(0);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
