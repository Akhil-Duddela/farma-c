const { logPlatform } = require('./logService');

/**
 * Recompute high-level `post.status` from per-platform `platforms.*.status`.
 */
function recomputeAggregatedStatus(post) {
  if (!post.platforms) return;
  const p = post.platforms;
  const wantIg = !!p.instagram?.enabled;
  const wantYt = !!p.youtube?.enabled;
  if (!wantIg && !wantYt) {
    post.status = 'draft';
    return;
  }

  if (post.status === 'draft') {
    return;
  }

  const isDone = (s) => ['posted', 'failed', 'skipped'].includes(s);
  if ((wantIg && !isDone(p.instagram?.status)) || (wantYt && !isDone(p.youtube?.status))) {
    const due = !post.scheduledAt || new Date(post.scheduledAt) <= new Date();
    const inFlight = ['pending', 'queued', 'publishing'].includes(p.instagram?.status)
      || ['pending', 'queued', 'publishing'].includes(p.youtube?.status);
    if (due && inFlight) {
      post.status = 'publishing';
    } else if (post.status === 'scheduled' && !due) {
      post.status = 'scheduled';
    } else if (inFlight) {
      post.status = 'publishing';
    }
    return;
  }

  const igS = wantIg ? p.instagram.status : 'skipped';
  const ytS = wantYt ? p.youtube.status : 'skipped';
  const hasPosted = (wantIg && igS === 'posted') || (wantYt && ytS === 'posted');
  const hasFailed = (wantIg && igS === 'failed') || (wantYt && ytS === 'failed');

  if (hasPosted && hasFailed) {
    post.status = 'partial';
    post.failureReason = 'One or more platforms failed; see platforms.*.error';
  } else if (hasPosted) {
    post.status = 'posted';
    if (!post.postedAt) post.postedAt = new Date();
  } else if (hasFailed) {
    post.status = 'failed';
  } else {
    const allSkipped = (!wantIg || igS === 'skipped') && (!wantYt || ytS === 'skipped');
    post.status = allSkipped ? 'failed' : post.status;
    if (allSkipped && !post.failureReason) {
      post.failureReason = 'All enabled platforms were skipped';
    }
  }
}

/**
 * @param {import('mongoose').Document} post
 * @param {string} platform
 * @param {string} status
 * @param {string} [error]
 * @param {import('mongoose').Types.ObjectId} [userId]
 */
async function markPlatformResult(post, platform, status, error = '', userId) {
  if (!post.platforms) post.platforms = { instagram: {}, youtube: {} };
  if (!post.platforms[platform]) {
    post.platforms[platform] = { enabled: true, status: 'pending', error: '' };
  }
  post.platforms[platform].status = status;
  post.platforms[platform].error = (error && String(error).slice(0, 4000)) || '';
  if (status === 'posted') {
    post.platforms[platform].publishedAt = new Date();
  }
  post.markModified('platforms');
  recomputeAggregatedStatus(post);
  await post.save();
  await logPlatform({ postId: post._id, userId, platform, status, error });
}

module.exports = { recomputeAggregatedStatus, markPlatformResult };
