const express = require('express');
const postController = require('../controllers/postController');
const { authenticate } = require('../middleware/auth');
const { requireFullVerification } = require('../middleware/requireFullVerification');
const { requireNotFraudFlagged } = require('../middleware/fraudAccess');
const { validateBody } = require('../middleware/validateJoi');
const {
  postCreateV2,
  postCreate,
  postUpdate,
  postRetryPlatforms,
  postBulk,
  generateAi,
  generateMedia,
  improveCaption,
} = require('../validation/schemas');

const router = express.Router();
router.use(authenticate);

router.get('/', postController.list);
router.get('/trending-tags', postController.trendingTags);
router.get('/:id/errors', postController.getPostErrors);

router.post(
  '/create',
  requireFullVerification,
  requireNotFraudFlagged,
  validateBody(postCreateV2, { stripScripts: ['content', 'caption'] }),
  postController.createMulti
);
router.post(
  '/bulk',
  requireFullVerification,
  requireNotFraudFlagged,
  validateBody(postBulk, { stripScripts: [] }),
  postController.bulk
);
router.post(
  '/generate-ai',
  validateBody(generateAi),
  postController.generateAi
);
router.post(
  '/generate-media',
  validateBody(generateMedia, { stripScripts: ['prompt'] }),
  postController.generateMedia
);
router.post(
  '/improve-caption',
  validateBody(improveCaption, { stripScripts: ['caption', 'feedback'] }),
  postController.improve
);
router.post(
  '/:id/retry',
  requireFullVerification,
  requireNotFraudFlagged,
  validateBody(postRetryPlatforms),
  postController.retryPlatforms
);

router.get('/:id', postController.getOne);
router.post(
  '/',
  requireFullVerification,
  requireNotFraudFlagged,
  validateBody(postCreate, {
    stripScripts: ['caption', 'content'],
  }),
  postController.create
);
router.patch(
  '/:id',
  requireFullVerification,
  requireNotFraudFlagged,
  validateBody(postUpdate, {
    stripScripts: ['caption', 'content'],
  }),
  postController.update
);
router.delete('/:id', requireFullVerification, requireNotFraudFlagged, postController.remove);

module.exports = router;
