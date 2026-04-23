const User = require('../models/User');
const notificationService = require('../services/notificationService');

/**
 * POST /api/notifications/register-device { token }
 */
async function registerDevice(req, res, next) {
  try {
    const token = String(req.body.token || '').trim();
    if (!token || token.length < 10) {
      return res.status(400).json({ error: 'Valid FCM token is required' });
    }
    const t = token.slice(0, 4096);
    const u = await User.findById(req.user._id).select('fcmTokens');
    if (!u) {
      return res.status(404).json({ error: 'User not found' });
    }
    const prev = Array.isArray(u.fcmTokens) ? u.fcmTokens : [];
    const nextArr = [...new Set([...prev, t])].slice(-notificationService.MAX_TOKENS);
    u.fcmTokens = nextArr;
    await u.save();
    res.json({ ok: true, count: nextArr.length });
  } catch (e) {
    next(e);
  }
}

/**
 * POST /api/notifications/unregister-device { token } — e.g. on logout
 */
async function unregisterDevice(req, res, next) {
  try {
    const token = String(req.body.token || '').trim();
    if (!token) {
      return res.status(400).json({ error: 'token is required' });
    }
    await User.updateOne({ _id: req.user._id }, { $pull: { fcmTokens: token.slice(0, 4096) } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

module.exports = { registerDevice, unregisterDevice };
