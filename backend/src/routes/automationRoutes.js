const express = require('express');
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const automationController = require('../controllers/automationController');

const router = express.Router();
router.use(authenticate);

router.get('/history', automationController.history);
/** POST /run must be registered before /:postId or "run" is captured as an id. */
router.post(
  '/run',
  body('input').trim().notEmpty().isLength({ max: 8000 }),
  body('platforms').optional().isObject(),
  automationController.run
);
router.get('/:postId', automationController.status);

module.exports = router;
