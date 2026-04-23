const E164 = /^\+[1-9]\d{6,14}$/;

/**
 * @param {string} raw
 * @returns {string|null} E.164 or null
 */
function normalizeE164(raw) {
  if (!raw || typeof raw !== 'string') {
    return null;
  }
  const s = raw.replace(/[\s()-]/g, '').trim();
  if (E164.test(s)) {
    return s;
  }
  if (/^\d{10,15}$/.test(s)) {
    return null;
  }
  return null;
}

/**
 * @param {string} e164
 */
function maskPhone(e164) {
  if (!e164 || e164.length < 4) {
    return '';
  }
  if (e164.length <= 6) {
    return '****' + e164.slice(-2);
  }
  return e164.slice(0, 2) + '****' + e164.slice(-4);
}

module.exports = { normalizeE164, E164, maskPhone };
