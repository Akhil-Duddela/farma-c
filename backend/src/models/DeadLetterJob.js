const mongoose = require('mongoose');

/** Persist Bull dead-letter jobs for operator review */
const deadLetterJobSchema = new mongoose.Schema(
  {
    queueName: { type: String, required: true },
    jobId: { type: String, required: true },
    name: String,
    data: mongoose.Schema.Types.Mixed,
    failedReason: String,
    attemptsMade: Number,
  },
  { timestamps: true }
);

deadLetterJobSchema.index({ createdAt: -1 });

module.exports = mongoose.model('DeadLetterJob', deadLetterJobSchema);
