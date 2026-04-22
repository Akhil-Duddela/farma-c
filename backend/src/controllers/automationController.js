const postService = require('../services/postService');
const { enqueueAIGeneration } = require('../services/automationPipelineService');
const Post = require('../models/Post');

/**
 * POST /api/automation/run
 */
async function run(req, res, next) {
  try {
    const { input, platforms } = req.body;
    const p = {
      input,
      platforms: platforms || { instagram: true, youtube: true },
    };
    if (req.body.instagramAccountId) p.instagramAccountId = String(req.body.instagramAccountId);
    if (req.body.youtubeAccountId) p.youtubeAccountId = String(req.body.youtubeAccountId);
    const post = await postService.createAutomationPost(req.user._id, p);
    await enqueueAIGeneration(post._id, req.user._id, input);
    return res.status(201).json({
      postId: String(post._id),
      message: 'Automation started',
      status: {
        pipelineStatus: post.pipelineStatus,
        step: post.automation?.step,
      },
    });
  } catch (e) {
    return next(e);
  }
}

/**
 * GET /api/automation/history?limit=20
 */
async function history(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit || '20', 10) || 20, 100);
    const list = await postService.listPosts(req.user._id, { automation: '1', limit: String(limit) });
    res.json(list);
  } catch (e) {
    return next(e);
  }
}

/**
 * GET /api/automation/:postId
 */
async function status(req, res, next) {
  try {
    const post = await Post.findOne({ _id: req.params.postId, userId: req.user._id })
      .populate('instagramAccountId', 'username')
      .populate('youtubeAccountId', 'channelTitle');
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    res.json(post);
  } catch (e) {
    return next(e);
  }
}

module.exports = { run, history, status };
