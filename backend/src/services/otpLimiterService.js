/**
 * OTP request limits (Redis-backed). Delegates to fraudDetectionService
 * for per-IP, per-user, and per-phone windows (3 / 10 min, 5 / hour by default).
 *
 * @example
 *   const { checkOtpLimits } = require('./otpLimiterService');
 *   const allowed = await checkOtpLimits({ user, phone, req });
 *   if (!allowed) return res.status(429).json({ error: '...', code: 'OTP_RATE_LIMIT' });
 *
 * The real implementation throws structured errors (429, 503) instead of returning false,
 * so usage is: await checkOtpLimits({ user, phone, req }); in try/catch or let express errorHandler run.
 */
const { assertOtpRequestAllowed } = require('./fraudDetectionService');

/**
 * Enforces rate limits and risk-based OTP blocks. Resolves when allowed; rejects with err.status 429/503/400.
 * @param {{ user: import('mongoose').Document, phone: string, req: import('express').Request }} params
 * @returns {Promise<true>}
 */
function checkOtpLimits(params) {
  return assertOtpRequestAllowed(params);
}

module.exports = { checkOtpLimits, assertOtpRequestAllowed };
