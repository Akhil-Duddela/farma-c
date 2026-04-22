const winston = require('winston');
const config = require('../config');

const { combine, timestamp, json, printf, colorize } = winston.format;

const devFormat = printf(({ level, message, timestamp: ts, ...meta }) => {
  const rest = Object.keys(meta).length ? JSON.stringify(meta) : '';
  return `${ts} [${level}] ${message} ${rest}`;
});

const logger = winston.createLogger({
  level: config.env === 'production' ? 'info' : 'debug',
  format: combine(timestamp(), json()),
  defaultMeta: { service: 'farm-c-ai-backend' },
  transports: [
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp(),
        config.env === 'production' ? json() : devFormat
      ),
    }),
  ],
});

module.exports = logger;
