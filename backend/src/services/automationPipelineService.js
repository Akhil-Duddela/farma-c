const Post = require('../models/Post');
const { enhanceContent } = require('./aiEnhancerService');
const { generateVideoFromScript } = require('./videoGeneratorService');
const s3Service = require('./s3Service');
const postService = require('./postService');
const { recomputeAggregatedStatus } = require('./postStatusService');
const logService = require('./logService');
const { getAIGenerationQueue, getVideoGenerationQueue } = require('../queues');
const logger = require('../utils/logger');

/**
 * Enqueue first step: AI enhancement.
 * @param {import('mongoose').Types.ObjectId} postId
 * @param {import('mongoose').Types.ObjectId} userId
 * @param {string} input
 */
async function enqueueAIGeneration(postId, userId, input) {
  const q = getAIGenerationQueue();
  await q.add(
    'enhance',
    { postId: String(postId), userId: String(userId), input: String(input) },
    {
      jobId: `ai-${postId}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    }
  );
}

/**
 * Bull handler: Ollama enhance → update post → enqueue video job
 * @param {import('bull').Job} job
 */
async function processAIJob(job) {
  const { postId, userId, input } = job.data;
  const post = await Post.findOne({ _id: postId, userId });
  if (!post) {
    throw new Error('Post not found for AI job');
  }
  if (String(post.automation?.step) !== 'ai') {
    logger.info('AI job skipped: wrong step', { postId, step: post.automation?.step });
    return { skipped: true };
  }
  let enhanced;
  try {
    enhanced = await enhanceContent(input);
  } catch (e) {
    post.automation = post.automation || {};
    post.automation.lastError = e.message || 'AI failed';
    post.automation.step = 'failed';
    post.pipelineStatus = 'failed';
    post.status = 'failed';
    post.failureReason = post.automation.lastError;
    await post.save();
    await logService.logEntry({
      userId: post.userId,
      postId: post._id,
      level: 'error',
      step: 'automation.ai',
      message: String(e.message),
    });
    throw e;
  }
  const hooks = Array.isArray(enhanced.hooks) ? enhanced.hooks : [];
  post.aiContent = {
    title: enhanced.title,
    description: enhanced.description,
    script: enhanced.script,
    caption: enhanced.caption,
    hashtags: enhanced.hashtags || [],
    hooks,
    videoIdea: enhanced.videoIdea,
    rawInput: input,
  };
  post.content = enhanced.script || post.content;
  post.caption = enhanced.caption || post.caption;
  post.hashtags = (enhanced.hashtags && enhanced.hashtags.length ? enhanced.hashtags : post.hashtags) || [];
  if (hooks.length) {
    post.reelScript = {
      hook: hooks[0] || '',
      body: hooks[1] || '',
      cta: hooks[2] || '',
    };
  }
  post.automation = post.automation || {};
  post.automation.step = 'video';
  post.automation.lastError = '';
  await post.save();

  await getVideoGenerationQueue().add(
    'render',
    { postId: String(postId), userId: String(userId) },
    {
      jobId: `video-${postId}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 10000 },
    }
  );
  await logService.logEntry({
    userId: post.userId,
    postId: post._id,
    step: 'automation.ai',
    message: 'AI enhancement done; video job queued',
  });
  return { ok: true };
}

/**
 * Bull handler: render MP4, upload to S3, set scheduled and enqueue platform publishes
 * @param {import('bull').Job} job
 */
async function processVideoJob(job) {
  const { postId, userId } = job.data;
  const post = await Post.findOne({ _id: postId, userId });
  if (!post) {
    throw new Error('Post not found for video job');
  }
  if (String(post.automation?.step) !== 'video') {
    logger.info('Video job skipped: wrong step', { postId, step: post.automation?.step });
    return { skipped: true };
  }
  const script = post.aiContent?.script || post.content || post.caption || 'Farm content';
  let buf;
  try {
    post.automation.step = 'upload';
    post.markModified('automation');
    await post.save();
    buf = await generateVideoFromScript(script);
  } catch (e) {
    post.automation = post.automation || {};
    post.automation.lastError = e.message || 'Video generation failed';
    post.automation.step = 'failed';
    post.pipelineStatus = 'failed';
    post.status = 'failed';
    post.failureReason = post.automation.lastError;
    await post.save();
    throw e;
  }
  let url;
  try {
    url = await s3Service.uploadUserMedia(
      buf,
      'automation.mp4',
      'video/mp4',
      'automation-videos'
    );
  } catch (e) {
    post.automation = post.automation || {};
    post.automation.lastError = e.message || 'S3 upload failed';
    post.automation.step = 'failed';
    post.pipelineStatus = 'failed';
    post.status = 'failed';
    post.failureReason = post.automation.lastError;
    await post.save();
    throw e;
  }
  post.automation = post.automation || {};
  post.automation.step = 'publishing';
  post.mediaType = 'video';
  post.mediaUrl = url;
  post.mediaUrls = [url];
  post.videoUrl = url;
  post.aspectRatio = '9:16';
  post.status = 'scheduled';
  if (!post.scheduledAt) {
    post.scheduledAt = new Date();
  } else if (new Date(post.scheduledAt) < new Date()) {
    post.scheduledAt = new Date();
  }
  try {
    await postService.removePlatformJobs(post);
    await postService.schedulePlatformJobs(post);
  } catch (e) {
    post.automation.lastError = e.message || 'Schedule failed';
    post.automation.step = 'failed';
    post.pipelineStatus = 'failed';
    post.status = 'failed';
    await post.save();
    throw e;
  }
  await logService.logEntry({
    userId: post.userId,
    postId: post._id,
    step: 'automation.video',
    message: `Video uploaded, publish jobs queued: ${url}`,
  });
  return { url };
}

module.exports = {
  enqueueAIGeneration,
  processAIJob,
  processVideoJob,
};
