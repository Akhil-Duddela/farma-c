const express = require('express');
const settingsController = require('../controllers/settingsController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
router.get('/', settingsController.getSettings);
router.patch('/', settingsController.updateSettings);

module.exports = router;
