const Post = require('../models/Post');
const InstagramAccount = require('../models/InstagramAccount');
const instagramService = require('./instagramService');
const tokenService = require('./tokenService');
const { getPrimaryMediaUrl } = require('../utils/platformMedia');
const { markPlatformResult, recomputeAggregatedStatus } = require('./postStatusService');
const logService = require('./logService');

function buildCaption(post) {
  const tags = (post.hashtags || [])
    .map((t) => (String(t).startsWith('#') ? t : `#${t}`))
    .join(' ');
  const base = (post.caption || post.content || '').trim();
  return tags ? `${base}\n\n${tags}`.slice(0, 2200) : base.slice(0, 2200);
}

/**
 * Instagram-only publish job (isolated from YouTube).
 * @returns {Promise<{ success?: boolean, skipped?: boolean, reason?: string, instagramMediaId?: string }>}
 */
async function executeInstagramJob({ postId }) {
  const post = await Post.findById(postId).populate('instagramAccountId');
  if (!post) {
    await logService.logEntry({ step: 'instagram.job.missing', message: `Post ${postId} not found` });
    return { skipped: true, reason: 'not_found' };
  }

  if (!post.platforms?.instagram?.enabled) {
    return { skipped: true, reason: 'not_enabled' };
  }
  if (post.platforms.instagram.status === 'posted') {
    return { skipped: true, reason: 'already_posted' };
  }

  const account = post.instagramAccountId;
  if (!account) {
    await markPlatformResult(post, 'instagram', 'failed', 'No Instagram account linked', post.userId);
    return { skipped: true, reason: 'no_account' };
  }

  const media = getPrimaryMediaUrl(post);
  if (!media || !media.startsWith('http')) {
    await markPlatformResult(
      post,
      'instagram',
      'failed',
      'A public HTTPS media URL is required for Instagram',
      post.userId
    );
    return { skipped: true, reason: 'bad_media' };
  }
  const useVideo = post.mediaType === 'video' || post.mediaType === 'reel';

  const lock = await Post.findOneAndUpdate(
    {
      _id: post._id,
      'platforms.instagram.enabled': true,
      'platforms.instagram.status': { $nin: ['posted', 'skipped'] },
    },
    { $set: { 'platforms.instagram.status': 'publishing' } },
    { new: true }
  );
  if (!lock) {
    return { skipped: true, reason: 'lock_or_done' };
  }
  recomputeAggregatedStatus(lock);
  await lock.save();

  await logService.logEntry({
    userId: post.userId,
    postId: post._id,
    step: 'instagram.job.start',
    message: 'Publishing to Instagram',
  });

  try {
    const full = await Post.findById(postId).populate('instagramAccountId');
    const acc = full?.instagramAccountId;
    if (!acc) {
      throw new Error('Instagram account not found on post');
    }
    const caption = buildCaption(full);
    const { instagramMediaId } = useVideo
      ? await instagramService.publishVideoPost(acc, media, caption)
      : await instagramService.publishImagePost(acc, media, caption);

    const fresh = await Post.findById(postId);
    if (!fresh) return { success: true, instagramMediaId };
    fresh.platforms.instagram.status = 'posted';
    fresh.platforms.instagram.error = '';
    fresh.platforms.instagram.externalId = instagramMediaId;
    fresh.platforms.instagram.publishedAt = new Date();
    if (!fresh.instagramMediaId) {
      fresh.instagramMediaId = instagramMediaId;
    }
    fresh.markModified('platforms');
    recomputeAggregatedStatus(fresh);
    await fresh.save();

    await logService.logEntry({
      userId: post.userId,
      postId: post._id,
      step: 'instagram.job.success',
      message: `Published media ${instagramMediaId}`,
      meta: { instagramMediaId },
    });

    return { success: true, instagramMediaId };
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    const p = await Post.findById(postId);
    if (p) {
      await markPlatformResult(p, 'instagram', 'failed', msg, p.userId);
    }
    throw err;
  }
}

module.exports = { executeInstagramJob, buildCaption };
