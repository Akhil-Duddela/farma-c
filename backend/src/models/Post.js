const mongoose = require('mongoose');

const reelScriptSchema = new mongoose.Schema(
  {
    hook: String,
    body: String,
    cta: String,
  },
  { _id: false }
);

/** Per-platform publish state; errors are isolated per platform */
const platformStateSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['pending', 'queued', 'publishing', 'posted', 'failed', 'skipped'],
      default: 'pending',
    },
    error: { type: String, default: '' },
    jobId: { type: String, default: '' },
    publishedAt: { type: Date, default: null },
    /** Instagram media id or YouTube video id */
    externalId: { type: String, default: '' },
  },
  { _id: false }
);

const postSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /** Legacy / optional when only YouTube is used */
    instagramAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InstagramAccount',
      default: null,
      index: true,
    },
    youtubeAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'YouTubeAccount',
      default: null,
      index: true,
    },
    /** Free-form text (e.g. script); caption is used for social copy */
    content: { type: String, default: '' },
    caption: { type: String, default: '' },
    contentHash: { type: String, default: '', index: true },
    hashtags: [{ type: String, trim: true }],
    reelScript: reelScriptSchema,
    /** Single primary media field for new API; keep mediaUrls for back-compat */
    mediaUrl: { type: String, default: '' },
    mediaUrls: [{ type: String }], // S3 or public URLs
    mediaType: {
      type: String,
      enum: ['image', 'carousel', 'reel', 'video'],
      default: 'image',
    },
    aspectRatio: {
      type: String,
      enum: ['1:1', '4:5', '9:16'],
      default: '1:1',
    },
    platforms: {
      instagram: { type: platformStateSchema, default: () => ({}) },
      youtube: { type: platformStateSchema, default: () => ({}) },
    },
    /**
     * draft | scheduled | publishing | posted | failed | partial
     * "partial" = at least one platform succeeded, at least one failed (with multiple enabled)
     */
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'publishing', 'posted', 'failed', 'partial'],
      default: 'draft',
      index: true,
    },
    scheduledAt: { type: Date, default: null, index: true },
    postedAt: { type: Date, default: null },
    /** Top-level id for primary IG media (back-compat) */
    instagramMediaId: { type: String, default: '' },
    youtubeVideoId: { type: String, default: '' },
    idempotencyKey: { type: String, default: '', index: true },
    failureReason: { type: String, default: '' },
    publishAttempts: { type: Number, default: 0 },
    lastJobId: { type: String, default: '' },
    analytics: {
      likes: { type: Number, default: 0 },
      reach: { type: Number, default: 0 },
      impressions: { type: Number, default: 0 },
      lastSyncedAt: { type: Date, default: null },
    },
    generationMeta: {
      model: String,
      promptVersion: String,
      improved: { type: Boolean, default: false },
    },
    /** AI automation pipeline: enhance → video → S3 → publish */
    aiContent: {
      title: { type: String, default: '' },
      description: { type: String, default: '' },
      script: { type: String, default: '' },
      caption: { type: String, default: '' },
      hashtags: [{ type: String, trim: true }],
      hooks: [{ type: String }],
      videoIdea: { type: String, default: '' },
      rawInput: { type: String, default: '' },
    },
    /** Public URL to generated video (may mirror mediaUrl) */
    videoUrl: { type: String, default: '' },
    /**
     * High-level pipeline: idle → processing → ai_done → video_done → uploaded → publishing → published | partial | failed
     * `completed` kept for older documents; new runs use `published`.
     */
    pipelineStatus: {
      type: String,
      enum: [
        'idle',
        'processing',
        'ai_done',
        'video_done',
        'uploaded',
        'publishing',
        'published',
        'completed',
        'failed',
        'partial',
      ],
      default: 'idle',
      index: true,
    },
    /** Last N pipeline / integration errors (non-fatal AI degrade is optional) */
    errorHistory: [
      {
        at: { type: Date, default: Date.now },
        step: { type: String, default: '' },
        message: { type: String, default: '' },
        requestId: { type: String, default: '' },
      },
    ],
    automation: {
      step: {
        type: String,
        enum: ['', 'ai', 'video', 'upload', 'publishing', 'done', 'failed'],
        default: '',
      },
      lastError: { type: String, default: '' },
      startedAt: { type: Date, default: null },
      completedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

postSchema.index({ userId: 1, status: 1, scheduledAt: 1 });
postSchema.index({ userId: 1, contentHash: 1 });

module.exports = mongoose.model('Post', postSchema);
