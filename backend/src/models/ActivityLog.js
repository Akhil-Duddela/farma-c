const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', index: true },
    level: {
      type: String,
      enum: ['debug', 'info', 'warn', 'error'],
      default: 'info',
      index: true,
    },
    step: { type: String, required: true, index: true },
    message: { type: String, required: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
