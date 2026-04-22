/**
 * Bull workers: ai-generation + video-generation (Ollama → FFmpeg → S3 → schedule publish).
 */
require('dotenv').config();
const { connectDatabase } = require('../config/database');
const { getAIGenerationQueue, getVideoGenerationQueue } = require('../queues');
const { processAIJob, processVideoJob } = require('../services/automationPipelineService');
const config = require('../config');
const logger = require('../utils/logger');

async function main() {
  await connectDatabase();
  const autoConc = Math.max(1, parseInt(process.env.AUTOMATION_WORKER_CONCURRENCY || '2', 10));
  getAIGenerationQueue().process('enhance', autoConc, processAIJob);
  getVideoGenerationQueue().process('render', 1, processVideoJob);
  logger.info(
    `Automation worker: ai-generation (concurrency=${autoConc}) + video-generation (1) — Ollama ${config.ollama?.baseUrl || '—'}`
  );
}

main().catch((e) => {
  logger.error('Automation worker fatal', { err: e.message });
  process.exit(1);
});
