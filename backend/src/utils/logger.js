const winston = require('winston');
const config = require('../config');
const { redactForLog } = require('./safeLog');
const { getRequestContext } = require('../observability/requestContext');

const { combine, timestamp, json, printf, colorize } = winston.format;

const devFormat = printf(({ level, message, timestamp: ts, ...meta }) => {
  const rest = Object.keys(meta).length ? JSON.stringify(config.env === 'production' ? redactForLog(meta) : meta) : '';
  return `${ts} [${level}] ${message} ${rest}`;
});

/** Injects requestId from AsyncLocalStorage when present (sync middleware only). */
const injectRequestContext = winston.format((info) => {
  const c = getRequestContext();
  if (c && c.requestId && !info.requestId) {
    // eslint-disable-next-line no-param-reassign
    info.requestId = c.requestId;
  }
  return info;
});

const redactInfo = winston.format((info) => {
  if (config.env !== 'production') {
    return info;
  }
  const r = redactForLog({ ...info });
  if (r && typeof r === 'object') {
    for (const k of Object.keys(info)) {
      // eslint-disable-next-line no-param-reassign
      delete info[k];
    }
    Object.assign(info, r);
  }
  return info;
})();

const logger = winston.createLogger({
  level: config.env === 'production' ? 'info' : 'debug',
  defaultMeta: { service: 'farm-c-ai-backend' },
  transports: [
    new winston.transports.Console({
      format:
        config.env === 'production'
          ? combine(timestamp(), injectRequestContext, redactInfo, json())
          : combine(colorize(), timestamp(), devFormat),
    }),
  ],
});

module.exports = logger;
