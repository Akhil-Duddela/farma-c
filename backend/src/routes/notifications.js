const express = require('express');
const { authenticate } = require('../middleware/auth');
const notificationsController = require('../controllers/notificationsController');

const router = express.Router();
router.post('/register-device', authenticate, notificationsController.registerDevice);
router.post('/unregister-device', authenticate, notificationsController.unregisterDevice);

module.exports = router;
