const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

const HCAPTCHA_VERIFY = 'https://hcaptcha.com/siteverify';
const TIMEOUT_MS = 10000;

/**
 * Verify hCaptcha response token. Expects `captchaToken` in JSON body.
 * - Production: requires HCAPTCHA_SECRET; missing token → 400 CAPTCHA_FAILED
 * - Development: if no secret, skip (log once)
 * - On provider 5xx/network: if captchaFailOpen, allow with warning; else 503
 */
function verifyCaptcha(req, res, next) {
  const secret = (config.captcha && config.captcha.hcaptchaSecret) || '';
  const failOpen = config.captcha && config.captcha.failOpen;

  if (!secret) {
    if (config.env === 'production') {
      const e = new Error('CAPTCHA is not configured on the server');
      e.status = 503;
      e.code = 'CAPTCHA_NOT_CONFIGURED';
      e.details = [];
      return next(e);
    }
    logger.warn('verifyCaptcha: HCAPTCHA_SECRET not set; skipping (development only)');
    return next();
  }

  const token = (req.body && (req.body.captchaToken || req.body.hcaptchaResponse)) || '';
  if (!token || typeof token !== 'string' || token.length < 8) {
    const e = new Error('Complete the CAPTCHA challenge');
    e.status = 400;
    e.code = 'CAPTCHA_FAILED';
    e.details = [];
    return next(e);
  }

  const ip = (req.headers['x-forwarded-for'] || '')
    .toString()
    .split(',')[0]
    .trim()
    || (req.ip || '').replace('::ffff:', '');

  axios
    .post(
      HCAPTCHA_VERIFY,
      new URLSearchParams({ secret, response: token, remoteip: ip }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: TIMEOUT_MS }
    )
    .then(({ data }) => {
      if (data && data.success === true) {
        return next();
      }
      logger.warn('hCaptcha verify failed', { err: (data && data['error-codes']) || 'no-success' });
      const e = new Error('CAPTCHA verification failed. Try again.');
      e.status = 400;
      e.code = 'CAPTCHA_FAILED';
      e.details = (data && data['error-codes']) || [];
      return next(e);
    })
    .catch((err) => {
      logger.error('hCaptcha service error', { err: err.message, code: err.code });
      if (failOpen) {
        logger.warn('captchaFailOpen: allowing request due to provider error');
        return next();
      }
      const e = new Error('CAPTCHA service temporarily unavailable. Try again later.');
      e.status = 503;
      e.code = 'CAPTCHA_SERVICE_UNAVAILABLE';
      e.details = [];
      return next(e);
    });
}

module.exports = { verifyCaptcha };
