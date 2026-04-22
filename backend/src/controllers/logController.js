const ActivityLog = require('../models/ActivityLog');

async function list(req, res, next) {
  try {
    const filter = { userId: req.user._id };
    if (req.query.level) filter.level = req.query.level;
    if (req.query.postId) filter.postId = req.query.postId;

    const logs = await ActivityLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(req.query.limit || '100', 10));
    res.json(logs);
  } catch (e) {
    next(e);
  }
}

module.exports = { list };
