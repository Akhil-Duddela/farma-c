const s3Service = require('../services/s3Service');
const logService = require('../services/logService');

/**
 * POST /api/upload — multipart field "file" (image or short video) → { url, mimetype, size }
 */
async function upload(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'file field required' });
    }
    const keyPrefix = `uploads/${String(req.user._id)}`;
    const url = await s3Service.uploadUserMedia(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      keyPrefix
    );
    await logService.logEntry({
      userId: req.user._id,
      step: 'media.upload',
      message: `Uploaded ${req.file.mimetype} ${req.file.size} bytes`,
    });
    res.status(201).json({
      url,
      mimetype: req.file.mimetype,
      size: req.file.size,
    });
  } catch (e) {
    next(e);
  }
}

module.exports = { upload };
