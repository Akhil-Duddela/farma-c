const fraudDetectionService = require('../services/fraudDetectionService');

/**
 * Block posting/automation for flagged accounts (after auth + optional verification).
 */
function requireNotFraudFlagged(req, res, next) {
  try {
    fraudDetectionService.assertUserMayPost(req.user);
    next();
  } catch (e) {
    if (e.status) {
      return res.status(e.status).json({
        error: e.message,
        code: e.code || 'FRAUD_RESTRICTION',
        requiresReverification: true,
      });
    }
    next(e);
  }
}

module.exports = { requireNotFraudFlagged };
