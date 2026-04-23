const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * GET /api/admin/verifications?status=queue&page=1&limit=30
 * `queue` (default): pending + auto_verified + rejected. Filter by a single status if needed.
 */
async function listVerifications(req, res, next) {
  try {
    const status = String(req.query.status || 'queue');
    const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '30', 10) || 30));
    const skip = (page - 1) * limit;

    const filter = { role: { $ne: 'admin' } };
    if (status === 'queue' || status === 'all') {
      filter.verificationStatus = { $in: ['pending', 'auto_verified', 'rejected'] };
    } else {
      filter.verificationStatus = status;
    }

    const [rows, total] = await Promise.all([
      User.find(filter)
        .select('name email profileImageUrl verificationStatus verificationScore verificationNotes createdAt')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    res.json({
      page,
      limit,
      total,
      items: rows.map((u) => ({
        id: u._id,
        name: u.name,
        email: u.email,
        profileImageUrl: u.profileImageUrl,
        verificationStatus: u.verificationStatus,
        verificationScore: u.verificationScore,
        verificationNotes: u.verificationNotes,
        createdAt: u.createdAt,
      })),
    });
  } catch (e) {
    next(e);
  }
}

/**
 * POST /api/admin/verify/:userId
 */
async function approveUser(req, res, next) {
  try {
    const { userId } = req.params;
    const notes = String(req.body.notes || '').trim().slice(0, 2000);
    const u = await User.findById(userId);
    if (!u) {
      return res.status(404).json({ error: 'User not found' });
    }
    u.verificationStatus = 'verified';
    u.verificationScore = 1;
    u.verificationNotes = notes || 'Approved by admin';
    await u.save();
    logger.info('Admin approved verification', { admin: String(req.user._id), userId: String(u._id) });
    res.json({ ok: true, verificationStatus: u.verificationStatus });
  } catch (e) {
    next(e);
  }
}

/**
 * POST /api/admin/reject/:userId
 */
async function rejectUser(req, res, next) {
  try {
    const { userId } = req.params;
    const reason = String(req.body.reason || req.body.notes || '').trim();
    if (!reason) {
      return res.status(400).json({ error: 'reason is required' });
    }
    const u = await User.findById(userId);
    if (!u) {
      return res.status(404).json({ error: 'User not found' });
    }
    u.verificationStatus = 'rejected';
    u.verificationScore = 0;
    u.verificationNotes = reason.slice(0, 2000);
    await u.save();
    logger.info('Admin rejected verification', { admin: String(req.user._id), userId: String(u._id) });
    res.json({ ok: true, verificationStatus: u.verificationStatus });
  } catch (e) {
    next(e);
  }
}

module.exports = { listVerifications, approveUser, rejectUser };
