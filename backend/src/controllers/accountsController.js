const InstagramAccount = require('../models/InstagramAccount');
const YouTubeAccount = require('../models/YouTubeAccount');

/**
 * GET /api/accounts/status — default (first by isDefault) account per type.
 */
async function status(req, res, next) {
  try {
    const userId = req.user._id;
    const [ig, yt] = await Promise.all([
      InstagramAccount.find({ userId }).sort({ isDefault: -1, updatedAt: -1 }).lean().limit(5),
      YouTubeAccount.find({ userId }).sort({ isDefault: -1, updatedAt: -1 }).lean().limit(5),
    ]);
    const ig0 = ig[0];
    const yt0 = yt[0];
    res.json({
      instagram: {
        connected: ig.length > 0,
        username: ig0?.username || null,
        profilePicture: ig0?.profilePictureUrl || null,
        accountId: ig0?._id ? String(ig0._id) : null,
        igUserId: ig0?.igUserId || null,
      },
      youtube: {
        connected: yt.length > 0,
        channelName: yt0?.channelTitle || null,
        thumbnail: yt0?.thumbnailUrl || null,
        accountId: yt0?._id ? String(yt0._id) : null,
        channelId: yt0?.channelId || null,
      },
    });
  } catch (e) {
    next(e);
  }
}

module.exports = { status };
