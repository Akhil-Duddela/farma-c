const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { validateBody } = require('../middleware/validateJoi');
const Joi = require('joi');
const adminController = require('../controllers/adminController');

const rejectBody = Joi.object({
  reason: Joi.string().min(1).max(2000).required(),
  notes: Joi.string().max(2000).optional(),
});

const approveBody = Joi.object({
  notes: Joi.string().max(2000).allow('').optional(),
});

const router = express.Router();
router.use(authenticate, requireRole('admin'));

router.get('/verifications', adminController.listVerifications);
router.post(
  '/verify/:userId',
  validateBody(approveBody, { stripScripts: ['notes'] }),
  adminController.approveUser
);
router.post(
  '/reject/:userId',
  validateBody(rejectBody, { stripScripts: ['reason', 'notes'] }),
  adminController.rejectUser
);

module.exports = router;
