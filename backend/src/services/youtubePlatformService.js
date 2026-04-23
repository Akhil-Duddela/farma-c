const Post = require('../models/Post');
const { getPrimaryMediaUrl } = require('../utils/platformMedia');
const { recomputeAggregatedStatus, markPlatformResult } = require('./postStatusService');
const youtubeService = require('./youtubeService');
const logService = require('./logService');
const { withRetry } = require('../utils/retry');
const creatorStatsService = require('./creatorStatsService');

const VIDEO_TYPES = new Set(['video', 'reel']);

/**
 * YouTube-only job — never touches Instagram.
 */
async function executeYoutubeJob({ postId }) {
  const post = await Post.findById(postId).populate('youtubeAccountId');
  if (!post) {
    await logService.logEntry({ step: 'youtube.job.missing', message: `Post ${postId} not found` });
    return { skipped: true, reason: 'not_found' };
  }

  if (!post.platforms?.youtube?.enabled) {
    return { skipped: true, reason: 'not_enabled' };
  }
  if (post.platforms.youtube.status === 'posted') {
    return { skipped: true, reason: 'already_posted' };
  }

  const account = post.youtubeAccountId;
  if (!account) {
    await markPlatformResult(
      post,
      'youtube',
      'failed',
      'No YouTube account linked',
      post.userId
    );
    return { skipped: true, reason: 'no_account' };
  }

  if (!VIDEO_TYPES.has(post.mediaType)) {
    await markPlatformResult(
      post,
      'youtube',
      'failed',
      'YouTube Shorts requires video media (mediaType: video or reel) with a public video URL',
      post.userId
    );
    return { skipped: true, reason: 'not_video' };
  }

  const videoUrl = getPrimaryMediaUrl(post);
  if (!videoUrl || !videoUrl.startsWith('http')) {
    await markPlatformResult(
      post,
      'youtube',
      'failed',
      'A public HTTPS video URL is required for YouTube upload',
      post.userId
    );
    return { skipped: true, reason: 'bad_media' };
  }

  const lock = await Post.findOneAndUpdate(
    {
      _id: post._id,
      'platforms.youtube.enabled': true,
      'platforms.youtube.status': { $nin: ['posted', 'skipped'] },
    },
    { $set: { 'platforms.youtube.status': 'publishing' } },
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
    step: 'youtube.job.start',
    message: 'Uploading to YouTube (Shorts)',
  });

  try {
    const full = await Post.findById(postId).populate('youtubeAccountId');
    const acc = full?.youtubeAccountId;
    if (!acc) {
      throw new Error('YouTube account not found on post');
    }
    const title = (lock.caption || lock.content || 'Short').slice(0, 100);
    const desc = [lock.caption, lock.content].filter(Boolean).join('\n\n').slice(0, 5000);
    const tags = Array.isArray(lock.hashtags) ? lock.hashtags.map((h) => String(h).replace(/^#/, '')) : [];
    const { videoId, durationSec } = await withRetry(
      () =>
        youtubeService.uploadShortFromUrl({
          account: acc,
          videoUrl,
          title,
          description: desc,
          tags,
          privacyStatus: 'unlisted',
        }),
      { maxAttempts: 2, baseDelayMs: 2000, maxDelayMs: 20000 }
    );
    const fresh = await Post.findById(postId);
    if (!fresh) {
      return { success: true, videoId, durationSec };
    }
    fresh.platforms.youtube.status = 'posted';
    fresh.platforms.youtube.error = '';
    fresh.platforms.youtube.externalId = videoId;
    fresh.platforms.youtube.publishedAt = new Date();
    if (!fresh.youtubeVideoId) fresh.youtubeVideoId = videoId;
    fresh.markModified('platforms');
    recomputeAggregatedStatus(fresh);
    await creatorStatsService.applyTerminalIfNeeded(fresh);
    await fresh.save();

    await logService.logEntry({
      userId: post.userId,
      postId: post._id,
      step: 'youtube.job.success',
      message: `Uploaded video ${videoId}`,
      meta: { videoId, durationSec },
    });

    return { success: true, videoId, durationSec };
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    const p = await Post.findById(postId);
    if (p) {
      await markPlatformResult(p, 'youtube', 'failed', msg, p.userId);
    }
    throw err;
  }
}

module.exports = { executeYoutubeJob };
