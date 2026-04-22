const aiEnhancerService = require('../services/aiEnhancerService');

async function enhance(req, res, next) {
  try {
    const input = req.body.input;
    const data = await aiEnhancerService.enhanceContent(input, { requestId: req.id });
    res.json({ ...data, requestId: req.id });
  } catch (e) {
    next(e);
  }
}

module.exports = { enhance };
