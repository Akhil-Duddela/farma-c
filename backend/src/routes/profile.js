const express = require('express');
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const profileController = require('../controllers/profileController');

const memory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 + 1 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

const router = express.Router();
router.use(authenticate);

router.get('/status', profileController.status);
router.post('/submit-verification', profileController.submitVerification);
router.post('/upload-image', (req, res, next) => {
  memory.single('file')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large' });
      }
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    return profileController.uploadVerificationImage(req, res, next);
  });
});

module.exports = router;
