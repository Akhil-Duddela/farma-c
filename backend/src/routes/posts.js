const express = require('express');
const postController = require('../controllers/postController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', postController.list);
router.get('/trending-tags', postController.trendingTags);

router.post('/create', postController.createV2Validators, postController.createMulti);
router.post('/bulk', postController.bulk);
router.post('/generate-ai', postController.generateAi);
router.post('/generate-media', postController.generateMedia);
router.post('/improve-caption', postController.improve);
router.post('/:id/retry', postController.retryPlatforms);

router.get('/:id', postController.getOne);
router.post('/', postController.createValidators, postController.create);
router.patch('/:id', postController.update);
router.delete('/:id', postController.remove);

module.exports = router;
