const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const config = require('../config');
const emailService = require('./emailService');
const smsService = require('./smsService');
const { normalizeE164, maskPhone } = require('../utils/phone');
const logger = require('../utils/logger');
const aiVerificationService = require('./aiVerificationService');

const RESEND_COOLDOWN_MS = 60 * 1000;

function hmacEmailToken(rawToken) {
  return crypto.createHmac('sha256', config.jwtSecret).update(String(rawToken), 'utf8').digest('hex');
}

function generateRawEmailToken() {
  return crypto.randomBytes(32).toString('hex');
}

function generateOtpDigits() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * @param {import('mongoose').Document} user
 */
async function sendEmailVerificationForUser(user) {
  if (user.emailVerified) {
    return { sent: false, reason: 'already_verified' };
  }
  const now = Date.now();
  if (user.lastVerificationEmailAt && now - new Date(user.lastVerificationEmailAt).getTime() < RESEND_COOLDOWN_MS) {
    const err = new Error('Please wait before requesting another email');
    err.status = 429;
    throw err;
  }
  const raw = generateRawEmailToken();
  const hmac = hmacEmailToken(raw);
  const ttlMin = config.emailVerifyTtlMin;
  const exp = new Date(Date.now() + ttlMin * 60 * 1000);
  user.emailVerificationToken = hmac;
  user.emailVerificationExpires = exp;
  user.lastVerificationEmailAt = new Date();
  await user.save();

  const base = (config.frontendUrl || 'http://localhost:4200').replace(/\/$/, '');
  const verifyUrl = `${base}/verify-email?token=${encodeURIComponent(raw)}`;
  const ok = await emailService.sendVerificationEmail(user.email, verifyUrl);
  if (!ok && config.env === 'production') {
    logger.error('Verification email not sent; check SMTP in production', { userId: String(user._id) });
  } else if (!ok) {
    logger.info('Dev: verification link (no SMTP)', { verifyUrl: verifyUrl.replace(raw, '…') });
  }
  return { sent: ok, mockUrl: !ok ? verifyUrl : undefined };
}

/**
 * @param {string} rawToken
 */
async function confirmEmailByToken(rawToken) {
  if (!rawToken || String(rawToken).length < 20) {
    const e = new Error('Invalid or expired link');
    e.status = 400;
    e.code = 'invalid_token';
    throw e;
  }
  const hmac = hmacEmailToken(String(rawToken).trim());
  const user = await User.findOne({ emailVerificationToken: hmac });
  if (!user) {
    const e = new Error('Invalid or expired link');
    e.status = 400;
    e.code = 'invalid_token';
    throw e;
  }
  if (user.emailVerificationExpires && new Date(user.emailVerificationExpires) < new Date()) {
    const e = new Error('This link has expired. Request a new one from the app.');
    e.status = 400;
    e.code = 'expired_token';
    throw e;
  }
  user.emailVerified = true;
  user.emailVerificationToken = '';
  user.emailVerificationExpires = null;
  await user.save();
  logger.info('Email verified', { userId: String(user._id) });
  return user;
}

/**
 * @param {import('mongoose').Types.ObjectId} userId
 * @param {string} phoneRaw
 */
async function sendOtpForUser(userId, phoneRaw) {
  const phone = normalizeE164(phoneRaw);
  if (!phone) {
    const e = new Error('Use E.164 format, e.g. +14155552671');
    e.status = 400;
    throw e;
  }
  const user = await User.findById(userId);
  if (!user) {
    const e = new Error('User not found');
    e.status = 404;
    throw e;
  }
  const other = await User.findOne({ phoneNumber: phone, _id: { $ne: userId } });
  if (other) {
    const e = new Error('This phone number is already used on another account');
    e.status = 409;
    throw e;
  }
  const otp = generateOtpDigits();
  const hash = await bcrypt.hash(otp, 10);
  const ttlMin = config.otpTtlMin;
  user.phoneNumber = phone;
  user.otpHash = hash;
  user.otpExpires = new Date(Date.now() + ttlMin * 60 * 1000);
  user.phoneVerified = false;
  await user.save();

  const body = `Your Farm-C AI code is ${otp}. It expires in ${ttlMin} minutes.`;
  const sent = await smsService.sendSms(phone, body);
  if (!sent) {
    if (config.env === 'development') {
      logger.info('Dev: OTP (SMS mock)', { phone: maskPhone(phone), otp });
    } else {
      const e = new Error('SMS could not be sent. Try again later or contact support.');
      e.status = 502;
      throw e;
    }
  }
  return { sent, expiresIn: ttlMin * 60, phoneMasked: maskPhone(phone) };
}

/**
 * @param {import('mongoose').Types.ObjectId} userId
 * @param {string} phoneRaw
 * @param {string} otp
 */
async function verifyOtpForUser(userId, phoneRaw, otp) {
  const phone = normalizeE164(phoneRaw);
  if (!phone || !/^\d{6}$/.test(String(otp).trim())) {
    const e = new Error('Invalid phone or code');
    e.status = 400;
    throw e;
  }
  const user = await User.findById(userId);
  if (!user || user.phoneNumber !== phone) {
    const e = new Error('No pending verification for this number');
    e.status = 400;
    throw e;
  }
  if (!user.otpHash || !user.otpExpires || new Date(user.otpExpires) < new Date()) {
    const e = new Error('Code expired. Request a new one.');
    e.status = 400;
    e.code = 'expired_otp';
    throw e;
  }
  const ok = await bcrypt.compare(String(otp).trim(), user.otpHash);
  if (!ok) {
    const e = new Error('Invalid code');
    e.status = 400;
    throw e;
  }
  user.phoneVerified = true;
  user.otpHash = '';
  user.otpExpires = null;
  await user.save();
  logger.info('Phone verified', { userId: String(userId) });
  return user;
}

/**
 * @param {import('mongoose').Document} user
 * @param {string} imageUrl
 */
async function setProfileImage(user, imageUrl) {
  if (!imageUrl) {
    const e = new Error('imageUrl required');
    e.status = 400;
    throw e;
  }
  user.profileImageUrl = String(imageUrl).trim().slice(0, 2000);
  await user.save();
  return user;
}

/**
 * Run AI (Rekognition) + heuristics; auto_verified on pass, else pending for admin
 * @param {import('mongoose').Document} user
 */
async function submitProfileVerification(user) {
  if (!user.profileImageUrl) {
    const e = new Error('Upload a profile image first');
    e.status = 400;
    throw e;
  }
  if (['verified', 'auto_verified'].includes(String(user.verificationStatus))) {
    return user;
  }

  let r;
  try {
    r = await aiVerificationService.verifyProfileImage(user.profileImageUrl);
  } catch (e) {
    logger.error('aiVerification threw', { err: e.message });
    r = { valid: null, confidence: 0, reason: 'ANALYSIS_FAILED' };
  }

  if (r.valid === true) {
    user.verificationStatus = 'auto_verified';
    user.verificationScore = Math.min(1, Math.max(0, r.confidence || 0));
    user.verificationNotes = r.reason || 'Auto approved';
  } else if (r.valid === false) {
    user.verificationStatus = 'pending';
    user.verificationScore = 0;
    user.verificationNotes = r.reason || 'Did not pass automatic checks; awaiting admin';
  } else {
    /* valid === null: Rekognition off or service error */
    user.verificationStatus = 'pending';
    user.verificationScore = 0;
    const msg =
      r.reason === 'REKOGNITION_UNAVAILABLE' || r.reason === 'AWS Rekognition is not configured'
        ? 'Configure AWS for automatic face check, or an admin will review your photo'
        : 'Auto verification is temporarily unavailable. Your submission is in the review queue';
    user.verificationNotes = msg;
  }
  await user.save();
  logger.info('Profile verification submitted', {
    userId: String(user._id),
    status: user.verificationStatus,
    auto: r.valid,
  });
  return user;
}

module.exports = {
  hmacEmailToken,
  sendEmailVerificationForUser,
  confirmEmailByToken,
  sendOtpForUser,
  verifyOtpForUser,
  setProfileImage,
  submitProfileVerification,
  maskPhone,
  RESEND_COOLDOWN_MS,
};
