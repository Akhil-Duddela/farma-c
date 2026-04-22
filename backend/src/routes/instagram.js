const express = require('express');
const instagramController = require('../controllers/instagramController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.post('/link', instagramController.linkAccount);
router.get('/accounts', instagramController.listAccounts);
router.patch('/accounts/:id/default', instagramController.setDefault);

module.exports = router;
