const { body, validationResult } = require('express-validator');
const authService = require('../services/authService');

const registerValidators = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('name').optional().trim(),
];

async function register(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
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
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
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

module.exports = { register, login, me, registerValidators };
