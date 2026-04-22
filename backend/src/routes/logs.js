const express = require('express');
const logController = require('../controllers/logController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
router.get('/', logController.list);

module.exports = router;
