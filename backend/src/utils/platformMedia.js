/**
 * Single URL for posting — mediaUrl or first of mediaUrls.
 */
function getPrimaryMediaUrl(doc) {
  if (!doc) return '';
  if (doc.mediaUrl) return String(doc.mediaUrl).trim();
  if (Array.isArray(doc.mediaUrls) && doc.mediaUrls.length) {
    return String(doc.mediaUrls[0] || '').trim();
  }
  return '';
}

module.exports = { getPrimaryMediaUrl };
