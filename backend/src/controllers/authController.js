const User = require('../models/User');
const authService = require('../services/authService');
const verificationService = require('../services/verificationService');
const logger = require('../utils/logger');
const fraudDetectionService = require('../services/fraudDetectionService');
const badgeService = require('../services/badgeService');
const { normalizeE164 } = require('../utils/phone');

function userVerificationDto(user) {
  const u = user.toObject ? user.toObject() : user;
  const can = User.isFullyVerified(u);
  return {
    emailVerified: !!u.emailVerified,
    phoneVerified: !!u.phoneVerified,
    phoneNumberMasked: u.phoneNumber
      ? verificationService.maskPhone(u.phoneNumber) || '****'
      : '',
    profileImageUrl: u.profileImageUrl || '',
    verificationStatus: u.verificationStatus || 'unverified',
    verificationScore: typeof u.verificationScore === 'number' ? u.verificationScore : 0,
    verificationNotes: u.verificationNotes || '',
    canUsePublishing: can,
    hasVerifiedCreatorBadge: can,
  };
}

function userPublic(u) {
  const o = u && u.toObject ? u.toObject() : u;
  const stats = o.creatorStats || {};
  const s = stats.successfulPosts || 0;
  const f = stats.failedPosts || 0;
  const successRate = s / Math.max(1, s + f);
  return {
    id: o._id,
    email: o.email,
    name: o.name,
    role: o.role,
    timezone: o.timezone,
    dailyAutoPostCount: o.dailyAutoPostCount,
    dailyAutoPostHourIST: o.dailyAutoPostHourIST,
    ...userVerificationDto(u),
    badges: Array.isArray(o.badges) ? o.badges : [],
    riskScore: typeof o.riskScore === 'number' ? o.riskScore : 0,
    flagged: !!o.flagged,
    creatorLevel: badgeService.getCreatorLevel(o, successRate, s, f),
  };
}

async function register(req, res, next) {
  try {
    await fraudDetectionService.assertRegisterIpNotAbusive(req);
    const user = await authService.register(req.body);
    const ip = fraudDetectionService.clientIp(req);
    if (ip) {
      void fraudDetectionService.recordAuthContext(user._id, ip);
    }
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
    await fraudDetectionService.onLogin(user._id, fraudDetectionService.clientIp(req));
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

/** POST /api/auth/send-otp { phoneNumber, captchaToken } */
async function sendOtp(req, res, next) {
  try {
    const { phoneNumber } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(401).json({ error: 'User not found', code: 'NOT_FOUND', details: [] });
    }
    const ph = normalizeE164(phoneNumber);
    if (!ph) {
      return res
        .status(400)
        .json({ error: 'Use E.164 format, e.g. +14155552671', code: 'VALIDATION', details: [] });
    }
    await fraudDetectionService.assertOtpRequestAllowed({ user, phone: ph, req });
    const r = await verificationService.sendOtpForUser(req.user._id, phoneNumber);
    await fraudDetectionService.onOtpRequested(req.user._id, req);
    res.json({ ok: true, sent: r.sent, phoneMasked: r.phoneMasked, expiresIn: r.expiresIn });
  } catch (e) {
    if (e.status) {
      return res.status(e.status).json({
        error: e.message,
        code: e.code || 'ERROR',
        details: Array.isArray(e.details) ? e.details : [],
        ...(e.retryAfterSec != null ? { retryAfterSec: e.retryAfterSec } : {}),
      });
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
