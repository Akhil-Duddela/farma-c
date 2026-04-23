const Post = require('../models/Post');
const config = require('../config');
const { v4: uuidv4 } = require('uuid');
const { platformJobId } = require('../utils/idempotency');
const { getInstagramQueue, getYoutubeQueue } = require('../queues');
const { parsePlatformFlags, assertInstagramAccount, assertYouTubeAccount } = require('../utils/postPayload');
const { recomputeAggregatedStatus } = require('./postStatusService');
const logService = require('./logService');
const InstagramAccount = require('../models/InstagramAccount');
const YouTubeAccount = require('../models/YouTubeAccount');

const VIDEO = new Set(['video', 'reel']);

/**
 * @param {object} body
 * @param {import('mongoose').Types.ObjectId} userId
 */
function normalizeCreateBody(body, userId) {
  const content = (body.content ?? body.caption ?? '').trim();
  const caption = (body.caption ?? content).trim();
  const mediaUrl = body.mediaUrl || (Array.isArray(body.mediaUrls) && body.mediaUrls[0]) || '';
  const mediaUrls = Array.isArray(body.mediaUrls) && body.mediaUrls.length
    ? body.mediaUrls
    : mediaUrl
    ? [mediaUrl]
    : [];
  return { content, caption, mediaUrl, mediaUrls, userId, raw: body };
}

async function createPost(userId, body) {
  if (body.status === 'scheduled' && !body.scheduledAt) {
    const err = new Error('scheduledAt is required for scheduled posts');
    err.status = 400;
    throw err;
  }

  const n = normalizeCreateBody(body, userId);
  const flags = parsePlatformFlags(body);
  if (!flags.instagram && !flags.youtube) {
    const err = new Error('At least one platform (Instagram or YouTube) must be enabled');
    err.status = 400;
    throw err;
  }
  if (flags.instagram && flags.youtube && !VIDEO.has(body.mediaType || 'image')) {
    const err = new Error(
      'When both Instagram and YouTube are enabled, use mediaType "video" or "reel" with a public .mp4 URL'
    );
    err.status = 400;
    throw err;
  }

  let igAccId = null;
  let ytAccId = null;
  if (flags.instagram) {
    const a = await assertInstagramAccount(body.instagramAccountId, userId);
    igAccId = a._id;
  }
  if (flags.youtube) {
    if (!VIDEO.has(body.mediaType || 'image')) {
      const err = new Error('YouTube Shorts requires mediaType of "video" or "reel" and a public video file URL');
      err.status = 400;
      throw err;
    }
    const a = await assertYouTubeAccount(body.youtubeAccountId, userId);
    ytAccId = a._id;
  }

  const idempotencyKey = body.idempotencyKey || uuidv4();
  const platforms = {
    instagram: {
      enabled: flags.instagram,
      status: flags.instagram ? 'pending' : 'skipped',
      error: '',
      jobId: '',
    },
    youtube: {
      enabled: flags.youtube,
      status: flags.youtube ? 'pending' : 'skipped',
      error: '',
      jobId: '',
    },
  };

  const post = await Post.create({
    userId,
    instagramAccountId: igAccId,
    youtubeAccountId: ytAccId,
    content: n.content,
    caption: n.caption,
    hashtags: body.hashtags || [],
    reelScript: body.reelScript,
    mediaUrl: n.mediaUrl || '',
    mediaUrls: n.mediaUrls,
    mediaType: body.mediaType || 'image',
    aspectRatio: body.aspectRatio || '1:1',
    contentHash: body.contentHash || '',
    platforms,
    status: body.status || 'draft',
    scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
    idempotencyKey,
    generationMeta: body.generationMeta,
  });

  recomputeAggregatedStatus(post);
  await post.save();

  if (post.status === 'scheduled' && post.scheduledAt) {
    await schedulePlatformJobs(post);
  }

  await logService.logEntry({
    userId,
    postId: post._id,
    step: 'post.create',
    message: `Post created (${post.status}) — IG:${flags.instagram} YT:${flags.youtube}`,
  });
  return post;
}

/**
 * Create a draft post for the full AI → video → publish pipeline (no media until video step).
 * @param {import('mongoose').Types.ObjectId} userId
 * @param {{ input: string, platforms: { instagram?: boolean, youtube?: boolean }, instagramAccountId?: string, youtubeAccountId?: string }} opts
 */
async function createAutomationPost(userId, opts) {
  const { input, platforms: pl = {} } = opts;
  const flags = {
    instagram: pl.instagram === true,
    youtube: pl.youtube === true,
  };
  if (!flags.instagram && !flags.youtube) {
    const err = new Error('At least one of instagram or youtube must be true');
    err.status = 400;
    throw err;
  }
  const raw = (input && String(input).trim()) || '';
  if (!raw) {
    const e = new Error('input is required');
    e.status = 400;
    throw e;
  }
  if (raw.length > 8000) {
    const e = new Error('input is too long');
    e.status = 400;
    throw e;
  }

  let igId = null;
  let ytId = null;
  if (flags.instagram) {
    const id = opts.instagramAccountId || (await InstagramAccount.findOne({ userId, isDefault: true }))?._id;
    if (!id) {
      const e = new Error('Link an Instagram account or pass instagramAccountId');
      e.status = 400;
      throw e;
    }
    const a = await assertInstagramAccount(String(id), userId);
    igId = a._id;
  }
  if (flags.youtube) {
    const id = opts.youtubeAccountId || (await YouTubeAccount.findOne({ userId, isDefault: true }))?._id;
    if (!id) {
      const e = new Error('Link a YouTube account or pass youtubeAccountId');
      e.status = 400;
      throw e;
    }
    const a = await assertYouTubeAccount(String(id), userId);
    ytId = a._id;
  }

  const idempotencyKey = uuidv4();
  const platforms = {
    instagram: {
      enabled: flags.instagram,
      status: flags.instagram ? 'pending' : 'skipped',
      error: '',
      jobId: '',
    },
    youtube: {
      enabled: flags.youtube,
      status: flags.youtube ? 'pending' : 'skipped',
      error: '',
      jobId: '',
    },
  };

  const post = await Post.create({
    userId,
    instagramAccountId: igId,
    youtubeAccountId: ytId,
    content: raw,
    caption: raw.slice(0, 200),
    hashtags: [],
    mediaUrl: '',
    mediaUrls: [],
    mediaType: 'video',
    aspectRatio: '9:16',
    platforms,
    status: 'draft',
    scheduledAt: null,
    idempotencyKey,
    generationMeta: { model: 'ollama-automation', promptVersion: '1' },
    pipelineStatus: 'processing',
    automation: {
      step: 'ai',
      lastError: '',
      startedAt: new Date(),
    },
  });

  await logService.logEntry({
    userId,
    postId: post._id,
    step: 'automation.create',
    message: 'Automation pipeline post created (draft) — waiting for AI job',
  });
  return post;
}

/**
 * V2: maps POST /posts/create { content, mediaUrl, platforms: { instagram, youtube } }
 * into internal create.
 */
async function createPostV2(userId, body) {
  const b = { ...body };
  if (body.caption == null && body.content != null) b.caption = body.content;
  if (Array.isArray(body.mediaUrls) && !body.mediaUrl) b.mediaUrl = body.mediaUrls[0];
  if (body.mediaUrl) b.mediaUrls = [body.mediaUrl];
  return createPost(userId, b);
}

async function updatePost(userId, id, body) {
  const post = await Post.findOne({ _id: id, userId });
  if (!post) {
    const err = new Error('Post not found');
    err.status = 404;
    throw err;
  }
  if (body.status === 'scheduled' && !body.scheduledAt && !post.scheduledAt) {
    const err = new Error('scheduledAt is required for scheduled posts');
    err.status = 400;
    throw err;
  }

  const baseUpdatable = [
    'caption',
    'content',
    'hashtags',
    'reelScript',
    'mediaUrl',
    'mediaUrls',
    'mediaType',
    'aspectRatio',
    'status',
    'scheduledAt',
    'contentHash',
    'generationMeta',
    'aiContent',
    'videoUrl',
    'pipelineStatus',
    'automation',
  ];
  baseUpdatable.forEach((k) => {
    if (body[k] !== undefined) {
      if (k === 'scheduledAt') {
        post[k] = body[k] ? new Date(body[k]) : null;
      } else {
        post[k] = body[k];
      }
    }
  });

  if (body.platforms) {
    const f = parsePlatformFlags(body);
    post.platforms = post.platforms || { instagram: {}, youtube: {} };
    post.platforms.instagram = post.platforms.instagram || {};
    post.platforms.youtube = post.platforms.youtube || {};
    post.platforms.instagram.enabled = f.instagram;
    post.platforms.youtube.enabled = f.youtube;
    if (f.instagram) post.platforms.instagram.status = post.platforms.instagram.status || 'pending';
    else {
      post.platforms.instagram.status = 'skipped';
    }
    if (f.youtube) {
      if (!VIDEO.has(post.mediaType || 'image')) {
        const err = new Error('YouTube requires video mediaType');
        err.status = 400;
        throw err;
      }
      post.platforms.youtube.status = post.platforms.youtube.status || 'pending';
    } else {
      post.platforms.youtube.status = 'skipped';
    }
  }
  if (body.instagramAccountId) {
    const a = await assertInstagramAccount(body.instagramAccountId, userId);
    post.instagramAccountId = a._id;
  }
  if (body.youtubeAccountId) {
    const a = await assertYouTubeAccount(body.youtubeAccountId, userId);
    post.youtubeAccountId = a._id;
  }
  recomputeAggregatedStatus(post);
  await post.save();

  if (post.status === 'scheduled' && post.scheduledAt) {
    await removePlatformJobs(post);
    await schedulePlatformJobs(post);
  }

  await logService.logEntry({
    userId,
    postId: post._id,
    step: 'post.update',
    message: 'Post updated',
  });
  return post;
}

async function deletePost(userId, id) {
  const post = await Post.findOneAndDelete({ _id: id, userId });
  if (!post) {
    const err = new Error('Post not found');
    err.status = 404;
    throw err;
  }
  await removePlatformJobs(post);
  await logService.logEntry({ userId, step: 'post.delete', message: `Post ${id} deleted` });
  return true;
}

async function listPosts(userId, query = {}) {
  const filter = { userId };
  if (query.status) filter.status = query.status;
  if (query.automation === '1' || query.automation === 'true') {
    filter.pipelineStatus = {
      $in: [
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
    };
  }
  return Post.find(filter)
    .sort({ createdAt: -1 })
    .limit(parseInt(query.limit || '50', 10))
    .populate('instagramAccountId', 'username label')
    .populate('youtubeAccountId', 'channelTitle channelId');
}

async function bulkCreateScheduled(userId, postsPayload) {
  if (!Array.isArray(postsPayload) || postsPayload.length > config.maxBulkPosts) {
    const err = new Error(`Bulk limit is ${config.maxBulkPosts}`);
    err.status = 400;
    throw err;
  }
  const created = [];
  for (const p of postsPayload) {
    created.push(await createPost(userId, { ...p, status: 'scheduled' }));
  }
  return created;
}

async function removeSinglePlatformJob(post, platform) {
  const sid = post.scheduledAt || post.updatedAt;
  if (platform === 'instagram' && post.platforms?.instagram?.enabled) {
    const jq = getInstagramQueue();
    const j = await jq.getJob(platformJobId(String(post._id), 'instagram', sid));
    if (j) await j.remove();
  } else if (platform === 'youtube' && post.platforms?.youtube?.enabled) {
    const yq = getYoutubeQueue();
    const j = await yq.getJob(platformJobId(String(post._id), 'youtube', sid));
    if (j) await j.remove();
  }
}

async function removePlatformJobs(post) {
  await removeSinglePlatformJob(post, 'instagram');
  await removeSinglePlatformJob(post, 'youtube');
}

/**
 * Enqueue one Bull job per enabled platform. Jobs are idempotent by deterministic jobId.
 * @param {import('mongoose').Document} post
 */
async function schedulePlatformJobs(post) {
  if (!post.scheduledAt) return;
  const delay = Math.max(0, new Date(post.scheduledAt) - Date.now());
  const sid = post.scheduledAt;
  const u = String(post.userId);
  const pid = String(post._id);

  if (post.platforms?.instagram?.enabled) {
    post.platforms.instagram.status = 'queued';
    const jid = platformJobId(pid, 'instagram', sid);
    post.platforms.instagram.jobId = jid;
    await getInstagramQueue().add(
      'publish',
      { postId: pid, platform: 'instagram', userId: u },
      {
        jobId: jid,
        delay,
        attempts: config.jobMaxAttempts,
        backoff: { type: 'exponential', delay: config.jobBackoffMs },
        removeOnComplete: 200,
        removeOnFail: false,
      }
    );
  }
  if (post.platforms?.youtube?.enabled) {
    post.platforms.youtube.status = 'queued';
    const yid = platformJobId(pid, 'youtube', sid);
    post.platforms.youtube.jobId = yid;
    await getYoutubeQueue().add(
      'publish',
      { postId: pid, platform: 'youtube', userId: u },
      {
        jobId: yid,
        delay,
        attempts: config.jobMaxAttempts,
        backoff: { type: 'exponential', delay: config.jobBackoffMs },
        removeOnComplete: 200,
        removeOnFail: false,
      }
    );
  }
  recomputeAggregatedStatus(post);
  post.lastJobId = `${post.platforms?.instagram?.jobId || ''}|${post.platforms?.youtube?.jobId || ''}`;
  await post.save();
}

async function recoverMissedScheduledJobs() {
  const threshold = new Date(Date.now() - 30 * 60 * 1000);
  const stuck = await Post.find({
    $or: [
      { 'platforms.instagram.status': 'publishing' },
      { 'platforms.youtube.status': 'publishing' },
    ],
    updatedAt: { $lt: threshold },
  }).limit(200);
  for (const p of stuck) {
    if (p.platforms?.instagram?.status === 'publishing' && p.platforms?.instagram?.enabled) {
      p.platforms.instagram.status = 'failed';
      p.platforms.instagram.error = 'Stale publishing (timeout)';
    }
    if (p.platforms?.youtube?.status === 'publishing' && p.platforms?.youtube?.enabled) {
      p.platforms.youtube.status = 'failed';
      p.platforms.youtube.error = 'Stale publishing (timeout)';
    }
    p.markModified('platforms');
    recomputeAggregatedStatus(p);
    await p.save();
  }
  if (stuck.length) {
    await logService.logEntry({
      step: 'scheduler.stale',
      message: `Reset ${stuck.length} stale per-platform publish locks`,
    });
  }

  const now = new Date();
  const due = await Post.find({ status: 'scheduled', scheduledAt: { $lte: now } }).limit(500);
  for (const p of due) {
    if (!p.platforms) continue;
    try {
      await removePlatformJobs(p);
      await schedulePlatformJobs(p);
    } catch (e) {
      await logService.logEntry({
        userId: p.userId,
        postId: p._id,
        level: 'error',
        step: 'scheduler.recover',
        message: e.message,
      });
    }
    await logService.logEntry({
      userId: p.userId,
      postId: p._id,
      step: 'scheduler.recover',
      message: 'Re-queued scheduled post for all enabled platforms',
    });
  }
  return due.length;
}

/**
 * Manual re-queue of failed (or all) platform jobs, e.g. after fixing tokens.
 * @param {import('mongoose').Types.ObjectId} userId
 * @param {string} postId
 * @param {{ platforms?: string[] }} [opts]
 */
async function retryPostPlatforms(userId, postId, opts = {}) {
  const post = await Post.findOne({ _id: postId, userId });
  if (!post) {
    const e = new Error('Post not found');
    e.status = 404;
    throw e;
  }
  const which = new Set(
    (opts.platforms && opts.platforms.length ? opts.platforms : ['instagram', 'youtube'])
  );
  for (const pl of which) {
    if (!post.platforms?.[pl]?.enabled) continue;
    if (['posted'].includes(post.platforms[pl].status)) continue;
    post.platforms[pl].status = 'pending';
    post.platforms[pl].error = '';
  }
  if (!post.scheduledAt) {
    post.scheduledAt = new Date();
  } else if (new Date(post.scheduledAt) < new Date()) {
    post.scheduledAt = new Date();
  }
  post.status = 'scheduled';
  post.markModified('platforms');
  await post.save();
  await removePlatformJobs(post);
  await schedulePlatformJobs(post);
  return post;
}

async function ensureAccount(userId, instagramAccountId) {
  return assertInstagramAccount(instagramAccountId, userId);
}

module.exports = {
  createPost,
  createPostV2,
  createAutomationPost,
  updatePost,
  deletePost,
  listPosts,
  bulkCreateScheduled,
  schedulePlatformJobs,
  recoverMissedScheduledJobs,
  ensureAccount,
  retryPostPlatforms,
  removePlatformJobs,
  removeSinglePlatformJob,
};
