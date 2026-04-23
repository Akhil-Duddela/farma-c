const express = require('express');
const { authenticate } = require('../middleware/auth');
const userController = require('../controllers/userController');

const router = express.Router();
router.use(authenticate);
router.get('/leaderboard', userController.leaderboard);

module.exports = router;
