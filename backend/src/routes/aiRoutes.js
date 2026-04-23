/**
 * POST /api/ai/enhance { "input": "…" } — structured content pack
 */
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { validateBody } = require('../middleware/validateJoi');
const aiController = require('../controllers/aiController');
const { aiEnhance } = require('../validation/schemas');

const router = express.Router();
router.use(authenticate);
router.get('/recommendations', aiController.recommendations);
router.post(
  '/enhance',
  validateBody(aiEnhance, { stripScripts: ['input'] }),
  aiController.enhance
);

module.exports = router;
