const express = require('express');
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const uploadController = require('../controllers/uploadController');
const s3Service = require('../services/s3Service');

const memory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: s3Service.MAX_VIDEO_BYTES + 1 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image or video files are allowed'));
    }
  },
});

const router = express.Router();
router.use(authenticate);
router.post('/', (req, res, next) => {
  memory.single('file')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large' });
      }
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    return uploadController.upload(req, res, next);
  });
});

module.exports = router;
