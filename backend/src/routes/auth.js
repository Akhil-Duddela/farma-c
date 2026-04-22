const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.post(
  '/register',
  authController.registerValidators,
  authController.register
);
router.post(
  '/login',
  [body('email').isEmail(), body('password').notEmpty()],
  authController.login
);
router.get('/me', authenticate, authController.me);

module.exports = router;
