/**
 * Strip common XSS vectors from user text; keep newlines for captions/scripts.
 * @param {string} s
 * @returns {string}
 */
function stripInlineScripts(s) {
  if (s == null) return '';
  return String(s)
    .replace(/\0/g, '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<\/script/gi, '')
    .replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}

/**
 * @param {string} s
 * @param {number} [max]
 */
function trimString(s, max) {
  const t = stripInlineScripts(s).trim();
  if (max && t.length > max) {
    return t.slice(0, max);
  }
  return t;
}

module.exports = { stripInlineScripts, trimString };
