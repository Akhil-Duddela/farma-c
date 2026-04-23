const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireFullVerification } = require('../middleware/requireFullVerification');
const { requireNotFraudFlagged } = require('../middleware/fraudAccess');
const { validateBody } = require('../middleware/validateJoi');
const automationController = require('../controllers/automationController');
const { automationRun } = require('../validation/schemas');

const router = express.Router();
router.use(authenticate);
router.use(requireFullVerification, requireNotFraudFlagged);

router.get('/history', automationController.history);
router.post(
  '/run',
  validateBody(automationRun, { stripScripts: ['input'] }),
  automationController.run
);
router.get('/:postId', automationController.status);

module.exports = router;
