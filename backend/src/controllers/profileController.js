const s3Service = require('../services/s3Service');
const logService = require('../services/logService');
const verificationService = require('../services/verificationService');
/**
 * Image upload for KYC / profile (same pattern as /api/upload but dedicated prefix)
 */
async function uploadVerificationImage(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'file field required' });
    }
    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Image file required' });
    }
    if (req.file.size > 8 * 1024 * 1024) {
      return res.status(413).json({ error: 'Image too large (max 8MB)' });
    }
    const keyPrefix = `verification-profiles/${String(req.user._id)}`;
    const url = await s3Service.uploadUserMedia(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      keyPrefix
    );
    const user = await verificationService.setProfileImage(req.user, url);
    await logService.logEntry({
      userId: req.user._id,
      step: 'profile.image_upload',
      message: 'Profile verification image uploaded',
    });
    res.status(201).json({ url, profileImageUrl: user.profileImageUrl });
  } catch (e) {
    next(e);
  }
}

async function submitVerification(req, res, next) {
  try {
    const user = await verificationService.submitProfileVerification(req.user);
    res.json({
      ok: true,
      verificationStatus: user.verificationStatus,
      verificationScore: user.verificationScore,
      verificationNotes: user.verificationNotes,
    });
  } catch (e) {
    if (e.status) {
      return res.status(e.status).json({ error: e.message });
    }
    next(e);
  }
}

/** GET /api/profile/status */
async function status(req, res) {
  const u = require('../models/User');
  const user = req.user;
  res.json({
    emailVerified: !!user.emailVerified,
    phoneVerified: !!user.phoneVerified,
    phoneNumberMasked: user.phoneNumber
      ? verificationService.maskPhone(user.phoneNumber) || '****'
      : '',
    profileImageUrl: user.profileImageUrl || '',
    verificationStatus: user.verificationStatus || 'unverified',
    verificationScore: typeof user.verificationScore === 'number' ? user.verificationScore : 0,
    verificationNotes: user.verificationNotes || '',
    canUsePublishing: u.isFullyVerified(user),
    hasVerifiedCreatorBadge: u.isFullyVerified(user),
  });
}

module.exports = { uploadVerificationImage, submitVerification, status };
