const badgeService = require('../services/badgeService');

async function leaderboard(req, res, next) {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '30'), 10) || 30));
    const data = await badgeService.getLeaderboard(req.user._id, { limit });
    res.json(data);
  } catch (e) {
    next(e);
  }
}

module.exports = { leaderboard };
