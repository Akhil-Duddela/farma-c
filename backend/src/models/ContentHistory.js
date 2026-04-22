const mongoose = require('mongoose');

/**
 * Tracks generated caption hashes per user to reduce duplicate AI output.
 */
const contentHistorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    contentHash: { type: String, required: true, index: true },
    snippet: { type: String, default: '' },
  },
  { timestamps: true }
);

contentHistorySchema.index({ userId: 1, contentHash: 1 }, { unique: true });

module.exports = mongoose.model('ContentHistory', contentHistorySchema);
