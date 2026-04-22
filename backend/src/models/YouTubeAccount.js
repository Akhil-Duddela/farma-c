const mongoose = require('mongoose');

/**
 * Linked YouTube channel — OAuth 2.0 tokens stored encrypted (see token encryption helpers in routes).
 */
const youtubeAccountSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    channelId: { type: String, required: true, trim: true, index: true },
    channelTitle: { type: String, default: '' },
    accessTokenEnc: { type: String, default: '' },
    refreshTokenEnc: { type: String, default: '' },
    tokenExpiresAt: { type: Date, default: null },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

youtubeAccountSchema.index({ userId: 1, channelId: 1 }, { unique: true });

module.exports = mongoose.model('YouTubeAccount', youtubeAccountSchema);
