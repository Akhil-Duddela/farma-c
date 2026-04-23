const express = require('express');
const healthController = require('../controllers/healthController');

const router = express.Router();
router.get('/', healthController.apiHealth);
router.get('/deep', healthController.apiHealthDeep);

module.exports = router;
