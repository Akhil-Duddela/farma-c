/**
 * One-off: create mock YouTube account for E2E user (uploads will still fail without real Google tokens).
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const { encrypt } = require('../src/utils/encryption');
const YT = require('../src/models/YouTubeAccount');

const userId = process.argv[2];
if (!userId) {
  console.error('Usage: node seedE2E-youtube.js <userId>');
  process.exit(1);
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const doc = await YT.findOneAndUpdate(
    { userId, channelId: 'e2e-mock-channel' },
    {
      userId,
      channelId: 'e2e-mock-channel',
      channelTitle: 'E2E Mock',
      accessTokenEnc: encrypt('ya29.e2e-mock-access'),
      refreshTokenEnc: encrypt('1//e2e-mock-refresh'),
      tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
    },
    { upsert: true, new: true }
  );
  console.log('Mock YouTube account id:', doc._id.toString());
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
