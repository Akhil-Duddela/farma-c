const InstagramAccount = require('../models/InstagramAccount');
const YouTubeAccount = require('../models/YouTubeAccount');

/**
 * @param {object} body
 * @returns {{ instagram: boolean, youtube: boolean }}
 */
function parsePlatformFlags(body) {
  if (body.platforms && typeof body.platforms === 'object') {
    const p = body.platforms;
    return {
      instagram: p.instagram === true || p.instagram?.enabled === true,
      youtube: p.youtube === true || p.youtube?.enabled === true,
    };
  }
  if (body.instagramAccountId && !body.youtubeAccountId) {
    return { instagram: true, youtube: false };
  }
  if (body.youtubeAccountId && !body.instagramAccountId) {
    return { youtube: true, instagram: false };
  }
  if (body.youtubeAccountId && body.instagramAccountId) {
    return { instagram: true, youtube: true };
  }
  return { instagram: true, youtube: false };
}

/**
 * @param {string|undefined} id
 * @param {import('mongoose').Types.ObjectId} userId
 */
async function assertInstagramAccount(id, userId) {
  if (!id) {
    const e = new Error('instagramAccountId required when Instagram is enabled');
    e.status = 400;
    throw e;
  }
  const acc = await InstagramAccount.findOne({ _id: id, userId });
  if (!acc) {
    const e = new Error('Instagram account not found');
    e.status = 404;
    throw e;
  }
  return acc;
}

/**
 * @param {string|undefined} id
 * @param {import('mongoose').Types.ObjectId} userId
 */
async function assertYouTubeAccount(id, userId) {
  if (!id) {
    const e = new Error('youtubeAccountId required when YouTube is enabled');
    e.status = 400;
    throw e;
  }
  const acc = await YouTubeAccount.findOne({ _id: id, userId });
  if (!acc) {
    const e = new Error('YouTube account not found');
    e.status = 404;
    throw e;
  }
  return acc;
}

module.exports = { parsePlatformFlags, assertInstagramAccount, assertYouTubeAccount };
