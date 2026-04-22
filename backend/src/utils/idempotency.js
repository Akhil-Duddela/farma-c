const crypto = require('crypto');

/**
 * Stable job id: one job per (post, platform, scheduled time).
 * Prevents duplicate queue execution for the same window.
 */
function platformJobId(postId, platform, scheduledAt) {
  const t = scheduledAt instanceof Date ? scheduledAt.toISOString() : String(scheduledAt);
  const hash = crypto
    .createHash('sha256')
    .update(`${postId}|${platform}|${t}`)
    .digest('hex')
    .slice(0, 32);
  // Bull/Redis: avoid ":" in job ids; keep deterministic per (post, platform, schedule)
  return `pf_${String(platform)}_${String(postId)}_${hash}`.replace(/:/g, '');
}

/** @deprecated Use platformJobId */
function postPublishJobId(postId, scheduledAt) {
  const t = scheduledAt instanceof Date ? scheduledAt.toISOString() : String(scheduledAt);
  return `publish:${postId}:${crypto.createHash('sha256').update(t).digest('hex').slice(0, 16)}`;
}

module.exports = { platformJobId, postPublishJobId };
