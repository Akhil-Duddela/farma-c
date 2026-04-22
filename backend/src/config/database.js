const mongoose = require('mongoose');
const config = require('./index');
const logger = require('../utils/logger');

async function connectDatabase() {
  mongoose.set('strictQuery', true);
  const opts = {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10000,
  };
  await mongoose.connect(config.mongoUri, opts);
  logger.info('MongoDB connected');
}

mongoose.connection.on('error', (err) => {
  logger.error('MongoDB connection error', { err: err.message });
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected');
});

module.exports = { connectDatabase };
