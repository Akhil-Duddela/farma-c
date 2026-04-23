const { connectState } = require('../config/healthState');
const { getRedis } = require('../config/redisClient');
const { getInstagramQueue, getYoutubeQueue, getAIGenerationQueue, getVideoGenerationQueue } = require('../queues');
const DeadLetterJob = require('../models/DeadLetterJob');

async function checkRedis() {
  try {
    const r = getRedis();
    const p = await r.ping();
    return p === 'PONG';
  } catch {
    return false;
  }
}

/**
 * @param {import('bull').Queue} q
 */
async function queueOk(q) {
  try {
    if (!q) return false;
    const c = await q.getJobCounts();
    return typeof c === 'object';
  } catch {
    return false;
  }
}

/**
 * Shared snapshot for /api/health, Prometheus gauge, and probes.
 * @returns {Promise<{ status: 'ok'|'degraded', allOk: boolean, services: { db: boolean, redis: boolean, queue: boolean }, uptime: number }>}
 */
async function computeHealthSnapshot() {
  const db = connectState.mongoose === 1;
  const redis = await checkRedis();
  let qAll = true;
  if (redis) {
    const checks = await Promise.all([
      queueOk(getInstagramQueue()),
      queueOk(getYoutubeQueue()),
      queueOk(getAIGenerationQueue()),
      queueOk(getVideoGenerationQueue()),
    ]);
    qAll = checks.every(Boolean);
  } else {
    qAll = false;
  }
  const degraded = !db || !redis;
  const status = degraded || !qAll ? 'degraded' : 'ok';
  return {
    status,
    allOk: status === 'ok',
    services: { db, redis, queue: redis && qAll },
    uptime: process.uptime(),
  };
}

/** GET /api/health */
async function apiHealth(req, res) {
  const snap = await computeHealthSnapshot();
  res.json({
    status: snap.status,
    services: snap.services,
    uptime: snap.uptime,
  });
}

/** GET /api/health/deep */
async function apiHealthDeep(req, res) {
  const db = connectState.mongoose === 1;
  const redis = await checkRedis();
  const queueStats = {};
  if (redis) {
    for (const [name, getQ] of [
      ['instagram', getInstagramQueue],
      ['youtube', getYoutubeQueue],
      ['ai', getAIGenerationQueue],
      ['video', getVideoGenerationQueue],
    ]) {
      try {
        const c = await getQ().getJobCounts();
        queueStats[name] = c;
      } catch (e) {
        queueStats[name] = { error: e.message };
      }
    }
  }
  let lastJob = null;
  try {
    lastJob = await DeadLetterJob.findOne().sort({ createdAt: -1 }).lean();
  } catch (e) {
    lastJob = { error: e.message };
  }
  const totalPending = redis
    ? await Promise.all([
        getInstagramQueue().getJobCounts().then((c) => c.waiting + c.delayed + c.active).catch(() => 0),
        getYoutubeQueue().getJobCounts().then((c) => c.waiting + c.delayed + c.active).catch(() => 0),
        getAIGenerationQueue().getJobCounts().then((c) => c.waiting + c.delayed + c.active).catch(() => 0),
        getVideoGenerationQueue().getJobCounts().then((c) => c.waiting + c.delayed + c.active).catch(() => 0),
      ]).then((a) => a.reduce((s, n) => s + n, 0))
    : 0;
  res.json({
    status: !db || !redis ? 'degraded' : 'ok',
    services: { db, redis, queue: !!redis && Object.values(queueStats).some((q) => q && !q.error) },
    uptime: process.uptime(),
    queueCounts: queueStats,
    pendingJobApprox: totalPending,
    lastFailedJob: lastJob
      ? { queue: lastJob.queueName, at: lastJob.createdAt, reason: (lastJob.failedReason || '').slice(0, 200) }
      : null,
  });
}

module.exports = { apiHealth, apiHealthDeep, computeHealthSnapshot };
