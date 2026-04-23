const User = require('../models/User');
const authService = require('../services/authService');
const verificationService = require('../services/verificationService');
const logger = require('../utils/logger');

function userVerificationDto(user) {
  const u = user.toObject ? user.toObject() : user;
  return {
    emailVerified: !!u.emailVerified,
    phoneVerified: !!u.phoneVerified,
    phoneNumberMasked: u.phoneNumber
      ? verificationService.maskPhone(u.phoneNumber) || '****'
      : '',
    profileImageUrl: u.profileImageUrl || '',
    verificationStatus: u.verificationStatus || 'unverified',
    verificationNotes: u.verificationNotes || '',
    canUsePublishing: User.isFullyVerified(u),
  };
}

function userPublic(u) {
  return {
    id: u._id,
    email: u.email,
    name: u.name,
    role: u.role,
    timezone: u.timezone,
    dailyAutoPostCount: u.dailyAutoPostCount,
    dailyAutoPostHourIST: u.dailyAutoPostHourIST,
    ...userVerificationDto(u),
  };
}

async function register(req, res, next) {
  try {
    const user = await authService.register(req.body);
    res.status(201).json({
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      message: 'Check your email to verify your address, then complete phone and profile in Verification.',
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
      user: userPublic(user),
    });
  } catch (e) {
    next(e);
  }
}

async function me(req, res) {
  res.json(userPublic(req.user));
}

/**
 * GET /api/auth/verify-email?token= — public
 */
async function verifyEmailQuery(req, res) {
  try {
    const token = String(req.query.token || '').trim();
    await verificationService.confirmEmailByToken(token);
    const wantJson = (req.get('Accept') || '').includes('application/json') || req.query.json === '1';
    if (wantJson) {
      return res.json({ ok: true, message: 'Email verified' });
    }
    const base = (require('../config').frontendUrl || 'http://localhost:4200').replace(/\/$/, '');
    return res.redirect(302, `${base}/verify-email?result=ok`);
  } catch (e) {
    const code = e.code || 'error';
    const wantJson = (req.get('Accept') || '').includes('application/json') || req.query.json === '1';
    if (wantJson) {
      return res.status(e.status || 400).json({ ok: false, error: e.message, code });
    }
    const base = (require('../config').frontendUrl || 'http://localhost:4200').replace(/\/$/, '');
    return res.redirect(302, `${base}/verify-email?result=error&reason=${encodeURIComponent(code)}`);
  }
}

/** POST /api/auth/resend-verification */
async function resendVerification(req, res, next) {
  try {
    if (req.user.emailVerified) {
      return res.json({ ok: true, message: 'Email already verified' });
    }
    const r = await verificationService.sendEmailVerificationForUser(req.user);
    res.json({ ok: r.sent, sent: r.sent, mockUrl: r.mockUrl });
  } catch (e) {
    if (e.status) {
      return res.status(e.status).json({ error: e.message });
    }
    next(e);
  }
}

/** POST /api/auth/send-otp { phoneNumber } */
async function sendOtp(req, res, next) {
  try {
    const { phoneNumber } = req.body;
    const r = await verificationService.sendOtpForUser(req.user._id, phoneNumber);
    res.json({ ok: true, sent: r.sent, phoneMasked: r.phoneMasked, expiresIn: r.expiresIn });
  } catch (e) {
    if (e.status) {
      return res.status(e.status).json({ error: e.message, code: e.code });
    }
    next(e);
  }
}

/** POST /api/auth/verify-otp { phoneNumber, otp } */
async function verifyOtpRoute(req, res, next) {
  try {
    const { phoneNumber, otp } = req.body;
    const user = await verificationService.verifyOtpForUser(req.user._id, phoneNumber, otp);
    res.json({ ok: true, user: userPublic(user) });
  } catch (e) {
    if (e.status) {
      return res.status(e.status).json({ error: e.message, code: e.code });
    }
    next(e);
  }
}

module.exports = {
  register,
  login,
  me,
  verifyEmailQuery,
  resendVerification,
  sendOtp,
  verifyOtpRoute,
  userPublic,
  userVerificationDto,
};
