const logService = require('./logService');

/**
 * Bonus: lightweight trending tags via public search (best-effort; not official IG trending API).
 * Merges with niche tags for desi poultry.
 */
async function getTrendingHashtagSuggestions(userId, niche = 'poultry') {
  const base = ['desipoultry', 'backyardchickens', 'organicfarming', 'telugufarmers', 'natukodi'];
  try {
    // Placeholder: in production, connect to your analytics or third-party API
    const tags = [...base, `${niche}india`, 'villagefarming'];
    await logService.logEntry({
      userId,
      step: 'hashtag.trend',
      message: 'Trending suggestions merged with niche defaults',
      meta: { count: tags.length },
    });
    return tags;
  } catch (err) {
    await logService.logEntry({
      userId,
      level: 'warn',
      step: 'hashtag.trend',
      message: err.message,
    });
    return base;
  }
}

module.exports = { getTrendingHashtagSuggestions };
