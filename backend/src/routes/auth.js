const express = require('express');
const rateLimit = require('express-rate-limit');
const { validateBody } = require('../middleware/validateJoi');
const { verifyCaptcha } = require('../middleware/verifyCaptcha');
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { authRegister, authLogin, authSendOtp, authVerifyOtp } = require('../validation/schemas');

const keyFromOtp = (req) => (req.user?._id ? `otp:u:${String(req.user._id)}` : `ip:${req.ip}`);

const limiterOtp = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyFromOtp,
});

const router = express.Router();

/** Public: email link from user inbox (may open in browser) */
router.get('/verify-email', authController.verifyEmailQuery);

router.post('/register', validateBody(authRegister, { stripScripts: ['name'] }), authController.register);
router.post('/login', validateBody(authLogin), authController.login);
router.get('/me', authenticate, authController.me);
router.post('/resend-verification', authenticate, authController.resendVerification);
router.post(
  '/send-otp',
  authenticate,
  verifyCaptcha,
  limiterOtp,
  validateBody(authSendOtp),
  authController.sendOtp
);
router.post(
  '/verify-otp',
  authenticate,
  limiterOtp,
  validateBody(authVerifyOtp),
  authController.verifyOtpRoute
);

module.exports = router;
