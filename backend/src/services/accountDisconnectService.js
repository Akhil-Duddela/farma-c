const Post = require('../models/Post');
const { removeSinglePlatformJob } = require('./postService');
const { recomputeAggregatedStatus } = require('./postStatusService');
const logger = require('../utils/logger');

const DISC_MSG = 'Account disconnected';

/**
 * @param {import('mongoose').Types.ObjectId} userId
 * @param {'instagram'|'youtube'} platform
 * @param {import('mongoose').Types.ObjectId} accountObjectId
 */
async function failQueuedJobsForAccount(userId, platform, accountObjectId) {
  const key = platform === 'instagram' ? 'instagramAccountId' : 'youtubeAccountId';
  const posts = await Post.find({ userId, [key]: accountObjectId });
  let n = 0;
  for (const post of posts) {
    const st = post.platforms?.[platform];
    if (!st?.enabled) continue;
    if (st.status === 'posted' || st.status === 'skipped') continue;
    await removeSinglePlatformJob(post, platform);
    st.status = 'failed';
    st.error = DISC_MSG;
    post.markModified('platforms');
    recomputeAggregatedStatus(post);
    await post.save();
    n += 1;
  }
  if (n) {
    logger.info('Disconnected account: platform posts marked failed', {
      platform,
      userId: String(userId),
      n,
    });
  }
}

module.exports = { failQueuedJobsForAccount, DISC_MSG };
