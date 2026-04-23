const mongoose = require('mongoose');
const config = require('./index');
const logger = require('../utils/logger');
const { connectState } = require('./healthState');
const User = require('../models/User');

async function connectDatabase() {
  mongoose.set('strictQuery', true);
  const opts = {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10000,
  };
  connectState.mongoose = 2;
  await mongoose.connect(config.mongoUri, opts);
  connectState.mongoose = 1;
  logger.info('MongoDB connected');

  try {
    const r = await User.updateMany(
      {
        $or: [
          { emailVerified: { $exists: false } },
          { phoneVerified: { $exists: false } },
          { verificationStatus: { $exists: false } },
        ],
      },
      {
        $set: {
          emailVerified: true,
          phoneVerified: true,
          verificationStatus: 'verified',
        },
      }
    );
    if (r.modifiedCount) {
      logger.info('Legacy user verification: marked existing users as fully verified', {
        n: r.modifiedCount,
      });
    }
  } catch (e) {
    logger.warn('Legacy verification migration skipped', { err: e.message });
  }
}

mongoose.connection.on('connecting', () => {
  connectState.mongoose = 2;
});

mongoose.connection.on('error', (err) => {
  connectState.mongoose = 0;
  logger.error('MongoDB connection error', { err: err.message });
});

mongoose.connection.on('disconnected', () => {
  connectState.mongoose = 0;
  logger.warn('MongoDB disconnected');
});

module.exports = { connectDatabase };
