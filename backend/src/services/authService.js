const jwt = require('jsonwebtoken');
const User = require('../models/User');
const config = require('../config');

async function register({ email, password, name }) {
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    const err = new Error('Email already registered');
    err.status = 409;
    throw err;
  }
  const passwordHash = await User.hashPassword(password);
  const user = await User.create({
    email: email.toLowerCase(),
    passwordHash,
    name: name || '',
  });
  return user;
}

async function login({ email, password }) {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !(await user.comparePassword(password))) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    throw err;
  }
  if (!user.isActive) {
    const err = new Error('Account disabled');
    err.status = 403;
    throw err;
  }
  const token = jwt.sign(
    { sub: user._id.toString(), role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
  return { user, token };
}

function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

module.exports = { register, login, verifyToken };
