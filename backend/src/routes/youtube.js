const express = require('express');
const youtubeController = require('../controllers/youtubeController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/auth-url', youtubeController.authUrl);
router.post('/exchange', youtubeController.exchangeCode);
router.post('/link', youtubeController.linkTokens);
router.get('/accounts', youtubeController.list);
router.patch('/accounts/:id/default', youtubeController.setDefault);

module.exports = router;
