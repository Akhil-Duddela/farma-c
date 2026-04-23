const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true },
    name: { type: String, trim: true, default: '' },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
      index: true,
    },
    timezone: { type: String, default: 'Asia/Kolkata' },
    /** Auto-generate N posts per day (0 = off) */
    dailyAutoPostCount: { type: Number, default: 0, min: 0, max: 10 },
    dailyAutoPostHourIST: { type: Number, default: 9, min: 0, max: 23 },
    isActive: { type: Boolean, default: true },

    /** HMAC-SHA256 (hex) of the raw email link token; raw token is never stored */
    emailVerificationToken: { type: String, default: '', index: true, sparse: true },
    emailVerified: { type: Boolean, default: false, index: true },
    emailVerificationExpires: { type: Date, default: null },
    lastVerificationEmailAt: { type: Date, default: null },

    phoneNumber: { type: String, default: null, trim: true, sparse: true, index: true },
    phoneVerified: { type: Boolean, default: false, index: true },
    /** Bcrypt hash of 6-digit OTP; plaintext OTP is never stored */
    otpHash: { type: String, default: '' },
    otpExpires: { type: Date, default: null },

    profileImageUrl: { type: String, default: '' },
    verificationStatus: {
      type: String,
      enum: ['unverified', 'pending', 'auto_verified', 'verified', 'rejected'],
      default: 'unverified',
      index: true,
    },
    /** Last AI/face check score 0–1 */
    verificationScore: { type: Number, default: 0, min: 0, max: 1 },
    verificationNotes: { type: String, default: '' },
  },
  { timestamps: true }
);

userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.statics.hashPassword = async function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
};

/**
 * @param {import('mongoose').Document} u
 * @returns {boolean}
 */
const PROFILE_TRUST = new Set(['verified', 'auto_verified']);

function isFullyVerifiedUser(u) {
  if (!u || u.emailVerified !== true || u.phoneVerified !== true) {
    return false;
  }
  return PROFILE_TRUST.has(String(u.verificationStatus));
}

userSchema.statics.isProfileTrustOk = (status) => PROFILE_TRUST.has(String(status || ''));

userSchema.statics.isFullyVerified = isFullyVerifiedUser;

module.exports = mongoose.model('User', userSchema);
