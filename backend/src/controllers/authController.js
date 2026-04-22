const authService = require('../services/authService');

async function register(req, res, next) {
  try {
    const user = await authService.register(req.body);
    res.status(201).json({
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
  } catch (e) {
    next(e);
  }
}

async function login(req, res, next) {
  try {
    const { user, token } = await authService.login({
      email: req.body.email,
      password: req.body.password,
    });
    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        timezone: user.timezone,
      },
    });
  } catch (e) {
    next(e);
  }
}

async function me(req, res) {
  res.json({
    id: req.user._id,
    email: req.user.email,
    name: req.user.name,
    role: req.user.role,
    timezone: req.user.timezone,
    dailyAutoPostCount: req.user.dailyAutoPostCount,
    dailyAutoPostHourIST: req.user.dailyAutoPostHourIST,
  });
}

module.exports = { register, login, me };
