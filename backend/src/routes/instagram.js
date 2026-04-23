const express = require('express');
const instagramController = require('../controllers/instagramController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/** Public: Facebook OAuth redirect (no JWT) */
router.get('/callback', instagramController.oauthCallback);

router.get('/auth-url', authenticate, instagramController.authUrl);

router.use(authenticate);
router.get('/oauth-pending', instagramController.oauthPending);
router.post('/select-account', instagramController.selectAccount);
router.post('/refresh-tokens', instagramController.refreshTokens);
router.post('/link', instagramController.linkAccount);
router.get('/accounts', instagramController.listAccounts);
router.patch('/accounts/:id/default', instagramController.setDefault);
router.delete('/accounts/:id', instagramController.disconnect);

module.exports = router;
