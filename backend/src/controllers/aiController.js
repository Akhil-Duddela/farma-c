const { validationResult } = require('express-validator');
const aiEnhancerService = require('../services/aiEnhancerService');

async function enhance(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const input = req.body.input;
    const data = await aiEnhancerService.enhanceContent(input, { requestId: req.id });
    res.json({ ...data, requestId: req.id });
  } catch (e) {
    next(e);
  }
}

module.exports = { enhance };
