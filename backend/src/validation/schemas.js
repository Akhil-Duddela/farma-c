const Joi = require('joi');

const MAX_TEXT = 8000;
const MAX_CAPTION = 2200;

const httpsUrl = Joi.string()
  .uri({ scheme: ['https'] })
  .max(4000)
  .messages({ 'string.uri': 'must be a valid https URL' });

const optionalHttpsUrl = httpsUrl.allow('', null);

const platformFlags = Joi.object({
  instagram: Joi.boolean().default(false),
  youtube: Joi.boolean().default(false),
})
  .unknown(false)
  .default({});

const automationPlatforms = Joi.object({ instagram: Joi.boolean(), youtube: Joi.boolean() })
  .unknown(false)
  .custom((v, helpers) => {
    if (!v) return v;
    if (v.instagram !== true && v.youtube !== true) {
      return helpers.error('any.custom', { message: 'at least one of instagram, youtube must be true' });
    }
    return v;
  });

/** POST /api/ai/enhance */
const aiEnhance = Joi.object({
  input: Joi.string().min(1).max(MAX_TEXT).required(),
});

/** POST /api/automation/run */
const automationRun = Joi.object({
  input: Joi.string().min(1).max(MAX_TEXT).required(),
  platforms: automationPlatforms.default({ instagram: true, youtube: true }),
  instagramAccountId: Joi.string().max(50).allow('', null).optional(),
  youtubeAccountId: Joi.string().max(50).allow('', null).optional(),
});

const postStatus = Joi.string().valid('draft', 'scheduled', 'posted', 'failed', 'publishing', 'partial', '');

/** POST /api/posts/create (v2) */
const postCreateV2 = Joi.object({
  content: Joi.string().max(MAX_TEXT).allow('').optional(),
  mediaUrl: optionalHttpsUrl.optional(),
  caption: Joi.string().max(MAX_CAPTION).allow('').optional(),
  scheduledAt: Joi.alternatives()
    .try(Joi.string().isoDate(), Joi.date(), Joi.valid(null, ''))
    .allow(null, '')
    .optional(),
  status: Joi.string()
    .valid('draft', 'scheduled', 'partial', 'posted', 'failed', '')
    .optional(),
  platforms: Joi.object({ instagram: Joi.boolean(), youtube: Joi.boolean() })
    .unknown(false)
    .required()
    .custom((v, h) => {
      if (v && v.instagram !== true && v.youtube !== true) {
        return h.error('any.custom', { message: 'at least one of instagram, youtube must be true' });
      }
      return v;
    })
    .messages({ 'any.required': 'platforms (instagram, youtube) is required' }),
  mediaType: Joi.string().valid('image', 'carousel', 'reel', 'video', '').optional(),
  instagramAccountId: Joi.string().max(50).allow('', null).optional(),
  youtubeAccountId: Joi.string().max(50).allow('', null).optional(),
});

/** Original POST /api/posts */
const postCreate = Joi.object({
  instagramAccountId: Joi.string().max(50).allow('', null).optional(),
  youtubeAccountId: Joi.string().max(50).allow('', null).optional(),
  caption: Joi.string().max(MAX_CAPTION).allow('').optional(),
  content: Joi.string().max(MAX_TEXT).allow('').optional(),
  status: postStatus.optional(),
  platforms: Joi.object({ instagram: Joi.boolean(), youtube: Joi.boolean() }).unknown(false).optional(),
  mediaUrl: optionalHttpsUrl.optional(),
  mediaUrls: Joi.array().items(optionalHttpsUrl).max(20).optional(),
  mediaType: Joi.string().valid('image', 'carousel', 'reel', 'video', '').optional(),
  aspectRatio: Joi.string().valid('1:1', '4:5', '9:16', '').optional(),
  scheduledAt: Joi.alternatives().try(Joi.string().isoDate(), Joi.date(), Joi.valid(null, '')).allow(null).optional(),
  hashtags: Joi.array().items(Joi.string().max(200).trim()).max(100).optional(),
});

const postUpdate = Joi.object({
  caption: Joi.string().max(MAX_CAPTION).allow('').optional(),
  content: Joi.string().max(MAX_TEXT).allow('').optional(),
  hashtags: Joi.array().items(Joi.string().max(200).trim()).max(100).optional(),
  status: postStatus.optional(),
  scheduledAt: Joi.alternatives().try(Joi.string().isoDate(), Joi.date(), Joi.valid(null, '')).allow(null).optional(),
  mediaUrl: optionalHttpsUrl.optional(),
  mediaUrls: Joi.array().items(optionalHttpsUrl).max(20).optional(),
  mediaType: Joi.string().valid('image', 'carousel', 'reel', 'video', '').optional(),
  aspectRatio: Joi.string().valid('1:1', '4:5', '9:16', '').optional(),
  platforms: Joi.object({ instagram: Joi.boolean(), youtube: Joi.boolean() }).unknown(false).optional(),
  instagramAccountId: Joi.string().max(50).allow('', null).optional(),
  youtubeAccountId: Joi.string().max(50).allow('', null).optional(),
  reelScript: Joi.object({
    hook: Joi.string().max(500).allow(''),
    body: Joi.string().max(4000).allow(''),
    cta: Joi.string().max(500).allow(''),
  })
    .unknown(false)
    .optional(),
  contentHash: Joi.string().max(200).allow('').optional(),
  videoUrl: optionalHttpsUrl.optional(),
  pipelineStatus: Joi.string().max(50).optional(),
  automation: Joi.object().optional(),
  generationMeta: Joi.object().optional(),
  aiContent: Joi.object().optional(),
})
  .min(1)
  .unknown(false)
  .messages({ 'object.min': 'at least one field is required' });

const postRetryPlatforms = Joi.object({
  platforms: Joi.array()
    .items(Joi.string().valid('instagram', 'youtube'))
    .max(2)
    .optional(),
}).unknown(false);

const postBulk = Joi.object({
  posts: Joi.array()
    .items(Joi.object().min(1))
    .min(1)
    .max(30)
    .required(),
});

const generateAi = Joi.object({
  topic: Joi.string().max(2000).allow('').optional(),
  model: Joi.string().max(100).allow('').optional(),
})
  .unknown(false)
  .min(0);

const generateMedia = Joi.object({
  postId: Joi.string().max(50).allow('', null).optional(),
  prompt: Joi.string().max(500).allow('').optional(),
  aspectRatio: Joi.string().valid('1:1', '4:5', '9:16', '').optional(),
});

const improveCaption = Joi.object({
  caption: Joi.string().min(1).max(MAX_CAPTION).required(),
  feedback: Joi.string().max(2000).allow('').optional(),
});

const authRegister = Joi.object({
  email: Joi.string().email().max(320).required(),
  password: Joi.string().min(8).max(128).required(),
  name: Joi.string().max(200).trim().allow('').optional(),
  /** hCaptcha response */
  captchaToken: Joi.string().max(4000).allow('').optional(),
});

const authLogin = Joi.object({
  email: Joi.string().email().max(320).required(),
  password: Joi.string().min(1).max(500).required(),
});

const authSendOtp = Joi.object({
  phoneNumber: Joi.string().min(8).max(20).required(),
  captchaToken: Joi.string().max(4000).allow('').optional(),
});

const authVerifyOtp = Joi.object({
  phoneNumber: Joi.string().min(8).max(20).required(),
  otp: Joi.string().length(6).pattern(/^\d+$/).required(),
});

const adminProfileReview = Joi.object({
  userId: Joi.string()
    .pattern(/^[a-fA-F0-9]{24}$/)
    .required(),
  action: Joi.string().valid('approve', 'reject').required(),
  notes: Joi.string().max(2000).allow('').optional(),
});

module.exports = {
  aiEnhance,
  automationRun,
  postCreateV2,
  postCreate,
  postUpdate,
  postRetryPlatforms,
  postBulk,
  generateAi,
  generateMedia,
  improveCaption,
  authRegister,
  authLogin,
  authSendOtp,
  authVerifyOtp,
  adminProfileReview,
  MAX_TEXT,
  MAX_CAPTION,
};
