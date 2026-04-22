const analyticsService = require('../services/analyticsService');

async function summary(req, res, next) {
  try {
    const data = await analyticsService.listAnalyticsSummary(req.user._id);
    res.json(data);
  } catch (e) {
    next(e);
  }
}

async function syncPost(req, res, next) {
  try {
    const a = await analyticsService.syncPostInsights(req.user._id, req.params.postId);
    res.json(a);
  } catch (e) {
    next(e);
  }
}

module.exports = { summary, syncPost };
