const postService = require('../services/postService');
const aiContentService = require('../services/aiContentService');
const mediaService = require('../services/mediaService');
const hashtagService = require('../services/hashtagService');
const Post = require('../models/Post');

async function list(req, res, next) {
  try {
    const posts = await postService.listPosts(req.user._id, req.query);
    res.json(posts);
  } catch (e) {
    next(e);
  }
}

async function getOne(req, res, next) {
  try {
    const post = await Post.findOne({ _id: req.params.id, userId: req.user._id })
      .populate('instagramAccountId', 'username label igUserId')
      .populate('youtubeAccountId', 'channelId channelTitle');
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    res.json(post);
  } catch (e) {
    next(e);
  }
}

async function create(req, res, next) {
  try {
    const post = await postService.createPost(req.user._id, req.body, { req });
    res.status(201).json(post);
  } catch (e) {
    next(e);
  }
}

/**
 * @example POST /api/posts/create — { content, mediaUrl, platforms: { instagram, youtube }, scheduledAt }
 */
async function createMulti(req, res, next) {
  try {
    const post = await postService.createPostV2(req.user._id, req.body, { req });
    res.status(201).json(post);
  } catch (e) {
    next(e);
  }
}

/**
 * Re-queue failed platform jobs (e.g. after token refresh). Body: { platforms: ['instagram','youtube'] } optional
 */
async function retryPlatforms(req, res, next) {
  try {
    const post = await postService.retryPostPlatforms(req.user._id, req.params.id, {
      platforms: req.body?.platforms,
    });
    res.json(post);
  } catch (e) {
    next(e);
  }
}

async function update(req, res, next) {
  try {
    const post = await postService.updatePost(req.user._id, req.params.id, req.body, { req });
    res.json(post);
  } catch (e) {
    next(e);
  }
}

async function remove(req, res, next) {
  try {
    await postService.deletePost(req.user._id, req.params.id);
    res.status(204).send();
  } catch (e) {
    next(e);
  }
}

async function bulk(req, res, next) {
  try {
    const posts = await postService.bulkCreateScheduled(req.user._id, req.body.posts, { req });
    res.status(201).json(posts);
  } catch (e) {
    next(e);
  }
}

async function generateAi(req, res, next) {
  try {
    const bundle = await aiContentService.generatePostBundle(req.user._id, req.body);
    res.json(bundle);
  } catch (e) {
    next(e);
  }
}

async function generateMedia(req, res, next) {
  try {
    const { prompt, aspectRatio } = req.body;
    const url = await mediaService.generateAndUploadFarmImage(
      req.user._id,
      req.body.postId,
      prompt || 'Desi poultry farm morning scene',
      aspectRatio || '1:1'
    );
    res.json({ url, aspectRatio: aspectRatio || '1:1' });
  } catch (e) {
    next(e);
  }
}

async function improve(req, res, next) {
  try {
    const { caption, feedback } = req.body;
    const result = await aiContentService.improveCaption(req.user._id, caption, feedback);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

async function trendingTags(req, res, next) {
  try {
    const tags = await hashtagService.getTrendingHashtagSuggestions(req.user._id, req.query.niche);
    res.json({ tags });
  } catch (e) {
    next(e);
  }
}

module.exports = {
  list,
  getOne,
  create,
  createMulti,
  update,
  remove,
  bulk,
  generateAi,
  generateMedia,
  improve,
  trendingTags,
  retryPlatforms,
};
