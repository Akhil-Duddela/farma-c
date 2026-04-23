const User = require('../models/User');
const Post = require('../models/Post');
const badgeService = require('./badgeService');
const logger = require('../utils/logger');

/**
 * @param {import('mongoose').Types.ObjectId} userId
 * @param {number} [inc]
 */
async function incrementAiUsage(userId, inc = 1) {
  if (!userId) return;
  try {
    await User.updateOne(
      { _id: userId },
      { $inc: { 'creatorStats.aiUsageCount': inc } }
    );
    await badgeService.recomputeForUserId(userId);
  } catch (e) {
    logger.error('creatorStats.incrementAiUsage', { err: e.message, userId });
  }
}

/**
 * First time this post is no longer a draft, bump creator post attempts.
 * @param {import('mongoose').Document} post
 */
async function onFirstNonDraftPost(post) {
  if (!post || !post.userId || post.statsCountForUser) {
    return;
  }
  if (String(post.status) === 'draft') {
    return;
  }
  try {
    await User.updateOne(
      { _id: post.userId },
      {
        $inc: { 'creatorStats.totalPostAttempts': 1 },
        $set: { 'creatorStats.lastPostAt': new Date() },
      }
    );
    post.statsCountForUser = true;
    post.markModified('statsCountForUser');
    await badgeService.recomputeForUserId(post.userId);
  } catch (e) {
    logger.error('creatorStats.onFirstNonDraftPost', { err: e.message, postId: post._id });
  }
}

/**
 * @param {import('mongoose').Document} post
 */
function statsKeyForPost(post) {
  return String(post.status || 'draft');
}

/**
 * After aggregate status becomes posted | failed | partial, update success/fail counts once per key.
 * @param {import('mongoose').Document} post
 */
async function applyTerminalIfNeeded(post) {
  if (!post || !post.userId) {
    return;
  }
  const term = new Set(['posted', 'failed', 'partial']);
  if (!term.has(String(post.status))) {
    return;
  }
  const key = statsKeyForPost(post);
  if (post.lastStatsKey === key) {
    return;
  }
  const incS = { successfulPosts: 0, failedPosts: 0 };
  if (post.status === 'posted') {
    incS.successfulPosts = 1;
  } else if (post.status === 'failed') {
    incS.failedPosts = 1;
  } else if (post.status === 'partial') {
    incS.successfulPosts = 1;
    incS.failedPosts = 1;
  }
  try {
    await User.updateOne(
      { _id: post.userId },
      { $inc: { 'creatorStats.successfulPosts': incS.successfulPosts, 'creatorStats.failedPosts': incS.failedPosts } }
    );
    post.lastStatsKey = key;
    post.markModified('lastStatsKey');
    await badgeService.recomputeForUserId(post.userId);
  } catch (e) {
    logger.error('creatorStats.applyTerminalIfNeeded', { err: e.message, postId: post._id });
  }
}

/**
 * @param {import('mongoose').Types.ObjectId} postId
 * @param {number} delta
 */
async function addEngagementToUser(postId, delta) {
  if (!postId || !delta) return;
  const p = await Post.findById(postId).select('userId').lean();
  if (!p?.userId) return;
  try {
    await User.updateOne(
      { _id: p.userId },
      { $inc: { 'creatorStats.engagementScore': Math.min(1e6, Math.max(0, delta)) } }
    );
    await badgeService.recomputeForUserId(p.userId);
  } catch (e) {
    logger.error('creatorStats.addEngagement', { err: e.message, postId });
  }
}

module.exports = {
  incrementAiUsage,
  onFirstNonDraftPost,
  applyTerminalIfNeeded,
  addEngagementToUser,
  statsKeyForPost,
};
