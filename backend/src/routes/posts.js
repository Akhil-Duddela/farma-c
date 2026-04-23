const express = require('express');
const postController = require('../controllers/postController');
const { authenticate } = require('../middleware/auth');
const { requireFullVerification } = require('../middleware/requireFullVerification');
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

const mustVerify = requireFullVerification;

router.get('/', postController.list);
router.get('/trending-tags', postController.trendingTags);

router.post(
  '/create',
  mustVerify,
  validateBody(postCreateV2, { stripScripts: ['content', 'caption'] }),
  postController.createMulti
);
router.post(
  '/bulk',
  mustVerify,
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
  mustVerify,
  validateBody(postRetryPlatforms),
  postController.retryPlatforms
);

router.get('/:id', postController.getOne);
router.post(
  '/',
  mustVerify,
  validateBody(postCreate, {
    stripScripts: ['caption', 'content'],
  }),
  postController.create
);
router.patch(
  '/:id',
  mustVerify,
  validateBody(postUpdate, {
    stripScripts: ['caption', 'content'],
  }),
  postController.update
);
router.delete('/:id', mustVerify, postController.remove);

module.exports = router;
