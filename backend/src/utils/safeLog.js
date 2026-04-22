/**
 * Recursively redact values that look like secrets for logging.
 * @param {unknown} value
 * @param {number} [depth]
 * @returns {unknown}
 */
function redactForLog(value, depth = 0) {
  if (depth > 8) {
    return '[max-depth]';
  }
  if (value == null) {
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > 5 && /^(eyJ|sk-|Bearer\s|ya29\.|EAA|gh[ps]_[A-Za-z0-9_]+)/i.test(value)) {
      return maskToken(value);
    }
    if (/bearer\s+[a-z0-9._-]+/i.test(value)) {
      return value.replace(/bearer\s+([^\s]+)/gi, 'Bearer [redacted]');
    }
    if (value.length > 200) {
      return `${value.slice(0, 80)}…[truncated]`;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactForLog(v, depth + 1));
  }
  if (typeof value === 'object') {
    const SENSITIVE_KEYS = new Set([
      'password',
      'passwordhash',
      'token',
      'accesstoken',
      'refreshtoken',
      'authorization',
      'secret',
      'apikey',
      'api_key',
      'clientsecret',
      'openaiapikey',
    ]);
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const kl = k.toLowerCase();
      if (kl === 'password' || kl === 'passwordhash' || (kl.includes('password') && typeof v === 'string')) {
        out[k] = '[redacted]';
        // eslint-disable-next-line no-continue
        continue;
      }
      if (SENSITIVE_KEYS.has(kl) || kl.includes('token') || kl.includes('secret')) {
        if (typeof v === 'string' && v.length) {
          out[k] = maskToken(v);
        } else {
          out[k] = '[redacted]';
        }
      } else {
        out[k] = redactForLog(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

/**
 * @param {string} s
 */
function maskToken(s) {
  if (s.length <= 8) {
    return '***';
  }
  return `${s.slice(0, 4)}…[redacted]`;
}

module.exports = { redactForLog, maskToken };
