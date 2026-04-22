const axios = require('axios');
const config = require('../config');
const Post = require('../models/Post');
const tokenService = require('./tokenService');
const InstagramAccount = require('../models/InstagramAccount');
const { withRetry } = require('../utils/retry');

/**
 * Fetch insights for a published media (requires instagram_media_id).
 */
async function syncPostInsights(userId, postId) {
  const post = await Post.findOne({ _id: postId, userId });
  if (!post || !post.instagramMediaId) {
    return null;
  }
  const account = await InstagramAccount.findById(post.instagramAccountId);
  if (!account) return null;
  const token = tokenService.getPlainToken(account);

  const url = `https://graph.facebook.com/${config.instagram.graphVersion}/${post.instagramMediaId}/insights`;
  const { data } = await withRetry(
    async () =>
      axios.get(url, {
        params: {
          metric: 'engagement,impressions,reach',
          access_token: token,
        },
        timeout: 20000,
      }),
    { maxAttempts: 2 }
  );

  const metrics = {};
  (data.data || []).forEach((m) => {
    metrics[m.name] = m.values?.[0]?.value ?? 0;
  });

  post.analytics = {
    likes: metrics.engagement || post.analytics?.likes || 0,
    reach: metrics.reach || 0,
    impressions: metrics.impressions || 0,
    lastSyncedAt: new Date(),
  };
  await post.save();
  return post.analytics;
}

async function listAnalyticsSummary(userId) {
  const posts = await Post.find({ userId, status: 'posted' })
    .select('analytics caption postedAt')
    .sort({ postedAt: -1 })
    .limit(100);

  const totals = posts.reduce(
    (acc, p) => ({
      likes: acc.likes + (p.analytics?.likes || 0),
      reach: acc.reach + (p.analytics?.reach || 0),
      impressions: acc.impressions + (p.analytics?.impressions || 0),
    }),
    { likes: 0, reach: 0, impressions: 0 }
  );

  return { totals, recent: posts };
}

module.exports = { syncPostInsights, listAnalyticsSummary };
