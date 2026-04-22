/**
 * Generic async retry with exponential backoff (for OpenAI, Instagram, S3).
 */
async function withRetry(fn, options = {}) {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseMs = options.baseDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 30000;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts) break;
      const delay = Math.min(baseMs * 2 ** (attempt - 1), maxDelayMs);
      await new Promise((r) => setTimeout(r, delay + Math.random() * 500));
    }
  }
  throw lastErr;
}

module.exports = { withRetry };
