/**
 * Cron sidecar: missed job recovery + optional daily maintenance.
 * Can be merged into API process or run standalone.
 */
require('dotenv').config();
const { connectDatabase } = require('../config/database');
const postService = require('../services/postService');
const cron = require('node-cron');
const config = require('../config');
const logger = require('../utils/logger');

async function main() {
  await connectDatabase();

  cron.schedule(
    '*/5 * * * *',
    async () => {
      try {
        const n = await postService.recoverMissedScheduledJobs();
        if (n > 0) logger.info(`Recovered ${n} missed scheduled posts`);
      } catch (err) {
        logger.error('Recovery cron error', { err: err.message });
      }
    },
    { timezone: config.defaultTimezone }
  );

  logger.info('Scheduler worker running (recovery every 5 min)');
}

main().catch((err) => {
  logger.error('Scheduler worker fatal', { err: err.message });
  process.exit(1);
});
