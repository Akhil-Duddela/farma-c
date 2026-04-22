const User = require('../models/User');

async function getSettings(req, res, next) {
  try {
    const u = await User.findById(req.user._id).select(
      'timezone dailyAutoPostCount dailyAutoPostHourIST name email'
    );
    res.json(u);
  } catch (e) {
    next(e);
  }
}

async function updateSettings(req, res, next) {
  try {
    const allowed = ['timezone', 'dailyAutoPostCount', 'dailyAutoPostHourIST', 'name'];
    const u = await User.findById(req.user._id);
    allowed.forEach((k) => {
      if (req.body[k] !== undefined) u[k] = req.body[k];
    });
    await u.save();
    res.json(u);
  } catch (e) {
    next(e);
  }
}

module.exports = { getSettings, updateSettings };
