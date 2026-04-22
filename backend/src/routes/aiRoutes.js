/**
 * Example success body for POST /api/ai/enhance { "input": "organic feed tips" }:
 * {
 *   "title": "...",
 *   "description": "...",
 *   "script": "...",
 *   "caption": "...",
 *   "hashtags": ["farming", "poultry", "organic"],
 *   "hooks": ["line1", "line2", "line3"],
 *   "videoIdea": "..."
 * }
 */
const express = require('express');
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const aiController = require('../controllers/aiController');

const router = express.Router();
router.use(authenticate);
router.post(
  '/enhance',
  [body('input').trim().notEmpty().isLength({ max: 8000 })],
  aiController.enhance
);

module.exports = router;
