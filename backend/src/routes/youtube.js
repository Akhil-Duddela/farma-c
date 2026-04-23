const express = require('express');
const youtubeController = require('../controllers/youtubeController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ✅ PUBLIC ROUTE (NO AUTH)
router.get('/callback', youtubeController.callback);

router.use(authenticate);

router.get('/auth-url', youtubeController.authUrl);
router.get('/oauth-pending', youtubeController.oauthPending);
router.post('/select-channel', youtubeController.selectChannel);
router.post('/refresh-tokens', youtubeController.refreshAll);
router.post('/exchange', youtubeController.exchangeCode);
router.post('/link', youtubeController.linkTokens);
router.get('/accounts', youtubeController.list);
router.patch('/accounts/:id/default', youtubeController.setDefault);
router.delete('/accounts/:id', youtubeController.removeAccount);

module.exports = router;