const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * @param {string} toE164 E.164 e.g. +12025551234
 * @param {string} body
 * @returns {Promise<boolean>} true if API accepted
 */
async function sendSms(toE164, body) {
  const { accountSid, authToken, fromNumber } = config.twilio;
  if (!accountSid || !authToken || !fromNumber) {
    logger.warn('SMS not configured; skipping Twilio send', { to: toE164.replace(/\d{4}$/, '****') });
    return false;
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const params = new URLSearchParams();
  params.set('To', toE164);
  params.set('From', fromNumber);
  params.set('Body', body);
  try {
    await axios.post(url, params.toString(), {
      auth: { username: accountSid, password: authToken },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 20000,
    });
    return true;
  } catch (e) {
    const msg = e.response?.data || e.message;
    logger.error('Twilio send failed', { err: String(msg) });
    return false;
  }
}

module.exports = { sendSms };
