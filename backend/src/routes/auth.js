const express = require('express');
const { validateBody } = require('../middleware/validateJoi');
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { authRegister, authLogin } = require('../validation/schemas');

const router = express.Router();

router.post('/register', validateBody(authRegister, { stripScripts: ['name'] }), authController.register);
router.post('/login', validateBody(authLogin), authController.login);
router.get('/me', authenticate, authController.me);

module.exports = router;
