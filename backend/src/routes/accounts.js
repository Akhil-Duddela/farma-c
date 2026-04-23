const express = require('express');
const { authenticate } = require('../middleware/auth');
const accountsController = require('../controllers/accountsController');

const router = express.Router();
router.get('/status', authenticate, accountsController.status);

module.exports = router;
