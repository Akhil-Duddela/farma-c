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
 * @param {import('mongoose').Document} post
 * @param {string} step
 * @param {string} message
 * @param {string} [requestId]
 */
function pushPipelineError(post, step, message, requestId) {
  if (!Array.isArray(post.errorHistory)) {
    post.errorHistory = [];
  }
  post.errorHistory.push({
    at: new Date(),
    step: String(step).slice(0, 100),
    message: String(message).slice(0, 2000),
    requestId: requestId ? String(requestId).slice(0, 64) : '',
  });
  if (post.errorHistory.length > 50) {
    post.errorHistory = post.errorHistory.slice(-50);
  }
  post.markModified('errorHistory');
}

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
  const requestId = `ai-job-${job.id}`;
  let enhanced;
  try {
    enhanced = await enhanceContent(input, { requestId });
  } catch (e) {
    post.automation = post.automation || {};
    post.automation.lastError = e.message || 'AI input validation failed';
    post.automation.step = 'failed';
    post.pipelineStatus = 'failed';
    post.status = 'failed';
    post.failureReason = post.automation.lastError;
    pushPipelineError(post, 'automation.ai', post.automation.lastError, requestId);
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
  const { _meta, ...rest } = enhanced;
  if (_meta && _meta.degraded) {
    pushPipelineError(
      post,
      'automation.ai',
      `AI used degraded static output (${_meta.source || 'unknown'}: ${_meta.reason || 'n/a'})`,
      requestId
    );
    logger.info('AI step completed with static/degraded content; continuing pipeline', {
      postId,
      requestId,
      source: _meta.source,
    });
  }
  const hooks = Array.isArray(rest.hooks) ? rest.hooks : [];
  post.aiContent = {
    title: rest.title,
    description: rest.description,
    script: rest.script,
    caption: rest.caption,
    hashtags: rest.hashtags || [],
    hooks,
    videoIdea: rest.videoIdea,
    rawInput: input,
  };
  post.content = rest.script || post.content;
  post.caption = rest.caption || post.caption;
  post.hashtags = (rest.hashtags && rest.hashtags.length ? rest.hashtags : post.hashtags) || [];
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
  post.pipelineStatus = 'ai_done';
  post.generationMeta = {
    ...post.generationMeta,
    model: _meta?.source || 'multi',
    improved: !(_meta && _meta.degraded),
  };
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
  const vRequestId = `video-job-${job.id}`;
  let buf;
  try {
    buf = await generateVideoFromScript(script);
  } catch (e) {
    post.automation = post.automation || {};
    post.automation.lastError = e.message || 'Video generation failed';
    post.automation.step = 'failed';
    post.pipelineStatus = 'failed';
    post.status = 'failed';
    post.failureReason = post.automation.lastError;
    pushPipelineError(post, 'automation.video', post.automation.lastError, vRequestId);
    await post.save();
    throw e;
  }
  post.pipelineStatus = 'video_done';
  post.automation = post.automation || {};
  post.automation.step = 'upload';
  post.markModified('automation');
  await post.save();
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
    pushPipelineError(post, 'automation.upload', post.automation.lastError, vRequestId);
    await post.save();
    throw e;
  }
  post.automation = post.automation || {};
  post.automation.step = 'publishing';
  post.pipelineStatus = 'uploaded';
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
    pushPipelineError(post, 'automation.schedule', post.automation.lastError, vRequestId);
    await post.save();
    throw e;
  }
  post.pipelineStatus = 'publishing';
  post.markModified('pipelineStatus');
  post.markModified('automation');
  await post.save();
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
