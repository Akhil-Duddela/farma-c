const InstagramAccount = require('../models/InstagramAccount');
const YouTubeAccount = require('../models/YouTubeAccount');

/**
 * GET /api/accounts/status
 * Summary for connected social accounts (default / first of each type).
 */
async function status(req, res, next) {
  try {
    const userId = req.user._id;
    const [ig, yt] = await Promise.all([
      InstagramAccount.find({ userId }).sort({ isDefault: -1, updatedAt: -1 }).lean(),
      YouTubeAccount.find({ userId }).sort({ isDefault: -1, updatedAt: -1 }).lean(),
    ]);
    res.json({
      instagram: {
        connected: ig.length > 0,
        username: ig[0]?.username || null,
      },
      youtube: {
        connected: yt.length > 0,
        channelName: yt[0]?.channelTitle || null,
      },
    });
  } catch (e) {
    next(e);
  }
}

module.exports = { status };
