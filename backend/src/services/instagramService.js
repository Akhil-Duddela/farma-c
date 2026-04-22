const axios = require('axios');
const config = require('../config');
const { withRetry } = require('../utils/retry');
const tokenService = require('./tokenService');
const logService = require('./logService');

const graph = (path, params = {}) =>
  axios.get(`https://graph.facebook.com/${config.instagram.graphVersion}${path}`, {
    params,
    timeout: 45000,
  });

/**
 * Validate IG user is a Business/Creator account with necessary permissions.
 */
async function validateBusinessAccount(igUserId, accessToken) {
  try {
    const { data } = await graph(`/${igUserId}`, {
      fields: 'id,username,account_type',
      access_token: accessToken,
    });
    const ok = data.account_type === 'BUSINESS' || data.account_type === 'MEDIA_CREATOR';
    return { ok, username: data.username, accountType: data.account_type, id: data.id };
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    return { ok: false, error: msg };
  }
}

/**
 * Create image media container — image must be publicly reachable HTTPS URL.
 */
async function createImageMedia(igUserId, accessToken, imageUrl, caption) {
  const { data } = await withRetry(
    async () => {
      const r = await axios.post(
        `https://graph.facebook.com/${config.instagram.graphVersion}/${igUserId}/media`,
        null,
        {
          params: {
            image_url: imageUrl,
            caption: caption.slice(0, 2200),
            access_token: accessToken,
          },
          timeout: 60000,
        }
      );
      return r;
    },
    { maxAttempts: 3, baseDelayMs: 2000 }
  );
  if (!data.id) {
    throw new Error(data.error?.message || 'Media container creation failed');
  }
  return data.id;
}

/**
 * Create video or reel container (public video URL).
 * @param {'REELS'|'VIDEO'} [mediaType]  Default REELS for feed alignment with Shorts-style assets
 */
async function createVideoMedia(igUserId, accessToken, videoUrl, caption, mediaType = 'REELS') {
  const { data } = await withRetry(
    async () => {
      const r = await axios.post(
        `https://graph.facebook.com/${config.instagram.graphVersion}/${igUserId}/media`,
        null,
        {
          params: {
            video_url: videoUrl,
            caption: caption.slice(0, 2200),
            media_type: mediaType,
            access_token: accessToken,
          },
          timeout: 120000,
        }
      );
      return r;
    },
    { maxAttempts: 3, baseDelayMs: 2000 }
  );
  if (!data.id) {
    throw new Error(data.error?.message || 'Video media container creation failed');
  }
  return data.id;
}

/**
 * Poll container status until FINISHED or timeout (video/reel processing).
 */
async function waitForMediaReady(creationId, accessToken, maxWaitMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const { data } = await graph(`/${creationId}`, {
      fields: 'status_code,status',
      access_token: accessToken,
    });
    if (data.status_code === 'FINISHED' || data.status_code === 'PUBLISHED') {
      return true;
    }
    if (data.status_code === 'ERROR') {
      throw new Error(data.status || 'Media processing error');
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('Timeout waiting for Instagram media to be ready');
}

/**
 * Publish media container.
 */
async function publishMedia(igUserId, accessToken, creationId) {
  const { data } = await withRetry(
    async () => {
      const r = await axios.post(
        `https://graph.facebook.com/${config.instagram.graphVersion}/${igUserId}/media_publish`,
        null,
        {
          params: {
            creation_id: creationId,
            access_token: accessToken,
          },
          timeout: 60000,
        }
      );
      return r;
    },
    { maxAttempts: 3, baseDelayMs: 2000 }
  );
  if (!data.id) {
    throw new Error(data.error?.message || 'Publish failed');
  }
  return data.id;
}

/**
 * Full flow: validate token refresh → create container → publish.
 * Handles rate-limit (code 4) with one extra delay.
 */
async function publishImagePost(accountDoc, imageUrl, caption) {
  const refreshed = await tokenService.refreshIfNeeded(accountDoc);
  const accessToken = tokenService.getPlainToken(refreshed);

  const validation = await validateBusinessAccount(refreshed.igUserId, accessToken);
  if (!validation.ok) {
    await logService.logEntry({
      userId: refreshed.userId,
      level: 'error',
      step: 'instagram.validate',
      message: validation.error || 'Not a business/creator account',
    });
    throw new Error(validation.error || 'Instagram account must be Business or Creator');
  }

  let creationId;
  try {
    creationId = await createImageMedia(refreshed.igUserId, accessToken, imageUrl, caption);
  } catch (err) {
    const code = err.response?.data?.error?.code;
    if (code === 4 || code === 17) {
      await new Promise((r) => setTimeout(r, 5000));
      creationId = await createImageMedia(refreshed.igUserId, accessToken, imageUrl, caption);
    } else {
      throw err;
    }
  }

  try {
    const igMediaId = await publishMedia(refreshed.igUserId, accessToken, creationId);
    return { instagramMediaId: igMediaId, creationId };
  } catch (firstErr) {
    const msg = firstErr.response?.data?.error?.message || firstErr.message;
    if (msg && /not ready|processing|IN_PROGRESS/i.test(msg)) {
      await waitForMediaReady(creationId, accessToken, 90000);
      const igMediaId = await publishMedia(refreshed.igUserId, accessToken, creationId);
      return { instagramMediaId: igMediaId, creationId };
    }
    throw firstErr;
  }
}

/**
 * Upload/publish a video (or reel) to Instagram from a public video_url.
 * Use when the same post is also sent to YouTube (shared video asset).
 */
async function publishVideoPost(accountDoc, videoUrl, caption) {
  const refreshed = await tokenService.refreshIfNeeded(accountDoc);
  const accessToken = tokenService.getPlainToken(refreshed);
  const validation = await validateBusinessAccount(refreshed.igUserId, accessToken);
  if (!validation.ok) {
    throw new Error(validation.error || 'Instagram account must be Business or Creator');
  }
  const isReel = /reel|shorts|9:16/i.test(caption) || /reel/i.test(videoUrl);
  const mediaType = isReel ? 'REELS' : 'VIDEO';
  const creationId = await createVideoMedia(
    refreshed.igUserId,
    accessToken,
    videoUrl,
    caption,
    mediaType
  );
  await waitForMediaReady(creationId, accessToken, 300000);
  const igMediaId = await publishMedia(refreshed.igUserId, accessToken, creationId);
  return { instagramMediaId: igMediaId, creationId };
}

module.exports = {
  validateBusinessAccount,
  createImageMedia,
  createVideoMedia,
  publishMedia,
  publishImagePost,
  publishVideoPost,
  waitForMediaReady,
};
