const User = require('../models/User');

/**
 * After authenticate. Posting and automation need email + phone + profile (verified) unless admin.
 */
function requireFullVerification(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.user.role === 'admin') {
    return next();
  }
  const { emailVerified, phoneVerified, verificationStatus } = req.user;
  const profileOk = User.isProfileTrustOk(verificationStatus);
  const full = emailVerified === true && phoneVerified === true && profileOk;
  if (full) {
    return next();
  }
  return res.status(403).json({
    error: 'Complete account verification to use posting and automation',
    code: 'VERIFICATION_REQUIRED',
    requirements: {
      emailVerified: !!emailVerified,
      phoneVerified: !!phoneVerified,
      profileTrustOk: profileOk,
      verificationStatus: verificationStatus || 'unverified',
    },
  });
}

/**
 * Re-loads user from DB to avoid stale JWT session fields (optional, not used in middleware chain by default)
 */
async function requireFullVerificationFresh(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.user.role === 'admin') {
    return next();
  }
  try {
    const u = await User.findById(req.user._id).lean();
    if (!u) {
      return res.status(401).json({ error: 'User not found' });
    }
    const pOk = User.isProfileTrustOk(u.verificationStatus);
    if (u.emailVerified === true && u.phoneVerified === true && pOk) {
      return next();
    }
    return res.status(403).json({
      error: 'Complete account verification to use posting and automation',
      code: 'VERIFICATION_REQUIRED',
      requirements: {
        emailVerified: !!u.emailVerified,
        phoneVerified: !!u.phoneVerified,
        profileTrustOk: pOk,
        verificationStatus: u.verificationStatus || 'unverified',
      },
    });
  } catch (e) {
    return next(e);
  }
}

module.exports = { requireFullVerification, requireFullVerificationFresh };
