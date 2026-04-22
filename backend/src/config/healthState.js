/**
 * Mirrored from mongoose connection for /health/ready (no heavy imports in app).
 * 0 = disconnected, 1 = connected, 2 = connecting
 */
const connectState = { mongoose: 0 };

module.exports = { connectState };
