const cron = require('node-cron');
const User = require('../models/User');
const aiContentService = require('./aiContentService');
const mediaService = require('./mediaService');
const postService = require('./postService');
const InstagramAccount = require('../models/InstagramAccount');
const logService = require('./logService');
const config = require('../config');

/**
 * Bonus: auto-generate daily posts for users with dailyAutoPostCount > 0.
 * Runs every hour; creates post scheduled for user's preferred IST hour.
 */
function startDailyPostsCron() {
  cron.schedule(
    '0 * * * *',
    async () => {
      try {
        await runDailyBatch();
      } catch (err) {
        await logService.logEntry({
          level: 'error',
          step: 'daily.cron',
          message: err.message,
        });
      }
    },
    { timezone: config.defaultTimezone }
  );
}

async function runDailyBatch() {
  const users = await User.find({ dailyAutoPostCount: { $gt: 0 }, isActive: true });
  const hour = new Date().getHours();

  for (const user of users) {
    if (user.dailyAutoPostHourIST !== hour) continue;

    const account = await InstagramAccount.findOne({ userId: user._id, isDefault: true })
      || await InstagramAccount.findOne({ userId: user._id });
    if (!account) {
      await logService.logEntry({
        userId: user._id,
        step: 'daily.skip',
        message: 'No Instagram account',
      });
      continue;
    }

    for (let i = 0; i < user.dailyAutoPostCount; i += 1) {
      const bundle = await aiContentService.generatePostBundle(user._id, {
        topic: 'desi poultry tips and farm updates',
      });
      const imageUrl = await mediaService.generateAndUploadFarmImage(
        user._id,
        null,
        'Healthy desi chickens in a green farm',
        '1:1'
      );
      const scheduledAt = new Date(Date.now() + 5 * 60 * 1000);
      await postService.createPost(user._id, {
        instagramAccountId: account._id,
        caption: bundle.caption,
        hashtags: bundle.hashtags,
        reelScript: bundle.reelScript,
        mediaUrls: [imageUrl],
        mediaType: 'image',
        aspectRatio: '1:1',
        status: 'scheduled',
        scheduledAt: scheduledAt.toISOString(),
        contentHash: bundle.contentHash,
        generationMeta: bundle.generationMeta,
      });
    }
    await logService.logEntry({
      userId: user._id,
      step: 'daily.generated',
      message: `Generated ${user.dailyAutoPostCount} auto posts`,
    });
  }
}

module.exports = { startDailyPostsCron, runDailyBatch };
