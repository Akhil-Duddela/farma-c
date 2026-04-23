const Redis = require('ioredis');
const config = require('./index');

let client;

/**
 * Shared Redis (Bull + OAuth cache). Lazy singleton.
 * @returns {import('ioredis').default}
 */
function getRedis() {
  if (!client) {
    client = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });
  }
  return client;
}

module.exports = { getRedis };
