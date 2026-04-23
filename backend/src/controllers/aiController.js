const aiEnhancerService = require('../services/aiEnhancerService');
const creatorStatsService = require('../services/creatorStatsService');
const recommendationService = require('../services/recommendationService');

async function enhance(req, res, next) {
  try {
    const input = req.body.input;
    const data = await aiEnhancerService.enhanceContent(input, { requestId: req.id });
    await creatorStatsService.incrementAiUsage(req.user._id, 1);
    res.json({ ...data, requestId: req.id });
  } catch (e) {
    next(e);
  }
}

async function recommendations(req, res, next) {
  try {
    const { timezone, locale } = req.user || {};
    res.json(
      recommendationService.getRecommendations({
        timezone: timezone || req.query.timezone,
        locale: locale || req.query.locale,
      })
    );
  } catch (e) {
    next(e);
  }
}

module.exports = { enhance, recommendations };
