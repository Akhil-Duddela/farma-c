const mongoose = require('mongoose');

/**
 * Linked Instagram Business/Creator account via Graph API.
 * accessTokenEnc stores AES-GCM ciphertext (never raw token in logs).
 */
const instagramAccountSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    igUserId: { type: String, required: true, trim: true },
    pageId: { type: String, trim: true, default: '' },
    username: { type: String, trim: true, default: '' },
    accessTokenEnc: { type: String, required: true },
    tokenExpiresAt: { type: Date, default: null },
    longLivedTokenObtainedAt: { type: Date, default: null },
    isBusinessValidated: { type: Boolean, default: false },
    lastValidationError: { type: String, default: '' },
    label: { type: String, trim: true, default: 'Primary' },
    isDefault: { type: Boolean, default: false },
    profilePictureUrl: { type: String, default: '' },
  },
  { timestamps: true }
);

instagramAccountSchema.index({ userId: 1, igUserId: 1 }, { unique: true });

module.exports = mongoose.model('InstagramAccount', instagramAccountSchema);
