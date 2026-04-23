const User = require('../models/User');

const BADGE_VERIFIED = 'verified_creator';
const BADGE_TOP = 'top_performer';
const BADGE_CONSISTENT = 'consistent_poster';
const BADGE_NEW = 'new_creator';

const PROFILE_TRUST = new Set(['verified', 'auto_verified']);

/**
 * @param {import('mongoose').Document|object} u
 * @returns {string[]}
 */
function computeBadgesForUser(u) {
  const out = new Set();
  if (!u) {
    return [];
  }
  if (
    u.emailVerified === true
    && u.phoneVerified === true
    && PROFILE_TRUST.has(String(u.verificationStatus))
  ) {
    out.add(BADGE_VERIFIED);
  }
  const stats = u.creatorStats || {};
  const s = stats.successfulPosts || 0;
  const f = stats.failedPosts || 0;
  const t = (stats.totalPostAttempts || 0) + 1e-6;
  const eng = Math.min(1e6, Math.max(0, stats.engagementScore || 0));
  const denom = Math.max(1, s + f);
  const successRate = s / denom;
  const dayMs = 864e5;
  const age = u.createdAt ? (Date.now() - new Date(u.createdAt)) / dayMs : 999;
  if (age < 30 && t >= 1) {
    out.add(BADGE_NEW);
  }
  if (s >= 5 && t >= 3) {
    out.add(BADGE_CONSISTENT);
  }
  if (s >= 8 && eng >= 150 && successRate >= 0.5) {
    out.add(BADGE_TOP);
  }
  return [...out].sort();
}

/**
 * @param {import('mongoose').Types.ObjectId} userId
 */
async function recomputeForUserId(userId) {
  if (!userId) return;
  const u = await User.findById(userId);
  if (!u) return;
  u.badges = computeBadgesForUser(u);
  u.markModified('badges');
  await u.save();
}

/**
 * Top N users by internal leaderboard score (in-process sampling).
 * @param {number} n
 * @returns {Promise<string[]>}
 */
async function getTopUserIds(n) {
  const list = await User.aggregate([
    { $match: { role: 'user', isActive: true, 'creatorStats.engagementScore': { $gt: 0 } } },
    {
      $addFields: {
        lb: {
          $add: [
            { $multiply: [0.0003, { $ifNull: ['$creatorStats.engagementScore', 0] }] },
            { $multiply: [3, { $ifNull: ['$creatorStats.successfulPosts', 0] }] },
            { $multiply: [0.1, { $ifNull: ['$creatorStats.aiUsageCount', 0] }] },
          ],
        },
      },
    },
    { $sort: { lb: -1 } },
    { $limit: n },
    { $project: { _id: 1 } },
  ]).option({ allowDiskUse: true });
  return (list || []).map((r) => String(r._id));
}

/**
 * Public leaderboard document shape.
 * @param {import('mongoose').Types.ObjectId} [viewerId]
 */
async function getLeaderboard(viewerId, { limit = 30 } = {}) {
  const cap = Math.min(100, Math.max(1, limit));
  const topIds = await getTopUserIds(cap);
  const rows = await User.find({ _id: { $in: topIds } })
    .select('name email createdAt profileImageUrl verificationStatus badges creatorStats lastActiveIp')
    .lean();

  const scoreRow = (u) => {
    const c = u.creatorStats || {};
    const s = c.successfulPosts || 0;
    const f = c.failedPosts || 0;
    const denom = Math.max(1, s + f);
    const successRate = s / denom;
    const consistency = Math.min(1, s / 50);
    const eng = (c.engagementScore || 0) * 0.0004;
    const base = 100 * (0.45 * successRate + 0.35 * consistency) + 20 * eng;
    const vBonus = u.badges && u.badges.includes(BADGE_VERIFIED) ? 5 : 0;
    return { raw: base + vBonus, successRate, s, f };
  };

  const withRank = topIds
    .map((id) => {
      const u = rows.find((r) => String(r._id) === id);
      if (!u) {
        return null;
      }
      const { raw, successRate, s, f } = scoreRow(u);
      return {
        id: String(u._id),
        name: u.name,
        email: (u.email || '').replace(/(^.).*(@.*$)/, '$1***$2'),
        profileImageUrl: u.profileImageUrl,
        level: getCreatorLevel(u, successRate, s, f),
        successRate: Math.round(successRate * 1000) / 1000,
        successfulPosts: s,
        failedPosts: f,
        engagementScore: Math.round((u.creatorStats && u.creatorStats.engagementScore) || 0),
        totalPosts: (u.creatorStats && u.creatorStats.totalPostAttempts) || 0,
        badges: u.badges || [],
        rankScore: Math.round(raw * 10) / 10,
        isYou: viewerId && String(u._id) === String(viewerId),
      };
    })
    .filter(Boolean);
  withRank.sort((a, b) => b.rankScore - a.rankScore);
  withRank.forEach((row, i) => {
    row.rank = i + 1;
  });
  return { items: withRank, asOf: new Date().toISOString() };
}

/**
 * @param {object} u
 * @param {number} successRate
 * @param {number} s
 * @param {number} f
 * @returns {string}
 */
function getCreatorLevel(u, successRate, s, f) {
  if (s + f < 1) {
    return 'beginner';
  }
  if (s + f < 4 || (successRate < 0.5 && s < 5)) {
    return 'active_creator';
  }
  if (s >= 15 && successRate >= 0.65) {
    const isVerified =
      u.verificationStatus === 'verified' || u.verificationStatus === 'auto_verified';
    if (isVerified && s >= 25) {
      return 'verified_creator';
    }
    if (s >= 40) {
      return 'pro_creator';
    }
  }
  if (s >= 8) {
    return 'pro_creator';
  }
  return 'active_creator';
}

module.exports = {
  recomputeForUserId,
  computeBadgesForUser,
  getLeaderboard,
  BADGE_VERIFIED,
  BADGE_TOP,
  BADGE_CONSISTENT,
  BADGE_NEW,
  getTopUserIds,
  getCreatorLevel,
};
