const nodemailer = require('nodemailer');
const config = require('../config');
const logger = require('../utils/logger');

let transporter;

function getTransport() {
  if (transporter) {
    return transporter;
  }
  if (!config.email.smtpUrl) {
    return null;
  }
  transporter = nodemailer.createTransport(config.email.smtpUrl);
  return transporter;
}

/**
 * @param {string} to
 * @param {string} subject
 * @param {string} text
 * @param {string} [html]
 * @returns {Promise<boolean>} true if sent
 */
async function sendMail(to, subject, text, html) {
  const t = getTransport();
  if (!t) {
    logger.warn('Email not configured (SMTP_URL); skipping send', { to, subject });
    return false;
  }
  try {
    await t.sendMail({
      from: config.email.from,
      to,
      subject,
      text,
      html: html || text,
    });
    return true;
  } catch (e) {
    logger.error('Email send failed', { err: e.message, to });
    return false;
  }
}

/**
 * @param {string} toEmail
 * @param {string} verifyUrl
 */
async function sendVerificationEmail(toEmail, verifyUrl) {
  const subject = 'Verify your Farm-C AI account';
  const text = `Welcome to Farm-C AI.\n\nOpen this link to verify your email (valid for 7 days):\n${verifyUrl}\n\nIf you did not sign up, ignore this message.`;
  const html = `<p>Welcome to Farm-C AI.</p><p><a href="${verifyUrl}">Verify your email</a></p><p>Or copy: <code>${verifyUrl}</code></p>`;
  return sendMail(toEmail, subject, text, html);
}

module.exports = { sendMail, sendVerificationEmail, getTransport };
