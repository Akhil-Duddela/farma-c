const axios = require('axios');
const config = require('../config');
const Post = require('../models/Post');
const tokenService = require('./tokenService');
const InstagramAccount = require('../models/InstagramAccount');
const { withRetry } = require('../utils/retry');
const creatorStatsService = require('./creatorStatsService');

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

  const prevEng = post.engagementScore || 0;
  const likes = metrics.engagement || post.analytics?.likes || 0;
  const reach = metrics.reach || 0;
  const impressions = metrics.impressions || 0;
  const views = post.analytics?.views || 0;

  const engagementScore = Math.round(
    likes * 0.3 + reach * 0.08 + impressions * 0.01 + (views || 0) * 0.2
  );

  post.analytics = {
    likes,
    reach,
    impressions,
    views,
    lastSyncedAt: new Date(),
  };
  post.engagementScore = engagementScore;
  await post.save();
  const delta = engagementScore - (prevEng || 0);
  if (delta > 0) {
    await creatorStatsService.addEngagementToUser(post._id, Math.min(5000, delta));
  }
  return post.analytics;
}

/**
 * @param {string} d  day key YYYY-MM-DD
 */
function dayKey(d) {
  return d.toISOString().slice(0, 10);
}

async function listAnalyticsSummary(userId) {
  const u = require('../models/User');
  const user = await u.findById(userId).select('creatorStats').lean();
  const c = (user && user.creatorStats) || {};
  const totalNonDraft = await Post.countDocuments({
    userId,
    status: { $nin: ['draft'] },
  });
  const postedN = c.successfulPosts != null
    ? c.successfulPosts
    : await Post.countDocuments({ userId, status: { $in: ['posted', 'partial'] } });
  const failedN = c.failedPosts != null
    ? c.failedPosts
    : await Post.countDocuments({ userId, status: 'failed' });
  const attempts = (c.totalPostAttempts || 0) || totalNonDraft;

  const pl = {
    instagram: {
      posted: await Post.countDocuments({
        userId,
        'platforms.instagram.enabled': true,
        'platforms.instagram.status': 'posted',
      }),
      failed: await Post.countDocuments({
        userId,
        'platforms.instagram.enabled': true,
        'platforms.instagram.status': 'failed',
      }),
    },
    youtube: {
      posted: await Post.countDocuments({
        userId,
        'platforms.youtube.enabled': true,
        'platforms.youtube.status': 'posted',
      }),
      failed: await Post.countDocuments({
        userId,
        'platforms.youtube.enabled': true,
        'platforms.youtube.status': 'failed',
      }),
    },
  };

  const sinceW = new Date();
  sinceW.setDate(sinceW.getDate() - 14);
  const weekPosts = await Post.find({
    userId,
    createdAt: { $gte: sinceW },
    status: { $in: ['posted', 'failed', 'partial'] },
  })
    .select('status createdAt')
    .lean();
  const series = {};
  weekPosts.forEach((p) => {
    const d = new Date(p.createdAt);
    d.setUTCHours(0, 0, 0, 0);
    const k = dayKey(d);
    if (!series[k]) {
      series[k] = { day: k, posted: 0, failed: 0 };
    }
    if (p.status === 'posted' || p.status === 'partial') {
      series[k].posted += 1;
    }
    if (p.status === 'failed' || p.status === 'partial') {
      if (p.status === 'failed') {
        series[k].failed += 1;
      } else {
        series[k].failed += 1;
      }
    }
  });
  const weekly = Object.values(series).sort((a, b) => a.day.localeCompare(b.day));

  const posts = await Post.find({ userId, status: 'posted' })
    .select('analytics caption postedAt')
    .sort({ postedAt: -1 })
    .limit(100)
    .lean();

  const totals = posts.reduce(
    (acc, p) => ({
      likes: acc.likes + (p.analytics?.likes || 0),
      reach: acc.reach + (p.analytics?.reach || 0),
      impressions: acc.impressions + (p.analytics?.impressions || 0),
    }),
    { likes: 0, reach: 0, impressions: 0 }
  );
  const denom = Math.max(1, postedN + failedN);
  const successRate = Math.round(1000 * (postedN / denom)) / 10;

  return {
    totals,
    recent: posts,
    creator: {
      totalPostAttempts: attempts,
      successfulPosts: postedN,
      failedPosts: failedN,
      engagementScore: c.engagementScore || 0,
      aiUsageCount: c.aiUsageCount || 0,
    },
    platforms: pl,
    rates: {
      successRatePercent: successRate,
    },
    activity: { weekly, windowDays: 14 },
  };
}

module.exports = { syncPostInsights, listAnalyticsSummary, dayKey };
