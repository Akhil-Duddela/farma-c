const s3Service = require('../services/s3Service');
const logService = require('../services/logService');
const verificationService = require('../services/verificationService');
const logger = require('../utils/logger');

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
    res.json({ ok: true, verificationStatus: user.verificationStatus });
  } catch (e) {
    if (e.status) {
      return res.status(e.status).json({ error: e.message });
    }
    next(e);
  }
}

/** GET /api/profile/status */
async function status(req, res) {
  res.json({
    emailVerified: !!req.user.emailVerified,
    phoneVerified: !!req.user.phoneVerified,
    phoneNumberMasked: req.user.phoneNumber
      ? verificationService.maskPhone(req.user.phoneNumber) || '****'
      : '',
    profileImageUrl: req.user.profileImageUrl || '',
    verificationStatus: req.user.verificationStatus || 'unverified',
    verificationNotes: req.user.verificationNotes || '',
    canUsePublishing: require('../models/User').isFullyVerified(req.user),
  });
}

/** Admin: approve (optional future) — or skip */
async function setVerifiedByAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  try {
    const User = require('../models/User');
    const { userId, action, notes } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }
    const u = await User.findById(userId);
    if (!u) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (action === 'approve') {
      u.verificationStatus = 'verified';
      u.verificationNotes = notes || '';
    } else if (action === 'reject') {
      u.verificationStatus = 'rejected';
      u.verificationNotes = notes || 'Please resubmit a clearer image';
    } else {
      return res.status(400).json({ error: 'action must be approve or reject' });
    }
    await u.save();
    logger.info('Profile verification review', { by: String(req.user._id), userId, action });
    res.json({ ok: true, verificationStatus: u.verificationStatus });
  } catch (e) {
    next(e);
  }
}

module.exports = { uploadVerificationImage, submitVerification, status, setVerifiedByAdmin };
